import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isFfmpegCaptureAvailable, startFfmpegCapture } from './ffmpeg-capture.mjs';
import { createXinputButtonListener } from './xinput-button-listener.mjs';
import { createEventLogger, NULL_EVENT_LOGGER } from './event-logger.mjs';

const DEFAULT_FPS = 30;

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
  isCaptureAvailable = isFfmpegCaptureAvailable,
  now = () => new Date(),
  sampleIntervalMs = 33,
  buttonListenerFactory = createXinputButtonListener,
  eventLoggerFactory = createEventLogger,
  enableDiagnosticLogging = DIAGNOSTIC_LOGGING_DEFAULT,
}) {
  let active = null;

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
      fps: session.fps,
      cursorTelemetryPath: session.cursorTelemetryPath,
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
    };
  }

  async function start() {
    if (active) throw new Error('A recording is already active.');
    if (!isCaptureAvailable()) throw new Error('FFmpeg x11grab capture is not available on this session.');

    await mkdir(recordingsDir, { recursive: true });

    const displayInfo = getDisplayInfo();
    const startedAtDate = now();
    const stamp = startedAtDate.toISOString().replace(/[:.]/g, '-');
    const rawPath = join(recordingsDir, `rough-cut-${stamp}.mkv`);
    const outputPath = join(recordingsDir, `rough-cut-${stamp}.mp4`);
    const cursorTelemetryPath = join(recordingsDir, `rough-cut-${stamp}.cursor.json`);
    const eventsLogPath = join(recordingsDir, `rough-cut-${stamp}.events.log`);
    const eventLogger =
      enableDiagnosticLogging && typeof eventLoggerFactory === 'function'
        ? eventLoggerFactory({ path: eventsLogPath })
        : NULL_EVENT_LOGGER;
    eventLogger.start();
    const session = {
      startedAt: startedAtDate.toISOString(),
      rawPath,
      outputPath,
      cursorTelemetryPath,
      eventsLogPath,
      eventLogger,
      fps: DEFAULT_FPS,
      cursorEvents: [],
      cursorTimer: null,
      ...displayInfo,
    };

    eventLogger.event('recording-start', {
      startedAt: session.startedAt,
      fps: session.fps,
      width: session.width,
      height: session.height,
      display: session.display,
      sampleIntervalMs,
    });

    await writeRecoveryMarker(session);

    const capture = captureFactory({
      outputPath: rawPath,
      fps: session.fps,
      display: session.display,
      width: session.width,
      height: session.height,
      micSource: null,
      systemAudioSource: null,
      onFirstFrame: (firstFrameMs) => {
        eventLogger.event('first-frame-anchor', { firstFrameMs });
      },
    });

    active = { ...session, capture };
    sampleCursor(active, getCursorPoint, now);
    if (typeof getCursorPoint === 'function') {
      active.cursorTimer = setInterval(() => sampleCursor(active, getCursorPoint, now), sampleIntervalMs);
    }
    if (typeof buttonListenerFactory === 'function') {
      active.buttonListener = buttonListenerFactory({
        onButton: (event) => recordButtonEvent(active, event, now),
      });
      active.buttonListener.start();
    }
    return status();
  }

  async function stop() {
    if (!active) return { state: 'idle' };

    const session = active;
    active = null;
    if (session.cursorTimer) clearInterval(session.cursorTimer);
    if (session.buttonListener) session.buttonListener.stop();
    if (session.eventLogger) session.eventLogger.event('recording-stop');
    const rawPath = await session.capture.stop();
    await writeCursorTelemetrySidecar(session);
    await clearRecoveryMarker();
    if (session.eventLogger) session.eventLogger.stop();

    return {
      state: 'saved',
      startedAt: session.startedAt,
      stoppedAt: now().toISOString(),
      rawPath,
      outputPath: session.outputPath,
      width: session.width,
      height: session.height,
      fps: session.fps,
      cursorTelemetryPath: session.cursorTelemetryPath,
      eventsLogPath: session.eventsLogPath,
      cursorEvents: session.cursorEvents,
    };
  }

  return { start, stop, status };
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
