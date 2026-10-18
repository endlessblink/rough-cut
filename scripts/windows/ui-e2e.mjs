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
// Peak level (dB) of every half second of the recording's audio. The take starts a variable time before the UI reports
// it, so the tone cannot be looked for at a fixed offset; look for a burst that stands out anywhere in the take.
function peakLevels(file) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-vn', '-af', 'asetnsamples=n=24000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...(run.stdout ?? '').matchAll(/Peak_level=(-?[\d.]+|-inf)/g)].map((match) => Number(match[1]));
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
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

// Safety: the test makes real mouse input, so it must never click another program. Pin the app window on top, work
// out the physical screen point of its title text, and check that the window under that point belongs to the app.
// If not, stop BEFORE recording or clicking anything. Returns the point.
async function locateClickTarget(app, page) {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.setAlwaysOnTop(true, 'screen-saver');
    window.moveTop();
  });
  await wait(800);
  const rect = await page.locator('h1, h2').first().boundingBox();
  if (!rect) fail('Could not locate a heading to click.');
  const target = await app.evaluate(({ BrowserWindow, screen }, point) => {
    const window = BrowserWindow.getAllWindows()[0];
    const content = window.getContentBounds();
    const physical = screen.dipToScreenPoint({ x: Math.round(content.x + point.x), y: Math.round(content.y + point.y) });
    return { x: physical.x, y: physical.y };
  }, { x: rect.x + Math.min(rect.width / 2, 20), y: rect.y + rect.height / 2 });
  const owner = powershell(`
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[StructLayout(LayoutKind.Sequential)]public struct PT{public int X;public int Y;}[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(PT p);[DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint f);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);}'
[W]::SetProcessDPIAware() | Out-Null
$pt = New-Object W+PT; $pt.X = ${target.x}; $pt.Y = ${target.y}
$h = [W]::GetAncestor([W]::WindowFromPoint($pt), 2); $p = 0; [W]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null; $p`).stdout.trim();
  // The owning process must be running the exact executable this test launched (Electron's windows can belong to a
  // sibling of the process Playwright reports, so the path is compared rather than the pid).
  const ownerPath = powershell(`(Get-Process -Id ${Number(owner) || 0} -ErrorAction SilentlyContinue).Path`).stdout.trim();
  const same = (a, b) => a.replaceAll('\\', '/').toLowerCase() === b.replaceAll('\\', '/').toLowerCase();
  if (!ownerPath || !same(ownerPath, exe)) {
    fail(`The window at the click point (${target.x},${target.y}) belongs to "${ownerPath || 'another program'}", not to the app, so the test will not click. Close or minimise other programs, do not touch the PC while it runs, and run it again.`);
  }
  return target;
}

let app = null;
const ffmpegBefore = ffmpegProcessCount();
try {
  if (process.platform !== 'win32') fail('This test is for Windows.');
  if (!existsSync(exe)) fail(`Packaged app not found: ${exe}. Build it first: node scripts/package-windows.mjs`);

  // Settings are seeded so recordings and exports land in the temp folder, never in Documents.
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'app-settings.json'), JSON.stringify({ projectsDir: recordings, exportsDir }));

  // Export normally opens the standard Windows "Save as" dialog, which no UI driver can click. The app's own test
  // hook answers it with this path, so the rest of the export still runs for real. The dialog itself is covered by
  // the "export-playable" check that a person records.
  mkdirSync(join(exportsDir, 'take'), { recursive: true });
  app = await _electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, ROUGH_CUT_UI_SMOKE_EXPORT_PATH: join(exportsDir, 'take', 'take-export.mp4') },
    timeout: 60000,
  });
  const appLog = [];
  app.process().stdout.on('data', (chunk) => appLog.push(String(chunk)));
  app.process().stderr.on('data', (chunk) => appLog.push(String(chunk)));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: 'Record', exact: true }).waitFor({ timeout: 30000 });
  step('app starts and shows the library', (await page.title()) || 'Rough Cut');
  await locateClickTarget(app, page);
  step('the app window is on top where the test will click (safe to use real mouse input)');

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

  // Layout on a short window: the recorder body scrolls, and no card may spill under another. The panel is forced short
  // (as on a small laptop screen) so the check does not depend on this PC's resolution. Regression: the controls block
  // used to shrink below its content, so the Mic activity and Camera rows ended up underneath the camera preview card.
  if (withCamera) {
    await page.addStyleTag({ content: '.preRecordPanel { max-height: 520px !important; }' });
    await wait(400);
    const layout = await page.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
      const controls = document.querySelector('.preRecordControls');
      const camera = document.querySelector('.preRecordCameraSetup');
      const body = document.querySelector('.preRecordBody');
      if (!controls || !camera || !body) return { missing: true };
      const c = box(controls);
      const cam = box(camera);
      const spilled = [...controls.querySelectorAll('.preRecordInputRow')].filter((row) => box(row).bottom > c.bottom + 1).map((row) => row.textContent.trim().slice(0, 16));
      return { spilled, overlap: Math.min(c.bottom, cam.bottom) - Math.max(c.top, cam.top) > 1 && c.bottom > cam.top + 1, scrolls: body.scrollHeight > body.clientHeight };
    });
    if (layout.missing) fail('The recorder panel has no controls, camera card or body to check.');
    if (layout.spilled.length > 0) fail(`Recorder rows spill outside their block on a short window: ${layout.spilled.join(', ')}.`);
    if (layout.overlap) fail('The camera card overlaps the recorder controls on a short window.');
    step('recorder cards do not overlap on a short window', layout.scrolls ? 'the body scrolls' : 'everything fits');
    await page.evaluate(() => { for (const style of document.querySelectorAll('style')) if (style.textContent.includes('max-height: 520px !important')) style.remove(); });
    await wait(300);
  }

  // The Region picker: the full-screen overlay must open (regression: it embedded the whole screen snapshot in a data:
  // URL over Chromium's 2 MB limit, so ERR_INVALID_URL crashed it) and Escape must cancel it without changing the mode.
  const overlayOpened = app.waitForEvent('window', { timeout: 15000 });
  await page.locator('[data-source-option="region"]').click();
  const overlay = await overlayOpened;
  await overlay.waitForLoadState('domcontentloaded');
  await overlay.locator('#apply').waitFor({ timeout: 10000 });
  if (!overlay.url().startsWith('file:')) fail(`The region overlay should load from a temporary file, but loaded ${overlay.url().slice(0, 40)}.`);
  // Escape destroys the overlay while the key press is still being reported, so that call is allowed to throw.
  const overlayClosed = overlay.waitForEvent('close', { timeout: 10000 });
  await overlay.keyboard.press('Escape').catch(() => undefined);
  await overlayClosed.catch(() => fail('Escape did not close the region overlay.'));
  await wait(500);
  const modeAfter = await page.locator('[data-source-option="region"]').getAttribute('aria-pressed');
  if (modeAfter === 'true') fail('Cancelling the region overlay should not switch the recorder to Region.');
  step('region picker opens from a file and Escape cancels it');

  // --- Record
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 20000 });
  step('recording started');

  const tonePath = join(base, 'tone.wav');
  writeToneWav(tonePath);
  setTimeout(() => spawn('powershell.exe', ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${tonePath}').PlaySync()`], { windowsHide: true, stdio: 'ignore' }), 2000);

  // One real OS mouse click on the app's own title text, so the global hook has a click at a known position.
  // Safety: re-check right before clicking that the window under the cursor is the app's own.
  await wait(2500);
  const target = await locateClickTarget(app, page);
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
  await page.locator('[data-ui-region="export-popover-toggle"]').first().waitFor({ timeout: 60000 });
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

  const levels = peakLevels(screenPath).filter((level) => Number.isFinite(level));
  if (levels.length < 6) fail(`Could not measure the audio levels (${levels.length} readings).`);
  const loudest = Math.max(...levels);
  const background = median(levels);
  if (!(loudest > -35 && loudest - background >= 10)) {
    fail(`The system-audio tone was not found in the recording: loudest half second ${loudest} dB, typical ${background} dB. Is the output volume muted?`);
  }
  step('system-audio tone is audible in the recording', `loudest ${loudest} dB, typical ${background} dB`);

  if (withCamera) {
    if (!cameraMp4) fail(`No camera file was produced. Found: ${files.join(', ')}`);
    const cameraProbe = ffprobeJson(join(recordings, projectDir, cameraMp4), ['-show_entries', 'stream=codec_type,codec_name,width,height:format=duration']);
    if (!cameraProbe.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264')) fail('The camera file has no h264 video.');
    // The camera starts before the screen (its device takes time to open), so its file is longer by that head start,
    // and the project trims the head. What must hold: the project keeps the WHOLE take, and the camera still covers
    // all of it after the trim. (A wrong head-start estimate once cut 2.2 s of real footage out of every take.)
    const cameraSeconds = Number(cameraProbe.format.duration);
    const saved = JSON.parse(readFileSync(join(recordings, projectDir, projectFile), 'utf8'));
    const cameraAsset = saved.assets.find((asset) => asset.metadata?.isCamera === true);
    const fps = saved.settings?.frameRate ?? 30;
    const headTrimSeconds = (cameraAsset?.metadata?.sourceInFrames ?? 0) / fps;
    const timelineSeconds = saved.composition.duration / fps;
    if (timelineSeconds < recordedSeconds - 1.5) fail(`The project is ${timelineSeconds.toFixed(1)} s but the take is ${recordedSeconds.toFixed(1)} s: footage was cut off (camera head trim ${headTrimSeconds.toFixed(1)} s, camera clip ${cameraSeconds.toFixed(1)} s).`);
    if (cameraSeconds - headTrimSeconds < recordedSeconds - 1.5) fail(`After its ${headTrimSeconds.toFixed(1)} s head trim the camera covers ${(cameraSeconds - headTrimSeconds).toFixed(1)} s of the ${recordedSeconds.toFixed(1)} s take.`);
    step('camera was recorded and the project keeps the whole take', `camera ${cameraSeconds.toFixed(1)} s, head trim ${headTrimSeconds.toFixed(1)} s, project ${timelineSeconds.toFixed(1)} s`);
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
  if (!/\[export\] finished ok=true/.test(exportLog)) fail(`The export did not finish within 4 minutes. UI shows: ${(await page.locator('body').innerText()).slice(-400).replace(/\s+/g, ' ')}`);
  const exported = listFiles(exportsDir).find((f) => /\.mp4$/i.test(f) && !/^\.|rendering|finishing/.test(f.split(/[\\/]/).pop()));
  if (!exported) fail(`The export finished but no MP4 is in ${exportsDir}.`);
  await wait(1000);
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
