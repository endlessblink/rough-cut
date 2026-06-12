// Pure project mutations for NLE clip operations.
// The NLE is an adapter over the canonical project timeline; all mutations go
// through the shared command service so Recording Edit and NLE cannot diverge.

import {
  canonicalizeProjectDocument,
  deleteClip,
  moveClip,
  reorderTrack,
  rippleTrimClipEdge,
  splitClip,
  trimClipEdge,
  updateTrackSettings,
} from '@rough-cut/project-model';

// Local id generator. Stable enough across a single edit; the canonical
// id factory lives in packages/project-model but is CJS-difficult to use
// from a renderer .mjs. ids only need uniqueness within the document.
let _splitCounter = 0;
function newClipId(prefix) {
  _splitCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_splitCounter.toString(36)}`;
}

const DEFAULT_GENERATED_ASSET_DURATION_FRAMES = 150;

function sourceKindForGeneratedAsset(asset) {
  if (asset?.kind === 'audio') return 'audio';
  if (asset?.kind === 'image' || asset?.kind === 'video') return 'video';
  if (asset?.kind === 'motion-graphics') return 'motion-graphics';
  return null;
}

function mediaTypeForGeneratedAsset(asset) {
  if (asset?.kind === 'audio') return 'audio';
  if (asset?.kind === 'image' || asset?.kind === 'video') return 'video';
  return 'data';
}

function findClipLocation(project, clipId) {
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const tracks = document?.timeline?.tracks;
  if (!Array.isArray(tracks)) return null;
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
      if (clips[clipIndex]?.id === clipId) return { trackIndex, clipIndex, track, clip: clips[clipIndex] };
    }
  }
  return null;
}

// Command failures must not be silent (a rejected trim/move looked identical
// to a no-op, so the UI showed "nothing happened"). The same-reference no-op
// convention stays — callers compare `next !== project` — but real command
// errors land in this mailbox for the UI to consume and surface.
let _lastCommandError = null;

export function consumeLastCommandError() {
  const error = _lastCommandError;
  _lastCommandError = null;
  return error;
}

function withCommandResult(project, command) {
  if (!project?.document) return project;
  _lastCommandError = null;
  try {
    const result = command(project.document);
    return result?.document && result.document !== project.document
      ? { ...project, document: result.document }
      : project;
  } catch (error) {
    _lastCommandError = error instanceof Error ? error : new Error(String(error));
    return project;
  }
}

// Remove a clip by id. Returns a new project, or the same reference when
// the clip isn't found.
export function removeClipById(project, clipId) {
  if (!findClipLocation(project, clipId)) return project;
  return withCommandResult(project, (document) => deleteClip(document, { clipId }));
}

// Split a clip at a timeline frame using the canonical half-open invariant.
// Returns a new project, or the same reference when the split is a no-op.
export function splitClipById(project, clipId, splitFrame) {
  if (!canSplitClipById(project, clipId, splitFrame)) return project;
  return withCommandResult(project, (document) => splitClip(document, { clipId, frame: splitFrame, idFactory: newClipId }));
}

export function canSplitClipById(project, clipId, splitFrame) {
  const loc = findClipLocation(project, clipId);
  const frame = Math.round(Number(splitFrame));
  return Boolean(loc && Number.isFinite(frame) && frame > loc.clip.timelineIn && frame < loc.clip.timelineOut);
}

export function rightClipIdAfterSplit(project, originalClipId, splitFrame) {
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const frame = Math.round(Number(splitFrame));
  if (!document || !Number.isFinite(frame)) return null;
  for (const track of document.timeline?.tracks ?? []) {
    const clip = (track.clips ?? []).find((item) => item.id !== originalClipId && item.timelineIn === frame);
    if (clip?.id) return clip.id;
  }
  return null;
}

export function trimClipById(project, clipId, edge, frame) {
  const normalizedEdge = edge === 'left' || edge === 'right' ? edge : null;
  const nextFrame = Math.round(Number(frame));
  if (!normalizedEdge || !Number.isFinite(nextFrame)) return project;
  if (!findClipLocation(project, clipId)) return project;
  return withCommandResult(project, (document) => trimClipEdge(document, { clipId, edge: normalizedEdge, frame: nextFrame }));
}

export function rippleTrimClipById(project, clipId, edge, frame) {
  const normalizedEdge = edge === 'left' || edge === 'right' ? edge : null;
  const nextFrame = Math.round(Number(frame));
  if (!normalizedEdge || !Number.isFinite(nextFrame)) return project;
  if (!findClipLocation(project, clipId)) return project;
  return withCommandResult(project, (document) => rippleTrimClipEdge(document, { clipId, edge: normalizedEdge, frame: nextFrame }));
}

export function moveClipById(project, clipId, timelineIn, targetTrackId) {
  const nextFrame = Math.round(Number(timelineIn));
  if (!Number.isFinite(nextFrame)) return project;
  if (!findClipLocation(project, clipId)) return project;
  return withCommandResult(project, (document) => moveClip(document, { clipId, timelineIn: nextFrame, ...(targetTrackId ? { targetTrackId } : {}) }));
}

export function updateTrackById(project, trackId, patch) {
  if (!trackId || !patch || typeof patch !== 'object') return project;
  return withCommandResult(project, (document) => updateTrackSettings(document, { trackId, ...patch }));
}

export function reorderTrackById(project, trackId, direction) {
  if (!trackId || (direction !== 'up' && direction !== 'down')) return project;
  return withCommandResult(project, (document) => reorderTrack(document, { trackId, direction }));
}

// Drop on a ghost channel: create the track, then place the asset on it.
// Audio tracks go BELOW everything (index 0, existing tracks shift up by 1 —
// relative z-order preserved); video tracks go on top (max index + 1).
export function addGeneratedAssetToNewTrack(project, asset, kind, timelineIn) {
  if (!project?.document || !asset?.id) return project;
  if (kind !== 'video' && kind !== 'audio') return project;
  const targetKind = sourceKindForGeneratedAsset(asset);
  if (targetKind !== kind) return project;

  const document = canonicalizeProjectDocument(project.document);
  const tracks = Array.isArray(document.timeline?.tracks) ? document.timeline.tracks : [];
  const kindCount = tracks.filter((track) => track.kind === kind).length;
  const maxIndex = tracks.reduce((max, track) => Math.max(max, Number(track.index) || 0), -1);
  const shiftForAudio = kind === 'audio';
  const newTrack = {
    id: newClipId(`track-${kind}`),
    kind,
    index: shiftForAudio ? 0 : maxIndex + 1,
    label: `${kind === 'audio' ? 'Audio' : 'Video'} ${kindCount + 1}`,
    enabled: true,
    locked: false,
    muted: false,
    clips: [],
  };
  const nextTracks = shiftForAudio
    ? [...tracks.map((track) => ({ ...track, index: Number(track.index) + 1 })), newTrack]
    : [...tracks, newTrack];
  const withTrack = {
    ...project,
    document: {
      ...document,
      timeline: { ...document.timeline, tracks: nextTracks },
    },
  };
  const next = addGeneratedAssetToTrack(withTrack, asset, newTrack.id, timelineIn);
  // Don't leave an empty track behind if the clip placement failed.
  return next === withTrack ? project : next;
}

export function addGeneratedAssetToTrack(project, asset, trackId, timelineIn) {
  if (!project?.document || !asset?.id || !trackId) return project;
  const document = canonicalizeProjectDocument(project.document);
  const track = document.timeline?.tracks?.find((item) => item.id === trackId);
  const targetKind = sourceKindForGeneratedAsset(asset);
  if (!track || track.locked || !targetKind || track.kind !== targetKind) return project;

  const requestedIn = Math.max(0, Math.round(Number(timelineIn)) || 0);
  const duration = Math.max(1, Math.round(Number(asset.durationFrames ?? asset.duration ?? DEFAULT_GENERATED_ASSET_DURATION_FRAMES)));
  const compositionDuration = Math.max(Number(document.composition?.duration ?? 0), requestedIn + duration);
  const start = Math.min(requestedIn, Math.max(0, compositionDuration - duration));
  const end = start + duration;
  const overlaps = track.clips.some((clip) => start < clip.timelineOut && end > clip.timelineIn);
  if (overlaps) return project;

  const mediaId = `source:${asset.id}`;
  const existingSource = document.timeline.sources.some((source) => source.id === mediaId);
  const nextSource = existingSource ? [] : [{
    id: mediaId,
    kind: 'generated-asset',
    mediaType: mediaTypeForGeneratedAsset(asset),
    aiAssetId: asset.id,
    label: asset.sourcePrompt || asset.filePath?.split(/[\\/]/).pop() || asset.id,
    duration,
  }];
  const clip = {
    id: newClipId('ai-clip'),
    mediaId,
    trackId: track.id,
    timelineIn: start,
    timelineOut: end,
    sourceIn: 0,
    sourceOut: duration,
    source: { kind: 'ai-asset', id: asset.id },
  };
  const nextTimeline = {
    ...document.timeline,
    sources: [...document.timeline.sources, ...nextSource],
    tracks: document.timeline.tracks.map((item) => item.id === track.id
      ? { ...item, clips: [...item.clips, clip].sort((a, b) => a.timelineIn - b.timelineIn || a.timelineOut - b.timelineOut || a.id.localeCompare(b.id)) }
      : item),
  };

  return {
    ...project,
    document: {
      ...document,
      composition: {
        ...document.composition,
        duration: Math.max(Number(document.composition?.duration ?? 0), end),
      },
      timeline: nextTimeline,
    },
  };
}
