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
 * The focal point is in normalized coords (0–1), with 0.5 being center.
 * Returns the CSS translate offset as a fraction of container size.
 */
function computeTranslate(
  scale: number,
  focalX: number,
  focalY: number,
): { translateX: number; translateY: number } {
  // At scale S, the visible window is 1/S of the source.
  // Maximum pan range in each direction:
  const maxOffsetX = (1 - 1 / scale) / 2;
  const maxOffsetY = (1 - 1 / scale) / 2;

  // Desired offset from center
  const desiredX = focalX - 0.5;
  const desiredY = focalY - 0.5;

  // Clamp to available pan range
  const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, desiredX));
  const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, desiredY));

  // Negate because to pan the viewport toward the focal point,
  // we move the content in the opposite direction
  return {
    translateX: -clampedX * scale,
    translateY: -clampedY * scale,
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

function getMarkerScale(
  frame: Frame,
  marker: ZoomMarker,
  targetScale: number,
): number {
  if (frame < marker.startFrame || frame >= marker.endFrame) return 1;
  const relFrame = frame - marker.startFrame;
  const totalDuration = marker.endFrame - marker.startFrame;
  if (relFrame < marker.zoomInDuration && marker.zoomInDuration > 0) {
    const t = relFrame / marker.zoomInDuration;
    return 1 + (targetScale - 1) * smootherStep(t);
  }
  if (relFrame >= totalDuration - marker.zoomOutDuration && marker.zoomOutDuration > 0) {
    const framesIntoRamp = relFrame - (totalDuration - marker.zoomOutDuration);
    const t = framesIntoRamp / marker.zoomOutDuration;
    return targetScale - (targetScale - 1) * smootherStep(t);
  }
  return targetScale;
}

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
// Integrates from `fromFrame` to `toFrame` so the function stays pure for
// deterministic export.
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

  // Camera target — what we want the spring to chase. Initialized at the
  // marker's authored focal point, then nudged once by the cursor at
  // fromFrame so the spring's rest state matches where the safe-zone logic
  // would converge. Without this, frame 0 of the hold phase falls back to
  // marker.focalPoint while frame 1 jumps to the safe-zone position — a
  // large visible camera move on the first hold frame.
  let camTargetX = marker.focalPoint.x;
  let camTargetY = marker.focalPoint.y;
  let emaX: number | null = null;
  let emaY: number | null = null;

  const seedRaw = getCursorPosition(fromFrame);
  if (seedRaw !== null) {
    emaX = seedRaw.x;
    emaY = seedRaw.y;
    const seedScale = getMarkerScale(fromFrame, marker, targetScale);
    const seedHalfSpan = 1 / (2 * seedScale);
    const seedInset = seedHalfSpan * 2 * safeZoneRatio;
    const seedSafeLeft = camTargetX - seedHalfSpan + seedInset;
    const seedSafeRight = camTargetX + seedHalfSpan - seedInset;
    const seedSafeTop = camTargetY - seedHalfSpan + seedInset;
    const seedSafeBottom = camTargetY + seedHalfSpan - seedInset;
    if (seedRaw.x < seedSafeLeft) camTargetX -= seedSafeLeft - seedRaw.x;
    else if (seedRaw.x > seedSafeRight) camTargetX += seedRaw.x - seedSafeRight;
    if (seedRaw.y < seedSafeTop) camTargetY -= seedSafeTop - seedRaw.y;
    else if (seedRaw.y > seedSafeBottom) camTargetY += seedRaw.y - seedSafeBottom;
    const seedMinXY = seedHalfSpan;
    const seedMaxXY = 1 - seedHalfSpan;
    camTargetX = clamp(camTargetX, seedMinXY, seedMaxXY);
    camTargetY = clamp(camTargetY, seedMinXY, seedMaxXY);
  }

  const stateX = createSpringState(camTargetX);
  const stateY = createSpringState(camTargetY);

  for (let f = fromFrame + 1; f <= toFrame; f += 1) {
    const raw = getCursorPosition(f);

    if (raw !== null) {
      if (emaX === null || emaY === null) {
        emaX = raw.x;
        emaY = raw.y;
      } else {
        emaX = emaX + (raw.x - emaX) * emaAlpha;
        emaY = emaY + (raw.y - emaY) * emaAlpha;
      }
    }

    if (emaX !== null && emaY !== null) {

      const scaleAtF = getMarkerScale(f, marker, targetScale);
      const halfSpan = 1 / (2 * scaleAtF);
      const visibleSpan = halfSpan * 2;
      const inset = visibleSpan * safeZoneRatio;

      // Safe zone in source-normalized coords, centered on current camera target
      const safeLeft = camTargetX - halfSpan + inset;
      const safeRight = camTargetX + halfSpan - inset;
      const safeTop = camTargetY - halfSpan + inset;
      const safeBottom = camTargetY + halfSpan - inset;

      // Shift the camera ONLY when the cursor leaves the safe zone, and only
      // by enough to put the cursor back at the safe-zone edge. This produces
      // a piecewise-constant target — spring rests for most of the timeline.
      if (emaX < safeLeft) camTargetX -= safeLeft - emaX;
      else if (emaX > safeRight) camTargetX += emaX - safeRight;
      if (emaY < safeTop) camTargetY -= safeTop - emaY;
      else if (emaY > safeBottom) camTargetY += emaY - safeBottom;

      // Source-bound clamp so the camera target never points outside the
      // valid in-source window for the current scale.
      const minXY = 1 / (2 * scaleAtF);
      const maxXY = 1 - 1 / (2 * scaleAtF);
      camTargetX = clamp(camTargetX, minXY, maxXY);
      camTargetY = clamp(camTargetY, minXY, maxXY);
    }

    stepSpring(stateX, camTargetX, dtMs, cfg);
    stepSpring(stateY, camTargetY, dtMs, cfg);
  }

  return { x: stateX.value, y: stateY.value };
}

function containCursorInVisibleWindow(
  focal: ZoomCursorPosition,
  cursor: ZoomCursorPosition | null,
  scale: number,
): ZoomCursorPosition {
  if (cursor === null) return focal;
  const halfVisibleWidth = 1 / (2 * scale);
  const halfVisibleHeight = 1 / (2 * scale);
  let x = focal.x;
  let y = focal.y;

  if (cursor.x < x - halfVisibleWidth) x = cursor.x + halfVisibleWidth;
  if (cursor.x > x + halfVisibleWidth) x = cursor.x - halfVisibleWidth;
  if (cursor.y < y - halfVisibleHeight) y = cursor.y + halfVisibleHeight;
  if (cursor.y > y + halfVisibleHeight) y = cursor.y - halfVisibleHeight;

  return {
    x: clamp(x, halfVisibleWidth, 1 - halfVisibleWidth),
    y: clamp(y, halfVisibleHeight, 1 - halfVisibleHeight),
  };
}

// Phase-aware focal point resolution. The marker's life splits into three
// phases with discrete behaviors so cursor influence never compounds with
// scale change (the dominant wobble cause):
//   1. Ramp-in:  stable marker/action focal while scale eases in
//   2. Hold:     spring tracks EMA-filtered cursor through edge-snap mapping
//   3. Ramp-out: ease hold-end focus back toward center while scale returns to 1
// In every phase the result is then source-bound clamped at the current scale.
function getMarkerFocalPoint(
  frame: Frame,
  marker: ZoomMarker,
  scale: number,
  options: ZoomTransformOptions | undefined,
): ZoomCursorPosition {
  const minXY = 1 / (2 * scale);
  const maxXY = 1 - 1 / (2 * scale);
  const sourceClamp = (x: number, y: number) => ({
    x: clamp(x, minXY, maxXY),
    y: clamp(y, minXY, maxXY),
  });

  // Cursor-follow disabled (or no cursor data wired): static focal.
  if (
    options?.followCursor !== true ||
    options.getCursorPosition === undefined
  ) {
    return sourceClamp(marker.focalPoint.x, marker.focalPoint.y);
  }

  const followAnimation = options.followAnimation ?? 'smooth';
  const followPadding = options.followPadding ?? 0.25;
  const fps = options.fps ?? 30;

  const holdStart = marker.startFrame + marker.zoomInDuration;
  const holdEnd = marker.endFrame - marker.zoomOutDuration;
  const hasHold = holdEnd > holdStart;

  // Phase 1 — ramp-in: keep the focal target stable while scale changes.
  // Chasing or lerping focal during the scale ramp creates visible jitter.
  if (frame < holdStart) {
    return sourceClamp(marker.focalPoint.x, marker.focalPoint.y);
  }

  // Phase 2 — hold: spring tracks filtered cursor, guarded against losing
  // the cursor outside the visible window.
  if (frame < holdEnd && hasHold) {
    const followed = resolveSpringSmoothedFocal(
      holdStart,
      frame,
      marker,
      options.getCursorPosition,
      followAnimation,
      followPadding,
      fps,
      options.cursorSmoothing,
    );
    const contained = containCursorInVisibleWindow(
      followed,
      options.getCursorPosition(frame),
      scale,
    );
    return sourceClamp(contained.x, contained.y);
  }

  // Phase 3 — ramp-out: freeze the focal at the last hold position (Recordly's
  // `frozenFocus` pattern). Easing toward center actively pulls the camera
  // away from the cursor while the viewport is still zoomed in — cropping the
  // cursor. By holding the focal, the source-bound clamp naturally slides it
  // toward 0.5 as scale → 1, so the cursor stays inside the widening window
  // and the marker exits cleanly at center when scale reaches 1.
  const holdEndFocal = hasHold
    ? containCursorInVisibleWindow(
        resolveSpringSmoothedFocal(
          holdStart,
          Math.max(holdStart, holdEnd - 1),
          marker,
          options.getCursorPosition,
          followAnimation,
          followPadding,
          fps,
          options.cursorSmoothing,
        ),
        options.getCursorPosition(Math.max(holdStart, holdEnd - 1)),
        strengthToScale(marker.strength),
      )
    : marker.focalPoint;
  return sourceClamp(holdEndFocal.x, holdEndFocal.y);
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
