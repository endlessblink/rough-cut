export interface ZoomMotionTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ZoomMotionSourceViewport {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ZoomMotionBlurOptions {
  readonly previous?: ZoomMotionTransform | null;
  readonly current: ZoomMotionTransform;
  readonly next?: ZoomMotionTransform | null;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly reducedMotion?: boolean;
}

export interface WebGLMotionBlurSampleOptions {
  readonly enabled?: boolean;
  readonly blurPx: number;
  readonly reducedMotion?: boolean;
}

const SCALE_MOTION_THRESHOLD = 0.006;
const TRANSLATE_MOTION_THRESHOLD = 0.0025;
const MAX_MOTION_BLUR_PX = 1.15;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function transformDelta(
  left: ZoomMotionTransform | null | undefined,
  right: ZoomMotionTransform,
  sourceWidth: number,
  sourceHeight: number,
): number {
  if (!left) return 0;
  const scaleDelta = Math.abs(finite(right.scale, 1) - finite(left.scale, 1));
  const translateDelta =
    Math.abs(finite(right.offsetX) - finite(left.offsetX)) / Math.max(1, sourceWidth) +
    Math.abs(finite(right.offsetY) - finite(left.offsetY)) / Math.max(1, sourceHeight);
  return Math.max(scaleDelta / SCALE_MOTION_THRESHOLD, translateDelta / TRANSLATE_MOTION_THRESHOLD);
}

export function resolveZoomMotionBlurPx({
  previous,
  current,
  next,
  sourceWidth,
  sourceHeight,
  reducedMotion = false,
}: ZoomMotionBlurOptions): number {
  if (reducedMotion) return 0;
  if (!Number.isFinite(current.scale) || current.scale <= 1.001) return 0;

  const velocity = Math.max(
    transformDelta(previous, current, sourceWidth, sourceHeight),
    transformDelta(next, current, sourceWidth, sourceHeight),
  );
  if (velocity <= 1) return 0;
  return Math.min(MAX_MOTION_BLUR_PX, 0.34 + velocity * 0.16);
}

export function resolveWebGLMotionBlurSampleCount({
  enabled = false,
  blurPx,
  reducedMotion = false,
}: WebGLMotionBlurSampleOptions): number {
  if (!enabled || reducedMotion || !Number.isFinite(blurPx) || blurPx <= 0.01) return 1;
  return blurPx >= 0.95 ? 5 : 3;
}

export function applyScreenSourceTransform(
  ctx: CanvasRenderingContext2D,
  {
    screenX,
    screenY,
    screenDrawScale,
    screenSource,
    transform,
  }: {
    readonly screenX: number;
    readonly screenY: number;
    readonly screenDrawScale: number;
    readonly screenSource: ZoomMotionSourceViewport;
    readonly transform: ZoomMotionTransform;
  },
): void {
  const scale = Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
  const offsetX = finite(transform.offsetX);
  const offsetY = finite(transform.offsetY);
  ctx.translate(screenX, screenY);
  ctx.scale(screenDrawScale, screenDrawScale);
  ctx.translate(screenSource.w / 2 + offsetX, screenSource.h / 2 + offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-(screenSource.x + screenSource.w / 2), -(screenSource.y + screenSource.h / 2));
}

export function drawZoomMotionSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  {
    screenX,
    screenY,
    screenDrawScale,
    screenSource,
    sourceWidth,
    sourceHeight,
    transform,
    blurPx,
    sharpZoom,
  }: {
    readonly screenX: number;
    readonly screenY: number;
    readonly screenDrawScale: number;
    readonly screenSource: ZoomMotionSourceViewport;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly transform: ZoomMotionTransform;
    readonly blurPx: number;
    readonly sharpZoom?: boolean;
  },
): void {
  ctx.save();
  const previousFilter = ctx.filter;
  const previousImageSmoothingEnabled = ctx.imageSmoothingEnabled;
  const previousImageSmoothingQuality = ctx.imageSmoothingQuality;
  if (blurPx > 0) {
    ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  } else if (sharpZoom !== false && transform.scale > 1.001) {
    ctx.imageSmoothingEnabled = false;
  }
  applyScreenSourceTransform(ctx, { screenX, screenY, screenDrawScale, screenSource, transform });
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  ctx.filter = previousFilter;
  ctx.imageSmoothingEnabled = previousImageSmoothingEnabled;
  ctx.imageSmoothingQuality = previousImageSmoothingQuality;
  ctx.restore();
}
