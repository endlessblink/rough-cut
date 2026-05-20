import { canonicalizeProjectDocument } from '@rough-cut/project-model';

export function createDragSession(project, clipId, pointerFrame, durationFrames) {
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const loc = findClipLocation(document, clipId);
  if (!loc || loc.track.locked) return null;
  const duration = loc.clip.timelineOut - loc.clip.timelineIn;
  if (duration <= 0) return null;
  const startFrame = Math.round(Number(pointerFrame));
  const grabOffsetFrames = Math.max(0, Math.min(duration, startFrame - loc.clip.timelineIn));
  const session = {
    clipId,
    originalTrackId: loc.track.id,
    targetTrackId: loc.track.id,
    kind: loc.track.kind,
    duration,
    durationFrames: Math.max(1, Math.round(Number(durationFrames) || 1)),
    grabOffsetFrames,
    original: {
      timelineIn: loc.clip.timelineIn,
      timelineOut: loc.clip.timelineOut,
      sourceIn: loc.clip.sourceIn,
      sourceOut: loc.clip.sourceOut,
    },
    preview: { trackId: loc.track.id, timelineIn: loc.clip.timelineIn, timelineOut: loc.clip.timelineOut },
    valid: true,
    invalidReason: null,
  };
  return updateDragSession(session, project, { timelineIn: loc.clip.timelineIn, targetTrackId: loc.track.id });
}

export function updateDragSession(session, project, input) {
  if (!session) return null;
  const document = project?.document ? canonicalizeProjectDocument(project.document) : null;
  const targetTrackId = typeof input?.targetTrackId === 'string' ? input.targetTrackId : session.targetTrackId;
  const targetTrack = document?.timeline?.tracks?.find((track) => track.id === targetTrackId) ?? null;
  const requestedIn = Math.round(Number(input?.timelineIn));
  if (!targetTrack) return invalidSession(session, targetTrackId, 'missing-target');
  if (targetTrack.kind !== session.kind) return invalidSession(session, targetTrackId, 'cross-kind');
  if (targetTrack.locked) return invalidSession(session, targetTrackId, 'locked-track');
  if (!Number.isFinite(requestedIn)) return invalidSession(session, targetTrackId, 'bounds');

  const anchorFrame = targetTrack.id === session.originalTrackId ? session.original.timelineIn : requestedIn;
  const bounds = computeMoveBounds(document, session.clipId, targetTrack.id, session.duration, session.durationFrames, anchorFrame);
  const timelineIn = Math.max(bounds.min, Math.min(bounds.max, requestedIn));
  return {
    ...session,
    targetTrackId: targetTrack.id,
    preview: { trackId: targetTrack.id, timelineIn, timelineOut: timelineIn + session.duration },
    valid: true,
    invalidReason: null,
  };
}

export function timelineInFromPointerFrame(session, pointerFrame) {
  const frame = Math.round(Number(pointerFrame));
  return Number.isFinite(frame) ? frame - session.grabOffsetFrames : session.original.timelineIn;
}

export function computeMoveBounds(document, clipId, targetTrackId, duration, durationFrames, anchorFrame = null) {
  const targetTrack = document?.timeline?.tracks?.find((track) => track.id === targetTrackId) ?? null;
  if (!targetTrack) return { min: 0, max: Math.max(0, durationFrames - duration) };
  const clips = (targetTrack.clips ?? [])
    .filter((clip) => clip.id !== clipId)
    .sort((a, b) => a.timelineIn - b.timelineIn || a.timelineOut - b.timelineOut);
  let min = 0;
  let max = Math.max(0, durationFrames - duration);
  const original = findClipLocation(document, clipId)?.clip;
  const anchor = Number.isFinite(Number(anchorFrame)) ? Number(anchorFrame) : original?.timelineIn ?? 0;
  for (const clip of clips) {
    if (clip.timelineOut <= anchor) min = Math.max(min, clip.timelineOut);
    if (clip.timelineIn >= anchor) {
      max = Math.min(max, clip.timelineIn - duration);
      break;
    }
  }
  return { min, max: Math.max(min, max) };
}

export function trackIdFromClientY(clientY) {
  const rows = Array.from(document.querySelectorAll('.nleTrackLaneBody[data-track-id]'));
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return row.getAttribute('data-track-id');
  }
  return null;
}

function invalidSession(session, targetTrackId, reason) {
  return { ...session, targetTrackId, valid: false, invalidReason: reason };
}

function findClipLocation(document, clipId) {
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
