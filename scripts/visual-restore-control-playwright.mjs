import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) throw new Error('Usage: node scripts/visual-restore-control-playwright.mjs <real-project.roughcut>');

const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
if (!existsSync(appPath) || !existsSync(electronPath)) throw new Error('Package the app before running restore-control proof.');

const outputRoot = process.env.ROUGH_CUT_RESTORE_CONTROL_OUTPUT || join('/tmp', `rough-cut-restore-control-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const screenshotPath = join(outputRoot, 'restore-control.png');
const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${join(outputRoot, 'electron-user-data')}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1500',
  },
});

try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const recordingTab = page.locator('[data-ui-region="app-view-tabstrip"] button[title="Recording edit"]');
  await recordingTab.waitFor({ state: 'attached', timeout: 30000 });
  await recordingTab.evaluate((button) => button.click());
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 30000 });
  const timelineTool = page.locator('nav[aria-label="Editor tools"] button[aria-label="Timeline"]');
  await timelineTool.waitFor({ state: 'visible', timeout: 30000 });
  await timelineTool.evaluate((button) => button.click());
  const templateId = process.env.ROUGH_CUT_RESTORE_CONTROL_TEMPLATE_ID;
  if (templateId) {
    const backgroundTool = page.locator('nav[aria-label="Editor tools"] button[aria-label="Background"]');
    await backgroundTool.evaluate((button) => button.click());
    const template = page.locator(`[data-template-id="${templateId}"]`);
    await template.waitFor({ state: 'visible', timeout: 30000 });
    await template.evaluate((button) => button.click());
    await page.waitForTimeout(800);
  }
  const control = page.getByRole('button', { name: 'Restore original recording' });
  if (!templateId) {
    await control.waitFor({ state: 'visible', timeout: 30000 });
    await control.click();
    await page.waitForTimeout(1200);
  }
  const requestedTimeSec = Number(process.env.ROUGH_CUT_RESTORE_CONTROL_TIME_SEC);
  if (Number.isFinite(requestedTimeSec)) {
    await page.evaluate((timeSec) => window.__roughCutSetPreviewTimeSec?.(timeSec), requestedTimeSec);
    await page.waitForTimeout(Number(process.env.ROUGH_CUT_RESTORE_CONTROL_SETTLE_MS) || 1200);
  }
  const controlVisible = await control.isVisible().catch(() => false);
  const enabled = controlVisible ? await control.isEnabled() : true;
  const runtimeLayout = await page.evaluate(() => ({
    cameraRect: window.__roughCutCanvasCameraRect ?? null,
    cameraFramePresent: window.__roughCutCameraFramePresent ?? false,
    renderer: window.__roughCutScreenLayerRenderer ?? null,
    activeTemplates: Array.from(document.querySelectorAll('[data-template-id][aria-pressed="true"]')).map((node) => node.getAttribute('data-template-id')),
    canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => {
      const ctx = canvas.getContext('2d');
      const sample = (x, y) => {
        const pixel = ctx?.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
        return pixel ? Array.from(pixel) : null;
      };
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return { className: canvas.className, width: canvas.width, height: canvas.height, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0, parent: canvas.parentElement?.getAttribute('data-ui-region') ?? canvas.parentElement?.className ?? null, samples: { topLeft: sample(0.1, 0.1), center: sample(0.5, 0.5), topRight: sample(0.9, 0.1), bottomRight: sample(0.9, 0.9) } };
    }),
    runtimeReport: window.__roughCutPlaybackDebugReport ?? null,
    media: (() => {
      const videos = Array.from(document.querySelectorAll('video'));
      return videos.map((video) => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, 2, 2);
        const center = ctx?.getImageData(1, 1, 1, 1).data;
        return { src: video.currentSrc, currentTime: video.currentTime, duration: video.duration, width: video.videoWidth, height: video.videoHeight, centerRgb: center ? Array.from(center) : null };
      });
    })(),
  }));
  await page.screenshot({ path: screenshotPath, timeout: 60000 });
  const report = {
    ok: enabled,
    projectPath,
    screenshotPath,
    restoreControlVisible: controlVisible,
    restoreControlEnabled: enabled,
    currentTimeSec: Number.isFinite(requestedTimeSec) ? requestedTimeSec : 0,
    runtimeLayout,
    editorWorkspaceVisible: true,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await app.close().catch(() => undefined);
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
