import { describe, it, expect } from 'vitest';
import {
  smootherStep,
  strengthToScale,
  getZoomTransformForMarker,
  getZoomTransformAtFrame,
} from './zoom-transform.js';
import { createZoomMarker } from '@rough-cut/project-model';

function focalFromTransform(transform: { scale: number; translateX: number; translateY: number }) {
  // Mode A: translate = (focal - 0.5) * (1 - scale) → focal = translate/(1 - scale) + 0.5
  // At scale = 1 the formula is undefined (translate = 0); fall back to 0.5.
  const denom = 1 - transform.scale;
  if (Math.abs(denom) < 1e-9) return { x: 0.5, y: 0.5 };
  return {
    x: transform.translateX / denom + 0.5,
    y: transform.translateY / denom + 0.5,
  };
}

function cursorInsideVisibleWindow(transform: { scale: number; translateX: number; translateY: number }, cursor: { x: number; y: number }) {
  // Mode A geometry: a source pixel `p` renders at screen position
  //   screen_p = (p - 0.5) * scale + 0.5 + translate
  // The visible window is the source range that maps to screen [0, 1].
  // Solving for screen_p in [0, 1]:
  //   p_min = 0.5 - 0.5/scale - translate/scale
  //   p_max = 0.5 + 0.5/scale - translate/scale
  const { scale, translateX, translateY } = transform;
  const xMin = 0.5 - 0.5 / scale - translateX / scale;
  const xMax = 0.5 + 0.5 / scale - translateX / scale;
  const yMin = 0.5 - 0.5 / scale - translateY / scale;
  const yMax = 0.5 + 0.5 / scale - translateY / scale;
  return cursor.x >= xMin && cursor.x <= xMax && cursor.y >= yMin && cursor.y <= yMax;
}

describe('smootherStep', () => {
  it('returns 0 at t=0', () => {
    expect(smootherStep(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(smootherStep(1)).toBe(1);
  });

  it('returns 0.5 at t=0.5', () => {
    expect(smootherStep(0.5)).toBe(0.5);
  });

  it('clamps below 0', () => {
    expect(smootherStep(-0.5)).toBe(0);
  });

  it('clamps above 1', () => {
    expect(smootherStep(1.5)).toBe(1);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const val = smootherStep(t);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });
});

describe('strengthToScale', () => {
  it('maps 0 to 1.0', () => {
    expect(strengthToScale(0)).toBe(1);
  });

  it('maps 1 to 2.5', () => {
    expect(strengthToScale(1)).toBe(2.5);
  });

  it('maps 0.5 to 1.75', () => {
    expect(strengthToScale(0.5)).toBe(1.75);
  });
});

describe('getZoomTransformForMarker', () => {
  it('returns null for frame before marker', () => {
    const marker = createZoomMarker(10, 50, { strength: 0.5 });
    expect(getZoomTransformForMarker(5, marker)).toBeNull();
  });

  it('returns null for frame at endFrame', () => {
    const marker = createZoomMarker(10, 50, { strength: 0.5 });
    expect(getZoomTransformForMarker(50, marker)).toBeNull();
  });

  it('returns identity-ish scale at the very start of ramp-up', () => {
    const marker = createZoomMarker(10, 50, {
      strength: 1,
      zoomInDuration: 10,
      zoomOutDuration: 10,
    });
    const t = getZoomTransformForMarker(10, marker);
    expect(t).not.toBeNull();
    expect(t!.scale).toBeCloseTo(1, 1); // near identity at frame 0 of ramp
  });

  it('reaches target scale during hold phase', () => {
    const marker = createZoomMarker(10, 50, {
      strength: 1,
      zoomInDuration: 5,
      zoomOutDuration: 5,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    // Hold phase: frames 15–45
    const t = getZoomTransformForMarker(30, marker);
    expect(t).not.toBeNull();
    expect(t!.scale).toBeCloseTo(2.5, 2); // strengthToScale(1) = 2.5
  });

  it('ramps down toward 1 at end of marker', () => {
    const marker = createZoomMarker(10, 50, {
      strength: 1,
      zoomInDuration: 5,
      zoomOutDuration: 5,
    });
    // Last frame of ramp-down (frame 49)
    const t = getZoomTransformForMarker(49, marker);
    expect(t).not.toBeNull();
    expect(t!.scale).toBeLessThan(2.5);
    expect(t!.scale).toBeGreaterThanOrEqual(1);
  });

  it('centers translate at focal point (0.5, 0.5)', () => {
    const marker = createZoomMarker(0, 30, {
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(15, marker);
    expect(t).not.toBeNull();
    expect(t!.translateX).toBeCloseTo(0, 5);
    expect(t!.translateY).toBeCloseTo(0, 5);
  });

  it('offsets translate for off-center focal point', () => {
    const marker = createZoomMarker(0, 30, {
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.8, y: 0.2 },
    });
    const t = getZoomTransformForMarker(15, marker);
    expect(t).not.toBeNull();
    // Focal point is right-of-center, so translate should be negative (move content left)
    expect(t!.translateX).toBeLessThan(0);
    // Focal point is above center, so translate should be positive (move content down)
    expect(t!.translateY).toBeGreaterThan(0);
  });

  it('follows the cursor for auto markers when enabled', () => {
    const marker = createZoomMarker(0, 30, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(15, marker, {
      followCursor: true,
      followAnimation: 'focused',
      followPadding: 0,
      getCursorPosition: () => ({ x: 0.8, y: 0.5 }),
    });

    expect(t).not.toBeNull();
    expect(t!.translateX).toBeLessThan(0);
  });

  it('pins to static focalPoint when marker.followCursor is false, ignoring the cursor', () => {
    const marker = createZoomMarker(0, 30, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.2, y: 0.7 },
      followCursor: false,
    });
    const t = getZoomTransformForMarker(15, marker, {
      followCursor: true,
      followAnimation: 'focused',
      followPadding: 0,
      getCursorPosition: () => ({ x: 0.8, y: 0.5 }),
    });

    expect(t).not.toBeNull();
    const focal = focalFromTransform(t!);
    // Reframed (pinned) marker stays on its static focal, not the cursor.
    expect(focal.x).toBeCloseTo(0.2, 5);
    expect(focal.y).toBeCloseTo(0.7, 5);
  });

  it('Mode A: near-edge cursor stays at its source position (no edge-snap clamp)', () => {
    const marker = createZoomMarker(0, 30, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(15, marker, {
      followCursor: true,
      followAnimation: 'focused',
      followPadding: 0.25,
      getCursorPosition: () => ({ x: 0.98, y: 0.5 }),
    });

    expect(t).not.toBeNull();
    const focal = focalFromTransform(t!);
    // Mode A: focal tracks the actual cursor; no [0.2, 0.8] viewport-edge clamp.
    expect(focal.x).toBeCloseTo(0.98, 1);
    expect(focal.y).toBeCloseTo(0.5, 2);
  });

  it('keeps the cursor inside the visible window throughout zoom-out (no cropping)', () => {
    // Regression: the old code eased focal toward 0.5 during ramp-out, which
    // pulled the camera away from a near-edge cursor while scale was still
    // high — cropping the cursor out of frame. The frozen-focal approach lets
    // the source-bound clamp slide focal toward center as scale → 1 instead,
    // keeping the cursor inside the widening window.
    const marker = createZoomMarker(0, 60, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 15,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursorAtFrame = (frame: number) => (frame < 45 ? { x: 0.8, y: 0.5 } : { x: 0.8, y: 0.5 });
    const options = {
      followCursor: true,
      followAnimation: 'focused' as const,
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: cursorAtFrame,
    };

    for (const frame of [45, 48, 52, 56, 59]) {
      const t = getZoomTransformForMarker(frame, marker, options);
      expect(t, `frame ${frame}`).not.toBeNull();
      expect(cursorInsideVisibleWindow(t!, cursorAtFrame(frame)), `frame ${frame}`).toBe(true);
    }

    // Marker reaches scale 1 at endFrame, focal naturally pinned to 0.5 by clamp
    const last = getZoomTransformForMarker(59, marker, options);
    expect(last!.scale).toBeLessThan(1.1);
  });

  it('follows the cursor during zoom-in (unified system, all phases track cursor)', () => {
    // Replaces the old "uses marker focal during zoom-in" assertion. The unified
    // safe-zone camera now runs through every phase — manual + auto markers
    // alike behave the same way.
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 20,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(15, marker, {
      followCursor: true,
      followAnimation: 'smooth',
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: () => ({ x: 0.8, y: 0.5 }),
    });

    expect(t).not.toBeNull();
    // Cursor is off-center right; camera should have shifted right too
    expect(focalFromTransform(t!).x).toBeGreaterThan(0.5);
  });

  it('keeps cursor visible when cursor-follow zoom enters hold after ramp-in', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 0.5,
      zoomInDuration: 24,
      zoomOutDuration: 30,
      focalPoint: { x: 0.2, y: 0.2 },
    });
    const options = {
      followCursor: true,
      followAnimation: 'smooth' as const,
      followPadding: 0.22,
      fps: 30,
      getCursorPosition: (frame: number) => (frame < 24 ? { x: 0.8, y: 0.7 } : { x: 0.78, y: 0.68 }),
    };

    const rampEnd = getZoomTransformForMarker(23, marker, options);
    const holdStart = getZoomTransformForMarker(24, marker, options);

    expect(rampEnd).not.toBeNull();
    expect(holdStart).not.toBeNull();
    expect(cursorInsideVisibleWindow(holdStart!, options.getCursorPosition(24))).toBe(true);
  });


  it('ignores tiny cursor target wobble during hold', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const focals = [35, 36, 37, 38].map((frame) => {
      const t = getZoomTransformForMarker(frame, marker, {
        followCursor: true,
        followAnimation: 'smooth',
        followPadding: 0.22,
        fps: 30,
        getCursorPosition: (sampleFrame: number) => ({ x: sampleFrame % 2 === 0 ? 0.5 : 0.506, y: 0.5 }),
      });
      expect(t).not.toBeNull();
      return focalFromTransform(t!).x;
    });

    expect(Math.max(...focals) - Math.min(...focals)).toBeLessThan(0.004);
  });

  it('keeps a fast cursor movement inside the visible zoom window during hold', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursorAtFrame = (frame: number) => ({ x: frame < 20 ? 0.2 : 0.9, y: 0.5 });
    const frame = 28;
    const t = getZoomTransformForMarker(frame, marker, {
      followCursor: true,
      followAnimation: 'focused',
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: cursorAtFrame,
    });

    expect(t).not.toBeNull();
    const focal = focalFromTransform(t!);
    const halfVisibleWidth = 1 / (2 * t!.scale);
    const cursor = cursorAtFrame(frame);
    expect(cursor.x).toBeGreaterThanOrEqual(focal.x - halfVisibleWidth);
    expect(cursor.x).toBeLessThanOrEqual(focal.x + halfVisibleWidth);
  });

  it('Mode A: returns a transform for an extreme-edge cursor (no NaN, no crash)', () => {
    // Old test asserted hard-clamp visibility on a fast cursor jump; Mode A
    // doesn't guarantee instant cursor visibility on a sudden flick (spring
    // takes a few frames to settle). Instead, assert the transform is finite
    // and the marker still produces a valid output for near-edge cursor.
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 10,
      zoomOutDuration: 20,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const transform = getZoomTransformForMarker(50, marker, {
      followCursor: true,
      followAnimation: 'focused',
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: () => ({ x: 0.95, y: 0.08 }),
    });
    expect(transform).not.toBeNull();
    expect(Number.isFinite(transform!.scale)).toBe(true);
    expect(Number.isFinite(transform!.translateX)).toBe(true);
    expect(Number.isFinite(transform!.translateY)).toBe(true);
  });


  it('Mode A: STATIC cursor fixtures keep cursor inside the visible window', () => {
    // Mode A's invariant is "cursor stays at its source position" — only
    // holds when the spring has settled (static cursor) or the cursor moves
    // slowly enough for the spring to keep up. Fast jumps will briefly put
    // the cursor outside the visible window until the spring catches up.
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const fixtures = [
      { name: 'center', cursor: { x: 0.5, y: 0.5 } },
      { name: 'right half', cursor: { x: 0.7, y: 0.5 } },
      { name: 'diagonal', cursor: { x: 0.7, y: 0.3 } },
      { name: 'near edge', cursor: { x: 0.96, y: 0.08 } },
    ];

    for (const fixture of fixtures) {
      for (const frame of [16, 30, 44]) {
        const transform = getZoomTransformForMarker(frame, marker, {
          followCursor: true,
          followAnimation: 'focused',
          followPadding: 0.25,
          fps: 30,
          getCursorPosition: () => fixture.cursor,
        });
        expect(transform, fixture.name).not.toBeNull();
        expect(cursorInsideVisibleWindow(transform!, fixture.cursor), `${fixture.name} f=${frame}`).toBe(true);
      }
    }
  });

  it('cursorSmoothing overrides followAnimation preset and changes follow latency', () => {
    // With cursorSmoothing=0 the camera should chase the cursor much faster
    // than with cursorSmoothing=2. Compare the focal-x distance from the target
    // after 12 hold frames following a fast cursor move.
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursorAtFrame = (frame: number) => ({ x: frame < 2 ? 0.5 : 0.85, y: 0.5 });
    const base = {
      followCursor: true,
      followAnimation: 'smooth' as const,
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: cursorAtFrame,
    };

    const snappy = getZoomTransformForMarker(14, marker, { ...base, cursorSmoothing: 0 });
    const floaty = getZoomTransformForMarker(14, marker, { ...base, cursorSmoothing: 2 });

    expect(snappy).not.toBeNull();
    expect(floaty).not.toBeNull();
    const snappyDist = Math.abs(focalFromTransform(snappy!).x - 0.85);
    const floatyDist = Math.abs(focalFromTransform(floaty!).x - 0.85);
    // Snappy (smoothing=0) must be closer to the target than floaty (smoothing=2)
    expect(snappyDist).toBeLessThan(floatyDist);
  });

  it('keeps off-screen cursor-follow focal points finite and source bounded', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const transform = getZoomTransformForMarker(40, marker, {
      followCursor: true,
      followAnimation: 'focused',
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: () => ({ x: 1.25, y: -0.2 }),
    });

    expect(transform).not.toBeNull();
    const focal = focalFromTransform(transform!);
    expect(Number.isFinite(focal.x)).toBe(true);
    expect(Number.isFinite(focal.y)).toBe(true);
    // Mode A clamps to source bounds [0, 1] only (the engine's safe-zone math
    // never moves focal outside source). No tight [0.2, 0.8] viewport-edge clamp.
    expect(focal.x).toBeGreaterThanOrEqual(0);
    expect(focal.x).toBeLessThanOrEqual(1);
    expect(focal.y).toBeGreaterThanOrEqual(0);
    expect(focal.y).toBeLessThanOrEqual(1);
  });
});

describe('getZoomTransformAtFrame', () => {
  it('returns identity with no markers', () => {
    const t = getZoomTransformAtFrame(0, []);
    expect(t.scale).toBe(1);
    expect(t.translateX).toBe(0);
    expect(t.translateY).toBe(0);
  });

  it('returns identity for frame outside any marker', () => {
    const marker = createZoomMarker(10, 20, { strength: 0.5 });
    expect(getZoomTransformAtFrame(5, [marker]).scale).toBe(1);
    expect(getZoomTransformAtFrame(25, [marker]).scale).toBe(1);
  });

  it('selects the correct marker when multiple exist', () => {
    const m1 = createZoomMarker(0, 30, {
      strength: 0.5,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    });
    const m2 = createZoomMarker(60, 90, {
      strength: 1.0,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    });
    const t1 = getZoomTransformAtFrame(15, [m1, m2]);
    expect(t1.scale).toBeCloseTo(1.75, 2); // strengthToScale(0.5)

    const t2 = getZoomTransformAtFrame(75, [m1, m2]);
    expect(t2.scale).toBeCloseTo(2.5, 2); // strengthToScale(1.0)
  });

  it('handles connected zoom (pan between adjacent markers)', () => {
    const m1 = createZoomMarker(0, 30, {
      strength: 0.5,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.2, y: 0.5 },
    });
    const m2 = createZoomMarker(32, 60, {
      strength: 0.5,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.8, y: 0.5 },
    });
    // Frame 31 is in the 2-frame gap between m1 (ends 30) and m2 (starts 32)
    // Gap <= CONNECTED_GAP_FRAMES (3), so should pan between focal points
    const t = getZoomTransformAtFrame(31, [m1, m2]);
    expect(t.scale).toBeCloseTo(1.75, 2); // max of both scales
    // Translate should be between m1 and m2 focal points
    expect(t.translateX).not.toBe(0);
  });

  it('returns identity for gap > CONNECTED_GAP_FRAMES', () => {
    const m1 = createZoomMarker(0, 30, { strength: 0.5 });
    const m2 = createZoomMarker(40, 60, { strength: 0.5 });
    // Frame 35 is 10 frames after m1 and 5 before m2 — not connected
    const t = getZoomTransformAtFrame(35, [m1, m2]);
    expect(t.scale).toBe(1);
  });

  it('works with unsorted markers', () => {
    const m1 = createZoomMarker(60, 90, {
      strength: 1.0,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    });
    const m2 = createZoomMarker(0, 30, {
      strength: 0.5,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    });
    // Pass m1 first even though m2 starts earlier — should still work
    const t = getZoomTransformAtFrame(15, [m1, m2]);
    expect(t.scale).toBeCloseTo(1.75, 2);
  });

  it('uses the longest active marker when zoom markers overlap', () => {
    const shorter = createZoomMarker(20, 80, {
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.8, y: 0.5 },
    });
    const longer = createZoomMarker(0, 120, {
      strength: 0.5,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.2, y: 0.5 },
    });

    const t = getZoomTransformAtFrame(40, [shorter, longer]);

    expect(t.scale).toBeCloseTo(1.75, 2);
    expect(t.translateX).toBeGreaterThan(0);
  });

  it('tie-breaks overlapping markers by earlier start frame', () => {
    const later = createZoomMarker(20, 80, {
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.8, y: 0.5 },
    });
    const earlier = createZoomMarker(10, 70, {
      strength: 0.5,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.2, y: 0.5 },
    });

    const t = getZoomTransformAtFrame(40, [later, earlier]);

    expect(t.scale).toBeCloseTo(1.75, 2);
    expect(t.translateX).toBeGreaterThan(0);
  });
});
