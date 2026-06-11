import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-recording-startup-ui-smoke-'));
const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
const missingProjectPath = join(root, 'missing-startup-project.roughcut');

const scenarios = [
  {
    name: 'startup-panel',
    env: { ROUGH_CUT_UI_SMOKE_STARTUP_PANEL_ONLY: '1' },
    assert(report) {
      return report.ok && report.hasInitialPreRecordPanel && report.hasRecordingWorkspace && report.hasRecordingTab && report.compactWindow && report.panelOnly && report.hasVisualScreenshot;
    },
  },
  {
    name: 'top-record-button',
    env: {},
    assert(report) {
      return report.ok && report.hasInitialPreRecordPanel && report.hasRecordingWorkspace && report.hasRecordingTab && report.compactWindow && report.startedFromTopButton && report.canceledState === 'idle';
    },
  },
  {
    name: 'open-editor',
    env: { ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_EDITOR: '1' },
    assert(report) {
      return report.ok && report.hasInitialPreRecordPanel && report.hasRecordingWorkspace && report.hasRecordingTab && report.compactWindow && report.studioWindow?.fillsAvailableScreen && report.openedEditorFromPanel && report.hasEditorEmptyState;
    },
  },
  {
    name: 'open-projects',
    env: { ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_EDITOR: '1', ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_PROJECTS: '1' },
    assert(report) {
      return report.ok && report.hasInitialPreRecordPanel && report.hasRecordingWorkspace && report.hasRecordingTab && report.compactWindow && report.studioWindow?.fillsAvailableScreen && report.openedEditorFromPanel && report.openedProjectsFromEditor && report.hasProjectsView;
    },
  },
  {
    name: 'new-empty-project',
    env: {
      ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_EDITOR: '1',
      ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_PROJECTS: '1',
      ROUGH_CUT_UI_SMOKE_STARTUP_CREATE_BLANK_PROJECT: '1',
    },
    assert(report) {
      return report.ok && report.hasInitialPreRecordPanel && report.hasRecordingWorkspace && report.hasRecordingTab && report.compactWindow && report.studioWindow?.fillsAvailableScreen && report.openedEditorFromPanel && report.openedProjectsFromEditor && report.hasProjectsView && report.createdBlankProjectFromProjects && report.hasNleWorkspace && report.hasNamedProject && report.hasNleTab;
    },
  },
];

for (const scenario of scenarios) {
  const scenarioRoot = join(root, scenario.name);
  const resultPath = join(scenarioRoot, 'result.json');
  const screenshotPath = join(scenarioRoot, 'screenshot.png');
  const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', '.'], {
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ...scenario.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_UI_SMOKE_STARTUP_RECORD_BUTTON: '1',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: missingProjectPath,
      ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
      ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
    },
    encoding: 'utf8',
    timeout: 120000,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Recording startup UI smoke "${scenario.name}" failed with exit code ${result.status}. Artifacts: ${scenarioRoot}`);

  const report = JSON.parse(await readFile(resultPath, 'utf8'));
  if (!scenario.assert(report)) {
    throw new Error(`Recording startup UI smoke "${scenario.name}" assertions failed: ${JSON.stringify(report)}`);
  }
  console.info(JSON.stringify({ scenario: scenario.name, ...report, resultPath, screenshotPath }, null, 2));
}

console.info(JSON.stringify({ ok: true, root, scenarioCount: scenarios.length }, null, 2));
