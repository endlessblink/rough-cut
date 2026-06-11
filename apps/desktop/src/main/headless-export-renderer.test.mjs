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
  assert.deepEqual(attempt.renderSurface, {
    attempted: false,
    reason: 'electron-browser-window-unavailable',
    output: { width: 1920, height: 1080 },
  });
});

test('experimental headless renderer probes a hidden render window when available', async () => {
  const windows = [];
  const attempt = await attemptExperimentalHeadlessRender({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: true },
    outputPath: '/tmp/headless.mp4',
    compositionPlan: {
      output: { width: 1280, height: 720 },
      frames: [{ frameIndex: 0 }],
    },
    createRenderWindow(options) {
      const created = {
        options,
        loadedUrl: null,
        closed: false,
        webContents: {
          async executeJavaScript() {
            return { ok: true };
          },
          async capturePage() {
            return {};
          },
        },
        async loadURL(url) {
          created.loadedUrl = url;
        },
        close() {
          created.closed = true;
        },
      };
      windows.push(created);
      return created;
    },
  });

  assert.equal(attempt.reason, 'electron-headless-renderer-not-implemented');
  assert.equal(windows.length, 1);
  assert.equal(windows[0].closed, true);
  assert.equal(windows[0].options.show, false);
  assert.equal(windows[0].options.width, 1280);
  assert.equal(windows[0].options.height, 720);
  assert.equal(windows[0].options.webPreferences.offscreen, true);
  assert.match(windows[0].loadedUrl, /^data:text\/html/);
  assert.deepEqual(attempt.renderSurface, {
    attempted: true,
    reason: null,
    output: { width: 1280, height: 720 },
    loaded: true,
    scriptExecuted: true,
    canCapturePage: true,
  });
});
