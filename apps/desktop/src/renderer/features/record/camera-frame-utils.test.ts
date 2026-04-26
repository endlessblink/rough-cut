import { describe, expect, it } from 'vitest';
import {
  cameraAspectRatioValue,
  reshapeNormalizedCameraFrameToAspect,
} from './camera-frame-utils.js';

describe('reshapeNormalizedCameraFrameToAspect', () => {
  it('narrows a landscape frame when switching to portrait', () => {
    const result = reshapeNormalizedCameraFrameToAspect(
      { x: 0.72, y: 0.72, w: 0.2, h: 0.2 },
      cameraAspectRatioValue('9:16'),
      cameraAspectRatioValue('16:9'),
    );

    expect(result.h).toBeCloseTo(0.2);
    expect(result.w).toBeCloseTo(0.06328125);
    expect(result.x).toBeCloseTo(0.788359375);
    expect(result.y).toBeCloseTo(0.72);
  });

  it('shortens a tall frame when switching back to wide', () => {
    const result = reshapeNormalizedCameraFrameToAspect(
      { x: 0.72, y: 0.6, w: 0.06328125, h: 0.2 },
      cameraAspectRatioValue('16:9'),
      cameraAspectRatioValue('16:9'),
    );

    expect(result.w).toBeCloseTo(0.06328125);
    expect(result.h).toBeCloseTo(0.06328125);
    expect(result.x).toBeCloseTo(0.72);
    expect(result.y).toBeCloseTo(0.668359375);
  });

  it('leaves invalid inputs unchanged', () => {
    const frame = { x: 0.1, y: 0.2, w: 0, h: 0.3 };

    expect(reshapeNormalizedCameraFrameToAspect(frame, 1, 16 / 9)).toBe(frame);
    expect(reshapeNormalizedCameraFrameToAspect(frame, 0, 16 / 9)).toBe(frame);
    expect(reshapeNormalizedCameraFrameToAspect(frame, 1, 0)).toBe(frame);
  });
});
