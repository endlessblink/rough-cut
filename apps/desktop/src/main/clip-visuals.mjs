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
export const FILMSTRIP_INTERVAL_SEC = 5;
export const FILMSTRIP_MAX_TILES = 120;
export const WAVEFORM_WIDTH = 2048;
export const WAVEFORM_HEIGHT = 56;
export const WAVEFORM_COLOR = '4ade80';

export function visualsCacheDir(projectPath) {
  return join(dirname(projectPath), '.roughcut-visuals');
}

export function visualCacheKey(sourcePath, mtimeMs, kind) {
  return createHash('sha1').update(`${sourcePath}:${Math.round(mtimeMs)}:${kind}:v1`).digest('hex').slice(0, 20);
}

// Tile count adapts so long recordings don't explode: above
// MAX_TILES * INTERVAL the interval stretches to keep tiles bounded.
export function filmstripPlan(durationSec) {
  const safeDuration = Math.max(1, Number(durationSec) || 1);
  const rawTiles = Math.ceil(safeDuration / FILMSTRIP_INTERVAL_SEC);
  const tiles = Math.max(1, Math.min(FILMSTRIP_MAX_TILES, rawTiles));
  const intervalSec = safeDuration / tiles;
  return { tiles, intervalSec, stripSeconds: tiles * intervalSec };
}

export function buildFilmstripArgs(sourcePath, outPath, durationSec) {
  const { tiles, intervalSec } = filmstripPlan(durationSec);
  return [
    '-y',
    '-i', sourcePath,
    '-vf', `fps=1/${intervalSec.toFixed(4)},scale=-2:${FILMSTRIP_HEIGHT},tile=${tiles}x1`,
    '-frames:v', '1',
    outPath,
  ];
}

export function buildWaveformArgs(sourcePath, outPath) {
  return [
    '-y',
    '-i', sourcePath,
    '-filter_complex',
    `aformat=channel_layouts=mono,compand=gain=-6,showwavespic=s=${WAVEFORM_WIDTH}x${WAVEFORM_HEIGHT}:colors=#${WAVEFORM_COLOR}`,
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
export async function ensureClipVisual({ projectPath, sourcePath, kind, durationSec, runner = runFfmpeg, statImpl = stat }) {
  if (kind !== 'filmstrip' && kind !== 'waveform') throw new Error(`Unknown clip visual kind: ${kind}`);
  const sourceInfo = await statImpl(sourcePath);
  const key = visualCacheKey(sourcePath, sourceInfo.mtimeMs, kind);
  const dir = visualsCacheDir(projectPath);
  const outPath = join(dir, `${key}.png`);
  const plan = kind === 'filmstrip' ? filmstripPlan(durationSec) : null;
  const meta = kind === 'filmstrip'
    ? { path: outPath, kind, durationSec, ...plan }
    : { path: outPath, kind, durationSec, widthPx: WAVEFORM_WIDTH };

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
        ? buildFilmstripArgs(sourcePath, outPath, durationSec)
        : buildWaveformArgs(sourcePath, outPath);
      await runner(args);
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, job);
  }
  await inFlight.get(flightKey);
  return meta;
}
