// End-to-end: real export of a zoom and a caption placed ON an added clip, and of a
// sound-only file (mp3) added at the playhead (dev feature, Noam 2026-10-21).
//
// - the added clip is red with a white box in the middle; inside its zoom the box
//   fills far more of the picture than before the zoom (same window as the preview)
// - its caption is burned in only while it plays on the clip
// - the recording, outside the clip, is never zoomed by the clip's zoom
// - an mp3 added with "Play over" is heard together with the recording's tone
// Fixtures come from ffmpeg-safe; the export runs through the app's own capped path.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { describeInsertableVideo } from '../apps/desktop/src/main/dev-media-service.mjs';
import { probeImportedMedia } from '../apps/desktop/src/main/media-probe.mjs';
import { createInsertedMediaAsset, insertMediaClip, placeVoiceTake } from '../packages/project-model/dist/index.js';
import { addCaption } from '../apps/desktop/src/shared/captions.mjs';
import { clipCaptionView, commitClipCaptionView } from '../apps/desktop/src/shared/clip-overlays.mjs';
import { addClipZoomAtFrame } from '../apps/desktop/src/renderer/src/zoom-markers.mjs';

const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';
const root = await mkdtemp(join(tmpdir(), 'rough-cut-clip-overlays-'));
const fps = 30;
const screenPath = join(root, 'screen.mp4');
const clipPath = join(root, 'outside-clip.mp4');
const mp3Path = join(root, 'tone.mp3');
const exportPath = join(root, 'export.mp4');

// Screen: blue, 440 Hz tone, 4 s. Clip: red with a white box in the middle, 3 s, silent.
run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest', '-threads', '2', screenPath]);
run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30,drawbox=x=220:y=105:w=200:h=150:color=white:t=fill', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest', '-threads', '2', clipPath]);
// A sound-only file: 1 kHz tone, 1 s.
run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000', '-t', '1', '-c:a', 'libmp3lame', '-b:a', '128k', '-threads', '2', mp3Path]);

const saved = await saveProjectForRecording({
  startedAt: '2026-01-01T00:00:00.000Z',
  stoppedAt: '2026-01-01T00:00:04.000Z',
  rawPath: screenPath,
  outputPath: screenPath,
  width: 1280,
  height: 720,
  fps,
  audio: { micSource: 'test' },
  cursorEvents: [],
});
let document = { ...saved.document, captions: { enabled: true, position: 'bottom', cues: [] } };
let ids = 0;
const idFactory = (prefix) => `${prefix}-e2e-${++ids}`;

// Clip inserted at 1.0 s (frame 30): timeline 1.0-4.0 s is the clip, the recording resumes at 4.0 s.
const clip = createInsertedMediaAsset({ id: 'clip-1', filePath: clipPath, durationFrames: 90, kind: 'clip', hasAudio: true, width: 640, height: 360, fps });
document = insertMediaClip(document, { asset: clip, frame: 30, mode: 'insert', placement: 'screen', idFactory });
// Zoom on the clip at its own frame 30 (timeline 2.0 s): 60 frames, full hold from 2.6 s to 2.8 s.
document = addClipZoomAtFrame(document, 'clip-1', 30, fps);
// Caption on the clip at its own frames 9-24 (timeline 1.3-1.8 s), before the zoom.
const lined = addCaption(clipCaptionView(document, 'clip-1'), 9, { lengthFrames: 15, text: 'CLIP CAPTION' });
document = commitClipCaptionView(document, 'clip-1', lined.document);
// The mp3, described the way the Dev menu does it, plays over the recording at 4.5 s.
const sound = await describeInsertableVideo(mp3Path, { projectFps: fps, probe: probeImportedMedia, kind: 'audio' });
const soundAsset = createInsertedMediaAsset({ id: 'sound-1', filePath: sound.filePath, durationFrames: sound.durationFrames, kind: 'voice', name: sound.name, voiceMode: 'over', extraMetadata: { soundFile: true } });
document = placeVoiceTake(document, { asset: soundAsset, frame: 135, idFactory });
await writeFile(join(root, 'project.json'), JSON.stringify(document, null, 2));

const result = await exportProjectToMp4({ project: document, outputPath: exportPath, mode: 'styled' });
console.log('exported', result.outputPath);

const failures = [];
const W = 1920;
const H = 1080;
check(sound.durationFrames >= 29 && sound.durationFrames <= 32, `the mp3 is read as a 1 s sound (${sound.durationFrames} frames)`);
check(Math.abs(sound.durationSeconds - 1) < 0.1 && sound.width === null, 'the mp3 has no picture');

// 640x360 fills 1920x1080 exactly: output x maps to clip x / 3.
const unzoomed = frameAt(exportPath, 1.9);
const zoomed = frameAt(exportPath, 2.7);
const whiteIn = (frame) => frame.count('white', 0, 0, W, H);
check(isColor(unzoomed.pixel(300, H / 2), 'red'), `before the zoom the clip's edge is red (${unzoomed.pixel(300, H / 2)})`);
check(isColor(zoomed.pixel(300, H / 2), 'white'), `inside the zoom the white box has grown out to x=300 (${zoomed.pixel(300, H / 2)})`);
check(whiteIn(zoomed) > whiteIn(unzoomed) * 3, `the zoom magnifies the box (${whiteIn(unzoomed)} -> ${whiteIn(zoomed)} white samples)`);
const recordingAfter = frameAt(exportPath, 4.3);
check(isColor(recordingAfter.pixel(W / 2, H / 2), 'blue'), `the recording after the clip is not zoomed or covered (${recordingAfter.pixel(W / 2, H / 2)})`);

// Caption: white text on the clip's bottom strip only while the line plays.
const strip = (frame) => frame.count('white', 0, H * 0.75, W, H);
const withLine = frameAt(exportPath, 1.55);
const withoutLine = frameAt(exportPath, 1.1);
check(strip(withLine) > strip(withoutLine) + 60, `the clip's caption is burned in while it plays (${strip(withoutLine)} -> ${strip(withLine)} white samples)`);
check(strip(frameAt(exportPath, 0.5)) < 50, 'no caption on the recording before the clip');

// Sound: the mp3's 1 kHz tone plays over the recording's 440 Hz tone at 4.5-5.5 s.
const over = toneLevels(exportPath, 4.7, 0.5);
const beforeSound = toneLevels(exportPath, 4.1, 0.3);
check(over.at440 > -35 && over.at1000 > -35, `mp3 heard over the recording (440 Hz ${over.at440} dB, 1 kHz ${over.at1000} dB)`);
check(beforeSound.at1000 < over.at1000 - 15, `no mp3 tone before it starts (${beforeSound.at1000} vs ${over.at1000} dB)`);

if (failures.length > 0) {
  console.error(`FAILED (${failures.length}):\n- ${failures.join('\n- ')}\nfiles: ${root}`);
  process.exit(1);
}
console.log(`PASS clip overlays export e2e (${root})`);

function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
}

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
    for (let y = Math.round(y0); y < y1; y += 4) for (let x = Math.round(x0); x < x1; x += 4) if (isColor(pixel(x, y), color)) n += 1;
    return n;
  };
  return { pixel, count };
}

function isColor([r, g, b], name) {
  if (name === 'red') return r > 180 && g < 70 && b < 70;
  if (name === 'blue') return b > 180 && r < 70 && g < 70;
  if (name === 'white') return r > 200 && g > 200 && b > 200;
  return false;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
}
