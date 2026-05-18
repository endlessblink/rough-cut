// Pure project mutations for NLE clip operations.
// All return a NEW project object that can be fed straight back into
// `applyProjectChange` so the existing edit-history path records each as
// one undoable step.

import { splitClipAtFrame, applySplitOnTrack } from './timeline-frames.mjs';

// Local id generator. Stable enough across a single edit; the canonical
// id factory lives in packages/project-model but is CJS-difficult to use
// from a renderer .mjs. ids only need uniqueness within the document.
let _splitCounter = 0;
function newClipId(prefix) {
  _splitCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_splitCounter.toString(36)}`;
}

function findClipLocation(project, clipId) {
  const tracks = project?.document?.composition?.tracks;
  if (!Array.isArray(tracks)) return null;
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
      if (clips[clipIndex]?.id === clipId) {
        return { trackIndex, clipIndex, track, clip: clips[clipIndex] };
      }
    }
  }
  return null;
}

function replaceTrack(project, trackIndex, nextTrack) {
  const composition = project.document.composition;
  const tracks = composition.tracks.slice();
  tracks[trackIndex] = nextTrack;
  const nleTracks = replaceNleTrackClips(project.document.tracks, nextTrack.id, nextTrack.clips);
  return {
    ...project,
    document: {
      ...project.document,
      ...(nleTracks ? { tracks: nleTracks } : {}),
      composition: {
        ...composition,
        tracks,
      },
    },
  };
}

function replaceNleTrackClips(nleTracks, trackId, compositionClips) {
  if (!Array.isArray(nleTracks)) return null;
  let changed = false;
  const nextTracks = nleTracks.map((track) => {
    if (track?.id !== trackId) return track;
    changed = true;
    const currentClips = Array.isArray(track.clips) ? track.clips : [];
    return {
      ...track,
      clips: compositionClips.map((clip) => toNleClip(clip, currentClips)),
    };
  });
  return changed ? nextTracks : nleTracks;
}

function toNleClip(clip, currentClips) {
  const previous = currentClips.find((item) => item?.id === clip.id);
  return {
    id: clip.id,
    source: previous?.source ?? { kind: 'project-asset', id: clip.assetId },
    timelineIn: clip.timelineIn,
    timelineOut: clip.timelineOut,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
  };
}

// Remove a clip by id. Returns a new project, or the same reference when
// the clip isn't found.
export function removeClipById(project, clipId) {
  const loc = findClipLocation(project, clipId);
  if (!loc) return project;
  const { trackIndex, track, clipIndex } = loc;
  const nextClips = track.clips.slice();
  nextClips.splice(clipIndex, 1);
  return replaceTrack(project, trackIndex, { ...track, clips: nextClips });
}

// Split a clip at a timeline frame using the half-open invariant from
// timeline-frames.mjs. Returns a new project, or the same reference when
// the split is a no-op (clip not found, frame at edge, retimed clip).
export function splitClipById(project, clipId, splitFrame) {
  const loc = findClipLocation(project, clipId);
  if (!loc) return project;
  const split = splitClipAtFrame(loc.clip, splitFrame);
  if (!split) return project;
  const left = { ...split.left, id: newClipId('clip-l') };
  const right = { ...split.right, id: newClipId('clip-r') };
  const nextTrack = applySplitOnTrack(loc.track, clipId, left, right);
  return replaceTrack(project, loc.trackIndex, nextTrack);
}

export function canSplitClipById(project, clipId, splitFrame) {
  const loc = findClipLocation(project, clipId);
  return Boolean(loc && splitClipAtFrame(loc.clip, splitFrame));
}
