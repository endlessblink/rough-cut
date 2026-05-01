import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

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
});

const result = await exportProjectToMp4({ project: project.document, outputPath: exportPath, mode: 'styled' });
const probe = JSON.parse(runCapture('ffprobe', [
  '-v',
  'error',
  '-select_streams',
  'v:0',
  '-show_entries',
  'stream=width,height,duration',
  '-of',
  'json',
  exportPath,
]));

const stream = probe.streams?.[0];
if (!stream || stream.width !== 1920 || stream.height !== 1080) {
  throw new Error(`Styled export dimensions were not 1920x1080: ${JSON.stringify(probe)}`);
}

const sourceBytes = (await readFile(mediaPath)).length;
const exportBytes = (await readFile(exportPath)).length;
if (!(exportBytes > 0) || result.byteEqualCandidate || sourceBytes === exportBytes) {
  throw new Error(`Styled export did not look like a rendered artifact: ${JSON.stringify({ result, sourceBytes, exportBytes })}`);
}

console.info(JSON.stringify({ ok: true, root, projectPath: project.path, exportPath, width: stream.width, height: stream.height, bytes: exportBytes }, null, 2));

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
