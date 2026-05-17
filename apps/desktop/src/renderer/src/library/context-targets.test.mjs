import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContextTargets } from './context-targets.mjs';

const a = { path: '/a.roughcut', name: 'a' };
const b = { path: '/b.roughcut', name: 'b' };
const c = { path: '/c.roughcut', name: 'c' };
const summaries = [a, b, c];

test('target in active selection → returns the whole selection', () => {
  const got = resolveContextTargets({ summaries, selection: new Set(['/a.roughcut', '/c.roughcut']), targetPath: '/a.roughcut' });
  assert.deepEqual(got.map((s) => s.path), ['/a.roughcut', '/c.roughcut']);
});

test('target not in selection → returns just that one card (selection ignored)', () => {
  const got = resolveContextTargets({ summaries, selection: new Set(['/a.roughcut', '/c.roughcut']), targetPath: '/b.roughcut' });
  assert.deepEqual(got.map((s) => s.path), ['/b.roughcut']);
});

test('empty selection → returns just the target', () => {
  const got = resolveContextTargets({ summaries, selection: new Set(), targetPath: '/a.roughcut' });
  assert.deepEqual(got.map((s) => s.path), ['/a.roughcut']);
});

test('target not in summaries → returns empty array', () => {
  const got = resolveContextTargets({ summaries, selection: new Set(), targetPath: '/missing.roughcut' });
  assert.deepEqual(got, []);
});

test('preserves source-order from summaries, not selection-insertion order', () => {
  // Selection has c before a; result should still be [a, c] because the
  // gallery's visual order (newest-first via summaries) is authoritative.
  const got = resolveContextTargets({ summaries, selection: new Set(['/c.roughcut', '/a.roughcut']), targetPath: '/c.roughcut' });
  assert.deepEqual(got.map((s) => s.path), ['/a.roughcut', '/c.roughcut']);
});

test('tolerates non-Set selection (array fallback)', () => {
  const got = resolveContextTargets({ summaries, selection: ['/b.roughcut'], targetPath: '/b.roughcut' });
  assert.deepEqual(got.map((s) => s.path), ['/b.roughcut']);
});

test('tolerates missing summaries argument', () => {
  const got = resolveContextTargets({ summaries: undefined, selection: new Set(), targetPath: '/x.roughcut' });
  assert.deepEqual(got, []);
});
