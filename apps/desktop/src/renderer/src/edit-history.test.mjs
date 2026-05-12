import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_EDIT_HISTORY, recordEdit, redoEdit, undoEdit } from './edit-history.mjs';

test('recordEdit pushes undo snapshots and clears redo', () => {
  const history = recordEdit({ undo: ['a'], redo: ['future'] }, 'b');
  assert.deepEqual(history, { undo: ['a', 'b'], redo: [] });
});

test('recordEdit respects the configured stack limit', () => {
  const history = recordEdit({ undo: ['a', 'b'], redo: [] }, 'c', 2);
  assert.deepEqual(history.undo, ['b', 'c']);
});

test('undoEdit moves current snapshot to redo', () => {
  const result = undoEdit({ undo: ['a', 'b'], redo: [] }, 'current');
  assert.equal(result.snapshot, 'b');
  assert.deepEqual(result.history, { undo: ['a'], redo: ['current'] });
});

test('redoEdit restores the newest redo snapshot', () => {
  const result = redoEdit({ undo: ['a'], redo: ['b', 'c'] }, 'current');
  assert.equal(result.snapshot, 'b');
  assert.deepEqual(result.history, { undo: ['a', 'current'], redo: ['c'] });
});

test('empty history is a no-op', () => {
  assert.equal(undoEdit(EMPTY_EDIT_HISTORY, 'current').snapshot, null);
  assert.equal(redoEdit(EMPTY_EDIT_HISTORY, 'current').snapshot, null);
});
