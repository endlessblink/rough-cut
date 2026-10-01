import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acquireExportTestLock } from './export-test-lock.mjs';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_PREVIEW_PARITY_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) throw new Error('Usage: node scripts/visual-preview-export-parity-playwright.mjs <real-project.roughcut>');

acquireExportTestLock(
  process.env.ROUGH_CUT_EXPORT_TEST_LOCK || join(tmpdir(), 'rough-cut-video-export-test.lock'),
);

const outputRoot = resolve(process.env.ROUGH_CUT_PREVIEW_PARITY_OUTPUT || `/tmp/rough-cut-preview-parity-${Date.now()}`);
const parityTimeSec = Number(process.env.ROUGH_CUT_PREVIEW_PARITY_TIME_SEC || 0.5);
await mkdir(outputRoot, { recursive: true });
const exportPath = resolve(process.env.ROUGH_CUT_PREVIEW_PARITY_EXISTING_EXPORT || join(outputRoot, 'styled-export.mp4'));
const previewFramePath = join(outputRoot, 'preview-frame.png');
const exportFramePath = join(outputRoot, 'export-frame.png');
const normalizedExportFramePath = join(outputRoot, 'export-frame-normalized.png');
const previewLumaPath = join(outputRoot, 'preview-luma.png');
const exportLumaPath = join(outputRoot, 'export-luma.png');
const previewChannelPaths = ['r', 'g', 'b'].map((channel) => join(outputRoot, `preview-${channel}.png`));
const exportChannelPaths = ['r', 'g', 'b'].map((channel) => join(outputRoot, `export-${channel}.png`));
const reportPath = join(outputRoot, 'preview-export-parity-report.json');
const packagedRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const electronPath = join(packagedRoot, 'electron');
const appPath = join(packagedRoot, 'resources', 'app');
if (!existsSync(electronPath) || !existsSync(appPath)) throw new Error('The packaged app is missing; run pnpm package:linux first.');

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${join(outputRoot, 'electron-user-data')}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1500',
    ROUGH_CUT_SCREEN_LAYER_RENDERER: process.env.ROUGH_CUT_SCREEN_LAYER_RENDERER || 'canvas2d',
  },
});

let report;
let previewDiagnostics = null;
try {
  const page = await app.firstWindow();
  await page.evaluate(() => {
    window.__roughCutParityCapture = true;
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const target = window;
    return target.__roughCutBackgroundImageReady !== false;
  }, null, { timeout: 30000 });
  await page.evaluate((timeSec) => {
    const target = window;
    if (typeof target.__roughCutSetPreviewTimeSec !== 'function') throw new Error('Preview seek test hook is missing.');
    target.__roughCutSetPreviewTimeSec(timeSec);
  }, parityTimeSec);
  // The overlay frame-diagnostics hook went away with the separate Editor tab;
  // wait for the screen video to settle at the requested time instead.
  await page.waitForFunction((timeSec) => {
    const video = document.querySelector('video');
    return Boolean(video) && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - timeSec) <= 0.1;
  }, parityTimeSec, { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const previewDataUrl = await page.locator('canvas.styledPreviewCanvas').evaluate((canvas) => canvas.toDataURL('image/png'));
  writeFileSync(previewFramePath, Buffer.from(previewDataUrl.split(',')[1], 'base64'));
  previewDiagnostics = await page.evaluate(() => ({
    videos: Array.from(document.querySelectorAll('video')).map((video) => ({
      src: video.currentSrc || video.src,
      currentTime: video.currentTime,
      readyState: video.readyState,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    })),
    backgroundImageReady: window.__roughCutBackgroundImageReady ?? null,
    renderer: window.__roughCutScreenLayerRenderer ?? null,
    overlayDiagnostics: window.__roughCutOverlayDiag ?? null,
  }));
  if (process.env.ROUGH_CUT_PREVIEW_PARITY_SKIP_EXPORT !== '1') {
    await page.locator('[data-ui-region="export-popover-toggle"][aria-pressed="false"]').click().catch(() => {});
    await page.locator('button.exportFormat[data-export-format="styled"]').click();
    await page.locator('[data-export-action="export"]').click();
    await page.waitForFunction(() => document.body.textContent?.includes('Exported to:'), null, { timeout: 900000 });
  }
} finally {
  await app.close().catch(() => undefined);
}

run('ffmpeg', ['-y', '-ss', String(parityTimeSec), '-i', exportPath, '-frames:v', '1', exportFramePath]);
const previewDimensions = probeImage(previewFramePath);
const exportDimensions = probeImage(exportFramePath);
run('convert', [exportFramePath, '-resize', `${previewDimensions.width}x${previewDimensions.height}!`, normalizedExportFramePath]);
const normalizedExportDimensions = probeImage(normalizedExportFramePath);
const ssim = compareSsim(previewFramePath, normalizedExportFramePath);
run('convert', [previewFramePath, '-colorspace', 'gray', previewLumaPath]);
run('convert', [normalizedExportFramePath, '-colorspace', 'gray', exportLumaPath]);
const lumaSsim = compareSsim(previewLumaPath, exportLumaPath);
for (const [index, channel] of ['R', 'G', 'B'].entries()) {
  run('convert', [previewFramePath, '-channel', channel, '-separate', previewChannelPaths[index]]);
  run('convert', [normalizedExportFramePath, '-channel', channel, '-separate', exportChannelPaths[index]]);
}
const channelSsim = previewChannelPaths.map((path, index) => compareSsim(path, exportChannelPaths[index]));
const minChannelSsim = Math.min(...channelSsim);
const meanChannelSsim = channelSsim.reduce((sum, value) => sum + value, 0) / channelSsim.length;
const checks = {
  previewFrameCaptured: existsSync(previewFramePath),
  exportFrameCaptured: existsSync(exportFramePath),
  sameDimensions: previewDimensions.width === normalizedExportDimensions.width && previewDimensions.height === normalizedExportDimensions.height,
  lumaSimilarity: lumaSsim >= 0.85,
  channelSimilarity: minChannelSsim >= 0.80,
};
report = {
  ok: Object.values(checks).every(Boolean),
  projectPath,
  previewFramePath,
  exportFramePath,
  exportPath,
  parityTimeSec,
  previewDimensions,
  exportDimensions,
  normalizedExportDimensions,
  normalizedExportFramePath,
  previewDiagnostics,
  ssim,
  lumaSsim,
  channelSsim,
  minChannelSsim,
  meanChannelSsim,
  checks,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({ ...report, reportPath }, null, 2));
if (!report.ok) process.exitCode = 1;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
}

function probeImage(path) {
  const output = execFileSync('identify', ['-format', '%w %h', path], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
  return { width: output[0], height: output[1] };
}

function compareSsim(left, right) {
  const result = spawnSync('compare', ['-metric', 'SSIM', left, right, 'null:'], { encoding: 'utf8' });
  const value = Number((result.stderr || result.stdout).trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : 0;
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
