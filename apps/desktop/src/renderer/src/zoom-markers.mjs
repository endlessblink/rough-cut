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

  const presentation = asset.presentation ?? createDefaultRecordingPresentation();
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

  const markers = asset.presentation.zoom.markers;
  const nextMarkers = markers.filter((marker) => marker.id !== markerId);
  if (nextMarkers.length === markers.length) return document;

  const nextAsset = {
    ...asset,
    presentation: {
      ...asset.presentation,
      zoom: { ...asset.presentation.zoom, markers: nextMarkers },
    },
  };

  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

export function listMarkers(document) {
  const asset = getPrimaryRecordingAsset(document);
  return asset?.presentation?.zoom.markers ?? [];
}
