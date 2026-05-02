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
