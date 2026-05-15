import {
  createDefaultRecordingPresentation,
  createZoomMarker,
} from '@rough-cut/project-model';

const DEFAULT_MARKER_SPAN_FRAMES = 60;
const DEFAULT_MIN_SPAN_FRAMES = 15;

export function getPrimaryRecordingAsset(document) {
  for (const asset of document.assets) {
    if (asset.type === 'recording' || asset.type === 'video') return asset;
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
  const nextMarkers = [...presentation.zoom.markers, marker].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

export function removeMarker(document, markerId) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !asset.presentation) return document;

  const presentation = withDefaultPresentation(asset.presentation);
  const markers = presentation.zoom.markers;
  const nextMarkers = markers.filter((marker) => marker.id !== markerId);
  if (nextMarkers.length === markers.length) return document;

  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

export function updateMarkerRange(document, markerId, startFrame, endFrame, options = {}) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !asset.presentation) return document;

  const presentation = withDefaultPresentation(asset.presentation);
  const markers = presentation.zoom.markers;
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

  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

export function updateMarkerStrength(document, markerId, strength) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !asset.presentation) return document;

  const presentation = withDefaultPresentation(asset.presentation);
  const markers = presentation.zoom.markers;
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return document;

  const safeStrength = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : marker.strength));
  if (safeStrength === marker.strength) return document;

  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: markers.map((item) => (item.id === markerId ? { ...item, strength: safeStrength } : item)) },
    },
  };

  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

export function listMarkers(document) {
  const asset = getPrimaryRecordingAsset(document);
  return asset?.presentation?.zoom?.markers ?? [];
}

export function getZoomPresentation(document) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return null;
  const presentation = withDefaultPresentation(asset.presentation);
  return presentation.zoom;
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
  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
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
  const nextMarkers = [...presentation.zoom.markers, appliedMarker].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const nextAsset = {
    ...asset,
    presentation: {
      ...presentation,
      zoom: { ...presentation.zoom, markers: nextMarkers },
    },
  };

  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
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
