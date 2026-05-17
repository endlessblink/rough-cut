import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSelection, resolveClickIntent, selectAll, selectRange, toggleSelection } from './selection.mjs';

const ORDER = ['/a.roughcut', '/b.roughcut', '/c.roughcut', '/d.roughcut'];

test('toggleSelection adds and removes paths immutably', () => {
  const empty = new Set();
  const after = toggleSelection(empty, '/a.roughcut');
  assert.equal(after.has('/a.roughcut'), true);
  assert.equal(empty.size, 0, 'original set is not mutated');
  const cleared = toggleSelection(after, '/a.roughcut');
  assert.equal(cleared.has('/a.roughcut'), false);
});

test('selectRange picks a contiguous slice and unions with prior selection', () => {
  const selection = new Set(['/a.roughcut']);
  const next = selectRange(selection, ORDER, '/b.roughcut', '/d.roughcut');
  assert.deepEqual([...next].sort(), ['/a.roughcut', '/b.roughcut', '/c.roughcut', '/d.roughcut']);
});

test('selectRange works regardless of direction (anchor below or above target)', () => {
  const forward = selectRange(new Set(), ORDER, '/a.roughcut', '/c.roughcut');
  const backward = selectRange(new Set(), ORDER, '/c.roughcut', '/a.roughcut');
  assert.deepEqual([...forward].sort(), [...backward].sort());
});

test('selectRange falls back to toggle when anchor is missing', () => {
  const next = selectRange(new Set(), ORDER, null, '/b.roughcut');
  assert.deepEqual([...next], ['/b.roughcut']);
});

test('selectAll returns every visible path', () => {
  const next = selectAll(ORDER);
  assert.equal(next.size, ORDER.length);
});

test('clearSelection returns an empty Set', () => {
  const next = clearSelection();
  assert.equal(next.size, 0);
});

test('resolveClickIntent: Cmd/Ctrl click → toggle', () => {
  const intent = resolveClickIntent({ selection: new Set(), summaryPath: '/a.roughcut', metaKey: true, ctrlKey: false, shiftKey: false });
  assert.equal(intent.kind, 'toggle');
  const intent2 = resolveClickIntent({ selection: new Set(), summaryPath: '/a.roughcut', metaKey: false, ctrlKey: true, shiftKey: false });
  assert.equal(intent2.kind, 'toggle');
});

test('resolveClickIntent: Shift click → range', () => {
  const intent = resolveClickIntent({ selection: new Set(['/a.roughcut']), summaryPath: '/c.roughcut', metaKey: false, ctrlKey: false, shiftKey: true });
  assert.equal(intent.kind, 'range');
});

test('resolveClickIntent: plain click with no selection → open', () => {
  const intent = resolveClickIntent({ selection: new Set(), summaryPath: '/a.roughcut', metaKey: false, ctrlKey: false, shiftKey: false });
  assert.equal(intent.kind, 'open');
});

test('resolveClickIntent: plain click during active selection → clear-and-open (Finder pattern)', () => {
  const intent = resolveClickIntent({ selection: new Set(['/a.roughcut']), summaryPath: '/b.roughcut', metaKey: false, ctrlKey: false, shiftKey: false });
  assert.equal(intent.kind, 'clear-and-open');
});
