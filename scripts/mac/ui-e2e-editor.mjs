// UI end-to-end check of the packaged Mac app: open a project, edit it, export it, and compare the export with what
// the edit must produce. Needs no camera, microphone or screen permission, so it runs on GitHub's macOS machines.
//
//   node scripts/mac/ui-e2e-editor.mjs [--exe <app executable>] [--app-dir <apps/desktop, dev run>] [--keep] [--out <dir>]
//
// 1. A synthetic recording is made whose picture changes colour every second (red, green, blue, yellow, magenta,
//    cyan; 6 s) with a tone, plus a camera clip, and turned into a project.
// 2. The packaged app opens it in Recording edit (real UI, real renderer).
// 3. The edit, done through the UI like a person: click the timeline at 2 s, press "Split at playhead", select the
//    first section and press Delete. That removes 0-2 s.
// 4. Export through the Export panel.
// 5. The export is compared with the edit: about 4 s long, h264 + audio, decodes cleanly, and its picture at 0.5 s is
//    blue and at 2.5 s magenta (source 2.5 s and 4.5 s). Without the edit it would start red. A screenshot of the
//    editor after the edit is saved next to the export.
// Exits 0 and prints "UI E2E EDITOR PASSED" only if every step holds.
//
// The same script runs against the Linux build (or a dev build with --app-dir) so it can be proven before CI.
// FFMPEG / FFPROBE env vars choose the media tools the check itself uses (default: ffmpeg / ffprobe on PATH).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const appDir = argValue('--app-dir');
const exe = argValue('--exe') ?? (appDir ? null : join(root, 'dist', `rough-cut-mvp-darwin-${arch}`, 'Rough Cut.app', 'Contents', 'MacOS', 'Electron'));
const keep = args.includes('--keep');
const outCopyDir = argValue('--out');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

const require = createRequire(join(root, 'package.json'));
const { _electron } = require('playwright-core');
const { saveProjectForRecording } = await import(pathToFileURL(join(root, 'apps/desktop/src/main/project-files.mjs')).href);

const COLORS = [['red', [255, 0, 0]], ['green', [0, 255, 0]], ['blue', [0, 0, 255]], ['yellow', [255, 255, 0]], ['magenta', [255, 0, 255]], ['cyan', [0, 255, 255]]];
const base = mkdtempSync(join(tmpdir(), 'rough-cut-mac-e2e-'));
const profile = join(base, 'profile');
const recordings = join(base, 'recordings');
const exportsDir = join(base, 'exports');
const folder = join(recordings, '2026-10-22_1200 Recording');
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const t0 = Date.now();
let stepCount = 0;
const step = (name, detail = '') => { stepCount += 1; console.info(`[mac-e2e ${((Date.now() - t0) / 1000).toFixed(1)}s] STEP ${stepCount}: ${name}${detail ? `  (${detail})` : ''}`); };
const fail = (message) => { throw new Error(message); };
const listFiles = (dir) => { try { return readdirSync(dir, { recursive: true }).map(String); } catch { return []; } };
const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { encoding: options.encoding ?? 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) fail(`${command} failed: ${String(result.stderr ?? '').slice(-400)}`);
  return result;
};

/** Average colour of a small patch at the centre of the picture at `seconds`, named by the nearest fixture colour. */
function colorAt(file, seconds) {
  const result = run(FFMPEG, ['-v', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1', '-vf', 'crop=16:16:(iw-16)/2:(ih-16)/2,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
  const [r, g, b] = result.stdout;
  let best = null;
  for (const [name, [cr, cg, cb]] of COLORS) {
    const distance = Math.hypot(r - cr, g - cg, b - cb);
    if (!best || distance < best.distance) best = { name, distance };
  }
  return { ...best, rgb: [r, g, b] };
}

let app = null;
let page = null;
const appLog = [];
try {
  if (exe && !existsSync(exe)) fail(`Packaged app not found: ${exe}. Build it first: node scripts/package-mac.mjs`);

  // 1. The fixture recording and its project.
  mkdirSync(folder, { recursive: true });
  const screenPath = join(folder, 'rough-cut-fixture.mp4');
  const cameraPath = join(folder, 'rough-cut-fixture-camera.mp4');
  const encode = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '15'];
  const colorInputs = COLORS.flatMap(([name]) => ['-f', 'lavfi', '-i', `color=c=${name}:s=1280x720:r=30:d=1`]);
  run(FFMPEG, ['-y', '-v', 'error', ...colorInputs, '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=6',
    '-filter_complex', `${COLORS.map((_, i) => `[${i}:v]`).join('')}concat=n=${COLORS.length}:v=1:a=0[v]`, '-map', '[v]', '-map', `${COLORS.length}:a`,
    ...encode, '-c:a', 'aac', '-t', '6', screenPath]);
  run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=30', ...encode, '-t', '6', cameraPath]);
  const fixtureColors = [0.5, 2.5, 4.5].map((s) => colorAt(screenPath, s).name);
  if (fixtureColors.join(',') !== 'red,blue,magenta') fail(`The fixture itself is wrong: ${fixtureColors.join(',')}`);
  const startedAt = new Date('2026-10-22T12:00:00Z');
  const project = await saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: new Date(startedAt.getTime() + 6000).toISOString(),
    rawPath: screenPath,
    outputPath: screenPath,
    width: 1280,
    height: 720,
    fps: 30,
    cursorEvents: [
      { frame: 10, x: 200, y: 200, type: 'move', button: 0 },
      { frame: 120, x: 900, y: 500, type: 'move', button: 0 },
    ],
    audio: { micSource: 'fixture-mic' },
    camera: { rawPath: cameraPath, outputPath: cameraPath, width: 640, height: 360, sourceInFrames: 0 },
  });
  const projectPath = project?.path ?? listFiles(folder).map((f) => join(folder, f)).find((f) => f.endsWith('.roughcut'));
  if (!projectPath || !existsSync(projectPath)) fail('Could not create the fixture project.');
  step('fixture project created', 'six 1 s colour bands with a tone, plus a camera clip');

  // 2. Open it in the app.
  mkdirSync(profile, { recursive: true });
  mkdirSync(join(exportsDir, 'rough-cut-fixture'), { recursive: true });
  writeFileSync(join(profile, 'app-settings.json'), JSON.stringify({ projectsDir: recordings, exportsDir }));
  const electronPath = exe ?? require(join(root, 'apps/desktop/node_modules/electron'));
  app = await _electron.launch({
    executablePath: electronPath,
    args: [...(appDir ? [resolve(appDir)] : []), `--user-data-dir=${profile}`],
    // The app's own test hook answers the "Save as" dialog with this path, so the export itself runs for real.
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ROUGH_CUT_LOAD_BUILT_RENDERER: '1', ROUGH_CUT_STARTUP_VIEW: 'editor', ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath, ROUGH_CUT_UI_SMOKE_EXPORT_PATH: join(exportsDir, 'rough-cut-fixture', 'fixture-export.mp4') },
    chromiumSandbox: true,
    timeout: 90000,
  });
  app.process().stdout.on('data', (chunk) => appLog.push(String(chunk)));
  app.process().stderr.on('data', (chunk) => appLog.push(String(chunk)));
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1600, 1000); window.center(); });
  await page.locator('[data-ui-region="export-popover-toggle"]').first().waitFor({ timeout: 60000 });
  step('app opened the project in Recording edit');
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some((video) => video.readyState >= 2 && video.videoWidth > 0) || document.querySelector('canvas'), null, { timeout: 30000 });
  const screenClips = page.locator('[data-timeline-lane="screen"] .clipBody');
  await screenClips.first().waitFor({ timeout: 20000 });
  if (await screenClips.count() !== 1) fail(`Expected one screen section before editing, found ${await screenClips.count()}.`);
  step('editor shows the recording and one screen section on the timeline');

  // 3. The edit: split at 2 s, delete the first section.
  const track = await page.locator('[data-timeline-lane="screen"] .laneTrack').first().boundingBox();
  const ruler = await page.locator('.timelineRuler').first().boundingBox();
  if (!track || !ruler) fail('The timeline ruler or screen lane is not on screen.');
  const scrubber = page.locator('input[aria-label="Scrub timeline"]').first();
  const timelineSeconds = Number(await scrubber.getAttribute('max')) || 6;
  await page.mouse.click(track.x + track.width * (2 / timelineSeconds), ruler.y + ruler.height / 2);
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Scrub timeline"]');
    return input instanceof HTMLInputElement && Math.abs(Number(input.value) - 2) < 0.25;
  }, null, { timeout: 8000 }).catch(async () => fail(`Clicking the ruler at 2 s put the playhead at ${await scrubber.inputValue()} s.`));
  const playhead = Number(await scrubber.inputValue());
  await page.locator('button[aria-label="Split at playhead"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-timeline-lane="screen"] .clipBody').length === 2, null, { timeout: 10000 })
    .catch(() => fail('Split at playhead did not make two screen sections.'));
  step('split the recording at the playhead', `${playhead.toFixed(2)} s`);
  await screenClips.first().click();
  await screenClips.first().press('Delete');
  await page.waitForFunction(() => document.querySelectorAll('[data-timeline-lane="screen"] .clipBody').length === 1, null, { timeout: 10000 })
    .catch(() => fail('Deleting the first section did not leave one screen section.'));
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Scrub timeline"]');
    return input instanceof HTMLInputElement && Math.abs(Number(input.max) - 4) < 0.3;
  }, null, { timeout: 10000 }).catch(async () => fail(`After deleting 0-2 s the timeline is ${await scrubber.getAttribute('max')} s long, expected about 4 s.`));
  step('deleted the first section; the timeline is now about 4 s', `${Number(await scrubber.getAttribute('max')).toFixed(2)} s`);
  // Let the viewer settle on the new first frame, then keep a picture of the edited editor for people to look at.
  await page.evaluate(() => window.__roughCutSetPreviewTimeSec?.(0.5));
  await wait(1500);
  const shot = join(base, 'editor-after-edit.png');
  await page.screenshot({ path: shot });

  // 4. Export through the UI.
  await page.locator('[data-ui-region="export-popover-toggle"]').first().click();
  await page.locator('button.exportGo[data-export-action="export"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('button.exportGo[data-export-action="export"]').first().click();
  step('export started from the Export panel');
  let exportLog = '';
  for (let i = 0; i < 360; i += 1) {
    await wait(1000);
    exportLog = appLog.join('');
    if (/\[export\] finished ok=true/.test(exportLog)) break;
    if (/\[export\] finished ok=false|Export failed/.test(exportLog)) fail(`The app reported a failed export: ${exportLog.split('\n').filter((line) => /export/i.test(line)).slice(-4).join(' | ').slice(0, 600)}`);
  }
  if (!/\[export\] finished ok=true/.test(exportLog)) fail(`The export did not finish within 6 minutes. App log: ${exportLog.split('\n').filter((line) => /export|ffmpeg|error|fail/i.test(line)).slice(-12).join(' | ').slice(0, 1200)}`);
  const exported = listFiles(exportsDir).find((f) => /\.mp4$/i.test(f) && !/^\.|rendering|finishing/.test(f.split(/[\\/]/).pop()));
  if (!exported) fail(`The export finished but no MP4 is in ${exportsDir}.`);
  await wait(1000);
  const out = join(exportsDir, exported);

  // 5. Compare the export with the edit.
  const probe = JSON.parse(run(FFPROBE, ['-v', 'error', '-of', 'json', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', out]).stdout);
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  const seconds = Number(probe.format.duration);
  if (video?.codec_name !== 'h264') fail('Exported file has no h264 video.');
  if (!audio) fail('Exported file has no audio.');
  if (!(Math.abs(seconds - 4) <= 0.5)) fail(`Exported length ${seconds.toFixed(2)} s; the edit leaves 4 s (6 s minus the deleted 2 s).`);
  const decode = spawnSync(FFMPEG, ['-v', 'error', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
  // A memory-capping wrapper (systemd-run) may print its own "Running as unit" line; anything else is a decode error.
  const decodeErrors = String(decode.stderr ?? '').split('\n').filter((line) => line.trim() && !/^Running as unit/.test(line)).join('\n');
  if (decode.status !== 0 || decodeErrors) fail(`The exported MP4 does not decode cleanly: ${decodeErrors.slice(0, 300)}`);
  const early = colorAt(out, 0.5);
  const late = colorAt(out, 2.5);
  if (early.name !== 'blue' || early.distance > 90) fail(`At 0.5 s the export shows ${early.name} (rgb ${early.rgb.join(',')}); after deleting 0-2 s it must show the blue band (source 2.5 s).`);
  if (late.name !== 'magenta' || late.distance > 90) fail(`At 2.5 s the export shows ${late.name} (rgb ${late.rgb.join(',')}); it must show the magenta band (source 4.5 s).`);
  step('export matches the edit', `${video.width}x${video.height}, ${seconds.toFixed(2)} s, 0.5 s = ${early.name}, 2.5 s = ${late.name}, ${(statSync(out).size / 1e6).toFixed(1)} MB`);

  if (outCopyDir) {
    mkdirSync(outCopyDir, { recursive: true });
    run('cp', [out, join(outCopyDir, 'export.mp4')]);
    run('cp', [shot, join(outCopyDir, 'editor-after-edit.png')]);
    run(FFMPEG, ['-y', '-v', 'error', '-ss', '0.5', '-i', out, '-frames:v', '1', join(outCopyDir, 'export-0.5s.png')]);
  }
  await app.close();
  app = null;
  console.info('UI E2E EDITOR PASSED');
  if (!keep) rmSync(base, { recursive: true, force: true });
  else console.info(`[mac-e2e] kept: ${base}`);
  process.exit(0);
} catch (error) {
  console.error(`UI E2E EDITOR FAILED at step ${stepCount + 1} (after step ${stepCount}): ${error instanceof Error ? error.message : error}`);
  try {
    if (page) await page.screenshot({ path: join(base, 'failure.png') });
  } catch { /* window gone */ }
  console.error(`[mac-e2e] app log tail: ${appLog.join('').split('\n').slice(-25).join('\n')}`);
  if (outCopyDir) {
    mkdirSync(outCopyDir, { recursive: true });
    spawnSync('cp', ['-R', base, join(outCopyDir, 'failed-run')]);
  }
  console.error(`[mac-e2e] artifacts kept at ${base}`);
  try { await app?.close(); } catch { /* already gone */ }
  process.exit(1);
}
