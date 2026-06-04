import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-visual-zoom-authoring-'));
const mediaPath = join(root, 'zoom-authoring-source.mp4');
const reportPath = join(root, 'visual-zoom-authoring-report.json');
const beforePath = join(root, 'before-select.png');
const afterPath = join(root, 'after-select.png');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildZoomAuthoringFilter(),
  '-t',
  '4',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 4000);
let project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: 30,
  cursorEvents: [
    { frame: 0, timeMs: 0, x: 480, y: 270, type: 'move', button: 'none' },
    { frame: 90, timeMs: 3000, x: 720, y: 270, type: 'move', button: 'none' },
  ],
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
            followCursor: true,
            markers: [
              createZoomMarker(0, 100, {
                kind: 'manual',
                strength: 1,
                zoomInDuration: 0,
                zoomOutDuration: 0,
                focalPoint: { x: 0.5, y: 0.5 },
              }),
            ],
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
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1280',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1100',
  },
});
const electronProcess = app.process();

let report;
let failure;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await dismissPreRecordOverlay(page);
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
  await page.waitForSelector('.timelineRegion', { timeout: 15000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    return video instanceof HTMLVideoElement &&
      video.readyState >= 2 &&
      canvas instanceof HTMLCanvasElement &&
      canvas.width > 0 &&
      canvas.height > 0;
  }, null, { timeout: 15000 });

  const before = await page.evaluate(readCanvasOverlayPixels);
  await page.screenshot({ path: beforePath, fullPage: false });
  await page.locator('.timelineRegion').first().click();
  await page.waitForTimeout(350);
  const after = await page.evaluate(readCanvasOverlayPixels);
  await page.screenshot({ path: afterPath, fullPage: false });

  const cyanIncrease = after.cyanPixels - before.cyanPixels;
  const darkLabelIncrease = after.darkLabelPixels - before.darkLabelPixels;
  report = {
    ok: cyanIncrease > 120 && darkLabelIncrease > 100,
    root,
    projectPath: project.path,
    screenshots: { beforePath, afterPath },
    before,
    after,
    cyanIncrease,
    darkLabelIncrease,
  };
  if (!report.ok) {
    failure = new Error(`Zoom authoring visual overlay regression failed: ${JSON.stringify({ reportPath, root, before, after, cyanIncrease, darkLabelIncrease })}`);
  }
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({
  ok: report?.ok ?? false,
  reportPath,
  root,
  projectPath: project.path,
  screenshots: report?.screenshots,
  cyanIncrease: report?.cyanIncrease ?? 0,
  darkLabelIncrease: report?.darkLabelIncrease ?? 0,
}, null, 2));
if (failure) throw failure;

function buildZoomAuthoringFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'color=c=0x20242d:size=960x540:rate=30',
    'drawbox=x=80:y=90:w=180:h=120:color=0xaa3344:t=fill',
    'drawbox=x=680:y=310:w=170:h=120:color=0x44aa55:t=fill',
    `drawtext=fontfile=${font}:text='ZOOM AUTHORING':fontcolor=white:fontsize=42:x=60:y=420:box=1:boxcolor=0x00000099`,
  ].join(',');
}

function readCanvasOverlayPixels() {
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement)) return { cyanPixels: 0, darkLabelPixels: 0, width: 0, height: 0 };
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { cyanPixels: 0, darkLabelPixels: 0, width: canvas.width, height: canvas.height };
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let cyanPixels = 0;
  let darkLabelPixels = 0;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const alpha = data[index + 3] ?? 0;
    if (alpha > 180 && red < 95 && green > 145 && blue > 175) cyanPixels += 1;
    if (alpha > 180 && red < 24 && green < 32 && blue < 48) darkLabelPixels += 1;
  }
  return { cyanPixels, darkLabelPixels, width: canvas.width, height: canvas.height };
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}
