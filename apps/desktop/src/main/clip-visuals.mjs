// Per-asset clip visuals for the Editor v2 timeline (TASK-237 slice 3):
// a horizontal filmstrip PNG for video sources (one frame every
// FILMSTRIP_INTERVAL_SEC, tiled 1-row) and a waveform PNG for audio.
// One image per SOURCE (not per clip) — clips slice it via CSS background
// math in the renderer. Cached beside the project keyed by source mtime.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const FILMSTRIP_HEIGHT = 48;
// Uniform tile geometry: every sampled frame is cover-cropped to TILE_W×H so
// strips stay crisp instead of squashing arbitrary aspect ratios into the
// timeline scale.
export const FILMSTRIP_TILE_WIDTH = 86;
export const FILMSTRIP_INTERVAL_SEC = 5;
export const FILMSTRIP_MIN_TILES = 6;
export const FILMSTRIP_MAX_TILES = 120;
export const WAVEFORM_WIDTH = 2048;
export const WAVEFORM_MIN_WIDTH = 512;
export const WAVEFORM_MAX_WIDTH = 8192;
export const WAVEFORM_HEIGHT = 56;
export const WAVEFORM_COLOR = '4ade80';

export function visualsCacheDir(projectPath) {
  return join(dirname(projectPath), '.roughcut-visuals');
}

// `variant` distinguishes zoom buckets (tile count / waveform width) so each
// resolution caches independently.
export function visualCacheKey(sourcePath, mtimeMs, kind, variant = 0) {
  return createHash('sha1').update(`${sourcePath}:${Math.round(mtimeMs)}:${kind}:${variant}:v2`).digest('hex').slice(0, 20);
}

// Tile count follows the requested zoom bucket (renderer asks for roughly
// one tile per ~86 screen px), bounded so long recordings don't explode.
export function filmstripPlan(durationSec, targetTiles) {
  const safeDuration = Math.max(1, Number(durationSec) || 1);
  const requested = Number.isFinite(Number(targetTiles)) && Number(targetTiles) > 0
    ? Number(targetTiles)
    : Math.ceil(safeDuration / FILMSTRIP_INTERVAL_SEC);
  const tiles = Math.max(FILMSTRIP_MIN_TILES, Math.min(FILMSTRIP_MAX_TILES, Math.round(requested)));
  const intervalSec = safeDuration / tiles;
  return { tiles, intervalSec, stripSeconds: tiles * intervalSec };
}

export function buildFilmstripArgs(sourcePath, outPath, durationSec, targetTiles) {
  const { tiles, intervalSec } = filmstripPlan(durationSec, targetTiles);
  const cover = `scale=${FILMSTRIP_TILE_WIDTH}:${FILMSTRIP_HEIGHT}:force_original_aspect_ratio=increase,crop=${FILMSTRIP_TILE_WIDTH}:${FILMSTRIP_HEIGHT}`;
  return [
    '-y',
    // Keyframe-only decode: sampling one frame every few seconds doesn't
    // need every frame — this turns minutes-long sources into a fast scan.
    '-skip_frame', 'nokey',
    '-i', sourcePath,
    '-vsync', 'vfr',
    '-vf', `fps=1/${intervalSec.toFixed(4)},${cover},tile=${tiles}x1`,
    '-frames:v', '1',
    outPath,
  ];
}

export function waveformPlanWidth(targetWidthPx) {
  const requested = Number.isFinite(Number(targetWidthPx)) && Number(targetWidthPx) > 0
    ? Number(targetWidthPx)
    : WAVEFORM_WIDTH;
  return Math.max(WAVEFORM_MIN_WIDTH, Math.min(WAVEFORM_MAX_WIDTH, Math.round(requested)));
}

export function buildWaveformArgs(sourcePath, outPath, targetWidthPx) {
  const width = waveformPlanWidth(targetWidthPx);
  return [
    '-y',
    '-i', sourcePath,
    '-filter_complex',
    `aformat=channel_layouts=mono,compand=gain=-6,showwavespic=s=${width}x${WAVEFORM_HEIGHT}:colors=#${WAVEFORM_COLOR}`,
    '-frames:v', '1',
    outPath,
  ];
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

const inFlight = new Map();

// Returns { path, kind, tiles?, intervalSec?, stripSeconds?, widthPx?, durationSec }.
// Cache hit = the keyed PNG already exists; concurrent requests for the same
// visual share one ffmpeg run.
export async function ensureClipVisual({ projectPath, sourcePath, kind, durationSec, targetTiles, targetWidthPx, runner = runFfmpeg, statImpl = stat }) {
  if (kind !== 'filmstrip' && kind !== 'waveform') throw new Error(`Unknown clip visual kind: ${kind}`);
  const sourceInfo = await statImpl(sourcePath);
  const plan = kind === 'filmstrip' ? filmstripPlan(durationSec, targetTiles) : null;
  const waveWidth = kind === 'waveform' ? waveformPlanWidth(targetWidthPx) : null;
  const variant = kind === 'filmstrip' ? plan.tiles : waveWidth;
  const key = visualCacheKey(sourcePath, sourceInfo.mtimeMs, kind, variant);
  const dir = visualsCacheDir(projectPath);
  const outPath = join(dir, `${key}.png`);
  const meta = kind === 'filmstrip'
    ? { path: outPath, kind, durationSec, ...plan }
    : { path: outPath, kind, durationSec, widthPx: waveWidth };

  try {
    await statImpl(outPath);
    return meta; // cache hit
  } catch {
    // not cached yet
  }

  const flightKey = outPath;
  if (!inFlight.has(flightKey)) {
    const job = (async () => {
      await mkdir(dir, { recursive: true });
      const args = kind === 'filmstrip'
        ? buildFilmstripArgs(sourcePath, outPath, durationSec, targetTiles)
        : buildWaveformArgs(sourcePath, outPath, targetWidthPx);
      await runner(args);
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, job);
  }
  await inFlight.get(flightKey);
  return meta;
}
