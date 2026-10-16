// Windows recording pipeline smoke. Runs the real recording session against the real desktop with real ffmpeg:
// capture -> stop -> remux to MP4 -> save project -> reopen -> raw export -> styled export, verifying each file.
// It does NOT judge cursor accuracy or audio devices (those are user-evidence checks in the gate); the cursor is synthetic.
//
//   node scripts/windows/smoke-windows-recording.mjs            3.5 s of a 640x360 corner of the primary display
//   ROUGH_CUT_WIN_SMOKE_MS=8000 ROUGH_CUT_WIN_SMOKE_STYLED=0 node ...
//
// Exit 0 and a final JSON line with "ok":true on success. Any failure exits 1 and names the phase.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRecordingSession } from '../../apps/desktop/src/main/recording/recording-session.mjs';
import { stopRecordingAndCreateProject } from '../../apps/desktop/src/main/recording-stop-handler.mjs';
import { remuxMkvToMp4 } from '../../apps/desktop/src/main/remux-service.mjs';
import { assertReadableMp4, computeSyncedRecordingTiming, probeVideoStreamsTiming, probeVideoTiming } from '../../apps/desktop/src/main/media-probe.mjs';
import { openProjectFile, saveProjectForRecording } from '../../apps/desktop/src/main/project-files.mjs';
import { EXPORT_MODES, exportProjectToMp4 } from '../../apps/desktop/src/main/export-service.mjs';
import { listDshowCameraSources, listDshowMicSources, listDshowSystemAudioSources } from '../../apps/desktop/src/main/recording/windows-devices.mjs';
import { LOOPBACK_SOURCE_ID } from '../../apps/desktop/src/main/recording/system-audio-loopback.mjs';

const width = Number(process.env.ROUGH_CUT_WIN_SMOKE_WIDTH ?? 640);
const height = Number(process.env.ROUGH_CUT_WIN_SMOKE_HEIGHT ?? 360);
const durationMs = Number(process.env.ROUGH_CUT_WIN_SMOKE_MS ?? 3500);
const runStyled = process.env.ROUGH_CUT_WIN_SMOKE_STYLED !== '0';
const keep = process.env.ROUGH_CUT_WIN_SMOKE_KEEP === '1';
// ROUGH_CUT_WIN_SMOKE_FLASH=1 (with SOURCES=all): at 3 s a white full-screen flash and a beep start together; the audio
// onset and the flash frame are located in the finished file and the gap is printed (positive = sound after picture).
const flashSync = process.env.ROUGH_CUT_WIN_SMOKE_FLASH === '1';
// ROUGH_CUT_WIN_SMOKE_SOURCES=all also records the first microphone, system audio (a tone is played during the
// take) and the first camera. This uses real devices: the mic hears the room and the camera sees the user.
// Everything is written to a temp folder and deleted afterwards unless ROUGH_CUT_WIN_SMOKE_KEEP=1.
const allSources = process.env.ROUGH_CUT_WIN_SMOKE_SOURCES === 'all';

const bannerStarts = [];
const originalInfo = console.info.bind(console);
console.info = (...parts) => {
  const line = parts.join(' ');
  const m = /Stream #(d+):0: (Video|Audio):.*start ([0-9.]+)/.exec(line);
  if (m && /ffmpeg-capture:stderr/.test(line)) bannerStarts.push({ kind: m[2], start: Number(m[3]), epochAtLog: Date.now() / 1000, hr: Number(process.hrtime.bigint()) / 1e9 });
  originalInfo(...parts);
};
let phase = 'init';
const setPhase = (name) => { phase = name; console.info(`[win-smoke] ${name}`); };
const fail = (message) => { throw new Error(message); };

if (process.platform !== 'win32') fail('This smoke is for Windows.');
if (process.env.ROUGH_CUT_WIN_SMOKE_MEASURE_ONLY) { measureFlashSync(process.env.ROUGH_CUT_WIN_SMOKE_MEASURE_ONLY); process.exit(0); }

const root = await mkdtemp(join(tmpdir(), 'rough-cut-win-smoke-'));
try {
  let t = 0;
  const session = createRecordingSession({
    recordingsDir: root,
    markerPath: join(root, 'recording-recovery.json'),
    getDisplayInfo: () => ({ display: 'desktop+0,0', width, height, originX: 0, originY: 0, scaleFactor: 1 }),
    // A point orbiting the middle of the capture, so cursor telemetry has motion without a human.
    getCursorPoint: () => {
      t += 1;
      return { x: Math.round(width / 2 + (width / 4) * Math.cos(t / 8)), y: Math.round(height / 2 + (height / 4) * Math.sin(t / 8)) };
    },
  });

  const startOptions = {};
  let expectCamera = null;
  if (allSources) {
    const [mic] = await listDshowMicSources();
    const [camera] = await listDshowCameraSources();
    const system = await listDshowSystemAudioSources();
    if (!mic || !camera || !system.some((d) => d.id === LOOPBACK_SOURCE_ID) && process.env.ROUGH_CUT_WIN_SMOKE_NO_LOOPBACK !== '1') fail(`all-sources mode needs a mic, a camera and system-audio loopback; found mic=${mic?.name ?? 'none'} camera=${camera?.name ?? 'none'} loopback=${system.some((d) => d.id === LOOPBACK_SOURCE_ID)}`);
    if (process.env.ROUGH_CUT_WIN_SMOKE_NO_MIC !== '1') startOptions.micSource = mic.id;
    if (process.env.ROUGH_CUT_WIN_SMOKE_NO_LOOPBACK !== '1') startOptions.systemAudioSource = LOOPBACK_SOURCE_ID;
    startOptions.cameraDevicePath = camera.id;
    expectCamera = camera.id;
    console.info(`[win-smoke] sources: mic="${mic.name}" camera="${camera.name}" system=loopback`);
  }

  setPhase('start');
  await session.start(startOptions);
  setPhase('recording');
  if (allSources && flashSync) flashAndBeep(join(root, 'tone.wav'), 3000);
  else if (allSources) playTone(join(root, 'tone.wav'), 700, 1500);
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  setPhase('stop-and-save');
  const stopped = await stopRecordingAndCreateProject({
    recordingSession: session,
    assertReadableMp4,
    remuxMkvToMp4,
    saveProjectForRecording,
    formatProject: (project) => project,
    probeVideoTiming,
    probeVideoStreamsTiming,
    computeSyncedRecordingTiming,
  });
  if (stopped.state !== 'saved' || !stopped.project) fail(`Recording did not save a project (state=${stopped.state}).`);

  setPhase('reopen');
  const reopened = await openProjectFile(stopped.project.path);
  const asset = reopened.document.assets[0];
  const cursorEvents = asset?.metadata?.cursorEvents;
  if (!Array.isArray(cursorEvents) || cursorEvents.length < 3) fail(`Expected cursor events from the session; got ${cursorEvents?.length ?? 0}.`);

  if (allSources) {
    setPhase('verify-sources');
    if (!flashSync) verifyAllSources({ stopped, reopened, expectCamera });
    else measureFlashSync(stopped.outputPath.replace('.mp4', '.mkv'));
  }

  // Raw export is single-recording only; a take with a camera is exported through the styled path (as on Linux).
  if (!expectCamera) {
    setPhase('raw-export');
    const rawPath = join(root, 'raw-export.mp4');
    await exportProjectToMp4({ project: reopened.document, outputPath: rawPath, mode: EXPORT_MODES.RAW });
    await assertReadableMp4(rawPath);
  }

  let styledOk = null;
  if (runStyled) {
    setPhase('styled-export');
    const styledPath = join(root, 'styled-export.mp4');
    await exportProjectToMp4({ project: reopened.document, outputPath: styledPath, mode: EXPORT_MODES.STYLED });
    await assertReadableMp4(styledPath);
    styledOk = true;
  }

  console.info(JSON.stringify({ ok: true, allSources, root: keep ? root : '(removed)', recordingPath: stopped.outputPath, cursorEvents: cursorEvents.length, rawExport: !expectCamera, styledExport: styledOk }));
} catch (error) {
  console.error(`[win-smoke] FAILED in phase "${phase}": ${error instanceof Error ? error.message : error}`);
  console.error(`[win-smoke] artifacts kept at ${root}`);
  process.exit(1);
}
if (!keep) await rm(root, { recursive: true, force: true });
process.exit(0);

// 1.2 s 880 Hz tone through the default output, started after a delay so the take has silence on both sides.
function playTone(path, delayMs, _unused) {
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
  setTimeout(() => {
    spawn('powershell.exe', ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${path}').PlaySync()`], { windowsHide: true, stdio: 'ignore' });
  }, delayMs);
}

function ffprobeJson(args) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-of', 'json', ...args], { encoding: 'utf8' });
  if (result.status !== 0) fail(`ffprobe failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function verifyAllSources({ stopped, reopened, expectCamera }) {
  const document = reopened.document;
  const recordingAsset = document.assets.find((asset) => asset.type === 'recording');
  const cameraAsset = document.assets.find((asset) => asset.type === 'video' && asset.metadata?.isCamera === true);
  if (!recordingAsset?.cameraAssetId || !cameraAsset) fail('The camera was not recorded and linked (no camera asset on the project).');
  if (recordingAsset.cameraAssetId !== cameraAsset.id) fail('cameraAssetId does not point at the camera asset.');
  if (cameraAsset.metadata?.devicePath !== expectCamera) fail(`Camera device not persisted; got ${cameraAsset.metadata?.devicePath ?? 'missing'}.`);

  const probe = ffprobeJson(['-show_entries', 'stream=codec_type,codec_name,width,height,duration', stopped.outputPath]);
  const audio = probe.streams.filter((stream) => stream.codec_type === 'audio');
  const video = probe.streams.filter((stream) => stream.codec_type === 'video');
  if (audio.length === 0) fail('The screen recording has no audio stream even though mic and system audio were requested.');
  if (video.length === 0) fail('The screen recording has no video stream.');

  // The tone must be audible in the mixed audio as a burst that stands out. Its position in the take varies (the take
  // starts a variable time before the session reports it), so measure the peak of every half second and look for it.
  const run = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', stopped.outputPath, '-vn', '-af', 'asetnsamples=n=24000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const levels = [...(run.stdout ?? '').matchAll(/Peak_level=(-?[\d.]+|-inf)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  if (levels.length < 4) fail(`Could not measure audio levels (${levels.length} readings).`);
  const loudest = Math.max(...levels);
  const typical = [...levels].sort((a, b) => a - b)[Math.floor(levels.length / 2)];
  console.info(`[win-smoke] audio: streams=${audio.length} loudest=${loudest} dB typical=${typical} dB`);
  if (!(loudest > -35 && loudest - typical >= 10)) fail(`System audio tone was not found in the recording (loudest ${loudest} dB, typical ${typical} dB).`);
}

// A topmost white form and a beep started from one PowerShell process at the same moment (both prepared in advance).
function flashAndBeep(path, delayMs) {
  const rate = 48000;
  const frames = Math.round(rate * 0.6);
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * 1000 * i) / rate) * 20000);
    data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    "$player = New-Object Media.SoundPlayer '" + path + "'",
    '$player.Load()',
    '$form = New-Object Windows.Forms.Form',
    "$form.FormBorderStyle = 'None'; $form.TopMost = $true; $form.BackColor = 'White'; $form.StartPosition = 'Manual'",
    '$form.Location = New-Object Drawing.Point(0,0); $form.Size = New-Object Drawing.Size(3000,2000); $form.ShowInTaskbar = $false',
    '$target = [DateTime]::UtcNow.AddMilliseconds(' + delayMs + ')',
    'while ([DateTime]::UtcNow -lt $target) { }',
    '$player.Play(); $form.Show(); $form.Refresh()',
    'Start-Sleep -Milliseconds 700',
    '$form.Close()',
  ].join('; ');
  spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true, stdio: 'ignore' });
}

function measureFlashSync(mp4Path) {
  const newline = String.fromCharCode(10);
  // Flash: first video frame whose mean luma jumps well above the frame before it.
  const luma = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', mp4Path, '-an', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const rows = [];
  let pendingTime = null;
  for (const line of (luma.stdout ?? '').split(newline)) {
    const timeMatch = /pts_time:([0-9.]+)/.exec(line);
    if (timeMatch) pendingTime = Number(timeMatch[1]);
    const lumaMatch = /YAVG=([0-9.]+)/.exec(line);
    if (lumaMatch && pendingTime !== null) rows.push({ t: pendingTime, y: Number(lumaMatch[1]) });
  }
  let flashT = null;
  for (let i = 1; i < rows.length; i += 1) if (rows[i].y - rows[i - 1].y > 60) { flashT = rows[i].t; break; }
  // Beep: first 10 ms window whose peak is within 6 dB of the loudest (the 1 kHz tone is far above the room).
  const run = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', mp4Path, '-vn', '-af', 'bandpass=f=1000:width_type=h:w=120,asetnsamples=n=480:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const levels = [...(run.stdout ?? '').matchAll(/Peak_level=(-?[0-9.]+|-inf)/g)].map((m) => Number(m[1]));
  const loud = Math.max(...levels.filter(Number.isFinite));
  const index = levels.findIndex((v) => Number.isFinite(v) && v > loud - 6);
  const beepT = index >= 0 ? index * 0.01 : null;
  console.info(`[win-smoke] flash frame at ${flashT} s (${rows.length} frames read), beep onset at ${beepT} s, loudest ${loud} dB`);
  if (flashT === null || beepT === null) fail('Could not locate the flash and the beep.');
  const video = bannerStarts.find((b) => b.kind === 'Video');
  const audio = bannerStarts.find((b) => b.kind === 'Audio');
  if (video && audio) {
    const nodeToEpoch = audio.epochAtLog - audio.hr;
    const micEpoch = audio.start + nodeToEpoch;
    console.info(`[win-smoke] PREDICTED lead of first audio sample after first video frame = ${Math.round((micEpoch - video.start) * 1000)} ms (video start ${video.start}, audio start ${audio.start})`);
  }
  console.info(`[win-smoke] SYNC audio minus picture = ${Math.round((beepT - flashT) * 1000)} ms (positive: sound after picture)`);
}
