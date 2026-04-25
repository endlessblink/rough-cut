export interface BackwardSubframeInterpolationState {
  lastSeenPlayheadFrame: number;
  lastFrameChangeMs: number;
  lastAdvanceWasSequential: boolean;
}

export interface BackwardSubframeInterpolationResult {
  readonly lerpT: number;
  readonly shouldInterpolate: boolean;
  readonly nextState: BackwardSubframeInterpolationState;
}

export const INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE: BackwardSubframeInterpolationState = {
  lastSeenPlayheadFrame: -1,
  lastFrameChangeMs: 0,
  lastAdvanceWasSequential: false,
};

export function resolveBackwardSubframeInterpolation(
  state: BackwardSubframeInterpolationState,
  {
    projectFrame,
    isPlaying,
    nowMs,
    fps,
  }: {
    projectFrame: number;
    isPlaying: boolean;
    nowMs: number;
    fps: number;
  },
): BackwardSubframeInterpolationResult {
  let nextState = state;

  if (projectFrame !== state.lastSeenPlayheadFrame) {
    const frameDelta =
      state.lastSeenPlayheadFrame < 0 ? 0 : projectFrame - state.lastSeenPlayheadFrame;
    nextState = {
      lastSeenPlayheadFrame: projectFrame,
      lastFrameChangeMs: nowMs,
      // A sequential advance is +1 forward. We still record this for any
      // caller that wants to inspect it, but `shouldInterpolate` no longer
      // gates on it — see below.
      lastAdvanceWasSequential: frameDelta === 1,
    };
  }

  const activeFps = fps > 0 ? fps : 30;
  const framePeriodMs = 1000 / activeFps;
  const lerpT = isPlaying
    ? Math.max(0, Math.min(1, (nowMs - nextState.lastFrameChangeMs) / framePeriodMs))
    : 1;

  // Interpolate during any forward playback, regardless of whether the
  // playhead advanced by exactly one frame. Under GPU stalls / decoder
  // hiccups, `requestVideoFrameCallback` can deliver multi-frame jumps
  // (e.g., 0,1,3,4) — the previous gate (`lastAdvanceWasSequential`)
  // disabled interp on those ticks and the cursor sprite SNAPPED to the
  // new position, which the user perceives as jerks during continuous
  // motion. Lerping cursor[N-1] → cursor[N] is still visually meaningful
  // when the playhead jumped from N-3 to N — the cursor takes one
  // smoothing window to catch up to the latest position rather than
  // teleporting. Pause/scrub still gets `lerpT = 1` (no interp) above.
  return {
    lerpT,
    shouldInterpolate: isPlaying && lerpT < 1,
    nextState,
  };
}
