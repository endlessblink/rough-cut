import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';
import {
  openProjectFile,
  saveProjectFile,
  saveProjectForRecording,
} from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-ui-smoke-'));
const externalProjectPath = process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH?.trim()
  ? resolve(process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH)
  : null;
const mediaPath = join(root, 'preview-source.mp4');
const exportPath = join(root, 'export.mp4');
const resultPath = process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH?.trim()
  ? resolve(process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH)
  : join(root, 'ui-smoke-result.json');
const screenshotPath = join(root, 'ui-smoke.png');
const timelineScreenshotPath = join(root, 'ui-smoke-timeline.png');
const openSelectScreenshotPath = join(root, 'ui-smoke-open-select.png');
const openShapeScreenshotPath = join(root, 'ui-smoke-open-shape.png');
const openAspectScreenshotPath = join(root, 'ui-smoke-open-aspect.png');
const userDataPath = join(root, 'electron-user-data');

await mkdir(root, { recursive: true });
const cleanupReview = process.env.ROUGH_CUT_UI_SMOKE_CLEANUP_REVIEW === '1';
const recordingDurationSeconds = cleanupReview ? 10 : 2;
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc=size=320x240:rate=30',
  '-t',
  String(recordingDurationSeconds),
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(
  startedAt.getTime() + recordingDurationSeconds * 1000,
);
const transcriptWords = [
  { word: 'Open', startFrame: 0, endFrame: 10, confidence: 1 },
  { word: 'the', startFrame: 10, endFrame: 14, confidence: 1 },
  { word: 'editor', startFrame: 15, endFrame: 24, confidence: 1 },
  { word: 'run', startFrame: 28, endFrame: 34, confidence: 1 },
  { word: 'pnpm', startFrame: 35, endFrame: 42, confidence: 1 },
  { word: 'test', startFrame: 43, endFrame: 52, confidence: 1 },
];
const transcriptParagraphs = [
  { text: 'Open the editor, run pnpm test', startFrame: 0, endFrame: 52 },
];
if (cleanupReview) {
  transcriptWords.push(
    { word: 'the', startFrame: 60, endFrame: 66, confidence: 1 },
    { word: 'test', startFrame: 67, endFrame: 73, confidence: 1 },
    { word: 'failed', startFrame: 74, endFrame: 82, confidence: 1 },
    { word: 'Open', startFrame: 90, endFrame: 98, confidence: 1 },
    { word: 'the', startFrame: 99, endFrame: 104, confidence: 1 },
    { word: 'editor', startFrame: 105, endFrame: 114, confidence: 1 },
    { word: 'run', startFrame: 115, endFrame: 121, confidence: 1 },
    { word: 'pnpm', startFrame: 122, endFrame: 129, confidence: 1 },
    { word: 'test', startFrame: 130, endFrame: 137, confidence: 1 },
    { word: 'and', startFrame: 138, endFrame: 143, confidence: 1 },
    { word: 'now', startFrame: 144, endFrame: 149, confidence: 1 },
    { word: 'it', startFrame: 150, endFrame: 154, confidence: 1 },
    { word: 'passes', startFrame: 155, endFrame: 164, confidence: 1 },
    { word: 'save', startFrame: 180, endFrame: 187, confidence: 1 },
    { word: 'the', startFrame: 188, endFrame: 193, confidence: 1 },
    { word: 'config', startFrame: 194, endFrame: 202, confidence: 1 },
    { word: 'file', startFrame: 203, endFrame: 209, confidence: 1 },
    { word: 'config', startFrame: 215, endFrame: 223, confidence: 1 },
    { word: 'save', startFrame: 224, endFrame: 230, confidence: 1 },
    { word: 'failed', startFrame: 231, endFrame: 239, confidence: 1 },
    { word: 'save', startFrame: 245, endFrame: 252, confidence: 1 },
    { word: 'the', startFrame: 253, endFrame: 258, confidence: 1 },
    { word: 'config', startFrame: 259, endFrame: 267, confidence: 1 },
    { word: 'file', startFrame: 268, endFrame: 274, confidence: 1 },
    { word: 'and', startFrame: 275, endFrame: 280, confidence: 1 },
    { word: 'now', startFrame: 281, endFrame: 286, confidence: 1 },
    { word: 'it', startFrame: 287, endFrame: 291, confidence: 1 },
    { word: 'works', startFrame: 292, endFrame: 299, confidence: 1 },
  );
  transcriptParagraphs.push(
    { text: 'the test failed', startFrame: 60, endFrame: 82 },
    {
      text: 'Open the editor, run pnpm test and now it passes',
      startFrame: 90,
      endFrame: 164,
    },
    { text: 'save the config file', startFrame: 180, endFrame: 209 },
    { text: 'config save failed', startFrame: 215, endFrame: 239 },
    {
      text: 'save the config file and now it works',
      startFrame: 245,
      endFrame: 299,
    },
  );
}
if (process.env.ROUGH_CUT_UI_SMOKE_LONG_TRANSCRIPT === '1') {
  for (let index = transcriptWords.length; index < 6000; index += 1) {
    transcriptWords.push({
      word: `token-${index}`,
      startFrame: 60 + index * 2,
      endFrame: 61 + index * 2,
      confidence: 1,
    });
  }
}
let project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 320,
  height: 240,
  fps: 30,
  cursorEvents: [
    { frame: 18, x: 80, y: 90, type: 'move', button: 'none' },
    { frame: 42, x: 120, y: 110, type: 'move', button: 'none' },
  ],
  audio: { micSource: 'smoke-mic' },
  camera: {
    rawPath: mediaPath,
    outputPath: mediaPath,
    width: 320,
    height: 240,
    sourceInFrames: 0,
  },
});

const presentation = createDefaultRecordingPresentation();
project = await saveProjectFile(project.path, {
  ...project.document,
  transcript: {
    words: transcriptWords,
    paragraphs: transcriptParagraphs,
    nonSpeech: [],
  },
  assets: project.document.assets.map((asset) => asset.type === 'recording'
    ? {
        ...asset,
        presentation: {
          ...presentation,
          zoom: {
            ...presentation.zoom,
            markers: [createZoomMarker(20, 50)],
          },
        },
      }
    : asset),
});
if (externalProjectPath) {
  project = await openProjectFile(externalProjectPath);
}

const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const result = spawnSync(electron, [
  '--no-sandbox',
  '--disable-gpu',
  '--force-color-profile=srgb',
  `--user-data-dir=${userDataPath}`,
  '.',
], {
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: project.path,
    ROUGH_CUT_UI_SMOKE_EXTERNAL_PROJECT: externalProjectPath ? '1' : '0',
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
    ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
    ROUGH_CUT_UI_SMOKE_SCREENSHOT_TIMELINE_PATH: timelineScreenshotPath,
    ROUGH_CUT_UI_SMOKE_OPEN_SELECT_SCREENSHOT_PATH: openSelectScreenshotPath,
    ROUGH_CUT_UI_SMOKE_OPEN_SHAPE_SCREENSHOT_PATH: openShapeScreenshotPath,
    ROUGH_CUT_UI_SMOKE_OPEN_ASPECT_SCREENSHOT_PATH: openAspectScreenshotPath,
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1280',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1300',
  },
  encoding: 'utf8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Electron UI smoke failed with exit code ${result.status}. Artifacts: ${root}`);
}

const report = JSON.parse(await readFile(resultPath, 'utf8'));
if (!report.ok) {
  throw new Error(`Electron UI smoke failed: ${JSON.stringify(report)}. Artifacts: ${root}`);
}
report.projectPath = project.path;
report.projectDurationFrames = Math.max(
  Number(project.document.composition?.duration) || 0,
  ...project.document.timeline.tracks.flatMap((track) =>
    track.clips.map((clip) => clip.timelineOut)),
);
report.recordingDurationFrames = Math.max(
  ...project.document.assets
    .filter((asset) => asset.type === 'recording')
    .map((asset) => Number(asset.duration) || 0),
);
await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (process.env.ROUGH_CUT_UI_SMOKE_TRANSCRIPT_ONLY === '1') {
  const longTranscript = process.env.ROUGH_CUT_UI_SMOKE_LONG_TRANSCRIPT === '1';
  const transcriptCountsValid = externalProjectPath
    ? report.totalTranscriptWordCount > 0
      && report.transcriptWordCount > 0
      && (
        report.totalTranscriptWordCount <= 1000
        || report.lastTranscriptWordVisible
      )
    : longTranscript
    ? report.totalTranscriptWordCount === 6000
      && report.transcriptWordCount < 1000
      && report.lastTranscriptWordVisible
    : cleanupReview
      ? report.totalTranscriptWordCount === transcriptWords.length
        && report.transcriptWordCount === transcriptWords.length
      : report.totalTranscriptWordCount === 6 && report.transcriptWordCount === 6;
  const cleanupReviewValid = cleanupReview
    ? report.hasCleanupReview
      && report.hasCleanupTypingGuard
       && report.hasCleanupKeyboardAccept
       && report.hasCleanupDraftProjection
       && report.hasLiveCleanupDraft
       && report.hasTranscriptSelection
       && report.hasManualTranscriptCut
       && report.hasFastReviewSpeeds
       && report.hasAutomaticJoinVerificationResume
       && report.hasManualCutUndoRedo
       && report.hasTranscriptFollowLock
       && report.hasBoundaryGestureSingleCommit
       && report.hasReviewFocusContinuity
       && report.hasReviewLayoutStability
        && report.hasCleanupFrameContinuity
      && report.hasBoundaryFeedbackWithinBudget
      && Number.isFinite(report.boundaryFeedbackLatencyMs)
      && report.boundaryFeedbackLatencyMs <= 100
      && Number.isFinite(report.transcriptSeekLatencyMs)
      && report.transcriptSeekLatencyMs <= 100
      && Number.isFinite(report.rapidSeekSettleLatencyMs)
      && report.rapidSeekSettleLatencyMs <= 100
      && Number.isFinite(report.joinPreviewStartupLatencyMs)
        && report.joinPreviewStartupLatencyMs <= 250
        && report.hasNaturalJoinChoice
       && report.hasVisualDiscontinuityCheck
       && report.hasFinalizeSingleHistoryCommit
       && report.hasFinalizeCanonicalTimeline
       && report.hasFinalizeSavedReopen
       && report.hasFinalizeUndoRestore
       && report.hasCleanupReopened
      && report.hasCleanupDraftAfterReopen
    : true;
  const landmarksValid = externalProjectPath
    ? true
    : report.hasActionLandmark && report.hasLandmarkSeek;
  if (!report.hasTranscriptPanel || !report.hasTranscriptSeek || !report.hasTranscriptEnterSeek || !report.hasLatestRapidSeek || !landmarksValid || !transcriptCountsValid || !cleanupReviewValid) {
    throw new Error(`Electron transcript UI smoke assertions failed: ${JSON.stringify(report)}. Artifacts: ${root}`);
  }
  console.info(JSON.stringify({ ...report, root, projectPath: project.path, screenshotPath }, null, 2));
  process.exit(0);
}
if (process.env.ROUGH_CUT_UI_SMOKE_NLE_ONLY === '1') {
  if (!report.hasNleWorkspace || !report.hasNleRuler || !report.hasNleTrimHandles || !report.hasNleTrimDragMutation || !report.hasNleSplitButtonMutation || !report.hasNleSplitKeepsSelection || !report.hasNleClipDragMutation || !report.hasNleGeneratedAssetsTab || !report.hasNleGeneratedSearch || !report.hasNleGeneratedFilters || !report.hasTranscriptPanel || !report.hasTranscriptSeek) {
    throw new Error(`Electron NLE UI smoke assertions failed: ${JSON.stringify(report)}. Artifacts: ${root}`);
  }
  console.info(JSON.stringify({ ...report, root, projectPath: project.path }, null, 2));
  process.exit(0);
}
const screenshotBytes = (await readFile(screenshotPath)).length;
const openSelectScreenshotBytes = (await readFile(openSelectScreenshotPath)).length;
const openShapeScreenshotBytes = (await readFile(openShapeScreenshotPath)).length;
const openAspectScreenshotBytes = (await readFile(openAspectScreenshotPath)).length;
const expectsExperimentalHeadlessExportAction = process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1' || process.env.VITE_ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1';
if (!report.hasPlaybackButton || !report.hasExportResult || report.exportMode !== 'styled' || !report.hasStyledMode || !report.hasStyledPresetDetails || !report.hasReviewExportActions || !report.hasExportProgressMeter || !report.hasBackgroundPresetSelection || !report.hasTemplatePresetSelection || !report.hasFocuSeeSplitCameraLayoutBounds || !report.hasFocuSeeYouTubeCameraLayoutBounds || !report.hasTemplateCameraLayoutBounds || !report.hasCircleCameraPixelSquare || !report.hasRectangleAfterCircleShape || !report.hasNoInactiveBackgroundTabs || !report.hasBackgroundShadowControls || !report.hasScreenCropControls || !report.hasCustomRangeSkin || !report.hasTimelineZoomControlPanel || !report.hasGenerateAutoZoomsControl || !report.hasStableToolSwitchLayout || !report.hasZoomResizeHandles || !report.hasKeyboardZoomControls || !report.hasTimelineLiveRegion || !report.hasKeyboardTimelineScrubber || !report.hasTimelineScrubberFineStep || !report.hasTimelineArrowKeyAdvance || !report.hasCursorPresentationControls || !report.hasCursorTab || !report.hasCameraTab || !report.hasExportAspectChip || !report.hasKeyboardTrimHandles || !report.hasFrameDragHandles || !report.hasUndoRedoControls || !report.hasNoSetupBoardHorizontalOverflow || !report.hasStudioShell || !report.hasCaptureBar || !report.hasNoInertTopBarIcons || !report.hasShortcutsDialog || !report.hasCaptureCommandArea || !report.hasStateBanner || !report.hasCentralStage || !report.hasTimelineRail || !report.hasTimelineScrubber || !report.hasTrimHandles  || !report.hasZoomLane || !report.hasClickLane || !report.hasCameraLane || !report.hasAudioLane || !report.hasNoAutoZoomDecisionPanel || !report.hasInspectorContext || !report.hasInspectorGroups || !report.hasCameraPipControls || !report.hasCameraCropControls || !report.hasRightInspector || !report.hasExportStatusArea || !report.hasVisualScreenshot || !report.hasOpenSelectScreenshot || !report.hasOpenShapeScreenshot || !report.hasOpenAspectScreenshot || (expectsExperimentalHeadlessExportAction && !report.hasExperimentalHeadlessExportAction) || report.aspectRatio !== '9:16' || report.padding !== 96 || report.cornerRadius !== 44 || report.shadowSize !== 72 || report.cameraPosition !== 'corner-tl' || report.cameraShape !== 'circle' || report.cameraSize !== 130 || !(report.duration > 0) || !(screenshotBytes > 1000) || !(openSelectScreenshotBytes > 1000) || !(openShapeScreenshotBytes > 1000) || !(openAspectScreenshotBytes > 1000)) {
  throw new Error(`Electron UI smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, root, projectPath: project.path, exportPath, screenshotPath, openSelectScreenshotPath, openShapeScreenshotPath, openAspectScreenshotPath, screenshotBytes, openSelectScreenshotBytes, openShapeScreenshotBytes, openAspectScreenshotBytes }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
