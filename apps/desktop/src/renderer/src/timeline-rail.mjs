import { listMarkers } from './zoom-markers.mjs';
import { selectRecordingEditModel } from './recording-timeline.mjs';

const DEFAULT_TICK_COUNT = 7;

export function clampTimelineTime(timeSec, durationSec) {
  if (!Number.isFinite(timeSec)) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return Math.max(0, timeSec);
  return Math.min(durationSec, Math.max(0, timeSec));
}

export function timeToPercent(timeSec, durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return (clampTimelineTime(timeSec, durationSec) / durationSec) * 100;
}

export function percentToTime(percent, durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(percent)) return 0;
  return (Math.min(100, Math.max(0, percent)) / 100) * durationSec;
}

export function frameToPercent(frame, fps, durationSec) {
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return timeToPercent(frame / fps, durationSec);
}

export function frameRangeToPlacement(startFrame, endFrame, fps, durationSec) {
  const start = frameToPercent(startFrame, fps, durationSec);
  const end = frameToPercent(endFrame, fps, durationSec);
  return {
    left: Math.min(start, end),
    width: Math.max(0.5, Math.abs(end - start)),
  };
}

export function buildTimelineModel({ document, recording, currentTimeSec, cameraMediaUrl }) {
  const fps = Number.isFinite(recording?.fps) && recording.fps > 0 ? recording.fps : 30;
  const adapter = selectRecordingEditModel({ document });
  const frameDuration = Number.isFinite(recording?.duration) && recording.duration > 0
    ? recording.duration
    : adapter.sourceDurationFrames;
  const recordingAsset = adapter.recordingAsset ?? getPrimaryAsset(document);
  const primaryClip = adapter.primaryClip;
  const trimStartFrame = primaryClip ? clampFrame(primaryClip.sourceIn, 0, frameDuration) : 0;
  const lastClip = adapter.screenClips[adapter.screenClips.length - 1] ?? primaryClip;
  const trimEndFrame = lastClip ? clampFrame(lastClip.sourceOut, trimStartFrame + 1, frameDuration) : frameDuration;
  const trimmedFrameDuration = Math.max(1, trimEndFrame - trimStartFrame);
  const durationSec = Math.max(0.1, frameDuration / fps);
  const visibleDurationSec = Math.max(0.1, trimmedFrameDuration / fps);
  const cursorEvents = getCursorEvents(recordingAsset);
  const clickEvents = cursorEvents.filter((event) => event.type === 'down' && event.frame >= trimStartFrame && event.frame <= trimEndFrame);
  const markers = listMarkers(document);
  const zoomRegions = assignZoomLayers(markers
    .filter((marker) => marker.endFrame >= trimStartFrame && marker.startFrame <= trimEndFrame)
    .map((marker) => ({
      id: marker.id,
      kind: marker.kind,
      startFrame: marker.startFrame,
      endFrame: marker.endFrame,
      strength: marker.strength,
      label: marker.kind === 'auto' ? 'Auto zoom' : 'Manual zoom',
      ...frameRangeToPlacement(marker.startFrame - trimStartFrame, marker.endFrame - trimStartFrame, fps, durationSec),
    })));

  return {
    durationSec,
    visibleDurationSec,
    currentTimeSec: clampTimelineTime(currentTimeSec, visibleDurationSec),
    playheadPercent: timeToPercent(currentTimeSec, durationSec),
    trimStartFrame,
    trimEndFrame,
    ticks: Array.from({ length: DEFAULT_TICK_COUNT }, (_, index) => (durationSec / (DEFAULT_TICK_COUNT - 1)) * index),
    zoomLayerCount: Math.max(1, ...zoomRegions.map((region) => region.layer + 1)),
    lanes: {
      screen: adapter.screenClips.length > 0
        ? adapter.screenClips.map((clip, index) => ({
            id: clip.id ?? `screen-${index}`,
            ...frameRangeToPlacement(clip.sourceIn - trimStartFrame, clip.sourceOut - trimStartFrame, fps, durationSec),
          }))
        : [{ id: 'screen', left: 0, width: (visibleDurationSec / durationSec) * 100 }],
      zoom: zoomRegions,
      clicks: clickEvents.map((event, index) => ({
        id: `${event.frame}-${index}`,
        left: frameToPercent(event.frame - trimStartFrame, fps, durationSec),
      })),
      camera: recording?.camera || cameraMediaUrl ? [{ id: 'camera', left: 0, width: 100 }] : [],
      audio: recording?.audio ? [{ id: 'audio', left: 0, width: 100 }] : [],
    },
  };
}

function assignZoomLayers(regions) {
  const layerEnds = [];
  const assignments = new Map();
  const byPrecedence = [...regions].sort((a, b) => {
    const durationDelta = (b.endFrame - b.startFrame) - (a.endFrame - a.startFrame);
    if (durationDelta !== 0) return durationDelta;
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
    return String(a.id).localeCompare(String(b.id));
  });

  for (const region of byPrecedence) {
    let layer = layerEnds.findIndex((endFrame) => region.startFrame >= endFrame);
    if (layer === -1) layer = layerEnds.length;
    layerEnds[layer] = region.endFrame;
    assignments.set(region.id, layer);
  }

  return regions.map((region) => ({ ...region, layer: assignments.get(region.id) ?? 0 }));
}

function getPrimaryAsset(document) {
  return document?.assets?.find((asset) => asset.type === 'recording') ?? null;
}

function clampFrame(value, min, max) {
  const frame = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, frame));
}

function getCursorEvents(asset) {
  const events = asset?.metadata?.cursorEvents;
  if (!Array.isArray(events)) return [];
  return events.filter((event) => Number.isFinite(event?.frame) && typeof event?.type === 'string');
}
