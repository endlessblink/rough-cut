import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SMART_ROUGH_CUT_BENCHMARK_BUDGETS,
  classifyExportParity,
  classifyLatencyBudget,
  closestProjectFrameRate,
  computeDurationDeltaMs,
  selectConservativeCleanupSuggestionIds,
  summarizeCaptureBudget,
  validateInteractionBenchmark,
} from './smart-rough-cut-benchmark-utils.mjs';

test('closestProjectFrameRate conforms arbitrary media rates to the project schema', () => {
  assert.equal(closestProjectFrameRate(25), 24);
  assert.equal(closestProjectFrameRate(29.97), 30);
  assert.equal(closestProjectFrameRate(59.94), 60);
  assert.equal(closestProjectFrameRate(null), 30);
});

test('classifyLatencyBudget handles missing and over-budget values', () => {
  assert.equal(classifyLatencyBudget(42, 100), 'within-budget');
  assert.equal(classifyLatencyBudget(120, 100), 'over-budget');
  assert.equal(classifyLatencyBudget(null, 100), 'unavailable');
});

test('summarizeCaptureBudget distinguishes clean and warning diagnostics', () => {
  assert.deepEqual(summarizeCaptureBudget({ remux: { frameDrops: 0, queueWarnings: 0 } }), {
    status: 'within-budget',
    frameDrops: 0,
    queueWarnings: 0,
  });
  assert.deepEqual(summarizeCaptureBudget({ remux: { frameDrops: 2, queueWarnings: 0 } }), {
    status: 'over-budget',
    frameDrops: 2,
    queueWarnings: 0,
  });
  assert.deepEqual(summarizeCaptureBudget(null), {
    status: 'unavailable',
    frameDrops: null,
    queueWarnings: null,
  });
});

test('selectConservativeCleanupSuggestionIds keeps only removable high-confidence suggestions', () => {
  const ids = selectConservativeCleanupSuggestionIds([
    { id: 'keep-default', proposedAction: 'remove', keptByDefault: true, confidence: 0.99 },
    { id: 'compress', proposedAction: 'compress', keptByDefault: false, confidence: 0.99 },
    { id: 'low-confidence', proposedAction: 'remove', keptByDefault: false, confidence: 0.6 },
    { id: 'best', proposedAction: 'remove', keptByDefault: false, confidence: 0.95 },
    { id: 'next', proposedAction: 'remove', keptByDefault: false, confidence: 0.8 },
  ]);
  assert.deepEqual(ids, ['best', 'next']);
});

test('computeDurationDeltaMs and classifyExportParity measure duration drift', () => {
  assert.equal(computeDurationDeltaMs(300, 30, 10), 0);
  const parity = classifyExportParity({
    durationFrames: 300,
    fps: 30,
    rawDurationSeconds: 10.02,
    styledDurationSeconds: 10.03,
    maxDeltaMs: SMART_ROUGH_CUT_BENCHMARK_BUDGETS.exportParityMaxDeltaMs,
  });
  assert.equal(parity.status, 'within-budget');
  assert.equal(parity.rawAvailable, true);
  assert.equal(parity.styledAvailable, true);
  assert.equal(parity.rawDeltaMs, 20);
  assert.equal(parity.styledDeltaMs, 30);
  assert.equal(parity.interExportDeltaMs, 10);
});

test('classifyExportParity refuses to pass when either export is missing', () => {
  const parity = classifyExportParity({
    durationFrames: 300,
    fps: 30,
    rawDurationSeconds: null,
    styledDurationSeconds: 10.04,
    maxDeltaMs: 100,
  });
  assert.equal(parity.status, 'unavailable');
  assert.equal(parity.rawAvailable, false);
  assert.equal(parity.styledAvailable, true);
  assert.equal(parity.rawDeltaMs, null);
  assert.equal(parity.styledDeltaMs, 40);
  assert.equal(parity.interExportDeltaMs, null);
});

test('post-stop latency starts before transcription finalization waits', async () => {
  const source = await readFile(
    new URL('./benchmark-smart-rough-cut.mjs', import.meta.url),
    'utf8',
  );
  const timerIndex = source.indexOf(
    "const stopStartedAt = performance.now();",
  );
  const prepareIndex = source.indexOf(
    'await runtime.service.prepareRecordingFinalization({',
  );
  const finishIndex = source.indexOf(
    'runtime.service.finishRecording({',
  );

  assert.ok(timerIndex >= 0);
  assert.ok(prepareIndex > timerIndex);
  assert.ok(finishIndex > prepareIndex);
});

test('validateInteractionBenchmark requires a matching long project and all latency gates', () => {
  const interaction = validateInteractionBenchmark({
    report: {
      ok: true,
      projectPath: '/tmp/long.roughcut',
      projectDurationFrames: 108_000,
      recordingDurationFrames: 108_000,
      hasLatestRapidSeek: true,
      hasCleanupFrameContinuity: true,
      cleanupFrameCount: 120,
      cleanupBadFrameCount: 0,
      boundaryFeedbackLatencyMs: 20,
      transcriptSeekLatencyMs: 30,
      rapidSeekSettleLatencyMs: 40,
      joinPreviewStartupLatencyMs: 120,
    },
    expectedProjectPath: '/tmp/long.roughcut',
    minimumDurationFrames: 108_000,
  });

  assert.equal(interaction.status, 'within-budget');
  assert.equal(interaction.projectMatches, true);
});

test('validateInteractionBenchmark rejects synthetic, incomplete, or slow interaction proof', () => {
  assert.throws(
    () => validateInteractionBenchmark({
      report: {
        ok: true,
        projectPath: '/tmp/synthetic.roughcut',
        projectDurationFrames: 300,
        recordingDurationFrames: 300,
        hasLatestRapidSeek: true,
        hasCleanupFrameContinuity: true,
        cleanupFrameCount: 120,
        cleanupBadFrameCount: 0,
        boundaryFeedbackLatencyMs: 20,
        transcriptSeekLatencyMs: 30,
        rapidSeekSettleLatencyMs: 40,
        joinPreviewStartupLatencyMs: 120,
      },
      expectedProjectPath: '/tmp/long.roughcut',
      minimumDurationFrames: 108_000,
    }),
    /does not match the benchmark project/,
  );
  assert.throws(
    () => validateInteractionBenchmark({
      report: {
        ok: true,
        projectPath: '/tmp/long.roughcut',
        projectDurationFrames: 108_000,
        recordingDurationFrames: 108_000,
        hasLatestRapidSeek: true,
        hasCleanupFrameContinuity: true,
        cleanupFrameCount: 120,
        cleanupBadFrameCount: 0,
        boundaryFeedbackLatencyMs: 20,
        transcriptSeekLatencyMs: 130,
        rapidSeekSettleLatencyMs: 40,
        joinPreviewStartupLatencyMs: 120,
      },
      expectedProjectPath: '/tmp/long.roughcut',
      minimumDurationFrames: 108_000,
    }),
    /interaction latency budget/,
  );
});
