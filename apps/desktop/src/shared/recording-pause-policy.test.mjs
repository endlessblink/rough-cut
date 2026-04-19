import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecordingPauseCapability } from './recording-pause-policy.mjs';

test('pause stays disabled when saved artifacts continue beyond the panel recorder', () => {
  const capability = getRecordingPauseCapability({
    screenCaptureBackend: 'ffmpeg',
    audioCaptureBackend: 'ffmpeg',
    capturesCursor: true,
    capturesCamera: true,
  });

  assert.equal(capability.supported, false);
  assert.deepEqual(capability.blockers, [
    'screen capture continues in FFmpeg',
    'audio capture continues in FFmpeg',
    'cursor capture continues in the saved sidecar',
    'camera capture continues separately from the paused panel recorder',
  ]);
  assert.match(capability.reason, /saved recording would keep capturing while the panel looks paused/i);
});

test('pause is only available when every saved output pauses together', () => {
  const capability = getRecordingPauseCapability({
    screenCaptureBackend: 'media-recorder',
    audioCaptureBackend: 'media-recorder',
    capturesCursor: false,
    capturesCamera: false,
  });

  assert.equal(capability.supported, true);
  assert.deepEqual(capability.blockers, []);
  assert.equal(capability.reason, null);
});
