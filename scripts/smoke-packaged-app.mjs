import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electron = join(artifactRoot, 'electron');
const smokeRoot = await mkdtemp(join(tmpdir(), 'rough-cut-package-smoke-'));
const mediaPath = join(smokeRoot, 'preview-source.mp4');
const exportPath = join(smokeRoot, 'export.mp4');
const resultPath = join(smokeRoot, 'ui-smoke-result.json');

await mkdir(smokeRoot, { recursive: true });
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
const projectPath = project.path;

const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', appPath], {
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
  },
  encoding: 'utf8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Packaged app smoke failed with exit code ${result.status}. Artifacts: ${smokeRoot}`);

const report = JSON.parse(await readFile(resultPath, 'utf8'));
if (!report.ok || !report.hasPlaybackButton || !report.hasExportResult || report.exportMode !== 'raw' || !report.hasStyledMode || !report.hasRawPresetDetails || !report.hasStyledPresetDetails || !(report.duration > 0)) {
  throw new Error(`Packaged app smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, smokeRoot, artifactRoot, projectPath, exportPath }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
