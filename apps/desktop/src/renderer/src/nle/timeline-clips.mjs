// Project → track rows + clip blocks for the NLE Editor timeline.
// Read-only: each clip becomes a positioned rectangle with leftPct +
// widthPct normalized against `project.composition.duration`.

const SUPPORTED_KINDS = Object.freeze(['video', 'audio', 'captions', 'motion-graphics']);

export function buildLaneClips(project, kind) {
  return buildTimelineTracks(project)
    .filter((track) => track.kind === kind)
    .flatMap((track) => track.blocks);
}

export function buildTimelineTracks(project) {
  if (!project || typeof project !== 'object') return [];
  const document = project.document;
  const composition = document?.composition;
  const totalFrames = Number(composition?.duration);
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) return [];

  const timelineTracks = Array.isArray(document?.timeline?.tracks) ? document.timeline.tracks : null;
  const nleTracks = Array.isArray(document?.tracks) ? document.tracks : null;
  const tracks = selectRenderableTracks(timelineTracks, nleTracks, buildLegacyTracks(composition));
  return tracks
    .filter((track) => track && SUPPORTED_KINDS.includes(track.kind))
    .sort((a, b) => Number(b.index ?? 0) - Number(a.index ?? 0))
    .map((track, fallbackIndex) => buildTimelineTrack(track, totalFrames, fallbackIndex));
}

function selectRenderableTracks(timelineTracks, nleTracks, legacyTracks) {
  if (hasRenderableClips(timelineTracks) || (!hasRenderableClips(nleTracks) && !hasRenderableClips(legacyTracks) && timelineTracks)) return timelineTracks;
  if (hasRenderableClips(nleTracks) || (!hasRenderableClips(legacyTracks) && nleTracks)) return nleTracks;
  return legacyTracks;
}

function hasRenderableClips(tracks) {
  return Array.isArray(tracks) && tracks.some((track) => Array.isArray(track?.clips) && track.clips.length > 0);
}

function buildLegacyTracks(composition) {
  const tracks = Array.isArray(composition?.tracks) ? composition.tracks : [];
  return tracks.map((track, index) => ({
    id: typeof track.id === 'string' ? track.id : `legacy-track-${index}`,
    kind: track.type,
    index: Number.isFinite(track.index) ? track.index : index,
    label: typeof track.name === 'string' && track.name ? track.name : track.type,
    enabled: track.visible !== false,
    locked: track.locked === true,
    muted: track.type === 'audio' && (track.visible === false || track.volume === 0),
    clips: Array.isArray(track.clips)
      ? track.clips.map((clip) => ({
          ...clip,
          source: { kind: 'project-asset', id: clip.assetId },
        }))
      : [],
  }));
}

function buildTimelineTrack(track, totalFrames, fallbackIndex) {
  const clips = Array.isArray(track.clips) ? track.clips : [];
  const blocks = clips.map((clip) => buildClipBlock(clip, totalFrames)).filter(Boolean);

  return {
    id: typeof track.id === 'string' ? track.id : `track-${fallbackIndex}`,
    kind: track.kind,
    label: typeof track.label === 'string' && track.label ? track.label : defaultTrackLabel(track.kind),
    enabled: track.enabled !== false,
    locked: track.locked === true,
    muted: track.muted === true,
    blocks,
  };
}

function buildClipBlock(clip, totalFrames) {
  if (!clip || typeof clip !== 'object') return null;
  const inFrame = Number(clip.timelineIn);
  const outFrame = Number(clip.timelineOut);
  if (!Number.isFinite(inFrame) || !Number.isFinite(outFrame)) return null;
  const safeIn = Math.max(0, Math.min(totalFrames, inFrame));
  const safeOut = Math.max(safeIn, Math.min(totalFrames, outFrame));
  const widthFrames = safeOut - safeIn;
  if (widthFrames <= 0) return null;

  const leftPct = (safeIn / totalFrames) * 100;
  const widthPct = (widthFrames / totalFrames) * 100;
  const source = clip.source && typeof clip.source === 'object' ? clip.source : null;
  return {
    id: typeof clip.id === 'string' ? clip.id : null,
    assetId: typeof clip.assetId === 'string'
      ? clip.assetId
      : source?.kind === 'project-asset' && typeof source.id === 'string'
        ? source.id
        : null,
    name: typeof clip.name === 'string' && clip.name ? clip.name : null,
    timelineIn: safeIn,
    timelineOut: safeOut,
    leftPct,
    widthPct,
    enabled: clip.enabled !== false,
  };
}

function defaultTrackLabel(kind) {
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  if (kind === 'captions') return 'Captions';
  if (kind === 'motion-graphics') return 'Motion';
  return 'Track';
}
