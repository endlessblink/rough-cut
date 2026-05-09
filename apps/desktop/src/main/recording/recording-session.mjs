import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isFfmpegCaptureAvailable, startFfmpegCameraCapture, startFfmpegCapture } from './ffmpeg-capture.mjs';
import { createXinputButtonListener } from './xinput-button-listener.mjs';
import { createEventLogger, NULL_EVENT_LOGGER } from './event-logger.mjs';

const DEFAULT_FPS = 30;

// xdotool synchronous polling for cursor position. xinput motion events were
// briefly tried as a replacement (commit 4ef0aa3) to avoid xdotool's per-poll
// X11 connection setup that races with x11grab during compositor activity,
// but xinput's events have inherent X-server-pipeline latency (kernel → X
// server → xinput → pipe → Node) and are timestamped on receipt — so cursor
// data trailed the actual cursor by 50-150 ms. Reverted to xdotool polling
// here. The tear-race tradeoff is accepted (NVIDIA Allow Flipping setting
// helps; KDE compositor settings + future Wayland migration are the proper
// long-term fixes).
const DEFAULT_SAMPLE_INTERVAL_MS = 33;
const DEFAULT_CAMERA_WARMUP_MS = Number(process.env.ROUGH_CUT_CAMERA_WARMUP_MS ?? 1000);

// Diagnostic logging is on by default while we hunt the recording-tear race
// condition. Turn off by setting ROUGH_CUT_DEBUG_RECORDING=0.
const DIAGNOSTIC_LOGGING_DEFAULT =
  process.env.ROUGH_CUT_DEBUG_RECORDING !== '0';

export function createRecordingSession({
  recordingsDir,
  markerPath,
  getDisplayInfo,
  getCursorPoint = null,
  captureFactory = startFfmpegCapture,
  cameraCaptureFactory = startFfmpegCameraCapture,
  isCaptureAvailable = isFfmpegCaptureAvailable,
  now = () => new Date(),
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  cameraWarmupMs = DEFAULT_CAMERA_WARMUP_MS,
  buttonListenerFactory = createXinputButtonListener,
  eventLoggerFactory = createEventLogger,
  enableDiagnosticLogging = DIAGNOSTIC_LOGGING_DEFAULT,
}) {
  let active = null;
  let stopping = null;
  let canceling = null;

  async function writeRecoveryMarker(session) {
    await writeFile(
      markerPath,
      JSON.stringify(
        {
          version: 1,
          startedAt: session.startedAt,
          rawPath: session.rawPath,
          outputPath: session.outputPath,
          display: session.display,
          width: session.width,
          height: session.height,
          captureRegion: session.captureRegion,
          fps: session.fps,
          cursorTelemetryPath: session.cursorTelemetryPath,
          systemAudioSource: session.systemAudioSource,
          cameraRawPath: session.cameraRawPath,
          cameraOutputPath: session.cameraOutputPath,
          cameraDevicePath: session.cameraDevicePath,
        },
        null,
        2,
      ),
    );
  }

  async function clearRecoveryMarker() {
    await rm(markerPath, { force: true });
  }

  function status() {
    if (!active) return { state: 'idle' };
    return {
      state: 'recording',
      startedAt: active.startedAt,
      rawPath: active.rawPath,
      outputPath: active.outputPath,
      micSource: active.micSource,
      systemAudioSource: active.systemAudioSource,
      cameraDevicePath: active.cameraDevicePath,
    };
  }

  async function start(options = {}) {
    if (active) throw new Error('A recording is already active.');
    if (!isCaptureAvailable()) throw new Error('FFmpeg x11grab capture is not available on this session.');
    const micSource = normalizeAudioSource(options.micSource);
    const systemAudioSource = normalizeAudioSource(options.systemAudioSource);
    const cameraDevicePath = normalizeCameraDevicePath(options.cameraDevicePath);

    await mkdir(recordingsDir, { recursive: true });

    const displayInfo = resolveCaptureDisplayInfo(getDisplayInfo(), options.captureRegion);
    const stampDate = now();
    const stamp = stampDate.toISOString().replace(/[:.]/g, '-');
    const rawPath = join(recordingsDir, `rough-cut-${stamp}.mkv`);
    const outputPath = join(recordingsDir, `rough-cut-${stamp}.mp4`);
    const cameraRawPath = cameraDevicePath ? join(recordingsDir, `rough-cut-${stamp}-camera.mkv`) : null;
    const cameraOutputPath = cameraDevicePath ? join(recordingsDir, `rough-cut-${stamp}-camera.mp4`) : null;
    const cursorTelemetryPath = join(recordingsDir, `rough-cut-${stamp}.cursor.json`);
    const eventsLogPath = join(recordingsDir, `rough-cut-${stamp}.events.log`);
    const eventLogger =
      enableDiagnosticLogging && typeof eventLoggerFactory === 'function'
        ? eventLoggerFactory({ path: eventsLogPath })
        : NULL_EVENT_LOGGER;
    eventLogger.start();
    let cameraCapture = null;
    let cameraStartedAtDate = null;
    let cameraError = null;
    try {
      if (cameraDevicePath && process.env.ROUGH_CUT_SMOKE_CAMERA_START_ERROR) {
        throw new Error(process.env.ROUGH_CUT_SMOKE_CAMERA_START_ERROR);
      }
      cameraStartedAtDate = cameraDevicePath ? now() : null;
      cameraCapture = cameraDevicePath
        ? cameraCaptureFactory({
            outputPath: cameraRawPath,
            fps: DEFAULT_FPS,
            devicePath: cameraDevicePath,
            width: 1280,
            height: 720,
          })
        : null;
      if (cameraCapture && cameraWarmupMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, cameraWarmupMs));
      }
    } catch (err) {
      cameraCapture = null;
      cameraStartedAtDate = null;
      cameraError = err instanceof Error ? err.message : String(err);
      console.warn(`[recording-session] camera capture disabled: ${cameraError}`);
      eventLogger.event('camera-capture-disabled', { error: cameraError, cameraDevicePath });
    }

    const startedAtDate = now();
    const cameraPrerollMs = cameraStartedAtDate ? Math.max(0, startedAtDate.getTime() - cameraStartedAtDate.getTime()) : 0;
    const cameraPrerollFrames = cameraCapture ? Math.max(0, Math.round((cameraPrerollMs / 1000) * DEFAULT_FPS)) : 0;
    const session = {
      startedAt: startedAtDate.toISOString(),
      rawPath,
      outputPath,
      cameraRawPath,
      cameraOutputPath,
      cursorTelemetryPath,
      eventsLogPath,
      eventLogger,
      fps: DEFAULT_FPS,
      micSource,
      systemAudioSource,
      cameraDevicePath,
      cameraError,
      cameraPrerollMs,
      cameraPrerollFrames,
      cursorEvents: [],
      cursorTimer: null,
      // Track every spawned child so an external SIGTERM can reap them
      // synchronously from the process-level signal handler. Order: ffmpeg
      // (screen, then camera) and xinput button listener once telemetry
      // starts. Each entry is `{ name, getPid, kill }`.
      children: [],
      ...displayInfo,
    };

    if (cameraCapture) registerChild(session, 'ffmpeg-camera', cameraCapture);

    eventLogger.event('recording-start', {
      startedAt: session.startedAt,
      fps: session.fps,
      width: session.width,
      height: session.height,
      display: session.display,
      captureRegion: session.captureRegion,
      sampleIntervalMs,
      micSource,
      systemAudioSource,
      cameraDevicePath,
      cameraError,
    });

    await writeRecoveryMarker(session);

    const capture = captureFactory({
      outputPath: rawPath,
      fps: session.fps,
      display: session.display,
      width: session.width,
      height: session.height,
      micSource: session.micSource,
      systemAudioSource: session.systemAudioSource,
      onFirstFrame: (firstFrameMs) => {
        eventLogger.event('first-frame-anchor', { firstFrameMs });
      },
    });

    registerChild(session, 'ffmpeg-screen', capture);
    active = { ...session, capture, cameraCapture };

    startTelemetryAfterIpcReturn(active, { getCursorPoint, now, sampleIntervalMs, buttonListenerFactory });
    return status();
  }

  function terminateChildren(signal = 'SIGTERM') {
    if (!active) return [];
    const reaped = [];
    for (const child of active.children ?? []) {
      const pid = typeof child.getPid === 'function' ? child.getPid() : null;
      let error = null;
      try {
        if (typeof child.kill === 'function') child.kill(signal);
      } catch (err) {
        error = err?.message ?? String(err);
      }
      reaped.push({ name: child.name, pid, signal, error });
    }
    return reaped;
  }

  async function stop() {
    if (canceling) return canceling;
    if (stopping) return stopping;
    if (!active) return { state: 'idle' };

    const session = active;
    active = null;
    stopping = stopActiveSession(session, now).finally(() => {
      stopping = null;
    });
    return stopping;
  }

  async function cancel() {
    if (stopping) return stopping;
    if (canceling) return canceling;
    if (!active) return { state: 'idle', canceled: false };

    const session = active;
    active = null;
    canceling = cancelActiveSession(session).finally(() => {
      canceling = null;
    });
    return canceling;
  }

  async function stopActiveSession(session, now) {
    session.stopped = true;
    if (session.cursorTimer) clearInterval(session.cursorTimer);
    if (session.buttonListener) session.buttonListener.stop();
    if (session.eventLogger) session.eventLogger.event('recording-stop');
    console.info('[recording-session] phase=screen-capture-stop-begin');
    const rawPath = await session.capture.stop();
    console.info('[recording-session] phase=screen-capture-stop-done');
    let cameraRawPath = null;
    let cameraError = session.cameraError ?? null;
    if (session.cameraCapture) {
      try {
        console.info('[recording-session] phase=camera-capture-stop-begin');
        cameraRawPath = await session.cameraCapture.stop();
        console.info('[recording-session] phase=camera-capture-stop-done', { cameraRawPath });
      } catch (err) {
        cameraError = err instanceof Error ? err.message : String(err);
        console.warn(`[recording-session] phase=camera-capture-stop-failed; continuing screen-only: ${cameraError}`);
        session.eventLogger?.event('camera-capture-stop-failed', { error: cameraError, cameraDevicePath: session.cameraDevicePath });
      }
    } else {
      console.info('[recording-session] phase=camera-capture-stop-skipped (no camera in session)');
    }

    // The firstFrameMs anchor is captured but no longer used to re-anchor
    // cursor events. Earlier today we tried shifting cursor frames backward
    // by (firstFrameMs - startedAt) on the theory that the cursor overlay
    // was offset ahead of the video. That clamped many pre-ffmpeg events to
    // frame 0 with stale positions and the user reported the result as
    // "cursor lag — wrong place". Reverted to the pre-today behavior:
    // cursor frames stay anchored to recording-start, matching what
    // yesterday's recordings produced.

    await writeCursorTelemetrySidecar(session);
    await clearRecoveryMarker();
    if (session.eventLogger) session.eventLogger.stop();

    return {
      state: 'saved',
      startedAt: session.startedAt,
      stoppedAt: now().toISOString(),
      rawPath,
      outputPath: session.outputPath,
      cameraRawPath,
      cameraOutputPath: cameraRawPath ? session.cameraOutputPath : null,
      cameraDevicePath: session.cameraDevicePath,
      cameraError,
      camera: session.cameraOutputPath
        && cameraRawPath
        ? {
            rawPath: cameraRawPath,
            outputPath: session.cameraOutputPath,
            devicePath: session.cameraDevicePath,
            width: 1280,
            height: 720,
            fps: session.fps,
            sourceInFrames: session.cameraPrerollFrames,
            prerollMs: session.cameraPrerollMs,
          }
        : null,
      width: session.width,
      height: session.height,
      display: session.display,
      captureRegion: session.captureRegion,
      fps: session.fps,
      cursorTelemetryPath: session.cursorTelemetryPath,
      eventsLogPath: session.eventsLogPath,
      cursorEvents: session.cursorEvents,
      audio: buildAudioMetadata(session),
      capture: session.captureRegion,
    };
  }

  async function cancelActiveSession(session) {
    session.stopped = true;
    if (session.cursorTimer) clearInterval(session.cursorTimer);
    if (session.buttonListener) session.buttonListener.stop();
    if (session.eventLogger) session.eventLogger.event('recording-cancel');
    await Promise.allSettled([
      cancelCapture(session.capture),
      session.cameraCapture ? cancelCapture(session.cameraCapture) : null,
    ]);
    await clearRecoveryMarker();
    if (session.eventLogger) session.eventLogger.stop();
    await deleteSessionArtifacts(session);
    return { state: 'idle', canceled: true };
  }

  return { start, stop, cancel, status, terminateChildren };
}

function registerChild(session, name, handle) {
  if (!session?.children || !handle) return;
  session.children.push({
    name,
    getPid: typeof handle.getPid === 'function' ? () => handle.getPid() : () => null,
    kill: typeof handle.kill === 'function' ? (signal) => handle.kill(signal) : () => {},
  });
}

async function cancelCapture(capture) {
  if (!capture) return null;
  if (typeof capture.cancel === 'function') return capture.cancel();
  return capture.stop();
}

async function deleteSessionArtifacts(session) {
  const paths = [
    session.rawPath,
    session.outputPath,
    session.cursorTelemetryPath,
    session.eventsLogPath,
    session.cameraRawPath,
    session.cameraOutputPath,
  ].filter(Boolean);
  await Promise.allSettled(paths.map((path) => rm(path, { force: true })));
}

function startTelemetryAfterIpcReturn(session, { getCursorPoint, now, sampleIntervalMs, buttonListenerFactory }) {
  setTimeout(() => {
    if (session.stopped || !session.capture) return;

    // xdotool synchronous polling drives cursor sampling. Start it after the
    // IPC response path so a slow X11 query cannot leave the renderer stuck on
    // "Starting..." while FFmpeg is already recording.
    sampleCursor(session, getCursorPoint, now);
    if (typeof getCursorPoint === 'function') {
      session.cursorTimer = setInterval(
        () => sampleCursor(session, getCursorPoint, now),
        sampleIntervalMs,
      );
    }

    // xinput button listener captures click/drag events for auto-zoom
    // suggestions; motion events are not used for cursor sampling.
    if (typeof buttonListenerFactory === 'function') {
      session.buttonListener = buttonListenerFactory({
        onButton: (event) => recordButtonEvent(session, event, now),
      });
      session.buttonListener.start();
      registerChild(session, 'xinput-button-listener', session.buttonListener);
    }
  }, 0);
}

function buildAudioMetadata(session) {
  const audio = {};
  if (session.micSource) audio.micSource = session.micSource;
  if (session.systemAudioSource) audio.systemAudioSource = session.systemAudioSource;
  return Object.keys(audio).length > 0 ? audio : null;
}

function normalizeAudioSource(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCameraDevicePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\/dev\/video\d+$/.test(trimmed) ? trimmed : null;
}

export function resolveCaptureDisplayInfo(displayInfo, captureRegion) {
  const region = normalizeCaptureRegion(captureRegion);
  if (!region) return { ...displayInfo, captureRegion: null };

  const scaleFactor = Number.isFinite(displayInfo.scaleFactor) && displayInfo.scaleFactor > 0 ? displayInfo.scaleFactor : 1;
  const hasAbsoluteRegion = Number.isFinite(region.absoluteX) && Number.isFinite(region.absoluteY);
  const originX = hasAbsoluteRegion ? Math.round(region.absoluteX) : Math.round((displayInfo.originX ?? 0) + region.x * scaleFactor);
  const originY = hasAbsoluteRegion ? Math.round(region.absoluteY) : Math.round((displayInfo.originY ?? 0) + region.y * scaleFactor);
  const width = Math.max(2, hasAbsoluteRegion ? Math.round(region.width) : Math.round(region.width * scaleFactor));
  const height = Math.max(2, hasAbsoluteRegion ? Math.round(region.height) : Math.round(region.height * scaleFactor));
  const baseDisplay = baseX11DisplayName(displayInfo.display ?? process.env.DISPLAY ?? ':0');

  return {
    ...displayInfo,
    display: `${baseDisplay}${formatX11Offset(originX)},${originY}`,
    originX,
    originY,
    width,
    height,
    captureRegion: {
      mode: 'region',
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      absoluteX: originX,
      absoluteY: originY,
    },
  };
}

export function normalizeCaptureRegion(value) {
  if (!value || typeof value !== 'object' || value.mode !== 'region') return null;
  const x = Math.max(0, Math.round(Number(value.x)) || 0);
  const y = Math.max(0, Math.round(Number(value.y)) || 0);
  const width = Math.round(Number(value.width));
  const height = Math.round(Number(value.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  const absoluteX = Number(value.absoluteX);
  const absoluteY = Number(value.absoluteY);
  return {
    mode: 'region',
    x,
    y,
    width,
    height,
    ...(Number.isFinite(absoluteX) && Number.isFinite(absoluteY) ? { absoluteX, absoluteY } : {}),
  };
}

function baseX11DisplayName(display) {
  const text = String(display || ':0');
  const match = /^(.+?)([+-]\d+),(?:-?\d+)$/.exec(text);
  return match ? match[1] : text;
}

export function normalizeCursorPoint({ point, originX = 0, originY = 0, scaleFactor = 1 }) {
  return {
    x: Math.round(point.x * scaleFactor - originX),
    y: Math.round(point.y * scaleFactor - originY),
  };
}

export function getPrimaryX11DisplayInfo(screen, displayName = process.env.DISPLAY || ':0.0') {
  const primary = screen.getPrimaryDisplay();
  const bounds = primary.bounds;
  const scaleFactor = primary.scaleFactor || 1;
  const x = Math.round(bounds.x * scaleFactor);
  const y = Math.round(bounds.y * scaleFactor);
  const width = Math.round(bounds.width * scaleFactor);
  const height = Math.round(bounds.height * scaleFactor);

  return {
    display: `${displayName}${formatX11Offset(x)},${y}`,
    originX: x,
    originY: y,
    scaleFactor,
    width,
    height,
  };
}

function recordButtonEvent(session, event, now) {
  if (!session || !event) return;
  try {
    const elapsedMs = Math.max(0, now().getTime() - Date.parse(session.startedAt));
    const cursor = normalizeCursorPoint({
      point: { x: event.x, y: event.y },
      originX: session.originX || 0,
      originY: session.originY || 0,
      scaleFactor: session.scaleFactor || 1,
    });
    const frame = Math.max(0, Math.round((elapsedMs / 1000) * session.fps));
    session.cursorEvents.push({
      frame,
      timeMs: elapsedMs,
      x: cursor.x,
      y: cursor.y,
      type: event.type,
      button: event.button,
    });
    if (session.eventLogger) {
      session.eventLogger.event('xinput-event', {
        eventType: event.type,
        button: event.button,
        x: cursor.x,
        y: cursor.y,
        frame,
        elapsedMs,
      });
    }
  } catch (err) {
    console.warn('[recording-session] button event record failed:', err?.message ?? err);
  }
}

function sampleCursor(session, getCursorPoint, now) {
  if (typeof getCursorPoint !== 'function') return;

  // Bracket the xdotool spawn with begin/end events so the diagnostic log
  // captures both the spawn moment and its duration. If a recording-tear
  // race correlates with cursor polling, the timestamps will line up.
  if (session.eventLogger) session.eventLogger.event('cursor-sample-begin');
  const sampleStart = Date.now();
  try {
    const point = getCursorPoint();
    const sampleTookMs = Date.now() - sampleStart;
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      if (session.eventLogger) {
        session.eventLogger.event('cursor-sample-end', {
          ok: false,
          tookMs: sampleTookMs,
        });
      }
      return;
    }
    const elapsedMs = Math.max(0, now().getTime() - Date.parse(session.startedAt));
    const cursor = normalizeCursorPoint({
      point,
      originX: session.originX || 0,
      originY: session.originY || 0,
      scaleFactor: session.scaleFactor || 1,
    });
    const frame = Math.max(0, Math.round((elapsedMs / 1000) * session.fps));
    if (session.eventLogger) {
      session.eventLogger.event('cursor-sample-end', {
        ok: true,
        tookMs: sampleTookMs,
        x: cursor.x,
        y: cursor.y,
        frame,
        elapsedMs,
      });
    }
    const last = session.cursorEvents.at(-1);
    if (last && last.frame === frame && last.x === cursor.x && last.y === cursor.y) return;
    session.cursorEvents.push({ frame, timeMs: elapsedMs, x: cursor.x, y: cursor.y, type: 'move', button: 0 });
  } catch (err) {
    if (session.eventLogger) {
      session.eventLogger.event('cursor-sample-end', {
        ok: false,
        tookMs: Date.now() - sampleStart,
        error: err?.message ?? String(err),
      });
    }
    console.warn('[recording-session] cursor sample failed:', err?.message ?? err);
  }
}

async function writeCursorTelemetrySidecar(session) {
  try {
    await writeFile(
      session.cursorTelemetryPath,
      `${JSON.stringify(
        {
          version: 1,
          startedAt: session.startedAt,
          fps: session.fps,
          width: session.width,
          height: session.height,
          events: session.cursorEvents,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  } catch (err) {
    console.warn('[recording-session] cursor telemetry sidecar write failed:', err?.message ?? err);
  }
}

function formatX11Offset(value) {
  return value >= 0 ? `+${value}` : String(value);
}
