import { listMarkers } from './zoom-markers.mjs';
import { listCensorRegions } from './censor-markers.mjs';
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
  const sourceDurationSec = Math.max(0.1, frameDuration / fps);
  const durationSec = Math.max(0.1, adapter.timelineDurationFrames / fps);
  const visibleDurationSec = Math.max(0.1, trimmedFrameDuration / fps);
  const cursorEvents = getCursorEvents(recordingAsset);
  const clickEvents = cursorEvents
    .filter((event) => event.type === 'down' && event.frame >= trimStartFrame && event.frame <= trimEndFrame)
    .flatMap((event, index) => {
      const timelineFrame = sourceFrameToTimelineFrame(adapter.screenClips, event.frame);
      if (timelineFrame === null) return [];
      return [{ id: `${event.frame}-${index}`, left: frameToPercent(timelineFrame, fps, durationSec) }];
    });
  const markers = listMarkers(document);
  const zoomRegions = assignZoomLayers(markers
    .filter((marker) => marker.endFrame >= trimStartFrame && marker.startFrame <= trimEndFrame)
    .flatMap((marker) => {
      // A zoom marker is one logical clip. If the screen recording is split
      // (e.g. a cut leaves two clips with a gap), the marker's source range
      // maps to several timeline pieces — merge them into one placement so the
      // marker renders as a single, independently-draggable clip rather than
      // multiple bars that share `marker.id`.
      const pieces = sourceRangeToTimelinePlacements(adapter.screenClips, marker.startFrame, marker.endFrame, fps, durationSec);
      if (pieces.length === 0) return [];
      const left = Math.min(...pieces.map((piece) => piece.left));
      const right = Math.max(...pieces.map((piece) => piece.left + piece.width));
      return [{
        id: marker.id,
        kind: marker.kind,
        startFrame: marker.startFrame,
        endFrame: marker.endFrame,
        strength: marker.strength,
        label: marker.kind === 'auto' ? 'Auto zoom' : 'Manual zoom',
        left,
        width: Math.max(0, right - left),
      }];
    }));

  // Censor regions are placed the same way zoom markers are — source range mapped
  // through the screen clips — so a censor keeps covering the same content after a
  // trim or a cut, rather than sliding onto whatever now sits at those frames.
  const censorRegions = listCensorRegions(document)
    .filter((region) => region.endFrame >= trimStartFrame && region.startFrame <= trimEndFrame)
    .flatMap((region) => {
      const pieces = sourceRangeToTimelinePlacements(adapter.screenClips, region.startFrame, region.endFrame, fps, durationSec);
      if (pieces.length === 0) return [];
      const left = Math.min(...pieces.map((piece) => piece.left));
      const right = Math.max(...pieces.map((piece) => piece.left + piece.width));
      return [{
        id: region.id,
        kind: region.mode === 'solid' ? 'solid' : 'pixelate',
        startFrame: region.startFrame,
        endFrame: region.endFrame,
        label: region.label ?? (region.mode === 'solid' ? 'Solid censor' : 'Pixelated censor'),
        left,
        width: Math.max(0, right - left),
      }];
    });

  return {
    durationSec,
    visibleDurationSec,
    sourceDurationSec,
    currentTimeSec: clampTimelineTime(currentTimeSec, durationSec),
    playheadPercent: timeToPercent(currentTimeSec, durationSec),
    trimStartFrame,
    trimEndFrame,
    ticks: Array.from({ length: DEFAULT_TICK_COUNT }, (_, index) => (durationSec / (DEFAULT_TICK_COUNT - 1)) * index),
    zoomLayerCount: Math.max(1, ...zoomRegions.map((region) => region.layer + 1)),
    lanes: {
      screen: adapter.screenClips.length > 0
        ? adapter.screenClips.map((clip, index) => ({
            id: clip.id ?? `screen-${index}`,
            sourceIn: clip.sourceIn,
            sourceOut: clip.sourceOut,
            timelineIn: clip.timelineIn,
            timelineOut: clip.timelineOut,
            ...frameRangeToPlacement(clip.timelineIn, clip.timelineOut, fps, durationSec),
          }))
        : [{ id: 'screen', left: 0, width: 100, sourceIn: 0, sourceOut: frameDuration, timelineIn: 0, timelineOut: adapter.timelineDurationFrames }],
      zoom: zoomRegions,
      censor: censorRegions,
      clicks: clickEvents,
      camera: recording?.camera || cameraMediaUrl ? [{ id: 'camera', left: 0, width: 100 }] : [],
      audio: recording?.audio ? [{ id: 'audio', left: 0, width: 100 }] : [],
    },
  };
}

function sourceFrameToTimelineFrame(clips, sourceFrame) {
  if (!Array.isArray(clips) || clips.length === 0) return sourceFrame;
  const clip = clips.find((item) => sourceFrame >= item.sourceIn && sourceFrame < item.sourceOut);
  if (!clip) return null;
  return clip.timelineIn + (sourceFrame - clip.sourceIn);
}

function sourceRangeToTimelinePlacements(clips, startFrame, endFrame, fps, durationSec) {
  if (!Array.isArray(clips) || clips.length === 0) {
    return [frameRangeToPlacement(startFrame, endFrame, fps, durationSec)];
  }
  return clips.flatMap((clip) => {
    const start = Math.max(startFrame, clip.sourceIn);
    const end = Math.min(endFrame, clip.sourceOut);
    if (end <= start) return [];
    return [frameRangeToPlacement(
      clip.timelineIn + (start - clip.sourceIn),
      clip.timelineIn + (end - clip.sourceIn),
      fps,
      durationSec,
    )];
  });
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
