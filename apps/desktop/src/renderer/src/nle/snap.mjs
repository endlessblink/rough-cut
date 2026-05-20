import { canonicalizeProjectDocument, computeTimelineDuration } from '@rough-cut/project-model';

export function snapFrameToClipEdges(targetFrame, project, snapPixelsToFrames) {
  const target = Math.round(Number(targetFrame) || 0);
  const threshold = Math.max(0, Number(snapPixelsToFrames) || 0);
  if (threshold <= 0) return target;
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const durationFrames = document
    ? Math.max(0, Math.round(Math.max(computeTimelineDuration(document.timeline), Number(document.composition?.duration) || 0)))
    : 0;
  const candidates = collectSnapCandidates(document, durationFrames);
  let best = target;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - target);
    if (distance <= threshold && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function collectSnapCandidates(document, durationFrames) {
  const candidates = new Set([0, durationFrames]);
  const tracks = document?.timeline?.tracks;
  if (!Array.isArray(tracks)) return candidates;
  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (const clip of clips) {
      const timelineIn = Number(clip?.timelineIn);
      const timelineOut = Number(clip?.timelineOut);
      if (Number.isFinite(timelineIn)) candidates.add(Math.round(timelineIn));
      if (Number.isFinite(timelineOut)) candidates.add(Math.round(timelineOut));
    }
  }
  return candidates;
}
