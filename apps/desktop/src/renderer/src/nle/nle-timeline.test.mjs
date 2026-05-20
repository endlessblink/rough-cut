import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('NLE timeline exposes selected-clip trim handles wired to trim mutation', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');

  assert.match(source, /trimClipById/);
  assert.match(source, /createTrimSession/);
  assert.match(source, /updateTrimSession/);
  assert.match(source, /setTrimSession\(latestSession\)/);
  assert.match(source, /setTrimSession\(null\)/);
  assert.match(source, /nleClipTrimHandle left/);
  assert.match(source, /nleClipTrimHandle right/);
  assert.match(source, /aria-label="Trim selected clip start"/);
  assert.match(source, /aria-label="Trim selected clip end"/);
  assert.match(source, /data-trim-edge/);
});

test('NLE timeline trim handles are absolute edge hit-zones, not inline content', () => {
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.nleClipTrimHandle\s*{[^}]*position: absolute;/s);
  assert.match(css, /\.nleClipTrimHandle\.left\s*{[^}]*left: 0;/s);
  assert.match(css, /\.nleClipTrimHandle\.right\s*{[^}]*right: 0;/s);
  assert.doesNotMatch(css, /\.nleClipTrimHandle\s*{[^}]*flex:/s);
});

test('NLE timeline wires local drag sessions and compact track controls', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(source, /createDragSession/);
  assert.match(source, /updateDragSession/);
  assert.match(source, /moveClipById/);
  assert.match(source, /updateTrackById/);
  assert.match(source, /reorderTrackById/);
  assert.match(source, /data-track-id/);
  assert.match(source, /aria-label=\{`Move \$\{track\.label\} up`\}/);
  assert.match(css, /\.nleTrackControls\s*{/);
  assert.match(css, /\.nleClipBlock\.dragging\s*{/);
});
