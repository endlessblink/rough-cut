import {
  createDefaultCameraPresentation,
  type CameraPresentation,
  type NormalizedRect,
  type RecordingBackgroundStyle,
  type RegionCrop,
} from '@rough-cut/project-model';
import { getCameraLayoutRect } from './camera-layout.js';

export interface CompositionPresentationStyle {
  readonly screenPadding: number;
  readonly screenCornerRadius: number;
  readonly screenShadowEnabled: boolean;
  readonly screenShadowBlur: number;
  readonly screenShadowOpacity: number;
  readonly screenShadowOffsetY: number;
  readonly screenShadowOffsetX: number;
}

export interface CompositionLayoutOutput {
  readonly width: number;
  readonly height: number;
}

export interface CompositionLayoutScreenLayer {
  readonly frame?: NormalizedRect;
  readonly sourceViewport?: RegionCrop | null;
  readonly sourceSize?: { readonly width?: number; readonly height?: number };
}

export interface CompositionLayoutCameraLayer {
  readonly frame?: NormalizedRect;
  readonly presentation?: CameraPresentation;
}

export interface CompositionLayoutFrame {
  readonly output?: CompositionLayoutOutput;
  readonly backgroundLayer?: { readonly style?: RecordingBackgroundStyle };
  readonly screenLayer?: CompositionLayoutScreenLayer | null;
  readonly cameraLayer?: CompositionLayoutCameraLayer | null;
}

export interface ResolvedHeadlessScreenLayout {
  readonly source: 'manual' | 'background-padding';
  readonly frame: NormalizedRect;
}

export interface ResolvedHeadlessCameraLayout {
  readonly source: 'manual' | 'presentation';
  readonly frame: NormalizedRect;
  readonly radius: number;
  readonly presentation: CameraPresentation;
  readonly style: {
    readonly shape: CameraPresentation['shape'];
    readonly roundness: number;
    readonly shadowEnabled: boolean;
    readonly shadowBlur: number;
    readonly shadowOpacity: number;
  };
}

export function normalizeCompositionPresentationStyle(
  background: Partial<RecordingBackgroundStyle> | null | undefined = null,
): CompositionPresentationStyle {
  const bg = background ?? {};
  return {
    screenPadding: Number.isFinite(bg.bgPadding) ? bg.bgPadding! : 96,
    screenCornerRadius: Number.isFinite(bg.bgCornerRadius) ? bg.bgCornerRadius! : 32,
    screenShadowEnabled: typeof bg.bgShadowEnabled === 'boolean' ? bg.bgShadowEnabled : true,
    screenShadowBlur: Number.isFinite(bg.bgShadowBlur) ? bg.bgShadowBlur! : 58,
    screenShadowOpacity: Number.isFinite(bg.bgShadowOpacity) ? bg.bgShadowOpacity! : 0.2,
    screenShadowOffsetY: Number.isFinite(bg.bgShadowOffsetY) ? bg.bgShadowOffsetY! : 34,
    screenShadowOffsetX: Number.isFinite(bg.bgShadowOffsetX) ? bg.bgShadowOffsetX! : 0,
  };
}

export function resolveHeadlessScreenLayout(frame: CompositionLayoutFrame): ResolvedHeadlessScreenLayout | null {
  if (!frame.screenLayer) return null;
  const { outputWidth, outputHeight } = resolveOutputSize(frame.output);
  const style = normalizeCompositionPresentationStyle(frame.backgroundLayer?.style);
  const safePadding = clampNumber(style.screenPadding, 0, Math.min(outputWidth, outputHeight) / 2 - 2);
  const maxFrame = resolveHeadlessScreenMaxFrame({
    outputWidth,
    outputHeight,
    maxWidth: outputWidth - safePadding * 2,
    maxHeight: outputHeight - safePadding * 2,
    normalizedFrame: frame.screenLayer.frame ?? null,
  });
  const viewport = frame.screenLayer.sourceViewport?.enabled === true ? frame.screenLayer.sourceViewport : null;
  const sourceWidth = viewport?.width ?? frame.screenLayer.sourceSize?.width ?? maxFrame.w;
  const sourceHeight = viewport?.height ?? frame.screenLayer.sourceSize?.height ?? maxFrame.h;
  const contained = resolveContainedSize(sourceWidth, sourceHeight, maxFrame.w, maxFrame.h);
  const x = maxFrame.x + (maxFrame.w - contained.w) / 2;
  const y = maxFrame.y + (maxFrame.h - contained.h) / 2;

  return {
    source: frame.screenLayer.frame ? 'manual' : 'background-padding',
    frame: {
      x: roundUnit(x / outputWidth),
      y: roundUnit(y / outputHeight),
      w: roundUnit(contained.w / outputWidth),
      h: roundUnit(contained.h / outputHeight),
    },
  };
}

export function resolveHeadlessCameraLayout(frame: CompositionLayoutFrame): ResolvedHeadlessCameraLayout | null {
  if (!frame.cameraLayer) return null;
  const { outputWidth, outputHeight } = resolveOutputSize(frame.output);
  const presentation = {
    ...createDefaultCameraPresentation(),
    ...(frame.cameraLayer.presentation ?? {}),
  };
  const pixelFrame = resolveCameraOverlayFrame(presentation, outputWidth, outputHeight, frame.cameraLayer.frame ?? null);
  const radius = resolveCameraOverlayRadius(presentation, pixelFrame);

  return {
    source: frame.cameraLayer.frame ? 'manual' : 'presentation',
    frame: {
      x: roundUnit(pixelFrame.x / outputWidth),
      y: roundUnit(pixelFrame.y / outputHeight),
      w: roundUnit(pixelFrame.w / outputWidth),
      h: roundUnit(pixelFrame.h / outputHeight),
    },
    radius: Math.round(radius * 100) / 100,
    presentation,
    style: {
      shape: presentation.shape,
      roundness: presentation.roundness,
      shadowEnabled: presentation.shadowEnabled !== false,
      shadowBlur: Number.isFinite(presentation.shadowBlur) ? presentation.shadowBlur : 24,
      shadowOpacity: Number.isFinite(presentation.shadowOpacity) ? presentation.shadowOpacity : 0.45,
    },
  };
}

function resolveOutputSize(output: CompositionLayoutOutput | undefined): { outputWidth: number; outputHeight: number } {
  return {
    outputWidth: Number.isFinite(output?.width) && output!.width > 0 ? output!.width : 1920,
    outputHeight: Number.isFinite(output?.height) && output!.height > 0 ? output!.height : 1080,
  };
}

function resolveHeadlessScreenMaxFrame({
  outputWidth,
  outputHeight,
  maxWidth,
  maxHeight,
  normalizedFrame = null,
}: {
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly normalizedFrame?: NormalizedRect | null;
}): { x: number; y: number; w: number; h: number } {
  if (isNormalizedFrame(normalizedFrame)) {
    const w = Math.max(2, Math.min(outputWidth, normalizedFrame.w * outputWidth));
    const h = Math.max(2, Math.min(outputHeight, normalizedFrame.h * outputHeight));
    return {
      x: Math.max(0, Math.min(outputWidth - w, normalizedFrame.x * outputWidth)),
      y: Math.max(0, Math.min(outputHeight - h, normalizedFrame.y * outputHeight)),
      w,
      h,
    };
  }
  return {
    x: safeCenter(outputWidth, maxWidth),
    y: safeCenter(outputHeight, maxHeight),
    w: maxWidth,
    h: maxHeight,
  };
}

function resolveCameraOverlayFrame(
  camera: CameraPresentation,
  canvasWidth: number,
  canvasHeight: number,
  normalizedFrame: NormalizedRect | null,
): { x: number; y: number; w: number; h: number } {
  if (isNormalizedFrame(normalizedFrame)) {
    const w = Math.max(2, Math.round(normalizedFrame.w * canvasWidth));
    const h = Math.max(2, Math.round(normalizedFrame.h * canvasHeight));
    return constrainCameraShapeFrame({
      x: Math.max(0, Math.round(normalizedFrame.x * canvasWidth)),
      y: Math.max(0, Math.round(normalizedFrame.y * canvasHeight)),
      w,
      h,
    }, camera, canvasWidth, canvasHeight);
  }
  const rect = getCameraLayoutRect(camera, canvasWidth, canvasHeight);
  return constrainCameraShapeFrame({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
  }, camera, canvasWidth, canvasHeight);
}

function constrainCameraShapeFrame(
  frame: { x: number; y: number; w: number; h: number },
  camera: CameraPresentation,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; w: number; h: number } {
  if (camera.shape !== 'circle') return frame;
  const size = Math.max(2, Math.min(frame.w, frame.h, canvasWidth, canvasHeight));
  return {
    x: Math.max(0, Math.min(canvasWidth - size, Math.round(frame.x + (frame.w - size) / 2))),
    y: Math.max(0, Math.min(canvasHeight - size, Math.round(frame.y + (frame.h - size) / 2))),
    w: size,
    h: size,
  };
}

function resolveCameraOverlayRadius(camera: CameraPresentation, frame: { w: number; h: number }): number {
  if (camera.shape === 'square') return 0;
  if (camera.shape === 'circle') return Math.min(frame.w, frame.h) / 2;
  return Math.round((Math.min(frame.w, frame.h) / 2) * clampNumber((camera.roundness ?? 50) / 100, 0, 1));
}

function resolveContainedSize(sourceWidth: number | undefined, sourceHeight: number | undefined, maxWidth: number, maxHeight: number): { w: number; h: number } {
  const safeSourceWidth = Number.isFinite(sourceWidth) && sourceWidth! > 0 ? sourceWidth! : maxWidth;
  const safeSourceHeight = Number.isFinite(sourceHeight) && sourceHeight! > 0 ? sourceHeight! : maxHeight;
  const sourceAspect = safeSourceWidth / safeSourceHeight;
  const frameAspect = maxWidth / maxHeight;
  if (sourceAspect >= frameAspect) {
    return {
      w: maxWidth,
      h: Math.max(2, Math.round(maxWidth / sourceAspect)),
    };
  }
  return {
    w: Math.max(2, Math.round(maxHeight * sourceAspect)),
    h: maxHeight,
  };
}

function isNormalizedFrame(frame: NormalizedRect | null | undefined): frame is NormalizedRect {
  return Boolean(
    frame &&
    Number.isFinite(frame.x) &&
    Number.isFinite(frame.y) &&
    Number.isFinite(frame.w) &&
    Number.isFinite(frame.h),
  );
}

function safeCenter(total: number, size: number): number {
  return Math.max(0, (total - size) / 2);
}

function roundUnit(value: number): number {
  return Math.round(clampNumber(value, 0, 1) * 1_000_000) / 1_000_000;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
