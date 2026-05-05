import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-visual-scrub-'));
const mediaPath = join(root, 'scrub-source.mp4');
const reportPath = join(root, 'visual-scrub-report.json');
const beforePath = join(root, 'before-scrub.png');
const midPath = join(root, 'during-scrub.png');
const afterPath = join(root, 'after-scrub.png');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildVisualScrubFilter(),
  '-t',
  '6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 6000);
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: 30,
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
  },
});
const electronProcess = app.process();

let report;
let failure;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 10000 });
  await page.addScriptTag({ content: `
    window.__roughCutScrubMonitor = (${createCanvasMonitor.toString()})();
  ` });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0;
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
  });
  await page.waitForFunction(() => window.__roughCutScrubMonitor.inspect().stats.ok, null, { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: beforePath, fullPage: true });

  const scrubber = page.locator('input[aria-label="Scrub timeline"]');
  const box = await scrubber.boundingBox();
  if (!box) throw new Error('Timeline scrubber bounding box was unavailable.');

  await page.evaluate(() => window.__roughCutScrubMonitor.start());
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height / 2);
  await page.mouse.down();
  for (const position of [0.16, 0.32, 0.48, 0.64, 0.8]) {
    await page.mouse.move(box.x + box.width * position, box.y + box.height / 2, { steps: 8 });
    if (position === 0.48) await page.screenshot({ path: midPath, fullPage: true });
  }
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const monitor = await page.evaluate(() => window.__roughCutScrubMonitor.stop());
  await page.screenshot({ path: afterPath, fullPage: true });

  report = {
    ok: monitor.frameCount >= 60 && monitor.badFrames.length === 0,
    root,
    projectPath: project.path,
    screenshots: { beforePath, midPath, afterPath },
    monitor,
  };
  if (!report.ok) {
    failure = new Error(`Preview scrub visual regression failed: ${JSON.stringify({ reportPath, root, badFrameCount: monitor.badFrames.length, firstBadFrames: monitor.badFrames.slice(0, 10), frameCount: monitor.frameCount })}`);
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
  frameCount: report?.monitor?.frameCount ?? 0,
  badFrameCount: report?.monitor?.badFrames?.length ?? 0,
}, null, 2));
if (failure) throw failure;

function buildVisualScrubFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    `drawtext=fontfile=${font}:text='SCRUB VISUAL TEST':fontcolor=white:fontsize=42:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=420:w=120:h=80:color=0xff0000:t=fill',
    'drawbox=x=420:y=420:w=120:h=80:color=0x00ff00:t=fill',
    'drawbox=x=800:y=420:w=120:h=80:color=0x0000ff:t=fill',
  ].join(',');
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

function createCanvasMonitor() {
  const state = {
    running: false,
    rafId: 0,
    frameCount: 0,
    badFrames: [],
    worstFrames: [],
  };

  function readCanvasColorStats() {
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return { saturation: 0, contrast: 0, darkRatio: 1, grayRatio: 1, ok: false, reason: 'missing-canvas' };
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { saturation: 0, contrast: 0, darkRatio: 1, grayRatio: 1, ok: false, reason: 'missing-context' };
    const sampleWidth = Math.min(220, canvas.width);
    const sampleHeight = Math.min(124, canvas.height);
    const startX = Math.floor((canvas.width - sampleWidth) / 2);
    const startY = Math.floor((canvas.height - sampleHeight) / 2);
    const data = context.getImageData(startX, startY, sampleWidth, sampleHeight).data;
    let saturation = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let dark = 0;
    let gray = 0;
    const pixels = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
      if (luma < 16) dark += 1;
      if (Math.abs(red - green) < 5 && Math.abs(green - blue) < 5) gray += 1;
    }
    const stats = {
      saturation: saturation / pixels,
      contrast: maxLuma - minLuma,
      darkRatio: dark / pixels,
      grayRatio: gray / pixels,
    };
    const looksBad = stats.saturation < 12 || stats.contrast < 20 || stats.darkRatio > 0.96 || stats.grayRatio > 0.9;
    return { ...stats, ok: !looksBad, reason: looksBad ? 'gray-or-blank' : null };
  }

  function sample(now) {
    if (!state.running) return;
    const video = document.querySelector('video');
    const scrubber = document.querySelector('input[aria-label="Scrub timeline"]');
    const stats = readCanvasColorStats();
    const frame = {
      index: state.frameCount,
      now,
      stats,
      video: video ? {
        currentTime: video.currentTime,
        readyState: video.readyState,
        seeking: video.seeking,
        paused: video.paused,
      } : null,
      scrubberValue: scrubber instanceof HTMLInputElement ? scrubber.value : null,
    };
    state.frameCount += 1;
    state.worstFrames.push(frame);
    state.worstFrames.sort((a, b) => (a.stats.contrast + a.stats.saturation) - (b.stats.contrast + b.stats.saturation));
    state.worstFrames = state.worstFrames.slice(0, 20);
    if (!stats.ok) state.badFrames.push(frame);
    state.rafId = requestAnimationFrame(sample);
  }

  return {
    start() {
      state.running = true;
      state.frameCount = 0;
      state.badFrames = [];
      state.worstFrames = [];
      state.rafId = requestAnimationFrame(sample);
    },
    inspect() {
      return { stats: readCanvasColorStats() };
    },
    stop() {
      state.running = false;
      cancelAnimationFrame(state.rafId);
      return {
        frameCount: state.frameCount,
        badFrames: state.badFrames,
        worstFrames: state.worstFrames,
      };
    },
  };
}
