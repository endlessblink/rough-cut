const durationMs = numberFromEnv('ROUGH_CUT_LONG_SMOKE_DURATION_MS', 60_000);
const minDurationMs = numberFromEnv('ROUGH_CUT_LONG_SMOKE_MIN_DURATION_MS', Math.round(durationMs * 0.9));

process.env.ROUGH_CUT_REAL_SMOKE_DURATION_MS ??= String(durationMs);
process.env.ROUGH_CUT_REAL_SMOKE_MIN_DURATION_MS ??= String(minDurationMs);
process.env.ROUGH_CUT_REAL_SMOKE_EXPECT_FPS ??= process.env.ROUGH_CUT_LONG_SMOKE_EXPECT_FPS ?? '30';
process.env.ROUGH_CUT_REAL_SMOKE_UI ??= '0';

console.info(
  `[smoke:long-recording] duration=${process.env.ROUGH_CUT_REAL_SMOKE_DURATION_MS}ms `
    + `minDuration=${process.env.ROUGH_CUT_REAL_SMOKE_MIN_DURATION_MS}ms `
    + `ui=${process.env.ROUGH_CUT_REAL_SMOKE_UI}`,
);

await import('./smoke-real-recording.mjs');

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}
