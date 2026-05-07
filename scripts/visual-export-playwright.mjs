import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjectFile } from '../apps/desktop/src/main/project-files.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-visual-export-'));
const sourceProjectPath = process.env.ROUGH_CUT_VISUAL_PROJECT_PATH || null;
const mediaPath = join(root, 'visual-source.mp4');
const exportPath = join(root, 'styled-export.mp4');
const appBeforePath = join(root, 'app-before-export.png');
const appAfterPath = join(root, 'app-after-export.png');
const framePath = join(root, 'styled-frame-0.5.png');
const browserFramePath = join(root, 'playwright-export-frame.png');
const reportPath = join(root, 'visual-report.json');

await mkdir(root, { recursive: true });
const project = sourceProjectPath ? await openProjectFile(sourceProjectPath) : await createFixtureProject();

const { _electron: electron, chromium } = loadPlaywright();
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
  },
});
const electronProcess = app.process();

try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('video', { timeout: 10000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0;
  });
  await page.waitForSelector('[data-export-action="styled"]', { timeout: 10000 });
  await captureElectronPage(app, page, appBeforePath);
  await page.locator('[data-export-action="styled"]').click();
  await page.waitForFunction(() => document.body.textContent?.includes('Exported to:'), null, { timeout: 180000 });
  await captureElectronPage(app, page, appAfterPath).catch(async (err) => {
    await writeFile(appAfterPath, `after-export screenshot unavailable: ${err.message}\n`, 'utf8');
  });
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

run('ffmpeg', ['-y', '-ss', '0.5', '-i', exportPath, '-frames:v', '1', framePath]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`file://${framePath}`);
  await page.screenshot({ path: browserFramePath, fullPage: true });
} finally {
  await browser.close();
}

const checks = {
  dimensions: probeDimensions(exportPath),
  ...(sourceProjectPath ? buildRealProjectChecks(project.document, exportPath) : buildFixtureChecks(exportPath)),
};

if (checks.dimensions.width !== 1920 || checks.dimensions.height !== 1080) {
  throw new Error(`Styled export dimensions are wrong: ${JSON.stringify(checks.dimensions)}`);
}
if (!sourceProjectPath) {
  assertColorClose(checks.topLeftMarker, { red: 255, green: 0, blue: 0 }, 'top-left source marker');
  assertColorClose(checks.bottomRightMarker, { red: 0, green: 0, blue: 255 }, 'bottom-right source marker');
  if (checks.centerCursor.bright < 120 || checks.centerCursor.dark < 60) {
    throw new Error(`Cursor was not visible in exported frame: ${JSON.stringify(checks.centerCursor)}`);
  }
} else if (checks.cursorSamples?.some((sample) => sample.sample.bright < 60 || sample.sample.dark < 30)) {
  throw new Error(`Cursor was not visible in one or more real exported frames: ${JSON.stringify(checks.cursorSamples)}`);
}

await writeFile(
  reportPath,
  `${JSON.stringify({
    ok: true,
    root,
    projectPath: project.path,
    sourceProjectPath,
    exportPath,
    appBeforePath,
    appAfterPath,
    framePath,
    browserFramePath,
    checks,
  }, null, 2)}\n`,
  'utf8',
);

console.info(await readFile(reportPath, 'utf8'));

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function buildVisualFixtureFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'color=c=0x20242c:s=1280x720:r=30',
    'drawbox=x=0:y=0:w=1280:h=720:color=0xe6e0d8:t=16',
    'drawbox=x=16:y=16:w=80:h=80:color=0xff0000:t=fill',
    'drawbox=x=1184:y=16:w=80:h=80:color=0x00ff00:t=fill',
    'drawbox=x=16:y=624:w=80:h=80:color=0xffff00:t=fill',
    'drawbox=x=1184:y=624:w=80:h=80:color=0x0000ff:t=fill',
    'drawbox=x=420:y=260:w=440:h=200:color=0x383f4a:t=fill',
    `drawtext=fontfile=${font}:text='FULL FRAME VISUAL TEST':fontcolor=0xffffff:fontsize=42:x=342:y=326`,
    `drawtext=fontfile=${font}:text='Corners must survive styled export':fontcolor=0xd8dde8:fontsize=28:x=398:y=384`,
  ].join(',');
}

async function createFixtureProject() {
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    buildVisualFixtureFilter(),
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
  return saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: stoppedAt.toISOString(),
    rawPath: mediaPath,
    outputPath: mediaPath,
    width: 1280,
    height: 720,
    fps: 30,
    cursorEvents: [
      { frame: 0, timeMs: 0, x: 72, y: 72, type: 'move', button: 0 },
      { frame: 15, timeMs: 500, x: 640, y: 360, type: 'move', button: 0 },
      { frame: 45, timeMs: 1500, x: 1190, y: 640, type: 'move', button: 0 },
    ],
  });
}

function buildFixtureChecks(videoPath) {
  return {
    topLeftMarker: sampleAverage(videoPath, { x: 210, y: 136, width: 28, height: 28 }),
    bottomRightMarker: sampleAverage(videoPath, { x: 1660, y: 900, width: 28, height: 28 }),
    centerCursor: sampleBrightDark(videoPath, { x: 940, y: 514, width: 120, height: 120 }),
  };
}

function buildRealProjectChecks(document, videoPath) {
  const recording = document.assets?.find((asset) => asset.type === 'recording');
  const events = recording?.metadata?.cursorEvents ?? [];
  const movementEvents = events.filter((candidate) => candidate && candidate.type === 'move' && Number.isFinite(candidate.frame));
  if (movementEvents.length === 0) return { cursorSamples: [{ sample: { bright: 0, dark: 0 }, event: null }] };
  const selectedEvents = uniqueEvents([
    movementEvents.find((candidate) => candidate.frame >= 10) ?? movementEvents[0],
    movementEvents[Math.floor(movementEvents.length / 2)],
    movementEvents.at(-1),
  ]);
  const screenPadding = 96;
  const scale = Math.min((1920 - screenPadding * 2) / recording.metadata.width, (1080 - screenPadding * 2) / recording.metadata.height);
  const renderedWidth = Math.round(recording.metadata.width * scale);
  const renderedHeight = Math.round(recording.metadata.height * scale);
  const offsetX = Math.round((1920 - renderedWidth) / 2);
  const offsetY = Math.round((1080 - renderedHeight) / 2);
  return {
    cursorSamples: selectedEvents.map((event) => {
      const cursorX = Math.round(offsetX + Math.min(Math.max(0, event.x), recording.metadata.width - 28) * scale);
      const cursorY = Math.round(offsetY + Math.min(Math.max(0, event.y), recording.metadata.height - 36) * scale);
      return {
        event,
        timeSeconds: event.frame / recording.metadata.fps,
        point: { x: cursorX, y: cursorY },
        sample: sampleBrightDark(videoPath, {
          timeSeconds: event.frame / recording.metadata.fps,
          x: Math.min(Math.max(0, cursorX - 48), 1824),
          y: Math.min(Math.max(0, cursorY - 48), 984),
          width: 96,
          height: 96,
        }),
      };
    }),
  };
}

function uniqueEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event || seen.has(event.frame)) return false;
    seen.add(event.frame);
    return true;
  });
}

async function captureElectronPage(app, page, path) {
  const window = await app.browserWindow(page);
  const png = await window.evaluate(async (browserWindow) => {
    const image = await browserWindow.webContents.capturePage();
    return image.toPNG().toString('base64');
  });
  await writeFile(path, Buffer.from(png, 'base64'));
}

function probeDimensions(videoPath) {
  return JSON.parse(runCapture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', videoPath])).streams[0];
}

function sampleAverage(videoPath, crop) {
  const pixels = samplePixels(videoPath, crop);
  const totals = { red: 0, green: 0, blue: 0 };
  for (let index = 0; index < pixels.length; index += 3) {
    totals.red += pixels[index];
    totals.green += pixels[index + 1];
    totals.blue += pixels[index + 2];
  }
  const count = pixels.length / 3;
  return { red: totals.red / count, green: totals.green / count, blue: totals.blue / count };
}

function sampleBrightDark(videoPath, crop) {
  const pixels = samplePixels(videoPath, crop);
  let bright = 0;
  let dark = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (red > 238 && green > 238 && blue > 238) bright += 1;
    if (red < 85 && green < 85 && blue < 85) dark += 1;
  }
  return { bright, dark };
}

function samplePixels(videoPath, { timeSeconds = 0.5, x, y, width, height }) {
  return runBuffer('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, timeSeconds)), '-i', videoPath, '-frames:v', '1', '-vf', `crop=${width}:${height}:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
}

function assertColorClose(actual, expected, label) {
  const distance = Math.abs(actual.red - expected.red) + Math.abs(actual.green - expected.green) + Math.abs(actual.blue - expected.blue);
  if (distance > 90) throw new Error(`${label} missing or cropped: ${JSON.stringify({ actual, expected, distance })}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return result.stdout;
}

function runBuffer(command, args) {
  const result = spawnSync(command, args, { encoding: 'buffer' });
  if (result.stderr?.length) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return result.stdout;
}
