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

test('NLE timeline ships Editor v2 deck affordances (ghost channels, tags, zoom gating)', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  // Ghost channels create tracks on drop.
  assert.match(source, /addGeneratedAssetToNewTrack/);
  assert.match(source, /handleGhostDragOver/);
  assert.match(source, /handleGhostDrop/);
  assert.match(source, /nleTrackLaneBody ghost/);
  // Track tag chips (V1/A1…) and the one-row header grammar.
  assert.match(source, /nleTrackTag/);
  assert.match(source, /nleTrackControlsSecondary/);
  assert.match(css, /\.nleTrackLaneHeader:hover \.nleTrackControlsSecondary/);
  // Horizontal scroll only exists when zoomed in.
  assert.match(source, /data-zoomed=\{zoomedIn \? 'true' : undefined\}/);
  assert.match(css, /\.nleLaneBodies\[data-zoomed='true'\]\s*{\s*overflow-x: auto;/);
  // Status chips / Legacy toggle relocate into the toolbar via topbarExtras.
  assert.match(source, /topbarExtras/);
});

test('NLE toolbar stays premium: centered timecode, no noise, dataset clips', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  // Master timecode is rendered by the timeline and centered as text.
  assert.match(source, /className="nleTimecode"/);
  assert.match(css, /\.nleTimecode\s*{[^}]*position: absolute;/s);
  assert.match(css, /\.nleTimecode\s*{[^}]*left: 50%;/s);
  // Tabular numerals in the UI font — no terminal mono for timecode/ruler.
  assert.match(css, /\.nleTimecode\s*{[^}]*font-variant-numeric: tabular-nums;/s);
  assert.match(css, /\.nleTimelineRulerLabel\s*{[^}]*font-variant-numeric: tabular-nums;/s);
  assert.doesNotMatch(css, /\.nleTimecode\s*{[^}]*monospace/s);
  assert.doesNotMatch(css, /\.nleTimelineRulerLabel\s*{[^}]*monospace/s);
  // Toolbar noise stays deleted: no hint sentence, no In/Out chips.
  assert.doesNotMatch(source, /Select a clip to trim, move, or split/);
  assert.doesNotMatch(source, /nleTimelineHint/);
  // Committed clip range is machine-readable for harnesses/tooling.
  assert.match(source, /data-timeline-in=\{Math\.round\(block\.timelineIn\)\}/);
  assert.match(source, /data-timeline-out=\{Math\.round\(block\.timelineOut\)\}/);
});
