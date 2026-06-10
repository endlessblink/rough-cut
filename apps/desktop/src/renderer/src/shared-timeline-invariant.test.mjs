import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd().endsWith('/apps/desktop') ? '../..' : '.';
const doc = readFileSync(join(root, 'docs/shared-timeline-architecture.md'), 'utf8');
const mainSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/main.tsx'), 'utf8');
const nleShellSource = readFileSync(join(root, 'apps/desktop/src/renderer/src/nle/nle-shell.tsx'), 'utf8');

test('shared timeline architecture names one timeline and two canonical toolsets', () => {
  assert.match(doc, /Rough Cut has one timeline/);
  assert.match(doc, /Recording edit and NLE are two canonical toolsets/);
  assert.match(doc, /Neither surface is a read-only projection/);
  assert.match(doc, /same project timeline through the same project-change path/);
});

test('shared timeline architecture covers the edit concepts that must not fork', () => {
  for (const concept of [
    'Head/tail trim',
    'removed/cut ranges',
    'Zoom markers',
    'Cursor telemetry',
    'Click effects',
    'Camera PiP',
    'Mic/system audio',
    'export settings',
  ]) {
    assert.match(doc, new RegExp(concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('shared timeline architecture blocks pointermove mutations as canonical state', () => {
  assert.match(doc, /local preview\/session state while the pointer moves/);
  assert.match(doc, /Commit one pure shared timeline mutation on pointerup/);
  assert.match(doc, /Do not mutate project state on every pointermove/);
});

test('recording edit and NLE share app-owned playhead state across tab switches', () => {
  assert.match(mainSource, /const \[sharedTimelineTimeSec, setSharedTimelineTimeSec\] = React\.useState\(0\)/);
  assert.match(mainSource, /const sharedTimelineFrame = Math\.round\(clampedSharedTimelineTimeSec \* sharedTimelineFps\)/);
  assert.match(mainSource, /playheadFrame=\{sharedTimelineFrame\}/);
  assert.match(mainSource, /onPlayheadFrameChange=\{updateSharedTimelineFrame\}/);
  assert.match(mainSource, /currentTimeSec=\{clampedSharedTimelineTimeSec\}/);
  assert.match(mainSource, /onCurrentTimeSecChange=\{updateSharedTimelineTimeSec\}/);
  assert.match(nleShellSource, /playheadFrame: controlledPlayheadFrame/);
  assert.match(nleShellSource, /const playheadFrame = controlledPlayheadFrame \?\? localPlayheadFrame/);
  assert.match(nleShellSource, /if \(onPlayheadFrameChange\) onPlayheadFrameChange\(resolved\)/);
  assert.doesNotMatch(nleShellSource, /setPlayheadFrame\(0\);\n\s+setIsPlaying\(false\)/);
});
