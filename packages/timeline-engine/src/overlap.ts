import type { Track, Clip, ClipId } from '@rough-cut/project-model';
import { frameIntervalsOverlap } from './select-clips.js';

/**
 * Find all clips on a track that overlap with a given clip.
 * Returns clips that share any frames with the target clip.
 * Optionally exclude a specific clip ID from the results.
 */
export function findOverlappingClips(track: Track, clip: Clip, excludeClipId?: ClipId): Clip[] {
  return track.clips.filter(
    (c) =>
      c.id !== clip.id &&
      (excludeClipId === undefined || c.id !== excludeClipId) &&
      frameIntervalsOverlap(c.timelineIn, c.timelineOut, clip.timelineIn, clip.timelineOut),
  );
}

/**
 * Check if placing a clip at a given position would cause overlaps.
 */
export function wouldOverlap(
  track: Track,
  clip: Clip,
  excludeClipId?: ClipId,
): boolean {
  return track.clips.some(
    (c) =>
      c.id !== clip.id &&
      c.id !== excludeClipId &&
      frameIntervalsOverlap(c.timelineIn, c.timelineOut, clip.timelineIn, clip.timelineOut),
  );
}
