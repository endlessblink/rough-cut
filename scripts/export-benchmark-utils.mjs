import { stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export const EXPORT_BENCHMARK_BUDGETS = Object.freeze({
  short1080pDemo: {
    label: 'Short 1080p demo',
    sourceDurationSeconds: 4,
    rawCopyMaxWallClockMs: 250,
    rawTrimMaxWallClockMs: 2000,
    styledMinSpeedMultiplier: 0.5,
  },
  long1080pDemo: {
    label: 'Long 1080p demo',
    sourceDurationSeconds: 600,
    rawCopyMaxWallClockMs: 5000,
    rawTrimMaxWallClockMs: 30_000,
    styledMinSpeedMultiplier: 1.0,
  },
});

export function computeSpeedMultiplier(sourceDurationSeconds, wallClockMs) {
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) return null;
  if (!Number.isFinite(wallClockMs) || wallClockMs <= 0) return null;
  return sourceDurationSeconds / (wallClockMs / 1000);
}

export function computeFrameDurationSeconds(frameDuration, fps) {
  if (!Number.isFinite(frameDuration) || frameDuration <= 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return frameDuration / fps;
}

export function classifyBudgetStatus({ mode, speedMultiplier, wallClockMs, budget = EXPORT_BENCHMARK_BUDGETS.short1080pDemo }) {
  if (mode === 'raw-copy') {
    return wallClockMs <= budget.rawCopyMaxWallClockMs ? 'within-budget' : 'over-budget';
  }
  if (mode === 'raw-trim') {
    return wallClockMs <= budget.rawTrimMaxWallClockMs ? 'within-budget' : 'over-budget';
  }
  if (mode === 'styled') {
    return speedMultiplier !== null && speedMultiplier >= budget.styledMinSpeedMultiplier ? 'within-budget' : 'over-budget';
  }
  return 'unbudgeted';
}

export async function validateBenchmarkOutput({
  caseId,
  outputPath,
  statFn = stat,
  probeFn = probeMedia,
}) {
  const file = await statFn(outputPath).catch((err) => {
    throw new Error(`Benchmark ${caseId} did not create output ${outputPath}: ${err.message}`);
  });
  if (!file || file.size <= 0) {
    throw new Error(`Benchmark ${caseId} produced an empty output: ${outputPath}`);
  }
  const probe = await probeFn(outputPath);
  if (!probe || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0) {
    throw new Error(`Benchmark ${caseId} output has invalid duration: ${JSON.stringify(probe)}`);
  }
  if (!Number.isFinite(probe.width) || probe.width <= 0 || !Number.isFinite(probe.height) || probe.height <= 0) {
    throw new Error(`Benchmark ${caseId} output has invalid video dimensions: ${JSON.stringify(probe)}`);
  }
  return { ...probe, bytes: file.size };
}

export function probeMedia(filePath) {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,r_frame_rate,duration',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  }
  const parsed = JSON.parse(result.stdout || '{}');
  const stream = parsed.streams?.[0] ?? {};
  const durationSeconds = numberOrNull(stream.duration) ?? numberOrNull(parsed.format?.duration);
  return {
    width: numberOrNull(stream.width),
    height: numberOrNull(stream.height),
    fps: parseRate(stream.r_frame_rate),
    durationSeconds,
  };
}

function parseRate(rate) {
  if (typeof rate !== 'string') return null;
  const [num, den] = rate.split('/').map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
