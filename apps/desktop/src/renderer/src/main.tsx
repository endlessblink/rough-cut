import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  createDefaultCameraPresentation,
  createDefaultRecordingBackgroundStyle,
  applyRecordingBackgroundPreset,
  getRecordingBackgroundColors,
  getStyledCanvasResolution,
  PROJECT_ASPECT_RATIO_LABELS,
  PROJECT_ASPECT_RATIOS,
  RECORDING_BACKGROUND_PRESETS,
  type ProjectAspectRatio,
  type ProjectDocument,
  type CameraPosition,
  type CameraPresentation,
  type CameraShape,
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
  updateMarkerRange,
  updateMarkerStrength,
  withDefaultPresentation,
} from './zoom-markers.mjs';
import { buildTimelineModel, frameRangeToPlacement } from './timeline-rail.mjs';
import { coverSourceRect, cursorAtFrame, drawClickEmphasis, drawCursorPath } from './styled-preview.mjs';
import { generateSuggestionsForProject } from './auto-zoom-suggestions.mjs';
import { addCutRange, clearCutRanges, listCutRanges, removeCutRange, visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      openEditor: (projectPath?: string | null) => Promise<void>;
      showItemInFolder: (path: string) => Promise<void>;
      openPath: (path: string) => Promise<string>;
      getMicSources: () => Promise<MicSource[]>;
      getSystemAudioSources: () => Promise<AudioSource[]>;
      getCameraSources: () => Promise<CameraSource[]>;
      getRecordingPreflightStatus: (options?: RecordingPreflightOptions) => Promise<RecordingPreflightStatus>;
      startRecording: (options?: { micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; captureRegion?: CaptureRegion | null; hideWindowDuringRecording?: boolean }) => Promise<RecordingStatus>;
      stopRecording: () => Promise<RecordingStatus>;
      cancelRecording: () => Promise<RecordingStatus>;
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
    composition: { duration: number; tracks?: Array<{ clips?: Array<{ assetId?: string; timelineIn?: number; timelineOut?: number; sourceIn?: number; sourceOut?: number } & Record<string, unknown>> } & Record<string, unknown>> };
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
type RecordingPreflightOptions = { recordMic: boolean; recordSystemAudio: boolean; recordCamera: boolean; micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; captureMode: CaptureMode; captureRegion?: CaptureRegion | null };
type RecordingPreflightCheck = { id: string; label: string; severity: 'ok' | 'warn' | 'critical'; detail: string };
type RecordingPreflightStatus = { status: 'ok' | 'warn' | 'critical'; checkedAt: string; recordingsDir: string; capture: { mode: CaptureMode; width: number; height: number; fps: number }; disk?: { freeBytes: number | null; severity: RecordingPreflightCheck['severity']; detail: string }; checks: RecordingPreflightCheck[] };
type InspectorGroupId = 'canvas' | 'recording' | 'screen' | 'zoom' | 'cursor' | 'camera' | 'export' | 'diagnostics';
type InspectorSelection = { group: InspectorGroupId; label: string; detail?: string; markerId?: string };
type PrimaryClip = { assetId?: string; timelineIn?: number; timelineOut?: number; sourceIn?: number; sourceOut?: number } & Record<string, unknown>;
type TrimInfo = { startFrame: number; endFrame: number; startSec: number; endSec: number; durationSec: number; isTrimmed: boolean };
type CutRange = { id: string; startFrame: number; endFrame: number };

type RecordingStatus =
  | { state: 'idle'; canceled?: boolean }
  | { state: 'recording'; startedAt: string; rawPath: string; outputPath: string; micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null }
  | {
      state: 'saved';
      startedAt: string;
      stoppedAt: string;
      rawPath: string;
      outputPath: string;
      cameraError?: string | null;
      diagnosticsPath?: string | null;
      project?: ProjectState;
    };

const DEFAULT_RECORDING_BACKGROUND = createDefaultRecordingBackgroundStyle();
const DEFAULT_CAMERA_PRESENTATION = createDefaultCameraPresentation();
const PRE_RECORD_PREFS_KEY = 'rough-cut.preRecordPreferences.v1';
const CAMERA_POSITION_OPTIONS: ReadonlyArray<{ value: CameraPosition; label: string }> = [
  { value: 'corner-br', label: 'Bottom right' },
  { value: 'corner-bl', label: 'Bottom left' },
  { value: 'corner-tr', label: 'Top right' },
  { value: 'corner-tl', label: 'Top left' },
  { value: 'center', label: 'Center' },
];
const CAMERA_SHAPE_OPTIONS: ReadonlyArray<{ value: CameraShape; label: string }> = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
];
const DEFAULT_INSPECTOR_SELECTION: InspectorSelection = {
  group: 'canvas',
  label: 'Project canvas',
  detail: 'Project-level presentation controls are active.',
};

type PreRecordPreferences = {
  recordMic: boolean;
  recordSystemAudio: boolean;
  recordCamera: boolean;
  micSource: string | null;
  systemAudioSource: string | null;
  cameraSource: string | null;
};

function readPreRecordPreferences(): PreRecordPreferences {
  const fallback: PreRecordPreferences = { recordMic: false, recordSystemAudio: false, recordCamera: false, micSource: null, systemAudioSource: null, cameraSource: null };
  try {
    const raw = window.localStorage.getItem(PRE_RECORD_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PreRecordPreferences>;
    return {
      recordMic: parsed.recordMic === true,
      recordSystemAudio: parsed.recordSystemAudio === true,
      recordCamera: parsed.recordCamera === true,
      micSource: typeof parsed.micSource === 'string' ? parsed.micSource : null,
      systemAudioSource: typeof parsed.systemAudioSource === 'string' ? parsed.systemAudioSource : null,
      cameraSource: typeof parsed.cameraSource === 'string' ? parsed.cameraSource : null,
    };
  } catch {
    return fallback;
  }
}

function writePreRecordPreferences(preferences: PreRecordPreferences) {
  try {
    window.localStorage.setItem(PRE_RECORD_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are a convenience; recording must not depend on storage availability.
  }
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isRecorderMode = searchParams.get('mode') === 'recorder';
  const initialPreRecordPreferences = React.useMemo(readPreRecordPreferences, []);
  const [version, setVersion] = React.useState<string>('loading');
  const [recording, setRecording] = React.useState<RecordingStatus>({ state: 'idle' });
  const [project, setProject] = React.useState<ProjectState | null>(null);
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);
  const [exportMode, setExportMode] = React.useState<ExportMode>('raw');
  const [micSources, setMicSources] = React.useState<MicSource[]>([]);
  const [systemAudioSources, setSystemAudioSources] = React.useState<AudioSource[]>([]);
  const [cameraSources, setCameraSources] = React.useState<CameraSource[]>([]);
  const [recordMic, setRecordMic] = React.useState(initialPreRecordPreferences.recordMic);
  const [recordSystemAudio, setRecordSystemAudio] = React.useState(initialPreRecordPreferences.recordSystemAudio);
  const [recordCamera, setRecordCamera] = React.useState(initialPreRecordPreferences.recordCamera);
  const [selectedMicSource, setSelectedMicSource] = React.useState<string>(initialPreRecordPreferences.micSource ?? '');
  const [selectedSystemAudioSource, setSelectedSystemAudioSource] = React.useState<string>(initialPreRecordPreferences.systemAudioSource ?? '');
  const [selectedCameraSource, setSelectedCameraSource] = React.useState<string>(initialPreRecordPreferences.cameraSource ?? '');
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>('display');
  const [captureRegion, setCaptureRegion] = React.useState<CaptureRegion>({ mode: 'region', x: 0, y: 0, width: 1280, height: 720 });
  const [recordingActionPending, setRecordingActionPending] = React.useState(false);
  const [preRecordPanelOpen, setPreRecordPanelOpen] = React.useState(isRecorderMode);
  const [setupBoardOpen, setSetupBoardOpen] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [activeTool, setActiveTool] = React.useState<ActiveTool>('background');
  const recordingActionPendingRef = React.useRef(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = React.useState<RecordingPreflightStatus | null>(null);

  React.useEffect(() => {
    window.roughCut.getVersion().then(setVersion).catch(() => setVersion('unknown'));
    window.roughCut.getRecordingStatus().then(setRecording).catch(() => undefined);
    window.roughCut.getMicSources()
      .then((sources) => {
        setMicSources(sources);
        const preferred = initialPreRecordPreferences.micSource;
        const nextSource = preferred && sources.some((source) => source.name === preferred) ? preferred : sources[0]?.name || '';
        setSelectedMicSource((current) => (sources.some((source) => source.name === current) ? current : nextSource));
        if (initialPreRecordPreferences.recordMic && !sources.some((source) => source.name === preferred)) setRecordMic(false);
      })
      .catch(() => setMicSources([]));
    window.roughCut.getSystemAudioSources()
      .then((sources) => {
        setSystemAudioSources(sources);
        const preferred = initialPreRecordPreferences.systemAudioSource;
        const nextSource = preferred && sources.some((source) => source.name === preferred) ? preferred : sources[0]?.name || '';
        setSelectedSystemAudioSource((current) => (sources.some((source) => source.name === current) ? current : nextSource));
        if (initialPreRecordPreferences.recordSystemAudio && !sources.some((source) => source.name === preferred)) setRecordSystemAudio(false);
      })
      .catch(() => setSystemAudioSources([]));
    window.roughCut.getCameraSources()
      .then((sources) => {
        setCameraSources(sources);
        const preferred = initialPreRecordPreferences.cameraSource;
        const nextSource = preferred && sources.some((source) => source.name === preferred) ? preferred : sources[0]?.name || '';
        setSelectedCameraSource((current) => (sources.some((source) => source.name === current) ? current : nextSource));
        if (initialPreRecordPreferences.recordCamera && !sources.some((source) => source.name === preferred)) setRecordCamera(false);
      })
      .catch(() => setCameraSources([]));
    return window.roughCut.onExportProgress(setExportProgress);
  }, []);

  React.useEffect(() => {
    writePreRecordPreferences({
      recordMic,
      recordSystemAudio,
      recordCamera,
      micSource: selectedMicSource || null,
      systemAudioSource: selectedSystemAudioSource || null,
      cameraSource: selectedCameraSource || null,
    });
  }, [recordMic, recordSystemAudio, recordCamera, selectedMicSource, selectedSystemAudioSource, selectedCameraSource]);

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
    const blurFocusedRangeBeforeWheel = () => {
      const active = window.document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'range') active.blur();
    };
    window.addEventListener('wheel', blurFocusedRangeBeforeWheel, { capture: true });
    return () => window.removeEventListener('wheel', blurFocusedRangeBeforeWheel, { capture: true });
  }, []);

  React.useEffect(() => {
    if (project?.recording?.camera) setExportMode('styled');
  }, [project?.recording?.camera]);

  React.useEffect(() => {
    if (recording.state === 'recording') setPreRecordPanelOpen(false);
  }, [recording.state]);

  React.useEffect(() => {
    if (!preRecordPanelOpen || recording.state === 'recording') return;
    let cancelled = false;
    const options = buildPreflightOptions({ recordMic, recordSystemAudio, recordCamera, selectedMicSource, selectedSystemAudioSource, selectedCameraSource, captureMode, captureRegion });
    window.roughCut.getRecordingPreflightStatus(options)
      .then((status) => {
        if (!cancelled) setPreflightStatus(status);
      })
      .catch(() => {
        if (!cancelled) setPreflightStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [preRecordPanelOpen, recording.state, recordMic, recordSystemAudio, recordCamera, selectedMicSource, selectedSystemAudioSource, selectedCameraSource, captureMode, captureRegion]);

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
          if (isRecorderMode) {
            window.setTimeout(() => {
              void window.roughCut.openEditor(stopped.project?.path ?? null);
            }, 1000);
          }
        } else if (stopped.state === 'saved') {
          console.warn('[renderer:recording] saved recording did not include a project payload', stopped);
        }
      } else {
        const micSource = recordMic ? selectedMicSource || null : null;
        const systemAudioSource = recordSystemAudio ? selectedSystemAudioSource || null : null;
        const cameraDevicePath = recordCamera ? selectedCameraSource || null : null;
        const region = captureMode === 'region' ? captureRegion : null;
        setPreRecordPanelOpen(false);
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        console.info(`[renderer:recording] start requested ${JSON.stringify({
          hasMic: Boolean(micSource),
          hasSystemAudio: Boolean(systemAudioSource),
          cameraDevicePath,
          captureMode,
          region,
        })}`);
        setRecording(await window.roughCut.startRecording({ micSource, systemAudioSource, cameraDevicePath, captureRegion: region, hideWindowDuringRecording: isRecorderMode }));
      }
    } catch (err) {
      console.error('[renderer:recording] recording action failed', err);
      setError(err instanceof Error ? err.message : 'Recording failed.');
      if (recording.state !== 'recording') setPreRecordPanelOpen(isRecorderMode);
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
    }
  }

  async function cancelRecording() {
    if (recordingActionPendingRef.current || recording.state !== 'recording') return;
    recordingActionPendingRef.current = true;
    setRecordingActionPending(true);
    setError(null);
    try {
      console.info('[renderer:recording] cancel requested');
      const canceled = await window.roughCut.cancelRecording();
      console.info(`[renderer:recording] cancel completed ${JSON.stringify(summarizeRecordingStatus(canceled))}`);
      setRecording(canceled);
      setProject(null);
      setExportResult(null);
      setPreRecordPanelOpen(isRecorderMode);
    } catch (err) {
      console.error('[renderer:recording] cancel failed', err);
      setError(err instanceof Error ? err.message : 'Cancel recording failed.');
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
    }
  }

  function openEditorFromRecorder() {
    if (isRecorderMode) {
      void window.roughCut.openEditor(null);
      return;
    }
    setPreRecordPanelOpen(false);
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

  async function exportProjectWithMode(mode: ExportMode = exportMode) {
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
      setExportMode(mode);
      const result = await window.roughCut.exportProject({ document: project.document, outputPath, mode });
      setExportResult(result);
      setExportProgress({ phase: 'complete', progress: 1 });
    } catch (err) {
      setExportProgress(null);
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  }

  async function openPath(path?: string | null) {
    if (!path) return;
    setError(null);
    try {
      const result = await window.roughCut.openPath(path);
      if (result) setError(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open path failed.');
    }
  }

  async function showItemInFolder(path?: string | null) {
    if (!path) return;
    setError(null);
    try {
      await window.roughCut.showItemInFolder(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open folder failed.');
    }
  }

  function startRetake() {
    setPreRecordPanelOpen(true);
    setRecording({ state: 'idle' });
    setExportResult(null);
  }

  if (isRecorderMode) {
    return (
      <main className="recordingLauncherShell">
        {recording.state === 'recording' ? (
          <RecordingLauncherActive elapsedMs={elapsedMs} actionPending={recordingActionPending} onStop={toggleRecording} onCancel={cancelRecording} />
        ) : (
          <PreRecordPanel
            micSources={micSources}
            systemAudioSources={systemAudioSources}
            cameraSources={cameraSources}
            recordMic={recordMic}
            recordSystemAudio={recordSystemAudio}
            recordCamera={recordCamera}
            selectedMicSource={selectedMicSource}
            selectedSystemAudioSource={selectedSystemAudioSource}
            selectedCameraSource={selectedCameraSource}
            captureMode={captureMode}
            captureRegion={captureRegion}
            preflightStatus={preflightStatus}
            actionPending={recordingActionPending}
            onClose={openEditorFromRecorder}
            onStart={toggleRecording}
            onRecordMicChange={setRecordMic}
            onRecordSystemAudioChange={setRecordSystemAudio}
            onRecordCameraChange={setRecordCamera}
            onSelectedMicSourceChange={setSelectedMicSource}
            onSelectedSystemAudioSourceChange={setSelectedSystemAudioSource}
            onSelectedCameraSourceChange={setSelectedCameraSource}
            onCaptureModeChange={setCaptureMode}
            onCaptureRegionChange={setCaptureRegion}
          />
        )}
        <StateBanner recording={recording} elapsedMs={elapsedMs} actionPending={recordingActionPending} error={error} />
      </main>
    );
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
            <button
              type="button"
              onClick={recording.state === 'recording' ? toggleRecording : () => setPreRecordPanelOpen(true)}
              className={recording.state === 'recording' ? 'stop primaryAction' : 'primaryAction'}
              disabled={recordingActionPending}
            >
              <Icon name={recording.state === 'recording' ? 'stop' : 'record'} />
              {recordingActionPending ? (recording.state === 'recording' ? 'Stopping...' : 'Starting...') : recording.state === 'recording' ? 'Stop recording' : 'Record'}
            </button>
            {recording.state === 'recording' ? (
              <button type="button" onClick={cancelRecording} className="secondary" disabled={recordingActionPending}>
                Cancel take
              </button>
            ) : null}
            <button type="button" onClick={openProject} className="secondary" disabled={recording.state === 'recording'}>
              <Icon name="folder" />
              Open project
            </button>
          </div>
        </header>
        {preRecordPanelOpen && recording.state !== 'recording' ? (
          <PreRecordPanel
            micSources={micSources}
            systemAudioSources={systemAudioSources}
            cameraSources={cameraSources}
            recordMic={recordMic}
            recordSystemAudio={recordSystemAudio}
            recordCamera={recordCamera}
            selectedMicSource={selectedMicSource}
            selectedSystemAudioSource={selectedSystemAudioSource}
            selectedCameraSource={selectedCameraSource}
            captureMode={captureMode}
            captureRegion={captureRegion}
            preflightStatus={preflightStatus}
            actionPending={recordingActionPending}
            onClose={openEditorFromRecorder}
            onStart={toggleRecording}
            onRecordMicChange={setRecordMic}
            onRecordSystemAudioChange={setRecordSystemAudio}
            onRecordCameraChange={setRecordCamera}
            onSelectedMicSourceChange={setSelectedMicSource}
            onSelectedSystemAudioSourceChange={setSelectedSystemAudioSource}
            onSelectedCameraSourceChange={setSelectedCameraSource}
            onCaptureModeChange={setCaptureMode}
            onCaptureRegionChange={setCaptureRegion}
          />
        ) : null}
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
            recording={recording}
            onProjectChange={setProject}
            onExportMode={exportProjectWithMode}
            onOpenPath={openPath}
            onShowItemInFolder={showItemInFolder}
            onRetake={startRetake}
            exportMode={exportMode}
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

function buildPreflightOptions({ recordMic, recordSystemAudio, recordCamera, selectedMicSource, selectedSystemAudioSource, selectedCameraSource, captureMode, captureRegion }: { recordMic: boolean; recordSystemAudio: boolean; recordCamera: boolean; selectedMicSource: string; selectedSystemAudioSource: string; selectedCameraSource: string; captureMode: CaptureMode; captureRegion: CaptureRegion }): RecordingPreflightOptions {
  return {
    recordMic,
    recordSystemAudio,
    recordCamera,
    micSource: recordMic ? selectedMicSource || null : null,
    systemAudioSource: recordSystemAudio ? selectedSystemAudioSource || null : null,
    cameraDevicePath: recordCamera ? selectedCameraSource || null : null,
    captureMode,
    captureRegion: captureMode === 'region' ? captureRegion : null,
  };
}

function PreRecordPanel({
  micSources,
  systemAudioSources,
  cameraSources,
  recordMic,
  recordSystemAudio,
  recordCamera,
  selectedMicSource,
  selectedSystemAudioSource,
  selectedCameraSource,
  captureMode,
  captureRegion,
  preflightStatus,
  actionPending,
  onClose,
  onStart,
  onRecordMicChange,
  onRecordSystemAudioChange,
  onRecordCameraChange,
  onSelectedMicSourceChange,
  onSelectedSystemAudioSourceChange,
  onSelectedCameraSourceChange,
  onCaptureModeChange,
  onCaptureRegionChange,
}: {
  micSources: MicSource[];
  systemAudioSources: AudioSource[];
  cameraSources: CameraSource[];
  recordMic: boolean;
  recordSystemAudio: boolean;
  recordCamera: boolean;
  selectedMicSource: string;
  selectedSystemAudioSource: string;
  selectedCameraSource: string;
  captureMode: CaptureMode;
  captureRegion: CaptureRegion;
  preflightStatus: RecordingPreflightStatus | null;
  actionPending: boolean;
  onClose: () => void;
  onStart: () => void;
  onRecordMicChange: (checked: boolean) => void;
  onRecordSystemAudioChange: (checked: boolean) => void;
  onRecordCameraChange: (checked: boolean) => void;
  onSelectedMicSourceChange: (source: string) => void;
  onSelectedSystemAudioSourceChange: (source: string) => void;
  onSelectedCameraSourceChange: (source: string) => void;
  onCaptureModeChange: (mode: CaptureMode) => void;
  onCaptureRegionChange: (region: CaptureRegion) => void;
}) {
  return (
    <div className="preRecordOverlay" data-ui-region="pre-record-panel" role="dialog" aria-modal="true" aria-labelledby="pre-record-title">
      <section className="preRecordPanel">
        <div className="preRecordHeader">
          <div>
            <p className="eyebrow">New recording</p>
            <h2 id="pre-record-title">Ready to record?</h2>
          </div>
          <button type="button" className="secondary compact" onClick={onClose} disabled={actionPending}>Cancel</button>
        </div>

        <div className="preRecordControls">
          <section className="preRecordSection">
            <ControlRow icon="display" label="Capture">
              <select value={captureMode} disabled={actionPending} onChange={(event) => onCaptureModeChange(event.currentTarget.value as CaptureMode)} aria-label="Capture target">
                <option value="display">Full display</option>
                <option value="region">Region</option>
              </select>
            </ControlRow>
            {captureMode === 'region' ? (
              <div className="regionControls preRecordRegion" aria-label="Pre-record capture region controls">
                <NumberField label="X" value={captureRegion.x} disabled={actionPending} onChange={(x) => onCaptureRegionChange({ ...captureRegion, x })} />
                <NumberField label="Y" value={captureRegion.y} disabled={actionPending} onChange={(y) => onCaptureRegionChange({ ...captureRegion, y })} />
                <NumberField label="W" value={captureRegion.width} min={2} disabled={actionPending} onChange={(width) => onCaptureRegionChange({ ...captureRegion, width })} />
                <NumberField label="H" value={captureRegion.height} min={2} disabled={actionPending} onChange={(height) => onCaptureRegionChange({ ...captureRegion, height })} />
              </div>
            ) : null}
          </section>

          <PreRecordSourceSelect icon="mic" label="Mic" enabled={recordMic} disabled={actionPending || micSources.length === 0} emptyLabel="No microphone" offLabel="No microphone" sources={micSources} value={selectedMicSource} onEnabledChange={onRecordMicChange} onValueChange={onSelectedMicSourceChange} />
          <PreRecordSourceSelect icon="volume" label="System" enabled={recordSystemAudio} disabled={actionPending || systemAudioSources.length === 0} emptyLabel="No system audio" offLabel="No system audio" sources={systemAudioSources} value={selectedSystemAudioSource} onEnabledChange={onRecordSystemAudioChange} onValueChange={onSelectedSystemAudioSourceChange} />
          <PreRecordSourceSelect icon="camera" label="Camera" enabled={recordCamera} disabled={actionPending || cameraSources.length === 0} emptyLabel="No camera" offLabel="No camera" sources={cameraSources} value={selectedCameraSource} onEnabledChange={onRecordCameraChange} onValueChange={onSelectedCameraSourceChange} />
        </div>

        {recordCamera && selectedCameraSource ? (
          <PreRecordCameraSetup source={cameraSources.find((source) => source.name === selectedCameraSource)} />
        ) : null}

        <PreflightSummary status={preflightStatus} />

        <div className="preRecordFooter">
          <div className="preRecordActions">
            <button type="button" className="secondary" onClick={onClose} disabled={actionPending} data-open-editor="pre-record">Open editor</button>
            <button type="button" className="primaryAction" onClick={onStart} disabled={actionPending} data-recording-start="pre-record">
              <Icon name="record" />
              {actionPending ? 'Starting...' : 'Start recording'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PreRecordCameraSetup({ source }: { source?: CameraSource }) {
  const label = source ? `${simplifySourceLabel(source.label || source.name, 'Camera')} · ${shortSourceId(source.name, 0)}` : 'Selected camera';
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [previewState, setPreviewState] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    async function startPreview() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setPreviewState('error');
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        const needle = (source?.label || source?.name || '').toLowerCase();
        const matchingDevice = devices.find((device) => device.kind === 'videoinput' && needle && (device.label.toLowerCase().includes(needle) || needle.includes(device.label.toLowerCase())));
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: matchingDevice ? { deviceId: { exact: matchingDevice.deviceId } } : true,
        });
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setPreviewState('ready');
      } catch (err) {
        console.warn('[renderer:camera-preview] failed to start preview', err);
        if (!cancelled) setPreviewState('error');
      }
    }

    void startPreview();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [source?.label, source?.name]);

  return (
    <section className="preRecordCameraSetup" data-ui-region="pre-record-camera-setup" aria-label="Camera PiP setup preview">
      <div>
        <p className="eyebrow">Camera PiP</p>
        <h3>{label}</h3>
        <p>Preview only. PiP style stays editable after recording.</p>
      </div>
      <div className={`cameraSetupPreview ${previewState}`} data-camera-preview-state={previewState}>
        <video ref={videoRef} muted autoPlay playsInline />
        {previewState !== 'ready' ? <span className="cameraSetupScreen" /> : null}
        <span className="cameraSetupBubble"><Icon name="camera" /></span>
        {previewState === 'loading' ? <span className="cameraSetupStatus">Opening camera...</span> : null}
        {previewState === 'error' ? <span className="cameraSetupStatus">Preview unavailable</span> : null}
      </div>
    </section>
  );
}

function RecordingLauncherActive({ elapsedMs, actionPending, onStop, onCancel }: { elapsedMs: number; actionPending: boolean; onStop: () => void; onCancel: () => void }) {
  return (
    <div className="preRecordOverlay" data-ui-region="recording-launcher-active">
      <section className="preRecordPanel recordingActivePanel">
        <div className="preRecordHeader">
          <div>
            <p className="eyebrow">Recording</p>
            <h2>{formatElapsed(elapsedMs)}</h2>
          </div>
          <span className="liveDot" aria-hidden="true" />
        </div>
        <button type="button" onClick={onStop} className="stop primaryAction" disabled={actionPending}>
          <Icon name="stop" />
          {actionPending ? 'Stopping...' : 'Stop recording'}
        </button>
        <button type="button" onClick={onCancel} className="secondary" disabled={actionPending}>
          Cancel and discard
        </button>
        <p className="recordingActiveHint">Pause is intentionally pending segment recording, so cancel removes the current take instead of saving a corrupt pause.</p>
      </section>
    </div>
  );
}

function ControlRow({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="preRecordInputRow">
      <span className="controlRowLabel"><Icon name={icon} /> {label}</span>
      {children}
    </div>
  );
}

function PreRecordSourceSelect<T extends { name: string; label: string; state?: string }>({ icon, label, enabled, disabled, emptyLabel, offLabel, sources, value, onEnabledChange, onValueChange }: { icon: IconName; label: string; enabled: boolean; disabled: boolean; emptyLabel: string; offLabel: string; sources: T[]; value: string; onEnabledChange: (checked: boolean) => void; onValueChange: (value: string) => void }) {
  return (
    <ControlRow icon={icon} label={label}>
      <select
        value={enabled ? value : '__off'}
        disabled={disabled && sources.length === 0}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (next === '__off') {
            onEnabledChange(false);
            return;
          }
          onEnabledChange(true);
          onValueChange(next);
        }}
        aria-label={`${label} source`}
      >
        <option value="__off">{offLabel}</option>
        {sources.length === 0 ? <option value="" disabled>{emptyLabel}</option> : null}
        {sources.map((source, index) => (
          <option key={source.name} value={source.name} title={source.label || source.name}>
            {formatSourceOptionLabel(source, sources, index, label)}
          </option>
        ))}
      </select>
    </ControlRow>
  );
}

function formatSourceOptionLabel<T extends { name: string; label: string; state?: string }>(source: T, sources: T[], index: number, groupLabel: string) {
  const base = simplifySourceLabel(source.label || source.name, groupLabel);
  const duplicateCount = sources.filter((candidate) => simplifySourceLabel(candidate.label || candidate.name, groupLabel) === base).length;
  const state = source.state && source.state.toLowerCase() === 'running' ? ' live' : '';
  if (duplicateCount > 1) return `${base} · ${shortSourceId(source.name, index)}${state}`;
  return `${base}${state}`;
}

function simplifySourceLabel(label: string, groupLabel: string) {
  const withoutPath = label.replace(/\s*\((?:\/dev\/)?[^)]*\)\s*$/u, '').trim();
  if (groupLabel === 'Camera') {
    return withoutPath.replace(/\s+Audio:\s*.*$/iu, '').trim() || 'Camera';
  }
  const normalized = withoutPath.toLowerCase();
  if (groupLabel === 'Mic') {
    if (normalized.includes('q2u')) return 'Q2U mic';
    if (normalized.includes('lenovo') || normalized.includes('webcam') || normalized.includes('sonix')) return 'Webcam mic';
    if (normalized.includes('pci-')) return 'Built-in mic';
    return withoutPath
      .replace(/^alsa input[. ]/iu, '')
      .replace(/^usb[- ]/iu, '')
      .replace(/\bSamson\b\s+\bSamson\b/iu, 'Samson')
      .replace(/\bTechnologies\b/iu, '')
      .replace(/\bTechnology Co\. Ltd\.?\b/iu, '')
      .replace(/\bMicrophone(?:-\d+)?\b/iu, 'Mic')
      .replace(/analog stereo/iu, '')
      .replace(/pci-\d+\s+\d+\s+/iu, '')
      .replace(/\s+/gu, ' ')
      .trim() || 'Microphone';
  }
  if (groupLabel === 'System') {
    if (normalized.includes('q2u')) return 'Q2U monitor';
    if (normalized.includes('hdmi')) return 'HDMI audio';
    if (normalized.includes('iec958') || normalized.includes('spdif')) return 'Digital audio';
    if (normalized.includes('analog-stereo') || normalized.includes('analog stereo')) return 'Speakers';
    return withoutPath
      .replace(/^alsa output[. ]/iu, '')
      .replace(/\.monitor$/iu, '')
      .replace(/\bmonitor\b/iu, '')
      .replace(/^usb[- ]/iu, '')
      .replace(/\bTechnologies\b/iu, '')
      .replace(/\bMicrophone(?:-\d+)?\b/iu, '')
      .replace(/analog stereo/iu, '')
      .replace(/pci-\d+\s+\d+\s+/iu, '')
      .replace(/\s+/gu, ' ')
      .trim() || 'System audio';
  }
  return withoutPath || label;
}

function shortSourceId(sourceName: string, index: number) {
  const videoMatch = sourceName.match(/\/dev\/(video\d+)/u);
  if (videoMatch?.[1]) return videoMatch[1];
  return `${index + 1}`;
}

function PreflightSummary({ status }: { status: RecordingPreflightStatus | null }) {
  const checks = status?.checks ?? [];
  const warnings = checks.filter((check) => check.severity !== 'ok');
  return (
    <section className={`preflightSummary ${status?.status ?? 'loading'}`} data-ui-region="recording-preflight-status" aria-live="polite">
      <div className="preflightHeader">
        <div>
          <p className="eyebrow">Preflight</p>
          <h3>{preflightTitle(status)}</h3>
        </div>
        {status ? <span>{status.capture.width || 'unknown'} x {status.capture.height || 'unknown'} @ {status.capture.fps} FPS</span> : <span>Checking...</span>}
      </div>
      <div className="preflightGrid">
        {status ? checks.map((check) => (
          <div key={check.id} className={`preflightCheck ${check.severity}`}>
            <strong>{check.label}</strong>
            <span>{check.detail}</span>
          </div>
        )) : <p className="recordingActiveHint">Checking session, tools, save destination, and optional sources.</p>}
      </div>
      <p className={warnings.length > 0 ? 'preflightWarning' : 'recordingActiveHint'}>Warnings are visible for this take, but optional mic, system audio, and camera problems will not block safe screen-only recording.</p>
    </section>
  );
}

function preflightTitle(status: RecordingPreflightStatus | null) {
  if (!status) return 'Checking recording readiness...';
  if (status.status === 'critical') return 'Critical setup issue detected';
  if (status.status === 'warn') return 'Ready with visible risks';
  return 'Ready for a long recording';
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

function BoardHeader({ icon, title, action, onAction, actionDisabled = false }: { icon: IconName; title: string; action?: string; onAction?: () => void; actionDisabled?: boolean }) {
  return (
    <div className="boardHeader">
      <span><Icon name={icon} /> {title}</span>
      {action ? <button type="button" className="textButton" disabled={actionDisabled} onClick={onAction}>{action}</button> : null}
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

function InspectorSection({ id, title, children, description, muted = false }: { id: InspectorGroupId | string; title: string; children: React.ReactNode; description?: string; muted?: boolean }) {
  return (
    <section className={`inspectorSection ${muted ? 'mutedSection' : ''}`} data-inspector-group={id}>
      <p className="eyebrow">{title}</p>
      {description ? <p className="inspectorHelp">{description}</p> : null}
      {children}
    </section>
  );
}

function InspectorSelect<T extends string>({ label, value, options, disabled = false, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; disabled?: boolean; onChange: (value: T) => void }) {
  return (
    <label className="field inspectorField">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function InspectorSlider({ label, value, min, max, step, disabled = false, onChange }: { label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <RangeField label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange} />;
}

function InspectorToggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggleField inspectorToggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      {label}
    </label>
  );
}

function InspectorPresetGrid({ label, disabled = false, value, onSelect }: { label: string; disabled?: boolean; value?: string; onSelect?: (id: string) => void }) {
  return (
    <div className="inspectorPresetGroup">
      <p className="eyebrow">{label}</p>
      <div className="swatchGrid" aria-label={label}>
        {RECORDING_BACKGROUND_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            aria-label={preset.label}
            aria-pressed={value === preset.id}
            className={value === preset.id ? 'active' : ''}
            disabled={disabled}
            style={{ background: preset.style.bgImage ? `center / cover url(${preset.style.bgImage})` : (preset.style.bgGradient ?? preset.style.bgColor) }}
            onClick={() => onSelect?.(preset.id)}
          />
        ))}
      </div>
    </div>
  );
}

function InspectorActionRow({ children, region }: { children: React.ReactNode; region?: string }) {
  return <div className="actionsArea inspectorActionRow" data-ui-region={region}>{children}</div>;
}

function InspectorNotice({ children }: { children: React.ReactNode }) {
  return <p className="inspectorNotice">{children}</p>;
}

function InspectorContextSummary({ selection }: { selection: InspectorSelection }) {
  return (
    <div className="inspectorContext" data-inspector-context={selection.group}>
      <p className="eyebrow">Selected context</p>
      <strong>{selection.label}</strong>
      {selection.detail ? <span>{selection.detail}</span> : null}
    </div>
  );
}

function EditorToolBoard({ activeTool, project, fps, currentTimeSec = 0, background, cameraPresentation, hasCamera = false, aspectRatio = 'auto', disabled = false, inspectorSelection = DEFAULT_INSPECTOR_SELECTION, selectedZoomMarker = null, trimInfo, cutRanges = [], pendingCutStartFrame = null, onProjectChange, onBackgroundChange, onCameraPresentationChange, onAspectRatioChange, onZoomMarkerRangeChange, onZoomMarkerStrengthChange, onSetTrimStart, onSetTrimEnd, onResetTrim, onMarkCutStart, onCutToPlayhead, onRemoveCutRange, onClearCutRanges }: { activeTool: ActiveTool; project?: ProjectState; fps?: number; currentTimeSec?: number; background?: RecordingBackgroundStyle; cameraPresentation?: CameraPresentation; hasCamera?: boolean; aspectRatio?: ProjectAspectRatio; disabled?: boolean; inspectorSelection?: InspectorSelection; selectedZoomMarker?: ZoomMarker | null; trimInfo?: TrimInfo; cutRanges?: CutRange[]; pendingCutStartFrame?: number | null; onProjectChange?: (next: ProjectState) => void; onBackgroundChange?: (patch: Partial<RecordingBackgroundStyle>) => void; onCameraPresentationChange?: (patch: Partial<CameraPresentation>) => void; onAspectRatioChange?: (ratio: ProjectAspectRatio) => void; onZoomMarkerRangeChange?: (markerId: string, startFrame: number, endFrame: number) => void; onZoomMarkerStrengthChange?: (markerId: string, strength: number) => void; onSetTrimStart?: () => void; onSetTrimEnd?: () => void; onResetTrim?: () => void; onMarkCutStart?: () => void; onCutToPlayhead?: () => void; onRemoveCutRange?: (cutRangeId: string) => void; onClearCutRanges?: () => void }) {
  const bg = background ?? DEFAULT_RECORDING_BACKGROUND;
  const camera = cameraPresentation ?? DEFAULT_CAMERA_PRESENTATION;
  const aspectRatioOptions = PROJECT_ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: PROJECT_ASPECT_RATIO_LABELS[ratio] }));
  const activeBackgroundPreset = RECORDING_BACKGROUND_PRESETS.find((preset) => preset.style.bgImage ? preset.style.bgImage === bg.bgImage : (preset.style.bgColor === bg.bgColor && preset.style.bgGradient === bg.bgGradient))?.id;
  const markerCount = project?.recording ? listMarkers(project.document as unknown as ProjectDocument).length : 0;

  if (activeTool === 'timeline') {
    return (
      <aside className="setupBoard" aria-label="Timeline board">
        <BoardHeader icon="timeline" title="Timeline" />
        {project?.recording && fps && onProjectChange ? (
          <div className="timelineBoardStack" data-ui-region="timeline-zoom-control-panel">
            <div className="timelineCompactRow"><span>Playhead</span><strong>{formatClock(currentTimeSec)}</strong></div>
            <ZoomMarkerPanel project={project} fps={fps} currentTimeSec={currentTimeSec} markerCount={markerCount} onProjectChange={onProjectChange} />
            <AutoZoomSuggestionsPanel project={project} onProjectChange={onProjectChange} />
          </div>
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
        <InspectorContextSummary selection={inspectorSelection} />
        <InspectorSection id="canvas" title="Canvas">
          <InspectorSelect label="Aspect ratio" value={aspectRatio} options={aspectRatioOptions} disabled={disabled} onChange={(value) => onAspectRatioChange?.(value)} />
        </InspectorSection>
        <InspectorSection id="screen" title="Screen">
          <InspectorSlider label="Padding" value={bg.bgPadding} min={0} max={260} step={4} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgPadding: value })} />
          <InspectorSlider label="Round corners" value={bg.bgCornerRadius} min={0} max={120} step={2} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgCornerRadius: value })} />
          <InspectorToggle label="Screen shadow" checked={bg.bgShadowEnabled} disabled={disabled} onChange={(checked) => onBackgroundChange?.({ bgShadowEnabled: checked })} />
          <InspectorSlider label="Shadow size" value={bg.bgShadowBlur} min={0} max={120} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowBlur: value })} />
        </InspectorSection>
        <InspectorSection id="recording" title="Recording" description="Head and tail trims keep the original source recording untouched.">
          <div className="trimSummary" data-trim-summary="true">
            <span>Start {formatClock(trimInfo?.startSec ?? 0)}</span>
            <span>End {formatClock(trimInfo?.endSec ?? 0)}</span>
            <span>Duration {formatClock(trimInfo?.durationSec ?? 0)}</span>
          </div>
          <InspectorActionRow>
            <button type="button" className="secondary compact" disabled={disabled || !trimInfo} onClick={onSetTrimStart}>Set start to playhead</button>
            <button type="button" className="secondary compact" disabled={disabled || !trimInfo} onClick={onSetTrimEnd}>Set end to playhead</button>
            <button type="button" className="secondary compact" disabled={disabled || !trimInfo || !trimInfo.isTrimmed} onClick={onResetTrim}>Reset trim</button>
          </InspectorActionRow>
          <div className="cutRangePanel" data-cut-range-panel="true">
            <div className="timelineCompactRow"><span>Cuts</span><strong>{cutRanges.length}</strong></div>
            {pendingCutStartFrame !== null ? <p className="inspectorNotice">Cut start marked at {formatClock((pendingCutStartFrame - (trimInfo?.startFrame ?? 0)) / (fps || 30))}.</p> : null}
            <InspectorActionRow>
              <button type="button" className="secondary compact" disabled={disabled || !trimInfo} onClick={onMarkCutStart}>Mark cut start</button>
              <button type="button" className="secondary compact" disabled={disabled || !trimInfo || pendingCutStartFrame === null} onClick={onCutToPlayhead}>Cut to playhead</button>
              <button type="button" className="secondary compact" disabled={disabled || cutRanges.length === 0} onClick={onClearCutRanges}>Clear cuts</button>
            </InspectorActionRow>
            {cutRanges.length > 0 ? (
              <ul className="cutRangeList">
                {cutRanges.map((range) => (
                  <li key={range.id} className="cutRangeRow">
                    <span>{formatClock((range.startFrame - (trimInfo?.startFrame ?? 0)) / (fps || 30))}–{formatClock((range.endFrame - (trimInfo?.startFrame ?? 0)) / (fps || 30))}</span>
                    <button type="button" className="secondary compact" disabled={disabled} onClick={() => onRemoveCutRange?.(range.id)}>Restore</button>
                  </li>
                ))}
              </ul>
            ) : <p className="inspectorNotice">No removed middle ranges.</p>}
          </div>
        </InspectorSection>
        <InspectorSection id="zoom" title="Zoom" muted={!selectedZoomMarker}>
          <div data-zoom-controls="true">
            <InspectorSlider label="Start frame" value={selectedZoomMarker?.startFrame ?? 0} min={0} max={Math.max(1, project?.recording?.duration ?? 1)} step={1} disabled={disabled || !selectedZoomMarker} onChange={(value) => selectedZoomMarker ? onZoomMarkerRangeChange?.(selectedZoomMarker.id, value, selectedZoomMarker.endFrame) : undefined} />
            <InspectorSlider label="End frame" value={selectedZoomMarker?.endFrame ?? 0} min={0} max={Math.max(1, project?.recording?.duration ?? 1)} step={1} disabled={disabled || !selectedZoomMarker} onChange={(value) => selectedZoomMarker ? onZoomMarkerRangeChange?.(selectedZoomMarker.id, selectedZoomMarker.startFrame, value) : undefined} />
            <InspectorSlider label="Depth" value={Math.round((selectedZoomMarker?.strength ?? 0) * 100)} min={0} max={100} step={5} disabled={disabled || !selectedZoomMarker} onChange={(value) => selectedZoomMarker ? onZoomMarkerStrengthChange?.(selectedZoomMarker.id, value / 100) : undefined} />
          </div>
        </InspectorSection>
        <InspectorSection id="cursor" title="Cursor" muted>
          <InspectorNotice>Cursor style controls are planned for TASK-044.</InspectorNotice>
        </InspectorSection>
        <InspectorSection id="camera" title="Camera" muted={!hasCamera} description={hasCamera ? 'Camera PiP settings are saved with the project and used by styled export.' : undefined}>
          {hasCamera ? (
            <div data-camera-pip-controls="true">
              <InspectorToggle label="Show camera" checked={camera.visible} disabled={disabled} onChange={(visible) => onCameraPresentationChange?.({ visible })} />
              <InspectorSelect label="Position" value={camera.position} options={CAMERA_POSITION_OPTIONS} disabled={disabled || !camera.visible} onChange={(position) => onCameraPresentationChange?.({ position })} />
              <InspectorSelect label="Shape" value={camera.shape} options={CAMERA_SHAPE_OPTIONS} disabled={disabled || !camera.visible} onChange={(shape) => onCameraPresentationChange?.({ shape })} />
              <InspectorSlider label="Camera size" value={camera.size} min={50} max={200} step={5} disabled={disabled || !camera.visible} onChange={(size) => onCameraPresentationChange?.({ size })} />
              <InspectorSlider label="Camera roundness" value={camera.roundness} min={0} max={100} step={5} disabled={disabled || !camera.visible || camera.shape !== 'rounded'} onChange={(roundness) => onCameraPresentationChange?.({ roundness })} />
            </div>
          ) : <InspectorNotice>No linked webcam track in this project.</InspectorNotice>}
        </InspectorSection>
        <InspectorSection id="diagnostics" title="Diagnostics" muted>
          <InspectorNotice>Save failures and degraded media states appear here when available.</InspectorNotice>
        </InspectorSection>
      </aside>
    );
  }

  return (
    <aside className="setupBoard" aria-label="Background board">
      <BoardHeader icon="sparkle" title="Background" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.(DEFAULT_RECORDING_BACKGROUND)} />
      <InspectorSection id="canvas-background" title="Canvas background">
        <InspectorPresetGrid label="Background presets" disabled={disabled} value={activeBackgroundPreset} onSelect={(presetId) => onBackgroundChange?.(applyRecordingBackgroundPreset(bg, presetId))} />
      </InspectorSection>
      <BoardHeader icon="frame" title="Frame" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.({ bgPadding: DEFAULT_RECORDING_BACKGROUND.bgPadding, bgCornerRadius: DEFAULT_RECORDING_BACKGROUND.bgCornerRadius, bgInset: DEFAULT_RECORDING_BACKGROUND.bgInset, bgInsetColor: DEFAULT_RECORDING_BACKGROUND.bgInsetColor })} />
      <InspectorSection id="screen-frame" title="Frame">
        <InspectorSlider label="Outline" value={bg.bgInset} min={0} max={16} step={1} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgInset: value })} />
        <InspectorSlider label="Radius" value={bg.bgCornerRadius} min={0} max={120} step={2} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgCornerRadius: value })} />
        <InspectorSlider label="Padding" value={bg.bgPadding} min={0} max={260} step={4} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgPadding: value })} />
      </InspectorSection>
      <BoardHeader icon="frame" title="Shadow" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.({ bgShadowEnabled: DEFAULT_RECORDING_BACKGROUND.bgShadowEnabled, bgShadowBlur: DEFAULT_RECORDING_BACKGROUND.bgShadowBlur, bgShadowOpacity: DEFAULT_RECORDING_BACKGROUND.bgShadowOpacity, bgShadowOffsetY: DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY })} />
      <InspectorSection id="screen-shadow" title="Shadow">
        <InspectorToggle label="Enable shadow" checked={bg.bgShadowEnabled} disabled={disabled} onChange={(checked) => onBackgroundChange?.({ bgShadowEnabled: checked })} />
        <InspectorSlider label="Strength" value={bg.bgShadowOpacity} min={0} max={0.8} step={0.05} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowOpacity: value })} />
        <InspectorSlider label="Softness" value={bg.bgShadowBlur} min={0} max={140} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowBlur: value })} />
        <InspectorSlider label="Distance" value={bg.bgShadowOffsetY ?? DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY ?? 34} min={0} max={120} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowOffsetY: value })} />
      </InspectorSection>
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

function PostRecordingReview({ project, recording, exportProgress, onExportMode, onOpenProject, onOpenRecordingFolder, onOpenDiagnostics, onRetake }: { project: ProjectState; recording: RecordingStatus; exportProgress: ExportProgress | null; onExportMode: (mode: ExportMode) => void; onOpenProject: () => void; onOpenRecordingFolder: () => void; onOpenDiagnostics: () => void; onRetake: () => void }) {
  const isFreshRecording = recording.state === 'saved' && recording.project?.path === project.path;
  const diagnosticsAvailable = recording.state === 'saved' && Boolean(recording.diagnosticsPath);
  const cameraWarning = recording.state === 'saved' ? recording.cameraError : getProjectCameraWarning(project);

  return (
    <section className="reviewWorkspace" data-ui-region="post-recording-review" aria-label="Post-recording review">
      <div className="reviewStatusCard">
        <p className="eyebrow">{isFreshRecording ? 'Saved take' : 'Project'}</p>
        <h3>{isFreshRecording ? 'Saved and ready' : 'Ready'}</h3>
        <p>{project.recording ? `${project.recording.width}x${project.recording.height} · ${project.recording.fps} fps` : 'No recording media linked.'}</p>
      </div>
      {cameraWarning ? (
        <div className="reviewWarning" data-review-warning="camera">
          <strong>Screen recording preserved</strong>
          <span>Camera finalization failed, so this take was saved without webcam PiP: {cameraWarning}</span>
        </div>
      ) : null}
      <div className="reviewActions" data-ui-region="post-recording-actions">
        <button type="button" className="primaryAction" data-export-action="styled" onClick={() => onExportMode('styled')} disabled={!project.recording || Boolean(exportProgress)}>
          <Icon name="export" /> Export styled
        </button>
        <button type="button" className="secondary" data-export-action="raw" onClick={() => onExportMode('raw')} disabled={!project.recording || Boolean(exportProgress)}>
          <Icon name="display" /> Export raw
        </button>
        <button type="button" className="secondary" onClick={onOpenRecordingFolder} disabled={!project.recording?.filePath}><Icon name="folder" /> Folder</button>
        <button type="button" className="secondary" onClick={onOpenDiagnostics} disabled={!diagnosticsAvailable}><Icon name="settings" /> Diagnostics</button>
        <button type="button" className="secondary" onClick={onOpenProject}><Icon name="folder" /> Project</button>
        <button type="button" className="secondary" onClick={onRetake}><Icon name="record" /> New</button>
      </div>
      <p className="reviewSafetyCopy">New keeps this take.</p>
    </section>
  );
}

function getProjectCameraWarning(project: ProjectState) {
  const metadata = getPrimaryRecordingAsset(project.document)?.metadata;
  const cameraError = metadata && typeof metadata === 'object' && 'cameraError' in metadata ? metadata.cameraError : null;
  return typeof cameraError === 'string' && cameraError.trim().length > 0 ? cameraError : null;
}

function ProjectPreview({
  project,
  recording,
  onProjectChange,
  onExportMode,
  onOpenPath,
  onShowItemInFolder,
  onRetake,
  exportProgress,
  exportResult,
  exportMode,
  setupBoardOpen,
  inspectorOpen,
  activeTool,
  onActiveToolChange,
}: {
  project: ProjectState;
  recording: RecordingStatus;
  onProjectChange: (next: ProjectState) => void;
  onExportMode: (mode: ExportMode) => void;
  onOpenPath: (path?: string | null) => void;
  onShowItemInFolder: (path?: string | null) => void;
  onRetake: () => void;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  exportMode: ExportMode;
  setupBoardOpen: boolean;
  inspectorOpen: boolean;
  activeTool: ActiveTool;
  onActiveToolChange: (tool: ActiveTool) => void;
}) {
  const [currentTimeSec, setCurrentTimeSec] = React.useState(0);
  const [timelineSeekSec, setTimelineSeekSec] = React.useState(0);
  const [inspectorSelection, setInspectorSelection] = React.useState<InspectorSelection>(DEFAULT_INSPECTOR_SELECTION);
  const [pendingCutStartFrame, setPendingCutStartFrame] = React.useState<number | null>(null);
  const isTimelineScrubbingRef = React.useRef(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const recordingAsset = getPrimaryRecordingAsset(project.document);
  const primaryClip = getPrimaryRecordingClip(project.document, recordingAsset?.id);
  const trimInfo = resolveTrimInfo(primaryClip, project.recording?.duration ?? project.document.composition.duration, project.recording?.fps ?? 30);
  const cutRanges = recordingAsset?.id && project.recording ? listCutRanges(project.document as unknown as ProjectDocument, recordingAsset.id, project.recording.duration) as CutRange[] : [];
  const activeCutRanges = clipCutRangesToTrim(cutRanges, trimInfo);
  const background = recordingAsset?.presentation?.background ?? DEFAULT_RECORDING_BACKGROUND;
  const selectedZoomMarker = inspectorSelection.markerId ? listMarkers(project.document as unknown as ProjectDocument).find((marker) => marker.id === inspectorSelection.markerId) ?? null : null;
  const hasCamera = Boolean(recordingAsset?.cameraAssetId && project.cameraMediaUrl);
  const cameraPresentation: CameraPresentation = {
    ...DEFAULT_CAMERA_PRESENTATION,
    ...((recordingAsset?.presentation?.camera as Partial<CameraPresentation> | undefined) ?? {}),
  };

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

  async function updateCameraPresentation(patch: Partial<CameraPresentation>) {
    if (!recordingAsset?.id || !hasCamera) return;
    await persist({
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation);
        const nextCamera: CameraPresentation = {
          ...DEFAULT_CAMERA_PRESENTATION,
          ...(presentation.camera ?? {}),
          ...patch,
        };
        return {
          ...asset,
          presentation: {
            ...presentation,
            camera: nextCamera,
          },
        };
      }),
    });
  }

  async function updateTrim(nextStartFrame: number, nextEndFrame: number) {
    if (!recordingAsset?.id || !project.recording) return;
    const totalFrames = Math.max(1, project.recording.duration);
    const startFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(nextStartFrame)));
    const endFrame = Math.max(startFrame + 1, Math.min(totalFrames, Math.round(nextEndFrame)));
    const durationFrames = endFrame - startFrame;
    const cameraOffset = Math.max(0, Math.round((project.recording.camera as { sourceInFrames?: number } | undefined)?.sourceInFrames ?? 0));
    await persist({
      ...project.document,
      composition: {
        ...project.document.composition,
        duration: durationFrames,
        tracks: project.document.composition.tracks?.map((track) => ({
          ...track,
          clips: track.clips?.map((clip) => {
            if (clip.assetId === recordingAsset.id) {
              return { ...clip, timelineIn: 0, timelineOut: durationFrames, sourceIn: startFrame, sourceOut: endFrame };
            }
            if (recordingAsset.cameraAssetId && clip.assetId === recordingAsset.cameraAssetId) {
              return { ...clip, timelineIn: 0, timelineOut: durationFrames, sourceIn: cameraOffset + startFrame, sourceOut: cameraOffset + endFrame };
            }
            return clip;
          }),
        })),
      },
    });
    setCurrentTimeSec(Math.min(currentTimeSec, durationFrames / (project.recording.fps || 30)));
  }

  function setTrimStartToPlayhead() {
    if (!project.recording) return;
    updateTrim(Math.round(currentTimeSec * project.recording.fps), trimInfo.endFrame);
  }

  function setTrimEndToPlayhead() {
    if (!project.recording) return;
    updateTrim(trimInfo.startFrame, Math.round(currentTimeSec * project.recording.fps));
  }

  function resetTrim() {
    if (!project.recording) return;
    updateTrim(0, project.recording.duration);
  }

  function currentSourceFrame() {
    if (!project.recording) return trimInfo.startFrame;
    const visibleFrame = Math.round(currentTimeSec * project.recording.fps);
    return trimInfo.startFrame + visibleFrameToSourceFrame(toTrimRelativeCutRanges(activeCutRanges, trimInfo), visibleFrame, trimInfo.endFrame - trimInfo.startFrame);
  }

  function markCutStart() {
    setPendingCutStartFrame(currentSourceFrame());
  }

  async function cutToPlayhead() {
    if (!recordingAsset?.id || !project.recording || pendingCutStartFrame === null) return;
    const nextFrame = currentSourceFrame();
    if (Math.abs(nextFrame - pendingCutStartFrame) < 1) return;
    const nextDocument = addCutRange(project.document as unknown as ProjectDocument, recordingAsset.id, pendingCutStartFrame, nextFrame, project.recording.duration) as unknown as ProjectState['document'];
    setPendingCutStartFrame(null);
    await persist(nextDocument);
  }

  async function restoreCut(cutRangeId: string) {
    if (!recordingAsset?.id || !project.recording) return;
    const nextDocument = removeCutRange(project.document as unknown as ProjectDocument, recordingAsset.id, cutRangeId, project.recording.duration) as unknown as ProjectState['document'];
    await persist(nextDocument);
  }

  async function clearCuts() {
    if (!recordingAsset?.id) return;
    const nextDocument = clearCutRanges(project.document as unknown as ProjectDocument, recordingAsset.id) as unknown as ProjectState['document'];
    await persist(nextDocument);
  }

  async function updateZoomMarkerRange(markerId: string, startFrame: number, endFrame: number) {
    const nextDocument = updateMarkerRange(project.document as unknown as ProjectDocument, markerId, startFrame, endFrame) as unknown as ProjectState['document'];
    if (nextDocument === project.document) return;
    await persist(nextDocument);
  }

  async function updateZoomMarkerStrength(markerId: string, strength: number) {
    const nextDocument = updateMarkerStrength(project.document as unknown as ProjectDocument, markerId, strength) as unknown as ProjectState['document'];
    if (nextDocument === project.document) return;
    await persist(nextDocument);
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

  function focusInspectorContext(selection: InspectorSelection) {
    setInspectorSelection(selection);
    onActiveToolChange('inspector');
  }

  return (
    <section className={`projectEditor ${setupBoardOpen ? '' : 'setupClosed'} ${inspectorOpen ? '' : 'inspectorClosed'}`} aria-label="Project editor" data-ui-region="editor-workspace">
      <ToolRail active={activeTool} onSelect={onActiveToolChange} />
      <EditorToolBoard activeTool={activeTool} project={project} fps={project.recording?.fps} currentTimeSec={currentTimeSec} background={background} cameraPresentation={cameraPresentation} hasCamera={hasCamera} aspectRatio={aspectRatio} disabled={isSaving} inspectorSelection={inspectorSelection} selectedZoomMarker={selectedZoomMarker} trimInfo={trimInfo} cutRanges={activeCutRanges} pendingCutStartFrame={pendingCutStartFrame} onProjectChange={onProjectChange} onBackgroundChange={updateBackground} onCameraPresentationChange={updateCameraPresentation} onAspectRatioChange={updateAspectRatio} onZoomMarkerRangeChange={updateZoomMarkerRange} onZoomMarkerStrengthChange={updateZoomMarkerStrength} onSetTrimStart={setTrimStartToPlayhead} onSetTrimEnd={setTrimEndToPlayhead} onResetTrim={resetTrim} onMarkCutStart={markCutStart} onCutToPlayhead={cutToPlayhead} onRemoveCutRange={restoreCut} onClearCutRanges={clearCuts} />
      <div className="stageColumn" aria-label="Central stage" data-ui-region="central-stage">
        <div className="projectHeader">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>{project.document.name}</h2>
          </div>
          {project.recording ? (
            <p className="meta">
              {recording.state === 'saved' ? <span className="savedChip">Saved</span> : null}
              {project.recording.width}x{project.recording.height} · {project.recording.fps} fps · {project.recording.duration} frames
            </p>
          ) : null}
        </div>
        {project.mediaUrl ? (
          <VideoPreview project={project} seekTimeSec={timelineSeekSec} trimStartSec={trimInfo.startSec} trimEndSec={trimInfo.endSec} cutRanges={toTrimRelativeCutRanges(activeCutRanges, trimInfo)} onCurrentTimeChange={setCurrentTimeSec} />
        ) : (
          <p>No recording asset found in this project.</p>
        )}
        <div className="timelineDock" aria-label="Timeline and review rail" data-ui-region="timeline-review-rail">
          <div className="timelineHeader">
          <p className="eyebrow"><Icon name="timeline" /> Timeline</p>
            <span>{formatClock(currentTimeSec)}</span>
          </div>
          {project.recording ? <VisualTimeline project={project} currentTimeSec={currentTimeSec} selectedZoomMarkerId={selectedZoomMarker?.id ?? null} onScrub={handleTimelineScrub} onScrubStart={handleTimelineScrubStart} onScrubEnd={handleTimelineScrubEnd} onTrimStart={(sourceTimeSec) => updateTrim(Math.round(sourceTimeSec * project.recording!.fps), trimInfo.endFrame)} onTrimEnd={(sourceTimeSec) => updateTrim(trimInfo.startFrame, Math.round(sourceTimeSec * project.recording!.fps))} onRestoreTrimStart={() => updateTrim(0, trimInfo.endFrame)} onRestoreTrimEnd={() => updateTrim(trimInfo.startFrame, project.recording!.duration)} onResetTrim={resetTrim} onZoomMarkerRangeChange={updateZoomMarkerRange} onSelectInspectorContext={focusInspectorContext} /> : null}
        </div>
      </div>
      <aside className="inspector" aria-label="Export settings" data-ui-region="right-inspector">
        <div className="inspectorHeader">
          <p className="eyebrow"><Icon name="export" /> Export</p>
          <h2>Export</h2>
        </div>
        <PostRecordingReview
          project={project}
          recording={recording}
          exportProgress={exportProgress}
          onExportMode={onExportMode}
          onOpenProject={() => onOpenPath(project.path)}
          onOpenRecordingFolder={() => onShowItemInFolder(project.recording?.filePath)}
          onOpenDiagnostics={() => onOpenPath(recording.state === 'saved' ? recording.diagnosticsPath : null)}
          onRetake={onRetake}
        />
        <InspectorSection id="export" title="Export status">
          <ExportPresetDetails mode={exportMode} />
          <InspectorActionRow region="export-status-area">
            {exportProgress ? <span className="exportProgress">{exportProgress.phase}: {Math.round(exportProgress.progress * 100)}%</span> : null}
            {exportResult ? <p className="saved">Exported to: {exportResult.outputPath} ({exportResult.bytes} bytes)</p> : null}
            {!exportProgress && !exportResult ? <p className="inspectorNotice">Choose Styled or Raw from the review actions above.</p> : null}
          </InspectorActionRow>
        </InspectorSection>
        {saveError ? <p className="error">{saveError}</p> : null}
      </aside>
    </section>
  );
}

function getPrimaryRecordingAsset(document: ProjectState['document']) {
  return document.assets?.find((asset) => asset.type === 'recording') ?? null;
}

function getPrimaryRecordingClip(document: ProjectState['document'], assetId?: string | null): PrimaryClip | null {
  if (!assetId) return null;
  for (const track of document.composition.tracks ?? []) {
    const clip = track.clips?.find((item) => item.assetId === assetId);
    if (clip) return clip;
  }
  return null;
}

function resolveTrimInfo(clip: PrimaryClip | null, totalFrames: number, fps: number): TrimInfo {
  const safeTotalFrames = Math.max(1, Math.round(totalFrames || 1));
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const startFrame = Math.max(0, Math.min(safeTotalFrames - 1, Math.round(clip?.sourceIn ?? 0)));
  const endFrame = Math.max(startFrame + 1, Math.min(safeTotalFrames, Math.round(clip?.sourceOut ?? safeTotalFrames)));
  return {
    startFrame,
    endFrame,
    startSec: startFrame / safeFps,
    endSec: endFrame / safeFps,
    durationSec: (endFrame - startFrame) / safeFps,
    isTrimmed: startFrame > 0 || endFrame < safeTotalFrames,
  };
}

function clipCutRangesToTrim(cutRanges: CutRange[], trimInfo: TrimInfo): CutRange[] {
  return cutRanges
    .map((range) => ({
      ...range,
      startFrame: Math.max(trimInfo.startFrame, Math.min(trimInfo.endFrame, range.startFrame)),
      endFrame: Math.max(trimInfo.startFrame, Math.min(trimInfo.endFrame, range.endFrame)),
    }))
    .filter((range) => range.endFrame > range.startFrame);
}

function toTrimRelativeCutRanges(cutRanges: CutRange[], trimInfo: TrimInfo): CutRange[] {
  return cutRanges.map((range) => ({
    ...range,
    startFrame: range.startFrame - trimInfo.startFrame,
    endFrame: range.endFrame - trimInfo.startFrame,
  }));
}

function RangeField({ label, value, min, max, step, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  const [draftValue, setDraftValue] = React.useState(value);
  const isEditingRef = React.useRef(false);
  const rangeProgress = Math.max(0, Math.min(100, ((draftValue - min) / Math.max(1, max - min)) * 100));

  React.useEffect(() => {
    if (!isEditingRef.current) setDraftValue(value);
  }, [value]);

  function commit(nextValue: number) {
    isEditingRef.current = false;
    setDraftValue(nextValue);
    if (nextValue !== value) onChange(nextValue);
  }

  return (
    <label className="rangeField">
      <span>{label}</span>
      <span className="rangeControl" style={{ '--range-progress': `${rangeProgress}%` } as React.CSSProperties}>
        <span className="rangeVisual" aria-hidden="true">
          <span className="rangeFill" />
          <span className="rangeThumb" />
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draftValue}
          disabled={disabled}
          onPointerDown={() => { isEditingRef.current = true; }}
          onInput={(event) => setDraftValue(Number(event.currentTarget.value))}
          onChange={(event) => setDraftValue(Number(event.currentTarget.value))}
          onPointerUp={(event) => commit(Number(event.currentTarget.value))}
          onBlur={(event) => commit(Number(event.currentTarget.value))}
          onKeyUp={(event) => commit(Number(event.currentTarget.value))}
          onWheelCapture={preventRangeWheelChange}
        />
      </span>
      <output>{draftValue}</output>
    </label>
  );
}

function preventRangeWheelChange(event: React.WheelEvent<HTMLInputElement>) {
  event.preventDefault();
  event.currentTarget.blur();
}

function VisualTimeline({ project, currentTimeSec, selectedZoomMarkerId = null, onScrub, onScrubStart, onScrubEnd, onTrimStart, onTrimEnd, onRestoreTrimStart, onRestoreTrimEnd, onResetTrim, onZoomMarkerRangeChange, onSelectInspectorContext }: { project: ProjectState; currentTimeSec: number; selectedZoomMarkerId?: string | null; onScrub: (timeSec: number) => void; onScrubStart: () => void; onScrubEnd: (timeSec: number) => void; onTrimStart: (sourceTimeSec: number) => void; onTrimEnd: (sourceTimeSec: number) => void; onRestoreTrimStart: () => void; onRestoreTrimEnd: () => void; onResetTrim: () => void; onZoomMarkerRangeChange: (markerId: string, startFrame: number, endFrame: number) => void; onSelectInspectorContext: (selection: InspectorSelection) => void }) {
  const model = buildTimelineModel({
    document: project.document as unknown as ProjectDocument,
    recording: project.recording,
    currentTimeSec,
    cameraMediaUrl: project.cameraMediaUrl,
  });

  const fps = project.recording?.fps && project.recording.fps > 0 ? project.recording.fps : 30;
  const minTrimGapSec = 1 / fps;
  const sourceFrameDuration = Math.max(1, Math.round(model.durationSec * fps));
  const hasHiddenStart = model.trimStartFrame > 0;
  const hasHiddenEnd = model.trimEndFrame < sourceFrameDuration;
  const hiddenTailLeft = model.lanes.screen[0]?.width ?? 100;
  const hiddenTailWidth = Math.max(0, 100 - hiddenTailLeft);
  const [zoomDragPreview, setZoomDragPreview] = React.useState<{ id: string; startFrame: number; endFrame: number } | null>(null);

  function sourceToVisibleTime(sourceTimeSec: number) {
    return Math.max(0, Math.min(sourceTimeSec - (model.trimStartFrame / fps), model.visibleDurationSec));
  }

  function scrubFromInput(value: string) {
    const nextSourceTime = Number(value);
    if (Number.isFinite(nextSourceTime)) onScrub(sourceToVisibleTime(nextSourceTime));
  }

  function commitScrub(value: string) {
    const nextSourceTime = Number(value);
    if (Number.isFinite(nextSourceTime)) onScrubEnd(sourceToVisibleTime(nextSourceTime));
  }

  function sourceTimeFromClient(handle: HTMLElement, clientX: number) {
    const track = handle.closest('.timelineLane')?.querySelector('.laneTrack');
    if (!(track instanceof HTMLElement)) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.max(0, Math.min(((clientX - rect.left) / rect.width) * model.durationSec, model.durationSec));
  }

  function sourceFrameFromClient(handle: HTMLElement, clientX: number) {
    const sourceTimeSec = sourceTimeFromClient(handle, clientX);
    if (sourceTimeSec === null) return null;
    return Math.round(sourceTimeSec * fps);
  }

  function beginTrimDrag(kind: 'start' | 'end', event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    onScrubStart();
    const move = (moveEvent: PointerEvent) => {
      const sourceTimeSec = sourceTimeFromClient(handle, moveEvent.clientX);
      if (sourceTimeSec === null) return;
      const minEndSec = (model.trimStartFrame / fps) + minTrimGapSec;
      const maxStartSec = (model.trimEndFrame / fps) - minTrimGapSec;
      if (kind === 'start') onTrimStart(Math.min(sourceTimeSec, maxStartSec));
      else onTrimEnd(Math.max(sourceTimeSec, minEndSec));
    };
    const up = (upEvent: PointerEvent) => {
      move(upEvent);
      onScrubEnd(sourceToVisibleTime(kind === 'start' ? model.trimStartFrame / fps : model.trimEndFrame / fps));
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function beginZoomDrag(region: { id: string; startFrame?: number; endFrame?: number }, mode: 'move' | 'start' | 'end', event: React.PointerEvent<HTMLElement>) {
    if (!Number.isFinite(region.startFrame) || !Number.isFinite(region.endFrame)) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const initialFrame = sourceFrameFromClient(handle, event.clientX) ?? 0;
    const initialStart = Math.round(region.startFrame ?? 0);
    const initialEnd = Math.round(region.endFrame ?? initialStart + 15);
    const duration = Math.max(15, initialEnd - initialStart);
    const maxFrame = Math.max(1, Math.round(project.recording?.duration ?? sourceFrameDuration));
    let latest = { id: region.id, startFrame: initialStart, endFrame: initialEnd };
    setZoomDragPreview(latest);

    const update = (clientX: number) => {
      const frame = sourceFrameFromClient(handle, clientX);
      if (frame === null) return;
      if (mode === 'move') {
        const delta = frame - initialFrame;
        const startFrame = Math.max(0, Math.min(maxFrame - duration, initialStart + delta));
        latest = { id: region.id, startFrame, endFrame: startFrame + duration };
      } else if (mode === 'start') {
        const startFrame = Math.max(0, Math.min(initialEnd - 15, frame));
        latest = { id: region.id, startFrame, endFrame: initialEnd };
      } else {
        const endFrame = Math.max(initialStart + 15, Math.min(maxFrame, frame));
        latest = { id: region.id, startFrame: initialStart, endFrame };
      }
      setZoomDragPreview(latest);
    };

    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX);
    const up = (upEvent: PointerEvent) => {
      update(upEvent.clientX);
      setZoomDragPreview(null);
      onZoomMarkerRangeChange(latest.id, latest.startFrame, latest.endFrame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function zoomRegionStyle(region: { id: string; left: number; width: number; startFrame?: number; endFrame?: number }) {
    if (zoomDragPreview?.id !== region.id) return { left: `${region.left}%`, width: `${region.width}%` };
    const placement = frameRangeToPlacement(zoomDragPreview.startFrame - model.trimStartFrame, zoomDragPreview.endFrame - model.trimStartFrame, fps, model.durationSec);
    return { left: `${placement.left}%`, width: `${placement.width}%` };
  }

  return (
    <div className="visualTimeline" aria-label="Timeline overview">
      <div className="timelineRuler" aria-hidden="true">
        <span />
        {model.ticks.map((tick) => <span key={tick}>{formatClock(tick)}</span>)}
      </div>
      <div className="timelineTracks">
        <div className="timelineTrackOverlay">
          <input
            aria-label="Scrub timeline"
            className="timelineScrubber"
            type="range"
            min="0"
            max={model.durationSec}
            step="0.1"
            value={model.currentTimeSec}
            onWheelCapture={preventRangeWheelChange}
            onPointerDown={onScrubStart}
            onPointerUp={(event) => commitScrub(event.currentTarget.value)}
            onPointerCancel={(event) => commitScrub(event.currentTarget.value)}
            onKeyDown={onScrubStart}
            onKeyUp={(event) => commitScrub(event.currentTarget.value)}
            onInput={(event) => scrubFromInput(event.currentTarget.value)}
            onChange={(event) => scrubFromInput(event.currentTarget.value)}
          />
          <span className="playhead" style={{ left: `${model.playheadPercent}%` }} />
        </div>
        <TimelineLane label="Screen" className="screenLane">
          {model.lanes.screen.map((region) => (
            <div key={region.id} className="clipBar" style={{ left: `${region.left}%`, width: `${region.width}%` }}>
              <button type="button" className="trimHandle trimHandleStart" aria-label="Trim start" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => beginTrimDrag('start', event)} />
              <button type="button" className="clipBody" onClick={() => onSelectInspectorContext({ group: 'recording', label: 'Screen recording', detail: 'Source clip selected from the timeline.' })}><Icon name="frame" /> Clip</button>
              <button type="button" className="trimHandle trimHandleEnd" aria-label="Trim end" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => beginTrimDrag('end', event)} />
            </div>
          ))}
          {hasHiddenStart ? <button type="button" className="hiddenTrimRange hiddenTrimStart" aria-label="Restore hidden start" title={`Restore hidden start (${model.trimStartFrame} frames)`} onClick={onRestoreTrimStart}>Hidden start</button> : null}
          {hasHiddenEnd ? <button type="button" className="hiddenTrimRange hiddenTrimEnd" aria-label="Restore hidden end" title={`Restore hidden end (${sourceFrameDuration - model.trimEndFrame} frames)`} style={{ left: `${hiddenTailLeft}%`, width: `${hiddenTailWidth}%` }} onClick={onRestoreTrimEnd}>Hidden end</button> : null}
          {hasHiddenStart || hasHiddenEnd ? <button type="button" className="restoreFullSource" aria-label="Restore full source" onClick={onResetTrim}>Restore full source</button> : null}
        </TimelineLane>
        <TimelineLane label="Zoom" className={`zoomLane zoomLayerCount${Math.min(2, model.zoomLayerCount)}`}>
          {model.lanes.zoom.length > 0
            ? model.lanes.zoom.map((region) => {
                const label = region.label ?? 'Zoom region';
                const kind = region.kind ?? 'manual';
                const selected = selectedZoomMarkerId === region.id;
                return (
                  <button key={region.id} type="button" className={`timelineRegion zoomLayer${Math.min(1, region.layer ?? 0)} ${kind === 'auto' ? 'autoRegion' : 'manualRegion'} ${selected ? 'selectedRegion' : ''}`} title={label} style={zoomRegionStyle(region)} onClick={() => onSelectInspectorContext({ group: 'zoom', label, detail: `${kind} zoom region selected.`, markerId: region.id })} onPointerDown={(event) => beginZoomDrag(region, 'move', event)}>
                    <span className="zoomResizeHandle zoomResizeStart" onPointerDown={(event) => beginZoomDrag(region, 'start', event)} />
                    <span className="zoomResizeHandle zoomResizeEnd" onPointerDown={(event) => beginZoomDrag(region, 'end', event)} />
                  </button>
                );
              })
            : <p>No zoom markers yet.</p>}
        </TimelineLane>
        <TimelineLane label="Clicks" className="clickLane">
          {model.lanes.clicks.length > 0
            ? model.lanes.clicks.map((event) => <button key={event.id} type="button" className="clickMarker" style={{ left: `${event.left}%` }} onClick={() => onSelectInspectorContext({ group: 'cursor', label: 'Click event', detail: 'Click telemetry selected from the timeline.' })} />)
            : <p>No click events yet.</p>}
        </TimelineLane>
        <TimelineLane label="Camera" className="cameraLane">
          {model.lanes.camera.length > 0
            ? model.lanes.camera.map((region) => <button key={region.id} type="button" className="presenceRegion" style={{ left: `${region.left}%`, width: `${region.width}%` }} onClick={() => onSelectInspectorContext({ group: 'camera', label: 'Camera track', detail: 'Camera presence selected from the timeline.' })}>Camera</button>)
            : <p>No camera track.</p>}
        </TimelineLane>
        <TimelineLane label="Audio" className="audioLane">
          {model.lanes.audio.length > 0
            ? model.lanes.audio.map((region) => <button key={region.id} type="button" className="presenceRegion" style={{ left: `${region.left}%`, width: `${region.width}%` }} onClick={() => onSelectInspectorContext({ group: 'recording', label: 'Audio track', detail: 'Audio presence selected from the timeline.' })}>Audio</button>)
            : <p>No audio track.</p>}
        </TimelineLane>
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
  markerCount,
  onProjectChange,
}: {
  project: ProjectState;
  fps: number;
  currentTimeSec: number;
  markerCount: number;
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
      <div className="timelineCompactRow"><span>Markers</span><strong>{markerCount}</strong><button type="button" className="secondary compact" onClick={handleAdd} disabled={!canAdd || isSaving}>+ Add</button></div>
      {markers.length === 0 ? (
        <p className="zoomMarkerEmpty">No markers</p>
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
      <div className="timelineCompactRow">
        <span>Suggestions</span>
        <strong>{hasGenerated ? suggestions.length : '—'}</strong>
        <button
          type="button"
          className="secondary compact"
          onClick={handleGenerate}
          disabled={isSaving}
        >
          {hasGenerated ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      {!hasGenerated ? (
        <p className="autoZoomEmpty">
          Not generated
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
                  {suggestion.startFrame}–{suggestion.endFrame} f · {Math.round(suggestion.strength * 100)}%
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
  trimStartSec = 0,
  trimEndSec,
  cutRanges = [],
  onCurrentTimeChange,
}: {
  project: ProjectState;
  seekTimeSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  cutRanges?: CutRange[];
  onCurrentTimeChange?: (sec: number) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const backgroundImageRef = React.useRef<HTMLImageElement | null>(null);
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
  const sourceDurationSec = Math.max(0.1, (project.recording?.duration ?? 1) / fps);
  const trimDurationFrames = Math.max(1, Math.round(((trimEndSec ?? sourceDurationSec) - trimStartSec) * fps));
  const visibleDuration = Math.max(0.1, visibleDurationFrames(cutRanges, trimDurationFrames) / fps);

  function visibleTimeToSourceTime(visibleTimeSec: number) {
    const visibleFrame = Math.round(Math.max(0, visibleTimeSec) * fps);
    return trimStartSec + visibleFrameToSourceFrame(cutRanges, visibleFrame, trimDurationFrames) / fps;
  }

  function sourceTimeToVisibleTime(sourceTimeSec: number) {
    const relativeFrame = Math.max(0, Math.round((sourceTimeSec - trimStartSec) * fps));
    let removed = 0;
    for (const range of cutRanges) {
      if (relativeFrame <= range.startFrame) continue;
      removed += Math.min(relativeFrame, range.endFrame) - range.startFrame;
    }
    return Math.max(0, (relativeFrame - removed) / fps);
  }

  function cutEndForSourceTime(sourceTimeSec: number) {
    const relativeFrame = Math.round((sourceTimeSec - trimStartSec) * fps);
    const active = cutRanges.find((range) => relativeFrame >= range.startFrame && relativeFrame < range.endFrame);
    return active ? trimStartSec + active.endFrame / fps : null;
  }

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setError(null);
    pendingSeekRef.current = null;
    seekingRef.current = false;
  }, [src]);

  React.useEffect(() => {
    if (!background.bgImage) {
      backgroundImageRef.current = null;
      return undefined;
    }
    const image = new Image();
    image.src = background.bgImage;
    image.onload = () => {
      backgroundImageRef.current = image;
    };
    image.onerror = () => {
      backgroundImageRef.current = null;
    };
    return () => {
      if (backgroundImageRef.current === image) backgroundImageRef.current = null;
    };
  }, [background.bgImage]);

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
    const nextTime = Math.max(trimStartSec, Math.min(visibleTimeToSourceTime(requestedTime), Math.min(trimEndSec ?? maxTime, maxTime)));
    pendingSeekRef.current = null;
    if (Math.abs(video.currentTime - nextTime) < 0.05) {
      seekingRef.current = false;
      return;
    }
    seekingRef.current = true;
    video.currentTime = nextTime;
    if (cameraVideoRef.current) cameraVideoRef.current.currentTime = nextTime + cameraSourceOffsetSec;
    setCurrentTime(sourceTimeToVisibleTime(nextTime));
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
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
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
    // Frame dedup: track the last frame number drawn so we skip RAF ticks where
    // the video hasn't advanced to a new frame yet. At 30fps source on a 60fps RAF
    // loop this halves canvas draw work without changing visual output.
    let lastDrawnFrame = -1;
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

    const fillBackground = () => {
      const [backgroundStart, backgroundEnd] = getRecordingBackgroundColors(background);
      const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      gradient.addColorStop(0, backgroundStart);
      gradient.addColorStop(1, backgroundEnd);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    };

    function tick() {
      if (!video || !canvas || !ctx) return;
      if (video.seeking || seekingRef.current || video.readyState < 2) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      // Skip draw when the video hasn't advanced to a new frame since last tick.
      // Math.round(currentTime * fps) is discrete (0, 1, 2 …), so at 30fps it holds
      // the same value for ~2 consecutive 60fps RAF ticks before incrementing.
      const currentFrame = Math.max(0, Math.round(video.currentTime * fps));
      if (currentFrame === lastDrawnFrame) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      lastDrawnFrame = currentFrame;
      (window as unknown as Record<string, number>).__roughCutCanvasDrawCount =
        ((window as unknown as Record<string, number>).__roughCutCanvasDrawCount ?? 0) + 1;
      if (Number.isFinite(trimEndSec) && video.currentTime > (trimEndSec ?? video.currentTime) + 0.02) {
        video.pause();
        video.currentTime = trimEndSec ?? video.currentTime;
        setCurrentTime(Math.max(0, (trimEndSec ?? video.currentTime) - trimStartSec));
        onCurrentTimeChange?.(Math.max(0, (trimEndSec ?? video.currentTime) - trimStartSec));
      }
      const cutEnd = cutEndForSourceTime(video.currentTime);
      if (cutEnd !== null) {
        video.currentTime = cutEnd;
        if (cameraVideo) cameraVideo.currentTime = cutEnd + cameraSourceOffsetSec;
        lastDrawnFrame = -1;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
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
      const backgroundImage = backgroundImageRef.current;
      if (backgroundImage?.complete && backgroundImage.naturalWidth > 0 && backgroundImage.naturalHeight > 0) {
        fillBackground();
        ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
      } else {
        fillBackground();
      }
      if (background.bgShadowEnabled && background.bgShadowOpacity > 0 && background.bgShadowBlur > 0) {
        ctx.save();
        const shadowBlur = Math.max(0, background.bgShadowBlur);
        const shadowOpacity = Math.min(0.8, Math.max(0, background.bgShadowOpacity));
        const shadowOffsetY = Math.max(0, background.bgShadowOffsetY ?? DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY ?? 34);
        ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = shadowOffsetY;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';
        addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
        ctx.fill();
        ctx.restore();
      }
      if (background.bgInset > 0) {
        ctx.save();
        ctx.lineWidth = background.bgInset;
        ctx.strokeStyle = background.bgInsetColor || 'rgba(255, 255, 255, 0.22)';
        addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
        ctx.stroke();
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
      drawClickEmphasis(ctx, cursorEvents, currentFrame);
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
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, background, cameraSrc, trimStartSec, trimEndSec, cutRanges, onCurrentTimeChange]);

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
    const nextVisibleTime = Number(value);
    if (!Number.isFinite(nextVisibleTime)) return;
    const nextSourceTime = visibleTimeToSourceTime(Math.max(0, Math.min(nextVisibleTime, visibleDuration)));
    video.currentTime = nextSourceTime;
    if (cameraVideoRef.current) cameraVideoRef.current.currentTime = nextSourceTime + cameraSourceOffsetSec;
    setCurrentTime(nextVisibleTime);
    onCurrentTimeChange?.(nextVisibleTime);
  }

  return (
    <div className="videoPreview styledPreview">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        className="hiddenSource"
        onLoadedMetadata={(event) => {
          setDuration(visibleDuration);
          if (trimStartSec > 0) event.currentTarget.currentTime = trimStartSec;
          setError(null);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onSeeked={handleSeekSettled}
        onError={(event) => setError(videoErrorMessage(event.currentTarget))}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime;
          const cutEnd = cutEndForSourceTime(next);
          if (cutEnd !== null) {
            event.currentTarget.currentTime = cutEnd;
            return;
          }
          const visibleTime = sourceTimeToVisibleTime(next);
          setCurrentTime(Math.min(visibleTime, visibleDuration));
          onCurrentTimeChange?.(Math.min(visibleTime, visibleDuration));
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
          max={visibleDuration || duration || 0}
          step="0.1"
          value={Math.min(currentTime, visibleDuration || duration || 0)}
          onWheelCapture={preventRangeWheelChange}
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
