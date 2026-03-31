import type { ProjectDocument, ExportSettings } from '@rough-cut/project-model';
import type { ExportProgress, ExportResult } from '@rough-cut/export-renderer';

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
}

export interface RecordingMetadata {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  projectDir?: string;
}

export interface RecordingResult {
  filePath: string;
  durationFrames: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
  thumbnailPath?: string;
  cameraFilePath?: string;
}

/** Type declaration for the preload API exposed on window.roughcut */
export interface RoughCutAPI {
  // Project I/O
  projectOpen(): Promise<{ project: ProjectDocument; filePath: string } | null>;
  projectSave(project: ProjectDocument, filePath: string): Promise<boolean>;
  projectSaveAs(project: ProjectDocument): Promise<string | null>;
  projectNew(): Promise<null>;
  projectOpenPath(filePath: string): Promise<ProjectDocument>;

  // Export
  exportStart(project: ProjectDocument, settings: ExportSettings, outputPath: string): Promise<void>;
  exportCancel(): Promise<void>;
  onExportProgress(callback: (progress: ExportProgress) => void): () => void;
  onExportComplete(callback: (result: ExportResult) => void): () => void;

  // Recording
  recordingGetSources(): Promise<CaptureSource[]>;
  recordingSaveRecording(buffer: ArrayBuffer, metadata: RecordingMetadata): Promise<RecordingResult>;

  // Recording Session (floating toolbar flow)
  recordingSessionStart(): Promise<void>;
  recordingSessionStop(): Promise<void>;
  onSessionCountdownTick(callback: (seconds: number) => void): () => void;
  onSessionStatusChanged(callback: (status: string) => void): () => void;
  onSessionElapsed(callback: (ms: number) => void): () => void;
  notifyToolbarReady(): void;

  // Recent Projects
  recentProjectsGet(): Promise<RecentProjectEntry[]>;
  recentProjectsRemove(filePath: string): Promise<void>;
  recentProjectsClear(): Promise<void>;

  // App
  getVersion(): Promise<string>;

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
  panelSetSource(sourceId: string): void;
  panelStartRecording(): Promise<void>;
  panelStopRecording(): Promise<void>;
  panelPause(): void;
  panelResume(): void;
  panelSaveRecording(buffer: ArrayBuffer, metadata: RecordingMetadata, cameraBuffer?: ArrayBuffer): Promise<RecordingResult>;
  onRecordingAssetReady(callback: (result: RecordingResult) => void): () => void;

  // AI Analysis
  aiGetApiKey(provider: string): Promise<string>;
  aiSetApiKey(provider: string, apiKey: string): Promise<boolean>;
  aiGetProviderConfig(): Promise<{ provider: string }>;
  aiSetProviderConfig(provider: string): Promise<boolean>;
  aiAnalyzeCaptions(assets: Array<{ id: string; filePath: string }>, fps: number): Promise<Array<{
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
  }>>;
  aiCancelAnalysis(): Promise<boolean>;
  onAIProgress(callback: (progress: { assetId: string | null; stage: string; percent: number }) => void): () => void;
}

declare global {
  interface Window {
    roughcut: RoughCutAPI;
  }
}
