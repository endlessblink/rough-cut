// Timeline viewport math for the NLE Editor — the single frame↔pixel
// authority. The timeline renders inside a content element whose width is
// durationFrames * pixelsPerFrame; existing percent-based clip/tick/playhead
// positioning stays exact because the percentages resolve against this
// zoomed content width. Only clientX→frame conversion and snap thresholds
// need these helpers. Pure functions — no DOM, fully unit-testable.

// Snap reach is a constant SCREEN distance. The old model used
// 6 * (durationFrames / laneWidth), which grew with timeline length and
// reached ±92 frames on a 5-minute recording (reproduced by
// scripts/visual-nle-clips-playwright.mjs).
export const SNAP_PX = 8;

// Zoom ceiling: 4px per frame ≈ 120px per second at 30fps — enough to land
// single frames with a mouse. Floor is always fit-to-width.
export const MAX_PIXELS_PER_FRAME = 4;
export const ZOOM_STEP_FACTOR = 1.5;

export function fitPixelsPerFrame(viewWidthPx, durationFrames) {
  const width = Number(viewWidthPx);
  const frames = Number(durationFrames);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(frames) || frames <= 0) return 0;
  return width / frames;
}

// requested === null means "fit" (the default — first paint matches the
// pre-zoom layout). Any explicit value clamps to [fit, MAX].
export function resolvePixelsPerFrame(requested, viewWidthPx, durationFrames) {
  const fit = fitPixelsPerFrame(viewWidthPx, durationFrames);
  if (requested === null || requested === undefined) return fit;
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return fit;
  return Math.min(MAX_PIXELS_PER_FRAME, Math.max(fit, value));
}

export function contentWidthPx(durationFrames, pixelsPerFrame) {
  const frames = Number(durationFrames);
  const ppf = Number(pixelsPerFrame);
  if (!Number.isFinite(frames) || frames <= 0 || !Number.isFinite(ppf) || ppf <= 0) return 0;
  return frames * ppf;
}

// clientX → frame, measured against the content element's bounding rect.
// The content rect's left edge already accounts for scroll position, so no
// separate scrollLeft bookkeeping is needed for pointer math.
export function frameAtClientX(clientX, contentRectLeft, pixelsPerFrame, durationFrames) {
  const ppf = Number(pixelsPerFrame);
  const frames = Number(durationFrames);
  if (!Number.isFinite(ppf) || ppf <= 0 || !Number.isFinite(frames) || frames <= 0) return 0;
  const frame = Math.round((Number(clientX) - Number(contentRectLeft)) / ppf);
  return Math.max(0, Math.min(frames, frame));
}

export function frameToContentX(frame, pixelsPerFrame) {
  return Number(frame) * Number(pixelsPerFrame);
}

export function snapThresholdFrames(pixelsPerFrame) {
  const ppf = Number(pixelsPerFrame);
  if (!Number.isFinite(ppf) || ppf <= 0) return 0;
  return SNAP_PX / ppf;
}

// One zoom-in/out step. direction: 1 = in, -1 = out. Returns the next
// requested pixelsPerFrame, or null when the step lands at/below fit
// (null = "fit" so window resizes keep the whole timeline visible).
export function zoomStep(currentPpf, direction, viewWidthPx, durationFrames) {
  const fit = fitPixelsPerFrame(viewWidthPx, durationFrames);
  const base = Number.isFinite(Number(currentPpf)) && Number(currentPpf) > 0 ? Number(currentPpf) : fit;
  const next = direction > 0 ? base * ZOOM_STEP_FACTOR : base / ZOOM_STEP_FACTOR;
  if (next <= fit) return null;
  return Math.min(MAX_PIXELS_PER_FRAME, next);
}

// Scroll offset that keeps anchorFrame under the same pointer position
// after a zoom change. pointerOffsetPx is the pointer's distance from the
// scroll container's left edge.
export function scrollLeftForAnchor(anchorFrame, pixelsPerFrame, pointerOffsetPx) {
  return Math.max(0, Number(anchorFrame) * Number(pixelsPerFrame) - Number(pointerOffsetPx));
}

export function scrollLeftForPlayheadFollow(playheadContentX, currentScrollLeft, viewWidthPx, contentWidthPx, options = {}) {
  const playheadX = Number(playheadContentX);
  const scrollLeft = Number(currentScrollLeft);
  const viewWidth = Number(viewWidthPx);
  const contentWidth = Number(contentWidthPx);
  if (!Number.isFinite(playheadX) || !Number.isFinite(scrollLeft) || !Number.isFinite(viewWidth) || !Number.isFinite(contentWidth)) return scrollLeft || 0;
  if (viewWidth <= 0 || contentWidth <= viewWidth) return 0;
  const maxScrollLeft = Math.max(0, contentWidth - viewWidth);
  const leadingRatio = Number.isFinite(Number(options.leadingRatio)) ? Number(options.leadingRatio) : 0.35;
  const trailingRatio = Number.isFinite(Number(options.trailingRatio)) ? Number(options.trailingRatio) : 0.65;
  const leadingPx = Math.max(0, Math.min(viewWidth, viewWidth * leadingRatio));
  const trailingPx = Math.max(leadingPx, Math.min(viewWidth, viewWidth * trailingRatio));
  const visibleX = playheadX - scrollLeft;
  if (visibleX < leadingPx) return Math.max(0, Math.min(maxScrollLeft, playheadX - leadingPx));
  if (visibleX > trailingPx) return Math.max(0, Math.min(maxScrollLeft, playheadX - trailingPx));
  return Math.max(0, Math.min(maxScrollLeft, scrollLeft));
}

export function stepScrollLeftTowardTarget(currentScrollLeft, targetScrollLeft, options = {}) {
  const current = Number(currentScrollLeft);
  const target = Number(targetScrollLeft);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return Number.isFinite(current) ? current : 0;
  const delta = target - current;
  const distance = Math.abs(delta);
  const settlePx = Number.isFinite(Number(options.settlePx)) ? Math.max(0, Number(options.settlePx)) : 0.5;
  if (distance <= settlePx) return target;
  const viewWidth = Number(options.viewWidthPx);
  const snapDistancePx = Number.isFinite(Number(options.snapDistancePx))
    ? Math.max(0, Number(options.snapDistancePx))
    : Number.isFinite(viewWidth) && viewWidth > 0
      ? viewWidth * 1.25
      : 1200;
  if (distance >= snapDistancePx) return target;
  const easing = Number.isFinite(Number(options.easing)) ? Math.max(0.01, Math.min(1, Number(options.easing))) : 0.18;
  const minStepPx = Number.isFinite(Number(options.minStepPx)) ? Math.max(0, Number(options.minStepPx)) : 1.5;
  const maxStepPx = Number.isFinite(Number(options.maxStepPx)) ? Math.max(minStepPx, Number(options.maxStepPx)) : 72;
  const step = Math.min(distance, Math.max(minStepPx, Math.min(maxStepPx, distance * easing)));
  return current + Math.sign(delta) * step;
}
