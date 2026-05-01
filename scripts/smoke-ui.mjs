import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-ui-smoke-'));
const mediaPath = join(root, 'preview-source.mp4');
const exportPath = join(root, 'export.mp4');
const resultPath = join(root, 'ui-smoke-result.json');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc=size=320x240:rate=30',
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
  width: 320,
  height: 240,
  fps: 30,
});

const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', '.'], {
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: project.path,
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
  },
  encoding: 'utf8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Electron UI smoke failed with exit code ${result.status}. Artifacts: ${root}`);
}

const report = JSON.parse(await readFile(resultPath, 'utf8'));
if (!report.ok || !report.hasPlaybackButton || !report.hasExportResult || report.exportMode !== 'raw' || !report.hasStyledMode || !report.hasRawPresetDetails || !report.hasStyledPresetDetails || !(report.duration > 0)) {
  throw new Error(`Electron UI smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, root, projectPath: project.path, exportPath }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
