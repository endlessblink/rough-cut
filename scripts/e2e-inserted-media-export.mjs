// End-to-end: real media in, real export out, for clips added from outside the
// recording and for camera takes (dev feature, docs/SPEC-dev-insert-and-camera-takes-2026-10-20.md).
//
// Builds a small Screen + Camera project, inserts an outside clip at the playhead
// (ripple), records-in a camera take over a range, exports it styled, and checks the
// frames and the sound where each piece should be:
// - the added clip takes the whole picture (red in the middle, project background on the sides)
// - its silent sound replaces the recording's tone
// - the camera take is the bubble for its range and its silent voice mutes the tone there
// - the recording, its bubble and its tone come back afterwards, moved later by the clip
// Fixtures are generated with ffmpeg-safe (memory-capped); the export itself runs
// through the app's own capped, low-priority ffmpeg path.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { createInsertedMediaAsset, insertMediaClip, listInsertedClips, placeVoiceTake } from '../packages/project-model/dist/index.js';

const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';
const root = await mkdtemp(join(tmpdir(), 'rough-cut-inserted-media-'));
const fps = 30;
const screenPath = join(root, 'screen.mp4');
const cameraPath = join(root, 'screen-camera.mp4');
const clipPath = join(root, 'outside-clip.mp4');
const takePath = join(root, 'take.mp4');
const exportPath = join(root, 'export.mp4');
const voiceReplacePath = join(root, 'voice-replace.webm');
const voiceOverPath = join(root, 'voice-over.webm');

// Screen: blue with a 440 Hz tone. Camera: green. Outside clip: red, a different
// shape, silent. Take: yellow, silent, with a 0.5 s lead-in before the range.
fixture(screenPath, 'color=c=blue:s=1280x720:r=30', 6, 'sine=frequency=440:sample_rate=48000');
fixture(cameraPath, 'color=c=green:s=640x480:r=30', 6, null);
fixture(clipPath, 'color=c=red:s=640x360:r=30', 2, 'anullsrc=r=48000:cl=stereo');
fixture(takePath, 'color=c=yellow:s=640x480:r=30', 2, 'anullsrc=r=48000:cl=stereo');
// Voice-over takes are sound only (like the mic recordings): one silent, one a 1 kHz tone.
audioFixture(voiceReplacePath, 'anullsrc=r=48000:cl=mono', 1);
audioFixture(voiceOverPath, 'sine=frequency=1000:sample_rate=48000', 1);

const saved = await saveProjectForRecording({
  startedAt: '2026-01-01T00:00:00.000Z',
  stoppedAt: '2026-01-01T00:00:06.000Z',
  rawPath: screenPath,
  outputPath: screenPath,
  width: 1280,
  height: 720,
  fps,
  audio: { micSource: 'test' },
  camera: { outputPath: cameraPath, rawPath: cameraPath, width: 640, height: 480 },
  cursorEvents: [],
});
let document = saved.document;
let ids = 0;
const idFactory = (prefix) => `${prefix}-e2e-${++ids}`;

// Camera take over timeline 0.5 s - 1.5 s (frames 15-45), skipping its 15-frame lead-in.
const take = createInsertedMediaAsset({ id: 'take-1', filePath: takePath, durationFrames: 60, kind: 'pickup', hasAudio: true, width: 640, height: 480, fps });
document = insertMediaClip(document, { asset: take, frame: 15, mode: 'overwrite', placement: 'camera', sourceIn: 15, sourceOut: 45, idFactory });
// Outside clip inserted at 2.0 s (frame 60), rippling the rest 2 s later.
const clip = createInsertedMediaAsset({ id: 'clip-1', filePath: clipPath, durationFrames: 60, kind: 'clip', hasAudio: true, width: 640, height: 360, fps });
document = insertMediaClip(document, { asset: clip, frame: 60, mode: 'insert', placement: 'screen', idFactory });
// After the clip ripple: 4.0-4.6 s a silent voice-over replaces the tone; 5.0-5.6 s a 1 kHz one plays over it.
const replaceVoice = createInsertedMediaAsset({ id: 'voice-1', filePath: voiceReplacePath, durationFrames: 30, kind: 'voice', voiceMode: 'replace' });
document = placeVoiceTake(document, { asset: replaceVoice, frame: 120, sourceIn: 6, sourceOut: 24, idFactory });
const overVoice = createInsertedMediaAsset({ id: 'voice-2', filePath: voiceOverPath, durationFrames: 30, kind: 'voice', voiceMode: 'over' });
document = placeVoiceTake(document, { asset: overVoice, frame: 150, sourceIn: 6, sourceOut: 24, idFactory });
console.log('inserted:', listInsertedClips(document).map((item) => `${item.lane} ${item.timelineIn}-${item.timelineOut}`).join(', '));

const result = await exportProjectToMp4({ project: document, outputPath: exportPath, mode: 'styled' });
console.log('exported', result.outputPath);

const failures = [];
const duration = Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', exportPath]).trim());
check(Math.abs(duration - 8) < 0.15, `export is 8 s long (6 s recording + 2 s clip), got ${duration}`);

const W = 1920;
const H = 1080;
const at = (sec) => frameAt(exportPath, sec);
// Added clip: whole picture. 640x360 fits a 1920x1080 frame exactly, so it fills it.
const inClip = at(3.0);
check(isColor(inClip.pixel(W / 2, H / 2), 'red'), `added clip fills the middle at 3.0 s, got ${inClip.pixel(W / 2, H / 2)}`);
check(isColor(inClip.pixel(40, 40), 'red'), `added clip takes the whole picture at 3.0 s (corner ${inClip.pixel(40, 40)})`);
check(inClip.count('green', W / 2, H / 2, W, H) === 0, 'no recording camera bubble during the added clip');
// Recording before the clip, with the take as its bubble.
const inTake = at(1.0);
check(isColor(inTake.pixel(W / 2, H / 2), 'blue'), `recording screen at 1.0 s, got ${inTake.pixel(W / 2, H / 2)}`);
check(inTake.count('yellow', W / 2, H / 2, W, H) > 2000, 'camera take is the bubble at 1.0 s');
check(inTake.count('green', W / 2, H / 2, W, H) === 0, 'recording camera hidden under the take at 1.0 s');
// After the take, before the clip: the recording camera is back.
const afterTake = at(1.8);
check(afterTake.count('green', W / 2, H / 2, W, H) > 2000, 'recording camera back at 1.8 s');
// After the clip: the recording continues, moved 2 s later, with its bubble.
const afterClip = at(5.0);
check(isColor(afterClip.pixel(W / 2, H / 2), 'blue'), `recording continues after the clip at 5.0 s, got ${afterClip.pixel(W / 2, H / 2)}`);
check(afterClip.count('green', W / 2, H / 2, W, H) > 2000, 'recording camera after the clip at 5.0 s');

// Sound: the tone plays except where a silent clip or a silent take replaced it.
const loud = (from, to) => meanVolume(exportPath, from, to);
check(loud(0.1, 0.4) > -30, `recording tone before the take (${loud(0.1, 0.4)} dB)`);
check(loud(0.7, 1.3) < -60, `take's silent voice replaces the tone (${loud(0.7, 1.3)} dB)`);
check(loud(1.6, 1.9) > -30, `tone back after the take (${loud(1.6, 1.9)} dB)`);
check(loud(2.3, 3.7) < -60, `added clip's silent sound replaces the tone (${loud(2.3, 3.7)} dB)`);
check(loud(5.7, 5.95) > -30, `tone continues after the clip and both voice-overs (${loud(5.7, 5.95)} dB)`);
check(loud(4.05, 4.15) < -60 && loud(4.4, 4.5) < -60, `a replace voice-over mutes the tone under it (${loud(4.05, 4.15)} / ${loud(4.4, 4.5)} dB)`);
check(loud(4.7, 4.9) > -30, `tone back after the replace voice-over (${loud(4.7, 4.9)} dB)`);
const over = toneLevels(exportPath, 5.1, 0.4);
check(over.at440 > -35 && over.at1000 > -35, `a play-over voice-over is heard with the tone (440 Hz ${over.at440} dB, 1 kHz ${over.at1000} dB)`);
const before = toneLevels(exportPath, 4.7, 0.25);
// The band filter lets a little of the 440 Hz tone through, so compare against the voice-over itself.
check(before.at1000 < over.at1000 - 15, `no voice-over tone before it starts (${before.at1000} dB vs ${over.at1000} dB while it plays)`);

if (failures.length > 0) {
  console.error(`FAILED (${failures.length}):\n- ${failures.join('\n- ')}\nfiles: ${root}`);
  process.exit(1);
}
console.log(`PASS inserted media export e2e (${root})`);

function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
}

function fixture(path, video, seconds, audio) {
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', video];
  if (audio) args.push('-f', 'lavfi', '-i', audio);
  args.push('-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15');
  if (audio) args.push('-c:a', 'aac', '-shortest');
  args.push('-threads', '2', path);
  run(FFMPEG, args);
}

function audioFixture(path, source, seconds) {
  run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', source, '-t', String(seconds), '-c:a', 'libopus', '-threads', '2', path]);
}

/** Level of the 440 Hz recording tone and the 1 kHz voice-over tone, each isolated by a narrow band. */
function toneLevels(path, from, length) {
  const band = (hz) => {
    const result = spawnSync(FFMPEG, ['-v', 'info', '-ss', String(from), '-t', String(length), '-i', path, '-vn', '-af', `bandpass=f=${hz}:width_type=q:w=8,volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    const match = String(result.stderr).match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
    return !match || match[1] === '-inf' ? -Infinity : Number(match[1]);
  };
  return { at440: band(440), at1000: band(1000) };
}

function frameAt(path, sec) {
  const raw = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(sec), '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '2', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  if (raw.status !== 0) throw new Error(`frame grab failed: ${raw.stderr}`);
  const data = raw.stdout;
  const pixel = (x, y) => {
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const count = (color, x0, y0, x1, y1) => {
    let n = 0;
    for (let y = Math.round(y0); y < y1; y += 2) for (let x = Math.round(x0); x < x1; x += 2) if (isColor(pixel(x, y), color)) n += 1;
    return n;
  };
  return { pixel, count };
}

function isColor([r, g, b], name) {
  if (name === 'red') return r > 180 && g < 70 && b < 70;
  if (name === 'green') return g > 90 && r < 60 && b < 60;
  if (name === 'blue') return b > 180 && r < 70 && g < 70;
  if (name === 'yellow') return r > 180 && g > 180 && b < 80;
  return false;
}

function meanVolume(path, from, to) {
  const result = spawnSync(FFMPEG, ['-v', 'info', '-ss', String(from), '-t', String(to - from), '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = String(result.stderr).match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
  if (!match) return -Infinity;
  return match[1] === '-inf' ? -Infinity : Number(match[1]);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
  return result.stdout;
}
