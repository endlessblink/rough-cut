import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const projectPath = process.argv[2];
if (!projectPath) {
  throw new Error('Usage: node scripts/repro-task098-playback.mjs /path/to/project.roughcut');
}

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
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
  },
});
const electronProcess = app.process();

try {
  const page = await app.firstWindow();
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  await page.waitForLoadState('domcontentloaded');
  await dismissPreRecordOverlay(page);
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 10000 });
  await page.waitForFunction(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    return videos.length > 0 && videos.every((video) => video.readyState >= 1);
  }, null, { timeout: 10000 });

  await inspect(page, 'initial');
  const playButton = page.locator('.videoControls button').first();
  await playButton.click();
  await page.waitForTimeout(1600);
  await inspect(page, 'after-play-1600ms');
  await page.waitForTimeout(2000);
  await inspect(page, 'after-play-3600ms');

  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Seek video"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing seek input');
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  await inspect(page, 'after-seek-max');

  await playButton.click();
  await page.waitForTimeout(1000);
  await inspect(page, 'after-replay-from-end');
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

async function inspect(page, label) {
  const report = await page.evaluate(() => ({
    draws: window.__roughCutCanvasDrawCount ?? 0,
    cameraFramePresent: window.__roughCutCameraFramePresent ?? null,
    timecode: document.querySelector('.timecode')?.textContent?.trim() ?? null,
    error: document.querySelector('.error')?.textContent?.trim() ?? null,
    seekInputs: Array.from(document.querySelectorAll('input')).map((input) => ({
      aria: input.getAttribute('aria-label'),
      value: input.value,
      min: input.min,
      max: input.max,
      step: input.step,
    })),
    videos: Array.from(document.querySelectorAll('video')).map((video, index) => ({
      index,
      src: video.currentSrc,
      duration: video.duration,
      currentTime: video.currentTime,
      readyState: video.readyState,
      seeking: video.seeking,
      paused: video.paused,
      ended: video.ended,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      error: video.error?.code ?? null,
    })),
  }));
  console.info(`${label}: ${JSON.stringify(report, null, 2)}`);
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}
