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

function resolveTrackedCursor(
  frame: Frame,
  marker: ZoomMarker,
  getCursorPosition: (frame: Frame) => ZoomCursorPosition | null,
  followAnimation: 'focused' | 'smooth',
): ZoomCursorPosition | null {
  const lookbackFrames = followAnimation === 'smooth' ? 12 : 5;
  const startFrame = Math.max(marker.startFrame, frame - lookbackFrames + 1);
  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;

  for (let sampleFrame = startFrame; sampleFrame <= frame; sampleFrame += 1) {
    const position = getCursorPosition(sampleFrame);
    if (position === null) continue;
    const weight = sampleFrame - startFrame + 1;
    sumX += position.x * weight;
    sumY += position.y * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return null;

  return {
    x: clamp(sumX / totalWeight, 0, 1),
    y: clamp(sumY / totalWeight, 0, 1),
  };
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
    marker.kind !== 'auto' ||
    options?.followCursor !== true ||
    options.getCursorPosition === undefined
  ) {
    return marker.focalPoint;
  }

  const trackedCursor = resolveTrackedCursor(
    frame,
    marker,
    options.getCursorPosition,
    options.followAnimation ?? 'focused',
  );
  if (trackedCursor === null) {
    return marker.focalPoint;
  }

  const followed = resolveFollowFocalPoint(
    marker,
    trackedCursor,
    scale,
    options.followPadding ?? 0.18,
  );

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
