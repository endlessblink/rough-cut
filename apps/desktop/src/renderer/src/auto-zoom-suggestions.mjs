import {
  filterAutoMarkersAgainstManual,
  generateAutoZoomMarkers,
} from '@rough-cut/timeline-engine';
import {
  getCursorEvents,
  getRecordingFps,
  getRecordingSourceSize,
} from './cursor-data.mjs';

const DEFAULT_INTENSITY = 0.5;

function getZoomMarkers(document) {
  if (!document || !Array.isArray(document.assets)) return [];
  const asset = document.assets.find((a) => a?.type === 'recording' || a?.type === 'video');
  const markers = asset?.presentation?.zoom?.markers;
  return Array.isArray(markers) ? markers : [];
}

function getAutoIntensityFromProject(document) {
  if (!document || !Array.isArray(document.assets)) return null;
  const asset = document.assets.find((a) => a?.type === 'recording' || a?.type === 'video');
  const intensity = Number(asset?.presentation?.zoom?.autoIntensity);
  if (!Number.isFinite(intensity)) return null;
  return Math.max(0, Math.min(1, intensity));
}

export function generateSuggestionsForProject(document, options = {}) {
  const intensityOverride = Number.isFinite(options.intensity) ? options.intensity : null;
  const intensity =
    intensityOverride ?? getAutoIntensityFromProject(document) ?? DEFAULT_INTENSITY;

  const cursorEvents = getCursorEvents(document);
  const fps = getRecordingFps(document);
  const { width, height } = getRecordingSourceSize(document);
  const markers = getZoomMarkers(document);
  const existingManual = markers.filter((marker) => marker?.kind === 'manual');

  const candidates = generateAutoZoomMarkers(cursorEvents, intensity, fps, width, height);
  const filtered = filterAutoMarkersAgainstManual(candidates, markers);

  return { candidates, filtered, existingManual };
}
