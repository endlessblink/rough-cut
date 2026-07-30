import { access, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addManualCleanupCut,
  cleanupSuggestionsFromAnalysis,
  cleanupSessionSnapshot,
  createCleanupSession,
  decideCleanupSuggestion,
  deriveRetryReplacementSuggestions,
  deriveWaitTreatmentSuggestions,
  draftTimelineDuration,
  planNaturalJoin,
  persistCleanupSessionSnapshot,
  loadCleanupSessionSnapshot,
  resolveCleanupDraftProjection,
  transcriptWordSelectionTimelineRanges,
} from '../packages/project-model/dist/index.js';
import {
  createProjectForRecording,
  getPrimaryRecording,
  openProjectFile,
  saveProjectFile,
  validateProjectPath,
} from '../apps/desktop/src/main/project-files.mjs';
import {
  EXPORT_MODES,
  exportProjectToMp4,
} from '../apps/desktop/src/main/export-service.mjs';
import { assertReadableMp4, probeImportedMedia } from '../apps/desktop/src/main/media-probe.mjs';
import { diagnosticsPathForRecording } from '../apps/desktop/src/main/recording-diagnostics.mjs';
import { createTranscriptionRuntime } from '../apps/desktop/src/main/transcription-runtime.mjs';
import { persistTranscriptToProject } from '../apps/desktop/src/main/transcription-project-persistence.mjs';
import { createRecordingTranscriptPersistence } from '../apps/desktop/src/main/transcription-main-lifecycle.mjs';
import { inspectVisualDiscontinuity } from '../apps/desktop/src/main/visual-discontinuity-service.mjs';
import { finalizeCleanupDraftProject } from '../apps/desktop/src/renderer/src/editor-v2/cleanup-finalize.mjs';
import {
  SMART_ROUGH_CUT_BENCHMARK_BUDGETS,
  classifyExportParity,
  classifyLatencyBudget,
  closestProjectFrameRate,
  selectConservativeCleanupSuggestionIds,
  summarizeCaptureBudget,
  validateInteractionBenchmark,
} from './smart-rough-cut-benchmark-utils.mjs';

const DEFAULT_MIN_DURATION_MINUTES = 60;
const args = new Map(
  process.argv.slice(2).flatMap((arg) => {
    if (!arg.startsWith('--')) return [];
    const index = arg.indexOf('=');
    return index === -1
      ? [[arg.slice(2), '1']]
      : [[arg.slice(2, index), arg.slice(index + 1)]];
  }),
);

const root = await mkdtemp(join(tmpdir(), 'rough-cut-smart-benchmark-'));
const outputPath = args.get('output')
  ? resolve(args.get('output'))
  : join(root, 'smart-rough-cut-benchmark.json');
const explicitProjectPath =
  args.get('project') || process.env.ROUGH_CUT_SMART_BENCHMARK_PROJECT_PATH || null;
const explicitSourcePath =
  args.get('source')
  || process.env.ROUGH_CUT_LONG_BENCHMARK_SOURCE
  || process.env.ROUGH_CUT_SMART_BENCHMARK_SOURCE_PATH
  || null;
const allowShort =
  args.has('allow-short') || process.env.ROUGH_CUT_LONG_BENCHMARK_ALLOW_SHORT === '1';
const skipExport =
  args.has('skip-export') || process.env.ROUGH_CUT_LONG_BENCHMARK_SKIP_EXPORT === '1';
const skipInteraction =
  args.has('skip-interaction')
  || process.env.ROUGH_CUT_LONG_BENCHMARK_SKIP_INTERACTION === '1';
const minDurationMinutes = Math.max(
  1,
  Number(
    args.get('min-duration-minutes')
    || process.env.ROUGH_CUT_LONG_BENCHMARK_MIN_DURATION_MINUTES
    || DEFAULT_MIN_DURATION_MINUTES,
  ) || DEFAULT_MIN_DURATION_MINUTES,
);

if (process.env.ROUGH_CUT_TRANSCRIPTION_FIXTURE_PATH?.trim()) {
  throw new Error(
    'benchmark-smart-rough-cut refuses ROUGH_CUT_TRANSCRIPTION_FIXTURE_PATH during a real long benchmark run.',
  );
}

if (!explicitProjectPath && !explicitSourcePath) {
  throw new Error(
    'benchmark-smart-rough-cut needs --project=/abs/path/to/project.roughcut or --source=/abs/path/to/video.mp4',
  );
}

const memorySamples = [];
const projectOpQueues = new Map();
const persistRecordingTranscript = createRecordingTranscriptPersistence({
  validateProjectPath,
  getAllowedRoots: () => [root],
  enqueueProjectOp: (safePath, op) => enqueueProjectOperation(projectOpQueues, safePath, op),
  persistTranscript: persistTranscriptToProject,
});

captureMemory(memorySamples, 'start');
let projectState = explicitProjectPath
  ? await loadExistingProject(resolve(explicitProjectPath))
  : await createBenchmarkProject(resolve(explicitSourcePath), root);
captureMemory(memorySamples, 'project-loaded');

const primaryBeforeTranscription = getRequiredPrimaryRecording(projectState.project.document);
const diagnostics = await loadDiagnostics(primaryBeforeTranscription.filePath);
const captureBudget = summarizeCaptureBudget(diagnostics);

const transcription = await ensureTranscript({
  root,
  projectState,
  sourcePath: primaryBeforeTranscription.filePath,
  fps: primaryBeforeTranscription.fps,
  durationFrames: primaryBeforeTranscription.trimmedDuration,
  persistTranscript: persistRecordingTranscript,
});
projectState = transcription.projectState;
captureMemory(memorySamples, 'transcript-ready');
if ((projectState.project.document.transcript?.words?.length ?? 0) === 0) {
  throw new Error(
    'Local transcription completed without any timed words; the source or configured language cannot prove transcript editing.',
  );
}

const suggestionStartedAt = performance.now();
const retrySuggestions = deriveRetryReplacementSuggestions(projectState.project.document);
const waitSuggestions = deriveWaitTreatmentSuggestions(projectState.project.document);
const cleanupSuggestions = cleanupSuggestionsFromAnalysis(
  retrySuggestions,
  waitSuggestions,
);
const suggestionLatencyMs = Math.max(
  0,
  Math.round(performance.now() - suggestionStartedAt),
);
captureMemory(memorySamples, 'suggestions-derived');
const interaction = skipInteraction
  ? { status: 'skipped' }
  : await runLongInteractionBenchmark({
      root,
      project: projectState.project,
      fps: primaryBeforeTranscription.fps,
      minDurationMinutes,
    });
captureMemory(memorySamples, 'interaction-complete');

const cleanup = buildCleanupBenchmark(projectState.project.document, cleanupSuggestions);
const projection = resolveCleanupDraftProjection(cleanup.session);
const baseDurationFrames = getProjectDurationFrames(projectState.project.document);
const draftDurationFrames = draftTimelineDuration(projection, baseDurationFrames);
const draftSnapshot = cleanupSessionSnapshot(cleanup.session);
const draftProjectPath = join(root, 'smart-rough-cut-draft.roughcut');
const savedDraft = await saveProjectFile(
  draftProjectPath,
  persistCleanupSessionSnapshot(
    projectState.project.document,
    primaryBeforeTranscription.assetId,
    draftSnapshot,
  ),
);
const reopenedDraft = await openProjectFile(savedDraft.path);
const reopenedDraftSnapshot = loadCleanupSessionSnapshot(
  reopenedDraft.document,
  primaryBeforeTranscription.assetId,
);
if (JSON.stringify(reopenedDraftSnapshot) !== JSON.stringify(draftSnapshot)) {
  throw new Error('Reversible cleanup draft changed across save and reopen.');
}
const transcriptBeforeFinalize = reopenedDraft.document.transcript;
projectState = {
  path: reopenedDraft.path,
  project: reopenedDraft,
};

let visualDiscontinuity = null;
if (cleanup.appliedRanges.length > 0) {
  const removal = cleanup.appliedRanges[0];
  visualDiscontinuity = await inspectVisualDiscontinuity({
    sourcePath: primaryBeforeTranscription.filePath,
    beforeFrame: Math.max(0, removal.startFrame - 1),
    afterFrame: removal.endFrame,
    fps: primaryBeforeTranscription.fps,
  });
}

let finalizeDurationMs = null;
let reopenedFinalized = null;
let finalizedProjectPath = null;
if (projection.removals.length > 0 && projection.compressions.length === 0) {
  const startedAt = performance.now();
  const finalized = finalizeCleanupDraftProject(projectState.project, projection);
  finalizeDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
  finalizedProjectPath = join(root, 'smart-rough-cut-finalized.roughcut');
  const saved = await saveProjectFile(finalizedProjectPath, finalized.document);
  reopenedFinalized = await openProjectFile(saved.path);
  if (getProjectDurationFrames(reopenedFinalized.document) !== draftDurationFrames) {
    throw new Error('Finalized timeline duration changed across save and reopen.');
  }
  if (
    JSON.stringify(reopenedFinalized.document.transcript) !==
    JSON.stringify(transcriptBeforeFinalize)
  ) {
    throw new Error('Transcript changed across cleanup finalization and reopen.');
  }
  captureMemory(memorySamples, 'finalized-and-reopened');
  projectState = {
    path: reopenedFinalized.path,
    project: reopenedFinalized,
  };
}

const exportProject = reopenedFinalized ?? projectState.project;
const rawExportPath = join(root, 'smart-rough-cut-raw.mp4');
const styledExportPath = join(root, 'smart-rough-cut-styled.mp4');
let rawOutput = null;
let styledOutput = null;
if (!skipExport) {
  await withMemoryPolling(memorySamples, 'export:raw', async () => {
    await exportProjectToMp4({
      project: exportProject.document,
      outputPath: rawExportPath,
      mode: EXPORT_MODES.RAW,
    });
    await assertReadableMp4(rawExportPath);
  });
  rawOutput = await validateBenchmarkOutput({
    caseId: 'smart-rough-cut-raw',
    outputPath: rawExportPath,
  });
  await withMemoryPolling(memorySamples, 'export:styled', async () => {
    await exportProjectToMp4({
      project: exportProject.document,
      outputPath: styledExportPath,
      mode: EXPORT_MODES.STYLED,
    });
    await assertReadableMp4(styledExportPath);
  });
  captureMemory(memorySamples, 'exports-complete');

  styledOutput = await validateBenchmarkOutput({
    caseId: 'smart-rough-cut-styled',
    outputPath: styledExportPath,
  });
}
const primaryAfterFinalize = getRequiredPrimaryRecording(exportProject.document);
const exportParity = classifyExportParity({
  durationFrames: primaryAfterFinalize.trimmedDuration,
  fps: primaryAfterFinalize.fps,
  rawDurationSeconds: rawOutput?.durationSeconds ?? null,
  styledDurationSeconds: styledOutput?.durationSeconds ?? null,
});

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  root,
  input: {
    requestedProjectPath: explicitProjectPath ? resolve(explicitProjectPath) : null,
    requestedSourcePath: explicitSourcePath ? resolve(explicitSourcePath) : null,
    benchmarkProjectPath: projectState.path,
    sourcePath: primaryAfterFinalize.filePath,
    durationFrames: primaryAfterFinalize.trimmedDuration,
    fps: primaryAfterFinalize.fps,
    resolution: {
      width: primaryAfterFinalize.width,
      height: primaryAfterFinalize.height,
    },
    minDurationMinutes,
    allowShort,
    skipExport,
    skipInteraction,
  },
  capture: captureBudget,
  transcription: {
    providerId: projectState.project.document.transcription?.provider?.id ?? null,
    hadTranscriptAtStart: transcription.hadTranscriptAtStart,
    incrementalDuringCapture: transcription.incrementalDuringCapture,
    transcriptWordCount: projectState.project.document.transcript?.words?.length ?? 0,
    transcriptReadyAfterStopMs: transcription.transcriptReadyAfterStopMs,
    status: classifyLatencyBudget(
      transcription.transcriptReadyAfterStopMs,
      SMART_ROUGH_CUT_BENCHMARK_BUDGETS.transcriptReadyAfterStopMaxMs,
    ),
  },
  suggestions: {
    retryCount: retrySuggestions.length,
    waitCount: waitSuggestions.length,
    totalCount: cleanupSuggestions.length,
    suggestionLatencyMs,
    status: classifyLatencyBudget(
      suggestionLatencyMs,
      SMART_ROUGH_CUT_BENCHMARK_BUDGETS.suggestionLatencyMaxMs,
    ),
  },
  interaction,
    cleanup: {
    strategy: cleanup.strategy,
    acceptedSuggestionIds: cleanup.acceptedSuggestionIds,
    removalCount: projection.removals.length,
    compressionCount: projection.compressions.length,
    draftDurationFrames,
    draftProjectPath,
    draftSnapshotMatchesReopen: true,
    finalizeDurationMs,
    visualDiscontinuity,
    finalizedProjectPath,
    reopenDurationFrames:
      reopenedFinalized ? getProjectDurationFrames(reopenedFinalized.document) : null,
    transcriptWordCountMatchesReopen:
      reopenedFinalized
        ? JSON.stringify(reopenedFinalized.document.transcript)
          === JSON.stringify(transcriptBeforeFinalize)
        : null,
  },
  export: {
    skipped: skipExport,
    rawExportSupported: rawOutput !== null,
    rawOutput,
    styledOutput,
    parity: exportParity,
  },
  memory: summarizeMemory(memorySamples),
  budgets: SMART_ROUGH_CUT_BENCHMARK_BUDGETS,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(report, null, 2));

async function runLongInteractionBenchmark({
  root: outputRoot,
  project,
  fps,
  minDurationMinutes,
}) {
  const interactionProjectPath = join(
    outputRoot,
    'smart-rough-cut-interaction.roughcut',
  );
  const interactionResultPath = join(
    outputRoot,
    'smart-rough-cut-interaction.json',
  );
  const saved = await saveProjectFile(
    interactionProjectPath,
    seedDeterministicInteractionCandidate(project.document),
  );
  const smokeScriptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    'smoke-ui.mjs',
  );
  const result = spawnSync(process.execPath, [smokeScriptPath], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env,
      ROUGH_CUT_SCREEN_LAYER_RENDERER: 'canvas2d',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: saved.path,
      ROUGH_CUT_UI_SMOKE_RESULT_PATH: interactionResultPath,
      ROUGH_CUT_UI_SMOKE_TRANSCRIPT_ONLY: '1',
      ROUGH_CUT_UI_SMOKE_CLEANUP_REVIEW: '1',
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Long-recording interaction smoke failed (${result.status}): ${
        (result.stderr || result.stdout || '').trim()
      }`,
    );
  }
  const interactionReport = JSON.parse(
    await readFile(interactionResultPath, 'utf8'),
  );
  return {
    ...validateInteractionBenchmark({
      report: interactionReport,
      expectedProjectPath: saved.path,
      minimumDurationFrames: Math.round(minDurationMinutes * 60 * fps),
    }),
    reviewCandidate:
      'deterministic-retry-over-real-long-transcript',
  };
}

function seedDeterministicInteractionCandidate(document) {
  const paragraphs = document.transcript?.paragraphs ?? [];
  if (paragraphs.length < 6) {
    throw new Error(
      'Long interaction benchmark needs at least six transcript paragraphs.',
    );
  }
  const reviewTexts = [
    'run pnpm build',
    'build failed error',
    'run pnpm build passes',
    'install package',
    'package failed error',
    'install package works',
  ];
  const reviewTokens = reviewTexts.map((text) => text.split(' '));
  const words = document.transcript?.words ?? [];
  return {
    ...document,
    transcript: {
      ...document.transcript,
      words: words.map((word) => {
        const paragraphIndex = paragraphs.findIndex(
          (paragraph, index) =>
            index < reviewTokens.length
            && word.endFrame > paragraph.startFrame
            && word.startFrame < paragraph.endFrame,
        );
        if (paragraphIndex < 0) return word;
        const paragraphWords = words.filter(
          (candidate) =>
            candidate.endFrame > paragraphs[paragraphIndex].startFrame
            && candidate.startFrame < paragraphs[paragraphIndex].endFrame,
        );
        const wordIndex = paragraphWords.indexOf(word);
        const tokens = reviewTokens[paragraphIndex];
        return {
          ...word,
          word: tokens[Math.min(wordIndex, tokens.length - 1)],
        };
      }),
      paragraphs: paragraphs.map((paragraph, index) =>
        index < reviewTexts.length
          ? { ...paragraph, text: reviewTexts[index] }
          : paragraph),
    },
  };
}

async function loadExistingProject(projectPath) {
  return {
    path: projectPath,
    project: await openProjectFile(projectPath),
  };
}

async function createBenchmarkProject(sourcePath, outputRoot) {
  const probe = await probeImportedMedia(sourcePath, { kind: 'video' });
  if ((probe.durationSeconds ?? 0) < minDurationMinutes * 60 && !allowShort) {
    throw new Error(
      `benchmark-smart-rough-cut requires at least ${minDurationMinutes} minutes of source media; got ${((probe.durationSeconds ?? 0) / 60).toFixed(2)} minutes.`,
    );
  }
  const startedAt = new Date('2026-07-29T00:00:00.000Z');
  const stoppedAt = new Date(
    startedAt.getTime() + Math.round((probe.durationSeconds ?? 0) * 1000),
  );
  const fps = closestProjectFrameRate(probe.fps);
  const document = createProjectForRecording({
    recording: {
      startedAt: startedAt.toISOString(),
      stoppedAt: stoppedAt.toISOString(),
      rawPath: sourcePath,
      outputPath: sourcePath,
      width: probe.width,
      height: probe.height,
      fps,
      cursorEvents: [],
      audio: probe.hasAudio ? { systemAudioSource: 'benchmark-import' } : null,
    },
  });
  const projectPath = join(outputRoot, 'smart-rough-cut-source.roughcut');
  const project = await saveProjectFile(projectPath, document);
  return {
    path: project.path,
    project,
  };
}

async function ensureTranscript({
  root: outputRoot,
  projectState: state,
  sourcePath,
  fps,
  durationFrames,
  persistTranscript,
}) {
  const existingWords = state.project.document.transcript?.words?.length ?? 0;
  if (existingWords > 0) {
    return {
      hadTranscriptAtStart: true,
      incrementalDuringCapture: null,
      transcriptReadyAfterStopMs: 0,
      projectState: state,
    };
  }
  const runtime = await createTranscriptionRuntime({
    environment: process.env,
    userDataDir: join(outputRoot, 'transcription-state'),
    onLog: (message) => console.warn(message),
    persistTranscript,
  });
  if (!runtime.enabled || !runtime.available || !runtime.service) {
    throw new Error(
      'No local transcription provider is available for benchmark-smart-rough-cut.',
    );
  }
  try {
    const totalMs = Math.max(1, Math.round((durationFrames / fps) * 1000));
    const begin = await runtime.service.beginRecording({ sourcePath, fps });
    const jobId = begin.job?.id ?? null;
    if (runtime.incrementalDuringCapture) {
      const chunkMs = 15_000;
      await withMemoryPolling(memorySamples, 'transcription:incremental', async () => {
        for (
          let availableMs = chunkMs;
          availableMs < totalMs;
          availableMs += chunkMs
        ) {
          await runtime.service.processAvailable(jobId, availableMs);
        }
      });
    }
    const stopStartedAt = performance.now();
    await runtime.service.prepareRecordingFinalization({
      jobId,
      projectPath: state.path,
      totalMs,
    });
    await withMemoryPolling(memorySamples, 'transcription', () =>
      runtime.service.finishRecording({
        jobId,
        projectPath: state.path,
        totalMs,
      }),
    );
    const transcriptReadyAfterStopMs = Math.max(
      0,
      Math.round(performance.now() - stopStartedAt),
    );
    return {
      hadTranscriptAtStart: false,
      incrementalDuringCapture: runtime.incrementalDuringCapture,
      transcriptReadyAfterStopMs,
      projectState: {
        path: state.path,
        project: await openProjectFile(state.path),
      },
    };
  } finally {
    runtime.dispose();
  }
}

function buildCleanupBenchmark(document, cleanupSuggestions) {
  let session = createCleanupSession(cleanupSuggestions);
  const acceptedSuggestionIds = [];
  for (const suggestionId of selectConservativeCleanupSuggestionIds(cleanupSuggestions)) {
    session = acceptSuggestion(session, suggestionId);
    acceptedSuggestionIds.push(suggestionId);
  }
  if (acceptedSuggestionIds.length > 0) {
    return {
      strategy: 'automatic',
      acceptedSuggestionIds,
      session,
      appliedRanges: resolveCleanupDraftProjection(session).removals,
    };
  }
  const fallback = manualFallbackSelection(document);
  if (!fallback) {
    return {
      strategy: 'none',
      acceptedSuggestionIds,
      session,
      appliedRanges: [],
    };
  }
  const manualId = `cleanup:manual-benchmark:${fallback.anchor}:${fallback.focus}`;
  session = addManualCleanupCut(
    session,
    fallback.ranges,
    manualId,
    planNaturalJoin(document, fallback.ranges),
  );
  return {
    strategy: 'manual',
    acceptedSuggestionIds: [manualId],
    session,
    appliedRanges: fallback.ranges,
  };
}

function acceptSuggestion(session, suggestionId) {
  return decideCleanupSuggestion(session, suggestionId, 'accepted');
}

function manualFallbackSelection(document) {
  const words = document.transcript?.words ?? [];
  if (words.length < 2) return null;
  const offsets = buildCenterOffsets(words.length);
  for (const offset of offsets) {
    const anchor = Math.max(0, Math.min(words.length - 2, offset));
    const focus = Math.min(words.length - 1, anchor + 1);
    const ranges = transcriptWordSelectionTimelineRanges(document, anchor, focus);
    const spanFrames = ranges.reduce(
      (sum, range) => sum + (range.endFrame - range.startFrame),
      0,
    );
    if (ranges.length > 0 && spanFrames > 0) {
      return { anchor, focus, ranges };
    }
  }
  return null;
}

function buildCenterOffsets(length) {
  const center = Math.max(0, Math.floor(length / 2) - 1);
  const offsets = [];
  for (let delta = 0; delta < length; delta += 1) {
    const left = center - delta;
    const right = center + delta;
    if (left >= 0) offsets.push(left);
    if (right < length - 1 && right !== left) offsets.push(right);
  }
  return offsets;
}

function getRequiredPrimaryRecording(projectDocument) {
  const primary = getPrimaryRecording(projectDocument);
  if (!primary?.filePath) {
    throw new Error('Benchmark project needs a primary recording or video source.');
  }
  return primary;
}

function getProjectDurationFrames(document) {
  return Math.max(
    0,
    ...(document.timeline?.tracks ?? []).flatMap((track) =>
      (track.clips ?? []).map((clip) => clip.timelineOut),
    ),
  );
}

async function loadDiagnostics(sourcePath) {
  const reportPath = diagnosticsPathForRecording(sourcePath);
  try {
    await access(reportPath);
    return JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

function enqueueProjectOperation(queues, safePath, op) {
  const previous = queues.get(safePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => op());
  queues.set(safePath, next);
  next.finally(() => {
    if (queues.get(safePath) === next) queues.delete(safePath);
  });
  return next;
}

function captureMemory(samples, label) {
  const usage = process.memoryUsage();
  samples.push({
    label,
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
  });
}

async function withMemoryPolling(samples, label, operation) {
  captureMemory(samples, `${label}:start`);
  const interval = setInterval(() => {
    captureMemory(samples, `${label}:active`);
  }, 1_000);
  interval.unref?.();
  try {
    return await operation();
  } finally {
    clearInterval(interval);
    captureMemory(samples, `${label}:end`);
  }
}

function summarizeMemory(samples) {
  const rssValues = samples.map((sample) => sample.rssBytes);
  const heapValues = samples.map((sample) => sample.heapUsedBytes);
  return {
    samples,
    baselineRssBytes: rssValues[0] ?? null,
    peakRssBytes: rssValues.length > 0 ? Math.max(...rssValues) : null,
    rssGrowthBytes:
      rssValues.length > 0 ? Math.max(...rssValues) - rssValues[0] : null,
    baselineHeapUsedBytes: heapValues[0] ?? null,
    peakHeapUsedBytes: heapValues.length > 0 ? Math.max(...heapValues) : null,
    heapGrowthBytes:
      heapValues.length > 0 ? Math.max(...heapValues) - heapValues[0] : null,
  };
}

async function validateBenchmarkOutput({ caseId, outputPath }) {
  const file = await stat(outputPath).catch((error) => {
    throw new Error(
      `Benchmark ${caseId} did not create output ${outputPath}: ${error?.message ?? error}`,
    );
  });
  if (!file || file.size <= 0) {
    throw new Error(`Benchmark ${caseId} produced an empty output: ${outputPath}`);
  }
  const probe = await probeImportedMedia(outputPath, { kind: 'video' });
  if (
    !Number.isFinite(probe.durationSeconds)
    || probe.durationSeconds <= 0
    || !Number.isFinite(probe.width)
    || probe.width <= 0
    || !Number.isFinite(probe.height)
    || probe.height <= 0
  ) {
    throw new Error(
      `Benchmark ${caseId} output has invalid media probe: ${JSON.stringify(probe)}`,
    );
  }
  return {
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    durationSeconds: probe.durationSeconds,
    bytes: file.size,
  };
}
