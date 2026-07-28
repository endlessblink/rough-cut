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
  resolveCensorSoftness,
  resolveCensorBlurSpacing,
  moveCensorRect,
  resizeCensorRect,
  resolveCensorRectAtFrame,
  censorKeyframeSegments,
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

test('resolveCensorSoftness defaults when absent and honours legacy soften:false', () => {
  assert.equal(resolveCensorSoftness({ soften: true }), 0.5);
  assert.equal(resolveCensorSoftness({ soften: true, softness: 0.8 }), 0.8);
  // A project saved with softening explicitly off keeps crisp blocks even though
  // softness now has a default.
  assert.equal(resolveCensorSoftness({ soften: false }), 0);
  assert.equal(resolveCensorSoftness({ soften: false, softness: 1 }), 0);
  assert.equal(resolveCensorSoftness(null), 0);
  assert.equal(resolveCensorSoftness({ soften: true, softness: 5 }), 1);
});

test('resolveCensorBlurSpacing returns 0 at softness 0 so the export skips the pass', () => {
  // Emitting a zero-spacing average would cost a whole extra geq pass (39 -> 99
  // ms/frame at 1080p) to produce an identical image.
  assert.equal(resolveCensorBlurSpacing({ soften: false, blockSize: 48 }), 0);
  assert.equal(resolveCensorBlurSpacing({ soften: true, softness: 0, blockSize: 48 }), 0);
  assert.ok(resolveCensorBlurSpacing({ soften: true, softness: 1, blockSize: 48 }) > 0);
});

test('blur spacing stays under a quarter block so blocks remain visible as blocks', () => {
  // That is the difference between "blur over the pixelation" and smoothing the
  // pixelation away entirely.
  for (const block of [16, 24, 48, 96]) {
    const spacing = resolveCensorBlurSpacing({ soften: true, softness: 1, blockSize: block });
    assert.ok(spacing <= Math.ceil(block / 4), `block ${block}: spacing ${spacing} too wide`);
    assert.ok(spacing >= 1);
  }
});

test('preview soften radius scales with softness and is 0 for solid', () => {
  const region = { mode: 'pixelate', blockSize: 48, soften: true };
  const low = resolveCensorSoftenRadiusPx({ ...region, softness: 0.25 }, 1);
  const high = resolveCensorSoftenRadiusPx({ ...region, softness: 1 }, 1);
  assert.ok(high > low);
  assert.equal(resolveCensorSoftenRadiusPx({ ...region, softness: 0 }, 1), 0);
  assert.equal(resolveCensorSoftenRadiusPx({ mode: 'solid', blockSize: 48, soften: true, softness: 1 }, 1), 0);
});

test('moveCensorRect keeps its size and stays inside the frame', () => {
  // Clamping the position rather than squashing the box matters: shrinking on a corner
  // drag would silently uncover content.
  const rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
  assert.deepEqual(moveCensorRect(rect, 0.1, -0.1), { x: 0.5, y: 0.30000000000000004, w: 0.2, h: 0.2 });
  const pinned = moveCensorRect(rect, 5, 5);
  assert.deepEqual(pinned, { x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
  const pinnedStart = moveCensorRect(rect, -5, -5);
  assert.deepEqual(pinnedStart, { x: 0, y: 0, w: 0.2, h: 0.2 });
  assert.equal(moveCensorRect({ x: 0, y: 0, w: 0, h: 0.2 }, 0.1, 0), null);
});

test('resizeCensorRect moves only the grabbed edges', () => {
  const rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
  const east = resizeCensorRect(rect, 'e', 0.8, 0.9);
  assert.equal(east.x, 0.4);
  assert.equal(east.y, 0.4);
  assert.ok(Math.abs(east.w - 0.4) < 1e-9);
  assert.ok(Math.abs(east.h - 0.2) < 1e-9);

  const northWest = resizeCensorRect(rect, 'nw', 0.1, 0.2);
  assert.ok(Math.abs(northWest.x - 0.1) < 1e-9);
  assert.ok(Math.abs(northWest.y - 0.2) < 1e-9);
  assert.ok(Math.abs(northWest.x + northWest.w - 0.6) < 1e-9);
});

test('resizeCensorRect cannot invert or collapse the censor', () => {
  const rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
  // Drag the west edge far past the east edge.
  const crossed = resizeCensorRect(rect, 'w', 0.95, 0.5);
  assert.ok(crossed.w >= 0.02, `expected a minimum width, got ${crossed.w}`);
  assert.ok(crossed.x < rect.x + rect.w);
  const crossedNorth = resizeCensorRect(rect, 'n', 0.5, 0.95);
  assert.ok(crossedNorth.h >= 0.02);
});

// --- keyframed censors (a censor that follows moving content) ---

function assertRectClose(actual, expected, message) {
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 1e-9,
      `${message ?? 'rect'}: expected ${key}=${expected[key]}, got ${actual[key]}`,
    );
  }
}

test('resolveCensorRectAtFrame returns the static rect when a region has no keyframes', () => {
  const staticRegion = region();
  assertRectClose(resolveCensorRectAtFrame(staticRegion, 45), staticRegion.rect);
  assertRectClose(resolveCensorRectAtFrame(staticRegion, 0), staticRegion.rect);
  assertRectClose(resolveCensorRectAtFrame({ ...staticRegion, keyframes: [] }, 45), staticRegion.rect);
});

test('resolveCensorRectAtFrame interpolates linearly between two keyframes', () => {
  const moving = region({
    keyframes: [
      { frame: 30, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } },
      { frame: 90, rect: { x: 0.4, y: 0.8, w: 0.4, h: 0.1 } },
    ],
  });
  assertRectClose(resolveCensorRectAtFrame(moving, 30), { x: 0, y: 0, w: 0.2, h: 0.2 }, 'start');
  assertRectClose(resolveCensorRectAtFrame(moving, 60), { x: 0.2, y: 0.4, w: 0.3, h: 0.15 }, 'midpoint');
  assertRectClose(resolveCensorRectAtFrame(moving, 45), { x: 0.1, y: 0.2, w: 0.25, h: 0.175 }, 'quarter');
});

test('resolveCensorRectAtFrame holds the first and last keyframe outside their range', () => {
  const moving = region({
    keyframes: [
      { frame: 40, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
      { frame: 80, rect: { x: 0.5, y: 0.1, w: 0.2, h: 0.2 } },
    ],
  });
  assertRectClose(resolveCensorRectAtFrame(moving, 0), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 'before');
  assertRectClose(resolveCensorRectAtFrame(moving, 999), { x: 0.5, y: 0.1, w: 0.2, h: 0.2 }, 'after');
});

test('resolveCensorRectAtFrame pins the rect when there is a single keyframe', () => {
  const pinned = region({ keyframes: [{ frame: 55, rect: { x: 0.3, y: 0.3, w: 0.1, h: 0.1 } }] });
  assertRectClose(resolveCensorRectAtFrame(pinned, 30), { x: 0.3, y: 0.3, w: 0.1, h: 0.1 });
  assertRectClose(resolveCensorRectAtFrame(pinned, 89), { x: 0.3, y: 0.3, w: 0.1, h: 0.1 });
});

test('resolveCensorRectAtFrame tolerates keyframes stored out of order', () => {
  const shuffled = region({
    keyframes: [
      { frame: 90, rect: { x: 0.4, y: 0, w: 0.2, h: 0.2 } },
      { frame: 30, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } },
    ],
  });
  assertRectClose(resolveCensorRectAtFrame(shuffled, 60), { x: 0.2, y: 0, w: 0.2, h: 0.2 });
});

test('resolveCensorRectAtFrame falls back to the static rect when every keyframe is malformed', () => {
  const broken = region({
    keyframes: [
      { frame: Number.NaN, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } },
      { frame: 50, rect: { x: 0, y: 0, w: 0, h: 0.2 } },
      { frame: 60 },
      null,
    ],
  });
  assertRectClose(resolveCensorRectAtFrame(broken, 45), broken.rect);
});

test('resolveCensorRectAtFrame drops only the malformed keyframes when some are valid', () => {
  const partly = region({
    keyframes: [
      { frame: 30, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } },
      { frame: 60, rect: { x: 0, y: 0, w: -1, h: 0.2 } },
      { frame: 90, rect: { x: 0.6, y: 0, w: 0.2, h: 0.2 } },
    ],
  });
  // The bad middle keyframe is ignored, so 60 sits halfway between 30 and 90.
  assertRectClose(resolveCensorRectAtFrame(partly, 60), { x: 0.3, y: 0, w: 0.2, h: 0.2 });
});

test('censorKeyframeSegments covers a static region with one flat segment', () => {
  const staticRegion = region();
  const segments = censorKeyframeSegments(staticRegion);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].startFrame, 30);
  assert.equal(segments[0].endFrame, 90);
  assertRectClose(segments[0].fromRect, staticRegion.rect, 'from');
  assertRectClose(segments[0].toRect, staticRegion.rect, 'to');
});

test('censorKeyframeSegments splits at every keyframe inside the region and covers it exactly', () => {
  const moving = region({
    startFrame: 30,
    endFrame: 90,
    keyframes: [
      { frame: 10, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } },
      { frame: 50, rect: { x: 0.2, y: 0, w: 0.2, h: 0.2 } },
      { frame: 70, rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } },
      { frame: 200, rect: { x: 0.7, y: 0.5, w: 0.2, h: 0.2 } },
    ],
  });
  const segments = censorKeyframeSegments(moving);
  assert.deepEqual(
    segments.map((segment) => [segment.startFrame, segment.endFrame]),
    [[30, 50], [50, 70], [70, 90]],
  );
});

test('censorKeyframeSegments interpolation matches resolveCensorRectAtFrame on every frame', () => {
  const moving = region({
    startFrame: 12,
    endFrame: 97,
    keyframes: [
      { frame: 5, rect: { x: 0.05, y: 0.9, w: 0.2, h: 0.05 } },
      { frame: 40, rect: { x: 0.3, y: 0.2, w: 0.31, h: 0.22 } },
      { frame: 41, rect: { x: 0.31, y: 0.19, w: 0.31, h: 0.22 } },
      { frame: 88, rect: { x: 0.7, y: 0.05, w: 0.1, h: 0.6 } },
      { frame: 300, rect: { x: 0.9, y: 0.05, w: 0.1, h: 0.6 } },
    ],
  });
  const segments = censorKeyframeSegments(moving);
  for (let frame = moving.startFrame; frame < moving.endFrame; frame += 1) {
    const segment = segments.find((entry) => frame >= entry.startFrame && frame < entry.endFrame);
    assert.ok(segment, `no segment covers frame ${frame}`);
    const span = segment.endFrame - segment.startFrame;
    const t = span > 0 ? (frame - segment.startFrame) / span : 0;
    const lerped = {
      x: segment.fromRect.x + (segment.toRect.x - segment.fromRect.x) * t,
      y: segment.fromRect.y + (segment.toRect.y - segment.fromRect.y) * t,
      w: segment.fromRect.w + (segment.toRect.w - segment.fromRect.w) * t,
      h: segment.fromRect.h + (segment.toRect.h - segment.fromRect.h) * t,
    };
    assertRectClose(lerped, resolveCensorRectAtFrame(moving, frame), `frame ${frame}`);
  }
});
