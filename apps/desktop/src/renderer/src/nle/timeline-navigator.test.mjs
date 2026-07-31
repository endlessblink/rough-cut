import test from 'node:test';
import assert from 'node:assert/strict';
import { navigatorClipStyle, navigatorFrameAtClientX } from './timeline-navigator-math.mjs';

test('timeline navigator maps pointer position to a clamped frame', () => {
  assert.equal(navigatorFrameAtClientX(150, 100, 500, 1000), 100);
  assert.equal(navigatorFrameAtClientX(40, 100, 500, 1000), 0);
  assert.equal(navigatorFrameAtClientX(700, 100, 500, 1000), 1000);
});

test('timeline navigator normalizes clip ranges for the overview surface', () => {
  assert.deepEqual(navigatorClipStyle(100, 300, 1000), { left: '10%', width: '20%' });
  assert.equal(navigatorClipStyle(400, 400, 1000), null);
});
