import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Parse an ffprobe frame-rate fraction string like "30/1" into a number.
 * @param {string} fpsStr
 * @returns {number}
 */
function parseFps(fpsStr) {
  if (!fpsStr) return 30;
  const parts = fpsStr.split('/').map(Number);
  if (parts.length === 2 && parts[1]) return parts[0] / parts[1];
  return parts[0] || 30;
}

export function probeRecordingFile(filePath) {
  const probeResult = execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
    { encoding: 'utf-8' },
  );
  const info = JSON.parse(probeResult);
  const videoStream = info.streams?.find((s) => s.codec_type === 'video');
  const audioStream = info.streams?.find((s) => s.codec_type === 'audio');
  return {
    durationMs: parseFloat(info.format?.duration || '0') * 1000,
    width: videoStream ? parseInt(videoStream.width, 10) : 0,
    height: videoStream ? parseInt(videoStream.height, 10) : 0,
    fps: videoStream?.r_frame_rate ? parseFps(videoStream.r_frame_rate) : 30,
    codec: videoStream?.codec_name || 'unknown',
    hasAudio: Boolean(audioStream),
  };
}

export function resolveTimelineFps(metadata) {
  const fps = Number(metadata?.timelineFps);
  if (Number.isFinite(fps) && fps > 0 && fps <= 120) return fps;
  return 30;
}

export function probeRecordingResult(filePath, metadata = {}) {
  const probedMeta = probeRecordingFile(filePath);
  const fps = probedMeta.fps || metadata.fps || 30;
  const durationMs = probedMeta.durationMs || metadata.durationMs || 0;
  const timelineFps = resolveTimelineFps(metadata);
  const durationFrames = Math.round((durationMs / 1000) * timelineFps);
  const fileSize = existsSync(filePath) ? statSync(filePath).size : 0;
  const cursorEventsFps =
    Number.isFinite(metadata?.cursorEventsFps) && metadata.cursorEventsFps > 0
      ? metadata.cursorEventsFps
      : timelineFps;
  return {
    durationFrames,
    durationMs,
    width: probedMeta.width || metadata.width || 1920,
    height: probedMeta.height || metadata.height || 1080,
    fps,
    timelineFps,
    cursorEventsFps,
    codec: probedMeta.codec,
    fileSize,
    hasAudio: probedMeta.hasAudio,
  };
}

export function mergeRecordingResultWithFinalProbe(result, metadata = {}) {
  return {
    ...result,
    ...probeRecordingResult(result.filePath, metadata),
  };
}

/**
 * Mux an audio-only capture file into an existing video recording.
 * Replaces the original video file on success.
 *
 * @param {string} videoFilePath
 * @param {string} audioFilePath
 * @returns {Promise<boolean>}
 */
export async function muxAudioIntoRecording(videoFilePath, audioFilePath) {
  try {
    if (!existsSync(videoFilePath) || !existsSync(audioFilePath)) return false;

    const muxedPath = videoFilePath.replace(/\.webm$/i, '.muxed.webm');
    execSync(
      `ffmpeg -y -i "${videoFilePath}" -i "${audioFilePath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -shortest "${muxedPath}"`,
      { timeout: 30000, stdio: 'pipe' },
    );

    if (!existsSync(muxedPath) || statSync(muxedPath).size === 0) return false;

    renameSync(muxedPath, videoFilePath);
    try {
      unlinkSync(audioFilePath);
    } catch {
      /* ignore */
    }

    console.info('[capture-service] Muxed audio into recording:', videoFilePath);
    return true;
  } catch (err) {
    console.warn('[capture-service] Failed to mux audio into recording:', err?.message ?? err);
    return false;
  }
}
