// Dev-only tools for Noam's own dock copy: add a clip from outside the recording
// at the playhead, record a camera take while a marked range plays, and record a
// voice-over (mic only) from the playhead or over a marked range, and take in the
// edits an agent made on its copy of this project, one by one (like Resolve's
// compare timelines + Accept change).
// Agreed spec: docs/SPEC-dev-insert-and-camera-takes-2026-10-20.md.
// Nothing here renders unless main reports the local dev switch is on.
import React from 'react';
import { createPortal } from 'react-dom';
import {
  createInsertedMediaAsset,
  insertMediaClip,
  listCameraTakes,
  pickupLanding,
  placeVoiceTake,
  agentEditFrame,
  applyAgentEdit,
  type AgentEdit,
  type VoiceOverMode,
  useCameraTake as switchCameraTake,
  type InsertEditMode,
  type ProjectDocument,
} from '@rough-cut/project-model';

type DevBridge = {
  getDevFeatures?: () => Promise<{ enabled?: boolean } | null>;
  devPickInsert?: () => Promise<{ filePath: string; kind: 'video' | 'audio' | 'project'; name: string } | null>;
  devPrepareInsert?: (payload: { filePath: string; projectPath: string; projectFps: number }) => Promise<PreparedMedia | null>;
  onDevInsertProgress?: (callback: (progress: { progress?: number }) => void) => () => void;
  devTakeBegin?: (payload: { projectPath: string; kind?: 'camera' | 'voice' }) => Promise<{ id: string; path: string }>;
  devTakeChunk?: (id: string, chunk: ArrayBuffer) => Promise<number>;
  devTakeFinish?: (payload: { id: string; projectFps: number; kind?: 'camera' | 'voice' }) => Promise<PreparedMedia>;
  devTakeCancel?: (id: string) => Promise<boolean>;
  devGetAgentEdits?: (payload: { projectPath: string }) => Promise<{ entries: AgentEditEntryView[] }>;
  devResolveAgentEdits?: (payload: { projectPath: string; ids: string[]; resolution: 'accepted' | 'skipped' }) => Promise<{ updated: number }>;
};

type AgentEditEntryView = { id: string; at: string; label?: string; edit: AgentEdit };

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
  const [panel, setPanel] = React.useState<'none' | 'insert-choice' | 'take' | 'voice' | 'agent'>('none');
  const [agentEdits, setAgentEdits] = React.useState<AgentEditEntryView[]>([]);
  const [agentSelected, setAgentSelected] = React.useState<Set<string>>(() => new Set());
  const [agentNote, setAgentNote] = React.useState<string | null>(null);
  const loadAgentEdits = React.useCallback(async () => {
    if (!projectPath) { setAgentEdits([]); return; }
    const result = await bridge().devGetAgentEdits?.({ projectPath }).catch(() => null);
    const entries = result?.entries ?? [];
    setAgentEdits(entries);
    setAgentSelected(new Set(entries.map((entry) => entry.id)));
  }, [projectPath]);
  // The list is read whenever the menu opens, so new agent edits show up without a restart.
  React.useEffect(() => { if (open || panel === 'agent') void loadAgentEdits(); }, [open, panel, loadAgentEdits]);
  const [voiceMode, setVoiceMode] = React.useState<VoiceOverMode>(() => (readStored('roughCut.dev.voiceMode') === 'over' ? 'over' : 'replace'));
  const [micLevel, setMicLevel] = React.useState(0);
  const [picked, setPicked] = React.useState<{ filePath: string; kind: 'video' | 'audio' | 'project'; name: string } | null>(null);
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
    kind: 'camera' | 'voice';
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
        if (panel !== 'take' && panel !== 'voice' && panel !== 'agent') setPanel('none');
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

  // The camera is on only while the take panel is open; the mic only while a take or voice-over panel is.
  React.useEffect(() => {
    if (panel !== 'take' && panel !== 'voice') return undefined;
    let cancelled = false;
    const audio = { deviceId: micId ? { exact: micId } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: false };
    const constraints: MediaStreamConstraints = panel === 'voice'
      ? { audio }
      : { video: { deviceId: cameraId ? { exact: cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio };
    let meter: { context: AudioContext; frame: number } | null = null;
    navigator.mediaDevices.getUserMedia(constraints).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (panel === 'voice' && typeof AudioContext !== 'undefined') {
        // A live level so you can see the mic hears you before recording.
        const context = new AudioContext();
        // Created after the mic opens, outside the click, so it can start suspended.
        void context.resume().catch(() => undefined);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        meter = { context, frame: 0 };
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          let peak = 0;
          for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
          setMicLevel(Math.min(1, peak * 1.6));
          if (meter) meter.frame = window.requestAnimationFrame(tick);
        };
        meter.frame = window.requestAnimationFrame(tick);
      }
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
      if (meter) { window.cancelAnimationFrame(meter.frame); void meter.context.close().catch(() => undefined); }
      setMicLevel(0);
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

  // A sound file has no picture: it goes on the Voice lane at the playhead, like a
  // voice-over, and either replaces the recording's sound there or plays over it.
  async function addPickedSound(soundMode: VoiceOverMode) {
    if (!picked || !projectPath) return;
    const frame = playheadFrame;
    setBusy(`Adding ${picked.name}…`);
    try {
      const media = await bridge().devPrepareInsert?.({ filePath: picked.filePath, projectPath, projectFps: fps });
      if (!media) return;
      const asset = createInsertedMediaAsset({
        id: newId('sound'),
        filePath: media.filePath,
        durationFrames: media.durationFrames,
        kind: 'voice',
        name: media.name,
        voiceMode: soundMode,
        extraMetadata: { soundFile: true },
      });
      await onApply(placeVoiceTake(getDocument(), { asset, frame }));
      setNotice(`Added ${picked.name} at ${formatTimecode(frame, fps)} (${soundMode === 'replace' ? 'replaces the sound there' : 'plays over the sound'}).`);
      setPanel('none');
      setPicked(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The sound file could not be added.');
    } finally {
      setBusy(null);
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

  async function startTake(kind: 'camera' | 'voice' = 'camera') {
    if ((kind === 'camera' && !rangeReady) || !projectPath || takeActive) return;
    const stream = streamRef.current;
    if (!stream) { setTakeState({ phase: 'error', message: kind === 'voice' ? 'The mic is not ready yet.' : 'The camera is not ready yet.' }); return; }
    // A voice-over without a marked range starts at the playhead and runs until Stop.
    const startFrame = rangeReady ? takeRange.startFrame as number : playheadFrame;
    const endFrame = rangeReady ? takeRange.endFrame as number : Number.POSITIVE_INFINITY;
    try {
      onSeekFrame(startFrame);
      const { id } = await (bridge().devTakeBegin?.({ projectPath, kind }) ?? Promise.reject(new Error('Takes are not available.')));
      const mimeType = (kind === 'voice'
        ? ['audio/webm;codecs=opus', 'audio/webm']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
        .find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType
        ? (kind === 'voice' ? { mimeType, audioBitsPerSecond: 160_000 } : { mimeType, videoBitsPerSecond: 6_000_000 })
        : undefined);
      const session = { kind, recorder, id, startFrame, endFrame, recordingStartedAtMs: null as number | null, playbackStartedAtMs: null as number | null, writes: Promise.resolve() as Promise<unknown>, stopping: false, cancelled: false };
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
      const media = await (bridge().devTakeFinish?.({ id: session.id, projectFps: fps, kind: session.kind }) ?? Promise.reject(new Error('Takes are not available.')));
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
      if (session.kind === 'voice') {
        const voiceNumber = document.assets.filter((asset) => (asset.metadata as { insertedMedia?: { kind?: string } })?.insertedMedia?.kind === 'voice').length + 1;
        const asset = createInsertedMediaAsset({
          id: newId('voice'),
          filePath: media.filePath,
          durationFrames: media.durationFrames,
          kind: 'voice',
          name: `Voice-over ${voiceNumber}`,
          voiceMode,
          extraMetadata: { recordedAt: new Date().toISOString() },
        });
        await onApply(placeVoiceTake(document, { asset, frame: landing.frame, sourceIn: landing.sourceIn, sourceOut }));
        setTakeState({ phase: 'idle' });
        setNotice(`Voice-over ${voiceNumber} placed at ${formatTimecode(landing.frame, fps)} (${voiceMode === 'replace' ? 'replaces the voice there' : 'plays over the voice'}).`);
        return;
      }
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

  /** Take the ticked agent edits into this project, in the order the agent made them, as one undoable step. */
  async function takeInAgentEdits() {
    if (!projectPath) return;
    const chosen = agentEdits.filter((entry) => agentSelected.has(entry.id));
    if (chosen.length === 0) return;
    let document = getDocument();
    const taken: string[] = [];
    const failed: string[] = [];
    for (const entry of chosen) {
      try {
        document = applyAgentEdit(document, entry.edit);
        taken.push(entry.id);
      } catch {
        failed.push(entry.label ?? entry.edit.op);
      }
    }
    if (taken.length > 0) {
      await onApply(document);
      await bridge().devResolveAgentEdits?.({ projectPath, ids: taken, resolution: 'accepted' });
    }
    setAgentNote(failed.length > 0
      ? `Took in ${taken.length}. ${failed.length} no longer fit your project and stayed in the list: ${failed.join('; ')}.`
      : `Took in ${taken.length} edit${taken.length === 1 ? '' : 's'}. Undo takes them all back.`);
    await loadAgentEdits();
  }

  async function skipAgentEdits() {
    if (!projectPath) return;
    const ids = agentEdits.filter((entry) => agentSelected.has(entry.id)).map((entry) => entry.id);
    if (ids.length === 0) return;
    await bridge().devResolveAgentEdits?.({ projectPath, ids, resolution: 'skipped' });
    setAgentNote(`Skipped ${ids.length}.`);
    await loadAgentEdits();
  }

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
          <button type="button" role="menuitem" className="devMenuItem" data-agent-edits-open="true" disabled={takeActive} onClick={() => { setPanel('agent'); setOpen(false); setAgentNote(null); }}>
            Agent edits…<span className="devMenuHint">{agentEdits.length > 0 ? `${agentEdits.length} new` : 'none'}</span>
          </button>
          <div className="devMenuSeparator" role="separator" />
          <button type="button" role="menuitem" className="devMenuItem" disabled={takeActive} onClick={() => { setPanel('voice'); setOpen(false); setTakeState({ phase: 'idle' }); }}>
            Record voice-over…<span className="devMenuHint">{rangeReady ? `${markLabel(takeRange.startFrame)}–${markLabel(takeRange.endFrame)}` : `from ${formatTimecode(playheadFrame, fps)}`}</span>
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
          {picked.kind === 'audio' ? (
            <div className="devChoiceRow" data-sound-choice="true">
              <button type="button" className="devChoiceButton" disabled={Boolean(busy)} onClick={() => void addPickedSound('replace')}>
                <strong>Replace</strong><span>Mutes the recording's sound under it</span>
              </button>
              <button type="button" className="devChoiceButton" disabled={Boolean(busy)} onClick={() => void addPickedSound('over')}>
                <strong>Play over</strong><span>Both are heard</span>
              </button>
            </div>
          ) : (
            <div className="devChoiceRow">
              <button type="button" className="devChoiceButton" disabled={Boolean(busy)} onClick={() => void addPicked('insert')}>
                <strong>Insert</strong><span>Everything after moves later</span>
              </button>
              <button type="button" className="devChoiceButton" disabled={Boolean(busy)} onClick={() => void addPicked('overwrite')}>
                <strong>Overwrite</strong><span>Replaces what is under it</span>
              </button>
            </div>
          )}
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
              : <button type="button" className="devPrimaryButton" disabled={!rangeReady || takeActive} onClick={() => void startTake('camera')}>Record</button>}
            <button type="button" className="devTextButton" disabled={takeState.phase === 'saving'} onClick={() => { if (takeActive) void cancelTake(); else setPanel('none'); }}>{takeActive ? 'Cancel take' : 'Close'}</button>
          </div>
        </div>
      ) : null}
      {panel === 'agent' ? (
        <div className="devMenuPopover devTakePanel devAgentPanel" role="dialog" aria-label="Agent edits">
          <p className="devPanelTitle">Agent edits</p>
          <p className="devPanelNote">Changes an agent made on its copy of this project. Tick the ones you want; they are added to your project in order, as one step you can undo.</p>
          {agentEdits.length === 0 ? <p className="devPanelNote">Nothing new from the agent.</p> : (
            <ul className="devAgentList">
              {agentEdits.map((entry) => {
                const frame = agentEditFrame(entry.edit);
                return (
                  <li key={entry.id} className="devAgentItem" data-agent-edit-id={entry.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={agentSelected.has(entry.id)}
                        onChange={(event) => setAgentSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(entry.id); else next.delete(entry.id);
                          return next;
                        })}
                      />
                      <span>{entry.label ?? entry.edit.op}</span>
                    </label>
                    {frame !== null ? <button type="button" className="devTextButton devAgentGo" title="Go there on the timeline" onClick={() => onSeekFrame(frame)}>{formatTimecode(frame, fps)}</button> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {agentNote ? <p className="devPanelNote" role="status">{agentNote}</p> : null}
          <div className="devChoiceRow devTakeActions">
            <button type="button" className="devAgentApply" data-agent-edits-apply="true" disabled={agentSelected.size === 0 || agentEdits.length === 0} onClick={() => void takeInAgentEdits()}>Take in selected</button>
            <button type="button" className="devTextButton" disabled={agentSelected.size === 0 || agentEdits.length === 0} onClick={() => void skipAgentEdits()}>Skip</button>
            <button type="button" className="devTextButton" onClick={() => setPanel('none')}>Close</button>
          </div>
        </div>
      ) : null}
      {panel === 'voice' ? (
        <div className="devMenuPopover devTakePanel devVoicePanel" role="dialog" aria-label="Record voice-over">
          <div className="devTakeHeader">
            <p className="devPanelTitle">
              Voice-over {rangeReady ? `${markLabel(takeRange.startFrame)}–${markLabel(takeRange.endFrame)}` : `from ${formatTimecode(playheadFrame, fps)}`}
            </p>
            {takeState.phase === 'recording' ? <span className="devRecDot" role="status">Recording</span> : null}
          </div>
          <p className="devPanelNote">
            {rangeReady ? 'The marked range plays and recording stops at its end.' : 'Plays from the playhead; press Stop when you are done. Mark a range to stop by itself.'}
          </p>
          <label className="devField">
            <span>Mic</span>
            <select value={micId} disabled={takeActive} onChange={(event) => { setMicId(event.target.value); writeStored('roughCut.dev.takeMic', event.target.value); }}>
              <option value="">Default mic</option>
              {mics.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}
            </select>
          </label>
          <div className="devMicMeter" role="meter" aria-label="Mic level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(micLevel * 100)}>
            <span style={{ transform: `scaleX(${micLevel})` }} />
          </div>
          <div className="devChoiceRow devVoiceMode" role="radiogroup" aria-label="What the voice-over does">
            {([['replace', 'Replace voice', 'Mutes the old voice there'], ['over', 'Play over', 'Keeps the old sound too']] as const).map(([mode, title, hint]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={voiceMode === mode}
                className={`devChoiceButton${voiceMode === mode ? ' devChoiceButtonActive' : ''}`}
                disabled={takeActive}
                onClick={() => { setVoiceMode(mode); writeStored('roughCut.dev.voiceMode', mode); }}
              >
                <strong>{title}</strong><span>{hint}</span>
              </button>
            ))}
          </div>
          <label className="devSwitch">
            <input type="checkbox" checked={soundOn} disabled={takeActive} onChange={(event) => { setSoundOn(event.target.checked); writeStored('roughCut.dev.takeSound', event.target.checked ? 'on' : 'off'); }} />
            <span>Play sound while recording (headphones only)</span>
          </label>
          {takeState.phase === 'error' ? <p className="devPanelError" role="alert">{takeState.message}</p> : null}
          {takeState.phase === 'saving' ? <p className="devPanelNote" role="status">Saving the voice-over…</p> : null}
          <div className="devChoiceRow devTakeActions">
            {takeActive && takeState.phase !== 'saving'
              ? <button type="button" className="devPrimaryButton devStopButton" data-voice-stop="true" onClick={() => void stopTake()}>Stop</button>
              : <button type="button" className="devPrimaryButton" data-voice-record="true" disabled={takeActive} onClick={() => void startTake('voice')}>Record</button>}
            <button type="button" className="devTextButton" disabled={takeState.phase === 'saving'} onClick={() => { if (takeActive) void cancelTake(); else setPanel('none'); }}>{takeActive ? 'Cancel' : 'Close'}</button>
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
