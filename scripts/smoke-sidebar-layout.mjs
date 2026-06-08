import { mkdtemp } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-sidebar-layout-smoke-'));
const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const loadedProject = await createLoadedProject();

const empty = runLayoutSmoke({ name: 'empty', projectPath: null });
const loaded = runLayoutSmoke({ name: 'loaded', projectPath: loadedProject.path });
const result = { ok: empty.ok && loaded.ok, root, empty, loaded };

if (!result.ok) {
  throw new Error(`Sidebar layout smoke failed: ${JSON.stringify(result, null, 2)}`);
}

console.info(JSON.stringify(result, null, 2));

async function createLoadedProject() {
  const mediaPath = join(root, 'preview-source.mp4');
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
  return project;
}

function runLayoutSmoke({ name, projectPath }) {
  const resultPath = join(root, `${name}-layout-result.json`);
  const screenshotPath = join(root, `${name}-layout.png`);
  const sidebarScreenshotDir = join(root, `${name}-sidebar-tabs`);
  const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', '.'], {
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_UI_SMOKE_FORCE_EDITOR: '1',
      ROUGH_CUT_UI_SMOKE_LAYOUT_ONLY: '1',
      ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '900',
      ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '740',
      ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
      ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
      ROUGH_CUT_UI_SMOKE_SIDEBAR_SCREENSHOT_DIR: sidebarScreenshotDir,
      ...(projectPath ? { ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath } : {}),
    },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} sidebar layout smoke failed with exit code ${result.status}. Artifacts: ${root}`);
  const report = JSON.parse(readFileSync(resultPath, 'utf8'));
  const requiresSidebarAssertions = report.mode === 'loaded';
  if (!report.ok
    || !report.hasNoSidebarPlaceholderCopy
    || !report.hasSmallViewportOverflowGuard
    || (requiresSidebarAssertions && (!report.hasAllSidebarTabs || !report.hasRepresentativeSidebarControls || !report.hasSidebarVisualSnapshots))
    || (!requiresSidebarAssertions && !report.hasEmptyEditorState)) {
    throw new Error(`${name} sidebar layout assertions failed: ${JSON.stringify(report, null, 2)}. Artifacts: ${root}`);
  }
  const screenshotBytes = statSync(screenshotPath).size;
  const sidebarScreenshotBytes = Object.fromEntries(
    (report.sidebarScreenshots ?? []).map((screenshot) => [screenshot.tool, statSync(screenshot.path).size]),
  );
  if (requiresSidebarAssertions && (Object.keys(sidebarScreenshotBytes).length !== 4 || Object.values(sidebarScreenshotBytes).some((bytes) => bytes <= 1000))) {
    throw new Error(`${name} sidebar visual snapshots were missing or empty: ${JSON.stringify({ sidebarScreenshotBytes, report }, null, 2)}. Artifacts: ${root}`);
  }
  return { ...report, screenshotPath, screenshotBytes, sidebarScreenshotDir, sidebarScreenshotBytes };
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
