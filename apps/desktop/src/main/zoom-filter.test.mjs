import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZoomFilter } from './zoom-filter.mjs';

function marker(overrides = {}) {
  return {
    id: 'm-test',
    startFrame: 30,
    endFrame: 90,
    kind: 'manual',
    strength: 1,
    focalPoint: { x: 0.5, y: 0.5 },
    zoomInDuration: 9,
    zoomOutDuration: 9,
    ...overrides,
  };
}

test('buildZoomFilter returns no fragment when markers is empty', () => {
  const result = buildZoomFilter({
    markers: [],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  assert.equal(result.filterFragment, null);
  assert.equal(result.present, false);
});

test('buildZoomFilter throws on non-positive source dimensions', () => {
  assert.throws(() =>
    buildZoomFilter({
      markers: [marker()],
      sourceWidth: 0,
      sourceHeight: 720,
    }),
  );
  assert.throws(() =>
    buildZoomFilter({
      markers: [marker()],
      sourceWidth: 1280,
      sourceHeight: -1,
    }),
  );
});

test('single manual marker produces a zoompan with expected ranges and dimensions', () => {
  const result = buildZoomFilter({
    markers: [marker()],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  assert.equal(result.present, true);
  assert.match(result.filterFragment, /^zoompan=z='/);
  assert.match(result.filterFragment, /:d=1:s=1280x720:fps=30$/);
  assert.match(result.filterFragment, /lt\(on,30\)/);
  assert.match(result.filterFragment, /lt\(on,90\)/);
  assert.match(result.filterFragment, /lt\(on,39\)/);
  assert.match(result.filterFragment, /lt\(on,81\)/);
  assert.match(result.filterFragment, /1\+1\.5\*\(/);
  assert.match(result.filterFragment, /6\*pow\(\(on-30\)\/9,5\)/);
  assert.match(result.filterFragment, /1280\*max\(0,min\(0\.5-1\/\(2\*zoom\),1-1\/zoom\)\)/);
  assert.match(result.filterFragment, /720\*max\(0,min\(0\.5-1\/\(2\*zoom\),1-1\/zoom\)\)/);
});

test('marker strength scales the delta term', () => {
  const result = buildZoomFilter({
    markers: [marker({ strength: 0.5 })],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  assert.match(result.filterFragment, /1\+0\.75\*\(/);
});

test('off-center focal point appears in the x and y expressions', () => {
  const result = buildZoomFilter({
    markers: [marker({ focalPoint: { x: 0.8, y: 0.3 } })],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  assert.match(result.filterFragment, /1280\*max\(0,min\(0\.8-1\/\(2\*zoom\),1-1\/zoom\)\)/);
  assert.match(result.filterFragment, /720\*max\(0,min\(0\.3-1\/\(2\*zoom\),1-1\/zoom\)\)/);
});

test('two non-overlapping markers produce a nested chain sorted by startFrame', () => {
  const result = buildZoomFilter({
    markers: [
      marker({ id: 'second', startFrame: 120, endFrame: 180, focalPoint: { x: 0.8, y: 0.3 } }),
      marker({ id: 'first', startFrame: 30, endFrame: 90, focalPoint: { x: 0.5, y: 0.5 } }),
    ],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  const idx30 = result.filterFragment.indexOf('lt(on,30)');
  const idx120 = result.filterFragment.indexOf('lt(on,120)');
  assert.notEqual(idx30, -1);
  assert.notEqual(idx120, -1);
  assert.ok(idx30 < idx120, 'expected earlier marker to appear first in the expression');
  assert.match(result.filterFragment, /1280\*max\(0,min\(0\.8-1\/\(2\*zoom\),1-1\/zoom\)\)/);
  assert.match(result.filterFragment, /1280\*max\(0,min\(0\.5-1\/\(2\*zoom\),1-1\/zoom\)\)/);
});

test('s parameter matches source dimensions so external scale handles canvas fit', () => {
  const result = buildZoomFilter({
    markers: [marker()],
    sourceWidth: 1920,
    sourceHeight: 1080,
  });
  assert.match(result.filterFragment, /:s=1920x1080:fps=30$/);
});

test('fps is pinned in the zoompan filter so output rate matches source', () => {
  const result = buildZoomFilter({
    markers: [marker()],
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 60,
  });
  assert.match(result.filterFragment, /:fps=60$/);
});

test('non-positive fps throws', () => {
  assert.throws(() =>
    buildZoomFilter({
      markers: [marker()],
      sourceWidth: 1280,
      sourceHeight: 720,
      fps: 0,
    }),
  );
});

test('auto-kind markers render with the same expression shape as manual markers', () => {
  const manual = buildZoomFilter({
    markers: [marker({ kind: 'manual' })],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  const auto = buildZoomFilter({
    markers: [marker({ kind: 'auto' })],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  assert.equal(manual.filterFragment, auto.filterFragment);
});

test('overlapping markers: outer if-chain checks earlier marker first', () => {
  const result = buildZoomFilter({
    markers: [
      marker({ id: 'b', startFrame: 50, endFrame: 110, focalPoint: { x: 0.8, y: 0.3 } }),
      marker({ id: 'a', startFrame: 30, endFrame: 90, focalPoint: { x: 0.2, y: 0.2 } }),
    ],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  // Earlier marker (start=30) should be checked first; both should appear.
  const idx30 = result.filterFragment.indexOf('lt(on,30)');
  const idx50 = result.filterFragment.indexOf('lt(on,50)');
  assert.ok(idx30 !== -1 && idx50 !== -1);
  assert.ok(idx30 < idx50, 'earlier-start marker should be evaluated first');
});

test('marker starting at frame 0 produces a valid expression', () => {
  const result = buildZoomFilter({
    markers: [marker({ startFrame: 0, endFrame: 60 })],
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  assert.match(result.filterFragment, /lt\(on,0\)/);
  assert.match(result.filterFragment, /lt\(on,60\)/);
});
