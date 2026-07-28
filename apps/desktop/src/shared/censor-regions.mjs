/**
 * Censor region geometry, shared by the preview renderer and the headless export
 * renderer so both agree on exactly what gets hidden. (TASK-252)
 *
 * ## Coordinate contract
 *
 * A `CensorRegion.rect` is normalized 0–1 within the FULL source recording frame,
 * before `screenCrop`. Everything here converts that into source pixels, because
 * both renderers draw the censor **inside** `applyScreenSourceTransform` — the same
 * canvas transform the cursor overlay draws in. Within that transform, source pixel
 * coordinates land correctly on the composited canvas no matter what the zoom, pan
 * or crop are doing, so there is deliberately NO second source→canvas mapping here.
 * Do not add one: a censor that drifts off its target is a leak, not a cosmetic bug.
 *
 * `activeCensorRegionsAt` is re-exported from `@rough-cut/project-model` rather than
 * reimplemented here: the frame resolver and both renderers must never disagree
 * about which regions are active. A censor active in the preview but not in the
 * export would ship the very thing it was meant to hide.
 *
 * ## Why the mosaic samples the video, not the canvas
 *
 * Pixelation is built by drawing the video's source region into a small offscreen
 * canvas and scaling it back up inside the transform. That avoids reading pixels
 * back out of the presentation canvas, keeps the result independent of draw order,
 * and means the mosaic zooms with the content instead of being recomputed per frame
 * in screen space.
 */

export { activeCensorRegionsAt } from '@rough-cut/project-model';

const MIN_BLOCK_SIZE = 1;
const MAX_MOSAIC_CELLS = 512;
const DEFAULT_BLOCK_SIZE = 24;
export const DEFAULT_CENSOR_FILL_COLOR = '#0b0f14';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Convert a normalized censor rect into source pixels, clamped to the source frame.
 *
 * Returns `null` when the region has no visible area — fully outside the frame, or
 * degenerate after clamping. Callers must treat `null` as "draw nothing" rather
 * than falling back to a default rect, so a malformed region can never paint over
 * the wrong part of the screen.
 */
export function censorRectToSourceRect(rect, sourceWidth, sourceHeight) {
  if (!rect || typeof rect !== 'object') return null;
  const width = finite(sourceWidth, 0);
  const height = finite(sourceHeight, 0);
  if (width <= 0 || height <= 0) return null;

  const rawX = finite(rect.x, Number.NaN);
  const rawY = finite(rect.y, Number.NaN);
  const rawW = finite(rect.w, Number.NaN);
  const rawH = finite(rect.h, Number.NaN);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
  if (!Number.isFinite(rawW) || !Number.isFinite(rawH)) return null;
  if (rawW <= 0 || rawH <= 0) return null;

  const left = Math.max(0, rawX * width);
  const top = Math.max(0, rawY * height);
  const right = Math.min(width, (rawX + rawW) * width);
  const bottom = Math.min(height, (rawY + rawH) * height);
  if (right <= left || bottom <= top) return null;

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Canvas pixels per source pixel at the current zoom.
 *
 * Canvas filters and offscreen buffer sizes are measured in device pixels, not in
 * the transformed source space, so anything expressed in source pixels — the
 * mosaic block size, the soften radius — has to be converted through this.
 */
export function resolveCensorSourceScale({ screenDrawScale, transform } = {}) {
  const drawScale = finite(screenDrawScale, 1);
  const zoom = transform && Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
  const scale = drawScale * zoom;
  return scale > 0 ? scale : 1;
}

export function resolveCensorBlockSize(region) {
  const raw = finite(region?.blockSize, DEFAULT_BLOCK_SIZE);
  return Math.max(MIN_BLOCK_SIZE, raw);
}

/**
 * Offscreen mosaic buffer size for a region, in cells.
 *
 * Capped at `MAX_MOSAIC_CELLS` per axis: a tiny block size on a large region would
 * otherwise allocate a near-full-resolution buffer every frame, which defeats the
 * point and stalls playback. Hitting the cap makes the mosaic coarser than asked,
 * never finer, so the region stays at least as censored as requested.
 */
export function resolveCensorMosaicGrid(sourceRect, region) {
  if (!sourceRect) return null;
  const blockSize = resolveCensorBlockSize(region);
  const cols = Math.min(MAX_MOSAIC_CELLS, Math.max(1, Math.round(sourceRect.w / blockSize)));
  const rows = Math.min(MAX_MOSAIC_CELLS, Math.max(1, Math.round(sourceRect.h / blockSize)));
  return { cols, rows };
}

export const DEFAULT_CENSOR_SOFTNESS = 0.5;

/** Smallest censor you can drag to, as a fraction of the frame. */
const MIN_CENSOR_EXTENT = 0.02;

function clampUnitValue(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Slide a censor rect by a normalized delta, keeping it fully inside the frame.
 *
 * The rect keeps its size: clamping the position rather than squashing the box means
 * dragging into a corner parks it there instead of silently shrinking the censored
 * area, which would uncover content.
 */
export function moveCensorRect(rect, deltaX, deltaY) {
  const w = clampUnitValue(rect?.w);
  const h = clampUnitValue(rect?.h);
  if (!(w > 0) || !(h > 0)) return null;
  return {
    x: Math.max(0, Math.min(1 - w, clampUnitValue(rect.x) + (Number.isFinite(deltaX) ? deltaX : 0))),
    y: Math.max(0, Math.min(1 - h, clampUnitValue(rect.y) + (Number.isFinite(deltaY) ? deltaY : 0))),
    w,
    h,
  };
}

/**
 * Drag one edge or corner of a censor rect to a normalized pointer position.
 *
 * `handle` is the compass string the shared frame helpers already use ('n', 'se', …).
 * Edges that were not grabbed stay put, and the box cannot be inverted or shrunk
 * below `MIN_CENSOR_EXTENT`.
 */
export function resizeCensorRect(rect, handle, pointerX, pointerY) {
  const startX = clampUnitValue(rect?.x);
  const startY = clampUnitValue(rect?.y);
  const startW = clampUnitValue(rect?.w);
  const startH = clampUnitValue(rect?.h);
  if (!(startW > 0) || !(startH > 0)) return null;

  let left = startX;
  let top = startY;
  let right = startX + startW;
  let bottom = startY + startH;
  const compass = typeof handle === 'string' ? handle : 'se';
  const px = clampUnitValue(pointerX);
  const py = clampUnitValue(pointerY);

  if (compass.includes('w')) left = Math.min(px, right - MIN_CENSOR_EXTENT);
  if (compass.includes('e')) right = Math.max(px, left + MIN_CENSOR_EXTENT);
  if (compass.includes('n')) top = Math.min(py, bottom - MIN_CENSOR_EXTENT);
  if (compass.includes('s')) bottom = Math.max(py, top + MIN_CENSOR_EXTENT);

  return {
    x: Math.max(0, left),
    y: Math.max(0, top),
    w: Math.min(1, right) - Math.max(0, left),
    h: Math.min(1, bottom) - Math.max(0, top),
  };
}

/**
 * How much the mosaic is smoothed, 0–1, resolved from both the legacy `soften`
 * boolean and the newer `softness` number.
 *
 * Single source of truth on purpose: the preview blur, the export's second `geq`
 * pass and the sidebar slider all read this, so they cannot drift apart and show the
 * user one thing while writing another.
 */
export function resolveCensorSoftness(region) {
  if (!region || typeof region !== 'object') return 0;
  // Legacy off wins: a project saved with softening explicitly off keeps crisp blocks.
  if (region.soften === false) return 0;
  const raw = finite(region.softness, Number.NaN);
  if (!Number.isFinite(raw)) return DEFAULT_CENSOR_SOFTNESS;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Tap spacing for the export's smoothing pass, in source pixels, or 0 when the pass
 * should be skipped entirely.
 *
 * Skipping matters: emitting a zero-spacing average would still cost a full extra
 * `geq` pass (measured 39ms/frame → 99ms/frame at 1080p) to produce the same image.
 * Spacing tops out at a quarter of the block so blocks stay legible as blocks —
 * that is the "blur over the pixelation" look, as opposed to smoothing them away.
 */
export function resolveCensorBlurSpacing(region) {
  const softness = resolveCensorSoftness(region);
  if (softness <= 0) return 0;
  const block = resolveCensorBlockSize(region);
  return Math.max(1, Math.round((block / 4) * softness));
}

/**
 * Soften blur radius in device pixels, or 0 when softening does not apply.
 *
 * Derived from the block size rather than exposed as its own control: the point is
 * to take the hard edges off an already-destroyed mosaic, and a radius large enough
 * to matter visually is a fraction of one block.
 *
 * Always 0 for `solid`. A blurred flat colour clipped to its own rect is
 * indistinguishable from the unblurred one, so softening a solid fill would burn a
 * blur pass to change nothing.
 *
 * The renderer applies this radius while drawing the mosaic buffer back up, so the
 * blur's only input is already-destroyed pixels and it cannot reintroduce detail.
 */
export function resolveCensorSoftenRadiusPx(region, sourceScale) {
  if (region?.mode === 'solid') return 0;
  const softness = resolveCensorSoftness(region);
  if (softness <= 0) return 0;
  const scale = finite(sourceScale, 1);
  // Same fraction-of-a-block the export's tap spacing uses, so the preview and the
  // file soften by a comparable amount rather than each drifting to its own taste.
  const radius = resolveCensorBlockSize(region) * 0.35 * softness * (scale > 0 ? scale : 1);
  return Math.min(24, Math.max(0.5, radius));
}

/**
 * Map a censor's source-pixel rect into a destination rect, given the source
 * rectangle that was sampled to fill it.
 *
 * The headless export renderer composites with a direct
 * `drawImage(video, sourceRect → destRect)` rather than a canvas transform, so it
 * cannot draw in source coordinates the way the preview does. This is the same
 * affine expressed through that source rect, and it lives here — tested, shared —
 * rather than inline in the renderer, because a censor drawn in the wrong place is
 * a leak.
 *
 * Returns `null` when the censor falls entirely outside the visible source
 * rectangle (zoomed past, or cropped out).
 */
export function mapCensorSourceRectToDest(censorRect, sourceRect, destRect) {
  if (!censorRect || !sourceRect || !destRect) return null;
  const sw = finite(sourceRect.width, 0);
  const sh = finite(sourceRect.height, 0);
  if (sw <= 0 || sh <= 0) return null;
  const dw = finite(destRect.width, 0);
  const dh = finite(destRect.height, 0);
  if (dw <= 0 || dh <= 0) return null;

  // Intersect in source space first so a censor that is half off-screen is
  // clipped rather than scaled into the wrong place.
  const left = Math.max(censorRect.x, sourceRect.x);
  const top = Math.max(censorRect.y, sourceRect.y);
  const right = Math.min(censorRect.x + censorRect.w, sourceRect.x + sw);
  const bottom = Math.min(censorRect.y + censorRect.h, sourceRect.y + sh);
  if (right <= left || bottom <= top) return null;

  const scaleX = dw / sw;
  const scaleY = dh / sh;
  return {
    x: destRect.x + (left - sourceRect.x) * scaleX,
    y: destRect.y + (top - sourceRect.y) * scaleY,
    w: (right - left) * scaleX,
    h: (bottom - top) * scaleY,
  };
}

/**
 * Sorted, validated keyframes for a region, or an empty array when it has none.
 *
 * Malformed entries are dropped rather than throwing: a censor whose keyframe list
 * is partly corrupt must still censor. Dropping one keyframe widens the interval
 * around it, which keeps the region covered; refusing to resolve at all would
 * uncover the content the region exists to hide.
 */
function normalizeCensorKeyframes(region) {
  const raw = region?.keyframes;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const valid = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    if (!Number.isFinite(entry.frame)) continue;
    const rect = entry.rect;
    if (!rect || typeof rect !== 'object') continue;
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) continue;
    if (!Number.isFinite(rect.w) || !Number.isFinite(rect.h)) continue;
    if (!(rect.w > 0) || !(rect.h > 0)) continue;
    valid.push(entry);
  }
  // Stored order is not trusted: the tracker appends as it walks the clip, but a
  // user dragging an existing keyframe earlier would otherwise invert a segment.
  return valid.sort((a, b) => a.frame - b.frame);
}

function lerpRect(from, to, t) {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    w: from.w + (to.w - from.w) * t,
    h: from.h + (to.h - from.h) * t,
  };
}

/**
 * Where a censor sits at a given source frame.
 *
 * A region without keyframes is static and answers with its own `rect`, so every
 * caller can route through this and stay correct for both kinds. With keyframes the
 * rect moves linearly between them and holds flat outside the first and last — a
 * censor must never stop covering its target just because the tracked span ended.
 *
 * `frame` may be fractional: preview playback runs on an accelerated clock that
 * lands between frames.
 */
export function resolveCensorRectAtFrame(region, frame) {
  const keyframes = normalizeCensorKeyframes(region);
  if (keyframes.length === 0) return region?.rect ?? null;

  const at = finite(frame, Number.NaN);
  if (!Number.isFinite(at)) return keyframes[0].rect;
  if (at <= keyframes[0].frame) return keyframes[0].rect;
  const last = keyframes[keyframes.length - 1];
  if (at >= last.frame) return last.rect;

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const from = keyframes[i];
    const to = keyframes[i + 1];
    if (at < from.frame || at > to.frame) continue;
    const span = to.frame - from.frame;
    if (!(span > 0)) return to.rect;
    return lerpRect(from.rect, to.rect, (at - from.frame) / span);
  }
  return last.rect;
}

/**
 * A region's lifetime split into spans over which its rect moves linearly.
 *
 * This exists for the export: FFmpeg pays for a moving censor per *pixel*, so one
 * expression carrying every keyframe is quadratic in practice (measured: 40
 * keyframes took 65s to render 2s of 1080p, against 2.2s for one). Emitting one
 * short two-keyframe filter per span, each switched on only for its own span, is
 * flat instead — 600 spans cost the same as 40.
 *
 * Boundaries are the keyframes that fall strictly inside the region, so the spans
 * tile `[startFrame, endFrame)` exactly with no gap and no overlap. Endpoint rects
 * are resolved through `resolveCensorRectAtFrame`, which is what keeps the file and
 * the preview showing the same thing: within a span the underlying function is
 * already linear, so re-anchoring it to the span's own ends is exact, not an
 * approximation.
 */
export function censorKeyframeSegments(region) {
  const startFrame = finite(region?.startFrame, Number.NaN);
  const endFrame = finite(region?.endFrame, Number.NaN);
  if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame)) return [];
  if (!(endFrame > startFrame)) return [];

  const boundaries = [startFrame];
  for (const keyframe of normalizeCensorKeyframes(region)) {
    if (keyframe.frame <= startFrame || keyframe.frame >= endFrame) continue;
    if (keyframe.frame === boundaries[boundaries.length - 1]) continue;
    boundaries.push(keyframe.frame);
  }
  boundaries.push(endFrame);

  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    segments.push({
      startFrame: boundaries[i],
      endFrame: boundaries[i + 1],
      fromRect: resolveCensorRectAtFrame(region, boundaries[i]),
      toRect: resolveCensorRectAtFrame(region, boundaries[i + 1]),
    });
  }
  return segments;
}

/** True when a region's rect changes over its lifetime. */
export function censorRegionIsAnimated(region) {
  return normalizeCensorKeyframes(region).length > 1;
}

export function resolveCensorFillColor(region) {
  const color = region?.fillColor;
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_CENSOR_FILL_COLOR;
}
