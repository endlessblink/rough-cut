import { canonicalizeProjectDocument } from '@rough-cut/project-model';

export function createTrimSession(project, clipId, edge, startFrame, durationFrames) {
  const loc = findClipLocation(project, clipId);
  const clip = loc?.clip;
  const normalizedEdge = edge === 'left' || edge === 'right' ? edge : null;
  if (!clip || !normalizedEdge) return null;
  const timelineIn = Number(clip.timelineIn);
  const timelineOut = Number(clip.timelineOut);
  const sourceIn = Number(clip.sourceIn ?? 0);
  const sourceOut = Number(clip.sourceOut ?? sourceIn + (timelineOut - timelineIn));
  const sourceDuration = sourceDurationForClip(project, clip) ?? Math.max(sourceOut, durationFrames);
  if (![timelineIn, timelineOut, sourceIn, sourceOut].every(Number.isFinite)) return null;
  return updateTrimSession({
    clipId,
    edge: normalizedEdge,
    original: { timelineIn, timelineOut, sourceIn, sourceOut },
    downstream: downstreamClips(loc.track.clips, loc.clipIndex, timelineOut),
    bounds: trimBounds(loc.track.clips, loc.clipIndex, timelineIn, timelineOut, sourceIn, sourceOut, sourceDuration, Math.max(1, Math.round(Number(durationFrames) || 1))),
    durationFrames: Math.max(1, Math.round(Number(durationFrames) || 1)),
    startFrame: Math.round(Number(startFrame) || 0),
    preview: { timelineIn, timelineOut, sourceIn, sourceOut },
    previews: { [clipId]: { timelineIn, timelineOut, sourceIn, sourceOut } },
    snapFrame: null,
    invalidReason: null,
  }, startFrame);
}

export function updateTrimSession(session, frame) {
  if (!session) return null;
  const requestedFrame = Math.round(Number(frame));
  if (!Number.isFinite(requestedFrame)) return { ...session, invalidReason: 'invalid-frame' };

  const minSpan = 1;
  const { timelineIn, timelineOut, sourceIn, sourceOut } = session.original;
  const minFrame = session.edge === 'left' ? Math.max(session.bounds.start, timelineIn - sourceIn) : timelineIn + minSpan;
  const maxFrame = session.edge === 'left' ? timelineOut - minSpan : session.bounds.end;
  const clampedFrame = Math.max(minFrame, Math.min(maxFrame, requestedFrame));
  const invalidReason = clampedFrame !== requestedFrame ? 'clamped' : null;

  if (session.edge === 'left') {
    const delta = clampedFrame - timelineIn;
    const preview = { timelineIn: clampedFrame, timelineOut, sourceIn: sourceIn + delta, sourceOut };
    return {
      ...session,
      preview,
      previews: previewMap(session, preview, delta),
      snapFrame: clampedFrame,
      invalidReason,
    };
  }

  const delta = clampedFrame - timelineOut;
  const preview = { timelineIn, timelineOut: clampedFrame, sourceIn, sourceOut: sourceOut + delta };
  return {
    ...session,
    preview,
    previews: previewMap(session, preview, delta),
    snapFrame: clampedFrame,
    invalidReason,
  };
}

function trimBounds(clips, clipIndex, timelineIn, timelineOut, sourceIn, sourceOut, sourceDuration, durationFrames) {
  const previousClip = nearestPreviousClip(clips, clipIndex, timelineIn);
  return {
    start: Math.max(0, Number(previousClip?.timelineOut ?? 0), timelineIn - sourceIn),
    end: Math.min(durationFrames, timelineOut + Math.max(0, sourceDuration - sourceOut)),
  };
}

function nearestPreviousClip(clips, clipIndex, currentIn) {
  return (clips ?? [])
    .filter((clip, index) => index !== clipIndex && Number.isFinite(Number(clip?.timelineOut)) && Number(clip.timelineOut) <= currentIn)
    .sort((a, b) => Number(b.timelineOut) - Number(a.timelineOut))[0] ?? null;
}

function nearestNextClip(clips, clipIndex, currentOut) {
  return (clips ?? [])
    .filter((clip, index) => index !== clipIndex && Number.isFinite(Number(clip?.timelineIn)) && Number(clip.timelineIn) >= currentOut)
    .sort((a, b) => Number(a.timelineIn) - Number(b.timelineIn))[0] ?? null;
}

function downstreamClips(clips, clipIndex, currentOut) {
  return (clips ?? [])
    .filter((clip, index) => index !== clipIndex && Number.isFinite(Number(clip?.timelineIn)) && Number(clip.timelineIn) >= currentOut)
    .map((clip) => ({
      id: clip.id,
      timelineIn: Number(clip.timelineIn),
      timelineOut: Number(clip.timelineOut),
    }))
    .filter((clip) => clip.id && Number.isFinite(clip.timelineOut));
}

function previewMap(session, editedPreview, delta) {
  const previews = {
    [session.clipId]: editedPreview,
  };
  for (const clip of session.downstream ?? []) {
    previews[clip.id] = {
      timelineIn: clip.timelineIn + delta,
      timelineOut: clip.timelineOut + delta,
    };
  }
  return previews;
}

function sourceDurationForClip(project, clip) {
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const sourceId = clip?.mediaId ?? (clip?.source?.id ? `source:${clip.source.id}` : null);
  if (!sourceId) return null;
  const source = document?.timeline?.sources?.find((item) => item.id === sourceId || item.assetId === clip.source?.id);
  const duration = Number(source?.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function findClipLocation(project, clipId) {
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const tracks = document?.timeline?.tracks;
  if (!Array.isArray(tracks)) return null;
  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
      if (clips[clipIndex]?.id === clipId) return { track, clipIndex, clip: clips[clipIndex] };
    }
  }
  return null;
}
