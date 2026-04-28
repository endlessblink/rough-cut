import test from 'node:test';
import assert from 'node:assert/strict';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { isFfmpegCaptureAvailable } from './recording/ffmpeg-capture.mjs';

test('desktop main dependencies load', () => {
  assert.equal(IPC_CHANNELS.RECORDING_START, 'recording:start');
  assert.equal(typeof isFfmpegCaptureAvailable(), 'boolean');
});
