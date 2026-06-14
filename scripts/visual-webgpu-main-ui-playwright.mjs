import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, parse } from 'node:path';
import { homedir } from 'node:os';

const defaultRealProjects = [
  {
    path: join(homedir(), 'Documents/Rough Cut MVP/recordings/rough-cut-2026-06-02T15-49-33-067Z.roughcut'),
    seekSec: '77',
    motionBlurSeekSec: '86',
  },
  {
    path: join(homedir(), 'Documents/Rough Cut MVP/recordings/herdr_1.roughcut'),
    seekSec: '4',
  },
].filter((item) => Boolean(item.path));

const explicitProjectPath = process.env.ROUGH_CUT_WEBGPU_MAIN_UI_PROJECT_PATH
  || process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH
  || '';
const forceGeneratedStress = process.env.ROUGH_CUT_WEBGPU_MAIN_UI_GENERATED_STRESS === '1';
const runAllRealProjects = !explicitProjectPath && process.env.ROUGH_CUT_WEBGPU_MAIN_UI_ALL_REAL_PROJECTS === '1';
const availableRealProjects = defaultRealProjects.filter((candidate) => existsSync(candidate.path));
const defaultRealProject = availableRealProjects[0] ?? null;
const runProjects = forceGeneratedStress
  ? []
  : runAllRealProjects && availableRealProjects.length > 0
  ? availableRealProjects
  : [explicitProjectPath ? { path: explicitProjectPath } : defaultRealProject].filter(Boolean);
const generatedStressFixture = forceGeneratedStress || runProjects.length === 0;
const expectMotionBlur = process.env.ROUGH_CUT_EXPECT_WEBGPU_MOTION_BLUR === '1'
  || process.env.ROUGH_CUT_WEBGPU_MAIN_UI_MOTION_BLUR === '1'
  || generatedStressFixture;
const runFallbackMatrix = process.env.ROUGH_CUT_WEBGPU_MAIN_UI_FALLBACK_MATRIX === '1';
const runDefaultCandidate = !runFallbackMatrix && process.env.ROUGH_CUT_WEBGPU_MAIN_UI_DEFAULT_CANDIDATE === '1';
const explicitExpectedRenderer = process.env.ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER || '';
const useAppDefault = !runFallbackMatrix
  && !explicitExpectedRenderer
  && process.env.ROUGH_CUT_WEBGPU_MAIN_UI_FORCE_AUTO_SELECTOR !== '1';
const rendererKinds = runFallbackMatrix
  ? ['webgpu', 'webgl', 'canvas2d']
  : [explicitExpectedRenderer || 'webgpu'];

const projectRuns = generatedStressFixture ? [{ project: null, projectIndex: 0 }] : runProjects.map((project, projectIndex) => ({ project, projectIndex }));
const runs = projectRuns.flatMap((projectRun) => rendererKinds.map((rendererKind, rendererIndex) => ({
  ...projectRun,
  rendererKind,
  rendererIndex,
  index: projectRun.projectIndex * rendererKinds.length + rendererIndex,
})));
const preflightResult = preflightWebGpuCapability(runs);
if (preflightResult?.error) {
  throw preflightResult.error;
}
if (preflightResult && (preflightResult.status ?? 1) !== 0) {
  process.exit(preflightResult.status ?? 1);
}

for (const run of runs) {
  const result = runPlaybackTimeline(run);
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPlaybackTimeline(run) {
  const { project, rendererKind, index } = run;
  const projectPath = project?.path ?? '';
  const defaultSeekSec = explicitProjectPath
    ? ''
    : expectMotionBlur && project?.motionBlurSeekSec
      ? project.motionBlurSeekSec
      : project?.seekSec ?? '';
  const defaultPlaybackView = process.env.ROUGH_CUT_PLAYBACK_VIEW
    || (!explicitProjectPath && expectMotionBlur && project?.motionBlurView ? project.motionBlurView : '');
  const env = {
    ...process.env,
    ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER: rendererKind,
    ROUGH_CUT_PLAYBACK_SEEK_SEC: process.env.ROUGH_CUT_PLAYBACK_SEEK_SEC || defaultSeekSec,
    ROUGH_CUT_PLAYBACK_VIEW: defaultPlaybackView,
    ROUGH_CUT_PLAYBACK_ADVANCE_SEC: process.env.ROUGH_CUT_PLAYBACK_ADVANCE_SEC || fallbackMatrixAdvanceSec(rendererKind),
    ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY: process.env.ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY || fallbackMatrixCorrectnessOnly(rendererKind),
    ROUGH_CUT_PLAYBACK_SCREENSHOT_PATH: process.env.ROUGH_CUT_PLAYBACK_SCREENSHOT_PATH || screenshotPathTemplate(run),
  };
  applyRendererSelectionEnv(env, rendererKind);

  if (projectPath) {
    env.ROUGH_CUT_PLAYBACK_PROJECT_PATH = projectPath;
  } else {
    env.ROUGH_CUT_PLAYBACK_STRESS = '1';
  }

  if (expectMotionBlur) {
    env.ROUGH_CUT_EXPECT_WEBGPU_MOTION_BLUR = '1';
  }

  console.info(JSON.stringify({
    command: 'visual:webgpu-main-ui',
    run: index + 1,
    runCount: runs.length,
    rendererKind,
    fallbackMatrix: runFallbackMatrix,
    defaultCandidate: runDefaultCandidate,
    appDefault: useAppDefault,
    projectPath: projectPath || null,
    generatedStressFixture,
    expectMotionBlur,
    seekSec: env.ROUGH_CUT_PLAYBACK_SEEK_SEC || null,
    playbackView: env.ROUGH_CUT_PLAYBACK_VIEW || 'both',
    rendererExpectation: env.ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER,
    screenshotPath: env.ROUGH_CUT_PLAYBACK_SCREENSHOT_PATH,
  }, null, 2));

  return spawnSync('pnpm', ['playback:timeline'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });
}

function applyRendererSelectionEnv(env, rendererKind) {
  if (runFallbackMatrix) {
    env.ROUGH_CUT_SCREEN_LAYER_RENDERER = rendererKind;
    env.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER = rendererKind;
    return;
  }
  if (useAppDefault || runDefaultCandidate || process.env.ROUGH_CUT_WEBGPU_MAIN_UI_USE_APP_DEFAULT === '1') {
    delete env.ROUGH_CUT_SCREEN_LAYER_RENDERER;
    delete env.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER;
    delete env.ROUGH_CUT_WEBGPU_SCREEN_LAYER;
    delete env.VITE_ROUGH_CUT_WEBGPU_SCREEN_LAYER;
    delete env.ROUGH_CUT_WEBGL_SCREEN_LAYER;
    delete env.VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER;
    delete env.ROUGH_CUT_WEBGPU_PREVIEW_FLAGS;
    delete env.VITE_ROUGH_CUT_WEBGPU_PREVIEW_FLAGS;
    delete env.ROUGH_CUT_DISABLE_WEBGPU_DEFAULT;
    delete env.VITE_ROUGH_CUT_DISABLE_WEBGPU_DEFAULT;
    return;
  }
  const selectedRenderer = process.env.ROUGH_CUT_WEBGPU_MAIN_UI_FORCE_AUTO_SELECTOR === '1' ? 'auto' : rendererKind;
  env.ROUGH_CUT_SCREEN_LAYER_RENDERER = env.ROUGH_CUT_SCREEN_LAYER_RENDERER || selectedRenderer;
  env.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER = env.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER || selectedRenderer;
}

function fallbackMatrixAdvanceSec(rendererKind) {
  if (runFallbackMatrix && rendererKind === 'canvas2d') return '0.5';
  return '2';
}

function fallbackMatrixCorrectnessOnly(rendererKind) {
  if (runFallbackMatrix && (rendererKind === 'webgl' || rendererKind === 'canvas2d')) return '1';
  return '';
}

function screenshotPathTemplate(run) {
  if (
    runFallbackMatrix
    && run.rendererKind !== 'webgpu'
    && process.env.ROUGH_CUT_WEBGPU_MAIN_UI_FALLBACK_SCREENSHOTS !== '1'
  ) {
    return '';
  }
  const rendererSegment = runFallbackMatrix ? `${run.rendererKind}-` : '';
  if (!runAllRealProjects) return `/tmp/rough-cut-webgpu-main-ui-${rendererSegment}{view}-{state}.png`;
  return `/tmp/rough-cut-webgpu-main-ui-${rendererSegment}real-${run.projectIndex + 1}-{view}-{state}.png`;
}

function preflightWebGpuCapability(runsToProbe) {
  if (process.env.ROUGH_CUT_WEBGPU_MAIN_UI_SKIP_PROBE === '1') return null;
  const expectsWebGPU = runsToProbe.some((run) => run.rendererKind === 'webgpu');
  if (!expectsWebGPU) return null;
  const videoPath = process.env.ROUGH_CUT_WEBGPU_PROBE_VIDEO || firstProbeVideoPath(runsToProbe);
  if (!videoPath) {
    console.info(JSON.stringify({
      command: 'visual:webgpu-main-ui',
      preflight: 'webgpu-capability',
      skipped: true,
      reason: 'no-real-probe-video',
    }, null, 2));
    return null;
  }

  console.info(JSON.stringify({
    command: 'visual:webgpu-main-ui',
    preflight: 'webgpu-capability',
    videoPath,
  }, null, 2));

  return spawnSync('pnpm', ['probe:webgpu'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ROUGH_CUT_WEBGPU_PROBE_VIDEO: videoPath,
      ROUGH_CUT_WEBGPU_PROBE_ENABLE_FLAGS: process.env.ROUGH_CUT_WEBGPU_PROBE_ENABLE_FLAGS || '1',
    },
    stdio: 'inherit',
  });
}

function firstProbeVideoPath(runsToProbe) {
  for (const run of runsToProbe) {
    const projectPath = run.project?.path;
    if (!projectPath) continue;
    const siblingMp4Path = siblingMp4ForProject(projectPath);
    if (siblingMp4Path && existsSync(siblingMp4Path)) return siblingMp4Path;
  }
  return '';
}

function siblingMp4ForProject(projectPath) {
  const parsed = parse(projectPath);
  if (parsed.ext !== '.roughcut') return '';
  return join(dirname(projectPath), `${parsed.name}.mp4`);
}
