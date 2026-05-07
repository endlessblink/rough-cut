import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electron = join(artifactRoot, 'electron');
const smokeRoot = await mkdtemp(join(tmpdir(), 'rough-cut-package-recording-flow-'));
const resultPath = join(smokeRoot, 'packaged-recording-flow-result.json');
const screenshotPath = join(smokeRoot, 'packaged-recording-flow.png');

await mkdir(smokeRoot, { recursive: true });

const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', appPath], {
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_UI_SMOKE_RECORD_FLOW: '1',
    ROUGH_CUT_UI_SMOKE_CAMERA_WARNING: '1',
    ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH: '/dev/video9999',
    ROUGH_CUT_SMOKE_CAMERA_START_ERROR: 'Device or resource busy',
    ROUGH_CUT_UI_SMOKE_DOUBLE_STOP: process.env.ROUGH_CUT_UI_SMOKE_DOUBLE_STOP ?? '',
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
    ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
  },
  encoding: 'utf8',
  timeout: 120000,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Packaged recording-flow smoke failed with exit code ${result.status}. Artifacts: ${smokeRoot}`);

const report = JSON.parse(await readFile(resultPath, 'utf8'));
const screenshotBytes = (await readFile(screenshotPath)).length;
if (!report.ok || !report.hasPreRecordPanel || !report.hasPreflightPanel || !report.hasPreflightWarningsCopy || !report.hasCaptureTargetSelect || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle' || report.savedState !== 'saved' || !report.hasSavedMessage || !report.hasStudioShell || !report.hasCentralStage || !report.hasReviewWorkspace || !report.hasPostRecordingActions || !report.hasReviewExportActions || !report.hasReviewNextActions || report.selectedCameraSource !== '/dev/video9999' || !report.hasReviewCameraWarning || !report.hasStateCameraWarning || !report.hasStyledPreviewCanvas || !report.hasVideo || !report.hasStoppingLock || !(screenshotBytes > 1000)) {
  throw new Error(`Packaged recording-flow smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, smokeRoot, artifactRoot, resultPath, screenshotPath, screenshotBytes }, null, 2));
