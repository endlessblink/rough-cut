import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-region-selector-'));
const screenshotPath = join(root, 'region-selector.png');
const reportPath = join(root, 'region-selector-report.json');

await mkdir(root, { recursive: true });

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
  },
});

let report;
let failure;
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(720, 520);
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-ui-region="pre-record-panel"]', { timeout: 10000 });

  await page.locator('[data-source-option="region"]').click();
  await page.locator('[data-ui-region="capture-screen-picker"]').waitFor({ timeout: 10000 });
  const initialPanelBounds = await assertPreRecordFooterVisible(page);
  const firstScreen = page.locator('[data-screen-option]').first();
  await firstScreen.scrollIntoViewIfNeeded();

  const cancelOverlayPromise = app.waitForEvent('window', { timeout: 10000 });
  await firstScreen.click();
  const cancelOverlay = await cancelOverlayPromise;
  await cancelOverlay.waitForLoadState('domcontentloaded');
  await cancelOverlay.locator('#cancel').click();
  await page.locator('[data-ui-region="capture-screen-picker"]').waitFor({ timeout: 10000 });

  const overlayPromise = app.waitForEvent('window', { timeout: 10000 });
  await firstScreen.click();
  const overlay = await overlayPromise;
  await overlay.waitForLoadState('domcontentloaded');
  await overlay.waitForSelector('#selection', { timeout: 10000 });
  await overlay.screenshot({ path: screenshotPath });

  await overlay.mouse.move(120, 110);
  await overlay.mouse.down();
  await overlay.mouse.move(520, 360, { steps: 8 });
  await overlay.mouse.up();
  await overlay.locator('#apply').click();

  await page.locator('[aria-label="Selected capture region"]').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => {
    const select = document.querySelector('select[aria-label="Capture target"]');
    const summary = document.querySelector('[aria-label="Selected capture region"]');
    const picker = document.querySelector('[data-ui-region="capture-screen-picker"]');
    return select?.value === 'region' && !picker && /400\s*x\s*250/.test(summary?.textContent ?? '');
  }, null, { timeout: 10000 });

  report = {
    ok: true,
    captureTarget: await page.locator('select[aria-label="Capture target"]').inputValue(),
    regionSummary: await page.locator('[aria-label="Selected capture region"]').innerText(),
    hasScreenPickerAfterApply: await page.locator('[data-ui-region="capture-screen-picker"]').count() > 0,
    preRecordPanelBounds: initialPanelBounds,
    screenshotPath,
    reportPath,
  };
} catch (error) {
  failure = error;
  report = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    bodyText: await app.firstWindow().then((window) => window.locator('body').innerText()).catch(() => null),
    screenshotPath,
    reportPath,
  };
} finally {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await app.close().catch(() => undefined);
}

console.info(JSON.stringify(report, null, 2));
if (failure) throw failure;

async function assertPreRecordFooterVisible(page) {
  const bounds = await page.evaluate(() => {
    const panel = document.querySelector('[data-ui-region="pre-record-panel"] .preRecordPanel');
    const footer = document.querySelector('[data-ui-region="pre-record-panel"] .preRecordFooter');
    const startButton = document.querySelector('[data-recording-start="pre-record"]');
    if (!panel || !footer || !startButton) return null;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const panelRect = panel.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const startRect = startButton.getBoundingClientRect();
    return {
      viewport,
      panel: rectToObject(panelRect),
      footer: rectToObject(footerRect),
      startButton: rectToObject(startRect),
    };

    function rectToObject(rect) {
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
    }
  });
  if (!bounds) throw new Error('Pre-record panel footer visibility assertion could not find required elements.');
  const tolerance = 1;
  if (bounds.panel.bottom > bounds.viewport.height + tolerance) {
    throw new Error(`Pre-record panel is clipped by viewport: ${JSON.stringify(bounds)}`);
  }
  if (bounds.footer.bottom > bounds.panel.bottom + tolerance || bounds.startButton.bottom > bounds.panel.bottom + tolerance) {
    throw new Error(`Pre-record footer controls are clipped by panel: ${JSON.stringify(bounds)}`);
  }
  return bounds;
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}
