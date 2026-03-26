import { describe, it, expect } from 'vitest';
import { interpolateNumber, evaluateSingleTrack, evaluateKeyframeTracks } from './interpolation.js';
import type { KeyframeTrack } from '@rough-cut/project-model';

describe('interpolateNumber', () => {
  it('lerps at t=0 returns from', () => {
    expect(interpolateNumber(10, 20, 0)).toBe(10);
  });

  it('lerps at t=1 returns to', () => {
    expect(interpolateNumber(10, 20, 1)).toBe(20);
  });

  it('lerps at t=0.5 returns midpoint', () => {
    expect(interpolateNumber(10, 20, 0.5)).toBeCloseTo(15, 5);
  });

  it('lerps at t=0.25', () => {
    expect(interpolateNumber(0, 100, 0.25)).toBeCloseTo(25, 5);
  });
});

describe('evaluateSingleTrack', () => {
  it('returns default when no keyframes', () => {
    const track: KeyframeTrack = { property: 'opacity', keyframes: [] };
    expect(evaluateSingleTrack(track, 10, 1)).toBe(1);
  });

  it('single keyframe holds value at that frame', () => {
    const track: KeyframeTrack = {
      property: 'opacity',
      keyframes: [{ frame: 15, value: 0.5, easing: 'linear' }],
    };
    expect(evaluateSingleTrack(track, 15, 1)).toBe(0.5);
  });

  it('single keyframe holds value before frame', () => {
    const track: KeyframeTrack = {
      property: 'opacity',
      keyframes: [{ frame: 15, value: 0.5, easing: 'linear' }],
    };
    expect(evaluateSingleTrack(track, 0, 1)).toBe(0.5);
  });

  it('single keyframe holds value after frame', () => {
    const track: KeyframeTrack = {
      property: 'opacity',
      keyframes: [{ frame: 15, value: 0.5, easing: 'linear' }],
    };
    expect(evaluateSingleTrack(track, 30, 1)).toBe(0.5);
  });

  it('two linear keyframes: midpoint interpolates correctly', () => {
    const track: KeyframeTrack = {
      property: 'scale',
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 30, value: 100, easing: 'linear' },
      ],
    };
    expect(evaluateSingleTrack(track, 15, 0)).toBeCloseTo(50, 3);
  });

  it('before first keyframe — holds first value', () => {
    const track: KeyframeTrack = {
      property: 'scale',
      keyframes: [
        { frame: 10, value: 42, easing: 'linear' },
        { frame: 30, value: 100, easing: 'linear' },
      ],
    };
    expect(evaluateSingleTrack(track, 0, 0)).toBe(42);
  });

  it('after last keyframe — holds last value', () => {
    const track: KeyframeTrack = {
      property: 'scale',
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 30, value: 100, easing: 'linear' },
      ],
    };
    expect(evaluateSingleTrack(track, 60, 0)).toBe(100);
  });

  it('ease-in midpoint is less than linear midpoint', () => {
    const linearTrack: KeyframeTrack = {
      property: 'x',
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 30, value: 100, easing: 'linear' },
      ],
    };
    const easeInTrack: KeyframeTrack = {
      property: 'x',
      keyframes: [
        { frame: 0, value: 0, easing: 'ease-in' },
        { frame: 30, value: 100, easing: 'ease-in' },
      ],
    };
    const linearMid = evaluateSingleTrack(linearTrack, 15, 0) as number;
    const easeInMid = evaluateSingleTrack(easeInTrack, 15, 0) as number;
    expect(easeInMid).toBeLessThan(linearMid);
  });

  it('string value snaps to first keyframe before midpoint', () => {
    const track: KeyframeTrack = {
      property: 'quality',
      keyframes: [
        { frame: 0, value: 'low', easing: 'linear' },
        { frame: 30, value: 'high', easing: 'linear' },
      ],
    };
    expect(evaluateSingleTrack(track, 10, 'medium')).toBe('low');
  });

  it('string value snaps to second keyframe at or after midpoint', () => {
    const track: KeyframeTrack = {
      property: 'quality',
      keyframes: [
        { frame: 0, value: 'low', easing: 'linear' },
        { frame: 30, value: 'high', easing: 'linear' },
      ],
    };
    expect(evaluateSingleTrack(track, 20, 'medium')).toBe('high');
  });

  it('exactly on a keyframe returns that value', () => {
    const track: KeyframeTrack = {
      property: 'x',
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 30, value: 100, easing: 'linear' },
      ],
    };
    expect(evaluateSingleTrack(track, 0, 0)).toBe(0);
    expect(evaluateSingleTrack(track, 30, 0)).toBe(100);
  });
});

describe('evaluateKeyframeTracks', () => {
  it('returns defaults when no tracks', () => {
    const defaults = { opacity: 1, scale: 1 };
    expect(evaluateKeyframeTracks([], 10, defaults)).toEqual({ opacity: 1, scale: 1 });
  });

  it('merges track values with defaults', () => {
    const tracks: KeyframeTrack[] = [
      {
        property: 'opacity',
        keyframes: [
          { frame: 0, value: 0, easing: 'linear' },
          { frame: 30, value: 1, easing: 'linear' },
        ],
      },
    ];
    const defaults = { opacity: 1, scale: 2 };
    const result = evaluateKeyframeTracks(tracks, 15, defaults);
    expect(result['opacity']).toBeCloseTo(0.5, 3);
    expect(result['scale']).toBe(2); // from defaults
  });

  it('evaluates multiple tracks independently', () => {
    const tracks: KeyframeTrack[] = [
      {
        property: 'x',
        keyframes: [
          { frame: 0, value: 0, easing: 'linear' },
          { frame: 10, value: 100, easing: 'linear' },
        ],
      },
      {
        property: 'y',
        keyframes: [
          { frame: 0, value: 200, easing: 'linear' },
          { frame: 10, value: 400, easing: 'linear' },
        ],
      },
    ];
    const result = evaluateKeyframeTracks(tracks, 5, { x: 0, y: 0 });
    expect(result['x']).toBeCloseTo(50, 3);
    expect(result['y']).toBeCloseTo(300, 3);
  });
});
