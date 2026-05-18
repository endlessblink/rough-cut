import test from 'node:test';
import assert from 'node:assert/strict';
import { NLE_TRACK_LANES, assetLabel, formatDuration } from './asset-format.mjs';

test('NLE_TRACK_LANES has the four lanes in fixed order', () => {
  assert.equal(NLE_TRACK_LANES.length, 4);
  assert.deepEqual(
    NLE_TRACK_LANES.map((l) => l.kind),
    ['video', 'audio', 'captions', 'motion-graphics'],
  );
  assert.deepEqual(
    NLE_TRACK_LANES.map((l) => l.label),
    ['Video', 'Audio', 'Captions', 'Motion graphics'],
  );
});

test('assetLabel prefers label, then name, then type+index, then index', () => {
  assert.equal(assetLabel({ label: 'Take 1', name: 'rec' }, 0), 'Take 1');
  assert.equal(assetLabel({ name: 'rec.mp4' }, 0), 'rec.mp4');
  assert.equal(assetLabel({ type: 'recording' }, 2), 'recording #3');
  assert.equal(assetLabel({}, 0), 'Asset #1');
  assert.equal(assetLabel(null, 4), 'Asset #5');
});

test('formatDuration formats positive seconds as m:ss; returns null for invalid', () => {
  assert.equal(formatDuration(0), null);
  assert.equal(formatDuration(-1), null);
  assert.equal(formatDuration(Number.NaN), null);
  assert.equal(formatDuration(Infinity), null);
  assert.equal(formatDuration(undefined), null);
  assert.equal(formatDuration(7), '0:07');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(125.4), '2:05');
});
