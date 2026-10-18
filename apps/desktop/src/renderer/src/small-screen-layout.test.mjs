import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'styles.css'), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Every declaration block whose selector list contains `selector` (later blocks override earlier ones).
function blocks(selector) {
  const found = [];
  const pattern = /(?<=^|\})\s*([^{}@][^{}]*)\{([^{}]*)\}/g;
  for (const match of rules.matchAll(pattern)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) found.push(match[2]);
  }
  return found;
}

const declares = (selector, property, value) => blocks(selector).some((body) => new RegExp(`(^|[;\\s])${property}\\s*:\\s*${value}\\s*(;|$)`).test(body));

test('recorder: the controls block keeps its content height so its rows cannot spill under the camera card', () => {
  // `min-height: 0` let this grid item shrink below its content inside the scrolling body, which pushed the
  // Mic activity and Camera rows underneath the camera preview card on a short window.
  for (const body of blocks('.preRecordControls')) {
    assert.doesNotMatch(body, /min-height\s*:\s*0\b/, '.preRecordControls must not be allowed to shrink');
  }
});

test('recorder: the body scrolls with content-sized rows instead of squeezing them', () => {
  assert.ok(declares('.preRecordBody', 'overflow', 'auto'), 'the body scrolls');
  assert.ok(declares('.preRecordBody', 'grid-auto-rows', 'max-content'), 'rows are sized by their content');
  assert.ok(declares('.preRecordBody', 'align-content', 'start'), 'rows stack from the top');
});

test('recorder: the control cards wrap to fewer columns on a narrow window', () => {
  assert.ok(blocks('.preRecordControls').some((body) => /grid-template-columns\s*:\s*repeat\(auto-fit,\s*minmax\(/.test(body)), 'auto-fit columns');
});

test('recorder: short windows get smaller screen and region pictures', () => {
  assert.match(css, /@media \(max-height: 700px\) \{\s*\.screenPickerPreview \{ aspect-ratio: auto; height: 7\.25rem; \}/);
});

test('editor: the tool strip scrolls and its tabs never shrink, so icons and labels cannot overlap', () => {
  assert.ok(declares('.projectEditor > .toolRail', 'overflow-y', 'auto'), 'the strip scrolls vertically');
  assert.ok(declares('.toolRail .toolButton', 'flex', '0 0 auto'), 'tabs keep their size');
  assert.ok(declares('.toolRail .toolButton', 'min-height', 'max-content'), 'a tab is at least as tall as its icon and label');
});

test('editor: short windows get a tighter tool strip', () => {
  assert.match(css, /@media \(max-height: 760px\) \{[^@]*\.toolRail \.toolButton \.icon \{ height: 1\.25rem; width: 1\.25rem; \}/);
});

test('editor: the top bar keeps its actions column at content width so Undo and Redo cannot slide under the page tabs', () => {
  // On a 900 px window the right-hand column (minmax(0, 1fr)) shrank to nothing and Undo/Redo were hidden behind the tabs.
  assert.ok(blocks('.editorShell .topBar').some((body) => /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(min-content,\s*1fr\)/.test(body)), 'actions column keeps min-content');
  assert.match(css, /@media \(max-width: 1000px\) \{\s*\.editorShell \.topBar \{ gap: var\(--space-2\); \}\s*\.topBar \.appViewTab \{ padding: 0 var\(--space-2\); \}/);
});
