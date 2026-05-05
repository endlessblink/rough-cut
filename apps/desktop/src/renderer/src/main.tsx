import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  createDefaultRecordingBackgroundStyle,
  getStyledCanvasResolution,
  PROJECT_ASPECT_RATIO_LABELS,
  PROJECT_ASPECT_RATIOS,
  type ProjectAspectRatio,
  type ProjectDocument,
  type RecordingBackgroundStyle,
  type ZoomMarker,
} from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import './styles.css';
import {
  addManualMarkerAt,
  applySuggestion,
  canAddMarkerAt,
  listMarkers,
  removeMarker,
  withDefaultPresentation,
} from './zoom-markers.mjs';
import { buildTimelineModel } from './timeline-rail.mjs';
import { coverSourceRect, cursorAtFrame, drawCursorPath } from './styled-preview.mjs';
import { generateSuggestionsForProject } from './auto-zoom-suggestions.mjs';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      getMicSources: () => Promise<MicSource[]>;
      getSystemAudioSources: () => Promise<AudioSource[]>;
      getCameraSources: () => Promise<CameraSource[]>;
      startRecording: (options?: { micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; captureRegion?: CaptureRegion | null }) => Promise<RecordingStatus>;
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
  document: {
    name: string;
    composition: { duration: number };
    settings?: { aspectRatio?: ProjectAspectRatio };
    assets?: Array<{ id?: string; type?: string; presentation?: { background?: RecordingBackgroundStyle } & Record<string, unknown> } & Record<string, unknown>>;
  };
  recording: null | { filePath: string; duration: number; width: number; height: number; fps: number; audio?: unknown; camera?: unknown };
  mediaUrl: string | null;
  cameraMediaUrl?: string | null;
};

type ExportProgress = { phase: string; progress: number };
type ExportResult = { outputPath: string; sourcePath: string; bytes: number; byteEqualCandidate: boolean };
type ExportMode = 'raw' | 'styled';
type MicSource = { id: string; name: string; label: string; state: string };
type AudioSource = { id: string; name: string; label: string; state: string };
type CameraSource = { id: string; name: string; label: string };
type CaptureMode = 'display' | 'region';
type CaptureRegion = { mode: 'region'; x: number; y: number; width: number; height: number };

type RecordingStatus =
  | { state: 'idle' }
  | { state: 'recording'; startedAt: string; rawPath: string; outputPath: string; micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null }
  | {
      state: 'saved';
      startedAt: string;
      stoppedAt: string;
      rawPath: string;
      outputPath: string;
      cameraError?: string | null;
      project?: ProjectState;
    };

const DEFAULT_RECORDING_BACKGROUND = createDefaultRecordingBackgroundStyle();

function App() {
  const [version, setVersion] = React.useState<string>('loading');
  const [recording, setRecording] = React.useState<RecordingStatus>({ state: 'idle' });
  const [project, setProject] = React.useState<ProjectState | null>(null);
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);
  const [exportMode, setExportMode] = React.useState<ExportMode>('raw');
  const [micSources, setMicSources] = React.useState<MicSource[]>([]);
  const [systemAudioSources, setSystemAudioSources] = React.useState<AudioSource[]>([]);
  const [cameraSources, setCameraSources] = React.useState<CameraSource[]>([]);
  const [recordMic, setRecordMic] = React.useState(false);
  const [recordSystemAudio, setRecordSystemAudio] = React.useState(false);
  const [recordCamera, setRecordCamera] = React.useState(false);
  const [selectedMicSource, setSelectedMicSource] = React.useState<string>('');
  const [selectedSystemAudioSource, setSelectedSystemAudioSource] = React.useState<string>('');
  const [selectedCameraSource, setSelectedCameraSource] = React.useState<string>('');
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>('display');
  const [captureRegion, setCaptureRegion] = React.useState<CaptureRegion>({ mode: 'region', x: 0, y: 0, width: 1280, height: 720 });
  const [recordingActionPending, setRecordingActionPending] = React.useState(false);
  const [setupBoardOpen, setSetupBoardOpen] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [activeTool, setActiveTool] = React.useState<ActiveTool>('background');
  const recordingActionPendingRef = React.useRef(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    window.roughCut.getVersion().then(setVersion).catch(() => setVersion('unknown'));
    window.roughCut.getRecordingStatus().then(setRecording).catch(() => undefined);
    window.roughCut.getMicSources()
      .then((sources) => {
        setMicSources(sources);
        setSelectedMicSource((current) => current || sources[0]?.name || '');
      })
      .catch(() => setMicSources([]));
    window.roughCut.getSystemAudioSources()
      .then((sources) => {
        setSystemAudioSources(sources);
        setSelectedSystemAudioSource((current) => current || sources[0]?.name || '');
      })
      .catch(() => setSystemAudioSources([]));
    window.roughCut.getCameraSources()
      .then((sources) => {
        setCameraSources(sources);
        setSelectedCameraSource((current) => current || sources[0]?.name || '');
      })
      .catch(() => setCameraSources([]));
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

  React.useEffect(() => {
    if (project?.recording?.camera) setExportMode('styled');
  }, [project?.recording?.camera]);

  async function toggleRecording() {
    if (recordingActionPendingRef.current) {
      console.warn('[renderer:recording] ignored duplicate recording action while previous action is pending');
      return;
    }
    recordingActionPendingRef.current = true;
    setRecordingActionPending(true);
    setError(null);
    try {
      if (recording.state === 'recording') {
        console.info('[renderer:recording] stop requested');
        const stopped = await window.roughCut.stopRecording();
        console.info(`[renderer:recording] stop completed ${JSON.stringify(summarizeRecordingStatus(stopped))}`);
        setRecording(stopped);
        if (stopped.state === 'saved' && stopped.project) {
          setProject(stopped.project);
          setExportResult(null);
        } else if (stopped.state === 'saved') {
          console.warn('[renderer:recording] saved recording did not include a project payload', stopped);
        }
      } else {
        const micSource = recordMic ? selectedMicSource || null : null;
        const systemAudioSource = recordSystemAudio ? selectedSystemAudioSource || null : null;
        const cameraDevicePath = recordCamera ? selectedCameraSource || null : null;
        const region = captureMode === 'region' ? captureRegion : null;
        console.info(`[renderer:recording] start requested ${JSON.stringify({
          hasMic: Boolean(micSource),
          hasSystemAudio: Boolean(systemAudioSource),
          cameraDevicePath,
          captureMode,
          region,
        })}`);
        setRecording(await window.roughCut.startRecording({ micSource, systemAudioSource, cameraDevicePath, captureRegion: region }));
      }
    } catch (err) {
      console.error('[renderer:recording] recording action failed', err);
      setError(err instanceof Error ? err.message : 'Recording failed.');
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
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
      <section className="editorShell" data-ui-shell="recording-studio">
        <header className="topBar" data-ui-region="capture-bar">
          <div className="brandCluster">
            <span className="windowDots" aria-hidden="true"><i /><i /><i /></span>
            <span className="titleIcon"><Icon name="folder" /></span>
            <span className="titleIcon"><Icon name="comments" /></span>
            <span className="titleIcon"><Icon name="undo" /></span>
            <div>
              <p className="eyebrow">Rough Cut</p>
              <h1>Studio</h1>
            </div>
          </div>
          <div className="topActions">
            <button type="button" className="iconButton" onClick={() => setSetupBoardOpen((open) => !open)} aria-pressed={setupBoardOpen} aria-label="Toggle setup board">
              <Icon name="sparkle" />
            </button>
            <button type="button" className="iconButton" onClick={() => setInspectorOpen((open) => !open)} aria-pressed={inspectorOpen} aria-label="Toggle inspector board">
              <Icon name="sliders" />
            </button>
            <button type="button" onClick={toggleRecording} className={recording.state === 'recording' ? 'stop primaryAction' : 'primaryAction'} disabled={recordingActionPending}>
              <Icon name={recording.state === 'recording' ? 'stop' : 'record'} />
              {recordingActionPending ? (recording.state === 'recording' ? 'Stopping...' : 'Starting...') : recording.state === 'recording' ? 'Stop recording' : 'Record'}
            </button>
            <button type="button" onClick={openProject} className="secondary" disabled={recording.state === 'recording'}>
              <Icon name="folder" />
              Open project
            </button>
          </div>
        </header>
        <div className={setupBoardOpen ? 'recordingStrip' : 'recordingStrip collapsed'} aria-label="Recording setup" data-ui-region="capture-command-area">
          <span className="captureSummary"><Icon name="display" /> {captureStatusLabel(recording, elapsedMs)}</span>
          <div className="sourceGroup">
          <label className="sourceToggle" aria-label="Record microphone" title="Microphone">
            <input
              type="checkbox"
              checked={recordMic}
              disabled={recording.state === 'recording' || micSources.length === 0}
              onChange={(event) => setRecordMic(event.currentTarget.checked)}
            />
            <Icon name="mic" />
          </label>
          <select
            className="sourceSelect"
            value={selectedMicSource}
            disabled={recording.state === 'recording' || !recordMic || micSources.length === 0}
            onChange={(event) => setSelectedMicSource(event.currentTarget.value)}
            aria-label="Microphone source"
          >
            {micSources.length === 0 ? (
              <option value="">No microphone sources found</option>
            ) : (
              micSources.map((source) => (
                <option key={source.name} value={source.name}>
                  {source.label || source.name}{source.state ? ` (${source.state.toLowerCase()})` : ''}
                </option>
              ))
            )}
          </select>
          </div>
          <div className="sourceGroup">
          <label className="sourceToggle" aria-label="Record system audio" title="System audio">
            <input
              type="checkbox"
              checked={recordSystemAudio}
              disabled={recording.state === 'recording' || systemAudioSources.length === 0}
              onChange={(event) => setRecordSystemAudio(event.currentTarget.checked)}
            />
            <Icon name="volume" />
          </label>
          <select
            className="sourceSelect"
            value={selectedSystemAudioSource}
            disabled={recording.state === 'recording' || !recordSystemAudio || systemAudioSources.length === 0}
            onChange={(event) => setSelectedSystemAudioSource(event.currentTarget.value)}
            aria-label="System audio source"
          >
            {systemAudioSources.length === 0 ? (
              <option value="">No system audio sources found</option>
            ) : (
              systemAudioSources.map((source) => (
                <option key={source.name} value={source.name}>
                  {source.label || source.name}{source.state ? ` (${source.state.toLowerCase()})` : ''}
                </option>
              ))
            )}
          </select>
          </div>
          <div className="sourceGroup">
          <label className="sourceToggle" aria-label="Record camera" title="Camera">
            <input
              type="checkbox"
              checked={recordCamera}
              disabled={recording.state === 'recording' || cameraSources.length === 0}
              onChange={(event) => setRecordCamera(event.currentTarget.checked)}
            />
            <Icon name="camera" />
          </label>
          <select
            className="sourceSelect"
            value={selectedCameraSource}
            disabled={recording.state === 'recording' || !recordCamera || cameraSources.length === 0}
            onChange={(event) => setSelectedCameraSource(event.currentTarget.value)}
            aria-label="Camera source"
          >
            {cameraSources.length === 0 ? (
              <option value="">No camera sources found</option>
            ) : (
              cameraSources.map((source) => (
                <option key={source.name} value={source.name}>
                  {source.label || source.name}
                </option>
              ))
            )}
          </select>
          </div>
          <label className="targetSelect">
            <Icon name="display" />
            <select
              value={captureMode}
              disabled={recording.state === 'recording'}
              onChange={(event) => setCaptureMode(event.currentTarget.value as CaptureMode)}
              aria-label="Capture target"
            >
              <option value="display">Full display</option>
              <option value="region">Region</option>
            </select>
          </label>
          {captureMode === 'region' ? (
            <div className="regionControls" aria-label="Capture region controls">
              <NumberField label="X" value={captureRegion.x} disabled={recording.state === 'recording'} onChange={(x) => setCaptureRegion((current) => ({ ...current, x }))} />
              <NumberField label="Y" value={captureRegion.y} disabled={recording.state === 'recording'} onChange={(y) => setCaptureRegion((current) => ({ ...current, y }))} />
              <NumberField label="W" value={captureRegion.width} min={2} disabled={recording.state === 'recording'} onChange={(width) => setCaptureRegion((current) => ({ ...current, width }))} />
              <NumberField label="H" value={captureRegion.height} min={2} disabled={recording.state === 'recording'} onChange={(height) => setCaptureRegion((current) => ({ ...current, height }))} />
            </div>
          ) : null}
        </div>
        <StateBanner recording={recording} elapsedMs={elapsedMs} actionPending={recordingActionPending} error={error} />
        {project ? (
          <ProjectPreview
            project={project}
            onProjectChange={setProject}
            onExport={exportProject}
            exportMode={exportMode}
            onExportModeChange={setExportMode}
            exportProgress={exportProgress}
            exportResult={exportResult}
            setupBoardOpen={setupBoardOpen}
            inspectorOpen={inspectorOpen}
            activeTool={activeTool}
            onActiveToolChange={(tool) => {
              setActiveTool(tool);
              setSetupBoardOpen(true);
            }}
          />
        ) : (
          <EmptyWorkspace
            setupBoardOpen={setupBoardOpen}
            inspectorOpen={inspectorOpen}
            activeTool={activeTool}
            onActiveToolChange={(tool) => {
              setActiveTool(tool);
              setSetupBoardOpen(true);
            }}
          />
        )}
        <p className="version">Electron app version: {version}</p>
      </section>
    </main>
  );
}

function summarizeRecordingStatus(status: RecordingStatus) {
  if (status.state === 'idle') return { state: status.state };
  if (status.state === 'recording') {
    return {
      state: status.state,
      outputPath: status.outputPath,
      cameraDevicePath: status.cameraDevicePath ?? null,
    };
  }
  return {
    state: status.state,
    outputPath: status.outputPath,
    hasProject: Boolean(status.project),
    projectPath: status.project?.path ?? null,
    hasMediaUrl: Boolean(status.project?.mediaUrl),
    cameraError: status.cameraError ?? null,
  };
}

function StateBanner({
  recording,
  elapsedMs,
  actionPending,
  error,
}: {
  recording: RecordingStatus;
  elapsedMs: number;
  actionPending: boolean;
  error: string | null;
}) {
  const state = error ? 'error' : actionPending ? (recording.state === 'recording' ? 'stopping' : 'starting') : recording.state;
  const copy = stateCopy(recording, elapsedMs, state, error);

  return (
    <section className={`stateBanner ${state}`} data-recording-state={state} data-ui-region="state-banner" aria-live="polite">
      <div>
        <p className="eyebrow">{copy.label}</p>
        <h2>{copy.title}</h2>
      </div>
      <p>{copy.detail}</p>
      {recording.state === 'saved' && recording.cameraError ? (
        <p className="warning">Camera was unavailable, so the screen recording was saved without webcam PiP: {recording.cameraError}</p>
      ) : null}
    </section>
  );
}

function stateCopy(recording: RecordingStatus, elapsedMs: number, state: string, error: string | null) {
  if (error) {
    return { label: 'Needs attention', title: 'Something failed', detail: error };
  }
  if (state === 'starting') {
    return { label: 'Preparing capture', title: 'Starting recording...', detail: 'Locking the selected sources and opening the capture pipeline.' };
  }
  if (state === 'stopping') {
    return { label: 'Finalizing capture', title: 'Stopping...', detail: 'Saving media, remuxing the recording, and building the project file.' };
  }
  if (recording.state === 'recording') {
    return { label: 'Live capture', title: `Recording ${formatElapsed(elapsedMs)}`, detail: 'Stop when the take is complete. Source controls are locked while recording.' };
  }
  if (recording.state === 'saved') {
    return { label: 'Ready to review', title: 'Recording saved', detail: `Saved to: ${recording.outputPath}` };
  }
  return { label: 'Ready', title: 'Set up a recording or open a project', detail: 'Screen-only recording is the safe default; mic, system audio, camera, and region capture are optional.' };
}

function captureStatusLabel(recording: RecordingStatus, elapsedMs: number) {
  if (recording.state === 'recording') return formatElapsed(elapsedMs);
  if (recording.state === 'saved') return 'Saved';
  return 'Screen';
}

type IconName = 'folder' | 'comments' | 'undo' | 'sparkle' | 'sliders' | 'record' | 'stop' | 'frame' | 'timeline' | 'cursor' | 'camera' | 'caption' | 'settings' | 'export' | 'display' | 'mic' | 'volume' | 'play' | 'pause';
type ActiveTool = 'background' | 'timeline' | 'inspector';

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    folder: <path d="M3 6.5h6l1.5 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11.5Z" />,
    comments: <path d="M4 5h16v10H8l-4 4V5Z" />,
    undo: <path d="M9 7 5 11l4 4M5 11h9a5 5 0 1 1 0 10h-2" />,
    sparkle: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 3l.8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8L19 3Z" />,
    sliders: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" />,
    record: <circle cx="12" cy="12" r="5" fill="currentColor" />,
    stop: <rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" />,
    frame: <path d="M5 5h14v14H5V5Zm3 3h8v8H8V8Z" />,
    timeline: <path d="M4 17h16M6 13h6M14 13h4M9 9h9M5 5h5" />,
    cursor: <path d="m6 3 11 11-5 1.2L9.4 20 6 3Z" />,
    camera: <path d="M4 8h3l1.5-2h7L17 8h3v10H4V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
    caption: <path d="M4 6h16v12H4V6Zm3 4h5M7 14h10" />,
    settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M3 12h3m12 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />,
    export: <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />,
    display: <path d="M4 5h16v11H4V5Zm6 15h4m-2-4v4" />,
    mic: <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm-7 8a7 7 0 0 0 14 0M12 19v3" />,
    volume: <path d="M4 10v4h4l5 4V6l-5 4H4Zm12-1a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" />,
    play: <path d="m9 6 9 6-9 6V6Z" />,
    pause: <path d="M8 6h3v12H8V6Zm5 0h3v12h-3V6Z" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function BoardHeader({ icon, title, action }: { icon: IconName; title: string; action?: string }) {
  return (
    <div className="boardHeader">
      <span><Icon name={icon} /> {title}</span>
      {action ? <button type="button" className="textButton">{action}</button> : null}
    </div>
  );
}

function ToolRail({ active, onSelect }: { active: ActiveTool; onSelect: (tool: ActiveTool) => void }) {
  const tools: Array<{ id: ActiveTool; icon: IconName; label: string }> = [
    { id: 'background', icon: 'sparkle', label: 'Background' },
    { id: 'timeline', icon: 'timeline', label: 'Timeline' },
    { id: 'inspector', icon: 'sliders', label: 'Inspector' },
  ];
  return (
    <nav className="toolRail" aria-label="Editor tools">
      {tools.map((tool) => (
        <button key={tool.id} type="button" className={tool.id === active ? 'toolButton active' : 'toolButton'} onClick={() => onSelect(tool.id)} aria-label={tool.label} aria-pressed={tool.id === active}>
          <Icon name={tool.icon} />
        </button>
      ))}
    </nav>
  );
}

function EditorToolBoard({ activeTool, project, fps, currentTimeSec = 0, background, aspectRatio = 'auto', disabled = false, onProjectChange, onBackgroundChange, onAspectRatioChange }: { activeTool: ActiveTool; project?: ProjectState; fps?: number; currentTimeSec?: number; background?: RecordingBackgroundStyle; aspectRatio?: ProjectAspectRatio; disabled?: boolean; onProjectChange?: (next: ProjectState) => void; onBackgroundChange?: (patch: Partial<RecordingBackgroundStyle>) => void; onAspectRatioChange?: (ratio: ProjectAspectRatio) => void }) {
  const bg = background ?? DEFAULT_RECORDING_BACKGROUND;

  if (activeTool === 'timeline') {
    return (
      <aside className="setupBoard" aria-label="Timeline board">
        <BoardHeader icon="timeline" title="Timeline" />
        {project?.recording && fps && onProjectChange ? (
          <>
            <ZoomMarkerPanel project={project} fps={fps} currentTimeSec={currentTimeSec} onProjectChange={onProjectChange} />
            <AutoZoomSuggestionsPanel project={project} onProjectChange={onProjectChange} />
          </>
        ) : (
          <p className="boardNote">Open a project to edit zoom markers and suggestions.</p>
        )}
      </aside>
    );
  }

  if (activeTool === 'inspector') {
    return (
      <aside className="setupBoard" aria-label="Inspector board">
        <BoardHeader icon="sliders" title="Inspector" />
        <section className="inspectorSection">
          <p className="eyebrow">Canvas</p>
          <label className="field">
            Aspect ratio
            <select value={aspectRatio} onChange={(event) => onAspectRatioChange?.(event.currentTarget.value as ProjectAspectRatio)} disabled={disabled}>
              {PROJECT_ASPECT_RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>{PROJECT_ASPECT_RATIO_LABELS[ratio]}</option>
              ))}
            </select>
          </label>
        </section>
        <section className="inspectorSection">
          <p className="eyebrow">Screen</p>
          <RangeField label="Padding" value={bg.bgPadding} min={0} max={260} step={4} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgPadding: value })} />
          <RangeField label="Round corners" value={bg.bgCornerRadius} min={0} max={120} step={2} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgCornerRadius: value })} />
          <label className="toggleField">
            <input type="checkbox" checked={bg.bgShadowEnabled} disabled={disabled} onChange={(event) => onBackgroundChange?.({ bgShadowEnabled: event.currentTarget.checked })} />
            Screen shadow
          </label>
          <RangeField label="Shadow size" value={bg.bgShadowBlur} min={0} max={120} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowBlur: value })} />
        </section>
        <section className="inspectorSection mutedSection">
          <p className="eyebrow">Camera</p>
          <p>Webcam picture-in-picture is next.</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="setupBoard" aria-label="Background board">
      <BoardHeader icon="sparkle" title="Background" action="Reset" />
      <RangeField label="Background blur" value={0} min={0} max={40} step={1} disabled onChange={() => undefined} />
      <div className="segmentedControl" aria-label="Background type"><button type="button" className="active">Image</button><button type="button">Video</button><button type="button">Color</button></div>
      <div className="swatchGrid" aria-label="Background presets">{Array.from({ length: 18 }).map((_, index) => <button type="button" key={index} aria-label={`Background preset ${index + 1}`} disabled={disabled} />)}</div>
      <BoardHeader icon="frame" title="Frame" action="Reset" />
      <RangeField label="Shadow" value={bg.bgShadowBlur} min={0} max={120} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowBlur: value })} />
      <RangeField label="Radius" value={bg.bgCornerRadius} min={0} max={120} step={2} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgCornerRadius: value })} />
      <RangeField label="Padding" value={bg.bgPadding} min={0} max={260} step={4} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgPadding: value })} />
    </aside>
  );
}

function EmptyWorkspace({ setupBoardOpen, inspectorOpen, activeTool, onActiveToolChange }: { setupBoardOpen: boolean; inspectorOpen: boolean; activeTool: ActiveTool; onActiveToolChange: (tool: ActiveTool) => void }) {
  return (
    <section className={`projectEditor emptyWorkspace ${setupBoardOpen ? '' : 'setupClosed'} ${inspectorOpen ? '' : 'inspectorClosed'}`} aria-label="Project editor" data-ui-region="editor-workspace">
      <ToolRail active={activeTool} onSelect={onActiveToolChange} />
      <EditorToolBoard activeTool={activeTool} disabled />
      <div className="stageColumn" aria-label="Central stage" data-ui-region="central-stage">
        <div className="projectHeader">
          <div>
            <p className="eyebrow">Stage</p>
            <h2>No project loaded</h2>
          </div>
          <p className="meta">Record or open a project to preview it here.</p>
        </div>
        <div className="emptyStage">
          <div className="emptyPreviewMock" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">Preview surface</p>
          <h2>Your saved recording will stay centered here</h2>
          <p>Camera or audio problems should appear as warnings without hiding the screen preview.</p>
        </div>
        <div className="timelineDock emptyTimeline" aria-label="Timeline and review rail" data-ui-region="timeline-review-rail">
          <p className="eyebrow">Timeline</p>
          <p>Zoom markers, clicks, trims, and review actions will live in this bottom rail.</p>
          <div className="timelineSkeleton" aria-hidden="true"><span /><span /><span /></div>
        </div>
      </div>
      <aside className="inspector" aria-label="Export settings" data-ui-region="right-inspector">
        <section className="inspectorSection mutedSection" data-ui-region="export-actions-area">
          <p className="eyebrow"><Icon name="export" /> Export</p>
          <p>Export controls appear here once a project is loaded.</p>
        </section>
      </aside>
    </section>
  );
}

function NumberField({
  label,
  value,
  min = 0,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="numberField">
      {label}
      <input
        type="number"
        min={min}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Math.max(min, Math.round(Number(event.currentTarget.value) || min)))}
      />
    </label>
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
  setupBoardOpen,
  inspectorOpen,
  activeTool,
  onActiveToolChange,
}: {
  project: ProjectState;
  onProjectChange: (next: ProjectState) => void;
  onExport: () => void;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  exportMode: ExportMode;
  onExportModeChange: (mode: ExportMode) => void;
  setupBoardOpen: boolean;
  inspectorOpen: boolean;
  activeTool: ActiveTool;
  onActiveToolChange: (tool: ActiveTool) => void;
}) {
  const [currentTimeSec, setCurrentTimeSec] = React.useState(0);
  const [timelineSeekSec, setTimelineSeekSec] = React.useState(0);
  const isTimelineScrubbingRef = React.useRef(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const recordingAsset = getPrimaryRecordingAsset(project.document);
  const background = recordingAsset?.presentation?.background ?? DEFAULT_RECORDING_BACKGROUND;

  async function persist(nextDocument: ProjectState['document']) {
    const previous = project;
    const optimistic = { ...project, document: nextDocument };
    setSaveError(null);
    setIsSaving(true);
    onProjectChange(optimistic);
    try {
      const saved = await window.roughCut.saveProject({ path: project.path, document: nextDocument });
      onProjectChange(saved);
    } catch (err) {
      onProjectChange(previous);
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateAspectRatio(nextAspectRatio: ProjectAspectRatio) {
    if (nextAspectRatio === aspectRatio) return;
    await persist({
      ...project.document,
      settings: {
        ...project.document.settings,
        aspectRatio: nextAspectRatio,
      },
    });
  }

  async function updateBackground(patch: Partial<RecordingBackgroundStyle>) {
    if (!recordingAsset?.id) return;
    await persist({
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation);
        const nextBackground: RecordingBackgroundStyle = {
          ...DEFAULT_RECORDING_BACKGROUND,
          ...(presentation.background ?? {}),
          ...patch,
        };
        return {
          ...asset,
          presentation: {
            ...presentation,
            background: nextBackground,
          },
        };
      }),
    });
  }

  function handleTimelineScrub(nextTimeSec: number) {
    setCurrentTimeSec(nextTimeSec);
    if (isTimelineScrubbingRef.current) return;
    setTimelineSeekSec(nextTimeSec);
  }

  function handleTimelineScrubStart() {
    isTimelineScrubbingRef.current = true;
  }

  function handleTimelineScrubEnd(nextTimeSec: number) {
    isTimelineScrubbingRef.current = false;
    setCurrentTimeSec(nextTimeSec);
    setTimelineSeekSec(nextTimeSec);
  }

  return (
    <section className={`projectEditor ${setupBoardOpen ? '' : 'setupClosed'} ${inspectorOpen ? '' : 'inspectorClosed'}`} aria-label="Project editor" data-ui-region="editor-workspace">
      <ToolRail active={activeTool} onSelect={onActiveToolChange} />
      <EditorToolBoard activeTool={activeTool} project={project} fps={project.recording?.fps} currentTimeSec={currentTimeSec} background={background} aspectRatio={aspectRatio} disabled={isSaving} onProjectChange={onProjectChange} onBackgroundChange={updateBackground} onAspectRatioChange={updateAspectRatio} />
      <div className="stageColumn" aria-label="Central stage" data-ui-region="central-stage">
        <div className="projectHeader">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>{project.document.name}</h2>
          </div>
          {project.recording ? (
            <p className="meta">
              {project.recording.width}x{project.recording.height} · {project.recording.fps} fps · {project.recording.duration} frames
            </p>
          ) : null}
        </div>
        {project.mediaUrl ? (
          <VideoPreview project={project} seekTimeSec={timelineSeekSec} onCurrentTimeChange={setCurrentTimeSec} />
        ) : (
          <p>No recording asset found in this project.</p>
        )}
        <div className="timelineDock" aria-label="Timeline and review rail" data-ui-region="timeline-review-rail">
          <div className="timelineHeader">
          <p className="eyebrow"><Icon name="timeline" /> Timeline</p>
            <span>{formatClock(currentTimeSec)}</span>
          </div>
          {project.recording ? <VisualTimeline project={project} currentTimeSec={currentTimeSec} onScrub={handleTimelineScrub} onScrubStart={handleTimelineScrubStart} onScrubEnd={handleTimelineScrubEnd} /> : null}
        </div>
      </div>
      <aside className="inspector" aria-label="Export settings" data-ui-region="right-inspector">
        <div className="inspectorHeader">
          <p className="eyebrow"><Icon name="export" /> Export</p>
          <h2>Export</h2>
        </div>
        <section className="inspectorSection">
          <p className="eyebrow">Export</p>
          <label className="field">
            Export mode
            <select data-export-mode-select="true" value={exportMode} onChange={(event) => onExportModeChange(event.target.value as ExportMode)}>
              <option value="raw">Raw recording</option>
              <option value="styled">Styled canvas</option>
            </select>
          </label>
          <ExportPresetDetails mode={exportMode} />
          <div className="actionsArea" data-ui-region="export-actions-area">
            <button type="button" onClick={onExport} className="secondary exportButton" disabled={!project.recording}>
              Export MP4
            </button>
            {exportProgress ? <span className="exportProgress">{exportProgress.phase}: {Math.round(exportProgress.progress * 100)}%</span> : null}
            {exportResult ? <p className="saved">Exported to: {exportResult.outputPath} ({exportResult.bytes} bytes)</p> : null}
          </div>
        </section>
        {saveError ? <p className="error">{saveError}</p> : null}
      </aside>
    </section>
  );
}

function getPrimaryRecordingAsset(document: ProjectState['document']) {
  return document.assets?.find((asset) => asset.type === 'recording') ?? null;
}

function RangeField({ label, value, min, max, step, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="rangeField">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <output>{value}</output>
    </label>
  );
}

function VisualTimeline({ project, currentTimeSec, onScrub, onScrubStart, onScrubEnd }: { project: ProjectState; currentTimeSec: number; onScrub: (timeSec: number) => void; onScrubStart: () => void; onScrubEnd: (timeSec: number) => void }) {
  const model = buildTimelineModel({
    document: project.document as unknown as ProjectDocument,
    recording: project.recording,
    currentTimeSec,
    cameraMediaUrl: project.cameraMediaUrl,
  });

  function scrubFromInput(value: string) {
    const nextTime = Number(value);
    if (Number.isFinite(nextTime)) onScrub(nextTime);
  }

  function commitScrub(value: string) {
    const nextTime = Number(value);
    if (Number.isFinite(nextTime)) onScrubEnd(nextTime);
  }

  return (
    <div className="visualTimeline" aria-label="Timeline overview">
      <div className="timelineRuler" aria-hidden="true">
        {model.ticks.map((tick) => <span key={tick}>{formatClock(tick)}</span>)}
      </div>
      <div className="timelineTracks">
        <input
          aria-label="Scrub timeline"
          className="timelineScrubber"
          type="range"
          min="0"
          max={model.durationSec}
          step="0.1"
          value={model.currentTimeSec}
          onPointerDown={onScrubStart}
          onPointerUp={(event) => commitScrub(event.currentTarget.value)}
          onPointerCancel={(event) => commitScrub(event.currentTarget.value)}
          onKeyDown={onScrubStart}
          onKeyUp={(event) => commitScrub(event.currentTarget.value)}
          onInput={(event) => scrubFromInput(event.currentTarget.value)}
          onChange={(event) => scrubFromInput(event.currentTarget.value)}
        />
        <TimelineLane label="Screen" className="screenLane">
          {model.lanes.screen.map((region) => (
            <span key={region.id} className="clipBar" style={{ left: `${region.left}%`, width: `${region.width}%` }}>
              <span className="trimHandle trimHandleStart" aria-hidden="true" />
              <Icon name="frame" /> Clip
              <span className="trimHandle trimHandleEnd" aria-hidden="true" />
            </span>
          ))}
        </TimelineLane>
        <TimelineLane label="Zoom" className="zoomLane">
          {model.lanes.zoom.length > 0
            ? model.lanes.zoom.map((region) => <span key={region.id} className={`timelineRegion ${region.kind === 'auto' ? 'autoRegion' : 'manualRegion'}`} title={region.label} style={{ left: `${region.left}%`, width: `${region.width}%` }} />)
            : <p>No zoom markers yet.</p>}
        </TimelineLane>
        <TimelineLane label="Clicks" className="clickLane">
          {model.lanes.clicks.length > 0
            ? model.lanes.clicks.map((event) => <span key={event.id} className="clickMarker" style={{ left: `${event.left}%` }} />)
            : <p>No click events yet.</p>}
        </TimelineLane>
        <TimelineLane label="Camera" className="cameraLane">
          {model.lanes.camera.length > 0
            ? model.lanes.camera.map((region) => <span key={region.id} className="presenceRegion" style={{ left: `${region.left}%`, width: `${region.width}%` }}>Camera</span>)
            : <p>No camera track.</p>}
        </TimelineLane>
        <TimelineLane label="Audio" className="audioLane">
          {model.lanes.audio.length > 0
            ? model.lanes.audio.map((region) => <span key={region.id} className="presenceRegion" style={{ left: `${region.left}%`, width: `${region.width}%` }}>Audio</span>)
            : <p>No audio track.</p>}
        </TimelineLane>
        <span className="playhead" style={{ left: `${model.playheadPercent}%` }} />
      </div>
    </div>
  );
}

function TimelineLane({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  return (
    <div className={`timelineLane ${className}`} data-timeline-lane={label.toLowerCase()}>
      <span className="laneLabel">{label}</span>
      <div className="laneTrack">{children}</div>
    </div>
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

function AutoZoomSuggestionsPanel({
  project,
  onProjectChange,
}: {
  project: ProjectState;
  onProjectChange: (next: ProjectState) => void;
}) {
  const [suggestions, setSuggestions] = React.useState<ReadonlyArray<ZoomMarker>>([]);
  const [hasGenerated, setHasGenerated] = React.useState(false);
  const [conflictCount, setConflictCount] = React.useState(0);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const document = project.document as unknown as ProjectDocument;

  function handleGenerate() {
    setSaveError(null);
    const result = generateSuggestionsForProject(document);
    setSuggestions(result.filtered);
    setConflictCount(result.candidates.length - result.filtered.length);
    setHasGenerated(true);
  }

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

  async function handleApply(suggestion: ZoomMarker) {
    const nextDocument = applySuggestion(document, suggestion);
    if (nextDocument === document) return;
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    await persist(nextDocument);
  }

  function handleDiscard(suggestionId: ZoomMarker['id']) {
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
  }

  return (
    <div className="autoZoomSuggestionsPanel" aria-label="Auto-zoom suggestions">
      <div className="autoZoomHeader">
        <h3>Auto-zoom suggestions</h3>
        <button
          type="button"
          className="secondary compact"
          onClick={handleGenerate}
          disabled={isSaving}
        >
          {hasGenerated ? 'Regenerate suggestions' : 'Generate suggestions'}
        </button>
      </div>
      {!hasGenerated ? (
        <p className="autoZoomEmpty">
          Generate suggestions to see auto-zoom proposals derived from cursor activity.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="autoZoomEmpty">
          {conflictCount > 0
            ? `All cursor activity in this recording is already covered by ${conflictCount} existing zoom marker(s).`
            : 'No suggestions for this recording.'}
        </p>
      ) : (
        <>
          {conflictCount > 0 ? (
            <p className="autoZoomConflicts">
              {conflictCount} candidate(s) hidden — already covered by existing zoom markers.
            </p>
          ) : null}
          <ul className="autoZoomList">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="autoZoomRow">
                <span className="autoZoomRange">
                  {suggestion.startFrame}–{suggestion.endFrame} f · {Math.round(suggestion.strength * 100)}% · focal ({suggestion.focalPoint.x.toFixed(2)}, {suggestion.focalPoint.y.toFixed(2)})
                </span>
                <span className="autoZoomActions">
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => handleApply(suggestion)}
                    disabled={isSaving}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => handleDiscard(suggestion.id)}
                    disabled={isSaving}
                  >
                    Discard
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
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
      Styled preset: selected aspect ratio, full-screen fit, pastel background, rounded screen, soft shadow.
    </p>
  );
}

function VideoPreview({
  project,
  seekTimeSec,
  onCurrentTimeChange,
}: {
  project: ProjectState;
  seekTimeSec?: number;
  onCurrentTimeChange?: (sec: number) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pendingSeekRef = React.useRef<number | null>(null);
  const seekingRef = React.useRef(false);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const src = project.mediaUrl ?? '';
  const cameraSrc = project.cameraMediaUrl ?? '';
  const sourceWidth = project.recording?.width ?? 1920;
  const sourceHeight = project.recording?.height ?? 1080;
  const fps = project.recording?.fps ?? 30;
  const cameraSourceInFrames = (project.recording?.camera as { sourceInFrames?: number } | null | undefined)?.sourceInFrames ?? 0;
  const cameraSourceOffsetSec = Math.max(0, cameraSourceInFrames / fps);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const canvasResolution = getStyledCanvasResolution({ aspectRatio, sourceWidth, sourceHeight });
  const background = getPrimaryRecordingAsset(project.document)?.presentation?.background ?? DEFAULT_RECORDING_BACKGROUND;

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setError(null);
    pendingSeekRef.current = null;
    seekingRef.current = false;
  }, [src]);

  React.useEffect(() => {
    if (!Number.isFinite(seekTimeSec)) return;
    pendingSeekRef.current = seekTimeSec ?? 0;
    if (!seekingRef.current) flushPendingExternalSeek();
  }, [seekTimeSec, cameraSourceOffsetSec]);

  function flushPendingExternalSeek() {
    const video = videoRef.current;
    if (!video) return;
    const requestedTime = pendingSeekRef.current;
    if (requestedTime === null) {
      seekingRef.current = false;
      return;
    }
    const maxTime = video.duration || requestedTime;
    const nextTime = Math.max(0, Math.min(requestedTime, maxTime));
    pendingSeekRef.current = null;
    if (Math.abs(video.currentTime - nextTime) < 0.05) {
      seekingRef.current = false;
      return;
    }
    seekingRef.current = true;
    video.currentTime = nextTime;
    if (cameraVideoRef.current) cameraVideoRef.current.currentTime = nextTime + cameraSourceOffsetSec;
    setCurrentTime(nextTime);
  }

  function handleSeekSettled() {
    if (pendingSeekRef.current !== null) {
      flushPendingExternalSeek();
      return;
    }
    seekingRef.current = false;
  }

  // Per-frame canvas render loop: drawImage video + zoom transform + cursor.
  React.useEffect(() => {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const canvasWidth = canvasResolution.width;
    const canvasHeight = canvasResolution.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const screenPadding = Math.max(0, Math.min(background.bgPadding, Math.min(canvasWidth, canvasHeight) / 2 - 2));
    const maxVideoWidth = canvasWidth - screenPadding * 2;
    const maxVideoHeight = canvasHeight - screenPadding * 2;
    const screenScale = Math.min(maxVideoWidth / sourceWidth, maxVideoHeight / sourceHeight);
    const screenWidth = sourceWidth * screenScale;
    const screenHeight = sourceHeight * screenScale;
    const screenX = (canvasWidth - screenWidth) / 2;
    const screenY = (canvasHeight - screenHeight) / 2;
    const screenRadius = Math.max(0, Math.min(background.bgCornerRadius, Math.min(screenWidth, screenHeight) / 2));

    let rafId = 0;
    const document = project.document as unknown as ProjectDocument;
    const cursorEvents =
      ((document.assets?.[0] as { metadata?: { cursorEvents?: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> } } | undefined)?.metadata?.cursorEvents) ?? [];
    const recordingAssetId = (document.assets?.[0] as { id?: string } | undefined)?.id ?? null;
    // Wrap cursorAtFrame to satisfy resolveFrame's getCursorPosition contract:
    // returns normalized [0, 1] coordinates for the active recording asset,
    // null otherwise. The engine uses this to pan the focal point during
    // auto-marker holds (manual markers stay at their static focal).
    const getCursorPositionForFrame = (assetId: string, frame: number) => {
      if (!recordingAssetId || assetId !== recordingAssetId) return null;
      const sourcePoint = cursorAtFrame(cursorEvents, frame);
      if (!sourcePoint) return null;
      return {
        x: sourcePoint.x / sourceWidth,
        y: sourcePoint.y / sourceHeight,
      };
    };

    function tick() {
      if (!video || !canvas || !ctx) return;
      if (video.seeking || seekingRef.current || video.readyState < 2) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const currentFrame = Math.max(0, Math.round(video.currentTime * fps));
      let frame;
      try {
        frame = resolveFrame(document, currentFrame, {
          getCursorPosition: getCursorPositionForFrame,
        });
      } catch {
        // Fall back to identity when resolveFrame can't process the document
        // (e.g. partial state during initial load).
        frame = { cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 } };
      }
      const { scale, offsetX, offsetY } = frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
      const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      gradient.addColorStop(0, 'rgb(232, 235, 240)');
      gradient.addColorStop(1, 'rgb(240, 232, 232)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      if (background.bgShadowEnabled && background.bgShadowOpacity > 0 && background.bgShadowBlur > 0) {
        ctx.save();
        ctx.shadowColor = `rgba(0, 0, 0, ${background.bgShadowOpacity})`;
        ctx.shadowBlur = background.bgShadowBlur;
        ctx.shadowOffsetY = Math.min(34, Math.max(10, canvasHeight * 0.024));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
      ctx.clip();
      ctx.translate(screenX, screenY);
      ctx.scale(screenScale, screenScale);
      ctx.translate(sourceWidth / 2 + offsetX, sourceHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
      ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
      const cursor = cursorAtFrame(cursorEvents, currentFrame);
      if (cursor) drawCursorPath(ctx, cursor.x, cursor.y);
      ctx.restore();
      if (cameraVideo && cameraSrc && cameraVideo.readyState >= 2 && frame.cameraPresentation?.visible !== false) {
        const cameraFrame = resolveCameraFrame(frame.cameraFrame, frame.cameraPresentation, canvasWidth, canvasHeight);
        const cameraRadius = resolveCameraRadius(frame.cameraPresentation, cameraFrame);
        ctx.save();
        if (frame.cameraPresentation?.shadowEnabled !== false) {
          ctx.shadowColor = `rgba(0, 0, 0, ${frame.cameraPresentation?.shadowOpacity ?? 0.45})`;
          ctx.shadowBlur = frame.cameraPresentation?.shadowBlur ?? 24;
          ctx.shadowOffsetY = 8;
        }
        addRoundedRect(ctx, cameraFrame.x, cameraFrame.y, cameraFrame.w, cameraFrame.h, cameraRadius);
        ctx.clip();
        const cameraSource = coverSourceRect(
          cameraVideo.videoWidth,
          cameraVideo.videoHeight,
          cameraFrame.w,
          cameraFrame.h,
        );
        if (cameraSource) {
          ctx.drawImage(
            cameraVideo,
            cameraSource.sx,
            cameraSource.sy,
            cameraSource.sw,
            cameraSource.sh,
            cameraFrame.x,
            cameraFrame.y,
            cameraFrame.w,
            cameraFrame.h,
          );
        }
        ctx.restore();
      }
      rafId = window.requestAnimationFrame(tick);
    }
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, background, cameraSrc]);

  React.useEffect(() => {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo || !cameraSrc) return undefined;
    const syncCameraStart = () => {
      cameraVideo.currentTime = cameraSourceOffsetSec;
    };
    cameraVideo.addEventListener('loadedmetadata', syncCameraStart);
    if (cameraVideo.readyState >= 1) syncCameraStart();
    return () => cameraVideo.removeEventListener('loadedmetadata', syncCameraStart);
  }, [cameraSrc, cameraSourceOffsetSec]);

  async function togglePlayback() {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        if (cameraVideo) cameraVideo.currentTime = video.currentTime + cameraSourceOffsetSec;
        await video.play();
        await cameraVideo?.play().catch(() => undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video playback failed.');
      }
    } else {
      video.pause();
      cameraVideo?.pause();
    }
  }

  function seek(value: string) {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;
    video.currentTime = nextTime;
    if (cameraVideoRef.current) cameraVideoRef.current.currentTime = nextTime + cameraSourceOffsetSec;
    setCurrentTime(nextTime);
    onCurrentTimeChange?.(nextTime);
  }

  return (
    <div className="videoPreview styledPreview">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        className="hiddenSource"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setError(null);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onSeeked={handleSeekSettled}
        onError={(event) => setError(videoErrorMessage(event.currentTarget))}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime;
          setCurrentTime(next);
          onCurrentTimeChange?.(next);
        }}
      />
      {cameraSrc ? <video ref={cameraVideoRef} src={cameraSrc} preload="auto" className="hiddenSource" muted /> : null}
      <canvas
        ref={canvasRef}
        className="styledPreviewCanvas"
        aria-label="Styled preview"
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
      />
      <div className="videoControls" aria-label="Video playback controls">
        <button type="button" className="secondary compact" onClick={togglePlayback}>
          <Icon name={isPlaying ? 'pause' : 'play'} />
          <span className="visuallyHidden">{isPlaying ? 'Pause' : 'Play'}</span>
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

function resolveCameraFrame(
  normalizedFrame: { x: number; y: number; w: number; h: number } | undefined,
  presentation: { position?: string; size?: number } | undefined,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (normalizedFrame) {
    return {
      x: normalizedFrame.x * canvasWidth,
      y: normalizedFrame.y * canvasHeight,
      w: normalizedFrame.w * canvasWidth,
      h: normalizedFrame.h * canvasHeight,
    };
  }
  const sizeScale = Math.max(0.5, Math.min(2, (presentation?.size ?? 100) / 100));
  const width = Math.round(Math.min(canvasWidth, canvasHeight) * 0.22 * sizeScale);
  const height = width;
  const margin = Math.round(Math.min(canvasWidth, canvasHeight) * 0.06);
  const position = presentation?.position ?? 'corner-br';
  const left = position.endsWith('bl') || position.endsWith('tl');
  const top = position.endsWith('tl') || position.endsWith('tr');
  if (position === 'center') return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, w: width, h: height };
  return {
    x: left ? margin : canvasWidth - width - margin,
    y: top ? margin : canvasHeight - height - margin,
    w: width,
    h: height,
  };
}

function resolveCameraRadius(
  presentation: { shape?: string; roundness?: number } | undefined,
  frame: { w: number; h: number },
) {
  if (presentation?.shape === 'square') return 0;
  if (presentation?.shape === 'circle') return Math.min(frame.w, frame.h) / 2;
  return (Math.min(frame.w, frame.h) / 2) * Math.max(0, Math.min(1, (presentation?.roundness ?? 50) / 100));
}

function addRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
