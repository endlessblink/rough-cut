import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecordingSession, getPrimaryX11DisplayInfo, normalizeCaptureRegion, normalizeCursorPoint, resolveCaptureDisplayInfo } from './recording-session.mjs';
import { createXinputEventParser } from './xinput-button-listener.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

test('recording session forwards system audio gain and persists it in metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-recording-audio-gain-'));
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  const started = await session.start({
    micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
    micGainPercent: 150,
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    systemAudioGainPercent: 50,
  });
  assert.equal(started.state, 'recording');
  assert.equal(started.micGainPercent, 150);
  assert.equal(started.systemAudioGainPercent, 50);
  assert.equal(captureCalls[0].micGainPercent, 150);
  assert.equal(captureCalls[0].systemAudioGainPercent, 50);

  const marker = JSON.parse(await readFile(join(root, 'recovery.json'), 'utf8'));
  assert.equal(marker.micSource, 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo');
  assert.equal(marker.micGainPercent, 150);
  assert.equal(marker.systemAudioGainPercent, 50);

  const stopped = await session.stop();
  assert.deepEqual(stopped.audio, {
    micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
    micGainPercent: 150,
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    systemAudioGainPercent: 50,
  });

  await rm(root, { recursive: true, force: true });
});

test('recording session serializes duplicate stop calls to the saved result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-duplicate-stop-'));
  let stopCalls = 0;
  let resolveStop;
  const stopPromise = new Promise((resolve) => {
    resolveStop = resolve;
  });

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({
      outputPath: options.outputPath,
      stop: async () => {
        stopCalls += 1;
        await stopPromise;
        return options.outputPath;
      },
    }),
  });

  await session.start();
  const firstStop = session.stop();
  const secondStop = session.stop();
  resolveStop();
  const [first, second] = await Promise.all([firstStop, secondStop]);

  assert.equal(stopCalls, 1);
  assert.equal(first.state, 'saved');
  assert.equal(second.state, 'saved');
  assert.equal(second.outputPath, first.outputPath);
  assert.equal(existsSync(join(root, 'recovery.json')), false);

  await rm(root, { recursive: true, force: true });
});

test('recording session pauses and resumes as separate raw segments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-pause-resume-'));
  let nowMs = Date.parse('2026-04-28T12:00:00.000Z');
  const captureCalls = [];
  const stoppedPaths = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(nowMs),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return {
        outputPath: options.outputPath,
        stop: async () => {
          stoppedPaths.push(options.outputPath);
          return options.outputPath;
        },
      };
    },
  });

  const started = await session.start();
  nowMs += 1000;
  const paused = await session.pause();
  assert.equal(paused.state, 'recording');
  assert.equal(paused.paused, true);
  assert.equal(paused.recordedDurationMs, 1000);
  assert.equal(captureCalls.length, 1);
  assert.equal(stoppedPaths.length, 1);

  nowMs += 5000;
  const resumed = await session.resume();
  assert.equal(resumed.state, 'recording');
  assert.equal(resumed.paused, false);
  assert.equal(resumed.recordedDurationMs, 1000);
  assert.equal(resumed.segmentCount, 2);
  assert.equal(captureCalls.length, 2);
  assert.match(captureCalls[1].outputPath, /segment-2\.mkv$/);

  nowMs += 1000;
  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.rawPath, started.rawPath);
  assert.deepEqual(stopped.rawSegments, [captureCalls[0].outputPath, captureCalls[1].outputPath]);
  assert.equal(stopped.cursorEvents.length >= 0, true);

  await rm(root, { recursive: true, force: true });
});

test('cursor telemetry uses recorded duration across pause gaps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-pause-cursor-'));
  let nowMs = Date.parse('2026-04-28T12:00:00.000Z');
  let cursorX = 10;

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(nowMs),
    sampleIntervalMs: 1000,
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    getCursorPoint: () => ({ x: cursorX, y: 20 }),
    buttonListenerFactory: null,
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
  });

  await session.start();
  await wait(0);
  nowMs += 1000;
  cursorX = 20;
  await session.pause();
  nowMs += 5000;
  await session.resume();
  await wait(0);
  const stopped = await session.stop();

  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.cursorEvents.at(-1)?.timeMs, 1000);
  assert.equal(stopped.cursorEvents.at(-1)?.frame, 30);

  await rm(root, { recursive: true, force: true });
});

test('recording session restart discards the active take and starts a fresh capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-restart-'));
  const recordingsDir = join(root, 'recordings');
  const markerPath = join(root, 'recovery.json');
  const captureCalls = [];
  let cancelCalls = 0;

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
        cancel: async () => {
          cancelCalls += 1;
          return options.outputPath;
        },
        stop: async () => options.outputPath,
      };
    },
  });

  await session.start({ micSource: 'alsa_input.first' });
  const restarted = await session.restart({ systemAudioSource: 'alsa_output.second.monitor' });

  assert.equal(restarted.state, 'recording');
  assert.equal(cancelCalls, 1);
  assert.equal(captureCalls.length, 2);
  assert.equal(captureCalls[0].micSource, 'alsa_input.first');
  assert.equal(captureCalls[1].micSource, null);
  assert.equal(captureCalls[1].systemAudioSource, 'alsa_output.second.monitor');

  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.audio?.systemAudioSource, 'alsa_output.second.monitor');

  await rm(root, { recursive: true, force: true });
});

test('recording session cancel stops capture and deletes incomplete artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-cancel-'));
  const recordingsDir = join(root, 'recordings');
  const markerPath = join(root, 'recovery.json');
  let cancelCalled = false;
  let stopCalled = false;

  const session = createRecordingSession({
    recordingsDir,
    markerPath,
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({
      outputPath: options.outputPath,
      cancel: async () => {
        cancelCalled = true;
        return options.outputPath;
      },
      stop: async () => {
        stopCalled = true;
        return options.outputPath;
      },
    }),
  });

  const started = await session.start();
  await writeFile(started.rawPath, 'partial mkv');
  await writeFile(started.outputPath, 'partial mp4');
  const canceled = await session.cancel();

  assert.equal(canceled.state, 'idle');
  assert.equal(canceled.canceled, true);
  assert.equal(cancelCalled, true);
  assert.equal(stopCalled, false);
  assert.equal(session.status().state, 'idle');
  assert.equal(existsSync(markerPath), false);
  assert.equal(existsSync(started.rawPath), false);
  assert.equal(existsSync(started.outputPath), false);

  await rm(root, { recursive: true, force: true });
});

test('recording session applies a selected capture region to x11grab geometry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-region-'));
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+100,200', originX: 100, originY: 200, scaleFactor: 1, width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  const started = await session.start({ captureRegion: { mode: 'region', x: 10, y: 20, width: 640, height: 360 } });
  assert.equal(started.state, 'recording');
  assert.equal(captureCalls[0].display, ':99.0+110,220');
  assert.equal(captureCalls[0].width, 640);
  assert.equal(captureCalls[0].height, 360);

  const marker = JSON.parse(await readFile(join(root, 'recovery.json'), 'utf8'));
  assert.deepEqual(marker.captureRegion, {
    mode: 'region',
    x: 10,
    y: 20,
    width: 640,
    height: 360,
    absoluteX: 110,
    absoluteY: 220,
  });

  const stopped = await session.stop();
  assert.equal(stopped.width, 640);
  assert.equal(stopped.height, 360);
  assert.equal(stopped.display, ':99.0+110,220');
  assert.equal(stopped.capture?.mode, 'region');

  await rm(root, { recursive: true, force: true });
});

test('camera spawn retries after early-exit and succeeds on a later attempt', async () => {
  // Simulates the V4L2 EBUSY race: ffmpeg-camera exits immediately on the
  // first spawn (renderer hadn't released /dev/video0 yet), then succeeds
  // on the next try once the device is free.
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-camera-retry-'));
  let attempts = 0;
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    cameraWarmupMs: 0,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    cameraCaptureFactory: (options) => {
      attempts += 1;
      // First two attempts "exit early" (Promise.resolve immediately -> retry).
      // Third attempt: whenExited never resolves within the 1500ms window,
      // so the loop returns this handle as the live capture.
      if (attempts <= 2) {
        return {
          outputPath: options.outputPath,
          whenExited: () => Promise.resolve({ code: 240, signal: null, stderr: 'Device or resource busy' }),
          stop: async () => options.outputPath,
        };
      }
      return {
        outputPath: options.outputPath,
        whenExited: () => new Promise(() => {}),
        stop: async () => options.outputPath,
      };
    },
  });
  const started = await session.start({ cameraDevicePath: '/dev/video2' });
  assert.equal(started.state, 'recording');
  assert.equal(attempts, 3, 'should have retried twice before succeeding');
  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  // Camera was successfully spawned on the 3rd attempt → no cameraError.
  assert.equal(stopped.cameraError, null);
  await rm(root, { recursive: true, force: true });
});

test('camera-enabled recording uses one unified capture process by default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-unified-camera-'));
  const captureCalls = [];
  const cameraCaptureCalls = [];
  const unifiedCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    cameraWarmupMs: 0,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
    cameraCaptureFactory: undefined,
    unifiedCaptureFactory: (options) => {
      unifiedCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  const started = await session.start({
    cameraDevicePath: '/dev/video2',
    micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
    micGainPercent: 135,
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    systemAudioGainPercent: 45,
  });
  assert.equal(started.state, 'recording');
  assert.equal(captureCalls.length, 0);
  assert.equal(cameraCaptureCalls.length, 0);
  assert.equal(unifiedCalls.length, 1);
  assert.equal(unifiedCalls[0].cameraDevicePath, '/dev/video2');
  assert.equal(unifiedCalls[0].micGainPercent, 135);
  assert.equal(unifiedCalls[0].systemAudioGainPercent, 45);

  const marker = JSON.parse(await readFile(join(root, 'recovery.json'), 'utf8'));
  assert.equal(marker.cameraRawPath, marker.rawPath);

  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.rawPath, stopped.cameraRawPath);
  assert.equal(stopped.camera.outputPath.endsWith('-camera.mp4'), true);
  assert.equal(stopped.camera.sourceInFrames, 0);
  assert.equal(stopped.camera.sourceStreamIndex, 1);

  await rm(root, { recursive: true, force: true });
});

test('camera spawn retry exhausts and falls back to screen-only after every attempt fails', async () => {
  // The 12-second persistent EBUSY scenario from the user's testing. All
  // retry attempts exit early; the loop throws → start() catches → session
  // continues screen-only with cameraError set.
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-camera-retry-exhaust-'));
  let attempts = 0;
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    cameraWarmupMs: 0,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    cameraCaptureFactory: (options) => {
      attempts += 1;
      return {
        outputPath: options.outputPath,
        whenExited: () => Promise.resolve({ code: 240, signal: null, stderr: 'Device or resource busy' }),
        stop: async () => options.outputPath,
      };
    },
  });
  const started = await session.start({ cameraDevicePath: '/dev/video2' });
  assert.equal(started.state, 'recording');
  assert.ok(attempts >= 6, `should retry up to maxAttempts (got ${attempts})`);
  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.camera, null);
  assert.match(stopped.cameraError, /Device or resource busy|exited early/);
  await rm(root, { recursive: true, force: true });
});

test('recording session continues screen capture when camera start fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-camera-busy-'));
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
    cameraCaptureFactory: () => {
      throw new Error('Device or resource busy');
    },
  });

  const started = await session.start({ cameraDevicePath: '/dev/video2' });
  assert.equal(started.state, 'recording');
  assert.match(started.cameraError, /Device or resource busy/);
  assert.equal(captureCalls.length, 1);

  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.camera, null);
  assert.equal(stopped.cameraRawPath, null);
  assert.equal(stopped.cameraOutputPath, null);
  assert.match(stopped.cameraError, /Device or resource busy/);

  await rm(root, { recursive: true, force: true });
});

test('recording status exposes camera failures while the screen keeps recording', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-camera-live-failure-'));
  let resolveCameraExit;
  const cameraExit = new Promise((resolve) => {
    resolveCameraExit = resolve;
  });

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    cameraWarmupMs: 0,
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    cameraCaptureFactory: (options) => ({
      outputPath: options.outputPath,
      whenExited: () => cameraExit,
      stop: async () => options.outputPath,
    }),
  });

  const started = await session.start({ cameraDevicePath: '/dev/video2' });
  assert.equal(started.state, 'recording');
  assert.equal(started.cameraError, null);

  resolveCameraExit({ code: 1, signal: null, stderr: 'No such device' });
  await cameraExit;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const status = session.status();
  assert.equal(status.state, 'recording');
  assert.match(status.cameraError, /No such device/);

  await session.cancel();
  await rm(root, { recursive: true, force: true });
});

test('recording session saves screen capture when camera stop fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-camera-stop-fails-'));

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    cameraWarmupMs: 0,
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    cameraCaptureFactory: (options) => ({
      outputPath: options.outputPath,
      stop: async () => {
        throw new Error('camera finalization failed');
      },
    }),
  });

  await session.start({ cameraDevicePath: '/dev/video2' });
  const stopped = await session.stop();

  assert.equal(stopped.state, 'saved');
  assert.equal(stopped.camera, null);
  assert.equal(stopped.cameraOutputPath, null);
  assert.match(stopped.cameraError, /camera finalization failed/);

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

test('xinput parser emits key press telemetry without text content', () => {
  const keys = [];
  const buttons = [];
  const parser = createXinputEventParser({
    onButton: (event) => buttons.push(event),
    onKey: (event) => keys.push(event),
  });

  parser.processLines([
    'EVENT type 2 (KeyPress)',
    '    device: 12 (12)',
    '    detail: 38',
    '    root: 805.00/652.00',
    '',
    'EVENT type 4 (ButtonPress)',
    '    device: 12 (12)',
    '    detail: 1',
    '    root: 900.00/700.00',
    '',
  ]);

  assert.deepEqual(keys, [{ keyCode: 38, x: 805, y: 652 }]);
  assert.equal(Object.hasOwn(keys[0], 'text'), false);
  assert.deepEqual(buttons, [{ type: 'down', button: 0, x: 900, y: 700 }]);
});

test('recording session writes key telemetry at the focused typing anchor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-key-telemetry-'));
  let nowMs = Date.parse('2026-04-28T12:00:00.000Z');
  let handlers = null;

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date(nowMs),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+10,20', originX: 10, originY: 20, scaleFactor: 1, width: 1000, height: 800 }),
    getCursorPoint: () => ({ x: 40, y: 50 }),
    sampleIntervalMs: 1000,
    captureFactory: (options) => ({ outputPath: options.outputPath, stop: async () => options.outputPath }),
    buttonListenerFactory: (callbacks) => {
      handlers = callbacks;
      return { start: () => true, stop: () => {}, getPid: () => null, kill: () => {} };
    },
  });

  await session.start();
  await wait(0);
  nowMs += 100;
  handlers.onButton({ type: 'down', button: 0, x: 210, y: 120 });
  nowMs += 100;
  handlers.onKey({ keyCode: 38, x: 900, y: 700 });
  const stopped = await session.stop();

  const keyEvents = stopped.cursorEvents.filter((event) => event.type === 'key');
  assert.equal(keyEvents.length, 1);
  assert.deepEqual(keyEvents[0], {
    frame: 6,
    timeMs: 200,
    x: 200,
    y: 100,
    type: 'key',
    button: 0,
    keyCode: 38,
  });

  const sidecar = JSON.parse(await readFile(stopped.cursorTelemetryPath, 'utf8'));
  assert.deepEqual(sidecar.events.filter((event) => event.type === 'key'), keyEvents);

  await rm(root, { recursive: true, force: true });
});

test('recording session passes selected mic source to capture and saved result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-mic-'));
  const micSource = 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo';
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  const started = await session.start({ micSource });
  assert.equal(started.state, 'recording');
  assert.equal(started.micSource, micSource);
  assert.equal(captureCalls[0].micSource, micSource);

  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.deepEqual(stopped.audio, { micSource, micGainPercent: 100 });

  await rm(root, { recursive: true, force: true });
});

test('recording session passes selected system audio source to capture and saved result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-system-audio-'));
  const systemAudioSource = 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor';
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  const started = await session.start({ systemAudioSource });
  assert.equal(started.state, 'recording');
  assert.equal(started.systemAudioSource, systemAudioSource);
  assert.equal(captureCalls[0].systemAudioSource, systemAudioSource);

  const stopped = await session.stop();
  assert.equal(stopped.state, 'saved');
  assert.deepEqual(stopped.audio, { systemAudioSource, systemAudioGainPercent: 100 });

  await rm(root, { recursive: true, force: true });
});

test('recording session persists mixed mic and system audio metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-mixed-audio-'));
  const micSource = 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo';
  const systemAudioSource = 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor';
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  await session.start({ micSource, systemAudioSource });
  assert.equal(captureCalls[0].micSource, micSource);
  assert.equal(captureCalls[0].systemAudioSource, systemAudioSource);

  const stopped = await session.stop();
  assert.deepEqual(stopped.audio, { micSource, micGainPercent: 100, systemAudioSource, systemAudioGainPercent: 100 });

  await rm(root, { recursive: true, force: true });
});

test('recording session trims blank mic source to screen-only capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-blank-mic-'));
  const captureCalls = [];

  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureCalls.push(options);
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  const started = await session.start({ micSource: '   ' });
  assert.equal(started.micSource, null);
  assert.equal(captureCalls[0].micSource, null);

  const stopped = await session.stop();
  assert.equal(stopped.audio, null);

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
      getAllDisplays: () => [
        { bounds: { x: 10, y: 20, width: 800, height: 600 }, scaleFactor: 2 },
      ],
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
    displayBounds: [{ x: 20, y: 40, width: 1600, height: 1200 }],
  });
});

test('cursor point normalization converts display DIP to captured pixels', () => {
  assert.deepEqual(
    normalizeCursorPoint({ point: { x: 20, y: 30 }, originX: 10, originY: 20, scaleFactor: 2 }),
    { x: 30, y: 40 },
  );
});

test('capture region normalization rejects invalid regions', () => {
  assert.equal(normalizeCaptureRegion(null), null);
  assert.equal(normalizeCaptureRegion({ mode: 'display', x: 0, y: 0, width: 640, height: 360 }), null);
  assert.equal(normalizeCaptureRegion({ mode: 'region', x: -1, y: 0, width: 640, height: 360 }), null);
  assert.equal(normalizeCaptureRegion({ mode: 'region', x: 0, y: 0, width: 1, height: 360 }), null);
});

test('recording session rejects invalid capture regions before capture starts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-invalid-region-'));
  let captureStarted = false;
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 }),
    captureFactory: (options) => {
      captureStarted = true;
      return { outputPath: options.outputPath, stop: async () => options.outputPath };
    },
  });

  await assert.rejects(
    () => session.start({ captureRegion: { mode: 'region', x: -1, y: 0, width: 640, height: 360 } }),
    /Capture region is invalid/,
  );
  assert.equal(captureStarted, false);
  assert.equal(session.status().state, 'idle');

  await rm(root, { recursive: true, force: true });
});

test('capture region resolution converts relative region to absolute X11 display geometry', () => {
  const displayInfo = resolveCaptureDisplayInfo(
    { display: ':0.0+1920,0', originX: 1920, originY: 0, scaleFactor: 2, width: 1440, height: 900 },
    { mode: 'region', x: 10, y: 20, width: 320, height: 180 },
  );

  assert.equal(displayInfo.display, ':0.0+1940,40');
  assert.equal(displayInfo.width, 640);
  assert.equal(displayInfo.height, 360);
  assert.deepEqual(displayInfo.captureRegion, {
    mode: 'region',
    x: 10,
    y: 20,
    width: 320,
    height: 180,
    absoluteX: 1940,
    absoluteY: 40,
  });
});

test('capture region resolution accepts absolute X11 geometry for secondary displays', () => {
  const displayInfo = resolveCaptureDisplayInfo(
    {
      display: ':0.0+0,0',
      originX: 0,
      originY: 0,
      scaleFactor: 1,
      width: 1920,
      height: 1080,
      displayBounds: [
        { x: 0, y: 0, width: 1920, height: 1080 },
        { x: 1920, y: 0, width: 1280, height: 720 },
      ],
    },
    { mode: 'region', x: 0, y: 0, width: 640, height: 360, absoluteX: 1920, absoluteY: 120 },
  );

  assert.equal(displayInfo.display, ':0.0+1920,120');
  assert.equal(displayInfo.width, 640);
  assert.equal(displayInfo.height, 360);
  assert.deepEqual(displayInfo.captureRegion, {
    mode: 'region',
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    absoluteX: 1920,
    absoluteY: 120,
  });
});

test('capture region resolution rejects regions outside display bounds', () => {
  assert.throws(
    () => resolveCaptureDisplayInfo(
      { display: ':0.0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 },
      { mode: 'region', x: 1800, y: 100, width: 400, height: 300 },
    ),
    /outside the attached display bounds/,
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

test('terminateChildren returns empty list when no recording is active', async () => {
  const session = createRecordingSession({
    recordingsDir: join(tmpdir(), 'rough-cut-no-active'),
    markerPath: join(tmpdir(), 'rough-cut-no-active.marker.json'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':0.0+0,0', width: 1920, height: 1080 }),
    captureFactory: () => ({ outputPath: '', stop: async () => '' }),
  });
  assert.deepEqual(session.terminateChildren(), []);
});

test('terminateChildren reaps screen and camera ffmpeg children with SIGTERM', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-reap-'));
  const screenKill = [];
  const cameraKill = [];
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    cameraWarmupMs: 0,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({
      outputPath: options.outputPath,
      getPid: () => 4242,
      kill: (signal) => screenKill.push(signal),
      stop: async () => options.outputPath,
    }),
    cameraCaptureFactory: (options) => ({
      outputPath: options.outputPath,
      getPid: () => 5151,
      kill: (signal) => cameraKill.push(signal),
      stop: async () => options.outputPath,
    }),
  });

  await session.start({ cameraDevicePath: '/dev/video2' });

  const reaped = session.terminateChildren();
  const byName = Object.fromEntries(reaped.map((entry) => [entry.name, entry]));
  assert.equal(byName['ffmpeg-screen'].pid, 4242);
  assert.equal(byName['ffmpeg-screen'].signal, 'SIGTERM');
  assert.equal(byName['ffmpeg-camera'].pid, 5151);
  assert.equal(byName['ffmpeg-camera'].signal, 'SIGTERM');
  assert.deepEqual(screenKill, ['SIGTERM']);
  assert.deepEqual(cameraKill, ['SIGTERM']);

  await session.stop();
  await rm(root, { recursive: true, force: true });
});

test('terminateChildren registers the xinput button listener once telemetry starts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-reap-xinput-'));
  const xinputKill = [];
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({
      outputPath: options.outputPath,
      getPid: () => 1111,
      kill: () => {},
      stop: async () => options.outputPath,
    }),
    buttonListenerFactory: () => ({
      start: () => {},
      stop: () => {},
      getPid: () => 9999,
      kill: (signal) => xinputKill.push(signal),
    }),
    getCursorPoint: () => ({ x: 0, y: 0 }),
  });

  await session.start();
  // startTelemetryAfterIpcReturn defers via setTimeout(0); the cursor sample
  // and listener registration land within a few ms.
  await new Promise((resolve) => setTimeout(resolve, 30));

  const reaped = session.terminateChildren();
  const byName = Object.fromEntries(reaped.map((entry) => [entry.name, entry]));
  assert.ok(byName['xinput-button-listener'], 'xinput listener should be registered');
  assert.equal(byName['xinput-button-listener'].pid, 9999);
  assert.equal(byName['xinput-button-listener'].signal, 'SIGTERM');
  assert.deepEqual(xinputKill, ['SIGTERM']);

  await session.stop();
  await rm(root, { recursive: true, force: true });
});

test('terminateChildren records a kill error without throwing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-reap-err-'));
  const session = createRecordingSession({
    recordingsDir: join(root, 'recordings'),
    markerPath: join(root, 'recovery.json'),
    now: () => new Date('2026-04-28T12:00:00.000Z'),
    isCaptureAvailable: () => true,
    getDisplayInfo: () => ({ display: ':99.0+0,0', width: 1920, height: 1080 }),
    captureFactory: (options) => ({
      outputPath: options.outputPath,
      getPid: () => 7777,
      kill: () => { throw new Error('ESRCH'); },
      stop: async () => options.outputPath,
    }),
  });

  await session.start();
  const reaped = session.terminateChildren();
  assert.equal(reaped.length, 1);
  assert.equal(reaped[0].error, 'ESRCH');
  await session.stop();
  await rm(root, { recursive: true, force: true });
});
