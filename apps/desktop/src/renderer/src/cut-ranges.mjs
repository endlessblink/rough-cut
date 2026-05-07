import { createDefaultRecordingPresentation } from '@rough-cut/project-model';

const MIN_CUT_FRAMES = 1;

export function listCutRanges(document, assetId = null, totalFrames = Number.POSITIVE_INFINITY) {
  const asset = assetId
    ? document?.assets?.find((item) => item.id === assetId)
    : document?.assets?.find((item) => item.type === 'recording');
  return normalizeCutRanges(asset?.presentation?.cutRanges, totalFrames);
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
  const assets = document.assets?.map((asset) => {
    if (asset.id !== assetId) return asset;
    changed = true;
    const presentation = { ...createDefaultRecordingPresentation(), ...(asset.presentation ?? {}) };
    return { ...asset, presentation: updater(presentation) };
  });
  return changed ? { ...document, assets } : document;
}

function clampFrame(value, min, max) {
  const frame = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, frame));
}

function createCutRangeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `cut-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
