import type { RegionCrop } from '@rough-cut/project-model';
import type { RenderFrame, RenderLayer, ResolvedEffect } from '@rough-cut/frame-resolver';
import { getCameraBorderRadius, getCameraLayoutRect } from '@rough-cut/frame-resolver';
import type { CursorFrameData } from './cursor-render.js';
import { renderCursorOverlay } from './cursor-render.js';

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
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  drawImage?(image: unknown, ...args: number[]): void;
  clip?(): void;
  roundRect?(x: number, y: number, width: number, height: number, radii?: number | number[]): void;
}

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

export function renderFrameToCanvas(
  canvas: RenderCanvasLike,
  ctx: RenderContext2DLike,
  renderFrame: RenderFrame,
): void {
  const { backgroundColor, layers } = renderFrame;
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

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
  cursorDataByAssetId?: ReadonlyMap<string, CursorFrameData>,
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
    if (videoFrame && typeof videoFrame === 'object' && 'close' in videoFrame) {
      const closable = videoFrame as { close?: () => void };
      closable.close?.();
    }
  }

  const cursorLayer = layers.find(
    (layer) => !layer.isCamera && cursorDataByAssetId?.has(layer.assetId),
  );
  if (cursorLayer && cursorDataByAssetId) {
    const cursorData = cursorDataByAssetId.get(cursorLayer.assetId);
    if (cursorData) {
      renderCursorOverlay(
        ctx,
        cursorData,
        cursorLayer.sourceFrame,
        width,
        height,
        renderFrame.cursor,
        renderFrame.cameraTransform.scale,
        renderFrame.cameraTransform.offsetX,
        renderFrame.cameraTransform.offsetY,
        frameRate,
        renderFrame.screenCrop,
      );
    }
  }
}

function drawFrameImage(
  ctx: RenderContext2DLike,
  videoFrame: CanvasImageSource,
  crop: RegionCrop | undefined,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number,
): void {
  if (!ctx.drawImage) return;

  if (crop?.enabled) {
    ctx.drawImage(videoFrame, crop.x, crop.y, crop.width, crop.height, dx, dy, dWidth, dHeight);
    return;
  }

  ctx.drawImage(videoFrame, dx, dy, dWidth, dHeight);
}

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
  const { transform, effects, clipId, trackIndex } = layer;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity));
  let rectX = 0;
  let rectY = 0;
  let rectW = canvasWidth;
  let rectH = canvasHeight;
  let crop: RegionCrop | undefined = _screenCrop;

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
    crop = _cameraCrop;
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
    crop = _cameraCrop;
  }

  const activeEffects = effects.filter((e) => e.enabled);
  const zoomPan = activeEffects.find((e) => e.effectType === 'zoom-pan');
  if (zoomPan !== undefined) {
    applyZoomPan(zoomPan, canvasWidth, canvasHeight, (x, y, w, h) => {
      rectX = x;
      rectY = y;
      rectW = w;
      rectH = h;
    });
  }

  const roundCorners = activeEffects.find((e) => e.effectType === 'round-corners');
  const cornerRadius =
    layer.isCamera && renderFrame?.cameraPresentation
      ? getCameraBorderRadius(renderFrame.cameraPresentation, rectW, rectH)
      : roundCorners !== undefined
        ? ((roundCorners.params['radius'] as number | undefined) ?? 12)
        : 0;

  if (videoFrame && typeof ctx.drawImage === 'function') {
    if (!layer.isCamera && renderFrame) {
      ctx.translate(
        canvasWidth / 2 + renderFrame.cameraTransform.offsetX,
        canvasHeight / 2 + renderFrame.cameraTransform.offsetY,
      );
      ctx.scale(renderFrame.cameraTransform.scale, renderFrame.cameraTransform.scale);
      ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
    } else {
      ctx.translate(transform.x, transform.y);
      const anchorPx = transform.anchorX * canvasWidth;
      const anchorPy = transform.anchorY * canvasHeight;
      ctx.translate(anchorPx, anchorPy);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.translate(-anchorPx, -anchorPy);
    }

    if (cornerRadius > 0 && typeof ctx.roundRect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.clip();
    }

    drawFrameImage(ctx, videoFrame, crop, rectX, rectY, rectW, rectH);
  } else {
    ctx.translate(transform.x, transform.y);
    const anchorPx = transform.anchorX * canvasWidth;
    const anchorPy = transform.anchorY * canvasHeight;
    ctx.translate(anchorPx, anchorPy);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.translate(-anchorPx, -anchorPy);

    if (!layer.isCamera) {
      rectX = canvasWidth * 0.1;
      rectY = canvasHeight * 0.1;
      rectW = canvasWidth * 0.8;
      rectH = canvasHeight * 0.8;
      const scaledW = rectW * transform.scaleX;
      const scaledH = rectH * transform.scaleY;
      rectX += (rectW - scaledW) / 2;
      rectY += (rectH - scaledH) / 2;
      rectW = scaledW;
      rectH = scaledH;
    }

    const color = getLayerColor(trackIndex);
    ctx.fillStyle = color;

    if (cornerRadius > 0 && typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.fill();
    } else {
      ctx.fillRect(rectX, rectY, rectW, rectH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    if (cornerRadius > 0 && typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(rectX, rectY, rectW, rectH);
    }

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
  const anchorX = canvasWidth * centerX;
  const anchorY = canvasHeight * centerY;
  const x = anchorX - anchorX * scale;
  const y = anchorY - anchorY * scale;

  setRect(x, y, scaledW, scaledH);
}
