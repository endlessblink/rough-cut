import type { Track, Clip } from '@rough-cut/project-model';

/**
 * Check if two frame intervals overlap.
 * Intervals are [start, end) — half-open.
 */
export function frameIntervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Select clips that are active (visible) at a specific frame on the timeline.
 * A clip is active at frame F if: clip.timelineIn <= F < clip.timelineOut
 * Non-visible tracks are skipped.
 */
export function selectActiveClipsAtFrame(
  tracks: readonly Track[],
  frame: number,
): Clip[] {
  const result: Clip[] = [];
  for (const track of tracks) {
    if (!track.visible) continue;
    for (const clip of track.clips) {
      if (clip.timelineIn <= frame && frame < clip.timelineOut) {
        result.push(clip);
      }
    }
  }
  return result;
}

/**
 * Select clips within a frame range [startFrame, endFrame).
 * A clip is in range if it overlaps with the range at all.
 */
export function getClipsInFrameRange(
  tracks: readonly Track[],
  startFrame: number,
  endFrame: number,
): Clip[] {
  const result: Clip[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (frameIntervalsOverlap(clip.timelineIn, clip.timelineOut, startFrame, endFrame)) {
        result.push(clip);
      }
    }
  }
  return result;
}
