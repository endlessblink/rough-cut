import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportProjectToMp4, resolveTimelineExportRecording } from '../apps/desktop/src/main/export-service.mjs';
import { createProjectForRecording, getPrimaryRecording } from '../apps/desktop/src/main/project-files.mjs';

const fps = 30;
const root = await mkdtemp(join(tmpdir(), 'rough-cut-nle-export-parity-'));
const sourcePath = join(root, 'nle-source.mp4');
const exportPath = join(root, 'nle-export.mp4');
const reportPath = join(root, 'nle-export-parity-report.json');

await mkdir(root, { recursive: true });
createSegmentedSource(sourcePath);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = createEditedNleProject(createProjectForRecording({
  recording: {
    startedAt: startedAt.toISOString(),
    stoppedAt: new Date(startedAt.getTime() + 6000).toISOString(),
    outputPath: sourcePath,
    rawPath: sourcePath,
    width: 320,
    height: 180,
    fps,
  },
}));

const recording = resolveTimelineExportRecording(project, getPrimaryRecording(project));
if (!recording) throw new Error('NLE export fixture did not resolve a timeline export recording.');

const progress = [];
const result = await exportProjectToMp4({
  project,
  outputPath: exportPath,
  mode: 'styled',
  onProgress: (event) => progress.push(event),
});

const probe = probeVideo(exportPath);
const samples = [
  { label: 'leading gap', timelineFrame: 7, expected: { red: 0, green: 0, blue: 0 } },
  { label: 'moved blue segment', timelineFrame: 30, sourceFrame: 75 },
  { label: 'internal gap', timelineFrame: 52, expected: { red: 0, green: 0, blue: 0 } },
  { label: 'moved red segment', timelineFrame: 75, sourceFrame: 15 },
  { label: 'late magenta segment', timelineFrame: 105, sourceFrame: 135 },
  { label: 'trailing gap', timelineFrame: 135, expected: { red: 0, green: 0, blue: 0 } },
].map((sample) => compareTimelineSample(sample));

const failed = samples.filter((sample) => !sample.ok);
const report = {
  ok: failed.length === 0,
  root,
  sourcePath,
  exportPath,
  reportPath,
  result: {
    outputPath: result.outputPath,
    bytes: result.bytes,
    fastPath: result.fastPath,
    byteEqualCandidate: result.byteEqualCandidate,
  },
  probe,
  timelineSegments: recording.timelineSegments,
  timelineDurationFrames: recording.timelineDurationFrames,
  progressPhases: [...new Set(progress.map((event) => event.phase))],
  samples,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (failed.length > 0) {
  throw new Error(`NLE export parity failed: ${JSON.stringify({ failed, reportPath })}`);
}

console.info(await readFile(reportPath, 'utf8'));

function createSegmentedSource(outputPath) {
  const colorInputs = [
    'red',
    'green',
    'blue',
    'yellow',
    'magenta',
    'cyan',
  ].flatMap((color) => ['-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=${fps}:d=1`]);
  run('ffmpeg', [
    '-y',
    ...colorInputs,
    '-filter_complex',
    '[0:v][1:v][2:v][3:v][4:v][5:v]concat=n=6:v=1:a=0,format=yuv420p[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

function createEditedNleProject(project) {
  const sourceId = `source:${project.assets[0].id}:screen`;
  const track = project.timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.mediaId === sourceId));
  const clip = track?.clips.find((candidate) => candidate.mediaId === sourceId);
  if (!track || !clip) throw new Error('NLE export fixture did not contain a primary screen clip.');
  const editedClips = [
    { id: 'screen-blue-moved', timelineIn: 15, timelineOut: 45, sourceIn: 60, sourceOut: 90 },
    { id: 'screen-red-moved', timelineIn: 60, timelineOut: 90, sourceIn: 0, sourceOut: 30 },
    { id: 'screen-magenta-late', timelineIn: 90, timelineOut: 120, sourceIn: 120, sourceOut: 150 },
  ].map((patch) => ({
    ...clip,
    ...patch,
    trackId: track.id,
    mediaId: sourceId,
  }));

  return {
    ...project,
    composition: {
      ...project.composition,
      duration: 150,
    },
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((candidate) => candidate.id === track.id
        ? { ...candidate, clips: editedClips }
        : candidate),
    },
  };
}

function compareTimelineSample(sample) {
  const framePath = join(root, `${sample.timelineFrame}-${slugify(sample.label)}.png`);
  writeFrameImage(exportPath, framePath, sample.timelineFrame / fps);
  const actual = sampleAverage(exportPath, {
    timeSeconds: sample.timelineFrame / fps,
    x: 928,
    y: 508,
    width: 64,
    height: 64,
  });
  const expected = sample.expected ?? sampleAverage(sourcePath, {
    timeSeconds: sample.sourceFrame / fps,
    x: 140,
    y: 70,
    width: 40,
    height: 40,
  });
  const diff = {
    red: Math.abs(actual.red - expected.red),
    green: Math.abs(actual.green - expected.green),
    blue: Math.abs(actual.blue - expected.blue),
  };
  const maxDiff = Math.max(diff.red, diff.green, diff.blue);
  return {
    ...sample,
    timeSeconds: Number((sample.timelineFrame / fps).toFixed(4)),
    framePath,
    expected,
    actual,
    diff,
    maxDiff,
    ok: maxDiff <= 18,
  };
}

function writeFrameImage(videoPath, outputPath, timeSeconds) {
  run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-ss',
    String(Math.max(0, timeSeconds)),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    outputPath,
  ]);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sampleAverage(videoPath, crop) {
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
  let red = 0;
  let green = 0;
  let blue = 0;
  const pixelCount = pixels.length / 3;
  for (let index = 0; index < pixels.length; index += 3) {
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
  }
  return {
    red: Math.round(red / pixelCount),
    green: Math.round(green / pixelCount),
    blue: Math.round(blue / pixelCount),
  };
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
  const stream = probe.streams?.[0] ?? {};
  return {
    width: stream.width,
    height: stream.height,
    duration: stream.duration,
    r_frame_rate: stream.r_frame_rate,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
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
