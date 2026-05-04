import { describe, it, expect } from 'vitest';
import {
  smootherStep,
  strengthToScale,
  getZoomTransformForMarker,
  getZoomTransformAtFrame,
} from './zoom-transform.js';
import { createZoomMarker } from '@rough-cut/project-model';

function focalFromTransform(transform: { scale: number; translateX: number; translateY: number }) {
  return {
    x: 0.5 - transform.translateX / transform.scale,
    y: 0.5 - transform.translateY / transform.scale,
  };
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

  it('maps near-edge cursor positions to the valid viewport edge', () => {
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
    expect(focal.x).toBeCloseTo(0.8, 2);
    expect(focal.y).toBeCloseTo(0.5, 2);
  });

  it('freezes focal point during zoom-out instead of chasing a late cursor move', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 15,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const options = {
      followCursor: true,
      followAnimation: 'focused' as const,
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: (frame: number) => (frame < 45 ? { x: 0.8, y: 0.5 } : { x: 0.2, y: 0.5 }),
    };

    const holdEnd = getZoomTransformForMarker(44, marker, options);
    const zoomOut = getZoomTransformForMarker(45, marker, options);

    expect(holdEnd).not.toBeNull();
    expect(zoomOut).not.toBeNull();
    expect(focalFromTransform(zoomOut!).x).toBeCloseTo(focalFromTransform(holdEnd!).x, 1);
  });

  it('does not chase live cursor movement during zoom-in', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 20,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(10, marker, {
      followCursor: true,
      followAnimation: 'smooth',
      followPadding: 0.25,
      fps: 30,
      getCursorPosition: (frame: number) => (frame === 0 ? { x: 0.2, y: 0.5 } : { x: 0.8, y: 0.5 }),
    });

    expect(t).not.toBeNull();
    expect(focalFromTransform(t!).x).toBeLessThan(0.5);
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
});
