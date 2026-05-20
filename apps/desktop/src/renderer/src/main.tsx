import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowClockwise as PhosphorArrowClockwise,
  ArrowCounterClockwise as PhosphorArrowCounterClockwise,
  ClosedCaptioning as PhosphorClosedCaptioning,
  CursorClick as PhosphorCursorClick,
  Export as PhosphorExport,
  FilmStrip as PhosphorFilmStrip,
  Folder as PhosphorFolder,
  FrameCorners as PhosphorFrameCorners,
  GearSix as PhosphorGearSix,
  Icon as PhosphorIconType,
  Microphone as PhosphorMicrophone,
  Monitor as PhosphorMonitor,
  Pause as PhosphorPause,
  PencilSimple as PhosphorPencilSimple,
  Play as PhosphorPlay,
  Record as PhosphorRecord,
  Scissors as PhosphorScissors,
  Trash as PhosphorTrash,
  SlidersHorizontal as PhosphorSlidersHorizontal,
  Sparkle as PhosphorSparkle,
  SpeakerHigh as PhosphorSpeakerHigh,
  Stop as PhosphorStop,
  VideoCamera as PhosphorVideoCamera,
} from '@phosphor-icons/react';
import {
  createDefaultCameraPresentation,
  createDefaultCursorPresentation,
  createDefaultRecordingBackgroundStyle,
  applyRecordingBackgroundPreset,
  getRecordingBackgroundColors,
  getStyledCanvasResolution,
  PROJECT_ASPECT_RATIO_LABELS,
  RECORDING_BACKGROUND_PRESETS,
  RECORDING_TEMPLATE_PRESETS,
  applyRecordingTemplatePreset,
  findRecordingTemplatePresetId,
  type NormalizedRect,
  type ProjectAspectRatio,
  type UserRecordingTemplate,
  type ProjectDocument,
  type CameraPosition,
  type CameraPresentation,
  type CameraShape,
  type ClickEffect,
  type CursorPresentation,
  type CursorStyle,
  type RecordingBackgroundStyle,
  type ZoomMarker,
} from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import './styles.css';
import { LibraryShell } from './library/library-shell';
import { AiShell } from './ai/ai-shell';
import { NleShell } from './nle/nle-shell';
import { StyledVideoPreview as VideoPreview } from './styled-video-preview';
import { APP_VIEWS, DEFAULT_APP_VIEW_ID, type AppViewId } from './app-views';
import {
  addManualMarkerAtFrame,
  applySuggestion,
  getZoomPresentation,
  listMarkers,
  patchZoomPresentation,
  removeMarker,
  updateMarkerRange,
  updateMarkerStrength,
  withDefaultPresentation,
} from './zoom-markers.mjs';
import { buildTimelineModel, frameRangeToPlacement } from './timeline-rail.mjs';
import { cameraCoversSourceTime, clampedCameraTime, coverSourceRect, cursorAtFrame, cursorForResizeHandle, drawClickEmphasis, drawCursorPath, frameResizeHandles, moveRectFromPointer, resizeHandleAtPoint, resizeRectFromPointer } from './styled-preview.mjs';
import type { PreviewDragOrigin } from './styled-preview.mjs';
import { generateSuggestionsForProject } from './auto-zoom-suggestions.mjs';
import { addCutRange, clearCutRanges, listCutRanges, removeCutRange, visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';
import { getRecordingTimelineClip, restoreRecordingFullSource, restoreRecordingSourceEdge, rippleDeleteRecordingRange, syncRecordingTimelinePresentation, updateRecordingTimelineTrim } from './recording-timeline.mjs';
import { appError, errorStateCopy, type AppError } from './app-error-copy.mjs';
import { EMPTY_EDIT_HISTORY, recordEdit, redoEdit, undoEdit, type EditHistory } from './edit-history.mjs';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      getRuntimeLogPath: () => Promise<string>;
      openEditor: (projectPath?: string | null) => Promise<void>;
      showItemInFolder: (path: string) => Promise<void>;
      openPath: (path: string) => Promise<string>;
      getMicSources: () => Promise<MicSource[]>;
      getSystemAudioSources: () => Promise<AudioSource[]>;
      getCameraSources: () => Promise<CameraSource[]>;
      startCameraPreview: (options: { devicePath: string }) => Promise<{ token: string; pid: number | null }>;
      stopCameraPreview: (token?: string | null) => Promise<{ stopped: boolean }>;
      onCameraPreviewFrame: (callback: (frame: { token: string; dataUrl: string }) => void) => () => void;
      getDisplays: () => Promise<CaptureDisplay[]>;
      getRecordingPreflightStatus: (options?: RecordingPreflightOptions) => Promise<RecordingPreflightStatus>;
      selectCaptureRegion: (options?: { displayId?: string | null; initialRegion?: CaptureRegion | null }) => Promise<CaptureRegion | null>;
      startRecording: (options?: { micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; captureRegion?: CaptureRegion | null; hideWindowDuringRecording?: boolean }) => Promise<RecordingStatus>;
      stopRecording: () => Promise<RecordingStatus>;
      cancelRecording: () => Promise<RecordingStatus>;
      getRecordingStatus: () => Promise<RecordingStatus>;
      openProject: () => Promise<ProjectState | null>;
      openProjectPath: (path: string) => Promise<ProjectState>;
      saveProject: (project: { path: string; document: ProjectState['document'] }) => Promise<ProjectState>;
      pickImportFile: () => Promise<{ filePath: string; mimeType: string | null } | null>;
      createProjectFromImport: (payload: { importedFilePath: string; importedMimeType: string | null }) => Promise<ProjectState>;
      createBlankProject: (payload?: { name?: string; aspectRatio?: ProjectAspectRatio } | null) => Promise<ProjectState>;
      getRecoveryState: () => Promise<{ available: boolean; marker: RecoveryMarker | null; rawAvailable: boolean; cameraRawAvailable?: boolean }>;
      recoverLastRecording: () => Promise<{ state: 'recovered'; project: ProjectState; remuxWarnings: Array<{ source: string; message: string }> }>;
      dismissRecovery: (options?: { deleteFiles?: boolean }) => Promise<{ dismissed: boolean; removed: string[] }>;
      pickExportOutputPath: (projectName: string) => Promise<string | null>;
      exportProject: (payload: { document: ProjectState['document']; outputPath: string; mode: ExportMode }) => Promise<ExportResult>;
      cancelExport: () => Promise<{ cancelled: boolean }>;
      onExportProgress: (callback: (progress: ExportProgress) => void) => () => void;
      listRecentProjects: () => Promise<Array<{
        path: string;
        name: string;
        createdAt: string | null;
        modifiedAt: string | null;
        durationMs: number;
        durationFrames: number;
        frameRate: number;
        width: number | null;
        height: number | null;
        resolutionLabel: string | null;
        hasCamera: boolean;
        thumbnailUrl: string | null;
        recordingUrl: string | null;
      }>>;
      removeRecentProjects: (payload: { paths: string[]; openProjectPath?: string | null }) => Promise<{
        deleted: string[];
        failed: Array<{ path: string; error: string; code: string | null }>;
      }>;
      clearRecentProjects: () => Promise<{ cleared: boolean; reason?: string }>;
      renameProject: (payload: { path: string; name: string; openProjectPath?: string | null }) => Promise<{
        path: string;
        document: ProjectState['document'];
        recording: ProjectState['recording'];
        mediaUrl: string | null;
        cameraMediaUrl?: string | null;
      }>;
      duplicateProject: (payload: { path: string }) => Promise<{
        path: string;
        document: ProjectState['document'];
        recording: ProjectState['recording'];
        mediaUrl: string | null;
        cameraMediaUrl?: string | null;
      }>;
      listUserTemplates: () => Promise<UserRecordingTemplate[]>;
      saveUserTemplate: (payload: {
        label: string;
        aspectRatio: ProjectAspectRatio;
        background: RecordingBackgroundStyle;
        camera: CameraPresentation;
        presentation: { screenFrame: NormalizedRect | null; cameraFrame: NormalizedRect | null };
      }) => Promise<UserRecordingTemplate>;
      renameUserTemplate: (payload: { id: string; label: string }) => Promise<UserRecordingTemplate>;
      deleteUserTemplate: (payload: { id: string }) => Promise<{ removed: boolean }>;
      channels: Record<string, string>;
    };
  }
}

type RecoveryMarker = {
  startedAt: string;
  rawPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
};

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
type ProjectChangeOptions = { history?: boolean; previous?: ProjectState };

type ExportProgress = { phase: string; progress: number };
type ExportResult = { outputPath: string; sourcePath: string; bytes: number; byteEqualCandidate: boolean; cancelled?: boolean };
type ExportMode = 'raw' | 'styled';
type MicSource = { id: string; name: string; label: string; state: string };
type AudioSource = { id: string; name: string; label: string; state: string };
type CameraSource = { id: string; name: string; label: string };
type CaptureMode = 'display' | 'region';
type CaptureDisplay = { id: string; label: string; primary: boolean; scaleFactor: number; bounds: { x: number; y: number; width: number; height: number } };
type CaptureRegion = { mode: 'region'; x: number; y: number; width: number; height: number; absoluteX?: number; absoluteY?: number; displayId?: string | null; displayLabel?: string | null };
type RecordingPreflightOptions = { recordMic: boolean; recordSystemAudio: boolean; recordCamera: boolean; micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; captureMode: CaptureMode; captureRegion?: CaptureRegion | null };
type RecordingPreflightCheck = { id: string; label: string; severity: 'ok' | 'warn' | 'critical'; detail: string };
type RecordingPreflightStatus = { status: 'ok' | 'warn' | 'critical'; checkedAt: string; recordingsDir: string; display?: { x?: number; y?: number; width?: number; height?: number }; capture: { mode: CaptureMode; width: number; height: number; fps: number }; disk?: { freeBytes: number | null; severity: RecordingPreflightCheck['severity']; detail: string }; checks: RecordingPreflightCheck[] };
type InspectorGroupId = 'canvas' | 'recording' | 'screen' | 'zoom' | 'cursor' | 'camera' | 'export' | 'diagnostics';
type InspectorSelection = { group: InspectorGroupId; label: string; detail?: string; markerId?: string };
type PrimaryClip = { assetId?: string; timelineIn?: number; timelineOut?: number; sourceIn?: number; sourceOut?: number } & Record<string, unknown>;
type TrimInfo = { startFrame: number; endFrame: number; startSec: number; endSec: number; durationSec: number; isTrimmed: boolean };
type CutRange = { id: string; startFrame: number; endFrame: number };

type RecordingStatus =
  | { state: 'idle'; canceled?: boolean }
  | { state: 'recording'; startedAt: string; rawPath: string; outputPath: string; micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; cameraError?: string | null }
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
const DEFAULT_CURSOR_PRESENTATION = createDefaultCursorPresentation();
const CURSOR_STYLE_OPTIONS: ReadonlyArray<{ value: CursorStyle; label: string }> = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'default', label: 'Default' },
  { value: 'spotlight', label: 'Spotlight' },
];
const CURSOR_CLICK_EFFECT_OPTIONS: ReadonlyArray<{ value: ClickEffect; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'ripple', label: 'Ripple' },
  { value: 'ring', label: 'Ring' },
];
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
  captureMode: CaptureMode | null;
  captureDisplayId: string | null;
  captureRegion: CaptureRegion | null;
};

function readPreRecordPreferences(): PreRecordPreferences {
  const fallback: PreRecordPreferences = {
    recordMic: false, recordSystemAudio: false, recordCamera: false,
    micSource: null, systemAudioSource: null, cameraSource: null,
    captureMode: null, captureDisplayId: null, captureRegion: null,
  };
  try {
    const raw = window.localStorage.getItem(PRE_RECORD_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PreRecordPreferences>;
    // CaptureMode is a string union; defensively accept only known values.
    const captureMode: CaptureMode | null = parsed.captureMode === 'display' || parsed.captureMode === 'region' ? parsed.captureMode : null;
    // CaptureRegion needs a full shape; reject partial/corrupt blobs.
    const region = parsed.captureRegion;
    const captureRegion: CaptureRegion | null = region && typeof region === 'object'
      && region.mode === 'region'
      && Number.isFinite(region.x) && Number.isFinite(region.y)
      && Number.isFinite(region.width) && Number.isFinite(region.height)
      && region.width > 0 && region.height > 0
      ? { mode: 'region', x: region.x, y: region.y, width: region.width, height: region.height }
      : null;
    return {
      recordMic: parsed.recordMic === true,
      recordSystemAudio: parsed.recordSystemAudio === true,
      recordCamera: parsed.recordCamera === true,
      micSource: typeof parsed.micSource === 'string' ? parsed.micSource : null,
      systemAudioSource: typeof parsed.systemAudioSource === 'string' ? parsed.systemAudioSource : null,
      cameraSource: typeof parsed.cameraSource === 'string' ? parsed.cameraSource : null,
      captureMode,
      captureDisplayId: typeof parsed.captureDisplayId === 'string' ? parsed.captureDisplayId : null,
      captureRegion,
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

// Shared rename-in-flight flag. App() flips it; module-scope
// `saveProjectGuarded` reads it. Lives at module scope because save call
// sites in helper components (ProjectPreview, ZoomMarkerPanel, etc.) are
// outside App's closure but still need to honor the same gate.
const renameInFlight = { current: false };

async function saveProjectGuarded(payload: { path: string; document: ProjectState['document'] }): Promise<ProjectState> {
  if (renameInFlight.current) {
    // Synthetic ProjectState matching the input; the disk save is skipped
    // for the ~200ms rename window. Caller's setProject(saved) stays
    // coherent because path + document round-trip unchanged.
    return { path: payload.path, document: payload.document, recording: null, mediaUrl: null };
  }
  return window.roughCut.saveProject(payload);
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isRecorderMode = searchParams.get('mode') === 'recorder';
  // Initial app view: honor ?view= override from the main process. Used when
  // a project is opened from disk (jumps straight to editor) and by smoke
  // harnesses that need the editor surface mounted at boot. Falls back to
  // the registry default (Projects gallery) for a plain launch.
  const initialAppView: AppViewId = (() => {
    const requested = searchParams.get('view');
    if (requested === 'projects' || requested === 'editor' || requested === 'nle' || requested === 'ai') return requested;
    return DEFAULT_APP_VIEW_ID;
  })();
  const initialPreRecordPreferences = React.useMemo(readPreRecordPreferences, []);
  // Version is fetched for diagnostics / about-dialog use; the dev label is
  // no longer rendered in chrome. Kept stateful so future surfaces can show it.
  const [, setVersion] = React.useState<string>('loading');
  // Rename guard: while a project rename is in flight, autosave and explicit
  // saves are suppressed (via module-scope `renameInFlight` + `saveProjectGuarded`)
  // to prevent the "autosave resurrects the old path" race. The autosave
  // interval reads `renameInFlight.current` at each tick, so the flag flip
  // takes effect without needing to re-run any useEffect.
  const setRenameInFlight = React.useCallback((flag: boolean) => {
    renameInFlight.current = flag;
  }, []);
  const [recording, setRecording] = React.useState<RecordingStatus>({ state: 'idle' });
  const [project, setProject] = React.useState<ProjectState | null>(null);
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);
  const [exportMode, setExportMode] = React.useState<ExportMode>('raw');
  const [micSources, setMicSources] = React.useState<MicSource[]>([]);
  const [systemAudioSources, setSystemAudioSources] = React.useState<AudioSource[]>([]);
  const [cameraSources, setCameraSources] = React.useState<CameraSource[]>([]);
  const [captureDisplays, setCaptureDisplays] = React.useState<CaptureDisplay[]>([]);
  const [selectedCaptureDisplayId, setSelectedCaptureDisplayId] = React.useState<string | null>(null);
  const [screenPickerOpen, setScreenPickerOpen] = React.useState(false);
  const [recordMic, setRecordMic] = React.useState(initialPreRecordPreferences.recordMic);
  const [recordSystemAudio, setRecordSystemAudio] = React.useState(initialPreRecordPreferences.recordSystemAudio);
  const [recordCamera, setRecordCamera] = React.useState(initialPreRecordPreferences.recordCamera);
  const [selectedMicSource, setSelectedMicSource] = React.useState<string>(initialPreRecordPreferences.micSource ?? '');
  const [selectedSystemAudioSource, setSelectedSystemAudioSource] = React.useState<string>(initialPreRecordPreferences.systemAudioSource ?? '');
  const [selectedCameraSource, setSelectedCameraSource] = React.useState<string>(initialPreRecordPreferences.cameraSource ?? '');
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>(initialPreRecordPreferences.captureMode ?? 'display');
  const [captureRegion, setCaptureRegion] = React.useState<CaptureRegion>(initialPreRecordPreferences.captureRegion ?? { mode: 'region', x: 0, y: 0, width: 1280, height: 720 });
  const [recordingActionPending, setRecordingActionPending] = React.useState(false);
  const [preRecordPanelOpen, setPreRecordPanelOpen] = React.useState(isRecorderMode);
  const [setupBoardOpen, setSetupBoardOpen] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [activeAppView, setActiveAppView] = React.useState<AppViewId>(initialAppView);
  const [activeTool, setActiveTool] = React.useState<ActiveTool>('background');
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [editHistory, setEditHistory] = React.useState<EditHistory<ProjectState>>(EMPTY_EDIT_HISTORY);
  const recordingActionPendingRef = React.useRef(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [error, setError] = React.useState<AppError | null>(null);
  const [runtimeLogPath, setRuntimeLogPath] = React.useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = React.useState<RecordingPreflightStatus | null>(null);
  const [recoveryState, setRecoveryState] = React.useState<{ available: boolean; marker: RecoveryMarker | null } | null>(null);
  const [recoveryActionPending, setRecoveryActionPending] = React.useState(false);
  const [dismissedCameraFailureForStartedAt, setDismissedCameraFailureForStartedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    window.roughCut.getVersion().then(setVersion).catch(() => setVersion('unknown'));
    window.roughCut.getRuntimeLogPath().then(setRuntimeLogPath).catch(() => setRuntimeLogPath(null));
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
    window.roughCut.getDisplays()
      .then((displays) => {
        setCaptureDisplays(displays);
        // Restore previously-selected display if it's still attached, otherwise
        // fall back to primary, then first available.
        const preferred = initialPreRecordPreferences.captureDisplayId;
        setSelectedCaptureDisplayId((current) => {
          if (current) return current;
          if (preferred && displays.some((display) => display.id === preferred)) return preferred;
          return displays.find((display) => display.primary)?.id ?? displays[0]?.id ?? null;
        });
      })
      .catch(() => setCaptureDisplays([]));
    window.roughCut.getRecoveryState()
      .then((state) => setRecoveryState({ available: Boolean(state?.available), marker: state?.marker ?? null }))
      .catch(() => setRecoveryState(null));
    return window.roughCut.onExportProgress(setExportProgress);
  }, []);

  const handleRecover = React.useCallback(async () => {
    if (recoveryActionPending) return;
    setRecoveryActionPending(true);
    setError(null);
    try {
      const result = await window.roughCut.recoverLastRecording();
      setRecoveryState({ available: false, marker: null });
      if (result?.project) {
          setProject(result.project);
          setEditHistory(EMPTY_EDIT_HISTORY);
          setExportResult(null);
        if (Array.isArray(result.remuxWarnings) && result.remuxWarnings.length > 0) {
          setError(appError('recovery', `Recovered project has warnings: ${result.remuxWarnings.map((w) => w.message).join(' / ')}`));
        }
      }
    } catch (err) {
      setError(appError('recovery', err, 'Recovery failed.'));
    } finally {
      setRecoveryActionPending(false);
    }
  }, [recoveryActionPending]);

  const handleDismissRecovery = React.useCallback(async () => {
    if (recoveryActionPending) return;
    setRecoveryActionPending(true);
    try {
      await window.roughCut.dismissRecovery({ deleteFiles: true });
      setRecoveryState({ available: false, marker: null });
    } catch (err) {
      setError(appError('recovery', err, 'Could not dismiss recovery.'));
    } finally {
      setRecoveryActionPending(false);
    }
  }, [recoveryActionPending]);

  // Periodic autosave for the open project. Uses the IPC PROJECT_SAVE path
  // which goes through the atomic write from TASK-085, so a kill mid-save
  // can't corrupt the .roughcut file. Skips ticking when a rename is in
  // flight — saving with the stale path would resurrect the old file after
  // the rename moves it.
  React.useEffect(() => {
    if (!project) return undefined;
    const id = window.setInterval(() => {
      if (renameInFlight.current) return;
      window.roughCut.saveProject({ path: project.path, document: project.document })
        .catch((err) => console.warn('[autosave] failed:', err?.message ?? err));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [project]);

  React.useEffect(() => {
    writePreRecordPreferences({
      recordMic,
      recordSystemAudio,
      recordCamera,
      micSource: selectedMicSource || null,
      systemAudioSource: selectedSystemAudioSource || null,
      cameraSource: selectedCameraSource || null,
      captureMode,
      captureDisplayId: selectedCaptureDisplayId,
      captureRegion: captureMode === 'region' ? captureRegion : null,
    });
  }, [recordMic, recordSystemAudio, recordCamera, selectedMicSource, selectedSystemAudioSource, selectedCameraSource, captureMode, selectedCaptureDisplayId, captureRegion]);

  React.useEffect(() => {
    const projectPath = new URLSearchParams(window.location.search).get('projectPath');
    if (!projectPath) return;

    let cancelled = false;
    window.roughCut.openProjectPath(projectPath)
      .then((opened) => {
        if (cancelled) return;
        setProject(opened);
        setEditHistory(EMPTY_EDIT_HISTORY);
        setExportResult(null);
        setActiveAppView('editor');
      })
      .catch((err) => {
        if (!cancelled) setError(appError('project', err, 'Project open failed.'));
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
    if (recording.state !== 'recording') return;
    let cancelled = false;
    const pollStatus = () => {
      window.roughCut.getRecordingStatus()
        .then((status) => {
          if (!cancelled && status.state === 'recording' && status.cameraError && status.cameraError !== recording.cameraError) setRecording(status);
        })
        .catch(() => undefined);
    };
    pollStatus();
    const id = window.setInterval(pollStatus, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key === 'Escape') {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
          setEditHistory(EMPTY_EDIT_HISTORY);
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
        // Refuse to start when the user wanted camera but no device resolved.
        // Without this guard the recording proceeds silently screen-only and
        // the user discovers their face cam wasn't captured only after the take
        // (TASK-095 / camera-not-recorded report, 2026-05-09).
        if (recordCamera && !cameraDevicePath) {
          throw new Error('Camera is enabled but no camera device is selected. Pick a camera in the source dropdown or turn the camera toggle off, then start again.');
        }
        const region = captureMode === 'region' ? captureRegion : null;
        setPreRecordPanelOpen(false);
        // The preview is main-process ffmpeg, not getUserMedia; unmount stops it
        // predictably before the recording ffmpeg opens the same V4L2 device.
        await new Promise((resolve) => window.setTimeout(resolve, recordCamera ? 250 : 100));
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
      setError(appError('recording', err, 'Recording failed.'));
      if (recording.state !== 'recording') setPreRecordPanelOpen(isRecorderMode);
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
    }
  }

  async function selectScreenRegion(displayId = selectedCaptureDisplayId) {
    if (recordingActionPendingRef.current) return;
    if (!displayId) {
      setScreenPickerOpen(true);
      return;
    }
    setError(null);
    try {
      const selectedRegion = await window.roughCut.selectCaptureRegion({ displayId, initialRegion: captureRegion });
      if (!selectedRegion) {
        setScreenPickerOpen(true);
        return;
      }
      setCaptureRegion(selectedRegion);
      setSelectedCaptureDisplayId(selectedRegion.displayId ?? displayId);
      setCaptureMode('region');
      setScreenPickerOpen(false);
    } catch (err) {
      console.error('[renderer:recording] region selection failed', err);
      setError(appError('region', err, 'Region selection failed.'));
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
      setEditHistory(EMPTY_EDIT_HISTORY);
      setExportResult(null);
      setPreRecordPanelOpen(isRecorderMode);
    } catch (err) {
      console.error('[renderer:recording] cancel failed', err);
      setError(appError('recording', err, 'Cancel recording failed.'));
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
    }
  }

  async function stopAndRetryWithCameraOff() {
    if (recording.state !== 'recording') return;
    await cancelRecording();
    setRecordCamera(false);
    setDismissedCameraFailureForStartedAt(null);
    setPreRecordPanelOpen(true);
  }

  function openEditorFromRecorder() {
    if (isRecorderMode) {
      void window.roughCut.openEditor(null);
      return;
    }
    setPreRecordPanelOpen(false);
  }

  function openRegionPickerFromStrip() {
    if (recording.state === 'recording') return;
    setCaptureMode('region');
    setScreenPickerOpen(true);
    setPreRecordPanelOpen(true);
  }

  async function openProject() {
    setError(null);
    try {
      const opened = await window.roughCut.openProject();
      if (opened) {
        setProject(opened);
        setEditHistory(EMPTY_EDIT_HISTORY);
        setExportResult(null);
        setActiveAppView('editor');
      }
    } catch (err) {
      setError(appError('project', err, 'Project open failed.'));
    }
  }

  async function openProjectByPath(path: string) {
    setError(null);
    try {
      const opened = await window.roughCut.openProjectPath(path);
      if (opened) {
        setProject(opened);
        setEditHistory(EMPTY_EDIT_HISTORY);
        setExportResult(null);
        setActiveAppView('editor');
      }
    } catch (err) {
      setError(appError('project', err, 'Project open failed.'));
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
      if (result.cancelled) {
        setExportProgress(null);
        return;
      }
      setExportResult(result);
      setExportProgress(null);
    } catch (err) {
      setExportProgress(null);
      setError(appError('export', err, 'Export failed.'));
    }
  }

  async function cancelExport() {
    setError(null);
    try {
      const result = await window.roughCut.cancelExport();
      if (!result.cancelled) {
        setExportProgress(null);
        return;
      }
      setExportProgress((current) => current ? { phase: 'cancelling', progress: current.progress } : null);
    } catch (err) {
      setError(appError('export', err, 'Export cancel failed.'));
    }
  }

  async function openPath(path?: string | null) {
    if (!path) return;
    setError(null);
    try {
      const result = await window.roughCut.openPath(path);
      if (result) setError(appError('shell', result));
    } catch (err) {
      setError(appError('shell', err, 'Open path failed.'));
    }
  }

  async function showItemInFolder(path?: string | null) {
    if (!path) return;
    setError(null);
    try {
      await window.roughCut.showItemInFolder(path);
    } catch (err) {
      setError(appError('shell', err, 'Open folder failed.'));
    }
  }

  const failureDiagnosticsPath = recording.state === 'saved' && recording.diagnosticsPath ? recording.diagnosticsPath : runtimeLogPath;

  function retryLastFailedAction() {
    if (!error) return;
    if (error.source === 'export') {
      void exportProjectWithMode(exportMode);
      return;
    }
    if (error.source === 'project') {
      void openProject();
      return;
    }
    if (error.source === 'recording' || error.source === 'region') {
      setError(null);
      setPreRecordPanelOpen(true);
    }
  }

  async function copyFailureDiagnosticsPath() {
    if (!failureDiagnosticsPath) return;
    try {
      await navigator.clipboard.writeText(failureDiagnosticsPath);
    } catch (err) {
      setError(appError('shell', err, 'Could not copy diagnostics path.'));
    }
  }

  function startRetake() {
    setPreRecordPanelOpen(true);
    setRecording({ state: 'idle' });
    setDismissedCameraFailureForStartedAt(null);
    setExportResult(null);
  }

  const activeCameraFailure = recording.state === 'recording' && recording.cameraError && dismissedCameraFailureForStartedAt !== recording.startedAt
    ? { startedAt: recording.startedAt, error: recording.cameraError }
    : null;

  function applyProjectChange(next: ProjectState, options: ProjectChangeOptions = {}) {
    if (options.history && options.previous) {
      setEditHistory((history) => recordEdit(history, options.previous as ProjectState));
    }
    setProject(next);
  }

  async function restoreProjectSnapshot(next: ProjectState) {
    setProject(next);
    try {
      const saved = await saveProjectGuarded({ path: next.path, document: next.document });
      setProject(saved);
    } catch (err) {
      setError(appError('project', err, 'Could not save undo history change.'));
    }
  }

  function undoProjectEdit() {
    if (!project) return;
    const result = undoEdit(editHistory, project);
    if (!result.snapshot) return;
    setEditHistory(result.history);
    void restoreProjectSnapshot(result.snapshot);
  }

  function redoProjectEdit() {
    if (!project) return;
    const result = redoEdit(editHistory, project);
    if (!result.snapshot) return;
    setEditHistory(result.history);
    void restoreProjectSnapshot(result.snapshot);
  }

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target) || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redoProjectEdit();
      else undoProjectEdit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, editHistory]);

  if (isRecorderMode) {
    return (
      <main className="recordingLauncherShell">
        {recoveryState?.available && recording.state !== 'recording' ? (
          <RecoveryBanner
            marker={recoveryState.marker}
            actionPending={recoveryActionPending}
            onRecover={handleRecover}
            onDismiss={handleDismissRecovery}
          />
        ) : null}
        {recording.state === 'recording' ? (
          <RecordingLauncherActive
            elapsedMs={elapsedMs}
            actionPending={recordingActionPending}
            cameraFailure={activeCameraFailure}
            onStop={toggleRecording}
            onCancel={cancelRecording}
            onRetryWithoutCamera={stopAndRetryWithCameraOff}
            onContinueScreenOnly={() => setDismissedCameraFailureForStartedAt(recording.state === 'recording' ? recording.startedAt : null)}
          />
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
            captureDisplays={captureDisplays}
            selectedCaptureDisplayId={selectedCaptureDisplayId}
            screenPickerOpen={screenPickerOpen}
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
            onScreenPickerOpenChange={setScreenPickerOpen}
            onSelectedCaptureDisplayChange={setSelectedCaptureDisplayId}
            onSelectCaptureRegion={selectScreenRegion}
          />
        )}
        <StateBanner recording={recording} elapsedMs={elapsedMs} actionPending={recordingActionPending} error={error} diagnosticsPath={failureDiagnosticsPath} onRetry={retryLastFailedAction} onOpenDiagnostics={() => void openPath(failureDiagnosticsPath)} onCopyDiagnosticsPath={copyFailureDiagnosticsPath} />
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="editorShell" data-ui-shell="recording-studio">
        <header className="topBar" data-ui-region="capture-bar">
          <div className="brandCluster">
            <span className="windowDots" aria-hidden="true"><i /><i /><i /></span>
            <div>
              <p className="eyebrow">Rough Cut</p>
              <h1>Studio</h1>
            </div>
          </div>
          <div className="topActions">
            <button type="button" className="iconButton" onClick={() => setSetupBoardOpen((open) => !open)} aria-pressed={setupBoardOpen} aria-label="Toggle setup board" title="Toggle setup board">
              <Icon name="sparkle" />
            </button>
            <button type="button" className="iconButton" onClick={() => setInspectorOpen((open) => !open)} aria-pressed={inspectorOpen} aria-label="Toggle inspector board" title="Toggle inspector board">
              <Icon name="sliders" />
            </button>
            <button type="button" className="iconButton" onClick={undoProjectEdit} disabled={editHistory.undo.length === 0} aria-label="Undo last edit" title="Undo last edit">
              <Icon name="undo" />
            </button>
            <button type="button" className="iconButton" onClick={redoProjectEdit} disabled={editHistory.redo.length === 0} aria-label="Redo last edit" title="Redo last edit">
              <Icon name="redo" />
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
            captureDisplays={captureDisplays}
            selectedCaptureDisplayId={selectedCaptureDisplayId}
            screenPickerOpen={screenPickerOpen}
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
            onScreenPickerOpenChange={setScreenPickerOpen}
            onSelectedCaptureDisplayChange={setSelectedCaptureDisplayId}
            onSelectCaptureRegion={selectScreenRegion}
          />
        ) : null}
        {shortcutsOpen ? <ShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
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
              <span className="regionSummary" aria-label="Current capture region">
                {captureRegion.displayLabel ?? captureDisplays.find((display) => display.id === selectedCaptureDisplayId)?.label ?? 'Region'} · {captureRegion.width} x {captureRegion.height}
              </span>
              <button type="button" className="secondary compact" disabled={recording.state === 'recording'} onClick={openRegionPickerFromStrip}>Reselect</button>
            </div>
          ) : null}
        </div>
        <StateBanner recording={recording} elapsedMs={elapsedMs} actionPending={recordingActionPending} error={error} diagnosticsPath={failureDiagnosticsPath} onRetry={retryLastFailedAction} onOpenDiagnostics={() => void openPath(failureDiagnosticsPath)} onCopyDiagnosticsPath={copyFailureDiagnosticsPath} />
        {activeCameraFailure ? (
          <CameraFailureBanner
            error={activeCameraFailure.error}
            actionPending={recordingActionPending}
            onRetryWithoutCamera={stopAndRetryWithCameraOff}
            onContinueScreenOnly={() => setDismissedCameraFailureForStartedAt(activeCameraFailure.startedAt)}
          />
        ) : null}
        {activeAppView === 'projects' ? (
          <LibraryShell
            onOpenProjectByPath={openProjectByPath}
            onOpenProjectDialog={openProject}
            openProjectPath={project?.path ?? null}
            onRenameInFlight={setRenameInFlight}
            onCloseOpenProject={() => {
              setProject(null);
              setActiveAppView('projects');
              setEditHistory(EMPTY_EDIT_HISTORY);
              setExportResult(null);
            }}
            onProjectRenamed={(oldPath, updated) => {
              // Only the open project's state needs to swap. Other renames
              // are just visible in the gallery list (refreshKey already
              // triggers a re-fetch in LibraryShell).
              setProject((current) => (current && current.path === oldPath ? (updated as unknown as ProjectState) : current));
            }}
          />
        ) : activeAppView === 'nle' ? (
          <NleShell
            project={project as unknown as Parameters<typeof NleShell>[0]['project']}
            onProjectChange={(next) => applyProjectChange(next as unknown as ProjectState)}
            onGoToProjects={() => setActiveAppView('projects')}
          />
        ) : activeAppView === 'ai' ? (
          <AiShell
            project={project ? { path: project.path, document: project.document } : null}
            fps={project?.recording?.fps ?? 30}
            recordingDurationFrames={project?.document?.composition?.duration ?? 0}
            existingCutRanges={(() => {
              const asset = project?.document?.assets?.find((a) => a.type === 'recording');
              const presentation = asset?.presentation as
                | { cutRanges?: ReadonlyArray<{ startFrame: number; endFrame: number }> }
                | undefined;
              return presentation?.cutRanges ?? [];
            })()}
            onApplyZoomMarker={(suggestion) => {
              if (!project) return;
              const next = addManualMarkerAtFrame(
                project.document as unknown as ProjectDocument,
                suggestion.startFrame as unknown as number,
                project.recording?.fps ?? 30,
                {
                  defaultSpan:
                    (suggestion.endFrame as unknown as number) -
                    (suggestion.startFrame as unknown as number),
                },
              );
              applyProjectChange({ ...project, document: next as unknown as ProjectState['document'] });
            }}
            onApplyCutRange={(suggestion) => {
              if (!project) return;
              const recordingAsset = project.document.assets?.find((a) => a.type === 'recording');
              if (!recordingAsset?.id) return;
              const next = addCutRange(
                project.document as unknown as ProjectDocument,
                recordingAsset.id,
                suggestion.startFrame as unknown as number,
                suggestion.endFrame as unknown as number,
                project.document.composition.duration,
              );
              applyProjectChange({ ...project, document: next as unknown as ProjectState['document'] });
            }}
            onApplyTitle={(suggestion) => {
              if (!project) return;
              applyProjectChange({
                ...project,
                document: { ...project.document, name: suggestion.title },
              });
            }}
            onGoToProjects={() => setActiveAppView('projects')}
          />
        ) : project ? (
          <ProjectPreview
            project={project}
            recording={recording}
            onProjectChange={applyProjectChange}
            onExportMode={exportProjectWithMode}
            onCancelExport={cancelExport}
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
          <EditorEmptyState onGoToProjects={() => setActiveAppView('projects')} />
        )}
      </section>
      <AppViewTabStrip
        activeId={activeAppView}
        onChange={setActiveAppView}
        editorEnabled={project !== null}
      />
    </main>
  );
}

function AppViewTabStrip({ activeId, onChange, editorEnabled }: { activeId: AppViewId; onChange: (id: AppViewId) => void; editorEnabled: boolean }) {
  return (
    <nav className="appViewTabStrip" aria-label="App views" data-ui-region="app-view-tabstrip">
      {APP_VIEWS.filter((view) => !view.hiddenFromStrip).map((view) => {
        const disabled = view.id === 'editor' && !editorEnabled;
        return (
          <button
            key={view.id}
            type="button"
            className={`appViewTab ${view.id === activeId ? 'active' : ''}`}
            onClick={() => onChange(view.id)}
            aria-pressed={view.id === activeId}
            disabled={disabled}
            title={disabled ? 'Open a project from the Projects view first' : view.label}
          >
            <Icon name={view.iconName} />
            <span className="appViewTabLabel">{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function EditorEmptyState({ onGoToProjects }: { onGoToProjects: () => void }) {
  return (
    <section className="editorEmptyState" data-ui-region="editor-empty">
      <p className="eyebrow">Editor</p>
      <h2>No project loaded</h2>
      <p>Pick a project from the Projects view, or record a new take.</p>
      <button type="button" className="primaryAction" onClick={onGoToProjects}>
        <Icon name="folder" /> Open Projects
      </button>
    </section>
  );
}

function summarizeRecordingStatus(status: RecordingStatus) {
  if (status.state === 'idle') return { state: status.state };
  if (status.state === 'recording') {
    return {
      state: status.state,
      outputPath: status.outputPath,
      cameraDevicePath: status.cameraDevicePath ?? null,
      cameraError: status.cameraError ?? null,
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

function displayPositionLabel(bounds: CaptureDisplay['bounds']) {
  if (bounds.x === 0 && bounds.y === 0) return 'Origin screen';
  const horizontal = bounds.x < 0 ? 'left' : bounds.x > 0 ? 'right' : 'center';
  const vertical = bounds.y < 0 ? 'above' : bounds.y > 0 ? 'below' : 'level';
  if (horizontal === 'center') return vertical;
  if (vertical === 'level') return horizontal;
  return `${horizontal}, ${vertical}`;
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
  captureDisplays,
  selectedCaptureDisplayId,
  screenPickerOpen,
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
  onScreenPickerOpenChange,
  onSelectedCaptureDisplayChange,
  onSelectCaptureRegion,
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
  captureDisplays: CaptureDisplay[];
  selectedCaptureDisplayId: string | null;
  screenPickerOpen: boolean;
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
  onScreenPickerOpenChange: (open: boolean) => void;
  onSelectedCaptureDisplayChange: (displayId: string | null) => void;
  onSelectCaptureRegion: (displayId?: string | null) => void;
}) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(true, onClose);
  const displayWidth = Math.max(2, Math.round(preflightStatus?.display?.width ?? (captureMode === 'region' ? Math.max(captureRegion.x + captureRegion.width, 1920) : preflightStatus?.capture.width ?? 1920)));
  const displayHeight = Math.max(2, Math.round(preflightStatus?.display?.height ?? (captureMode === 'region' ? Math.max(captureRegion.y + captureRegion.height, 1080) : preflightStatus?.capture.height ?? 1080)));

  function chooseDisplay() {
    onCaptureModeChange('display');
  }

  function chooseRegion() {
    onCaptureModeChange('region');
    onScreenPickerOpenChange(true);
  }

  function chooseCaptureDisplay(displayId: string) {
    onSelectedCaptureDisplayChange(displayId);
    onSelectCaptureRegion(displayId);
  }

  return (
    <div ref={dialogRef} className="preRecordOverlay" data-ui-region="pre-record-panel" role="dialog" aria-modal="true" aria-labelledby="pre-record-title" data-focus-trap="true">
      <section className="preRecordPanel">
        <div className="preRecordHeader">
          <div>
            <p className="eyebrow">New recording</p>
            <h2 id="pre-record-title">Ready to record?</h2>
          </div>
          <button type="button" className="secondary compact" onClick={onClose} disabled={actionPending}>Cancel</button>
        </div>

        <div className="preRecordBody">
          <div className="preRecordControls">
            <section className="preRecordSection">
              <ControlRow icon="display" label="Capture">
                <select value={captureMode} disabled={actionPending} onChange={(event) => {
                  const nextMode = event.currentTarget.value as CaptureMode;
                  if (nextMode === 'region') {
                    chooseRegion();
                    return;
                  }
                  onCaptureModeChange(nextMode);
                }} aria-label="Capture target">
                  <option value="display">Full display</option>
                  <option value="region">Region</option>
                </select>
              </ControlRow>
              <div className="sourcePickerGrid" data-ui-region="capture-source-picker" aria-label="Capture source picker">
                <button type="button" className={`sourcePickerCard ${captureMode === 'display' ? 'selected' : ''}`} data-source-option="display" aria-pressed={captureMode === 'display'} disabled={actionPending} onClick={chooseDisplay}>
                  <span>Full display</span>
                  <small>{displayWidth} x {displayHeight}</small>
                </button>
                <button type="button" className={`sourcePickerCard ${captureMode === 'region' ? 'selected' : ''}`} data-source-option="region" aria-pressed={captureMode === 'region'} disabled={actionPending} onClick={chooseRegion}>
                  <span>Region</span>
                  <small>{captureRegion.width} x {captureRegion.height}</small>
                </button>
                <button type="button" className="sourcePickerCard disabled" data-source-option="window" disabled title="Window capture needs platform-specific support">
                  <span>Window</span>
                  <small>Unavailable on this build</small>
                  <span className="sourcePickerCardBadge" aria-hidden="true">Coming with portal support</span>
                </button>
              </div>
              {captureMode === 'region' ? (
                <div className="preRecordRegionSummary" aria-label="Selected capture region">
                  <span>{captureRegion.displayLabel ?? captureDisplays.find((display) => display.id === selectedCaptureDisplayId)?.label ?? 'Screen'} · {captureRegion.width} x {captureRegion.height}</span>
                  <small>{screenPickerOpen ? 'Choose a screen, then mark the region.' : 'Region selected. You can reselect the screen or area.'}</small>
                  <button type="button" className="secondary compact" disabled={actionPending} onClick={() => onScreenPickerOpenChange(true)}>Reselect screen</button>
                  <button type="button" className="secondary compact" disabled={actionPending || !selectedCaptureDisplayId} onClick={() => onSelectCaptureRegion(selectedCaptureDisplayId)}>Reselect region</button>
                </div>
              ) : null}
              {captureMode === 'region' && screenPickerOpen ? (
                <div className="screenPickerGrid" data-ui-region="capture-screen-picker" aria-label="Choose screen for region capture">
                  {captureDisplays.length > 0 ? captureDisplays.map((display) => (
                    <button
                      key={display.id}
                      type="button"
                      className={`screenPickerCard ${display.id === selectedCaptureDisplayId ? 'selected' : ''}`}
                      data-screen-option={display.id}
                      aria-pressed={display.id === selectedCaptureDisplayId}
                      disabled={actionPending}
                      onClick={() => chooseCaptureDisplay(display.id)}
                    >
                      <span>{display.label}{display.primary ? ' · Primary' : ''}</span>
                      <small>{display.bounds.width} x {display.bounds.height} · {displayPositionLabel(display.bounds)}</small>
                    </button>
                  )) : <p className="recordingActiveHint">No screens were reported by Electron.</p>}
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

        </div>

        <div className="preRecordFooter">
          <PreflightSummary status={preflightStatus} />
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
  const [preview, setPreview] = React.useState<{ token: string | null; frameUrl: string | null; state: 'starting' | 'live' | 'error'; error: string | null }>({ token: null, frameUrl: null, state: 'starting', error: null });

  React.useEffect(() => {
    if (!source?.name) return undefined;
    let cancelled = false;
    let token: string | null = null;
    setPreview({ token: null, frameUrl: null, state: 'starting', error: null });
    const removeFrameListener = window.roughCut.onCameraPreviewFrame((frame) => {
      if (cancelled || frame.token !== token) return;
      setPreview({ token, frameUrl: frame.dataUrl, state: 'live', error: null });
    });
    window.roughCut.startCameraPreview({ devicePath: source.name })
      .then((started) => {
        if (cancelled) {
          void window.roughCut.stopCameraPreview(started.token);
          return;
        }
        token = started.token;
        setPreview((current) => ({ ...current, token }));
      })
      .catch((err) => {
        if (!cancelled) setPreview({ token: null, frameUrl: null, state: 'error', error: err instanceof Error ? err.message : 'Camera preview failed.' });
      });
    return () => {
      cancelled = true;
      removeFrameListener();
      if (token) void window.roughCut.stopCameraPreview(token);
    };
  }, [source?.name]);

  const previewState = preview.state === 'live' ? 'live' : preview.state === 'error' ? 'error' : 'starting';
  return (
    <section className="preRecordCameraSetup" data-ui-region="pre-record-camera-setup" aria-label="Camera PiP setup preview">
      <div>
        <p className="eyebrow">Camera PiP</p>
        <h3>{label}</h3>
      </div>
      <div className={`cameraSetupPreview ${previewState}`} data-camera-preview-state={previewState}>
        {preview.frameUrl ? <img src={preview.frameUrl} alt="Live camera preview" /> : <span className="cameraSetupScreen" />}
        <span className="cameraSetupBubble"><Icon name="camera" /></span>
        <span className="cameraSetupStatus">{previewState === 'live' ? 'Live preview' : previewState === 'error' ? preview.error ?? 'Preview unavailable' : 'Starting preview'}</span>
      </div>
    </section>
  );
}

function RecordingLauncherActive({ elapsedMs, actionPending, cameraFailure, onStop, onCancel, onRetryWithoutCamera, onContinueScreenOnly }: { elapsedMs: number; actionPending: boolean; cameraFailure: { error: string } | null; onStop: () => void; onCancel: () => void; onRetryWithoutCamera: () => void; onContinueScreenOnly: () => void }) {
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
        {cameraFailure ? (
          <CameraFailureBanner
            error={cameraFailure.error}
            actionPending={actionPending}
            onRetryWithoutCamera={onRetryWithoutCamera}
            onContinueScreenOnly={onContinueScreenOnly}
          />
        ) : null}
        <p className="recordingActiveHint">Pause is intentionally pending segment recording, so cancel removes the current take instead of saving a corrupt pause.</p>
      </section>
    </div>
  );
}

function CameraFailureBanner({ error, actionPending, onRetryWithoutCamera, onContinueScreenOnly }: { error: string; actionPending: boolean; onRetryWithoutCamera: () => void; onContinueScreenOnly: () => void }) {
  return (
    <section className="cameraFailureBanner" data-ui-region="recording-camera-failure" role="alert" aria-live="assertive">
      <div>
        <p className="eyebrow">Camera not recording</p>
        <p>The screen capture is still running, but webcam PiP is off: {error}</p>
      </div>
      <div className="cameraFailureActions">
        <button type="button" className="secondary compact" disabled={actionPending} onClick={onRetryWithoutCamera}>Stop and retry with camera off</button>
        <button type="button" className="secondary compact" disabled={actionPending} onClick={onContinueScreenOnly}>Continue screen-only</button>
      </div>
    </section>
  );
}

function RecoveryBanner({
  marker,
  actionPending,
  onRecover,
  onDismiss,
}: {
  marker: RecoveryMarker | null;
  actionPending: boolean;
  onRecover: () => void;
  onDismiss: () => void;
}) {
  const startedLabel = marker?.startedAt ? new Date(marker.startedAt).toLocaleString() : 'an earlier session';
  return (
    <div className="recoveryBanner" role="alertdialog" aria-label="Recover last recording">
      <div className="recoveryBannerCopy">
        <p className="eyebrow">Unfinished recording detected</p>
        <p>
          Rough Cut found a recording that wasn’t saved cleanly (started {startedLabel}). Recover it now or discard the
          leftover files.
        </p>
      </div>
      <div className="recoveryBannerActions">
        <button type="button" className="primaryAction" onClick={onRecover} disabled={actionPending}>
          {actionPending ? 'Recovering...' : 'Recover'}
        </button>
        <button type="button" className="secondary" onClick={onDismiss} disabled={actionPending}>
          Discard
        </button>
      </div>
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
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const checks = status?.checks ?? [];
  const warnings = checks.filter((check) => check.severity !== 'ok');
  const statusLabel = status ? (warnings.length > 0 ? `${warnings.length} risk${warnings.length === 1 ? '' : 's'}` : 'Ready') : 'Checking';
  return (
    <section className={`preflightSummary ${status?.status ?? 'loading'}`} data-ui-region="recording-preflight-status" aria-live="polite">
      <div className="preflightCompactRow">
        <span className="preflightIcon" aria-hidden="true"><Icon name="settings" /></span>
        <span className="preflightLabel">Preflight</span>
        <span className={`preflightStatusPill ${warnings.length > 0 ? 'warn' : ''}`}>{statusLabel}</span>
        {status ? <span className="preflightMeta"><Icon name="display" /> {status.capture.width || 'unknown'} x {status.capture.height || 'unknown'}</span> : <span className="preflightMeta">Checking</span>}
        {status ? <span className="preflightMeta"><Icon name="timeline" /> {status.capture.fps} FPS</span> : null}
        {status ? (
          <button type="button" className="secondary compact preflightDetailsToggle" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen}>
            <Icon name="sliders" /> {detailsOpen ? 'Hide' : checks.length}
          </button>
        ) : null}
      </div>
      {detailsOpen ? (
        <div className="preflightGrid details">
          {checks.map((check) => (
            <div key={check.id} className={`preflightCheck ${check.severity}`}>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StateBanner({
  recording,
  elapsedMs,
  actionPending,
  error,
  diagnosticsPath,
  onRetry,
  onOpenDiagnostics,
  onCopyDiagnosticsPath,
}: {
  recording: RecordingStatus;
  elapsedMs: number;
  actionPending: boolean;
  error: AppError | null;
  diagnosticsPath?: string | null;
  onRetry?: () => void;
  onOpenDiagnostics?: () => void;
  onCopyDiagnosticsPath?: () => void;
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
      {error ? (
        <div className="stateBannerActions" data-ui-region="failure-actions">
          {onRetry ? <button type="button" className="secondary compact" onClick={onRetry}>Retry</button> : null}
          <button type="button" className="secondary compact" disabled={!diagnosticsPath} onClick={onOpenDiagnostics}>Open diagnostics</button>
          <button type="button" className="secondary compact" disabled={!diagnosticsPath} onClick={onCopyDiagnosticsPath}>Copy log path</button>
        </div>
      ) : null}
      {recording.state === 'saved' && recording.cameraError ? (
        <p className="warning">Camera was unavailable, so the screen recording was saved without webcam PiP: {recording.cameraError}</p>
      ) : null}
    </section>
  );
}

function stateCopy(recording: RecordingStatus, elapsedMs: number, state: string, error: AppError | null) {
  if (error) {
    return errorStateCopy(error);
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

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(true, onClose);
  const shortcuts = [
    ['Space', 'Play or pause preview'],
    ['J / K / L', 'Slow playback, pause, speed up'],
    ['Timeline focus + arrows', 'Move playhead one frame; hold Shift for one second'],
    ['Trim / zoom focus + arrows', 'Nudge selected boundary one frame; hold Shift for one second'],
    ['[ / ]', 'Set trim start or end to playhead'],
    ['Ctrl/Cmd + E', 'Export with the selected preset'],
    ['?', 'Show this shortcut sheet'],
    ['Ctrl/Cmd + Z', 'Undo last edit'],
    ['Ctrl/Cmd + Shift + Z', 'Redo last edit'],
  ];
  return (
    <div ref={dialogRef} className="shortcutsScrim" data-ui-region="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" data-focus-trap="true">
      <section className="shortcutsDialog">
        <div className="shortcutsHeader">
          <div>
            <p className="eyebrow">Keyboard</p>
            <h2 id="shortcuts-title">Shortcuts</h2>
          </div>
          <button type="button" className="secondary compact" onClick={onClose}>Close</button>
        </div>
        <div className="shortcutsList">
          {shortcuts.map(([keys, label]) => (
            <div key={keys} className="shortcutRow">
              <kbd>{keys}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function useDialogFocusTrap<T extends HTMLElement>(active: boolean, onEscape?: () => void) {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = getFocusableElements(root);
    (focusables[0] ?? root).focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = getFocusableElements(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', handleKeyDown);
    return () => {
      root.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [active, onEscape]);
  return ref;
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>([
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(','))).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function captureStatusLabel(recording: RecordingStatus, elapsedMs: number) {
  if (recording.state === 'recording') return formatElapsed(elapsedMs);
  if (recording.state === 'saved') return 'Saved';
  return 'Screen';
}

type IconName = 'folder' | 'sparkle' | 'sliders' | 'undo' | 'redo' | 'record' | 'stop' | 'frame' | 'timeline' | 'cursor' | 'camera' | 'caption' | 'settings' | 'export' | 'display' | 'mic' | 'volume' | 'play' | 'pause';
type ActiveTool = 'background' | 'timeline' | 'cursor' | 'camera';

const ICON_COMPONENT_MAP: Record<IconName, PhosphorIconType> = {
  folder: PhosphorFolder,
  sparkle: PhosphorSparkle,
  sliders: PhosphorSlidersHorizontal,
  undo: PhosphorArrowCounterClockwise,
  redo: PhosphorArrowClockwise,
  record: PhosphorRecord,
  stop: PhosphorStop,
  frame: PhosphorFrameCorners,
  timeline: PhosphorFilmStrip,
  cursor: PhosphorCursorClick,
  camera: PhosphorVideoCamera,
  caption: PhosphorClosedCaptioning,
  settings: PhosphorGearSix,
  export: PhosphorExport,
  display: PhosphorMonitor,
  mic: PhosphorMicrophone,
  volume: PhosphorSpeakerHigh,
  play: PhosphorPlay,
  pause: PhosphorPause,
};

function Icon({ name }: { name: IconName }) {
  const Component = ICON_COMPONENT_MAP[name];
  return <Component size={20} weight="duotone" className="icon" aria-hidden />;
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
    { id: 'cursor', icon: 'cursor', label: 'Cursor' },
    { id: 'camera', icon: 'camera', label: 'Camera' },
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

function InspectorSection({ id, title, children, description, muted = false, action }: { id: InspectorGroupId | string; title: string; children: React.ReactNode; description?: string; muted?: boolean; action?: React.ReactNode }) {
  return (
    <section className={`inspectorSection ${muted ? 'mutedSection' : ''}`} data-inspector-group={id} aria-label={title}>
      <div className="inspectorSectionHead">
        <p className="eyebrow">{title}</p>
        {action ? <div className="inspectorSectionAction">{action}</div> : null}
      </div>
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

// Inline cursor-size preview for the Cursor inspector. The preview canvas
// often shows a frame where the cursor isn't visible (cursor parked off-
// screen at the current playhead), so the Size slider feels like a no-op.
// This SVG mirrors the styled-export polygon and scales with sizePercent
// so the user gets immediate feedback next to the slider.
const CURSOR_PREVIEW_POLYGON = '0,0 0,26 7,20 12,33 18,31 13,19 24,19';
function CursorSizePreview({ sizePercent }: { sizePercent: number }) {
  const clamped = Math.max(50, Math.min(150, Number.isFinite(sizePercent) ? sizePercent : 100));
  const scale = clamped / 100;
  // ViewBox covers the polygon (24×33) plus a small margin so the largest
  // scale (1.5×) still fits without clipping. Render area is fixed so the
  // slider row's height never shifts as the user drags.
  const vbSize = 60;
  const inset = (vbSize - 24 * scale) / 2;
  const insetY = (vbSize - 33 * scale) / 2;
  return (
    <svg
      className="cursorSizePreview"
      width={32}
      height={32}
      viewBox={`0 0 ${vbSize} ${vbSize}`}
      aria-hidden="true"
    >
      <g transform={`translate(${inset}, ${insetY}) scale(${scale})`}>
        <polygon points={CURSOR_PREVIEW_POLYGON} fill="#ffffff" stroke="#333A46" strokeWidth={2.2 / scale} strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function CursorStylePicker({ value, disabled = false, onChange }: { value: CursorStyle; disabled?: boolean; onChange: (value: CursorStyle) => void }) {
  return (
    <div className="segmentedPicker" role="radiogroup" aria-label="Cursor style">
      {CURSOR_STYLE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          className={`segmentedOption cursorStyleOption cursorStyle-${option.value}${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
          data-cursor-style={option.value}
        >
          <span className="cursorStyleSwatch" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              {option.value === 'spotlight' ? <circle cx="12" cy="14" r="9" fill="rgba(122,167,255,0.28)" /> : null}
              <path d="m6 3 11 11-5 1.2L9.4 20 6 3Z" fill="#ffffff" stroke={option.value === 'spotlight' ? '#7AA7FF' : '#333A46'} strokeWidth={option.value === 'spotlight' ? 1.6 : 1.2} opacity={option.value === 'subtle' ? 0.6 : 1} />
            </svg>
          </span>
          <span className="segmentedLabel">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, description, action, size = 'default' }: { icon: IconName; title: string; description?: string; action?: { label: string; onClick: () => void; disabled?: boolean }; size?: 'default' | 'compact' }) {
  return (
    <div className={`emptyState emptyState-${size}`} role="status">
      <span className="emptyStateIcon" aria-hidden="true"><Icon name={icon} /></span>
      <p className="emptyStateTitle">{title}</p>
      {description ? <p className="emptyStateDescription">{description}</p> : null}
      {action ? (
        <button type="button" className="secondary compact emptyStateAction" disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function CursorClickEffectPicker({ value, disabled = false, onChange }: { value: ClickEffect; disabled?: boolean; onChange: (value: ClickEffect) => void }) {
  return (
    <div className="segmentedPicker" role="radiogroup" aria-label="Click effect">
      {CURSOR_CLICK_EFFECT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          className={`segmentedOption clickEffectOption clickEffect-${option.value}${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
          data-click-effect={option.value}
        >
          <span className="cursorStyleSwatch" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              {option.value === 'ring' ? <circle cx="12" cy="12" r="8" fill="none" stroke="#7AA7FF" strokeWidth="2" /> : null}
              {option.value === 'ripple' ? <circle cx="12" cy="12" r="8" fill="rgba(122,167,255,0.36)" /> : null}
              {option.value === 'none' ? <path d="M5 5l14 14M5 19L19 5" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" /> : null}
            </svg>
          </span>
          <span className="segmentedLabel">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function aspectRatioDims(aspectRatio: string): [number, number] {
  if (aspectRatio === '9:16') return [9, 16];
  if (aspectRatio === '1:1') return [1, 1];
  if (aspectRatio === '4:3') return [4, 3];
  if (aspectRatio === '3:4') return [3, 4];
  if (aspectRatio === '4:5') return [4, 5];
  return [16, 9];
}

type CameraThumbProps = {
  position: CameraPosition;
  shape: CameraShape;
  size: number;
  roundness: number;
  visible: boolean;
};

type TemplateThumbnailProps = {
  aspectRatio: ProjectAspectRatio;
  cameraFrame: NormalizedRect | null;
  camera: CameraThumbProps;
};

// Pictorial mini-render. CSS background handles solid + gradient natively
// (no SVG gradient-parse), SVG overlay paints the screen and camera with
// depth so the thumbnail reads as a tiny preview of the canvas, not as a
// schematic. Faithful to resolveCameraFrame / resolveCameraRadius.
// Minimal indicator. The Recordly approach for layout previews is a tiny
// icon, not a fake render — they use real <img> tiles only for true
// background images. We don't have real screenshots, so the icon shows
// only what's structurally informative: canvas aspect (outer rect),
// camera position (dot in corner). No background tint, no fake screen
// gradient, no fake webcam blob. Keep it small.
function TemplateThumbnail({ aspectRatio, cameraFrame, camera }: TemplateThumbnailProps) {
  const [aspectW, aspectH] = aspectRatioDims(aspectRatio);
  const vbW = aspectW * 100;
  const vbH = aspectH * 100;
  const minDim = Math.min(vbW, vbH);

  // Camera position: corner inset or center. The dot is fixed-size in
  // viewbox units so it reads as the same physical size on every aspect
  // ratio. If the user dragged a custom cameraFrame, honor its center.
  const dotRadius = minDim * 0.1;
  const margin = minDim * 0.16;
  let dotX: number;
  let dotY: number;
  if (cameraFrame) {
    dotX = (cameraFrame.x + cameraFrame.w / 2) * vbW;
    dotY = (cameraFrame.y + cameraFrame.h / 2) * vbH;
  } else {
    const position = camera.position ?? 'corner-br';
    if (position === 'center') {
      dotX = vbW / 2;
      dotY = vbH / 2;
    } else {
      const left = position.endsWith('bl') || position.endsWith('tl');
      const top = position.endsWith('tl') || position.endsWith('tr');
      dotX = left ? margin : vbW - margin;
      dotY = top ? margin : vbH - margin;
    }
  }

  // Camera shape signal — circle vs rounded vs square via the dot's own
  // corner radius. Subtle but encodes the shape choice.
  const dotShapeRadius =
    camera.shape === 'square' ? 0
    : camera.shape === 'circle' ? dotRadius
    : dotRadius * 0.45;

  return (
    <svg
      className="templateThumbSvg"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
      role="img"
      aria-hidden="true"
    >
      {/* Canvas outline — represents the aspect ratio. No fill, just a
          thin border so the dot reads against any card background. */}
      <rect
        x={2}
        y={2}
        width={vbW - 4}
        height={vbH - 4}
        rx={minDim * 0.06}
        ry={minDim * 0.06}
        fill="rgba(255, 255, 255, 0.04)"
        stroke="rgba(255, 255, 255, 0.32)"
        strokeWidth={1.5}
      />
      {camera.visible !== false ? (
        camera.shape === 'circle' ? (
          <circle
            cx={dotX}
            cy={dotY}
            r={dotRadius}
            fill="var(--accent)"
          />
        ) : (
          <rect
            x={dotX - dotRadius}
            y={dotY - dotRadius}
            width={dotRadius * 2}
            height={dotRadius * 2}
            rx={dotShapeRadius}
            ry={dotShapeRadius}
            fill="var(--accent)"
          />
        )
      ) : null}
    </svg>
  );
}

function templateMetaLine(aspectRatio: string, position: CameraPosition): string {
  const corner =
    position === 'center' ? 'Center camera'
    : position === 'corner-br' ? 'BR camera'
    : position === 'corner-bl' ? 'BL camera'
    : position === 'corner-tr' ? 'TR camera'
    : position === 'corner-tl' ? 'TL camera'
    : '';
  return `${aspectRatio} · ${corner}`;
}

function builtInTemplateThumbnailProps(template: typeof RECORDING_TEMPLATE_PRESETS[number]): TemplateThumbnailProps {
  return {
    aspectRatio: template.aspectRatio,
    cameraFrame: null,
    camera: {
      position: template.camera.position,
      shape: template.camera.shape,
      size: template.camera.size,
      roundness: template.camera.roundness,
      visible: template.camera.visible,
    },
  };
}


function TemplatePresetGrid({
  disabled = false,
  value,
  onSelect,
  userTemplates = [],
  appliedUserTemplateId = null,
  onApplyUserTemplate,
  onSaveUserTemplate,
  onRenameUserTemplate,
  onDeleteUserTemplate,
  canSave = false,
}: {
  disabled?: boolean;
  value?: string;
  onSelect?: (id: string) => void;
  userTemplates?: UserRecordingTemplate[];
  appliedUserTemplateId?: string | null;
  onApplyUserTemplate?: (template: UserRecordingTemplate) => void;
  onSaveUserTemplate?: (label: string) => Promise<void> | void;
  onRenameUserTemplate?: (id: string, label: string) => Promise<void> | void;
  onDeleteUserTemplate?: (id: string) => Promise<void> | void;
  canSave?: boolean;
}) {
  const [savePending, setSavePending] = React.useState(false);
  const [saveLabel, setSaveLabel] = React.useState('');
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameLabel, setRenameLabel] = React.useState('');
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const saveInputRef = React.useRef<HTMLInputElement | null>(null);
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (savePending) saveInputRef.current?.focus();
  }, [savePending]);
  React.useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  const closeSave = () => { setSavePending(false); setSaveLabel(''); };
  const closeRename = () => { setRenamingId(null); setRenameLabel(''); };

  const commitSave = async () => {
    const label = saveLabel.trim();
    if (!label || !onSaveUserTemplate) { closeSave(); return; }
    setBusy(true);
    try { await onSaveUserTemplate(label); closeSave(); } finally { setBusy(false); }
  };

  const commitRename = async () => {
    const label = renameLabel.trim();
    if (!renamingId || !label || !onRenameUserTemplate) { closeRename(); return; }
    setBusy(true);
    try { await onRenameUserTemplate(renamingId, label); closeRename(); } finally { setBusy(false); }
  };

  const commitDelete = async (id: string) => {
    if (!onDeleteUserTemplate) return;
    setBusy(true);
    try { await onDeleteUserTemplate(id); setPendingDeleteId(null); } finally { setBusy(false); }
  };

  const inputsDisabled = disabled || busy;
  const showSavedSection = userTemplates.length > 0 || onSaveUserTemplate != null;

  return (
    <div className="inspectorPresetGroup" data-template-preset-grid="true">
      <div className="templateGrid" aria-label="Recording templates">
        {RECORDING_TEMPLATE_PRESETS.map((template) => (
          <button
            type="button"
            key={template.id}
            aria-label={template.label}
            aria-pressed={value === template.id}
            className={value === template.id ? 'templateCard active' : 'templateCard'}
            disabled={disabled}
            data-template-id={template.id}
            onClick={() => onSelect?.(template.id)}
            title={template.description}
          >
            <span className="templateCardFrame" aria-hidden="true">
              <TemplateThumbnail {...builtInTemplateThumbnailProps(template)} />
            </span>
            <span className="templateCardText">
              <span className="templateCardLabel">{template.label}</span>
              <span className="templateCardMeta">{templateMetaLine(template.aspectRatio, template.camera.position)}</span>
            </span>
          </button>
        ))}
      </div>

      {showSavedSection ? (
        <>
          <div className="templateGridDivider" role="presentation">
            <span>Saved</span>
            <span className="templateGridDividerCount" aria-label={`${userTemplates.length} saved`}>{userTemplates.length}</span>
          </div>
          <ul className="presetList" aria-label="Saved presets" data-user-template-grid="true">
            {userTemplates.map((template) => {
              const isActive = appliedUserTemplateId === template.id;
              const isRenaming = renamingId === template.id;
              const isPendingDelete = pendingDeleteId === template.id;
              if (isRenaming) {
                return (
                  <li key={template.id} className="presetRow editing" data-user-template-id={template.id}>
                    <input
                      ref={renameInputRef}
                      className="presetRowInput"
                      type="text"
                      value={renameLabel}
                      maxLength={40}
                      disabled={inputsDisabled}
                      onChange={(e) => setRenameLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                        else if (e.key === 'Escape') { e.preventDefault(); closeRename(); }
                      }}
                      onBlur={() => commitRename()}
                      aria-label="Rename preset"
                    />
                  </li>
                );
              }
              if (isPendingDelete) {
                return (
                  <li key={template.id} className="presetRow confirming" data-user-template-id={template.id}>
                    <span className="presetRowConfirmTitle">Delete &ldquo;{template.label}&rdquo;?</span>
                    <div className="presetRowConfirmActions">
                      <button type="button" className="presetRowConfirmButton danger" disabled={inputsDisabled} onClick={() => commitDelete(template.id)}>Delete</button>
                      <button type="button" className="presetRowConfirmButton" disabled={inputsDisabled} onClick={() => setPendingDeleteId(null)}>Cancel</button>
                    </div>
                  </li>
                );
              }
              return (
                <li
                  key={template.id}
                  className={isActive ? 'presetRow active' : 'presetRow'}
                  data-user-template-id={template.id}
                >
                  <button
                    type="button"
                    className="presetRowLabel"
                    aria-label={`Apply ${template.label}`}
                    aria-pressed={isActive}
                    disabled={disabled}
                    title={`Apply ${template.label}`}
                    onClick={() => onApplyUserTemplate?.(template)}
                  >
                    {isActive ? <span className="presetRowActiveDot" aria-hidden="true" /> : null}
                    <span className="presetRowName">{template.label || 'Untitled preset'}</span>
                  </button>
                  <button
                    type="button"
                    className="presetRowAction"
                    aria-label={`Rename ${template.label}`}
                    title="Rename"
                    disabled={inputsDisabled}
                    onClick={() => { setRenamingId(template.id); setRenameLabel(template.label); }}
                  >
                    <PhosphorPencilSimple size={13} weight="duotone" />
                  </button>
                  <button
                    type="button"
                    className="presetRowAction danger"
                    aria-label={`Delete ${template.label}`}
                    title="Delete"
                    disabled={inputsDisabled}
                    onClick={() => setPendingDeleteId(template.id)}
                  >
                    <PhosphorTrash size={13} weight="duotone" />
                  </button>
                </li>
              );
            })}
          </ul>
          {onSaveUserTemplate ? (
            <div className="presetSaveRow" data-template-add-form="true">
              <input
                ref={saveInputRef}
                className="presetSaveInput"
                type="text"
                value={saveLabel}
                placeholder="Name a new preset…"
                maxLength={40}
                disabled={inputsDisabled || !canSave}
                onChange={(e) => { setSaveLabel(e.target.value); if (!savePending) setSavePending(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitSave(); }
                  else if (e.key === 'Escape') { e.preventDefault(); closeSave(); }
                }}
                onFocus={() => setSavePending(true)}
                aria-label="New preset name"
              />
              <button
                type="button"
                className="presetSaveButton"
                disabled={disabled || busy || !canSave || !saveLabel.trim()}
                title={canSave ? 'Save current settings as a preset' : 'Open a recording to save a preset'}
                onClick={() => commitSave()}
              >
                Save
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function InspectorActionRow({ children, region }: { children: React.ReactNode; region?: string }) {
  return <div className="actionsArea inspectorActionRow" data-ui-region={region}>{children}</div>;
}

function EditorToolBoard({ activeTool, project, fps, background, cameraPresentation, cursorPresentation, hasCamera = false, aspectRatio = 'auto', disabled = false, trimInfo, cutRanges = [], userTemplates = [], appliedUserTemplateId = null, onProjectChange, onBackgroundChange, onCameraPresentationChange, onCursorPresentationChange, onCameraFrameChange, onAspectRatioChange, onTemplatePresetSelect, onApplyUserTemplate, onSaveUserTemplate, onRenameUserTemplate, onDeleteUserTemplate, onResetTrim, onRemoveCutRange, onClearCutRanges }: { activeTool: ActiveTool; project?: ProjectState; fps?: number; currentTimeSec?: number; background?: RecordingBackgroundStyle; cameraPresentation?: CameraPresentation; cursorPresentation?: CursorPresentation; hasCamera?: boolean; aspectRatio?: ProjectAspectRatio; disabled?: boolean; selectedZoomMarker?: ZoomMarker | null; trimInfo?: TrimInfo; cutRanges?: CutRange[]; userTemplates?: UserRecordingTemplate[]; appliedUserTemplateId?: string | null; onProjectChange?: (next: ProjectState, options?: ProjectChangeOptions) => void; onBackgroundChange?: (patch: Partial<RecordingBackgroundStyle>) => void; onCameraPresentationChange?: (patch: Partial<CameraPresentation>) => void; onCursorPresentationChange?: (patch: Partial<CursorPresentation>) => void; onCameraFrameChange?: (frame: { x: number; y: number; w: number; h: number } | null) => void; onAspectRatioChange?: (ratio: ProjectAspectRatio) => void; onTemplatePresetSelect?: (templateId: string) => void; onApplyUserTemplate?: (template: UserRecordingTemplate) => void; onSaveUserTemplate?: (label: string) => Promise<void> | void; onRenameUserTemplate?: (id: string, label: string) => Promise<void> | void; onDeleteUserTemplate?: (id: string) => Promise<void> | void; onZoomMarkerStrengthChange?: (markerId: string, strength: number) => void; onResetTrim?: () => void; onRemoveCutRange?: (cutRangeId: string) => void; onClearCutRanges?: () => void }) {
  const bg = background ?? DEFAULT_RECORDING_BACKGROUND;
  const camera = cameraPresentation ?? DEFAULT_CAMERA_PRESENTATION;
  const cursor = cursorPresentation ?? DEFAULT_CURSOR_PRESENTATION;
  const projectLoaded = Boolean(project?.recording);
  const activeBackgroundPreset = RECORDING_BACKGROUND_PRESETS.find((preset) => preset.style.bgImage ? preset.style.bgImage === bg.bgImage : (preset.style.bgColor === bg.bgColor && preset.style.bgGradient === bg.bgGradient))?.id;
  const activeTemplatePreset = findRecordingTemplatePresetId(aspectRatio, bg);
  const handleTemplatePresetSelect = (templateId: string) => {
    if (onTemplatePresetSelect) {
      onTemplatePresetSelect(templateId);
      return;
    }
    const applied = applyRecordingTemplatePreset(bg, templateId);
    if (!applied) return;
    onAspectRatioChange?.(applied.aspectRatio);
    // Built-in templates leave the user's background alone (it's user-owned;
    // only the explicit Save-as-preset flow captures background).
    onCameraPresentationChange?.(applied.camera);
    onCameraFrameChange?.(null);
  };
  if (activeTool === 'timeline') {
    return (
      <aside className="setupBoard" aria-label="Timeline board">
        <BoardHeader icon="timeline" title="Timeline" action={trimInfo?.isTrimmed ? 'Reset trim' : undefined} actionDisabled={disabled || !trimInfo?.isTrimmed} onAction={onResetTrim} />
        {project?.recording && fps && onProjectChange ? (
          <div className="timelineBoardStack" data-ui-region="timeline-zoom-control-panel">
            <AutoZoomSuggestionsPanel project={project} onProjectChange={onProjectChange} />
            <CameraFollowPanel project={project} onProjectChange={onProjectChange} />
            <InspectorSection id="cuts" title="Cuts" description="Use the cut tool above the timeline to drag a range you want to hide.">
              <div className="cutRangePanel" data-cut-range-panel="true">
                <div className="timelineCompactRow"><span>Removed</span><strong>{cutRanges.length}</strong></div>
                <InspectorActionRow>
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
                ) : null}
              </div>
            </InspectorSection>
          </div>
        ) : (
          <EmptyState icon="timeline" title="No timeline yet" description="Record a take or open a project to edit zoom markers, trims, and cuts." />
        )}
      </aside>
    );
  }

  if (activeTool === 'camera') {
    return (
      <aside className="setupBoard" aria-label="Camera board">
        <BoardHeader icon="camera" title="Camera" action="Reset" actionDisabled={disabled || !hasCamera} onAction={() => onCameraPresentationChange?.(DEFAULT_CAMERA_PRESENTATION)} />
        {hasCamera ? (
          <InspectorSection id="camera" title="Webcam PiP" description="Saved with the project; styled export uses these values.">
            <div data-camera-pip-controls="true">
              <InspectorToggle label="Show camera" checked={camera.visible} disabled={disabled} onChange={(visible) => onCameraPresentationChange?.({ visible })} />
              <InspectorSelect label="Position" value={camera.position} options={CAMERA_POSITION_OPTIONS} disabled={disabled || !camera.visible} onChange={(position) => onCameraPresentationChange?.({ position })} />
              <InspectorSelect label="Shape" value={camera.shape} options={CAMERA_SHAPE_OPTIONS} disabled={disabled || !camera.visible} onChange={(shape) => onCameraPresentationChange?.({ shape })} />
              <InspectorSlider label="Camera size" value={camera.size} min={50} max={200} step={5} disabled={disabled || !camera.visible} onChange={(size) => onCameraPresentationChange?.({ size })} />
              <InspectorSlider label="Camera roundness" value={camera.roundness} min={0} max={100} step={5} disabled={disabled || !camera.visible || camera.shape !== 'rounded'} onChange={(roundness) => onCameraPresentationChange?.({ roundness })} />
            </div>
          </InspectorSection>
        ) : (
          <EmptyState icon="camera" title="No webcam recorded" description="This take was captured without a camera. Start a new recording with the camera enabled to add a PiP overlay." />
        )}
      </aside>
    );
  }

  if (activeTool === 'cursor') {
    return (
      <aside className="setupBoard cursorBoard" aria-label="Cursor board">
        <BoardHeader icon="cursor" title="Cursor" action="Reset" actionDisabled={disabled || !projectLoaded} onAction={() => onCursorPresentationChange?.(DEFAULT_CURSOR_PRESENTATION)} />
        {projectLoaded ? (
          <div className="flatGroup" data-inspector-group="cursor" data-cursor-controls="true">
            <CursorStylePicker value={cursor.style} disabled={disabled} onChange={(style) => onCursorPresentationChange?.({ style })} />
            <div className="cursorSizeRow">
              <CursorSizePreview sizePercent={cursor.sizePercent} />
              <InspectorSlider label="Size" value={cursor.sizePercent} min={50} max={150} step={5} disabled={disabled} onChange={(sizePercent) => onCursorPresentationChange?.({ sizePercent })} />
            </div>
            <div className="flatGroupDivider" aria-hidden="true" />
            <CursorClickEffectPicker value={cursor.clickEffect} disabled={disabled} onChange={(clickEffect) => onCursorPresentationChange?.({ clickEffect })} />
            <InspectorToggle label="Play click sound" checked={cursor.clickSoundEnabled} disabled={disabled} onChange={(clickSoundEnabled) => onCursorPresentationChange?.({ clickSoundEnabled })} />
          </div>
        ) : (
          <EmptyState icon="cursor" title="No project loaded" description="Open a recording or start a new one to tweak cursor style and click effects." />
        )}
      </aside>
    );
  }

  return (
    <aside className="setupBoard" aria-label="Background board">
      <BoardHeader icon="sparkle" title="Background" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.(DEFAULT_RECORDING_BACKGROUND)} />
      <InspectorSection id="templates" title="Templates" description="One click sets aspect ratio, background, and camera together.">
        <TemplatePresetGrid
          disabled={disabled}
          value={activeTemplatePreset}
          onSelect={handleTemplatePresetSelect}
          userTemplates={userTemplates}
          appliedUserTemplateId={appliedUserTemplateId}
          onApplyUserTemplate={onApplyUserTemplate}
          onSaveUserTemplate={onSaveUserTemplate}
          onRenameUserTemplate={onRenameUserTemplate}
          onDeleteUserTemplate={onDeleteUserTemplate}
          canSave={projectLoaded}
        />
      </InspectorSection>
      <InspectorSection id="canvas-background" title="Canvas background">
        <InspectorPresetGrid label="Background presets" disabled={disabled} value={activeBackgroundPreset} onSelect={(presetId) => onBackgroundChange?.(applyRecordingBackgroundPreset(bg, presetId))} />
      </InspectorSection>
      <BoardHeader icon="frame" title="Frame" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.({ bgPadding: DEFAULT_RECORDING_BACKGROUND.bgPadding, bgCornerRadius: DEFAULT_RECORDING_BACKGROUND.bgCornerRadius, bgInset: DEFAULT_RECORDING_BACKGROUND.bgInset, bgInsetColor: DEFAULT_RECORDING_BACKGROUND.bgInsetColor })} />
      <InspectorSection id="screen-frame" title="Frame">
        <InspectorSlider label="Outline" value={bg.bgInset} min={0} max={16} step={1} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgInset: value })} />
        <InspectorSlider label="Radius" value={bg.bgCornerRadius} min={0} max={120} step={2} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgCornerRadius: value })} />
        <InspectorSlider label="Padding" value={bg.bgPadding} min={0} max={260} step={4} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgPadding: value })} />
      </InspectorSection>
      <BoardHeader icon="frame" title="Shadow" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.({ bgShadowEnabled: DEFAULT_RECORDING_BACKGROUND.bgShadowEnabled, bgShadowBlur: DEFAULT_RECORDING_BACKGROUND.bgShadowBlur, bgShadowOpacity: DEFAULT_RECORDING_BACKGROUND.bgShadowOpacity, bgShadowOffsetY: DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY, bgShadowOffsetX: DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetX })} />
      <InspectorSection id="screen-shadow" title="Shadow">
        <InspectorToggle label="Enable shadow" checked={bg.bgShadowEnabled} disabled={disabled} onChange={(checked) => onBackgroundChange?.({ bgShadowEnabled: checked })} />
        <InspectorSlider label="Strength" value={bg.bgShadowOpacity} min={0} max={0.8} step={0.05} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowOpacity: value })} />
        <InspectorSlider label="Softness" value={bg.bgShadowBlur} min={0} max={140} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => onBackgroundChange?.({ bgShadowBlur: value })} />
        {(() => {
          const offsetX = bg.bgShadowOffsetX ?? 0;
          const offsetY = bg.bgShadowOffsetY ?? DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY ?? 34;
          const distance = Math.round(Math.hypot(offsetX, offsetY));
          const angle = distance === 0 ? 0 : Math.round((Math.atan2(offsetX, offsetY) * 180) / Math.PI);
          const setPolar = (nextDistance: number, nextAngle: number) => {
            const rad = (nextAngle * Math.PI) / 180;
            onBackgroundChange?.({
              bgShadowOffsetY: Math.round(nextDistance * Math.cos(rad)),
              bgShadowOffsetX: Math.round(nextDistance * Math.sin(rad)),
            });
          };
          return (
            <>
              <InspectorSlider label="Distance" value={distance} min={0} max={120} step={2} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => setPolar(value, angle)} />
              <InspectorSlider label="Angle" value={angle} min={-90} max={90} step={1} disabled={disabled || !bg.bgShadowEnabled} onChange={(value) => setPolar(distance, value)} />
            </>
          );
        })()}
      </InspectorSection>
    </aside>
  );
}


function PostRecordingReview({ project, recording, exportProgress, onExportMode, onCancelExport, onOpenProject, onOpenRecordingFolder, onOpenDiagnostics, onRetake }: { project: ProjectState; recording: RecordingStatus; exportProgress: ExportProgress | null; onExportMode: (mode: ExportMode) => void; onCancelExport: () => void; onOpenProject: () => void; onOpenRecordingFolder: () => void; onOpenDiagnostics: () => void; onRetake: () => void }) {
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
        {exportProgress ? <button type="button" className="secondary danger" data-export-action="cancel" onClick={onCancelExport}><Icon name="stop" /> Cancel export</button> : null}
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
  onCancelExport,
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
  onProjectChange: (next: ProjectState, options?: ProjectChangeOptions) => void;
  onExportMode: (mode: ExportMode) => void;
  onCancelExport: () => void;
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
  const [cutModeActive, setCutModeActive] = React.useState(false);
  const [sourceMediaDurationSec, setSourceMediaDurationSec] = React.useState<number | null>(null);
  const isTimelineScrubbingRef = React.useRef(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [userTemplates, setUserTemplates] = React.useState<UserRecordingTemplate[]>([]);
  const [appliedUserTemplateId, setAppliedUserTemplateId] = React.useState<string | null>(null);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const effectiveRecording = React.useMemo(() => {
    if (!project.recording) return null;
    if (!Number.isFinite(sourceMediaDurationSec) || sourceMediaDurationSec === null || sourceMediaDurationSec <= 0) return project.recording;
    const fps = project.recording.fps || 30;
    const mediaFrames = Math.max(1, Math.round(sourceMediaDurationSec * fps));
    return { ...project.recording, duration: Math.min(project.recording.duration, mediaFrames) };
  }, [project.recording, sourceMediaDurationSec]);
  const effectiveProject = effectiveRecording ? { ...project, recording: effectiveRecording } : project;
  const recordingAsset = getPrimaryRecordingAsset(project.document);
  const primaryClip = getPrimaryRecordingClip(project.document, recordingAsset?.id);
  const trimInfo = resolveTrimInfo(primaryClip, effectiveRecording?.duration ?? project.document.composition.duration, effectiveRecording?.fps ?? 30);
  const cutRanges = recordingAsset?.id && effectiveRecording ? listCutRanges(project.document as unknown as ProjectDocument, recordingAsset.id, effectiveRecording.duration) as CutRange[] : [];
  const activeCutRanges = clipCutRangesToTrim(cutRanges, trimInfo);
  const background = recordingAsset?.presentation?.background ?? DEFAULT_RECORDING_BACKGROUND;
  const selectedZoomMarker = inspectorSelection.markerId ? listMarkers(project.document as unknown as ProjectDocument).find((marker) => marker.id === inspectorSelection.markerId) ?? null : null;
  const hasCamera = Boolean(recordingAsset?.cameraAssetId && project.cameraMediaUrl);
  const cameraPresentation: CameraPresentation = {
    ...DEFAULT_CAMERA_PRESENTATION,
    ...((recordingAsset?.presentation?.camera as Partial<CameraPresentation> | undefined) ?? {}),
  };
  const cursorPresentation: CursorPresentation = {
    ...DEFAULT_CURSOR_PRESENTATION,
    ...((recordingAsset?.presentation?.cursor as Partial<CursorPresentation> | undefined) ?? {}),
  };

  React.useEffect(() => {
    if (!effectiveRecording) return;
    const maxTimeSec = effectiveRecording.duration / (effectiveRecording.fps || 30);
    setCurrentTimeSec((value) => Math.min(value, maxTimeSec));
    setTimelineSeekSec((value) => Math.min(value, maxTimeSec));
  }, [effectiveRecording]);

  async function persist(nextDocument: ProjectState['document']) {
    const previous = project;
    const optimistic = { ...project, document: nextDocument };
    setSaveError(null);
    setIsSaving(true);
    onProjectChange(optimistic, { history: true, previous });
    try {
      const saved = await saveProjectGuarded({ path: project.path, document: nextDocument });
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

  async function updateCursorPresentation(patch: Partial<CursorPresentation>) {
    if (!recordingAsset?.id) return;
    const nextDocument = {
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation);
        const nextCursor: CursorPresentation = {
          ...DEFAULT_CURSOR_PRESENTATION,
          ...(presentation.cursor ?? {}),
          ...patch,
        };
        return {
          ...asset,
          presentation: {
            ...presentation,
            cursor: nextCursor,
          },
        };
      }),
    };
    await persist(syncRecordingTimelinePresentation(nextDocument, recordingAsset.id) as ProjectState['document']);
  }

  async function updateCameraPresentation(patch: Partial<CameraPresentation>) {
    if (!recordingAsset?.id || !hasCamera) return;
    const nextDocument = {
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
    };
    await persist(syncRecordingTimelinePresentation(nextDocument, recordingAsset.id) as ProjectState['document']);
  }

  async function updateCameraFrame(frame: { x: number; y: number; w: number; h: number } | null) {
    if (!recordingAsset?.id) return;
    await persist({
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
        const next: Record<string, unknown> = { ...presentation };
        if (frame) {
          next.cameraFrame = {
            x: clampUnit(frame.x),
            y: clampUnit(frame.y),
            w: clampUnit(frame.w, 0.05),
            h: clampUnit(frame.h, 0.05),
          };
        } else {
          delete next.cameraFrame;
        }
        return { ...asset, presentation: next };
      }),
    });
  }

  async function updateScreenFrame(frame: { x: number; y: number; w: number; h: number } | null) {
    if (!recordingAsset?.id) return;
    await persist({
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
        const next: Record<string, unknown> = { ...presentation };
        if (frame) {
          next.screenFrame = {
            x: clampUnit(frame.x),
            y: clampUnit(frame.y),
            w: clampUnit(frame.w, 0.05),
            h: clampUnit(frame.h, 0.05),
          };
        } else {
          delete next.screenFrame;
        }
        return { ...asset, presentation: next };
      }),
    });
  }

  async function applyTemplatePreset(templateId: string) {
    const applied = applyRecordingTemplatePreset(background, templateId);
    if (!applied) return;
    await persist({
      ...project.document,
      settings: {
        ...project.document.settings,
        aspectRatio: applied.aspectRatio,
      },
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset?.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
        // Built-in templates set aspect + camera defaults. Background is
        // user-owned and intentionally preserved across template switches —
        // only the user's explicit Save-as-preset flow captures it. The
        // manually-dragged camera/screen positions also stay untouched; to
        // reset layout, apply a saved user-template (which carries the
        // full snapshot including cameraFrame/screenFrame/background).
        const nextPresentation: Record<string, unknown> = {
          ...presentation,
          camera: {
            ...DEFAULT_CAMERA_PRESENTATION,
            ...((presentation.camera as Partial<CameraPresentation> | undefined) ?? {}),
            ...applied.camera,
          },
        };
        return { ...asset, presentation: nextPresentation };
      }),
    });
    setAppliedUserTemplateId(null);
  }

  React.useEffect(() => {
    let cancelled = false;
    window.roughCut.listUserTemplates().then(
      (list) => { if (!cancelled) setUserTemplates(list); },
      () => { /* missing or unreadable file → empty list is the right default */ },
    );
    return () => { cancelled = true; };
  }, []);

  async function applyUserTemplate(template: UserRecordingTemplate) {
    // Saved user templates are authoritative for layout. Replace the camera
    // and frame fields fully (no merge with current presentation) so the
    // user gets back exactly what they saved, including the drag positions.
    setAppliedUserTemplateId(template.id);
    // Strip undefined values from template.camera so they don't shadow
    // DEFAULT_CAMERA_PRESENTATION (older saved templates omit the optional
    // shadow/padding fields entirely; we want defaults to fill in).
    const templateCamera: Partial<CameraPresentation> = {};
    for (const [key, value] of Object.entries(template.camera)) {
      if (value !== undefined) (templateCamera as Record<string, unknown>)[key] = value;
    }
    await persist({
      ...project.document,
      settings: { ...project.document.settings, aspectRatio: template.aspectRatio },
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset?.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
        const nextPresentation: Record<string, unknown> = {
          ...presentation,
          background: template.background,
          camera: { ...DEFAULT_CAMERA_PRESENTATION, ...templateCamera },
        };
        if (template.screenFrame) nextPresentation.screenFrame = template.screenFrame;
        else delete nextPresentation.screenFrame;
        if (template.cameraFrame) nextPresentation.cameraFrame = template.cameraFrame;
        else delete nextPresentation.cameraFrame;
        return { ...asset, presentation: nextPresentation };
      }),
    });
  }

  async function saveUserTemplate(label: string) {
    const recPresentation = recordingAsset?.presentation as Record<string, unknown> | undefined;
    const screenFrame = (recPresentation?.screenFrame as NormalizedRect | undefined) ?? null;
    const cameraFrame = (recPresentation?.cameraFrame as NormalizedRect | undefined) ?? null;
    const saved = await window.roughCut.saveUserTemplate({
      label,
      aspectRatio,
      background,
      camera: cameraPresentation,
      presentation: { screenFrame, cameraFrame },
    });
    setUserTemplates((list) => [...list, saved]);
    setAppliedUserTemplateId(saved.id);
  }

  async function renameUserTemplate(id: string, label: string) {
    const updated = await window.roughCut.renameUserTemplate({ id, label });
    setUserTemplates((list) => list.map((t) => (t.id === id ? updated : t)));
  }

  async function deleteUserTemplate(id: string) {
    await window.roughCut.deleteUserTemplate({ id });
    setUserTemplates((list) => list.filter((t) => t.id !== id));
    setAppliedUserTemplateId((current) => (current === id ? null : current));
  }

  async function updateTrim(nextStartFrame: number, nextEndFrame: number) {
    if (!recordingAsset?.id || !effectiveRecording) return;
    const totalFrames = Math.max(1, effectiveRecording.duration);
    const startFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(nextStartFrame)));
    const endFrame = Math.max(startFrame + 1, Math.min(totalFrames, Math.round(nextEndFrame)));
    const durationFrames = endFrame - startFrame;
    const cameraOffset = Math.max(0, Math.round((effectiveRecording.camera as { sourceInFrames?: number } | undefined)?.sourceInFrames ?? 0));
    await persist(updateRecordingTimelineTrim(project.document, { assetId: recordingAsset.id, cameraAssetId: recordingAsset.cameraAssetId as string | null | undefined, cameraOffset, startFrame, endFrame }) as ProjectState['document']);
    setCurrentTimeSec(Math.min(currentTimeSec, durationFrames / (effectiveRecording.fps || 30)));
  }

  function setTrimStartToPlayhead() {
    if (!effectiveRecording) return;
    updateTrim(Math.round(currentTimeSec * effectiveRecording.fps), trimInfo.endFrame);
  }

  function setTrimEndToPlayhead() {
    if (!effectiveRecording) return;
    updateTrim(trimInfo.startFrame, Math.round(currentTimeSec * effectiveRecording.fps));
  }

  function resetTrim() {
    if (!recordingAsset?.id) return;
    void persist(restoreRecordingFullSource(project.document, { assetId: recordingAsset.id }) as ProjectState['document']);
  }

  async function restoreCut(cutRangeId: string) {
    if (!recordingAsset?.id || !effectiveRecording) return;
    const nextDocument = removeCutRange(project.document as unknown as ProjectDocument, recordingAsset.id, cutRangeId, effectiveRecording.duration) as unknown as ProjectState['document'];
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

  async function removeZoomMarker(markerId: string) {
    const nextDocument = removeMarker(project.document as unknown as ProjectDocument, markerId) as unknown as ProjectState['document'];
    if (nextDocument === project.document) return;
    await persist(nextDocument);
  }

  async function addZoomMarkerAtTime(sourceTimeSec: number) {
    if (!effectiveRecording) return;
    const fps = effectiveRecording.fps;
    const frame = Math.round(sourceTimeSec * fps);
    const nextDocument = addManualMarkerAtFrame(project.document as unknown as ProjectDocument, frame, fps) as unknown as ProjectState['document'];
    if (nextDocument === project.document) return;
    await persist(nextDocument);
  }

  async function addCutBetween(startFrame: number, endFrame: number) {
    if (!recordingAsset?.id || !effectiveRecording) return;
    const nextDocument = rippleDeleteRecordingRange(project.document as unknown as ProjectDocument, {
      assetId: recordingAsset.id,
      startFrame,
      endFrame,
    }) as unknown as ProjectState['document'];
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

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target) || event.repeat) return;
      const maxTimeSec = effectiveRecording ? effectiveRecording.duration / (effectiveRecording.fps || 30) : 0;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onExportMode(exportMode);
        return;
      }
      if (!effectiveRecording) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextTimeSec = Math.max(0, Math.min(maxTimeSec, currentTimeSec + direction));
        setCurrentTimeSec(nextTimeSec);
        setTimelineSeekSec(nextTimeSec);
      } else if (event.key === '[') {
        event.preventDefault();
        setTrimStartToPlayhead();
      } else if (event.key === ']') {
        event.preventDefault();
        setTrimEndToPlayhead();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTimeSec, effectiveRecording, exportMode, onExportMode, trimInfo]);

  function focusInspectorContext(selection: InspectorSelection) {
    setInspectorSelection(selection);
    // Timeline owns zoom marker, recording-clip, and cursor-event selections; camera lives on its own tab.
    if (selection.group === 'camera') {
      onActiveToolChange('camera');
    } else if (selection.group === 'cursor' || selection.group === 'zoom' || selection.group === 'recording') {
      onActiveToolChange('timeline');
    }
  }

  return (
    <section className={`projectEditor ${setupBoardOpen ? '' : 'setupClosed'} ${inspectorOpen ? '' : 'inspectorClosed'}`} aria-label="Project editor" data-ui-region="editor-workspace">
      <ToolRail active={activeTool} onSelect={onActiveToolChange} />
      <EditorToolBoard activeTool={activeTool} project={effectiveProject} fps={effectiveRecording?.fps} background={background} cameraPresentation={cameraPresentation} cursorPresentation={cursorPresentation} hasCamera={hasCamera} aspectRatio={aspectRatio} disabled={isSaving} trimInfo={trimInfo} cutRanges={activeCutRanges} userTemplates={userTemplates} appliedUserTemplateId={appliedUserTemplateId} onProjectChange={onProjectChange} onBackgroundChange={updateBackground} onCameraPresentationChange={updateCameraPresentation} onCursorPresentationChange={updateCursorPresentation} onCameraFrameChange={updateCameraFrame} onAspectRatioChange={updateAspectRatio} onTemplatePresetSelect={applyTemplatePreset} onApplyUserTemplate={applyUserTemplate} onSaveUserTemplate={saveUserTemplate} onRenameUserTemplate={renameUserTemplate} onDeleteUserTemplate={deleteUserTemplate} onResetTrim={resetTrim} onRemoveCutRange={restoreCut} onClearCutRanges={clearCuts} />
      <div className="stageColumn" aria-label="Central stage" data-ui-region="central-stage">
        <div className="projectHeader">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>{project.document.name}</h2>
          </div>
          {project.recording ? (
            <p className="meta">
              {recording.state === 'saved' ? <span className="savedChip">Saved</span> : null}
              {effectiveRecording?.width ?? project.recording.width}x{effectiveRecording?.height ?? project.recording.height} · {effectiveRecording?.fps ?? project.recording.fps} fps · {effectiveRecording?.duration ?? project.recording.duration} frames
            </p>
          ) : null}
        </div>
        {project.mediaUrl ? (
          <VideoPreview project={effectiveProject} seekTimeSec={timelineSeekSec} timeMode="timeline" onCurrentTimeChange={setCurrentTimeSec} onCameraFrameChange={updateCameraFrame} onScreenFrameChange={updateScreenFrame} onSourceMediaDurationChange={setSourceMediaDurationSec} />
        ) : (
          // P-AI-C/TASK-169 — empty-state for blank projects (no assets). The
          // NLE Editor view will be the proper home for blank projects once it
          // lands; until then Recording edit is the only available landing.
          <section className="projectPreviewEmpty" data-testid="project-preview-empty" aria-label="Blank project empty state">
            <h3>This project has no recording yet.</h3>
            <p>Record a new take to start editing, or import a file from the Projects view.</p>
            <button type="button" className="libraryOpenFile" onClick={onRetake}>Record a take</button>
          </section>
        )}
        <div className="timelineDock" aria-label="Timeline and review rail" data-ui-region="timeline-review-rail">
          <div className="timelineHeader">
          <p className="eyebrow"><Icon name="timeline" /> Timeline</p>
            <span>{formatClock(currentTimeSec)}</span>
          </div>
          {effectiveRecording ? <VisualTimeline project={effectiveProject} currentTimeSec={currentTimeSec} selectedZoomMarkerId={selectedZoomMarker?.id ?? null} cutRanges={activeCutRanges} cutModeActive={cutModeActive} onCutModeToggle={() => setCutModeActive((v) => !v)} onScrub={handleTimelineScrub} onScrubStart={handleTimelineScrubStart} onScrubEnd={handleTimelineScrubEnd} onTrimStart={(sourceTimeSec) => updateTrim(Math.round(sourceTimeSec * effectiveRecording.fps), trimInfo.endFrame)} onTrimEnd={(sourceTimeSec) => updateTrim(trimInfo.startFrame, Math.round(sourceTimeSec * effectiveRecording.fps))} onRestoreTrimStart={() => recordingAsset?.id ? void persist(restoreRecordingSourceEdge(project.document, { assetId: recordingAsset.id, edge: 'head' }) as ProjectState['document']) : undefined} onRestoreTrimEnd={() => recordingAsset?.id ? void persist(restoreRecordingSourceEdge(project.document, { assetId: recordingAsset.id, edge: 'tail' }) as ProjectState['document']) : undefined} onResetTrim={resetTrim} onRestoreCut={restoreCut} onZoomMarkerRangeChange={updateZoomMarkerRange} onZoomMarkerRemove={removeZoomMarker} onZoomMarkerStrengthChange={updateZoomMarkerStrength} onAddZoomMarkerAt={addZoomMarkerAtTime} onAddCutBetween={addCutBetween} onSelectInspectorContext={focusInspectorContext} /> : null}
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
          onCancelExport={onCancelExport}
          onOpenProject={() => onOpenPath(project.path)}
          onOpenRecordingFolder={() => onShowItemInFolder(project.recording?.filePath)}
          onOpenDiagnostics={() => onOpenPath(recording.state === 'saved' ? recording.diagnosticsPath : null)}
          onRetake={onRetake}
        />
        <InspectorSection id="export" title="Export status">
          <ExportPresetDetails mode={exportMode} aspectRatio={aspectRatio} />
          <InspectorActionRow region="export-status-area">
            {exportProgress ? <ExportProgressMeter progress={exportProgress} /> : null}
            {exportResult ? <p className="saved">Exported to: {exportResult.outputPath} ({exportResult.bytes} bytes)</p> : null}
            {!exportProgress && !exportResult ? <p className="inspectorNotice">Choose Styled or Raw from the review actions above.</p> : null}
          </InspectorActionRow>
        </InspectorSection>
        {saveError ? <p className="error">{saveError}</p> : null}
      </aside>
    </section>
  );
}

function ExportProgressMeter({ progress }: { progress: ExportProgress }) {
  const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
  const label = progress.phase === 'cancelling' ? 'Cancelling export' : progress.phase === 'picking' ? 'Preparing export' : progress.phase.replace(/-/g, ' ');
  return (
    <div className="exportProgressMeter" data-export-progress-meter="true" aria-label={`Export progress: ${label} ${percent}%`}>
      <div className="exportProgressMeta">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="exportProgressTrack" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function getPrimaryRecordingAsset(document: ProjectState['document']) {
  return document.assets?.find((asset) => asset.type === 'recording') ?? null;
}

function getPrimaryRecordingClip(document: ProjectState['document'], assetId?: string | null): PrimaryClip | null {
  if (!assetId) return null;
  const timelineClip = getRecordingTimelineClip(document, assetId) as PrimaryClip | null;
  if (timelineClip) return timelineClip;
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

function VisualTimeline({ project, currentTimeSec, selectedZoomMarkerId = null, cutRanges = [], cutModeActive = false, onCutModeToggle, onScrub, onScrubStart, onScrubEnd, onTrimStart, onTrimEnd, onRestoreTrimStart, onRestoreTrimEnd, onResetTrim, onRestoreCut, onZoomMarkerRangeChange, onZoomMarkerRemove, onZoomMarkerStrengthChange, onAddZoomMarkerAt, onAddCutBetween, onSelectInspectorContext }: { project: ProjectState; currentTimeSec: number; selectedZoomMarkerId?: string | null; cutRanges?: CutRange[]; cutModeActive?: boolean; onCutModeToggle?: () => void; onScrub: (timeSec: number) => void; onScrubStart: () => void; onScrubEnd: (timeSec: number) => void; onTrimStart: (sourceTimeSec: number) => void; onTrimEnd: (sourceTimeSec: number) => void; onRestoreTrimStart: () => void; onRestoreTrimEnd: () => void; onResetTrim: () => void; onRestoreCut: (cutRangeId: string) => void; onZoomMarkerRangeChange: (markerId: string, startFrame: number, endFrame: number) => void; onZoomMarkerRemove?: (markerId: string) => void; onZoomMarkerStrengthChange?: (markerId: string, strength: number) => void; onAddZoomMarkerAt?: (sourceTimeSec: number) => void; onAddCutBetween?: (startFrame: number, endFrame: number) => void; onSelectInspectorContext: (selection: InspectorSelection) => void }) {
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
  const [cutDragPreview, setCutDragPreview] = React.useState<{ startFrame: number; endFrame: number } | null>(null);

  // Exit cut mode on Escape.
  React.useEffect(() => {
    if (!cutModeActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCutModeToggle?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cutModeActive, onCutModeToggle]);

  function handleScreenLaneCutPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!cutModeActive || !onAddCutBetween) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget;
    track.setPointerCapture(event.pointerId);
    const startFrame = sourceFrameFromClient(track, event.clientX);
    if (startFrame === null) return;
    setCutDragPreview({ startFrame, endFrame: startFrame });
    const move = (moveEvent: PointerEvent) => {
      const endFrame = sourceFrameFromClient(track, moveEvent.clientX);
      if (endFrame === null) return;
      setCutDragPreview({ startFrame, endFrame });
    };
    const up = (upEvent: PointerEvent) => {
      const endFrame = sourceFrameFromClient(track, upEvent.clientX);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setCutDragPreview(null);
      if (endFrame === null || Math.abs(endFrame - startFrame) < 2) return;
      onAddCutBetween(Math.min(startFrame, endFrame), Math.max(startFrame, endFrame));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function handleZoomLanePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!onAddZoomMarkerAt) return;
    if (event.button !== 0) return;
    // Skip if the press landed on an existing region (don't add inside markers).
    if ((event.target as HTMLElement).closest('.timelineRegion, .zoomResizeHandle, .zoomRegionDelete')) return;
    const track = event.currentTarget;
    const downFrame = sourceFrameFromClient(track, event.clientX);
    if (downFrame === null) return;
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const upFrame = sourceFrameFromClient(track, upEvent.clientX);
      if (upFrame === null) return;
      // Mirror cut tool's click-vs-drag gate: only fire on a low-movement
      // release so accidental drags don't drop phantom markers.
      if (Math.abs(upFrame - downFrame) >= 2) return;
      onAddZoomMarkerAt(downFrame / fps);
    };
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

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

  function nudgeTimelinePlayhead(direction: -1 | 1, largeStep: boolean) {
    const stepSec = largeStep ? 1 : 1 / fps;
    const nextSourceTime = Math.max(0, Math.min(model.durationSec, model.currentTimeSec + direction * stepSec));
    const nextVisibleTime = sourceToVisibleTime(nextSourceTime);
    onScrub(nextVisibleTime);
    onScrubEnd(nextVisibleTime);
  }

  function handleScrubberKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      onScrubStart();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    nudgeTimelinePlayhead(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey);
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

  function nudgeTrimHandle(kind: 'start' | 'end', direction: -1 | 1, largeStep: boolean) {
    const stepFrames = largeStep ? Math.max(1, Math.round(fps)) : 1;
    if (kind === 'start') {
      const nextStartFrame = Math.max(0, Math.min(model.trimEndFrame - 1, model.trimStartFrame + direction * stepFrames));
      onTrimStart(nextStartFrame / fps);
      onScrubEnd(sourceToVisibleTime(nextStartFrame / fps));
      return;
    }
    const nextEndFrame = Math.max(model.trimStartFrame + 1, Math.min(sourceFrameDuration, model.trimEndFrame + direction * stepFrames));
    onTrimEnd(nextEndFrame / fps);
    onScrubEnd(sourceToVisibleTime(nextEndFrame / fps));
  }

  function handleTrimHandleKey(kind: 'start' | 'end', event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    nudgeTrimHandle(kind, event.key === 'ArrowRight' ? 1 : -1, event.shiftKey);
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
    // Clamp drag to the VISIBLE trim window, not the raw recording duration.
    // Dragging a marker past the trim boundary would silently remove it from
    // the rail (the rail filters markers to those overlapping [trimStart, trimEnd]).
    const minFrame = Math.max(0, model.trimStartFrame);
    const maxFrame = Math.max(minFrame + 1, Math.min(sourceFrameDuration, model.trimEndFrame));
    let latest = { id: region.id, startFrame: initialStart, endFrame: initialEnd };
    setZoomDragPreview(latest);

    const update = (clientX: number) => {
      const frame = sourceFrameFromClient(handle, clientX);
      if (frame === null) return;
      if (mode === 'move') {
        const delta = frame - initialFrame;
        const startFrame = Math.max(minFrame, Math.min(maxFrame - duration, initialStart + delta));
        latest = { id: region.id, startFrame, endFrame: startFrame + duration };
      } else if (mode === 'start') {
        const startFrame = Math.max(minFrame, Math.min(initialEnd - 15, frame));
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

  function nudgeZoomRegion(region: { id: string; startFrame?: number; endFrame?: number }, mode: 'move' | 'start' | 'end', direction: -1 | 1, largeStep: boolean) {
    if (!Number.isFinite(region.startFrame) || !Number.isFinite(region.endFrame)) return;
    const stepFrames = largeStep ? Math.max(1, Math.round(fps)) : 1;
    const delta = direction * stepFrames;
    const initialStart = Math.round(region.startFrame ?? 0);
    const initialEnd = Math.round(region.endFrame ?? initialStart + 15);
    const duration = Math.max(15, initialEnd - initialStart);
    const maxFrame = Math.max(1, Math.round(project.recording?.duration ?? sourceFrameDuration));
    if (mode === 'move') {
      const startFrame = Math.max(0, Math.min(maxFrame - duration, initialStart + delta));
      onZoomMarkerRangeChange(region.id, startFrame, startFrame + duration);
      return;
    }
    if (mode === 'start') {
      onZoomMarkerRangeChange(region.id, Math.max(0, Math.min(initialEnd - 15, initialStart + delta)), initialEnd);
      return;
    }
    onZoomMarkerRangeChange(region.id, initialStart, Math.max(initialStart + 15, Math.min(maxFrame, initialEnd + delta)));
  }

  function handleZoomKeyboard(region: { id: string; startFrame?: number; endFrame?: number }, mode: 'move' | 'start' | 'end', event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onSelectInspectorContext({ group: 'zoom', label: 'Zoom region', detail: 'Zoom region selected from the timeline.', markerId: region.id });
      return;
    }
    if (event.key === 'Delete' && mode === 'move' && onZoomMarkerRemove) {
      event.preventDefault();
      event.stopPropagation();
      onZoomMarkerRemove(region.id);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    nudgeZoomRegion(region, mode, event.key === 'ArrowRight' ? 1 : -1, event.shiftKey);
  }

  function zoomRegionStyle(region: { id: string; left: number; width: number; startFrame?: number; endFrame?: number }) {
    if (zoomDragPreview?.id !== region.id) return { left: `${region.left}%`, width: `${region.width}%` };
    const placement = frameRangeToPlacement(zoomDragPreview.startFrame - model.trimStartFrame, zoomDragPreview.endFrame - model.trimStartFrame, fps, model.durationSec);
    return { left: `${placement.left}%`, width: `${placement.width}%` };
  }

  return (
    <div className="visualTimeline" aria-label="Timeline overview">
      <span className="visuallyHidden" data-ui-region="timeline-live-region" aria-live="polite">Timeline position {formatClock(model.currentTimeSec)}</span>
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
            step="any"
            value={model.currentTimeSec}
            aria-valuetext={`Timeline position ${formatClock(model.currentTimeSec)}`}
            onWheelCapture={preventRangeWheelChange}
            onPointerDown={onScrubStart}
            onPointerUp={(event) => commitScrub(event.currentTarget.value)}
            onPointerCancel={(event) => commitScrub(event.currentTarget.value)}
            onKeyDown={handleScrubberKeyDown}
            onKeyUp={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return;
              commitScrub(event.currentTarget.value);
            }}
            onInput={(event) => scrubFromInput(event.currentTarget.value)}
            onChange={(event) => scrubFromInput(event.currentTarget.value)}
          />
          <span className="playhead" style={{ left: `${model.playheadPercent}%` }} />
        </div>
        <div className="timelineToolbar" data-ui-region="timeline-toolbar">
          <button
            type="button"
            className={cutModeActive ? 'timelineToolButton active' : 'timelineToolButton'}
            aria-label="Cut tool"
            aria-pressed={cutModeActive}
            title={cutModeActive ? 'Cut tool active — drag a range on the screen lane. Esc to exit.' : 'Cut tool — drag a range on the screen lane to remove it.'}
            onClick={() => onCutModeToggle?.()}
          >
            <PhosphorScissors size={16} weight="duotone" />
          </button>
        </div>
        <TimelineLane label="Screen" className={`screenLane ${cutModeActive ? 'cutModeActive' : ''}`} onTrackPointerDown={cutModeActive ? handleScreenLaneCutPointerDown : undefined} trackTitle={cutModeActive ? 'Drag to mark a cut range' : undefined}>
          {model.lanes.screen.map((region) => (
            <div key={region.id} className="clipBar" style={{ left: `${region.left}%`, width: `${region.width}%` }}>
              <button type="button" role="slider" className="trimHandle trimHandleStart" aria-label="Trim start" aria-valuemin={0} aria-valuemax={Math.max(0, model.trimEndFrame - 1)} aria-valuenow={model.trimStartFrame} aria-valuetext={`Trim start ${model.trimStartFrame} frames`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleTrimHandleKey('start', event)} onPointerDown={(event) => beginTrimDrag('start', event)} />
              <button type="button" className="clipBody" onClick={() => onSelectInspectorContext({ group: 'recording', label: 'Screen recording', detail: 'Source clip selected from the timeline.' })}><Icon name="frame" /> Clip</button>
              <button type="button" role="slider" className="trimHandle trimHandleEnd" aria-label="Trim end" aria-valuemin={model.trimStartFrame + 1} aria-valuemax={sourceFrameDuration} aria-valuenow={model.trimEndFrame} aria-valuetext={`Trim end ${model.trimEndFrame} frames`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleTrimHandleKey('end', event)} onPointerDown={(event) => beginTrimDrag('end', event)} />
            </div>
          ))}
          {cutDragPreview ? (() => {
            const start = Math.min(cutDragPreview.startFrame, cutDragPreview.endFrame);
            const end = Math.max(cutDragPreview.startFrame, cutDragPreview.endFrame);
            const placement = frameRangeToPlacement(start - model.trimStartFrame, end - model.trimStartFrame, fps, model.durationSec);
            return <div className="cutDragPreview" style={{ left: `${placement.left}%`, width: `${placement.width}%` }} aria-hidden="true" />;
          })() : null}
          {hasHiddenStart ? <button type="button" className="hiddenTrimRange hiddenTrimStart" aria-label="Restore hidden start" title={`Restore hidden start (${model.trimStartFrame} frames)`} onClick={onRestoreTrimStart}>Hidden start</button> : null}
          {hasHiddenEnd ? <button type="button" className="hiddenTrimRange hiddenTrimEnd" aria-label="Restore hidden end" title={`Restore hidden end (${sourceFrameDuration - model.trimEndFrame} frames)`} style={{ left: `${hiddenTailLeft}%`, width: `${hiddenTailWidth}%` }} onClick={onRestoreTrimEnd}>Hidden end</button> : null}
          {cutRanges.map((range) => {
            const placement = frameRangeToPlacement(range.startFrame - model.trimStartFrame, range.endFrame - model.trimStartFrame, fps, model.durationSec);
            return <button key={range.id} type="button" className="hiddenCutRange" aria-label={`Restore cut ${formatClock((range.startFrame - model.trimStartFrame) / fps)} to ${formatClock((range.endFrame - model.trimStartFrame) / fps)}`} title="Restore this hidden middle range" style={{ left: `${placement.left}%`, width: `${placement.width}%` }} onClick={() => onRestoreCut(range.id)}>Restore cut</button>;
          })}
          {hasHiddenStart || hasHiddenEnd ? <button type="button" className="restoreFullSource" aria-label="Restore full source" onClick={onResetTrim}>Restore full source</button> : null}
        </TimelineLane>
        <TimelineLane label="Zoom" className="zoomLane" aria-label="Zoom markers" onTrackPointerDown={onAddZoomMarkerAt ? handleZoomLanePointerDown : undefined} trackTitle="Click to add a zoom marker">
          {model.lanes.zoom.length > 0
            ? model.lanes.zoom.map((region) => {
                const label = region.label ?? 'Zoom region';
                const kind = region.kind ?? 'manual';
                const selected = selectedZoomMarkerId === region.id;
                const strength = Math.max(0, Math.min(1, region.strength ?? 0.5));
                const depthPct = Math.round(strength * 100);
                return (
                  <div key={region.id} role="button" tabIndex={0} aria-label={`${label}. Arrow keys move marker. Delete to remove.`} className={`timelineRegion ${kind === 'auto' ? 'autoRegion' : 'manualRegion'} ${selected ? 'selectedRegion' : ''}`} data-layer={region.layer ?? 0} title={`${label} · ${depthPct}% · Click × to delete`} style={zoomRegionStyle(region)} onClick={() => onSelectInspectorContext({ group: 'zoom', label, detail: `${kind} zoom region selected.`, markerId: region.id })} onKeyDown={(event) => handleZoomKeyboard(region, 'move', event)} onPointerDown={(event) => beginZoomDrag(region, 'move', event)}>
                    <div className="zoomDepthFill" style={{ height: `${depthPct}%` }} aria-hidden="true" />
                    <span role="slider" tabIndex={0} aria-label={`${label} start boundary`} aria-valuemin={0} aria-valuemax={Math.max(0, Math.round((region.endFrame ?? 15) - 15))} aria-valuenow={Math.round(region.startFrame ?? 0)} className="zoomResizeHandle zoomResizeStart" onKeyDown={(event) => handleZoomKeyboard(region, 'start', event)} onPointerDown={(event) => beginZoomDrag(region, 'start', event)} />
                    <span role="slider" tabIndex={0} aria-label={`${label} end boundary`} aria-valuemin={Math.round((region.startFrame ?? 0) + 15)} aria-valuemax={sourceFrameDuration} aria-valuenow={Math.round(region.endFrame ?? 15)} className="zoomResizeHandle zoomResizeEnd" onKeyDown={(event) => handleZoomKeyboard(region, 'end', event)} onPointerDown={(event) => beginZoomDrag(region, 'end', event)} />
                    {onZoomMarkerRemove ? (
                      <button
                        type="button"
                        className="zoomRegionDelete"
                        aria-label={`Delete ${label}`}
                        title="Delete this zoom"
                        onClick={(event) => { event.stopPropagation(); onZoomMarkerRemove(region.id); }}
                        onPointerDown={(event) => { event.stopPropagation(); }}
                      >×</button>
                    ) : null}
                  </div>
                );
              })
            : null}
          {(() => {
            const selectedRegion = model.lanes.zoom.find((r) => r.id === selectedZoomMarkerId);
            if (!selectedRegion || !onZoomMarkerStrengthChange) return null;
            const startSec = (selectedRegion.startFrame ?? 0) / fps;
            const endSec = (selectedRegion.endFrame ?? 0) / fps;
            const strength = Math.max(0, Math.min(1, selectedRegion.strength ?? 0.5));
            const depthPct = Math.round(strength * 100);
            const chipLeft = (selectedRegion.left ?? 0) + (selectedRegion.width ?? 0) / 2;
            return (
              <div className="zoomEditorChip" style={{ left: `${chipLeft}%` }} role="group" aria-label="Selected zoom editor" onPointerDown={(event) => event.stopPropagation()}>
                <span className="zoomEditorChip__range">{formatClock(startSec)}–{formatClock(endSec)}</span>
                <span className="zoomEditorChip__divider" aria-hidden="true" />
                <span className="zoomEditorChip__depthLabel">Depth</span>
                <input
                  type="range"
                  className="zoomEditorChip__slider"
                  min={0}
                  max={100}
                  step={5}
                  value={depthPct}
                  aria-label={`Depth for ${selectedRegion.label ?? 'zoom'}`}
                  onChange={(event) => onZoomMarkerStrengthChange(selectedRegion.id, Number(event.currentTarget.value) / 100)}
                />
                <span className="zoomEditorChip__value">{depthPct}%</span>
              </div>
            );
          })()}
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

function TimelineLane({ label, className, children, onTrackDoubleClick, onTrackPointerDown, trackTitle, trackClassName, ['aria-label']: ariaLabel }: { label: string; className: string; children: React.ReactNode; onTrackDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void; onTrackPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void; trackTitle?: string; trackClassName?: string; 'aria-label'?: string }) {
  return (
    <div className={`timelineLane ${className}`} data-timeline-lane={label.toLowerCase()} aria-label={ariaLabel}>
      <span className="laneLabel">{label}</span>
      <div className={`laneTrack ${trackClassName ?? ''}`} onDoubleClick={onTrackDoubleClick} onPointerDown={onTrackPointerDown} title={trackTitle}>{children}</div>
    </div>
  );
}


function CameraFollowPanel({
  project,
  onProjectChange,
}: {
  project: ProjectState;
  onProjectChange: (next: ProjectState, options?: ProjectChangeOptions) => void;
}) {
  const document = project.document as unknown as ProjectDocument;
  const zoom = getZoomPresentation(document);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  async function persist(nextDocument: ProjectDocument) {
    const previous = project;
    const optimistic = { ...project, document: nextDocument as unknown as ProjectState['document'] };
    setSaveError(null);
    setIsSaving(true);
    onProjectChange(optimistic, { history: true, previous });
    try {
      const saved = await saveProjectGuarded({ path: project.path, document: optimistic.document });
      onProjectChange(saved);
    } catch (err) {
      onProjectChange(previous);
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function patchZoom(patch: Record<string, unknown>) {
    const nextDocument = patchZoomPresentation(document, patch);
    if (nextDocument === document) return;
    await persist(nextDocument as ProjectDocument);
  }

  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  if (!zoom) return null;
  const followDisabled = isSaving || zoom.followCursor === false;
  const smoothingValue = zoom.cursorSmoothing ?? 0.6;
  const hasCustomSmoothing = typeof zoom.cursorSmoothing === 'number';

  return (
    <div className="cameraFollowPanel" aria-label="Camera follow">
      <p className="eyebrow">Camera follow</p>
      <InspectorSlider
        label="Camera smoothness"
        value={smoothingValue}
        min={0}
        max={2}
        step={0.05}
        disabled={followDisabled}
        onChange={(value) => { void patchZoom({ cursorSmoothing: value }); }}
      />
      <p className="rangeAnchors" aria-hidden="true"><span>Snappy</span><span>Floaty</span></p>
      <button
        type="button"
        className="cameraFollowDisclosure"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        {advancedOpen ? 'Hide advanced' : 'Advanced'}
      </button>
      {advancedOpen ? (
        <div className="cameraFollowAdvanced">
          <InspectorToggle
            label="Follow cursor during zoom"
            checked={zoom.followCursor}
            disabled={isSaving}
            onChange={(checked) => { void patchZoom({ followCursor: checked }); }}
          />
          <InspectorSlider
            label="Safe zone"
            value={zoom.followPadding}
            min={0}
            max={0.3}
            step={0.01}
            disabled={followDisabled}
            onChange={(value) => { void patchZoom({ followPadding: value }); }}
          />
          <p className="rangeAnchors" aria-hidden="true"><span>Hold still</span><span>React fast</span></p>
          {hasCustomSmoothing && !followDisabled ? (
            <button
              type="button"
              className="cameraFollowReset"
              onClick={() => { void patchZoom({ cursorSmoothing: undefined }); }}
            >
              Reset to preset
            </button>
          ) : null}
        </div>
      ) : null}
      {saveError ? <p className="error">{saveError}</p> : null}
    </div>
  );
}

function AutoZoomSuggestionsPanel({
  project,
  onProjectChange,
}: {
  project: ProjectState;
  onProjectChange: (next: ProjectState, options?: ProjectChangeOptions) => void;
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
    onProjectChange(optimistic, { history: true, previous });
    try {
      const saved = await saveProjectGuarded({ path: project.path, document: optimistic.document });
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
      <p className="eyebrow">Auto zoom</p>
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

function ExportPresetDetails({ mode, aspectRatio }: { mode: ExportMode; aspectRatio?: ProjectAspectRatio }) {
  if (mode === 'raw') {
    return <p className="exportPreset">Raw export keeps the original recording unchanged.</p>;
  }

  const activeRatio = aspectRatio ?? 'auto';
  return (
    <div className="exportPresetDetails">
      <p className="exportPreset">
        Styled preset: selected aspect ratio, full-screen fit, pastel background, rounded screen, soft shadow.
      </p>
      <span className="exportPresetChip" data-active-aspect-ratio={activeRatio}>{PROJECT_ASPECT_RATIO_LABELS[activeRatio]}</span>
    </div>
  );
}

export function LegacyVideoPreview({
  project,
  seekTimeSec,
  trimStartSec = 0,
  trimEndSec,
  cutRanges = [],
  onCurrentTimeChange,
  onCameraFrameChange,
  onScreenFrameChange,
  onSourceMediaDurationChange,
}: {
  project: ProjectState;
  seekTimeSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  cutRanges?: CutRange[];
  onCurrentTimeChange?: (sec: number) => void;
  onCameraFrameChange?: (frame: { x: number; y: number; w: number; h: number } | null) => void;
  onScreenFrameChange?: (frame: { x: number; y: number; w: number; h: number } | null) => void;
  onSourceMediaDurationChange?: (sec: number | null) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const backgroundImageRef = React.useRef<HTMLImageElement | null>(null);
  const pendingSeekRef = React.useRef<number | null>(null);
  const seekingRef = React.useRef(false);
  const previewInteractionDirtyRef = React.useRef(false);
  // Active drag state for the camera PiP. cameraDragRef holds the in-flight
  // normalized rect so the tick can render it before we persist on pointer-up.
  // cameraRectRef caches the most recent canvas-pixel camera rect from tick so
  // pointer handlers can hit-test without recomputing the resolveFrame inputs.
  const cameraDragRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const cameraRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const cameraDragOriginRef = React.useRef<PreviewDragOrigin | null>(null);
  const screenDragRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const screenRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const screenDragOriginRef = React.useRef<PreviewDragOrigin | null>(null);
  const [isDraggingCamera, setIsDraggingCamera] = React.useState(false);
  const [isDraggingScreen, setIsDraggingScreen] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [sourceMediaDuration, setSourceMediaDuration] = React.useState<number | null>(null);
  const [cameraMediaDuration, setCameraMediaDuration] = React.useState<number | null>(null);
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
  const metadataSourceDurationSec = Math.max(0.1, (project.recording?.duration ?? 1) / fps);
  const cameraTimelineDurationSec = Number.isFinite(cameraMediaDuration) && cameraMediaDuration !== null && cameraMediaDuration > cameraSourceOffsetSec
    ? Math.max(0.1, cameraMediaDuration - cameraSourceOffsetSec - 1 / fps)
    : null;
  const sourceDurationSec = Math.max(0.1, Math.min(metadataSourceDurationSec, sourceMediaDuration ?? metadataSourceDurationSec, cameraTimelineDurationSec ?? metadataSourceDurationSec));
  const effectiveTrimEndSec = Math.min(trimEndSec ?? sourceDurationSec, sourceDurationSec);
  const trimDurationFrames = Math.max(1, Math.round((effectiveTrimEndSec - trimStartSec) * fps));
  const visibleDuration = Math.max(0.1, visibleDurationFrames(cutRanges, trimDurationFrames) / fps);

  function visibleTimeToSourceTime(visibleTimeSec: number) {
    const visibleFrame = Math.round(Math.max(0, visibleTimeSec) * fps);
    return trimStartSec + visibleFrameToSourceFrame(cutRanges, visibleFrame, trimDurationFrames) / fps;
  }

  function syncCameraTime(sourceTimeSec: number) {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo) return;
    cameraVideo.currentTime = clampedCameraTime(sourceTimeSec, cameraSourceOffsetSec, cameraVideo.duration, fps);
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
    setSourceMediaDuration(null);
    setCameraMediaDuration(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setError(null);
    pendingSeekRef.current = null;
    seekingRef.current = false;
  }, [src]);

  React.useEffect(() => {
    onSourceMediaDurationChange?.(sourceDurationSec);
  }, [sourceDurationSec, onSourceMediaDurationChange]);

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
    const nextTime = Math.max(trimStartSec, Math.min(visibleTimeToSourceTime(requestedTime), Math.min(effectiveTrimEndSec, maxTime)));
    pendingSeekRef.current = null;
    if (Math.abs(video.currentTime - nextTime) < 0.05) {
      seekingRef.current = false;
      return;
    }
    seekingRef.current = true;
    video.currentTime = nextTime;
    syncCameraTime(nextTime);
    const nextVisibleTime = sourceTimeToVisibleTime(nextTime);
    setCurrentTime(nextVisibleTime);
    onCurrentTimeChange?.(nextVisibleTime);
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
    const defaultScreenWidth = sourceWidth * screenScale;
    const defaultScreenHeight = sourceHeight * screenScale;
    const defaultScreenX = (canvasWidth - defaultScreenWidth) / 2;
    const defaultScreenY = (canvasHeight - defaultScreenHeight) / 2;

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
      // Also wait for the camera video to settle from a seek, otherwise
      // the screen renders with the new frame while the camera draw block
      // skips (it requires readyState >= 2) and the camera PiP appears to
      // disappear and reappear every time the user scrubs the timeline.
      // Reported by user 2026-05-10. Bypass when camera presentation is
      // hidden or the source isn't loaded so we don't stall the screen
      // draw on a permanently-empty camera.
      if (cameraVideo && cameraSrc && cameraVideo.seeking && cameraCoversSourceTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps)) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      // Skip draw when the video hasn't advanced to a new frame since last tick.
      // Math.round(currentTime * fps) is discrete (0, 1, 2 …), so at 30fps it holds
      // the same value for ~2 consecutive 60fps RAF ticks before incrementing.
      const currentFrame = Math.max(0, Math.round(video.currentTime * fps));
      if (currentFrame === lastDrawnFrame && !previewInteractionDirtyRef.current) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      previewInteractionDirtyRef.current = false;
      lastDrawnFrame = currentFrame;
      (window as unknown as Record<string, number>).__roughCutCanvasDrawCount =
        ((window as unknown as Record<string, number>).__roughCutCanvasDrawCount ?? 0) + 1;
      if (Number.isFinite(effectiveTrimEndSec) && video.currentTime > effectiveTrimEndSec + 0.02) {
        video.pause();
        video.currentTime = effectiveTrimEndSec;
        const clampedVisibleTime = Math.max(0, effectiveTrimEndSec - trimStartSec);
        setCurrentTime(clampedVisibleTime);
        onCurrentTimeChange?.(clampedVisibleTime);
      }
      const cutEnd = cutEndForSourceTime(video.currentTime);
      if (cutEnd !== null) {
        video.currentTime = cutEnd;
        syncCameraTime(cutEnd);
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
      const dragScreenRect = screenDragRef.current;
      const resolvedScreenFrame = dragScreenRect
        ? { x: dragScreenRect.x * canvasWidth, y: dragScreenRect.y * canvasHeight, w: dragScreenRect.w * canvasWidth, h: dragScreenRect.h * canvasHeight }
        : resolveScreenFrame(frame.screenFrame, defaultScreenX, defaultScreenY, defaultScreenWidth, defaultScreenHeight, canvasWidth, canvasHeight);
      const screenDrawScale = Math.min(resolvedScreenFrame.w / sourceWidth, resolvedScreenFrame.h / sourceHeight);
      const screenWidth = sourceWidth * screenDrawScale;
      const screenHeight = sourceHeight * screenDrawScale;
      const screenX = resolvedScreenFrame.x + (resolvedScreenFrame.w - screenWidth) / 2;
      const screenY = resolvedScreenFrame.y + (resolvedScreenFrame.h - screenHeight) / 2;
      const screenRadius = Math.max(0, Math.min(background.bgCornerRadius, Math.min(screenWidth, screenHeight) / 2));
      screenRectRef.current = { x: screenX, y: screenY, w: screenWidth, h: screenHeight };
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
        const shadowOffsetX = background.bgShadowOffsetX ?? 0;
        ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = shadowOffsetY;
        ctx.shadowOffsetX = shadowOffsetX;
        ctx.fillStyle = '#000';
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
      if (onScreenFrameChange) drawEditorFrameControls(ctx, screenRectRef.current, '#38bdf8');
      ctx.save();
      addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
      ctx.clip();
      ctx.translate(screenX, screenY);
      ctx.scale(screenDrawScale, screenDrawScale);
      ctx.translate(sourceWidth / 2 + offsetX, sourceHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
      ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
      const resolvedCursor = frame.cursor;
      drawClickEmphasis(ctx, cursorEvents, currentFrame, resolvedCursor?.clickEffect ?? 'ring');
      const cursorPos = cursorAtFrame(cursorEvents, currentFrame);
      if (cursorPos && resolvedCursor?.visible !== false) {
        drawCursorPath(ctx, cursorPos.x, cursorPos.y, {
          style: resolvedCursor?.style ?? 'default',
          sizePercent: resolvedCursor?.sizePercent ?? 100,
        });
      }
      ctx.restore();
      const cameraHasFrame = Boolean(
        cameraVideo &&
        cameraSrc &&
        cameraVideo.readyState >= 2 &&
        frame.cameraPresentation?.visible !== false &&
        cameraCoversSourceTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps),
      );
      if (cameraHasFrame && cameraVideo) {
        const expectedCameraTime = clampedCameraTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps);
        if (Math.abs(cameraVideo.currentTime - expectedCameraTime) > Math.max(0.12, 2 / fps)) {
          cameraVideo.currentTime = expectedCameraTime;
          lastDrawnFrame = -1;
          rafId = window.requestAnimationFrame(tick);
          return;
        }
        const dragRect = cameraDragRef.current;
        const cameraFrame = dragRect
          ? { x: dragRect.x * canvasWidth, y: dragRect.y * canvasHeight, w: dragRect.w * canvasWidth, h: dragRect.h * canvasHeight }
          : resolveCameraFrame(frame.cameraFrame, frame.cameraPresentation, canvasWidth, canvasHeight);
        cameraRectRef.current = cameraFrame;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = true;
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
        if (onCameraFrameChange) drawEditorFrameControls(ctx, cameraFrame, '#f59e0b');
      } else {
        cameraRectRef.current = null;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = false;
      }
      rafId = window.requestAnimationFrame(tick);
    }
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, background, cameraSrc, cameraSourceOffsetSec, trimStartSec, effectiveTrimEndSec, cutRanges, onCurrentTimeChange]);

  React.useEffect(() => {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo || !cameraSrc) return undefined;
    const syncCameraStart = () => {
      syncCameraTime(0);
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
        const atEnd = video.ended || sourceTimeToVisibleTime(video.currentTime) >= visibleDuration - 1 / fps;
        if (atEnd) {
          const startTime = visibleTimeToSourceTime(0);
          video.currentTime = startTime;
          syncCameraTime(startTime);
          setCurrentTime(0);
          onCurrentTimeChange?.(0);
        } else if (cameraVideo) {
          syncCameraTime(video.currentTime);
        }
        await video.play();
        await cameraVideo?.play().catch(() => undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video playback failed.');
      }
      return;
    }

    video.pause();
    cameraVideo?.pause();
  }

  async function playAtRate(rate: number) {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    if (cameraVideo) cameraVideo.playbackRate = rate;
    if (video.paused) await togglePlayback();
  }

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableShortcutTarget(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlayback();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        video.pause();
        cameraVideoRef.current?.pause();
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void playAtRate(Math.min(4, video.playbackRate >= 1 ? video.playbackRate + 0.5 : 1));
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        void playAtRate(Math.max(0.25, video.playbackRate - 0.5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleDuration, fps, trimStartSec, cutRanges, onCurrentTimeChange]);

  return (
    <div className="videoPreview styledPreview">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        className="hiddenSource"
        onLoadedMetadata={(event) => {
          setSourceMediaDuration(event.currentTarget.duration);
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
      {cameraSrc ? <video ref={cameraVideoRef} src={cameraSrc} preload="auto" className="hiddenSource" muted onLoadedMetadata={(event) => setCameraMediaDuration(event.currentTarget.duration)} /> : null}
      <canvas
        ref={canvasRef}
        className={`styledPreviewCanvas${isDraggingCamera ? ' draggingCamera' : ''}${isDraggingScreen ? ' draggingScreen' : ''}`}
        aria-label="Styled preview"
        data-camera-draggable={onCameraFrameChange ? 'true' : 'false'}
        data-screen-draggable={onScreenFrameChange ? 'true' : 'false'}
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
        onPointerMove={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
          const origin = cameraDragOriginRef.current;
          if (origin && origin.pointerId === event.pointerId) {
            cameraDragRef.current = origin.mode === 'resize'
              ? resizeRectFromPointer(origin, xCanvas, yCanvas, canvas.width, canvas.height)
              : moveRectFromPointer(origin, xCanvas, yCanvas, canvas.width, canvas.height);
            previewInteractionDirtyRef.current = true;
            return;
          }
          const screenOrigin = screenDragOriginRef.current;
          if (screenOrigin && screenOrigin.pointerId === event.pointerId) {
            screenDragRef.current = screenOrigin.mode === 'resize'
              ? resizeRectFromPointer(screenOrigin, xCanvas, yCanvas, canvas.width, canvas.height)
              : moveRectFromPointer(screenOrigin, xCanvas, yCanvas, canvas.width, canvas.height);
            previewInteractionDirtyRef.current = true;
            return;
          }
          const cameraRect = cameraRectRef.current;
          const overCamera = !!onCameraFrameChange && !!cameraRect && xCanvas >= cameraRect.x && xCanvas <= cameraRect.x + cameraRect.w && yCanvas >= cameraRect.y && yCanvas <= cameraRect.y + cameraRect.h;
          const screenRect = screenRectRef.current;
          const overScreen = !!onScreenFrameChange && !!screenRect && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          const cameraHandle = onCameraFrameChange && cameraRect ? resizeHandleAtPoint(xCanvas, yCanvas, cameraRect) : null;
          const screenHandle = onScreenFrameChange && screenRect ? resizeHandleAtPoint(xCanvas, yCanvas, screenRect) : null;
          (event.currentTarget as HTMLCanvasElement).style.cursor = cameraHandle ? cursorForResizeHandle(cameraHandle) : screenHandle ? cursorForResizeHandle(screenHandle) : overCamera || overScreen ? 'grab' : '';
        }}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
          const cameraRect = cameraRectRef.current;
          const cameraHandle = onCameraFrameChange && cameraRect ? resizeHandleAtPoint(xCanvas, yCanvas, cameraRect) : null;
          const insideCamera = !!onCameraFrameChange && !!cameraRect && xCanvas >= cameraRect.x && xCanvas <= cameraRect.x + cameraRect.w && yCanvas >= cameraRect.y && yCanvas <= cameraRect.y + cameraRect.h;
          if ((insideCamera || cameraHandle) && cameraRect) {
            const mode = cameraHandle ? 'resize' : 'move';
            event.preventDefault();
            (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
            cameraDragOriginRef.current = {
              pointerId: event.pointerId,
              mode,
              handle: cameraHandle ?? undefined,
              offsetX: xCanvas - cameraRect.x,
              offsetY: yCanvas - cameraRect.y,
              startX: cameraRect.x,
              startY: cameraRect.y,
              width: cameraRect.w,
              height: cameraRect.h,
              aspect: Math.max(0.01, cameraRect.w / Math.max(1, cameraRect.h)),
            };
            cameraDragRef.current = {
              x: cameraRect.x / canvas.width,
              y: cameraRect.y / canvas.height,
              w: cameraRect.w / canvas.width,
              h: cameraRect.h / canvas.height,
            };
            setIsDraggingCamera(true);
            (event.currentTarget as HTMLCanvasElement).style.cursor = cameraHandle ? cursorForResizeHandle(cameraHandle) : 'grabbing';
            return;
          }
          const screenRect = screenRectRef.current;
          const screenHandle = onScreenFrameChange && screenRect ? resizeHandleAtPoint(xCanvas, yCanvas, screenRect) : null;
          const insideScreen = !!onScreenFrameChange && !!screenRect && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          if ((!insideScreen && !screenHandle) || !screenRect) return;
          const mode = screenHandle ? 'resize' : 'move';
          event.preventDefault();
          (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
          screenDragOriginRef.current = {
            pointerId: event.pointerId,
            mode,
            handle: screenHandle ?? undefined,
            offsetX: xCanvas - screenRect.x,
            offsetY: yCanvas - screenRect.y,
            startX: screenRect.x,
            startY: screenRect.y,
            width: screenRect.w,
            height: screenRect.h,
            aspect: sourceWidth / Math.max(1, sourceHeight),
          };
          screenDragRef.current = {
            x: screenRect.x / canvas.width,
            y: screenRect.y / canvas.height,
            w: screenRect.w / canvas.width,
            h: screenRect.h / canvas.height,
          };
          setIsDraggingScreen(true);
          (event.currentTarget as HTMLCanvasElement).style.cursor = screenHandle ? cursorForResizeHandle(screenHandle) : 'grabbing';
        }}
        onPointerUp={(event) => {
          const origin = cameraDragOriginRef.current;
          if (origin && origin.pointerId === event.pointerId) {
            const drag = cameraDragRef.current;
            cameraDragOriginRef.current = null;
            cameraDragRef.current = null;
            setIsDraggingCamera(false);
            (event.currentTarget as HTMLCanvasElement).style.cursor = '';
            try { (event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId); } catch {}
            if (drag) onCameraFrameChange?.(drag);
            return;
          }
          const screenOrigin = screenDragOriginRef.current;
          if (!screenOrigin || screenOrigin.pointerId !== event.pointerId) return;
          const screenDrag = screenDragRef.current;
          screenDragOriginRef.current = null;
          screenDragRef.current = null;
          setIsDraggingScreen(false);
          (event.currentTarget as HTMLCanvasElement).style.cursor = '';
          try { (event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId); } catch {}
          if (screenDrag) onScreenFrameChange?.(screenDrag);
        }}
        onPointerCancel={(event) => {
          cameraDragOriginRef.current = null;
          cameraDragRef.current = null;
          screenDragOriginRef.current = null;
          screenDragRef.current = null;
          setIsDraggingCamera(false);
          setIsDraggingScreen(false);
          (event.currentTarget as HTMLCanvasElement).style.cursor = '';
        }}
      />
      <div className="videoControls" aria-label="Video playback controls">
        <button type="button" className="transportButton" onClick={togglePlayback} title="Play or pause (Space)">
          <Icon name={isPlaying ? 'pause' : 'play'} />
          <span className="visuallyHidden">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
        <span className="timecode">
          {formatClock(currentTime)} / {formatClock(visibleDuration)}
        </span>
        <span className="transportHint"><kbd>Space</kbd> play/pause</span>
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

function resolveScreenFrame(
  normalizedFrame: { x: number; y: number; w: number; h: number } | undefined,
  defaultX: number,
  defaultY: number,
  defaultWidth: number,
  defaultHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (!normalizedFrame) return { x: defaultX, y: defaultY, w: defaultWidth, h: defaultHeight };
  const w = Math.max(2, Math.min(canvasWidth, normalizedFrame.w * canvasWidth));
  const h = Math.max(2, Math.min(canvasHeight, normalizedFrame.h * canvasHeight));
  return {
    x: Math.max(0, Math.min(canvasWidth - w, normalizedFrame.x * canvasWidth)),
    y: Math.max(0, Math.min(canvasHeight - h, normalizedFrame.y * canvasHeight)),
    w,
    h,
  };
}

function drawEditorFrameControls(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number } | null, color: string) {
  if (!rect) return;
  const handleSize = Math.max(14, Math.min(26, Math.min(rect.w, rect.h) * 0.12));
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.lineWidth = 4;
  for (const handle of frameResizeHandles(rect)) {
    ctx.beginPath();
    ctx.roundRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize, 5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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

function isEditableShortcutTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function clampUnit(value: number, min = 0): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(1, value));
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
