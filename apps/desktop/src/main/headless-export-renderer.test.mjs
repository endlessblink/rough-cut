import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptExperimentalHeadlessRender,
  HEADLESS_EXPORT_BACKEND,
  resolveExperimentalHeadlessAvailability,
} from './headless-export-renderer.mjs';

test('experimental headless renderer stays disabled unless explicitly opted in', async () => {
  const availability = await resolveExperimentalHeadlessAvailability({
    env: {},
    electronRuntime: { available: true },
  });

  assert.deepEqual(availability, {
    enabled: false,
    available: false,
    reason: 'experimental-headless-export-disabled',
  });
});

test('experimental headless UI flag does not enable the export renderer', async () => {
  const availability = await resolveExperimentalHeadlessAvailability({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI: '1' },
    electronRuntime: { available: true },
  });

  assert.deepEqual(availability, {
    enabled: false,
    available: false,
    reason: 'experimental-headless-export-disabled',
  });
});

test('experimental headless renderer reports missing Electron runtime as fallback reason', async () => {
  const availability = await resolveExperimentalHeadlessAvailability({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: false, reason: 'electron-runtime-unavailable' },
  });

  assert.deepEqual(availability, {
    enabled: true,
    available: false,
    reason: 'electron-runtime-unavailable',
  });
});

test('experimental headless renderer attempt returns structured not-implemented metadata', async () => {
  const attempt = await attemptExperimentalHeadlessRender({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: true },
    outputPath: '/tmp/headless.mp4',
    compositionPlan: {
      output: { width: 1920, height: 1080 },
      frames: [{ frameIndex: 0 }, { frameIndex: 15 }],
    },
  });

  assert.equal(attempt.backend, HEADLESS_EXPORT_BACKEND);
  assert.equal(attempt.attempted, true);
  assert.equal(attempt.available, true);
  assert.equal(attempt.ok, false);
  assert.equal(attempt.reason, 'electron-headless-renderer-not-implemented');
  assert.equal(attempt.outputPath, '/tmp/headless.mp4');
  assert.equal(attempt.frameCount, 2);
  assert.deepEqual(attempt.output, { width: 1920, height: 1080 });
});
