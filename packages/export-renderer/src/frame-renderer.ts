import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import type { RegionCrop } from '@rough-cut/project-model';
import type { RenderFrame, RenderLayer, ResolvedEffect } from '@rough-cut/frame-resolver';
import { getCameraBorderRadius, getCameraLayoutRect } from '@rough-cut/frame-resolver';

export interface RenderCanvasLike {
  width: number;
  height: number;
}

export interface RenderContext2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  drawImage?(image: unknown, dx: number, dy: number, dWidth: number, dHeight: number): void;
  clip?(): void;
  getImageData(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): { data: Uint8ClampedArray | Uint8Array };
  roundRect?(x: number, y: number, width: number, height: number, radii?: number | number[]): void;
}

// Palette of colors for clip visualisation — cycles by trackIndex
const LAYER_COLORS = [
  '#4A90D9',
  '#E67E22',
  '#27AE60',
  '#8E44AD',
  '#E74C3C',
  '#1ABC9C',
  '#F39C12',
  '#2980B9',
];

function getLayerColor(trackIndex: number): string {
  return LAYER_COLORS[trackIndex % LAYER_COLORS.length] ?? '#888888';
}

/**
 * Create a reusable canvas for frame rendering.
 */
export function createRenderCanvas(width: number, height: number): Canvas {
  return createCanvas(width, height);
}

/**
 * Render a single RenderFrame to a canvas.
 * Returns the raw RGBA pixel buffer.
 *
 * For v1: renders colored rectangles per layer (no actual video decode).
 * Each layer is drawn as a colored rect with the clip ID as label.
 */
export function renderFrameToBuffer(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  renderFrame: RenderFrame,
): Buffer {
  renderFrameToCanvas(canvas, ctx, renderFrame);

  // Extract raw RGBA buffer — exactly width*height*4 bytes
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return Buffer.from(imageData.data.buffer);
}

/**
 * Render a single frame to any compatible 2D canvas.
 */
export function renderFrameToCanvas(
  canvas: RenderCanvasLike,
  ctx: RenderContext2DLike,
  renderFrame: RenderFrame,
): void {
  const { backgroundColor, layers } = renderFrame;

  // Use the canvas's actual pixel dimensions for all rendering.
  // renderFrame.width/height reflect the project's logical resolution
  // which may differ from the export resolution; the canvas is always
  // created at the export settings resolution.
  const width = canvas.width;
  const height = canvas.height;

  // Clear with background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Render each layer (z-ordered: index 0 = bottom)
  for (const layer of layers) {
    renderLayer(
      ctx,
      layer,
      width,
      height,
      renderFrame.screenCrop,
      renderFrame.cameraCrop,
      renderFrame,
    );
  }
}

export interface VideoFrameLookupContext {
  assetId: string;
  sourceFrame: number;
  timestampSeconds: number;
}

export type ResolveLayerVideoFrame = (
  layer: RenderLayer,
  context: VideoFrameLookupContext,
) => Promise<CanvasImageSource | null>;

export async function renderFrameToCanvasAccurate(
  canvas: RenderCanvasLike,
  ctx: RenderContext2DLike,
  renderFrame: RenderFrame,
  frameRate: number,
  resolveLayerVideoFrame: ResolveLayerVideoFrame,
): Promise<void> {
  const { backgroundColor, layers } = renderFrame;
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  for (const layer of layers) {
    const videoFrame = await resolveLayerVideoFrame(layer, {
      assetId: layer.assetId,
      sourceFrame: layer.sourceFrame,
      timestampSeconds: layer.sourceFrame / frameRate,
    });

    renderLayer(
      ctx,
      layer,
      width,
      height,
      renderFrame.screenCrop,
      renderFrame.cameraCrop,
      renderFrame,
      videoFrame,
    );
    if (videoFrame instanceof VideoFrame) {
      videoFrame.close();
    }
  }
}

function insetRect(rect: { x: number; y: number; width: number; height: number }, inset: number) {
  const clampedInset = Math.max(0, inset);
  return {
    x: rect.x + clampedInset,
    y: rect.y + clampedInset,
    width: Math.max(1, rect.width - clampedInset * 2),
    height: Math.max(1, rect.height - clampedInset * 2),
  };
}

/**
 * Render a single layer as a colored rectangle with a debug label.
 * Applies transform (translate, scale, rotate, opacity) and basic effects.
 */
function renderLayer(
  ctx: RenderContext2DLike,
  layer: RenderLayer,
  canvasWidth: number,
  canvasHeight: number,
  _screenCrop?: RegionCrop,
  _cameraCrop?: RegionCrop,
  renderFrame?: RenderFrame,
  videoFrame?: CanvasImageSource | null,
): void {
  if (layer.isCamera && renderFrame?.cameraPresentation?.visible === false) {
    return;
  }

  const { transform, effects, clipId, trackIndex } = layer;

  ctx.save();

  // Apply opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity));

  // Translate to position
  ctx.translate(transform.x, transform.y);

  // Apply rotation around the anchor point
  const anchorPx = transform.anchorX * canvasWidth;
  const anchorPy = transform.anchorY * canvasHeight;
  ctx.translate(anchorPx, anchorPy);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.translate(-anchorPx, -anchorPy);

  // Base rect dimensions (scaled from canvas size)
  let rectX = canvasWidth * 0.1;
  let rectY = canvasHeight * 0.1;
  let rectW = canvasWidth * 0.8;
  let rectH = canvasHeight * 0.8;
  let outerScreenRect: { x: number; y: number; width: number; height: number } | null = null;

  if (layer.isCamera && renderFrame?.cameraFrame) {
    const cameraRect = {
      x: renderFrame.cameraFrame.x * canvasWidth,
      y: renderFrame.cameraFrame.y * canvasHeight,
      width: renderFrame.cameraFrame.w * canvasWidth,
      height: renderFrame.cameraFrame.h * canvasHeight,
    };
    rectX = cameraRect.x;
    rectY = cameraRect.y;
    rectW = cameraRect.width;
    rectH = cameraRect.height;
  } else if (layer.isCamera && renderFrame?.cameraPresentation) {
    const cameraRect = getCameraLayoutRect(
      renderFrame.cameraPresentation,
      canvasWidth,
      canvasHeight,
    );
    rectX = cameraRect.x;
    rectY = cameraRect.y;
    rectW = cameraRect.width;
    rectH = cameraRect.height;
  } else if (!layer.isCamera && renderFrame?.screenFrame) {
    outerScreenRect = {
      x: renderFrame.screenFrame.x * canvasWidth,
      y: renderFrame.screenFrame.y * canvasHeight,
      width: renderFrame.screenFrame.w * canvasWidth,
      height: renderFrame.screenFrame.h * canvasHeight,
    };
    const screenRect = insetRect(outerScreenRect, renderFrame.background?.bgPadding ?? 0);
    rectX = screenRect.x;
    rectY = screenRect.y;
    rectW = screenRect.width;
    rectH = screenRect.height;
  }

  // Apply scale
  const scaledW = rectW * transform.scaleX;
  const scaledH = rectH * transform.scaleY;
  // Keep rect centred when scaling
  rectX += (rectW - scaledW) / 2;
  rectY += (rectH - scaledH) / 2;
  rectW = scaledW;
  rectH = scaledH;

  // Process effects
  const activeEffects = effects.filter((e) => e.enabled);

  // zoom-pan effect: scale the drawn region
  const zoomPan = activeEffects.find((e) => e.effectType === 'zoom-pan');
  if (zoomPan !== undefined) {
    applyZoomPan(zoomPan, canvasWidth, canvasHeight, (x, y, w, h) => {
      rectX = x;
      rectY = y;
      rectW = w;
      rectH = h;
    });
  }

  // round-corners effect
  const roundCorners = activeEffects.find((e) => e.effectType === 'round-corners');
  const cornerRadius =
    layer.isCamera && renderFrame?.cameraPresentation
      ? getCameraBorderRadius(renderFrame.cameraPresentation, rectW, rectH)
      : !layer.isCamera && renderFrame?.background
        ? renderFrame.background.bgCornerRadius
      : roundCorners !== undefined
        ? ((roundCorners.params['radius'] as number | undefined) ?? 12)
        : 0;

  // gaussian-blur: not supported in 2D canvas — noted, skip
  const hasBlur = activeEffects.some((e) => e.effectType === 'gaussian-blur');
  if (hasBlur) {
    // Would require OffscreenCanvas or custom blur kernel — skipped for v1
  }

  if (videoFrame && typeof ctx.drawImage === 'function') {
    if (!layer.isCamera && renderFrame) {
      const centerX = rectX + rectW / 2;
      const centerY = rectY + rectH / 2;
      ctx.translate(centerX + renderFrame.cameraTransform.offsetX, centerY + renderFrame.cameraTransform.offsetY);
      ctx.scale(renderFrame.cameraTransform.scale, renderFrame.cameraTransform.scale);
      ctx.translate(-centerX, -centerY);
    }

    if (cornerRadius > 0 && typeof ctx.roundRect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.clip();
    }

    ctx.drawImage(videoFrame, rectX, rectY, rectW, rectH);

    if (!layer.isCamera && outerScreenRect && (renderFrame?.background?.bgInset ?? 0) > 0) {
      const inset = renderFrame?.background?.bgInset ?? 0;
      ctx.lineWidth = inset * 2;
      ctx.strokeStyle = renderFrame?.background?.bgInsetColor ?? '#ffffff';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(
          outerScreenRect.x,
          outerScreenRect.y,
          outerScreenRect.width,
          outerScreenRect.height,
          cornerRadius || 0,
        );
        ctx.stroke();
      } else {
        ctx.strokeRect(
          outerScreenRect.x,
          outerScreenRect.y,
          outerScreenRect.width,
          outerScreenRect.height,
        );
      }
    }
  } else {
    // Draw the layer rect
    const color = getLayerColor(trackIndex);
    ctx.fillStyle = color;

    if (cornerRadius > 0 && typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.fill();
    } else {
      ctx.fillRect(rectX, rectY, rectW, rectH);
    }

    // Overlay semi-transparent border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    if (cornerRadius > 0 && typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(rectX, rectY, rectW, rectH);
    }

    // Debug label: clip ID (last 8 chars for readability) + frame info
    const shortId = clipId.slice(-8);
    const labelText = `clip:${shortId}`;
    const fontSize = Math.max(10, Math.min(20, rectH * 0.12));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const cx = rectX + rectW / 2;
    const cy = rectY + rectH / 2;
    ctx.fillText(labelText, cx + 1, cy + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, cx, cy);
  }

  ctx.restore();
}

function applyZoomPan(
  effect: ResolvedEffect,
  canvasWidth: number,
  canvasHeight: number,
  setRect: (x: number, y: number, w: number, h: number) => void,
): void {
  const scale = (effect.params['scale'] as number | undefined) ?? 1;
  const centerX = (effect.params['centerX'] as number | undefined) ?? 0.5;
  const centerY = (effect.params['centerY'] as number | undefined) ?? 0.5;

  const scaledW = canvasWidth * scale;
  const scaledH = canvasHeight * scale;
  // The zoom anchor is at (centerX, centerY) of the canvas
  const anchorX = canvasWidth * centerX;
  const anchorY = canvasHeight * centerY;
  const x = anchorX - anchorX * scale;
  const y = anchorY - anchorY * scale;

  setRect(x, y, scaledW, scaledH);
}
