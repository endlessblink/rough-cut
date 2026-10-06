import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
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
const dockLaunchPath = process.env.ROUGH_CUT_REAL_EDITOR_EXECUTABLE || join(artifactRoot, 'dock-launch.sh');
if (!existsSync(appPath) || !existsSync(electronPath) || !existsSync(dockLaunchPath)) {
  throw new Error('The packaged app is missing; run pnpm package:linux first.');
}

const outputRoot = process.env.ROUGH_CUT_REAL_EDITOR_OUTPUT || join('/tmp', `rough-cut-real-editor-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const screenshotPath = join(outputRoot, 'real-editor.png');
const reportPath = join(outputRoot, 'real-editor-report.json');
const userDataPath = join(outputRoot, 'electron-user-data');
const { _electron: electron } = loadPlaywright();

  const app = await electron.launch({
    executablePath: dockLaunchPath,
    chromiumSandbox: true,
  args: ['--enable-sandbox', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, ...(process.env.ROUGH_CUT_REAL_EDITOR_EXECUTABLE ? [] : [appPath])],
    env: {
      ...process.env,
      APPIMAGE_EXTRACT_AND_RUN: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_DOCK_LAUNCH: '1',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: process.env.ROUGH_CUT_REAL_EDITOR_WINDOW_HEIGHT || '1500',
  },
});

let report;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 30000 });
  await page.waitForSelector('[data-ui-region="central-stage"] canvas.styledPreviewCanvas', { timeout: 30000 });
  // Optional: open a tool tab and park the playhead, to photograph a specific state.
  if (process.env.ROUGH_CUT_REAL_EDITOR_TOOL) {
    await page.locator(`.toolRail button[aria-label="${process.env.ROUGH_CUT_REAL_EDITOR_TOOL}"]`).click();
  }
  if (process.env.ROUGH_CUT_REAL_EDITOR_SEEK_SEC) {
    await page.locator('input.timelineScrubber').fill(process.env.ROUGH_CUT_REAL_EDITOR_SEEK_SEC);
  }
  // Let the first decoded frame land before photographing the stage.
  await page.waitForTimeout(Number(process.env.ROUGH_CUT_REAL_EDITOR_SETTLE_MS || 1500));

  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const tabs = Array.from(document.querySelectorAll('[data-ui-region="app-view-tabstrip"] button'))
      .map((button) => button.textContent?.trim() ?? '');
    return {
      stage: box('[data-ui-region="central-stage"]'),
      frame: box('[data-ui-region="central-stage"] canvas.styledPreviewCanvas'),
      timeline: box('[data-ui-region="timeline-review-rail"]'),
      tabs,
      activeView: document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') ?? null,
    };
  });
  // Capture the complete desktop after raising the matched packaged app. The full
  // desktop proves the dock-launched scope; the window is matched by the launched
  // process tree, not title alone, so another Rough Cut instance cannot satisfy it.
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
  if (focused !== windowId && process.env.ROUGH_CUT_ALLOW_NONFRONTMOST !== '1') {
    throw new Error(`The app window is not frontmost (active=${focused}, app=${windowId}).`);
  }
  const desktopCapture = spawnSync('import', ['-window', windowId, screenshotPath], { encoding: 'utf8' });
  if (desktopCapture.status !== 0) throw new Error(`Full desktop capture failed: ${desktopCapture.stderr || desktopCapture.stdout}`);

  const { stage, frame, timeline } = geometry;
  const nonZeroGeometry = [stage, frame, timeline].every((rect) => rect && rect.width > 10 && rect.height > 10);
  const frameInsideStage = Boolean(stage && frame
    && frame.x >= stage.x - 1 && frame.y >= stage.y - 1
    && frame.x + frame.width <= stage.x + stage.width + 1
    && frame.y + frame.height <= stage.y + stage.height + 1);
  const onRecordingEdit = geometry.activeView === 'editor';
  const screenshotSha256 = createHash('sha256').update(readFileSync(screenshotPath)).digest('hex');
  // The frame is a property of the project, so the viewer must be the shape the
  // project was cut to — not the recording's own shape.
  const expectedAspect = process.env.ROUGH_CUT_REAL_EDITOR_EXPECT_ASPECT
    ? (() => {
      const [w, h] = process.env.ROUGH_CUT_REAL_EDITOR_EXPECT_ASPECT.split(':').map(Number);
      return w > 0 && h > 0 ? w / h : null;
    })()
    : null;
  const frameAspect = frame && frame.height > 0 ? frame.width / frame.height : null;
  const aspectMatches = expectedAspect === null
    ? true
    : Boolean(frameAspect && Math.abs(frameAspect - expectedAspect) / expectedAspect < 0.02);
  report = {
    ok: onRecordingEdit && nonZeroGeometry && frameInsideStage && aspectMatches,
    projectPath,
    screenshotPath,
    screenshotSha256,
    geometry,
    aspect: { expected: expectedAspect, actual: frameAspect },
    checks: { onRecordingEdit, nonZeroGeometry, frameInsideStage, aspectMatches },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  if (process.env.ROUGH_CUT_REAL_EDITOR_HOLD === '1' && report?.ok) {
    for (let i = 0; i < 180 && !existsSync(join(outputRoot, 'stop-review')); i++) await new Promise(resolve => setTimeout(resolve, 10000));
  }
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
  return loadSharedPlaywright();
}
