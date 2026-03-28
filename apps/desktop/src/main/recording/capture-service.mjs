import { desktopCapturer } from 'electron';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

/**
 * List available capture sources (screens and windows).
 * @returns {Promise<Array<{id: string, name: string, type: string, thumbnailDataUrl: string}>>}
 */
export async function getSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnailDataUrl: s.thumbnail.toDataURL(),
  }));
}

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

/**
 * Save a recording buffer to disk, probe with ffprobe, and return metadata.
 *
 * @param {ArrayBuffer} buffer  Raw webm bytes from the renderer MediaRecorder
 * @param {string} projectDir   Project directory (recordings saved in a sub-folder)
 * @param {{fps: number, width: number, height: number, durationMs: number}} metadata
 *   Fallback metadata from the renderer (used when ffprobe is unavailable).
 * @returns {Promise<{filePath: string, durationFrames: number, width: number, height: number, fps: number, codec: string, fileSize: number}>}
 */
export async function saveRecording(buffer, projectDir, metadata) {
  // When projectDir is undefined (unsaved project), recordings go to /tmp.
  // Future: "consolidate media" feature will move /tmp files to project dir on save.
  const recordingsDir = join(projectDir || '/tmp/rough-cut', 'recordings');
  if (!existsSync(recordingsDir)) mkdirSync(recordingsDir, { recursive: true });

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `recording-${timestamp}.webm`;
  const filePath = join(recordingsDir, filename);

  // Write buffer to disk
  await writeFile(filePath, Buffer.from(buffer));

  // Probe with ffprobe for accurate metadata (best-effort)
  let probedMeta = { durationMs: 0, width: 0, height: 0, fps: 0, codec: 'unknown' };
  try {
    const probeResult = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf-8' },
    );
    const info = JSON.parse(probeResult);
    const videoStream = info.streams?.find((s) => s.codec_type === 'video');
    probedMeta = {
      durationMs: parseFloat(info.format?.duration || '0') * 1000,
      width: videoStream ? parseInt(videoStream.width, 10) : 0,
      height: videoStream ? parseInt(videoStream.height, 10) : 0,
      fps: videoStream?.r_frame_rate ? parseFps(videoStream.r_frame_rate) : 30,
      codec: videoStream?.codec_name || 'unknown',
    };
  } catch {
    // ffprobe not available or failed — fall back to renderer-provided metadata
  }

  // Calculate duration in frames
  const fps = metadata.fps || probedMeta.fps || 30;
  const durationMs = probedMeta.durationMs || metadata.durationMs || 0;
  const durationFrames = Math.round((durationMs / 1000) * fps);

  return {
    filePath,
    durationFrames,
    width: probedMeta.width || metadata.width || 1920,
    height: probedMeta.height || metadata.height || 1080,
    fps,
    codec: probedMeta.codec,
    fileSize: Buffer.from(buffer).byteLength,
  };
}
