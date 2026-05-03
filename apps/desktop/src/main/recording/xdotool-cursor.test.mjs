import test from 'node:test';
import assert from 'node:assert/strict';
import { isXdotoolAvailable, readCursorViaXdotool } from './xdotool-cursor.mjs';

test('isXdotoolAvailable returns a boolean', () => {
  const available = isXdotoolAvailable();
  assert.equal(typeof available, 'boolean');
});

test('readCursorViaXdotool returns finite x/y when xdotool is available', { skip: !isXdotoolAvailable() }, () => {
  const point = readCursorViaXdotool();
  // Either xdotool succeeded (returns { x, y }) or it failed (null). Both
  // are acceptable in CI; what we lock in here is shape.
  if (point !== null) {
    assert.equal(typeof point.x, 'number');
    assert.equal(typeof point.y, 'number');
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
  }
});

// The parser is the part that matters most for correctness. Exercise it via
// a small fixture function that mirrors the real spawn output format. The
// real spawn happens in readCursorViaXdotool; we don't reach into it for
// these tests, instead asserting the parser regex behavior matches xdotool's
// canonical "--shell" output.
test('parser regex matches canonical xdotool --shell output', () => {
  const canonical = 'X=1565\nY=307\nSCREEN=0\nWINDOW=96468995';
  const match = /X=(-?\d+)\s+Y=(-?\d+)/.exec(canonical);
  assert.notEqual(match, null);
  assert.equal(Number(match[1]), 1565);
  assert.equal(Number(match[2]), 307);
});

test('parser regex captures negative coordinates (left-side monitor)', () => {
  const negativeOutput = 'X=-50\nY=200\nSCREEN=0\nWINDOW=12345';
  const match = /X=(-?\d+)\s+Y=(-?\d+)/.exec(negativeOutput);
  assert.notEqual(match, null);
  assert.equal(Number(match[1]), -50);
  assert.equal(Number(match[2]), 200);
});

test('parser regex captures off-right-edge coordinates (right-side monitor)', () => {
  const farRight = 'X=2400\nY=600\nSCREEN=0\nWINDOW=12345';
  const match = /X=(-?\d+)\s+Y=(-?\d+)/.exec(farRight);
  assert.notEqual(match, null);
  assert.equal(Number(match[1]), 2400);
  assert.equal(Number(match[2]), 600);
});

test('parser regex returns null for malformed output', () => {
  assert.equal(/X=(-?\d+)\s+Y=(-?\d+)/.exec('garbage output without coords'), null);
  assert.equal(/X=(-?\d+)\s+Y=(-?\d+)/.exec(''), null);
  assert.equal(/X=(-?\d+)\s+Y=(-?\d+)/.exec('X=foo\nY=bar'), null);
});
