import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isFfmpegCaptureAvailable, startFfmpegCapture } from './ffmpeg-capture.mjs';

const DEFAULT_FPS = 30;

export function createRecordingSession({
  recordingsDir,
  markerPath,
  getDisplayInfo,
  captureFactory = startFfmpegCapture,
  isCaptureAvailable = isFfmpegCaptureAvailable,
  now = () => new Date(),
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
    const session = {
      startedAt: startedAtDate.toISOString(),
      rawPath,
      outputPath,
      fps: DEFAULT_FPS,
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
    return status();
  }

  async function stop() {
    if (!active) return { state: 'idle' };

    const session = active;
    active = null;
    const rawPath = await session.capture.stop();
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
    };
  }

  return { start, stop, status };
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
    width,
    height,
  };
}

function formatX11Offset(value) {
  return value >= 0 ? `+${value}` : String(value);
}
