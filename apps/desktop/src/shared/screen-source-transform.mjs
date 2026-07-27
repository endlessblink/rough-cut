/**
 * The screen source transform and its inverse. (TASK-252 extracted this pair.)
 *
 * `applyScreenSourceTransform` sets up the canvas transform in which SOURCE
 * RECORDING pixel coordinates land correctly on the composited canvas, whatever
 * the zoom, pan and crop are doing. The cursor overlay and the censor overlay both
 * draw inside it.
 *
 * These live in plain JS rather than beside the renderer in TypeScript for one
 * reason: the desktop test runner is Node 20, which cannot import `.ts`. Left in
 * the `.ts` file, the round-trip test that proves the inverse matches the forward
 * transform skipped silently — and an untested inverse means pointer input lands
 * censors somewhere other than where the user drew them.
 */

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function resolveScale(transform) {
  return transform && Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
}

export function applyScreenSourceTransform(ctx, { screenX, screenY, screenDrawScale, screenSource, transform }) {
  const scale = resolveScale(transform);
  const offsetX = finite(transform?.offsetX);
  const offsetY = finite(transform?.offsetY);
  ctx.translate(screenX, screenY);
  ctx.scale(screenDrawScale, screenDrawScale);
  ctx.translate(screenSource.w / 2 + offsetX, screenSource.h / 2 + offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-(screenSource.x + screenSource.w / 2), -(screenSource.y + screenSource.h / 2));
}

/**
 * Forward direction, for a whole rect: normalized source coordinates → canvas pixels.
 *
 * Needed because resize handles are drawn and hit-tested in canvas space at a fixed
 * pixel size. Drawing them inside `applyScreenSourceTransform` would scale the handles
 * with the zoom, so the caller needs the censor's canvas rect instead.
 *
 * The transform has no rotation, so mapping the two opposite corners is exact.
 */
export function sourceRectToCanvasRect(mapping, rect) {
  if (!mapping || !rect) return null;
  const drawScale = finite(mapping.screenDrawScale, 0);
  if (!(drawScale > 0)) return null;
  if (!(mapping.sourceWidth > 0) || !(mapping.sourceHeight > 0)) return null;
  const screenSource = mapping.screenSource;
  if (!screenSource || !(screenSource.w > 0) || !(screenSource.h > 0)) return null;
  const w = finite(rect.w, 0);
  const h = finite(rect.h, 0);
  if (!(w > 0) || !(h > 0)) return null;

  const scale = resolveScale(mapping.transform);
  const offsetX = finite(mapping.transform?.offsetX);
  const offsetY = finite(mapping.transform?.offsetY);

  const toCanvas = (nx, ny) => {
    const sourceX = nx * mapping.sourceWidth;
    const sourceY = ny * mapping.sourceHeight;
    const localX = (sourceX - (screenSource.x + screenSource.w / 2)) * scale + screenSource.w / 2 + offsetX;
    const localY = (sourceY - (screenSource.y + screenSource.h / 2)) * scale + screenSource.h / 2 + offsetY;
    return { x: mapping.screenX + localX * drawScale, y: mapping.screenY + localY * drawScale };
  };

  const topLeft = toCanvas(finite(rect.x), finite(rect.y));
  const bottomRight = toCanvas(finite(rect.x) + w, finite(rect.y) + h);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: bottomRight.x - topLeft.x,
    h: bottomRight.y - topLeft.y,
  };
}

/**
 * Exact inverse of the above: canvas pixels → normalized source coordinates
 * (0–1 of the full source frame). Returns `null` when the mapping is unusable,
 * rather than guessing a point.
 */
export function canvasPointToSourceNormalized(mapping, canvasX, canvasY) {
  if (!mapping) return null;
  const drawScale = finite(mapping.screenDrawScale, 0);
  if (!(drawScale > 0)) return null;
  if (!(mapping.sourceWidth > 0) || !(mapping.sourceHeight > 0)) return null;
  const screenSource = mapping.screenSource;
  if (!screenSource || !(screenSource.w > 0) || !(screenSource.h > 0)) return null;

  const scale = resolveScale(mapping.transform);
  const offsetX = finite(mapping.transform?.offsetX);
  const offsetY = finite(mapping.transform?.offsetY);

  const localX = (canvasX - mapping.screenX) / drawScale;
  const localY = (canvasY - mapping.screenY) / drawScale;
  const sourceX = (localX - screenSource.w / 2 - offsetX) / scale + screenSource.x + screenSource.w / 2;
  const sourceY = (localY - screenSource.h / 2 - offsetY) / scale + screenSource.y + screenSource.h / 2;
  return { x: sourceX / mapping.sourceWidth, y: sourceY / mapping.sourceHeight };
}
