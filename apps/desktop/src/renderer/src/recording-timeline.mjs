export function getRecordingTimelineClip(document, assetId) {
  if (!assetId) return null;
  const timelineClip = findNleClipByAssetId(document?.timeline?.tracks, assetId);
  if (timelineClip) return timelineClip;

  const nleClip = findNleClipByAssetId(document?.tracks, assetId);
  if (nleClip) return nleClip;

  for (const track of document?.composition?.tracks ?? []) {
    const clip = track?.clips?.find((item) => item?.assetId === assetId);
    if (clip) return clip;
  }
  return null;
}

export function updateRecordingTimelineTrim(document, { assetId, cameraAssetId = null, cameraOffset = 0, startFrame, endFrame }) {
  if (!document || !assetId) return document;
  const sourceStart = Math.round(startFrame);
  const sourceEnd = Math.round(endFrame);
  const screenPatch = { timelineIn: sourceStart, timelineOut: sourceEnd, sourceIn: sourceStart, sourceOut: sourceEnd };
  const cameraPatch = { timelineIn: sourceStart, timelineOut: sourceEnd, sourceIn: Math.round(cameraOffset) + sourceStart, sourceOut: Math.round(cameraOffset) + sourceEnd };

  const tracks = updateNleTracks(document.tracks, assetId, cameraAssetId, screenPatch, cameraPatch);
  const timelineTracks = updateNleTracks(document.timeline?.tracks, assetId, cameraAssetId, screenPatch, cameraPatch);

  return {
    ...document,
    composition: {
      ...document.composition,
      duration: Math.max(document.composition?.duration ?? 0, sourceEnd),
      tracks: updateCompositionTracks(document.composition?.tracks, assetId, cameraAssetId, screenPatch, cameraPatch),
    },
    tracks,
    timeline: document.timeline
      ? {
          ...document.timeline,
          tracks: hasNleClipForAsset(timelineTracks, assetId) ? timelineTracks : tracks,
        }
      : document.timeline,
  };
}

export function moveRecordingTimelineClip(document, { assetId, cameraAssetId = null, startFrame }) {
  if (!document || !assetId) return document;
  const clip = getRecordingTimelineClip(document, assetId);
  if (!clip) return document;
  const timelineIn = Math.round(Number(clip.timelineIn ?? 0));
  const timelineOut = Math.round(Number(clip.timelineOut ?? timelineIn + 1));
  const durationFrames = Math.max(1, timelineOut - timelineIn);
  const sourceDuration = Math.max(document.composition?.duration ?? 0, ...((document.assets ?? []).map((asset) => Math.round(Number(asset.duration) || 0))));
  const nextStart = Math.max(0, Math.min(Math.max(0, sourceDuration - durationFrames), Math.round(Number(startFrame) || 0)));
  if (nextStart === timelineIn) return document;
  const screenPatch = { timelineIn: nextStart, timelineOut: nextStart + durationFrames };
  const cameraPatch = { timelineIn: nextStart, timelineOut: nextStart + durationFrames };
  const tracks = updateNleTracks(document.tracks, assetId, cameraAssetId, screenPatch, cameraPatch);
  const timelineTracks = updateNleTracks(document.timeline?.tracks, assetId, cameraAssetId, screenPatch, cameraPatch);

  return {
    ...document,
    composition: {
      ...document.composition,
      tracks: updateCompositionTracks(document.composition?.tracks, assetId, cameraAssetId, screenPatch, cameraPatch),
    },
    tracks,
    timeline: document.timeline
      ? {
          ...document.timeline,
          tracks: hasNleClipForAsset(timelineTracks, assetId) ? timelineTracks : tracks,
        }
      : document.timeline,
  };
}

function hasNleClipForAsset(tracks, assetId) {
  return Boolean(findNleClipByAssetId(tracks, assetId));
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
