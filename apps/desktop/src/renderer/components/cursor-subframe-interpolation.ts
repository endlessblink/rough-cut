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
      lastAdvanceWasSequential: frameDelta === 1,
    };
  }

  const activeFps = fps > 0 ? fps : 30;
  const framePeriodMs = 1000 / activeFps;
  const lerpT = isPlaying
    ? Math.max(0, Math.min(1, (nowMs - nextState.lastFrameChangeMs) / framePeriodMs))
    : 1;

  return {
    lerpT,
    shouldInterpolate: isPlaying && nextState.lastAdvanceWasSequential && lerpT < 1,
    nextState,
  };
}
