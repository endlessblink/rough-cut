import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electron = join(artifactRoot, 'electron');
const smokeRoot = await mkdtemp(join(tmpdir(), 'rough-cut-package-smoke-'));
const mediaPath = join(smokeRoot, 'preview-source.mp4');
const exportPath = join(smokeRoot, 'export.mp4');
const resultPath = join(smokeRoot, 'ui-smoke-result.json');
const screenshotPath = join(smokeRoot, 'ui-smoke.png');
const userDataPath = join(smokeRoot, 'electron-user-data');

await mkdir(smokeRoot, { recursive: true });
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
  audio: { micSource: 'package-smoke-mic' },
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
const projectPath = project.path;

const result = await runPackagedSmokeApp(electron, ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, appPath], {
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
    ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
  },
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error && !result.artifactsReady) throw result.error;
if (result.status !== 0 && !result.artifactsReady) throw new Error(`Packaged app smoke failed with exit code ${result.status}. Artifacts: ${smokeRoot}`);

const report = JSON.parse(await readFile(resultPath, 'utf8'));
const screenshotBytes = (await readFile(screenshotPath)).length;
if (!report.ok || !report.hasPlaybackButton || !report.hasExportResult || report.exportMode !== 'styled' || !report.hasStyledMode || !report.hasStyledPresetDetails || !report.hasReviewExportActions || !report.hasTemplatePresetSelection || !report.hasFocuSeeSplitCameraLayoutBounds || !report.hasFocuSeeYouTubeCameraLayoutBounds || !report.hasTemplateCameraLayoutBounds || !report.hasFrameDragHandles || !report.hasExportStatusArea || !report.hasVisualScreenshot || report.aspectRatio !== '9:16' || report.padding !== 96 || report.cornerRadius !== 44 || report.shadowSize !== 72 || report.cameraPosition !== 'corner-tl' || report.cameraShape !== 'circle' || report.cameraSize !== 130 || !(report.duration > 0) || !(screenshotBytes > 1000)) {
  throw new Error(`Packaged app smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, smokeRoot, artifactRoot, projectPath, exportPath, screenshotPath, userDataPath, screenshotBytes }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

async function runPackagedSmokeApp(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let exit = null;
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  const exited = new Promise((resolve) => {
    child.once('exit', (status, signal) => {
      exit = { status, signal };
      resolve(exit);
    });
    child.once('error', (error) => {
      exit = { status: null, signal: null, error };
      resolve(exit);
    });
  });

  const deadline = Date.now() + 120000;
  let artifactsReady = false;
  while (Date.now() < deadline) {
    artifactsReady = await smokeArtifactsReady();
    if (artifactsReady) break;
    if (exit) break;
    await sleep(250);
  }

  if (artifactsReady && !exit) {
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(3000)]);
    if (!exit) child.kill('SIGKILL');
  }

  if (!exit) await Promise.race([exited, sleep(1000)]);
  return {
    stdout,
    stderr,
    status: exit?.status ?? null,
    signal: exit?.signal ?? null,
    error: exit?.error ?? null,
    artifactsReady,
  };
}

async function smokeArtifactsReady() {
  try {
    const [reportText, screenshotInfo] = await Promise.all([
      readFile(resultPath, 'utf8'),
      stat(screenshotPath),
    ]);
    const report = JSON.parse(reportText);
    return report?.ok === true && report.hasVisualScreenshot === true && screenshotInfo.size > 1000;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
