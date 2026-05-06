import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-recording-flow-ui-smoke-'));
const resultPath = join(root, 'recording-flow-ui-smoke-result.json');
const screenshotPath = join(root, 'recording-flow-ui-smoke.png');
const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');

const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', '.'], {
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_RECORD_FLOW: '1',
    ROUGH_CUT_UI_SMOKE_DOUBLE_STOP: process.env.ROUGH_CUT_UI_SMOKE_DOUBLE_STOP ?? '',
    ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
    ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
  },
  encoding: 'utf8',
  timeout: 120000,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Recording-flow UI smoke failed with exit code ${result.status}. Artifacts: ${root}`);

const report = JSON.parse(await readFile(resultPath, 'utf8'));
if (!report.ok || !report.hasPreRecordPanel || !report.hasCaptureTargetSelect || report.selectedCaptureTarget !== 'display' || report.initialState !== 'idle' || report.savedState !== 'saved' || !report.hasSavedMessage) {
  throw new Error(`Recording-flow UI smoke assertions failed: ${JSON.stringify(report)}`);
}

console.info(JSON.stringify({ ...report, root, resultPath, screenshotPath }, null, 2));
