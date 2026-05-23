import {
  canonicalizeProjectDocument,
  resolveTimelineLengthFrames,
  restoreFullSource,
  restoreSourceEdge,
  rippleDeleteRange,
  splitClip,
  trimClipEdge,
} from '@rough-cut/project-model';

export function getRecordingTimelineClip(document, assetId) {
  if (!assetId) return null;
  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  return model.primaryClip;
}

export function updateRecordingTimelineTrim(document, { assetId, cameraAssetId = null, cameraOffset = 0, startFrame, endFrame }) {
  if (!document || !assetId) return document;
  void cameraAssetId;
  void cameraOffset;
  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  const firstClip = model.screenClips[0];
  const lastClip = model.screenClips[model.screenClips.length - 1];
  if (!firstClip || !lastClip) return document;

  const nextStartFrame = clampFrame(startFrame, 0, Math.max(0, model.sourceDurationFrames - 1));
  const nextEndFrame = clampFrame(endFrame, nextStartFrame + 1, model.sourceDurationFrames);
  let nextDocument = model.document;

  if (nextStartFrame !== firstClip.sourceIn) {
    const timelineFrame = firstClip.timelineIn + (nextStartFrame - firstClip.sourceIn);
    nextDocument = trimClipEdge(nextDocument, { clipId: firstClip.id, edge: 'head', frame: timelineFrame }).document;
  }

  const nextModel = selectRecordingEditModel({ document: nextDocument, recordingAssetId: assetId });
  const nextLastClip = nextModel.screenClips[nextModel.screenClips.length - 1];
  if (nextLastClip && nextEndFrame !== nextLastClip.sourceOut) {
    const timelineFrame = nextLastClip.timelineOut + (nextEndFrame - nextLastClip.sourceOut);
    nextDocument = trimClipEdge(nextDocument, { clipId: nextLastClip.id, edge: 'tail', frame: timelineFrame }).document;
  }

  return nextDocument;
}

export function restoreRecordingSourceEdge(document, { assetId, edge }) {
  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  const clip = edge === 'head' ? model.screenClips[0] : model.screenClips[model.screenClips.length - 1];
  if (!clip) return document;
  return restoreSourceEdge(model.document, { clipId: clip.id, edge }).document;
}

export function restoreRecordingFullSource(document, { assetId }) {
  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  const clip = model.primaryClip;
  if (!clip) return document;
  return restoreFullSource(model.document, { clipId: clip.id }).document;
}

export function rippleDeleteRecordingRange(document, { assetId, startFrame, endFrame, idFactory }) {
  let model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  if (!model.linkedGroupId) return document;
  const start = clampFrame(Math.min(startFrame, endFrame), 0, Math.max(0, model.timelineDurationFrames - 1));
  const end = clampFrame(Math.max(startFrame, endFrame), start + 1, model.timelineDurationFrames);
  let nextDocument = model.document;

  const endClip = findScreenClipAt(selectRecordingEditModel({ document: nextDocument, recordingAssetId: assetId }).screenClips, end);
  if (endClip && end > endClip.timelineIn && end < endClip.timelineOut) {
    nextDocument = splitClip(nextDocument, { clipId: endClip.id, frame: end, idFactory }).document;
  }

  const startClip = findScreenClipAt(selectRecordingEditModel({ document: nextDocument, recordingAssetId: assetId }).screenClips, start);
  if (startClip && start > startClip.timelineIn && start < startClip.timelineOut) {
    nextDocument = splitClip(nextDocument, { clipId: startClip.id, frame: start, idFactory }).document;
  }

  model = selectRecordingEditModel({ document: nextDocument, recordingAssetId: assetId });
  return rippleDeleteRange(nextDocument, { startFrame: start, endFrame: end, linkGroupId: model.linkedGroupId }).document;
}

export function selectRecordingEditModel(input) {
  const rawDocument = input?.document ?? input;
  const document = rawDocument?.timeline ? canonicalizeProjectDocument(rawDocument) : rawDocument;
  const recordingAsset = input?.recordingAssetId
    ? document?.assets?.find((asset) => asset.id === input.recordingAssetId) ?? null
    : document?.assets?.find((asset) => asset.type === 'recording') ?? null;
  const sourceId = recordingAsset?.id ? `source:${recordingAsset.id}:screen` : null;
  const linkedGroupId = recordingAsset?.id ? `linked:${recordingAsset.id}` : null;
  const screenClips = sourceId
    ? clipsForMedia(document?.timeline?.tracks, sourceId)
    : [];
  const primaryClip = screenClips[0] ?? null;
  const timelineDurationFrames = Math.max(
    1,
    resolveTimelineLengthFrames(
      document?.timeline ?? { tracks: [], markers: [], effects: [] },
      document?.composition?.duration,
    ),
  );
  const sourceDurationFrames = Math.max(1, Math.round(recordingAsset?.duration ?? timelineDurationFrames));
  const viewStartFrame = screenClips.length > 0 ? Math.min(...screenClips.map((clip) => clip.timelineIn)) : 0;
  const viewEndFrame = screenClips.length > 0 ? Math.max(...screenClips.map((clip) => clip.timelineOut)) : timelineDurationFrames;
  const unsupportedVideoClips = unsupportedRecordingVideoClips(document?.timeline?.tracks, linkedGroupId);
  const firstClip = screenClips[0] ?? null;
  const lastClip = screenClips[screenClips.length - 1] ?? null;
  const trimInfo = firstClip && lastClip
    ? {
        startFrame: firstClip.sourceIn,
        endFrame: lastClip.sourceOut,
        startTimelineFrame: firstClip.timelineIn,
        endTimelineFrame: lastClip.timelineOut,
        isTrimmed: firstClip.sourceIn > 0 || lastClip.sourceOut < sourceDurationFrames,
      }
    : { startFrame: 0, endFrame: sourceDurationFrames, startTimelineFrame: 0, endTimelineFrame: timelineDurationFrames, isTrimmed: false };

  return {
    document,
    recordingAsset,
    linkedGroupId,
    primaryClip,
    screenClips,
    trimInfo,
    timelineDurationFrames,
    sourceDurationFrames,
    viewStartFrame,
    viewEndFrame,
    viewDurationFrames: Math.max(1, viewEndFrame - viewStartFrame),
    cutRanges: listTimelineCutRanges(document, recordingAsset?.id, timelineDurationFrames),
    warning: unsupportedVideoClips.length > 0 ? 'Complex timeline: Recording Edit is showing supported recording clips only.' : null,
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

function clipsForMedia(tracks, mediaId) {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .flatMap((track) => (track?.clips ?? [])
      .filter((clip) => clip?.mediaId === mediaId)
      .map((clip) => ({ ...clip, trackId: clip.trackId ?? track.id })))
    .sort((left, right) => left.timelineIn - right.timelineIn || left.timelineOut - right.timelineOut || String(left.id).localeCompare(String(right.id)));
}

function findScreenClipAt(clips, frame) {
  return clips.find((clip) => frame > clip.timelineIn && frame < clip.timelineOut) ?? null;
}

function unsupportedRecordingVideoClips(tracks, linkedGroupId) {
  if (!Array.isArray(tracks) || !linkedGroupId) return [];
  return tracks.flatMap((track) => {
    if (track?.kind !== 'video') return [];
    return (track.clips ?? []).filter((clip) => clip.linkGroupId && clip.linkGroupId !== linkedGroupId);
  });
}

function listTimelineCutRanges(document, assetId, totalFrames) {
  if (!assetId || !Array.isArray(document?.timeline?.markers)) return [];
  const linkedGroupId = `linked:${assetId}`;
  return document.timeline.markers
    .filter((marker) => marker?.kind === 'cut' && marker.linkedGroupId === linkedGroupId)
    .map((marker) => ({
      id: marker.id,
      startFrame: clampFrame(marker.startFrame, 0, Math.max(0, totalFrames - 1)),
      endFrame: clampFrame(marker.endFrame, 1, totalFrames),
    }))
    .filter((range) => range.endFrame > range.startFrame)
    .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame);
}

function clampFrame(value, min, max) {
  const frame = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, frame));
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
