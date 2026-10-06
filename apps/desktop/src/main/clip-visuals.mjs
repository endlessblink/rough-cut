// Per-asset clip visuals for the Editor v2 timeline (TASK-237 slice 3):
// a horizontal filmstrip PNG for video sources (one frame every
// FILMSTRIP_INTERVAL_SEC, tiled 1-row) and a signed waveform SVG for audio.
// One image per SOURCE (not per clip) — clips slice it via CSS background
// math in the renderer. Cached beside the project keyed by source mtime.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ensureWaveformEnvelope } from './waveform-envelope.mjs';

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
export const WAVEFORM_HEIGHT = 128;
export const WAVEFORM_COLOR = 'e0f2fe';

export function visualsCacheDir(projectPath) {
  return join(dirname(projectPath), '.roughcut-visuals');
}

// `variant` distinguishes zoom buckets (tile count / waveform width) so each
// resolution caches independently.
export function visualCacheKey(sourcePath, mtimeMs, kind, variant = 0) {
  return createHash('sha1').update(`${sourcePath}:${Math.round(mtimeMs)}:${kind}:${variant}:v4`).digest('hex').slice(0, 20);
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
    `showwavespic=s=${width}x${WAVEFORM_HEIGHT}:colors=#${WAVEFORM_COLOR}:scale=lin:filter=peak:split_channels=1`,
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

function probeHasAudio(sourcePath) {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', sourcePath], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    // If ffprobe itself is unavailable, assume audio and let ffmpeg decide.
    child.on('error', () => resolve(true));
    child.on('close', () => resolve(out.trim().length > 0));
  });
}

// Sources already probed as having no audio (path + mtime), so the timeline does not
// respawn a doomed waveform ffmpeg on every render.
const noAudioSources = new Set();

const inFlight = new Map();

// Returns { path, kind, tiles?, intervalSec?, stripSeconds?, widthPx?, durationSec }.
// Cache hit = the keyed PNG already exists; concurrent requests for the same
// visual share one ffmpeg run.
export async function ensureClipVisual({ projectPath, sourcePath, kind, durationSec, targetTiles, targetWidthPx, startSec = null, spanSec = null, runner = runFfmpeg, statImpl = stat, probeAudio = probeHasAudio, waveformRenderer = ensureWaveformEnvelope }) {
  if (kind !== 'filmstrip' && kind !== 'waveform') throw new Error(`Unknown clip visual kind: ${kind}`);
  const sourceInfo = await statImpl(sourcePath);
  const plan = kind === 'filmstrip' ? filmstripPlan(durationSec, targetTiles) : null;
  const waveWidth = kind === 'waveform' ? (startSec !== null || spanSec !== null
    ? Math.max(1, Math.min(8192, Math.ceil(Number(targetWidthPx) || 512))) : waveformPlanWidth(targetWidthPx)) : null;
  const variant = kind === 'filmstrip' ? plan.tiles : waveWidth;
  const key = visualCacheKey(sourcePath, sourceInfo.mtimeMs, kind, variant);
  const dir = visualsCacheDir(projectPath);
  if (kind === 'waveform') {
    const audioKey = `${sourcePath}:${sourceInfo.mtimeMs}`;
    if (noAudioSources.has(audioKey) || !(await probeAudio(sourcePath))) {
      noAudioSources.add(audioKey);
      throw new Error('clip-visuals: source has no audio stream, no waveform to draw');
    }
    return waveformRenderer({ sourcePath, mtimeMs: sourceInfo.mtimeMs, durationSec, width: waveWidth, directory: dir, startSec, spanSec });
  }
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

  if (kind === 'waveform') {
    const audioKey = `${sourcePath}:${sourceInfo.mtimeMs}`;
    if (noAudioSources.has(audioKey) || !(await probeAudio(sourcePath))) {
      noAudioSources.add(audioKey);
      throw new Error('clip-visuals: source has no audio stream, no waveform to draw');
    }
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
