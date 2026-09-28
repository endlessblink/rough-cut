import { describe, expect, it } from 'vitest';
import type { RegionCrop } from '@rough-cut/project-model';
import { cursorLookupInCropSpace, resolveFollowCursorCrop, resolveFramedCrop } from './follow-crop.js';

// A 9:16 slice of a 1920x1080 recording, resting in the middle.
const storyCrop: RegionCrop = {
  enabled: true,
  x: 656,
  y: 0,
  width: 608,
  height: 1080,
  aspectRatio: '9:16',
  followCursor: true,
};

describe('resolveFollowCursorCrop', () => {
  it('centres the crop on a still cursor', () => {
    const crop = resolveFollowCursorCrop(storyCrop, 1920, 1080, 90, 30, () => ({ x: 0.25, y: 0.5 }));
    expect(crop.x + crop.width / 2).toBeCloseTo(480, 0);
    expect(crop.width).toBe(608);
    expect(crop.height).toBe(1080);
  });

  it('keeps the crop inside the recording when the cursor is at an edge', () => {
    const right = resolveFollowCursorCrop(storyCrop, 1920, 1080, 90, 30, () => ({ x: 1, y: 1 }));
    expect(right.x).toBe(1920 - 608);
    const left = resolveFollowCursorCrop(storyCrop, 1920, 1080, 90, 30, () => ({ x: 0, y: 0 }));
    expect(left.x).toBe(0);
  });

  it('pans smoothly instead of jumping when the cursor jumps', () => {
    // Cursor sits on the left until frame 90, then jumps to the right.
    const lookup = (frame: number) => ({ x: frame < 90 ? 0.2 : 0.8, y: 0.5 });
    const centers = [60, 80, 90, 100, 120].map((frame) => {
      const crop = resolveFollowCursorCrop(storyCrop, 1920, 1080, frame, 30, lookup);
      return crop.x + crop.width / 2;
    });
    for (let i = 1; i < centers.length; i += 1) expect(centers[i]).toBeGreaterThanOrEqual(centers[i - 1]);
    // Mid-jump the crop is part-way across, not snapped to either side.
    expect(centers[2]).toBeGreaterThan(0.2 * 1920 + 50);
    expect(centers[2]).toBeLessThan(0.8 * 1920 - 50);
  });

  it('stays still while the cursor moves around the middle of the view', () => {
    // Wiggle ±80 px around the centre of a 608 px wide view.
    const lookup = (frame: number) => ({ x: (960 + 80 * Math.sin(frame / 5)) / 1920, y: 0.5 });
    const xs = [30, 60, 90, 120].map((frame) => resolveFollowCursorCrop(storyCrop, 1920, 1080, frame, 30, lookup).x);
    expect(new Set(xs).size).toBe(1);
  });

  it('waits where the cursor left when it goes off the recorded screen', () => {
    const lookup = (frame: number) => (frame < 60 ? { x: 0.3, y: 0.5 } : { x: 1.4, y: 0.5 });
    const before = resolveFollowCursorCrop(storyCrop, 1920, 1080, 40, 30, lookup);
    const after = resolveFollowCursorCrop(storyCrop, 1920, 1080, 150, 30, lookup);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.x).toBeLessThan(1920 - 608);
  });

  it('glides with gentle speed changes and keeps a moving cursor in view', () => {
    // Cursor sweeps left to right across the screen over four seconds.
    const lookup = (frame: number) => ({ x: Math.min(0.95, 0.05 + frame / 133), y: 0.5 });
    let previousStep = 0;
    let previousX = resolveFollowCursorCrop(storyCrop, 1920, 1080, 0, 30, lookup).x;
    for (let frame = 1; frame <= 120; frame += 1) {
      const crop = resolveFollowCursorCrop(storyCrop, 1920, 1080, frame, 30, lookup);
      const step = crop.x - previousX;
      expect(Math.abs(step - previousStep)).toBeLessThan(4);
      const cursorX = lookup(frame).x * 1920;
      expect(cursorX).toBeGreaterThanOrEqual(crop.x);
      expect(cursorX).toBeLessThanOrEqual(crop.x + crop.width);
      previousStep = step;
      previousX = crop.x;
    }
  });

  it('keeps the resting position with no cursor data', () => {
    expect(resolveFollowCursorCrop(storyCrop, 1920, 1080, 90, 30, () => null)).toEqual(storyCrop);
  });

  it('resolves the same crop for the same frame (preview/export parity)', () => {
    const lookup = (frame: number) => ({ x: (frame % 200) / 200, y: 0.4 });
    expect(resolveFollowCursorCrop(storyCrop, 1920, 1080, 137, 30, lookup))
      .toEqual(resolveFollowCursorCrop(storyCrop, 1920, 1080, 137, 30, lookup));
  });
});

describe('resolveFramedCrop', () => {
  const center = (crop: RegionCrop) => crop.x + crop.width / 2;
  const leftCursor = () => ({ x: 0.2, y: 0.5 });
  const range = { id: 'framing-60', startFrame: 60, endFrame: 120, focalPoint: { x: 0.8, y: 0.5 } };

  it('holds the range spot inside the range and follows the cursor outside it', () => {
    expect(center(resolveFramedCrop(storyCrop, 1920, 1080, 90, 30, leftCursor, [range]))).toBeCloseTo(0.8 * 1920, 0);
    expect(center(resolveFramedCrop(storyCrop, 1920, 1080, 20, 30, leftCursor, [range]))).toBeCloseTo(0.2 * 1920, 0);
    expect(center(resolveFramedCrop(storyCrop, 1920, 1080, 160, 30, leftCursor, [range]))).toBeCloseTo(0.2 * 1920, 0);
  });

  it('glides in before the range and out after it instead of jumping', () => {
    const centers = [40, 50, 55, 60].map((frame) => center(resolveFramedCrop(storyCrop, 1920, 1080, frame, 30, leftCursor, [range])));
    for (let i = 1; i < centers.length; i += 1) expect(centers[i]).toBeGreaterThanOrEqual(centers[i - 1]);
    expect(centers[1]).toBeGreaterThan(0.2 * 1920 + 20);
    expect(centers[1]).toBeLessThan(0.8 * 1920 - 20);
    const leaving = center(resolveFramedCrop(storyCrop, 1920, 1080, 125, 30, leftCursor, [range]));
    expect(leaving).toBeGreaterThan(0.2 * 1920 + 20);
    expect(leaving).toBeLessThan(0.8 * 1920);
  });

  it('applies ranges when the crop does not follow the cursor', () => {
    const still = { ...storyCrop, followCursor: false };
    expect(center(resolveFramedCrop(still, 1920, 1080, 90, 30, undefined, [range]))).toBeCloseTo(0.8 * 1920, 0);
    expect(resolveFramedCrop(still, 1920, 1080, 10, 30, undefined, [range])).toEqual(still);
  });

  it('matches the plain follow with no ranges', () => {
    expect(resolveFramedCrop(storyCrop, 1920, 1080, 90, 30, leftCursor, []))
      .toEqual(resolveFollowCursorCrop(storyCrop, 1920, 1080, 90, 30, leftCursor));
  });
});

describe('cursorLookupInCropSpace', () => {
  it('maps a source cursor into the crop, so a zoom aims at what is shown', () => {
    const lookup = cursorLookupInCropSpace(() => ({ x: 0.5, y: 0.25 }), () => storyCrop, 1920, 1080);
    const point = lookup(0);
    expect(point?.x).toBeCloseTo(0.5, 5);
    expect(point?.y).toBeCloseTo(0.25, 5);
  });
});
