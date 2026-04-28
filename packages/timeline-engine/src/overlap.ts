import type { Track, Clip, ClipId } from '@rough-cut/project-model';
import { frameIntervalsOverlap } from './select-clips.js';

declare const crypto: { randomUUID(): string };

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

/**
 * Resolve overlaps between a dropped clip and existing clips on a track.
 * Returns the modified clips array with existing clips split/trimmed/deleted
 * to make room for the dropped clip. The dropped clip itself is NOT included
 * in the result — caller adds it separately.
 *
 * Uses overwrite semantics (like Premiere/Kdenlive overwrite mode):
 * - Fully covered clips -> removed
 * - Partial left overlap -> trim existing clip's right edge to dropIn
 * - Partial right overlap -> trim existing clip's left edge to dropOut
 * - Middle split -> existing clip split into two pieces around the drop zone
 */
export function resolveOverlaps(
  existingClips: readonly Clip[],
  dropIn: number,
  dropOut: number,
): Clip[] {
  const result: Clip[] = [];

  for (const clip of existingClips) {
    if (!frameIntervalsOverlap(clip.timelineIn, clip.timelineOut, dropIn, dropOut)) {
      result.push(clip);
      continue;
    }

    if (clip.timelineIn >= dropIn && clip.timelineOut <= dropOut) {
      continue;
    }

    if (clip.timelineIn < dropIn && clip.timelineOut > dropOut) {
      const leftClip: Clip = {
        ...clip,
        id: crypto.randomUUID() as ClipId,
        timelineOut: dropIn,
        sourceOut: clip.sourceIn + (dropIn - clip.timelineIn),
      };
      const rightClip: Clip = {
        ...clip,
        id: crypto.randomUUID() as ClipId,
        timelineIn: dropOut,
        sourceIn: clip.sourceIn + (dropOut - clip.timelineIn),
      };
      result.push(leftClip, rightClip);
      continue;
    }

    if (clip.timelineIn < dropIn) {
      const trimmed: Clip = {
        ...clip,
        timelineOut: dropIn,
        sourceOut: clip.sourceIn + (dropIn - clip.timelineIn),
      };
      result.push(trimmed);
      continue;
    }

    const trimmed: Clip = {
      ...clip,
      timelineIn: dropOut,
      sourceIn: clip.sourceIn + (dropOut - clip.timelineIn),
    };
    result.push(trimmed);
  }

  return result;
}
