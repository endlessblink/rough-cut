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
  if (!region?.soften) return 0;
  if (region.mode === 'solid') return 0;
  const scale = finite(sourceScale, 1);
  const radius = resolveCensorBlockSize(region) * 0.35 * (scale > 0 ? scale : 1);
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

export function resolveCensorFillColor(region) {
  const color = region?.fillColor;
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_CENSOR_FILL_COLOR;
}
