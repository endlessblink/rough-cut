export type RecordingBackend = 'media-recorder' | 'ffmpeg' | 'none';

export interface RecordingPauseCapability {
  supported: boolean;
  blockers: string[];
  label: string;
  reason: string | null;
}

export function getRecordingPauseCapability(options?: {
  screenCaptureBackend?: RecordingBackend;
  audioCaptureBackend?: RecordingBackend;
  capturesCursor?: boolean;
  capturesCamera?: boolean;
}): RecordingPauseCapability;
