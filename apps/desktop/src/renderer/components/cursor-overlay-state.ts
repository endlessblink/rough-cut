/**
 * cursor-overlay-state — pure reducer for cursor overlay animation state.
 *
 * Handles:
 *  - Idle-hide: fade out after ~1.5×fps frames without movement (>2px),
 *               fade in over ~4 frames when movement resumes.
 *  - Loop-back: suppress rendering for up to 10 frames (or until the first
 *               move/click) to prevent a flash at the old position when the
 *               playhead jumps backward.
 *
 * Pure — no DOM, no side-effects, safe to test in Vitest.
 */

export interface CursorOverlayState {
  /** Normalized [0,1] x at last non-idle sample. -1 = unknown. */
  lastNormX: number;
  /** Normalized [0,1] y at last non-idle sample. -1 = unknown. */
  lastNormY: number;
  /** How many consecutive frames the cursor has been stationary. */
  idleFrameCount: number;
  /** Current opacity, clamped 0..1. */
  opacity: number;
  /**
   * Number of frames remaining in the loop-back suppression window.
   * 0 = not suppressing.
   */
  suppressFramesLeft: number;
  /** Last rendered source frame, for loop-back detection. */
  lastRenderedFrame: number;
}

export interface OverlayStateInput {
  sourceFrame: number;
  /** Normalized 0..1 x from cursor data. */
  normX: number;
  /** Normalized 0..1 y from cursor data. */
  normY: number;
  isClick: boolean;
  sourceWidth: number;
  sourceHeight: number;
  fps: number;
}

export interface OverlayStateOutput {
  /** Whether to skip drawing the cursor entirely (loop-back suppression). */
  suppressed: boolean;
  /** Opacity to apply to the cursor sprite [0..1]. */
  opacity: number;
  nextState: CursorOverlayState;
}

export const INITIAL_CURSOR_OVERLAY_STATE: CursorOverlayState = {
  lastNormX: -1,
  lastNormY: -1,
  idleFrameCount: 0,
  opacity: 1,
  suppressFramesLeft: 0,
  lastRenderedFrame: -1,
};

/** Number of suppression frames on loop-back. */
const LOOP_BACK_SUPPRESS_FRAMES = 10;

/**
 * Update cursor overlay state for a single frame tick.
 *
 * @param prev   Previous state
 * @param input  Per-frame inputs
 * @returns      Rendering decisions + next state
 */
export function updateCursorOverlayState(
  prev: CursorOverlayState,
  input: OverlayStateInput,
): OverlayStateOutput {
  const { sourceFrame, normX, normY, isClick, sourceWidth, sourceHeight, fps } = input;

  // ---- Loop-back detection ----
  // A jump back of more than 2 frames triggers suppression + idle reset.
  const isLoopBack =
    prev.lastRenderedFrame >= 0 && sourceFrame < prev.lastRenderedFrame - 2;

  let suppressFramesLeft = prev.suppressFramesLeft;
  let idleFrameCount = prev.idleFrameCount;
  let lastNormX = prev.lastNormX;
  let lastNormY = prev.lastNormY;
  let opacity = prev.opacity;

  if (isLoopBack) {
    suppressFramesLeft = LOOP_BACK_SUPPRESS_FRAMES;
    idleFrameCount = 0;
    opacity = 1;
    lastNormX = -1;
    lastNormY = -1;
  }

  // ---- Loop-back suppression ----
  if (suppressFramesLeft > 0) {
    // Exit suppression early on movement or click.
    const hasMoved =
      lastNormX >= 0 &&
      (Math.abs(normX - lastNormX) * sourceWidth > 2 ||
        Math.abs(normY - lastNormY) * sourceHeight > 2);
    const shouldExitEarly = isClick || hasMoved;

    if (shouldExitEarly) {
      suppressFramesLeft = 0;
    } else {
      const nextState: CursorOverlayState = {
        lastNormX: normX,
        lastNormY: normY,
        idleFrameCount,
        opacity,
        suppressFramesLeft: suppressFramesLeft - 1,
        lastRenderedFrame: sourceFrame,
      };
      return { suppressed: true, opacity: 0, nextState };
    }
  }

  // ---- Idle-hide ----
  const idleThresholdFrames = Math.round(1.5 * fps); // ~45 at 30 fps
  const fadeOutFrames = 8;
  const fadeInFrames = 4;

  const hasMoved =
    lastNormX < 0 ||
    Math.abs(normX - lastNormX) * sourceWidth > 2 ||
    Math.abs(normY - lastNormY) * sourceHeight > 2;

  if (hasMoved || isClick) {
    // Activity — count down idle, fade in
    idleFrameCount = 0;
    lastNormX = normX;
    lastNormY = normY;
    // Snap to 1 on click, otherwise fade in
    opacity = isClick ? 1 : Math.min(1, opacity + 1 / fadeInFrames);
  } else {
    idleFrameCount += 1;
    if (idleFrameCount >= idleThresholdFrames) {
      // Fading out
      opacity = Math.max(0, opacity - 1 / fadeOutFrames);
    }
  }

  const nextState: CursorOverlayState = {
    lastNormX,
    lastNormY,
    idleFrameCount,
    opacity,
    suppressFramesLeft: 0,
    lastRenderedFrame: sourceFrame,
  };

  return { suppressed: false, opacity, nextState };
}
