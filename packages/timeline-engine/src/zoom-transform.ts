import type { ZoomMarker, Frame } from '@rough-cut/project-model';
import {
  createSpringState,
  stepSpring,
  getCursorSpringConfig,
  type SpringConfig,
} from './spring-solver.js';

/**
 * Result of computing the zoom transform at a given frame.
 * translateX/translateY are in normalized units (fraction of container size).
 */
export interface ZoomTransform {
  /** Scale factor (1.0 = no zoom) */
  readonly scale: number;
  /** Horizontal offset as fraction of container width */
  readonly translateX: number;
  /** Vertical offset as fraction of container height */
  readonly translateY: number;
}

export interface ZoomCursorPosition {
  readonly x: number;
  readonly y: number;
}

export interface ZoomTransformOptions {
  readonly followCursor?: boolean;
  readonly followAnimation?: 'focused' | 'smooth';
  readonly followPadding?: number;
  /**
   * Continuous cursor-spring smoothness, range [0, 2]. When provided,
   * supersedes the `followAnimation` preset and feeds `getCursorSpringConfig`
   * directly. 0 = near-instant follow, 0.6 ≈ current 'smooth' preset, 2 = floaty.
   */
  readonly cursorSmoothing?: number;
  readonly getCursorPosition?: (frame: Frame) => ZoomCursorPosition | null;
  /**
   * Frame rate for spring-physics integration. dt = 1/fps. Defaults to 30
   * when absent. Required for fps-independent settle times.
   */
  readonly fps?: number;
}

const IDENTITY: ZoomTransform = { scale: 1, translateX: 0, translateY: 0 };

/**
 * Maximum frame gap between two markers to treat them as "connected"
 * (pan between focal points instead of zooming out and back in).
 */
const CONNECTED_GAP_FRAMES = 3;

/**
 * Ken Perlin's smootherStep: 6t^5 - 15t^4 + 10t^3
 * Produces a smooth S-curve with zero first AND second derivatives at endpoints.
 */
export function smootherStep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * Map ZoomMarker strength (0–1) to a scale factor.
 * 0 → 1.0x (no zoom), 1 → 2.5x (max zoom).
 */
export function strengthToScale(strength: number): number {
  return 1 + strength * 1.5;
}

/**
 * Compute the translate offset for a given scale and focal point.
 *
 * Mode A (zoom-around-cursor): the focal point stays at its source-relative
 * screen position throughout the zoom — the rest of the frame magnifies around
 * it. Matches Recordly / Screen Studio behavior. Avoids the cursor-slides-
 * across-screen visual that the old "zoom-toward-center" model produced
 * during ramp-in/out.
 *
 * Formula: translate = (focal - 0.5) * (1 - scale)
 *
 * At scale = 1 → translate = 0 (identity).
 * As scale grows → translate accumulates in the direction that keeps the
 * focal point fixed at its source-x screen position.
 *
 * No clamping needed: focal ∈ [0, 1] always produces a visible window that
 * stays within source bounds, because the formula derives from the constraint
 * that the focal point itself stays inside the viewport.
 */
function computeTranslate(
  scale: number,
  focalX: number,
  focalY: number,
): { translateX: number; translateY: number } {
  return {
    translateX: (focalX - 0.5) * (1 - scale),
    translateY: (focalY - 0.5) * (1 - scale),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Spring presets routed through the analytic solver. The cursor-EMA pre-filter
// still removes sub-pixel hand tremor, but jitter from a paused cursor is now
// handled by the solver's restDelta / restSpeed thresholds rather than ad-hoc
// stationary-snap and deadband layers (which themselves produced visible jumps).
//
// `smooth` maps to a comfortable Recordly-style smoothing of 0.6, `focused` to
// a snappier 0.35 — both still produce zeta ≥ 1 (overshoot clamp engages on
// target reversal).
const CURSOR_SPRING: Record<'smooth' | 'focused', SpringConfig> = {
  smooth: getCursorSpringConfig(0.6),
  focused: getCursorSpringConfig(0.35),
};

const CURSOR_EMA_ALPHA: Record<'smooth' | 'focused', number> = {
  smooth: 0.24,
  focused: 0.5,
};

// Safe-zone camera: the camera focus holds still while the cursor is inside
// an inner safe zone of the visible window. When the cursor would leave that
// zone, the camera shifts just enough to keep the cursor inside it. The
// analytic spring then smooths the (mostly piecewise-constant) camera target.
//
// This produces three properties we need:
//   1. Stationary cursor → stationary camera (no chase-jitter on hand tremor)
//   2. Fast cursor → camera shifts immediately to keep cursor on screen
//      (guarantees the cursor never falls out of the safe zone)
//   3. Spring smooths the camera step-changes so the move feels natural
//
// Pattern from Recordly's `computeCursorFollowFocus` (AGPL) reimplemented from
// the described algorithm — no code copied.
//
// `followPadding` ∈ [0, 0.45] sets the safe-zone inset as a fraction of the
// visible span on each axis. 0 = camera moves with any cursor motion; 0.4 =
// large dead zone in the middle, camera only moves on near-edge cursor.
//
// Mutable integration state for the safe-zone camera + cursor spring. One pass
// over the marker's frames advances this incrementally.
interface SpringFocalState {
  camTargetX: number;
  camTargetY: number;
  emaX: number | null;
  emaY: number | null;
  stateX: ReturnType<typeof createSpringState>;
  stateY: ReturnType<typeof createSpringState>;
  frame: Frame; // last frame this state has been integrated up to
}

// Single-entry resume cache. Sequential playback (and export, which iterates
// frames in order) advances the spring one frame at a time instead of
// re-integrating from the marker start on every frame — turning an O(n²)
// per-marker cost into O(n). The cached value is bit-identical to a
// from-scratch integration (deterministic), so preview/export parity holds.
// A different signature, a different cursor source, or a backward seek falls
// back to a full re-integration.
interface SpringFocalCache {
  signature: string;
  getCursorPosition: (frame: Frame) => ZoomCursorPosition | null;
  state: SpringFocalState;
}
let springFocalCache: SpringFocalCache | null = null;

function resolveSpringSmoothedFocal(
  fromFrame: Frame,
  toFrame: Frame,
  marker: ZoomMarker,
  getCursorPosition: (frame: Frame) => ZoomCursorPosition | null,
  followAnimation: 'focused' | 'smooth',
  followPadding: number,
  fps: number,
  cursorSmoothing?: number,
): ZoomCursorPosition {
  // Continuous slider overrides the preset when provided.
  const cfg =
    typeof cursorSmoothing === 'number'
      ? getCursorSpringConfig(cursorSmoothing)
      : CURSOR_SPRING[followAnimation];
  const emaAlpha = CURSOR_EMA_ALPHA[followAnimation];
  const dtMs = 1000 / Math.max(1, fps);
  const targetScale = strengthToScale(marker.strength);
  const safeZoneRatio = clamp(followPadding, 0, 0.45);

  // Advance `st` by a single frame `f`, mutating it in place. Identical math to
  // the original per-frame loop body.
  const step = (st: SpringFocalState, f: Frame): void => {
    const raw = getCursorPosition(f);
    if (raw !== null) {
      if (st.emaX === null || st.emaY === null) {
        st.emaX = raw.x;
        st.emaY = raw.y;
      } else {
        st.emaX = st.emaX + (raw.x - st.emaX) * emaAlpha;
        st.emaY = st.emaY + (raw.y - st.emaY) * emaAlpha;
      }
    }

    if (st.emaX !== null && st.emaY !== null) {
      // Use the TARGET scale for safe-zone math, not the current frame's
      // ramp-time scale (recomputing at ramp-time scale produces vertical jitter).
      const halfSpan = 1 / (2 * targetScale);
      const inset = halfSpan * 2 * safeZoneRatio;

      const safeLeft = st.camTargetX - halfSpan + inset;
      const safeRight = st.camTargetX + halfSpan - inset;
      const safeTop = st.camTargetY - halfSpan + inset;
      const safeBottom = st.camTargetY + halfSpan - inset;

      if (st.emaX < safeLeft) st.camTargetX -= safeLeft - st.emaX;
      else if (st.emaX > safeRight) st.camTargetX += st.emaX - safeRight;
      if (st.emaY < safeTop) st.camTargetY -= safeTop - st.emaY;
      else if (st.emaY > safeBottom) st.camTargetY += st.emaY - safeBottom;

      st.camTargetX = clamp(st.camTargetX, 0, 1);
      st.camTargetY = clamp(st.camTargetY, 0, 1);
    }

    stepSpring(st.stateX, st.camTargetX, dtMs, cfg);
    stepSpring(st.stateY, st.camTargetY, dtMs, cfg);
    st.frame = f;
  };

  // Seed the camera target DIRECTLY at the cursor on the marker's first frame
  // so zoom-in is pure scale change (no pan to the cursor while scale ramps).
  const seed = (): SpringFocalState => {
    let camTargetX = marker.focalPoint.x;
    let camTargetY = marker.focalPoint.y;
    let emaX: number | null = null;
    let emaY: number | null = null;
    const seedRaw = getCursorPosition(fromFrame);
    if (seedRaw !== null) {
      emaX = seedRaw.x;
      emaY = seedRaw.y;
      camTargetX = clamp(seedRaw.x, 0, 1);
      camTargetY = clamp(seedRaw.y, 0, 1);
    }
    return {
      camTargetX,
      camTargetY,
      emaX,
      emaY,
      stateX: createSpringState(camTargetX),
      stateY: createSpringState(camTargetY),
      frame: fromFrame,
    };
  };

  const signature = `${String(marker.id)}|${fromFrame}|${marker.endFrame}|${marker.strength}|${marker.zoomOutDuration}|${marker.focalPoint.x}|${marker.focalPoint.y}|${followAnimation}|${followPadding}|${fps}|${cursorSmoothing ?? ''}`;

  // Resume from the cache when the inputs match and we're moving forward
  // (including a re-request of the same frame, e.g. a paused redraw).
  let st: SpringFocalState;
  if (
    springFocalCache !== null &&
    springFocalCache.signature === signature &&
    springFocalCache.getCursorPosition === getCursorPosition &&
    toFrame >= springFocalCache.state.frame
  ) {
    st = springFocalCache.state;
    for (let f = st.frame + 1; f <= toFrame; f += 1) step(st, f);
  } else {
    st = seed();
    for (let f = fromFrame + 1; f <= toFrame; f += 1) step(st, f);
    springFocalCache = { signature, getCursorPosition, state: st };
  }
  springFocalCache = { signature, getCursorPosition, state: st };

  return { x: st.stateX.value, y: st.stateY.value };
}

// Phase-aware focal point resolution. The marker's life splits into three
// phases with discrete behaviors so cursor influence never compounds with
// scale change (the dominant wobble cause):
//   1. Ramp-in:  stable marker/action focal while scale eases in
//   2. Hold:     spring tracks EMA-filtered cursor through edge-snap mapping
//   3. Ramp-out: keep following until the marker ends while scale returns to 1
// In every phase the result is then source-bound clamped at the current scale.
function getMarkerFocalPoint(
  frame: Frame,
  marker: ZoomMarker,
  scale: number,
  options: ZoomTransformOptions | undefined,
): ZoomCursorPosition {
  // Mode A (zoom-around-cursor) needs no source-bound clamp on focal: the
  // computeTranslate formula `translate = (focal - 0.5) * (1 - scale)`
  // produces a valid visible window for any focal in [0, 1]. We only clamp
  // away from off-source values to keep telemetry sane.
  const sourceClamp = (x: number, y: number) => ({
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  });
  void scale; // retained in signature for caller compatibility

  // Per-marker pin overrides the global setting: when the marker was reframed
  // away from the cursor (followCursor === false), it stays locked on its
  // static focalPoint regardless of the global ZoomPresentation.followCursor.
  // Omitted on the marker = inherit the global option.
  const followCursor = marker.followCursor ?? options?.followCursor;

  // Cursor-follow disabled (or no cursor data wired): static focal.
  if (followCursor !== true || options?.getCursorPosition === undefined) {
    return sourceClamp(marker.focalPoint.x, marker.focalPoint.y);
  }

  const followAnimation = options.followAnimation ?? 'smooth';
  const followPadding = options.followPadding ?? 0.25;
  const fps = options.fps ?? 30;

  // Unified path: the safe-zone camera + cursor spring run continuously from
  // the marker's startFrame through every phase (ramp-in, hold, ramp-out) and
  // for every marker kind (manual + auto). One system for all zooms. The
  // source-bound clamp at the current scale naturally widens as scale → 1
  // during ramp-out, so the focal slides back toward center on its own.
  const followed = resolveSpringSmoothedFocal(
    marker.startFrame,
    frame,
    marker,
    options.getCursorPosition,
    followAnimation,
    followPadding,
    fps,
    options.cursorSmoothing,
  );
  // Mode A: the spring-tracked focal IS the cursor (within source bounds),
  // and the new computeTranslate keeps the cursor at its source-relative
  // screen position. No visible-window clamp needed — the geometry is
  // automatically valid for any focal ∈ [0, 1].
  return sourceClamp(followed.x, followed.y);
}

/**
 * Compute the zoom transform for a single ZoomMarker at a given frame.
 * Returns null if the frame is outside the marker's range.
 */
export function getZoomTransformForMarker(
  frame: Frame,
  marker: ZoomMarker,
  options?: ZoomTransformOptions,
): ZoomTransform | null {
  if (frame < marker.startFrame || frame >= marker.endFrame) return null;

  const targetScale = strengthToScale(marker.strength);
  const relFrame = frame - marker.startFrame;
  const totalDuration = marker.endFrame - marker.startFrame;

  let scale: number;

  if (relFrame < marker.zoomInDuration && marker.zoomInDuration > 0) {
    // Ramp-up phase
    const t = relFrame / marker.zoomInDuration;
    scale = 1 + (targetScale - 1) * smootherStep(t);
  } else if (
    relFrame >= totalDuration - marker.zoomOutDuration &&
    marker.zoomOutDuration > 0
  ) {
    // Ramp-down phase
    const framesIntoRamp = relFrame - (totalDuration - marker.zoomOutDuration);
    const t = framesIntoRamp / marker.zoomOutDuration;
    scale = targetScale - (targetScale - 1) * smootherStep(t);
  } else {
    // Hold phase
    scale = targetScale;
  }

  const focalPoint = getMarkerFocalPoint(frame, marker, scale, options);
  const { translateX, translateY } = computeTranslate(scale, focalPoint.x, focalPoint.y);

  return { scale, translateX, translateY };
}

/**
 * Get the zoom transform at a given frame across all markers.
 *
 * Connected zoom: when the gap between consecutive markers is <= CONNECTED_GAP_FRAMES,
 * pans between focal points without zooming out.
 */
export function getZoomTransformAtFrame(
  frame: Frame,
  markers: readonly ZoomMarker[],
  options?: ZoomTransformOptions,
): ZoomTransform {
  if (markers.length === 0) return IDENTITY;

  // Sort by startFrame
  const sorted = [...markers].sort((a, b) => a.startFrame - b.startFrame);

  const active = sorted
    .filter((marker) => frame >= marker.startFrame && frame < marker.endFrame)
    .sort((a, b) => {
      const durationDelta = (b.endFrame - b.startFrame) - (a.endFrame - a.startFrame);
      if (durationDelta !== 0) return durationDelta;
      if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
      return String(a.id).localeCompare(String(b.id));
    });

  if (active.length > 0) {
    return getZoomTransformForMarker(frame, active[0]!, options) ?? IDENTITY;
  }

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]!;
    const next = sorted[i + 1] ?? null;

    // Check for connected transition gap between m and next
    if (
      next !== null &&
      frame >= m.endFrame &&
      frame < next.startFrame &&
      next.startFrame - m.endFrame <= CONNECTED_GAP_FRAMES
    ) {
      const scaleA = strengthToScale(m.strength);
      const scaleB = strengthToScale(next.strength);
      const scale = Math.max(scaleA, scaleB);
      const gapDuration = next.startFrame - m.endFrame;
      const t = gapDuration > 0 ? (frame - m.endFrame) / gapDuration : 0;
      const eased = smootherStep(t);

      // Interpolate focal point
      const fx = m.focalPoint.x + (next.focalPoint.x - m.focalPoint.x) * eased;
      const fy = m.focalPoint.y + (next.focalPoint.y - m.focalPoint.y) * eased;

      const { translateX, translateY } = computeTranslate(scale, fx, fy);
      return { scale, translateX, translateY };
    }

  }

  return IDENTITY;
}
