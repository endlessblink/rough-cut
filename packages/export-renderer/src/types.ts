import type { ProjectDocument, ExportSettings } from '@rough-cut/project-model';

export interface ExportJobConfig {
  project: ProjectDocument;
  settings: ExportSettings;
  outputPath: string;
}

export interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  elapsedMs: number;
}

export type ExportStatus = 'idle' | 'rendering' | 'encoding' | 'complete' | 'failed' | 'cancelled';

export interface ExportResult {
  status: 'complete' | 'failed' | 'cancelled';
  outputPath?: string;
  error?: string;
  totalFrames: number;
  durationMs: number;
}

export interface ExportEventHandlers {
  onProgress?: (progress: ExportProgress) => void;
  onComplete?: (result: ExportResult) => void;
  onError?: (error: Error) => void;
}
