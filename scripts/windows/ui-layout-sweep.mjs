// Layout sweep of the packaged Windows app: opens every main screen at several window sizes and display scalings and
// reports controls that are covered by another element, plus text that is cut off. Needs no real input: it makes no
// mouse moves, records nothing and is safe to run while the PC is in use (it only opens its own windows).
//
//   node scripts/windows/ui-layout-sweep.mjs [--exe <Rough Cut.exe>] [--scales 1,1.25,1.5,2] [--sizes 900x600,1100x620,...]
//        [--shots <folder>] [--camera]
//
// How "covered" is decided: for each visible button, field, label, heading and icon, five points inside its visible
// part are asked "which element is on top here?". If that element is not the control itself, one of its descendants or
// one of its ancestors, the control is hidden under something else at that point. Two or more such points = a problem.
// Exits 0 when nothing is covered anywhere; otherwise 1, with each offender and a screenshot of the first few.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const exe = argValue('--exe') ?? join(root, 'dist', 'rough-cut-mvp-win32-x64', 'Rough Cut.exe');
const scales = (argValue('--scales') ?? '1,1.25,1.5,2').split(',').map(Number);
const sizes = (argValue('--sizes') ?? '860x560,900x600,1024x640,1100x620,1280x720,1366x768,1536x864,1920x1080').split(',').map((s) => s.split('x').map(Number));
const shotsDir = argValue('--shots');
const withCamera = args.includes('--camera');
// Self-test of the detector: puts the layout bugs fixed on 2026-10-18 back, so the sweep must report them.
const reintroduceOldBugs = args.includes('--reintroduce-old-bugs');
const OLD_BUG_CSS = '.projectEditor > .toolRail { overflow: hidden !important; } .toolRail .toolButton { flex: 0 1 auto !important; min-height: 0 !important; } .preRecordControls { min-height: 0 !important; } .preRecordBody { grid-auto-rows: auto !important; }';

const require = createRequire(join(root, 'package.json'));
const { _electron } = require('playwright-core');
const { saveProjectForRecording } = await import(pathToFileURL(join(root, 'apps/desktop/src/main/project-files.mjs')).href);

const base = mkdtempSync(join(tmpdir(), 'rough-cut-layout-sweep-'));
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr ?? '').slice(-300)}`);
};

// Runs inside the page. Returns { covered: [...], clipped: [...] }.
function inspectLayout() {
  const selector = 'button, a[href], input, select, textarea, label, summary, [role="tab"], [role="button"], h1, h2, h3, h4, .toolButtonLabel, .controlRowLabel, .icon';
  const name = (el) => {
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
  };
  const visibleRect = (el) => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return null;
    let rect = el.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3) return null;
    let left = Math.max(rect.left, 0); let top = Math.max(rect.top, 0);
    let right = Math.min(rect.right, innerWidth); let bottom = Math.min(rect.bottom, innerHeight);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent);
      if (/(hidden|auto|scroll|clip)/.test(`${s.overflow}${s.overflowX}${s.overflowY}`)) {
        const p = parent.getBoundingClientRect();
        left = Math.max(left, p.left); top = Math.max(top, p.top); right = Math.min(right, p.right); bottom = Math.min(bottom, p.bottom);
      }
    }
    if (right - left < 3 || bottom - top < 3) return null;
    return { left, top, right, bottom };
  };
  const covered = [];
  const clipped = [];
  for (const el of document.querySelectorAll(selector)) {
    const vr = visibleRect(el);
    if (!vr) continue;
    const w = vr.right - vr.left; const h = vr.bottom - vr.top;
    const points = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]].map(([fx, fy]) => [vr.left + w * fx, vr.top + h * fy]);
    const hits = [];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (!top || el.contains(top) || top.contains(el)) continue;
      // A covering element that is a plain ancestor-sibling background (no text, no controls) is not "hiding" anything.
      hits.push(top);
    }
    if (hits.length >= 2) {
      const by = hits[0];
      covered.push({ el: name(el), by: name(by), rect: [vr.left, vr.top, vr.right, vr.bottom].map(Math.round) });
    }
    const style = getComputedStyle(el);
    if (el.matches('button, label, h1, h2, h3, h4, summary, .toolButtonLabel, .controlRowLabel') && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2
      && /(hidden|clip)/.test(style.overflowX) && style.textOverflow !== 'ellipsis') {
      clipped.push({ el: name(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }
  return { covered, clipped };
}

async function setWindow(app, [w, h]) {
  await app.evaluate(({ BrowserWindow }, [width, height]) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(300, 300);
    win.setSize(width, height);
    win.center();
  }, [w, h]);
  await wait(450);
}

const findings = [];
let shotCount = 0;
async function check(page, app, label, scale, size) {
  const result = await page.evaluate(inspectLayout);
  const seen = new Set();
  const unique = result.covered.filter((item) => { const key = `${item.el}|${item.by}`; if (seen.has(key)) return false; seen.add(key); return true; });
  for (const item of unique) findings.push({ kind: 'covered', view: label, scale, size: size.join('x'), ...item });
  for (const item of result.clipped) findings.push({ kind: 'clipped', view: label, scale, size: size.join('x'), ...item });
  if (unique.length > 0 && shotsDir && shotCount < 40) {
    mkdirSync(shotsDir, { recursive: true });
    shotCount += 1;
    await page.screenshot({ path: join(shotsDir, `${String(shotCount).padStart(2, '0')}-${label.replace(/\W+/g, '_')}-${size.join('x')}@${scale}.png`) }).catch(() => undefined);
  }
}

const clickIfThere = async (page, name, exact = true) => {
  const button = page.getByRole('button', { name, exact }).first();
  if (await button.count() === 0) return false;
  await button.click({ timeout: 3000 }).catch(() => undefined);
  await wait(350);
  return true;
};

try {
  if (process.platform !== 'win32') throw new Error('This sweep is for Windows.');
  if (!existsSync(exe)) throw new Error(`Packaged app not found: ${exe}`);

  // A small synthetic project (screen + camera + tone) for the editor screens.
  const recordings = join(base, 'recordings');
  const folder = join(recordings, '2026-10-13_1200 Recording');
  mkdirSync(folder, { recursive: true });
  const screenPath = join(folder, 'fixture.mp4');
  const cameraPath = join(folder, 'fixture-camera.mp4');
  const encode = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-t', '5'];
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', ...encode, '-c:a', 'aac', '-shortest', screenPath]);
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=30', ...encode, cameraPath]);
  const startedAt = new Date('2026-10-13T12:00:00Z');
  const project = await saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: new Date(startedAt.getTime() + 5000).toISOString(),
    rawPath: screenPath, outputPath: screenPath, width: 1280, height: 720, fps: 30,
    cursorEvents: [{ frame: 10, x: 200, y: 200, type: 'move', button: 0 }, { frame: 60, x: 640, y: 360, type: 'down', button: 0 }],
    audio: { micSource: 'fixture-mic' },
    camera: { rawPath: cameraPath, outputPath: cameraPath, width: 640, height: 360, sourceInFrames: 0 },
  });
  const projectPath = project?.path ?? readdirSync(folder).map((f) => join(folder, f)).find((f) => f.endsWith('.roughcut'));
  if (!projectPath) throw new Error('Could not create the fixture project.');

  for (const scale of scales) {
    console.info(`[sweep] scale ${scale}`);
    for (const mode of ['library', 'editor']) {
      const profile = join(base, `profile-${mode}-${scale}`);
      mkdirSync(profile, { recursive: true });
      writeFileSync(join(profile, 'app-settings.json'), JSON.stringify({ projectsDir: recordings, exportsDir: join(base, 'exports') }));
      const env = { ...process.env };
      if (mode === 'editor') env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH = projectPath;
      const app = await _electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`, `--force-device-scale-factor=${scale}`], env, timeout: 60000 });
      try {
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        if (mode === 'library') {
          await page.getByRole('button', { name: 'Record', exact: true }).waitFor({ timeout: 30000 });
          if (reintroduceOldBugs) await page.addStyleTag({ content: OLD_BUG_CSS });
          for (const size of sizes) {
            await setWindow(app, size);
            await check(page, app, 'library', scale, size);
          }
          await page.getByRole('button', { name: 'Record', exact: true }).click();
          await page.getByLabel('Mic source').waitFor({ timeout: 15000 });
          await wait(1500);
          if (withCamera) { await page.getByLabel('Camera source').selectOption({ index: 1 }).catch(() => undefined); await wait(3500); }
          for (const size of sizes) {
            await setWindow(app, size);
            await check(page, app, withCamera ? 'recorder+camera' : 'recorder', scale, size);
          }
        } else {
          await page.locator('.playhead').first().waitFor({ timeout: 45000 });
          await wait(1500);
          if (reintroduceOldBugs) await page.addStyleTag({ content: OLD_BUG_CSS });
          const tools = ['Background', 'Frame', 'Camera', 'Cursor', 'Zoom', 'Captions', 'Censor', 'Graphics'];
          for (const size of sizes) {
            await setWindow(app, size);
            await check(page, app, 'editor', scale, size);
            for (const tool of tools) {
              const tab = page.locator('.projectEditor > .toolRail .toolButton', { hasText: tool }).first();
              if (await tab.count() === 0) continue;
              await tab.scrollIntoViewIfNeeded().catch(() => undefined);
              await tab.click({ timeout: 3000 }).catch(() => undefined);
              await wait(250);
              await check(page, app, `editor:${tool}`, scale, size);
            }
          }
          for (const view of ['Projects', 'AI']) {
            if (!(await clickIfThere(page, view))) continue;
            for (const size of sizes) {
              await setWindow(app, size);
              await check(page, app, view.toLowerCase(), scale, size);
            }
          }
        }
      } finally {
        await app.close().catch(() => undefined);
      }
    }
  }
} catch (error) {
  console.error(`[sweep] FAILED: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 2;
} finally {
  rmSync(base, { recursive: true, force: true });
}

const covered = findings.filter((f) => f.kind === 'covered');
const clipped = findings.filter((f) => f.kind === 'clipped');
const group = (list) => { const map = new Map(); for (const f of list) { const key = `${f.view} | ${f.el}${f.by ? ` is under ${f.by}` : ''}`; const entry = map.get(key) ?? { count: 0, sizes: new Set() }; entry.count += 1; entry.sizes.add(`${f.size}@${f.scale}`); map.set(key, entry); } return map; };
console.info(`\n[sweep] ${covered.length} covered-control hits, ${clipped.length} clipped-text hits across ${scales.length} scalings x ${sizes.length} sizes`);
for (const [key, entry] of group(covered)) console.info(`  COVERED  ${key}  (${entry.count}x; e.g. ${[...entry.sizes].slice(0, 4).join(', ')})`);
for (const [key, entry] of group(clipped).entries()) console.info(`  CLIPPED  ${key}  (${entry.count}x; e.g. ${[...entry.sizes].slice(0, 3).join(', ')})`);
if (process.exitCode !== 2) process.exitCode = covered.length > 0 ? 1 : 0;
if (covered.length === 0 && process.exitCode === 0) console.info('UI LAYOUT SWEEP PASSED');
