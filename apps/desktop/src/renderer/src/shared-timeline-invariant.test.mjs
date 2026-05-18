import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd().endsWith('/apps/desktop') ? '../..' : '.';
const doc = readFileSync(join(root, 'docs/shared-timeline-architecture.md'), 'utf8');

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
