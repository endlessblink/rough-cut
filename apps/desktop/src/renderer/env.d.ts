import type { ProjectDocument, ExportSettings } from '@rough-cut/project-model';
import type { ExportProgress, ExportResult } from '@rough-cut/export-renderer';

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
}

/** Type declaration for the preload API exposed on window.roughcut */
export interface RoughCutAPI {
  // Project I/O
  projectOpen(): Promise<ProjectDocument | null>;
  projectSave(project: ProjectDocument, filePath: string): Promise<boolean>;
  projectSaveAs(project: ProjectDocument): Promise<string | null>;
  projectNew(): Promise<null>;

  // Export
  exportStart(project: ProjectDocument, settings: ExportSettings, outputPath: string): Promise<void>;
  exportCancel(): Promise<void>;
  onExportProgress(callback: (progress: ExportProgress) => void): () => void;
  onExportComplete(callback: (result: ExportResult) => void): () => void;

  // Recording
  recordingGetSources(): Promise<CaptureSource[]>;
  recordingSaveRecording(buffer: ArrayBuffer, metadata: RecordingMetadata): Promise<RecordingResult>;

  // App
  getVersion(): Promise<string>;
}

declare global {
  interface Window {
    roughcut: RoughCutAPI;
  }
}
