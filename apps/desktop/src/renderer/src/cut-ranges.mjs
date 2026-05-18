import { createDefaultRecordingPresentation } from '@rough-cut/project-model';

const MIN_CUT_FRAMES = 1;

export function listCutRanges(document, assetId = null, totalFrames = Number.POSITIVE_INFINITY) {
  const asset = assetId
    ? document?.assets?.find((item) => item.id === assetId)
    : document?.assets?.find((item) => item.type === 'recording');
  const timelineRanges = listTimelineCutRanges(document, asset?.id, totalFrames);
  return timelineRanges.length > 0 ? timelineRanges : normalizeCutRanges(asset?.presentation?.cutRanges, totalFrames);
}

export function normalizeCutRanges(ranges, totalFrames = Number.POSITIVE_INFINITY) {
  const maxFrame = Number.isFinite(totalFrames) && totalFrames > 0 ? Math.round(totalFrames) : Number.POSITIVE_INFINITY;
  const normalized = (Array.isArray(ranges) ? ranges : [])
    .map((range) => {
      const startFrame = clampFrame(range?.startFrame, 0, Math.max(0, maxFrame - MIN_CUT_FRAMES));
      const endFrame = clampFrame(range?.endFrame, startFrame + MIN_CUT_FRAMES, maxFrame);
      return range?.id && endFrame > startFrame ? { id: String(range.id), startFrame, endFrame } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame);

  const merged = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && range.startFrame <= previous.endFrame) {
      previous.endFrame = Math.max(previous.endFrame, range.endFrame);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function addCutRange(document, assetId, startFrame, endFrame, totalFrames) {
  const rangeStart = clampFrame(Math.min(startFrame, endFrame), 0, Math.max(0, totalFrames - MIN_CUT_FRAMES));
  const rangeEnd = clampFrame(Math.max(startFrame, endFrame), rangeStart + MIN_CUT_FRAMES, totalFrames);
  if (rangeEnd <= rangeStart) return document;
  return updateRecordingPresentation(document, assetId, (presentation) => ({
    ...presentation,
    cutRanges: normalizeCutRanges([
      ...(presentation.cutRanges ?? []),
      { id: createCutRangeId(), startFrame: rangeStart, endFrame: rangeEnd },
    ], totalFrames),
  }));
}

export function removeCutRange(document, assetId, cutRangeId, totalFrames) {
  return updateRecordingPresentation(document, assetId, (presentation) => ({
    ...presentation,
    cutRanges: normalizeCutRanges((presentation.cutRanges ?? []).filter((range) => range.id !== cutRangeId), totalFrames),
  }));
}

export function clearCutRanges(document, assetId) {
  return updateRecordingPresentation(document, assetId, (presentation) => ({
    ...presentation,
    cutRanges: [],
  }));
}

export function removedFramesBefore(cutRanges, sourceFrame) {
  return normalizeCutRanges(cutRanges).reduce((total, range) => {
    if (sourceFrame <= range.startFrame) return total;
    return total + Math.min(sourceFrame, range.endFrame) - range.startFrame;
  }, 0);
}

export function sourceFrameToVisibleFrame(cutRanges, sourceFrame) {
  return Math.max(0, sourceFrame - removedFramesBefore(cutRanges, sourceFrame));
}

export function visibleFrameToSourceFrame(cutRanges, visibleFrame, totalFrames) {
  const normalized = normalizeCutRanges(cutRanges, totalFrames);
  let sourceFrame = Math.max(0, Math.round(visibleFrame));
  for (const range of normalized) {
    if (sourceFrame < range.startFrame) break;
    sourceFrame += range.endFrame - range.startFrame;
  }
  return clampFrame(sourceFrame, 0, totalFrames);
}

export function visibleDurationFrames(cutRanges, totalFrames) {
  const removed = normalizeCutRanges(cutRanges, totalFrames).reduce((sum, range) => sum + range.endFrame - range.startFrame, 0);
  return Math.max(1, Math.round(totalFrames) - removed);
}

function updateRecordingPresentation(document, assetId, updater) {
  if (!assetId) return document;
  let changed = false;
  let nextCutRanges = null;
  const assets = document.assets?.map((asset) => {
    if (asset.id !== assetId) return asset;
    changed = true;
    const presentation = { ...createDefaultRecordingPresentation(), ...(asset.presentation ?? {}) };
    const nextPresentation = updater(presentation);
    nextCutRanges = nextPresentation.cutRanges ?? [];
    return { ...asset, presentation: nextPresentation };
  });
  if (!changed) return document;
  return syncTimelineCutMarkers({ ...document, assets }, assetId, nextCutRanges ?? []);
}

function listTimelineCutRanges(document, assetId, totalFrames) {
  if (!assetId || !Array.isArray(document?.timeline?.markers)) return [];
  const linkedGroupId = `linked:${assetId}`;
  const ranges = document.timeline.markers
    .filter((marker) => marker?.kind === 'cut' && marker.linkedGroupId === linkedGroupId)
    .map((marker) => ({ id: marker.id, startFrame: marker.startFrame, endFrame: marker.endFrame }));
  return normalizeCutRanges(ranges, totalFrames);
}

function syncTimelineCutMarkers(document, assetId, cutRanges) {
  if (!document?.timeline) return document;
  const linkedGroupId = `linked:${assetId}`;
  const sourceId = `source:${assetId}:screen`;
  const asset = document.assets?.find((item) => item.id === assetId);
  const sources = ensureTimelineSource(document.timeline.sources, sourceId, assetId, asset?.duration ?? 0);
  const linkedGroups = ensureTimelineLinkedGroup(document.timeline.linkedGroups, linkedGroupId, sourceId);
  const existingMarkers = Array.isArray(document.timeline.markers) ? document.timeline.markers : [];
  const nonCutMarkers = existingMarkers.filter((marker) => marker?.kind !== 'cut' || marker.linkedGroupId !== linkedGroupId);
  const cutMarkers = normalizeCutRanges(cutRanges).map((range) => ({
    id: range.id,
    kind: 'cut',
    startFrame: range.startFrame,
    endFrame: range.endFrame,
    linkedGroupId,
    params: { range },
  }));
  return {
    ...document,
    timeline: {
      ...document.timeline,
      sources,
      linkedGroups,
      markers: [...nonCutMarkers, ...cutMarkers].sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame),
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

function clampFrame(value, min, max) {
  const frame = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, frame));
}

function createCutRangeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `cut-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
