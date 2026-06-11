import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const benchmarkSource = readFileSync(join(root, 'scripts/benchmark-export.mjs'), 'utf8');
const packageLinuxSource = readFileSync(join(root, 'scripts/package-linux.mjs'), 'utf8');
const desktopMainSource = readFileSync(join(root, 'apps/desktop/src/main/index.mjs'), 'utf8');
const gpuCompositorProbeSource = readFileSync(join(root, 'scripts/visual-gpu-compositor-parity-playwright.mjs'), 'utf8');
const experimentalHeadlessExportSmokeSource = readFileSync(join(root, 'scripts/smoke-experimental-headless-export.mjs'), 'utf8');
const masterPlanSource = readFileSync(join(root, 'MASTER_PLAN.md'), 'utf8');
const compositorMigrationPath = join(root, 'docs/architecture/compositor-migration.md');

test('root test command runs repo-level script regression tests', () => {
  assert.match(rootPackage.scripts.test, /node --test scripts\/repo-regression\.test\.mjs scripts\/export-benchmark-utils\.test\.mjs/);
});

test('stale root handoff files stay removed', () => {
  assert.equal(existsSync(join(root, 'DROPOFF.md')), false);
  assert.equal(existsSync(join(root, 'HANDOFF.md')), false);
  assert.equal(existsSync(join(root, 'NEXT_SESSION_PROMPT.md')), false);
});

test('export benchmark keeps profiling and fast-path report coverage', () => {
  for (const caseId of [
    'profile-cursor-move-only',
    'profile-shadow-off',
    'profile-square-no-shadow',
    'profile-cut-ranges',
  ]) {
    assert.match(benchmarkSource, new RegExp(`id: '${caseId}'`));
  }
  assert.match(benchmarkSource, /fastPath: exportResult\.fastPath \?\? null/);
  assert.match(benchmarkSource, /profiling: buildProfilingSummary\(results\)/);
  assert.match(benchmarkSource, /optimizationCandidates: rankOptimizationCandidates\(comparisons\)/);
  assert.match(benchmarkSource, /compareTo: 'styled-basic'/);
});

test('linux package copies main-process workspace dependencies', () => {
  for (const packageName of [
    'project-model',
    'timeline-engine',
    'effect-registry',
    'frame-resolver',
  ]) {
    assert.match(packageLinuxSource, new RegExp(`'${packageName}'`));
  }
  assert.match(packageLinuxSource, /cpWorkspacePackage\(packageName\)/);
  assert.match(packageLinuxSource, /join\(appRoot, 'packages', packageName, 'dist'\)/);
});

test('GPU-C compositor migration note and task sequence stay in place', () => {
  assert.equal(existsSync(compositorMigrationPath), true);
  const note = readFileSync(compositorMigrationPath, 'utf8');
  for (const sourcePath of [
    'apps/desktop/src/renderer/src/styled-video-preview.tsx',
    'apps/desktop/src/main/export-service.mjs',
    'apps/desktop/src/main/zoom-sendcmd.mjs',
  ]) {
    assert.match(note, new RegExp(sourcePath.replaceAll('/', '\\/')));
  }
  for (const phrase of [
    'Canvas2D preview',
    'FFmpeg styled export',
    'Runtime Fallback Policy',
    'rendererKind',
    'contextStatus',
    'drawCostMs',
    'reportPath',
    'fallback',
  ]) {
    assert.match(note, new RegExp(phrase));
  }
  for (let taskId = 239; taskId <= 247; taskId += 1) {
    assert.match(masterPlanSource, new RegExp(`TASK-${taskId}`));
    assert.match(note, new RegExp(`TASK-${taskId}`));
  }
  assert.match(
    masterPlanSource,
    /Sequence: TASK-239, TASK-240, TASK-241, TASK-242, TASK-243, TASK-244, TASK-245, TASK-246, TASK-247/,
  );
});

test('GPU-C WebGL preview flag is forwarded to the renderer as a runtime query param', () => {
  assert.match(desktopMainSource, /function webglScreenLayerEnabled\(\)/);
  assert.match(desktopMainSource, /ROUGH_CUT_WEBGL_SCREEN_LAYER === '1' \|\| process\.env\.VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER === '1'/);
  assert.match(desktopMainSource, /function webglMotionBlurEnabled\(\)/);
  assert.match(desktopMainSource, /ROUGH_CUT_WEBGL_MOTION_BLUR === '1' \|\| process\.env\.VITE_ROUGH_CUT_WEBGL_MOTION_BLUR === '1'/);
  assert.match(desktopMainSource, /function applyRendererFeatureFlags\(params\)/);
  assert.match(desktopMainSource, /params\.set\('screenLayerRenderer', 'webgl'\)/);
  assert.match(desktopMainSource, /params\.set\('webglMotionBlur', '1'\)/);
  assert.match(desktopMainSource, /applyRendererFeatureFlags\(url\.searchParams\)/);
});

test('GPU-C compositor parity probe stays wired as a visual evidence command', () => {
  assert.match(rootPackage.scripts['visual:gpu-compositor'], /visual-gpu-compositor-parity-playwright\.mjs/);
  assert.match(gpuCompositorProbeSource, /rough-cut-gpu-compositor-/);
  assert.match(gpuCompositorProbeSource, /rough-cut-gpu-compositor-latest\.log/);
  assert.match(gpuCompositorProbeSource, /gpu-compositor\.log/);
  assert.match(gpuCompositorProbeSource, /ROUGH_CUT_GPU_COMPOSITOR_FORCE_BLANK/);
  assert.match(gpuCompositorProbeSource, /requestedRendererKind/);
  assert.match(gpuCompositorProbeSource, /meanAbsDiff/);
  assert.match(gpuCompositorProbeSource, /changedPixelRatio/);
  for (const caseId of ['gap-start', 'cut-boundary', 'zoom-in', 'zoom-hold-cursor-visible', 'zoom-out-cursor-offscreen', 'camera-pip-present']) {
    assert.match(gpuCompositorProbeSource, new RegExp(`id: '${caseId}'`));
  }
});

test('GPU-C experimental headless export smoke stays explicit and fallback-backed', () => {
  assert.match(rootPackage.scripts['smoke:experimental-headless-export'], /smoke-experimental-headless-export\.mjs/);
  assert.match(experimentalHeadlessExportSmokeSource, /mode: 'experimental-headless'/);
  assert.match(experimentalHeadlessExportSmokeSource, /fallback\?\.to !== 'ffmpeg-styled'/);
  assert.match(experimentalHeadlessExportSmokeSource, /experimental-headless-export-plan/);
  assert.match(experimentalHeadlessExportSmokeSource, /sampledFrames/);
  assert.match(experimentalHeadlessExportSmokeSource, /styled-baseline\.mp4/);
  assert.match(experimentalHeadlessExportSmokeSource, /compareRepresentativeFrames/);
  assert.match(experimentalHeadlessExportSmokeSource, /frameComparisons/);
});
