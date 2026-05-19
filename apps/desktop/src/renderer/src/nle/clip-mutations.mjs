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
  const document = project?.document;
  const candidates = [document?.timeline?.tracks, document?.tracks, document?.composition?.tracks];

  for (const tracks of candidates) {
    if (!Array.isArray(tracks)) continue;
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      const track = tracks[trackIndex];
      const clips = Array.isArray(track?.clips) ? track.clips : [];
      for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
        if (clips[clipIndex]?.id === clipId) {
          return { trackIndex, clipIndex, track, clip: clips[clipIndex] };
        }
      }
    }
  }
  return null;
}

function replaceTrack(project, loc, nextTrack) {
  const trackId = nextTrack?.id ?? loc.track?.id;
  const composition = project.document.composition;
  const compositionTracks = replaceCompositionTrack(project.document.composition?.tracks, trackId, nextTrack);
  const nleTracks = replaceNleTrack(project.document.tracks, trackId, nextTrack, { appendIfMissing: true });
  const timelineTracks = replaceNleTrack(project.document.timeline?.tracks, trackId, nextTrack, { appendIfMissing: true });
  return {
    ...project,
    document: {
      ...project.document,
      ...(nleTracks ? { tracks: nleTracks } : {}),
      ...(project.document.timeline
        ? {
            timeline: {
              ...project.document.timeline,
              ...(timelineTracks ? { tracks: timelineTracks } : {}),
            },
          }
        : {}),
      composition: {
        ...composition,
        ...(compositionTracks ? { tracks: compositionTracks } : {}),
      },
    },
  };
}

function replaceNleTrack(nleTracks, trackId, nextTrack, options = {}) {
  if (!Array.isArray(nleTracks)) return null;
  let changed = false;
  const nextTracks = nleTracks.map((track) => {
    if (track?.id !== trackId) return track;
    changed = true;
    const currentClips = Array.isArray(track.clips) ? track.clips : [];
    return {
      ...track,
      clips: (nextTrack.clips ?? []).map((clip) => toNleClip(clip, currentClips)),
    };
  });
  if (changed) return nextTracks;
  if (options.appendIfMissing) {
    return [
      ...nleTracks,
      {
        ...nextTrack,
        clips: (nextTrack.clips ?? []).map((clip) => toNleClip(clip, [])),
      },
    ];
  }
  return nleTracks;
}

function replaceCompositionTrack(compositionTracks, trackId, nextTrack) {
  if (!Array.isArray(compositionTracks)) return null;
  let changed = false;
  const nextTracks = compositionTracks.map((track) => {
    if (track?.id !== trackId) return track;
    changed = true;
    const currentClips = Array.isArray(track.clips) ? track.clips : [];
    return {
      ...track,
      clips: (nextTrack.clips ?? []).map((clip) => toCompositionClip(clip, currentClips)),
    };
  });
  return changed ? nextTracks : compositionTracks;
}

function toNleClip(clip, currentClips) {
  const previous = currentClips.find((item) => item?.id === clip.id);
  const source = clip.source && typeof clip.source === 'object' ? clip.source : null;
  return {
    id: clip.id,
    source: previous?.source ?? source ?? { kind: 'project-asset', id: clip.assetId },
    timelineIn: clip.timelineIn,
    timelineOut: clip.timelineOut,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
  };
}

function toCompositionClip(clip, currentClips) {
  const previous = currentClips.find((item) => item?.id === clip.id);
  const source = clip.source && typeof clip.source === 'object' ? clip.source : null;
  const assetId = previous?.assetId ?? clip.assetId ?? (source?.kind === 'project-asset' ? source.id : undefined);
  return {
    ...(previous ?? {}),
    id: clip.id,
    ...(assetId ? { assetId } : {}),
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
  const { track, clipIndex } = loc;
  const nextClips = track.clips.slice();
  nextClips.splice(clipIndex, 1);
  return replaceTrack(project, loc, { ...track, clips: nextClips });
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
  return replaceTrack(project, loc, nextTrack);
}

export function canSplitClipById(project, clipId, splitFrame) {
  const loc = findClipLocation(project, clipId);
  return Boolean(loc && splitClipAtFrame(loc.clip, splitFrame));
}

export function trimClipById(project, clipId, edge, frame) {
  const loc = findClipLocation(project, clipId);
  if (!loc) return project;
  const normalizedEdge = edge === 'left' || edge === 'right' ? edge : null;
  const nextFrame = Math.round(Number(frame));
  if (!normalizedEdge || !Number.isFinite(nextFrame)) return project;

  const { track, clip, clipIndex } = loc;
  const timelineIn = Number(clip.timelineIn);
  const timelineOut = Number(clip.timelineOut);
  const sourceIn = Number(clip.sourceIn ?? 0);
  const sourceOut = Number(clip.sourceOut ?? sourceIn + (timelineOut - timelineIn));
  if (![timelineIn, timelineOut, sourceIn, sourceOut].every(Number.isFinite)) return project;

  const minSpan = 1;
  const linkedAssetIds = linkedAssetIdsForClip(project, clip);
  if (linkedAssetIds.size > 0) {
    const delta = normalizedEdge === 'left' ? nextFrame - timelineIn : nextFrame - timelineOut;
    const clampedDelta = clampLinkedTrimDelta(project, linkedAssetIds, normalizedEdge, delta, minSpan);
    if (clampedDelta === 0) return project;
    return trimLinkedAssetClips(project, linkedAssetIds, normalizedEdge, clampedDelta);
  }

  const previousClip = nearestPreviousClip(track.clips, clipIndex);
  const nextClip = nearestNextClip(track.clips, clipIndex);
  const compositionDuration = Number(project?.document?.composition?.duration);
  const trackStart = Math.max(0, Number(previousClip?.timelineOut ?? 0));
  const trackEnd = Math.min(
    Number.isFinite(compositionDuration) && compositionDuration > 0 ? compositionDuration : Number.POSITIVE_INFINITY,
    Number(nextClip?.timelineIn ?? Number.POSITIVE_INFINITY),
  );

  let nextClipValue = null;
  if (normalizedEdge === 'left') {
    const maxLeft = timelineOut - minSpan;
    const minLeft = Math.max(trackStart, timelineIn - sourceIn);
    const nextIn = Math.max(minLeft, Math.min(maxLeft, nextFrame));
    if (nextIn === timelineIn) return project;
    const delta = nextIn - timelineIn;
    nextClipValue = { ...clip, timelineIn: nextIn, sourceIn: sourceIn + delta };
  } else {
    const minRight = timelineIn + minSpan;
    const maxRight = trackEnd;
    const nextOut = Math.max(minRight, Math.min(maxRight, nextFrame));
    if (nextOut === timelineOut) return project;
    const delta = nextOut - timelineOut;
    nextClipValue = { ...clip, timelineOut: nextOut, sourceOut: sourceOut + delta };
  }

  const nextClips = track.clips.slice();
  nextClips[clipIndex] = nextClipValue;
  return replaceTrack(project, loc, { ...track, clips: nextClips });
}

export function moveClipById(project, clipId, targetTimelineIn) {
  const loc = findClipLocation(project, clipId);
  if (!loc) return project;
  const nextIn = Math.round(Number(targetTimelineIn));
  if (!Number.isFinite(nextIn)) return project;

  const { track, clip, clipIndex } = loc;
  const timelineIn = Number(clip.timelineIn);
  const timelineOut = Number(clip.timelineOut);
  if (![timelineIn, timelineOut].every(Number.isFinite) || timelineOut <= timelineIn) return project;

  const duration = timelineOut - timelineIn;
  const previousClip = nearestPreviousClip(track.clips, clipIndex);
  const nextClip = nearestNextClip(track.clips, clipIndex);
  const compositionDuration = Number(project?.document?.composition?.duration);
  const minIn = Math.max(0, Number(previousClip?.timelineOut ?? 0));
  const maxOut = Math.min(
    Number.isFinite(compositionDuration) && compositionDuration > 0 ? compositionDuration : Number.POSITIVE_INFINITY,
    Number(nextClip?.timelineIn ?? Number.POSITIVE_INFINITY),
  );
  const linkedAssetIds = linkedAssetIdsForClip(project, clip);
  if (linkedAssetIds.size > 0) {
    const delta = clampLinkedAssetDelta(project, linkedAssetIds, nextIn - timelineIn);
    if (delta === 0) return project;
    return moveLinkedAssetClips(project, linkedAssetIds, delta);
  }

  const clampedIn = Math.max(minIn, Math.min(maxOut - duration, nextIn));
  if (clampedIn === timelineIn) return project;

  const nextClipValue = { ...clip, timelineIn: clampedIn, timelineOut: clampedIn + duration };
  const nextClips = track.clips.slice();
  nextClips[clipIndex] = nextClipValue;
  return replaceTrack(project, loc, { ...track, clips: nextClips });
}

function linkedAssetIdsForClip(project, clip) {
  const assetId = assetIdForClip(clip);
  const ids = new Set();
  if (!assetId) return ids;
  const assets = project?.document?.assets ?? [];
  const asset = assets.find((item) => item?.id === assetId);
  const recordingAsset = asset?.type === 'recording'
    ? asset
    : assets.find((item) => item?.type === 'recording' && item?.cameraAssetId === assetId);
  if (!recordingAsset?.id) return ids;
  ids.add(recordingAsset.id);
  if (recordingAsset.cameraAssetId) ids.add(recordingAsset.cameraAssetId);
  return ids;
}

function assetIdForClip(clip) {
  if (typeof clip?.assetId === 'string') return clip.assetId;
  return clip?.source?.kind === 'project-asset' && typeof clip.source.id === 'string' ? clip.source.id : null;
}

function moveLinkedAssetClips(project, assetIds, delta) {
  const document = project.document;
  const moveTracks = (tracks) => Array.isArray(tracks)
    ? tracks.map((track) => ({
        ...track,
        clips: (track.clips ?? []).map((clip) => assetIds.has(assetIdForClip(clip)) ? moveClipTiming(clip, delta) : clip),
      }))
    : tracks;
  return {
    ...project,
    document: {
      ...document,
      ...(Array.isArray(document.tracks) ? { tracks: moveTracks(document.tracks) } : {}),
      ...(document.timeline
        ? {
            timeline: {
              ...document.timeline,
              ...(Array.isArray(document.timeline.tracks) ? { tracks: moveTracks(document.timeline.tracks) } : {}),
            },
          }
        : {}),
      composition: {
        ...document.composition,
        ...(Array.isArray(document.composition?.tracks) ? { tracks: moveTracks(document.composition.tracks) } : {}),
      },
    },
  };
}

function trimLinkedAssetClips(project, assetIds, edge, delta) {
  const document = project.document;
  const trimTracks = (tracks) => Array.isArray(tracks)
    ? tracks.map((track) => ({
        ...track,
        clips: (track.clips ?? []).map((clip) => assetIds.has(assetIdForClip(clip)) ? trimClipTiming(clip, edge, delta) : clip),
      }))
    : tracks;
  return {
    ...project,
    document: {
      ...document,
      ...(Array.isArray(document.tracks) ? { tracks: trimTracks(document.tracks) } : {}),
      ...(document.timeline
        ? {
            timeline: {
              ...document.timeline,
              ...(Array.isArray(document.timeline.tracks) ? { tracks: trimTracks(document.timeline.tracks) } : {}),
            },
          }
        : {}),
      composition: {
        ...document.composition,
        ...(Array.isArray(document.composition?.tracks) ? { tracks: trimTracks(document.composition.tracks) } : {}),
      },
    },
  };
}

function trimClipTiming(clip, edge, delta) {
  if (edge === 'left') {
    return {
      ...clip,
      timelineIn: Number(clip.timelineIn) + delta,
      sourceIn: Number(clip.sourceIn ?? 0) + delta,
    };
  }
  const sourceIn = Number(clip.sourceIn ?? 0);
  const timelineIn = Number(clip.timelineIn);
  const timelineOut = Number(clip.timelineOut);
  return {
    ...clip,
    timelineOut: timelineOut + delta,
    sourceOut: Number(clip.sourceOut ?? sourceIn + (timelineOut - timelineIn)) + delta,
  };
}

function clampLinkedTrimDelta(project, assetIds, edge, desiredDelta, minSpan) {
  const tracks = canonicalTracks(project);
  const compositionDuration = Number(project?.document?.composition?.duration);
  const maxDuration = Number.isFinite(compositionDuration) && compositionDuration > 0 ? compositionDuration : Number.POSITIVE_INFINITY;
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;

  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
      const clip = clips[clipIndex];
      if (!assetIds.has(assetIdForClip(clip))) continue;
      const timelineIn = Number(clip.timelineIn);
      const timelineOut = Number(clip.timelineOut);
      const sourceIn = Number(clip.sourceIn ?? 0);
      if (![timelineIn, timelineOut, sourceIn].every(Number.isFinite) || timelineOut <= timelineIn) continue;
      const previousClip = nearestPreviousUnlockedClip(clips, clipIndex, assetIds);
      const nextClip = nearestNextUnlockedClip(clips, clipIndex, assetIds);
      if (edge === 'left') {
        const leftBound = Math.max(0, Number(previousClip?.timelineOut ?? 0), timelineIn - sourceIn);
        minDelta = Math.max(minDelta, leftBound - timelineIn);
        maxDelta = Math.min(maxDelta, timelineOut - minSpan - timelineIn);
      } else {
        const rightBound = Math.min(maxDuration, Number(nextClip?.timelineIn ?? Number.POSITIVE_INFINITY));
        minDelta = Math.max(minDelta, timelineIn + minSpan - timelineOut);
        maxDelta = Math.min(maxDelta, rightBound - timelineOut);
      }
    }
  }

  if (!Number.isFinite(minDelta) && !Number.isFinite(maxDelta)) return 0;
  return Math.round(Math.max(minDelta, Math.min(maxDelta, desiredDelta)));
}

function clampLinkedAssetDelta(project, assetIds, desiredDelta) {
  const tracks = canonicalTracks(project);
  const compositionDuration = Number(project?.document?.composition?.duration);
  const maxDuration = Number.isFinite(compositionDuration) && compositionDuration > 0 ? compositionDuration : Number.POSITIVE_INFINITY;
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;

  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
      const clip = clips[clipIndex];
      if (!assetIds.has(assetIdForClip(clip))) continue;
      const timelineIn = Number(clip.timelineIn);
      const timelineOut = Number(clip.timelineOut);
      if (![timelineIn, timelineOut].every(Number.isFinite) || timelineOut <= timelineIn) continue;
      const previousClip = nearestPreviousUnlockedClip(clips, clipIndex, assetIds);
      const nextClip = nearestNextUnlockedClip(clips, clipIndex, assetIds);
      const leftBound = Math.max(0, Number(previousClip?.timelineOut ?? 0));
      const rightBound = Math.min(maxDuration, Number(nextClip?.timelineIn ?? Number.POSITIVE_INFINITY));
      minDelta = Math.max(minDelta, leftBound - timelineIn);
      maxDelta = Math.min(maxDelta, rightBound - timelineOut);
    }
  }

  if (!Number.isFinite(minDelta) && !Number.isFinite(maxDelta)) return 0;
  return Math.round(Math.max(minDelta, Math.min(maxDelta, desiredDelta)));
}

function canonicalTracks(project) {
  const document = project?.document;
  if (Array.isArray(document?.timeline?.tracks) && document.timeline.tracks.length > 0) return document.timeline.tracks;
  if (Array.isArray(document?.tracks) && document.tracks.length > 0) return document.tracks;
  return Array.isArray(document?.composition?.tracks) ? document.composition.tracks : [];
}

function moveClipTiming(clip, delta) {
  return {
    ...clip,
    timelineIn: Number(clip.timelineIn) + delta,
    timelineOut: Number(clip.timelineOut) + delta,
  };
}

function nearestPreviousClip(clips, clipIndex) {
  const current = clips[clipIndex];
  const currentIn = Number(current?.timelineIn);
  if (!Number.isFinite(currentIn)) return null;
  return clips
    .filter((clip, index) => index !== clipIndex && Number.isFinite(Number(clip?.timelineOut)) && Number(clip.timelineOut) <= currentIn)
    .sort((a, b) => Number(b.timelineOut) - Number(a.timelineOut))[0] ?? null;
}

function nearestNextClip(clips, clipIndex) {
  const current = clips[clipIndex];
  const currentOut = Number(current?.timelineOut);
  if (!Number.isFinite(currentOut)) return null;
  return clips
    .filter((clip, index) => index !== clipIndex && Number.isFinite(Number(clip?.timelineIn)) && Number(clip.timelineIn) >= currentOut)
    .sort((a, b) => Number(a.timelineIn) - Number(b.timelineIn))[0] ?? null;
}

function nearestPreviousUnlockedClip(clips, clipIndex, assetIds) {
  const current = clips[clipIndex];
  const currentIn = Number(current?.timelineIn);
  if (!Number.isFinite(currentIn)) return null;
  return clips
    .filter((clip, index) => index !== clipIndex && !assetIds.has(assetIdForClip(clip)) && Number.isFinite(Number(clip?.timelineOut)) && Number(clip.timelineOut) <= currentIn)
    .sort((a, b) => Number(b.timelineOut) - Number(a.timelineOut))[0] ?? null;
}

function nearestNextUnlockedClip(clips, clipIndex, assetIds) {
  const current = clips[clipIndex];
  const currentOut = Number(current?.timelineOut);
  if (!Number.isFinite(currentOut)) return null;
  return clips
    .filter((clip, index) => index !== clipIndex && !assetIds.has(assetIdForClip(clip)) && Number.isFinite(Number(clip?.timelineIn)) && Number(clip.timelineIn) >= currentOut)
    .sort((a, b) => Number(a.timelineIn) - Number(b.timelineIn))[0] ?? null;
}
