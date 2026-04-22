import { describe, it, expect } from 'vitest';
import {
  updateCursorOverlayState,
  INITIAL_CURSOR_OVERLAY_STATE,
  type CursorOverlayState,
} from './cursor-overlay-state.js';

const BASE_INPUT = {
  sourceWidth: 1920,
  sourceHeight: 1080,
  fps: 30,
  isClick: false,
};

// Convenience: run N frames of movement at the same normalized position
function runFrames(
  startState: CursorOverlayState,
  count: number,
  overrides: Partial<typeof BASE_INPUT & { normX: number; normY: number }> = {},
): CursorOverlayState {
  let s = startState;
  for (let i = 0; i < count; i++) {
    const result = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: (s.lastRenderedFrame < 0 ? 0 : s.lastRenderedFrame) + 1,
      ...overrides,
    });
    s = result.nextState;
  }
  return s;
}

// Run N frames all at the same position (simulating idle)
function runIdleFrames(
  startState: CursorOverlayState,
  count: number,
  normX = 0.5,
  normY = 0.5,
): CursorOverlayState {
  let s = startState;
  let frame = s.lastRenderedFrame < 0 ? 0 : s.lastRenderedFrame;
  for (let i = 0; i < count; i++) {
    frame += 1;
    const result = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX,
      normY,
      sourceFrame: frame,
    });
    s = result.nextState;
  }
  return s;
}

describe('cursor-overlay-state — idle-hide', () => {
  it('starts at full opacity', () => {
    const result = updateCursorOverlayState(INITIAL_CURSOR_OVERLAY_STATE, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 0,
    });
    expect(result.opacity).toBe(1);
    expect(result.suppressed).toBe(false);
  });

  it('does not fade out before the idle threshold (< 1.5×fps frames)', () => {
    // Move first, then stay still for 44 frames (threshold is 45)
    const afterMove = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 1);
    const afterIdle = runIdleFrames(afterMove, 44);
    expect(afterIdle.opacity).toBe(1);
    expect(afterIdle.idleFrameCount).toBe(44);
  });

  it('starts fading out after 1.5×fps frames of no movement', () => {
    const afterMove = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 1);
    // Sit still for exactly 45 frames (threshold) then one more to trigger fade
    const afterIdle = runIdleFrames(afterMove, 46);
    // Opacity should have dropped below 1
    expect(afterIdle.opacity).toBeLessThan(1);
  });

  it('fully fades out after threshold + fadeOutFrames', () => {
    const afterMove = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 1);
    // 45 frames threshold + 8 frames fade = 53 frames idle
    const afterIdle = runIdleFrames(afterMove, 45 + 8);
    expect(afterIdle.opacity).toBe(0);
  });

  it('fades back in over ~4 frames when cursor moves again', () => {
    const afterMove = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 1);
    // Go fully idle
    const fullyIdle = runIdleFrames(afterMove, 45 + 8);
    expect(fullyIdle.opacity).toBe(0);

    // Now move slightly (> 2px in source space: 3/1920 ≈ 0.00156)
    let s = fullyIdle;
    const baseFrame = s.lastRenderedFrame;
    let opacityAfterOneMove = 0;
    for (let i = 0; i < 1; i++) {
      const result = updateCursorOverlayState(s, {
        ...BASE_INPUT,
        normX: 0.5 + 3 / 1920, // moved 3 source-pixels
        normY: 0.5,
        sourceFrame: baseFrame + 1 + i,
      });
      s = result.nextState;
      opacityAfterOneMove = result.opacity;
    }
    // After 1 movement frame, opacity should be 1/4 = 0.25
    expect(opacityAfterOneMove).toBeCloseTo(0.25, 5);

    // After 4 movement frames, fully visible again.
    // Each step moves by 3 px (> 2px threshold) relative to the previous position.
    for (let i = 1; i < 4; i++) {
      const result = updateCursorOverlayState(s, {
        ...BASE_INPUT,
        normX: s.lastNormX + 3 / 1920, // always 3px more than last known
        normY: 0.5,
        sourceFrame: baseFrame + 1 + i,
      });
      s = result.nextState;
    }
    expect(s.opacity).toBe(1);
  });

  it('snaps to full opacity on click even while fading out', () => {
    const afterMove = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 1);
    // Partially fade
    const partlyFaded = runIdleFrames(afterMove, 45 + 4);
    expect(partlyFaded.opacity).toBeLessThan(1);

    const clickResult = updateCursorOverlayState(partlyFaded, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: partlyFaded.lastRenderedFrame + 1,
      isClick: true,
    });
    expect(clickResult.opacity).toBe(1);
    expect(clickResult.suppressed).toBe(false);
  });
});

describe('cursor-overlay-state — loop-back suppression', () => {
  it('suppresses rendering on backward playhead jump', () => {
    // Advance to frame 50
    let s = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 50);
    expect(s.lastRenderedFrame).toBe(50);

    // Jump back to frame 10 (delta > 2, triggers loop-back)
    const result = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 10,
    });

    expect(result.suppressed).toBe(true);
    expect(result.opacity).toBe(0);
    expect(result.nextState.suppressFramesLeft).toBe(9); // 10 - 1
  });

  it('counts down suppression over 10 frames', () => {
    let s = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 50);

    // Jump back — first suppressed frame consumes one suppress count
    const result1 = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 10,
    });
    expect(result1.suppressed).toBe(true);
    s = result1.nextState;

    // Run 9 more frames at same position, all should be suppressed
    for (let i = 1; i < 10; i++) {
      const r = updateCursorOverlayState(s, {
        ...BASE_INPUT,
        normX: 0.5,
        normY: 0.5,
        sourceFrame: 10 + i,
      });
      s = r.nextState;
      if (i < 9) {
        expect(r.suppressed).toBe(true);
      }
    }

    // Frame 10 of suppression: suppressFramesLeft should be 0
    expect(s.suppressFramesLeft).toBe(0);
  });

  it('exits suppression early on a click event', () => {
    let s = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 50);

    // Loop-back
    const loopResult = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 10,
    });
    expect(loopResult.suppressed).toBe(true);
    s = loopResult.nextState;

    // Next frame: click — should exit suppression
    const clickResult = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 11,
      isClick: true,
    });
    expect(clickResult.suppressed).toBe(false);
    expect(clickResult.nextState.suppressFramesLeft).toBe(0);
  });

  it('exits suppression early on movement > 2 source pixels', () => {
    let s = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 50);

    // Loop-back — cursor was at (0.5, 0.5), save that position
    const loopResult = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 10,
    });
    expect(loopResult.suppressed).toBe(true);
    s = loopResult.nextState;
    // lastNormX was cleared to -1 on loop-back reset, so first position
    // in suppression window sets it
    expect(s.lastNormX).toBe(0.5);

    // Next frame: move by 5 source pixels → 5/1920 ≈ 0.0026
    const moveResult = updateCursorOverlayState(s, {
      ...BASE_INPUT,
      normX: 0.5 + 5 / 1920,
      normY: 0.5,
      sourceFrame: 11,
    });
    expect(moveResult.suppressed).toBe(false);
  });

  it('resets idle state on loop-back', () => {
    // Make cursor fully idle first
    const afterMove = runFrames(INITIAL_CURSOR_OVERLAY_STATE, 1);
    const fullyIdle = runIdleFrames(afterMove, 45 + 8);
    expect(fullyIdle.opacity).toBe(0);

    // Loop-back
    const loopResult = updateCursorOverlayState(fullyIdle, {
      ...BASE_INPUT,
      normX: 0.5,
      normY: 0.5,
      sourceFrame: 2, // well before lastRenderedFrame
    });
    // opacity resets to 1 in the internal state after loop-back
    expect(loopResult.nextState.opacity).toBe(1);
    expect(loopResult.nextState.idleFrameCount).toBe(0);
  });
});
