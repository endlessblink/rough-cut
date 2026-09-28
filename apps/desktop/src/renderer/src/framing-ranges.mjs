import { createDefaultRecordingPresentation } from '@rough-cut/project-model';

import { getPrimaryRecordingAsset } from './zoom-markers.mjs';

/**
 * Document operations for framing ranges: spans where a cropped screen (Story ·
 * 9:16) holds a chosen spot instead of following the cursor.
 *
 * Mirrors `censor-markers.mjs`: every function takes a document and returns a
 * new one, returning the SAME document when the edit is a no-op so callers can
 * use identity to decide whether to push an undo entry.
 *
 * Frames are source-recording frames; focal points are normalized 0–1 within the
 * full source recording.
 */

const MIN_SPAN_FRAMES = 6;

function withDefaultPresentation(presentation) {
  return { ...createDefaultRecordingPresentation(), ...(presentation ?? {}) };
}

function clampUnit(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(Math.max(0, Math.min(1, value)) * 1e4) / 1e4;
}

function nextFramingId(existing, startFrame) {
  const taken = new Set((existing ?? []).map((range) => range?.id));
  const base = `framing-${startFrame}`;
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${taken.size + 1}`;
}

export function listFramingRanges(document) {
  const asset = getPrimaryRecordingAsset(document);
  return asset?.presentation?.framingRanges ?? [];
}

function writeFramingRanges(document, ranges) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;
  const presentation = withDefaultPresentation(asset.presentation);
  const sorted = [...ranges].sort((a, b) => a.startFrame - b.startFrame);
  const nextAsset = { ...asset, presentation: { ...presentation, framingRanges: sorted } };
  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

/** Add a range from `startFrame` to `endFrame` holding `focalPoint`. */
export function addFramingRangeAt(document, options = {}) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !(asset.duration > 0)) return document;
  const rawStart = Number.isFinite(options.startFrame) ? Math.round(options.startFrame) : 0;
  const startFrame = Math.max(0, Math.min(rawStart, asset.duration - MIN_SPAN_FRAMES));
  const rawEnd = Number.isFinite(options.endFrame) ? Math.round(options.endFrame) : startFrame + MIN_SPAN_FRAMES;
  const endFrame = Math.max(startFrame + MIN_SPAN_FRAMES, Math.min(rawEnd, asset.duration));
  if (endFrame <= startFrame) return document;
  const id = typeof options.id === 'string' && options.id
    ? options.id
    : nextFramingId(listFramingRanges(document), startFrame);
  const focal = options.focalPoint ?? { x: 0.5, y: 0.5 };
  const range = { id, startFrame, endFrame, focalPoint: { x: clampUnit(focal.x), y: clampUnit(focal.y) } };
  return writeFramingRanges(document, [...listFramingRanges(document), range]);
}

export function updateFramingRangeRange(document, rangeId, startFrame, endFrame) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;
  const ranges = listFramingRanges(document);
  const index = ranges.findIndex((range) => range.id === rangeId);
  if (index < 0) return document;
  const duration = asset.duration > 0 ? asset.duration : ranges[index].endFrame;
  const nextStart = Math.max(0, Math.min(Math.round(startFrame), duration - MIN_SPAN_FRAMES));
  const nextEnd = Math.max(nextStart + MIN_SPAN_FRAMES, Math.min(Math.round(endFrame), duration));
  const current = ranges[index];
  if (current.startFrame === nextStart && current.endFrame === nextEnd) return document;
  const next = ranges.slice();
  next[index] = { ...current, startFrame: nextStart, endFrame: nextEnd };
  return writeFramingRanges(document, next);
}

export function updateFramingRangeFocalPoint(document, rangeId, focalPoint) {
  const ranges = listFramingRanges(document);
  const index = ranges.findIndex((range) => range.id === rangeId);
  if (index < 0 || !focalPoint) return document;
  const x = clampUnit(focalPoint.x);
  const y = clampUnit(focalPoint.y);
  const current = ranges[index];
  if (current.focalPoint.x === x && current.focalPoint.y === y) return document;
  const next = ranges.slice();
  next[index] = { ...current, focalPoint: { x, y } };
  return writeFramingRanges(document, next);
}

export function removeFramingRange(document, rangeId) {
  const ranges = listFramingRanges(document);
  const next = ranges.filter((range) => range.id !== rangeId);
  if (next.length === ranges.length) return document;
  return writeFramingRanges(document, next);
}
