/**
 * Drives the freshly packaged app back and forth between Recording edit and the
 * Editor with a real project, and checks the things a data-shape test cannot
 * see: that each view actually paints its own chrome, that the embedded Editor
 * is hidden rather than destroyed when you leave it, and that coming back finds
 * the same live session rather than a fresh one.
 *
 * The invariant that matters: leaving the Editor must not unmount it. Unmounting
 * tears down the embedded editor's document along with any edit not yet written,
 * which is exactly the "my layer disappeared" bug. So the iframe is stamped on
 * the first visit and the stamp must survive every later switch.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_PANE_SWITCH_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) {
  throw new Error('Usage: node scripts/pane-switch-e2e-playwright.mjs <real-project.roughcut>');
}

const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
if (!existsSync(appPath) || !existsSync(electronPath)) {
  throw new Error('The packaged app is missing; run pnpm package:linux first.');
}

const outputRoot = process.env.ROUGH_CUT_PANE_SWITCH_OUTPUT || join('/tmp', `rough-cut-pane-switch-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const reportPath = join(outputRoot, 'pane-switch-report.json');
const userDataPath = join(outputRoot, 'electron-user-data');
const settleMs = Number(process.env.ROUGH_CUT_PANE_SWITCH_SETTLE_MS || 1500);
const watchdogMs = Number(process.env.ROUGH_CUT_PANE_SWITCH_WATCHDOG_MS || 120000);
const { _electron: electron } = loadPlaywright();

const consoleErrors = [];
const steps = [];
let report;
let currentStep = 'launch';
const watchdog = setTimeout(() => {
  const timeoutReport = {
    ok: false,
    projectPath,
    reportPath,
    error: `Pane-switch watchdog timed out after ${watchdogMs}ms at step: ${currentStep}`,
    steps,
    consoleErrors: consoleErrors.slice(0, 20),
  };
  writeFileSync(reportPath, `${JSON.stringify(timeoutReport, null, 2)}\n`, 'utf8');
  process.exit(124);
}, watchdogMs);

const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: process.env.ROUGH_CUT_PANE_SWITCH_WINDOW_HEIGHT || '1000',
    ROUGH_CUT_SCREEN_LAYER_RENDERER: process.env.ROUGH_CUT_SCREEN_LAYER_RENDERER || 'canvas2d',
  },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  await page.waitForLoadState('domcontentloaded');
  page.on('pageerror', (error) => consoleErrors.push({ kind: 'pageerror', text: String(error) }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ kind: 'console', text: message.text().slice(0, 400) });
  });
  page.on('requestfailed', (request) => {
    consoleErrors.push({ kind: 'requestfailed', text: `${request.failure()?.errorText ?? 'request failed'} ${request.url()}`.slice(0, 400) });
  });

  const tab = (label) => page.locator(`[data-ui-region="app-view-tabstrip"] button[title="${label}"]`);
  const activeView = () => page.evaluate(() => document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') ?? null);

  const probe = () => page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    const slot = document.querySelector('[data-ui-region="persistent-editor-slot"]');
    const surface = document.querySelector('[data-ui-region="freecut-editor-surface"]');
    const frame = document.querySelector('iframe[data-freecut-embed="vendored"]');
    return {
      activeView: document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') ?? null,
      editorSlotHidden: slot instanceof HTMLElement ? slot.hidden : null,
      freecutReady: surface?.getAttribute('data-freecut-ready') === 'true',
      freecutProjectId: surface?.getAttribute('data-freecut-project-id') ?? null,
      // Survives only if the element itself was never remounted.
      freecutStamp: frame ? frame.dataset.paneSwitchStamp ?? null : null,
      recordingWorkspace: box('[data-ui-region="editor-workspace"]'),
      centralStage: box('[data-ui-region="central-stage"]'),
      freecutFrame: box('iframe[data-freecut-embed="vendored"]'),
    };
  });

  const goTo = async (label, expectedView) => {
    currentStep = `switch to ${label}`;
    await tab(label).waitFor({ state: 'visible', timeout: 30000 });
    await tab(label).click({ force: true });
    await page.waitForFunction(
      (view) => document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') === view,
      expectedView,
      { timeout: 30000 },
    );
    await page.waitForTimeout(settleMs);
    const state = await probe();
    steps.push({ step: `switch to ${label}`, ...state });
    return state;
  };

  // Recording edit is where a project lands, so start by proving it paints.
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 60000 });
  currentStep = 'startup recording surface';
  await page.waitForTimeout(settleMs);
  const startState = await probe();
  steps.push({ step: 'startup (Recording edit)', ...startState });

  const firstEditor = await goTo('Editor', 'nle');
  currentStep = 'first Editor readiness';
  await page.waitForFunction(() => document.querySelector('[data-freecut-ready="true"]') !== null, null, { timeout: 60000 });
  await page.waitForTimeout(settleMs);
  // Stamp the live iframe. Any later switch that loses this stamp remounted the
  // embedded editor and would have thrown away unsaved work with it.
  await page.evaluate(() => {
    const frame = document.querySelector('iframe[data-freecut-embed="vendored"]');
    if (frame) frame.dataset.paneSwitchStamp = 'stamped';
  });
  const stampedEditor = await probe();
  steps.push({ step: 'Editor stamped', ...stampedEditor });

  const backToRecording = await goTo('Recording edit', 'editor');
  const secondEditor = await goTo('Editor', 'nle');
  currentStep = 'rapid pane switching';

  // Rapid round trips shake out races the settled switches above would miss.
  const rapid = [];
  for (let pass = 0; pass < 3; pass += 1) {
    await tab('Recording edit').click({ force: true });
    await tab('Editor').click({ force: true });
    await page.waitForTimeout(400);
    rapid.push(await probe());
  }
  await page.waitForTimeout(settleMs);
  const afterRapid = await probe();
  steps.push({ step: 'after rapid switching', ...afterRapid });

  // Screenshot the page under test, not the desktop. A full-desktop grab has to
  // find and raise the right window first, and picking the wrong one photographs
  // another Rough Cut instance entirely — which happened here, producing a
  // healthy-looking picture of a completely different project. It also drags
  // whatever else is on screen into an artifact that gets shared.
  // Electron's own window capture, not page.screenshot: the Editor's live
  // compositor never goes idle, and Playwright's screenshot waits for that and
  // times out.
  currentStep = 'capture pane screenshot';
  const screenshotPath = join(outputRoot, 'pane-switch-final.png');
  let screenshotCaptured = false;
  let screenshotError = null;
  try {
    const cdp = await page.context().newCDPSession(page);
    const cdpShot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(screenshotPath, Buffer.from(cdpShot.data, 'base64'));
    screenshotCaptured = true;
  } catch (cdpError) {
    screenshotError = cdpError instanceof Error ? cdpError.message : String(cdpError);
  }
  if (!screenshotCaptured) try {
    const png = await Promise.race([
      app.evaluate(async ({ BrowserWindow }) => {
        const target = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
        const image = await target.capturePage();
        return image.toPNG().toString('base64');
      }),
       new Promise((_, reject) => setTimeout(() => reject(new Error('Electron capturePage timed out after 30000ms')), 30000)),
    ]);
    writeFileSync(screenshotPath, Buffer.from(png, 'base64'));
    screenshotCaptured = true;
  } catch (error) {
    screenshotError = `${screenshotError ? `${screenshotError}; ` : ''}${error instanceof Error ? error.message : String(error)}`;
    try {
       await page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 30000 });
      screenshotCaptured = true;
    } catch (fallbackError) {
      screenshotError = `${screenshotError}; page screenshot fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`;
    }
  }
  const shotProjectId = await page.evaluate(() => document.querySelector('[data-freecut-project-id]')?.getAttribute('data-freecut-project-id') ?? null);

  const nonBlank = (box) => Boolean(box && box.width > 200 && box.height > 200);
  const ignoredTransitionErrors = consoleErrors.filter((entry) => {
    const text = entry.text ?? '';
    return text.includes('ERR_ABORTED')
      || text.includes('Failed to load resource: net::ERR_FAILED')
      || (text.includes('ERR_FAILED') && text.includes('__program'));
  });
  const actionableErrors = consoleErrors.filter((entry) => !ignoredTransitionErrors.includes(entry));
  const checks = {
    recordingEditPaintsAtStartup: nonBlank(startState.recordingWorkspace) && nonBlank(startState.centralStage),
    editorPaintsOnFirstVisit: firstEditor.activeView === 'nle' && nonBlank(stampedEditor.freecutFrame) && stampedEditor.freecutReady,
    editorHiddenWhenAway: backToRecording.editorSlotHidden === true,
    recordingEditPaintsAfterReturn: nonBlank(backToRecording.recordingWorkspace) && nonBlank(backToRecording.centralStage),
    editorSurvivesSwitch: secondEditor.freecutStamp === 'stamped',
    editorStillReadyAfterReturn: secondEditor.freecutReady === true,
    editorPaintsAfterReturn: nonBlank(secondEditor.freecutFrame),
    projectIdentityStable: [stampedEditor, secondEditor, afterRapid]
      .every((state) => state.freecutProjectId && state.freecutProjectId === stampedEditor.freecutProjectId),
    survivesRapidSwitching: afterRapid.freecutStamp === 'stamped' && afterRapid.freecutReady && nonBlank(afterRapid.freecutFrame),
    noRendererErrors: actionableErrors.length === 0,
    screenshotCaptured,
    // Guards against the artifact showing some other Rough Cut window.
    screenshotIsProjectUnderTest: Boolean(shotProjectId) && shotProjectId === stampedEditor.freecutProjectId,
  };

  report = {
    ok: Object.values(checks).every(Boolean),
    projectPath,
    screenshotProjectId: shotProjectId,
    screenshotPath,
    screenshotSha256: screenshotCaptured ? createHash('sha256').update(readFileSync(screenshotPath)).digest('hex') : null,
    screenshotError,
    checks,
    consoleErrors: consoleErrors.slice(0, 20),
    ignoredTransitionErrors: ignoredTransitionErrors.slice(0, 20),
    steps,
    rapid,
  };
} finally {
  await app.close().catch(() => undefined);
  clearTimeout(watchdog);
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
