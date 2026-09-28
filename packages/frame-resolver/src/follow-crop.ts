import type { FramingRange, RegionCrop } from '@rough-cut/project-model';

/** Normalized [0, 1] cursor position in the full source recording, or null. */
export type NormalizedCursorLookup = (sourceFrame: number) => { x: number; y: number } | null;

// The follow works like a camera operator on a leash: while the cursor moves
// around the middle of the view nothing moves; only when it nears an edge does
// the view get pulled along, just enough to keep it inside. That path is then
// eased with a centred Gaussian, which leaves steady pans exactly on the leash
// (no lag) and rounds off every start and stop, so motion is smooth.
//
// The fraction of the view, either side of centre, the cursor may roam freely.
const LEASH_FREE_FRACTION = 0.3;
// Easing width. Wider is floatier; this keeps starts/stops soft without lag.
const EASE_SIGMA_SECONDS = 0.22;

/**
 * Pan a crop so it keeps the recorded cursor in view, smoothly. Size and aspect
 * never change; the crop stays inside the source. While the cursor is off the
 * recorded screen (another monitor) the view waits where it left; with no
 * cursor data at all the crop keeps its stored (resting) position.
 *
 * Deterministic per frame, so preview seeks and export frame N agree.
 */
export function resolveFollowCursorCrop(
  crop: RegionCrop,
  sourceWidth: number,
  sourceHeight: number,
  sourceFrame: number,
  fps: number,
  getCursorPosition: NormalizedCursorLookup,
): RegionCrop {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return crop;
  const center = easedLeashCenter(crop, sourceWidth, sourceHeight, sourceFrame, fps, getCursorPosition);
  if (!center) return crop;
  return cropCenteredAt(crop, sourceWidth, sourceHeight, center.x * sourceWidth, center.y * sourceHeight);
}

interface LeashPath {
  readonly xs: number[];
  readonly ys: number[];
  hasCursor: boolean;
}

// The leash path depends on everything before a frame, so it is built once per
// cursor lookup and crop shape and extended as later frames are asked for.
const leashPaths = new WeakMap<NormalizedCursorLookup, Map<string, LeashPath>>();
// How far ahead to look for the first on-screen cursor to start the leash on.
const LEASH_START_SEARCH_FRAMES = 600;

function onScreen(point: { x: number; y: number } | null): point is { x: number; y: number } {
  return Boolean(point)
    && Number.isFinite(point!.x) && Number.isFinite(point!.y)
    && point!.x >= 0 && point!.x <= 1 && point!.y >= 0 && point!.y <= 1;
}

function leashPathFor(
  lookup: NormalizedCursorLookup,
  halfW: number,
  halfH: number,
  restX: number,
  restY: number,
): LeashPath {
  let byShape = leashPaths.get(lookup);
  if (!byShape) {
    byShape = new Map();
    leashPaths.set(lookup, byShape);
  }
  const key = `${halfW}:${halfH}:${restX}:${restY}`;
  let path = byShape.get(key);
  if (!path) {
    path = { xs: [], ys: [], hasCursor: false };
    byShape.set(key, path);
  }
  return path;
}

function extendLeashPath(
  path: LeashPath,
  toFrame: number,
  lookup: NormalizedCursorLookup,
  halfW: number,
  halfH: number,
  restX: number,
  restY: number,
): void {
  const clampX = (value: number) => Math.max(halfW, Math.min(1 - halfW, value));
  const clampY = (value: number) => Math.max(halfH, Math.min(1 - halfH, value));
  if (path.xs.length === 0) {
    // Start on the first on-screen cursor, not the resting spot, so the video
    // does not open with a long pan.
    let startX = restX;
    let startY = restY;
    for (let frame = 0; frame <= LEASH_START_SEARCH_FRAMES; frame += 1) {
      const point = lookup(frame);
      if (onScreen(point)) {
        startX = point.x;
        startY = point.y;
        path.hasCursor = true;
        break;
      }
    }
    path.xs.push(clampX(startX));
    path.ys.push(clampY(startY));
  }
  const freeX = halfW * 2 * LEASH_FREE_FRACTION;
  const freeY = halfH * 2 * LEASH_FREE_FRACTION;
  for (let frame = path.xs.length; frame <= toFrame; frame += 1) {
    let x = path.xs[frame - 1] ?? restX;
    let y = path.ys[frame - 1] ?? restY;
    const point = lookup(frame);
    if (onScreen(point)) {
      path.hasCursor = true;
      if (point.x > x + freeX) x = point.x - freeX;
      else if (point.x < x - freeX) x = point.x + freeX;
      if (point.y > y + freeY) y = point.y - freeY;
      else if (point.y < y - freeY) y = point.y + freeY;
    }
    path.xs.push(clampX(x));
    path.ys.push(clampY(y));
  }
}

function easedLeashCenter(
  crop: RegionCrop,
  sourceWidth: number,
  sourceHeight: number,
  sourceFrame: number,
  fps: number,
  lookup: NormalizedCursorLookup,
): { x: number; y: number } | null {
  const halfW = Math.min(0.5, crop.width / sourceWidth / 2);
  const halfH = Math.min(0.5, crop.height / sourceHeight / 2);
  const restX = (crop.x + crop.width / 2) / sourceWidth;
  const restY = (crop.y + crop.height / 2) / sourceHeight;
  const frame = Math.max(0, Math.round(sourceFrame));
  const sigma = Math.max(1, Math.max(1, fps) * EASE_SIGMA_SECONDS);
  const reach = Math.ceil(sigma * 3);
  const path = leashPathFor(lookup, halfW, halfH, restX, restY);
  extendLeashPath(path, frame + reach, lookup, halfW, halfH, restX, restY);
  if (!path.hasCursor) return null;

  let sumX = 0;
  let sumY = 0;
  let sumWeight = 0;
  for (let offset = -reach; offset <= reach; offset += 1) {
    // Before the first frame the path holds its starting position.
    const index = Math.max(0, frame + offset);
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    sumX += (path.xs[index] ?? restX) * weight;
    sumY += (path.ys[index] ?? restY) * weight;
    sumWeight += weight;
  }
  return { x: sumX / sumWeight, y: sumY / sumWeight };
}

// How long the view takes to glide onto a framing range's spot (before it
// starts) and back to following (after it ends).
const FRAMING_GLIDE_SECONDS = 0.4;

/**
 * The crop for a frame with framing ranges applied. Outside every range the
 * crop follows the cursor (when `followCursor` is on) or rests at its stored
 * position; inside a range it holds that range's spot, gliding in just before
 * the range starts and out just after it ends. Stateless, like the follow, so
 * preview and export resolve the same crop for the same frame.
 */
export function resolveFramedCrop(
  crop: RegionCrop,
  sourceWidth: number,
  sourceHeight: number,
  sourceFrame: number,
  fps: number,
  getCursorPosition: NormalizedCursorLookup | undefined,
  framingRanges: readonly FramingRange[] | null | undefined,
): RegionCrop {
  const base = crop.followCursor && getCursorPosition
    ? resolveFollowCursorCrop(crop, sourceWidth, sourceHeight, sourceFrame, fps, getCursorPosition)
    : crop;
  if (!framingRanges?.length || !(sourceWidth > 0) || !(sourceHeight > 0)) return base;

  const glideFrames = Math.max(1, Math.round(Math.max(1, fps) * FRAMING_GLIDE_SECONDS));
  let centerX = base.x + base.width / 2;
  let centerY = base.y + base.height / 2;
  let touched = false;
  const ordered = [...framingRanges].sort((a, b) => a.startFrame - b.startFrame);
  for (const range of ordered) {
    const weight = framingWeight(range, sourceFrame, glideFrames);
    if (weight <= 0) continue;
    touched = true;
    centerX += (range.focalPoint.x * sourceWidth - centerX) * weight;
    centerY += (range.focalPoint.y * sourceHeight - centerY) * weight;
  }
  if (!touched) return base;
  return cropCenteredAt(crop, sourceWidth, sourceHeight, centerX, centerY);
}

/** 1 inside the range, easing to 0 over `glideFrames` either side of it. */
function framingWeight(range: FramingRange, frame: number, glideFrames: number): number {
  if (frame >= range.startFrame && frame < range.endFrame) return 1;
  const distance = frame < range.startFrame ? range.startFrame - frame : frame - (range.endFrame - 1);
  if (distance >= glideFrames) return 0;
  const t = 1 - distance / glideFrames;
  return t * t * (3 - 2 * t);
}

function cropCenteredAt(
  crop: RegionCrop,
  sourceWidth: number,
  sourceHeight: number,
  centerX: number,
  centerY: number,
): RegionCrop {
  const width = Math.min(crop.width, sourceWidth);
  const height = Math.min(crop.height, sourceHeight);
  // Sub-pixel on purpose: whole-pixel steps read as stutter once the narrow
  // slice is scaled up to fill a vertical frame. 1/100 px keeps values tidy.
  const tidy = (value: number) => Math.round(value * 100) / 100;
  return {
    ...crop,
    x: tidy(Math.max(0, Math.min(sourceWidth - width, centerX - width / 2))),
    y: tidy(Math.max(0, Math.min(sourceHeight - height, centerY - height / 2))),
  };
}

/**
 * Re-express a full-source cursor lookup in the crop's own [0, 1] space, so a
 * zoom inside a cropped screen aims at what is visible there. The crop is
 * resolved per frame, so a following crop and its zoom stay in step.
 */
export function cursorLookupInCropSpace(
  getCursorPosition: NormalizedCursorLookup,
  cropAtFrame: (sourceFrame: number) => RegionCrop,
  sourceWidth: number,
  sourceHeight: number,
): NormalizedCursorLookup {
  return (sourceFrame) => {
    const point = getCursorPosition(sourceFrame);
    if (!point) return null;
    const crop = cropAtFrame(sourceFrame);
    if (!(crop.width > 0) || !(crop.height > 0)) return point;
    return {
      x: (point.x * sourceWidth - crop.x) / crop.width,
      y: (point.y * sourceHeight - crop.y) / crop.height,
    };
  };
}
