import { describe, expect, it } from 'vitest';
import {
  INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE,
  resolveBackwardSubframeInterpolation,
} from './cursor-subframe-interpolation.js';

describe('resolveBackwardSubframeInterpolation', () => {
  it('interpolates only after a sequential frame advance while playing', () => {
    const advanced = resolveBackwardSubframeInterpolation(
      INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE,
      {
        projectFrame: 10,
        isPlaying: true,
        nowMs: 100,
        fps: 30,
      },
    );
    expect(advanced.shouldInterpolate).toBe(false);

    const held = resolveBackwardSubframeInterpolation(advanced.nextState, {
      projectFrame: 11,
      isPlaying: true,
      nowMs: 200,
      fps: 30,
    });

    const halfway = resolveBackwardSubframeInterpolation(held.nextState, {
      projectFrame: 11,
      isPlaying: true,
      nowMs: 200 + 1000 / 60,
      fps: 30,
    });

    expect(halfway.shouldInterpolate).toBe(true);
    expect(halfway.lerpT).toBeCloseTo(0.5, 5);
  });

  it('stops interpolating once the frame hold window is over', () => {
    const sequential = {
      lastSeenPlayheadFrame: 11,
      lastFrameChangeMs: 200,
      lastAdvanceWasSequential: true,
    };

    const result = resolveBackwardSubframeInterpolation(sequential, {
      projectFrame: 11,
      isPlaying: true,
      nowMs: 200 + 1000 / 30,
      fps: 30,
    });

    expect(result.shouldInterpolate).toBe(false);
    expect(result.lerpT).toBe(1);
  });

  it('does not interpolate when playback is paused', () => {
    const sequential = {
      lastSeenPlayheadFrame: 11,
      lastFrameChangeMs: 200,
      lastAdvanceWasSequential: true,
    };

    const result = resolveBackwardSubframeInterpolation(sequential, {
      projectFrame: 11,
      isPlaying: false,
      nowMs: 210,
      fps: 30,
    });

    expect(result.shouldInterpolate).toBe(false);
    expect(result.lerpT).toBe(1);
  });

  it('does not interpolate after non-sequential jumps', () => {
    const jumped = resolveBackwardSubframeInterpolation(
      {
        lastSeenPlayheadFrame: 20,
        lastFrameChangeMs: 100,
        lastAdvanceWasSequential: true,
      },
      {
        projectFrame: 24,
        isPlaying: true,
        nowMs: 200,
        fps: 30,
      },
    );

    const held = resolveBackwardSubframeInterpolation(jumped.nextState, {
      projectFrame: 24,
      isPlaying: true,
      nowMs: 210,
      fps: 30,
    });

    expect(held.shouldInterpolate).toBe(false);
  });

  it('does not interpolate after backward jumps', () => {
    const jumped = resolveBackwardSubframeInterpolation(
      {
        lastSeenPlayheadFrame: 20,
        lastFrameChangeMs: 100,
        lastAdvanceWasSequential: true,
      },
      {
        projectFrame: 10,
        isPlaying: true,
        nowMs: 200,
        fps: 30,
      },
    );

    const held = resolveBackwardSubframeInterpolation(jumped.nextState, {
      projectFrame: 10,
      isPlaying: true,
      nowMs: 210,
      fps: 30,
    });

    expect(held.shouldInterpolate).toBe(false);
  });
});
