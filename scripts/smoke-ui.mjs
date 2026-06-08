import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-ui-smoke-'));
const mediaPath = join(root, 'preview-source.mp4');
const exportPath = join(root, 'export.mp4');
const resultPath = join(root, 'ui-smoke-result.json');
const screenshotPath = join(root, 'ui-smoke.png');
const timelineScreenshotPath = join(root, 'ui-smoke-timeline.png');
const openSelectScreenshotPath = join(root, 'ui-smoke-open-select.png');
const openShapeScreenshotPath = join(root, 'ui-smoke-open-shape.png');
const openAspectScreenshotPath = join(root, 'ui-smoke-open-aspect.png');
const userDataPath = join(root, 'electron-user-data');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc=size=320x240:rate=30',
  '-t',
  '2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 2000);
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
    { frame: 42, x: 120, y: 110, type: 'down', button: 'left' },
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

const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, '.'], {
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: project.path,
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
if (process.env.ROUGH_CUT_UI_SMOKE_NLE_ONLY === '1') {
  if (!report.hasNleWorkspace || !report.hasNleRuler || !report.hasNleTrimHandles || !report.hasNleTrimDragMutation || !report.hasNleSplitButtonMutation || !report.hasNleSplitKeepsSelection || !report.hasNleClipDragMutation || !report.hasNleGeneratedAssetsTab || !report.hasNleGeneratedSearch || !report.hasNleGeneratedFilters) {
    throw new Error(`Electron NLE UI smoke assertions failed: ${JSON.stringify(report)}. Artifacts: ${root}`);
  }
  console.info(JSON.stringify({ ...report, root, projectPath: project.path }, null, 2));
  process.exit(0);
}
const screenshotBytes = (await readFile(screenshotPath)).length;
const openSelectScreenshotBytes = (await readFile(openSelectScreenshotPath)).length;
const openShapeScreenshotBytes = (await readFile(openShapeScreenshotPath)).length;
const openAspectScreenshotBytes = (await readFile(openAspectScreenshotPath)).length;
if (!report.hasPlaybackButton || !report.hasExportResult || report.exportMode !== 'styled' || !report.hasStyledMode || !report.hasStyledPresetDetails || !report.hasReviewExportActions || !report.hasExportProgressMeter || !report.hasBackgroundPresetSelection || !report.hasTemplatePresetSelection || !report.hasFocuSeeSplitCameraLayoutBounds || !report.hasFocuSeeYouTubeCameraLayoutBounds || !report.hasTemplateCameraLayoutBounds || !report.hasCircleCameraPixelSquare || !report.hasRectangleAfterCircleShape || !report.hasNoInactiveBackgroundTabs || !report.hasBackgroundShadowControls || !report.hasScreenCropControls || !report.hasCustomRangeSkin || !report.hasTimelineZoomControlPanel || !report.hasStableToolSwitchLayout || !report.hasZoomResizeHandles || !report.hasKeyboardZoomControls || !report.hasTimelineLiveRegion || !report.hasKeyboardTimelineScrubber || !report.hasTimelineScrubberFineStep || !report.hasTimelineArrowKeyAdvance || !report.hasCursorPresentationControls || !report.hasCursorTab || !report.hasCameraTab || !report.hasExportAspectChip || !report.hasKeyboardTrimHandles || !report.hasFrameDragHandles || !report.hasUndoRedoControls || !report.hasNoSetupBoardHorizontalOverflow || !report.hasStudioShell || !report.hasCaptureBar || !report.hasNoInertTopBarIcons || !report.hasShortcutsDialog || !report.hasCaptureCommandArea || !report.hasStateBanner || !report.hasCentralStage || !report.hasTimelineRail || !report.hasTimelineScrubber || !report.hasTrimHandles  || !report.hasZoomLane || !report.hasClickLane || !report.hasCameraLane || !report.hasAudioLane || !report.hasInspectorContext || !report.hasInspectorGroups || !report.hasCameraPipControls || !report.hasCameraCropControls || !report.hasRightInspector || !report.hasExportStatusArea || !report.hasVisualScreenshot || !report.hasOpenSelectScreenshot || !report.hasOpenShapeScreenshot || !report.hasOpenAspectScreenshot || report.aspectRatio !== '9:16' || report.padding !== 96 || report.cornerRadius !== 44 || report.shadowSize !== 72 || report.cameraPosition !== 'corner-tl' || report.cameraShape !== 'circle' || report.cameraSize !== 130 || !(report.duration > 0) || !(screenshotBytes > 1000) || !(openSelectScreenshotBytes > 1000) || !(openShapeScreenshotBytes > 1000) || !(openAspectScreenshotBytes > 1000)) {
  throw new Error(`Electron UI smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, root, projectPath: project.path, exportPath, screenshotPath, openSelectScreenshotPath, openShapeScreenshotPath, openAspectScreenshotPath, screenshotBytes, openSelectScreenshotBytes, openShapeScreenshotBytes, openAspectScreenshotBytes }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
