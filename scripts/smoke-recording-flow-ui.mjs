import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-recording-flow-ui-smoke-'));
const resultPath = join(root, 'recording-flow-ui-smoke-result.json');
const screenshotPath = join(root, 'recording-flow-ui-smoke.png');
const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const audioGainOnly = process.env.ROUGH_CUT_UI_SMOKE_AUDIO_GAIN_ONLY === '1';

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
    ROUGH_CUT_UI_SMOKE_PAUSE_RESUME: process.env.ROUGH_CUT_UI_SMOKE_PAUSE_RESUME ?? '',
    ROUGH_CUT_UI_SMOKE_RESTART: process.env.ROUGH_CUT_UI_SMOKE_RESTART ?? '',
    ROUGH_CUT_UI_SMOKE_INVALID_REGION: process.env.ROUGH_CUT_UI_SMOKE_INVALID_REGION ?? '',
    ROUGH_CUT_UI_SMOKE_AUDIO_GAIN_ONLY: process.env.ROUGH_CUT_UI_SMOKE_AUDIO_GAIN_ONLY ?? '',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: process.env.ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH ?? '',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: process.env.ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT ?? '',
    ROUGH_CUT_SMOKE_MIC_SOURCE: process.env.ROUGH_CUT_SMOKE_MIC_SOURCE || (audioGainOnly ? 'alsa_input.rough_cut_smoke_mic' : ''),
    ROUGH_CUT_SMOKE_SYSTEM_AUDIO_SOURCE: process.env.ROUGH_CUT_SMOKE_SYSTEM_AUDIO_SOURCE || (audioGainOnly ? 'alsa_output.rough_cut_smoke.monitor' : ''),
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
if (audioGainOnly) {
  if (!report.ok || !report.audioGainOnly || !report.hasPreRecordPanel || !report.hasPreflightPanel || !report.hasCaptureTargetSelect || !report.hasCaptureSourcePicker || !report.hasDisabledWindowSource || !report.hasMicAudioGainControl || !report.exercisedMicAudioGainControl || report.micAudioGainValue !== 150 || !report.hasSystemAudioGainControl || !report.exercisedSystemAudioGainControl || report.systemAudioGainValue !== 50 || !report.hasMicAudioWaveform || !report.hasCustomAudioGainRangeSkin || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle') {
    throw new Error(`Recording audio-gain UI smoke assertions failed: ${JSON.stringify(report)}`);
  }
} else if (process.env.ROUGH_CUT_UI_SMOKE_CANCEL_FLOW === '1') {
  if (!report.ok || !report.cancelFlow || !report.hasPreRecordPanel || !report.hasPreflightPanel || !report.hasCaptureTargetSelect || !report.hasCaptureSourcePicker || !report.hasDisabledWindowSource || (report.hasMicAudioGainControl && !report.exercisedMicAudioGainControl) || (report.hasSystemAudioGainControl && !report.exercisedSystemAudioGainControl) || !report.hasNoRegionNumberInputs || !report.hasInvalidRegionRejected || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle' || report.canceledState !== 'idle' || report.hasSavedMessage || report.hasReviewWorkspace || report.hasVideo) {
    throw new Error(`Recording-flow cancel smoke assertions failed: ${JSON.stringify(report)}`);
  }
} else if (process.env.ROUGH_CUT_UI_SMOKE_PAUSE_RESUME === '1') {
  if (!report.ok || !report.pauseResumeFlow || !report.hasPausedState || !report.hasResumedState || report.savedState !== 'saved' || !report.hasSavedMessage || !report.hasReviewWorkspace || !report.hasVisibleReviewWorkspace || !report.savedBannerHidden || !report.hasVideo) {
    throw new Error(`Recording-flow pause/resume smoke assertions failed: ${JSON.stringify(report)}`);
  }
  if (process.env.ROUGH_CUT_UI_SMOKE_RESTART === '1' && (!report.restartFlow || !report.hasRestartedState)) {
    throw new Error(`Recording-flow restart smoke assertions failed: ${JSON.stringify(report)}`);
  }
} else if (!report.ok || !report.hasPreRecordPanel || !report.hasPreflightPanel || !report.hasCaptureTargetSelect || !report.hasCaptureSourcePicker || !report.hasDisabledWindowSource || (report.hasMicAudioGainControl && !report.exercisedMicAudioGainControl) || (report.hasSystemAudioGainControl && !report.exercisedSystemAudioGainControl) || !report.hasMicAudioWaveform || !report.hasNoRegionNumberInputs || !report.hasInvalidRegionRejected || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle' || report.savedState !== 'saved' || !report.hasSavedMessage || !report.hasStudioShell || !report.hasCentralStage || !report.hasReviewWorkspace || !report.hasVisibleReviewWorkspace || !report.savedBannerHidden || !report.hasPostRecordingActions || !report.hasReviewExportActions || !report.hasReviewNextActions || !report.hasStyledPreviewCanvas || !report.hasVideo || !report.hasStoppingLock || (process.env.ROUGH_CUT_UI_SMOKE_CAMERA_WARNING === '1' && (!report.hasLiveCameraFailureBanner || !report.hasLiveCameraFailureActions))) {
  throw new Error(`Recording-flow UI smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, root, resultPath, screenshotPath }, null, 2));
