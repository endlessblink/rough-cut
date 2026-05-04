import { describe, expect, it } from 'vitest';
import { getProjectAspectRatioValue, getStyledCanvasResolution } from './aspect-ratio.js';

describe('aspect-ratio', () => {
  it('uses native source ratio for auto', () => {
    expect(getProjectAspectRatioValue('auto', 4 / 3)).toBeCloseTo(4 / 3);
  });

  it('calculates even wide, vertical, and square styled canvas resolutions', () => {
    expect(getStyledCanvasResolution({ aspectRatio: '16:9' })).toEqual({ width: 1920, height: 1080 });
    expect(getStyledCanvasResolution({ aspectRatio: '9:16' })).toEqual({ width: 1080, height: 1920 });
    expect(getStyledCanvasResolution({ aspectRatio: '1:1' })).toEqual({ width: 1920, height: 1920 });
  });

  it('keeps auto output aligned with non-16:9 source recordings', () => {
    expect(
      getStyledCanvasResolution({
        aspectRatio: 'auto',
        sourceWidth: 1600,
        sourceHeight: 1200,
      }),
    ).toEqual({ width: 1920, height: 1440 });
  });
});
