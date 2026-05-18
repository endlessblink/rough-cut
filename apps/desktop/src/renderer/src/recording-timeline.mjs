export function getRecordingTimelineClip(document, assetId) {
  if (!assetId) return null;
  const timelineClip = findNleClipByAssetId(document?.timeline?.tracks, assetId);
  if (timelineClip) return timelineClip;

  for (const track of document?.composition?.tracks ?? []) {
    const clip = track?.clips?.find((item) => item?.assetId === assetId);
    if (clip) return clip;
  }
  return null;
}

export function updateRecordingTimelineTrim(document, { assetId, cameraAssetId = null, cameraOffset = 0, startFrame, endFrame }) {
  if (!document || !assetId) return document;
  const durationFrames = Math.max(1, Math.round(endFrame) - Math.round(startFrame));
  const screenPatch = { timelineIn: 0, timelineOut: durationFrames, sourceIn: Math.round(startFrame), sourceOut: Math.round(endFrame) };
  const cameraPatch = { timelineIn: 0, timelineOut: durationFrames, sourceIn: Math.round(cameraOffset) + Math.round(startFrame), sourceOut: Math.round(cameraOffset) + Math.round(endFrame) };

  return {
    ...document,
    composition: {
      ...document.composition,
      duration: durationFrames,
      tracks: updateCompositionTracks(document.composition?.tracks, assetId, cameraAssetId, screenPatch, cameraPatch),
    },
    tracks: updateNleTracks(document.tracks, assetId, cameraAssetId, screenPatch, cameraPatch),
    timeline: document.timeline
      ? {
          ...document.timeline,
          tracks: updateNleTracks(document.timeline.tracks, assetId, cameraAssetId, screenPatch, cameraPatch),
        }
      : document.timeline,
  };
}

export function syncRecordingTimelinePresentation(document, assetId) {
  if (!document?.timeline || !assetId) return document;
  const asset = document.assets?.find((item) => item.id === assetId);
  const presentation = asset?.presentation;
  if (!asset || !presentation) return document;

  const linkedGroupId = `linked:${assetId}`;
  const existingEffects = Array.isArray(document.timeline.effects) ? document.timeline.effects : [];
  const effectIds = new Set([`effect:${assetId}:cursor`, `effect:${assetId}:click`, `effect:${assetId}:camera-pip`]);
  const effects = existingEffects.filter((effect) => !effectIds.has(effect.id));

  return {
    ...document,
    timeline: {
      ...document.timeline,
      effects: [
        ...effects,
        {
          id: `effect:${assetId}:cursor`,
          kind: 'cursor',
          ownerId: linkedGroupId,
          ownerType: 'linked-group',
          enabled: true,
          params: { ...(presentation.cursor ?? {}) },
        },
        {
          id: `effect:${assetId}:click`,
          kind: 'click',
          ownerId: linkedGroupId,
          ownerType: 'linked-group',
          enabled: presentation.cursor?.clickEffect !== 'none',
          params: { clickEffect: presentation.cursor?.clickEffect ?? 'none' },
        },
        {
          id: `effect:${assetId}:camera-pip`,
          kind: 'camera-pip',
          ownerId: linkedGroupId,
          ownerType: 'linked-group',
          enabled: presentation.camera?.visible === true,
          params: { ...(presentation.camera ?? {}) },
        },
      ],
    },
  };
}

function findNleClipByAssetId(tracks, assetId) {
  if (!Array.isArray(tracks)) return null;
  for (const track of tracks) {
    const clip = track?.clips?.find((item) => item?.source?.kind === 'project-asset' && item.source.id === assetId);
    if (clip) return clip;
  }
  return null;
}

function updateCompositionTracks(tracks, assetId, cameraAssetId, screenPatch, cameraPatch) {
  if (!Array.isArray(tracks)) return tracks;
  return tracks.map((track) => ({
    ...track,
    clips: (track.clips ?? []).map((clip) => {
      if (clip.assetId === assetId) return { ...clip, ...screenPatch };
      if (cameraAssetId && clip.assetId === cameraAssetId) return { ...clip, ...cameraPatch };
      return clip;
    }),
  }));
}

function updateNleTracks(tracks, assetId, cameraAssetId, screenPatch, cameraPatch) {
  if (!Array.isArray(tracks)) return tracks;
  return tracks.map((track) => ({
    ...track,
    clips: (track.clips ?? []).map((clip) => {
      const sourceId = clip?.source?.kind === 'project-asset' ? clip.source.id : null;
      if (sourceId === assetId) return { ...clip, ...screenPatch };
      if (cameraAssetId && sourceId === cameraAssetId) return { ...clip, ...cameraPatch };
      return clip;
    }),
  }));
}
