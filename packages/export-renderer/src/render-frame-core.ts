import type { RegionCrop } from '@rough-cut/project-model';
import type { RenderFrame, RenderLayer, ResolvedEffect } from '@rough-cut/frame-resolver';

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
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  drawImage?(image: unknown, dx: number, dy: number, dWidth: number, dHeight: number): void;
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
    renderLayer(ctx, layer, width, height, renderFrame.screenCrop, renderFrame.cameraCrop);
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
      videoFrame,
    );
    if (videoFrame instanceof VideoFrame) {
      videoFrame.close();
    }
  }
}

function renderLayer(
  ctx: RenderContext2DLike,
  layer: RenderLayer,
  canvasWidth: number,
  canvasHeight: number,
  _screenCrop?: RegionCrop,
  _cameraCrop?: RegionCrop,
  videoFrame?: CanvasImageSource | null,
): void {
  const { transform, effects, clipId, trackIndex } = layer;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity));
  ctx.translate(transform.x, transform.y);

  const anchorPx = transform.anchorX * canvasWidth;
  const anchorPy = transform.anchorY * canvasHeight;
  ctx.translate(anchorPx, anchorPy);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.translate(-anchorPx, -anchorPy);

  let rectX = canvasWidth * 0.1;
  let rectY = canvasHeight * 0.1;
  let rectW = canvasWidth * 0.8;
  let rectH = canvasHeight * 0.8;

  const scaledW = rectW * transform.scaleX;
  const scaledH = rectH * transform.scaleY;
  rectX += (rectW - scaledW) / 2;
  rectY += (rectH - scaledH) / 2;
  rectW = scaledW;
  rectH = scaledH;

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
    roundCorners !== undefined ? ((roundCorners.params['radius'] as number | undefined) ?? 12) : 0;

  if (videoFrame && typeof ctx.drawImage === 'function') {
    if (cornerRadius > 0 && typeof ctx.roundRect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);
      ctx.clip();
    }

    ctx.drawImage(videoFrame, rectX, rectY, rectW, rectH);
  } else {
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
