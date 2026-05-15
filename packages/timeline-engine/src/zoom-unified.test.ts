import { describe, it, expect } from 'vitest';
import { getZoomTransformForMarker } from './zoom-transform.js';
import { createZoomMarker } from '@rough-cut/project-model';

/**
 * Unified-zoom-system regression suite.
 *
 * Locks in the contract: ONE camera-follow path runs through every phase
 * (ramp-in, hold, ramp-out) for every marker kind (manual + auto). Replaces
 * the older phase-locked invariants that hid manual-marker cursor-follow
 * during ramps.
 */

function focalFromTransform(t: { scale: number; translateX: number; translateY: number }) {
  return {
    x: 0.5 - t.translateX / t.scale,
    y: 0.5 - t.translateY / t.scale,
  };
}

function cursorInsideVisibleWindow(
  t: { scale: number; translateX: number; translateY: number },
  cursor: { x: number; y: number },
) {
  const f = focalFromTransform(t);
  const half = 1 / (2 * t.scale);
  return (
    cursor.x >= f.x - half &&
    cursor.x <= f.x + half &&
    cursor.y >= f.y - half &&
    cursor.y <= f.y + half
  );
}

const baseOptions = {
  followCursor: true,
  followAnimation: 'smooth' as const,
  followPadding: 0.25,
  fps: 30,
};

describe('unified zoom — manual + auto markers behave identically', () => {
  it('manual marker with non-zero ramp-in still tracks cursor during the ramp', () => {
    // The original bug: manual markers default to zoomInDuration=18, and the
    // OLD phase-locked code froze focal at marker.focalPoint for those 18
    // frames. This test asserts the camera shifts toward the cursor mid-ramp.
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(9, marker, {
      ...baseOptions,
      getCursorPosition: () => ({ x: 0.85, y: 0.5 }),
    });
    expect(t).not.toBeNull();
    expect(focalFromTransform(t!).x).toBeGreaterThan(0.5);
  });

  it('manual and auto markers produce equivalent focal trajectories given identical inputs', () => {
    const cursorAtFrame = (frame: number) => ({ x: 0.2 + (frame / 90) * 0.6, y: 0.5 });
    const opts = { ...baseOptions, getCursorPosition: cursorAtFrame };
    const manual = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 12,
      zoomOutDuration: 12,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const auto = createZoomMarker(0, 90, {
      kind: 'auto',
      strength: 1,
      zoomInDuration: 12,
      zoomOutDuration: 12,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    for (const frame of [5, 15, 30, 60, 80]) {
      const m = getZoomTransformForMarker(frame, manual, opts);
      const a = getZoomTransformForMarker(frame, auto, opts);
      expect(m).not.toBeNull();
      expect(a).not.toBeNull();
      expect(focalFromTransform(m!).x).toBeCloseTo(focalFromTransform(a!).x, 6);
      expect(focalFromTransform(m!).y).toBeCloseTo(focalFromTransform(a!).y, 6);
      expect(m!.scale).toBeCloseTo(a!.scale, 6);
    }
  });

  it('cursor stays inside the visible window across every phase of a 90-frame marker', () => {
    // Cursor sits in the top-right region the entire marker. The camera must
    // keep it visible during ramp-in (frame 1+), hold, and ramp-out.
    const marker = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 18,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursor = { x: 0.88, y: 0.12 };
    const opts = { ...baseOptions, getCursorPosition: () => cursor };
    // Allow ~4 frames for the spring to settle on a far-off cursor at marker entry.
    for (let frame = 4; frame < 89; frame += 1) {
      const t = getZoomTransformForMarker(frame, marker, opts);
      expect(t, `frame ${frame}`).not.toBeNull();
      expect(cursorInsideVisibleWindow(t!, cursor), `frame ${frame}`).toBe(true);
    }
  });
});

describe('unified zoom — slider controls', () => {
  // Note: snappy-vs-floaty spring differential is covered at the unit level in
  // spring-solver.test.ts. At the engine integration level the cursor-visible
  // clamp dominates the focal output, so the slider's effect on focal isn't
  // reliable to assert here.

  it('larger followPadding triggers camera moves sooner (smaller safe zone)', () => {
    // followPadding is the INSET on each edge of the visible window. The
    // safe zone is what's LEFT after the inset is removed. So:
    //   followPadding=0    → safe zone == full visible window → camera barely moves
    //   followPadding=0.3  → tiny safe zone → camera reacts to any cursor motion
    const marker = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursor = { x: 0.65, y: 0.5 };
    const calm = getZoomTransformForMarker(15, marker, {
      ...baseOptions,
      followPadding: 0,
      getCursorPosition: () => cursor,
    });
    const reactive = getZoomTransformForMarker(15, marker, {
      ...baseOptions,
      followPadding: 0.3,
      getCursorPosition: () => cursor,
    });
    expect(calm).not.toBeNull();
    expect(reactive).not.toBeNull();
    const calmShift = Math.abs(focalFromTransform(calm!).x - 0.5);
    const reactiveShift = Math.abs(focalFromTransform(reactive!).x - 0.5);
    expect(reactiveShift).toBeGreaterThan(calmShift);
  });

  it('followCursor=false → camera ignores cursor entirely', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const t = getZoomTransformForMarker(30, marker, {
      ...baseOptions,
      followCursor: false,
      getCursorPosition: () => ({ x: 0.9, y: 0.1 }),
    });
    expect(t).not.toBeNull();
    // Focal pinned to marker.focalPoint when follow is off
    expect(focalFromTransform(t!).x).toBeCloseTo(0.5, 5);
    expect(focalFromTransform(t!).y).toBeCloseTo(0.5, 5);
  });
});

describe('unified zoom — phase continuity', () => {
  it('focal trajectory is continuous across the ramp-in→hold boundary (no snap)', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 18,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursorAtFrame = (frame: number) => ({ x: 0.3 + (frame / 90) * 0.4, y: 0.5 });
    const opts = { ...baseOptions, getCursorPosition: cursorAtFrame };
    // Boundary is at frame 18 (zoomInDuration). Sample around it.
    const before = getZoomTransformForMarker(17, marker, opts);
    const at = getZoomTransformForMarker(18, marker, opts);
    const after = getZoomTransformForMarker(19, marker, opts);
    expect(before).not.toBeNull();
    expect(at).not.toBeNull();
    expect(after).not.toBeNull();
    const dxBefore = Math.abs(focalFromTransform(at!).x - focalFromTransform(before!).x);
    const dxAfter = Math.abs(focalFromTransform(after!).x - focalFromTransform(at!).x);
    // No frame-to-frame delta should exceed 0.05 normalized (≈ 64px at 1280px source).
    expect(dxBefore).toBeLessThan(0.05);
    expect(dxAfter).toBeLessThan(0.05);
  });

  it('focal trajectory is continuous across the hold→ramp-out boundary (no snap)', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 10,
      zoomOutDuration: 20,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursorAtFrame = (frame: number) => ({ x: 0.3 + (frame / 90) * 0.4, y: 0.5 });
    const opts = { ...baseOptions, getCursorPosition: cursorAtFrame };
    // holdEnd = endFrame - zoomOutDuration = 70
    const before = getZoomTransformForMarker(69, marker, opts);
    const at = getZoomTransformForMarker(70, marker, opts);
    const after = getZoomTransformForMarker(71, marker, opts);
    expect(before).not.toBeNull();
    expect(at).not.toBeNull();
    expect(after).not.toBeNull();
    const dxBefore = Math.abs(focalFromTransform(at!).x - focalFromTransform(before!).x);
    const dxAfter = Math.abs(focalFromTransform(after!).x - focalFromTransform(at!).x);
    expect(dxBefore).toBeLessThan(0.05);
    expect(dxAfter).toBeLessThan(0.05);
  });
});
