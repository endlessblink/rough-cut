import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeFreecutEditor, startFreecutServer } from './freecut-window.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, '../..');
const repoRoot = join(desktopRoot, '../..');

async function source(relativePath) {
  return readFile(join(repoRoot, relativePath), 'utf8');
}

function renderBranch(mainSource, view) {
  const start = mainSource.indexOf(`activeAppView === '${view}'`);
  assert.notEqual(start, -1, `main.tsx must render the ${view} route`);
  const end = mainSource.indexOf("activeAppView === 'ai'", start + 1);
  return mainSource.slice(start, end === -1 ? start + 5000 : end);
}

test('the advanced Editor route owns exactly one FreeCut surface', async () => {
  const main = await source('apps/desktop/src/renderer/src/main.tsx');
  const editorBranch = renderBranch(main, 'nle');

  assert.equal((editorBranch.match(/<FreecutEditorSurface\b/g) ?? []).length, 1);
  assert.doesNotMatch(editorBranch, /<ProjectPreview\b|<StyledVideoPreview\b|<RecordingTimeline\b|>Program<|>Source</);
});

test('the renderer records host identity before the app mounts', async () => {
  const main = await source('apps/desktop/src/renderer/src/main.tsx');
  assert.match(main, /document\.documentElement\.dataset\.hostBundleSignature\s*=\s*hostBundleSignature/);
  assert.match(main, /data-active-app-view=\{activeAppView\}/);
  assert.match(main, /data-ui-shell="recording-studio"/);
  assert.match(main, /kind:\s*'packaged-renderer-runtime'/);
  assert.match(main, /freecutSurfaceCount/);
  assert.match(main, /freecutFrameLoaded/);
  assert.match(main, /freecutProbeSourceMatched/);
  assert.match(main, /writePlaybackDebugReport\(/);
});

test('the host surface requires an embedded FreeCut readiness handshake', async () => {
  const surface = await source('apps/desktop/src/renderer/src/freecut-editor-surface.tsx');
  assert.match(surface, /data-freecut-marker-version/);
  assert.match(surface, /data-freecut-build-hash/);
  assert.match(surface, /data-freecut-project-id/);
  assert.match(surface, /data-freecut-ready/);
  assert.match(surface, /data-freecut-booted/);
  assert.match(surface, /data-freecut-error/);
  assert.match(surface, /data-freecut-frame-loaded/);
  assert.match(surface, /data-freecut-probe-received/);
  assert.match(surface, /data-freecut-probe-source-matched/);
  assert.match(surface, /capturedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(surface, /freecutFrameLoaded: frameLoaded/);
  assert.match(surface, /marker\?\.embedded !== true/);
  assert.match(surface, /marker\.version !== 'vendored-freecut-1'/);
  assert.match(surface, /event\.data\.projectId !== projectId/);
  assert.match(surface, /event\.data\.projectVersion !== projectVersion/);
});

test('the vendored FreeCut build emits the same identity it claims to the host', async () => {
  const freecut = await source('vendor/freecut/src/main.tsx');
  assert.match(freecut, /version:\s*'vendored-freecut-1'/);
  assert.match(freecut, /embedded:\s*window\.parent !== window/);
  assert.match(freecut, /buildHash:\s*getBuildAssetSignature\(document\)/);
  assert.match(freecut, /type: 'freecut-ready'/);
  assert.match(freecut, /type: 'freecut-boot'/);
  assert.match(freecut, /type: 'freecut-error'/);
});

// The packaged launcher bakes ROUGH_CUT_STARTUP_MODE=editor, which mapped to the
// advanced Editor tab, and resolveDockStartupProject auto-opened the most recent
// recording, which forced the same tab a second way. Recording edit is the
// canonical landing surface; the Editor is opt-in.
test('startup lands on Recording edit, and the advanced Editor is opt-in', async () => {
  const main = await source('apps/desktop/src/main/index.mjs');
  const start = main.indexOf('function rendererInitialView');
  assert.notEqual(start, -1, 'index.mjs must define rendererInitialView');
  const body = main.slice(start, main.indexOf('\n}\n', start) + 2);

  assert.doesNotMatch(body, /if \(projectPath\) return 'nle'/);
  assert.match(body, /if \(projectPath\) return 'editor'/);
  // The override the diagnostic launcher uses must survive.
  assert.match(body, /ROUGH_CUT_STARTUP_VIEW/);
  // A plain launch shows the gallery rather than auto-opening a project.
  assert.match(main, /function resolveDockStartupProject/);
});

test('the packaged host starts one main window and loads the built renderer', async () => {
  const main = await source('apps/desktop/src/main/index.mjs');
  assert.match(main, /function createMainWindow\(/);
  assert.match(main, /loadFile\(join\(__dirname, '\.\.\/\.\.\/dist\/renderer\/index\.html'\)/);
  assert.match(main, /openDockStartup\(/);
  assert.match(main, /createMainWindow\(\{ mode: startupMode, projectPath: startupProjectPath \}\)/);
  const freecutWindow = await source('apps/desktop/src/main/freecut-window.mjs');
  assert.match(freecutWindow, /Standalone FreeCut windows are disabled/);
});

test('the FreeCut host maps the canonical project id and timeline in both directions', async () => {
  const host = await source('apps/desktop/src/main/freecut-host.mjs');
  assert.match(host, /export function toFreecutProject\(/);
  assert.match(host, /id:\s*document\.id/);
  assert.match(host, /roughCutUrl:\s*`\/__rough_cut__\/media\//);
  assert.match(host, /export function fromFreecutProject\(/);
  assert.match(host, /assetId:\s*item\.mediaId/);
  assert.match(host, /timelineIn:\s*numberOr\(item\.from/);
});

test('the packaged artifact includes the vendored FreeCut shell beside the host bundle', async () => {
  const packageScript = await source('scripts/package-linux.mjs');
  assert.match(packageScript, /join\(root, 'vendor', 'freecut'\)/);
  assert.match(packageScript, /join\(appRoot, 'freecut'\)/);
  assert.match(packageScript, /dist\/renderer/);
  assert.match(packageScript, /ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH/);
  assert.match(packageScript, /FreeCut entry script is stale/);
  assert.match(packageScript, /freecut-boot/);
  assert.match(packageScript, /vendored-freecut-1/);
});

test('the packaged FreeCut server serves the exact built entry script and boot marker', async () => {
  const indexPath = join(repoRoot, 'vendor/freecut/dist/index.html');
  const index = await readFile(indexPath, 'utf8');
  const scriptPath = index.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert.ok(scriptPath, 'FreeCut dist index must name an entry script');
  const serverUrl = await startFreecutServer(join(repoRoot, 'vendor/freecut/dist'));
  try {
    const [documentResponse, scriptResponse] = await Promise.all([
      fetch(`${serverUrl}/editor/diagnostic-project`),
      fetch(`${serverUrl}${scriptPath}`),
    ]);
    assert.equal(documentResponse.status, 200);
    assert.equal(scriptResponse.status, 200);
    const bootstrap = await scriptResponse.text();
    const mainChunk = bootstrap.match(/import\(`\.\/(main-[A-Za-z0-9_-]+\.js)`\)/)?.[1];
    assert.ok(mainChunk, 'FreeCut bootstrap must name its main chunk');
    const mainResponse = await fetch(`${serverUrl}/assets/${mainChunk}`);
    assert.equal(mainResponse.status, 200);
    assert.match(await mainResponse.text(), /freecut-boot/);
    assert.match(index, /FreeCut bootstrap script executing/);
    assert.match(index, /type: 'freecut:ready'/);
  } finally {
    closeFreecutEditor();
  }
});
