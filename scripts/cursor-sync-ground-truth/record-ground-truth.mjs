// Ground-truth cursor-sync harness.
//
// Records the primary display through the app's own recording session while a
// Chromium window flips black/white AND the real mouse jumps between two
// known positions at the same wall instant. The flip is visible in the video;
// the jump is visible in the telemetry. Comparing where each lands measures
// the end-to-end residual offset of the aligned cursor data — independent of
// any preview/player behavior.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = '/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp';
const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const { createRecordingSession } = await import(`${REPO}/apps/desktop/src/main/recording/recording-session.mjs`);
const { readCursorViaXdotool } = await import(`${REPO}/apps/desktop/src/main/recording/xdotool-cursor.mjs`);
const { alignCursorEvents } = await import(`${REPO}/apps/desktop/src/shared/cursor-alignment.mjs`);
const { chromium } = createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const POS_A = [1000, 470];
const POS_B = [1450, 720];
const CYCLES = Number(process.env.CYCLES || 8);
const CYCLE_SLEEP_MS = Number(process.env.CYCLE_SLEEP_MS || 1200);

const recordingsDir = join(OUT_DIR, 'recordings');
await mkdir(recordingsDir, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--window-position=880,380', '--window-size=720,440', '--no-first-run'],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.setContent('<head><title>SYNC-PROBE</title></head><body style="margin:0;background:#000000"></body>');
await sleep(800);
try {
  execFileSync('wmctrl', ['-r', 'SYNC-PROBE', '-b', 'add,above']);
  execFileSync('wmctrl', ['-r', 'SYNC-PROBE', '-e', '0,880,380,720,440']);
  execFileSync('wmctrl', ['-a', 'SYNC-PROBE']);
  const wid = execFileSync('xdotool', ['search', '--name', 'SYNC-PROBE']).toString().trim().split('\n')[0];
  execFileSync('xdotool', ['windowactivate', '--sync', wid]);
  execFileSync('xdotool', ['windowraise', wid]);
} catch (err) {
  console.warn('wmctrl raise failed:', err.message);
}
await sleep(300);

const session = createRecordingSession({
  recordingsDir,
  markerPath: join(OUT_DIR, 'recovery.json'),
  isCaptureAvailable: () => true,
  getDisplayInfo: () => ({ display: ':0+0,0', originX: 0, originY: 0, scaleFactor: 1, width: 1920, height: 1080 }),
  getCursorPoint: () => readCursorViaXdotool(),
});

await session.start(process.env.CAMERA ? { cameraDevicePath: process.env.CAMERA } : {});
await sleep(1500);

const truth = [];
for (let i = 0; i < CYCLES; i += 1) {
  const white = i % 2 === 0;
  const color = white ? '#ffffff' : '#000000';
  const [x, y] = white ? POS_B : POS_A;
  const t = Date.now();
  await Promise.all([
    page.evaluate((c) => { document.body.style.background = c; }, color),
    (async () => execFileSync('xdotool', ['mousemove', String(x), String(y)]))(),
  ]);
  truth.push({ t, color, x, y });
  await sleep(CYCLE_SLEEP_MS);
}

await sleep(600);
const stopped = await session.stop();
await browser.close();

const aligned = alignCursorEvents(stopped.cursorEvents, stopped.cursorAnchors, stopped.fps);
await writeFile(join(OUT_DIR, 'result.json'), JSON.stringify({
  rawPath: stopped.rawPath,
  outputPath: stopped.outputPath,
  fps: stopped.fps,
  startedAt: stopped.startedAt,
  cursorAnchors: stopped.cursorAnchors,
  rawEvents: stopped.cursorEvents,
  alignedEvents: aligned,
  truth,
}, null, 2));
console.log('DONE', stopped.rawPath);
