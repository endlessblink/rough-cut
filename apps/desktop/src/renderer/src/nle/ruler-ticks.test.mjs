import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRulerTicks, formatRulerLabel, pickTickInterval } from './ruler-ticks.mjs';

test('pickTickInterval uses one-second ticks for very short timelines', () => {
  assert.equal(pickTickInterval(5, 120), 1);
});

test('pickTickInterval falls back to five-second labels for medium timelines', () => {
  assert.equal(pickTickInterval(60, 20), 5);
});

test('pickTickInterval uses thirty-second labels for long timelines', () => {
  assert.equal(pickTickInterval(600, 2), 30);
});

test('pickTickInterval preserves at least forty pixels between labels', () => {
  assert.equal(pickTickInterval(45, 20), 5);
  assert.equal(pickTickInterval(600, 1), 60);
});

test('buildRulerTicks emits major labels and one-second minor ticks', () => {
  const ticks = buildRulerTicks(1800, 30, 1200);
  const majors = ticks.filter((tick) => tick.major);
  const minors = ticks.filter((tick) => !tick.major);
  assert.equal(majors[0].label, '00:00:00');
  assert.equal(majors[1].label, '00:05:00');
  assert.ok(minors.some((tick) => tick.frame === 30));
});

test('formatRulerLabel renders mm:ss:00', () => {
  assert.equal(formatRulerLabel(65), '01:05:00');
});
