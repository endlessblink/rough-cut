import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-headless-export-'));
const mediaPath = join(root, 'source.mp4');
const styledPath = join(root, 'styled-baseline.mp4');
const outputPath = join(root, 'experimental-headless-export.mp4');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildCursorFixtureFilter(),
  '-t',
  '1',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + 1000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 1280,
  height: 720,
  fps: 30,
  cursorEvents: [
    { frame: 0, timeMs: 0, x: 640, y: 360, type: 'move', button: 0 },
    { frame: 15, timeMs: 500, x: 720, y: 390, type: 'move', button: 0 },
  ],
});
const recordingAsset = project.document.assets.find((asset) => asset.type === 'recording');
const presentation = createDefaultRecordingPresentation();
recordingAsset.presentation = {
  ...presentation,
  ...recordingAsset.presentation,
  zoom: {
    ...presentation.zoom,
    ...recordingAsset.presentation?.zoom,
    markers: [
      createZoomMarker(0, 29, {
        strength: 1.1,
        focalPoint: { x: 0.5, y: 0.5 },
        zoomInDuration: 1,
        zoomOutDuration: 1,
      }),
    ],
  },
};

const progress = [];
const styledResult = await exportProjectToMp4({
  project: project.document,
  outputPath: styledPath,
  mode: 'styled',
});
const result = await exportProjectToMp4({
  project: project.document,
  outputPath,
  mode: 'experimental-headless',
  onProgress: (event) => progress.push(event),
});
const styledProbe = probeVideo(styledPath);
const probe = probeVideo(outputPath);
if (JSON.stringify(styledProbe) !== JSON.stringify(probe)) {
  throw new Error(`Experimental headless export stream metadata diverged from styled export: ${JSON.stringify({ styledProbe, probe })}`);
}

const frameComparisons = compareRepresentativeFrames({
  expectedPath: styledPath,
  actualPath: outputPath,
  width: probe.width,
  height: probe.height,
  fps: 30,
  frameIndexes: result.compositionPlan.frames.map((frame) => frame.frameIndex),
});
const failedComparison = frameComparisons.find((comparison) => !comparison.ok);
if (failedComparison) {
  throw new Error(`Experimental headless export diverged from styled export at a representative frame: ${JSON.stringify({ failedComparison, frameComparisons })}`);
}
const zoomedCursorSharpness = sampleBrightDark(outputPath, {
  timeSeconds: 0.5,
  x: 1160,
  y: 600,
  width: 180,
  height: 180,
});
if (zoomedCursorSharpness.bright < 120 || zoomedCursorSharpness.dark < 70) {
  throw new Error(`Zoomed experimental export cursor was not visible/sharp enough: ${JSON.stringify(zoomedCursorSharpness)}`);
}

const stream = { width: probe.width, height: probe.height, r_frame_rate: probe.r_frame_rate };
if (!stream || stream.width !== 1920 || stream.height !== 1080) {
  throw new Error(`Experimental headless export dimensions were wrong: ${JSON.stringify(probe)}`);
}
if (stream.r_frame_rate !== '30/1') {
  throw new Error(`Experimental headless export framerate was wrong: ${JSON.stringify(probe)}`);
}
const styledBytes = (await readFile(styledPath)).length;
const bytes = (await readFile(outputPath)).length;
if (!(styledBytes > 0) || styledResult.byteEqualCandidate) {
  throw new Error(`Styled baseline export did not produce a rendered artifact: ${JSON.stringify({ styledResult, styledBytes })}`);
}
if (!(bytes > 0) || result.byteEqualCandidate) {
  throw new Error(`Experimental headless export did not produce a rendered artifact: ${JSON.stringify({ result, bytes })}`);
}
if (result.fallback?.to !== 'ffmpeg-styled' || result.fallback?.active !== true) {
  throw new Error(`Experimental headless export did not report explicit FFmpeg fallback: ${JSON.stringify(result.fallback)}`);
}
if (result.compositionPlan?.kind !== 'experimental-headless-export-plan' || result.compositionPlan.frames?.length !== 3) {
  throw new Error(`Experimental headless export did not report sampled composition frames: ${JSON.stringify(result.compositionPlan)}`);
}
if (!progress.some((event) => event.phase === 'rendering-headless-prototype' && event.fallback?.to === 'ffmpeg-styled')) {
  throw new Error(`Experimental headless export did not emit prototype fallback progress: ${JSON.stringify(progress)}`);
}

console.info(JSON.stringify({
  ok: true,
  root,
  projectPath: project.path,
  styledPath,
  outputPath,
  width: stream.width,
  height: stream.height,
  fps: stream.r_frame_rate,
  styledBytes,
  bytes,
  fallback: result.fallback,
  sampledFrames: result.compositionPlan.frames.map((frame) => frame.frameIndex),
  frameComparisons,
  zoomedCursorSharpness,
}, null, 2));

function buildCursorFixtureFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'color=c=0x406080:s=1280x720:r=30',
    'drawbox=x=64:y=64:w=260:h=140:color=0x5b7896:t=fill',
    'drawbox=x=956:y=516:w=260:h=140:color=0x6d8aa5:t=fill',
    `drawtext=fontfile=${font}:text='ZOOM CURSOR':fontcolor=0xc9d5df:fontsize=42:x=470:y=312`,
  ].join(',');
}

function probeVideo(videoPath) {
  const probe = JSON.parse(runCapture('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration,r_frame_rate',
    '-of',
    'json',
    videoPath,
  ]));
  const stream = probe.streams?.[0];
  return {
    width: stream?.width,
    height: stream?.height,
    duration: stream?.duration,
    r_frame_rate: stream?.r_frame_rate,
  };
}

function compareRepresentativeFrames({ expectedPath, actualPath, width, height, fps, frameIndexes }) {
  return frameIndexes.map((frameIndex) => {
    const timeSeconds = frameIndex / fps;
    const expected = sampleFrame(expectedPath, { timeSeconds, width, height });
    const actual = sampleFrame(actualPath, { timeSeconds, width, height });
    const comparison = comparePixels(expected, actual);
    return {
      frameIndex,
      timeSeconds,
      ...comparison,
      ok: comparison.meanAbsDiff <= 2 && comparison.changedPixelRatio <= 0.01,
    };
  });
}

function sampleFrame(videoPath, { timeSeconds, width, height }) {
  return runBuffer('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(Math.max(0, timeSeconds)),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ], width * height * 3 + 1024);
}

function sampleBrightDark(videoPath, crop) {
  const pixels = runBuffer('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(Math.max(0, crop.timeSeconds)),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-vf',
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ], crop.width * crop.height * 3 + 1024);
  let bright = 0;
  let dark = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (red > 238 && green > 238 && blue > 238) bright += 1;
    if (red < 85 && green < 85 && blue < 85) dark += 1;
  }
  return { bright, dark };
}

function comparePixels(expected, actual) {
  if (expected.length !== actual.length) {
    throw new Error(`Representative frame buffers had different sizes: ${JSON.stringify({ expected: expected.length, actual: actual.length })}`);
  }
  let totalDiff = 0;
  let changedPixels = 0;
  let maxChannelDiff = 0;
  for (let index = 0; index < expected.length; index += 3) {
    const redDiff = Math.abs(expected[index] - actual[index]);
    const greenDiff = Math.abs(expected[index + 1] - actual[index + 1]);
    const blueDiff = Math.abs(expected[index + 2] - actual[index + 2]);
    const pixelDiff = redDiff + greenDiff + blueDiff;
    totalDiff += pixelDiff;
    maxChannelDiff = Math.max(maxChannelDiff, redDiff, greenDiff, blueDiff);
    if (pixelDiff > 12) changedPixels += 1;
  }
  const pixelCount = expected.length / 3;
  return {
    meanAbsDiff: Number((totalDiff / expected.length).toFixed(3)),
    changedPixelRatio: Number((changedPixels / pixelCount).toFixed(4)),
    maxChannelDiff,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return result.stdout;
}

function runBuffer(command, args, maxBuffer) {
  const result = spawnSync(command, args, { encoding: 'buffer', maxBuffer });
  if (result.stderr?.length) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return result.stdout;
}
