// Drives the PACKAGED app through real takes from the main window's Recording tab
// and asserts the UI at each phase: before / during / paused / after stop / after cancel.
// Run under xvfb: xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/verify-recording-tab-lifecycle.mjs
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _electron } = loadSharedPlaywright();

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const out = await mkdtemp(join(tmpdir(), 'rc-tab-lifecycle-'));
const userData = join(out, 'profile');
await mkdir(userData, { recursive: true });
const failures = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures.push(name);
};

const app = await _electron.launch({
  executablePath: join(artifactRoot, 'dock-launch.sh'),
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${userData}`, join(artifactRoot, 'resources', 'app')],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_DOCK_LAUNCH: '1',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1080',
  },
});
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForSelector('[data-ui-region="app-view-tabstrip"]', { timeout: 45000 });
await win.locator('[data-ui-region="app-view-tabstrip"] button', { hasText: /^\s*Recording\s*$/ }).first().click();
await win.waitForSelector('[data-ui-region="recording-workspace"]', { timeout: 20000 });

const snap = async (name) => {
  // Page screenshot stalls in packaged Electron; capture via webContents.
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const img = await w.webContents.capturePage();
    return img.toPNG().toString('base64');
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(out, `${name}.png`), Buffer.from(png, 'base64'));
};

const state = () => win.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const primary = document.querySelector('[data-recording-action="primary"]');
  return {
    primaryText: primary?.textContent?.trim() ?? null,
    primaryIsStop: primary?.classList.contains('stop') ?? false,
    topPause: q('.topActions [data-recording-action="pause-resume"]'),
    topRestart: q('.topActions [data-recording-action="restart"]'),
    stateBanner: q('[data-ui-region="state-banner"]'),
    bannerState: document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state') ?? null,
    prePanel: q('[data-ui-region="pre-record-panel"]'),
    liveStopButtons: q('[data-recording-action="stop"], [data-ui-region="recording-launcher-active"] [data-recording-action]'),
    bodyText: document.body.innerText.slice(0, 1500),
  };
});
const waitState = async (pred, label, ms = 30000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const s = await state(); if (pred(s)) return s; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`timeout waiting for ${label}; ${JSON.stringify(await state())}`);
};

async function oneTake(endAction) {
  console.log(`\n=== take ending with ${endAction} ===`);
  let s = await waitState((x) => x.prePanel > 0 && !x.primaryIsStop, 'idle pre-record');
  check(`[${endAction}] before: setup page shown, no Stop control`, s.prePanel > 0 && !s.primaryIsStop);
  await snap(`${endAction}-1-before`);

  await win.locator('button', { hasText: /Start recording/ }).first().click();
  s = await waitState((x) => x.bannerState !== 'x' && x.prePanel === 0, 'recording started', 40000);
  await new Promise((r) => setTimeout(r, 2500));
  s = await state();
  await snap(`${endAction}-2-during`);
  check(`[${endAction}] during: setup page gone`, s.prePanel === 0);
  check(`[${endAction}] during: no duplicate Pause/Restart in top bar`, s.topPause === 0 && s.topRestart === 0, JSON.stringify({ p: s.topPause, r: s.topRestart }));
  check(`[${endAction}] during: top bar has no second Stop button`, (await win.locator('.topActions [data-recording-action="primary"]').count()) === 0);
  check(`[${endAction}] during: no extra status banner`, s.stateBanner === 0, `banner=${s.stateBanner}`);

  // Pause then resume from the live panel
  const pauseBtn = win.locator('.recordingWorkspace button', { hasText: /^\s*Pause\s*$/ }).first();
  if (await pauseBtn.count()) {
    await pauseBtn.click();
    await new Promise((r) => setTimeout(r, 800));
    await snap(`${endAction}-3-paused`);
    const resume = win.locator('.recordingWorkspace button', { hasText: /Resume/ }).first();
    check(`[${endAction}] paused: panel offers Resume`, (await resume.count()) > 0);
    if (await resume.count()) await resume.click();
    await new Promise((r) => setTimeout(r, 800));
  } else {
    check(`[${endAction}] live panel has a Pause button`, false);
  }

  const endBtn = endAction === 'stop'
    ? win.locator('.recordingWorkspace button', { hasText: /^\s*Stop/ }).first()
    : win.locator('.recordingWorkspace button', { hasText: /Cancel/ }).first();
  check(`[${endAction}] live panel has its ${endAction} button`, (await endBtn.count()) > 0);
  await endBtn.click();

  // After: wait for the app to leave the recording state
  await waitState((x) => x.prePanel > 0 || x.primaryText === 'Record', 'recording ended', 60000);
  await new Promise((r) => setTimeout(r, 1500));
  s = await state();
  await snap(`${endAction}-4-after`);
  check(`[${endAction}] after: top button no longer red/Stop`, !s.primaryIsStop, s.primaryText ?? '');
  check(`[${endAction}] after: no Pause/Restart left in top bar`, s.topPause === 0 && s.topRestart === 0);
  check(`[${endAction}] after: state banner is not 'recording'`, s.bannerState !== 'recording' && s.bannerState !== 'paused', String(s.bannerState));
  check(`[${endAction}] after: no 'Stopping...' stuck`, !/Stopping\.\.\./.test(s.bodyText));
  return s;
}

try {
  const afterStop = await oneTake('stop');
  // A saved take opens Recording edit; go back to the Recording tab for the next take.
  await win.locator('[data-ui-region="app-view-tabstrip"] button', { hasText: /^\s*Recording\s*$/ }).first().click();
  await oneTake('cancel');
  const tray = await app.evaluate(() => ({ trayCount: globalThis.__rcTrayCount ?? null }));
  console.log('tray probe', JSON.stringify(tray));
} catch (err) {
  check('lifecycle ran to completion', false, String(err).slice(0, 400));
  await snap('error').catch(() => undefined);
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))]);
}
console.log(`\nScreenshots in: ${out}`);
console.log(failures.length ? `FAILED: ${failures.join(' | ')}` : 'ALL PASSED');
process.exit(failures.length ? 1 : 0);
