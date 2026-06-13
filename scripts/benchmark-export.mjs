import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { getPrimaryRecording, openProjectFile, saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import {
  applyRecordingBackgroundPreset,
  createDefaultRecordingPresentation,
  createZoomMarker,
} from '../packages/project-model/dist/index.js';
import {
  EXPORT_BENCHMARK_BUDGETS,
  classifyBudgetStatus,
  computeFrameDurationSeconds,
  computeSpeedMultiplier,
  probeMedia,
  validateBenchmarkOutput,
} from './export-benchmark-utils.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-benchmark-'));
const SOURCE_WIDTH = 1920;
const SOURCE_HEIGHT = 1080;
const SOURCE_FPS = 30;
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const projectArg = process.argv.find((arg) => arg.startsWith('--project='));
const reportPath = outputArg
  ? resolve(outputArg.slice('--output='.length))
  : join(root, 'export-benchmark-result.json');
const realProjectPath = projectArg ? resolve(projectArg.slice('--project='.length)) : null;
const cpuEncoder = process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER ?? process.env.ROUGH_CUT_STYLED_ENCODER;
if (!cpuEncoder) process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER = 'libx264';
const experimentalHeadlessExportEnabled = process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT === '1';

await mkdir(root, { recursive: true });
const sourcePath = join(root, 'source-1080p.mp4');
const cameraPath = join(root, 'camera.mp4');
await createFixtures({ sourcePath, cameraPath });

const baseProject = await createRecordingProject({
  mediaPath: sourcePath,
  cameraPath: null,
  durationSeconds: 4,
  cursorEvents: [],
});
const sourceProbe = probeMedia(sourcePath);

const cases = [
  {
    id: 'raw-copy',
    label: 'Raw copy',
    mode: 'raw',
    budgetMode: 'raw-copy',
    featureMix: ['raw', 'copy', 'no-edits'],
    project: baseProject.document,
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'raw-trim',
    label: 'Raw trim',
    mode: 'raw',
    budgetMode: 'raw-trim',
    featureMix: ['raw', 'head-tail-trim'],
    project: trimPrimaryClip(baseProject.document, { sourceIn: 30, sourceOut: 90 }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'styled-basic',
    label: 'Styled no zoom/no camera',
    mode: 'styled',
    budgetMode: 'styled',
    featureMix: ['styled', 'no-zoom', 'no-camera'],
    project: withPrimaryPresentation(baseProject.document),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'styled-cursor-clicks',
    label: 'Styled with cursor and clicks',
    mode: 'styled',
    budgetMode: 'styled',
    featureMix: ['styled', 'cursor', 'clicks'],
    project: withPrimaryPresentation((await createRecordingProject({
      mediaPath: sourcePath,
      cameraPath: null,
      durationSeconds: 4,
      cursorEvents: buildCursorEvents({ fps: SOURCE_FPS, durationFrames: 120, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, includeClicks: true }),
    })).document, {
      cursor: { style: 'default', clickEffect: 'ring', sizePercent: 110, clickSoundEnabled: false },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'profile-cursor-move-only',
    label: 'Profile cursor subtitles without clicks',
    mode: 'styled',
    budgetMode: 'profile',
    profileRole: 'cursor-subtitles',
    compareTo: 'styled-basic',
    featureMix: ['profile', 'styled', 'cursor', 'no-clicks'],
    project: withPrimaryPresentation((await createRecordingProject({
      mediaPath: sourcePath,
      cameraPath: null,
      durationSeconds: 4,
      cursorEvents: buildCursorEvents({ fps: SOURCE_FPS, durationFrames: 120, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, includeClicks: false }),
    })).document, {
      cursor: { style: 'default', clickEffect: 'none', sizePercent: 110, clickSoundEnabled: false },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'styled-zooms',
    label: 'Styled with zooms',
    mode: 'styled',
    budgetMode: 'styled',
    profileRole: 'zoom-crop-sendcmd',
    compareTo: 'styled-basic',
    featureMix: ['styled', 'zoom-markers'],
    project: withPrimaryPresentation(baseProject.document, {
      zoom: {
        markers: [
          createZoomMarker(24, 72, { strength: 0.85, focalPoint: { x: 0.24, y: 0.35 } }),
          createZoomMarker(78, 114, { strength: 0.75, focalPoint: { x: 0.76, y: 0.68 } }),
        ],
      },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'experimental-headless-zooms-cursor',
    label: 'Experimental headless with zooms/cursor',
    mode: 'experimental-headless',
    budgetMode: 'styled',
    profileRole: 'experimental-headless-fallback',
    compareTo: 'styled-zooms',
    featureMix: ['experimental-headless', 'styled-fallback', 'zoom-markers', 'cursor'],
    project: withPrimaryPresentation((await createRecordingProject({
      mediaPath: sourcePath,
      cameraPath: null,
      durationSeconds: 4,
      cursorEvents: buildCursorEvents({ fps: SOURCE_FPS, durationFrames: 120, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, includeClicks: false }),
    })).document, {
      zoom: {
        markers: [
          createZoomMarker(24, 72, { strength: 0.85, focalPoint: { x: 0.24, y: 0.35 } }),
          createZoomMarker(78, 114, { strength: 0.75, focalPoint: { x: 0.76, y: 0.68 } }),
        ],
      },
      cursor: { style: 'default', clickEffect: 'none', sizePercent: 110, clickSoundEnabled: false },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'experimental-headless-full-composition',
    label: 'Experimental headless full composition',
    mode: 'experimental-headless',
    budgetMode: 'styled',
    profileRole: 'experimental-headless-full-composition',
    compareTo: 'styled-basic',
    featureMix: ['experimental-headless', 'background-image', 'camera-pip', 'zoom-markers', 'cursor', 'clicks'],
    project: withPrimaryPresentation((await createRecordingProject({
      mediaPath: sourcePath,
      cameraPath,
      durationSeconds: 4,
      cursorEvents: buildCursorEvents({ fps: SOURCE_FPS, durationFrames: 120, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, includeClicks: true }),
    })).document, {
      background: applyRecordingBackgroundPreset(createDefaultRecordingPresentation().background, 'soft-blur'),
      camera: { visible: true, shape: 'circle', aspectRatio: '1:1', position: 'corner-br', size: 118, roundness: 100 },
      cursor: { style: 'spotlight', clickEffect: 'ripple', sizePercent: 115, clickSoundEnabled: false },
      zoom: {
        markers: [
          createZoomMarker(24, 72, { strength: 0.85, focalPoint: { x: 0.24, y: 0.35 } }),
          createZoomMarker(78, 114, { strength: 0.75, focalPoint: { x: 0.76, y: 0.68 } }),
        ],
      },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'profile-shadow-off',
    label: 'Profile without screen shadow',
    mode: 'styled',
    budgetMode: 'profile',
    profileRole: 'shadow-blur',
    compareTo: 'styled-basic',
    featureMix: ['profile', 'styled', 'shadow-disabled', 'rounded-screen'],
    project: withPrimaryPresentation(baseProject.document, {
      background: {
        ...createDefaultRecordingPresentation().background,
        bgShadowEnabled: false,
        bgShadowOpacity: 0,
        bgShadowBlur: 0,
        bgShadowOffsetY: 0,
        bgShadowOffsetX: 0,
      },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'profile-square-no-shadow',
    label: 'Profile square screen without shadow',
    mode: 'styled',
    budgetMode: 'profile',
    profileRole: 'rounded-alpha',
    compareTo: 'profile-shadow-off',
    featureMix: ['profile', 'styled', 'square-screen', 'shadow-disabled'],
    project: withPrimaryPresentation(baseProject.document, {
      background: {
        ...createDefaultRecordingPresentation().background,
        bgCornerRadius: 0,
        bgShadowEnabled: false,
        bgShadowOpacity: 0,
        bgShadowBlur: 0,
        bgShadowOffsetY: 0,
        bgShadowOffsetX: 0,
      },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'styled-camera-pip',
    label: 'Styled with camera PiP',
    mode: 'styled',
    budgetMode: 'styled',
    profileRole: 'camera-overlay',
    compareTo: 'styled-basic',
    featureMix: ['styled', 'camera-pip'],
    project: withPrimaryPresentation((await createRecordingProject({
      mediaPath: sourcePath,
      cameraPath,
      durationSeconds: 4,
      cursorEvents: [],
    })).document, {
      camera: { visible: true, shape: 'circle', aspectRatio: '1:1', position: 'corner-br', size: 118, roundness: 100 },
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'styled-background-image',
    label: 'Styled with background image',
    mode: 'styled',
    budgetMode: 'styled',
    profileRole: 'background-image',
    compareTo: 'styled-basic',
    featureMix: ['styled', 'background-image'],
    project: withPrimaryPresentation(baseProject.document, {
      background: applyRecordingBackgroundPreset(createDefaultRecordingPresentation().background, 'soft-blur'),
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
  {
    id: 'profile-cut-ranges',
    label: 'Profile cut ranges',
    mode: 'styled',
    budgetMode: 'profile',
    profileRole: 'cut-select',
    compareTo: 'styled-basic',
    featureMix: ['profile', 'styled', 'cut-ranges'],
    project: withPrimaryPresentation(baseProject.document, {
      cutRanges: [
        { id: 'profile-cut-1', startFrame: 24, endFrame: 42 },
        { id: 'profile-cut-2', startFrame: 84, endFrame: 96 },
      ],
    }),
    sourceDurationSeconds: sourceProbe.durationSeconds,
  },
];

const results = [];
for (const benchmarkCase of cases) {
  results.push(await runBenchmarkCase(benchmarkCase));
}

if (realProjectPath) {
  const realProject = await openProjectFile(realProjectPath);
  const primary = getPrimaryRecording(realProject.document);
  if (!primary) throw new Error(`Real project has no primary recording asset: ${realProjectPath}`);
  const sourceDurationSeconds = computeFrameDurationSeconds(primary.trimmedDuration, primary.fps);
  results.push(await runBenchmarkCase({
    id: 'real-recording-styled',
    label: 'Real recording styled',
    mode: 'styled',
    budgetMode: 'real-recording',
    featureMix: buildRealRecordingFeatureMix(primary),
    project: withPrimaryPresentation(realProject.document),
    sourceDurationSeconds,
    sourcePath: primary.filePath,
    projectPath: realProjectPath,
  }));
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  root,
  sourcePath,
  realProjectPath,
  source: {
    durationSeconds: round(sourceProbe.durationSeconds),
    resolution: { width: sourceProbe.width, height: sourceProbe.height },
    fps: sourceProbe.fps,
  },
  experimentalHeadlessExportEnabled,
  budgets: EXPORT_BENCHMARK_BUDGETS,
  cases: results,
  profiling: buildProfilingSummary(results),
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2));
printSummary(report, reportPath);

async function runBenchmarkCase(benchmarkCase) {
  const outputPath = join(root, `${benchmarkCase.id}.mp4`);
  await saveProjectFile(join(root, `${benchmarkCase.id}.roughcut`), benchmarkCase.project);
  const started = performance.now();
  const exportResult = await exportProjectToMp4({
    project: benchmarkCase.project,
    outputPath,
    mode: benchmarkCase.mode,
  });
  const wallClockMs = performance.now() - started;
  const outputProbe = await validateBenchmarkOutput({
    caseId: benchmarkCase.id,
    outputPath,
  });
  const speedMultiplier = computeSpeedMultiplier(outputProbe.durationSeconds, wallClockMs);
  return {
    id: benchmarkCase.id,
    label: benchmarkCase.label,
    mode: benchmarkCase.mode,
    resolution: { width: outputProbe.width, height: outputProbe.height },
    fps: outputProbe.fps,
    sourceDurationSeconds: round(benchmarkCase.sourceDurationSeconds),
    outputDurationSeconds: round(outputProbe.durationSeconds),
    wallClockMs: Math.max(1, Math.round(wallClockMs)),
    speedMultiplier: speedMultiplier === null ? null : round(speedMultiplier),
    featureMix: benchmarkCase.featureMix,
    profileRole: benchmarkCase.profileRole ?? null,
    compareTo: benchmarkCase.compareTo ?? null,
    fastPath: exportResult.fastPath ?? null,
    experimentalBackend: exportResult.experimentalBackend ?? null,
    fallback: exportResult.fallback ?? null,
    fallbackActive: exportResult.fallback?.active ?? null,
    experimentalHeadlessExportEnabled,
    headlessRenderOk: exportResult.headlessRender?.ok ?? null,
    headlessRenderReason: exportResult.headlessRender?.reason ?? null,
    headlessFrameCount: exportResult.headlessRender?.frameCount ?? null,
    headlessFrameArtifacts: exportResult.headlessRender?.frameArtifacts?.length ?? null,
    headlessWebglFrameCount: countHeadlessRendererFrames(exportResult.headlessRender, 'webgl'),
    headlessCanvas2dFrameCount: countHeadlessRendererFrames(exportResult.headlessRender, 'canvas2d'),
    headlessAudioPreserved: exportResult.audioPreserved ?? null,
    compositionSampleFrames: exportResult.compositionPlan?.frames?.map((frame) => frame.frameIndex) ?? null,
    budgetStatus: classifyBudgetStatus({
      mode: benchmarkCase.budgetMode,
      speedMultiplier,
      wallClockMs,
      budget: EXPORT_BENCHMARK_BUDGETS.short1080pDemo,
    }),
    outputPath,
    sourcePath: benchmarkCase.sourcePath ?? sourcePath,
    projectPath: benchmarkCase.projectPath ?? null,
    bytes: outputProbe.bytes,
  };
}

function countHeadlessRendererFrames(headlessRender, rendererKind) {
  const frames = headlessRender?.renderSurface?.renderResults;
  if (!Array.isArray(frames)) return null;
  return frames.filter((frame) => frame?.rendererKind === rendererKind).length;
}

function buildProfilingSummary(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const comparisons = items
    .filter((item) => item.profileRole && item.compareTo)
    .map((item) => {
      const baseline = byId.get(item.compareTo);
      if (!baseline) {
        return {
          caseId: item.id,
          profileRole: item.profileRole,
          compareTo: item.compareTo,
          deltaWallClockMs: null,
          deltaPercent: null,
          note: 'Missing comparison baseline.',
        };
      }
      const deltaWallClockMs = item.wallClockMs - baseline.wallClockMs;
      const deltaPercent = baseline.wallClockMs > 0 ? (deltaWallClockMs / baseline.wallClockMs) * 100 : null;
      return {
        caseId: item.id,
        profileRole: item.profileRole,
        compareTo: item.compareTo,
        baselineWallClockMs: baseline.wallClockMs,
        caseWallClockMs: item.wallClockMs,
        deltaWallClockMs,
        deltaPercent: round(deltaPercent),
        note: deltaWallClockMs >= 0
          ? `${item.profileRole} added ${deltaWallClockMs}ms versus ${item.compareTo}.`
          : `${item.profileRole} saved ${Math.abs(deltaWallClockMs)}ms versus ${item.compareTo}.`,
      };
    });
  return {
    encoder: process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER ?? process.env.ROUGH_CUT_STYLED_ENCODER ?? 'auto',
    referenceCaseId: 'styled-basic',
    comparisons,
    optimizationCandidates: rankOptimizationCandidates(comparisons),
    avoidOptimizations: [
      'Do not remove rounded masks, shadows, cursor subtitles, zoom sendcmd, or camera overlay globally; TASK-114 should gate any slimmer graph by project shape and preserve preview/export parity.',
      'Do not lower CRF, switch presets, or force hardware encoding as part of profiling; encoder-quality changes belong to a separate speed preset task.',
    ],
  };
}

function rankOptimizationCandidates(comparisons) {
  return comparisons
    .filter((item) => Number.isFinite(item.deltaWallClockMs) && item.deltaWallClockMs > 0)
    .sort((left, right) => right.deltaWallClockMs - left.deltaWallClockMs)
    .map((item) => ({
      profileRole: item.profileRole,
      caseId: item.caseId,
      deltaWallClockMs: item.deltaWallClockMs,
      deltaPercent: item.deltaPercent,
    }));
}

async function createRecordingProject({ mediaPath, cameraPath, durationSeconds, cursorEvents }) {
  const startedAt = new Date('2026-01-01T00:00:00.000Z');
  const stoppedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  return saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: stoppedAt.toISOString(),
    rawPath: mediaPath,
    outputPath: mediaPath,
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    fps: SOURCE_FPS,
    cursorEvents,
    camera: cameraPath
      ? {
          rawPath: cameraPath,
          outputPath: cameraPath,
          devicePath: '/dev/video-benchmark',
          width: 640,
          height: 480,
          fps: 30,
        }
      : null,
  });
}

function withPrimaryPresentation(project, patch = {}) {
  const defaults = createDefaultRecordingPresentation();
  return {
    ...project,
    assets: project.assets.map((asset, index) => index === 0
      ? {
          ...asset,
          presentation: {
            ...defaults,
            ...(asset.presentation ?? {}),
            ...patch,
            background: {
              ...defaults.background,
              ...(asset.presentation?.background ?? {}),
              ...(patch.background ?? {}),
            },
            zoom: {
              ...defaults.zoom,
              ...(asset.presentation?.zoom ?? {}),
              ...(patch.zoom ?? {}),
            },
            cursor: {
              ...defaults.cursor,
              ...(asset.presentation?.cursor ?? {}),
              ...(patch.cursor ?? {}),
            },
            camera: {
              ...defaults.camera,
              ...(asset.presentation?.camera ?? {}),
              ...(patch.camera ?? {}),
            },
          },
        }
      : asset),
  };
}

function buildRealRecordingFeatureMix(primary) {
  return [
    'real-recording',
    'styled',
    primary.cursorEvents.length > 0 ? 'cursor' : 'no-cursor',
    primary.zoomMarkers.length > 0 ? 'zoom-markers' : 'no-zoom',
    primary.camera ? 'camera-pip' : 'no-camera',
    primary.cutRanges.length > 0 ? 'cut-ranges' : 'no-cuts',
  ];
}

function trimPrimaryClip(project, { sourceIn, sourceOut }) {
  const durationFrames = sourceOut - sourceIn;
  return {
    ...project,
    composition: {
      ...project.composition,
      duration: durationFrames,
      tracks: project.composition.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip, index) => index === 0
          ? {
              ...clip,
              timelineIn: 0,
              timelineOut: durationFrames,
              sourceIn,
              sourceOut,
            }
          : clip),
      })),
    },
    timeline: project.timeline
      ? {
          ...project.timeline,
          tracks: project.timeline.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip, index) => index === 0
              ? {
                  ...clip,
                  timelineIn: 0,
                  timelineOut: durationFrames,
                  sourceIn,
                  sourceOut,
                }
              : clip),
          })),
        }
      : project.timeline,
  };
}

function buildCursorEvents({ fps, durationFrames, width, height, includeClicks }) {
  const events = [];
  for (let frame = 0; frame < durationFrames; frame += 6) {
    const t = frame / Math.max(1, durationFrames - 1);
    events.push({
      frame,
      timeMs: Math.round((frame / fps) * 1000),
      x: Math.round(120 + t * (width - 240)),
      y: Math.round(120 + Math.sin(t * Math.PI) * (height - 240)),
      type: 'move',
      button: 0,
    });
  }
  if (includeClicks) {
    for (const frame of [30, 72, 102]) {
      const timeMs = Math.round((frame / fps) * 1000);
      events.push({ frame, timeMs, x: 420 + frame * 3, y: 340, type: 'down', button: 0 });
      events.push({ frame: frame + 2, timeMs: timeMs + 66, x: 426 + frame * 3, y: 344, type: 'up', button: 0 });
    }
  }
  return events.sort((left, right) => left.frame - right.frame);
}

async function createFixtures({ sourcePath, cameraPath }) {
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    buildScreenFixtureFilter(),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    sourcePath,
  ]);
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x480:rate=30',
    '-t',
    '4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    cameraPath,
  ]);
}

function buildScreenFixtureFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const boldFont = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    `color=c=0xf6f1e8:s=${SOURCE_WIDTH}x${SOURCE_HEIGHT}:r=${SOURCE_FPS}`,
    'drawbox=x=0:y=0:w=1920:h=86:color=0x1f242d:t=fill',
    `drawtext=fontfile=${boldFont}:text='Rough Cut export benchmark':fontcolor=0xffffff:fontsize=24:x=84:y=20`,
    'drawbox=x=108:y=174:w=450:h=750:color=0x2b313d:t=fill',
    'drawbox=x=630:y=174:w=1230:h=180:color=0xffffff:t=fill',
    'drawbox=x=630:y=414:w=1230:h=510:color=0xffffff:t=fill',
    'drawbox=x=684:y=477:w=450:h=300:color=0x4d7db3:t=fill',
    'drawbox=x=1224:y=498:w=480:h=54:color=0x1f242d:t=fill',
    'drawbox=x=1224:y=606:w=390:h=30:color=0xa9b4c2:t=fill',
    'drawbox=x=1224:y=672:w=450:h=30:color=0xa9b4c2:t=fill',
    'drawbox=x=1224:y=768:w=285:h=78:color=0xe46b4e:t=fill',
    `drawtext=fontfile=${font}:text='Representative 1080p source':fontcolor=0x384150:fontsize=28:x=684:y=237`,
  ].join(',');
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function printSummary(report, path) {
  console.info(`\nExport benchmark wrote ${path}`);
  console.info('Case                         Mode      Duration  Wall ms  Speed  Budget');
  for (const item of report.cases) {
    console.info([
      item.id.padEnd(28),
      item.mode.padEnd(9),
      String(item.outputDurationSeconds).padStart(8),
      String(item.wallClockMs).padStart(8),
      `${item.speedMultiplier ?? 'n/a'}x`.padStart(7),
      item.budgetStatus,
    ].join('  '));
  }
  if (report.profiling?.comparisons?.length) {
    console.info('\nProfiling deltas');
    for (const item of report.profiling.comparisons) {
      const delta = item.deltaWallClockMs === null
        ? 'n/a'
        : `${item.deltaWallClockMs >= 0 ? '+' : ''}${item.deltaWallClockMs}ms`;
      console.info(`${item.profileRole.padEnd(20)} ${delta.padStart(8)} vs ${item.compareTo}`);
    }
  }
  console.info(`\nArtifacts root: ${report.root}`);
}
