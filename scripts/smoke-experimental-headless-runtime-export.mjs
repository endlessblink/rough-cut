import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-headless-runtime-export-'));
const sourcePath = join(root, 'red-source-with-audio.mp4');
const styledPath = join(root, 'styled-baseline.mp4');
const outputPath = join(root, 'experimental-headless-runtime.mp4');
const resultPath = join(root, 'headless-runtime-result.json');
const userDataPath = join(root, 'electron-user-data');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'color=c=0xff0000:s=640x360:r=30:d=1',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=660:sample_rate=48000:d=1',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-movflags',
  '+faststart',
  sourcePath,
]);

const startedAt = new Date('2026-06-12T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 1000);
const savedProject = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: sourcePath,
  outputPath: sourcePath,
  width: 640,
  height: 360,
  fps: 30,
  cursorEvents: [
    { frame: 0, x: 320, y: 180, type: 'move', button: 'none' },
    { frame: 15, x: 360, y: 190, type: 'move', button: 'none' },
  ],
  audio: { micSource: 'runtime-smoke-tone' },
});
const project = await saveProjectFile(savedProject.path, withPrimaryTimelineClips(savedProject.document, [
  { id: 'screen-before-gap', timelineIn: 0, timelineOut: 10, sourceIn: 0, sourceOut: 10 },
  { id: 'screen-after-gap', timelineIn: 20, timelineOut: 30, sourceIn: 20, sourceOut: 30 },
], 30));

const styledResult = await exportProjectToMp4({
  project: project.document,
  outputPath: styledPath,
  mode: 'styled',
});
if (styledResult.byteEqualCandidate) {
  throw new Error(`Styled baseline unexpectedly used raw copy behavior: ${JSON.stringify(styledResult)}. Artifacts: ${root}`);
}

const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const electronArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
  '--force-color-profile=srgb',
  `--user-data-dir=${userDataPath}`,
  '.',
];
const result = spawnSync(electron, electronArgs, {
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: '1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1',
    ROUGH_CUT_HEADLESS_EXPORT_SMOKE_PROJECT_PATH: project.path,
    ROUGH_CUT_HEADLESS_EXPORT_SMOKE_OUTPUT_PATH: outputPath,
    ROUGH_CUT_HEADLESS_EXPORT_SMOKE_RESULT_PATH: resultPath,
  },
  encoding: 'utf8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  throw new Error(`Electron headless runtime export smoke could not launch Electron: ${result.error.message}. Args: ${JSON.stringify(electronArgs)}. Artifacts: ${root}`);
}
if (result.status !== 0) {
  const reportText = await readMaybe(resultPath);
  throw new Error(`Electron headless runtime export smoke failed with exit code ${result.status}. Artifacts: ${root}. Report: ${reportText ?? 'not written'}`);
}

const reportText = await readFile(resultPath, 'utf8');
const report = JSON.parse(reportText);
if (!report.ok) {
  throw new Error(`Electron headless runtime export smoke failed: ${JSON.stringify(report)}. Artifacts: ${root}`);
}
if (report.result?.fallback?.active !== false) {
  throw new Error(`Experimental runtime export unexpectedly fell back: ${JSON.stringify(report.result?.fallback)}. Artifacts: ${root}`);
}
if (report.result?.headlessRender?.ok !== true) {
  throw new Error(`Experimental runtime renderer did not report ok: ${JSON.stringify(report.result?.headlessRender)}. Artifacts: ${root}`);
}
if (!Array.isArray(report.result?.headlessRender?.frameArtifacts) || report.result.headlessRender.frameArtifacts.length !== 30) {
  throw new Error(`Expected 30 rendered frame artifacts: ${JSON.stringify(report.result?.headlessRender?.frameArtifacts?.slice?.(0, 3))}. Artifacts: ${root}`);
}
const renderResults = report.result?.headlessRender?.renderSurface?.renderResults;
if (!Array.isArray(renderResults) || renderResults.length !== 30) {
  throw new Error(`Expected 30 per-frame render results: ${JSON.stringify(renderResults?.slice?.(0, 3))}. Artifacts: ${root}`);
}
const webglFrameCount = renderResults.filter((frame) => frame?.rendererKind === 'webgl').length;
if (webglFrameCount < 1) {
  throw new Error(`Experimental runtime renderer did not produce any WebGL frames: ${JSON.stringify(renderResults.slice(0, 3))}. Artifacts: ${root}`);
}
const failedVideoDraws = renderResults.filter((frame) => frame?.timelineGap !== true && frame?.drewScreen !== true);
if (failedVideoDraws.length > 0) {
  throw new Error(`Experimental runtime renderer used non-video fallback frames: ${JSON.stringify(failedVideoDraws.slice(0, 3))}. Artifacts: ${root}`);
}
const gapRender = renderResults.find((frame) => frame?.frameIndex === 15);
if (gapRender?.timelineGap !== true || gapRender?.drewScreen !== null) {
  throw new Error(`Experimental runtime renderer did not preserve the timeline gap at frame 15: ${JSON.stringify(gapRender)}. Artifacts: ${root}`);
}
const cursorRender = renderResults.find((frame) => frame?.frameIndex === 25);
if (!cursorRender?.cursorPoint || cursorRender.cursorPoint.x < 900 || cursorRender.cursorPoint.x > 1200 || cursorRender.cursorPoint.y < 430 || cursorRender.cursorPoint.y > 620) {
  throw new Error(`Experimental runtime renderer placed the cursor outside the expected source-mapped region at frame 25: ${JSON.stringify(cursorRender)}. Artifacts: ${root}`);
}

const firstArtifact = report.result.headlessRender.frameArtifacts[0].path;
const firstArtifactInfo = await stat(firstArtifact);
if (!(firstArtifactInfo.size > 1000)) {
  throw new Error(`First rendered frame artifact was too small: ${firstArtifactInfo.size}. Artifacts: ${root}`);
}

const centerRgb = averageRgb(firstArtifact, 'crop=400:200:760:440,scale=1:1');
if (!(centerRgb.r > 150 && centerRgb.g < 90 && centerRgb.b < 90)) {
  throw new Error(`Rendered frame did not contain the red source video in the screen region: ${JSON.stringify(centerRgb)}. Artifacts: ${root}`);
}
const gapArtifact = report.result.headlessRender.frameArtifacts.find((artifact) => artifact.frameIndex === 15)?.path;
if (!gapArtifact) {
  throw new Error(`Experimental runtime renderer did not write a frame artifact for the timeline gap. Artifacts: ${root}`);
}
const gapRgb = averageRgb(gapArtifact, 'crop=400:200:760:440,scale=1:1');
if (!(gapRgb.r < 30 && gapRgb.g < 30 && gapRgb.b < 30)) {
  throw new Error(`Timeline gap frame was not black/background-only: ${JSON.stringify(gapRgb)}. Artifacts: ${root}`);
}
const cursorArtifact = report.result.headlessRender.frameArtifacts.find((artifact) => artifact.frameIndex === 25)?.path;
if (!cursorArtifact) {
  throw new Error(`Experimental runtime renderer did not write a frame artifact for the cursor sample. Artifacts: ${root}`);
}
const cursorSharpness = sampleBrightDark(cursorArtifact, {
  x: Math.max(0, Math.round(cursorRender.cursorPoint.x - 48)),
  y: Math.max(0, Math.round(cursorRender.cursorPoint.y - 48)),
  width: 96,
  height: 96,
});
if (cursorSharpness.bright < 40 || cursorSharpness.dark < 30) {
  throw new Error(`Experimental runtime cursor was not sharp/visible enough: ${JSON.stringify({ cursorRender, cursorSharpness })}. Artifacts: ${root}`);
}

const streams = probeStreams(outputPath);
const styledStreams = probeStreams(styledPath);
const video = streams.find((stream) => stream.codec_type === 'video');
const styledVideo = styledStreams.find((stream) => stream.codec_type === 'video');
const audio = streams.find((stream) => stream.codec_type === 'audio');
if (!video || video.width !== 1920 || video.height !== 1080 || video.r_frame_rate !== '30/1') {
  throw new Error(`Experimental runtime export video stream metadata was wrong: ${JSON.stringify(streams)}. Artifacts: ${root}`);
}
if (!styledVideo || styledVideo.width !== video.width || styledVideo.height !== video.height || styledVideo.r_frame_rate !== video.r_frame_rate) {
  throw new Error(`Experimental runtime export metadata diverged from styled baseline: ${JSON.stringify({ styledStreams, streams })}. Artifacts: ${root}`);
}
if (!audio) {
  throw new Error(`Experimental runtime export did not preserve audio: ${JSON.stringify(streams)}. Artifacts: ${root}`);
}
const frameComparisons = compareRepresentativeFrames({
  expectedPath: styledPath,
  actualPath: outputPath,
  width: video.width,
  height: video.height,
  fps: 30,
  frameIndexes: [5, 15, 25],
});
const failedComparison = frameComparisons.find((comparison) => !comparison.ok);
if (failedComparison) {
  throw new Error(`Experimental runtime export diverged from styled baseline: ${JSON.stringify({ failedComparison, frameComparisons })}. Artifacts: ${root}`);
}

console.info(JSON.stringify({
  ok: true,
  root,
  projectPath: project.path,
  styledPath,
  outputPath,
  resultPath,
  bytes: report.result.bytes,
  durationMs: report.durationMs,
  frameArtifacts: report.result.headlessRender.frameArtifacts.length,
  webglFrameCount,
  firstArtifact,
  centerRgb,
  gapArtifact,
  gapRgb,
  cursorArtifact,
  cursorSharpness,
  frameComparisons,
  streams,
}, null, 2));

function withPrimaryTimelineClips(project, clipPatches, compositionDuration) {
  const sourceId = `source:${project.assets[0].id}:screen`;
  const track = project.timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.mediaId === sourceId));
  const clip = track?.clips.find((candidate) => candidate.mediaId === sourceId);
  if (!track || !clip) throw new Error('Runtime export smoke fixture did not contain a primary timeline clip.');
  return {
    ...project,
    composition: {
      ...project.composition,
      duration: compositionDuration,
    },
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((candidate) => candidate.id === track.id
        ? {
            ...candidate,
            clips: clipPatches.map((patch) => ({ ...clip, ...patch, trackId: track.id, mediaId: clip.mediaId })),
          }
        : candidate),
    },
  };
}

function averageRgb(path, filter) {
  const raw = runCapture('ffmpeg', [
    '-v',
    'error',
    '-i',
    path,
    '-vf',
    filter,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
  const bytes = Buffer.from(raw, 'binary');
  return {
    r: bytes[0] ?? 0,
    g: bytes[1] ?? 0,
    b: bytes[2] ?? 0,
  };
}

function sampleBrightDark(path, crop) {
  const raw = runCapture('ffmpeg', [
    '-v',
    'error',
    '-i',
    path,
    '-vf',
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
  const bytes = Buffer.from(raw, 'binary');
  let bright = 0;
  let dark = 0;
  for (let index = 0; index < bytes.length; index += 3) {
    const red = bytes[index] ?? 0;
    const green = bytes[index + 1] ?? 0;
    const blue = bytes[index + 2] ?? 0;
    if (red > 238 && green > 238 && blue > 238) bright += 1;
    if (red < 85 && green < 85 && blue < 85) dark += 1;
  }
  return { bright, dark };
}

function probeStreams(path) {
  const probe = JSON.parse(runCapture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,width,height,r_frame_rate,duration',
    '-of',
    'json',
    path,
  ]));
  return probe.streams ?? [];
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
      ok: comparison.meanAbsDiff <= 6 && comparison.changedPixelRatio <= 0.03,
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
    if (pixelDiff > 18) changedPixels += 1;
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
  const result = spawnSync(command, args, { encoding: 'binary', maxBuffer: 1024 * 1024 * 32 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}: ${result.stderr}`);
  return result.stdout;
}

function runBuffer(command, args, maxBuffer) {
  const result = spawnSync(command, args, { encoding: 'buffer', maxBuffer });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}: ${result.stderr}`);
  return result.stdout;
}

async function readMaybe(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
