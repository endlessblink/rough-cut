import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOST_LIMIT,
  EXPORT_BOOST_LIMITER,
  MAX_COMBINED_GAIN,
  boostLimiterCurve,
  combineGains,
  dbToGain,
  exportGainFilter,
  formatVolume,
  gainToDb,
  needsBoostLimiter,
} from './audio-gain.mjs';

test('50% / 100% / 200% are -6 / 0 / +6 dB', () => {
  assert.equal(Math.round(gainToDb(0.5) * 100) / 100, -6.02);
  assert.equal(gainToDb(1), 0);
  assert.equal(Math.round(gainToDb(2) * 100) / 100, 6.02);
  assert.equal(gainToDb(0), -Infinity);
  assert.ok(Math.abs(dbToGain(gainToDb(1.37)) - 1.37) < 1e-12);
});

test('clip and track gains multiply and stay within 0..4', () => {
  assert.equal(combineGains(0.5, 2), 1);
  assert.equal(combineGains(2, 2), 4);
  assert.equal(combineGains(9, 9), MAX_COMBINED_GAIN);
  assert.equal(combineGains(0, 2), 0);
  assert.equal(combineGains(Number.NaN, 0.5), 0.5);
  assert.equal(combineGains(), 1);
});

test('the UI shows a percent or Muted', () => {
  assert.equal(formatVolume(), '100%');
  assert.equal(formatVolume({ volume: 0.5 }), '50%');
  assert.equal(formatVolume({ volume: 1.999 }), '200%');
  assert.equal(formatVolume({ volume: 1.5, muted: true }), 'Muted');
});

test('export adds a volume filter only when a section is not at 100%', () => {
  assert.equal(exportGainFilter(1), '');
  assert.equal(exportGainFilter(0.5), 'volume=0.5');
  assert.equal(exportGainFilter(0), 'volume=0');
  assert.equal(exportGainFilter(1 / 3), 'volume=0.3333');
  assert.equal(needsBoostLimiter([1, 0.5, 0]), false);
  assert.equal(needsBoostLimiter([1, 1.01]), true);
  assert.equal(needsBoostLimiter(2), true);
  // No auto make-up gain (it would change the level) and the lookahead delay is compensated.
  assert.match(EXPORT_BOOST_LIMITER, /^alimiter=limit=0\.89:level=false:latency=true$/);
});

test('the preview limiter curve is exactly linear below the limit and never exceeds full scale', () => {
  const curve = boostLimiterCurve(4097);
  const at = (input) => {
    // Linear interpolation, like WaveShaperNode, for an input level in -4..4.
    const position = ((input / MAX_COMBINED_GAIN + 1) / 2) * (curve.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(curve.length - 1, lower + 1);
    return curve[lower] + (curve[upper] - curve[lower]) * (position - lower);
  };
  for (const level of [0, 0.01, -0.1, 0.25, 0.5, -0.7, 0.88]) assert.ok(Math.abs(at(level) - level) < 1e-6, `linear at ${level}`);
  assert.equal(curve[(curve.length - 1) / 2], 0);
  assert.ok(at(1) > BOOST_LIMIT && at(1) < 1);
  assert.ok(at(4) <= 1 && at(-4) >= -1);
  for (let index = 1; index < curve.length; index += 1) assert.ok(curve[index] >= curve[index - 1], 'monotonic');
});
