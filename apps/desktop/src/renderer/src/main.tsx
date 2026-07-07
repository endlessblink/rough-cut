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
  MagnifyingGlassMinus as PhosphorMagnifyingGlassMinus,
  MagnifyingGlassPlus as PhosphorMagnifyingGlassPlus,
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
  trimClipEdge,
  moveClip,
  type NormalizedRect,
  type ProjectAspectRatio,
  type CropAspectRatio,
  type RegionCrop,
  type UserRecordingTemplate,
  type ProjectDocument,
  type CameraAspectRatio,
  type CameraPosition,
  type CameraPresentation,
  type CameraShape,
  type ClickEffect,
  type CursorPresentation,
  type CursorStyle,
  type RecordingBackgroundStyle,
  type ZoomMarker,
} from '@rough-cut/project-model';
import { getCameraLayoutRect, resolveFrame } from '@rough-cut/frame-resolver';
import './styles.css';
import { LibraryShell } from './library/library-shell';
import { AiShell } from './ai/ai-shell';
import { NleShell } from './nle/nle-shell';
import { StyledVideoPreview as VideoPreview, type ResolvedPreviewLayout } from './styled-video-preview';
import { applyScreenSourceTransform, drawZoomMotionSource, resolveZoomMotionBlurPx } from './zoom-motion-renderer';
import { APP_VIEWS, DEFAULT_APP_VIEW_ID, type AppViewId } from './app-views';
import {
  addManualMarkerAtFrame,
  addAutoZoomMarkersFromTelemetry,
  getZoomPresentation,
  listMarkers,
  patchZoomPresentation,
  removeMarker,
  removeMarkers,
  updateMarkerFocalPoint,
  updateMarkerRange,
  updateMarkerStrength,
  withDefaultPresentation,
} from './zoom-markers.mjs';
import { buildTimelineModel, frameRangeToPlacement } from './timeline-rail.mjs';
import { cameraCoversSourceTime, clampedCameraTime, coverSourceRect, cursorAtFrame, cursorForResizeHandle, drawClickEmphasis, drawCursorPath, frameResizeHandles, moveRectFromPointer, resizeHandleAtPoint, resizeRectFromPointer } from './styled-preview.mjs';
import type { PreviewDragOrigin } from './styled-preview.mjs';
import { aspectRatioDims, moveFrameToCameraPosition, resizeFrameToAspect, resizeFrameToCameraSize, shouldCropAspectResizeFrame } from './camera-frame.mjs';
import { addCutRange, clearCutRanges, listCutRanges, removeCutRange, visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';
import { restoreRecordingFullSource, restoreRecordingSourceEdge, rippleDeleteRecordingRange, selectRecordingEditModel, syncRecordingTimelinePresentation, updateRecordingTimelineTrim } from './recording-timeline.mjs';
import { appError, errorStateCopy, type AppError } from './app-error-copy.mjs';
import { EMPTY_EDIT_HISTORY, recordEdit, redoEdit, undoEdit, type EditHistory } from './edit-history.mjs';
import { contentWidthPx, frameAtClientX, resolvePixelsPerFrame, scrollLeftForAnchor, scrollLeftForPlayheadFollow, stepScrollLeftTowardTarget, zoomStep, MAX_PIXELS_PER_FRAME } from './nle/timeline-viewport.mjs';
import { isTypingTarget } from './nle/keyboard.mjs';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      getRuntimeLogPath: () => Promise<string>;
      openEditor: (projectPath?: string | null) => Promise<void>;
      setWindowProfile: (profile: 'recording' | 'studio') => Promise<{ ok: boolean; profile?: string; bounds?: { x: number; y: number; width: number; height: number }; reason?: string }>;
      writePlaybackDebugReport: (report: Record<string, unknown>) => Promise<{ ok?: boolean; skipped?: boolean; path?: string; reason?: string }>;
      showItemInFolder: (path: string) => Promise<void>;
      openPath: (path: string) => Promise<string>;
      getMicSources: () => Promise<MicSource[]>;
      getSystemAudioSources: () => Promise<AudioSource[]>;
      getCameraSources: () => Promise<CameraSource[]>;
      startCameraPreview: (options: { devicePath: string }) => Promise<{ token: string; pid: number | null }>;
      stopCameraPreview: (token?: string | null) => Promise<{ stopped: boolean }>;
      startAudioPreview: (options: { micSource?: string | null; micGainPercent?: number }) => Promise<{ token: string; pid: number | null }>;
      stopAudioPreview: (token?: string | null) => Promise<{ stopped: boolean }>;
      onAudioPreviewLevel: (callback: (level: AudioPreviewLevel) => void) => () => void;
      onCameraPreviewFrame: (callback: (frame: { token: string; dataUrl: string }) => void) => () => void;
      getDisplays: () => Promise<CaptureDisplay[]>;
      getRecordingPreflightStatus: (options?: RecordingPreflightOptions) => Promise<RecordingPreflightStatus>;
      selectCaptureRegion: (options?: { displayId?: string | null; initialRegion?: CaptureRegion | null }) => Promise<CaptureRegion | null>;
      startRecording: (options?: { micSource?: string | null; micGainPercent?: number; systemAudioSource?: string | null; systemAudioGainPercent?: number; cameraDevicePath?: string | null; captureRegion?: CaptureRegion | null; hideWindowDuringRecording?: boolean }) => Promise<RecordingStatus>;
      stopRecording: () => Promise<RecordingStatus>;
      pauseRecording: () => Promise<RecordingStatus>;
      resumeRecording: () => Promise<RecordingStatus>;
      restartRecording: (options?: { micSource?: string | null; micGainPercent?: number; systemAudioSource?: string | null; systemAudioGainPercent?: number; cameraDevicePath?: string | null; captureRegion?: CaptureRegion | null; hideWindowDuringRecording?: boolean } | null) => Promise<RecordingStatus>;
      cancelRecording: () => Promise<RecordingStatus>;
      getRecordingStatus: () => Promise<RecordingStatus>;
      openProject: () => Promise<ProjectState | null>;
      openProjectPath: (path: string) => Promise<ProjectState | null>;
      saveProject: (project: { path: string; document: ProjectState['document'] }) => Promise<ProjectState>;
      pickImportFile: () => Promise<{ filePath: string; mimeType: string | null } | null>;
      createProjectFromImport: (payload: { importedFilePath: string; importedMimeType: string | null }) => Promise<ProjectState>;
      createBlankProject: (payload?: { name?: string; aspectRatio?: ProjectAspectRatio } | null) => Promise<ProjectState>;
      getRecoveryState: () => Promise<{ available: boolean; marker: RecoveryMarker | null; rawAvailable: boolean; cameraRawAvailable?: boolean }>;
      recoverLastRecording: () => Promise<{ state: 'recovered'; project: ProjectState; remuxWarnings: Array<{ source: string; message: string }> }>;
      dismissRecovery: (options?: { deleteFiles?: boolean }) => Promise<{ dismissed: boolean; removed: string[] }>;
      pickExportOutputPath: (projectName: string) => Promise<string | null>;
      exportProject: (payload: { document: ProjectState['document']; outputPath: string; mode: ExportMode; exportScope?: ExportScope }) => Promise<ExportResult>;
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
      listRecordingTemplateOverrides: () => Promise<RecordingTemplateOverride[]>;
      saveRecordingTemplateOverride: (payload: RecordingTemplateOverrideInput) => Promise<RecordingTemplateOverride>;
      listAiAssets: () => Promise<AiAsset[]>;
      resolveAiAsset: (payload: { id: string }) => Promise<AiAsset | null>;
      tagAiAsset: (payload: { id: string; tags: string[] }) => Promise<AiAsset>;
      deleteAiAsset: (payload: { id: string }) => Promise<{ removed: boolean; blocked?: boolean; reason?: string }>;
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
  recording: null | { filePath: string; duration: number; width: number; height: number; fps: number; audio?: unknown; camera?: { width?: number; height?: number; sourceInFrames?: number } & Record<string, unknown> };
  mediaUrl: string | null;
  cameraMediaUrl?: string | null;
};
type ProjectChangeOptions = { history?: boolean; previous?: ProjectState };
type RecordingTemplateOverride = {
  templateId: string;
  aspectRatio: ProjectAspectRatio;
  background: RecordingBackgroundStyle;
  camera: CameraPresentation;
  screenFrame: NormalizedRect | null;
  cameraFrame: NormalizedRect | null;
  updatedAt: number;
};
type RecordingTemplateOverrideInput = {
  templateId: string;
  aspectRatio: ProjectAspectRatio;
  background: RecordingBackgroundStyle;
  camera: CameraPresentation;
  presentation: { screenFrame: NormalizedRect | null; cameraFrame: NormalizedRect | null };
};

type ExportProgress = { phase: string; progress: number; fallback?: { active: boolean; from: string | null; to: string | null; reason: string | null }; experimentalBackend?: string };
type ExportResult = { outputPath: string; sourcePath: string; bytes: number; byteEqualCandidate: boolean; cancelled?: boolean; experimentalBackend?: string; fallback?: { active: boolean; from: string | null; to: string | null; reason: string | null } };
type ExportMode = 'raw' | 'styled' | 'experimental-headless';
type ExportScope = 'timeline' | 'used-content';
const TIMELINE_LABEL_WIDTH_PX = 76.8;
type AiAsset = {
  id: string;
  kind: 'audio' | 'image' | 'video' | 'motion-graphics';
  providerId: string;
  sourcePrompt: string;
  createdAt: string;
  tags: string[];
  sessionId: string;
  filePath: string;
};
type MicSource = { id: string; name: string; label: string; state: string };
type AudioSource = { id: string; name: string; label: string; state: string };
type AudioPreviewLevel = { token: string; level: number; rmsDb: number | null; at: number };
type AudioPreviewState = { token: string | null; state: 'idle' | 'starting' | 'monitoring' | 'error'; error: string | null; level: number; rmsDb: number | null };
type CameraSource = { id: string; name: string; label: string };
type CaptureMode = 'display' | 'region';
type CaptureDisplay = { id: string; label: string; primary: boolean; scaleFactor: number; bounds: { x: number; y: number; width: number; height: number } };
type CaptureRegion = { mode: 'region'; x: number; y: number; width: number; height: number; absoluteX?: number; absoluteY?: number; displayId?: string | null; displayLabel?: string | null };
type RecordingPreflightOptions = { recordMic: boolean; recordSystemAudio: boolean; recordCamera: boolean; micSource?: string | null; systemAudioSource?: string | null; cameraDevicePath?: string | null; captureMode: CaptureMode; captureRegion?: CaptureRegion | null };
type RecordingPreflightCheck = { id: string; label: string; severity: 'ok' | 'warn' | 'critical'; detail: string };
type RecordingPreflightStatus = { status: 'ok' | 'warn' | 'critical'; checkedAt: string; recordingsDir: string; display?: { x?: number; y?: number; width?: number; height?: number }; capture: { mode: CaptureMode; width: number; height: number; fps: number }; disk?: { freeBytes: number | null; severity: RecordingPreflightCheck['severity']; detail: string }; checks: RecordingPreflightCheck[] };
type InspectorGroupId = 'canvas' | 'recording' | 'screen' | 'zoom' | 'cursor' | 'camera' | 'export' | 'diagnostics';
type InspectorSelection = { group: InspectorGroupId; label: string; detail?: string; markerId?: string };
type TrimInfo = { startFrame: number; endFrame: number; startSec: number; endSec: number; durationSec: number; isTrimmed: boolean };
type CutRange = { id: string; startFrame: number; endFrame: number };

type RecordingStatus =
  | { state: 'idle'; canceled?: boolean }
  | { state: 'recording'; startedAt: string; rawPath: string; outputPath: string; paused?: boolean; recordedDurationMs?: number; segmentCount?: number; pauseStartedAt?: string | null; micSource?: string | null; micGainPercent?: number; systemAudioSource?: string | null; systemAudioGainPercent?: number; cameraDevicePath?: string | null; cameraError?: string | null }
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
type RecordingActionPhase = 'starting' | 'stopping' | 'pausing' | 'resuming' | 'restarting' | 'canceling' | null;

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
type CameraFrameAspectRatio = 'free' | CameraAspectRatio;
const CAMERA_FRAME_ASPECT_OPTIONS: ReadonlyArray<{ value: CameraFrameAspectRatio; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
];
const CAMERA_CROP_ASPECT_OPTIONS: ReadonlyArray<{ value: CropAspectRatio; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
];
const DEFAULT_INSPECTOR_SELECTION: InspectorSelection = {
  group: 'canvas',
  label: 'Project canvas',
  detail: 'Project-level presentation controls are active.',
};
const DEFAULT_RECORDED_GAIN_PERCENT = 100;

type PreRecordPreferences = {
  recordMic: boolean;
  recordSystemAudio: boolean;
  recordCamera: boolean;
  micSource: string | null;
  micGainPercent: number;
  systemAudioSource: string | null;
  systemAudioGainPercent: number;
  cameraSource: string | null;
  captureMode: CaptureMode | null;
  captureDisplayId: string | null;
  captureRegion: CaptureRegion | null;
};

function readPreRecordPreferences(): PreRecordPreferences {
  const fallback: PreRecordPreferences = {
    recordMic: false, recordSystemAudio: false, recordCamera: false,
    micSource: null, systemAudioSource: null, cameraSource: null,
    micGainPercent: DEFAULT_RECORDED_GAIN_PERCENT,
    systemAudioGainPercent: DEFAULT_RECORDED_GAIN_PERCENT,
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
      micGainPercent: normalizeAudioGainPercent(parsed.micGainPercent),
      systemAudioSource: typeof parsed.systemAudioSource === 'string' ? parsed.systemAudioSource : null,
      systemAudioGainPercent: normalizeAudioGainPercent(parsed.systemAudioGainPercent),
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
  const experimentalHeadlessExportUi = searchParams.get('experimentalHeadlessExportUi') === '1';
  // Initial app view: honor ?view= override from the main process. Used when
  // a project is opened from disk (jumps straight to editor) and by smoke
  // harnesses that need the editor surface mounted at boot. Falls back to
  // the registry default (Projects gallery) for a plain launch.
  const initialAppView: AppViewId = (() => {
    const requested = searchParams.get('view');
    if (requested === 'recording' || requested === 'projects' || requested === 'editor' || requested === 'nle' || requested === 'ai') return requested;
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
  const [recordingActionPhase, setRecordingActionPhase] = React.useState<RecordingActionPhase>(null);
  const [project, setProject] = React.useState<ProjectState | null>(null);
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = React.useState<ExportResult | null>(null);
  const [exportMode, setExportMode] = React.useState<ExportMode>('raw');
  const [exportScope, setExportScope] = React.useState<ExportScope>('timeline');
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
  const [micGainPercent, setMicGainPercent] = React.useState<number>(initialPreRecordPreferences.micGainPercent);
  const [systemAudioGainPercent, setSystemAudioGainPercent] = React.useState<number>(initialPreRecordPreferences.systemAudioGainPercent);
  const [selectedCameraSource, setSelectedCameraSource] = React.useState<string>(initialPreRecordPreferences.cameraSource ?? '');
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>(initialPreRecordPreferences.captureMode ?? 'display');
  const [captureRegion, setCaptureRegion] = React.useState<CaptureRegion>(initialPreRecordPreferences.captureRegion ?? { mode: 'region', x: 0, y: 0, width: 1280, height: 720 });
  const [recordingActionPending, setRecordingActionPending] = React.useState(false);
  const [preRecordPanelOpen, setPreRecordPanelOpen] = React.useState(() => isRecorderMode);
  const [setupBoardOpen, setSetupBoardOpen] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [activeAppView, setActiveAppView] = React.useState<AppViewId>(initialAppView);
  const preRecordSetupVisible = isRecorderMode ? preRecordPanelOpen : activeAppView === 'recording';
  const [activeTool, setActiveTool] = React.useState<ActiveTool>('background');
  const [sharedTimelineTimeSec, setSharedTimelineTimeSec] = React.useState(0);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [editHistory, setEditHistory] = React.useState<EditHistory<ProjectState>>(EMPTY_EDIT_HISTORY);
  const recordingActionPendingRef = React.useRef(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [error, setError] = React.useState<AppError | null>(null);
  const [runtimeLogPath, setRuntimeLogPath] = React.useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = React.useState<RecordingPreflightStatus | null>(null);
  const [audioPreview, setAudioPreview] = React.useState<AudioPreviewState>({ token: null, state: 'idle', error: null, level: 0, rmsDb: null });
  const audioPreviewTokenRef = React.useRef<string | null>(null);
  const [recordingWarning, setRecordingWarning] = React.useState<string | null>(null);
  const [recoveryState, setRecoveryState] = React.useState<{ available: boolean; marker: RecoveryMarker | null } | null>(null);
  const [recoveryActionPending, setRecoveryActionPending] = React.useState(false);
  const [dismissedCameraFailureForStartedAt, setDismissedCameraFailureForStartedAt] = React.useState<string | null>(null);
  const adoptRecordingStatus = React.useCallback((status: RecordingStatus) => {
    setRecording(status);
    if (status.state === 'saved' && status.project) {
      setProject(status.project);
      setEditHistory(EMPTY_EDIT_HISTORY);
      setExportResult(null);
      setActiveAppView('editor');
    }
  }, []);

  const refreshCameraSources = React.useCallback(({ disableMissingPreferred = false }: { disableMissingPreferred?: boolean } = {}) => {
    return window.roughCut.getCameraSources()
      .then((sources) => {
        setCameraSources(sources);
        const preferred = initialPreRecordPreferences.cameraSource;
        const nextSource = preferred && sources.some((source) => source.name === preferred) ? preferred : sources[0]?.name || '';
        setSelectedCameraSource((current) => (sources.some((source) => source.name === current) ? current : nextSource));
        if (disableMissingPreferred && initialPreRecordPreferences.recordCamera && !sources.some((source) => source.name === preferred)) setRecordCamera(false);
      })
      .catch(() => setCameraSources([]));
  }, [initialPreRecordPreferences.cameraSource, initialPreRecordPreferences.recordCamera]);

  React.useEffect(() => {
    if (isRecorderMode) return undefined;
    const profile = activeAppView === 'recording' && recording.state !== 'recording' ? 'recording' : 'studio';
    void window.roughCut.setWindowProfile(profile).catch((err) => {
      console.warn('[renderer:window-profile] failed', err);
    });
    return undefined;
  }, [isRecorderMode, activeAppView, recording.state]);

  React.useEffect(() => {
    window.roughCut.getVersion().then(setVersion).catch(() => setVersion('unknown'));
    window.roughCut.getRuntimeLogPath().then(setRuntimeLogPath).catch(() => setRuntimeLogPath(null));
    window.roughCut.getRecordingStatus().then(adoptRecordingStatus).catch(() => undefined);
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
    void refreshCameraSources({ disableMissingPreferred: true });
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
  }, [adoptRecordingStatus, refreshCameraSources]);

  React.useEffect(() => {
    if (!preRecordSetupVisible || recording.state === 'recording') return undefined;
    void refreshCameraSources();
    const handleFocus = () => {
      void refreshCameraSources();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [preRecordSetupVisible, recording.state, refreshCameraSources]);

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
      micGainPercent,
      systemAudioSource: selectedSystemAudioSource || null,
      systemAudioGainPercent,
      cameraSource: selectedCameraSource || null,
      captureMode,
      captureDisplayId: selectedCaptureDisplayId,
      captureRegion: captureMode === 'region' ? captureRegion : null,
    });
  }, [recordMic, recordSystemAudio, recordCamera, selectedMicSource, micGainPercent, selectedSystemAudioSource, systemAudioGainPercent, selectedCameraSource, captureMode, selectedCaptureDisplayId, captureRegion]);

  async function stopAudioPreview() {
    const token = audioPreviewTokenRef.current;
    audioPreviewTokenRef.current = null;
    setAudioPreview({ token: null, state: 'idle', error: null, level: 0, rmsDb: null });
    if (token) {
      try {
        await window.roughCut.stopAudioPreview(token);
      } catch (err) {
      console.warn('[renderer:audio-level] stop failed', err);
      }
    }
  }

  async function startMicLevelPreview(micSource: string) {
    if (audioPreview.state === 'starting') return;
    setAudioPreview({ token: null, state: 'starting', error: null, level: 0, rmsDb: null });
    try {
      const started = await window.roughCut.startAudioPreview({
        micSource,
        micGainPercent,
      });
      audioPreviewTokenRef.current = started.token;
      setAudioPreview({ token: started.token, state: 'monitoring', error: null, level: 0, rmsDb: null });
    } catch (err) {
      audioPreviewTokenRef.current = null;
      setAudioPreview({ token: null, state: 'error', error: err instanceof Error ? err.message : 'Mic activity unavailable.', level: 0, rmsDb: null });
    }
  }

  React.useEffect(() => window.roughCut.onAudioPreviewLevel((level) => {
    if (level.token !== audioPreviewTokenRef.current) return;
    setAudioPreview((current) => {
      if (current.token !== level.token || current.state !== 'monitoring') return current;
      return {
        ...current,
        level: Math.max(0, Math.min(1, Number(level.level) || 0)),
        rmsDb: typeof level.rmsDb === 'number' ? level.rmsDb : null,
      };
    });
  }), []);

  React.useEffect(() => {
    if (!preRecordSetupVisible || recording.state === 'recording' || !recordMic || !selectedMicSource) {
      void stopAudioPreview();
      return undefined;
    }
    let cancelled = false;
    void stopAudioPreview().then(() => {
      if (!cancelled) void startMicLevelPreview(selectedMicSource);
    });
    return () => {
      cancelled = true;
      void stopAudioPreview();
    };
  }, [preRecordSetupVisible, recording.state, recordMic, selectedMicSource, micGainPercent]);

  React.useEffect(() => {
    if (recording.state !== 'recording') return undefined;
    void stopAudioPreview();
    return undefined;
  }, [recording.state]);

  React.useEffect(() => () => {
    const token = audioPreviewTokenRef.current;
    if (token) void window.roughCut.stopAudioPreview(token);
  }, []);

  React.useEffect(() => {
    const projectPath = new URLSearchParams(window.location.search).get('projectPath');
    if (!projectPath) return;

    let cancelled = false;
    window.roughCut.openProjectPath(projectPath)
      .then((opened) => {
        if (cancelled) return;
        if (!opened) {
          setProject(null);
          setEditHistory(EMPTY_EDIT_HISTORY);
          setExportResult(null);
          setActiveAppView('recording');
          setPreRecordPanelOpen(isRecorderMode);
          return;
        }
        setProject(opened);
        setEditHistory(EMPTY_EDIT_HISTORY);
        setExportResult(null);
        setActiveAppView('editor');
      })
      .catch((err) => {
        if (!cancelled) {
          setProject(null);
          setEditHistory(EMPTY_EDIT_HISTORY);
          setExportResult(null);
          setActiveAppView('recording');
          setPreRecordPanelOpen(isRecorderMode);
          setError(appError('project', err, 'Project open failed.'));
        }
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

    const baseElapsed = Math.max(0, recording.recordedDurationMs ?? 0);
    const started = recording.paused ? null : Date.now();
    const update = () => setElapsedMs(recording.paused || !started ? baseElapsed : Math.max(0, baseElapsed + Date.now() - started));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [recording.state, recording.state === 'recording' ? recording.paused : null, recording.state === 'recording' ? recording.recordedDurationMs : null]);

  React.useEffect(() => {
    if (recording.state !== 'recording') return;
    let cancelled = false;
    const pollStatus = () => {
      window.roughCut.getRecordingStatus()
        .then((status) => {
          if (cancelled) return;
          if (status.state !== 'recording') {
            adoptRecordingStatus(status);
            return;
          }
          if (status.cameraError !== recording.cameraError || status.paused !== recording.paused || status.recordedDurationMs !== recording.recordedDurationMs) adoptRecordingStatus(status);
        })
        .catch(() => undefined);
    };
    pollStatus();
    const id = window.setInterval(pollStatus, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [recording, adoptRecordingStatus]);

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
    setSharedTimelineTimeSec(0);
  }, [project?.path]);

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
    if (!preRecordSetupVisible || recording.state === 'recording') return;
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
  }, [preRecordSetupVisible, recording.state, recordMic, recordSystemAudio, recordCamera, selectedMicSource, selectedSystemAudioSource, selectedCameraSource, captureMode, captureRegion]);

  const sharedTimelineFps = project?.recording?.fps && project.recording.fps > 0 ? project.recording.fps : 30;
  const sharedTimelineDurationSec = project
    ? Math.max(0, (project.document.composition?.duration ?? 0) / sharedTimelineFps)
    : 0;
  const clampedSharedTimelineTimeSec = Math.max(0, Math.min(sharedTimelineDurationSec, sharedTimelineTimeSec));
  const sharedTimelineFrame = Math.round(clampedSharedTimelineTimeSec * sharedTimelineFps);
  const updateSharedTimelineTimeSec = React.useCallback((nextTimeSec: number) => {
    setSharedTimelineTimeSec(Math.max(0, Math.min(sharedTimelineDurationSec, nextTimeSec)));
  }, [sharedTimelineDurationSec]);
  const updateSharedTimelineFrame = React.useCallback((nextFrame: number) => {
    const durationFrames = project?.document.composition?.duration ?? 0;
    const clampedFrame = Math.max(0, Math.min(durationFrames, nextFrame));
    setSharedTimelineTimeSec(clampedFrame / sharedTimelineFps);
  }, [project?.document.composition?.duration, sharedTimelineFps]);

  async function toggleRecording() {
    if (recordingActionPendingRef.current) {
      console.warn('[renderer:recording] ignored duplicate recording action while previous action is pending');
      return;
    }
    recordingActionPendingRef.current = true;
    setRecordingActionPending(true);
    setRecordingActionPhase(recording.state === 'recording' ? 'stopping' : 'starting');
    setError(null);
    setRecordingWarning(null);
    try {
      if (recording.state === 'recording') {
        console.info('[renderer:recording] stop requested');
        const stopped = await window.roughCut.stopRecording();
        console.info(`[renderer:recording] stop completed ${JSON.stringify(summarizeRecordingStatus(stopped))}`);
        adoptRecordingStatus(stopped);
        if (stopped.state === 'saved' && stopped.project) {
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
        let cameraDevicePath = recordCamera ? selectedCameraSource || null : null;
        if (recordCamera && !cameraDevicePath) {
          setRecordCamera(false);
          setRecordingWarning('Camera was enabled but no camera source was selected, so this take is recording screen-only.');
          cameraDevicePath = null;
        }
        const region = captureMode === 'region' ? captureRegion : null;
        await stopAudioPreview();
        setPreRecordPanelOpen(false);
        // The preview is main-process ffmpeg, not getUserMedia; unmount stops it
        // predictably before the recording ffmpeg opens the same V4L2 device.
        await new Promise((resolve) => window.setTimeout(resolve, recordCamera ? 250 : 100));
        console.info(`[renderer:recording] start requested ${JSON.stringify({
          hasMic: Boolean(micSource),
          micGainPercent: micSource ? micGainPercent : 100,
          hasSystemAudio: Boolean(systemAudioSource),
          systemAudioGainPercent: systemAudioSource ? systemAudioGainPercent : 100,
          cameraDevicePath,
          captureMode,
          region,
        })}`);
        adoptRecordingStatus(await window.roughCut.startRecording({
          micSource,
          micGainPercent: micSource ? micGainPercent : 100,
          systemAudioSource,
          systemAudioGainPercent: systemAudioSource ? systemAudioGainPercent : 100,
          cameraDevicePath,
          captureRegion: region,
          hideWindowDuringRecording: isRecorderMode,
        }));
      }
    } catch (err) {
      console.error('[renderer:recording] recording action failed', err);
      setError(appError('recording', err, 'Recording failed.'));
      if (recording.state !== 'recording') setPreRecordPanelOpen(isRecorderMode);
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
      setRecordingActionPhase(null);
    }
  }

  function handlePrimaryRecordAction() {
    if (recording.state === 'recording') {
      void toggleRecording();
      return;
    }
    if (isRecorderMode) {
      setPreRecordPanelOpen(true);
      return;
    }
    if (activeAppView === 'recording') {
      void toggleRecording();
      return;
    }
    setActiveAppView('recording');
  }

  async function togglePauseRecording() {
    if (recordingActionPendingRef.current || recording.state !== 'recording') return;
    recordingActionPendingRef.current = true;
    setRecordingActionPending(true);
    setRecordingActionPhase(recording.paused ? 'resuming' : 'pausing');
    setError(null);
    try {
      const next = recording.paused
        ? await window.roughCut.resumeRecording()
        : await window.roughCut.pauseRecording();
      adoptRecordingStatus(next);
    } catch (err) {
      console.error('[renderer:recording] pause/resume failed', err);
      setError(appError('recording', err, recording.paused ? 'Resume recording failed.' : 'Pause recording failed.'));
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
      setRecordingActionPhase(null);
    }
  }

  async function restartRecording() {
    if (recordingActionPendingRef.current || recording.state !== 'recording') return;
    recordingActionPendingRef.current = true;
    setRecordingActionPending(true);
    setRecordingActionPhase('restarting');
    setError(null);
    try {
      console.info('[renderer:recording] restart requested');
      const restarted = await window.roughCut.restartRecording(buildCurrentRecordingOptions({ hideWindowDuringRecording: isRecorderMode }));
      console.info(`[renderer:recording] restart completed ${JSON.stringify(summarizeRecordingStatus(restarted))}`);
      adoptRecordingStatus(restarted);
      setProject(null);
      setEditHistory(EMPTY_EDIT_HISTORY);
      setExportResult(null);
      setDismissedCameraFailureForStartedAt(null);
    } catch (err) {
      console.error('[renderer:recording] restart failed', err);
      setError(appError('recording', err, 'Restart recording failed.'));
    } finally {
      recordingActionPendingRef.current = false;
      setRecordingActionPending(false);
      setRecordingActionPhase(null);
    }
  }

  function buildCurrentRecordingOptions({ hideWindowDuringRecording = false } = {}): { micSource: string | null; micGainPercent: number; systemAudioSource: string | null; systemAudioGainPercent: number; cameraDevicePath: string | null; captureRegion: CaptureRegion | null; hideWindowDuringRecording: boolean } {
    const micSource = recordMic ? selectedMicSource || null : null;
    const systemAudioSource = recordSystemAudio ? selectedSystemAudioSource || null : null;
    const cameraDevicePath = recordCamera ? selectedCameraSource || null : null;
    const region = captureMode === 'region' ? captureRegion : null;
    return {
      micSource,
      micGainPercent: micSource ? micGainPercent : 100,
      systemAudioSource,
      systemAudioGainPercent: systemAudioSource ? systemAudioGainPercent : 100,
      cameraDevicePath,
      captureRegion: region,
      hideWindowDuringRecording,
    };
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
    setRecordingActionPhase('canceling');
    setError(null);
    try {
      console.info('[renderer:recording] cancel requested');
      const canceled = await window.roughCut.cancelRecording();
      console.info(`[renderer:recording] cancel completed ${JSON.stringify(summarizeRecordingStatus(canceled))}`);
      adoptRecordingStatus(canceled);
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
      setRecordingActionPhase(null);
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
    setActiveAppView('editor');
    setPreRecordPanelOpen(false);
  }

  function openRegionPickerFromStrip() {
    if (recording.state === 'recording') return;
    setCaptureMode('region');
    setScreenPickerOpen(true);
    if (isRecorderMode) setPreRecordPanelOpen(true);
    else setActiveAppView('recording');
  }

  function isEmptyNleProject(opened: ProjectState): boolean {
    return !opened.recording
      && !opened.mediaUrl
      && Array.isArray(opened.document.assets)
      && opened.document.assets.length === 0;
  }

  function openProjectState(opened: ProjectState) {
    setProject(opened);
    setEditHistory(EMPTY_EDIT_HISTORY);
    setExportResult(null);
    setActiveAppView(isEmptyNleProject(opened) ? 'nle' : 'editor');
  }

  async function openProject() {
    setError(null);
    try {
      const opened = await window.roughCut.openProject();
      if (opened) {
        openProjectState(opened);
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
        openProjectState(opened);
      }
    } catch (err) {
      setError(appError('project', err, 'Project open failed.'));
    }
  }

  async function createBlankProject(payload: { name?: string; aspectRatio?: ProjectAspectRatio } | null = null) {
    setError(null);
    try {
      const created = await window.roughCut.createBlankProject(payload);
      openProjectState(created);
      return created;
    } catch (err) {
      setError(appError('project', err, 'Blank project creation failed.'));
      throw err;
    }
  }

  async function exportProjectWithMode(mode: ExportMode = exportMode, documentOverride: ProjectState['document'] | null = null) {
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
      const result = await window.roughCut.exportProject({ document: documentOverride ?? project.document, outputPath, mode, exportScope });
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
      if (isRecorderMode) setPreRecordPanelOpen(true);
      else setActiveAppView('recording');
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
    if (isRecorderMode) setPreRecordPanelOpen(true);
    else setActiveAppView('recording');
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
            paused={Boolean(recording.paused)}
            actionPending={recordingActionPending}
            cameraFailure={activeCameraFailure}
            onStop={toggleRecording}
            onPauseResume={togglePauseRecording}
            onRestart={restartRecording}
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
            micGainPercent={micGainPercent}
            systemAudioGainPercent={systemAudioGainPercent}
            selectedCameraSource={selectedCameraSource}
            audioPreview={audioPreview}
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
            onMicGainPercentChange={setMicGainPercent}
            onSystemAudioGainPercentChange={setSystemAudioGainPercent}
            onSelectedCameraSourceChange={setSelectedCameraSource}
            onCaptureModeChange={setCaptureMode}
            onScreenPickerOpenChange={setScreenPickerOpen}
            onSelectedCaptureDisplayChange={setSelectedCaptureDisplayId}
            onSelectCaptureRegion={selectScreenRegion}
          />
        )}
        <StateBanner recording={recording} elapsedMs={elapsedMs} actionPending={recordingActionPending} actionPhase={recordingActionPhase} error={error} warning={recordingWarning} diagnosticsPath={failureDiagnosticsPath} onRetry={retryLastFailedAction} onOpenDiagnostics={() => void openPath(failureDiagnosticsPath)} onCopyDiagnosticsPath={copyFailureDiagnosticsPath} />
      </main>
    );
  }

  const recordingViewCompact = activeAppView === 'recording' && recording.state !== 'recording';

  return (
    <main className={`shell ${recordingViewCompact ? 'recordingRoot' : ''}`}>
      <section className={`editorShell ${activeAppView === 'recording' && recording.state !== 'recording' ? 'recordingShell' : ''}`} data-ui-shell="recording-studio">
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
              onClick={handlePrimaryRecordAction}
              className={recording.state === 'recording' ? 'stop primaryAction' : 'primaryAction'}
              disabled={recordingActionPending}
              data-recording-action="primary"
            >
              <Icon name={recording.state === 'recording' ? 'stop' : 'record'} />
              {recordingActionPending ? (recording.state === 'recording' ? 'Stopping...' : 'Starting...') : recording.state === 'recording' ? 'Stop recording' : 'Record'}
            </button>
            {recording.state === 'recording' ? (
              <button type="button" onClick={togglePauseRecording} className="secondary" disabled={recordingActionPending} data-recording-action="pause-resume">
                <Icon name={recording.paused ? 'play' : 'pause'} />
                {recording.paused ? 'Resume' : 'Pause'}
              </button>
            ) : null}
            {recording.state === 'recording' ? (
              <button type="button" onClick={restartRecording} className="secondary" disabled={recordingActionPending} data-recording-action="restart">
                <Icon name="redo" />
                Restart
              </button>
            ) : null}
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
        {shortcutsOpen ? <ShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
        {/* Recording setup belongs to capture views. Inside the NLE and AI
            views it is dead vertical space — those views start right under
            the top bar (Editor v2 / LANE NLE-R). */}
        {activeAppView !== 'recording' && activeAppView !== 'nle' && activeAppView !== 'ai' ? (
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
          {recordMic ? (
            <RecordedGainControl
              label="Mic gain"
              value={micGainPercent}
              disabled={recording.state === 'recording'}
              compact
              dataRegion="mic-audio-gain"
              onChange={setMicGainPercent}
            />
          ) : null}
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
          {recordSystemAudio ? (
            <RecordedGainControl
              label="System gain"
              value={systemAudioGainPercent}
              disabled={recording.state === 'recording'}
              compact
              dataRegion="system-audio-gain"
              onChange={setSystemAudioGainPercent}
            />
          ) : null}
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
        ) : null}
        <StateBanner recording={recording} elapsedMs={elapsedMs} actionPending={recordingActionPending} actionPhase={recordingActionPhase} error={error} warning={recordingWarning} diagnosticsPath={failureDiagnosticsPath} onRetry={retryLastFailedAction} onOpenDiagnostics={() => void openPath(failureDiagnosticsPath)} onCopyDiagnosticsPath={copyFailureDiagnosticsPath} />
        {activeCameraFailure ? (
          <CameraFailureBanner
            error={activeCameraFailure.error}
            actionPending={recordingActionPending}
            onRetryWithoutCamera={stopAndRetryWithCameraOff}
            onContinueScreenOnly={() => setDismissedCameraFailureForStartedAt(activeCameraFailure.startedAt)}
          />
        ) : null}
        <div className="editorContentSlot" data-ui-region="editor-content-slot">
          {activeAppView === 'recording' ? (
            <section className="recordingWorkspace" data-ui-region="recording-workspace">
              <PreRecordPanel
                variant="workspace"
                micSources={micSources}
                systemAudioSources={systemAudioSources}
                cameraSources={cameraSources}
                recordMic={recordMic}
                recordSystemAudio={recordSystemAudio}
                recordCamera={recordCamera}
                selectedMicSource={selectedMicSource}
                selectedSystemAudioSource={selectedSystemAudioSource}
                micGainPercent={micGainPercent}
                systemAudioGainPercent={systemAudioGainPercent}
                selectedCameraSource={selectedCameraSource}
                audioPreview={audioPreview}
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
                onMicGainPercentChange={setMicGainPercent}
                onSystemAudioGainPercentChange={setSystemAudioGainPercent}
                onSelectedCameraSourceChange={setSelectedCameraSource}
                onCaptureModeChange={setCaptureMode}
                onScreenPickerOpenChange={setScreenPickerOpen}
                onSelectedCaptureDisplayChange={setSelectedCaptureDisplayId}
                onSelectCaptureRegion={selectScreenRegion}
              />
            </section>
          ) : activeAppView === 'projects' ? (
            <LibraryShell
              onOpenProjectByPath={openProjectByPath}
              onOpenProjectDialog={openProject}
              onCreateBlankProject={createBlankProject}
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
              playheadFrame={sharedTimelineFrame}
              onPlayheadFrameChange={updateSharedTimelineFrame}
              onProjectChange={(next, options) => applyProjectChange(
                next as unknown as ProjectState,
                options?.history ? { history: true, previous: (options.previous as unknown as ProjectState | null) ?? project ?? undefined } : {},
              )}
              canUndo={editHistory.undo.length > 0}
              canRedo={editHistory.redo.length > 0}
              onUndo={undoProjectEdit}
              onRedo={redoProjectEdit}
              onGoToProjects={() => setActiveAppView('projects')}
              onCreateBlankProject={() => { void createBlankProject(null); }}
            />
          ) : activeAppView === 'ai' ? (
            <AiShell
              project={project ? { path: project.path, document: project.document } : null}
              fps={project?.recording?.fps ?? 30}
              recordingDurationFrames={project?.document?.composition?.duration ?? 0}
              existingCutRanges={(() => {
                const asset = project?.document?.assets?.find((a) => a.type === 'recording');
                return asset?.id ? listCutRanges(project?.document as unknown as ProjectDocument, asset.id, project?.document?.composition?.duration ?? 0) : [];
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
              exportScope={exportScope}
              experimentalHeadlessExportUi={experimentalHeadlessExportUi}
              onExportScopeChange={setExportScope}
              exportProgress={exportProgress}
              exportResult={exportResult}
              setupBoardOpen={setupBoardOpen}
              inspectorOpen={inspectorOpen}
              activeTool={activeTool}
              currentTimeSec={clampedSharedTimelineTimeSec}
              onCurrentTimeSecChange={updateSharedTimelineTimeSec}
              onActiveToolChange={(tool) => {
                setActiveTool(tool);
                setSetupBoardOpen(true);
              }}
            />
          ) : (
            <EditorEmptyState onGoToProjects={() => setActiveAppView('projects')} />
          )}
        </div>
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
      paused: Boolean(status.paused),
      segmentCount: status.segmentCount ?? 1,
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
  variant = 'dialog',
  micSources,
  systemAudioSources,
  cameraSources,
  recordMic,
  recordSystemAudio,
  recordCamera,
  selectedMicSource,
  selectedSystemAudioSource,
  micGainPercent,
  systemAudioGainPercent,
  selectedCameraSource,
  audioPreview,
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
  onMicGainPercentChange,
  onSystemAudioGainPercentChange,
  onSelectedCameraSourceChange,
  onCaptureModeChange,
  onScreenPickerOpenChange,
  onSelectedCaptureDisplayChange,
  onSelectCaptureRegion,
}: {
  variant?: 'dialog' | 'workspace';
  micSources: MicSource[];
  systemAudioSources: AudioSource[];
  cameraSources: CameraSource[];
  recordMic: boolean;
  recordSystemAudio: boolean;
  recordCamera: boolean;
  selectedMicSource: string;
  selectedSystemAudioSource: string;
  micGainPercent: number;
  systemAudioGainPercent: number;
  selectedCameraSource: string;
  audioPreview: AudioPreviewState;
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
  onMicGainPercentChange: (value: number) => void;
  onSystemAudioGainPercentChange: (value: number) => void;
  onSelectedCameraSourceChange: (source: string) => void;
  onCaptureModeChange: (mode: CaptureMode) => void;
  onScreenPickerOpenChange: (open: boolean) => void;
  onSelectedCaptureDisplayChange: (displayId: string | null) => void;
  onSelectCaptureRegion: (displayId?: string | null) => void;
}) {
  const isDialog = variant === 'dialog';
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(isDialog, onClose);
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
    <div
      ref={dialogRef}
      className={isDialog ? 'preRecordOverlay' : 'preRecordWorkspacePanel'}
      data-ui-region="pre-record-panel"
      role={isDialog ? 'dialog' : undefined}
      aria-modal={isDialog ? 'true' : undefined}
      aria-labelledby="pre-record-title"
      data-focus-trap={isDialog ? 'true' : undefined}
    >
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
            {recordMic ? (
              <RecordedGainControl
                label="Mic gain"
                value={micGainPercent}
                disabled={actionPending}
                dataRegion="mic-audio-gain"
                onChange={onMicGainPercentChange}
              />
            ) : null}
            <PreRecordSourceSelect icon="volume" label="System" enabled={recordSystemAudio} disabled={actionPending || systemAudioSources.length === 0} emptyLabel="No system audio" offLabel="No system audio" sources={systemAudioSources} value={selectedSystemAudioSource} onEnabledChange={onRecordSystemAudioChange} onValueChange={onSelectedSystemAudioSourceChange} />
            {recordSystemAudio ? (
              <RecordedGainControl
                label="System gain"
                value={systemAudioGainPercent}
                disabled={actionPending}
                dataRegion="system-audio-gain"
                onChange={onSystemAudioGainPercentChange}
              />
            ) : null}
            <MicWaveformControl
              enabled={recordMic && Boolean(selectedMicSource)}
              state={audioPreview.state}
              error={audioPreview.error}
              level={audioPreview.level}
              disabled={actionPending}
            />
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

function RecordingLauncherActive({ elapsedMs, paused, actionPending, cameraFailure, onStop, onPauseResume, onRestart, onCancel, onRetryWithoutCamera, onContinueScreenOnly }: { elapsedMs: number; paused: boolean; actionPending: boolean; cameraFailure: { error: string } | null; onStop: () => void; onPauseResume: () => void; onRestart: () => void; onCancel: () => void; onRetryWithoutCamera: () => void; onContinueScreenOnly: () => void }) {
  return (
    <div className="preRecordOverlay" data-ui-region="recording-launcher-active">
      <section className="preRecordPanel recordingActivePanel">
        <div className="preRecordHeader">
          <div>
            <p className="eyebrow">{paused ? 'Paused' : 'Recording'}</p>
            <h2>{formatElapsed(elapsedMs)}</h2>
          </div>
          <span className={`liveDot ${paused ? 'paused' : ''}`} aria-hidden="true" />
        </div>
        <button type="button" onClick={onStop} className="stop primaryAction" disabled={actionPending}>
          <Icon name="stop" />
          {actionPending ? 'Stopping...' : 'Stop recording'}
        </button>
        <div className="recordingActiveActions">
          <button type="button" onClick={onPauseResume} className="secondary" disabled={actionPending} data-recording-action="pause-resume">
            <Icon name={paused ? 'play' : 'pause'} />
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" onClick={onRestart} className="secondary" disabled={actionPending} data-recording-action="restart">
            <Icon name="redo" />
            Restart
          </button>
        </div>
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
        <p className="recordingActiveHint">{paused ? 'Resume continues the take without adding paused time.' : 'Pause removes the break from the saved take.'}</p>
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

function RecordedGainControl({ label, value, disabled = false, compact = false, dataRegion, onChange }: { label: string; value: number; disabled?: boolean; compact?: boolean; dataRegion: string; onChange: (value: number) => void }) {
  const normalized = normalizeAudioGainPercent(value);
  const rangeProgress = Math.round(normalized / 2);
  const output = `${normalized}%`;
  const control = (
    <span className="rangeControl" style={{ '--range-progress': `${rangeProgress}%` } as React.CSSProperties}>
      <span className="rangeVisual" aria-hidden="true">
        <span className="rangeFill" />
        <span className="rangeThumb" />
      </span>
      <input
        type="range"
        min="0"
        max="200"
        step="5"
        value={normalized}
        disabled={disabled}
        aria-label={label}
        title="Recorded gain. 100% keeps the source unchanged."
        onWheel={preventRangeWheelChange}
        onChange={(event) => onChange(normalizeAudioGainPercent(event.currentTarget.value))}
      />
    </span>
  );
  if (compact) {
    return (
      <label className="sourceGainControl compact" data-ui-region={dataRegion}>
        <span>{label} {output}</span>
        {control}
      </label>
    );
  }
  return (
    <label className="preRecordInputRow systemGainControl" data-ui-region={dataRegion}>
      <span className="controlRowLabel"><Icon name="volume" /> {label}</span>
      <output>{output}</output>
      {control}
    </label>
  );
}

function MicWaveformControl({ enabled, state, error, level, disabled }: { enabled: boolean; state: 'idle' | 'starting' | 'monitoring' | 'error'; error: string | null; level: number; disabled: boolean }) {
  const active = state === 'monitoring';
  const status = state === 'error' ? error ?? 'Mic activity unavailable' : enabled ? (state === 'starting' ? 'Listening' : active ? 'Live' : 'Waiting') : 'Select a mic';
  const meterLevel = active && !disabled ? Math.max(0, Math.min(1, level)) : 0;
  const bars = [0.32, 0.58, 0.84, 1, 0.74, 0.46, 0.64, 0.38];
  return (
    <div className="preRecordInputRow micWaveformControl" data-ui-region="mic-audio-waveform">
      <span className="controlRowLabel"><Icon name="mic" /> Mic activity</span>
      <div
        className={active ? 'audioLevelMeter active' : 'audioLevelMeter'}
        aria-label={active ? `Audio input level ${Math.round(meterLevel * 100)} percent` : 'Audio input level idle'}
        style={{ '--audio-level': meterLevel } as React.CSSProperties}
      >
        {bars.map((weight, index) => (
          <span
            key={index}
            style={{
              height: `${0.25 + (0.95 * Math.max(0.08, meterLevel * weight))}rem`,
              opacity: 0.24 + (0.76 * meterLevel),
            }}
          />
        ))}
      </div>
      <small>{status}</small>
    </div>
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
  actionPhase,
  error,
  warning,
  diagnosticsPath,
  onRetry,
  onOpenDiagnostics,
  onCopyDiagnosticsPath,
}: {
  recording: RecordingStatus;
  elapsedMs: number;
  actionPending: boolean;
  actionPhase: RecordingActionPhase;
  error: AppError | null;
  warning?: string | null;
  diagnosticsPath?: string | null;
  onRetry?: () => void;
  onOpenDiagnostics?: () => void;
  onCopyDiagnosticsPath?: () => void;
}) {
  const state = error ? 'error' : actionPending ? (actionPhase ?? (recording.state === 'recording' ? 'stopping' : 'starting')) : recording.state === 'recording' && recording.paused ? 'paused' : recording.state;
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
      {!error && warning ? (
        <p className="warning">{warning}</p>
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
  if (state === 'pausing') {
    return { label: 'Pausing capture', title: 'Pausing...', detail: 'Closing the current segment without saving paused time.' };
  }
  if (state === 'resuming') {
    return { label: 'Resuming capture', title: 'Resuming...', detail: 'Starting the next segment in the same take.' };
  }
  if (state === 'restarting') {
    return { label: 'Restarting capture', title: 'Restarting...', detail: 'Discarding this take and starting again with the same setup.' };
  }
  if (state === 'canceling') {
    return { label: 'Discarding capture', title: 'Canceling...', detail: 'Removing the current take and its temporary media.' };
  }
  if (recording.state === 'recording') {
    if (recording.paused) {
      return { label: 'Paused capture', title: `Paused ${formatElapsed(elapsedMs)}`, detail: 'Resume continues the same take without recording the pause.' };
    }
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

type IconName = 'folder' | 'sparkle' | 'sliders' | 'undo' | 'redo' | 'record' | 'stop' | 'frame' | 'timeline' | 'cursor' | 'camera' | 'caption' | 'settings' | 'export' | 'display' | 'mic' | 'volume' | 'play' | 'pause' | 'zoom';
type FrameAlignmentMode = 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom';
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
  zoom: PhosphorMagnifyingGlassPlus,
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

function AlignmentButtonRow({ disabled = false, onAlign }: { disabled?: boolean; onAlign: (mode: FrameAlignmentMode) => void }) {
  const actions: Array<{ mode: FrameAlignmentMode; label: string; short: string }> = [
    { mode: 'left', label: 'Align left', short: 'L' },
    { mode: 'horizontal-center', label: 'Align horizontal center', short: 'HC' },
    { mode: 'right', label: 'Align right', short: 'R' },
    { mode: 'top', label: 'Align top', short: 'T' },
    { mode: 'vertical-center', label: 'Align vertical center', short: 'VC' },
    { mode: 'bottom', label: 'Align bottom', short: 'B' },
  ];
  return (
    <div className="alignmentButtonRow" role="group" aria-label="Align frame">
      {actions.map((action) => (
        <button key={action.mode} type="button" disabled={disabled} title={action.label} aria-label={action.label} onClick={() => onAlign(action.mode)}>
          {action.short}
        </button>
      ))}
    </div>
  );
}

function InspectorSelectPreview({ value }: { value: string }) {
  if (value === 'corner-tl' || value === 'corner-tr' || value === 'corner-bl' || value === 'corner-br' || value === 'center') {
    return <span className={`selectPreview selectPreviewPosition ${value}`} aria-hidden="true"><span /></span>;
  }
  if (value === 'circle' || value === 'square' || value === 'rounded') {
    return <span className={`selectPreview selectPreviewShape ${value}`} aria-hidden="true" />;
  }
  if (value === 'free') {
    return <span className="selectPreview selectPreviewAspect free" aria-hidden="true" />;
  }
  if (/^\d+:\d+$/.test(value)) {
    const [width = 1, height = 1] = value.split(':').map((part) => Number(part));
    const aspect = Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : 1;
    return <span className="selectPreview selectPreviewAspect" style={{ '--preview-aspect': aspect } as React.CSSProperties} aria-hidden="true" />;
  }
  return <span className="selectPreview selectPreviewGeneric" aria-hidden="true" />;
}

function InspectorSelect<T extends string>({ label, value, options, disabled = false, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; disabled?: boolean; onChange: (value: T) => void }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLLabelElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  const commit = (next: T) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <label ref={rootRef} className={`field inspectorField inspectorSelectField ${open ? 'open' : ''}`}>
      <span>{label}</span>
      <select className="nativeInspectorSelect" value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        type="button"
        className="inspectorSelectButton"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="inspectorSelectValue">{selected?.label ?? value}</span>
        <span className="inspectorSelectChevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="inspectorSelectMenu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'inspectorSelectOption selected' : 'inspectorSelectOption'}
              onClick={() => commit(option.value)}
            >
              <InspectorSelectPreview value={option.value} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
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

function safeCameraSourceSize(sourceSize: { width: number; height: number }): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(Number.isFinite(sourceSize.width) ? sourceSize.width : 1280)),
    height: Math.max(1, Math.round(Number.isFinite(sourceSize.height) ? sourceSize.height : 720)),
  };
}

function aspectValue(aspect: CropAspectRatio): number | null {
  if (aspect === '16:9') return 16 / 9;
  if (aspect === '9:16') return 9 / 16;
  if (aspect === '1:1') return 1;
  if (aspect === '4:3') return 4 / 3;
  return null;
}

function defaultCameraCrop(sourceSize: { width: number; height: number }, enabled = false, aspectRatio: CropAspectRatio = 'free'): RegionCrop {
  const source = safeCameraSourceSize(sourceSize);
  return { enabled, x: 0, y: 0, width: source.width, height: source.height, aspectRatio };
}

function normalizeCameraCrop(crop: RegionCrop | null | undefined, sourceSize: { width: number; height: number }): RegionCrop {
  const source = safeCameraSourceSize(sourceSize);
  const base = crop ?? defaultCameraCrop(source);
  const width = Math.max(1, Math.min(source.width, Math.round(base.width)));
  const height = Math.max(1, Math.min(source.height, Math.round(base.height)));
  return {
    enabled: Boolean(base.enabled),
    x: Math.max(0, Math.min(source.width - width, Math.round(base.x))),
    y: Math.max(0, Math.min(source.height - height, Math.round(base.y))),
    width,
    height,
    aspectRatio: base.aspectRatio ?? 'free',
  };
}

function baseCropSizeForAspect(sourceSize: { width: number; height: number }, aspectRatio: CropAspectRatio): { width: number; height: number } {
  const source = safeCameraSourceSize(sourceSize);
  const targetAspect = aspectValue(aspectRatio) ?? source.width / source.height;
  if (source.width / source.height > targetAspect) {
    return { width: Math.max(1, Math.round(source.height * targetAspect)), height: source.height };
  }
  return { width: source.width, height: Math.max(1, Math.round(source.width / targetAspect)) };
}

function cropCenter(crop: RegionCrop): { x: number; y: number } {
  return { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 };
}

function makeCameraCrop(
  sourceSize: { width: number; height: number },
  options: { enabled: boolean; aspectRatio: CropAspectRatio; zoom: number; centerX?: number; centerY?: number },
): RegionCrop {
  const source = safeCameraSourceSize(sourceSize);
  const base = baseCropSizeForAspect(source, options.aspectRatio);
  const zoom = Math.max(1, Math.min(4, options.zoom));
  const width = Math.max(1, Math.min(source.width, Math.round(base.width / zoom)));
  const height = Math.max(1, Math.min(source.height, Math.round(base.height / zoom)));
  const centerX = Number.isFinite(options.centerX) ? options.centerX as number : source.width / 2;
  const centerY = Number.isFinite(options.centerY) ? options.centerY as number : source.height / 2;
  return {
    enabled: options.enabled,
    x: Math.max(0, Math.min(source.width - width, Math.round(centerX - width / 2))),
    y: Math.max(0, Math.min(source.height - height, Math.round(centerY - height / 2))),
    width,
    height,
    aspectRatio: options.aspectRatio,
  };
}

function cameraCropZoomPercent(crop: RegionCrop, sourceSize: { width: number; height: number }): number {
  const base = baseCropSizeForAspect(sourceSize, crop.aspectRatio);
  const zoom = Math.max(base.width / crop.width, base.height / crop.height);
  return Math.round(Math.max(1, Math.min(4, zoom)) * 100);
}

function cameraCropPanPercent(crop: RegionCrop, axis: 'x' | 'y', sourceSize: { width: number; height: number }): number {
  const source = safeCameraSourceSize(sourceSize);
  const max = axis === 'x' ? source.width - crop.width : source.height - crop.height;
  if (max <= 0) return 50;
  return Math.round(((axis === 'x' ? crop.x : crop.y) / max) * 100);
}

function setCameraCropPan(crop: RegionCrop, axis: 'x' | 'y', percent: number, sourceSize: { width: number; height: number }): RegionCrop {
  const source = safeCameraSourceSize(sourceSize);
  const value = Math.max(0, Math.min(100, percent)) / 100;
  if (axis === 'x') {
    return normalizeCameraCrop({ ...crop, x: Math.round((source.width - crop.width) * value) }, source);
  }
  return normalizeCameraCrop({ ...crop, y: Math.round((source.height - crop.height) * value) }, source);
}

function hasCropPanRange(crop: RegionCrop, axis: 'x' | 'y', sourceSize: { width: number; height: number }): boolean {
  const source = safeCameraSourceSize(sourceSize);
  return axis === 'x' ? source.width > crop.width : source.height > crop.height;
}

function inferFrameAspect(frame: NormalizedRect | null, canvasAspectRatio: ProjectAspectRatio, fallback: CameraAspectRatio): CameraFrameAspectRatio {
  if (!frame) return fallback;
  const [canvasW, canvasH] = aspectRatioDims(canvasAspectRatio);
  const ratio = (frame.w * canvasW) / Math.max(0.0001, frame.h * canvasH);
  const candidates: Array<{ value: CameraAspectRatio; ratio: number }> = [
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
    { value: '1:1', ratio: 1 },
    { value: '4:3', ratio: 4 / 3 },
  ];
  const match = candidates.find((candidate) => Math.abs(candidate.ratio - ratio) < 0.035);
  return match?.value ?? 'free';
}

function defaultNormalizedCameraFrame(camera: CameraPresentation, canvasAspectRatio: ProjectAspectRatio): NormalizedRect {
  const [canvasW, canvasH] = aspectRatioDims(canvasAspectRatio);
  const rect = getCameraLayoutRect(camera, canvasW, canvasH);
  return {
    x: rect.x / canvasW,
    y: rect.y / canvasH,
    w: rect.width / canvasW,
    h: rect.height / canvasH,
  };
}

function defaultNormalizedScreenFrame(
  background: RecordingBackgroundStyle,
  canvasAspectRatio: ProjectAspectRatio,
  sourceSize: { width: number; height: number },
): NormalizedRect {
  const canvas = getStyledCanvasResolution({
    aspectRatio: canvasAspectRatio,
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    longEdge: 1280,
  });
  const padding = Math.max(0, Math.min(background.bgPadding, Math.min(canvas.width, canvas.height) / 2 - 2));
  const maxWidth = canvas.width - padding * 2;
  const maxHeight = canvas.height - padding * 2;
  const scale = Math.min(maxWidth / sourceSize.width, maxHeight / sourceSize.height);
  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  return {
    x: (canvas.width - width) / 2 / canvas.width,
    y: (canvas.height - height) / 2 / canvas.height,
    w: width / canvas.width,
    h: height / canvas.height,
  };
}

function alignNormalizedFrame(frame: NormalizedRect, mode: FrameAlignmentMode): NormalizedRect {
  const next = { ...frame };
  if (mode === 'left') next.x = 0;
  if (mode === 'horizontal-center') next.x = (1 - frame.w) / 2;
  if (mode === 'right') next.x = 1 - frame.w;
  if (mode === 'top') next.y = 0;
  if (mode === 'vertical-center') next.y = (1 - frame.h) / 2;
  if (mode === 'bottom') next.y = 1 - frame.h;
  return {
    ...next,
    x: clampUnit(next.x),
    y: clampUnit(next.y),
    w: clampUnit(next.w, 0.05),
    h: clampUnit(next.h, 0.05),
  };
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

type CameraThumbProps = {
  position: CameraPosition;
  shape: CameraShape;
  size: number;
  roundness: number;
  visible: boolean;
};

type TemplateThumbnailProps = {
  aspectRatio: ProjectAspectRatio;
  screenFrame: NormalizedRect;
  cameraFrame: NormalizedRect;
  camera: CameraThumbProps;
};

function TemplateThumbnail({ aspectRatio, screenFrame, cameraFrame, camera }: TemplateThumbnailProps) {
  const [aspectW, aspectH] = aspectRatioDims(aspectRatio);
  const vbW = aspectW * 100;
  const vbH = aspectH * 100;
  const minDim = Math.min(vbW, vbH);
  const cameraRadius = camera.shape === 'square' ? 0 : camera.shape === 'circle' ? minDim * 0.5 : minDim * 0.045;

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
      <rect
        x={screenFrame.x * vbW}
        y={screenFrame.y * vbH}
        width={screenFrame.w * vbW}
        height={screenFrame.h * vbH}
        rx={minDim * 0.045}
        ry={minDim * 0.045}
        fill="rgba(255, 255, 255, 0.14)"
        stroke="rgba(255, 255, 255, 0.42)"
        strokeWidth={1.5}
      />
      {camera.visible !== false ? (
        <rect
          x={cameraFrame.x * vbW}
          y={cameraFrame.y * vbH}
          width={cameraFrame.w * vbW}
          height={cameraFrame.h * vbH}
          rx={cameraRadius}
          ry={cameraRadius}
          fill="var(--accent)"
        />
      ) : null}
    </svg>
  );
}

function templateMetaLine(aspectRatio: string, layoutLabel: string): string {
  return `${aspectRatio} · ${layoutLabel}`;
}

function builtInTemplateThumbnailProps(
  template: typeof RECORDING_TEMPLATE_PRESETS[number],
  override?: RecordingTemplateOverride,
): TemplateThumbnailProps {
  const camera = override?.camera ?? template.camera;
  return {
    aspectRatio: override?.aspectRatio ?? template.aspectRatio,
    screenFrame: override?.screenFrame ?? template.screenFrame,
    cameraFrame: override?.cameraFrame ?? template.cameraFrame,
    camera: {
      position: camera.position,
      shape: camera.shape,
      size: camera.size,
      roundness: camera.roundness,
      visible: camera.visible,
    },
  };
}


function TemplatePresetGrid({
  disabled = false,
  value,
  onSelect,
  userTemplates = [],
  recordingTemplateOverrides = {},
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
  recordingTemplateOverrides?: Record<string, RecordingTemplateOverride>;
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
        {RECORDING_TEMPLATE_PRESETS.map((template) => {
          const override = recordingTemplateOverrides[template.id];
          return (
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
              <TemplateThumbnail {...builtInTemplateThumbnailProps(template, override)} />
            </span>
            <span className="templateCardText">
              <span className="templateCardLabel">{template.label}</span>
              <span className="templateCardMeta">{templateMetaLine(template.aspectRatio, template.layoutLabel)}</span>
            </span>
          </button>
          );
        })}
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

function EditorToolBoard({ activeTool, project, fps, background, cameraPresentation, screenFrame = null, cameraFrame = null, cameraCrop = null, cameraSourceSize = { width: 1280, height: 720 }, screenCrop = null, screenSourceSize = { width: 1280, height: 720 }, cursorPresentation, hasCamera = false, aspectRatio = 'auto', disabled = false, trimInfo, timelineWarning = null, cutRanges = [], userTemplates = [], recordingTemplateOverrides = {}, appliedTemplatePresetId = null, appliedUserTemplateId = null, onProjectChange, onBackgroundChange, onCameraPresentationChange, onCameraPresentationAndFrameChange, onCameraCropAndFrameChange, onCameraCropChange, onScreenCropChange, onCursorPresentationChange, onScreenFrameChange, onCameraFrameChange, onAspectRatioChange, onTemplatePresetSelect, onApplyUserTemplate, onSaveUserTemplate, onRenameUserTemplate, onDeleteUserTemplate, onResetTrim, onRemoveCutRange, onClearCutRanges }: { activeTool: ActiveTool; project?: ProjectState; fps?: number; currentTimeSec?: number; background?: RecordingBackgroundStyle; cameraPresentation?: CameraPresentation; screenFrame?: NormalizedRect | null; cameraFrame?: NormalizedRect | null; cameraCrop?: RegionCrop | null; cameraSourceSize?: { width: number; height: number }; screenCrop?: RegionCrop | null; screenSourceSize?: { width: number; height: number }; cursorPresentation?: CursorPresentation; hasCamera?: boolean; aspectRatio?: ProjectAspectRatio; disabled?: boolean; selectedZoomMarker?: ZoomMarker | null; trimInfo?: TrimInfo; timelineWarning?: string | null; cutRanges?: CutRange[]; userTemplates?: UserRecordingTemplate[]; recordingTemplateOverrides?: Record<string, RecordingTemplateOverride>; appliedTemplatePresetId?: string | null; appliedUserTemplateId?: string | null; onProjectChange?: (next: ProjectState, options?: ProjectChangeOptions) => void; onBackgroundChange?: (patch: Partial<RecordingBackgroundStyle>) => void; onCameraPresentationChange?: (patch: Partial<CameraPresentation>) => void; onCameraPresentationAndFrameChange?: (patch: Partial<CameraPresentation>, frame: { x: number; y: number; w: number; h: number }) => void; onCameraCropAndFrameChange?: (crop: RegionCrop, frame: { x: number; y: number; w: number; h: number }, patch: Partial<CameraPresentation>) => void; onCameraCropChange?: (crop: RegionCrop | null) => void; onScreenCropChange?: (crop: RegionCrop | null) => void; onCursorPresentationChange?: (patch: Partial<CursorPresentation>) => void; onScreenFrameChange?: (frame: { x: number; y: number; w: number; h: number } | null) => void; onCameraFrameChange?: (frame: { x: number; y: number; w: number; h: number } | null) => void; onAspectRatioChange?: (ratio: ProjectAspectRatio) => void; onTemplatePresetSelect?: (templateId: string) => void; onApplyUserTemplate?: (template: UserRecordingTemplate) => void; onSaveUserTemplate?: (label: string) => Promise<void> | void; onRenameUserTemplate?: (id: string, label: string) => Promise<void> | void; onDeleteUserTemplate?: (id: string) => Promise<void> | void; onZoomMarkerStrengthChange?: (markerId: string, strength: number) => void; onResetTrim?: () => void; onRemoveCutRange?: (cutRangeId: string) => void; onClearCutRanges?: () => void }) {
  const bg = background ?? DEFAULT_RECORDING_BACKGROUND;
  const camera = cameraPresentation ?? DEFAULT_CAMERA_PRESENTATION;
  const cursor = cursorPresentation ?? DEFAULT_CURSOR_PRESENTATION;
  const projectLoaded = Boolean(project?.recording);
  const activeBackgroundPreset = RECORDING_BACKGROUND_PRESETS.find((preset) => preset.style.bgImage ? preset.style.bgImage === bg.bgImage : (preset.style.bgColor === bg.bgColor && preset.style.bgGradient === bg.bgGradient))?.id;
  const activeTemplatePreset = appliedTemplatePresetId ?? findRecordingTemplatePresetId(aspectRatio, bg);
  const handleTemplatePresetSelect = (templateId: string) => {
    if (onTemplatePresetSelect) {
      onTemplatePresetSelect(templateId);
      return;
    }
    const applied = applyRecordingTemplatePreset(bg, templateId);
    if (!applied) return;
    onAspectRatioChange?.(applied.aspectRatio);
    onBackgroundChange?.(applied.background);
    onCameraPresentationChange?.(applied.camera);
    onCameraFrameChange?.(applied.cameraFrame);
  };
  if (activeTool === 'timeline') {
    return (
      <aside className="setupBoard" aria-label="Timeline board">
        <BoardHeader icon="timeline" title="Timeline" action={trimInfo?.isTrimmed ? 'Reset trim' : undefined} actionDisabled={disabled || !trimInfo?.isTrimmed} onAction={onResetTrim} />
        {project?.recording && fps && onProjectChange ? (
          <div className="timelineBoardStack" data-ui-region="timeline-zoom-control-panel">
            {timelineWarning ? <p className="warning">{timelineWarning}</p> : null}
            <AutoZoomGenerationPanel project={project} onProjectChange={onProjectChange} />
            <CameraFollowPanel project={project} onProjectChange={onProjectChange} />
            <InspectorSection id="cuts" title="Cuts" description="Drag a range on the screen lane to remove it from the shared timeline. Use Undo to restore the last cut.">
              <div className="cutRangePanel" data-cut-range-panel="true">
                <div className="timelineCompactRow"><span>Restorable hidden ranges</span><strong>{cutRanges.length}</strong></div>
                <InspectorActionRow>
                  <button type="button" className="secondary compact" disabled={disabled || cutRanges.length === 0} onClick={onClearCutRanges}>Clear hidden ranges</button>
                </InspectorActionRow>
                {cutRanges.length > 0 ? (
                  <ul className="cutRangeList">
                    {cutRanges.map((range) => (
                      <li key={range.id} className="cutRangeRow">
                        <span>{formatClock((range.startFrame - (trimInfo?.startFrame ?? 0)) / (fps || 30))}–{formatClock((range.endFrame - (trimInfo?.startFrame ?? 0)) / (fps || 30))}</span>
                        <button type="button" className="secondary compact" disabled={disabled} onClick={() => onRemoveCutRange?.(range.id)}>Restore range</button>
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
    const sourceSize = safeCameraSourceSize(cameraSourceSize);
    const activeCrop = normalizeCameraCrop(cameraCrop, sourceSize);
    const cropZoom = cameraCropZoomPercent(activeCrop, sourceSize);
    const cropPanX = cameraCropPanPercent(activeCrop, 'x', sourceSize);
    const cropPanY = cameraCropPanPercent(activeCrop, 'y', sourceSize);
    const frameAspect = camera.shape === 'circle'
      ? '1:1'
      : inferFrameAspect(cameraFrame, aspectRatio, camera.aspectRatio);
    const cropControlsDisabled = disabled || !camera.visible || !activeCrop.enabled;
    const cropXDisabled = cropControlsDisabled || !hasCropPanRange(activeCrop, 'x', sourceSize);
    const cropYDisabled = cropControlsDisabled || !hasCropPanRange(activeCrop, 'y', sourceSize);
    const updateCrop = (crop: RegionCrop) => onCameraCropChange?.(normalizeCameraCrop(crop, sourceSize));
    const enableCrop = (enabled: boolean) => {
      const center = cropCenter(activeCrop);
      updateCrop(makeCameraCrop(sourceSize, {
        enabled,
        aspectRatio: activeCrop.aspectRatio,
        zoom: enabled && cropZoom <= 100 ? 1.5 : cropZoom / 100,
        centerX: center.x,
        centerY: center.y,
      }));
    };
    const setCropAspect = (nextAspect: CropAspectRatio) => {
      const center = cropCenter(activeCrop);
      const nextCrop = makeCameraCrop(sourceSize, {
        enabled: activeCrop.enabled,
        aspectRatio: nextAspect,
        zoom: cropZoom / 100,
        centerX: center.x,
        centerY: center.y,
      });
      if (!shouldCropAspectResizeFrame({ nextAspect, cameraShape: camera.shape, frameAspect })) {
        updateCrop(nextCrop);
        return;
      }
      const frame = cameraFrame ?? defaultNormalizedCameraFrame(camera, aspectRatio);
      const nextCameraAspect = nextAspect as CameraAspectRatio;
      const nextFrame = resizeFrameToAspect(frame, nextCameraAspect, aspectRatio);
      if (onCameraCropAndFrameChange) onCameraCropAndFrameChange(nextCrop, nextFrame, { aspectRatio: nextCameraAspect });
      else {
        onCameraPresentationAndFrameChange?.({ aspectRatio: nextCameraAspect }, nextFrame);
        updateCrop(nextCrop);
      }
    };
    const setCropZoom = (nextZoomPercent: number) => {
      const center = cropCenter(activeCrop);
      updateCrop(makeCameraCrop(sourceSize, {
        enabled: activeCrop.enabled,
        aspectRatio: activeCrop.aspectRatio,
        zoom: nextZoomPercent / 100,
        centerX: center.x,
        centerY: center.y,
      }));
    };
    const resetCrop = () => onCameraCropChange?.(defaultCameraCrop(sourceSize));
    const setFrameAspect = (nextAspect: CameraFrameAspectRatio) => {
      if (nextAspect === 'free') return;
      const frame = cameraFrame ?? defaultNormalizedCameraFrame({ ...camera, aspectRatio: nextAspect }, aspectRatio);
      const nextFrame = resizeFrameToAspect(frame, nextAspect, aspectRatio);
      if (onCameraPresentationAndFrameChange) onCameraPresentationAndFrameChange({ aspectRatio: nextAspect }, nextFrame);
      else {
        onCameraPresentationChange?.({ aspectRatio: nextAspect });
        onCameraFrameChange?.(nextFrame);
      }
    };
    const setCameraPosition = (position: CameraPosition) => {
      const frame = cameraFrame ?? defaultNormalizedCameraFrame({ ...camera, position }, aspectRatio);
      const nextFrame = moveFrameToCameraPosition(frame, position, aspectRatio);
      if (onCameraPresentationAndFrameChange) onCameraPresentationAndFrameChange({ position }, nextFrame);
      else {
        onCameraPresentationChange?.({ position });
        onCameraFrameChange?.(nextFrame);
      }
    };
    const setCameraSize = (size: number) => {
      const frame = cameraFrame ?? defaultNormalizedCameraFrame(camera, aspectRatio);
      const nextFrame = resizeFrameToCameraSize(frame, camera.size, size);
      if (onCameraPresentationAndFrameChange) onCameraPresentationAndFrameChange({ size }, nextFrame);
      else {
        onCameraPresentationChange?.({ size });
        onCameraFrameChange?.(nextFrame);
      }
    };
    const cameraPositionLabel = CAMERA_POSITION_OPTIONS.find((option) => option.value === camera.position)?.label ?? 'Position';
    return (
      <aside className="setupBoard" aria-label="Camera board">
        <BoardHeader icon="camera" title="Camera" action="Reset" actionDisabled={disabled || !hasCamera} onAction={() => onCameraPresentationChange?.(DEFAULT_CAMERA_PRESENTATION)} />
        {hasCamera ? (
          <InspectorSection id="camera" title="Webcam PiP">
            <div className="cameraInspector" data-camera-pip-controls="true">
              <div className="cameraInspectorPrimary">
                <InspectorToggle label="Show camera" checked={camera.visible} disabled={disabled} onChange={(visible) => onCameraPresentationChange?.({ visible })} />
              </div>
              <div className="cameraControlGroup" aria-label="Camera layout">
                <div className="cameraControlGroupHeader">
                  <span>Layout</span>
                  <strong>{cameraPositionLabel}</strong>
                </div>
                <InspectorSelect label="Position" value={camera.position} options={CAMERA_POSITION_OPTIONS} disabled={disabled || !camera.visible} onChange={setCameraPosition} />
                <InspectorSelect label="Shape" value={camera.shape} options={CAMERA_SHAPE_OPTIONS} disabled={disabled || !camera.visible} onChange={(shape) => onCameraPresentationChange?.({ shape })} />
                <InspectorSelect label="PiP aspect" value={frameAspect} options={CAMERA_FRAME_ASPECT_OPTIONS} disabled={disabled || !camera.visible || camera.shape === 'circle'} onChange={setFrameAspect} />
                <InspectorSlider label="Size" value={camera.size} min={50} max={200} step={5} disabled={disabled || !camera.visible} onChange={setCameraSize} />
                <InspectorSlider label="Roundness" value={camera.roundness} min={0} max={100} step={5} disabled={disabled || !camera.visible || camera.shape !== 'rounded'} onChange={(roundness) => onCameraPresentationChange?.({ roundness })} />
              </div>
              <div className="cameraControlGroup" aria-label="Camera source crop">
                <div className="cameraControlGroupHeader">
                  <span>Source crop</span>
                  <button type="button" className="textButton cameraCropReset" disabled={disabled || !camera.visible || !activeCrop.enabled} onClick={resetCrop}>Reset</button>
                </div>
                <InspectorToggle label="Manual crop" checked={activeCrop.enabled} disabled={disabled || !camera.visible} onChange={enableCrop} />
                <InspectorSelect label="Aspect" value={activeCrop.aspectRatio} options={CAMERA_CROP_ASPECT_OPTIONS} disabled={cropControlsDisabled} onChange={setCropAspect} />
                <InspectorSlider label="Zoom" value={cropZoom} min={100} max={400} step={5} disabled={cropControlsDisabled} onChange={setCropZoom} />
                <InspectorSlider label="X position" value={cropPanX} min={0} max={100} step={1} disabled={cropXDisabled} onChange={(value) => updateCrop(setCameraCropPan(activeCrop, 'x', value, sourceSize))} />
                <InspectorSlider label="Y position" value={cropPanY} min={0} max={100} step={1} disabled={cropYDisabled} onChange={(value) => updateCrop(setCameraCropPan(activeCrop, 'y', value, sourceSize))} />
              </div>
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

  const screenSource = safeCameraSourceSize(screenSourceSize);
  const activeScreenCrop = normalizeCameraCrop(screenCrop, screenSource);
  const screenCropZoom = cameraCropZoomPercent(activeScreenCrop, screenSource);
  const screenCropPanX = cameraCropPanPercent(activeScreenCrop, 'x', screenSource);
  const screenCropPanY = cameraCropPanPercent(activeScreenCrop, 'y', screenSource);
  const screenCropControlsDisabled = disabled || !projectLoaded || !activeScreenCrop.enabled;
  const screenCropXDisabled = screenCropControlsDisabled || !hasCropPanRange(activeScreenCrop, 'x', screenSource);
  const screenCropYDisabled = screenCropControlsDisabled || !hasCropPanRange(activeScreenCrop, 'y', screenSource);
  const updateScreenCrop = (crop: RegionCrop) => onScreenCropChange?.(normalizeCameraCrop(crop, screenSource));
  const enableScreenCrop = (enabled: boolean) => {
    const center = cropCenter(activeScreenCrop);
    updateScreenCrop(makeCameraCrop(screenSource, {
      enabled,
      aspectRatio: activeScreenCrop.aspectRatio,
      zoom: enabled && screenCropZoom <= 100 ? 1.5 : screenCropZoom / 100,
      centerX: center.x,
      centerY: center.y,
    }));
  };
  const setScreenCropAspect = (nextAspect: CropAspectRatio) => {
    const center = cropCenter(activeScreenCrop);
    updateScreenCrop(makeCameraCrop(screenSource, {
      enabled: activeScreenCrop.enabled,
      aspectRatio: nextAspect,
      zoom: screenCropZoom / 100,
      centerX: center.x,
      centerY: center.y,
    }));
  };
  const setScreenCropZoom = (nextZoomPercent: number) => {
    const center = cropCenter(activeScreenCrop);
    updateScreenCrop(makeCameraCrop(screenSource, {
      enabled: activeScreenCrop.enabled,
      aspectRatio: activeScreenCrop.aspectRatio,
      zoom: nextZoomPercent / 100,
      centerX: center.x,
      centerY: center.y,
    }));
  };
  const resetScreenCrop = () => onScreenCropChange?.(defaultCameraCrop(screenSource));
  const alignScreenFrame = (mode: FrameAlignmentMode) => {
    const frame = screenFrame ?? defaultNormalizedScreenFrame(bg, aspectRatio, screenSource);
    onScreenFrameChange?.(alignNormalizedFrame(frame, mode));
  };
  const alignCameraFrame = (mode: FrameAlignmentMode) => {
    const frame = cameraFrame ?? defaultNormalizedCameraFrame(camera, aspectRatio);
    onCameraFrameChange?.(alignNormalizedFrame(frame, mode));
  };

  return (
    <aside className="setupBoard" aria-label="Background board">
      <BoardHeader icon="sparkle" title="Background" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.(DEFAULT_RECORDING_BACKGROUND)} />
      <InspectorSection id="templates" title="Templates" description="One click sets aspect ratio, background, and camera together.">
        <TemplatePresetGrid
          disabled={disabled}
          value={activeTemplatePreset}
          onSelect={handleTemplatePresetSelect}
          userTemplates={userTemplates}
          recordingTemplateOverrides={recordingTemplateOverrides}
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
      <InspectorSection id="screen-crop" title="Screen crop">
        <div className="cameraCropHeader">
          <InspectorToggle label="Manual screen crop" checked={activeScreenCrop.enabled} disabled={disabled || !projectLoaded} onChange={enableScreenCrop} />
          <button type="button" className="secondary compact" disabled={disabled || !projectLoaded || !activeScreenCrop.enabled} onClick={resetScreenCrop}>Reset crop</button>
        </div>
        <InspectorSelect label="Crop aspect" value={activeScreenCrop.aspectRatio} options={CAMERA_CROP_ASPECT_OPTIONS} disabled={screenCropControlsDisabled} onChange={setScreenCropAspect} />
        <InspectorSlider label="Crop zoom" value={screenCropZoom} min={100} max={400} step={5} disabled={screenCropControlsDisabled} onChange={setScreenCropZoom} />
        <InspectorSlider label="Crop X" value={screenCropPanX} min={0} max={100} step={1} disabled={screenCropXDisabled} onChange={(value) => updateScreenCrop(setCameraCropPan(activeScreenCrop, 'x', value, screenSource))} />
        <InspectorSlider label="Crop Y" value={screenCropPanY} min={0} max={100} step={1} disabled={screenCropYDisabled} onChange={(value) => updateScreenCrop(setCameraCropPan(activeScreenCrop, 'y', value, screenSource))} />
      </InspectorSection>
      <BoardHeader icon="frame" title="Frame" action="Reset" actionDisabled={disabled} onAction={() => onBackgroundChange?.({ bgPadding: DEFAULT_RECORDING_BACKGROUND.bgPadding, bgCornerRadius: DEFAULT_RECORDING_BACKGROUND.bgCornerRadius, bgInset: DEFAULT_RECORDING_BACKGROUND.bgInset, bgInsetColor: DEFAULT_RECORDING_BACKGROUND.bgInsetColor })} />
      <InspectorSection id="screen-frame" title="Frame">
        <InspectorSlider label="Outline" value={bg.bgInset} min={0} max={16} step={1} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgInset: value })} />
        <InspectorSlider label="Radius" value={bg.bgCornerRadius} min={0} max={120} step={2} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgCornerRadius: value })} />
        <InspectorSlider label="Padding" value={bg.bgPadding} min={0} max={260} step={4} disabled={disabled} onChange={(value) => onBackgroundChange?.({ bgPadding: value })} />
      </InspectorSection>
      <InspectorSection id="alignment" title="Alignment">
        <div className="alignmentInspector" data-alignment-tools="true">
          <div className="alignmentInspectorGroup">
            <span>Screen</span>
            <AlignmentButtonRow disabled={disabled || !projectLoaded} onAlign={alignScreenFrame} />
          </div>
          <div className="alignmentInspectorGroup">
            <span>Camera</span>
            <AlignmentButtonRow disabled={disabled || !projectLoaded || !hasCamera || !camera.visible} onAlign={alignCameraFrame} />
          </div>
        </div>
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


function PostRecordingReview({ project, recording, exportProgress, exportScope, experimentalHeadlessExportUi, onExportScopeChange, onExportMode, onCancelExport, onOpenProject, onOpenRecordingFolder, onOpenDiagnostics, onRetake }: { project: ProjectState; recording: RecordingStatus; exportProgress: ExportProgress | null; exportScope: ExportScope; experimentalHeadlessExportUi: boolean; onExportScopeChange: (scope: ExportScope) => void; onExportMode: (mode: ExportMode) => void; onCancelExport: () => void; onOpenProject: () => void; onOpenRecordingFolder: () => void; onOpenDiagnostics: () => void; onRetake: () => void }) {
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
        {experimentalHeadlessExportUi ? (
          <button type="button" className="secondary" data-export-action="experimental-headless" onClick={() => onExportMode('experimental-headless')} disabled={!project.recording || Boolean(exportProgress)}>
            <Icon name="settings" /> Export experimental
          </button>
        ) : null}
        <button type="button" className="secondary" data-export-action="raw" onClick={() => onExportMode('raw')} disabled={!project.recording || Boolean(exportProgress)}>
          <Icon name="display" /> Export raw
        </button>
        {exportProgress ? <button type="button" className="secondary danger" data-export-action="cancel" onClick={onCancelExport}><Icon name="stop" /> Cancel export</button> : null}
        <button type="button" className="secondary" onClick={onOpenRecordingFolder} disabled={!project.recording?.filePath}><Icon name="folder" /> Folder</button>
        <button type="button" className="secondary" onClick={onOpenDiagnostics} disabled={!diagnosticsAvailable}><Icon name="settings" /> Diagnostics</button>
        <button type="button" className="secondary" onClick={onOpenProject}><Icon name="folder" /> Project</button>
        <button type="button" className="secondary" onClick={onRetake}><Icon name="record" /> New</button>
      </div>
      <div className="exportScopeControl" aria-label="Export range">
        <span>Range</span>
        <div className="exportScopeButtons" role="group" aria-label="Export range">
          <button type="button" className={exportScope === 'timeline' ? 'active' : ''} onClick={() => onExportScopeChange('timeline')} disabled={Boolean(exportProgress)}>Timeline</button>
          <button type="button" className={exportScope === 'used-content' ? 'active' : ''} onClick={() => onExportScopeChange('used-content')} disabled={Boolean(exportProgress)}>Used</button>
        </div>
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
  exportScope,
  experimentalHeadlessExportUi,
  onExportScopeChange,
  setupBoardOpen,
  inspectorOpen,
  activeTool,
  currentTimeSec,
  onCurrentTimeSecChange,
  onActiveToolChange,
}: {
  project: ProjectState;
  recording: RecordingStatus;
  onProjectChange: (next: ProjectState, options?: ProjectChangeOptions) => void;
  onExportMode: (mode: ExportMode, documentOverride?: ProjectState['document'] | null) => void;
  onCancelExport: () => void;
  onOpenPath: (path?: string | null) => void;
  onShowItemInFolder: (path?: string | null) => void;
  onRetake: () => void;
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  exportMode: ExportMode;
  exportScope: ExportScope;
  experimentalHeadlessExportUi: boolean;
  onExportScopeChange: (scope: ExportScope) => void;
  setupBoardOpen: boolean;
  inspectorOpen: boolean;
  activeTool: ActiveTool;
  currentTimeSec: number;
  onCurrentTimeSecChange: (nextTimeSec: number) => void;
  onActiveToolChange: (tool: ActiveTool) => void;
}) {
  const setCurrentTimeSec = React.useCallback((next: React.SetStateAction<number>) => {
    onCurrentTimeSecChange(typeof next === 'function' ? next(currentTimeSec) : next);
  }, [currentTimeSec, onCurrentTimeSecChange]);
  const [timelineSeekSec, setTimelineSeekSec] = React.useState(currentTimeSec);
  const [previewPlaying, setPreviewPlaying] = React.useState(false);
  const [inspectorSelection, setInspectorSelection] = React.useState<InspectorSelection>(DEFAULT_INSPECTOR_SELECTION);
  const [cutModeActive, setCutModeActive] = React.useState(false);
  const [sourceMediaDurationSec, setSourceMediaDurationSec] = React.useState<number | null>(null);
  const isTimelineScrubbingRef = React.useRef(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [userTemplates, setUserTemplates] = React.useState<UserRecordingTemplate[]>([]);
  const [recordingTemplateOverrides, setRecordingTemplateOverrides] = React.useState<Record<string, RecordingTemplateOverride>>({});
  const [appliedTemplatePresetId, setAppliedTemplatePresetId] = React.useState<string | null>(null);
  const [appliedUserTemplateId, setAppliedUserTemplateId] = React.useState<string | null>(null);
  const pendingTemplatePresetApplyRef = React.useRef<string | null>(null);
  const resolvedPreviewLayoutRef = React.useRef<ResolvedPreviewLayout | null>(null);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const effectiveRecording = React.useMemo(() => {
    if (!project.recording) return null;
    if (!Number.isFinite(sourceMediaDurationSec) || sourceMediaDurationSec === null || sourceMediaDurationSec <= 0) return project.recording;
    const fps = project.recording.fps || 30;
    const mediaFrames = Math.max(1, Math.round(sourceMediaDurationSec * fps));
    return { ...project.recording, duration: Math.min(project.recording.duration, mediaFrames) };
  }, [project.recording, sourceMediaDurationSec]);
  // Memoized so the preview's render-loop effect (which depends on `project`)
  // doesn't restart every frame: a fresh wrapper object each render would
  // cancel/rebuild requestAnimationFrame continuously and stutter zoom playback.
  const effectiveProject = React.useMemo(
    () => (effectiveRecording ? { ...project, recording: effectiveRecording } : project),
    [project, effectiveRecording],
  );
  const recordingAsset = getPrimaryRecordingAsset(project.document);
  const recordingEditModel = selectRecordingEditModel({ document: project.document as unknown as ProjectDocument, recordingAssetId: recordingAsset?.id ?? null });
  const trimInfo = resolveRecordingEditTrimInfo(recordingEditModel.trimInfo, effectiveRecording?.duration ?? project.document.composition.duration, effectiveRecording?.fps ?? 30);
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
  const recordingPresentation = recordingAsset?.presentation as Record<string, unknown> | undefined;
  const templateScreenFrame = (recordingPresentation?.screenFrame as NormalizedRect | undefined) ?? null;
  const templateCameraFrame = (recordingPresentation?.cameraFrame as NormalizedRect | undefined) ?? null;
  const cameraCrop = (recordingPresentation?.cameraCrop as RegionCrop | undefined) ?? null;
  const screenCrop = (recordingPresentation?.screenCrop as RegionCrop | undefined) ?? null;
  const cameraSourceSize = {
    width: effectiveRecording?.camera?.width ?? 1280,
    height: effectiveRecording?.camera?.height ?? 720,
  };
  const screenSourceSize = {
    width: effectiveRecording?.width ?? 1280,
    height: effectiveRecording?.height ?? 720,
  };
  const templateOverrideSnapshot = JSON.stringify({
    aspectRatio,
    background,
    camera: cameraPresentation,
    screenFrame: templateScreenFrame,
    cameraFrame: templateCameraFrame,
  });

  React.useEffect(() => {
    if (!effectiveRecording) return;
    const maxTimeSec = effectiveRecording.duration / (effectiveRecording.fps || 30);
    setCurrentTimeSec((value) => Math.min(value, maxTimeSec));
    setTimelineSeekSec((value) => Math.min(value, maxTimeSec));
  }, [effectiveRecording]);

  React.useEffect(() => {
    setPreviewPlaying(false);
  }, [project.path]);

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
        const nextPresentation: Record<string, unknown> = {
          ...presentation,
          camera: nextCamera,
        };
        return {
          ...asset,
          presentation: nextPresentation,
        };
      }),
    };
    await persist(syncRecordingTimelinePresentation(nextDocument, recordingAsset.id) as ProjectState['document']);
  }

  async function updateCameraPresentationAndFrame(patch: Partial<CameraPresentation>, frame: { x: number; y: number; w: number; h: number }) {
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
            cameraFrame: {
              x: clampUnit(frame.x),
              y: clampUnit(frame.y),
              w: clampUnit(frame.w, 0.05),
              h: clampUnit(frame.h, 0.05),
            },
          },
        };
      }),
    };
    await persist(syncRecordingTimelinePresentation(nextDocument, recordingAsset.id) as ProjectState['document']);
  }

  async function updateCameraCropAndFrame(crop: RegionCrop, frame: { x: number; y: number; w: number; h: number }, patch: Partial<CameraPresentation>) {
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
            cameraCrop: crop,
            cameraFrame: {
              x: clampUnit(frame.x),
              y: clampUnit(frame.y),
              w: clampUnit(frame.w, 0.05),
              h: clampUnit(frame.h, 0.05),
            },
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
          const nextFrame = {
            x: clampUnit(frame.x),
            y: clampUnit(frame.y),
            w: clampUnit(frame.w, 0.05),
            h: clampUnit(frame.h, 0.05),
          };
          next.cameraFrame = nextFrame;
        } else {
          delete next.cameraFrame;
        }
        return { ...asset, presentation: next };
      }),
    });
  }

  async function updateCameraCrop(crop: RegionCrop | null) {
    if (!recordingAsset?.id || !hasCamera) return;
    await persist({
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
        const next: Record<string, unknown> = { ...presentation };
        if (crop) next.cameraCrop = crop;
        else delete next.cameraCrop;
        return { ...asset, presentation: next };
      }),
    });
  }

  async function updateScreenCrop(crop: RegionCrop | null) {
    if (!recordingAsset?.id) return;
    await persist({
      ...project.document,
      assets: project.document.assets?.map((asset) => {
        if (asset.id !== recordingAsset.id) return asset;
        const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
        const next: Record<string, unknown> = { ...presentation };
        if (crop) next.screenCrop = crop;
        else delete next.screenCrop;
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
    const override = recordingTemplateOverrides[templateId];
    const applied = override
      ? {
          aspectRatio: override.aspectRatio,
          background: override.background,
          camera: override.camera,
          screenFrame: override.screenFrame,
          cameraFrame: override.cameraFrame,
        }
      : applyRecordingTemplatePreset(background, templateId);
    if (!applied) return;
    pendingTemplatePresetApplyRef.current = templateId;
    try {
      await persist({
        ...project.document,
        settings: {
          ...project.document.settings,
          aspectRatio: applied.aspectRatio,
        },
        assets: project.document.assets?.map((asset) => {
          if (asset.id !== recordingAsset?.id) return asset;
          const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
          // Built-in templates apply a full composition: aspect, background,
          // camera style, and frame geometry.
          const nextPresentation: Record<string, unknown> = {
            ...presentation,
            background: applied.background,
            camera: {
              ...DEFAULT_CAMERA_PRESENTATION,
              ...((presentation.camera as Partial<CameraPresentation> | undefined) ?? {}),
              ...applied.camera,
            },
            ...(applied.screenFrame ? { screenFrame: applied.screenFrame } : {}),
            ...(applied.cameraFrame ? { cameraFrame: applied.cameraFrame } : {}),
          };
          if (!applied.screenFrame) delete nextPresentation.screenFrame;
          if (!applied.cameraFrame) delete nextPresentation.cameraFrame;
          return { ...asset, presentation: nextPresentation };
        }),
      });
      setAppliedTemplatePresetId(templateId);
      setAppliedUserTemplateId(null);
    } catch (err) {
      if (pendingTemplatePresetApplyRef.current === templateId) pendingTemplatePresetApplyRef.current = null;
      throw err;
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    window.roughCut.listUserTemplates().then(
      (list) => { if (!cancelled) setUserTemplates(list); },
      () => { /* missing or unreadable file → empty list is the right default */ },
    );
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    window.roughCut.listRecordingTemplateOverrides().then(
      (list) => {
        if (cancelled) return;
        setRecordingTemplateOverrides(Object.fromEntries(list.map((override) => [override.templateId, override])));
      },
      () => { /* missing or unreadable file -> built-in defaults */ },
    );
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!appliedTemplatePresetId || appliedUserTemplateId || !recordingAsset?.id) return;
    const pendingTemplatePresetApply = pendingTemplatePresetApplyRef.current;
    if (pendingTemplatePresetApply) {
      if (pendingTemplatePresetApply === appliedTemplatePresetId) {
        pendingTemplatePresetApplyRef.current = null;
      }
      return;
    }
    const timeout = window.setTimeout(() => {
      window.roughCut.saveRecordingTemplateOverride({
        templateId: appliedTemplatePresetId,
        aspectRatio,
        background,
        camera: cameraPresentation,
        presentation: { screenFrame: templateScreenFrame, cameraFrame: templateCameraFrame },
      }).then(
        (saved) => setRecordingTemplateOverrides((current) => ({ ...current, [saved.templateId]: saved })),
        () => { /* persistence is best-effort; project save still owns current state */ },
      );
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [appliedTemplatePresetId, appliedUserTemplateId, recordingAsset?.id, templateOverrideSnapshot]);

  async function applyUserTemplate(template: UserRecordingTemplate) {
    // Saved user templates are authoritative for layout. Replace the camera
    // and frame fields fully (no merge with current presentation) so the
    // user gets back exactly what they saved, including the drag positions.
    setAppliedTemplatePresetId(null);
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

  async function updateTimelineClipTrim(clipId: string, edge: 'head' | 'tail', frame: number) {
    if (!effectiveRecording) return;
    try {
      const nextDocument = trimClipEdge(project.document as unknown as ProjectDocument, { clipId, edge, frame }).document as unknown as ProjectState['document'];
      await persist(nextDocument);
    } catch {
      // Invalid trims are rejected by the command layer; keep the current edit intact.
    }
  }

  async function updateTimelineClipPosition(clipId: string, timelineIn: number) {
    if (!effectiveRecording) return;
    try {
      const nextDocument = moveClip(project.document as unknown as ProjectDocument, { clipId, timelineIn }).document as unknown as ProjectState['document'];
      await persist(nextDocument);
    } catch {
      // Invalid moves are rejected by the command layer; keep the current edit intact.
    }
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

  function exportWithResolvedPreviewLayout(mode: ExportMode) {
    const documentForExport = recordingAsset?.id
      ? mergeResolvedPreviewLayout(project.document, recordingAsset.id, resolvedPreviewLayoutRef.current)
      : project.document;
    onExportMode(mode, documentForExport);
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

  async function updateZoomMarkerFocalPoint(markerId: string, x: number, y: number) {
    const nextDocument = updateMarkerFocalPoint(project.document as unknown as ProjectDocument, markerId, x, y) as unknown as ProjectState['document'];
    if (nextDocument === project.document) return;
    await persist(nextDocument);
  }

  async function removeZoomMarker(markerId: string) {
    const nextDocument = removeMarker(project.document as unknown as ProjectDocument, markerId) as unknown as ProjectState['document'];
    if (nextDocument === project.document) return;
    await persist(nextDocument);
  }

  async function removeZoomMarkers(markerIds: string[]) {
    const nextDocument = removeMarkers(project.document as unknown as ProjectDocument, markerIds) as unknown as ProjectState['document'];
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
        exportWithResolvedPreviewLayout(exportMode);
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
  }, [currentTimeSec, effectiveRecording, exportMode, onExportMode, trimInfo, recordingAsset?.id, project.document]);

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
      <EditorToolBoard activeTool={activeTool} project={effectiveProject} fps={effectiveRecording?.fps} background={background} cameraPresentation={cameraPresentation} screenFrame={templateScreenFrame} cameraFrame={templateCameraFrame} cameraCrop={cameraCrop} cameraSourceSize={cameraSourceSize} screenCrop={screenCrop} screenSourceSize={screenSourceSize} cursorPresentation={cursorPresentation} hasCamera={hasCamera} aspectRatio={aspectRatio} disabled={isSaving} trimInfo={trimInfo} timelineWarning={recordingEditModel.warning} cutRanges={activeCutRanges} userTemplates={userTemplates} recordingTemplateOverrides={recordingTemplateOverrides} appliedTemplatePresetId={appliedTemplatePresetId} appliedUserTemplateId={appliedUserTemplateId} onProjectChange={onProjectChange} onBackgroundChange={updateBackground} onCameraPresentationChange={updateCameraPresentation} onCameraPresentationAndFrameChange={updateCameraPresentationAndFrame} onCameraCropAndFrameChange={updateCameraCropAndFrame} onCameraCropChange={updateCameraCrop} onScreenCropChange={updateScreenCrop} onCursorPresentationChange={updateCursorPresentation} onScreenFrameChange={updateScreenFrame} onCameraFrameChange={updateCameraFrame} onAspectRatioChange={updateAspectRatio} onTemplatePresetSelect={applyTemplatePreset} onApplyUserTemplate={applyUserTemplate} onSaveUserTemplate={saveUserTemplate} onRenameUserTemplate={renameUserTemplate} onDeleteUserTemplate={deleteUserTemplate} onResetTrim={resetTrim} onRemoveCutRange={restoreCut} onClearCutRanges={clearCuts} />
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
          <VideoPreview project={effectiveProject} seekTimeSec={timelineSeekSec} trimStartSec={trimInfo.startSec} trimEndSec={trimInfo.endSec} cutRanges={toTrimRelativeCutRanges(activeCutRanges, trimInfo)} timeMode="timeline" onCurrentTimeChange={setCurrentTimeSec} onPlayingChange={setPreviewPlaying} onCameraFrameChange={updateCameraFrame} onScreenFrameChange={updateScreenFrame} onSourceMediaDurationChange={setSourceMediaDurationSec} onResolvedLayoutChange={(layout) => { resolvedPreviewLayoutRef.current = layout; }} selectedZoomFocal={selectedZoomMarker ? { id: selectedZoomMarker.id, x: selectedZoomMarker.focalPoint.x, y: selectedZoomMarker.focalPoint.y } : null} onZoomFocalChange={updateZoomMarkerFocalPoint} />
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
          {effectiveRecording ? <VisualTimeline project={effectiveProject} currentTimeSec={currentTimeSec} isPlaying={previewPlaying} selectedZoomMarkerId={selectedZoomMarker?.id ?? null} cutRanges={activeCutRanges} cutModeActive={cutModeActive} onCutModeToggle={() => setCutModeActive((v) => !v)} onScrub={handleTimelineScrub} onScrubStart={handleTimelineScrubStart} onScrubEnd={handleTimelineScrubEnd} onTrimClipEdge={updateTimelineClipTrim} onMoveClip={updateTimelineClipPosition} onRestoreTrimStart={() => recordingAsset?.id ? void persist(restoreRecordingSourceEdge(project.document, { assetId: recordingAsset.id, edge: 'head' }) as ProjectState['document']) : undefined} onRestoreTrimEnd={() => recordingAsset?.id ? void persist(restoreRecordingSourceEdge(project.document, { assetId: recordingAsset.id, edge: 'tail' }) as ProjectState['document']) : undefined} onRestoreCut={restoreCut} onZoomMarkerRangeChange={updateZoomMarkerRange} onZoomMarkerRemove={removeZoomMarker} onZoomMarkersRemove={removeZoomMarkers} onZoomMarkerStrengthChange={updateZoomMarkerStrength} onAddZoomMarkerAt={addZoomMarkerAtTime} onAddCutBetween={addCutBetween} onSelectInspectorContext={focusInspectorContext} /> : null}
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
          exportScope={exportScope}
          experimentalHeadlessExportUi={experimentalHeadlessExportUi}
          onExportScopeChange={onExportScopeChange}
          onExportMode={exportWithResolvedPreviewLayout}
          onCancelExport={onCancelExport}
          onOpenProject={() => onOpenPath(project.path)}
          onOpenRecordingFolder={() => onShowItemInFolder(project.recording?.filePath)}
          onOpenDiagnostics={() => onOpenPath(recording.state === 'saved' ? recording.diagnosticsPath : null)}
          onRetake={onRetake}
        />
        <InspectorSection id="export" title="Export status">
          <ExportPresetDetails mode={exportMode} exportScope={exportScope} aspectRatio={aspectRatio} />
          <InspectorActionRow region="export-status-area">
            {exportProgress ? <ExportProgressMeter progress={exportProgress} /> : null}
            {exportResult ? <p className="saved">Exported to: {exportResult.outputPath} ({exportResult.bytes} bytes)</p> : null}
            {exportResult?.fallback?.active ? <p className="inspectorNotice">Fallback: {exportResult.fallback.from} to {exportResult.fallback.to} ({exportResult.fallback.reason}).</p> : null}
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

function mergeResolvedPreviewLayout(
  document: ProjectState['document'],
  recordingAssetId: string,
  layout: ResolvedPreviewLayout | null,
): ProjectState['document'] {
  if (!layout) return document;
  return {
    ...document,
    assets: document.assets?.map((asset) => {
      if (asset.id !== recordingAssetId) return asset;
      const presentation = withDefaultPresentation(asset.presentation) as unknown as Record<string, unknown>;
      const nextPresentation: Record<string, unknown> = {
        ...presentation,
        screenFrame: normalizePreviewLayoutRect(layout.screenFrame),
      };
      const camera = presentation.camera as Partial<CameraPresentation> | undefined;
      if (camera?.shape !== 'circle') {
        if (layout.cameraFrame) nextPresentation.cameraFrame = normalizePreviewLayoutRect(layout.cameraFrame);
        else delete nextPresentation.cameraFrame;
      }
      return {
        ...asset,
        presentation: nextPresentation,
      };
    }),
  };
}

function normalizePreviewLayoutRect(rect: NormalizedRect): NormalizedRect {
  return {
    x: clampUnit(rect.x),
    y: clampUnit(rect.y),
    w: clampUnit(rect.w, 0.05),
    h: clampUnit(rect.h, 0.05),
  };
}

function resolveRecordingEditTrimInfo(
  modelTrimInfo: { startFrame?: number; endFrame?: number } | null | undefined,
  totalFrames: number,
  fps: number,
): TrimInfo {
  const safeTotalFrames = Math.max(1, Math.round(totalFrames || 1));
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const startFrame = Math.max(0, Math.min(safeTotalFrames - 1, Math.round(modelTrimInfo?.startFrame ?? 0)));
  const endFrame = Math.max(startFrame + 1, Math.min(safeTotalFrames, Math.round(modelTrimInfo?.endFrame ?? safeTotalFrames)));
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

function VisualTimeline({ project, currentTimeSec, isPlaying = false, selectedZoomMarkerId = null, cutRanges = [], cutModeActive = false, onCutModeToggle, onScrub, onScrubStart, onScrubEnd, onTrimClipEdge, onMoveClip, onRestoreTrimStart, onRestoreTrimEnd, onRestoreCut, onZoomMarkerRangeChange, onZoomMarkerRemove, onZoomMarkersRemove, onZoomMarkerStrengthChange, onAddZoomMarkerAt, onAddCutBetween, onSelectInspectorContext }: { project: ProjectState; currentTimeSec: number; isPlaying?: boolean; selectedZoomMarkerId?: string | null; cutRanges?: CutRange[]; cutModeActive?: boolean; onCutModeToggle?: () => void; onScrub: (timeSec: number) => void; onScrubStart: () => void; onScrubEnd: (timeSec: number) => void; onTrimClipEdge: (clipId: string, edge: 'head' | 'tail', frame: number) => void; onMoveClip?: (clipId: string, timelineIn: number) => void; onRestoreTrimStart: () => void; onRestoreTrimEnd: () => void; onRestoreCut: (cutRangeId: string) => void; onZoomMarkerRangeChange: (markerId: string, startFrame: number, endFrame: number) => void; onZoomMarkerRemove?: (markerId: string) => void; onZoomMarkersRemove?: (markerIds: string[]) => void; onZoomMarkerStrengthChange?: (markerId: string, strength: number) => void; onAddZoomMarkerAt?: (sourceTimeSec: number) => void; onAddCutBetween?: (startFrame: number, endFrame: number) => void; onSelectInspectorContext: (selection: InspectorSelection) => void }) {
  const model = buildTimelineModel({
    document: project.document as unknown as ProjectDocument,
    recording: project.recording,
    currentTimeSec,
    cameraMediaUrl: project.cameraMediaUrl,
  });

  const fps = project.recording?.fps && project.recording.fps > 0 ? project.recording.fps : 30;
  const sourceFrameDuration = Math.max(1, Math.round((model.sourceDurationSec ?? model.durationSec) * fps));
  const hasHiddenStart = model.trimStartFrame > 0;
  const hasHiddenEnd = model.trimEndFrame < sourceFrameDuration;
  const [zoomDragPreview, setZoomDragPreview] = React.useState<{ id: string; startFrame: number; endFrame: number } | null>(null);
  const [zoomSelectionPreview, setZoomSelectionPreview] = React.useState<{ left: number; width: number } | null>(null);
  const [selectedZoomMarkerIds, setSelectedZoomMarkerIds] = React.useState<string[]>([]);
  const [cutDragPreview, setCutDragPreview] = React.useState<{ startFrame: number; endFrame: number } | null>(null);
  const [trimDragPreview, setTrimDragPreview] = React.useState<{ clipId: string; edge: 'head' | 'tail'; frame: number } | null>(null);
  const [clipDragPreview, setClipDragPreview] = React.useState<{ clipId: string; timelineIn: number; timelineOut: number } | null>(null);
  const [timelinePanning, setTimelinePanning] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const pendingScrollLeftRef = React.useRef<number | null>(null);
  const [timelineZoomPpf, setTimelineZoomPpf] = React.useState<number | null>(null);
  const [timelineViewWidthPx, setTimelineViewWidthPx] = React.useState(0);
  const timelineDurationFrames = Math.max(1, Math.round(model.durationSec * fps));
  const pixelsPerFrame = resolvePixelsPerFrame(timelineZoomPpf, timelineViewWidthPx, timelineDurationFrames);
  const timelineTrackWidthPx = contentWidthPx(timelineDurationFrames, pixelsPerFrame);
  const timelineContentWidthPx = TIMELINE_LABEL_WIDTH_PX + timelineTrackWidthPx;
  const timelineZoomedIn = timelineZoomPpf !== null && timelineTrackWidthPx > timelineViewWidthPx + 1;
  const timelineZoomInDisabled = pixelsPerFrame >= MAX_PIXELS_PER_FRAME;
  const playheadFollowContentXRef = React.useRef(0);
  const zoomSelectionAnchorRef = React.useRef<string | null>(null);
  const selectedZoomMarkerIdSet = React.useMemo(() => new Set(selectedZoomMarkerIds), [selectedZoomMarkerIds]);
  const selectedZoomMarkerCount = selectedZoomMarkerIds.length;
  playheadFollowContentXRef.current = TIMELINE_LABEL_WIDTH_PX + Math.max(0, Math.min(timelineDurationFrames, Math.round(model.currentTimeSec * fps))) * pixelsPerFrame;

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const update = () => setTimelineViewWidthPx(Math.max(0, el.clientWidth - TIMELINE_LABEL_WIDTH_PX));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    setSelectedZoomMarkerIds((current) => {
      if (!selectedZoomMarkerId) return current;
      return current.includes(selectedZoomMarkerId) ? current : [selectedZoomMarkerId];
    });
    if (selectedZoomMarkerId) zoomSelectionAnchorRef.current = selectedZoomMarkerId;
  }, [selectedZoomMarkerId]);

  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || pendingScrollLeftRef.current === null) return;
    el.scrollLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
  }, [pixelsPerFrame]);

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!isPlaying || timelinePanning || !el) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let rafId = 0;
    const tick = () => {
      const target = scrollLeftForPlayheadFollow(playheadFollowContentXRef.current, el.scrollLeft, el.clientWidth, timelineContentWidthPx);
      const next = reducedMotion
        ? target
        : stepScrollLeftTowardTarget(el.scrollLeft, target, { viewWidthPx: el.clientWidth });
      if (Math.abs(next - el.scrollLeft) >= 0.5) el.scrollLeft = next;
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, timelinePanning, timelineContentWidthPx]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const content = contentRef.current;
      if (!content) return;
      event.preventDefault();
      const frameAreaLeft = content.getBoundingClientRect().left + TIMELINE_LABEL_WIDTH_PX;
      const anchorFrame = frameAtClientX(event.clientX, frameAreaLeft, pixelsPerFrame, timelineDurationFrames);
      const pointerOffsetPx = event.clientX - viewport.getBoundingClientRect().left;
      applyTimelineViewportZoom(event.deltaY < 0 ? 1 : -1, anchorFrame, pointerOffsetPx);
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [pixelsPerFrame, timelineDurationFrames, timelineViewWidthPx]);

  function applyTimelineViewportZoom(direction: 1 | -1, anchorFrame = Math.round(model.currentTimeSec * fps), pointerOffsetPx: number | null = null) {
    const next = zoomStep(pixelsPerFrame, direction, timelineViewWidthPx, timelineDurationFrames);
    const nextPpf = resolvePixelsPerFrame(next, timelineViewWidthPx, timelineDurationFrames);
    const offset = pointerOffsetPx ?? Math.max(0, timelineViewWidthPx / 2) + TIMELINE_LABEL_WIDTH_PX;
    pendingScrollLeftRef.current = next === null ? 0 : scrollLeftForAnchor(anchorFrame, nextPpf, offset - TIMELINE_LABEL_WIDTH_PX);
    setTimelineZoomPpf(next);
  }

  function fitTimelineViewport() {
    pendingScrollLeftRef.current = 0;
    setTimelineZoomPpf(null);
  }

  function beginTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 1) return;
    const viewport = event.currentTarget;
    event.preventDefault();
    event.stopPropagation();
    viewport.setPointerCapture(event.pointerId);
    const startClientX = event.clientX;
    const startScrollLeft = viewport.scrollLeft;
    setTimelinePanning(true);
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      viewport.scrollLeft = startScrollLeft - (moveEvent.clientX - startClientX);
    };
    const up = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      try {
        viewport.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released after a cancel.
      }
      setTimelinePanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function preventMiddleTimelineAuxClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // Exit cut mode on Escape.
  React.useEffect(() => {
    if (!cutModeActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCutModeToggle?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cutModeActive, onCutModeToggle]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== '+' && event.key !== '=' && event.key !== '-' && event.key !== '_') return;
      event.preventDefault();
      applyTimelineViewportZoom(event.key === '-' || event.key === '_' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pixelsPerFrame, timelineViewWidthPx, timelineDurationFrames, model.currentTimeSec, fps]);

  // Deselect the active zoom marker on click-away or Escape so the floating
  // Depth chip can't get stuck over the Screen row. Markers, resize handles,
  // the delete button, and the chip itself manage their own selection, so a
  // press inside any of those is ignored here. The preview canvas is also
  // exempt: clicking it reframes the selected zoom's focus point, which must
  // not deselect the marker.
  React.useEffect(() => {
    if (selectedZoomMarkerCount === 0 && !selectedZoomMarkerId) return;
    const clear = () => {
      zoomSelectionAnchorRef.current = null;
      setSelectedZoomMarkerIds([]);
      onSelectInspectorContext(DEFAULT_INSPECTOR_SELECTION);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.zoomEditorChip, .zoomSelectionMarquee, .timelineRegion, .zoomResizeHandle, .zoomRegionDelete, .styledPreviewCanvas')) return;
      clear();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clear();
        return;
      }
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedZoomMarkers();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [selectedZoomMarkerCount, selectedZoomMarkerId, selectedZoomMarkerIds, onSelectInspectorContext, onZoomMarkerRemove, onZoomMarkersRemove]);

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

  function zoomIdsInTimelineOrder() {
    return Array.from(new Set(model.lanes.zoom.map((region) => region.id)));
  }

  function applyZoomSelection(ids: string[], focusId: string | null) {
    const validIds = zoomIdsInTimelineOrder();
    const validIdSet = new Set(validIds);
    const nextIds = Array.from(new Set(ids.filter((id) => validIdSet.has(id))));
    setSelectedZoomMarkerIds(nextIds);
    if (focusId && validIdSet.has(focusId) && nextIds.length === 1) {
      const region = model.lanes.zoom.find((item) => item.id === focusId);
      onSelectInspectorContext({
        group: 'zoom',
        label: region?.label ?? 'Zoom region',
        detail: `${region?.kind ?? 'manual'} zoom region selected.`,
        markerId: focusId,
      });
      return;
    }
    if (nextIds.length === 1) {
      const region = model.lanes.zoom.find((item) => item.id === nextIds[0]);
      onSelectInspectorContext({
        group: 'zoom',
        label: region?.label ?? 'Zoom region',
        detail: `${region?.kind ?? 'manual'} zoom region selected.`,
        markerId: nextIds[0],
      });
      return;
    }
    if (nextIds.length > 1) {
      onSelectInspectorContext({
        group: 'zoom',
        label: 'Zoom markers',
        detail: `${nextIds.length} zoom regions selected.`,
      });
      return;
    }
    onSelectInspectorContext(DEFAULT_INSPECTOR_SELECTION);
  }

  function selectZoomRegion(region: { id: string; label?: string; kind?: string }, event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    const orderedIds = zoomIdsInTimelineOrder();
    const currentIds = selectedZoomMarkerIds.filter((id) => orderedIds.includes(id));
    let nextIds = [region.id];

    if (event.shiftKey) {
      const anchorId = zoomSelectionAnchorRef.current ?? selectedZoomMarkerId ?? currentIds[0] ?? region.id;
      const anchorIndex = orderedIds.indexOf(anchorId);
      const clickedIndex = orderedIds.indexOf(region.id);
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const rangeIds = orderedIds.slice(Math.min(anchorIndex, clickedIndex), Math.max(anchorIndex, clickedIndex) + 1);
        nextIds = (event.ctrlKey || event.metaKey) ? [...currentIds, ...rangeIds] : rangeIds;
      }
    } else if (event.ctrlKey || event.metaKey) {
      nextIds = currentIds.includes(region.id)
        ? currentIds.filter((id) => id !== region.id)
        : [...currentIds, region.id];
    }

    zoomSelectionAnchorRef.current = region.id;
    applyZoomSelection(nextIds, nextIds.length === 1 ? nextIds[0] ?? null : null);
  }

  function deleteSelectedZoomMarkers() {
    const selectedIds = selectedZoomMarkerIds.filter((id) => model.lanes.zoom.some((region) => region.id === id));
    if (selectedIds.length === 0 && selectedZoomMarkerId) selectedIds.push(selectedZoomMarkerId);
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 1 && selectedIds[0]) onZoomMarkerRemove?.(selectedIds[0]);
    else if (onZoomMarkersRemove) onZoomMarkersRemove(selectedIds);
    else selectedIds.forEach((id) => onZoomMarkerRemove?.(id));
    zoomSelectionAnchorRef.current = null;
    setSelectedZoomMarkerIds([]);
    onSelectInspectorContext(DEFAULT_INSPECTOR_SELECTION);
  }

  function deleteZoomRegion(regionId: string) {
    if (selectedZoomMarkerIdSet.has(regionId) && selectedZoomMarkerCount > 1) {
      deleteSelectedZoomMarkers();
      return;
    }
    onZoomMarkerRemove?.(regionId);
    if (selectedZoomMarkerId === regionId || selectedZoomMarkerIdSet.has(regionId)) {
      zoomSelectionAnchorRef.current = null;
      setSelectedZoomMarkerIds([]);
      onSelectInspectorContext(DEFAULT_INSPECTOR_SELECTION);
    }
  }

  function handleZoomLanePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Skip if the press landed on an existing region (don't add inside markers).
    if ((event.target as HTMLElement).closest('.timelineRegion, .zoomResizeHandle, .zoomRegionDelete')) return;
    const track = event.currentTarget;
    const downFrame = sourceFrameFromClient(track, event.clientX);
    if (downFrame === null) return;
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
    const startClientX = event.clientX;
    const hadSelectionAtPointerDown = selectedZoomMarkerCount > 0 || Boolean(selectedZoomMarkerId);
    let latestClientX = event.clientX;
    let edgeScrollRaf = 0;
    let dragged = false;
    const updatePreview = (clientX: number) => {
      const trackRect = track.getBoundingClientRect();
      const startX = Math.max(trackRect.left, Math.min(trackRect.right, startClientX));
      const currentX = Math.max(trackRect.left, Math.min(trackRect.right, clientX));
      const leftPx = Math.min(startX, currentX) - trackRect.left;
      const widthPx = Math.abs(currentX - startX);
      setZoomSelectionPreview({
        left: trackRect.width > 0 ? (leftPx / trackRect.width) * 100 : 0,
        width: trackRect.width > 0 ? (widthPx / trackRect.width) * 100 : 0,
      });
    };
    const stopEdgeScroll = () => {
      if (edgeScrollRaf) window.cancelAnimationFrame(edgeScrollRaf);
      edgeScrollRaf = 0;
    };
    const tickEdgeScroll = () => {
      edgeScrollRaf = 0;
      if (!dragged) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const edgeSize = Math.min(96, Math.max(48, rect.width * 0.16));
      const leftPressure = latestClientX < rect.left + edgeSize ? (rect.left + edgeSize - latestClientX) / edgeSize : 0;
      const rightPressure = latestClientX > rect.right - edgeSize ? (latestClientX - (rect.right - edgeSize)) / edgeSize : 0;
      const pressure = Math.max(-1, Math.min(1, rightPressure > 0 ? rightPressure : -leftPressure));
      if (pressure !== 0) {
        const maxStepPx = 14;
        viewport.scrollLeft += Math.sign(pressure) * maxStepPx * Math.min(1, Math.abs(pressure)) ** 2;
        updatePreview(latestClientX);
      }
      edgeScrollRaf = window.requestAnimationFrame(tickEdgeScroll);
    };
    const startEdgeScroll = () => {
      if (!edgeScrollRaf) edgeScrollRaf = window.requestAnimationFrame(tickEdgeScroll);
    };
    const move = (moveEvent: PointerEvent) => {
      latestClientX = moveEvent.clientX;
      if (!dragged && Math.abs(moveEvent.clientX - startClientX) < 4) return;
      dragged = true;
      updatePreview(moveEvent.clientX);
      startEdgeScroll();
    };
    const up = (upEvent: PointerEvent) => {
      latestClientX = upEvent.clientX;
      stopEdgeScroll();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const upFrame = sourceFrameFromClient(track, upEvent.clientX);
      if (upFrame === null) {
        setZoomSelectionPreview(null);
        return;
      }
      if (dragged) {
        setZoomSelectionPreview(null);
        const startFrame = Math.min(downFrame, upFrame);
        const endFrame = Math.max(downFrame, upFrame);
        const marqueeIds = model.lanes.zoom
          .filter((region) => Number.isFinite(region.startFrame) && Number.isFinite(region.endFrame))
          .filter((region) => Math.round(region.endFrame ?? 0) >= startFrame && Math.round(region.startFrame ?? 0) <= endFrame)
          .map((region) => region.id)
          .filter((id): id is string => typeof id === 'string');
        const nextIds = (event.ctrlKey || event.metaKey || event.shiftKey)
          ? [...selectedZoomMarkerIds, ...marqueeIds]
          : marqueeIds;
        zoomSelectionAnchorRef.current = marqueeIds[marqueeIds.length - 1] ?? zoomSelectionAnchorRef.current;
        applyZoomSelection(nextIds, nextIds.length === 1 ? nextIds[0] ?? null : null);
        return;
      }
      // Mirror cut tool's click-vs-drag gate: only fire on a low-movement
      // release so accidental drags don't drop phantom markers.
      if (Math.abs(upFrame - downFrame) >= 2) return;
      if (hadSelectionAtPointerDown && !event.ctrlKey && !event.metaKey && !event.shiftKey) return;
      if (!onAddZoomMarkerAt || event.ctrlKey || event.metaKey || event.shiftKey) return;
      onAddZoomMarkerAt(downFrame / fps);
    };
    const cancel = () => {
      stopEdgeScroll();
      setZoomSelectionPreview(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  }

  function scrubFromInput(value: string) {
    const nextTimelineTime = Number(value);
    if (Number.isFinite(nextTimelineTime)) onScrub(Math.max(0, Math.min(model.durationSec, nextTimelineTime)));
  }

  function commitScrub(value: string) {
    const nextTimelineTime = Number(value);
    if (Number.isFinite(nextTimelineTime)) onScrubEnd(Math.max(0, Math.min(model.durationSec, nextTimelineTime)));
  }

  function nudgeTimelinePlayhead(direction: -1 | 1, largeStep: boolean) {
    const stepSec = largeStep ? 1 : 1 / fps;
    const nextTimelineTime = Math.max(0, Math.min(model.durationSec, model.currentTimeSec + direction * stepSec));
    onScrub(nextTimelineTime);
    onScrubEnd(nextTimelineTime);
  }

  function timelineTimeFromClient(track: HTMLElement, clientX: number) {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.max(0, Math.min(((clientX - rect.left) / rect.width) * model.durationSec, model.durationSec));
  }

  function timelineFrameFromClient(handle: HTMLElement, clientX: number) {
    const track = handle.closest('.timelineLane')?.querySelector('.laneTrack');
    if (!(track instanceof HTMLElement)) return null;
    const timeSec = timelineTimeFromClient(track, clientX);
    return timeSec === null ? null : Math.round(timeSec * fps);
  }

  // Shared scrub-drag loop. `track` supplies the pixel→time geometry (always a
  // `.laneTrack`, so the 4.8rem label column is excluded); `captureEl` is the
  // element that received the pointerdown and keeps pointer capture.
  function beginSeekDrag(track: HTMLElement, captureEl: HTMLElement, clientX: number, pointerId: number) {
    const downTime = timelineTimeFromClient(track, clientX);
    if (downTime === null) return;
    captureEl.setPointerCapture(pointerId);
    onScrubStart();
    onScrub(downTime);
    const move = (moveEvent: PointerEvent) => {
      const nextTime = timelineTimeFromClient(track, moveEvent.clientX);
      if (nextTime !== null) onScrub(nextTime);
    };
    const up = (upEvent: PointerEvent) => {
      const nextTime = timelineTimeFromClient(track, upEvent.clientX) ?? downTime;
      onScrubEnd(nextTime);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function handleTimelineSeekPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || cutModeActive) return;
    const target = event.target as HTMLElement;
    if (target.closest('.trimHandle, .clipBody, .hiddenTrimRange, .hiddenCutRange, .restoreFullSource, .timelineRegion, .zoomResizeHandle, .zoomRegionDelete')) return;
    beginSeekDrag(event.currentTarget, event.currentTarget, event.clientX, event.pointerId);
  }

  // Clicking anywhere in the timeline header (the ruler strip and the empty
  // toolbar band beside the cut button) seeks too. These elements span the
  // full timeline width including the 4.8rem label column, so we borrow a real
  // `.laneTrack` for geometry — every surface shares that offset, keeping the
  // playhead aligned. Presses on the cut button keep their own behaviour.
  function handleHeaderSeekPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || cutModeActive) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const track = event.currentTarget.closest('.visualTimeline')?.querySelector('.laneTrack');
    if (!(track instanceof HTMLElement)) return;
    beginSeekDrag(track, event.currentTarget, event.clientX, event.pointerId);
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
    const sourceDurationSec = model.sourceDurationSec ?? model.durationSec;
    return Math.max(0, Math.min(((clientX - rect.left) / rect.width) * sourceDurationSec, sourceDurationSec));
  }

  function sourceFrameFromClient(handle: HTMLElement, clientX: number) {
    const sourceTimeSec = sourceTimeFromClient(handle, clientX);
    if (sourceTimeSec === null) return null;
    return Math.round(sourceTimeSec * fps);
  }

  function clipTrimBounds(index: number, edge: 'head' | 'tail') {
    const region = model.lanes.screen[index];
    if (!region || !Number.isFinite(region.sourceIn) || !Number.isFinite(region.sourceOut) || !Number.isFinite(region.timelineIn) || !Number.isFinite(region.timelineOut)) return null;
    const previous = model.lanes.screen[index - 1];
    const next = model.lanes.screen[index + 1];
    const timelineIn = Math.round(region.timelineIn ?? 0);
    const timelineOut = Math.round(region.timelineOut ?? timelineIn + 1);
    const sourceIn = Math.round(region.sourceIn ?? 0);
    const sourceOut = Math.round(region.sourceOut ?? sourceIn + 1);
    if (edge === 'head') {
      return {
        minFrame: Math.max(Math.round(previous?.timelineOut ?? 0), timelineIn - sourceIn),
        maxFrame: timelineOut - 1,
      };
    }
    return {
      minFrame: timelineIn + 1,
      maxFrame: Math.min(Math.round(next?.timelineIn ?? sourceFrameDuration), timelineOut + (sourceFrameDuration - sourceOut)),
    };
  }

  function beginClipTrimDrag(region: { id: string; timelineIn?: number; timelineOut?: number }, index: number, edge: 'head' | 'tail', event: React.PointerEvent<HTMLButtonElement>) {
    if (!region.id) return;
    const bounds = clipTrimBounds(index, edge);
    if (!bounds) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    onScrubStart();
    let latestFrame: number | null = null;
    const clamp = (frame: number) => Math.max(bounds.minFrame, Math.min(bounds.maxFrame, frame));
    const move = (moveEvent: PointerEvent) => {
      const rawFrame = timelineFrameFromClient(handle, moveEvent.clientX);
      if (rawFrame === null) return;
      const nextFrame = clamp(rawFrame);
      latestFrame = nextFrame;
      setTrimDragPreview({ clipId: region.id, edge, frame: nextFrame });
      const safeTime = edge === 'head'
        ? Math.max(0, Math.min(model.durationSec, Math.max(nextFrame, Math.round(region.timelineIn ?? nextFrame)) / fps))
        : Math.max(0, Math.min(model.durationSec, Math.min(nextFrame - 1, Math.round(region.timelineOut ?? nextFrame) - 1) / fps));
      onScrub(safeTime);
      return nextFrame;
    };
    const up = (upEvent: PointerEvent) => {
      const nextFrame = move(upEvent);
      const commitFrame = nextFrame ?? latestFrame;
      setTrimDragPreview(null);
      if (commitFrame !== null) onTrimClipEdge(region.id, edge, commitFrame);
      onScrubEnd(commitFrame === null ? model.currentTimeSec : Math.max(0, Math.min(model.durationSec, commitFrame / fps)));
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function beginClipMoveDrag(region: { id: string; timelineIn?: number; timelineOut?: number }, index: number, event: React.PointerEvent<HTMLButtonElement>) {
    if (!onMoveClip || !region.id || event.button !== 0) return;
    if (!Number.isFinite(region.timelineIn) || !Number.isFinite(region.timelineOut)) return;
    const initialIn = Math.round(region.timelineIn ?? 0);
    const initialOut = Math.round(region.timelineOut ?? initialIn + 1);
    const duration = Math.max(1, initialOut - initialIn);
    // Free move, gaps allowed: clamp only so a clip cannot overlap its neighbors.
    const previous = model.lanes.screen[index - 1];
    const next = model.lanes.screen[index + 1];
    const minIn = Math.max(0, Math.round(previous?.timelineOut ?? 0));
    const maxIn = Math.max(minIn, next ? Math.round(next.timelineIn ?? 0) - duration : Math.round(model.durationSec * fps) - duration);
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    // A move never repositions the playhead (unlike trim), so it does not engage the scrub clock.
    const initialFrame = timelineFrameFromClient(handle, event.clientX) ?? initialIn;
    const clamp = (value: number) => Math.max(minIn, Math.min(maxIn, value));
    let latestIn = initialIn;
    let moved = false;
    const move = (moveEvent: PointerEvent) => {
      const rawFrame = timelineFrameFromClient(handle, moveEvent.clientX);
      if (rawFrame === null) return;
      const nextIn = clamp(initialIn + (rawFrame - initialFrame));
      if (nextIn !== initialIn) moved = true;
      latestIn = nextIn;
      setClipDragPreview({ clipId: region.id, timelineIn: nextIn, timelineOut: nextIn + duration });
    };
    const up = (upEvent: PointerEvent) => {
      move(upEvent);
      setClipDragPreview(null);
      // No movement keeps this a click, so the clipBody onClick still selects the clip.
      if (moved && latestIn !== initialIn) onMoveClip(region.id, latestIn);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }

  function nudgeClipTrimHandle(region: { id: string }, index: number, edge: 'head' | 'tail', direction: -1 | 1, largeStep: boolean) {
    const bounds = clipTrimBounds(index, edge);
    const current = model.lanes.screen[index];
    if (!bounds || !current) return;
    const stepFrames = largeStep ? Math.max(1, Math.round(fps)) : 1;
    const initialFrame = Math.round(edge === 'head' ? current.timelineIn ?? 0 : current.timelineOut ?? 0);
    const nextFrame = Math.max(bounds.minFrame, Math.min(bounds.maxFrame, initialFrame + direction * stepFrames));
    onTrimClipEdge(region.id, edge, nextFrame);
    onScrubEnd(Math.max(0, Math.min(model.durationSec, nextFrame / fps)));
  }

  function handleClipTrimHandleKey(region: { id: string }, index: number, edge: 'head' | 'tail', event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    nudgeClipTrimHandle(region, index, edge, event.key === 'ArrowRight' ? 1 : -1, event.shiftKey);
  }

  function beginZoomDrag(region: { id: string; startFrame?: number; endFrame?: number }, mode: 'move' | 'start' | 'end', event: React.PointerEvent<HTMLElement>) {
    if (mode === 'move' && (event.shiftKey || event.ctrlKey || event.metaKey)) return;
    if (!Number.isFinite(region.startFrame) || !Number.isFinite(region.endFrame)) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startClientX = event.clientX;
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
    let dragged = false;

    const update = (clientX: number) => {
      if (!dragged) {
        if (Math.abs(clientX - startClientX) < 4) return;
        dragged = true;
      }
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
      if (dragged) onZoomMarkerRangeChange(latest.id, latest.startFrame, latest.endFrame);
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
      if (selectedZoomMarkerIdSet.has(region.id) && selectedZoomMarkerCount > 1) deleteSelectedZoomMarkers();
      else onZoomMarkerRemove(region.id);
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

  function screenRegionStyle(region: { id: string; left: number; width: number; sourceIn?: number; sourceOut?: number; timelineIn?: number; timelineOut?: number }) {
    if (clipDragPreview?.clipId === region.id) {
      // Screen clips are placed by raw timeline frames over durationSec (no trimStartFrame offset),
      // matching frameRangeToPlacement(clip.timelineIn, clip.timelineOut, ...) in timeline-rail.mjs.
      const placement = frameRangeToPlacement(clipDragPreview.timelineIn, clipDragPreview.timelineOut, fps, model.durationSec);
      return { left: `${placement.left}%`, width: `${placement.width}%` };
    }
    if (!trimDragPreview || !Number.isFinite(region.sourceIn) || !Number.isFinite(region.sourceOut) || !Number.isFinite(region.timelineIn) || !Number.isFinite(region.timelineOut)) {
      return { left: `${region.left}%`, width: `${region.width}%` };
    }
    if (trimDragPreview.clipId !== region.id) return { left: `${region.left}%`, width: `${region.width}%` };
    if (trimDragPreview.edge === 'head') {
      const placement = frameRangeToPlacement(trimDragPreview.frame, region.timelineOut ?? trimDragPreview.frame + 1, fps, model.durationSec);
      return { left: `${placement.left}%`, width: `${placement.width}%` };
    }
    const placement = frameRangeToPlacement(region.timelineIn ?? 0, trimDragPreview.frame, fps, model.durationSec);
    return { left: `${placement.left}%`, width: `${placement.width}%` };
  }

  return (
    <div className="visualTimeline" aria-label="Timeline overview">
      <span className="visuallyHidden" data-ui-region="timeline-live-region" aria-live="polite">Timeline position {formatClock(model.currentTimeSec)}</span>
      <div
        className={`timelineViewport${timelinePanning ? ' panning' : ''}`}
        ref={viewportRef}
        onPointerDownCapture={beginTimelinePan}
        onAuxClick={preventMiddleTimelineAuxClick}
      >
        <div className="timelineContent" ref={contentRef} style={{ width: `${timelineContentWidthPx}px` }}>
          <div className="timelineRuler" aria-hidden="true" onPointerDown={handleHeaderSeekPointerDown} title="Click or drag to seek">
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
            <div className="timelineToolbar" data-ui-region="timeline-toolbar" onPointerDown={handleHeaderSeekPointerDown} title="Click or drag to seek">
              <button
                type="button"
                className={cutModeActive ? 'timelineToolButton active' : 'timelineToolButton'}
                aria-label="Cut tool"
                aria-pressed={cutModeActive}
                title={cutModeActive ? 'Cut tool active - drag a range on the screen lane. Esc to exit.' : 'Cut tool - drag a range on the screen lane to remove it.'}
                onClick={() => onCutModeToggle?.()}
              >
                <PhosphorScissors size={16} weight="duotone" />
              </button>
              <span className="timelineToolbarDivider" aria-hidden="true" />
              <button
                type="button"
                className="timelineToolButton"
                aria-label="Zoom timeline out"
                title="Zoom timeline out (-)"
                disabled={!timelineZoomedIn}
                onClick={() => applyTimelineViewportZoom(-1)}
              >
                <PhosphorMagnifyingGlassMinus size={16} weight="duotone" />
              </button>
              <button
                type="button"
                className="timelineToolButton"
                aria-label="Zoom timeline in"
                title="Zoom timeline in (+)"
                disabled={timelineZoomInDisabled}
                onClick={() => applyTimelineViewportZoom(1)}
              >
                <PhosphorMagnifyingGlassPlus size={16} weight="duotone" />
              </button>
              <button
                type="button"
                className="timelineToolButton timelineFitButton"
                aria-label="Fit timeline"
                title="Fit timeline"
                disabled={!timelineZoomedIn}
                onClick={fitTimelineViewport}
              >
                Fit
              </button>
            </div>
            <TimelineLane label="Screen" className={`screenLane ${cutModeActive ? 'cutModeActive' : ''}`} onTrackPointerDown={cutModeActive ? handleScreenLaneCutPointerDown : handleTimelineSeekPointerDown} trackTitle={cutModeActive ? 'Drag to mark a cut range' : 'Click or drag to seek'}>
          {model.lanes.screen.map((region, index) => (
            <div key={region.id} className={`clipBar ${clipDragPreview?.clipId === region.id ? 'dragging' : ''}`} style={screenRegionStyle(region)} data-recording-clip-id={region.id}>
              <button type="button" role="slider" className="trimHandle trimHandleStart" data-recording-trim-edge="head" aria-label={index === 0 ? 'Trim start' : `Trim clip ${index + 1} start`} aria-valuemin={clipTrimBounds(index, 'head')?.minFrame ?? 0} aria-valuemax={clipTrimBounds(index, 'head')?.maxFrame ?? 0} aria-valuenow={Math.round(region.timelineIn ?? 0)} aria-valuetext={`Clip ${index + 1} start ${Math.round(region.timelineIn ?? 0)} frames`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleClipTrimHandleKey(region, index, 'head', event)} onPointerDown={(event) => beginClipTrimDrag(region, index, 'head', event)} />
              <button type="button" className="clipBody" onPointerDown={(event) => beginClipMoveDrag(region, index, event)} onClick={() => onSelectInspectorContext({ group: 'recording', label: 'Screen recording', detail: 'Source clip selected from the timeline.' })}><Icon name="frame" /> Clip</button>
              <button type="button" role="slider" className="trimHandle trimHandleEnd" data-recording-trim-edge="tail" aria-label={index === model.lanes.screen.length - 1 ? 'Trim end' : `Trim clip ${index + 1} end`} aria-valuemin={clipTrimBounds(index, 'tail')?.minFrame ?? 0} aria-valuemax={clipTrimBounds(index, 'tail')?.maxFrame ?? sourceFrameDuration} aria-valuenow={Math.round(region.timelineOut ?? 0)} aria-valuetext={`Clip ${index + 1} end ${Math.round(region.timelineOut ?? 0)} frames`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleClipTrimHandleKey(region, index, 'tail', event)} onPointerDown={(event) => beginClipTrimDrag(region, index, 'tail', event)} />
            </div>
          ))}
          {cutDragPreview ? (() => {
            const start = Math.min(cutDragPreview.startFrame, cutDragPreview.endFrame);
            const end = Math.max(cutDragPreview.startFrame, cutDragPreview.endFrame);
            const placement = frameRangeToPlacement(start - model.trimStartFrame, end - model.trimStartFrame, fps, model.durationSec);
            return <div className="cutDragPreview" style={{ left: `${placement.left}%`, width: `${placement.width}%` }} aria-hidden="true" />;
          })() : null}
          {hasHiddenStart ? <button type="button" className="hiddenTrimRange hiddenTrimStart" aria-label="Restore hidden start" title={`Restore hidden start (${model.trimStartFrame} frames)`} onClick={onRestoreTrimStart}>Hidden start</button> : null}
          {hasHiddenEnd ? <button type="button" className="hiddenTrimRange hiddenTrimEnd" aria-label="Restore hidden end" title={`Restore hidden end (${sourceFrameDuration - model.trimEndFrame} frames)`} onClick={onRestoreTrimEnd}>Hidden end</button> : null}
          {cutRanges.map((range) => {
            const placement = frameRangeToPlacement(range.startFrame - model.trimStartFrame, range.endFrame - model.trimStartFrame, fps, model.durationSec);
            return <button key={range.id} type="button" className="hiddenCutRange" aria-label={`Restore cut ${formatClock((range.startFrame - model.trimStartFrame) / fps)} to ${formatClock((range.endFrame - model.trimStartFrame) / fps)}`} title="Restore this hidden middle range" style={{ left: `${placement.left}%`, width: `${placement.width}%` }} onClick={() => onRestoreCut(range.id)}>Restore cut</button>;
          })}
            </TimelineLane>
            <TimelineLane label="Zoom" className="zoomLane" aria-label="Zoom markers" onTrackPointerDown={onAddZoomMarkerAt ? handleZoomLanePointerDown : undefined} trackTitle="Click to add a zoom marker">
          {zoomSelectionPreview ? <div className="zoomSelectionMarquee" style={{ left: `${zoomSelectionPreview.left}%`, width: `${zoomSelectionPreview.width}%` }} aria-hidden="true" /> : null}
          {model.lanes.zoom.length > 0
            ? model.lanes.zoom.map((region) => {
                const label = region.label ?? 'Zoom region';
                const kind = region.kind ?? 'manual';
                const selected = selectedZoomMarkerIdSet.has(region.id) || selectedZoomMarkerId === region.id;
                const strength = Math.max(0, Math.min(1, region.strength ?? 0.5));
                const depthPct = Math.round(strength * 100);
                return (
                  <div key={region.id} role="button" tabIndex={0} aria-label={`${label}. Arrow keys move marker. Delete to remove.`} className={`timelineRegion ${kind === 'auto' ? 'autoRegion' : 'manualRegion'} ${selected ? 'selectedRegion' : ''}`} data-layer={region.layer ?? 0} data-zoom-marker-id={region.id} title={`${label} · ${depthPct}% · Click × to delete`} style={zoomRegionStyle(region)} onClick={(event) => selectZoomRegion(region, event)} onKeyDown={(event) => handleZoomKeyboard(region, 'move', event)} onPointerDown={(event) => beginZoomDrag(region, 'move', event)}>
                    <span className="zoomClipLabel"><Icon name={kind === 'auto' ? 'sparkle' : 'zoom'} /> Zoom</span>
                    <span role="slider" tabIndex={0} aria-label={`${label} start boundary`} aria-valuemin={0} aria-valuemax={Math.max(0, Math.round((region.endFrame ?? 15) - 15))} aria-valuenow={Math.round(region.startFrame ?? 0)} className="zoomResizeHandle zoomResizeStart" onKeyDown={(event) => handleZoomKeyboard(region, 'start', event)} onPointerDown={(event) => beginZoomDrag(region, 'start', event)} />
                    <span role="slider" tabIndex={0} aria-label={`${label} end boundary`} aria-valuemin={Math.round((region.startFrame ?? 0) + 15)} aria-valuemax={sourceFrameDuration} aria-valuenow={Math.round(region.endFrame ?? 15)} className="zoomResizeHandle zoomResizeEnd" onKeyDown={(event) => handleZoomKeyboard(region, 'end', event)} onPointerDown={(event) => beginZoomDrag(region, 'end', event)} />
                    {onZoomMarkerRemove ? (
                      <button
                        type="button"
                        className="zoomRegionDelete"
                        aria-label={`Delete ${label}`}
                        title={selected && selectedZoomMarkerCount > 1 ? 'Delete selected zooms' : 'Delete this zoom'}
                        onClick={(event) => { event.stopPropagation(); deleteZoomRegion(region.id); }}
                        onPointerDown={(event) => { event.stopPropagation(); }}
                      >×</button>
                    ) : null}
                  </div>
                );
              })
            : null}
          {(() => {
            const selectedRegion = selectedZoomMarkerCount === 1
              ? model.lanes.zoom.find((r) => r.id === selectedZoomMarkerIds[0])
              : null;
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
          {(() => {
            if (selectedZoomMarkerCount <= 1) return null;
            const selectedRegions = model.lanes.zoom.filter((region) => selectedZoomMarkerIdSet.has(region.id));
            if (selectedRegions.length <= 1) return null;
            const left = Math.min(...selectedRegions.map((region) => region.left ?? 0));
            const right = Math.max(...selectedRegions.map((region) => (region.left ?? 0) + (region.width ?? 0)));
            return (
              <div className="zoomEditorChip zoomEditorChip--multi" style={{ left: `${left + (right - left) / 2}%` }} role="group" aria-label={`${selectedRegions.length} selected zoom markers`} onPointerDown={(event) => event.stopPropagation()}>
                <span className="zoomEditorChip__range">{selectedRegions.length} zooms selected</span>
                <button type="button" className="zoomEditorChip__delete" onClick={deleteSelectedZoomMarkers}>
                  <PhosphorTrash size={14} weight="duotone" /> Delete
                </button>
              </div>
            );
          })()}
            </TimelineLane>
            <TimelineLane label="Clicks" className="clickLane" onTrackPointerDown={handleTimelineSeekPointerDown} trackTitle="Click or drag to seek">
          {model.lanes.clicks.length > 0
            ? model.lanes.clicks.map((event) => <button key={event.id} type="button" className="clickMarker" style={{ left: `${event.left}%` }} onClick={() => onSelectInspectorContext({ group: 'cursor', label: 'Click event', detail: 'Click telemetry selected from the timeline.' })} />)
            : <p>No click events yet.</p>}
            </TimelineLane>
            <TimelineLane label="Camera" className="cameraLane" onTrackPointerDown={handleTimelineSeekPointerDown} trackTitle="Click or drag to seek">
          {model.lanes.camera.length > 0
            ? model.lanes.camera.map((region) => <button key={region.id} type="button" className="presenceRegion" style={{ left: `${region.left}%`, width: `${region.width}%` }} onClick={() => onSelectInspectorContext({ group: 'camera', label: 'Camera track', detail: 'Camera presence selected from the timeline.' })}>Camera</button>)
            : <p>No camera track.</p>}
            </TimelineLane>
            <TimelineLane label="Audio" className="audioLane" onTrackPointerDown={handleTimelineSeekPointerDown} trackTitle="Click or drag to seek">
          {model.lanes.audio.length > 0
            ? model.lanes.audio.map((region) => <button key={region.id} type="button" className="presenceRegion" style={{ left: `${region.left}%`, width: `${region.width}%` }} onClick={() => onSelectInspectorContext({ group: 'recording', label: 'Audio track', detail: 'Audio presence selected from the timeline.' })}>Audio</button>)
            : <p>No audio track.</p>}
            </TimelineLane>
          </div>
        </div>
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


function AutoZoomGenerationPanel({
  project,
  onProjectChange,
}: {
  project: ProjectState;
  onProjectChange: (next: ProjectState, options?: ProjectChangeOptions) => void;
}) {
  const document = project.document as unknown as ProjectDocument;
  const markerCount = listMarkers(document).filter((marker) => marker.kind === 'auto').length;
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function generateAutoZooms() {
    const previous = project;
    const beforeCount = listMarkers(document).length;
    const nextDocument = addAutoZoomMarkersFromTelemetry(document);
    if (nextDocument === document) {
      setMessage('No new zooms found');
      return;
    }
    const addedCount = Math.max(0, listMarkers(nextDocument).length - beforeCount);
    const optimistic = { ...project, document: nextDocument as unknown as ProjectState['document'] };
    setMessage(null);
    setIsSaving(true);
    onProjectChange(optimistic, { history: true, previous });
    try {
      const saved = await saveProjectGuarded({ path: project.path, document: optimistic.document });
      onProjectChange(saved);
      setMessage(addedCount === 1 ? 'Added 1 zoom' : `Added ${addedCount} zooms`);
    } catch (err) {
      onProjectChange(previous);
      setMessage(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="cameraFollowPanel" aria-label="Auto zoom">
      <p className="eyebrow">Auto zoom</p>
      <div className="timelineCompactRow" data-ui-region="auto-zoom-generation-row">
        <span>Auto zooms</span>
        <strong>{markerCount}</strong>
      </div>
      <InspectorActionRow>
        <button
          type="button"
          className="secondary compact"
          disabled={isSaving}
          onClick={() => { void generateAutoZooms(); }}
        >
          {isSaving ? 'Generating...' : 'Generate auto zooms'}
        </button>
      </InspectorActionRow>
      {message ? <p className={message.includes('failed') || message.includes('Failed') ? 'error' : 'saved'}>{message}</p> : null}
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

function ExportPresetDetails({ mode, exportScope, aspectRatio }: { mode: ExportMode; exportScope: ExportScope; aspectRatio?: ProjectAspectRatio }) {
  const rangeLabel = exportScope === 'used-content' ? 'used content only' : 'full timeline';
  if (mode === 'raw') {
    return <p className="exportPreset">Raw export keeps source pixels unchanged when the {rangeLabel} can be stream-copied.</p>;
  }
  if (mode === 'experimental-headless') {
    return (
      <div className="exportPresetDetails">
        <p className="exportPreset">
          Experimental headless export: {rangeLabel}, shared composition plan, FFmpeg styled fallback while the renderer is behind the parity gate.
        </p>
        <span className="exportPresetChip" data-active-aspect-ratio={aspectRatio ?? 'auto'}>Experimental</span>
      </div>
    );
  }

  const activeRatio = aspectRatio ?? 'auto';
  return (
    <div className="exportPresetDetails">
      <p className="exportPreset">
        Styled preset: {rangeLabel}, selected aspect ratio, full-screen fit, pastel background, rounded screen, soft shadow.
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
      const renderFrame = Math.max(0, video.currentTime * fps);
      const resolvePreviewFrame = (frameNumber: number) => resolveFrame(document, frameNumber, {
        getCursorPosition: getCursorPositionForFrame,
      });
      let frame;
      try {
        frame = resolvePreviewFrame(renderFrame);
      } catch {
        // Fall back to identity when resolveFrame can't process the document
        // (e.g. partial state during initial load).
        frame = { cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 } };
      }
      let previousMotionFrame = null;
      let nextMotionFrame = null;
      try {
        previousMotionFrame = resolvePreviewFrame(Math.max(0, renderFrame - 1));
        nextMotionFrame = resolvePreviewFrame(renderFrame + 1);
      } catch {
        previousMotionFrame = null;
        nextMotionFrame = null;
      }
      const zoomMotionBlurPx = resolveZoomMotionBlurPx({
        previous: previousMotionFrame?.cameraTransform,
        current: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
        next: nextMotionFrame?.cameraTransform,
        sourceWidth,
        sourceHeight,
        reducedMotion: !video.paused || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
      });
      const dragScreenRect = screenDragRef.current;
      const resolvedScreenFrame = dragScreenRect
        ? { x: dragScreenRect.x * canvasWidth, y: dragScreenRect.y * canvasHeight, w: dragScreenRect.w * canvasWidth, h: dragScreenRect.h * canvasHeight }
        : resolveScreenFrame(frame.screenFrame, defaultScreenX, defaultScreenY, defaultScreenWidth, defaultScreenHeight, canvasWidth, canvasHeight);
      const screenSource = resolveScreenSourceViewport(sourceWidth, sourceHeight, frame.screenCrop);
      const screenDrawScale = Math.min(resolvedScreenFrame.w / screenSource.w, resolvedScreenFrame.h / screenSource.h);
      const screenWidth = screenSource.w * screenDrawScale;
      const screenHeight = screenSource.h * screenDrawScale;
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
      drawZoomMotionSource(ctx, video, {
        screenX,
        screenY,
        screenDrawScale,
        screenSource,
        sourceWidth,
        sourceHeight,
        transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
        blurPx: zoomMotionBlurPx,
        sharpZoom: video.paused,
      });
      ctx.save();
      applyScreenSourceTransform(ctx, {
        screenX,
        screenY,
        screenDrawScale,
        screenSource,
        transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
      });
      const resolvedCursor = frame.cursor;
      drawClickEmphasis(ctx, cursorEvents, renderFrame, resolvedCursor?.clickEffect ?? 'ring');
      const cursorPos = cursorAtFrame(cursorEvents, renderFrame);
      if (cursorPos && resolvedCursor?.visible !== false) {
        drawCursorPath(ctx, cursorPos.x, cursorPos.y, {
          style: resolvedCursor?.style ?? 'default',
          sizePercent: resolvedCursor?.sizePercent ?? 100,
        });
      }
      ctx.restore();
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
        const cameraFrame = constrainCameraShapeFrame(dragRect
          ? { x: dragRect.x * canvasWidth, y: dragRect.y * canvasHeight, w: dragRect.w * canvasWidth, h: dragRect.h * canvasHeight }
          : resolveCameraFrame(frame.cameraFrame, frame.cameraPresentation, canvasWidth, canvasHeight), frame.cameraPresentation, canvasWidth, canvasHeight);
        cameraRectRef.current = cameraFrame;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = true;
        const cameraRadius = resolveCameraRadius(frame.cameraPresentation, cameraFrame);
        ctx.save();
        if (frame.cameraPresentation?.shadowEnabled !== false) {
          ctx.shadowColor = `rgba(0, 0, 0, ${frame.cameraPresentation?.shadowOpacity ?? 0.45})`;
          ctx.shadowBlur = frame.cameraPresentation?.shadowBlur ?? 24;
          ctx.shadowOffsetY = 8;
        }
        addCameraShapePath(ctx, cameraFrame, frame.cameraPresentation, cameraRadius);
        ctx.clip();
        const cameraSource = resolveCameraSourceRect(
          cameraVideo.videoWidth,
          cameraVideo.videoHeight,
          cameraFrame.w,
          cameraFrame.h,
          frame.cameraCrop,
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
        if (onCameraFrameChange) drawEditorFrameControls(ctx, cameraFrame, '#f59e0b', frame.cameraPresentation);
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
  presentation: Partial<CameraPresentation> | undefined,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (normalizedFrame) {
    return constrainCameraShapeFrame({
      x: normalizedFrame.x * canvasWidth,
      y: normalizedFrame.y * canvasHeight,
      w: normalizedFrame.w * canvasWidth,
      h: normalizedFrame.h * canvasHeight,
    }, presentation, canvasWidth, canvasHeight);
  }
  const rect = getCameraLayoutRect(
    { ...DEFAULT_CAMERA_PRESENTATION, ...(presentation ?? {}) },
    canvasWidth,
    canvasHeight,
  );
  return constrainCameraShapeFrame({
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
  }, presentation, canvasWidth, canvasHeight);
}

function constrainCameraShapeFrame(
  frame: { x: number; y: number; w: number; h: number },
  presentation: Partial<CameraPresentation> | undefined,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (presentation?.shape !== 'circle') return frame;
  const size = Math.max(2, Math.min(frame.w, frame.h, canvasWidth, canvasHeight));
  return {
    x: Math.max(0, Math.min(canvasWidth - size, frame.x + (frame.w - size) / 2)),
    y: Math.max(0, Math.min(canvasHeight - size, frame.y + (frame.h - size) / 2)),
    w: size,
    h: size,
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

function drawEditorFrameControls(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number } | null,
  color: string,
  presentation?: Partial<CameraPresentation>,
) {
  if (!rect) return;
  const handleSize = Math.max(14, Math.min(26, Math.min(rect.w, rect.h) * 0.12));
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.setLineDash([12, 8]);
  if (presentation?.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.lineWidth = 4;
  const handles = presentation?.shape === 'circle' ? circleFrameHandles(rect) : frameResizeHandles(rect);
  for (const handle of handles) {
    ctx.beginPath();
    ctx.roundRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize, 5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function circleFrameHandles(rect: { x: number; y: number; w: number; h: number }) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.min(rect.w, rect.h) / 2;
  const d = r / Math.SQRT2;
  return [
    { x: cx - d, y: cy - d },
    { x: cx + d, y: cy - d },
    { x: cx + d, y: cy + d },
    { x: cx - d, y: cy + d },
  ];
}

function addCameraShapePath(
  ctx: CanvasRenderingContext2D,
  frame: { x: number; y: number; w: number; h: number },
  presentation: Partial<CameraPresentation> | undefined,
  radius: number,
) {
  if (presentation?.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(frame.x + frame.w / 2, frame.y + frame.h / 2, Math.min(frame.w, frame.h) / 2, 0, Math.PI * 2);
    return;
  }
  addRoundedRect(ctx, frame.x, frame.y, frame.w, frame.h, radius);
}

function resolveCameraSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
  crop?: RegionCrop,
) {
  if (![sourceWidth, sourceHeight, destWidth, destHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const cropEnabled = crop?.enabled === true;
  const base = cropEnabled
    ? {
        x: Math.max(0, Math.min(sourceWidth - 1, Math.round(crop.x))),
        y: Math.max(0, Math.min(sourceHeight - 1, Math.round(crop.y))),
        w: Math.max(1, Math.min(sourceWidth, Math.round(crop.width))),
        h: Math.max(1, Math.min(sourceHeight, Math.round(crop.height))),
      }
    : { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  base.w = Math.max(1, Math.min(base.w, sourceWidth - base.x));
  base.h = Math.max(1, Math.min(base.h, sourceHeight - base.y));
  const covered = coverSourceRect(base.w, base.h, destWidth, destHeight);
  if (!covered) return null;
  return {
    sx: base.x + covered.sx,
    sy: base.y + covered.sy,
    sw: covered.sw,
    sh: covered.sh,
  };
}

function resolveScreenSourceViewport(sourceWidth: number, sourceHeight: number, crop?: RegionCrop) {
  if (![sourceWidth, sourceHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { x: 0, y: 0, w: Math.max(1, sourceWidth || 1), h: Math.max(1, sourceHeight || 1) };
  }
  if (crop?.enabled !== true) return { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.round(crop.y)));
  const w = Math.max(1, Math.min(sourceWidth - x, Math.round(crop.width)));
  const h = Math.max(1, Math.min(sourceHeight - y, Math.round(crop.height)));
  return { x, y, w, h };
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

function normalizeAudioGainPercent(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_RECORDED_GAIN_PERCENT;
  return Math.max(0, Math.min(200, Math.round(number)));
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
