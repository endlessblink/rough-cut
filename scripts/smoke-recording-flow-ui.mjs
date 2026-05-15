import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-recording-flow-ui-smoke-'));
const resultPath = join(root, 'recording-flow-ui-smoke-result.json');
const screenshotPath = join(root, 'recording-flow-ui-smoke.png');
const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');

const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', '.'], {
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_RECORD_FLOW: '1',
    ROUGH_CUT_UI_SMOKE_CAMERA_WARNING: process.env.ROUGH_CUT_UI_SMOKE_CAMERA_WARNING ?? '',
    ROUGH_CUT_UI_SMOKE_CANCEL_FLOW: process.env.ROUGH_CUT_UI_SMOKE_CANCEL_FLOW ?? '',
    ROUGH_CUT_UI_SMOKE_DOUBLE_STOP: process.env.ROUGH_CUT_UI_SMOKE_DOUBLE_STOP ?? '',
    ROUGH_CUT_UI_SMOKE_INVALID_REGION: process.env.ROUGH_CUT_UI_SMOKE_INVALID_REGION ?? '',
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
    ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
  },
  encoding: 'utf8',
  timeout: 120000,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Recording-flow UI smoke failed with exit code ${result.status}. Artifacts: ${root}`);

const report = JSON.parse(await readFile(resultPath, 'utf8'));
if (process.env.ROUGH_CUT_UI_SMOKE_CANCEL_FLOW === '1') {
  if (!report.ok || !report.cancelFlow || !report.hasPreRecordPanel || !report.hasPreflightPanel || !report.hasCaptureTargetSelect || !report.hasCaptureSourcePicker || !report.hasDisabledWindowSource || !report.hasNoRegionNumberInputs || !report.hasInvalidRegionRejected || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle' || report.canceledState !== 'idle' || report.hasSavedMessage || report.hasReviewWorkspace || report.hasVideo) {
    throw new Error(`Recording-flow cancel smoke assertions failed: ${JSON.stringify(report)}`);
  }
} else if (!report.ok || !report.hasPreRecordPanel || !report.hasPreflightPanel || !report.hasCaptureTargetSelect || !report.hasCaptureSourcePicker || !report.hasDisabledWindowSource || !report.hasNoRegionNumberInputs || !report.hasInvalidRegionRejected || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle' || report.savedState !== 'saved' || !report.hasSavedMessage || !report.hasStudioShell || !report.hasCentralStage || !report.hasReviewWorkspace || !report.hasPostRecordingActions || !report.hasReviewExportActions || !report.hasReviewNextActions || !report.hasStyledPreviewCanvas || !report.hasVideo || !report.hasStoppingLock || (process.env.ROUGH_CUT_UI_SMOKE_CAMERA_WARNING === '1' && (!report.hasLiveCameraFailureBanner || !report.hasLiveCameraFailureActions))) {
  throw new Error(`Recording-flow UI smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, root, resultPath, screenshotPath }, null, 2));
