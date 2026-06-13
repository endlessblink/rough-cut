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
const webgpuMainUiProbeSource = readFileSync(join(root, 'scripts/visual-webgpu-main-ui-playwright.mjs'), 'utf8');
const gpuPlaywrightLockSource = readFileSync(join(root, 'scripts/gpu-playwright-lock.mjs'), 'utf8');
const webgpuCapabilityProbeSource = readFileSync(join(root, 'scripts/probe-webgpu-capability.mjs'), 'utf8');
const webgpuPreviewReadinessSource = readFileSync(join(root, 'scripts/verify-webgpu-preview-readiness.mjs'), 'utf8');
const experimentalHeadlessExportSmokeSource = readFileSync(join(root, 'scripts/smoke-experimental-headless-export.mjs'), 'utf8');
const experimentalHeadlessRuntimeExportSmokeSource = readFileSync(join(root, 'scripts/smoke-experimental-headless-runtime-export.mjs'), 'utf8');
const smokeUiSource = readFileSync(join(root, 'scripts/smoke-ui.mjs'), 'utf8');
const desktopPackage = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'));
const headlessExportRendererSource = readFileSync(join(root, 'apps/desktop/src/main/headless-export-renderer.mjs'), 'utf8');
const headlessExportRendererTestSource = readFileSync(join(root, 'apps/desktop/src/main/headless-export-renderer.test.mjs'), 'utf8');
const exportServiceSource = readFileSync(join(root, 'apps/desktop/src/main/export-service.mjs'), 'utf8');
const exportServiceTestSource = readFileSync(join(root, 'apps/desktop/src/main/export-service.test.mjs'), 'utf8');
const masterPlanSource = readFileSync(join(root, 'MASTER_PLAN.md'), 'utf8');
const screenLayerRendererCapabilitiesSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/screen-layer-renderer-capabilities.ts'), 'utf8');
const screenLayerRendererSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/screen-layer-renderer.ts'), 'utf8');
const styledVideoPreviewSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/styled-video-preview.tsx'), 'utf8');
const rendererMainSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/main.tsx'), 'utf8');
const playbackTimelineSource = readFileSync(join(root, 'scripts/playback-timeline-playwright.mjs'), 'utf8');
const visualNleClipsSource = readFileSync(join(root, 'scripts/visual-nle-clips-playwright.mjs'), 'utf8');
const visualNleLinkedClipsSource = readFileSync(join(root, 'scripts/visual-nle-linked-clips-playwright.mjs'), 'utf8');
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
  assert.match(benchmarkSource, /id: 'experimental-headless-zooms-cursor'/);
  assert.match(benchmarkSource, /mode: 'experimental-headless'/);
  assert.match(benchmarkSource, /experimentalBackend: exportResult\.experimentalBackend \?\? null/);
  assert.match(benchmarkSource, /fallback: exportResult\.fallback \?\? null/);
  assert.match(benchmarkSource, /fallbackActive: exportResult\.fallback\?\.active \?\? null/);
  assert.match(benchmarkSource, /headlessRenderOk: exportResult\.headlessRender\?\.ok \?\? null/);
  assert.match(benchmarkSource, /headlessFrameArtifacts: exportResult\.headlessRender\?\.frameArtifacts\?\.length \?\? null/);
  assert.match(benchmarkSource, /headlessWebglFrameCount: countHeadlessRendererFrames\(exportResult\.headlessRender, 'webgl'\)/);
  assert.match(benchmarkSource, /headlessCanvas2dFrameCount: countHeadlessRendererFrames\(exportResult\.headlessRender, 'canvas2d'\)/);
  assert.match(benchmarkSource, /function countHeadlessRendererFrames\(headlessRender, rendererKind\)/);
  assert.match(benchmarkSource, /headlessAudioPreserved: exportResult\.audioPreserved \?\? null/);
  assert.match(benchmarkSource, /const experimentalHeadlessExportEnabled = process\.env\.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT === '1'/);
  assert.match(benchmarkSource, /experimentalHeadlessExportEnabled,/);
  assert.match(benchmarkSource, /id: 'experimental-headless-full-composition'/);
  assert.match(benchmarkSource, /profileRole: 'experimental-headless-full-composition'/);
  assert.match(benchmarkSource, /featureMix: \['experimental-headless', 'background-image', 'camera-pip', 'zoom-markers', 'cursor', 'clicks'\]/);
  assert.match(benchmarkSource, /cursor: \{ style: 'spotlight', clickEffect: 'ripple', sizePercent: 115, clickSoundEnabled: false \}/);
  assert.match(benchmarkSource, /compositionSampleFrames: exportResult\.compositionPlan\?\.frames\?\.map/);
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
    'Wayland-compatible for export rendering',
    'TASK-026',
    'xdg-desktop-portal/PipeWire ScreenCast',
    'telemetry-driven cursor/click layers',
    'source-video cursor pixels',
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
  assert.match(masterPlanSource, /TASK-249/);
  assert.match(
    masterPlanSource,
    /Sequence: TASK-239, TASK-240, TASK-241, TASK-242, TASK-243, TASK-244, TASK-245, TASK-249, TASK-246, TASK-247/,
  );
});

test('GPU-C WebGL preview flag is forwarded to the renderer as a runtime query param', () => {
  assert.match(desktopMainSource, /function webglScreenLayerEnabled\(\)/);
  assert.match(desktopMainSource, /ROUGH_CUT_WEBGL_SCREEN_LAYER === '1' \|\| process\.env\.VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER === '1'/);
  assert.match(desktopMainSource, /function webglMotionBlurEnabled\(\)/);
  assert.match(desktopMainSource, /ROUGH_CUT_WEBGL_MOTION_BLUR === '1' \|\| process\.env\.VITE_ROUGH_CUT_WEBGL_MOTION_BLUR === '1'/);
  assert.match(desktopMainSource, /function experimentalHeadlessExportUiEnabled\(\)/);
  assert.match(desktopMainSource, /ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1' \|\| process\.env\.VITE_ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1'/);
  assert.match(desktopMainSource, /function applyRendererFeatureFlags\(params\)/);
  assert.match(desktopMainSource, /params\.set\('screenLayerRenderer', 'webgl'\)/);
  assert.match(desktopMainSource, /params\.set\('webglMotionBlur', '1'\)/);
  assert.match(desktopMainSource, /params\.set\('experimentalHeadlessExportUi', '1'\)/);
  assert.match(desktopMainSource, /applyRendererFeatureFlags\(url\.searchParams\)/);
});

test('GPU-C compositor parity probe stays wired as a visual evidence command', () => {
  assert.match(rootPackage.scripts['visual:gpu-compositor'], /visual-gpu-compositor-parity-playwright\.mjs/);
  assert.match(gpuCompositorProbeSource, /rough-cut-gpu-compositor-/);
  assert.match(gpuCompositorProbeSource, /rough-cut-gpu-compositor-latest\.log/);
  assert.match(gpuCompositorProbeSource, /gpu-compositor\.log/);
  assert.match(gpuCompositorProbeSource, /ROUGH_CUT_GPU_COMPOSITOR_FORCE_BLANK/);
  assert.match(gpuCompositorProbeSource, /ROUGH_CUT_WEBGPU_SCREEN_LAYER/);
  assert.match(gpuCompositorProbeSource, /VITE_ROUGH_CUT_WEBGPU_SCREEN_LAYER/);
  assert.match(gpuCompositorProbeSource, /requestedRendererKind/);
  assert.match(gpuCompositorProbeSource, /meanAbsDiff/);
  assert.match(gpuCompositorProbeSource, /changedPixelRatio/);
  assert.match(gpuCompositorProbeSource, /compareCase\(item, 'webgl', 'webgpu'/);
  assert.match(gpuCompositorProbeSource, /styledPreviewAcceleratedCanvas\.isActive, canvas\.styledPreviewWebglCanvas\.isActive/);
  assert.match(gpuCompositorProbeSource, /readScreenshotPixels/);
  assert.match(gpuCompositorProbeSource, /rgba:-/);
  for (const caseId of ['gap-start', 'cut-boundary', 'zoom-in', 'zoom-hold-cursor-visible', 'zoom-out-cursor-offscreen', 'camera-pip-present']) {
    assert.match(gpuCompositorProbeSource, new RegExp(`id: '${caseId}'`));
  }
});

test('GPU-C WebGPU main UI playback probe stays wired as a real-preview evidence command', () => {
  assert.match(rootPackage.scripts['visual:webgpu-main-ui'], /visual-webgpu-main-ui-playwright\.mjs/);
  assert.match(rootPackage.scripts['visual:webgpu-fallback-matrix'], /ROUGH_CUT_WEBGPU_MAIN_UI_FALLBACK_MATRIX=1 pnpm visual:webgpu-main-ui/);
  assert.match(rootPackage.scripts['verify:webgpu-preview'], /verify-webgpu-preview-readiness\.mjs/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_PROJECT_PATH/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_PLAYBACK_PROJECT_PATH/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_ALL_REAL_PROJECTS/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_FALLBACK_MATRIX/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_DEFAULT_CANDIDATE/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_USE_APP_DEFAULT/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_FORCE_AUTO_SELECTOR/);
  assert.match(webgpuMainUiProbeSource, /const explicitExpectedRenderer = process\.env\.ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER \|\| ''/);
  assert.match(webgpuMainUiProbeSource, /const useAppDefault = !runFallbackMatrix/);
  assert.match(webgpuMainUiProbeSource, /\['webgpu', 'webgl', 'canvas2d'\]/);
  assert.match(webgpuMainUiProbeSource, /\[explicitExpectedRenderer \|\| 'webgpu'\]/);
  assert.match(webgpuMainUiProbeSource, /projectRuns\.flatMap/);
  assert.match(webgpuMainUiProbeSource, /rendererKind/);
  assert.match(webgpuMainUiProbeSource, /fallbackMatrix: runFallbackMatrix/);
  assert.match(webgpuMainUiProbeSource, /defaultCandidate: runDefaultCandidate/);
  assert.match(webgpuMainUiProbeSource, /appDefault: useAppDefault/);
  assert.match(webgpuMainUiProbeSource, /Documents\/Rough Cut MVP\/recordings/);
  assert.match(webgpuMainUiProbeSource, /availableRealProjects = defaultRealProjects\.filter/);
  assert.match(webgpuMainUiProbeSource, /seekSec: '77'/);
  assert.match(webgpuMainUiProbeSource, /motionBlurSeekSec: '86'/);
  assert.doesNotMatch(webgpuMainUiProbeSource, /motionBlurView: 'nle'/);
  assert.match(webgpuMainUiProbeSource, /seekSec: '4'/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_PLAYBACK_SEEK_SEC: process\.env\.ROUGH_CUT_PLAYBACK_SEEK_SEC \|\| defaultSeekSec/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_PLAYBACK_VIEW: defaultPlaybackView/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_PLAYBACK_ADVANCE_SEC: process\.env\.ROUGH_CUT_PLAYBACK_ADVANCE_SEC \|\| fallbackMatrixAdvanceSec\(rendererKind\)/);
  assert.match(webgpuMainUiProbeSource, /function fallbackMatrixAdvanceSec\(rendererKind\)/);
  assert.match(webgpuMainUiProbeSource, /runFallbackMatrix && rendererKind === 'canvas2d'/);
  assert.match(webgpuMainUiProbeSource, /return '0\.5'/);
  assert.match(webgpuMainUiProbeSource, /return '2'/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY: process\.env\.ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY \|\| fallbackMatrixCorrectnessOnly\(rendererKind\)/);
  assert.match(webgpuMainUiProbeSource, /function fallbackMatrixCorrectnessOnly\(rendererKind\)/);
  assert.match(webgpuMainUiProbeSource, /if \(runFallbackMatrix && rendererKind === 'canvas2d'\) return '1'/);
  assert.match(webgpuMainUiProbeSource, /playbackView: env\.ROUGH_CUT_PLAYBACK_VIEW \|\| 'both'/);
  assert.match(webgpuMainUiProbeSource, /run: index \+ 1/);
  assert.match(webgpuMainUiProbeSource, /runCount: runs\.length/);
  assert.match(webgpuMainUiProbeSource, /generatedStressFixture = runProjects\.length === 0/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_PLAYBACK_STRESS = '1'/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER: rendererKind/);
  assert.match(webgpuMainUiProbeSource, /applyRendererSelectionEnv\(env, rendererKind\)/);
  assert.match(webgpuMainUiProbeSource, /function applyRendererSelectionEnv\(env, rendererKind\)/);
  assert.match(webgpuMainUiProbeSource, /env\.ROUGH_CUT_SCREEN_LAYER_RENDERER = rendererKind/);
  assert.match(webgpuMainUiProbeSource, /delete env\.ROUGH_CUT_SCREEN_LAYER_RENDERER/);
  assert.match(webgpuMainUiProbeSource, /delete env\.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER/);
  assert.match(webgpuMainUiProbeSource, /delete env\.ROUGH_CUT_WEBGPU_PREVIEW_FLAGS/);
  assert.match(webgpuMainUiProbeSource, /delete env\.VITE_ROUGH_CUT_WEBGPU_PREVIEW_FLAGS/);
  assert.match(webgpuMainUiProbeSource, /delete env\.ROUGH_CUT_DISABLE_WEBGPU_DEFAULT/);
  assert.match(webgpuMainUiProbeSource, /const selectedRenderer = process\.env\.ROUGH_CUT_WEBGPU_MAIN_UI_FORCE_AUTO_SELECTOR === '1' \? 'auto' : rendererKind/);
  assert.match(webgpuMainUiProbeSource, /env\.ROUGH_CUT_SCREEN_LAYER_RENDERER = env\.ROUGH_CUT_SCREEN_LAYER_RENDERER \|\| selectedRenderer/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_EXPECT_WEBGPU_MOTION_BLUR/);
  assert.match(webgpuMainUiProbeSource, /rough-cut-webgpu-main-ui-\$\{rendererSegment\}\{view\}-\{state\}\.png/);
  assert.match(webgpuMainUiProbeSource, /rough-cut-webgpu-main-ui-\$\{rendererSegment\}real-\$\{run\.projectIndex \+ 1\}-\{view\}-\{state\}\.png/);
  assert.match(webgpuMainUiProbeSource, /spawnSync\('pnpm', \['playback:timeline'\]/);
  assert.match(webgpuMainUiProbeSource, /preflightWebGpuCapability\(runs\)/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_MAIN_UI_SKIP_PROBE/);
  assert.match(webgpuMainUiProbeSource, /runsToProbe\.some\(\(run\) => run\.rendererKind === 'webgpu'\)/);
  assert.match(webgpuMainUiProbeSource, /if \(!expectsWebGPU\) return null/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_PROBE_VIDEO/);
  assert.match(webgpuMainUiProbeSource, /firstProbeVideoPath\(runsToProbe\)/);
  assert.match(webgpuMainUiProbeSource, /siblingMp4ForProject\(projectPath\)/);
  assert.match(webgpuMainUiProbeSource, /ROUGH_CUT_WEBGPU_PROBE_ENABLE_FLAGS/);
  assert.match(webgpuMainUiProbeSource, /spawnSync\('pnpm', \['probe:webgpu'\]/);
});

test('GPU-C plain dev startup stays WebGPU-first while preserving explicit fallback selectors', () => {
  assert.match(rootPackage.scripts.dev, /pnpm --filter @rough-cut\/desktop dev/);
  assert.match(desktopPackage.scripts.dev, /node scripts\/electron-dev\.mjs/);
  assert.match(desktopMainSource, /function webgpuPreviewDefaultEnabled\(\)/);
  assert.match(desktopMainSource, /!webgpuPreviewDefaultDisabled\(\)/);
  assert.match(desktopMainSource, /!screenLayerRendererSelection\(\)/);
  assert.match(desktopMainSource, /!webglScreenLayerEnabled\(\)/);
  assert.match(desktopMainSource, /!webgpuScreenLayerEnabled\(\)/);
  assert.match(desktopMainSource, /webgpuPreviewDefaultEnabled\(\) \|\|/);
  assert.match(desktopMainSource, /app\.commandLine\.appendSwitch\('enable-unsafe-webgpu'\)/);
  assert.match(desktopMainSource, /app\.commandLine\.appendSwitch\('enable-zero-copy'\)/);
  assert.match(desktopMainSource, /AcceleratedVideoDecodeLinuxZeroCopyGL/);
  assert.match(desktopMainSource, /VaapiVideoDecoder/);
  assert.match(desktopMainSource, /if \(webgpuPreviewDefaultEnabled\(\)\) params\.set\('screenLayerRenderer', 'auto'\)/);
  assert.match(desktopMainSource, /if \(renderer\) params\.set\('screenLayerRenderer', renderer\)/);
  assert.match(desktopMainSource, /if \(webglScreenLayerEnabled\(\)\) params\.set\('screenLayerRenderer', 'webgl'\)/);
  assert.match(desktopMainSource, /if \(webgpuScreenLayerEnabled\(\)\) params\.set\('screenLayerRenderer', 'webgpu'\)/);
  assert.match(styledVideoPreviewSource, /if \(normalized === 'auto'\) return resolveAutoScreenLayerRendererKind\(\)/);
  assert.match(styledVideoPreviewSource, /if \('gpu' in navigator\) return 'webgpu'/);
  assert.match(styledVideoPreviewSource, /if \(env\.ROUGH_CUT_DISABLE_WEBGPU_DEFAULT === '1' \|\| env\.VITE_ROUGH_CUT_DISABLE_WEBGPU_DEFAULT === '1'\) return 'canvas2d'/);
});

test('GPU-C WebGPU preview readiness gate covers default, blur, parity, and fallback phases', () => {
  assert.match(webgpuPreviewReadinessSource, /id: 'app-default'/);
  assert.match(webgpuPreviewReadinessSource, /id: 'motion-blur'/);
  assert.match(webgpuPreviewReadinessSource, /ROUGH_CUT_WEBGPU_MAIN_UI_MOTION_BLUR: '1'/);
  assert.match(webgpuPreviewReadinessSource, /id: 'compositor-parity'/);
  assert.match(webgpuPreviewReadinessSource, /\['pnpm', 'visual:gpu-compositor'\]/);
  assert.match(webgpuPreviewReadinessSource, /id: 'fallback-matrix'/);
  assert.match(webgpuPreviewReadinessSource, /\['pnpm', 'visual:webgpu-fallback-matrix'\]/);
  assert.match(webgpuPreviewReadinessSource, /ROUGH_CUT_WEBGPU_READINESS_ALL_REAL_PROJECTS/);
  assert.match(webgpuPreviewReadinessSource, /ROUGH_CUT_WEBGPU_MAIN_UI_ALL_REAL_PROJECTS: '1'/);
  assert.match(webgpuPreviewReadinessSource, /command: 'verify:webgpu-preview'/);
  assert.match(webgpuPreviewReadinessSource, /phases: results/);
});

test('Recording edit preview trim spans all recording clips, not only the first clip', () => {
  assert.match(rendererMainSource, /const recordingEditModel = selectRecordingEditModel/);
  assert.match(rendererMainSource, /resolveRecordingEditTrimInfo\(recordingEditModel\.trimInfo/);
  assert.match(rendererMainSource, /function resolveRecordingEditTrimInfo/);
  assert.doesNotMatch(rendererMainSource, /getPrimaryRecordingClip/);
  assert.doesNotMatch(rendererMainSource, /resolveTrimInfo\(primaryClip/);
});

test('GPU-C WebGPU capability probe is timeout-safe and report-backed', () => {
  assert.match(rootPackage.scripts['probe:webgpu'], /probe-webgpu-capability\.mjs/);
  assert.match(webgpuCapabilityProbeSource, /ROUGH_CUT_WEBGPU_PROBE_TIMEOUT_MS/);
  assert.match(webgpuCapabilityProbeSource, /ROUGH_CUT_WEBGPU_PROBE_STEP_TIMEOUT_MS/);
  assert.match(webgpuCapabilityProbeSource, /probe-process-timeout/);
  assert.match(webgpuCapabilityProbeSource, /ROUGH_CUT_WEBGPU_PROBE_VIDEO/);
  assert.match(webgpuCapabilityProbeSource, /navigator\.gpu/);
  assert.match(webgpuCapabilityProbeSource, /requestAdapter/);
  assert.match(webgpuCapabilityProbeSource, /requestDevice/);
  assert.match(webgpuCapabilityProbeSource, /importExternalTexture/);
  assert.match(webgpuCapabilityProbeSource, /VideoFrame/);
  assert.match(webgpuCapabilityProbeSource, /result\.ok = true/);
  assert.match(webgpuCapabilityProbeSource, /rough-cut-webgpu-probe-latest\.json/);
});

test('GPU-C renderer capability ladder keeps WebGPU opt-in and fallback-safe', () => {
  assert.match(desktopPackage.scripts.test, /src\/renderer\/src\/screen-layer-renderer-capabilities\.test\.mjs/);
  assert.match(screenLayerRendererCapabilitiesSource, /'webgpu-external-texture'/);
  assert.match(screenLayerRendererCapabilitiesSource, /'webgl2-videoframe'/);
  assert.match(screenLayerRendererCapabilitiesSource, /'webgl'/);
  assert.match(screenLayerRendererCapabilitiesSource, /'canvas2d'/);
  assert.match(screenLayerRendererCapabilitiesSource, /webGpuExternalTextureReady/);
  assert.match(screenLayerRendererCapabilitiesSource, /importExternalTextureVideo\?\.ok \|\| steps\.importExternalTextureVideoFrame\?\.ok/);
  assert.match(screenLayerRendererCapabilitiesSource, /return 'canvas2d'/);
  assert.match(styledVideoPreviewSource, /ROUGH_CUT_SCREEN_LAYER_RENDERER/);
  assert.match(styledVideoPreviewSource, /resolveScreenLayerRendererSelection/);
  assert.match(styledVideoPreviewSource, /resolveAutoScreenLayerRendererKind/);
  assert.ok(styledVideoPreviewSource.indexOf("get('screenLayerRenderer')") < styledVideoPreviewSource.indexOf('const envRenderer = env.ROUGH_CUT_SCREEN_LAYER_RENDERER'), 'runtime screenLayerRenderer query must override baked Vite env selection');
  assert.match(styledVideoPreviewSource, /if \('gpu' in navigator\) return 'webgpu'/);
  assert.match(styledVideoPreviewSource, /ROUGH_CUT_DISABLE_WEBGPU_DEFAULT/);
  assert.match(styledVideoPreviewSource, /return resolveAutoScreenLayerRendererKind\(\)/);
  assert.match(desktopMainSource, /ROUGH_CUT_WEBGPU_SCREEN_LAYER/);
  assert.match(desktopMainSource, /ROUGH_CUT_SCREEN_LAYER_RENDERER/);
  assert.match(desktopMainSource, /screenLayerRendererSelection/);
  assert.match(desktopMainSource, /webgpuPreviewDefaultEnabled/);
  assert.match(desktopMainSource, /webgpuPreviewDefaultDisabled/);
  assert.match(desktopMainSource, /ROUGH_CUT_WEBGPU_PREVIEW_FLAGS/);
  assert.match(desktopMainSource, /ROUGH_CUT_DISABLE_WEBGPU_DEFAULT/);
  assert.match(desktopMainSource, /params\.set\('screenLayerRenderer', 'auto'\)/);
  assert.match(desktopMainSource, /renderer === 'auto'/);
  assert.match(desktopMainSource, /screenLayerRenderer', 'webgpu'/);
  assert.match(desktopMainSource, /enable-unsafe-webgpu/);
  assert.match(desktopMainSource, /enable-zero-copy/);
  assert.match(desktopMainSource, /AcceleratedVideoDecodeLinuxZeroCopyGL/);
  assert.match(desktopMainSource, /VaapiVideoDecoder/);
  assert.match(playbackTimelineSource, /webgpuRendererInstances/);
  assert.match(playbackTimelineSource, /webgpuRendererLog/);
  assert.match(playbackTimelineSource, /function webgpuLifecycleProof\(state, consoleLog = \[\], minAtMs = 0\)/);
  assert.match(playbackTimelineSource, /function webgpuBackgroundUploadProof\(before, after, consoleLog = \[\], minAtMs = 0\)/);
  assert.match(playbackTimelineSource, /background-image-texture-uploaded/);
  assert.match(playbackTimelineSource, /drawUploadCount/);
  assert.match(playbackTimelineSource, /missedDownscaleUploadCount/);
  assert.match(playbackTimelineSource, /sourceWidth > width \|\| sourceHeight > height/);
  assert.match(playbackTimelineSource, /webgpuBackgroundUploads\.ok/);
  assert.match(playbackTimelineSource, /ROUGH_CUT_PLAYBACK_SCREENSHOT_PATH/);
  assert.match(playbackTimelineSource, /function screenshotArtifactProof\(screenshotArtifacts\)/);
  assert.match(playbackTimelineSource, /async function collectScreenshotArtifacts\(pathsByState\)/);
  assert.match(playbackTimelineSource, /missingOrTinyCount/);
  assert.match(playbackTimelineSource, /screenshotProof\.ok/);
  assert.match(playbackTimelineSource, /screenshotArtifacts/);
  assert.match(playbackTimelineSource, /ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER/);
  assert.match(playbackTimelineSource, /ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY/);
  assert.match(playbackTimelineSource, /window\.__roughCutPlaybackCorrectnessOnly/);
  assert.match(playbackTimelineSource, /const correctnessOnly = Boolean/);
  assert.match(playbackTimelineSource, /correctnessOnly \|\| frameMonitorOk/);
  assert.match(playbackTimelineSource, /correctnessOnly \|\| \(after\?\.playbackDebug\?\.expectedDisplayGapCount \?\? 0\) === 0/);
  assert.match(playbackTimelineSource, /function rendererExpectationProof\(state\)/);
  assert.match(playbackTimelineSource, /rendererExpectation\.ok/);
  assert.match(playbackTimelineSource, /__roughCutPlaybackProbeStartedAtMs = performance\.now\(\)/);
  assert.match(playbackTimelineSource, /probeStartedAtMs/);
  assert.match(playbackTimelineSource, /Number\(entry\?\.atMs\) < minAtMs/);
  assert.match(playbackTimelineSource, /Number\(payload\?\.atMs\) < minAtMs/);
  assert.match(playbackTimelineSource, /activeRegistryContextCreated/);
  assert.match(playbackTimelineSource, /activeRegistryContextCreatedCount/);
  assert.match(playbackTimelineSource, /function activePlaybackDebugProof\(state\)/);
  assert.match(playbackTimelineSource, /activePlaybackDebug\.ok/);
  assert.match(playbackTimelineSource, /ROUGH_CUT_EXPECT_WEBGPU_MOTION_BLUR/);
  assert.match(playbackTimelineSource, /ROUGH_CUT_WEBGL_MOTION_BLUR: expectWebgpuMotionBlur \? '1'/);
  assert.match(playbackTimelineSource, /VITE_ROUGH_CUT_WEBGL_MOTION_BLUR: expectWebgpuMotionBlur \? '1'/);
  assert.match(playbackTimelineSource, /function webgpuMotionBlurProof\(state, consoleLog = \[\], minAtMs = 0\)/);
  assert.match(playbackTimelineSource, /webgpuMotionBlur\.ok/);
  assert.match(playbackTimelineSource, /maxMotionBlurSamples >= 3/);
  assert.match(playbackTimelineSource, /motionBlurFrameCount > 0/);
  assert.match(playbackTimelineSource, /__roughCutPlaybackActiveProbeWindow/);
  assert.match(playbackTimelineSource, /window: state\?\.activePlaybackWindow/);
  assert.match(playbackTimelineSource, /maxLongTask <= 80/);
  assert.match(playbackTimelineSource, /function readPlaybackDebug\(range = null\)/);
  assert.match(playbackTimelineSource, /filteredLog\.reduce\(\(counts, entry\)/);
  assert.match(playbackTimelineSource, /disposedContextCreatedCount/);
  assert.match(playbackTimelineSource, /staleFallbackContextCreatedCount/);
  assert.match(playbackTimelineSource, /collectWebgpuRendererEvents/);
  assert.match(playbackTimelineSource, /parseRendererConsolePayload/);
  assert.match(playbackTimelineSource, /function selectPlaybackVideoElements\(\)/);
  assert.match(playbackTimelineSource, /hiddenSource/);
  assert.match(playbackTimelineSource, /ev2MediaThumbVideo/);
  assert.match(playbackTimelineSource, /ev2SourceVideo/);
  assert.match(playbackTimelineSource, /const playbackVideos = videos\.filter\(\(video\) => playbackIndexes\.has\(video\.index\)\)/);
  assert.match(playbackTimelineSource, /video\.currentTime >= Math\.max\(0, value - 1\)/);
  assert.match(playbackTimelineSource, /video\.currentTime <= value \+ 3/);
  assert.match(gpuPlaywrightLockSource, /rough-cut-headed-gpu-playwright\.lock/);
  assert.match(gpuPlaywrightLockSource, /await mkdir\(lockDir\)/);
  assert.match(gpuPlaywrightLockSource, /ROUGH_CUT_GPU_PLAYWRIGHT_LOCK_TIMEOUT_MS/);
  assert.match(gpuPlaywrightLockSource, /ROUGH_CUT_GPU_PLAYWRIGHT_LOCK_STALE_MS/);
  assert.match(gpuPlaywrightLockSource, /Date\.now\(\) - Date\.parse\(existing\.startedAt\) > staleMs/);
  assert.match(playbackTimelineSource, /import \{ acquireGpuPlaywrightLock \} from '\.\/gpu-playwright-lock\.mjs'/);
  assert.match(playbackTimelineSource, /acquireGpuPlaywrightLock\('playback:timeline'\)/);
  assert.match(gpuCompositorProbeSource, /import \{ acquireGpuPlaywrightLock \} from '\.\/gpu-playwright-lock\.mjs'/);
  assert.match(gpuCompositorProbeSource, /acquireGpuPlaywrightLock\('visual:gpu-compositor'\)/);
  assert.match(gpuCompositorProbeSource, /ROUGH_CUT_SCREEN_LAYER_RENDERER: kind/);
  assert.match(gpuCompositorProbeSource, /VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER: kind/);
  assert.match(screenLayerRendererSource, /WEBGPU_RENDERER_LOG_PREFIX/);
  assert.match(screenLayerRendererSource, /__roughCutWebgpuRendererInstances/);
  assert.match(screenLayerRendererSource, /const atMs = typeof performance !== 'undefined' \? performance\.now\(\) : Date\.now\(\)/);
  assert.match(screenLayerRendererSource, /id: this\.id,\n      atMs,/);
  assert.match(screenLayerRendererSource, /typeof device\.importExternalTexture !== 'function'/);
  assert.match(screenLayerRendererSource, /throw new Error\('external-texture-unavailable'\)/);
  assert.ok(
    screenLayerRendererSource.indexOf("typeof device.importExternalTexture !== 'function'") < screenLayerRendererSource.indexOf("canvas.getContext('webgpu')"),
    'WebGPU init must prove external texture support before configuring the presentation context',
  );
  assert.match(screenLayerRendererSource, /maxMotionBlurSamples\?: number/);
  assert.match(screenLayerRendererSource, /motionBlurFrameCount\?: number/);
  assert.match(screenLayerRendererSource, /private recordMotionBlurSamples\(samples: number, blurPx: number\): void/);
  assert.match(screenLayerRendererSource, /motion-blur-active/);
  assert.match(screenLayerRendererSource, /slow-frame/);
  assert.match(screenLayerRendererSource, /new Canvas2DScreenLayerRenderer\('webgpu-non-presentation-canvas2d-fallback', 'webgpu'\)/);
  assert.match(screenLayerRendererSource, /webgpu-frame-without-presentation-canvas2d-fallback/);
  assert.match(screenLayerRendererSource, /this\.webglFallback\.drawFrame\(\{ \.\.\.input, presentationCanvas: null \}\)/);
  assert.doesNotMatch(screenLayerRendererSource, /private readonly fallback = new WebGLScreenLayerRenderer\(\)/);
  assert.match(screenLayerRendererSource, /uniformBindGroups\?: WeakMap<GPURenderPipeline, GPUBindGroup>/);
  assert.match(screenLayerRendererSource, /const cachedBindGroup = entry\.uniformBindGroups\.get\(pipeline\)/);
  assert.match(screenLayerRendererSource, /if \(cachedBindGroup\) return cachedBindGroup/);
  assert.match(screenLayerRendererSource, /entry\.uniformBindGroups\.set\(pipeline, bindGroup\)/);
  assert.match(screenLayerRendererSource, /type WebGPUTextureView = ReturnType<GPUTexture\['createView'\]>/);
  assert.match(screenLayerRendererSource, /private backgroundTextureView: WebGPUTextureView \| null = null/);
  assert.match(screenLayerRendererSource, /private backgroundTextureNaturalWidth = 0/);
  assert.match(screenLayerRendererSource, /private backgroundUploadCanvas: HTMLCanvasElement \| OffscreenCanvas \| null = null/);
  assert.match(screenLayerRendererSource, /private preparedBackgroundBitmap: ImageBitmap \| null = null/);
  assert.match(screenLayerRendererSource, /private backgroundBitmapPrewarmPromise: Promise<void> \| null = null/);
  assert.match(screenLayerRendererSource, /private ensureImageTextureView\(image: HTMLImageElement, reason = 'draw'\): WebGPUTextureView/);
  assert.match(screenLayerRendererSource, /private startBackgroundImagePrewarm\(image: HTMLImageElement, reason: string\): void/);
  assert.match(screenLayerRendererSource, /createImageBitmap\(image, \{/);
  assert.match(screenLayerRendererSource, /resizeWidth: width/);
  assert.match(screenLayerRendererSource, /resizeHeight: height/);
  assert.match(screenLayerRendererSource, /background-image-bitmap-prepared/);
  assert.match(screenLayerRendererSource, /background-image-draw-deferred/);
  assert.match(screenLayerRendererSource, /private releasePreparedBackgroundBitmap\(\): void/);
  assert.match(screenLayerRendererSource, /private resolvePreviewBackgroundTextureSize\(naturalWidth: number, naturalHeight: number\): \{ width: number; height: number \}/);
  assert.match(screenLayerRendererSource, /private preparePreviewBackgroundTextureSource\(/);
  assert.match(screenLayerRendererSource, /return this\.preparedBackgroundBitmap/);
  assert.match(screenLayerRendererSource, /context\.drawImage\(image, 0, 0, width, height\)/);
  assert.match(screenLayerRendererSource, /downscaled: width !== naturalWidth \|\| height !== naturalHeight/);
  assert.match(screenLayerRendererSource, /this\.backgroundTextureView = this\.backgroundTexture\.createView\(\)/);
  assert.match(screenLayerRendererSource, /prepareBackgroundImage\?\(image: HTMLImageElement \| null\): ScreenLayerRendererStats/);
  assert.match(screenLayerRendererSource, /private pendingBackgroundImage: HTMLImageElement \| null = null/);
  assert.match(screenLayerRendererSource, /background-image-texture-uploaded/);
  assert.match(styledVideoPreviewSource, /const backgroundRenderKey = \[/);
  assert.match(styledVideoPreviewSource, /background\.bgGradient \?\? ''/);
  assert.match(styledVideoPreviewSource, /background\.bgShadowOffsetY \?\? DEFAULT_RECORDING_BACKGROUND\.bgShadowOffsetY/);
  assert.match(styledVideoPreviewSource, /backgroundRenderKey, cameraSrc/);
  assert.doesNotMatch(styledVideoPreviewSource, /canvasResolution\.height, background, cameraSrc/);
  assert.match(styledVideoPreviewSource, /screenLayerRendererRef\.current\?\.prepareBackgroundImage\?\.\(image\)/);
  assert.match(styledVideoPreviewSource, /screenLayerRenderer\.prepareBackgroundImage\?\.\(backgroundImageRef\.current\)/);
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
  assert.match(experimentalHeadlessExportSmokeSource, /createZoomMarker/);
  assert.match(experimentalHeadlessExportSmokeSource, /zoomedCursorSharpness/);
});

test('GPU-C experimental headless renderer seam stays opt-in and fallback-backed', () => {
  assert.match(desktopPackage.scripts.test, /src\/main\/headless-export-renderer\.test\.mjs/);
  assert.match(headlessExportRendererSource, /HEADLESS_EXPORT_BACKEND = 'electron-headless-compositor'/);
  assert.match(headlessExportRendererSource, /ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT !== '1'/);
  assert.match(headlessExportRendererSource, /experimental-headless-export-disabled/);
  assert.match(headlessExportRendererSource, /electron-runtime-unavailable/);
  assert.match(headlessExportRendererSource, /renderHeadlessFrames/);
  assert.match(headlessExportRendererSource, /__roughCutRenderHeadlessFrame/);
  assert.match(headlessExportRendererSource, /<canvas id="gpu-frame"/);
  assert.match(headlessExportRendererSource, /gpuCanvas\.getContext\('webgl'/);
  assert.match(headlessExportRendererSource, /webgl:!!gl/);
  assert.match(headlessExportRendererSource, /sourceUrl/);
  assert.match(headlessExportRendererSource, /seekVideo/);
  assert.match(headlessExportRendererSource, /drawVideoLayer/);
  assert.match(headlessExportRendererSource, /function drawBackground\(frame\)/);
  assert.match(headlessExportRendererSource, /function createGpuRenderer\(gl\)/);
  assert.match(headlessExportRendererSource, /function useGpuFrame\(frame\)/);
  assert.match(headlessExportRendererSource, /return !!gpu&&frame&&frame\.screen/);
  assert.match(headlessExportRendererSource, /function drawGpuVideo\(video,rect,source\)/);
  assert.match(headlessExportRendererSource, /function drawGpuScreenLayer\(layer,screen\)/);
  assert.match(headlessExportRendererSource, /function drawGpuCameraLayer\(layer,camera\)/);
  assert.match(headlessExportRendererSource, /const videoTextureCanvas=document\.createElement\('canvas'\)/);
  assert.match(headlessExportRendererSource, /function videoTextureSource\(video,rect\)/);
  assert.match(headlessExportRendererSource, /function drawGpuShadow\(rect,style\)/);
  assert.match(headlessExportRendererSource, /const steps=6/);
  assert.match(headlessExportRendererSource, /function waitForVideoFrame\(video\)/);
  assert.match(headlessExportRendererSource, /await waitForVideoFrame\(video\)/);
  assert.match(headlessExportRendererSource, /uniform vec4 u_gradientEnd/);
  assert.match(headlessExportRendererSource, /uniform vec4 u_rect/);
  assert.match(headlessExportRendererSource, /uniform float u_radius/);
  assert.match(headlessExportRendererSource, /uniform float u_useGradient/);
  assert.match(headlessExportRendererSource, /uniform float u_useRoundedMask/);
  assert.match(headlessExportRendererSource, /gl\.enable\(gl\.BLEND\);gl\.blendFunc\(gl\.SRC_ALPHA,gl\.ONE_MINUS_SRC_ALPHA\)/);
  assert.match(headlessExportRendererSource, /if\(distance\(pixel,closest\)>radius\)\{discard;\}/);
  assert.match(headlessExportRendererSource, /function drawGpuBackground\(bg\)/);
  assert.match(headlessExportRendererSource, /async function drawGpuBackgroundImage\(bg\)/);
  assert.match(headlessExportRendererSource, /const image=await waitForImageReady\(imageFor\(bg&&bg\.imageUrl\)\)/);
  assert.match(headlessExportRendererSource, /textureWidth:image\.naturalWidth\|\|gpuCanvas\.width/);
  assert.match(headlessExportRendererSource, /gradient:start!==end\|\|!!\(bg&&bg\.gradient\)/);
  assert.match(headlessExportRendererSource, /const roundedRadius=Number\.isFinite\(options\.roundedRadius\)\?options\.roundedRadius:Number\.isFinite\(rect\.radius\)\?rect\.radius:0/);
  assert.match(headlessExportRendererSource, /gl\.uniform1f\(gpu\.useRoundedMask,roundedRadius>0\?1:0\)/);
  assert.match(headlessExportRendererSource, /function drawGpuSolidPolygon\(points,colorValue\)/);
  assert.match(headlessExportRendererSource, /gl\.drawArrays\(gl\.TRIANGLE_FAN,0,points\.length\)/);
  assert.match(headlessExportRendererSource, /let usedGpu=false/);
  assert.match(headlessExportRendererSource, /if\(drewScreen\)usedGpu=true;else\{clearGpu\('#000000'\);drewBackgroundImage=await drawBackground\(frame\);fallbackScreen\(screen\);drewScreenShadow=false\}/);
  assert.match(headlessExportRendererSource, /rendererKind:usedGpu\?'webgl':'canvas2d'/);
  assert.match(headlessExportRendererSource, /const images=new Map\(\)/);
  assert.match(headlessExportRendererSource, /function imageFor\(url\)/);
  assert.match(headlessExportRendererSource, /function waitForImageReady\(image\)/);
  assert.match(headlessExportRendererSource, /ctx\.createLinearGradient\(0,0,canvas\.width,canvas\.height\)/);
  assert.match(headlessExportRendererSource, /gradient\.addColorStop\(0,start\)/);
  assert.match(headlessExportRendererSource, /let drewBackgroundImage=false/);
  assert.match(headlessExportRendererSource, /if\(useGpu\)\{clearGpu\(\(frame\.background&&frame\.background\.startColor\)\|\|'#111827'\);drawGpuBackground\(frame\.background\);drewBackgroundImage=await drawGpuBackgroundImage\(frame\.background\)\}/);
  assert.match(headlessExportRendererSource, /else drewBackgroundImage=await drawBackground\(frame\)/);
  assert.match(headlessExportRendererSource, /ctx\.drawImage\(image,0,0,canvas\.width,canvas\.height\)/);
  assert.match(headlessExportRendererSource, /const rawWidth=Number\.isFinite\(frame\.width\)\?frame\.width:frame\.w/);
  assert.match(headlessExportRendererSource, /function screenStyle\(layer,screen\)/);
  assert.match(headlessExportRendererSource, /style\.shadowEnabled!==false/);
  assert.match(headlessExportRendererSource, /ctx\.shadowOffsetX=style\.shadowOffsetX/);
  assert.match(headlessExportRendererSource, /function cameraStyle\(layer,camera\)/);
  assert.match(headlessExportRendererSource, /function cameraShapePath\(camera,style\)/);
  assert.match(headlessExportRendererSource, /style&&style\.shape==='circle'/);
  assert.match(headlessExportRendererSource, /ctx\.arc\(camera\.x\+camera\.width\/2,camera\.y\+camera\.height\/2,Math\.min\(camera\.width,camera\.height\)\/2,0,Math\.PI\*2\)/);
  assert.match(headlessExportRendererSource, /shape==='circle'\?Math\.min\(camera\.width,camera\.height\)\/2/);
  assert.match(headlessExportRendererSource, /Number\.isFinite\(layer&&layer\.radius\)\?layer\.radius:fallbackRadius/);
  assert.match(headlessExportRendererSource, /cameraShapePath\(camera,style\);ctx\.clip\(\)/);
  assert.match(headlessExportRendererSource, /function screenSourceRect\(video,layer,screen\)/);
  assert.match(headlessExportRendererSource, /ctx\.drawImage\(video,source\.x,source\.y,source\.width,source\.height,screen\.x,screen\.y,screen\.width,screen\.height\)/);
  assert.match(headlessExportRendererSource, /function coverSourceRect\(video,layer,dest\)/);
  assert.match(headlessExportRendererSource, /const source=coverSourceRect\(video,layer,\{x,y,width:w,height:h\}\);ctx\.drawImage\(video,source\.x,source\.y,source\.width,source\.height,x,y,w,h\)/);
  assert.match(headlessExportRendererSource, /const style=screenStyle\(layer,screen\);return drawGpuVideo\(video,\{\.\.\.screen,radius:style\.radius\},screenSourceRect\(video,layer,screen\)\)/);
  assert.match(headlessExportRendererSource, /const style=cameraStyle\(layer,camera\);return drawGpuVideo\(video,\{\.\.\.camera,radius:style\.radius\},coverSourceRect\(video,layer,camera\)\)/);
  assert.match(headlessExportRendererSource, /const useGpu=useGpuFrame\(frame\)/);
  assert.match(headlessExportRendererSource, /drewScreenShadow=drawGpuShadow\(screen,style\)/);
  assert.match(headlessExportRendererSource, /if\(screen&&useGpu\)\{const style=screenStyle\(frame\.screen,screen\);drewScreenShadow=drawGpuShadow\(screen,style\);drewScreen=await drawGpuScreenLayer\(frame\.screen,screen\)/);
  assert.match(headlessExportRendererSource, /drewCameraShadow=drawGpuShadow\(camera,\{\.\.\.style,shadowOffsetX:0,shadowOffsetY:0\}\)/);
  assert.match(headlessExportRendererSource, /if\(camera&&useGpu&&usedGpu\)\{const style=cameraStyle\(frame\.camera,camera\);drewCameraShadow=drawGpuShadow\(camera,\{\.\.\.style,shadowOffsetX:0,shadowOffsetY:0\}\);drewCamera=await drawGpuCameraLayer\(frame\.camera,camera\)/);
  assert.match(headlessExportRendererSource, /if\(!drewCamera\)\{usedGpu=false;clearGpu\('#000000'\);drewBackgroundImage=await drawBackground\(frame\);fallbackScreen\(screen\);fallbackCamera\(camera\);drewScreenShadow=false;drewCameraShadow=false\}/);
  assert.match(headlessExportRendererSource, /function sourceViewportRect\(layer,vw,vh\)/);
  assert.match(headlessExportRendererSource, /layer&&\(layer\.sourceViewport\|\|layer\.crop\)/);
  assert.match(headlessExportRendererSource, /const base=sourceViewportRect\(layer,vw,vh\)/);
  assert.match(headlessExportRendererSource, /function sourcePoint\(frame,screen,source\)/);
  assert.match(headlessExportRendererSource, /const sourceRect=screenSourceRect\(\{videoWidth:size\.width,videoHeight:size\.height\},frame\.screen,screen\)/);
  assert.match(headlessExportRendererSource, /\(Math\.abs\(source\.x\)>1\?source\.x:source\.x\*size\.width\)-sourceRect\.x/);
  assert.match(headlessExportRendererSource, /screen\.x\+\(sourceX\/sourceRect\.width\)\*screen\.width/);
  assert.match(headlessExportRendererSource, /function clickPoint\(frame, screen\)/);
  assert.match(headlessExportRendererSource, /\(frame\.click&&frame\.click\.sourcePosition\)\|\|\(frame\.cursor&&frame\.cursor\.sourcePosition\)/);
  assert.match(headlessExportRendererSource, /function cursorStyle\(frame\)/);
  assert.match(headlessExportRendererSource, /cursor\.style==='subtle'\|\|cursor\.style==='spotlight'/);
  assert.match(headlessExportRendererSource, /Math\.max\(0\.5,Math\.min\(1\.5,rawSize\/100\)\)/);
  assert.match(headlessExportRendererSource, /function drawCursor\(point,styleInfo\)/);
  assert.match(headlessExportRendererSource, /style==='spotlight'/);
  assert.match(headlessExportRendererSource, /function drawClick\(point,frame\)/);
  assert.match(headlessExportRendererSource, /function drawGpuCursor\(point,styleInfo\)/);
  assert.match(headlessExportRendererSource, /drawGpuSolidPolygon\(outer,style==='spotlight'\?\[122\/255,167\/255,255\/255,1\]:\[17\/255,24\/255,39\/255,1\]\)/);
  assert.match(headlessExportRendererSource, /function drawGpuClick\(point,frame\)/);
  assert.match(headlessExportRendererSource, /drawGpuQuad\(\{x:point\.x-radius,y:point\.y-radius,width:radius\*2,height:radius\*2,radius\},\{color:\[122\/255,167\/255,255\/255,alpha\]\}\)/);
  assert.match(headlessExportRendererSource, /effect==='ripple'/);
  assert.match(headlessExportRendererSource, /function flushCanvasFrame\(\)/);
  assert.match(headlessExportRendererSource, /await flushCanvasFrame\(\)/);
  assert.match(headlessExportRendererSource, /frameArtifacts/);
  assert.match(headlessExportRendererSource, /framePattern/);
  assert.match(headlessExportRendererSource, /renderResults/);
  assert.match(headlessExportRendererSource, /timelineGap/);
  assert.match(headlessExportRendererSource, /frame&&frame\.screen&&!timelineGap/);
  assert.match(headlessExportRendererSource, /drewScreen/);
  assert.match(headlessExportRendererSource, /drewCamera/);
  assert.match(headlessExportRendererSource, /drewScreenShadow,drewCameraShadow/);
  assert.match(headlessExportRendererSource, /if\(point\)\{if\(usedGpu\)drawGpuCursor\(point,cursorStyle\(frame\)\);else drawCursor\(point,cursorStyle\(frame\)\)\}/);
  assert.match(headlessExportRendererSource, /const clicked=screen&&frame&&frame\.click&&frame\.click\.visible\?clickPoint\(frame,screen\):null/);
  assert.match(headlessExportRendererSource, /if\(clicked\)\{if\(usedGpu\)drawGpuClick\(clicked,frame\);else drawClick\(clicked,frame\)\}/);
  assert.match(headlessExportRendererSource, /cursorPoint:point\?\{x:Math\.round\(point\.x\*100\)\/100,y:Math\.round\(point\.y\*100\)\/100\}:null/);
  assert.match(headlessExportRendererSource, /clickPoint:clicked\?\{x:Math\.round\(clicked\.x\*100\)\/100,y:Math\.round\(clicked\.y\*100\)\/100\}:null/);
  assert.match(headlessExportRendererSource, /nativeImageToPng/);
  assert.match(headlessExportRendererSource, /resolveFrameArtifactDir/);
  assert.match(headlessExportRendererSource, /electron-browser-window-unavailable/);
  assert.match(headlessExportRendererSource, /electron-hidden-window-render-failed/);
  assert.match(headlessExportRendererSource, /offscreen: true/);
  assert.match(headlessExportRendererTestSource, /experimental headless renderer script reports WebGL only after executing GPU frame path/);
  assert.match(headlessExportRendererTestSource, /experimental headless renderer script downgrades to Canvas2D when GPU video draw fails/);
  assert.match(headlessExportRendererTestSource, /experimental headless renderer script maps cursor positions through the zoomed screen source rect/);
  assert.match(headlessExportRendererTestSource, /experimental headless renderer script draws GPU screen and camera shadows/);
  assert.match(headlessExportRendererTestSource, /function executeHiddenRendererScript\(loadedUrl, options = \{\}\)/);
  assert.match(headlessExportRendererTestSource, /vm\.runInNewContext\(script, sandbox\)/);
  assert.match(headlessExportRendererTestSource, /executeHiddenRendererScript\(loadedUrl, \{ throwOnTextureUpload: true \}\)/);
  assert.match(headlessExportRendererTestSource, /if \(options\.throwOnTextureUpload\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.rendererKind, 'webgl'\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.rendererKind, 'canvas2d'\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.drewScreen, true\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.drewScreen, false\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.drewScreenShadow, true\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.drewCameraShadow, true\)/);
  assert.match(headlessExportRendererTestSource, /zoomTransform: \{ scale: 2, offsetX: 80, offsetY: -30 \}/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.cursorPoint\?\.x, 192\)/);
  assert.match(headlessExportRendererTestSource, /assert\.equal\(renderResult\.clickPoint\?\.x, 320\)/);
  assert.match(exportServiceSource, /buildHeadlessFrameExportArgs/);
  assert.match(exportServiceSource, /const \[backgroundStart, backgroundEnd\] = getRecordingBackgroundColors\(frame\.backgroundLayer\.style\)/);
  assert.match(exportServiceSource, /startColor: backgroundStart/);
  assert.match(exportServiceSource, /endColor: backgroundEnd/);
  assert.match(exportServiceSource, /gradient: frame\.backgroundLayer\.style\?\.bgGradient \?\? null/);
  assert.match(exportServiceSource, /image: frame\.backgroundLayer\.style\?\.bgImage \?\? null/);
  assert.match(exportServiceSource, /imagePath: backgroundImagePath/);
  assert.match(exportServiceSource, /imageUrl: backgroundImagePath \? pathToFileURL\(backgroundImagePath\)\.href : null/);
  assert.match(exportServiceSource, /function resolveHeadlessScreenLayout\(frame\)/);
  assert.match(exportServiceSource, /frameSource: screenLayout\?\.source/);
  assert.match(exportServiceSource, /cornerRadius: screenStyle\.screenCornerRadius/);
  assert.match(exportServiceSource, /shadowOffsetX: screenStyle\.screenShadowOffsetX/);
  assert.match(exportServiceSource, /sourceViewport: frame\.screenLayer\.sourceViewport \?\? null/);
  assert.match(exportServiceSource, /crop: frame\.screenLayer\.crop \?\? null/);
  assert.match(exportServiceSource, /sourceViewport: frame\.cameraLayer\.sourceViewport \?\? null/);
  assert.match(exportServiceSource, /crop: frame\.cameraLayer\.crop \?\? null/);
  assert.match(exportServiceSource, /function resolveHeadlessCameraLayout\(frame\)/);
  assert.match(exportServiceSource, /const cameraLayout = frame\.cameraLayer \? resolveHeadlessCameraLayout\(frame\) : null/);
  assert.match(exportServiceSource, /radius: cameraLayout\?\.radius \?\? 0/);
  assert.match(exportServiceSource, /presentation: cameraLayout\?\.presentation \?\? frame\.cameraLayer\.presentation \?\? null/);
  assert.match(exportServiceSource, /shape: presentation\.shape/);
  assert.match(exportServiceSource, /attemptHeadlessRender = attemptExperimentalHeadlessRender/);
  assert.match(exportServiceSource, /const headlessRender = await attemptHeadlessRender\(\{ compositionPlan: renderPlan, outputPath, signal \}\)/);
  assert.match(exportServiceSource, /rendering-headless-export/);
  assert.match(exportServiceSource, /experimental-headless-encode-failed/);
  assert.match(exportServiceSource, /frameSelection: 'all'/);
  assert.match(exportServiceSource, /timelineAudioSegments: audioInputPath && Array\.isArray\(recording\?\.timelineSegments\)/);
  assert.match(exportServiceSource, /audioInputLabel = '0:a'/);
  assert.match(exportServiceSource, /audioInputLabel: '1:a'/);
  assert.match(rootPackage.scripts['smoke:experimental-headless-runtime-export'], /smoke-experimental-headless-runtime-export\.mjs/);
  assert.match(desktopMainSource, /ROUGH_CUT_HEADLESS_EXPORT_SMOKE_RESULT_PATH/);
  assert.match(desktopMainSource, /runMainProcessHeadlessExportSmoke/);
  assert.match(desktopMainSource, /app\.on\('window-all-closed', \(\) => \{\n  if \(process\.env\.ROUGH_CUT_HEADLESS_EXPORT_SMOKE_RESULT_PATH\) return;/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /fallback\?\.active !== false/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /writeRuntimeSmokeFailure/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /phase: 'electron-preflight'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /Electron preflight exited with status/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /phase: 'electron-launch'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /phase: 'electron-exit'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /failure: 'electron-runtime-smoke-launch-failed'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /--disable-setuid-sandbox/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /--disable-gpu-sandbox/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /ELECTRON_DISABLE_SANDBOX: '1'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /styled-baseline\.mp4/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /mode: 'styled'/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /renderResults/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /const webglFrameCount = renderResults\.filter\(\(frame\) => frame\?\.rendererKind === 'webgl'\)\.length/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /timelineGap !== true && frame\?\.drewScreen !== true/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /gapRender\?\.timelineGap !== true/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /cursorRender\?\.cursorPoint/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /centerRgb/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /gapRgb/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /cursorSharpness/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /function buildRuntimeMetrics\(\{ report, video, renderResults, webglFrameCount, frameComparisons \}\)/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /experimentalHeadlessExportEnabled: true/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /fallbackActive: report\?\.result\?\.fallback\?\.active \?\? null/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /headlessRenderOk: report\?\.result\?\.headlessRender\?\.ok \?\? null/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /headlessFrameArtifacts: report\?\.result\?\.headlessRender\?\.frameArtifacts\?\.length \?\? null/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /headlessWebglFrameCount: webglFrameCount/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /speedMultiplier:/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /compareRepresentativeFrames/);
  assert.match(experimentalHeadlessRuntimeExportSmokeSource, /frameComparisons/);
  assert.match(headlessExportRendererSource, /window\.__roughCutCaptureHeadlessPng/);
  assert.match(headlessExportRendererSource, /captureCtx\.drawImage\(gpuCanvas,0,0,captureCanvas\.width,captureCanvas\.height\)/);
  assert.match(headlessExportRendererSource, /captureCtx\.drawImage\(canvas,0,0,captureCanvas\.width,captureCanvas\.height\)/);
  assert.match(headlessExportRendererTestSource, /experimental headless renderer prefers exact-size in-page canvas captures/);
  assert.match(headlessExportRendererTestSource, /capturePageCalled, false/);
  assert.match(exportServiceTestSource, /experimental headless export encodes successful rendered frame artifacts without styled fallback/);
  assert.match(exportServiceTestSource, /attemptHeadlessRender: async \(\{ compositionPlan, outputPath: attemptedOutputPath \}\) =>/);
  assert.match(exportServiceTestSource, /fallback\.active, false/);
  assert.match(exportServiceTestSource, /rendererBackend, 'electron-headless-compositor'/);
  assert.match(exportServiceTestSource, /rendererKind: 'webgl'/);
  assert.match(exportServiceTestSource, /successful headless render must not use styled fallback/);
  assert.match(exportServiceTestSource, /experimental headless export falls back to styled export when artifact encode fails/);
  assert.match(exportServiceTestSource, /headless-encode-failed/);
  assert.match(exportServiceTestSource, /experimental-headless-encode-failed/);
  assert.match(exportServiceTestSource, /Experimental headless export encode failed; falling back to FFmpeg styled export\./);
  assert.match(exportServiceTestSource, /rough_cut_style=canvas:1920x1080:studio-demo-fast/);
});

test('GPU-C experimental export UI stays feature-flagged and fallback-labeled', () => {
  const rendererSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/main.tsx'), 'utf8');
  assert.match(rendererSource, /experimentalHeadlessExportUi = searchParams\.get\('experimentalHeadlessExportUi'\) === '1'/);
  assert.match(rendererSource, /experimentalHeadlessExportUi \? \(/);
  assert.match(rendererSource, /data-export-action="experimental-headless"/);
  assert.match(rendererSource, /onExportMode\('experimental-headless'\)/);
  assert.match(rendererSource, /Experimental headless export/);
  assert.match(rendererSource, /exportResult\?\.fallback\?\.active/);
  assert.match(desktopMainSource, /hasExperimentalHeadlessExportAction = Boolean\(document\.querySelector\('\[data-export-action="experimental-headless"\]'\)\)/);
  assert.match(desktopMainSource, /hasExperimentalHeadlessExportAction,/);
  assert.match(smokeUiSource, /expectsExperimentalHeadlessExportAction = process\.env\.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1' \|\| process\.env\.VITE_ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1'/);
  assert.match(smokeUiSource, /expectsExperimentalHeadlessExportAction && !report\.hasExperimentalHeadlessExportAction/);
});

test('NLE visual harnesses require playable timeline gaps instead of skipped cuts', () => {
  assert.match(visualNleClipsSource, /playedThroughGap: inGap\.length >= 3 && reachedAfterGap/);
  assert.match(visualNleClipsSource, /gap-playback: playback did not continue through the timeline gap/);
  assert.match(
    visualNleClipsSource,
    /const sampleCount = Math\.min\(360, Math\.max\(90, Math\.ceil\(\(\(\(gapBounds\.gapEnd - preRollFrame\) \/ FPS\) \+ 6\) \* 10\)\)\)/,
  );
  assert.match(visualNleClipsSource, /if \(frame !== null && frame >= targetFrame && hasEnoughGapSamples\(\)\) break/);
  assert.doesNotMatch(visualNleClipsSource, /skippedGap/);

  assert.match(visualNleLinkedClipsSource, /Timeline gaps are real timeline time/);
  assert.match(
    visualNleLinkedClipsSource,
    /const sampleCount = Math\.min\(420, Math\.max\(60, Math\.ceil\(\(\(\(gapEndFrame - startFrame\) \/ FPS\) \+ 6\) \* 10\)\)\)/,
  );
  assert.match(visualNleLinkedClipsSource, /playheadInGap\.length < 3/);
  assert.match(visualNleLinkedClipsSource, /playback never reached the clip after the gap during the sample window/);
  assert.match(visualNleLinkedClipsSource, /deletedSourcePlayed\.length > 0/);
});

test('NLE visual harness keeps TASK-229 undo and redo coverage', () => {
  assert.match(visualNleClipsSource, /afterDragUndo/);
  assert.match(visualNleClipsSource, /afterDragRedo/);
  assert.match(visualNleClipsSource, /await page\.keyboard\.press\('Control\+Z'\)/);
  assert.match(visualNleClipsSource, /await page\.keyboard\.press\('Control\+Shift\+Z'\)/);
  assert.match(visualNleClipsSource, /undoRestoredPosition: undoInFrame === dragBefore\.inFrame/);
  assert.match(visualNleClipsSource, /redoRestoredMove: redoInFrame === dragAfter\.inFrame/);
  assert.match(visualNleClipsSource, /afterBladeUndo/);
  assert.match(visualNleClipsSource, /undoRejoinedClip: bladeClipCountAfterUndo === bladeClipCountBefore/);
  assert.match(visualNleClipsSource, /undo: blade undo left/);
});

test('NLE visual harness keeps TASK-231 ripple trim coverage', () => {
  assert.match(visualNleClipsSource, /afterRippleTrim/);
  assert.match(visualNleClipsSource, /Ripple trim: shortening the left segment's tail should pull the right/);
  assert.match(visualNleClipsSource, /downstreamShiftedWithTail:/);
  assert.match(visualNleClipsSource, /closedPairBoundary:/);
  assert.match(visualNleClipsSource, /ripple-trim: downstream moved/);
  assert.match(visualNleClipsSource, /ripple-trim: trimmed clip and downstream clip did not stay edge-contiguous/);
});
