import {
  createDefaultRecordingPresentation,
  createZoomMarker,
} from '@rough-cut/project-model';

const DEFAULT_MARKER_SPAN_FRAMES = 60;
const DEFAULT_MIN_SPAN_FRAMES = 15;

export function getPrimaryRecordingAsset(document) {
  for (const asset of document.assets) {
    if (asset.type === 'recording') return asset;
  }
  return null;
}

export function canAddMarkerAt(
  document,
  currentTimeSec,
  fps,
  minSpanFrames = DEFAULT_MIN_SPAN_FRAMES,
) {
  if (!Number.isFinite(currentTimeSec) || currentTimeSec < 0) return false;
  if (!Number.isFinite(fps) || fps <= 0) return false;
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || asset.duration <= 0) return false;
  const startFrame = Math.round(currentTimeSec * fps);
  if (startFrame < 0) return false;
  return startFrame + minSpanFrames <= asset.duration;
}

export function addManualMarkerAt(document, currentTimeSec, fps) {
  if (!canAddMarkerAt(document, currentTimeSec, fps)) return document;

  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;

  const startFrame = Math.round(currentTimeSec * fps);
  const endFrame = Math.min(startFrame + DEFAULT_MARKER_SPAN_FRAMES, asset.duration);
  const marker = createZoomMarker(startFrame, endFrame);

  const presentation = withDefaultPresentation(asset.presentation);
  const nextMarkers = [...listMarkers(document), marker].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextMarkers);
}

/**
 * Find a non-overlapping span that contains `atFrame`, biased to start at
 * `atFrame` and extend forward up to `defaultSpan`, clamped by the next
 * existing marker (or asset duration) and the previous existing marker. If
 * `atFrame` falls inside an existing marker, or the available gap is below
 * `minSpan`, returns null.
 */
export function findAvailableSpan(document, atFrame, options = {}) {
  const defaultSpan = options.defaultSpan ?? DEFAULT_MARKER_SPAN_FRAMES;
  const minSpan = options.minSpan ?? DEFAULT_MIN_SPAN_FRAMES;
  if (!Number.isFinite(atFrame) || atFrame < 0) return null;

  const asset = getPrimaryRecordingAsset(document);
  if (!asset || asset.duration <= 0) return null;

  const startFrame = Math.round(atFrame);
  if (startFrame < 0 || startFrame >= asset.duration) return null;

  const markers = [...listMarkers(document)].sort((a, b) => a.startFrame - b.startFrame);

  for (const m of markers) {
    if (startFrame >= m.startFrame && startFrame < m.endFrame) return null;
  }

  let gapStart = 0;
  let gapEnd = asset.duration;
  for (const m of markers) {
    if (m.endFrame <= startFrame) gapStart = Math.max(gapStart, m.endFrame);
    else if (m.startFrame > startFrame) { gapEnd = Math.min(gapEnd, m.startFrame); break; }
  }

  const clampedStart = Math.max(gapStart, startFrame);
  const clampedEnd = Math.min(gapEnd, clampedStart + defaultSpan);
  if (clampedEnd - clampedStart < minSpan) return null;
  return { startFrame: clampedStart, endFrame: clampedEnd };
}

/**
 * Add a manual zoom marker at a precise source frame (used by lane
 * click-to-add). Differs from {@link addManualMarkerAt} which uses the
 * playhead's source time and does not clamp to non-overlap.
 */
export function addManualMarkerAtFrame(document, atFrame, fps, options = {}) {
  if (!Number.isFinite(fps) || fps <= 0) return document;
  const span = findAvailableSpan(document, atFrame, options);
  if (!span) return document;

  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;

  const marker = createZoomMarker(span.startFrame, span.endFrame);
  const presentation = withDefaultPresentation(asset.presentation);
  const nextMarkers = [...listMarkers(document), marker].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextMarkers);
}

export function removeMarker(document, markerId) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !asset.presentation) return document;

  const presentation = withDefaultPresentation(asset.presentation);
  const markers = listMarkers(document);
  const nextMarkers = markers.filter((marker) => marker.id !== markerId);
  if (nextMarkers.length === markers.length) return document;

  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextMarkers);
}

export function updateMarkerRange(document, markerId, startFrame, endFrame, options = {}) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !asset.presentation) return document;

  const presentation = withDefaultPresentation(asset.presentation);
  const markers = listMarkers(document);
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return document;

  const minDuration = Math.max(1, Math.round(options.minDurationFrames ?? DEFAULT_MIN_SPAN_FRAMES));
  const maxFrame = Math.max(minDuration, Math.round(asset.duration || endFrame || minDuration));
  const safeStart = Math.max(0, Math.min(maxFrame - minDuration, Math.round(startFrame)));
  const safeEnd = Math.max(safeStart + minDuration, Math.min(maxFrame, Math.round(endFrame)));
  if (safeStart === marker.startFrame && safeEnd === marker.endFrame) return document;

  const nextMarkers = markers
    .map((item) => (item.id === markerId ? { ...item, startFrame: safeStart, endFrame: safeEnd } : item))
    .sort((a, b) => a.startFrame - b.startFrame);
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextMarkers);
}

export function updateMarkerStrength(document, markerId, strength) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !asset.presentation) return document;

  const presentation = withDefaultPresentation(asset.presentation);
  const markers = listMarkers(document);
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return document;

  const safeStrength = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : marker.strength));
  if (safeStrength === marker.strength) return document;

  const nextMarkers = markers.map((item) => (item.id === markerId ? { ...item, strength: safeStrength } : item));
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextMarkers);
}

export function listMarkers(document) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return [];
  const timelineMarkers = listTimelineZoomMarkers(document, asset.id);
  return timelineMarkers.length > 0 ? timelineMarkers : asset.presentation?.zoom?.markers ?? [];
}

export function getZoomPresentation(document) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return null;
  const presentation = withDefaultPresentation(asset.presentation);
  return { ...presentation.zoom, markers: listMarkers(document) };
}

export function patchZoomPresentation(document, patch) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;
  const presentation = withDefaultPresentation(asset.presentation);
  const nextZoom = { ...presentation.zoom, ...patch };
  const nextAsset = {
    ...asset,
    presentation: { ...presentation, zoom: nextZoom },
  };
  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextZoom.markers);
}

export function applySuggestion(document, suggestion) {
  if (!suggestion) return document;
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;

  // Preserve kind: 'auto' so the engine's cursor-follow gate
  // (getMarkerFocalPoint in timeline-engine/zoom-transform.ts) fires during
  // playback and export. filterAutoMarkersAgainstExisting blocks duplicate
  // re-suggestions over already-applied regions regardless of kind.
  const appliedMarker = createZoomMarker(suggestion.startFrame, suggestion.endFrame, {
    kind: 'auto',
    strength: suggestion.strength,
    focalPoint: { x: suggestion.focalPoint.x, y: suggestion.focalPoint.y },
    zoomInDuration: suggestion.zoomInDuration,
    zoomOutDuration: suggestion.zoomOutDuration,
  });

  const presentation = withDefaultPresentation(asset.presentation);
  const nextMarkers = [...listMarkers(document), appliedMarker].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return syncTimelineZoomMarkers({
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  }, asset.id, nextMarkers);
}

function listTimelineZoomMarkers(document, assetId) {
  if (!assetId || !Array.isArray(document?.timeline?.markers)) return [];
  const linkedGroupId = `linked:${assetId}`;
  return document.timeline.markers
    .filter((marker) => marker?.kind === 'zoom' && marker.linkedGroupId === linkedGroupId)
    .map((marker) => marker.params?.marker ?? marker)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function syncTimelineZoomMarkers(document, assetId, markers) {
  if (!document?.timeline) return document;
  const linkedGroupId = `linked:${assetId}`;
  const sourceId = `source:${assetId}:screen`;
  const asset = document.assets?.find((item) => item.id === assetId);
  const sources = ensureTimelineSource(document.timeline.sources, sourceId, assetId, asset?.duration ?? 0);
  const linkedGroups = ensureTimelineLinkedGroup(document.timeline.linkedGroups, linkedGroupId, sourceId);
  const existingMarkers = Array.isArray(document.timeline.markers) ? document.timeline.markers : [];
  const nonZoomMarkers = existingMarkers.filter((marker) => marker?.kind !== 'zoom' || marker.linkedGroupId !== linkedGroupId);
  const zoomMarkers = (Array.isArray(markers) ? markers : []).map((marker) => ({
    id: marker.id,
    kind: 'zoom',
    startFrame: marker.startFrame,
    endFrame: marker.endFrame,
    linkedGroupId,
    params: { marker },
  }));
  return {
    ...document,
    timeline: {
      ...document.timeline,
      sources,
      linkedGroups,
      markers: [...nonZoomMarkers, ...zoomMarkers].sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame),
    },
  };
}

function ensureTimelineSource(sources, sourceId, assetId, duration) {
  const existing = Array.isArray(sources) ? sources : [];
  if (existing.some((source) => source.id === sourceId)) return existing;
  return [...existing, { id: sourceId, kind: 'screen', mediaType: 'video', assetId, label: 'Screen', duration: Math.max(0, Math.round(duration || 0)) }];
}

function ensureTimelineLinkedGroup(groups, linkedGroupId, sourceId) {
  const existing = Array.isArray(groups) ? groups : [];
  if (existing.some((group) => group.id === linkedGroupId)) return existing;
  return [...existing, { id: linkedGroupId, kind: 'recording', sourceIds: [sourceId], primarySourceId: sourceId, syncPolicy: 'frame-locked' }];
}

export function withDefaultPresentation(presentation) {
  const defaults = createDefaultRecordingPresentation();
  return {
    ...defaults,
    ...(presentation ?? {}),
    zoom: {
      ...defaults.zoom,
      ...(presentation?.zoom ?? {}),
      markers: Array.isArray(presentation?.zoom?.markers) ? presentation.zoom.markers : [],
    },
    cursor: {
      ...defaults.cursor,
      ...(presentation?.cursor ?? {}),
    },
    camera: {
      ...defaults.camera,
      ...(presentation?.camera ?? {}),
    },
    background: {
      ...defaults.background,
      ...(presentation?.background ?? {}),
    },
  };
}
