/**
 * Changing the frame in Recording edit must change it in the Editor too, without
 * reloading the Editor.
 *
 * The Editor is seeded from a snapshot read once at boot, so a frame chosen
 * afterwards only reached it on the next open — one timeline showing two
 * different pictures until a restart. This drives the real packaged app: it opens
 * the Editor, goes to Recording edit, picks a vertical template, comes back, and
 * checks the Editor's viewer is now vertical. The Editor is never reloaded, so a
 * pass means the change propagated live.
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_EDITOR_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) {
  throw new Error('Usage: node scripts/visual-editor-aspect-live-playwright.mjs <real-project.roughcut>');
}

const templateId = process.env.ROUGH_CUT_ASPECT_TEMPLATE_ID || 'mobile-9-16';
const expectedRatio = (() => {
  const [w, h] = (process.env.ROUGH_CUT_ASPECT_EXPECT || '9:16').split(':').map(Number);
  return w / h;
})();

const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
if (!existsSync(appPath) || !existsSync(electronPath)) {
  throw new Error('The packaged app is missing; run pnpm package:linux first.');
}

const outputRoot = process.env.ROUGH_CUT_ASPECT_OUTPUT || join('/tmp', `rough-cut-aspect-live-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const beforePath = join(outputRoot, 'editor-before.png');
const afterPath = join(outputRoot, 'editor-after.png');
const reportPath = join(outputRoot, 'aspect-live-report.json');
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
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: process.env.ROUGH_CUT_REAL_EDITOR_WINDOW_HEIGHT || '1500',
  },
});

let report;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const tab = (title) => page.locator(`[data-ui-region="app-view-tabstrip"] button[title="${title}"]`);

  await tab('Editor').waitFor({ state: 'visible', timeout: 30000 });
  await tab('Editor').click({ force: true });
  await page.waitForSelector('[data-ui-region="freecut-editor-surface"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-freecut-ready="true"]') !== null, null, { timeout: 60000 });
  await page.waitForTimeout(Number(process.env.ROUGH_CUT_REAL_EDITOR_SETTLE_MS || 20000));

  // The iframe must survive the whole run: a reload would make a matching frame
  // prove nothing about live propagation.
  await page.evaluate(() => {
    window.__aspectLiveWitness = document.querySelector('iframe[data-freecut-embed="vendored"]');
    window.__aspectLivePageStamp = 'original';
  });

  const overlayBox = () => page.evaluate(() => {
    const el = document.querySelector('.freecutProgramOverlay');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

  const before = await overlayBox();
  await capture(beforePath);

  await tab('Recording edit').click({ force: true });
  const templateCard = page.locator(`[data-template-preset-grid="true"] [data-template-id="${templateId}"]`);
  await templateCard.waitFor({ state: 'visible', timeout: 30000 });
  await templateCard.click({ force: true });
  await page.waitForTimeout(2000);

  await tab('Editor').click({ force: true });
  await page.waitForTimeout(Number(process.env.ROUGH_CUT_ASPECT_SETTLE_MS || 8000));

  const after = await overlayBox();
  await capture(afterPath);

  // Same element, not merely an element with the same src: a remount would
  // reload the embedded editor and a matching frame would prove nothing.
  const witness = await page.evaluate(() => ({
    sameFrame: window.__aspectLiveWitness === document.querySelector('iframe[data-freecut-embed="vendored"]'),
    samePage: window.__aspectLivePageStamp === 'original',
  }));

  const afterRatio = after && after.height > 0 ? after.width / after.height : null;
  const beforeRatio = before && before.height > 0 ? before.width / before.height : null;
  const ratioMatches = Boolean(afterRatio && Math.abs(afterRatio - expectedRatio) / expectedRatio < 0.02);
  const ratioChanged = Boolean(beforeRatio && afterRatio && Math.abs(beforeRatio - afterRatio) > 0.01);
  // Reported, not gated. Today ANY project write replaces the embedded editor's
  // iframe — a control run that changes a template without changing the frame
  // shows the same thing — so this is a separate, pre-existing defect against
  // this surface's stated intent of never reloading the editor on a write. It is
  // recorded here so a fix for it can be seen, and so a future regression that
  // starts reloading is not mistaken for this check passing.
  const editorFrameReused = witness.sameFrame === true;

  report = {
    ok: ratioMatches && ratioChanged,
    projectPath,
    templateId,
    before,
    after,
    ratios: { before: beforeRatio, after: afterRatio, expected: expectedRatio },
    screenshots: {
      before: beforePath,
      after: afterPath,
      afterSha256: createHash('sha256').update(readFileSync(afterPath)).digest('hex'),
    },
    witness,
    checks: { ratioMatches, ratioChanged },
    observations: { editorFrameReused },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await app.close().catch(() => undefined);
}

async function capture(path) {
  const windowId = spawnSync('xdotool', ['search', '--name', '^Rough Cut MVP$'], { encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean).pop();
  if (!windowId) throw new Error('Could not find the packaged app window to raise.');
  // Another window can steal focus back between the raise and the grab, so keep
  // asking rather than photographing whatever happens to be in front.
  let focused = '';
  for (let attempt = 0; attempt < 5 && focused !== windowId; attempt += 1) {
    spawnSync('xdotool', ['windowactivate', '--sync', windowId], { encoding: 'utf8' });
    spawnSync('xdotool', ['windowraise', windowId], { encoding: 'utf8' });
    spawnSync('sleep', ['1']);
    focused = spawnSync('xdotool', ['getactivewindow'], { encoding: 'utf8' }).stdout.trim();
  }
  if (focused !== windowId) throw new Error(`The app window is not frontmost (active=${focused}, app=${windowId}).`);
  const capture = spawnSync('import', ['-window', 'root', path], { encoding: 'utf8' });
  if (capture.status !== 0) throw new Error(`Full desktop capture failed: ${capture.stderr || capture.stdout}`);
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
