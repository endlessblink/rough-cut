import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAsset, createClip, createProject, createTrack } from '../packages/project-model/dist/index.js';
import { describeStyledProgram, fromFreecutProject, toFreecutProject } from '../apps/desktop/src/main/freecut-host.mjs';
import { createFreecutCommandQueue } from '../apps/desktop/src/main/freecut-command-queue.mjs';
import { splitLayersByRecordingTrack } from '../apps/desktop/src/renderer/src/editor-timeline-placement.mjs';

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

const screenPath = join(fixtureRoot, 'screen.mp4');
const cameraPath = join(fixtureRoot, 'camera.mp4');
const overlayPath = join(fixtureRoot, 'overlay.png');
await writeFile(screenPath, 'screen-fixture');
await writeFile(cameraPath, 'camera-fixture');
await writeFile(overlayPath, 'overlay-fixture');

const screen = createAsset('recording', screenPath, { duration: 180, metadata: { width: 960, height: 540, fps: 30 } });
const camera = createAsset('video', cameraPath, { duration: 180, metadata: { width: 640, height: 360, fps: 30 } });
const overlay = createAsset('image', overlayPath, { duration: 90, metadata: { width: 400, height: 200, fps: 30 } });
const screenTrack = createTrack('video', { id: 'screen-track', name: 'Recording', index: 1 });
const cameraTrack = createTrack('video', { id: 'camera-track', name: 'Camera', index: 2 });
const overlayTrack = createTrack('video', { id: 'overlay-track', name: 'Overlay', index: 0 });
const screenClip = createClip(screen.id, screenTrack.id, { id: 'screen-clip', timelineIn: 0, timelineOut: 180, sourceIn: 0, sourceOut: 180 });
const cameraClip = createClip(camera.id, cameraTrack.id, { id: 'camera-clip', timelineIn: 0, timelineOut: 180, sourceIn: 0, sourceOut: 180 });
const original = createProject({
  id: 'regression-lab-project',
  name: 'Regression lab project',
  assets: [screen, camera, overlay],
  composition: {
    duration: 180,
    tracks: [
      { ...overlayTrack, clips: [] },
      { ...screenTrack, clips: [screenClip] },
      { ...cameraTrack, clips: [cameraClip] },
    ],
    transitions: [],
  },
  settings: { frameRate: 30, aspectRatio: 'landscape' },
});
const projectPath = join(fixtureRoot, 'project.roughcut');
const styled = describeStyledProgram(original, projectPath);
const seeded = toFreecutProject(original, projectPath, styled);

scenario('pane-switch-preserves-canonical-recording', 'Switching away from the Editor preserves recording and camera clips', () => {
  const saved = fromFreecutProject(seeded, original);
  assert.equal(saved.composition.tracks.length, 3);
  assert.equal(saved.composition.tracks[1].clips[0].id, 'screen-clip');
  assert.equal(saved.composition.tracks[2].clips[0].id, 'camera-clip');
});

const overlayItems = [
  { id: 'title-layer', trackId: overlayTrack.id, from: 20, durationInFrames: 80, label: 'Title', mediaId: overlay.id, type: 'image', sourceStart: 0, sourceEnd: 80 },
  { id: 'second-title-layer', trackId: overlayTrack.id, from: 40, durationInFrames: 60, label: 'Second title', mediaId: overlay.id, type: 'image', sourceStart: 0, sourceEnd: 60 },
];
const editedFreecut = {
  ...seeded,
  timeline: {
    ...seeded.timeline,
    items: [...seeded.timeline.items, ...overlayItems],
    tracks: seeded.timeline.tracks.map((track) => track.id === overlayTrack.id ? { ...track, order: 0 } : track),
  },
};

scenario('editor-layer-round-trip-preserves-content', 'Editor-added overlapping layers survive a canonical round trip', () => {
  const saved = fromFreecutProject(editedFreecut, original);
  assert.equal(saved.freecutTimeline.items.filter((item) => item.id.includes('title')).length, 2);
  assert.equal(saved.composition.tracks[1].clips[0].id, 'screen-clip');
  assert.equal(saved.composition.tracks[2].clips[0].id, 'camera-clip');
});

scenario('layer-order-is-explicit', 'Overlapping layers have deterministic above/below ordering', () => {
  const split = splitLayersByRecordingTrack({
    frame: 50,
    fps: 30,
    layers: [
      { ...overlayItems[0], isRecording: false },
      { trackId: screenTrack.id, isRecording: true, from: 0, durationInFrames: 180 },
      { ...overlayItems[1], isRecording: false },
    ],
    tracks: [{ id: overlayTrack.id, order: 0 }, { id: screenTrack.id, order: 1 }],
  });
  assert.equal(split.above.length, 2);
  assert.equal(split.below.length, 0);
});

scenario('export-contract-uses-canonical-document', 'Export contract retains the edited canonical timeline', () => {
  const saved = fromFreecutProject(editedFreecut, original);
  assert.equal(saved.id, original.id);
  assert.equal(saved.freecutTimeline.items.length, editedFreecut.timeline.items.length);
  assert.equal(saved.composition.duration, original.composition.duration);
});

const queue = createFreecutCommandQueue();
const queueEvents = [];
let release;
const gate = new Promise((resolve) => { release = resolve; });
const first = queue.enqueue({ projectId: original.id, opId: 'first', run: async () => { queueEvents.push('first-start'); await gate; queueEvents.push('first-end'); } });
const second = queue.enqueue({ projectId: original.id, opId: 'second', run: async () => queueEvents.push('second') });
await Promise.resolve();
release();
await Promise.all([first, second]);
scenario('cross-pane-save-order', 'Overlapping saves are serialized per project', () => {
  assert.deepEqual(queueEvents, ['first-start', 'first-end', 'second']);
});

// A deep link carries two independent instructions — which project to open and
// which view to show. Two duplicate boot effects both opened the project and
// both forced Recording edit, so `view=nle` survived one render and was thrown
// away. The packaged FreeCut gate could never go green because of it.
await scenarioAsync('boot-deep-link-honours-requested-view', 'A deep link that names a view keeps it after the project opens', async () => {
  const { resolveProjectOpenAppView } = await import('../apps/desktop/src/renderer/src/boot-app-view.mjs');
  assert.equal(resolveProjectOpenAppView('nle'), 'nle');
  assert.equal(resolveProjectOpenAppView(null), 'editor');
  const mainSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'main.tsx'), 'utf8');
  const opens = [...mainSource.matchAll(/window\.roughCut\.openProjectPath\(requestedProjectPath\)/g)];
  assert.equal(opens.length, 1, 'the deep-linked project must be opened by exactly one boot effect');
  return { guardedBy: 'apps/desktop/src/renderer/src/boot-app-view.test.mjs' };
});

await scenarioAsync('editor-regression-harness-targets-shipped-editor', 'The editor regression harness drives the editor the app actually ships', async () => {
  const harness = await readFile(join(repoRoot, 'scripts', 'pane-switch-e2e-playwright.mjs'), 'utf8');
  const editSyncHarness = await readFile(join(repoRoot, 'scripts', 'editor-recording-edit-sync-playwright.mjs'), 'utf8');
  for (const pattern of [
    /persistent-editor-slot/,
    /freecut-editor-surface/,
    /iframe\[data-freecut-embed="vendored"\]/,
    /editorSurvivesSwitch/,
    /survivesRapidSwitching/,
  ]) assert.match(harness, pattern);
  for (const pattern of [
    /openProjectPath/,
    /onProjectUpdated/,
    /Recording edit/,
    /data-freecut-embed="vendored"/,
    /Reload persistence/,
  ]) assert.match(editSyncHarness, pattern);
  return {
    harness: 'scripts/pane-switch-e2e-playwright.mjs',
    mutationHarness: 'scripts/editor-recording-edit-sync-playwright.mjs',
    target: 'shipped FreeCut Editor',
  };
});

await scenarioAsync('nle-source-guards-match-the-shipped-shell', 'Source guards assert against the editor main.tsx actually mounts', async () => {
  const mainSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'main.tsx'), 'utf8');
  const freecutSurfaceSource = await readFile(join(repoRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'freecut-editor-surface.tsx'), 'utf8');
  const guards = [
    ['main.tsx FreeCut mount', /<FreecutEditorSurface/],
    ['main.tsx persistent editor slot', /persistentEditorSlot/],
    ['main.tsx shared layer handoff', /onLayersChange=\{setEditorLayers\}/],
    ['freecut-editor-surface flush boundary', /freecut:flush/],
    ['freecut-editor-surface project validation', /project-id-mismatch/],
  ];
  const stale = guards.filter(([label, pattern]) => {
    const source = label.startsWith('freecut-') ? freecutSurfaceSource : mainSource;
    return !pattern.test(source);
  }).map(([label]) => label);
  assert.ok(
    stale.length === 0,
    `shipped FreeCut integration guards failed: ${stale.join(', ')}`,
  );
  return {};
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
  await scenarioAsync('packaged-runtime-gate', 'The freshly packaged app boots the embedded editor on the requested view', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_PACKAGED_RUNTIME_REPORT, 'packaged runtime report');
    assert.equal(payload.kind, 'packaged-renderer-runtime');
    assert.equal(payload.route?.activeAppView, 'nle');
    assert.equal(payload.visibleSurface?.freecutReady, true);
    assert.equal(payload.visibleSurface?.freecutProjectId, payload.project?.id);
    return { artifact: path, capturedAt: payload.capturedAt, gate: 'smoke-package' };
  });
} else {
  record('packaged-runtime-gate', 'unverified', 'No packaged runtime report was supplied; headed packaged proof is still required.');
}

if (process.env.ROUGH_CUT_REAL_EDITOR_REPORT) {
  await scenarioAsync('real-editor-renders-real-media', 'The packaged Editor renders a real project with real media inside the viewer', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_REAL_EDITOR_REPORT, 'real editor report');
    assert.equal(payload.ok, true);
    for (const [name, value] of Object.entries(payload.checks ?? {})) assert.equal(value, true, `real editor check ${name} failed`);
    assert.ok(payload.geometry?.editorChrome, 'the Editor chrome was not present');
    return {
      artifact: path,
      screenshot: payload.screenshotPath,
      screenshotSha256: payload.screenshotSha256,
      projectPath: payload.projectPath,
      reviewedBy: 'agent inspected the screenshot: media panel, viewer, properties, transport and timeline all present',
    };
  });
} else {
  record('real-editor-renders-real-media', 'unverified', 'No real-editor report was supplied; fresh packaged real-media proof is still required.');
}

// Leaving the Editor must hide it, never destroy it — destroying it takes any
// edit not yet written with it. A keyed ancestor was remounting the whole shell
// on every switch, so the "persistent" editor slot was persistent in name only.
// Nothing caught it until a check actually clicked between the two views.
if (process.env.ROUGH_CUT_PANE_SWITCH_REPORT) {
  await scenarioAsync('editor-pane-switch-e2e', 'Switching between Recording edit and the Editor keeps the same live editor session', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_PANE_SWITCH_REPORT, 'pane switch report');
    assert.equal(payload.ok, true);
    for (const [name, value] of Object.entries(payload.checks ?? {})) assert.equal(value, true, `pane switch check ${name} failed`);
    return {
      artifact: path,
      screenshot: payload.screenshotPath,
      screenshotSha256: payload.screenshotSha256,
      projectPath: payload.projectPath,
      gate: 'pane-switch',
      reviewedBy: 'agent inspected the screenshot: correct project, Editor fully drawn after repeated switching',
    };
  });
} else {
  record('editor-pane-switch-e2e', 'unverified', 'Pane switching in a headed packaged run has not yet supplied a fresh report; the queue and source contract remain covered.');
}

if (process.env.ROUGH_CUT_EDIT_SYNC_REPORT) {
  await scenarioAsync('editor-recording-edit-sync', 'Real edits in Recording edit and FreeCut synchronize through the canonical project and survive reload/undo', async () => {
    const { path, payload } = await readFreshArtifact(process.env.ROUGH_CUT_EDIT_SYNC_REPORT, 'editor/edit sync report');
    if (payload.ok !== true) {
      const error = new Error('The real edit-sync journey found a cross-surface mutation failure.');
      error.evidence = { artifact: path, projectPath: payload.sourceProjectPath, projectId: payload.projectId };
      throw error;
    }
    assert.equal(payload.ok, true);
    for (const [name, value] of Object.entries(payload.checks ?? {})) assert.equal(value, true, `edit sync check ${name} failed`);
    return { artifact: path, projectPath: payload.sourceProjectPath, projectId: payload.projectId };
  });
} else {
  record('editor-recording-edit-sync', 'unverified', 'No real edit-sync report was supplied; cross-surface mutation and persistence are still unverified.');
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
