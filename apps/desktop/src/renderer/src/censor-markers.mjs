import { createDefaultRecordingPresentation } from '@rough-cut/project-model';

import { getPrimaryRecordingAsset } from './zoom-markers.mjs';
import { resolveCensorRectAtFrame } from '../../shared/censor-regions.mjs';

/**
 * Document operations for censor regions. (TASK-252)
 *
 * Mirrors `zoom-markers.mjs`: every function takes a document and returns a new
 * one, returning the SAME document unchanged when the edit is a no-op, so callers
 * can use identity to decide whether to push an undo entry.
 *
 * Rects are normalized 0–1 within the full source recording frame. Frames are
 * source-recording frames, the same space as zoom markers and cut ranges.
 */

const MIN_SPAN_FRAMES = 6;
/** Smallest region worth keeping, as a fraction of the source frame. */
const MIN_RECT_SIZE = 0.005;
export const DEFAULT_CENSOR_BLOCK_SIZE = 24;

/**
 * Box a timeline-created censor starts with: a clearly visible rectangle in the
 * middle of the frame, obviously wanting to be dragged into place. Not full-frame,
 * which reads as alarming, and not invisible, which leaves an unpositioned censor
 * lying around.
 */
export const DEFAULT_CENSOR_RECT = { x: 0.35, y: 0.35, w: 0.3, h: 0.3 };

function withDefaultPresentation(presentation) {
  return { ...createDefaultRecordingPresentation(), ...(presentation ?? {}) };
}

function clampUnit(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Round to 1e-4 of the frame — sub-pixel at 4K.
 *
 * Pointer maths leaves values like 0.39999999999999997, which would otherwise be
 * written into the project file and make saved rects impossible to compare or read.
 */
function roundUnit(value) {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Clamp a drawn rect into the frame, normalizing negative width/height so a
 * right-to-left or bottom-to-top drag produces the same region as the reverse.
 */
export function normalizeCensorRect(rect) {
  if (!rect || typeof rect !== 'object') return null;
  const x1 = clampUnit(Number(rect.x));
  const y1 = clampUnit(Number(rect.y));
  const x2 = clampUnit(Number(rect.x) + Number(rect.w));
  const y2 = clampUnit(Number(rect.y) + Number(rect.h));
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  if (width < MIN_RECT_SIZE || height < MIN_RECT_SIZE) return null;
  return { x: roundUnit(left), y: roundUnit(top), w: roundUnit(width), h: roundUnit(height) };
}

function nextCensorId(existing, startFrame) {
  const taken = new Set((existing ?? []).map((region) => region?.id));
  const base = `censor-${startFrame}`;
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${taken.size + 1}`;
}

export function listCensorRegions(document) {
  const asset = getPrimaryRecordingAsset(document);
  return asset?.presentation?.censorRegions ?? [];
}

function writeCensorRegions(document, regions) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;
  const presentation = withDefaultPresentation(asset.presentation);
  const nextAsset = {
    ...asset,
    presentation: { ...presentation, censorRegions: regions },
  };
  return {
    ...document,
    assets: document.assets.map((item) => (item.id === asset.id ? nextAsset : item)),
  };
}

/**
 * Add a region covering `rect`, running from `startFrame` to the end of the
 * recording by default.
 *
 * Running to the end is deliberate: under-censoring is the dangerous failure, and
 * pulling the end in on the timeline is one drag. A region that stops too early
 * silently ships the thing the user was hiding.
 */
export function addCensorRegionAt(document, options = {}) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset || !(asset.duration > 0)) return document;

  const rect = normalizeCensorRect(options.rect);
  if (!rect) return document;

  const rawStart = Number.isFinite(options.startFrame) ? Math.round(options.startFrame) : 0;
  const startFrame = Math.max(0, Math.min(rawStart, asset.duration - MIN_SPAN_FRAMES));
  const rawEnd = Number.isFinite(options.endFrame) ? Math.round(options.endFrame) : asset.duration;
  const endFrame = Math.max(startFrame + MIN_SPAN_FRAMES, Math.min(rawEnd, asset.duration));
  if (endFrame <= startFrame) return document;

  // Uniquify against what already exists. Deriving the id purely from the frame and
  // the rect collides the moment two censors are created at the same frame with the
  // same default box, which is exactly what timeline-first creation does.
  const id = typeof options.id === 'string' && options.id
    ? options.id
    : nextCensorId(listCensorRegions(document), startFrame);
  const region = {
    id,
    startFrame,
    endFrame,
    rect,
    mode: options.mode === 'solid' ? 'solid' : 'pixelate',
    blockSize: Number.isFinite(options.blockSize) ? options.blockSize : DEFAULT_CENSOR_BLOCK_SIZE,
    soften: options.soften !== false,
  };
  return writeCensorRegions(document, [...listCensorRegions(document), region]);
}

export function updateCensorRegionRange(document, regionId, startFrame, endFrame) {
  const asset = getPrimaryRecordingAsset(document);
  if (!asset) return document;
  const regions = listCensorRegions(document);
  const index = regions.findIndex((region) => region.id === regionId);
  if (index < 0) return document;

  const duration = asset.duration > 0 ? asset.duration : regions[index].endFrame;
  const nextStart = Math.max(0, Math.min(Math.round(startFrame), duration - MIN_SPAN_FRAMES));
  const nextEnd = Math.max(nextStart + MIN_SPAN_FRAMES, Math.min(Math.round(endFrame), duration));
  const current = regions[index];
  if (current.startFrame === nextStart && current.endFrame === nextEnd) return document;

  const next = regions.slice();
  next[index] = { ...current, startFrame: nextStart, endFrame: nextEnd };
  return writeCensorRegions(document, next);
}

/**
 * Move or resize a censor.
 *
 * `frame` matters only for a censor that follows moving content: there the drag is
 * a correction to a whole tracked path, not to one box. Every keyframe shifts by the
 * same delta and takes the new size, so nudging a track that sits slightly off its
 * target fixes it everywhere instead of putting one frame right and the rest wrong.
 * Without this the drag would appear to do nothing at all, because the keyframes —
 * not `rect` — decide where a tracked censor is drawn.
 */
export function updateCensorRegionRect(document, regionId, rect, { frame = null } = {}) {
  const regions = listCensorRegions(document);
  const index = regions.findIndex((region) => region.id === regionId);
  if (index < 0) return document;
  const nextRect = normalizeCensorRect(rect);
  // A drag that collapses the rect to nothing must not delete the censor by
  // accident — keep the previous rect and let the user delete deliberately.
  if (!nextRect) return document;

  const current = regions[index];
  const next = regions.slice();
  const keyframes = Array.isArray(current.keyframes) ? current.keyframes : null;

  if (keyframes && keyframes.length > 0 && Number.isFinite(frame)) {
    const at = resolveCensorRectAtFrame(current, frame);
    const deltaX = at ? nextRect.x - at.x : 0;
    const deltaY = at ? nextRect.y - at.y : 0;
    next[index] = {
      ...current,
      rect: nextRect,
      keyframes: keyframes.map((keyframe) => {
        const w = nextRect.w;
        const h = nextRect.h;
        return {
          frame: keyframe.frame,
          rect: {
            // Clamped per keyframe rather than by clamping the delta once: a path
            // that runs to the edge of the frame should slide along it, not drag
            // the rest of the path back with it.
            x: Math.max(0, Math.min(1 - w, keyframe.rect.x + deltaX)),
            y: Math.max(0, Math.min(1 - h, keyframe.rect.y + deltaY)),
            w,
            h,
          },
        };
      }),
    };
  } else {
    next[index] = { ...current, rect: nextRect };
  }
  return writeCensorRegions(document, next);
}

/**
 * Replace the positions a censor follows.
 *
 * An empty list drops tracking entirely and leaves the censor still, parked at
 * wherever it was last drawn rather than snapping back to where it was first placed
 * — a censor that jumps somewhere else when tracking is cleared has uncovered its
 * target for as long as it takes the user to notice.
 */
export function setCensorRegionKeyframes(document, regionId, keyframes, { frame = null } = {}) {
  const regions = listCensorRegions(document);
  const index = regions.findIndex((region) => region.id === regionId);
  if (index < 0) return document;
  const current = regions[index];

  const usable = (Array.isArray(keyframes) ? keyframes : [])
    .map((keyframe) => {
      const rect = normalizeCensorRect(keyframe?.rect);
      if (!rect || !Number.isFinite(keyframe?.frame)) return null;
      return { frame: Math.max(0, Math.round(keyframe.frame)), rect };
    })
    .filter(Boolean)
    .sort((a, b) => a.frame - b.frame);

  const next = regions.slice();
  if (usable.length === 0) {
    if (!current.keyframes) return document;
    const { keyframes: _dropped, ...rest } = current;
    const parked = resolveCensorRectAtFrame(current, Number.isFinite(frame) ? frame : current.startFrame);
    next[index] = { ...rest, rect: parked ?? current.rect };
  } else {
    next[index] = { ...current, keyframes: usable, rect: usable[0].rect };
  }
  return writeCensorRegions(document, next);
}

export function setCensorRegionSoftness(document, regionId, softness) {
  const next = Math.max(0, Math.min(1, Number(softness)));
  if (!Number.isFinite(next)) return document;
  const regions = listCensorRegions(document);
  const index = regions.findIndex((region) => region.id === regionId);
  if (index < 0) return document;
  const current = regions[index];
  if (current.softness === next && current.soften !== false) return document;
  const updated = regions.slice();
  // Clear the legacy `soften: false` when the user raises softness, otherwise the
  // old flag would keep overriding the new value to 0.
  updated[index] = { ...current, softness: next, soften: next > 0 ? true : current.soften };
  return writeCensorRegions(document, updated);
}

export function setCensorRegionMode(document, regionId, mode) {
  const nextMode = mode === 'solid' ? 'solid' : 'pixelate';
  const regions = listCensorRegions(document);
  const index = regions.findIndex((region) => region.id === regionId);
  if (index < 0 || regions[index].mode === nextMode) return document;
  const next = regions.slice();
  next[index] = { ...regions[index], mode: nextMode };
  return writeCensorRegions(document, next);
}

export function removeCensorRegion(document, regionId) {
  const regions = listCensorRegions(document);
  const next = regions.filter((region) => region.id !== regionId);
  if (next.length === regions.length) return document;
  return writeCensorRegions(document, next);
}
