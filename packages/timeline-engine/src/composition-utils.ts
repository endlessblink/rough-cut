import type { Track, ClipId, Clip } from '@rough-cut/project-model';

/**
 * Calculate the total duration of a composition based on its clips.
 * Returns the frame number of the last clip's timelineOut across all tracks.
 */
export function calculateCompositionDuration(tracks: readonly Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.timelineOut > max) {
        max = clip.timelineOut;
      }
    }
  }
  return max;
}

/**
 * Ripple delete: after removing a clip, shift all subsequent clips left to fill the gap.
 * Returns a new track with updated clip positions.
 */
export function rippleDelete(track: Track, clipId: ClipId): Track {
  const targetClip = track.clips.find((c) => c.id === clipId);
  if (!targetClip) {
    return track;
  }

  const gapDuration = targetClip.timelineOut - targetClip.timelineIn;

  const newClips: Clip[] = [];
  for (const clip of track.clips) {
    if (clip.id === clipId) {
      // Remove this clip
      continue;
    }
    if (clip.timelineIn >= targetClip.timelineOut) {
      // Shift left by the gap duration
      newClips.push({
        ...clip,
        timelineIn: clip.timelineIn - gapDuration,
        timelineOut: clip.timelineOut - gapDuration,
      });
    } else {
      newClips.push(clip);
    }
  }

  return {
    ...track,
    clips: newClips,
  };
}
