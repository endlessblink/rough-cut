import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyScreenSourceTransform,
  canvasPointToSourceNormalized,
} from '../../shared/screen-source-transform.mjs';

/**
 * The pointer inverse is checked against the REAL forward transform, not against
 * a second copy of the algebra. If `applyScreenSourceTransform` ever changes, a
 * hand-written expectation here would keep passing while censors landed in the
 * wrong place; round-tripping through the actual matrix cannot.
 */

/** Minimal 2D context recorder implementing the transform ops the forward pass uses. */
function matrixContext() {
  // Column-major affine: [a c e ; b d f]
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const mul = (n) => {
    m = {
      a: m.a * n.a + m.c * n.b,
      b: m.b * n.a + m.d * n.b,
      c: m.a * n.c + m.c * n.d,
      d: m.b * n.c + m.d * n.d,
      e: m.a * n.e + m.c * n.f + m.e,
      f: m.b * n.e + m.d * n.f + m.f,
    };
  };
  return {
    translate: (x, y) => mul({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
    scale: (x, y) => mul({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }),
    apply: (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }),
  };
}

const cases = [
  {
    name: 'no zoom, full-frame source',
    mapping: {
      screenX: 120,
      screenY: 60,
      screenDrawScale: 0.5,
      screenSource: { x: 0, y: 0, w: 1920, h: 1080 },
      transform: { scale: 1, offsetX: 0, offsetY: 0 },
      sourceWidth: 1920,
      sourceHeight: 1080,
    },
  },
  {
    name: 'zoomed in with pan',
    mapping: {
      screenX: 88,
      screenY: 44,
      screenDrawScale: 0.62,
      screenSource: { x: 0, y: 0, w: 1920, h: 1080 },
      transform: { scale: 2.4, offsetX: -180, offsetY: 96 },
      sourceWidth: 1920,
      sourceHeight: 1080,
    },
  },
  {
    name: 'cropped source viewport plus zoom',
    mapping: {
      screenX: 40,
      screenY: 24,
      screenDrawScale: 0.83,
      screenSource: { x: 320, y: 180, w: 1280, h: 720 },
      transform: { scale: 1.7, offsetX: 44, offsetY: -30 },
      sourceWidth: 1920,
      sourceHeight: 1080,
    },
  },
];

test('canvas→source inverse round-trips through the real forward transform', () => {
  for (const { name, mapping } of cases) {
    const ctx = matrixContext();
    applyScreenSourceTransform(ctx, {
      screenX: mapping.screenX,
      screenY: mapping.screenY,
      screenDrawScale: mapping.screenDrawScale,
      screenSource: mapping.screenSource,
      transform: mapping.transform,
    });

    for (const source of [
      { x: 480, y: 270 },
      { x: 960, y: 540 },
      { x: 1700, y: 1000 },
    ]) {
      const canvasPoint = ctx.apply(source.x, source.y);
      const back = canvasPointToSourceNormalized(mapping, canvasPoint.x, canvasPoint.y);
      assert.ok(back, `${name}: expected a mapped point`);
      assert.ok(
        Math.abs(back.x * mapping.sourceWidth - source.x) < 0.01,
        `${name}: x round-trip drifted (${back.x * mapping.sourceWidth} vs ${source.x})`,
      );
      assert.ok(
        Math.abs(back.y * mapping.sourceHeight - source.y) < 0.01,
        `${name}: y round-trip drifted (${back.y * mapping.sourceHeight} vs ${source.y})`,
      );
    }
  }
});

test('canvas→source inverse refuses unusable mappings instead of guessing', () => {
  const base = cases[0].mapping;

  assert.equal(canvasPointToSourceNormalized(null, 10, 10), null);
  assert.equal(canvasPointToSourceNormalized({ ...base, screenDrawScale: 0 }, 10, 10), null);
  assert.equal(canvasPointToSourceNormalized({ ...base, sourceWidth: 0 }, 10, 10), null);
});
