import type { Frame, ZoomMarker, ZoomMarkerId } from '@rough-cut/project-model';

export interface ZoomSegmentEditOptions {
  readonly durationFrames: Frame;
  readonly minDurationFrames?: Frame;
}

const DEFAULT_MIN_DURATION_FRAMES = 15;

export function moveZoomMarker(
  markers: readonly ZoomMarker[],
  markerId: ZoomMarkerId,
  deltaFrames: Frame,
  options: ZoomSegmentEditOptions,
): readonly ZoomMarker[] {
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return markers;

  const span = marker.endFrame - marker.startFrame;
  const bounds = getMarkerMoveBounds(markers, markerId, options.durationFrames);
  const nextStart = clamp(Math.round(marker.startFrame + deltaFrames), bounds.minStart, bounds.maxStart);
  return replaceMarker(markers, markerId, {
    ...marker,
    startFrame: nextStart,
    endFrame: nextStart + span,
  });
}

export function resizeZoomMarkerStart(
  markers: readonly ZoomMarker[],
  markerId: ZoomMarkerId,
  deltaFrames: Frame,
  options: ZoomSegmentEditOptions,
): readonly ZoomMarker[] {
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return markers;

  const minDuration = resolveMinDuration(options.minDurationFrames);
  const previous = getPreviousMarker(markers, markerId);
  const minStart = previous ? previous.endFrame : 0;
  const maxStart = marker.endFrame - minDuration;
  const nextStart = clamp(Math.round(marker.startFrame + deltaFrames), minStart, maxStart);
  return replaceMarker(markers, markerId, { ...marker, startFrame: nextStart });
}

export function resizeZoomMarkerEnd(
  markers: readonly ZoomMarker[],
  markerId: ZoomMarkerId,
  deltaFrames: Frame,
  options: ZoomSegmentEditOptions,
): readonly ZoomMarker[] {
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return markers;

  const minDuration = resolveMinDuration(options.minDurationFrames);
  const next = getNextMarker(markers, markerId);
  const minEnd = marker.startFrame + minDuration;
  const maxEnd = next ? next.startFrame : Math.max(0, options.durationFrames);
  const nextEnd = clamp(Math.round(marker.endFrame + deltaFrames), minEnd, maxEnd);
  return replaceMarker(markers, markerId, { ...marker, endFrame: nextEnd });
}

export function getMarkerMoveBounds(
  markers: readonly ZoomMarker[],
  markerId: ZoomMarkerId,
  durationFrames: Frame,
): { readonly minStart: Frame; readonly maxStart: Frame } {
  const marker = markers.find((item) => item.id === markerId);
  if (!marker) return { minStart: 0, maxStart: Math.max(0, durationFrames) };

  const previous = getPreviousMarker(markers, markerId);
  const next = getNextMarker(markers, markerId);
  const span = marker.endFrame - marker.startFrame;
  return {
    minStart: previous ? previous.endFrame : 0,
    maxStart: Math.max(previous ? previous.endFrame : 0, (next ? next.startFrame : Math.max(0, durationFrames)) - span),
  };
}

function getPreviousMarker(markers: readonly ZoomMarker[], markerId: ZoomMarkerId): ZoomMarker | null {
  const sorted = sortMarkers(markers);
  const index = sorted.findIndex((marker) => marker.id === markerId);
  return index > 0 ? (sorted[index - 1] ?? null) : null;
}

function getNextMarker(markers: readonly ZoomMarker[], markerId: ZoomMarkerId): ZoomMarker | null {
  const sorted = sortMarkers(markers);
  const index = sorted.findIndex((marker) => marker.id === markerId);
  return index >= 0 && index < sorted.length - 1 ? (sorted[index + 1] ?? null) : null;
}

function replaceMarker(markers: readonly ZoomMarker[], markerId: ZoomMarkerId, nextMarker: ZoomMarker): readonly ZoomMarker[] {
  return markers
    .map((marker) => (marker.id === markerId ? nextMarker : marker))
    .sort((a, b) => a.startFrame - b.startFrame);
}

function sortMarkers(markers: readonly ZoomMarker[]): readonly ZoomMarker[] {
  return [...markers].sort((a, b) => a.startFrame - b.startFrame);
}

function resolveMinDuration(value: Frame | undefined): Frame {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_MIN_DURATION_FRAMES;
}

function clamp(value: Frame, min: Frame, max: Frame): Frame {
  return Math.max(min, Math.min(max, value));
}
