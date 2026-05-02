import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { createDefaultRecordingPresentation, createZoomMarker } from '../packages/project-model/dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-styled-export-'));
const mediaPath = join(root, 'source.mp4');
const exportPath = join(root, 'styled-export.mp4');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildDemoFixtureFilter(),
  '-t',
  '2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 2000);
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 1280,
  height: 720,
  fps: 30,
  cursorEvents: [
    { frame: 0, timeMs: 0, x: 640, y: 360, type: 'move', button: 0 },
    { frame: 30, timeMs: 1000, x: 760, y: 430, type: 'move', button: 0 },
  ],
});

const result = await exportProjectToMp4({ project: project.document, outputPath: exportPath, mode: 'styled' });
const probe = JSON.parse(runCapture('ffprobe', [
  '-v',
  'error',
  '-select_streams',
  'v:0',
  '-show_entries',
  'stream=width,height,duration,r_frame_rate',
  '-of',
  'json',
  exportPath,
]));

const stream = probe.streams?.[0];
if (!stream || stream.width !== 1920 || stream.height !== 1080) {
  throw new Error(`Styled export dimensions were not 1920x1080: ${JSON.stringify(probe)}`);
}
if (stream.r_frame_rate !== '30/1') {
  throw new Error(`Styled export framerate was not 30/1 (matching source 30 fps): ${JSON.stringify(probe)}`);
}

const sourceBytes = (await readFile(mediaPath)).length;
const exportBytes = (await readFile(exportPath)).length;
if (!(exportBytes > 0) || result.byteEqualCandidate || sourceBytes === exportBytes) {
  throw new Error(`Styled export did not look like a rendered artifact: ${JSON.stringify({ result, sourceBytes, exportBytes })}`);
}

assertCursorVisible(exportPath);

const zoomedExportPath = join(root, 'styled-export-zoom.mp4');
const presentation = createDefaultRecordingPresentation();
const marker = createZoomMarker(15, 45, { strength: 1, focalPoint: { x: 0.5, y: 0.5 } });
const zoomedDocument = {
  ...project.document,
  assets: project.document.assets.map((asset, index) =>
    index === 0
      ? {
          ...asset,
          presentation: {
            ...presentation,
            zoom: { ...presentation.zoom, markers: [marker] },
          },
        }
      : asset,
  ),
};
const zoomedProjectPath = join(root, 'zoomed.roughcut');
await saveProjectFile(zoomedProjectPath, zoomedDocument);
const zoomedResult = await exportProjectToMp4({ project: zoomedDocument, outputPath: zoomedExportPath, mode: 'styled' });
const zoomedProbe = JSON.parse(runCapture('ffprobe', [
  '-v',
  'error',
  '-select_streams',
  'v:0',
  '-show_entries',
  'stream=width,height,duration,r_frame_rate',
  '-of',
  'json',
  zoomedExportPath,
]));
const zoomedStream = zoomedProbe.streams?.[0];
if (!zoomedStream || zoomedStream.width !== 1920 || zoomedStream.height !== 1080) {
  throw new Error(`Zoomed styled export dimensions were not 1920x1080: ${JSON.stringify(zoomedProbe)}`);
}
if (zoomedStream.r_frame_rate !== '30/1') {
  throw new Error(`Zoomed styled export framerate was not 30/1 (matching source 30 fps): ${JSON.stringify(zoomedProbe)}`);
}
const zoomedBytes = (await readFile(zoomedExportPath)).length;
if (!(zoomedBytes > 0) || zoomedResult.byteEqualCandidate || zoomedBytes === exportBytes) {
  throw new Error(`Zoomed styled export did not differ from the no-marker baseline: ${JSON.stringify({ zoomedResult, exportBytes, zoomedBytes })}`);
}

// Cursor remains visible in the zoomed export at the marker boundary (frame 15 = 0.5s),
// where smootherStep(0) = 0 so scale is still 1. This locks in the regression that
// adding zoom markers does not silently kill cursor rendering.
assertCursorVisible(zoomedExportPath);

console.info(JSON.stringify({
  ok: true,
  root,
  projectPath: project.path,
  exportPath,
  zoomedProjectPath,
  zoomedExportPath,
  width: stream.width,
  height: stream.height,
  bytes: exportBytes,
  zoomedBytes,
}, null, 2));

function buildDemoFixtureFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const boldFont = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'color=c=0xf7f3ea:s=1280x720:r=30',
    'drawbox=x=0:y=0:w=1280:h=56:color=0x201a15:t=fill',
    'drawbox=x=20:y=18:w=12:h=12:color=0xff6b57:t=fill',
    'drawbox=x=42:y=18:w=12:h=12:color=0xffc24b:t=fill',
    'drawbox=x=64:y=18:w=12:h=12:color=0x39c778:t=fill',
    `drawtext=fontfile=${boldFont}:text='Client Portal':fontcolor=0xf7f3ea:fontsize=18:x=104:y=16`,
    'drawbox=x=56:y=96:w=280:h=552:color=0x25201b:t=fill',
    `drawtext=fontfile=${boldFont}:text='Demo project':fontcolor=0x2b241e:fontsize=28:x=384:y=102`,
    `drawtext=fontfile=${font}:text='Prepared for review':fontcolor=0x7d7164:fontsize=20:x=386:y=144`,
    'drawbox=x=384:y=206:w=746:h=78:color=0xffffff:t=fill',
    'drawbox=x=384:y=316:w=746:h=248:color=0xffffff:t=fill',
    'drawbox=x=420:y=352:w=344:h=176:color=0xe5ded2:t=fill',
    'drawbox=x=800:y=352:w=294:h=22:color=0x2b241e:t=fill',
    'drawbox=x=800:y=396:w=240:h=14:color=0xb9ad9e:t=fill',
    'drawbox=x=800:y=426:w=270:h=14:color=0xb9ad9e:t=fill',
    'drawbox=x=800:y=474:w=164:h=42:color=0xf0a941:t=fill',
    'drawbox=x=88:y=132:w=176:h=18:color=0xf1e7d7:t=fill',
    'drawbox=x=88:y=188:w=128:h=14:color=0x958777:t=fill',
    'drawbox=x=88:y=230:w=156:h=14:color=0x958777:t=fill',
    'drawbox=x=88:y=272:w=118:h=14:color=0x958777:t=fill',
  ].join(',');
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

function runBuffer(command, args) {
  const result = spawnSync(command, args, { encoding: 'buffer' });
  if (result.stderr?.length) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return result.stdout;
}

function assertCursorVisible(videoPath) {
  const width = 96;
  const height = 96;
  const pixels = runBuffer('ffmpeg', [
    '-v',
    'error',
    '-ss',
    '0.5',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-vf',
    `crop=${width}:${height}:996:526`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);

  let bright = 0;
  let dark = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (red > 238 && green > 238 && blue > 238) bright += 1;
    if (red < 80 && green < 80 && blue < 80) dark += 1;
  }

  if (bright < 120 || dark < 50) {
    throw new Error(`Styled cursor was not visible in the verification crop: ${JSON.stringify({ bright, dark })}`);
  }
}
