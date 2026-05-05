import test from 'node:test';
import assert from 'node:assert/strict';
import { coverSourceRect, cursorAtFrame, drawCursorPath } from './styled-preview.mjs';

test('cursorAtFrame returns null for empty events', () => {
  assert.equal(cursorAtFrame([], 0), null);
  assert.equal(cursorAtFrame(undefined, 0), null);
  assert.equal(cursorAtFrame(null, 0), null);
});

test('cursorAtFrame returns null when currentFrame is non-finite', () => {
  assert.equal(cursorAtFrame([{ frame: 0, x: 100, y: 200 }], Number.NaN), null);
});

test('cursorAtFrame returns the only event for a single-event array', () => {
  const events = [{ frame: 30, x: 640, y: 360 }];
  assert.deepEqual(cursorAtFrame(events, 0), { x: 640, y: 360 });
  assert.deepEqual(cursorAtFrame(events, 30), { x: 640, y: 360 });
  assert.deepEqual(cursorAtFrame(events, 9999), { x: 640, y: 360 });
});

test('cursorAtFrame returns the first event for frames before the first', () => {
  const events = [
    { frame: 10, x: 100, y: 200 },
    { frame: 50, x: 500, y: 600 },
  ];
  assert.deepEqual(cursorAtFrame(events, 5), { x: 100, y: 200 });
  assert.deepEqual(cursorAtFrame(events, 10), { x: 100, y: 200 });
});

test('cursorAtFrame returns the last event for frames after the last', () => {
  const events = [
    { frame: 10, x: 100, y: 200 },
    { frame: 50, x: 500, y: 600 },
  ];
  assert.deepEqual(cursorAtFrame(events, 50), { x: 500, y: 600 });
  assert.deepEqual(cursorAtFrame(events, 999), { x: 500, y: 600 });
});

test('cursorAtFrame interpolates linearly between bracketing events', () => {
  const events = [
    { frame: 10, x: 100, y: 200 },
    { frame: 50, x: 500, y: 600 },
  ];
  // Halfway between the two events: linear interpolation of 100→500 and 200→600.
  assert.deepEqual(cursorAtFrame(events, 30), { x: 300, y: 400 });
  // Quarter of the way through.
  assert.deepEqual(cursorAtFrame(events, 20), { x: 200, y: 300 });
});

test('cursorAtFrame interpolates across off-screen positions (multi-monitor)', () => {
  // Cursor sweeps from on-screen to off-screen and back; interpolation must
  // pass through off-screen values without clamping.
  const events = [
    { frame: 0, x: 1900, y: 500 },
    { frame: 30, x: 2400, y: 500 },
    { frame: 60, x: 1800, y: 500 },
  ];
  assert.deepEqual(cursorAtFrame(events, 15), { x: 2150, y: 500 });
  assert.deepEqual(cursorAtFrame(events, 30), { x: 2400, y: 500 });
  assert.deepEqual(cursorAtFrame(events, 45), { x: 2100, y: 500 });
});

test('cursorAtFrame sorts events that arrive out of order', () => {
  const events = [
    { frame: 50, x: 500, y: 600 },
    { frame: 10, x: 100, y: 200 },
  ];
  assert.deepEqual(cursorAtFrame(events, 30), { x: 300, y: 400 });
});

test('cursorAtFrame skips events with non-finite or non-move types', () => {
  const events = [
    { frame: 10, x: 100, y: 200, type: 'move' },
    { frame: 30, x: Number.NaN, y: 400, type: 'move' },
    { frame: 50, x: 500, y: 600, type: 'down' },
    { frame: 70, x: 700, y: 800, type: 'move' },
  ];
  // Only frame 10 and 70 are valid move events. Frame 40 should interpolate
  // between them: 100 + (700-100)*(40-10)/(70-10) = 100 + 300 = 400. y similar.
  assert.deepEqual(cursorAtFrame(events, 40), { x: 400, y: 500 });
});

test('drawCursorPath issues canvas operations at the given anchor', () => {
  const calls = [];
  const ctx = {
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push(['closePath']),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    set fillStyle(value) {
      calls.push(['fillStyle', value]);
    },
    set strokeStyle(value) {
      calls.push(['strokeStyle', value]);
    },
    set lineWidth(value) {
      calls.push(['lineWidth', value]);
    },
  };

  drawCursorPath(ctx, 100, 200);

  assert.deepEqual(calls[0], ['beginPath']);
  assert.deepEqual(calls[1], ['moveTo', 100, 200]);
  // Polygon vertices anchored at (100, 200): m 0 0 l 0 26 l 7 20 l 12 33 l 18 31 l 13 19 l 24 19
  assert.deepEqual(calls[2], ['lineTo', 100, 226]);
  assert.deepEqual(calls[3], ['lineTo', 107, 220]);
  assert.deepEqual(calls[4], ['lineTo', 112, 233]);
  assert.deepEqual(calls[5], ['lineTo', 118, 231]);
  assert.deepEqual(calls[6], ['lineTo', 113, 219]);
  assert.deepEqual(calls[7], ['lineTo', 124, 219]);
  assert.deepEqual(calls[8], ['closePath']);
  assert.ok(calls.some((c) => c[0] === 'fill'));
  assert.ok(calls.some((c) => c[0] === 'stroke'));
});

test('coverSourceRect crops wide camera sources instead of stretching to square', () => {
  assert.deepEqual(coverSourceRect(1280, 720, 180, 180), {
    sx: 280,
    sy: 0,
    sw: 720,
    sh: 720,
  });
});

test('coverSourceRect crops tall camera sources instead of stretching to square', () => {
  assert.deepEqual(coverSourceRect(720, 1280, 180, 180), {
    sx: 0,
    sy: 280,
    sw: 720,
    sh: 720,
  });
});

test('coverSourceRect returns null for invalid dimensions', () => {
  assert.equal(coverSourceRect(0, 720, 180, 180), null);
  assert.equal(coverSourceRect(1280, 720, 0, 180), null);
});
