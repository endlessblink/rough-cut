import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isFfmpegCaptureAvailable, startFfmpegCapture } from './ffmpeg-capture.mjs';

const DEFAULT_FPS = 30;

export function createRecordingSession({
  recordingsDir,
  markerPath,
  getDisplayInfo,
  getCursorPoint = null,
  captureFactory = startFfmpegCapture,
  isCaptureAvailable = isFfmpegCaptureAvailable,
  now = () => new Date(),
  sampleIntervalMs = 100,
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
    const session = {
      startedAt: startedAtDate.toISOString(),
      rawPath,
      outputPath,
      cursorTelemetryPath,
      fps: DEFAULT_FPS,
      cursorEvents: [],
      cursorTimer: null,
      ...displayInfo,
    };

    await writeRecoveryMarker(session);

    const capture = captureFactory({
      outputPath: rawPath,
      fps: session.fps,
      display: session.display,
      width: session.width,
      height: session.height,
      micSource: null,
      systemAudioSource: null,
    });

    active = { ...session, capture };
    sampleCursor(active, getCursorPoint, now);
    if (typeof getCursorPoint === 'function') {
      active.cursorTimer = setInterval(() => sampleCursor(active, getCursorPoint, now), sampleIntervalMs);
    }
    return status();
  }

  async function stop() {
    if (!active) return { state: 'idle' };

    const session = active;
    active = null;
    if (session.cursorTimer) clearInterval(session.cursorTimer);
    const rawPath = await session.capture.stop();
    await writeCursorTelemetrySidecar(session);
    await clearRecoveryMarker();

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
      cursorEvents: session.cursorEvents,
    };
  }

  return { start, stop, status };
}

export function normalizeCursorPoint({ point, originX = 0, originY = 0, scaleFactor = 1, width, height }) {
  return {
    x: clamp(Math.round(point.x * scaleFactor - originX), 0, width - 1),
    y: clamp(Math.round(point.y * scaleFactor - originY), 0, height - 1),
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

function sampleCursor(session, getCursorPoint, now) {
  if (typeof getCursorPoint !== 'function') return;

  try {
    const point = getCursorPoint();
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;
    const elapsedMs = Math.max(0, now().getTime() - Date.parse(session.startedAt));
    const cursor = normalizeCursorPoint({
      point,
      originX: session.originX || 0,
      originY: session.originY || 0,
      scaleFactor: session.scaleFactor || 1,
      width: session.width,
      height: session.height,
    });
    const frame = Math.max(0, Math.round((elapsedMs / 1000) * session.fps));
    const last = session.cursorEvents.at(-1);
    if (last && last.frame === frame && last.x === cursor.x && last.y === cursor.y) return;
    session.cursorEvents.push({ frame, timeMs: elapsedMs, x: cursor.x, y: cursor.y, type: 'move', button: 0 });
  } catch (err) {
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatX11Offset(value) {
  return value >= 0 ? `+${value}` : String(value);
}
