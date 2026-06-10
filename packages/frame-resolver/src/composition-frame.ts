import type {
  Asset,
  AssetId,
  CameraPresentation,
  CursorStyle,
  ClickEffect,
  NormalizedRect,
  ProjectDocument,
  RecordingBackgroundStyle,
  RegionCrop,
} from '@rough-cut/project-model';
import { resolveFrame, resolveTimelinePreviewFrame } from './resolve-frame.js';
import type { ResolveFrameOptions } from './resolve-frame.js';
import type {
  CameraTransform,
  RenderFrame,
  RenderLayer,
} from './types.js';

export type CompositionFrameMode = 'recording' | 'timeline';

export interface ResolveCompositionFrameOptions extends ResolveFrameOptions {
  readonly mode?: CompositionFrameMode;
  readonly includeEditorOverlays?: boolean;
  readonly reducedMotion?: boolean;
}

export interface CompositionOutputSize {
  readonly width: number;
  readonly height: number;
}

export interface CompositionSourceSize {
  readonly width: number;
  readonly height: number;
}

export interface CompositionBackgroundLayer {
  readonly kind: 'background';
  readonly color: string;
  readonly style?: RecordingBackgroundStyle;
}

export interface CompositionScreenLayer {
  readonly kind: 'screen';
  readonly assetId: AssetId;
  readonly sourceFrame: number;
  readonly sourceSize: CompositionSourceSize;
  readonly sourceViewport: RegionCrop | null;
  readonly frame: NormalizedRect | undefined;
  readonly crop: RegionCrop | undefined;
  readonly zoomTransform: CameraTransform;
  readonly reducedMotion: boolean;
}

export interface CompositionCameraLayer {
  readonly kind: 'camera';
  readonly assetId: AssetId;
  readonly sourceFrame: number;
  readonly sourceSize: CompositionSourceSize;
  readonly sourceViewport: RegionCrop | null;
  readonly frame: NormalizedRect | undefined;
  readonly crop: RegionCrop | undefined;
  readonly presentation: CameraPresentation | undefined;
  readonly visible: boolean;
}

export interface CompositionCursorLayer {
  readonly kind: 'cursor';
  readonly sourceFrame: number | null;
  readonly sourcePosition: { readonly x: number; readonly y: number } | null;
  readonly visible: boolean;
  readonly style: CursorStyle;
  readonly sizePercent: number;
  readonly offscreen: boolean | null;
}

export interface CompositionClickLayer {
  readonly kind: 'click';
  readonly sourceFrame: number | null;
  readonly sourcePosition: { readonly x: number; readonly y: number } | null;
  readonly visible: boolean;
  readonly effect: ClickEffect;
  readonly soundEnabled: boolean;
}

export interface CompositionEditorOverlays {
  readonly enabled: boolean;
  readonly screenFrameControls: boolean;
  readonly cameraFrameControls: boolean;
  readonly alignmentGrid: boolean;
  readonly focalTarget: boolean;
}

export interface CompositionMotionMetadata {
  readonly previous: CameraTransform;
  readonly current: CameraTransform;
  readonly next: CameraTransform;
  readonly zoomVelocity: {
    readonly scalePerFrame: number;
    readonly offsetXPerFrame: number;
    readonly offsetYPerFrame: number;
  };
}

export interface ResolvedCompositionFrame {
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly fps: number;
  readonly mode: CompositionFrameMode;
  readonly output: CompositionOutputSize;
  readonly timelineGap: boolean;
  readonly sourceFrame: number | null;
  readonly backgroundLayer: CompositionBackgroundLayer;
  readonly screenLayer: CompositionScreenLayer | null;
  readonly cameraLayer: CompositionCameraLayer | null;
  readonly cursorLayer: CompositionCursorLayer;
  readonly clickLayer: CompositionClickLayer;
  readonly editorOverlays: CompositionEditorOverlays;
  readonly motion: CompositionMotionMetadata;
  readonly renderFrame: RenderFrame;
}

export function resolveCompositionFrame(
  project: ProjectDocument,
  frameIndex: number,
  options: ResolveCompositionFrameOptions = {},
): ResolvedCompositionFrame {
  const mode = options.mode ?? 'recording';
  const frame = resolveBaseFrame(project, frameIndex, mode, options);
  const previousFrame = resolveBaseFrame(project, Math.max(0, frameIndex - 1), mode, options);
  const nextFrame = resolveBaseFrame(project, frameIndex + 1, mode, options);
  const fps = Number.isFinite(project.settings.frameRate) && project.settings.frameRate > 0
    ? project.settings.frameRate
    : 30;
  const assetMap = new Map(project.assets.map((asset) => [asset.id, asset]));
  const screenRenderLayer = findScreenLayer(frame.layers, assetMap);
  const cameraRenderLayer = findCameraLayer(frame.layers);
  const screenSourceFrame = screenRenderLayer?.sourceFrame ?? null;
  const cursorPosition = screenRenderLayer && options.getCursorPosition
    ? options.getCursorPosition(screenRenderLayer.assetId, screenRenderLayer.sourceFrame)
    : null;
  const timelineGap = mode === 'timeline' && frame.layers.length === 0;

  return {
    frameIndex: frame.frame,
    timeSec: frame.frame / fps,
    fps,
    mode,
    output: {
      width: frame.width,
      height: frame.height,
    },
    timelineGap,
    sourceFrame: screenSourceFrame,
    backgroundLayer: {
      kind: 'background',
      color: frame.backgroundColor,
      style: frame.background,
    },
    screenLayer: screenRenderLayer
      ? {
          kind: 'screen',
          assetId: screenRenderLayer.assetId,
          sourceFrame: screenRenderLayer.sourceFrame,
          sourceSize: getAssetSourceSize(assetMap.get(screenRenderLayer.assetId)),
          sourceViewport: frame.screenCrop ?? null,
          frame: frame.screenFrame,
          crop: frame.screenCrop,
          zoomTransform: frame.cameraTransform,
          reducedMotion: options.reducedMotion === true,
        }
      : null,
    cameraLayer: cameraRenderLayer
      ? {
          kind: 'camera',
          assetId: cameraRenderLayer.assetId,
          sourceFrame: cameraRenderLayer.sourceFrame,
          sourceSize: getAssetSourceSize(assetMap.get(cameraRenderLayer.assetId)),
          sourceViewport: frame.cameraCrop ?? null,
          frame: frame.cameraFrame,
          crop: frame.cameraCrop,
          presentation: frame.cameraPresentation,
          visible: frame.cameraPresentation?.visible !== false,
        }
      : null,
    cursorLayer: {
      kind: 'cursor',
      sourceFrame: screenSourceFrame,
      sourcePosition: cursorPosition,
      visible: frame.cursor.visible,
      style: frame.cursor.style,
      sizePercent: frame.cursor.sizePercent,
      offscreen: cursorPosition ? isOffscreen(cursorPosition) : null,
    },
    clickLayer: {
      kind: 'click',
      sourceFrame: screenSourceFrame,
      sourcePosition: cursorPosition,
      visible: frame.cursor.clicksVisible && frame.cursor.clickEffect !== 'none',
      effect: frame.cursor.clickEffect,
      soundEnabled: frame.cursor.clickSoundEnabled,
    },
    editorOverlays: {
      enabled: options.includeEditorOverlays === true,
      screenFrameControls: options.includeEditorOverlays === true && Boolean(frame.screenFrame),
      cameraFrameControls: options.includeEditorOverlays === true && Boolean(frame.cameraFrame),
      alignmentGrid: options.includeEditorOverlays === true,
      focalTarget: options.includeEditorOverlays === true && Boolean(screenRenderLayer),
    },
    motion: {
      previous: previousFrame.cameraTransform,
      current: frame.cameraTransform,
      next: nextFrame.cameraTransform,
      zoomVelocity: {
        scalePerFrame: (nextFrame.cameraTransform.scale - previousFrame.cameraTransform.scale) / 2,
        offsetXPerFrame: (nextFrame.cameraTransform.offsetX - previousFrame.cameraTransform.offsetX) / 2,
        offsetYPerFrame: (nextFrame.cameraTransform.offsetY - previousFrame.cameraTransform.offsetY) / 2,
      },
    },
    renderFrame: frame,
  };
}

function resolveBaseFrame(
  project: ProjectDocument,
  frameIndex: number,
  mode: CompositionFrameMode,
  options: ResolveFrameOptions,
): RenderFrame {
  const safeFrame = Math.max(0, Math.round(Number.isFinite(frameIndex) ? frameIndex : 0));
  return mode === 'timeline'
    ? resolveTimelinePreviewFrame(project, safeFrame, options)
    : resolveFrame(project, safeFrame, options);
}

function findScreenLayer(
  layers: readonly RenderLayer[],
  assetMap: ReadonlyMap<string, Asset>,
): RenderLayer | null {
  return layers.find((layer) => {
    const asset = assetMap.get(layer.assetId);
    return !layer.isCamera && (asset?.type === 'recording' || asset?.type === 'video');
  }) ?? layers.find((layer) => !layer.isCamera) ?? null;
}

function findCameraLayer(layers: readonly RenderLayer[]): RenderLayer | null {
  return layers.find((layer) => layer.isCamera) ?? null;
}

function getAssetSourceSize(asset: Asset | undefined): CompositionSourceSize {
  const width = Number(asset?.metadata?.width);
  const height = Number(asset?.metadata?.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1920,
    height: Number.isFinite(height) && height > 0 ? height : 1080,
  };
}

function isOffscreen(position: { readonly x: number; readonly y: number }): boolean {
  return position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1;
}
