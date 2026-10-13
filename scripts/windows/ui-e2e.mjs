// UI end-to-end test for the packaged Windows app. Drives "Rough Cut.exe" through its real UI, like a person:
//
//   open Record -> pick mic, system audio and camera -> Start -> (tone plays, a real mouse click lands) -> Stop
//   -> the editor opens -> Export -> check every output file with ffprobe.
//
//   node scripts/windows/ui-e2e.mjs [--exe <path to Rough Cut.exe>] [--keep] [--no-camera]
//
// Needs: a built package (node scripts/package-windows.mjs), ffmpeg/ffprobe on PATH, a microphone, system audio
// output and (unless --no-camera) a camera. The mic hears the room, the camera sees you, a tone plays through the
// speakers and one mouse click is made on the app's own title text. Everything goes to a temp folder that is deleted
// afterwards unless --keep. Exits 0 and prints "UI E2E PASSED" only if every step holds.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const exe = argValue('--exe') ?? join(root, 'dist', 'rough-cut-mvp-win32-x64', 'Rough Cut.exe');
const keep = args.includes('--keep');
const withCamera = !args.includes('--no-camera');

const require = createRequire(join(root, 'package.json'));
const { _electron } = require('playwright-core');

const base = mkdtempSync(join(tmpdir(), 'rough-cut-ui-e2e-'));
const profile = join(base, 'profile');
const recordings = join(base, 'recordings');
const exportsDir = join(base, 'exports');
const summary = { steps: [] };
const t0 = Date.now();
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

function step(name, detail = '') {
  summary.steps.push(name);
  console.info(`[ui-e2e ${((Date.now() - t0) / 1000).toFixed(1)}s] STEP ${summary.steps.length}: ${name}${detail ? `  (${detail})` : ''}`);
}
function fail(message) { throw new Error(message); }
function ffprobeJson(file, entries) {
  const run = spawnSync('ffprobe', ['-v', 'error', '-of', 'json', ...entries, file], { encoding: 'utf8' });
  if (run.status !== 0) fail(`ffprobe failed on ${file}: ${run.stderr}`);
  return JSON.parse(run.stdout);
}
function maxVolume(file, start, length) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(start), '-t', String(length), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /max_volume: (-?[\d.]+|-inf) dB/.exec(run.stderr ?? '');
  return match ? Number(match[1]) : -Infinity;
}
function ffmpegProcessCount() {
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq ffmpeg.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout ?? '';
  return out.split('\n').filter((line) => /ffmpeg\.exe/i.test(line)).length;
}
function listFiles(dir) {
  try { return readdirSync(dir, { recursive: true }).map(String); } catch { return []; }
}
function powershell(script) {
  return spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
}
function writeToneWav(path) {
  const rate = 48000;
  const frames = Math.round(rate * 1.2);
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * 880 * i) / rate) * 9000);
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

// Safety: the test makes real mouse input, so it must never act on another program. Bring the app to the front and
// check that the foreground window really belongs to it; if not, stop BEFORE recording or clicking anything.
async function assertAppInForeground(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.focus();
    window.moveTop();
  });
  await wait(1000);
  const foreground = powershell(`
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class F{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);}'
$p = 0; [F]::GetWindowThreadProcessId([F]::GetForegroundWindow(), [ref]$p) | Out-Null; $p`).stdout.trim();
  if (String(app.process().pid) !== foreground) {
    const owner = powershell(`(Get-Process -Id ${Number(foreground) || 0} -ErrorAction SilentlyContinue).ProcessName`).stdout.trim();
    fail(`The app window is not in the foreground (it is "${owner || 'another program'}"), so the test will not click. Close or minimise other programs, do not touch the PC while it runs, and run it again.`);
  }
}

let app = null;
const ffmpegBefore = ffmpegProcessCount();
try {
  if (process.platform !== 'win32') fail('This test is for Windows.');
  if (!existsSync(exe)) fail(`Packaged app not found: ${exe}. Build it first: node scripts/package-windows.mjs`);

  // Settings are seeded so recordings and exports land in the temp folder, never in Documents.
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'app-settings.json'), JSON.stringify({ projectsDir: recordings, exportsDir }));

  app = await _electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`], timeout: 60000 });
  const appLog = [];
  app.process().stdout.on('data', (chunk) => appLog.push(String(chunk)));
  app.process().stderr.on('data', (chunk) => appLog.push(String(chunk)));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: 'Record', exact: true }).waitFor({ timeout: 30000 });
  step('app starts and shows the library', (await page.title()) || 'Rough Cut');
  await assertAppInForeground(app);
  step('app window is in the foreground (safe to use real mouse input)');

  // --- Recorder panel and devices
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByLabel('Mic source').waitFor({ timeout: 15000 });
  await wait(2500);
  const options = async (label) => page.getByLabel(label).evaluate((select) => [...select.options].map((option) => option.value));
  const micOptions = await options('Mic source');
  const systemOptions = await options('System source');
  const cameraOptions = await options('Camera source');
  if (micOptions.length < 2) fail(`No microphone is listed in the UI (options: ${micOptions.join(', ')}).`);
  if (!systemOptions.includes('wasapi-loopback')) fail(`System audio is not offered in the UI (options: ${systemOptions.join(', ')}).`);
  if (withCamera && cameraOptions.length < 2) fail(`No camera is listed in the UI (options: ${cameraOptions.join(', ')}). Use --no-camera to skip.`);
  step('recorder lists microphone, system audio and camera', `${micOptions.length - 1} mic, loopback, ${cameraOptions.length - 1} camera`);

  await page.getByLabel('Mic source').selectOption({ index: 1 });
  await page.getByLabel('System source').selectOption('wasapi-loopback');
  if (withCamera) await page.getByLabel('Camera source').selectOption({ index: 1 });
  await wait(2000);
  step('sources selected');

  // --- Record
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 20000 });
  step('recording started');

  const tonePath = join(base, 'tone.wav');
  writeToneWav(tonePath);
  setTimeout(() => spawn('powershell.exe', ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${tonePath}').PlaySync()`], { windowsHide: true, stdio: 'ignore' }), 2000);

  // One real OS mouse click on the app's own title text, so the global hook has a click at a known position.
  // Safety: never click another program's window. Bring the app to the front and check that it really is there.
  await wait(2500);
  await assertAppInForeground(app);
  const title = page.locator('h1, h2').first();
  const rect = await title.boundingBox();
  if (!rect) fail('Could not locate a heading to click.');
  const target = await app.evaluate(({ BrowserWindow, screen }, point) => {
    const window = BrowserWindow.getAllWindows()[0];
    const content = window.getContentBounds();
    const physical = screen.dipToScreenPoint({ x: Math.round(content.x + point.x), y: Math.round(content.y + point.y) });
    return { x: physical.x, y: physical.y };
  }, { x: rect.x + Math.min(rect.width / 2, 20), y: rect.y + rect.height / 2 });
  const clickScript = `
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);}'
[M]::SetProcessDPIAware() | Out-Null
[M]::SetCursorPos(${target.x},${target.y}) | Out-Null; Start-Sleep -Milliseconds 300
[M]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [M]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)`;
  powershell(clickScript);
  step('real mouse click sent', `physical ${target.x},${target.y}`);
  await wait(3500);

  await page.getByRole('button', { name: 'Stop recording' }).click();
  // The take is saved and the editor opens with the export controls.
  await page.getByText('Export', { exact: true }).first().waitFor({ timeout: 60000 });
  step('stop saved the take and the editor opened');

  // --- Check what was recorded
  const projectDir = listFiles(recordings).map((f) => f.split(/[\\/]/)[0]).find((name) => /Recording/.test(name));
  if (!projectDir) fail('No recording folder was created.');
  const files = listFiles(join(recordings, projectDir)).filter((f) => !f.includes('.roughcut-visuals'));
  const screenMp4 = files.find((f) => /^rough-cut-[^\\/]*Z\.mp4$/.test(f));
  const cameraMp4 = files.find((f) => /camera\.mp4$/.test(f));
  const projectFile = files.find((f) => /\.roughcut$/.test(f));
  const cursorJson = files.find((f) => /\.cursor\.json$/.test(f));
  if (!screenMp4 || !projectFile) fail(`Missing recording outputs. Found: ${files.join(', ')}`);
  const screenPath = join(recordings, projectDir, screenMp4);
  const screenProbe = ffprobeJson(screenPath, ['-show_entries', 'stream=codec_type,codec_name,width,height:format=duration']);
  const video = screenProbe.streams.find((s) => s.codec_type === 'video');
  const audio = screenProbe.streams.find((s) => s.codec_type === 'audio');
  const recordedSeconds = Number(screenProbe.format.duration);
  if (video?.codec_name !== 'h264') fail(`Screen recording is not h264 video (${JSON.stringify(video)}).`);
  if (!(recordedSeconds > 6 && recordedSeconds < 14)) fail(`Recording length ${recordedSeconds}s is not about the 9 s that was recorded.`);
  if (!audio) fail('The recording has no audio stream although mic and system audio were selected.');
  step('screen recording is valid h264 with audio', `${video.width}x${video.height}, ${recordedSeconds.toFixed(1)} s`);

  const tone = maxVolume(screenPath, 2.0, 1.4);
  if (!(tone > -45)) fail(`The system-audio tone was not audible in the recording (${tone} dB). Is the output volume muted?`);
  step('system-audio tone is audible in the recording', `${tone} dB`);

  if (withCamera) {
    if (!cameraMp4) fail(`No camera file was produced. Found: ${files.join(', ')}`);
    const cameraProbe = ffprobeJson(join(recordings, projectDir, cameraMp4), ['-show_entries', 'stream=codec_type,codec_name,width,height:format=duration']);
    if (!cameraProbe.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264')) fail('The camera file has no h264 video.');
    if (Math.abs(Number(cameraProbe.format.duration) - recordedSeconds) > 2) fail(`Camera length ${cameraProbe.format.duration}s differs from the screen recording (${recordedSeconds}s).`);
    step('camera was recorded and matches the screen length');
  }

  // Cursor data: the click must be recorded where it happened, in physical pixels (this catches display-scaling bugs).
  if (!cursorJson) fail('No cursor data was written.');
  const cursor = JSON.parse(readFileSync(join(recordings, projectDir, cursorJson), 'utf8'));
  const events = cursor.events ?? cursor.cursorEvents ?? (Array.isArray(cursor) ? cursor : []);
  const downs = events.filter((event) => event.type === 'down');
  if (events.length < 20) fail(`Too few cursor events (${events.length}).`);
  const nearest = downs.map((event) => Math.hypot(event.x - target.x, event.y - target.y)).sort((a, b) => a - b)[0];
  if (downs.length === 0) fail('The mouse click was not recorded (no button events). Is the input hook working?');
  if (!(nearest <= 3)) fail(`The click was recorded ${nearest.toFixed(1)} px from where it happened (${target.x},${target.y}). Display scaling is not handled.`);
  step('click recorded at the right place', `${events.length} cursor events, click off by ${nearest.toFixed(1)} px`);

  // --- Export through the UI
  await page.getByText('Export', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Hide export panel' }).waitFor({ timeout: 15000 });
  // Two elements read "Export": the tool tab and the panel's button, which comes last.
  await page.getByText('Export', { exact: true }).last().click();
  step('export started from the Export panel');
  let exported = null;
  for (let i = 0; i < 120 && !exported; i += 1) {
    await wait(1000);
    exported = listFiles(exportsDir).find((f) => /\.mp4$/i.test(f) && !/^\.|rendering|finishing/.test(f.split(/[\\/]/).pop()));
  }
  if (!exported) fail(`No exported MP4 appeared in ${exportsDir} within 2 minutes. UI shows: ${(await page.locator('body').innerText()).slice(-400)}`);
  await wait(2500);
  const exportedPath = join(exportsDir, exported);
  const exportProbe = ffprobeJson(exportedPath, ['-show_entries', 'stream=codec_type,codec_name,width,height:format=duration']);
  const exportVideo = exportProbe.streams.find((s) => s.codec_type === 'video');
  const exportAudio = exportProbe.streams.find((s) => s.codec_type === 'audio');
  const exportSeconds = Number(exportProbe.format.duration);
  if (exportVideo?.codec_name !== 'h264') fail('Exported file has no h264 video.');
  if (!exportAudio) fail('Exported file has no audio.');
  if (Math.abs(exportSeconds - recordedSeconds) > 2) fail(`Exported length ${exportSeconds}s differs from the recording (${recordedSeconds}s).`);
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', exportedPath, '-f', 'null', '-'], { encoding: 'utf8' });
  if (decode.status !== 0 || (decode.stderr ?? '').trim()) fail(`The exported MP4 does not decode cleanly: ${(decode.stderr ?? '').slice(0, 300)}`);
  step('exported MP4 is valid, decodes cleanly and has audio', `${exportVideo.width}x${exportVideo.height}, ${exportSeconds.toFixed(1)} s, ${(statSync(exportedPath).size / 1e6).toFixed(1)} MB`);

  // --- Quit and make sure nothing is left running
  await app.close();
  app = null;
  await wait(3000);
  const ffmpegAfter = ffmpegProcessCount();
  if (ffmpegAfter > ffmpegBefore) fail(`${ffmpegAfter - ffmpegBefore} ffmpeg.exe process(es) were left running after the app closed.`);
  step('app quit leaves no ffmpeg.exe running');

  if (appLog.join('').match(/Unhandled|uncaughtException|FATAL/i)) console.warn('[ui-e2e] note: the app log contains an error line; check it with --keep.');
  console.info(JSON.stringify({ ok: true, steps: summary.steps.length, seconds: Math.round((Date.now() - t0) / 1000) }));
  console.info('UI E2E PASSED');
  if (!keep) rmSync(base, { recursive: true, force: true });
  else console.info(`[ui-e2e] kept: ${base}`);
  process.exit(0);
} catch (error) {
  console.error(`UI E2E FAILED at step ${summary.steps.length + 1} (after: ${summary.steps.at(-1) ?? 'start'}): ${error instanceof Error ? error.message : error}`);
  console.error(`[ui-e2e] artifacts kept at ${base}`);
  try { await app?.close(); } catch { /* already gone */ }
  process.exit(1);
}
