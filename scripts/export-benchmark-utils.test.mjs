import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBudgetStatus,
  computeFrameDurationSeconds,
  computeSpeedMultiplier,
  validateBenchmarkOutput,
} from './export-benchmark-utils.mjs';

test('computeSpeedMultiplier reports source seconds per wall-clock second', () => {
  assert.equal(computeSpeedMultiplier(4, 2000), 2);
  assert.equal(computeSpeedMultiplier(4, 0), null);
});

test('computeFrameDurationSeconds converts frame duration with invalid guards', () => {
  assert.equal(computeFrameDurationSeconds(120, 30), 4);
  assert.equal(computeFrameDurationSeconds(120, 0), null);
});

test('classifyBudgetStatus handles raw and styled budget shapes', () => {
  const budget = {
    rawCopyMaxWallClockMs: 250,
    rawTrimMaxWallClockMs: 2000,
    styledMinSpeedMultiplier: 0.5,
  };
  assert.equal(classifyBudgetStatus({ mode: 'raw-copy', wallClockMs: 200, speedMultiplier: 20, budget }), 'within-budget');
  assert.equal(classifyBudgetStatus({ mode: 'raw-trim', wallClockMs: 2500, speedMultiplier: 1.6, budget }), 'over-budget');
  assert.equal(classifyBudgetStatus({ mode: 'styled', wallClockMs: 9000, speedMultiplier: 0.44, budget }), 'over-budget');
  assert.equal(classifyBudgetStatus({ mode: 'styled', wallClockMs: 5000, speedMultiplier: 0.8, budget }), 'within-budget');
});

test('validateBenchmarkOutput rejects missing output', async () => {
  await assert.rejects(
    () => validateBenchmarkOutput({
      caseId: 'missing',
      outputPath: '/tmp/missing.mp4',
      statFn: async () => { throw new Error('ENOENT'); },
      probeFn: async () => ({ width: 1920, height: 1080, durationSeconds: 4 }),
    }),
    /did not create output/,
  );
});

test('validateBenchmarkOutput rejects invalid media probes', async () => {
  await assert.rejects(
    () => validateBenchmarkOutput({
      caseId: 'invalid',
      outputPath: '/tmp/invalid.mp4',
      statFn: async () => ({ size: 10 }),
      probeFn: async () => ({ width: 0, height: 1080, durationSeconds: 4 }),
    }),
    /invalid video dimensions/,
  );
});
