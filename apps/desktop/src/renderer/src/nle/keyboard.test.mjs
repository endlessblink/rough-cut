import test from 'node:test';
import assert from 'node:assert/strict';
import { clampFrame, isTypingTarget } from './keyboard.mjs';

test('isTypingTarget detects form fields and contenteditable nodes', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'textarea' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('isTypingTarget ignores ordinary and missing targets', () => {
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});

test('clampFrame rounds and clamps to the timeline bounds', () => {
  assert.equal(clampFrame(10.6, 100), 11);
  assert.equal(clampFrame(-5, 100), 0);
  assert.equal(clampFrame(120, 100), 100);
});
