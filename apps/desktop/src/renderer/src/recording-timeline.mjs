import {
  canonicalizeProjectDocument,
  createDefaultRecordingPresentation,
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

export function splitRecordingAtFrame(document, { assetId, frame, idFactory }) {
  if (!document || !assetId) return document;
  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  const splitFrame = Math.round(Number(frame));
  if (!Number.isFinite(splitFrame)) return document;
  const recordingSourceIds = new Set([
    `source:${assetId}:screen`,
    `source:${assetId}:camera`,
    `source:${assetId}:system-audio`,
    `source:${assetId}:mic-audio`,
  ]);
  const recordingClips = model.document.timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => recordingSourceIds.has(clip.mediaId) || clip.linkGroupId === model.linkedGroupId);
  if (!recordingClips.some((clip) => splitFrame > clip.timelineIn && splitFrame < clip.timelineOut)) return document;

  // A recording's channels are one edit unit even when an older project has
  // drifted boundaries. Reconcile the union of existing boundaries first, then
  // apply the requested cut through the same command layer on every channel.
  const boundaries = new Set([splitFrame]);
  for (const clip of recordingClips) {
    boundaries.add(Math.round(clip.timelineIn));
    boundaries.add(Math.round(clip.timelineOut));
  }
  let nextDocument = model.document;
  for (const boundary of [...boundaries].sort((left, right) => left - right)) {
    let candidate = nextDocument.timeline.tracks
      .flatMap((track) => track.clips)
      .find((clip) => (recordingSourceIds.has(clip.mediaId) || clip.linkGroupId === model.linkedGroupId)
        && boundary > clip.timelineIn
        && boundary < clip.timelineOut);
    while (candidate) {
      nextDocument = splitClip(nextDocument, { clipId: candidate.id, frame: boundary, idFactory }).document;
      candidate = nextDocument.timeline.tracks
        .flatMap((track) => track.clips)
        .find((clip) => (recordingSourceIds.has(clip.mediaId) || clip.linkGroupId === model.linkedGroupId)
          && boundary > clip.timelineIn
          && boundary < clip.timelineOut);
    }
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

/**
 * Return the recording to the clean state created when the take was saved.
 * This is intentionally broader than trim undo: it removes split clips,
 * hidden ranges, generated zoom/censor state, and stale FreeCut placement in
 * one canonical operation so the screen and camera stay frame-locked.
 */
export function restoreRecordingOriginalState(document, { assetId }) {
  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  const recording = model.recordingAsset;
  if (!recording || !document?.timeline) return document;

  const duration = Math.max(1, Math.round(recording.duration ?? model.sourceDurationFrames));
  const cameraAssetId = recording.cameraAssetId ?? null;
  const originalAspectRatio = inferOriginalRecordingAspectRatio(recording.metadata)
    ?? recording.metadata?.recordingEditOriginalAspectRatio
    ?? 'auto';
  const linkedGroupId = `linked:${recording.id}`;
  const sourceIds = new Set([
    `source:${recording.id}:screen`,
    `source:${recording.id}:camera`,
    `source:${recording.id}:system-audio`,
    `source:${recording.id}:mic-audio`,
  ]);
  const nextAssets = (document.assets ?? []).map((asset) => {
    if (asset.id !== recording.id) return asset;
    const presentation = createDefaultRecordingPresentation();
    // Censors are intentional content edits, not continuity edits. Keep them
    // when restoring the recording's untouched frame order and compositor.
    if (Array.isArray(asset.presentation?.censorRegions)) {
      presentation.censorRegions = asset.presentation.censorRegions;
    }
    return { ...asset, presentation };
  });
  const nextTimelineTracks = (document.timeline.tracks ?? []).map((track) => {
    if (track.linkedGroupId !== linkedGroupId && !track.clips?.some((clip) => sourceIds.has(clip.mediaId))) return track;
    const clips = (track.clips ?? []).filter((clip) => sourceIds.has(clip.mediaId));
    if (clips.length === 0) return track;
    const first = clips[0];
    const assetIdForClip = first.source?.id ?? (first.mediaId.endsWith(':camera') ? cameraAssetId : recording.id);
    return {
      ...track,
      clips: [{
        ...first,
        timelineIn: 0,
        timelineOut: duration,
        sourceIn: 0,
        sourceOut: duration,
        source: { kind: 'project-asset', id: assetIdForClip },
      }],
    };
  });
  const nextComposition = {
    ...document.composition,
    duration,
    tracks: (document.composition?.tracks ?? []).map((track) => ({
      ...track,
      clips: (track.clips ?? []).map((clip) => {
        if (clip.assetId !== recording.id && clip.assetId !== cameraAssetId) return clip;
        return { ...clip, timelineIn: 0, timelineOut: duration, sourceIn: 0, sourceOut: duration };
      }),
    })),
  };
  const nextFreecutTimeline = document.freecutTimeline && typeof document.freecutTimeline === 'object'
    ? {
        ...document.freecutTimeline,
        currentFrame: 0,
        // The camera is part of Rough Cut's linked recording compositor.  A
        // standalone FreeCut camera item is an edited duplicate and paints the
        // camera over the whole program, which is exactly the continuity break
        // this recovery action must remove.
        items: (document.freecutTimeline.items ?? []).filter((item) => item.mediaId !== cameraAssetId).map((item) => {
          const isProgram = item.mediaId === `${recording.id}__program`;
          const isCamera = item.mediaId === cameraAssetId;
          if (!isProgram && !isCamera) return item;
          return {
            ...item,
            from: 0,
            durationInFrames: duration,
            sourceStart: 0,
            sourceEnd: duration,
            trimStart: 0,
            trimEnd: 0,
          };
        }),
      }
    : document.freecutTimeline;

  return syncRecordingTimelinePresentation({
    ...document,
    settings: {
      ...(document.settings ?? {}),
      aspectRatio: originalAspectRatio,
    },
    assets: nextAssets,
    composition: nextComposition,
    timeline: {
      ...document.timeline,
      tracks: nextTimelineTracks,
      markers: [],
      effects: [],
    },
    freecutTimeline: nextFreecutTimeline,
  }, recording.id);
}

function inferOriginalRecordingAspectRatio(metadata) {
  const width = Number(metadata?.width);
  const height = Number(metadata?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  const known = [
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['4:5', 4 / 5],
    ['5:4', 5 / 4],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
    ['1:1', 1],
  ];
  const match = known.find(([, knownRatio]) => Math.abs(ratio - knownRatio) < 0.02);
  return match?.[0] ?? null;
}

export function rippleDeleteRecordingRange(document, { assetId, startFrame, endFrame, idFactory }) {
  let model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  if (!model.linkedGroupId) return document;
  const start = clampFrame(Math.min(startFrame, endFrame), 0, Math.max(0, model.timelineDurationFrames - 1));
  const end = clampFrame(Math.max(startFrame, endFrame), start + 1, model.timelineDurationFrames);
  let nextDocument = model.document;
  const recordingSourceIds = new Set([
    `source:${assetId}:screen`,
    `source:${assetId}:camera`,
    `source:${assetId}:system-audio`,
    `source:${assetId}:mic-audio`,
  ]);
  const boundaries = new Set([start, end]);
  for (const clip of nextDocument.timeline.tracks.flatMap((track) => track.clips)) {
    if (!recordingSourceIds.has(clip.mediaId) && clip.linkGroupId !== model.linkedGroupId) continue;
    boundaries.add(Math.round(clip.timelineIn));
    boundaries.add(Math.round(clip.timelineOut));
  }
  for (const boundary of [...boundaries].sort((left, right) => left - right)) {
    nextDocument = splitRecordingAtFrame(nextDocument, { assetId, frame: boundary, idFactory });
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
  const clips = tracks
    .flatMap((track) => (track?.clips ?? [])
      .filter((clip) => clip?.mediaId === mediaId)
      .map((clip) => ({ ...clip, trackId: clip.trackId ?? track.id })))
    .sort((left, right) => left.timelineIn - right.timelineIn || left.timelineOut - right.timelineOut || String(left.id).localeCompare(String(right.id)));
  const seenRanges = new Set();
  return clips.filter((clip) => {
    const range = [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut].map((value) => Math.round(value ?? 0)).join(':');
    if (seenRanges.has(range)) return false;
    seenRanges.add(range);
    return true;
  });
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
