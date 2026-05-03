import React from 'react';
import { createRoot } from 'react-dom/client';
import type { ProjectDocument } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import './styles.css';
import {
  addManualMarkerAt,
  canAddMarkerAt,
  listMarkers,
  removeMarker,
} from './zoom-markers.mjs';
import { cursorAtFrame, drawCursorPath } from './styled-preview.mjs';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      startRecording: () => Promise<RecordingStatus>;
      stopRecording: () => Promise<RecordingStatus>;
      getRecordingStatus: () => Promise<RecordingStatus>;
      openProject: () => Promise<ProjectState | null>;
      openProjectPath: (path: string) => Promise<ProjectState>;
      saveProject: (project: { path: string; document: ProjectState['document'] }) => Promise<ProjectState>;
      pickExportOutputPath: (projectName: string) => Promise<string | null>;
      exportProject: (payload: { document: ProjectState['document']; outputPath: string; mode: ExportMode }) => Promise<ExportResult>;
      onExportProgress: (callback: (progress: ExportProgress) => void) => () => void;
      channels: Record<string, string>;
    };
  }
}

type ProjectState = {
  path: string;
  document: { name: string; composition: { duration: number }; assets?: unknown[] };
  recording: null | { filePath: string; duration: number; width: number; height: number; fps: number };
  mediaUrl: string | null;
};

type ExportProgress = { phase: string; progress: number };
type ExportResult = { outputPath: string; sourcePath: string; bytes: number; byteEqualCandidate: boolean };
type ExportMode = 'raw' | 'styled';

type RecordingStatus =
  | { state: 'idle' }
  | { state: 'recording'; startedAt: string; rawPath: string; outputPath: string }
  | {
      state: 'saved';
      startedAt: string;
      stoppedAt: string;
      rawPath: string;
      outputPath: string;
      project?: ProjectState;
    };

function App() {
  const [version, setVersion] = React.useState<string>('loading');
  const [recording, setRecording] = React.useState<RecordingStatus>({ state: 'idle' });
  const [project, setProject] = React.useState<ProjectState | null>(null);
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);
  const [exportMode, setExportMode] = React.useState<ExportMode>('raw');
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    window.roughCut.getVersion().then(setVersion).catch(() => setVersion('unknown'));
    window.roughCut.getRecordingStatus().then(setRecording).catch(() => undefined);
    return window.roughCut.onExportProgress(setExportProgress);
  }, []);

  React.useEffect(() => {
    const projectPath = new URLSearchParams(window.location.search).get('projectPath');
    if (!projectPath) return;

    let cancelled = false;
    window.roughCut.openProjectPath(projectPath)
      .then((opened) => {
        if (cancelled) return;
        setProject(opened);
        setExportResult(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Project open failed.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (recording.state !== 'recording') {
      setElapsedMs(0);
      return;
    }

    const started = Date.parse(recording.startedAt);
    const update = () => setElapsedMs(Math.max(0, Date.now() - started));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  async function toggleRecording() {
    setError(null);
    try {
      if (recording.state === 'recording') {
        const stopped = await window.roughCut.stopRecording();
        setRecording(stopped);
        if (stopped.state === 'saved' && stopped.project) {
          setProject(stopped.project);
          setExportResult(null);
        }
      } else {
        setRecording(await window.roughCut.startRecording());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed.');
    }
  }

  async function openProject() {
    setError(null);
    try {
      const opened = await window.roughCut.openProject();
      if (opened) {
        setProject(opened);
        setExportResult(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project open failed.');
    }
  }

  async function exportProject() {
    if (!project) return;
    setError(null);
    setExportResult(null);
    setExportProgress({ phase: 'picking', progress: 0 });
    try {
      const outputPath = await window.roughCut.pickExportOutputPath(project.document.name);
      if (!outputPath) {
        setExportProgress(null);
        return;
      }
      const result = await window.roughCut.exportProject({ document: project.document, outputPath, mode: exportMode });
      setExportResult(result);
      setExportProgress({ phase: 'complete', progress: 1 });
    } catch (err) {
      setExportProgress(null);
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Rough Cut MVP</p>
        <h1>Screen recording first. Everything else later.</h1>
        <p className="lede">
          This fresh app starts from the stable Rough Cut libraries and keeps orchestration small.
        </p>
        <div className="panel">
          <button type="button" onClick={toggleRecording} className={recording.state === 'recording' ? 'stop' : ''}>
            {recording.state === 'recording' ? 'Stop recording' : 'Record'}
          </button>
          <button type="button" onClick={openProject} className="secondary" disabled={recording.state === 'recording'}>
            Open project
          </button>
          <span>{statusLabel(recording, elapsedMs)}</span>
        </div>
        {recording.state === 'saved' ? (
          <p className="saved">Recording saved to: {recording.outputPath}</p>
        ) : null}
        {project ? (
          <ProjectPreview
            project={project}
            onProjectChange={setProject}
            onExport={exportProject}
            exportMode={exportMode}
            onExportModeChange={setExportMode}
            exportProgress={exportProgress}
            exportResult={exportResult}
          />
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <p className="version">Electron app version: {version}</p>
      </section>
    </main>
  );
}

function ProjectPreview({
  project,
  onProjectChange,
  onExport,
  exportProgress,
  exportResult,
  exportMode,
  onExportModeChange,
}: {
  project: ProjectState;
  onProjectChange: (next: ProjectState) => void;
  onExport: () => void;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  exportMode: ExportMode;
  onExportModeChange: (mode: ExportMode) => void;
}) {
  const [currentTimeSec, setCurrentTimeSec] = React.useState(0);
  return (
    <section className="preview" aria-label="Project preview">
      <div>
        <p className="eyebrow">Opened project</p>
        <h2>{project.document.name}</h2>
        <p>{project.path}</p>
      </div>
      {project.mediaUrl ? (
        <VideoPreview project={project} onCurrentTimeChange={setCurrentTimeSec} />
      ) : (
        <p>No recording asset found in this project.</p>
      )}
      {project.recording ? (
        <p className="meta">
          {project.recording.width}x{project.recording.height} · {project.recording.fps} fps ·{' '}
          {project.recording.duration} frames
        </p>
      ) : null}
      {project.recording ? (
        <ZoomMarkerPanel
          project={project}
          fps={project.recording.fps}
          currentTimeSec={currentTimeSec}
          onProjectChange={onProjectChange}
        />
      ) : null}
      <div className="exportPanel">
        <label className="exportMode">
          Export mode
          <select value={exportMode} onChange={(event) => onExportModeChange(event.target.value as ExportMode)}>
            <option value="raw">Raw recording</option>
            <option value="styled">Styled canvas</option>
          </select>
        </label>
        <ExportPresetDetails mode={exportMode} />
        <button type="button" onClick={onExport} className="secondary" disabled={!project.recording}>
          Export MP4
        </button>
        {exportProgress ? (
          <span>{exportProgress.phase}: {Math.round(exportProgress.progress * 100)}%</span>
        ) : null}
      </div>
      {exportResult ? (
        <p className="saved">
          Exported to: {exportResult.outputPath} ({exportResult.bytes} bytes)
        </p>
      ) : null}
    </section>
  );
}

function ZoomMarkerPanel({
  project,
  fps,
  currentTimeSec,
  onProjectChange,
}: {
  project: ProjectState;
  fps: number;
  currentTimeSec: number;
  onProjectChange: (next: ProjectState) => void;
}) {
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const document = project.document as unknown as ProjectDocument;
  const markers = listMarkers(document);
  const canAdd = canAddMarkerAt(document, currentTimeSec, fps);

  async function persist(nextDocument: ProjectDocument) {
    const previous = project;
    const optimistic = { ...project, document: nextDocument as unknown as ProjectState['document'] };
    setSaveError(null);
    setIsSaving(true);
    onProjectChange(optimistic);
    try {
      const saved = await window.roughCut.saveProject({ path: project.path, document: optimistic.document });
      onProjectChange(saved);
    } catch (err) {
      onProjectChange(previous);
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd() {
    const nextDocument = addManualMarkerAt(document, currentTimeSec, fps);
    if (nextDocument === document) return;
    await persist(nextDocument);
  }

  async function handleRemove(markerId: string) {
    const nextDocument = removeMarker(document, markerId);
    if (nextDocument === document) return;
    await persist(nextDocument);
  }

  return (
    <div className="zoomMarkerPanel" aria-label="Zoom markers">
      <div className="zoomMarkerHeader">
        <h3>Zoom markers</h3>
        <span className="zoomMarkerTime">Playback {formatClock(currentTimeSec)}</span>
      </div>
      <button
        type="button"
        className="secondary compact"
        onClick={handleAdd}
        disabled={!canAdd || isSaving}
      >
        Add marker at {formatClock(currentTimeSec)}
      </button>
      {markers.length === 0 ? (
        <p className="zoomMarkerEmpty">No manual zooms yet — pause at a moment, then add a marker.</p>
      ) : (
        <ul className="zoomMarkerList">
          {markers.map((marker) => (
            <li key={marker.id} className="zoomMarkerRow">
              <span className="zoomMarkerRange">
                {marker.startFrame}–{marker.endFrame} f · {Math.round(marker.strength * 100)}%
              </span>
              <button
                type="button"
                className="secondary compact"
                onClick={() => handleRemove(marker.id)}
                disabled={isSaving}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {saveError ? <p className="error">{saveError}</p> : null}
    </div>
  );
}

function ExportPresetDetails({ mode }: { mode: ExportMode }) {
  if (mode === 'raw') {
    return <p className="exportPreset">Raw export keeps the original recording unchanged.</p>;
  }

  return (
    <p className="exportPreset">
      Styled preset: 1920x1080, full-screen fit, pastel background, rounded screen, soft shadow.
    </p>
  );
}

function VideoPreview({
  project,
  onCurrentTimeChange,
}: {
  project: ProjectState;
  onCurrentTimeChange?: (sec: number) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const src = project.mediaUrl ?? '';
  const sourceWidth = project.recording?.width ?? 1920;
  const sourceHeight = project.recording?.height ?? 1080;
  const fps = project.recording?.fps ?? 30;

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setError(null);
  }, [src]);

  // Per-frame canvas render loop: drawImage video + zoom transform + cursor.
  React.useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    let rafId = 0;
    const document = project.document as unknown as ProjectDocument;
    const cursorEvents =
      ((document.assets?.[0] as { metadata?: { cursorEvents?: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> } } | undefined)?.metadata?.cursorEvents) ?? [];

    function tick() {
      if (!video || !canvas || !ctx) return;
      const currentFrame = Math.max(0, Math.round(video.currentTime * fps));
      let frame;
      try {
        frame = resolveFrame(document, currentFrame);
      } catch {
        // Fall back to identity when resolveFrame can't process the document
        // (e.g. partial state during initial load).
        frame = { cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 } };
      }
      const { scale, offsetX, offsetY } = frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
      ctx.clearRect(0, 0, sourceWidth, sourceHeight);
      ctx.save();
      ctx.translate(sourceWidth / 2 + offsetX, sourceHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
      }
      const cursor = cursorAtFrame(cursorEvents, currentFrame);
      if (cursor) drawCursorPath(ctx, cursor.x, cursor.y);
      ctx.restore();
      rafId = window.requestAnimationFrame(tick);
    }
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [project, sourceWidth, sourceHeight, fps]);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video playback failed.');
      }
    } else {
      video.pause();
    }
  }

  function seek(value: string) {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    onCurrentTimeChange?.(nextTime);
  }

  return (
    <div className="videoPreview styledPreview">
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        className="hiddenSource"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setError(null);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={(event) => setError(videoErrorMessage(event.currentTarget))}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime;
          setCurrentTime(next);
          onCurrentTimeChange?.(next);
        }}
      />
      <canvas ref={canvasRef} className="styledPreviewCanvas" aria-label="Styled preview" />
      <div className="videoControls" aria-label="Video playback controls">
        <button type="button" className="secondary compact" onClick={togglePlayback}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <span className="timecode">
          {formatClock(currentTime)} / {formatClock(duration)}
        </span>
        <input
          aria-label="Seek video"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          onInput={(event) => seek(event.currentTarget.value)}
          onChange={(event) => seek(event.currentTarget.value)}
        />
      </div>
      {error ? <p className="error">Video failed to load: {error}</p> : null}
    </div>
  );
}

function videoErrorMessage(video: HTMLVideoElement) {
  const code = video.error?.code;
  if (code === MediaError.MEDIA_ERR_ABORTED) return 'Loading was aborted.';
  if (code === MediaError.MEDIA_ERR_NETWORK) return 'Network or file access failed.';
  if (code === MediaError.MEDIA_ERR_DECODE) return 'The video could not be decoded.';
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'The video source is not supported.';
  return 'Unknown media error.';
}

function statusLabel(recording: RecordingStatus, elapsedMs: number) {
  if (recording.state === 'recording') return `Recording ${formatElapsed(elapsedMs)}`;
  if (recording.state === 'saved') return 'Recording complete.';
  return 'Primary display. Screen-only MP4 via FFmpeg x11grab.';
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

createRoot(document.getElementById('root')!).render(<App />);
