import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      startRecording: () => Promise<RecordingStatus>;
      stopRecording: () => Promise<RecordingStatus>;
      getRecordingStatus: () => Promise<RecordingStatus>;
      openProject: () => Promise<ProjectState | null>;
      openProjectPath: (path: string) => Promise<ProjectState>;
      pickExportOutputPath: (projectName: string) => Promise<string | null>;
      exportProject: (payload: { document: ProjectState['document']; outputPath: string }) => Promise<ExportResult>;
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
      const result = await window.roughCut.exportProject({ document: project.document, outputPath });
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
            onExport={exportProject}
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
  onExport,
  exportProgress,
  exportResult,
}: {
  project: ProjectState;
  onExport: () => void;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
}) {
  return (
    <section className="preview" aria-label="Project preview">
      <div>
        <p className="eyebrow">Opened project</p>
        <h2>{project.document.name}</h2>
        <p>{project.path}</p>
      </div>
      {project.mediaUrl ? (
        <VideoPreview src={project.mediaUrl} />
      ) : (
        <p>No recording asset found in this project.</p>
      )}
      {project.recording ? (
        <p className="meta">
          {project.recording.width}x{project.recording.height} · {project.recording.fps} fps ·{' '}
          {project.recording.duration} frames
        </p>
      ) : null}
      <div className="exportPanel">
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

function VideoPreview({ src }: { src: string }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setError(null);
  }, [src]);

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
  }

  return (
    <div className="videoPreview">
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setError(null);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={(event) => setError(videoErrorMessage(event.currentTarget))}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
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
