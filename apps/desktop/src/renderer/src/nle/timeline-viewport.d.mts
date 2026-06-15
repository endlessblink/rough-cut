export const SNAP_PX: number;
export const MAX_PIXELS_PER_FRAME: number;
export const ZOOM_STEP_FACTOR: number;
export function fitPixelsPerFrame(viewWidthPx: number, durationFrames: number): number;
export function resolvePixelsPerFrame(requested: number | null | undefined, viewWidthPx: number, durationFrames: number): number;
export function contentWidthPx(durationFrames: number, pixelsPerFrame: number): number;
export function frameAtClientX(clientX: number, contentRectLeft: number, pixelsPerFrame: number, durationFrames: number): number;
export function frameToContentX(frame: number, pixelsPerFrame: number): number;
export function snapThresholdFrames(pixelsPerFrame: number): number;
export function zoomStep(currentPpf: number | null, direction: 1 | -1, viewWidthPx: number, durationFrames: number): number | null;
export function scrollLeftForAnchor(anchorFrame: number, pixelsPerFrame: number, pointerOffsetPx: number): number;
export function scrollLeftForPlayheadFollow(
  playheadContentX: number,
  currentScrollLeft: number,
  viewWidthPx: number,
  contentWidthPx: number,
  options?: { leadingRatio?: number; trailingRatio?: number },
): number;
