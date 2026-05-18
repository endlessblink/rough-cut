export function snapFrameToClipEdges(targetFrame, project, snapPixelsToFrames) {
  const target = Math.round(Number(targetFrame) || 0);
  const threshold = Math.max(0, Number(snapPixelsToFrames) || 0);
  if (threshold <= 0) return target;
  const durationFrames = Math.max(0, Math.round(Number(project?.document?.composition?.duration) || 0));
  const candidates = collectSnapCandidates(project, durationFrames);
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

function collectSnapCandidates(project, durationFrames) {
  const candidates = new Set([0, durationFrames]);
  const tracks = project?.document?.composition?.tracks;
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
