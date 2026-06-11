import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-headless-export-'));
const mediaPath = join(root, 'source.mp4');
const outputPath = join(root, 'experimental-headless-export.mp4');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=1280x720:rate=30',
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

const progress = [];
const result = await exportProjectToMp4({
  project: project.document,
  outputPath,
  mode: 'experimental-headless',
  onProgress: (event) => progress.push(event),
});
const probe = JSON.parse(runCapture('ffprobe', [
  '-v',
  'error',
  '-select_streams',
  'v:0',
  '-show_entries',
  'stream=width,height,duration,r_frame_rate',
  '-of',
  'json',
  outputPath,
]));
const stream = probe.streams?.[0];
if (!stream || stream.width !== 1920 || stream.height !== 1080) {
  throw new Error(`Experimental headless export dimensions were wrong: ${JSON.stringify(probe)}`);
}
if (stream.r_frame_rate !== '30/1') {
  throw new Error(`Experimental headless export framerate was wrong: ${JSON.stringify(probe)}`);
}
const bytes = (await readFile(outputPath)).length;
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
  outputPath,
  width: stream.width,
  height: stream.height,
  fps: stream.r_frame_rate,
  bytes,
  fallback: result.fallback,
  sampledFrames: result.compositionPlan.frames.map((frame) => frame.frameIndex),
}, null, 2));

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
