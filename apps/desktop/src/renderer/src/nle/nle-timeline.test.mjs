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
  assert.match(css, /\.nleClipTrimHandle\s*{[^}]*width: 20px;/s);
  assert.match(css, /\.nleClipTrimHandle\.left\s*{[^}]*left: 0;/s);
  assert.match(css, /\.nleClipTrimHandle\.right\s*{[^}]*right: 0;/s);
  assert.doesNotMatch(css, /\.nleClipTrimHandle\s*{[^}]*flex:/s);
});

test('NLE timeline marks source-bound trim handles as constrained', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const clipBuilder = readFileSync(join(here, 'timeline-clips.mjs'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(clipBuilder, /sourceDurationFrames/);
  assert.match(source, /edgeLimitState/);
  assert.match(source, /data-edge-limit=\{leftLimit\}/);
  assert.match(source, /data-edge-limit=\{rightLimit\}/);
  assert.match(css, /\.nleClipTrimHandle\[data-edge-limit="source-start"\]/);
  assert.match(css, /\.nleClipTrimHandle\[data-edge-limit="source-end"\]/);
});

test('NLE program monitor gives vertical recordings real editing space', () => {
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(css, /\.nleProgramMonitor\s*{[^}]*height: clamp\(340px, 52vh, 560px\);/s);
  assert.doesNotMatch(css, /\.nleProgramMonitor\s*{[^}]*aspect-ratio: 16 \/ 9;/s);
  assert.match(css, /\.nleProgramMonitor \.styledPreviewCanvas\s*{[^}]*max-height: calc\(100% - 1rem\);/s);
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

test('NLE timeline accepts generated asset drops on compatible tracks', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');

  assert.match(source, /addGeneratedAssetToTrack/);
  assert.match(source, /application\/x-rough-cut-ai-asset/);
  assert.match(source, /handleGeneratedDragOver/);
  assert.match(source, /handleGeneratedDrop/);
  assert.match(source, /generatedDropValid/);
  assert.match(source, /generatedDropInvalid/);
});

test('NLE shell keeps the right split segment selected after splitting', () => {
  const source = readFileSync(join(here, 'nle-shell.tsx'), 'utf8');

  assert.match(source, /rightClipIdAfterSplit/);
  assert.match(source, /setSelectedClipId\(rightClipIdAfterSplit\(next, selectedClipId, clampedPlayhead\)\)/);
});
