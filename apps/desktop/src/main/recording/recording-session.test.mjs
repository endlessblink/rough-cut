import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecordingSession, getPrimaryX11DisplayInfo, normalizeCursorPoint } from './recording-session.mjs';

test('recording session starts capture, writes marker, stops capture, and clears marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-recording-'));
  const recordingsDir = join(root, 'recordings');
  const markerPath = join(root, 'recovery.json');
  const captureCalls = [];
  let stopCalled = false;

  const session = createRecordingSession({
    recordingsDir,
    markerPath,
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return {
        outputPath: options.outputPath,
        stop: async () => {
          stopCalled = true;
          return options.outputPath;
        },
      };
    },
  });

  const started = await session.start();
  assert.equal(started.state, 'recording');
  assert.equal(captureCalls.length, 1);
  assert.equal(captureCalls[0].outputPath.endsWith('.mkv'), true);
  assert.equal(captureCalls[0].display, ':99.0+0,0');
  assert.equal(captureCalls[0].width, 1920);
  assert.equal(captureCalls[0].height, 1080);
  assert.equal(captureCalls[0].fps, 30);
  assert.equal(captureCalls[0].micSource, null);
  assert.equal(captureCalls[0].systemAudioSource, null);

  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  assert.equal(marker.version, 1);
  assert.equal(marker.rawPath, captureCalls[0].outputPath);
  assert.equal(marker.outputPath, started.outputPath);
  assert.equal(marker.cursorTelemetryPath.endsWith('.cursor.json'), true);

  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.rawPath.endsWith('.mkv'), true);
  assert.equal(stopped.outputPath.endsWith('.mp4'), true);
  assert.equal(stopCalled, true);
  assert.equal(existsSync(markerPath), false);

  await rm(root, { recursive: true, force: true });
});

test('recording session captures cursor move samples and writes sidecar', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-cursor-'));
  const recordingsDir = join(root, 'recordings');
  const markerPath = join(root, 'recovery.json');
  const startedAt = Date.parse('2026-04-28T12:00:00.000Z');
  let tick = 0;

  const session = createRecordingSession({
    recordingsDir,
    markerPath,
    now: () => new Date(startedAt + tick++ * 100),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+10,20', originX: 10, originY: 20, scaleFactor: 2, width: 100, height: 80 }),
    getCursorPoint: () => ({ x: 20 + tick, y: 30 + tick }),
    sampleIntervalMs: 5,
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    // Force the polling code path; we're testing it specifically.
    buttonListenerFactory: null,
  });

  await session.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const stopped = await session.stop();

  assert.equal(stopped.state, 'saved');
  assert(stopped.cursorEvents.length >= 1);
  assert.equal(stopped.cursorEvents[0].type, 'move');
  assert.equal(stopped.cursorEvents[0].button, 0);
  assert.equal(stopped.cursorEvents[0].x >= 0, true);
  assert.equal(stopped.cursorEvents[0].y >= 0, true);

  const sidecar = JSON.parse(await readFile(stopped.cursorTelemetryPath, 'utf8'));
  assert.equal(sidecar.version, 1);
  assert.equal(sidecar.width, 100);
  assert.equal(sidecar.height, 80);
  assert.deepEqual(sidecar.events, stopped.cursorEvents);

  await rm(root, { recursive: true, force: true });
});

test('recording session keeps recording when the cursor source returns the same point repeatedly', async () => {
  // Regression for the Electron Linux/X11 multi-monitor bug
  // (electron/electron#42519): if getCursorScreenPoint() gets stuck, the
  // recorder must still produce events for every tick so the stuck-source
  // condition is visible in the sidecar (rather than silently empty).
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-stuck-cursor-'));
  const startedAt = Date.parse('2026-04-28T12:00:00.000Z');
  let tick = 0;

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(startedAt + tick++ * 50),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 }),
    // Same point every call - mirrors the broken Electron behavior.
    getCursorPoint: () => ({ x: 1919, y: 500 }),
    sampleIntervalMs: 5,
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    // Force the polling code path; we're testing it specifically.
    buttonListenerFactory: null,
  });

  await session.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const stopped = await session.stop();

  assert.equal(stopped.state, 'saved');
  // Frame advances each tick (tick advances now()), so dedup never collapses
  // these. We must end up with multiple events at the same coordinate, NOT
  // just one or zero.
  assert.ok(
    stopped.cursorEvents.length >= 3,
    `expected stuck-source recording to keep producing events; got ${stopped.cursorEvents.length}`,
  );
  for (const event of stopped.cursorEvents) {
    assert.equal(event.x, 1919);
    assert.equal(event.y, 500);
  }

  await rm(root, { recursive: true, force: true });
});

test('recording session rejects overlapping starts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-recording-'));
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1280, height: 720 }),
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
  });

  await session.start();
  await assert.rejects(() => session.start(), /already active/);
  await session.stop();
  await rm(root, { recursive: true, force: true });
});

// REGRESSION GUARD (2026-05-04): ensures cursor frame numbers are anchored to
// recording-start (when each sample fired), NOT shifted by ffmpeg's first-
// frame wall-clock anchor. We tried re-anchoring earlier today and the user
// reported cursor in wrong place; reverted at commit 6a0c0f0. Yesterday's
// known-good behavior (no re-anchor) is what this test locks in.
test('cursor event frames stay anchored to recording-start, not shifted by onFirstFrame', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-cursor-anchor-'));
  const startedAt = Date.parse('2026-05-04T12:00:00.000Z');
  let tick = 0;
  let firstFrameCallback = null;

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(startedAt + tick++ * 100),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 }),
    getCursorPoint: () => ({ x: 100 + tick, y: 200 + tick }),
    sampleIntervalMs: 5,
    captureFactory: (options) => {
      firstFrameCallback = options.onFirstFrame;
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
    buttonListenerFactory: null, // force the polling code path
  });

  await session.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  // Simulate ffmpeg muxing its first frame ~1.5 s after recording-start. If
  // onFirstFrame ever re-anchors cursor events, this is when it'd happen.
  if (firstFrameCallback) firstFrameCallback(startedAt + 1500);
  const stopped = await session.stop();

  assert.equal(stopped.state, 'saved');
  assert.ok(stopped.cursorEvents.length >= 2, 'expected multiple cursor events');

  // For every event, verify that frame == round(timeMs / 1000 * fps). If a
  // future change re-anchors timeMs by some offset, this still passes (frame
  // and timeMs would shift together). What CAN'T pass: shifting only one of
  // them, or clamping pre-firstFrame events to frame 0 (the regression we
  // saw at commit 4ef0aa3).
  for (const ev of stopped.cursorEvents) {
    const expectedFrame = Math.round((ev.timeMs / 1000) * stopped.fps);
    assert.equal(
      ev.frame,
      expectedFrame,
      `event ${JSON.stringify(ev)}: frame ${ev.frame} != expected ${expectedFrame} from timeMs ${ev.timeMs}`,
    );
  }

  // Verify timeMs is anchored to recording-start (small values, monotonically
  // increasing, NOT shifted backward by ~1500 ms).
  const firstEv = stopped.cursorEvents[0];
  const lastEv = stopped.cursorEvents[stopped.cursorEvents.length - 1];
  assert.ok(
    firstEv.timeMs >= 0 && firstEv.timeMs < 500,
    `first event timeMs should be near 0, got ${firstEv.timeMs}`,
  );
  assert.ok(
    lastEv.timeMs <= 5000,
    `last event timeMs should reflect short test duration, got ${lastEv.timeMs} (looks shifted by firstFrameMs)`,
  );

  await rm(root, { recursive: true, force: true });
});

// REGRESSION GUARD (2026-05-04): ensures cursor sampling uses the polling
// path (xdotool synchronous query) and not async motion events. xinput motion
// events were briefly tried at commit 4ef0aa3 — they have intrinsic IPC
// latency that produced visible cursor lag. Reverted at commit 83ddec7. This
// test locks in: when getCursorPoint is provided, it IS called repeatedly
// (proving the polling loop is active).
test('cursor sampling drives cursor data via getCursorPoint polling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-cursor-source-'));
  const startedAt = Date.parse('2026-05-04T12:00:00.000Z');
  let tick = 0;
  let getCursorPointCalls = 0;

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(startedAt + tick++ * 100),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 }),
    getCursorPoint: () => {
      getCursorPointCalls += 1;
      return { x: 500, y: 500 };
    },
    sampleIntervalMs: 5,
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    buttonListenerFactory: null,
  });

  await session.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await session.stop();

  // Expect at least the seed sample plus a few polling samples. If a future
  // change replaces polling with async motion events, getCursorPoint would
  // stop being called and this assertion breaks.
  assert.ok(
    getCursorPointCalls >= 3,
    `expected getCursorPoint to be polled multiple times; got ${getCursorPointCalls} calls`,
  );

  await rm(root, { recursive: true, force: true });
});

// REGRESSION GUARD (2026-05-04): default sampleIntervalMs is 33 ms (30 Hz).
// This was changed during today's smoothing pass to other values; one of
// those changes contributed to the recording-tear race at higher rates. The
// 33 ms default is the user's confirmed-good baseline.
test('default sample interval is 33 ms', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-cursor-rate-'));
  const startedAt = Date.parse('2026-05-04T12:00:00.000Z');
  let tick = 0;
  let pollCount = 0;
  let captureStopped = false;

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(startedAt + tick++),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 }),
    getCursorPoint: () => {
      pollCount += 1;
      return { x: 100, y: 100 };
    },
    // Don't override sampleIntervalMs — let the default kick in.
    captureFactory: (options) => ({
      outputPath: options.outputPath,
      stop: async () => {
        captureStopped = true;
        return options.outputPath;
      },
    }),
    buttonListenerFactory: null,
  });

  await session.start();
  // Run for 250 ms of wall clock. With default 33 ms interval, expect ~6-8
  // polls (plus the seed sample). If the default were 100 ms (the older
  // value), we'd see only ~2-3. If 5 ms (a test-only value), we'd see ~50.
  await new Promise((resolve) => setTimeout(resolve, 250));
  await session.stop();

  assert.equal(captureStopped, true);
  assert.ok(
    pollCount >= 4,
    `default sample rate appears slower than 33 ms — got ${pollCount} polls in 250 ms (expected ~6-8). If default was changed to a slower rate, update this test deliberately.`,
  );
  assert.ok(
    pollCount <= 20,
    `default sample rate appears much faster than 33 ms — got ${pollCount} polls in 250 ms. If the default was lowered intentionally, update this test deliberately.`,
  );

  await rm(root, { recursive: true, force: true });
});

test('primary display info converts Electron display bounds to x11grab input', () => {
  const displayInfo = getPrimaryX11DisplayInfo(
    {
      getPrimaryDisplay: () => ({
        bounds: { x: 10, y: 20, width: 800, height: 600 },
        scaleFactor: 2,
      }),
    },
    ':99.0',
  );

  assert.deepEqual(displayInfo, {
    display: ':99.0+20,40',
    originX: 20,
    originY: 40,
    scaleFactor: 2,
    width: 1600,
    height: 1200,
  });
});

test('cursor point normalization converts display DIP to captured pixels', () => {
  assert.deepEqual(
    normalizeCursorPoint({ point: { x: 20, y: 30 }, originX: 10, originY: 20, scaleFactor: 2 }),
    { x: 30, y: 40 },
  );
});

test('cursor point normalization passes off-screen positions through unclamped', () => {
  // Cursor on a monitor to the right of the recorded screen (x past width).
  assert.deepEqual(
    normalizeCursorPoint({ point: { x: 2400, y: 600 }, originX: 0, originY: 0, scaleFactor: 1 }),
    { x: 2400, y: 600 },
  );
  // Cursor on a monitor to the left of the recorded screen (negative x).
  assert.deepEqual(
    normalizeCursorPoint({ point: { x: -50, y: 200 }, originX: 0, originY: 0, scaleFactor: 1 }),
    { x: -50, y: 200 },
  );
  // Off-screen + multi-monitor offset translation still works.
  assert.deepEqual(
    normalizeCursorPoint({ point: { x: 1950, y: -10 }, originX: 1920, originY: 0, scaleFactor: 1 }),
    { x: 30, y: -10 },
  );
});
