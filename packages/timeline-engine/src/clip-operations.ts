import type { Clip, ClipId, TrackId } from '@rough-cut/project-model';

// crypto.randomUUID is available globally in Node 20+
declare const crypto: { randomUUID(): string };

/**
 * Split a clip at a given frame into two clips.
 * Returns [leftClip, rightClip] or null if frame is outside clip bounds.
 * Both clips get new IDs. The original clip is not modified.
 */
export function splitClip(clip: Clip, frame: number): [Clip, Clip] | null {
  // Frame must be strictly inside the clip (not at boundaries)
  if (frame <= clip.timelineIn || frame >= clip.timelineOut) {
    return null;
  }

  const sourceOffset = frame - clip.timelineIn;

  const leftClip: Clip = {
    ...clip,
    id: crypto.randomUUID() as ClipId,
    timelineOut: frame,
    sourceOut: clip.sourceIn + sourceOffset,
  };

  const rightClip: Clip = {
    ...clip,
    id: crypto.randomUUID() as ClipId,
    timelineIn: frame,
    sourceIn: clip.sourceIn + sourceOffset,
  };

  return [leftClip, rightClip];
}

/**
 * Trim a clip from the left (move sourceIn and timelineIn forward).
 * Returns a new clip or null if the trim would reduce duration to 0 or push sourceIn below 0.
 */
export function trimClipLeft(clip: Clip, newTimelineIn: number, _sourceDuration?: number): Clip | null {
  if (newTimelineIn >= clip.timelineOut) {
    return null;
  }

  const delta = newTimelineIn - clip.timelineIn;
  const newSourceIn = clip.sourceIn + delta;

  // Clamp: sourceIn can't go below 0
  if (newSourceIn < 0) return null;

  return {
    ...clip,
    timelineIn: newTimelineIn,
    sourceIn: newSourceIn,
  };
}

/**
 * Trim a clip from the right (move timelineOut backward).
 * Returns a new clip or null if the trim would reduce duration to 0 or push sourceOut past the source.
 */
export function trimClipRight(clip: Clip, newTimelineOut: number, sourceDuration?: number): Clip | null {
  if (newTimelineOut <= clip.timelineIn) {
    return null;
  }

  const delta = clip.timelineOut - newTimelineOut;
  const newSourceOut = clip.sourceOut - delta;

  // Clamp: sourceOut can't exceed source duration (if known)
  if (sourceDuration !== undefined && newSourceOut > sourceDuration) return null;
  // Clamp: sourceOut can't go below 0
  if (newSourceOut < 0) return null;

  return {
    ...clip,
    timelineOut: newTimelineOut,
    sourceOut: newSourceOut,
  };
}

/**
 * Move a clip to a new position on the timeline.
 * Returns a new clip with updated timelineIn/timelineOut.
 */
export function moveClip(clip: Clip, newTimelineIn: number): Clip {
  const duration = clip.timelineOut - clip.timelineIn;
  return {
    ...clip,
    timelineIn: newTimelineIn,
    timelineOut: newTimelineIn + duration,
  };
}

/**
 * Move a clip to a different track.
 * Returns a new clip with updated trackId.
 */
export function moveClipToTrack(clip: Clip, newTrackId: TrackId): Clip {
  return {
    ...clip,
    trackId: newTrackId,
  };
}
