import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import type { RenderFrame, RenderLayer, ResolvedEffect } from '@rough-cut/frame-resolver';

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
    renderLayer(ctx, layer, width, height);
  }

  // Extract raw RGBA buffer — exactly width*height*4 bytes
  const imageData = ctx.getImageData(0, 0, width, height);
  return Buffer.from(imageData.data.buffer);
}

/**
 * Render a single layer as a colored rectangle with a debug label.
 * Applies transform (translate, scale, rotate, opacity) and basic effects.
 */
function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: RenderLayer,
  canvasWidth: number,
  canvasHeight: number,
): void {
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
    roundCorners !== undefined
      ? (roundCorners.params['radius'] as number | undefined) ?? 12
      : 0;

  // gaussian-blur: not supported in 2D canvas — noted, skip
  const hasBlur = activeEffects.some((e) => e.effectType === 'gaussian-blur');
  if (hasBlur) {
    // Would require OffscreenCanvas or custom blur kernel — skipped for v1
  }

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
