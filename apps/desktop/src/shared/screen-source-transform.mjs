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
