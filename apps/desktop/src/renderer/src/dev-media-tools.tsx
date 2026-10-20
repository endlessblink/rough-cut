// Dev-only tools for Noam's own dock copy: add a clip from outside the recording
// at the playhead, and record a camera take while a marked range plays.
// Agreed spec: docs/SPEC-dev-insert-and-camera-takes-2026-10-20.md.
// Nothing here renders unless main reports the local dev switch is on.
import React from 'react';
import { createPortal } from 'react-dom';
import {
  createInsertedMediaAsset,
  insertMediaClip,
  listCameraTakes,
  pickupLanding,
  useCameraTake as switchCameraTake,
  type InsertEditMode,
  type ProjectDocument,
} from '@rough-cut/project-model';

type DevBridge = {
  getDevFeatures?: () => Promise<{ enabled?: boolean } | null>;
  devPickInsert?: () => Promise<{ filePath: string; kind: 'video' | 'project'; name: string } | null>;
  devPrepareInsert?: (payload: { filePath: string; projectPath: string; projectFps: number }) => Promise<PreparedMedia | null>;
  onDevInsertProgress?: (callback: (progress: { progress?: number }) => void) => () => void;
  devTakeBegin?: (payload: { projectPath: string }) => Promise<{ id: string; path: string }>;
  devTakeChunk?: (id: string, chunk: ArrayBuffer) => Promise<number>;
  devTakeFinish?: (payload: { id: string; projectFps: number }) => Promise<PreparedMedia>;
  devTakeCancel?: (id: string) => Promise<boolean>;
};

type PreparedMedia = {
  filePath: string;
  name: string;
  durationFrames: number;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  fps: number | null;
};

export type TakeRange = { startFrame: number | null; endFrame: number | null };

function bridge(): DevBridge {
  return ((window as unknown as { roughCut?: DevBridge }).roughCut ?? {}) as DevBridge;
}

/** True only when main says the local dev switch is on. */
export function useDevFeatures(): boolean {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void bridge().getDevFeatures?.().then((status) => {
      if (!cancelled) setEnabled(status?.enabled === true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return enabled;
}

function newId(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function formatTimecode(frame: number, fps: number) {
  const totalSeconds = Math.max(0, frame) / Math.max(1, fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function readStored(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ }
}

const TAKE_COUNTDOWN_SECONDS = 3;

type TakeState =
  | { phase: 'idle' }
  | { phase: 'countdown'; remaining: number }
  | { phase: 'recording' }
  | { phase: 'saving' }
  | { phase: 'error'; message: string };

export function DevMediaMenu({
  projectPath,
  fps,
  playheadFrame,
  playheadSec,
  takeRange,
  onTakeRangeChange,
  selectedTakeClipId,
  hasCamera,
  getDocument,
  onApply,
  onSeekFrame,
  onTakePlayback,
}: {
  projectPath: string | null;
  fps: number;
  playheadFrame: number;
  /** Live playhead, used to line the take up with what was on screen. */
  playheadSec: number;
  takeRange: TakeRange;
  onTakeRangeChange: (range: TakeRange) => void;
  selectedTakeClipId: string | null;
  hasCamera: boolean;
  getDocument: () => ProjectDocument;
  onApply: (next: ProjectDocument) => Promise<void> | void;
  onSeekFrame: (frame: number) => void;
  /** Play the program for a take (`muted` keeps the mic clean); `null` hands playback back. */
  onTakePlayback: (state: { playing: boolean; muted: boolean } | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<'none' | 'insert-choice' | 'take'>('none');
  const [picked, setPicked] = React.useState<{ filePath: string; kind: 'video' | 'project'; name: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [takeState, setTakeState] = React.useState<TakeState>({ phase: 'idle' });
  const [soundOn, setSoundOn] = React.useState(() => readStored('roughCut.dev.takeSound') === 'on');
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = React.useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = React.useState(() => readStored('roughCut.dev.takeCamera') ?? '');
  const [micId, setMicId] = React.useState(() => readStored('roughCut.dev.takeMic') ?? '');
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = React.useState<{ left: number; bottom: number } | null>(null);
  // Popovers live in a top-level layer above the preview, opening upward from the button.
  React.useLayoutEffect(() => {
    if (!open && panel === 'none') return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 336)), bottom: window.innerHeight - rect.top + 10 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, panel]);
  const liveRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<{
    recorder: MediaRecorder;
    id: string;
    startFrame: number;
    endFrame: number;
    recordingStartedAtMs: number | null;
    playbackStartedAtMs: number | null;
    writes: Promise<unknown>;
    stopping: boolean;
    cancelled: boolean;
  } | null>(null);

  const rangeReady = takeRange.startFrame !== null && takeRange.endFrame !== null && takeRange.endFrame > takeRange.startFrame;
  const takeActive = takeState.phase === 'countdown' || takeState.phase === 'recording' || takeState.phase === 'saving';
  const takes = React.useMemo(() => (selectedTakeClipId ? listCameraTakes(getDocument(), selectedTakeClipId) : []), [selectedTakeClipId, getDocument, busy, takeState]);

  // Close the menu on an outside click or Escape (Escape also cancels a take in progress).
  React.useEffect(() => {
    if (!open && panel === 'none') return undefined;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !layerRef.current?.contains(target) && !takeActive) {
        setOpen(false);
        if (panel !== 'take') setPanel('none');
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (takeActive) { void cancelTake(); return; }
      setOpen(false);
      setPanel('none');
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  });

  // The camera is on only while the take panel is open.
  React.useEffect(() => {
    if (panel !== 'take') return undefined;
    let cancelled = false;
    const constraints: MediaStreamConstraints = {
      video: { deviceId: cameraId ? { exact: cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: false },
    };
    navigator.mediaDevices.getUserMedia(constraints).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        void liveRef.current.play().catch(() => undefined);
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (cancelled) return;
      setCameras(devices.filter((device) => device.kind === 'videoinput'));
      setMics(devices.filter((device) => device.kind === 'audioinput'));
    }).catch((error) => {
      if (!cancelled) setTakeState({ phase: 'error', message: error instanceof Error && error.name === 'OverconstrainedError' ? 'That camera or mic is not available. Pick another one.' : 'The camera or mic could not be opened.' });
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [panel, cameraId, micId]);

  // Line the take up with the program: the first playhead move after playback
  // starts tells when the range's first frame was on screen. Stop at the end mark.
  React.useEffect(() => {
    const active = recorderRef.current;
    if (!active || takeState.phase !== 'recording') return;
    const startSec = active.startFrame / fps;
    if (active.playbackStartedAtMs === null && playheadSec > startSec + 0.5 / fps) {
      active.playbackStartedAtMs = performance.now() - (playheadSec - startSec) * 1000;
    }
    if (playheadSec >= active.endFrame / fps) void stopTake();
  }, [playheadSec, takeState.phase]);

  React.useEffect(() => () => {
    const active = recorderRef.current;
    if (active && active.recorder.state !== 'inactive') {
      active.cancelled = true;
      active.recorder.stop();
      void bridge().devTakeCancel?.(active.id);
    }
  }, []);

  async function pickClip() {
    setOpen(false);
    setNotice(null);
    if (!projectPath) { setNotice('Save the project first.'); return; }
    try {
      const pick = await bridge().devPickInsert?.();
      if (!pick) return;
      setPicked(pick);
      setPanel('insert-choice');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open that file.');
    }
  }

  async function addPicked(mode: InsertEditMode) {
    if (!picked || !projectPath) return;
    const frame = playheadFrame;
    const unsubscribe = bridge().onDevInsertProgress?.((progress) => {
      if (typeof progress?.progress === 'number') setBusy(`Preparing ${picked.name}… ${Math.round(progress.progress * 100)}%`);
    });
    setBusy(picked.kind === 'project' ? `Preparing ${picked.name}…` : `Adding ${picked.name}…`);
    try {
      const media = await bridge().devPrepareInsert?.({ filePath: picked.filePath, projectPath, projectFps: fps });
      if (!media) return;
      const asset = createInsertedMediaAsset({
        id: newId('clip'),
        filePath: media.filePath,
        durationFrames: media.durationFrames,
        kind: 'clip',
        name: picked.kind === 'project' ? picked.name.replace(/\.roughcut$/i, '') : media.name,
        hasAudio: media.hasAudio,
        width: media.width,
        height: media.height,
        fps: media.fps,
        extraMetadata: picked.kind === 'project' ? { fromProject: picked.filePath } : {},
      });
      await onApply(insertMediaClip(getDocument(), { asset, frame, mode, placement: 'screen' }));
      setNotice(`${mode === 'insert' ? 'Inserted' : 'Overwrote with'} ${picked.name} at ${formatTimecode(frame, fps)}.`);
      setPanel('none');
      setPicked(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The clip could not be added.');
    } finally {
      unsubscribe?.();
      setBusy(null);
    }
  }

  async function startTake() {
    if (!rangeReady || !projectPath || takeActive) return;
    const stream = streamRef.current;
    if (!stream) { setTakeState({ phase: 'error', message: 'The camera is not ready yet.' }); return; }
    const startFrame = takeRange.startFrame as number;
    const endFrame = takeRange.endFrame as number;
    try {
      onSeekFrame(startFrame);
      const { id } = await (bridge().devTakeBegin?.({ projectPath }) ?? Promise.reject(new Error('Camera takes are not available.')));
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
      const session = { recorder, id, startFrame, endFrame, recordingStartedAtMs: null as number | null, playbackStartedAtMs: null as number | null, writes: Promise.resolve() as Promise<unknown>, stopping: false, cancelled: false };
      recorderRef.current = session;
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0 || session.cancelled) return;
        session.writes = session.writes.then(async () => bridge().devTakeChunk?.(id, await event.data.arrayBuffer()));
      };
      recorder.onstart = () => { session.recordingStartedAtMs = performance.now(); };
      recorder.start(1000);
      // Countdown while the camera already rolls; that lead-in is trimmed off on landing.
      for (let remaining = TAKE_COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
        if (session.cancelled) return;
        setTakeState({ phase: 'countdown', remaining });
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      if (session.cancelled) return;
      setTakeState({ phase: 'recording' });
      onTakePlayback({ playing: true, muted: !soundOn });
    } catch (error) {
      recorderRef.current = null;
      onTakePlayback(null);
      setTakeState({ phase: 'error', message: error instanceof Error ? error.message : 'The take could not start.' });
    }
  }

  async function stopTake() {
    const session = recorderRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    onTakePlayback({ playing: false, muted: !soundOn });
    setTakeState({ phase: 'saving' });
    try {
      await new Promise<void>((resolve) => {
        session.recorder.onstop = () => resolve();
        if (session.recorder.state === 'inactive') resolve(); else session.recorder.stop();
      });
      await session.writes;
      const media = await (bridge().devTakeFinish?.({ id: session.id, projectFps: fps }) ?? Promise.reject(new Error('Camera takes are not available.')));
      const landing = pickupLanding({
        playheadFrame: session.startFrame,
        recordingStartedAtMs: session.recordingStartedAtMs ?? 0,
        playbackStartedAtMs: session.playbackStartedAtMs ?? (session.recordingStartedAtMs ?? 0) + TAKE_COUNTDOWN_SECONDS * 1000,
        fileDurationFrames: media.durationFrames,
        fps,
      });
      if (!landing) throw new Error('The take stopped before the range began.');
      const sourceOut = Math.min(landing.sourceOut, landing.sourceIn + (session.endFrame - session.startFrame));
      const document = getDocument();
      const takeNumber = document.assets.filter((asset) => (asset.metadata as { insertedMedia?: { kind?: string } })?.insertedMedia?.kind === 'pickup').length + 1;
      const asset = createInsertedMediaAsset({
        id: newId('take'),
        filePath: media.filePath,
        durationFrames: media.durationFrames,
        kind: 'pickup',
        name: `Take ${takeNumber}`,
        hasAudio: media.hasAudio,
        width: media.width,
        height: media.height,
        fps: media.fps,
        extraMetadata: { recordedAt: new Date().toISOString() },
      });
      await onApply(insertMediaClip(document, { asset, frame: landing.frame, mode: 'overwrite', placement: 'camera', sourceIn: landing.sourceIn, sourceOut }));
      setTakeState({ phase: 'idle' });
      setNotice(`Take ${takeNumber} placed ${formatTimecode(session.startFrame, fps)}–${formatTimecode(session.endFrame, fps)}.`);
    } catch (error) {
      setTakeState({ phase: 'error', message: error instanceof Error ? error.message : 'The take could not be saved.' });
    } finally {
      recorderRef.current = null;
      onTakePlayback(null);
    }
  }

  async function cancelTake() {
    const session = recorderRef.current;
    if (!session) return;
    session.cancelled = true;
    recorderRef.current = null;
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    onTakePlayback(null);
    await session.writes.catch(() => undefined);
    await bridge().devTakeCancel?.(session.id).catch(() => undefined);
    setTakeState({ phase: 'idle' });
    setNotice('Take cancelled.');
  }

  async function chooseTake(assetId: string) {
    if (!selectedTakeClipId) return;
    try {
      await onApply(switchCameraTake(getDocument(), { clipId: selectedTakeClipId, assetId }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not switch to that take.');
    }
  }

  const markLabel = (frame: number | null) => (frame === null ? '—' : formatTimecode(frame, fps));

  return (
    // Pointer events from the menu (and its floating layer, which React bubbles through
    // here) must not reach the timeline, or a click starts a playhead drag.
    <div className="devMediaMenu" ref={menuRef} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={`timelineToolButton devMenuButton${open || panel !== 'none' ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Dev tools: add clips and camera takes (only in your dev copy)"
        onClick={() => setOpen((value) => !value)}
      >
        Dev
      </button>
      {(open || panel !== 'none') && anchor ? createPortal(
        <div className="devMenuLayer" ref={layerRef} style={{ left: anchor.left, bottom: anchor.bottom }}>
      {open ? (
        <div className="devMenuPopover" role="menu" aria-label="Dev tools">
          <button type="button" role="menuitem" className="devMenuItem" disabled={Boolean(busy) || takeActive} onClick={() => void pickClip()}>
            Add clip at playhead…<span className="devMenuHint">{formatTimecode(playheadFrame, fps)}</span>
          </button>
          <div className="devMenuSeparator" role="separator" />
          <button type="button" role="menuitem" className="devMenuItem" disabled={takeActive} onClick={() => { onTakeRangeChange({ startFrame: playheadFrame, endFrame: takeRange.endFrame !== null && takeRange.endFrame > playheadFrame ? takeRange.endFrame : null }); setOpen(false); }}>
            Mark take start<span className="devMenuHint">{markLabel(takeRange.startFrame)}</span>
          </button>
          <button type="button" role="menuitem" className="devMenuItem" disabled={takeActive} onClick={() => { onTakeRangeChange({ startFrame: takeRange.startFrame !== null && takeRange.startFrame < playheadFrame ? takeRange.startFrame : null, endFrame: playheadFrame }); setOpen(false); }}>
            Mark take end<span className="devMenuHint">{markLabel(takeRange.endFrame)}</span>
          </button>
          <button type="button" role="menuitem" className="devMenuItem" disabled={!rangeReady || takeActive} title={rangeReady ? undefined : 'Mark a start and an end first'} onClick={() => { setPanel('take'); setOpen(false); setTakeState({ phase: 'idle' }); }}>
            Record camera take…
          </button>
          {takes.length > 0 ? (
            <>
              <div className="devMenuSeparator" role="separator" />
              <p className="devMenuLabel">Takes for this range</p>
              {takes.map((take) => (
                <button key={take.assetId} type="button" role="menuitemradio" aria-checked={take.active} className={`devMenuItem${take.active ? ' devMenuItemActive' : ''}`} onClick={() => void chooseTake(take.assetId)}>
                  {take.name}<span className="devMenuHint">{take.recordedAt ? new Date(take.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {panel === 'insert-choice' && picked ? (
        <div className="devMenuPopover devInsertChoice" role="dialog" aria-label="Insert or overwrite">
          <p className="devPanelTitle">Add <strong>{picked.name}</strong> at {formatTimecode(playheadFrame, fps)}</p>
          {picked.kind === 'project' ? <p className="devPanelNote">The project is exported with its finished look first.</p> : null}
          <div className="devChoiceRow">
            <button type="button" className="devChoiceButton" disabled={Boolean(busy)} onClick={() => void addPicked('insert')}>
              <strong>Insert</strong><span>Everything after moves later</span>
            </button>
            <button type="button" className="devChoiceButton" disabled={Boolean(busy)} onClick={() => void addPicked('overwrite')}>
              <strong>Overwrite</strong><span>Replaces what is under it</span>
            </button>
          </div>
          {busy ? <p className="devPanelNote" role="status">{busy}</p> : null}
          <button type="button" className="devTextButton" disabled={Boolean(busy)} onClick={() => { setPanel('none'); setPicked(null); }}>Cancel</button>
        </div>
      ) : null}
      {panel === 'take' ? (
        <div className="devMenuPopover devTakePanel" role="dialog" aria-label="Record camera take">
          <div className="devTakeHeader">
            <p className="devPanelTitle">Camera take {markLabel(takeRange.startFrame)}–{markLabel(takeRange.endFrame)}</p>
            {takeState.phase === 'recording' ? <span className="devRecDot" role="status">Recording</span> : null}
          </div>
          <video ref={liveRef} className="devTakeLive" muted playsInline aria-label="Camera" />
          <label className="devField">
            <span>Camera</span>
            <select value={cameraId} disabled={takeActive} onChange={(event) => { setCameraId(event.target.value); writeStored('roughCut.dev.takeCamera', event.target.value); }}>
              <option value="">Default camera</option>
              {cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}
            </select>
          </label>
          <label className="devField">
            <span>Mic</span>
            <select value={micId} disabled={takeActive} onChange={(event) => { setMicId(event.target.value); writeStored('roughCut.dev.takeMic', event.target.value); }}>
              <option value="">Default mic</option>
              {mics.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}
            </select>
          </label>
          <label className="devSwitch">
            <input type="checkbox" checked={soundOn} disabled={takeActive} onChange={(event) => { setSoundOn(event.target.checked); writeStored('roughCut.dev.takeSound', event.target.checked ? 'on' : 'off'); }} />
            <span>Play sound while recording (headphones only)</span>
          </label>
          {!hasCamera ? <p className="devPanelNote">This project has no camera yet; the take adds a bubble in the default camera style.</p> : null}
          {takeState.phase === 'error' ? <p className="devPanelError" role="alert">{takeState.message}</p> : null}
          {takeState.phase === 'saving' ? <p className="devPanelNote" role="status">Saving the take…</p> : null}
          <div className="devChoiceRow devTakeActions">
            {takeActive && takeState.phase !== 'saving'
              ? <button type="button" className="devPrimaryButton devStopButton" onClick={() => void stopTake()}>Stop</button>
              : <button type="button" className="devPrimaryButton" disabled={!rangeReady || takeActive} onClick={() => void startTake()}>Record</button>}
            <button type="button" className="devTextButton" disabled={takeState.phase === 'saving'} onClick={() => { if (takeActive) void cancelTake(); else setPanel('none'); }}>{takeActive ? 'Cancel take' : 'Close'}</button>
          </div>
        </div>
      ) : null}
        </div>,
        document.body,
      ) : null}
      {takeState.phase === 'countdown' ? (
        <div className="devCountdown" role="status" aria-live="assertive"><span key={takeState.remaining}>{takeState.remaining}</span></div>
      ) : null}
      {notice && panel === 'none' && !open ? (
        <span className="devMenuNotice" role="status" onClick={() => setNotice(null)}>{notice}</span>
      ) : null}
    </div>
  );
}
