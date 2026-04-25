import { desktopCapturer } from 'electron';
import { join, dirname, basename } from 'node:path';
import { mkdirSync, existsSync, renameSync, unlinkSync, copyFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import {
  mergeRecordingResultWithFinalProbe,
  muxAudioIntoRecording,
  probeRecordingFile,
  probeRecordingResult,
  resolveTimelineFps,
} from './recording-file-utils.mjs';

/**
 * List available capture sources (screens and windows).
 * @returns {Promise<Array<{id: string, name: string, type: string, thumbnailDataUrl: string, displayId: string | null}>>}
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
    displayId: s.display_id || null,
  }));
}

/**
 * Resolve a selected source ID against a refreshed source list.
 * Electron source IDs can drift across calls, so fall back to stable metadata
 * from the previous snapshot when possible.
 *
 * @param {Array<{id: string, name: string, type: string, displayId: string | null}>} previousSources
 * @param {Array<{id: string, name: string, type: string, displayId: string | null}>} nextSources
 * @param {string | null} selectedSourceId
 * @returns {string | null}
 */
export function reconcileSelectedSourceId(previousSources, nextSources, selectedSourceId) {
  if (!selectedSourceId) return selectedSourceId;
  if (nextSources.some((source) => source.id === selectedSourceId)) {
    return selectedSourceId;
  }

  const previousSource = previousSources.find((source) => source.id === selectedSourceId);
  if (!previousSource) return null;

  const matchedSource = nextSources.find((source) => {
    if (previousSource.displayId && source.displayId) {
      return source.displayId === previousSource.displayId;
    }
    return source.type === previousSource.type && source.name === previousSource.name;
  });

  return matchedSource?.id ?? null;
}

export { mergeRecordingResultWithFinalProbe, muxAudioIntoRecording, probeRecordingFile, probeRecordingResult };

/**
 * Remux a WebM file through FFmpeg to add seek cues and duration metadata.
 * MediaRecorder WebM files lack Cues elements, making browser seeks fail.
 * This is a fast copy operation (no re-encoding).
 * @param {string} filePath  Path to the WebM file to remux in-place
 */
function remuxForSeeking(filePath) {
  const tmpPath = filePath + '.remux.webm';
  try {
    execSync(`ffmpeg -y -i "${filePath}" -c copy "${tmpPath}"`, { timeout: 30000, stdio: 'pipe' });
    // Atomic replace: delete original, rename temp
    unlinkSync(filePath);
    renameSync(tmpPath, filePath);
    console.info('[capture-service] Remuxed for seeking:', filePath);
  } catch (err) {
    // Remux failed — original file is still intact and playable (just not seekable)
    console.warn(
      '[capture-service] Remux for seeking failed (original preserved):',
      err?.message ?? err,
    );
    // Clean up temp file if it exists
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Save a recording buffer to disk, probe with ffprobe, and return metadata.
 *
 * @param {ArrayBuffer} buffer  Raw webm bytes from the renderer MediaRecorder
 * @param {string} projectDir   Project directory (recordings saved in a sub-folder)
 * @param {{fps: number, width: number, height: number, durationMs: number}} metadata
 *   Fallback metadata from the renderer (used when ffprobe is unavailable).
 * @param {ArrayBuffer|null} [cameraBuffer]  Optional camera recording bytes
 * @returns {Promise<{filePath: string, durationFrames: number, width: number, height: number, fps: number, codec: string, fileSize: number, cameraFilePath?: string}>}
 */
export async function saveRecording(buffer, projectDir, metadata, cameraBuffer) {
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
  remuxForSeeking(filePath);

  // Probe with ffprobe for accurate metadata (best-effort)
  let probedMeta = {
    durationMs: 0,
    width: 0,
    height: 0,
    fps: 0,
    codec: 'unknown',
    hasAudio: false,
  };
  try {
    probedMeta = probeRecordingFile(filePath);
  } catch {
    // ffprobe not available or failed — fall back to renderer-provided metadata
  }

  // Calculate duration in frames
  const fps = metadata.fps || probedMeta.fps || 30;
  const durationMs = probedMeta.durationMs || metadata.durationMs || 0;
  const durationFrames = Math.round((durationMs / 1000) * resolveTimelineFps(metadata));

  // Generate thumbnail — extract a frame at 2 seconds (best-effort)
  let thumbnailPath = null;
  try {
    const thumbFilename = filename.replace('.webm', '-thumb.jpg');
    thumbnailPath = join(recordingsDir, thumbFilename);
    const seekTime = durationMs > 2000 ? '2' : '0';
    execSync(
      `ffmpeg -y -ss ${seekTime} -i "${filePath}" -frames:v 1 -q:v 5 -vf scale=640:-1 "${thumbnailPath}"`,
      { timeout: 10000, stdio: 'pipe' },
    );
  } catch {
    thumbnailPath = null;
  }

  // Save camera recording if provided
  let cameraFilePath = null;
  if (cameraBuffer && cameraBuffer.byteLength > 0) {
    const cameraFilename = `recording-${timestamp}-camera.webm`;
    cameraFilePath = join(recordingsDir, cameraFilename);
    await writeFile(cameraFilePath, Buffer.from(cameraBuffer));
    remuxForSeeking(cameraFilePath);
    console.info('[capture-service] Camera recording saved:', cameraFilePath);
  }

  return {
    filePath,
    durationFrames,
    durationMs,
    width: probedMeta.width || metadata.width || 1920,
    height: probedMeta.height || metadata.height || 1080,
    fps,
    timelineFps: resolveTimelineFps(metadata),
    cursorEventsFps:
      Number.isFinite(metadata?.cursorEventsFps) && metadata.cursorEventsFps > 0
        ? metadata.cursorEventsFps
        : resolveTimelineFps(metadata),
    codec: probedMeta.codec,
    fileSize: Buffer.from(buffer).byteLength,
    hasAudio: probedMeta.hasAudio,
    thumbnailPath,
    ...(cameraFilePath ? { cameraFilePath } : {}),
  };
}

/**
 * Save a camera recording buffer alongside an existing screen recording.
 * Derives the filename from the screen recording path and remuxes for seeking.
 *
 * @param {Buffer} camBuf  Camera recording bytes
 * @param {string} screenFilePath  Path to the screen recording (used to derive filename)
 * @returns {Promise<string>}  Path to the saved camera file
 */
export async function saveCameraRecording(camBuf, screenFilePath) {
  const recordingsDir = dirname(screenFilePath);
  const timestamp = basename(screenFilePath)
    .replace(/^recording-/, '')
    .replace(/\.webm$/, '');
  // Camera now records as MP4 H.264 (via WebCodecs/mediabunny) — already seekable, no remux needed
  const cameraPath = join(recordingsDir, `recording-${timestamp}-camera.mp4`);
  await writeFile(cameraPath, camBuf);
  console.info('[capture-service] Camera recording saved:', cameraPath, camBuf.byteLength, 'bytes');
  return cameraPath;
}

/**
 * Save a recording from an already-written file on disk (e.g. from FFmpeg x11grab).
 * Moves/copies it to the project recordings dir, probes with ffprobe, generates thumbnail.
 *
 * @param {string} srcFilePath  Path to the existing video file
 * @param {string} projectDir   Project directory (recordings saved in a sub-folder)
 * @param {{fps: number, width: number, height: number, durationMs: number}} metadata
 * @returns {Promise<{filePath: string, durationFrames: number, width: number, height: number, fps: number, codec: string, fileSize: number, thumbnailPath: string | null}>}
 */
export async function saveRecordingFromFile(srcFilePath, projectDir, metadata) {
  const recordingsDir = join(projectDir || '/tmp/rough-cut', 'recordings');
  if (!existsSync(recordingsDir)) mkdirSync(recordingsDir, { recursive: true });

  // Move or copy the file to the recordings dir
  const filename = basename(srcFilePath);
  const destPath = join(recordingsDir, filename);
  if (srcFilePath !== destPath) {
    try {
      renameSync(srcFilePath, destPath);
    } catch {
      // Cross-device move — fall back to copy + delete
      copyFileSync(srcFilePath, destPath);
      try {
        unlinkSync(srcFilePath);
      } catch {
        /* ignore */
      }
    }
  }

  // Probe with ffprobe
  let probedMeta = {
    durationMs: 0,
    width: 0,
    height: 0,
    fps: 0,
    codec: 'unknown',
    hasAudio: false,
  };
  try {
    probedMeta = probeRecordingFile(destPath);
  } catch {
    console.warn('[capture-service] ffprobe failed on FFmpeg output — using fallback metadata');
  }

  const fps = metadata.fps || probedMeta.fps || 30;
  const durationMs = probedMeta.durationMs || metadata.durationMs || 0;
  const durationFrames = Math.round((durationMs / 1000) * resolveTimelineFps(metadata));

  // Generate thumbnail
  let thumbnailPath = null;
  try {
    const thumbFilename = filename.replace(/\.\w+$/, '-thumb.jpg');
    thumbnailPath = join(recordingsDir, thumbFilename);
    const seekTime = durationMs > 2000 ? '2' : '0';
    execSync(
      `ffmpeg -y -ss ${seekTime} -i "${destPath}" -frames:v 1 -q:v 5 -vf scale=640:-1 "${thumbnailPath}"`,
      { timeout: 10000, stdio: 'pipe' },
    );
  } catch {
    thumbnailPath = null;
  }

  const fileSize = existsSync(destPath) ? statSync(destPath).size : 0;

  console.info(
    '[capture-service] FFmpeg recording saved:',
    destPath,
    `(${durationFrames} frames, ${probedMeta.width}x${probedMeta.height})`,
  );

  return {
    filePath: destPath,
    durationFrames,
    durationMs,
    width: probedMeta.width || metadata.width || 1920,
    height: probedMeta.height || metadata.height || 1080,
    fps,
    timelineFps: resolveTimelineFps(metadata),
    cursorEventsFps:
      Number.isFinite(metadata?.cursorEventsFps) && metadata.cursorEventsFps > 0
        ? metadata.cursorEventsFps
        : resolveTimelineFps(metadata),
    codec: probedMeta.codec,
    fileSize,
    hasAudio: probedMeta.hasAudio,
    thumbnailPath,
  };
}
