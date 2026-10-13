// Voice leveling for finished exports: a quiet recording stays quiet unless it is lifted.
// Only ever raises the volume (never lowers or compresses audio that is already loud enough),
// then limits peaks so nothing clips. Works on the finished file: video is copied, only audio is re-encoded.
import { execFile } from 'node:child_process';
import { rename, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const LEVELING_TARGET_LUFS = -16;
/** Exports quieter than this (integrated loudness) get lifted; anything at or above is left alone. */
export const LEVELING_QUIET_THRESHOLD_LUFS = -22;
export const LEVELING_MAX_GAIN_DB = 18;

/** Pure: how many dB to add for a measured integrated loudness, or null when no change is needed. */
export function levelingGainDb(integratedLufs) {
  if (!Number.isFinite(integratedLufs)) return null;
  if (integratedLufs >= LEVELING_QUIET_THRESHOLD_LUFS) return null;
  const gain = LEVELING_TARGET_LUFS - integratedLufs;
  return Math.min(LEVELING_MAX_GAIN_DB, Math.round(gain * 10) / 10);
}

/** Pure: read the integrated loudness (LUFS) out of ffmpeg's ebur128 summary text. */
export function parseIntegratedLufs(ffmpegStderr) {
  const text = String(ffmpegStderr ?? '');
  const summary = text.slice(Math.max(0, text.lastIndexOf('Summary:')));
  const match = summary.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  return match ? Number(match[1]) : null;
}

export function buildLevelingArgs({ inputPath, outputPath, gainDb }) {
  return [
    '-y', '-v', 'error', '-i', inputPath,
    '-map', '0:v', '-map', '0:a',
    '-c:v', 'copy',
    '-af', `volume=${gainDb}dB,alimiter=limit=0.89`,
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outputPath,
  ];
}

async function measureLufs(filePath, signal) {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', filePath, '-map', '0:a:0', '-af', 'ebur128', '-vn', '-f', 'null', '-'],
      { ...(signal ? { signal } : {}), maxBuffer: 32 * 1024 * 1024 },
    );
    return parseIntegratedLufs(stderr);
  } catch {
    return null;
  }
}

/**
 * Lifts a quiet export in place. Never throws: on any problem the original export is left untouched.
 * Returns { leveled, gainDb, beforeLufs }.
 */
export async function levelQuietExport(outputPath, { signal = null } = {}) {
  try {
    const beforeLufs = await measureLufs(outputPath, signal);
    const gainDb = levelingGainDb(beforeLufs);
    if (gainDb === null) return { leveled: false, gainDb: 0, beforeLufs };
    const temp = `${outputPath}.leveling.mp4`;
    try {
      await execFileAsync('ffmpeg', buildLevelingArgs({ inputPath: outputPath, outputPath: temp, gainDb }), { ...(signal ? { signal } : {}), maxBuffer: 32 * 1024 * 1024 });
      const made = await stat(temp);
      if (!made.size) throw new Error('leveled file is empty');
      await rename(temp, outputPath);
      return { leveled: true, gainDb, beforeLufs };
    } finally {
      await rm(temp, { force: true });
    }
  } catch (error) {
    console.error('[export] voice leveling skipped; the export keeps its original sound', error?.message ?? error);
    return { leveled: false, gainDb: 0, beforeLufs: null };
  }
}
