import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const mainSource = readFileSync(join(here, 'index.mjs'), 'utf8');
const sidebarSmokeSource = readFileSync(join(root, 'scripts/smoke-sidebar-layout.mjs'), 'utf8');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('sidebar layout smoke covers all live editor tool tabs and visual artifacts', () => {
  assert.match(mainSource, /ROUGH_CUT_UI_SMOKE_SIDEBAR_SCREENSHOT_DIR && result\.hasAllSidebarTabs/);
  assert.match(mainSource, /for \(const tool of \['Background', 'Timeline', 'Cursor', 'Camera'\]\)/);
  assert.match(mainSource, /hasSidebarVisualSnapshots = sidebarScreenshots\.length === 4/);
  assert.match(mainSource, /hasStableCentralStageAcrossSidebarTabs/);
  assert.match(mainSource, /hasStableTimelineAcrossSidebarTabs/);
  assert.match(mainSource, /hasRepresentativeSidebarControls/);
  assert.doesNotMatch(mainSource, /for \(const label of \['Background', 'Timeline', 'Inspector'\]\)/);
});

test('sidebar layout smoke fails when known dead placeholder copy returns', () => {
  assert.match(mainSource, /Cursor style controls are planned for TASK-044\./);
  assert.match(mainSource, /Save failures and degraded media states appear here when available\./);
  assert.match(mainSource, /will live in this bottom rail/);
  assert.match(mainSource, /appear here once a project is loaded/);
  assert.match(mainSource, /hasNoSidebarPlaceholderCopy/);
});

test('sidebar layout smoke exercises representative controls for each tab', () => {
  assert.match(mainSource, /button\[aria-label="Soft blur"\]/);
  assert.match(mainSource, /data-cut-range-panel="true"/);
  assert.match(mainSource, /Restorable hidden ranges/);
  assert.match(mainSource, /data-cursor-style="spotlight"/);
  assert.match(mainSource, /textContent\?\.includes\('Shape'\)/);
  assert.match(mainSource, /shapeSelect\.dispatchEvent\(new Event\('change'/);
});

test('sidebar layout smoke has small viewport and screenshot byte guards', () => {
  assert.match(mainSource, /window\.innerWidth <= 900/);
  assert.match(mainSource, /scrollWidth <= element\.clientWidth \+ 2/);
  assert.match(sidebarSmokeSource, /ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '900'/);
  assert.match(sidebarSmokeSource, /ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '740'/);
  assert.match(sidebarSmokeSource, /ROUGH_CUT_UI_SMOKE_SIDEBAR_SCREENSHOT_DIR/);
  assert.match(sidebarSmokeSource, /Object\.values\(sidebarScreenshotBytes\)\.some\(\(bytes\) => bytes <= 1000\)/);
});

test('root smoke:ui includes sidebar regression smoke', () => {
  assert.match(rootPackage.scripts['smoke:ui'], /node scripts\/smoke-ui\.mjs && node scripts\/smoke-sidebar-layout\.mjs/);
});
