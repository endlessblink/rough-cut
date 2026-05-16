import { describe, it, expect } from 'vitest';
import { getZoomTransformForMarker, strengthToScale } from './zoom-transform.js';
import { createZoomMarker } from '@rough-cut/project-model';

/**
 * Mode A (zoom-around-cursor) regression suite.
 *
 * Locks in the contract: focal stays at its source-relative SCREEN POSITION
 * throughout the zoom. Content magnifies around the focal point.
 *
 * Transform formula:
 *   screen_p = (source_p - 0.5) * scale + 0.5 + (focal - 0.5) * (1 - scale)
 *
 * When focal === source_p (i.e. focal is the cursor itself), screen_p reduces
 * to source_p — the focal point renders at its source-relative position,
 * regardless of zoom.
 */

const baseOptions = {
  followCursor: true,
  followAnimation: 'smooth' as const,
  followPadding: 0.25,
  fps: 30,
};

function screenPosition(
  sourcePoint: number,
  focal: number,
  scale: number,
): number {
  return (sourcePoint - 0.5) * scale + 0.5 + (focal - 0.5) * (1 - scale);
}

function focalFromTransform(t: { scale: number; translateX: number; translateY: number }) {
  const denom = 1 - t.scale;
  if (Math.abs(denom) < 1e-9) return { x: 0.5, y: 0.5 };
  return { x: t.translateX / denom + 0.5, y: t.translateY / denom + 0.5 };
}

function visibleSourceRange(
  translate: number,
  scale: number,
): { min: number; max: number } {
  // screen = 0: source_p = 0.5 - 0.5/scale - translate/scale
  // screen = 1: source_p = 0.5 + 0.5/scale - translate/scale
  return {
    min: 0.5 - 0.5 / scale - translate / scale,
    max: 0.5 + 0.5 / scale - translate / scale,
  };
}

describe('Mode A — pure transform math', () => {
  it('scale=1 produces identity (zero translate) for any focal', () => {
    for (const focal of [0, 0.25, 0.5, 0.75, 1.0, 0.85, 0.15]) {
      const marker = createZoomMarker(0, 1, { strength: 0 }); // strength 0 → scale 1
      const t = getZoomTransformForMarker(0, marker, {
        ...baseOptions,
        getCursorPosition: () => ({ x: focal, y: focal }),
      });
      expect(t!.scale).toBe(1);
      expect(Math.abs(t!.translateX)).toBe(0);
      expect(Math.abs(t!.translateY)).toBe(0);
    }
  });

  it('focal == cursor → cursor renders at its source-relative position', () => {
    const cursors = [
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.9 },
      { x: 0.95, y: 0.05 },
      { x: 0.0, y: 1.0 },
    ];
    for (const cursor of cursors) {
      const marker = createZoomMarker(0, 60, {
        kind: 'manual',
        strength: 1,
        zoomInDuration: 0,
        zoomOutDuration: 0,
        focalPoint: { x: 0.5, y: 0.5 },
      });
      // Sample at hold — spring has settled on cursor
      const t = getZoomTransformForMarker(20, marker, {
        ...baseOptions,
        getCursorPosition: () => cursor,
      });
      expect(t).not.toBeNull();
      const focal = focalFromTransform(t!);
      // Cursor screen position should equal cursor source position
      const screenX = screenPosition(cursor.x, focal.x, t!.scale);
      const screenY = screenPosition(cursor.y, focal.y, t!.scale);
      expect(screenX, `cursor ${JSON.stringify(cursor)} screen_x`).toBeCloseTo(cursor.x, 2);
      expect(screenY, `cursor ${JSON.stringify(cursor)} screen_y`).toBeCloseTo(cursor.y, 2);
    }
  });
});

describe('Mode A — screen-position stability across all ramp configurations', () => {
  const configs = [
    { name: 'no ramps', zoomInDuration: 0, zoomOutDuration: 0, endFrame: 60 },
    { name: 'short ramp-in', zoomInDuration: 6, zoomOutDuration: 0, endFrame: 60 },
    { name: 'long ramp-in', zoomInDuration: 30, zoomOutDuration: 0, endFrame: 90 },
    { name: 'symmetric ramps', zoomInDuration: 18, zoomOutDuration: 18, endFrame: 90 },
    { name: 'ramp-out only', zoomInDuration: 0, zoomOutDuration: 18, endFrame: 60 },
  ];
  const cursors = [
    { name: 'center', cursor: { x: 0.5, y: 0.5 } },
    { name: 'upper-left', cursor: { x: 0.25, y: 0.25 } },
    { name: 'lower-right', cursor: { x: 0.75, y: 0.75 } },
    { name: 'near edge', cursor: { x: 0.95, y: 0.15 } },
  ];
  const strengths = [0.5, 0.8, 1.0];

  for (const cfg of configs) {
    for (const c of cursors) {
      for (const strength of strengths) {
        it(`screen drift < 0.03 — ${cfg.name}, cursor ${c.name}, strength ${strength}`, () => {
          const marker = createZoomMarker(0, cfg.endFrame, {
            kind: 'manual',
            strength,
            zoomInDuration: cfg.zoomInDuration,
            zoomOutDuration: cfg.zoomOutDuration,
            focalPoint: { x: 0.5, y: 0.5 },
          });
          const screenXs: number[] = [];
          const screenYs: number[] = [];
          for (let f = marker.startFrame; f < marker.endFrame; f += 1) {
            const t = getZoomTransformForMarker(f, marker, {
              ...baseOptions,
              getCursorPosition: () => c.cursor,
            });
            if (t === null) continue;
            const focal = focalFromTransform(t);
            screenXs.push(screenPosition(c.cursor.x, focal.x, t.scale));
            screenYs.push(screenPosition(c.cursor.y, focal.y, t.scale));
          }
          const driftX = Math.max(...screenXs) - Math.min(...screenXs);
          const driftY = Math.max(...screenYs) - Math.min(...screenYs);
          // Allow up to 3% of viewport drift (≈ 32 pixels on 1080p) to absorb
          // spring lag during the first few frames of the marker.
          expect(driftX, `screen X drift across marker`).toBeLessThan(0.03);
          expect(driftY, `screen Y drift across marker`).toBeLessThan(0.03);
        });
      }
    }
  }
});

describe('Mode A — visible window stays within source bounds [0, 1]', () => {
  // For Mode A, the visible source range at scale s with translate t is
  // [0.5 - 0.5/s - t/s, 0.5 + 0.5/s - t/s]. Verify this never exceeds [0, 1]
  // for cursor positions across the full grid.
  const cursorsToTest = [
    { x: 0.0, y: 0.0 },
    { x: 0.0, y: 1.0 },
    { x: 1.0, y: 0.0 },
    { x: 1.0, y: 1.0 },
    { x: 0.5, y: 0.5 },
    { x: 0.95, y: 0.05 },
    { x: 0.05, y: 0.95 },
  ];
  for (const cursor of cursorsToTest) {
    it(`visible window stays in source for cursor ${JSON.stringify(cursor)}`, () => {
      const marker = createZoomMarker(0, 60, {
        kind: 'manual',
        strength: 1,
        zoomInDuration: 0,
        zoomOutDuration: 0,
        focalPoint: { x: 0.5, y: 0.5 },
      });
      const t = getZoomTransformForMarker(20, marker, {
        ...baseOptions,
        getCursorPosition: () => cursor,
      });
      expect(t).not.toBeNull();
      const xRange = visibleSourceRange(t!.translateX, t!.scale);
      const yRange = visibleSourceRange(t!.translateY, t!.scale);
      // Tolerance for floating-point edge cases at extreme cursors.
      expect(xRange.min, `xMin must be >= 0`).toBeGreaterThanOrEqual(-0.001);
      expect(xRange.max, `xMax must be <= 1`).toBeLessThanOrEqual(1.001);
      expect(yRange.min, `yMin must be >= 0`).toBeGreaterThanOrEqual(-0.001);
      expect(yRange.max, `yMax must be <= 1`).toBeLessThanOrEqual(1.001);
    });
  }
});

describe('Mode A — scale ramp continuity', () => {
  it('scale grows monotonically during ramp-in', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    let prev = 0;
    for (let f = 0; f <= 18; f += 1) {
      const t = getZoomTransformForMarker(f, marker, {
        ...baseOptions,
        getCursorPosition: () => ({ x: 0.5, y: 0.5 }),
      });
      expect(t!.scale).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t!.scale;
    }
    // Hits target at end of ramp
    expect(prev).toBeCloseTo(strengthToScale(1), 2);
  });

  it('scale shrinks monotonically during ramp-out', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 18,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const holdEnd = 60 - 18;
    let prev = strengthToScale(1);
    for (let f = holdEnd; f < 60; f += 1) {
      const t = getZoomTransformForMarker(f, marker, {
        ...baseOptions,
        getCursorPosition: () => ({ x: 0.5, y: 0.5 }),
      });
      expect(t!.scale).toBeLessThanOrEqual(prev + 1e-9);
      prev = t!.scale;
    }
  });

  it('translate is continuous (no frame-to-frame jump > 0.05) across whole marker', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 18,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (let f = 0; f < 90; f += 1) {
      const t = getZoomTransformForMarker(f, marker, {
        ...baseOptions,
        getCursorPosition: () => ({ x: 0.7, y: 0.3 }),
      });
      if (t === null) continue;
      if (prevX !== null && prevY !== null) {
        expect(Math.abs(t.translateX - prevX), `translateX jump at frame ${f}`).toBeLessThan(0.05);
        expect(Math.abs(t.translateY - prevY), `translateY jump at frame ${f}`).toBeLessThan(0.05);
      }
      prevX = t.translateX;
      prevY = t.translateY;
    }
  });
});

describe('Mode A — cursor follow with motion', () => {
  it('safe-zone camera holds still for tiny cursor jitter (no oscillation)', () => {
    // Cursor wobbles ±0.005 around (0.5, 0.5) — should NOT trigger camera pan.
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const focalsX: number[] = [];
    for (let f = 0; f < 30; f += 1) {
      const t = getZoomTransformForMarker(f, marker, {
        ...baseOptions,
        followPadding: 0.25,
        getCursorPosition: (frame: number) => ({
          x: 0.5 + (frame % 2 === 0 ? 0.005 : -0.005),
          y: 0.5,
        }),
      });
      if (t === null) continue;
      focalsX.push(focalFromTransform(t).x);
    }
    const drift = Math.max(...focalsX) - Math.min(...focalsX);
    expect(drift, `focal X drift on tiny jitter`).toBeLessThan(0.015);
  });

  it('camera pans WITH cursor when cursor moves far (safe-zone shift)', () => {
    // Cursor walks from 0.3 to 0.7 over 30 frames.
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const earlyT = getZoomTransformForMarker(2, marker, {
      ...baseOptions,
      getCursorPosition: (frame: number) => ({ x: 0.3 + (frame / 30) * 0.4, y: 0.5 }),
    });
    const lateT = getZoomTransformForMarker(40, marker, {
      ...baseOptions,
      getCursorPosition: (frame: number) => ({ x: 0.3 + Math.min(1, frame / 30) * 0.4, y: 0.5 }),
    });
    const earlyFocal = focalFromTransform(earlyT!);
    const lateFocal = focalFromTransform(lateT!);
    // Camera should have moved with the cursor (focal shifted significantly right)
    expect(lateFocal.x).toBeGreaterThan(earlyFocal.x + 0.1);
  });
});

describe('Mode A — followCursor=false locks camera at marker.focalPoint', () => {
  it('camera ignores cursor entirely when follow is off', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.3, y: 0.7 },
    });
    const t = getZoomTransformForMarker(30, marker, {
      ...baseOptions,
      followCursor: false,
      getCursorPosition: () => ({ x: 0.9, y: 0.1 }),
    });
    expect(t).not.toBeNull();
    const focal = focalFromTransform(t!);
    expect(focal.x).toBeCloseTo(0.3, 2);
    expect(focal.y).toBeCloseTo(0.7, 2);
  });
});

describe('Mode A — marker bounds', () => {
  it('returns null before marker start', () => {
    const marker = createZoomMarker(30, 60, { strength: 1 });
    expect(getZoomTransformForMarker(29, marker)).toBeNull();
  });

  it('returns null at and after marker end', () => {
    const marker = createZoomMarker(0, 60, { strength: 1 });
    expect(getZoomTransformForMarker(60, marker)).toBeNull();
    expect(getZoomTransformForMarker(100, marker)).toBeNull();
  });

  it('returns identity at start of marker (scale=1 with non-zero ramp)', () => {
    const marker = createZoomMarker(0, 60, { strength: 1, zoomInDuration: 18, zoomOutDuration: 0 });
    const t = getZoomTransformForMarker(0, marker);
    expect(t!.scale).toBe(1);
    expect(t!.translateX).toBe(0);
    expect(t!.translateY).toBe(0);
  });
});
