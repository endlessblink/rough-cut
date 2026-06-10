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

// Regression: a 29-minute recording at fit zoom (~0.8 px/sec) used to emit
// ~1,700 one-second minor ticks and 60s labels narrower than the label text,
// rendering the ruler as an unreadable wall.
test('buildRulerTicks keeps long fit-zoom timelines readable', () => {
  const fps = 30;
  const ticks = buildRulerTicks(29 * 60 * fps, fps, 1380);
  const pxPerSecond = 1380 / (29 * 60);
  const majors = ticks.filter((tick) => tick.major);
  const minors = ticks.filter((tick) => !tick.major);
  for (let i = 1; i < majors.length - 1; i += 1) {
    const spacingPx = ((majors[i].frame - majors[i - 1].frame) / fps) * pxPerSecond;
    assert.ok(spacingPx >= 56, `major labels ${spacingPx.toFixed(1)}px apart`);
  }
  if (minors.length > 1) {
    const spacingPx = ((minors[1].frame - minors[0].frame) / fps) * pxPerSecond;
    assert.ok(spacingPx >= 7, `minor ticks ${spacingPx.toFixed(1)}px apart`);
  }
  assert.ok(ticks.length < 400, `tick count bounded (${ticks.length})`);
});
