import type {
  ProjectDocument,
  LibraryDocument,
  LibraryTranscriptSegment,
  ExportSettings,
} from '@rough-cut/project-model';
import type { ExportProgress, ExportResult } from '@rough-cut/export-renderer';
import type { RecordingConfigPatch, RecordingConfigState } from '@rough-cut/store';

// ---- Storage types ----

export interface MountedVolume {
  path: string;
  name: string;
}

// ---- Recent Projects types ----

export interface RecentProjectEntry {
  filePath: string;
  name: string;
  modifiedAt: string;
  resolution?: string;
  assetCount?: number;
  thumbnailPath?: string;
}

// ---- Recording types ----

export interface CaptureSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnailDataUrl: string;
  displayId?: string | null;
}

export interface CaptureDisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface SystemAudioSourceOption {
  id: string;
  label: string;
}

export interface RecordingMetadata {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  timelineFps?: number;
  projectDir?: string;
}

export interface RecordingResult {
  filePath: string;
  durationFrames: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
  hasAudio: boolean;
  cursorEventsPath?: string;
  thumbnailPath?: string;
  cameraFilePath?: string;
  audioCapture?: {
    requested: {
      micEnabled: boolean;
      sysAudioEnabled: boolean;
      selectedMicDeviceId: string | null;
      selectedMicLabel: string | null;
      selectedSystemAudioSourceId: string | null;
    };
    resolved: {
      micSource: string | null;
      systemAudioSource: string | null;
    };
    final: {
      hasAudio: boolean;
    };
  };
}

export interface DisplayMediaSelectionDebugInfo {
  requestedRecordMode: string | null;
  configuredSelectedSourceId: string | null;
  grantedSourceId: string | null;
  grantedSourceType: 'screen' | 'window' | null;
}

export interface RecordingPermissionDiagnostic {
  status: 'granted' | 'attention' | 'not-required' | 'unsupported';
  detail: string;
  canOpenSettings: boolean;
}

export interface RecordingPreflightStatus {
  platform: 'darwin' | 'win32' | 'linux' | string;
  requiresFullRelaunch: boolean;
  screenCapture: RecordingPermissionDiagnostic;
  microphone: RecordingPermissionDiagnostic;
  camera: RecordingPermissionDiagnostic;
}

export interface RecordingPermissionSettingsResult {
  opened: boolean;
  requiresFullRelaunch: boolean;
  message: string;
}

export interface RecordingRecoveryMarker {
  version: number;
  startedAt: string;
  recordingsDir: string;
  sourceId?: string | null;
  recordMode?: string | null;
  sessionState?: string | null;
  interruptionReason?: string | null;
  interruptedAt?: string | null;
  captureMetadata?: {
    fps: number | null;
    width: number | null;
    height: number | null;
    timelineFps: number | null;
  } | null;
  expectedArtifacts?: {
    videoPath: string | null;
    audioPath: string | null;
    cursorPath: string | null;
  };
  canRecover?: boolean;
  recoveryCandidate?: {
    videoPath: string;
    videoFileSize: number;
    videoModifiedAt: string;
    audioPath: string | null;
    cursorPath: string | null;
  };
}

export interface RecordingSessionConnectionIssues {
  mic: string | null;
  camera: string | null;
  systemAudio: string | null;
  source: string | null;
}

/** Type declaration for the preload API exposed on window.roughcut */
export interface RoughCutAPI {
  // Project I/O
  projectOpen(): Promise<{ project: ProjectDocument; filePath: string } | null>;
  projectSave(project: ProjectDocument, filePath: string): Promise<boolean>;
  projectSaveAs(project: ProjectDocument): Promise<string | null>;
  projectNew(): Promise<null>;
  projectOpenPath(filePath: string): Promise<ProjectDocument>;
  libraryOpen(): Promise<{ library: LibraryDocument; filePath: string } | null>;
  librarySave(library: LibraryDocument, filePath: string): Promise<boolean>;
  librarySaveAs(library: LibraryDocument): Promise<string | null>;
  libraryOpenPath(filePath: string): Promise<LibraryDocument>;

  // Export
  exportStart(
    project: ProjectDocument,
    settings: ExportSettings,
    outputPath: string,
  ): Promise<ExportResult>;
  exportCancel(): Promise<void>;
  onExportProgress(callback: (progress: ExportProgress) => void): () => void;
  onExportComplete(callback: (result: ExportResult) => void): () => void;
  exportEmitProgress(progress: ExportProgress): void;
  exportEmitComplete(result: ExportResult): void;
  exportPickOutputPath(
    projectName: string,
    format: ExportSettings['format'],
  ): Promise<string | null>;
  exportFinalizeMedia(
    project: ProjectDocument,
    videoPath: string,
    outputPath: string,
  ): Promise<{ outputPath: string; audioIncluded: boolean }>;

  // Recording
  recordingGetSources(): Promise<CaptureSource[]>;
  recordingGetDisplayBounds(): Promise<CaptureDisplayBounds[]>;
  recordingGetSystemAudioSources(): Promise<SystemAudioSourceOption[]>;
  recordingGetPreflightStatus(): Promise<RecordingPreflightStatus>;
  recordingOpenPermissionSettings(
    kind: 'screenCapture' | 'microphone' | 'camera',
  ): Promise<RecordingPermissionSettingsResult>;
  recordingRecoveryGet(): Promise<RecordingRecoveryMarker | null>;
  recordingRecoveryRecover(): Promise<RecordingResult | null>;
  recordingRecoveryDismiss(): Promise<boolean>;
  recordingSaveRecording(
    buffer: ArrayBuffer,
    metadata: RecordingMetadata,
  ): Promise<RecordingResult>;

  // Recording Session (floating toolbar flow)
  recordingSessionStart(): Promise<void>;
  recordingSessionStop(): Promise<void>;
  onSessionCountdownTick(callback: (seconds: number) => void): () => void;
  onSessionStatusChanged(callback: (status: string) => void): () => void;
  onSessionElapsed(callback: (ms: number) => void): () => void;
  onSessionConnectionIssuesChanged(
    callback: (issues: RecordingSessionConnectionIssues | null) => void,
  ): () => void;
  notifyToolbarReady(): void;

  // Recent Projects
  recentProjectsGet(): Promise<RecentProjectEntry[]>;
  recentProjectsRemove(filePath: string): Promise<void>;
  recentProjectsClear(): Promise<void>;

  // App
  getVersion(): Promise<string>;
  shellOpenPath(filePath: string): Promise<string>;
  shellShowItemInFolder(filePath: string): Promise<void>;

  // File system
  readTextFile(filePath: string): Promise<string | null>;
  readBinaryFile(filePath: string): Promise<ArrayBuffer | null>;
  writeBinaryFile(filePath: string, buffer: ArrayBuffer): Promise<boolean>;

  // Auto-save
  projectAutoSave(project: ProjectDocument, filePath?: string): Promise<string>;

  // Storage
  storageGetRecordingLocation(): Promise<string>;
  storageSetRecordingLocation(path: string): Promise<void>;
  storagePickDirectory(): Promise<string | null>;
  storageGetMountedVolumes(): Promise<MountedVolume[]>;
  storageGetFavorites(): Promise<string[]>;
  storageAddFavorite(path: string): Promise<void>;
  storageRemoveFavorite(path: string): Promise<void>;

  // Recording Panel (self-contained floating window)
  openRecordingPanel(): Promise<void>;
  closeRecordingPanel(): Promise<void>;
  panelResize(mode: 'setup' | 'mini'): Promise<void>;
  panelSetSource(sourceId: string): void;
  recordingConfigGet(): Promise<Omit<RecordingConfigState, 'hydrated'>>;
  recordingConfigUpdate(
    patch: RecordingConfigPatch,
  ): Promise<Omit<RecordingConfigState, 'hydrated'>>;
  onRecordingConfigChanged(
    callback: (config: Omit<RecordingConfigState, 'hydrated'>) => void,
  ): () => void;
  panelStartRecording(audioConfig?: {
    micEnabled?: boolean;
    sysAudioEnabled?: boolean;
    countdownSeconds?: number;
    selectedMicDeviceId?: string | null;
    selectedMicLabel?: string | null;
    selectedSystemAudioSourceId?: string | null;
  }): Promise<void>;
  panelStopRecording(): Promise<void>;
  panelReportConnectionIssues(issues: RecordingSessionConnectionIssues | null): void;
  panelPause(): void;
  panelResume(): void;
  onPanelPauseRequested(callback: () => void): () => void;
  onPanelResumeRequested(callback: () => void): () => void;
  panelSaveRecording(
    buffer: ArrayBuffer,
    metadata: RecordingMetadata,
    cameraBuffer?: ArrayBuffer,
  ): Promise<RecordingResult>;
  panelMediaRecorderStarted(timestampMs: number): void;
  onRecordingAssetReady(callback: (result: RecordingResult) => void): () => void;

  // AI Analysis
  aiGetApiKey(provider: string): Promise<string>;
  aiSetApiKey(provider: string, apiKey: string): Promise<boolean>;
  aiGetProviderConfig(): Promise<{ provider: string }>;
  aiSetProviderConfig(provider: string): Promise<boolean>;
  aiTranscribeLibrarySource(
    libraryFilePath: string,
    sourceId: string,
    fps?: number,
  ): Promise<{
    library: LibraryDocument;
    sourceId: string;
    transcriptSegments: readonly LibraryTranscriptSegment[];
  }>;
  aiAnalyzeCaptions(
    assets: Array<{ id: string; filePath: string }>,
    fps: number,
  ): Promise<
    Array<{
      id: string;
      assetId: string;
      status: 'pending' | 'accepted' | 'rejected';
      confidence: number;
      startFrame: number;
      endFrame: number;
      text: string;
      words: Array<{
        word: string;
        startFrame: number;
        endFrame: number;
        confidence: number;
      }>;
    }>
  >;
  aiCancelAnalysis(): Promise<boolean>;
  onAIProgress(
    callback: (progress: { assetId: string | null; stage: string; percent: number }) => void,
  ): () => void;

  // Debug (temporary)
  debugLoadLastRecording(): Promise<RecordingResult | null>;
  debugGetLastDisplayMediaSelection(): Promise<DisplayMediaSelectionDebugInfo | null>;
  debugSetRecordingRecovery(
    payload: Omit<RecordingRecoveryMarker, 'version'> | null,
  ): Promise<RecordingRecoveryMarker | null>;
  debugSetCaptureSources(
    payload: Array<{
      id: string;
      name: string;
      type: 'screen' | 'window';
      thumbnailDataUrl?: string;
      displayId?: string | null;
    }> | null,
  ): Promise<Array<{
    id: string;
    name: string;
    type: 'screen' | 'window';
    thumbnailDataUrl?: string;
    displayId?: string | null;
  }> | null>;
  debugSetDisplayBounds(
    payload: CaptureDisplayBounds[] | null,
  ): Promise<CaptureDisplayBounds[] | null>;

  // Zoom sidecar persistence (next to the recording .webm)
  zoomLoadSidecar(recordingFilePath: string): Promise<{
    autoIntensity: number;
    followCursor: boolean;
    followAnimation: 'focused' | 'smooth';
    followPadding: number;
    markers: readonly unknown[];
  } | null>;
  zoomSaveSidecar(
    recordingFilePath: string,
    presentation: {
      autoIntensity: number;
      followCursor: boolean;
      followAnimation: 'focused' | 'smooth';
      followPadding: number;
      markers: readonly unknown[];
    },
  ): Promise<boolean>;
  storageGetAutoZoomIntensity(): Promise<number>;
  storageSetAutoZoomIntensity(intensity: number): Promise<void>;
}

declare global {
  interface Window {
    roughcut: RoughCutAPI;
  }
}
