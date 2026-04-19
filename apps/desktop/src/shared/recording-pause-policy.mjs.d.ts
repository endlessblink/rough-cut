export type { RecordingBackend, RecordingPauseCapability } from './recording-pause-policy';

export function getRecordingPauseCapability(options?: {
  screenCaptureBackend?: import('./recording-pause-policy').RecordingBackend;
  audioCaptureBackend?: import('./recording-pause-policy').RecordingBackend;
  capturesCursor?: boolean;
  capturesCamera?: boolean;
}): import('./recording-pause-policy').RecordingPauseCapability;
