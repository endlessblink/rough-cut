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

// Critically damped spring chasing a cursor-derived target. Integrates from
// `fromFrame` (inclusive) to `toFrame` (inclusive) so the engine remains a
// pure function: any call returns the same focal trajectory deterministic
// from the marker, cursor data, and integration range.
//
// Cursor input is pre-smoothed with an EMA filter to remove sub-pixel hand
// tremor and 30 Hz sample noise. The spring's target each step is the EMA-
// filtered cursor passed through the leash (using marker.targetScale for a
// stable radius), with a stationary-snap polish to eliminate micro-jitter
// when the cursor pauses.
//
// This is called only during the HOLD phase — ramp-in / ramp-out use a stable
// focal target with no cursor influence (see `getMarkerFocalPoint`).
function resolveSpringSmoothedFocal(
  fromFrame: Frame,
  toFrame: Frame,
  marker: ZoomMarker,
  getCursorPosition: (frame: Frame) => ZoomCursorPosition | null,
  followAnimation: 'focused' | 'smooth',
  followPadding: number,
  fps: number,
): ZoomCursorPosition {
  const cfg = CURSOR_SPRING[followAnimation];
  const emaAlpha = CURSOR_EMA_ALPHA[followAnimation];
  const dtMs = 1000 / Math.max(1, fps);
  const targetScale = strengthToScale(marker.strength);

  const stateX = createSpringState(marker.focalPoint.x);
  const stateY = createSpringState(marker.focalPoint.y);
  let emaX: number | null = null;
  let emaY: number | null = null;

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

    let targetX = marker.focalPoint.x;
    let targetY = marker.focalPoint.y;
    if (emaX !== null && emaY !== null) {
      const target = edgeSnapFocus({ x: emaX, y: emaY }, targetScale, followPadding);
      targetX = target.x;
      targetY = target.y;
    }

    // Source-bound clamp at the frame's current scale so the spring chases a
    // valid in-source target.
    const scaleAtF = getMarkerScale(f, marker, targetScale);
    const minXY = 1 / (2 * scaleAtF);
    const maxXY = 1 - 1 / (2 * scaleAtF);
    targetX = clamp(targetX, minXY, maxXY);
    targetY = clamp(targetY, minXY, maxXY);

    stepSpring(stateX, targetX, dtMs, cfg);
    stepSpring(stateY, targetY, dtMs, cfg);
  }

  return { x: stateX.value, y: stateY.value };
}

function edgeSnapFocus(
  cursor: ZoomCursorPosition,
  scale: number,
  snapToEdgesRatio: number,
): ZoomCursorPosition {
  const snap = clamp(snapToEdgesRatio, 0.05, 0.45);
  const minCenter = 1 / (2 * scale);
  const maxCenter = 1 - minCenter;
  const snappedX = clampedInterpolate(cursor.x, snap, 1 - snap);
  const snappedY = clampedInterpolate(cursor.y, snap, 1 - snap);
  return {
    x: minCenter + snappedX * (maxCenter - minCenter),
    y: minCenter + snappedY * (maxCenter - minCenter),
  };
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

function clampedInterpolate(value: number, inMin: number, inMax: number): number {
  if (inMax <= inMin) return 0;
  return clamp((value - inMin) / (inMax - inMin), 0, 1);
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
    );
    const contained = containCursorInVisibleWindow(
      followed,
      options.getCursorPosition(frame),
      scale,
    );
    return sourceClamp(contained.x, contained.y);
  }

  // Phase 3 — ramp-out: ignore live cursor movement, but do not stay fully
  // cursor-focused. As the scale returns to 1, ease the focal back to center
  // so the exit feels like revealing the full frame rather than tracking the
  // cursor until the last moment.
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
        ),
        options.getCursorPosition(Math.max(holdStart, holdEnd - 1)),
        strengthToScale(marker.strength),
      )
    : marker.focalPoint;
  const rampOutT =
    marker.zoomOutDuration > 0
      ? smootherStep((frame - holdEnd) / marker.zoomOutDuration)
      : 1;
  return sourceClamp(
    holdEndFocal.x + (0.5 - holdEndFocal.x) * rampOutT,
    holdEndFocal.y + (0.5 - holdEndFocal.y) * rampOutT,
  );
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
