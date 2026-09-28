import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

async function source(relativePath) {
  return readFile(join(repoRoot, relativePath), 'utf8');
}

test('the renderer records host identity before the app mounts', async () => {
  const main = await source('apps/desktop/src/renderer/src/main.tsx');
  assert.match(main, /document\.documentElement\.dataset\.hostBundleSignature\s*=\s*hostBundleSignature/);
  assert.match(main, /data-active-app-view=\{activeAppView\}/);
  assert.match(main, /data-ui-shell="recording-studio"/);
  assert.match(main, /kind:\s*'packaged-renderer-runtime'/);
  assert.match(main, /writePlaybackDebugReport\(/);
});

test('startup lands on Recording edit when a project is open', async () => {
  const main = await source('apps/desktop/src/main/index.mjs');
  const start = main.indexOf('function rendererInitialView');
  assert.notEqual(start, -1, 'index.mjs must define rendererInitialView');
  const body = main.slice(start, main.indexOf('\n}\n', start) + 2);

  assert.match(body, /if \(projectPath\) return 'editor'/);
  // The override the diagnostic launcher uses must survive.
  assert.match(body, /ROUGH_CUT_STARTUP_VIEW/);
  // A plain launch shows the gallery rather than auto-opening a project.
  assert.match(main, /function resolveDockStartupProject/);
});

// The renderer once forced another view every time a project opened — gallery
// open, recording saved — silently overriding the main-process route.
test('opening a project lands on Recording edit', async () => {
  const main = await source('apps/desktop/src/renderer/src/main.tsx');
  const openTransitions = [
    // recording saved
    /status\.state === 'saved'[\s\S]{0,320}?setActiveAppView\('(\w+)'\)/,
    // opened from the Projects gallery
    /function openProjectState[\s\S]{0,240}?setActiveAppView\('(\w+)'\)/,
  ];
  for (const pattern of openTransitions) {
    const match = main.match(pattern);
    assert.ok(match, `expected to find a project-open transition for ${pattern}`);
    assert.equal(match[1], 'editor');
  }
});

test('the packaged host starts one main window and loads the built renderer', async () => {
  const main = await source('apps/desktop/src/main/index.mjs');
  assert.match(main, /function createMainWindow\(/);
  assert.match(main, /loadFile\(join\(__dirname, '\.\.\/\.\.\/dist\/renderer\/index\.html'\)/);
  assert.match(main, /openDockStartup\(/);
  assert.match(main, /createMainWindow\(\{ mode: startupMode, projectPath: startupProjectPath \}\)/);
});
