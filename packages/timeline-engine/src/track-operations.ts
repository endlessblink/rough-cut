import type { Track, Clip, ClipId } from '@rough-cut/project-model';

/**
 * Place a clip on a track, inserting it at the given position.
 * Returns a new track with the clip added to its clips array.
 * Does NOT check for overlaps — use resolveOverlaps separately.
 */
export function addClipToTrack(track: Track, clip: Clip): Track {
  return {
    ...track,
    clips: [...track.clips, clip],
  };
}

/**
 * Remove a clip from a track by ID.
 * Returns a new track without the clip.
 */
export function removeClipFromTrack(track: Track, clipId: ClipId): Track {
  return {
    ...track,
    clips: track.clips.filter((c) => c.id !== clipId),
  };
}

/**
 * Replace a clip on a track (used after split, trim, etc.).
 * Returns a new track with the old clip replaced by the new one(s).
 */
export function replaceClipOnTrack(
  track: Track,
  oldClipId: ClipId,
  ...newClips: Clip[]
): Track {
  const clips: Clip[] = [];
  for (const c of track.clips) {
    if (c.id === oldClipId) {
      clips.push(...newClips);
    } else {
      clips.push(c);
    }
  }
  return {
    ...track,
    clips,
  };
}

/**
 * Get the end frame of the last clip on a track.
 * Returns 0 if the track has no clips.
 */
export function getTrackEndFrame(track: Track): number {
  let max = 0;
  for (const clip of track.clips) {
    if (clip.timelineOut > max) {
      max = clip.timelineOut;
    }
  }
  return max;
}
