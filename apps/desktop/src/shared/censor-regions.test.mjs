import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_CENSOR_FILL_COLOR,
  activeCensorRegionsAt,
  censorRectToSourceRect,
  resolveCensorBlockSize,
  resolveCensorFillColor,
  resolveCensorMosaicGrid,
  resolveCensorSoftenRadiusPx,
  resolveCensorSourceScale,
  mapCensorSourceRectToDest,
} from './censor-regions.mjs';

function region(overrides = {}) {
  return {
    id: 'censor-1',
    startFrame: 30,
    endFrame: 90,
    rect: { x: 0.25, y: 0.5, w: 0.25, h: 0.25 },
    mode: 'pixelate',
    blockSize: 24,
    soften: true,
    ...overrides,
  };
}

test('activeCensorRegionsAt includes the start frame and excludes the end frame', () => {
  const regions = [region()];
  assert.equal(activeCensorRegionsAt(regions, 29).length, 0);
  assert.equal(activeCensorRegionsAt(regions, 30).length, 1);
  assert.equal(activeCensorRegionsAt(regions, 89).length, 1);
  assert.equal(activeCensorRegionsAt(regions, 90).length, 0);
});

test('activeCensorRegionsAt never double-draws two back-to-back regions on the seam frame', () => {
  const regions = [
    region({ id: 'a', startFrame: 0, endFrame: 60 }),
    region({ id: 'b', startFrame: 60, endFrame: 120 }),
  ];
  const active = activeCensorRegionsAt(regions, 60);
  assert.deepEqual(
    active.map((entry) => entry.id),
    ['b'],
  );
});

test('activeCensorRegionsAt tolerates missing and malformed input', () => {
  assert.deepEqual(activeCensorRegionsAt(undefined, 10), []);
  assert.deepEqual(activeCensorRegionsAt(null, 10), []);
  assert.deepEqual(activeCensorRegionsAt([], 10), []);
  assert.deepEqual(activeCensorRegionsAt([region()], Number.NaN), []);
  assert.deepEqual(activeCensorRegionsAt([null, 'nope', region({ startFrame: 'x' })], 40), []);
});

test('censorRectToSourceRect converts normalized coordinates into source pixels', () => {
  const rect = censorRectToSourceRect({ x: 0.25, y: 0.5, w: 0.25, h: 0.25 }, 1920, 1080);
  assert.deepEqual(rect, { x: 480, y: 540, w: 480, h: 270 });
});

test('censorRectToSourceRect is resolution independent', () => {
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  const hd = censorRectToSourceRect(rect, 1920, 1080);
  const uhd = censorRectToSourceRect(rect, 3840, 2160);
  assert.equal(uhd.x / hd.x, 2);
  assert.equal(uhd.y / hd.y, 2);
  assert.equal(uhd.w / hd.w, 2);
  assert.equal(uhd.h / hd.h, 2);
});

test('censorRectToSourceRect clamps a region that overhangs the frame edge', () => {
  const rect = censorRectToSourceRect({ x: 0.8, y: 0.9, w: 0.5, h: 0.5 }, 1000, 1000);
  assert.deepEqual(rect, { x: 800, y: 900, w: 200, h: 100 });
});

test('censorRectToSourceRect returns null rather than a fallback rect for unusable input', () => {
  assert.equal(censorRectToSourceRect(null, 1920, 1080), null);
  assert.equal(censorRectToSourceRect({ x: 0, y: 0, w: 0, h: 0.5 }, 1920, 1080), null);
  assert.equal(censorRectToSourceRect({ x: 0, y: 0, w: -0.5, h: 0.5 }, 1920, 1080), null);
  assert.equal(censorRectToSourceRect({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 0, 0), null);
  assert.equal(censorRectToSourceRect({ x: Number.NaN, y: 0, w: 0.5, h: 0.5 }, 1920, 1080), null);
  // Entirely past the right edge — clamping leaves no area at all.
  assert.equal(censorRectToSourceRect({ x: 1, y: 0.2, w: 0.3, h: 0.3 }, 1920, 1080), null);
});

test('resolveCensorSourceScale multiplies the layout scale by the zoom scale', () => {
  assert.equal(resolveCensorSourceScale({ screenDrawScale: 0.5, transform: { scale: 2 } }), 1);
  assert.equal(resolveCensorSourceScale({ screenDrawScale: 0.5, transform: { scale: 1 } }), 0.5);
  assert.equal(resolveCensorSourceScale({ screenDrawScale: 1, transform: { scale: 3 } }), 3);
});

test('resolveCensorSourceScale falls back to 1 for missing or nonsense input', () => {
  assert.equal(resolveCensorSourceScale(), 1);
  assert.equal(resolveCensorSourceScale({}), 1);
  assert.equal(resolveCensorSourceScale({ screenDrawScale: 0, transform: null }), 1);
  assert.equal(resolveCensorSourceScale({ screenDrawScale: Number.NaN, transform: { scale: -2 } }), 1);
});

test('resolveCensorBlockSize floors at one source pixel', () => {
  assert.equal(resolveCensorBlockSize({ blockSize: 32 }), 32);
  assert.equal(resolveCensorBlockSize({ blockSize: 0 }), 1);
  assert.equal(resolveCensorBlockSize({ blockSize: -8 }), 1);
  assert.equal(resolveCensorBlockSize({}), 24);
});

test('resolveCensorMosaicGrid sizes the offscreen buffer from the block size', () => {
  const sourceRect = { x: 0, y: 0, w: 480, h: 240 };
  assert.deepEqual(resolveCensorMosaicGrid(sourceRect, { blockSize: 24 }), { cols: 20, rows: 10 });
  assert.deepEqual(resolveCensorMosaicGrid(sourceRect, { blockSize: 120 }), { cols: 4, rows: 2 });
});

test('resolveCensorMosaicGrid always keeps at least one cell per axis', () => {
  const grid = resolveCensorMosaicGrid({ x: 0, y: 0, w: 4, h: 4 }, { blockSize: 512 });
  assert.deepEqual(grid, { cols: 1, rows: 1 });
});

test('resolveCensorMosaicGrid caps the buffer so a tiny block size cannot allocate a full-res frame', () => {
  const grid = resolveCensorMosaicGrid({ x: 0, y: 0, w: 3840, h: 2160 }, { blockSize: 1 });
  assert.deepEqual(grid, { cols: 512, rows: 512 });
  // Capping must make the mosaic coarser, never finer, so the region stays at
  // least as censored as the user asked for.
  assert.ok(3840 / grid.cols >= 1);
  assert.ok(2160 / grid.rows >= 1);
});

test('resolveCensorMosaicGrid returns null when there is no rect to cover', () => {
  assert.equal(resolveCensorMosaicGrid(null, { blockSize: 24 }), null);
});

test('resolveCensorSoftenRadiusPx is zero when softening is off', () => {
  assert.equal(resolveCensorSoftenRadiusPx(region({ soften: false }), 1), 0);
  assert.equal(resolveCensorSoftenRadiusPx(undefined, 1), 0);
});

test('resolveCensorSoftenRadiusPx is zero for solid fill even when soften is on', () => {
  // Blurring a flat colour clipped to its own rect changes nothing, so the pass is
  // skipped rather than burned.
  assert.equal(resolveCensorSoftenRadiusPx(region({ mode: 'solid', soften: true }), 1), 0);
  assert.equal(resolveCensorSoftenRadiusPx(region({ mode: 'solid', soften: true }), 8), 0);
});

test('resolveCensorSoftenRadiusPx scales with zoom so softening looks consistent', () => {
  const atRest = resolveCensorSoftenRadiusPx(region({ blockSize: 20 }), 1);
  const zoomedIn = resolveCensorSoftenRadiusPx(region({ blockSize: 20 }), 2);
  assert.ok(zoomedIn > atRest);
});

test('resolveCensorSoftenRadiusPx stays bounded at extreme zoom', () => {
  const radius = resolveCensorSoftenRadiusPx(region({ blockSize: 512 }), 40);
  assert.ok(radius <= 24, `expected a bounded radius, got ${radius}`);
  assert.ok(radius > 0);
});

test('resolveCensorFillColor accepts a six-digit hex and otherwise falls back to opaque', () => {
  assert.equal(resolveCensorFillColor({ fillColor: '#ff0000' }), '#ff0000');
  assert.equal(resolveCensorFillColor({ fillColor: 'red' }), DEFAULT_CENSOR_FILL_COLOR);
  assert.equal(resolveCensorFillColor({ fillColor: '#fff' }), DEFAULT_CENSOR_FILL_COLOR);
  assert.equal(resolveCensorFillColor({}), DEFAULT_CENSOR_FILL_COLOR);
  assert.equal(resolveCensorFillColor(null), DEFAULT_CENSOR_FILL_COLOR);
});

test('mapCensorSourceRectToDest scales a censor from source pixels into the drawn rect', () => {
  // 1:1 source → half-size dest: everything halves and shifts by the dest origin.
  const mapped = mapCensorSourceRectToDest(
    { x: 200, y: 100, w: 400, h: 200 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 0, y: 0, width: 960, height: 540 },
  );
  assert.deepEqual(mapped, { x: 100, y: 50, w: 200, h: 100 });
});

test('mapCensorSourceRectToDest accounts for a zoomed-in source viewport', () => {
  // Zoomed 2x: the visible source rect is half the frame, so a censor inside it
  // must grow on screen by the same factor.
  const mapped = mapCensorSourceRectToDest(
    { x: 960, y: 540, w: 96, h: 54 },
    { x: 480, y: 270, width: 960, height: 540 },
    { x: 0, y: 0, width: 1920, height: 1080 },
  );
  assert.deepEqual(mapped, { x: 960, y: 540, w: 192, h: 108 });
});

test('mapCensorSourceRectToDest offsets by the destination origin', () => {
  const mapped = mapCensorSourceRectToDest(
    { x: 0, y: 0, w: 192, h: 108 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 130, y: 70, width: 1920, height: 1080 },
  );
  assert.deepEqual(mapped, { x: 130, y: 70, w: 192, h: 108 });
});

test('mapCensorSourceRectToDest clips a censor that hangs off the visible source', () => {
  // Half in view: only the visible half is painted, and it lands at the dest edge
  // rather than being squeezed to fit.
  const mapped = mapCensorSourceRectToDest(
    { x: 1820, y: 100, w: 200, h: 100 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 0, y: 0, width: 1920, height: 1080 },
  );
  assert.deepEqual(mapped, { x: 1820, y: 100, w: 100, h: 100 });
});

test('mapCensorSourceRectToDest returns null when the censor is zoomed out of view', () => {
  const mapped = mapCensorSourceRectToDest(
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 960, y: 540, width: 480, height: 270 },
    { x: 0, y: 0, width: 1920, height: 1080 },
  );
  assert.equal(mapped, null);
});

test('mapCensorSourceRectToDest refuses degenerate rects instead of dividing by zero', () => {
  const source = { x: 0, y: 0, width: 1920, height: 1080 };
  const dest = { x: 0, y: 0, width: 960, height: 540 };
  const censor = { x: 10, y: 10, w: 10, h: 10 };
  assert.equal(mapCensorSourceRectToDest(null, source, dest), null);
  assert.equal(mapCensorSourceRectToDest(censor, null, dest), null);
  assert.equal(mapCensorSourceRectToDest(censor, source, null), null);
  assert.equal(mapCensorSourceRectToDest(censor, { ...source, width: 0 }, dest), null);
  assert.equal(mapCensorSourceRectToDest(censor, source, { ...dest, height: 0 }), null);
});
