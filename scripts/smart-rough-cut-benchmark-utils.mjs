export const SMART_ROUGH_CUT_BENCHMARK_BUDGETS = Object.freeze({
  transcriptReadyAfterStopMaxMs: 10_000,
  suggestionLatencyMaxMs: 5_000,
  keyboardResponseMaxMs: 100,
  joinPreviewStartupMaxMs: 250,
  exportParityMaxDeltaMs: 100,
});

export function classifyLatencyBudget(valueMs, maxMs) {
  if (!Number.isFinite(valueMs) || valueMs < 0) return 'unavailable';
  return valueMs <= maxMs ? 'within-budget' : 'over-budget';
}

export function closestProjectFrameRate(value) {
  const fps = Number.isFinite(value) && value > 0 ? value : 30;
  return [24, 30, 60].reduce((closest, candidate) =>
    Math.abs(candidate - fps) < Math.abs(closest - fps) ? candidate : closest,
  );
}

export function summarizeCaptureBudget(diagnostics) {
  const frameDrops = finiteNonNegative(diagnostics?.remux?.frameDrops);
  const queueWarnings = finiteNonNegative(diagnostics?.remux?.queueWarnings);
  if (frameDrops === null && queueWarnings === null) {
    return {
      status: 'unavailable',
      frameDrops: null,
      queueWarnings: null,
    };
  }
  return {
    status:
      (frameDrops ?? 0) === 0 && (queueWarnings ?? 0) === 0
        ? 'within-budget'
        : 'over-budget',
    frameDrops,
    queueWarnings,
  };
}

export function selectConservativeCleanupSuggestionIds(
  suggestions,
  {
    limit = 3,
    minimumConfidence = 0.75,
  } = {},
) {
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter(
      (suggestion) =>
        suggestion?.proposedAction === 'remove'
        && suggestion?.keptByDefault !== true
        && Number.isFinite(Number(suggestion?.confidence))
        && Number(suggestion.confidence) >= minimumConfidence,
    )
    .sort(
      (left, right) =>
        Number(right.confidence) - Number(left.confidence)
        || String(left.id ?? '').localeCompare(String(right.id ?? '')),
    )
    .slice(0, Math.max(0, Math.round(limit)))
    .map((suggestion) => suggestion.id);
}

export function computeDurationDeltaMs(durationFrames, fps, durationSeconds) {
  if (
    !Number.isFinite(durationFrames)
    || durationFrames < 0
    || !Number.isFinite(fps)
    || fps <= 0
    || !Number.isFinite(durationSeconds)
    || durationSeconds < 0
  ) {
    return null;
  }
  return Math.round(Math.abs((durationFrames / fps) - durationSeconds) * 1000);
}

export function classifyExportParity({
  durationFrames,
  fps,
  rawDurationSeconds,
  styledDurationSeconds,
  maxDeltaMs = SMART_ROUGH_CUT_BENCHMARK_BUDGETS.exportParityMaxDeltaMs,
}) {
  const rawDeltaMs = computeDurationDeltaMs(durationFrames, fps, rawDurationSeconds);
  const styledDeltaMs = computeDurationDeltaMs(
    durationFrames,
    fps,
    styledDurationSeconds,
  );
  const interExportDeltaMs =
    Number.isFinite(rawDurationSeconds) && Number.isFinite(styledDurationSeconds)
      ? Math.round(Math.abs(rawDurationSeconds - styledDurationSeconds) * 1000)
      : null;
  const styledAvailable = styledDeltaMs !== null;
  const rawAvailable = rawDeltaMs !== null;
  const status = !rawAvailable || !styledAvailable
    ? 'unavailable'
    : [rawDeltaMs, styledDeltaMs, interExportDeltaMs].every(
        (value) => value !== null && value <= maxDeltaMs,
      )
      ? 'within-budget'
      : 'over-budget';
  return {
    status,
    rawAvailable,
    styledAvailable,
    rawDeltaMs,
    styledDeltaMs,
    interExportDeltaMs,
  };
}

export function validateInteractionBenchmark({
  report,
  expectedProjectPath,
  minimumDurationFrames,
  keyboardResponseMaxMs =
    SMART_ROUGH_CUT_BENCHMARK_BUDGETS.keyboardResponseMaxMs,
  joinPreviewStartupMaxMs =
    SMART_ROUGH_CUT_BENCHMARK_BUDGETS.joinPreviewStartupMaxMs,
}) {
  if (!report || report.ok !== true) {
    throw new Error('Long-recording interaction report did not complete successfully.');
  }
  const projectMatches =
    typeof report.projectPath === 'string'
    && report.projectPath === expectedProjectPath;
  if (!projectMatches) {
    throw new Error('Long-recording interaction report does not match the benchmark project.');
  }
  if (
    !Number.isFinite(report.recordingDurationFrames)
    || report.recordingDurationFrames < minimumDurationFrames
  ) {
    throw new Error('Long-recording interaction report used a project below the duration gate.');
  }
  if (
    !Number.isFinite(report.projectDurationFrames)
    || report.projectDurationFrames <= 0
    || report.projectDurationFrames > report.recordingDurationFrames
  ) {
    throw new Error('Long-recording interaction report has an invalid project duration.');
  }
  if (
    report.hasLatestRapidSeek !== true
    || report.hasCleanupFrameContinuity !== true
    || !Number.isFinite(report.cleanupFrameCount)
    || report.cleanupFrameCount <= 0
    || report.cleanupBadFrameCount !== 0
  ) {
    throw new Error('Long-recording interaction report did not preserve seek and frame continuity.');
  }
  const keyboardLatencies = [
    report.boundaryFeedbackLatencyMs,
    report.transcriptSeekLatencyMs,
    report.rapidSeekSettleLatencyMs,
  ];
  if (
    !keyboardLatencies.every(
      (value) =>
        Number.isFinite(value)
        && value >= 0
        && value <= keyboardResponseMaxMs,
    )
  ) {
    throw new Error('Long-recording interaction latency budget was not met.');
  }
  if (
    !Number.isFinite(report.joinPreviewStartupLatencyMs)
    || report.joinPreviewStartupLatencyMs < 0
    || report.joinPreviewStartupLatencyMs > joinPreviewStartupMaxMs
  ) {
    throw new Error('Long-recording join-preview startup budget was not met.');
  }
  return {
    status: 'within-budget',
    projectMatches,
    projectPath: report.projectPath,
    projectDurationFrames: report.projectDurationFrames,
    recordingDurationFrames: report.recordingDurationFrames,
    hasLatestRapidSeek: true,
    hasCleanupFrameContinuity: true,
    cleanupFrameCount: report.cleanupFrameCount,
    cleanupBadFrameCount: report.cleanupBadFrameCount,
    boundaryFeedbackLatencyMs: report.boundaryFeedbackLatencyMs,
    transcriptSeekLatencyMs: report.transcriptSeekLatencyMs,
    rapidSeekSettleLatencyMs: report.rapidSeekSettleLatencyMs,
    joinPreviewStartupLatencyMs: report.joinPreviewStartupLatencyMs,
  };
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}
