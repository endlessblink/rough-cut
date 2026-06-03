import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultRecordingPresentation } from '../packages/project-model/dist/index.js';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-layout-parity-'));
const screenPath = join(root, 'screen.mp4');
const cameraPath = join(root, 'camera.mp4');
const exportPath = join(root, 'layout-export.mp4');
const framePath = join(root, 'layout-export-frame.png');
const reportPath = join(root, 'layout-report.json');
const beforePath = join(root, 'before-drag.png');
const draggingPath = join(root, 'during-drag.png');

await mkdir(root, { recursive: true });

run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  [
    'color=c=0x263241:s=1280x720:r=30',
    'drawbox=x=80:y=80:w=1120:h=560:color=0x31465d:t=fill',
    'drawbox=x=160:y=160:w=240:h=180:color=0x4d7db3:t=fill',
    'drawbox=x=820:y=420:w=280:h=140:color=0xd45d48:t=fill',
  ].join(','),
  '-t',
  '2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  screenPath,
]);

run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x22dd44:s=640x480:r=30',
  '-t',
  '2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  cameraPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 2000);
let project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: screenPath,
  outputPath: screenPath,
  width: 1280,
  height: 720,
  fps: 30,
  camera: {
    rawPath: cameraPath,
    outputPath: cameraPath,
    width: 640,
    height: 480,
    sourceInFrames: 0,
  },
});

const presentation = createDefaultRecordingPresentation();
project = await saveProjectFile(project.path, {
  ...project.document,
  settings: { ...project.document.settings, aspectRatio: '16:9' },
  assets: project.document.assets.map((asset) => asset.type === 'recording'
    ? {
        ...asset,
        presentation: {
          ...presentation,
          camera: {
            ...presentation.camera,
            shape: 'square',
            aspectRatio: '1:1',
            position: 'corner-br',
            visible: true,
            size: 100,
          },
          background: {
            ...presentation.background,
            bgColor: '#242833',
            bgGradient: null,
            bgImage: null,
            bgPadding: 96,
          },
        },
      }
    : asset),
});

const { _electron: electron } = loadPlaywright();
const electronPath = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: project.path,
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1280',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '900',
  },
});
const electronProcess = app.process();

let report;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    return video instanceof HTMLVideoElement
      && video.readyState >= 2
      && canvas instanceof HTMLCanvasElement
      && canvas.width > 0
      && canvas.height > 0
      && window.__roughCutCameraFramePresent === true;
  }, null, { timeout: 15000 });

  await page.screenshot({ path: beforePath, fullPage: false });
  const canvasBox = await page.locator('canvas.styledPreviewCanvas').boundingBox();
  if (!canvasBox) throw new Error('Missing styled preview canvas box.');

  const defaultCameraCenter = {
    x: canvasBox.x + canvasBox.width * 0.89,
    y: canvasBox.y + canvasBox.height * 0.82,
  };
  const movedCameraCenter = {
    x: canvasBox.x + canvasBox.width * 0.24,
    y: canvasBox.y + canvasBox.height * 0.24,
  };

  await page.mouse.move(defaultCameraCenter.x, defaultCameraCenter.y);
  await page.mouse.down();
  await page.mouse.move(movedCameraCenter.x, movedCameraCenter.y, { steps: 12 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: draggingPath, fullPage: false });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+E' : 'Control+E');
  await page.waitForFunction(() => document.body.textContent?.includes('Exported to:'), null, { timeout: 120000 });
  await page.mouse.up().catch(() => undefined);
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

run('ffmpeg', ['-y', '-ss', '0.5', '-i', exportPath, '-frames:v', '1', '-update', '1', framePath]);
const greenBox = findGreenBounds(framePath);
const dimensions = probeDimensions(exportPath);
const ok = dimensions.width === 1920
  && dimensions.height === 1080
  && greenBox
  && greenBox.centerX < 850
  && greenBox.centerY < 520;

report = {
  ok,
  root,
  projectPath: project.path,
  exportPath,
  framePath,
  beforePath,
  draggingPath,
  dimensions,
  greenBox,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(report, null, 2));
if (!ok) throw new Error(`Live preview layout was not preserved in export: ${JSON.stringify(report)}`);

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function probeDimensions(videoPath) {
  return JSON.parse(runCapture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', videoPath])).streams[0];
}

function findGreenBounds(imagePath) {
  const width = 1920;
  const height = 1080;
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', imagePath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null, maxBuffer: width * height * 3 + 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg raw frame read failed: ${result.stderr?.toString() ?? ''}`);
  const pixels = result.stdout;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      if (green > 150 && red < 80 && blue < 110) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  if (count < 500) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    count,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}: ${result.stderr}`);
  return result.stdout;
}
