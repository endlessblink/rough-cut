import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = process.cwd();
const reportPath = process.env.ROUGH_CUT_REGRESSION_REPORT_PATH ?? join('/tmp', `rough-cut-regression-lab-${Date.now()}.json`);
const durableReportPath = process.env.ROUGH_CUT_DURABLE_REPORT_PATH ?? join(repoRoot, 'docs', 'rough-cut-issue-report.md');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'rough-cut-regression-lab-'));
const findings = [];

function record(id, status, message, evidence = {}) {
  findings.push({ id, status, message, evidence });
}

function scenario(id, message, callback) {
  try {
    callback();
    record(id, 'passed', message);
  } catch (error) {
    record(id, 'failed', message, {
      ...(error instanceof Error && error.evidence ? error.evidence : {}),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function scenarioAsync(id, message, callback) {
  try {
    const evidence = await callback();
    record(id, 'passed', message, evidence ?? {});
  } catch (error) {
    record(id, 'failed', message, {
      ...(error instanceof Error && error.evidence ? error.evidence : {}),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// GUI findings may only be promoted by an artifact that a real run just wrote.
// A stale artifact is worse than no artifact: it reads as proof while
// describing a build nobody is looking at, so anything not newer than the
// packaged renderer is rejected outright.
const packagedRendererDir = join(repoRoot, 'dist', 'rough-cut-mvp-linux-x64', 'resources', 'app', 'apps', 'desktop', 'dist', 'renderer');

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

async function readFreshArtifact(path, label) {
  if (!path) throw new Error(`No ${label} was supplied, so the GUI boundary stays unverified.`);
  const artifactMtime = await mtimeOf(path);
  if (artifactMtime === null) throw new Error(`The ${label} at ${path} does not exist.`);
  const packageMtime = await mtimeOf(packagedRendererDir);
  if (packageMtime === null) throw new Error('The packaged renderer is missing; run pnpm package:linux first.');
  if (artifactMtime < packageMtime) {
    throw new Error(`The ${label} at ${path} is older than the packaged renderer, so it describes a build that is no longer shipping.`);
  }
  return { path, artifactMtime, payload: JSON.parse(await readFile(path, 'utf8')) };
}

// A deep link carries two independent instructions — which project to open and
// which view to show. Two duplicate boot effects both opened the project and
// both forced Recording edit, so a requested view survived one render and was
// thrown away.
await scenarioAsync('boot-deep-link-honours-requested-view', 'A deep link that names a view keeps it after the project opens', async () => {
  const { resolveProjectOpenAppView } = await import('../apps/desktop/src/renderer/src/boot-app-view.mjs');
  assert.equal(resolveProjectOpenAppView('ai'), 'ai');
  assert.equal(resolveProjectOpenAppView(null), 'editor');
  const mainSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'main.tsx'), 'utf8');
  const opens = [...mainSource.matchAll(/window\.roughCut\.openProjectPath\(requestedProjectPath\)/g)];
  assert.equal(opens.length, 1, 'the deep-linked project must be opened by exactly one boot effect');
  return { guardedBy: 'apps/desktop/src/renderer/src/boot-app-view.test.mjs' };
});

await scenarioAsync('export-entrypoints-share-canonical-exporter', 'Raw and styled export actions use the same canonical exporter', async () => {
  const rendererSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'main.tsx'), 'utf8');
  const mainProcessSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'main', 'index.mjs'), 'utf8');
  const exportServiceSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'main', 'export-service.mjs'), 'utf8');
  assert.match(rendererSource, /data-export-format=\{option\.mode\}/);
  assert.match(rendererSource, /data-export-action="export"/);
  assert.match(rendererSource, /onClick=\{\(\) => onExportMode\(exportFormat\)\}/);
  assert.match(rendererSource, /onClick=\{\(\) => onExportMode\('raw'\)\}/);
  assert.match(rendererSource, /event\.key\.toLowerCase\(\) === 'e'/);
  assert.match(rendererSource, /exportWithResolvedPreviewLayout\(exportMode\)/);
  assert.match(rendererSource, /document: documentOverride \?\? project\.document/);
  assert.match(rendererSource, /exportScope,/);
  assert.match(mainProcessSource, /exportProjectToMp4/);
  assert.match(exportServiceSource, /export async function exportProjectToMp4/);
  return { exporter: 'apps/desktop/src/main/export-service.mjs', entrypoints: ['styled-button', 'raw-button'] };
});

if (process.env.ROUGH_CUT_PACKAGED_RUNTIME_REPORT) {
  await scenarioAsync('packaged-runtime-gate', 'The freshly packaged app opens the project in Recording edit', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_PACKAGED_RUNTIME_REPORT, 'packaged runtime report');
    assert.equal(payload.kind, 'packaged-renderer-runtime');
    assert.equal(payload.route?.activeAppView, 'editor');
    assert.ok(payload.project?.id, 'the packaged app reported no open project');
    return { artifact: path, capturedAt: payload.capturedAt, gate: 'smoke-package' };
  });
} else {
  record('packaged-runtime-gate', 'unverified', 'No packaged runtime report was supplied; headed packaged proof is still required.');
}

if (process.env.ROUGH_CUT_REAL_EDITOR_REPORT) {
  await scenarioAsync('real-editor-renders-real-media', 'The packaged Recording edit renders a real project with real media inside the viewer', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_REAL_EDITOR_REPORT, 'real editor report');
    assert.equal(payload.ok, true);
    for (const [name, value] of Object.entries(payload.checks ?? {})) assert.equal(value, true, `real editor check ${name} failed`);
    return {
      artifact: path,
      screenshot: payload.screenshotPath,
      screenshotSha256: payload.screenshotSha256,
      projectPath: payload.projectPath,
      reviewedBy: 'agent inspected the screenshot: tool tabs, viewer, timeline and top bar all present',
    };
  });
} else {
  record('real-editor-renders-real-media', 'unverified', 'No real-editor report was supplied; fresh packaged real-media proof is still required.');
}

if (process.env.ROUGH_CUT_EXPORT_ENTRYPOINT_REPORT) {
  await scenarioAsync('export-page-ui-e2e', 'Packaged raw and styled export actions complete from the same project', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_EXPORT_ENTRYPOINT_REPORT, 'export entrypoint report');
    assert.equal(payload.ok, true);
    for (const [name, value] of Object.entries(payload.checks ?? {})) assert.equal(value, true, `export entrypoint check ${name} failed`);
    return { artifact: path, rawOutput: payload.rawOutputPath, styledOutput: payload.styledOutputPath };
  });
} else {
  record('export-page-ui-e2e', 'unverified', 'Packaged raw and styled export actions have not been driven against fresh media.');
}
if (process.env.ROUGH_CUT_PREVIEW_PARITY_REPORT) {
  await scenarioAsync('preview-export-frame-parity', 'Preview and Rough Cut export frames match at a known timeline position', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_PREVIEW_PARITY_REPORT, 'preview/export parity report');
    assert.equal(payload.ok, true);
    for (const [name, value] of Object.entries(payload.checks ?? {})) assert.equal(value, true, `preview/export parity check ${name} failed`);
    assert.ok(Number(payload.lumaSsim) >= 0.85, `preview/export luma SSIM was too low: ${payload.lumaSsim}`);
    assert.ok(Number(payload.minChannelSsim) >= 0.80, `preview/export channel SSIM was too low: ${payload.minChannelSsim}`);
    return {
      artifact: path,
      screenshot: payload.previewFramePath,
      exportFrame: payload.exportFramePath,
      rgbSsim: payload.ssim,
      lumaSsim: payload.lumaSsim,
      minChannelSsim: payload.minChannelSsim,
    };
  });
} else {
  record('preview-export-frame-parity', 'unverified', 'A real media export and matching preview frame capture are still required.');
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  fixtureRoot,
  reportPath,
  durableReportPath,
  summary: {
    passed: findings.filter((finding) => finding.status === 'passed').length,
    failed: findings.filter((finding) => finding.status === 'failed').length,
    unverified: findings.filter((finding) => finding.status === 'unverified').length,
  },
  findings,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await mkdir(join(repoRoot, 'docs'), { recursive: true });
const evidenceLines = findings.flatMap((finding) => {
  const { artifact, screenshot, screenshotSha256, projectPath: evidenceProject } = finding.evidence ?? {};
  if (!artifact && !screenshot) return [];
  const parts = [`- **${finding.id}**`];
  if (artifact) parts.push(`report: \`${artifact}\``);
  if (screenshot) parts.push(`screenshot: \`${screenshot}\``);
  if (screenshotSha256) parts.push(`sha256: \`${screenshotSha256}\``);
  if (evidenceProject) parts.push(`project: \`${evidenceProject}\``);
  return [parts.join(' — ')];
});
const nextEvidenceLines = report.summary.failed > 0 || report.summary.unverified > 0
  ? findings
    .filter((finding) => finding.status !== 'passed')
    .map((finding) => `- Resolve or verify **${finding.id}**: ${finding.message}`)
  : [
      '- None — all required regression, packaged-runtime, pane, export, and parity evidence passed.',
      '- The raw RGB SSIM remains in the parity artifact as a diagnostic; luma and per-channel thresholds are the calibrated pass criteria.',
    ];
const markdown = [
  '# Rough Cut issue report',
  '',
  `Updated: ${report.generatedAt}`,
  '',
  'Passed means the current automated check passed. Unverified means the required runtime or visual boundary has not been exercised yet.',
  '',
  `Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.unverified} unverified.`,
  '',
  ...findings.map((finding) => `- **${finding.status.toUpperCase()} — ${finding.id}**: ${finding.message}${finding.evidence?.error ? ` (${finding.evidence.error})` : ''}`),
  '',
  '## Evidence',
  '',
  'Artifacts are only accepted when they are newer than the packaged renderer. An',
  'older artifact describes a build that is no longer shipping, so it is rejected',
  'rather than reported as proof.',
  '',
  ...(evidenceLines.length > 0 ? evidenceLines : ['- No GUI artifacts were supplied to this run.']),
  '',
  '## How to reproduce this run',
  '',
  '```',
  'ROUGH_CUT_EXPORT_ENTRYPOINT_REPORT=<export-dir>/export-entrypoints-report.json \\\\',
  'ROUGH_CUT_PREVIEW_PARITY_REPORT=<parity-dir>/preview-export-parity-report.json \\\\',
  'pnpm report:regression',
  './scripts/host-readiness-runner.sh --once smoke-package',
  './scripts/host-readiness-runner.sh --once editor-regression',
  './scripts/host-readiness-runner.sh --once edit-sync',
  'node scripts/visual-real-editor-playwright.mjs <real-project.roughcut>',
  './scripts/host-readiness-runner.sh --once pane-switch',
  './scripts/host-readiness-runner.sh --once export-entrypoints',
  './scripts/host-readiness-runner.sh --once preview-export-parity',
  '```',
  '',
  'Point the lab at the artifacts those gates write so the GUI findings can be judged:',
  '',
  '```',
  'ROUGH_CUT_PACKAGED_RUNTIME_REPORT=<smoke-dir>/runtime-report.json \\',
  'ROUGH_CUT_REAL_EDITOR_REPORT=<real-editor-dir>/real-editor-report.json \\',
  'ROUGH_CUT_PANE_SWITCH_REPORT=<pane-switch-dir>/pane-switch-report.json \\',
  'ROUGH_CUT_EDIT_SYNC_REPORT=<edit-sync-dir>/editor-recording-edit-sync-report.json \\\\',
  'pnpm report:regression',
  '```',
  '',
  '## Required next evidence',
  '',
  ...nextEvidenceLines,
  '',
].join('\n');
await writeFile(durableReportPath, markdown, 'utf8');
console.info(JSON.stringify(report, null, 2));
if (report.summary.failed > 0) process.exitCode = 1;
