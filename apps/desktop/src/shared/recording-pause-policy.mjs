// @ts-check

/**
 * @typedef {'media-recorder' | 'ffmpeg' | 'none'} RecordingBackend
 */

/**
 * Describe whether a pause control would be truthful for the saved artifact.
 *
 * @param {{
 *   screenCaptureBackend?: RecordingBackend,
 *   audioCaptureBackend?: RecordingBackend,
 *   capturesCursor?: boolean,
 *   capturesCamera?: boolean,
 * }} [options]
 */
export function getRecordingPauseCapability(options = {}) {
  const {
    screenCaptureBackend = 'media-recorder',
    audioCaptureBackend = 'none',
    capturesCursor = false,
    capturesCamera = false,
  } = options;

  /** @type {string[]} */
  const blockers = [];

  if (screenCaptureBackend === 'ffmpeg') {
    blockers.push('screen capture continues in FFmpeg');
  }

  if (audioCaptureBackend === 'ffmpeg') {
    blockers.push('audio capture continues in FFmpeg');
  }

  if (capturesCursor) {
    blockers.push('cursor capture continues in the saved sidecar');
  }

  if (capturesCamera) {
    blockers.push('camera capture continues separately from the paused panel recorder');
  }

  const supported = blockers.length === 0;

  return {
    supported,
    blockers,
    label: supported ? 'Pause available' : 'Pause unavailable',
    reason: supported
      ? null
      : `Pause is unavailable because the saved recording would keep capturing while the panel looks paused: ${blockers.join('; ')}.`,
  };
}
