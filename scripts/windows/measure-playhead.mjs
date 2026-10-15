// Diagnostic: opens a COPY of a recording folder in the packaged app, plays it, and samples the timeline playhead
// every animation frame. Prints how smooth the playhead moves (steps backwards, stalls, uneven speed).
//
//   node scripts/windows/measure-playhead.mjs "<recording folder containing a .roughcut>" [--exe <Rough Cut.exe>] [--seconds 6]

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const source = args.find((a) => !a.startsWith('--') && a !== argValue('--exe') && a !== argValue('--seconds'));
const exe = argValue('--exe') ?? join(root, 'dist', 'rough-cut-mvp-win32-x64', 'Rough Cut.exe');
const seconds = Number(argValue('--seconds') ?? 6);
if (!source || !existsSync(source)) { console.error('Give the recording folder.'); process.exit(2); }

const { _electron } = createRequire(join(root, 'package.json'))('playwright-core');
const base = mkdtempSync(join(tmpdir(), 'rough-cut-playhead-'));
const recordings = join(base, 'recordings');
const folder = join(recordings, 'copy');
cpSync(source, folder, { recursive: true });
const projectPath = join(folder, readdirSync(folder).find((f) => f.endsWith('.roughcut')));
const profile = join(base, 'profile');
mkdirSync(profile, { recursive: true });
writeFileSync(join(profile, 'app-settings.json'), JSON.stringify({ projectsDir: recordings, exportsDir: join(base, 'exports') }));

const app = await _electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`], env: { ...process.env, ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath }, timeout: 60000 });
try {
  const page = await app.firstWindow();
  await page.locator('.playhead').first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(3000);
  // Space toggles play in the editor.
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  const result = await page.evaluate(async (ms) => {
    const samples = [];
    const el = document.querySelector('.playhead');
    const track = el.parentElement;
    const started = performance.now();
    const pressed = new Promise((r) => r());
    await pressed;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    await new Promise((resolveWait) => {
      const tick = () => {
        const now = performance.now();
        const rect = el.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        samples.push({ t: now - started, x: rect.left - trackRect.left, w: trackRect.width });
        if (now - started < ms) requestAnimationFrame(tick); else resolveWait();
      };
      requestAnimationFrame(tick);
    });
    const playing = [...document.querySelectorAll('video')].map((v) => ({ paused: v.paused, t: v.currentTime, rate: v.playbackRate, muted: v.muted, volume: v.volume, audioTracks: v.audioTracks?.length ?? null }));
    return { samples, playing };
  }, seconds * 1000);
  const s = result.samples;
  const moved = s.length ? s[s.length - 1].x - s[0].x : 0;
  let back = 0; let stalls = 0; let maxJump = 0; const steps = [];
  for (let i = 1; i < s.length; i += 1) {
    const dx = s[i].x - s[i - 1].x;
    if (dx < -0.5) back += 1;
    if (Math.abs(dx) < 0.01) stalls += 1; else steps.push(dx);
    maxJump = Math.max(maxJump, Math.abs(dx));
  }
  if (args.includes('--dump')) console.info(s.slice(40, 100).map((v, i) => `${v.t.toFixed(0)}ms x=${v.x.toFixed(2)}`).join(' | '));
  const mean = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
  const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, steps.length));
  const dts = s.slice(1).map((v, i) => v.t - s[i].t);
  console.info(JSON.stringify({ frames: s.length, avgFrameMs: +(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1), slowFrames50ms: dts.filter((d) => d > 50).length, movedPx: +moved.toFixed(1), stepsBackwards: back, stalledFrames: stalls, meanStepPx: +mean.toFixed(3), stepStdDevPx: +sd.toFixed(3), maxStepPx: +maxJump.toFixed(2), videos: result.playing }, null, 1));
} finally {
  await app.close().catch(() => {});
  rmSync(base, { recursive: true, force: true });
}
