#!/usr/bin/env node
// Captures README demo-GIF frames from the PACKAGED app showing a real project in Recording edit.
//
//   node scripts/demo-gif/capture-frames.mjs <project.roughcut> <out-dir> [--from 0] [--to 12] [--step 0.25]
//
// Then: python3 scripts/demo-gif/make-gif.py <out-dir> docs/assets/demo.gif
// No video encoder is involved: frames are window screenshots at canonical timeline times.
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [projectArg, outArg, ...rest] = process.argv.slice(2);
if (!projectArg || !outArg) throw new Error('usage: capture-frames.mjs <project.roughcut> <out-dir> [--from s] [--to s] [--step s]');
const flag = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? Number(rest[i + 1]) : fallback; };
const from = flag('from', 0); const to = flag('to', 12); const step = flag('step', 0.25);
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });

const packaged = join(repoRoot, 'dist', 'rough-cut-mvp-linux-x64');
const electronPath = join(packaged, 'electron');
const appPath = join(packaged, 'resources', 'app');
if (!existsSync(electronPath)) throw new Error('The packaged app is missing; run pnpm package:linux first.');
let playwright;
try { playwright = createRequire(import.meta.url)('playwright'); } catch { playwright = createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright'); }

const app = await playwright._electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rc-demo-gif-'))}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: resolve(projectArg),
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1600',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1000',
  },
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 90000 });
  let index = 0;
  for (let t = from; t <= to + 1e-6; t += step) {
    await page.evaluate((sec) => window.__roughCutSetPreviewTimeSec(sec), t);
    await page.waitForFunction(() => { const v = document.querySelector('video'); return Boolean(v) && !v.seeking && v.readyState >= 2; }, null, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 450));
    await page.screenshot({ path: join(outDir, `frame-${String(index).padStart(3, '0')}.png`) });
    index += 1;
  }
  console.log(`captured ${index} frames in ${outDir}`);
} finally {
  await app.close().catch(() => undefined);
}
