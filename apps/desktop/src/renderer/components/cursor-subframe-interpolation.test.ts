import { describe, expect, it } from 'vitest';
import {
  INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE,
  resolveBackwardSubframeInterpolation,
} from './cursor-subframe-interpolation.js';

describe('resolveBackwardSubframeInterpolation', () => {
  it('interpolates within the frame-hold window during playback', () => {
    // First tick: lerpT = 0. The caller (CursorOverlay) handles the
    // no-prev-cursor edge case independently of this flag — so it's safe
    // and useful to report `shouldInterpolate=true` here. At lerpT=0 the
    // lerp result equals `prevCursor`, which when no prev exists falls
    // through to `currCursor`. Either way: visually correct.
    const advanced = resolveBackwardSubframeInterpolation(
      INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE,
      {
        projectFrame: 10,
        isPlaying: true,
        nowMs: 100,
        fps: 30,
      },
    );
    expect(advanced.lerpT).toBe(0);
    expect(advanced.shouldInterpolate).toBe(true);

    // Same frame, halfway into its hold window — interp midpoint.
    const halfway = resolveBackwardSubframeInterpolation(advanced.nextState, {
      projectFrame: 10,
      isPlaying: true,
      nowMs: 100 + 1000 / 60,
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

  it('still interpolates after multi-frame forward jumps (GPU-stall recovery)', () => {
    // requestVideoFrameCallback can deliver multi-frame jumps when the
    // decoder catches up after a stall. The cursor sprite must keep
    // smoothing instead of snapping — that snap is what the user perceives
    // as jerks during continuous motion.
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
    expect(jumped.nextState.lastAdvanceWasSequential).toBe(false);

    const held = resolveBackwardSubframeInterpolation(jumped.nextState, {
      projectFrame: 24,
      isPlaying: true,
      nowMs: 200 + 1000 / 60,
      fps: 30,
    });
    expect(held.shouldInterpolate).toBe(true);
    expect(held.lerpT).toBeCloseTo(0.5, 5);
  });

  it('records non-sequential advances in nextState for callers that care', () => {
    const jumped = resolveBackwardSubframeInterpolation(
      {
        lastSeenPlayheadFrame: 20,
        lastFrameChangeMs: 100,
        lastAdvanceWasSequential: true,
      },
      {
        projectFrame: 22,
        isPlaying: true,
        nowMs: 200,
        fps: 30,
      },
    );
    expect(jumped.nextState.lastAdvanceWasSequential).toBe(false);
    expect(jumped.nextState.lastSeenPlayheadFrame).toBe(22);
  });
});
