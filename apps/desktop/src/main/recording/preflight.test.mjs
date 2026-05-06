import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDiskFreeBytes, getRecordingPreflightStatus } from './preflight.mjs';

test('classifyDiskFreeBytes warns below 60 minute budget', () => {
  assert.equal(classifyDiskFreeBytes(20 * 1024 * 1024 * 1024).severity, 'ok');
  assert.equal(classifyDiskFreeBytes(10 * 1024 * 1024 * 1024).severity, 'warn');
  assert.equal(classifyDiskFreeBytes(4 * 1024 * 1024 * 1024).severity, 'critical');
});

test('preflight keeps optional missing sources non-blocking', async () => {
  const status = await getRecordingPreflightStatus({
    recordingsDir: '/tmp',
    displayInfo: { width: 1280, height: 720 },
    micSources: [],
    systemAudioSources: [],
    cameraSources: [],
    options: {
      recordMic: true,
      recordSystemAudio: true,
      recordCamera: true,
      captureMode: 'display',
    },
  });

  assert.equal(status.capture.width, 1280);
  assert.equal(status.capture.height, 720);
  assert.equal(status.checks.find((check) => check.id === 'mic')?.severity, 'warn');
  assert.equal(status.checks.find((check) => check.id === 'system-audio')?.severity, 'warn');
  assert.equal(status.checks.find((check) => check.id === 'camera')?.severity, 'warn');
});
