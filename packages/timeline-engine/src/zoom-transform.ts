import type { ZoomMarker, Frame } from '@rough-cut/project-model';

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

// Critically damped spring stiffness presets (units: 1/sec²). Damping is
// derived as 2*sqrt(stiffness) for critical damping (no overshoot, fastest
// settle without oscillation). Settle time ≈ 4/sqrt(stiffness).
//   smooth:   stiffness 80  → ≈0.45 s settle. Cinematic, Apple-style feel.
//   focused:  stiffness 200 → ≈0.28 s settle. Snappy, responsive.
const SPRING_STIFFNESS: Record<'smooth' | 'focused', number> = {
  smooth: 80,
  focused: 200,
};

// Stationary-snap polish (per open-recorder): if the spring TARGET hasn't
// moved more than this normalized epsilon for STATIONARY_FRAMES consecutive
// steps, snap position to target and zero velocity. Eliminates micro-
// oscillation when cursor pauses.
const STATIONARY_EPSILON = 0.001;
const STATIONARY_FRAMES = 2;

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

// Critically damped spring chasing the cursor-derived target focal point.
// Integrates from marker.startFrame so the engine remains a pure function:
// each call is independent of any previous call, but the focal trajectory
// is identical to a stateful per-frame integration. O(F) per call where F
// is frames since marker.startFrame — trivial in practice.
//
// The spring's target each step is the cursor position passed through the
// existing leash (using marker.targetScale for stable radius across ramps),
// then source-bound clamped at the FRAME's current scale. By feeding the
// spring a target that's always inside the source, the spring never has to
// fight a clamp that shifts during ramps — the dominant wobble cause in the
// previous lookback-averaging approach.
function resolveSpringSmoothedFocal(
  frame: Frame,
  marker: ZoomMarker,
  getCursorPosition: (frame: Frame) => ZoomCursorPosition | null,
  followAnimation: 'focused' | 'smooth',
  followPadding: number,
  fps: number,
): ZoomCursorPosition {
  const stiffness = SPRING_STIFFNESS[followAnimation];
  const damping = 2 * Math.sqrt(stiffness);
  const dt = 1 / Math.max(1, fps);
  const targetScale = strengthToScale(marker.strength);

  let posX = marker.focalPoint.x;
  let posY = marker.focalPoint.y;
  let velX = 0;
  let velY = 0;
  let prevTargetX = marker.focalPoint.x;
  let prevTargetY = marker.focalPoint.y;
  let stationaryCount = 0;

  for (let f = marker.startFrame; f <= frame; f += 1) {
    const cursor = getCursorPosition(f);
    const scaleAtF = getMarkerScale(f, marker, targetScale);

    // Follow strength derived from scale: 0 at the ramp endpoints (scale=1),
    // 1 at full hold (scale=targetScale). This tapers cursor influence at the
    // boundaries so the focal is anchored at marker.focalPoint when scale=1
    // (where the source-bound clamp would force it to 0.5 anyway), preventing
    // the rapid focal travel as the clamp tightens during zoom-out.
    const followStrength =
      targetScale > 1 ? clamp((scaleAtF - 1) / (targetScale - 1), 0, 1) : 1;

    let leashedX = marker.focalPoint.x;
    let leashedY = marker.focalPoint.y;
    if (cursor !== null) {
      const leashed = resolveFollowFocalPoint(marker, cursor, targetScale, followPadding);
      leashedX = leashed.x;
      leashedY = leashed.y;
    }

    let targetX = marker.focalPoint.x + (leashedX - marker.focalPoint.x) * followStrength;
    let targetY = marker.focalPoint.y + (leashedY - marker.focalPoint.y) * followStrength;

    const minXY = 1 / (2 * scaleAtF);
    const maxXY = 1 - 1 / (2 * scaleAtF);
    targetX = clamp(targetX, minXY, maxXY);
    targetY = clamp(targetY, minXY, maxXY);

    const targetMoved =
      Math.abs(targetX - prevTargetX) > STATIONARY_EPSILON ||
      Math.abs(targetY - prevTargetY) > STATIONARY_EPSILON;
    if (!targetMoved) {
      stationaryCount += 1;
      if (stationaryCount >= STATIONARY_FRAMES) {
        posX = targetX;
        posY = targetY;
        velX = 0;
        velY = 0;
        prevTargetX = targetX;
        prevTargetY = targetY;
        continue;
      }
    } else {
      stationaryCount = 0;
    }
    prevTargetX = targetX;
    prevTargetY = targetY;

    const accelX = stiffness * (targetX - posX) - damping * velX;
    const accelY = stiffness * (targetY - posY) - damping * velY;
    velX += accelX * dt;
    velY += accelY * dt;
    posX += velX * dt;
    posY += velY * dt;
  }

  return { x: posX, y: posY };
}

function resolveFollowFocalPoint(
  marker: ZoomMarker,
  trackedCursor: ZoomCursorPosition,
  scale: number,
  followPadding: number,
): ZoomCursorPosition {
  const padding = clamp(followPadding, 0, 0.3);
  const visibleWidth = 1 / scale;
  const visibleHeight = 1 / scale;
  const allowedDx = Math.max(0, visibleWidth * (0.5 - padding));
  const allowedDy = Math.max(0, visibleHeight * (0.5 - padding));
  const minCenterX = visibleWidth / 2;
  const maxCenterX = 1 - visibleWidth / 2;
  const minCenterY = visibleHeight / 2;
  const maxCenterY = 1 - visibleHeight / 2;

  return {
    x: clamp(
      clamp(marker.focalPoint.x, trackedCursor.x - allowedDx, trackedCursor.x + allowedDx),
      minCenterX,
      maxCenterX,
    ),
    y: clamp(
      clamp(marker.focalPoint.y, trackedCursor.y - allowedDy, trackedCursor.y + allowedDy),
      minCenterY,
      maxCenterY,
    ),
  };
}

function getMarkerFocalPoint(
  frame: Frame,
  marker: ZoomMarker,
  scale: number,
  options: ZoomTransformOptions | undefined,
): ZoomCursorPosition {
  if (
    options?.followCursor !== true ||
    options.getCursorPosition === undefined
  ) {
    return marker.focalPoint;
  }

  const followed = resolveSpringSmoothedFocal(
    frame,
    marker,
    options.getCursorPosition,
    options.followAnimation ?? 'smooth',
    options.followPadding ?? 0.22,
    options.fps ?? 30,
  );

  // Spring targets are clamped per-step inside the integration, but apply the
  // current-frame source-bound clamp once more here as a safety net for any
  // transient overshoot during integration.
  return {
    x: clamp(followed.x, 1 / (2 * scale), 1 - 1 / (2 * scale)),
    y: clamp(followed.y, 1 / (2 * scale), 1 - 1 / (2 * scale)),
  };
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

    const result = getZoomTransformForMarker(frame, m, options);
    if (result !== null) return result;
  }

  return IDENTITY;
}
