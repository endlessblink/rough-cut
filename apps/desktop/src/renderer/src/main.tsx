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
      <section className="editorShell">
        <header className="topBar">
          <div>
            <p className="eyebrow">Rough Cut MVP</p>
            <h1>Recording studio</h1>
          </div>
          <div className="topActions">
            <button type="button" onClick={toggleRecording} className={recording.state === 'recording' ? 'stop' : ''} disabled={recordingActionPending}>
              {recordingActionPending ? (recording.state === 'recording' ? 'Stopping...' : 'Starting...') : recording.state === 'recording' ? 'Stop recording' : 'Record'}
            </button>
            <button type="button" onClick={openProject} className="secondary" disabled={recording.state === 'recording'}>
              Open project
            </button>
          </div>
        </header>
        <div className="recordingStrip" aria-label="Recording audio">
          <span>{statusLabel(recording, elapsedMs)}</span>
          <label className="audioToggle">
            <input
              type="checkbox"
              checked={recordMic}
              disabled={recording.state === 'recording' || micSources.length === 0}
              onChange={(event) => setRecordMic(event.currentTarget.checked)}
            />
            Mic
          </label>
          <select
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
          <label className="audioToggle">
            <input
              type="checkbox"
              checked={recordSystemAudio}
              disabled={recording.state === 'recording' || systemAudioSources.length === 0}
              onChange={(event) => setRecordSystemAudio(event.currentTarget.checked)}
            />
            System audio
          </label>
          <select
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
          <label className="audioToggle">
            <input
              type="checkbox"
              checked={recordCamera}
              disabled={recording.state === 'recording' || cameraSources.length === 0}
              onChange={(event) => setRecordCamera(event.currentTarget.checked)}
            />
            Camera
          </label>
          <select
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
          <label className="audioToggle">
            Target
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
        {recording.state === 'saved' ? (
          <>
            <p className="saved">Recording saved to: {recording.outputPath}</p>
            {recording.cameraError ? (
              <p className="warning">Camera was unavailable, so the screen recording was saved without webcam PiP: {recording.cameraError}</p>
            ) : null}
          </>
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
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const recordingAsset = getPrimaryRecordingAsset(project.document);
  const background = recordingAsset?.presentation?.background ?? createDefaultRecordingBackgroundStyle();

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
          ...createDefaultRecordingBackgroundStyle(),
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

  return (
    <section className="projectEditor" aria-label="Project editor">
      <div className="stageColumn">
        <div className="projectHeader">
          <div>
            <p className="eyebrow">Opened project</p>
            <h2>{project.document.name}</h2>
          </div>
          {project.recording ? (
            <p className="meta">
              {project.recording.width}x{project.recording.height} · {project.recording.fps} fps · {project.recording.duration} frames
            </p>
          ) : null}
        </div>
        {project.mediaUrl ? (
          <VideoPreview project={project} onCurrentTimeChange={setCurrentTimeSec} />
        ) : (
          <p>No recording asset found in this project.</p>
        )}
        <div className="timelineDock">
          {project.recording ? (
            <ZoomMarkerPanel
              project={project}
              fps={project.recording.fps}
              currentTimeSec={currentTimeSec}
              onProjectChange={onProjectChange}
            />
          ) : null}
          {project.recording ? (
            <AutoZoomSuggestionsPanel project={project} onProjectChange={onProjectChange} />
          ) : null}
        </div>
      </div>
      <aside className="inspector" aria-label="Presentation settings">
        <section className="inspectorSection">
          <p className="eyebrow">Canvas</p>
          <label className="field">
            Aspect ratio
            <select
              value={aspectRatio}
              onChange={(event) => updateAspectRatio(event.currentTarget.value as ProjectAspectRatio)}
              disabled={isSaving}
            >
              {PROJECT_ASPECT_RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {PROJECT_ASPECT_RATIO_LABELS[ratio]}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="inspectorSection">
          <p className="eyebrow">Screen</p>
          <RangeField label="Padding" value={background.bgPadding} min={0} max={260} step={4} disabled={isSaving} onChange={(value) => updateBackground({ bgPadding: value })} />
          <RangeField label="Round corners" value={background.bgCornerRadius} min={0} max={120} step={2} disabled={isSaving} onChange={(value) => updateBackground({ bgCornerRadius: value })} />
          <label className="toggleField">
            <input type="checkbox" checked={background.bgShadowEnabled} disabled={isSaving} onChange={(event) => updateBackground({ bgShadowEnabled: event.currentTarget.checked })} />
            Screen shadow
          </label>
          <RangeField label="Shadow size" value={background.bgShadowBlur} min={0} max={120} step={2} disabled={isSaving || !background.bgShadowEnabled} onChange={(value) => updateBackground({ bgShadowBlur: value })} />
        </section>
        <section className="inspectorSection mutedSection">
          <p className="eyebrow">Camera</p>
          <p>Webcam picture-in-picture is next. This pass fixes the screen presentation first.</p>
        </section>
        <section className="inspectorSection">
          <p className="eyebrow">Export</p>
          <label className="field">
            Export mode
            <select value={exportMode} onChange={(event) => onExportModeChange(event.target.value as ExportMode)}>
              <option value="raw">Raw recording</option>
              <option value="styled">Styled canvas</option>
            </select>
          </label>
          <ExportPresetDetails mode={exportMode} />
          <button type="button" onClick={onExport} className="secondary exportButton" disabled={!project.recording}>
            Export MP4
          </button>
          {exportProgress ? <span className="exportProgress">{exportProgress.phase}: {Math.round(exportProgress.progress * 100)}%</span> : null}
          {exportResult ? <p className="saved">Exported to: {exportResult.outputPath} ({exportResult.bytes} bytes)</p> : null}
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
  onCurrentTimeChange,
}: {
  project: ProjectState;
  onCurrentTimeChange?: (sec: number) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
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
  const background = getPrimaryRecordingAsset(project.document)?.presentation?.background ?? createDefaultRecordingBackgroundStyle();

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setError(null);
  }, [src]);

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
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
      }
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
      {cameraSrc ? <video ref={cameraVideoRef} src={cameraSrc} preload="metadata" className="hiddenSource" muted /> : null}
      <canvas
        ref={canvasRef}
        className="styledPreviewCanvas"
        aria-label="Styled preview"
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
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

function statusLabel(recording: RecordingStatus, elapsedMs: number) {
  if (recording.state === 'recording') {
    const extras = [recording.micSource ? 'mic' : null, recording.systemAudioSource ? 'system audio' : null, recording.cameraDevicePath ? 'camera' : null].filter(Boolean).join(' + ');
    return `Recording ${formatElapsed(elapsedMs)}${extras ? ` with ${extras}` : ''}`;
  }
  if (recording.state === 'saved') return 'Recording complete.';
  return 'Primary display. Optional mic, system audio, and V4L2 camera.';
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
