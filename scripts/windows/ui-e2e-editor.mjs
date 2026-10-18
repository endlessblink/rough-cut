// UI end-to-end test for the editor and export of the packaged Windows app. Needs no devices, records nothing,
// makes no mouse input, so it is safe to run while the PC is in use.
//
//   node scripts/windows/ui-e2e-editor.mjs [--exe <path to Rough Cut.exe>] [--keep]
//
// A synthetic recording (test pattern + tone, with camera) is turned into a project, opened in the packaged app,
// and exported through the Export panel. The exported MP4 is checked with ffprobe and a full decode.
// Exits 0 and prints "UI E2E EDITOR PASSED" only if every step holds.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const exe = argValue('--exe') ?? join(root, 'dist', 'rough-cut-mvp-win32-x64', 'Rough Cut.exe');
const keep = args.includes('--keep');

const require = createRequire(join(root, 'package.json'));
const { _electron } = require('playwright-core');
const { saveProjectForRecording } = await import(pathToFileURL(join(root, 'apps/desktop/src/main/project-files.mjs')).href);

const base = mkdtempSync(join(tmpdir(), 'rough-cut-ui-e2e-editor-'));
const profile = join(base, 'profile');
const recordings = join(base, 'recordings');
const exportsDir = join(base, 'exports');
const folder = join(recordings, '2026-10-13_1200 Recording');
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const t0 = Date.now();
let stepCount = 0;
const step = (name, detail = '') => { stepCount += 1; console.info(`[ui-e2e-editor ${((Date.now() - t0) / 1000).toFixed(1)}s] STEP ${stepCount}: ${name}${detail ? `  (${detail})` : ''}`); };
const fail = (message) => { throw new Error(message); };
const listFiles = (dir) => { try { return readdirSync(dir, { recursive: true }).map(String); } catch { return []; } };
const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) fail(`${command} failed: ${(result.stderr ?? '').slice(-400)}`);
  return result;
};

let app = null;
try {
  if (process.platform !== 'win32') fail('This test is for Windows.');
  if (!existsSync(exe)) fail(`Packaged app not found: ${exe}. Build it first: node scripts/package-windows.mjs`);

  // 1. A synthetic recording: 6 s of 1280x720 test pattern with a tone, and a separate camera clip.
  mkdirSync(folder, { recursive: true });
  const screenPath = join(folder, 'rough-cut-fixture.mp4');
  const cameraPath = join(folder, 'rough-cut-fixture-camera.mp4');
  const encode = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-t', '6'];
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', ...encode, '-c:a', 'aac', '-shortest', screenPath]);
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=30', ...encode, cameraPath]);
  const startedAt = new Date('2026-10-13T12:00:00Z');
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
      { frame: 60, x: 640, y: 360, type: 'down', button: 0 },
      { frame: 120, x: 900, y: 500, type: 'move', button: 0 },
    ],
    audio: { micSource: 'fixture-mic' },
    camera: { rawPath: cameraPath, outputPath: cameraPath, width: 640, height: 360, sourceInFrames: 0 },
  });
  const projectPath = project?.path ?? listFiles(folder).map((f) => join(folder, f)).find((f) => f.endsWith('.roughcut'));
  if (!projectPath || !existsSync(projectPath)) fail('Could not create the fixture project.');
  step('fixture project created', projectPath.slice(base.length + 1));

  // 2. Open it in the packaged app.
  mkdirSync(profile, { recursive: true });
  mkdirSync(join(exportsDir, 'rough-cut-fixture'), { recursive: true });
  writeFileSync(join(profile, 'app-settings.json'), JSON.stringify({ projectsDir: recordings, exportsDir }));
  app = await _electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${profile}`],
    // Export normally opens the standard Windows "Save as" dialog, which no UI driver can click. The app's own test
    // hook answers it with this path, so the rest of the export (render, verify) still runs for real. The dialog
    // itself is covered by the "export-playable" check that a person records.
    env: { ...process.env, ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath, ROUGH_CUT_UI_SMOKE_EXPORT_PATH: join(exportsDir, 'rough-cut-fixture', 'fixture-export.mp4') },
    timeout: 60000,
  });
  const appLog = [];
  app.process().stdout.on('data', (chunk) => appLog.push(String(chunk)));
  app.process().stderr.on('data', (chunk) => appLog.push(String(chunk)));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-ui-region="export-popover-toggle"]').first().waitFor({ timeout: 45000 });
  step('packaged app opened the project in the editor');

  // The editor shows the media: a playable video element with real frames.
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some((video) => video.readyState >= 2 && video.videoWidth > 0) || document.querySelector('canvas'), null, { timeout: 30000 });
  step('editor shows the recording (video or canvas ready)');

  // 3. Export through the UI.
  await page.locator('[data-ui-region="export-popover-toggle"]').first().click();
  await page.locator('button.exportGo[data-export-action="export"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('button.exportGo[data-export-action="export"]').first().click();
  step('export started from the Export panel');
  // The app logs "[export] finished ok=true ..." only when the file is complete and verified; the file itself appears
  // earlier, while ffmpeg is still writing it.
  let exportLog = '';
  for (let i = 0; i < 240; i += 1) {
    await wait(1000);
    exportLog = appLog.join('');
    if (/\[export\] finished ok=true/.test(exportLog)) break;
    if (/\[export\] finished ok=false|Export failed/.test(exportLog)) fail(`The app reported a failed export: ${exportLog.split('\n').filter((line) => /export/i.test(line)).slice(-4).join(' | ').slice(0, 600)}`);
  }
  if (!/\[export\] finished ok=true/.test(exportLog)) fail(`The export did not finish within 4 minutes. App log: ${exportLog.split('\n').filter((line) => /export|ffmpeg|error|fail/i.test(line)).slice(-12).join(' | ').slice(0, 1200)} Panel text: ${(await page.locator('body').innerText()).slice(-400).replace(/\s+/g, ' ')}`);
  const exported = listFiles(exportsDir).find((f) => /\.mp4$/i.test(f) && !/^\.|rendering|finishing/.test(f.split(/[\\/]/).pop()));
  if (!exported) fail(`The export finished but no MP4 is in ${exportsDir}.`);
  await wait(1000);

  // 4. Check the exported file.
  const out = join(exportsDir, exported);
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-of', 'json', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', out]).stdout);
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  const seconds = Number(probe.format.duration);
  if (video?.codec_name !== 'h264') fail('Exported file has no h264 video.');
  if (!audio) fail('Exported file has no audio.');
  if (!(Math.abs(seconds - 6) <= 1.5)) fail(`Exported length ${seconds}s is not about the 6 s recording.`);
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
  if (decode.status !== 0 || (decode.stderr ?? '').trim()) fail(`The exported MP4 does not decode cleanly: ${(decode.stderr ?? '').slice(0, 300)}`);
  // The picture must be the test pattern, not black: measure mean brightness of a mid frame.
  const frame = spawnSync('ffmpeg', ['-v', 'error', '-ss', '3', '-i', out, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
  const yavg = Number(/YAVG=([\d.]+)/.exec(`${frame.stderr}${frame.stdout}`)?.[1] ?? NaN);
  if (!(yavg > 20)) fail(`The exported picture looks black (mean luma ${yavg}).`);
  step('exported MP4 is valid, decodes cleanly, has audio and a real picture', `${video.width}x${video.height}, ${seconds.toFixed(1)} s, luma ${yavg.toFixed(0)}, ${(statSync(out).size / 1e6).toFixed(1)} MB`);

  await app.close();
  app = null;
  console.info('UI E2E EDITOR PASSED');
  if (!keep) rmSync(base, { recursive: true, force: true });
  else console.info(`[ui-e2e-editor] kept: ${base}`);
  process.exit(0);
} catch (error) {
  console.error(`UI E2E EDITOR FAILED at step ${stepCount + 1} (after step ${stepCount}): ${error instanceof Error ? error.message : error}`);
  console.error(`[ui-e2e-editor] artifacts kept at ${base}`);
  try { await app?.close(); } catch { /* already gone */ }
  process.exit(1);
}
