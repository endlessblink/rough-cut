import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_EDITOR_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) {
  throw new Error('Usage: node scripts/visual-real-editor-playwright.mjs <real-project.roughcut>');
}

const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
if (!existsSync(appPath) || !existsSync(electronPath)) {
  throw new Error('The packaged app is missing; run pnpm package:linux first.');
}

const outputRoot = process.env.ROUGH_CUT_REAL_EDITOR_OUTPUT || join('/tmp', `rough-cut-real-editor-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const screenshotPath = join(outputRoot, 'real-editor.png');
const reportPath = join(outputRoot, 'real-editor-report.json');
const userDataPath = join(outputRoot, 'electron-user-data');
const { _electron: electron } = loadPlaywright();

const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'nle',
    ROUGH_CUT_UI_SMOKE_FREECUT_ONLY: '1',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: process.env.ROUGH_CUT_REAL_EDITOR_WINDOW_HEIGHT || '1500',
  },
});

let report;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const editorTab = page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]');
  await editorTab.waitFor({ state: 'visible', timeout: 30000 });
  await editorTab.click({ force: true });
  await page.waitForFunction(() => {
    const slot = document.querySelector('[data-ui-region="persistent-editor-slot"]');
    return slot instanceof HTMLElement && !slot.hidden;
  }, null, { timeout: 30000 });
  await page.waitForSelector('[data-ui-region="freecut-editor-surface"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-freecut-ready="true"]') !== null, null, { timeout: 60000 });
  // Readiness is the host's handshake, not the Editor's own project load — it
  // still has a migration/"Upgrading project…" pass in front of the viewer, and
  // capturing through that photographs a blank stage.
  await page.waitForTimeout(Number(process.env.ROUGH_CUT_REAL_EDITOR_SETTLE_MS || 1500));

  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      surface: box('[data-ui-region="freecut-editor-surface"]'),
      frame: box('iframe[data-freecut-embed="vendored"]'),
      overlay: box('.freecutProgramOverlay'),
      ready: document.querySelector('[data-freecut-ready="true"]') !== null,
      editorChrome: Boolean(document.querySelector('iframe[data-freecut-embed="vendored"]')),
    };
  });
  // Capture the complete virtual desktop while the packaged app is live; a
  // page screenshot can crop Electron's lower timeline even when the window
  // itself is healthy.
  // Raise the app first. The capture is of the whole root window, so anything the
  // user (or another agent) has in front of Electron is what gets photographed —
  // a screenshot of somebody else's terminal passes every geometry check.
  //
  // Matched by PID, not by title. Another Rough Cut window — the user's own copy,
  // or a leftover from an earlier run — carries the same title, and picking one of
  // those photographed a completely different project while the geometry probe
  // happily reported the launched window's healthy numbers.
  let windowId = null;
  for (let attempt = 0; attempt < 5 && !windowId; attempt += 1) {
    windowId = findAppWindow(app.process().pid);
    if (!windowId) spawnSync('sleep', ['1']);
  }
  if (!windowId) throw new Error('Could not find the launched app window to raise.');
  let focused = '';
  for (let attempt = 0; attempt < 5 && focused !== windowId; attempt += 1) {
    spawnSync('xdotool', ['windowactivate', '--sync', windowId], { encoding: 'utf8' });
    spawnSync('xdotool', ['windowraise', windowId], { encoding: 'utf8' });
    spawnSync('sleep', ['1']);
    focused = spawnSync('xdotool', ['getactivewindow'], { encoding: 'utf8' }).stdout.trim();
  }
  if (focused !== windowId) throw new Error(`The app window is not frontmost (active=${focused}, app=${windowId}).`);
  const desktopCapture = spawnSync('import', ['-window', 'root', screenshotPath], { encoding: 'utf8' });
  if (desktopCapture.status !== 0) throw new Error(`Full desktop capture failed: ${desktopCapture.stderr || desktopCapture.stdout}`);

  const frame = geometry.frame;
  const overlay = geometry.overlay;
  const epsilon = 2;
  const nonZeroGeometry = [geometry.surface, frame, overlay].every((rect) => rect && rect.width > 10 && rect.height > 10);
  const overlayInsideFrame = Boolean(nonZeroGeometry && frame && overlay
    && overlay.x >= frame.x - epsilon
    && overlay.y >= frame.y - epsilon
    && overlay.x + overlay.width <= frame.x + frame.width + epsilon
    && overlay.y + overlay.height <= frame.y + frame.height + epsilon);
  const screenshotSha256 = createHash('sha256').update(readFileSync(screenshotPath)).digest('hex');
  // The frame is a property of the project, so the Editor's viewer must be the
  // shape the project was cut to — not the recording's own shape. Without this
  // the surface geometry looks perfectly healthy while a vertical project is
  // shown letterboxed inside a wide viewer.
  const expectedAspect = process.env.ROUGH_CUT_REAL_EDITOR_EXPECT_ASPECT
    ? (() => {
      const [w, h] = process.env.ROUGH_CUT_REAL_EDITOR_EXPECT_ASPECT.split(':').map(Number);
      return w > 0 && h > 0 ? w / h : null;
    })()
    : null;
  const overlayAspect = overlay && overlay.height > 0 ? overlay.width / overlay.height : null;
  const aspectMatches = expectedAspect === null
    ? true
    : Boolean(overlayAspect && Math.abs(overlayAspect - expectedAspect) / expectedAspect < 0.02);
  report = {
    ok: geometry.ready && geometry.editorChrome && nonZeroGeometry && overlayInsideFrame && aspectMatches,
    projectPath,
    screenshotPath,
    screenshotSha256,
    geometry,
    aspect: { expected: expectedAspect, actual: overlayAspect },
    checks: { ready: geometry.ready, editorChrome: geometry.editorChrome, nonZeroGeometry, overlayInsideFrame, aspectMatches },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await app.close().catch(() => undefined);
}

/**
 * The mapped window belonging to this launch, found through the process tree —
 * Electron's window is owned by a renderer/helper child, not the pid Playwright
 * hands back, so a plain `xdotool search --pid` finds nothing.
 */
function findAppWindow(rootPid) {
  const pids = new Set();
  const walk = (pid) => {
    if (!pid || pids.has(pid)) return;
    pids.add(pid);
    const children = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .stdout.trim().split('\n').filter(Boolean);
    for (const child of children) walk(Number(child));
  };
  walk(rootPid);
  const titled = spawnSync('xdotool', ['search', '--name', '^Rough Cut MVP$'], { encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean);
  for (const id of titled) {
    const pid = Number(spawnSync('xdotool', ['getwindowpid', id], { encoding: 'utf8' }).stdout.trim());
    if (pids.has(pid)) return id;
  }
  return null;
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
