import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isFfmpegCaptureAvailable, startFfmpegCapture } from './ffmpeg-capture.mjs';
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
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
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
      micSource: active.micSource,
    };
  }

  async function start(options = {}) {
    if (active) throw new Error('A recording is already active.');
    if (!isCaptureAvailable()) throw new Error('FFmpeg x11grab capture is not available on this session.');
    const micSource = normalizeAudioSource(options.micSource);

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
      micSource,
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
      micSource,
    });

    await writeRecoveryMarker(session);

    const capture = captureFactory({
      outputPath: rawPath,
      fps: session.fps,
      display: session.display,
      width: session.width,
      height: session.height,
      micSource: session.micSource,
      systemAudioSource: null,
      onFirstFrame: (firstFrameMs) => {
        eventLogger.event('first-frame-anchor', { firstFrameMs });
      },
    });

    active = { ...session, capture };

    // xdotool synchronous polling drives cursor sampling. Returns the X
    // server's CURRENT cursor position with no IPC pipeline latency, so the
    // cursor overlay aligns with what the user is actually doing in the
    // recorded video. (xinput motion events were tried briefly as an
    // alternative — see the DEFAULT_SAMPLE_INTERVAL_MS comment above.)
    sampleCursor(active, getCursorPoint, now);
    if (typeof getCursorPoint === 'function') {
      active.cursorTimer = setInterval(
        () => sampleCursor(active, getCursorPoint, now),
        sampleIntervalMs,
      );
    }

    // xinput button listener still runs alongside the polling loop —
    // it captures click/drag events for auto-zoom suggestions. Motion
    // events from xinput are NOT used to drive cursor sampling here; the
    // listener supports `onMotion` for callers that want it (currently
    // none), but cursor data comes from xdotool polling above.
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
      width: session.width,
      height: session.height,
      fps: session.fps,
      cursorTelemetryPath: session.cursorTelemetryPath,
      eventsLogPath: session.eventsLogPath,
      cursorEvents: session.cursorEvents,
      audio: session.micSource ? { micSource: session.micSource } : null,
    };
  }

  return { start, stop, status };
}

function normalizeAudioSource(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
