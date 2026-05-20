// Pure project mutations for NLE clip operations.
// The NLE is an adapter over the canonical project timeline; all mutations go
// through the shared command service so Recording Edit and NLE cannot diverge.

import {
  canonicalizeProjectDocument,
  deleteClip,
  splitClip,
  trimClipEdge,
} from '@rough-cut/project-model';

// Local id generator. Stable enough across a single edit; the canonical
// id factory lives in packages/project-model but is CJS-difficult to use
// from a renderer .mjs. ids only need uniqueness within the document.
let _splitCounter = 0;
function newClipId(prefix) {
  _splitCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_splitCounter.toString(36)}`;
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

function withCommandResult(project, command) {
  if (!project?.document) return project;
  try {
    const result = command(project.document);
    return result?.document && result.document !== project.document
      ? { ...project, document: result.document }
      : project;
  } catch {
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

export function trimClipById(project, clipId, edge, frame) {
  const normalizedEdge = edge === 'left' || edge === 'right' ? edge : null;
  const nextFrame = Math.round(Number(frame));
  if (!normalizedEdge || !Number.isFinite(nextFrame)) return project;
  if (!findClipLocation(project, clipId)) return project;
  return withCommandResult(project, (document) => trimClipEdge(document, { clipId, edge: normalizedEdge, frame: nextFrame }));
}
