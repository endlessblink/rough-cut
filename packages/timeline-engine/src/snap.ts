import type { Track, ClipId } from '@rough-cut/project-model';

/**
 * Find the nearest snap point for a given frame.
 * Snap points include: clip edges (timelineIn/timelineOut).
 * Returns the snap target frame if within threshold, otherwise the original frame.
 */
export function snapToNearestEdge(
  frame: number,
  tracks: readonly Track[],
  threshold: number,
  excludeClipId?: ClipId,
): { frame: number; snapped: boolean; snapTarget?: number } {
  let nearestDistance = Infinity;
  let nearestEdge: number | undefined;

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) {
        continue;
      }

      const distIn = Math.abs(frame - clip.timelineIn);
      if (distIn < nearestDistance) {
        nearestDistance = distIn;
        nearestEdge = clip.timelineIn;
      }

      const distOut = Math.abs(frame - clip.timelineOut);
      if (distOut < nearestDistance) {
        nearestDistance = distOut;
        nearestEdge = clip.timelineOut;
      }
    }
  }

  if (nearestEdge !== undefined && nearestDistance <= threshold) {
    return { frame: nearestEdge, snapped: true, snapTarget: nearestEdge };
  }

  return { frame, snapped: false };
}

/**
 * Snap to the current playhead frame if within threshold.
 */
export function snapToPlayhead(
  frame: number,
  playheadFrame: number,
  threshold: number,
): { frame: number; snapped: boolean; snapTarget?: number } {
  const distance = Math.abs(frame - playheadFrame);
  if (distance <= threshold) {
    return { frame: playheadFrame, snapped: true, snapTarget: playheadFrame };
  }
  return { frame, snapped: false };
}

/**
 * Snap to the nearest multiple of gridFrames if within threshold.
 * gridFrames must be a positive integer; otherwise no snapping occurs.
 */
export function snapToGrid(
  frame: number,
  gridFrames: number,
  threshold: number,
): { frame: number; snapped: boolean; snapTarget?: number } {
  if (gridFrames <= 0) {
    return { frame, snapped: false };
  }
  const nearestMultiple = Math.round(frame / gridFrames) * gridFrames;
  const distance = Math.abs(frame - nearestMultiple);
  if (distance <= threshold) {
    return { frame: nearestMultiple, snapped: true, snapTarget: nearestMultiple };
  }
  return { frame, snapped: false };
}
