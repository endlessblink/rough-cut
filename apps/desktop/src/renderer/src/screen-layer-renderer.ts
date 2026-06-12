import { drawZoomMotionSource, resolveWebGLMotionBlurRenderScale, resolveWebGLMotionBlurSampleCount } from './zoom-motion-renderer';

import { activeClickEmphasisAtFrame, drawClickEmphasis, drawCursorPath } from './styled-preview.mjs';
import type { CursorEvent } from '@rough-cut/project-model';

const CURSOR_POLYGON_POINTS = [
  [0, 0],
  [0, 26],
  [7, 20],
  [12, 33],
  [18, 31],
  [13, 19],
  [24, 19],
] as const;
const CURSOR_POLYGON_TRIANGLES = [
  0, 1, 2,
  0, 2, 6,
  2, 3, 5,
  2, 5, 6,
  3, 4, 5,
] as const;
const CURSOR_OUTLINE_WIDTH = 2.2;
const CURSOR_SPOTLIGHT = [122 / 255, 167 / 255, 255 / 255, 0.22] as const;
const CURSOR_FILL = [1, 1, 1, 1] as const;
const CURSOR_OUTLINE = [51 / 255, 58 / 255, 70 / 255, 1] as const;
const CURSOR_SPOTLIGHT_OUTLINE = [122 / 255, 167 / 255, 255 / 255, 1] as const;
const CLICK_RING = [122 / 255, 167 / 255, 255 / 255, 1] as const;
const CLICK_RIPPLE = [122 / 255, 167 / 255, 255 / 255, 0.32] as const;
const WEBGL_RENDERER_LOG_PREFIX = '[rough-cut:webgl-renderer]';
const WEBGPU_RENDERER_LOG_PREFIX = '[rough-cut:webgpu-renderer]';
let nextWebGLRendererId = 1;
let nextWebGPURendererId = 1;

type RendererDebugRegistryEntry = {
    id: number;
    createdAtMs: number;
    disposed: boolean;
    contextCreates: number;
    contextResets: number;
    fallbackReason: string | null;
    canvasKind: 'html-canvas' | 'offscreen-canvas' | 'none';
    maxMotionBlurSamples?: number;
    motionBlurFrameCount?: number;
  };

type WebGLRendererDebugWindow = Window & {
  __roughCutWebglRendererInstances?: Record<number, RendererDebugRegistryEntry>;
  __roughCutWebglRendererLog?: Array<{
    atMs: number;
    event: string;
    payload: Record<string, unknown>;
  }>;
};

type WebGPURendererDebugWindow = Window & {
  __roughCutWebgpuRendererInstances?: Record<number, RendererDebugRegistryEntry>;
  __roughCutWebgpuRendererLog?: Array<{
    atMs: number;
    event: string;
    payload: Record<string, unknown>;
  }>;
};

type GPUCanvasContext = any;
type GPUDevice = any;
type GPUSampler = any;
type GPUTextureFormat = string;
type GPURenderPipeline = any;
type GPUTexture = any;
type GPURenderPassEncoder = any;
type GPUVertexBufferLayout = any;
type GPUShaderModule = any;
type GPUBindGroupLayoutEntry = any;
type GPUBindGroup = any;
type GPUBuffer = any;
type GPUFlagsConstant = number;
type WebGPUCapableNavigator = Navigator & {
  gpu?: {
    requestAdapter(input?: Record<string, unknown>): Promise<any>;
    getPreferredCanvasFormat(): GPUTextureFormat;
  };
};

const WEBGPU_BUFFER_USAGE = {
  COPY_DST: 8,
  VERTEX: 32,
  UNIFORM: 64,
} as const;
const WEBGPU_TEXTURE_USAGE = {
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  RENDER_ATTACHMENT: 16,
} as const;
const WEBGPU_SHADER_STAGE = {
  VERTEX: 1,
  FRAGMENT: 2,
} as const;

export type ScreenLayerRendererKind = 'canvas2d' | 'webgl' | 'webgpu';
export type ScreenLayerContextStatus = 'available' | 'missing-context' | 'context-lost' | 'draw-failed' | 'disposed' | 'fallback';

export type ScreenLayerSourceViewport = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ScreenLayerCameraTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type ScreenLayerCameraFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ScreenLayerCameraSource = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export type ScreenLayerCameraPresentation = {
  shape?: string;
  shadowEnabled?: boolean;
  shadowOpacity?: number;
  shadowBlur?: number;
};

export type BackgroundLayerDrawInput = {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  startColor: string;
  endColor: string;
  image?: HTMLImageElement | null;
};

export type ScreenLayerDrawInput = {
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
  canvasWidth: number;
  canvasHeight: number;
  screenX: number;
  screenY: number;
  screenDrawScale: number;
  screenSource: ScreenLayerSourceViewport;
  sourceWidth: number;
  sourceHeight: number;
  transform: ScreenLayerCameraTransform;
  previousTransform?: ScreenLayerCameraTransform | null;
  nextTransform?: ScreenLayerCameraTransform | null;
  blurPx: number;
  sharpZoom: boolean;
};

export type CameraLayerDrawInput = {
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
  canvasWidth: number;
  canvasHeight: number;
  frame: ScreenLayerCameraFrame;
  source: ScreenLayerCameraSource;
  sourceWidth: number;
  sourceHeight: number;
  radius: number;
  presentation?: ScreenLayerCameraPresentation | null;
  shadow: boolean;
};

export type CursorLayerDrawInput = {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  screenX: number;
  screenY: number;
  screenDrawScale: number;
  screenSource: ScreenLayerSourceViewport;
  transform: ScreenLayerCameraTransform;
  cursorEvents: readonly CursorEvent[];
  cursorFrame: number;
  cursorPosition: { x: number; y: number } | null;
  cursorInside: boolean;
  clickEffect?: 'none' | 'ring' | 'ripple' | null;
  visible?: boolean;
  style?: 'default' | 'subtle' | 'spotlight' | null;
  sizePercent?: number | null;
};

export type CompositorFrameDrawInput = {
  background: BackgroundLayerDrawInput;
  screen: ScreenLayerDrawInput;
  cursor: CursorLayerDrawInput;
  camera?: Omit<CameraLayerDrawInput, 'ctx' | 'canvasWidth' | 'canvasHeight'> | null;
  presentationCanvas?: HTMLCanvasElement | null;
};

export type ScreenLayerRendererStats = {
  requestedRendererKind: ScreenLayerRendererKind;
  rendererKind: ScreenLayerRendererKind;
  contextStatus: ScreenLayerContextStatus;
  drawCostMs: number | null;
  drawCount: number;
  fallbackReason: string | null;
};

export interface ScreenLayerRenderer {
  readonly kind: ScreenLayerRendererKind;
  isSupported(): boolean;
  resize(width: number, height: number): void;
  drawBackground(input: BackgroundLayerDrawInput): ScreenLayerRendererStats;
  draw(input: ScreenLayerDrawInput): ScreenLayerRendererStats;
  drawCamera(input: CameraLayerDrawInput): ScreenLayerRendererStats;
  drawCursorOverlay(input: CursorLayerDrawInput): ScreenLayerRendererStats;
  drawFrame(input: CompositorFrameDrawInput): ScreenLayerRendererStats;
  preparePresentationCanvas?(canvas: HTMLCanvasElement, width: number, height: number): ScreenLayerRendererStats;
  prepareBackgroundImage?(image: HTMLImageElement | null): ScreenLayerRendererStats;
  getDebugStats(): ScreenLayerRendererStats;
  dispose(): void;
}

export function createScreenLayerRenderer(kind: ScreenLayerRendererKind = 'canvas2d'): ScreenLayerRenderer {
  if (kind === 'webgpu') return new WebGPUScreenLayerRenderer();
  if (kind === 'webgl') return new WebGLScreenLayerRenderer();
  return new Canvas2DScreenLayerRenderer();
}

export class Canvas2DScreenLayerRenderer implements ScreenLayerRenderer {
  readonly kind = 'canvas2d' as const;
  private disposed = false;
  private stats: ScreenLayerRendererStats = {
    requestedRendererKind: 'canvas2d',
    rendererKind: 'canvas2d',
    contextStatus: 'available',
    drawCostMs: null,
    drawCount: 0,
    fallbackReason: null,
  };

  constructor(fallbackReason: string | null = null, requestedRendererKind: ScreenLayerRendererKind = 'canvas2d') {
    this.stats = { ...this.stats, requestedRendererKind, fallbackReason };
  }

  isSupported(): boolean {
    return true;
  }

  resize(width: number, height: number): void {
    void width;
    void height;
  }

  drawBackground(input: BackgroundLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const gradient = input.ctx.createLinearGradient(0, 0, input.canvasWidth, input.canvasHeight);
      gradient.addColorStop(0, input.startColor);
      gradient.addColorStop(1, input.endColor);
      input.ctx.fillStyle = gradient;
      input.ctx.fillRect(0, 0, input.canvasWidth, input.canvasHeight);
      if (input.image?.complete && input.image.naturalWidth > 0 && input.image.naturalHeight > 0) {
        input.ctx.drawImage(input.image, 0, 0, input.canvasWidth, input.canvasHeight);
      }
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        rendererKind: 'canvas2d',
        requestedRendererKind: this.stats.requestedRendererKind,
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: this.stats.fallbackReason,
      };
    } catch {
      this.stats = { ...this.stats, contextStatus: 'draw-failed', drawCostMs: null };
      throw new Error('Canvas2D background layer draw failed.');
    }
    return this.getDebugStats();
  }

  draw(input: ScreenLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      drawZoomMotionSource(input.ctx, input.video, {
        screenX: input.screenX,
        screenY: input.screenY,
        screenDrawScale: input.screenDrawScale,
        screenSource: input.screenSource,
        sourceWidth: input.sourceWidth,
        sourceHeight: input.sourceHeight,
        transform: input.transform,
        blurPx: input.blurPx,
        sharpZoom: input.sharpZoom,
      });
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        rendererKind: 'canvas2d',
        requestedRendererKind: this.stats.requestedRendererKind,
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: this.stats.fallbackReason,
      };
    } catch {
      this.stats = {
        ...this.stats,
        contextStatus: 'draw-failed',
        drawCostMs: null,
      };
      throw new Error('Canvas2D screen layer draw failed.');
    }
    return this.getDebugStats();
  }

  drawCamera(input: CameraLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { ctx, video, frame, source, presentation, radius } = input;
    try {
      ctx.save();
      if (input.shadow && presentation?.shadowEnabled !== false) {
        ctx.shadowColor = `rgba(0, 0, 0, ${presentation?.shadowOpacity ?? 0.45})`;
        ctx.shadowBlur = presentation?.shadowBlur ?? 24;
        ctx.shadowOffsetY = 8;
      }
      addCameraShapePath(ctx, frame, presentation, radius);
      ctx.clip();
      ctx.drawImage(video, source.sx, source.sy, source.sw, source.sh, frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        rendererKind: 'canvas2d',
        requestedRendererKind: this.stats.requestedRendererKind,
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: this.stats.fallbackReason,
      };
    } catch {
      this.stats = { ...this.stats, contextStatus: 'draw-failed', drawCostMs: null };
      throw new Error('Canvas2D camera layer draw failed.');
    }
    return this.getDebugStats();
  }

  drawCursorOverlay(input: CursorLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      drawClickEmphasis(input.ctx, input.cursorEvents, input.cursorFrame, input.clickEffect ?? 'ring');
      if (input.cursorPosition && input.visible !== false && input.cursorInside) {
        drawCursorPath(input.ctx, input.cursorPosition.x, input.cursorPosition.y, {
          style: input.style ?? 'default',
          sizePercent: input.sizePercent ?? 100,
        });
      }
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        rendererKind: 'canvas2d',
        requestedRendererKind: this.stats.requestedRendererKind,
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: this.stats.fallbackReason,
      };
    } catch {
      this.stats = { ...this.stats, contextStatus: 'draw-failed', drawCostMs: null };
      throw new Error('Canvas2D cursor overlay draw failed.');
    }
    return this.getDebugStats();
  }

  drawFrame(input: CompositorFrameDrawInput): ScreenLayerRendererStats {
    this.drawBackground(input.background);
    this.draw(input.screen);
    this.drawCursorOverlay(input.cursor);
    if (input.camera) {
      this.drawCamera({
        ...input.camera,
        ctx: input.background.ctx,
        canvasWidth: input.background.canvasWidth,
        canvasHeight: input.background.canvasHeight,
      });
    }
    return this.getDebugStats();
  }

  preparePresentationCanvas(): ScreenLayerRendererStats {
    return this.getDebugStats();
  }

  prepareBackgroundImage(): ScreenLayerRendererStats {
    return this.getDebugStats();
  }

  getDebugStats(): ScreenLayerRendererStats {
    return { ...this.stats };
  }

  dispose(): void {
    this.disposed = true;
    this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
  }
}

type WebGLProgramParts = {
  program: WebGLProgram;
  positionAttribute: number;
  texCoordAttribute: number;
  previousTexCoordAttribute: number;
  nextTexCoordAttribute: number;
  canvasPositionAttribute: number;
  resolutionUniform: WebGLUniformLocation | null;
  textureUniform: WebGLUniformLocation | null;
  motionBlurSamplesUniform: WebGLUniformLocation | null;
  maskModeUniform: WebGLUniformLocation | null;
  maskFrameUniform: WebGLUniformLocation | null;
  maskRadiusUniform: WebGLUniformLocation | null;
  renderModeUniform: WebGLUniformLocation | null;
  solidColorUniform: WebGLUniformLocation | null;
  gradientStartUniform: WebGLUniformLocation | null;
  gradientEndUniform: WebGLUniformLocation | null;
  ringWidthUniform: WebGLUniformLocation | null;
};

type WebGLTextureState = {
  texture: WebGLTexture;
  width: number;
  height: number;
  imageSource: HTMLImageElement | null;
  videoFrameKey: number | null;
};

type WebGPUReusableBuffer = {
  buffer: GPUBuffer;
  size: number;
  usage: GPUFlagsConstant;
  uniformBindGroups?: WeakMap<GPURenderPipeline, GPUBindGroup>;
};

type WebGPUTextureView = ReturnType<GPUTexture['createView']>;
type WebGPUBackgroundTextureSource = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

export class WebGPUScreenLayerRenderer implements ScreenLayerRenderer {
  readonly kind = 'webgpu' as const;
  private readonly id = nextWebGPURendererId++;
  private readonly canvasFallback = new Canvas2DScreenLayerRenderer('webgpu-non-presentation-canvas2d-fallback', 'webgpu');
  private readonly webglFallback = new WebGLScreenLayerRenderer();
  private presentationCanvas: HTMLCanvasElement | null = null;
  private context: GPUCanvasContext | null = null;
  private device: GPUDevice | null = null;
  private sampler: GPUSampler | null = null;
  private preferredFormat: GPUTextureFormat | null = null;
  private externalPipeline: GPURenderPipeline | null = null;
  private texturePipeline: GPURenderPipeline | null = null;
  private gradientPipeline: GPURenderPipeline | null = null;
  private solidPipeline: GPURenderPipeline | null = null;
  private initPromise: Promise<void> | null = null;
  private initFailedReason: string | null = null;
  private backgroundTexture: GPUTexture | null = null;
  private backgroundTextureView: WebGPUTextureView | null = null;
  private backgroundTextureSource: HTMLImageElement | null = null;
  private backgroundTextureWidth = 0;
  private backgroundTextureHeight = 0;
  private backgroundTextureNaturalWidth = 0;
  private backgroundTextureNaturalHeight = 0;
  private pendingBackgroundImage: HTMLImageElement | null = null;
  private backgroundUploadCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private preparedBackgroundBitmap: ImageBitmap | null = null;
  private preparedBackgroundBitmapImage: HTMLImageElement | null = null;
  private preparedBackgroundBitmapWidth = 0;
  private preparedBackgroundBitmapHeight = 0;
  private preparedBackgroundBitmapNaturalWidth = 0;
  private preparedBackgroundBitmapNaturalHeight = 0;
  private backgroundBitmapPrewarmPromise: Promise<void> | null = null;
  private backgroundBitmapPrewarmImage: HTMLImageElement | null = null;
  private backgroundBitmapPrewarmKey = '';
  private backgroundDeferredLogCount = 0;
  private vertexBuffers: WebGPUReusableBuffer[] = [];
  private uniformBuffers: WebGPUReusableBuffer[] = [];
  private nextVertexBufferIndex = 0;
  private nextUniformBufferIndex = 0;
  private disposed = false;
  private slowFrameLogCount = 0;
  private maxMotionBlurSamples = 1;
  private motionBlurFrameCount = 0;
  private stats: ScreenLayerRendererStats = {
    requestedRendererKind: 'webgpu',
    rendererKind: 'canvas2d',
    contextStatus: 'fallback',
    drawCostMs: null,
    drawCount: 0,
    fallbackReason: 'webgpu-non-presentation-canvas2d-fallback',
  };

  constructor() {
    this.log('created');
    this.updateRegistry({ disposed: false });
  }

  isSupported(): boolean {
    return this.isReady() || !this.initFailedReason;
  }

  resize(width: number, height: number): void {
    this.canvasFallback.resize(width, height);
    this.webglFallback.resize(width, height);
  }

  drawBackground(input: BackgroundLayerDrawInput): ScreenLayerRendererStats {
    return this.delegate(this.canvasFallback.drawBackground(input), 'webgpu-background-without-presentation-canvas2d-fallback');
  }

  draw(input: ScreenLayerDrawInput): ScreenLayerRendererStats {
    return this.delegate(this.canvasFallback.draw(input), 'webgpu-screen-without-presentation-canvas2d-fallback');
  }

  drawCamera(input: CameraLayerDrawInput): ScreenLayerRendererStats {
    return this.delegate(this.canvasFallback.drawCamera(input), 'webgpu-camera-without-presentation-canvas2d-fallback');
  }

  drawCursorOverlay(input: CursorLayerDrawInput): ScreenLayerRendererStats {
    return this.delegate(this.canvasFallback.drawCursorOverlay(input), 'webgpu-cursor-without-presentation-canvas2d-fallback');
  }

  drawFrame(input: CompositorFrameDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!input.presentationCanvas) {
      return this.delegate(this.canvasFallback.drawFrame(input), 'webgpu-frame-without-presentation-canvas2d-fallback');
    }
    this.usePresentationCanvas(input.presentationCanvas);
    if (!this.isReady()) {
      this.startInit();
      return this.delegateFallbackFrame(input, this.initFailedReason ?? 'webgpu-initializing');
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      this.drawFrameWebGPU(input);
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        requestedRendererKind: 'webgpu',
        rendererKind: 'webgpu',
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: null,
      };
      return this.getDebugStats();
    } catch {
      return this.delegateFallbackFrame(input, 'webgpu-frame-draw-failed', 'draw-failed');
    }
  }

  preparePresentationCanvas(canvas: HTMLCanvasElement, width: number, height: number): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    this.usePresentationCanvas(canvas);
    this.startInit();
    this.stats = {
      ...this.stats,
      rendererKind: this.isReady() ? 'webgpu' : 'webgl',
      contextStatus: this.isReady() ? 'available' : 'fallback',
      fallbackReason: this.isReady() ? null : this.initFailedReason ?? 'webgpu-initializing',
    };
    return this.getDebugStats();
  }

  prepareBackgroundImage(image: HTMLImageElement | null): ScreenLayerRendererStats {
    this.pendingBackgroundImage = image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
    if (!this.pendingBackgroundImage || !this.isReady()) return this.getDebugStats();
    this.startBackgroundImagePrewarm(this.pendingBackgroundImage, 'prewarm');
    return this.getDebugStats();
  }

  getDebugStats(): ScreenLayerRendererStats {
    return { ...this.stats };
  }

  dispose(): void {
    if (this.disposed) return;
    this.log('dispose', {
      drawCount: this.stats.drawCount,
      contextStatus: this.stats.contextStatus,
      fallbackReason: this.stats.fallbackReason,
    });
    this.disposed = true;
    this.backgroundTexture?.destroy();
    this.backgroundTexture = null;
    this.backgroundTextureView = null;
    this.backgroundTextureSource = null;
    this.backgroundTextureNaturalWidth = 0;
    this.backgroundTextureNaturalHeight = 0;
    this.pendingBackgroundImage = null;
    this.backgroundUploadCanvas = null;
    this.releasePreparedBackgroundBitmap();
    this.backgroundBitmapPrewarmPromise = null;
    this.backgroundBitmapPrewarmImage = null;
    this.backgroundBitmapPrewarmKey = '';
    this.destroyReusableBuffers();
    this.canvasFallback.dispose();
    this.webglFallback.dispose();
    this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
    this.updateRegistry({ disposed: true });
  }

  private delegate(stats: ScreenLayerRendererStats, fallbackReason: string): ScreenLayerRendererStats {
    this.stats = {
      ...stats,
      requestedRendererKind: 'webgpu',
      rendererKind: stats.rendererKind,
      contextStatus: this.disposed ? 'disposed' : stats.contextStatus === 'available' ? 'fallback' : stats.contextStatus,
      fallbackReason: stats.fallbackReason ?? fallbackReason,
    };
    return this.getDebugStats();
  }

  private usePresentationCanvas(canvas: HTMLCanvasElement): void {
    if (this.presentationCanvas === canvas) return;
    if (this.presentationCanvas) {
      this.log('context-reset', {
        reason: 'presentation-canvas-switch',
        hadContext: Boolean(this.context),
        canvasKind: 'html-canvas',
      });
      this.updateRegistry((entry) => ({ contextResets: entry.contextResets + 1 }));
    }
    this.presentationCanvas = canvas;
    this.context = null;
    this.device = null;
    this.sampler = null;
    this.preferredFormat = null;
    this.externalPipeline = null;
    this.texturePipeline = null;
    this.gradientPipeline = null;
    this.solidPipeline = null;
    this.backgroundTexture?.destroy();
    this.backgroundTexture = null;
    this.backgroundTextureView = null;
    this.backgroundTextureSource = null;
    this.backgroundTextureNaturalWidth = 0;
    this.backgroundTextureNaturalHeight = 0;
    this.pendingBackgroundImage = null;
    this.backgroundUploadCanvas = null;
    this.releasePreparedBackgroundBitmap();
    this.backgroundBitmapPrewarmPromise = null;
    this.backgroundBitmapPrewarmImage = null;
    this.backgroundBitmapPrewarmKey = '';
    this.backgroundDeferredLogCount = 0;
    this.destroyReusableBuffers();
    this.initPromise = null;
    this.initFailedReason = null;
    this.log('presentation-canvas-attached', {
      width: canvas.width,
      height: canvas.height,
    });
    this.updateRegistry({ canvasKind: 'html-canvas' });
  }

  private isReady(): boolean {
    return Boolean(
      this.presentationCanvas &&
      this.context &&
      this.device &&
      this.sampler &&
      this.preferredFormat &&
      this.externalPipeline &&
      this.texturePipeline &&
      this.gradientPipeline &&
      this.solidPipeline,
    );
  }

  private startInit(): void {
    if (this.disposed || this.isReady() || this.initPromise || this.initFailedReason) return;
    this.initPromise = this.initWebGPU().catch((error) => {
      if (this.disposed) return;
      this.initFailedReason = `webgpu-init-failed:${String(error?.message || error)}`;
      this.stats = { ...this.stats, contextStatus: 'fallback', fallbackReason: this.initFailedReason };
      this.log('context-create-failed', { reason: this.initFailedReason }, 'warn');
      this.updateRegistry({ fallbackReason: this.initFailedReason });
    }).finally(() => {
      this.initPromise = null;
    });
  }

  private async initWebGPU(): Promise<void> {
    const canvas = this.presentationCanvas;
    if (!canvas) throw new Error('missing-presentation-canvas');
    const gpu = (navigator as WebGPUCapableNavigator).gpu;
    if (!gpu) throw new Error('navigator-gpu-missing');
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!this.isCurrentInitTarget(canvas)) return;
    if (!adapter) throw new Error('adapter-unavailable');
    const device = await adapter.requestDevice();
    if (!this.isCurrentInitTarget(canvas)) {
      device.destroy?.();
      return;
    }
    if (typeof device.importExternalTexture !== 'function') {
      device.destroy?.();
      throw new Error('external-texture-unavailable');
    }
    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!this.isCurrentInitTarget(canvas)) {
      device.destroy?.();
      return;
    }
    if (!context) throw new Error('webgpu-context-unavailable');
    const preferredFormat = gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: preferredFormat,
      alphaMode: 'premultiplied',
    });
    device.lost.then((info: { reason?: string }) => {
      if (this.disposed || this.device !== device) return;
      this.initFailedReason = `webgpu-device-lost:${info.reason}`;
      this.stats = { ...this.stats, contextStatus: 'context-lost', fallbackReason: this.initFailedReason };
      this.log('device-lost', { reason: info.reason ?? null }, 'warn');
      this.updateRegistry({ fallbackReason: this.initFailedReason });
    }).catch(() => {});
    this.device = device;
    this.context = context;
    this.preferredFormat = preferredFormat;
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.externalPipeline = createWebGPUExternalPipeline(device, preferredFormat);
    this.texturePipeline = createWebGPUTexturePipeline(device, preferredFormat);
    this.gradientPipeline = createWebGPUGradientPipeline(device, preferredFormat);
    this.solidPipeline = createWebGPUSolidPipeline(device, preferredFormat);
    this.stats = {
      requestedRendererKind: 'webgpu',
      rendererKind: 'webgpu',
      contextStatus: 'available',
      drawCostMs: null,
      drawCount: this.stats.drawCount,
      fallbackReason: null,
    };
    this.log('context-created', {
      preferredFormat,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    if (this.pendingBackgroundImage) {
      this.startBackgroundImagePrewarm(this.pendingBackgroundImage, 'post-init-prewarm');
    }
    this.updateRegistry((entry) => ({
      contextCreates: entry.contextCreates + 1,
      fallbackReason: null,
      canvasKind: 'html-canvas',
    }));
  }

  private isCurrentInitTarget(canvas: HTMLCanvasElement): boolean {
    return !this.disposed && this.presentationCanvas === canvas;
  }

  private delegateFallbackFrame(input: CompositorFrameDrawInput, reason: string, contextStatus: ScreenLayerContextStatus = 'fallback'): ScreenLayerRendererStats {
    this.log('fallback-frame', { reason, contextStatus }, contextStatus === 'fallback' ? 'debug' : 'warn');
    this.updateRegistry({ fallbackReason: reason });
    const stats = this.webglFallback.drawFrame({ ...input, presentationCanvas: null });
    this.stats = {
      ...stats,
      requestedRendererKind: 'webgpu',
      rendererKind: stats.rendererKind,
      contextStatus,
      fallbackReason: reason,
    };
    return this.getDebugStats();
  }

  private drawFrameWebGPU(input: CompositorFrameDrawInput): void {
    const device = this.device;
    const context = this.context;
    if (!device || !context || !this.sampler || !this.externalPipeline || !this.texturePipeline || !this.gradientPipeline || !this.solidPipeline) {
      throw new Error('Missing WebGPU state.');
    }
    const { canvasWidth, canvasHeight } = input.background;
    const phaseTimings: Record<string, number> = {};
    let phaseStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const markPhase = (name: string) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      phaseTimings[name] = Math.round((now - phaseStartedAt) * 10) / 10;
      phaseStartedAt = now;
    };
    const encoder = device.createCommandEncoder();
    this.resetReusableBufferFrame();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    this.drawGradientWebGPU(pass, input.background);
    markPhase('background-gradient');
    if (input.background.image?.complete && input.background.image.naturalWidth > 0 && input.background.image.naturalHeight > 0) {
      this.drawImageWebGPU(pass, input.background.image, canvasWidth, canvasHeight);
    }
    markPhase('background-image');
    this.drawScreenWebGPU(pass, input.screen);
    markPhase('screen');
    this.drawCursorOverlayWebGPU(pass, input.cursor);
    markPhase('cursor');
    if (input.camera) {
      this.drawCameraWebGPU(pass, {
        ...input.camera,
        ctx: input.background.ctx,
        canvasWidth,
        canvasHeight,
      });
    }
    markPhase('camera');
    pass.end();
    device.queue.submit([encoder.finish()]);
    markPhase('submit');
    const totalMs = Object.values(phaseTimings).reduce((sum, value) => sum + value, 0);
    if (totalMs > 50 && this.slowFrameLogCount < 20) {
      this.slowFrameLogCount += 1;
      this.log('slow-frame', {
        drawCostMs: Math.round(totalMs * 10) / 10,
        phases: phaseTimings,
        canvasWidth,
        canvasHeight,
        hasCamera: Boolean(input.camera),
        screenVideoWidth: input.screen.video.videoWidth,
        screenVideoHeight: input.screen.video.videoHeight,
        cameraVideoWidth: input.camera?.video.videoWidth ?? null,
        cameraVideoHeight: input.camera?.video.videoHeight ?? null,
      }, 'warn');
    }
  }

  private drawGradientWebGPU(pass: GPURenderPassEncoder, input: BackgroundLayerDrawInput): void {
    const device = this.device;
    if (!device || !this.gradientPipeline) throw new Error('Missing WebGPU gradient state.');
    const vertices = webGPUVertexData(fullCanvasPositions(input.canvasWidth, input.canvasHeight), fullCanvasTexCoords(), fullCanvasPositions(input.canvasWidth, input.canvasHeight));
    const uniforms = webGPUUniforms({
      resolution: [input.canvasWidth, input.canvasHeight],
      color0: cssColorToRgba(input.startColor),
      color1: cssColorToRgba(input.endColor),
    });
    pass.setPipeline(this.gradientPipeline);
    pass.setVertexBuffer(0, this.writeWebGPUVertexBuffer(vertices));
    pass.setBindGroup(0, this.createWebGPUUniformBindGroup(this.gradientPipeline, uniforms));
    pass.draw(6);
  }

  private drawImageWebGPU(pass: GPURenderPassEncoder, image: HTMLImageElement, canvasWidth: number, canvasHeight: number): void {
    const device = this.device;
    if (!device || !this.texturePipeline || !this.sampler) throw new Error('Missing WebGPU image state.');
    if (!this.isBackgroundTextureReady(image)) {
      this.startBackgroundImagePrewarm(image, 'draw-deferred-prewarm');
      if (this.backgroundDeferredLogCount < 12) {
        this.backgroundDeferredLogCount += 1;
        this.log('background-image-draw-deferred', {
          reason: 'texture-not-ready',
          sourceWidth: image.naturalWidth || image.width || null,
          sourceHeight: image.naturalHeight || image.height || null,
        }, 'debug');
      }
      return;
    }
    const textureView = this.ensureImageTextureView(image);
    const vertices = webGPUVertexData(fullCanvasPositions(canvasWidth, canvasHeight), fullCanvasTexCoords(), fullCanvasPositions(canvasWidth, canvasHeight));
    const uniforms = webGPUUniforms({ resolution: [canvasWidth, canvasHeight] });
    pass.setPipeline(this.texturePipeline);
    pass.setVertexBuffer(0, this.writeWebGPUVertexBuffer(vertices));
    pass.setBindGroup(0, device.createBindGroup({
      layout: this.texturePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.writeWebGPUUniformBuffer(uniforms) } },
      ],
    }));
    pass.draw(6);
  }

  private drawScreenWebGPU(pass: GPURenderPassEncoder, input: ScreenLayerDrawInput): void {
    const device = this.device;
    if (!device || !this.externalPipeline || !this.sampler) throw new Error('Missing WebGPU screen state.');
    const screenWidth = input.screenSource.w * input.screenDrawScale;
    const screenHeight = input.screenSource.h * input.screenDrawScale;
    const x0 = input.screenX;
    const y0 = input.screenY;
    const x1 = input.screenX + screenWidth;
    const y1 = input.screenY + screenHeight;
    const positions = new Float32Array([
      x0, y0,
      x1, y0,
      x0, y1,
      x0, y1,
      x1, y0,
      x1, y1,
    ]);
    const texCoords = new Float32Array([
      ...sourceTexCoordForCanvasPoint(input, x0, y0),
      ...sourceTexCoordForCanvasPoint(input, x1, y0),
      ...sourceTexCoordForCanvasPoint(input, x0, y1),
      ...sourceTexCoordForCanvasPoint(input, x0, y1),
      ...sourceTexCoordForCanvasPoint(input, x1, y0),
      ...sourceTexCoordForCanvasPoint(input, x1, y1),
    ]);
    const previousTransform = input.previousTransform ?? input.transform;
    const nextTransform = input.nextTransform ?? input.transform;
    const previousTexCoords = new Float32Array([
      ...sourceTexCoordForCanvasPoint(input, x0, y0, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y1, previousTransform),
    ]);
    const nextTexCoords = new Float32Array([
      ...sourceTexCoordForCanvasPoint(input, x0, y0, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y1, nextTransform),
    ]);
    const vertices = webGPUVertexData(positions, texCoords, positions, previousTexCoords, nextTexCoords);
    const motionBlurSamples = resolveWebGLMotionBlurSampleCount({
      enabled: resolveWebGLMotionBlurEnabled(),
      blurPx: input.blurPx,
    });
    this.recordMotionBlurSamples(motionBlurSamples, input.blurPx);
    const uniforms = webGPUUniforms({
      resolution: [input.canvasWidth, input.canvasHeight],
      motionBlurSamples,
    });
    const externalTexture = device.importExternalTexture({ source: input.video });
    pass.setPipeline(this.externalPipeline);
    pass.setVertexBuffer(0, this.writeWebGPUVertexBuffer(vertices));
    pass.setBindGroup(0, device.createBindGroup({
      layout: this.externalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: externalTexture },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.writeWebGPUUniformBuffer(uniforms) } },
      ],
    }));
    pass.draw(6);
  }

  private drawCameraWebGPU(pass: GPURenderPassEncoder, input: CameraLayerDrawInput): void {
    const device = this.device;
    if (!device || !this.externalPipeline || !this.sampler) throw new Error('Missing WebGPU camera state.');
    const { frame, source } = input;
    const positions = new Float32Array([
      frame.x, frame.y,
      frame.x + frame.w, frame.y,
      frame.x, frame.y + frame.h,
      frame.x, frame.y + frame.h,
      frame.x + frame.w, frame.y,
      frame.x + frame.w, frame.y + frame.h,
    ]);
    const u0 = source.sx / input.sourceWidth;
    const u1 = (source.sx + source.sw) / input.sourceWidth;
    const v0 = source.sy / input.sourceHeight;
    const v1 = (source.sy + source.sh) / input.sourceHeight;
    const texCoords = new Float32Array([
      u0, v0,
      u1, v0,
      u0, v1,
      u0, v1,
      u1, v0,
      u1, v1,
    ]);
    const vertices = webGPUVertexData(positions, texCoords, positions);
    const uniforms = webGPUUniforms({
      resolution: [input.canvasWidth, input.canvasHeight],
      maskMode: input.presentation?.shape === 'circle' ? 2 : 1,
      maskFrame: [frame.x, frame.y, frame.w, frame.h],
      maskRadius: input.radius,
      motionBlurSamples: 1,
    });
    const externalTexture = device.importExternalTexture({ source: input.video });
    pass.setPipeline(this.externalPipeline);
    pass.setVertexBuffer(0, this.writeWebGPUVertexBuffer(vertices));
    pass.setBindGroup(0, device.createBindGroup({
      layout: this.externalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: externalTexture },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.writeWebGPUUniformBuffer(uniforms) } },
      ],
    }));
    pass.draw(6);
  }

  private drawCursorOverlayWebGPU(pass: GPURenderPassEncoder, input: CursorLayerDrawInput): void {
    const clickEffect = input.clickEffect ?? 'ring';
    if (clickEffect !== 'none') {
      for (const ring of activeClickEmphasisAtFrame(input.cursorEvents, input.cursorFrame)) {
        const projected = projectCursorSourcePoint(input, ring.x, ring.y);
        const radius = ring.radius * projected.scale;
        const width = 4 * projected.scale;
        if (clickEffect === 'ripple') {
          this.drawWebGPUSolidCircle(pass, {
            x: projected.x,
            y: projected.y,
            radius,
            color: [CLICK_RIPPLE[0], CLICK_RIPPLE[1], CLICK_RIPPLE[2], CLICK_RIPPLE[3] * ring.alpha],
          });
        } else {
          this.drawWebGPURing(pass, {
            x: projected.x,
            y: projected.y,
            radius,
            width,
            color: [CLICK_RING[0], CLICK_RING[1], CLICK_RING[2], ring.alpha],
          });
        }
      }
    }
    if (!input.cursorPosition || input.visible === false || !input.cursorInside) return;
    const style = input.style === 'subtle' || input.style === 'spotlight' ? input.style : 'default';
    const rawSize = Number.isFinite(input.sizePercent) ? Number(input.sizePercent) : 100;
    const scale = Math.max(0.5, Math.min(1.5, rawSize / 100));
    const alpha = style === 'subtle' ? 0.6 : 1;
    const projected = projectCursorSourcePoint(input, input.cursorPosition.x, input.cursorPosition.y);
    const drawScale = scale * projected.scale;
    if (style === 'spotlight') {
      this.drawWebGPUSolidCircle(pass, {
        x: projected.x + 12 * drawScale,
        y: projected.y + 16 * drawScale,
        radius: 36 * drawScale,
        color: [...CURSOR_SPOTLIGHT],
      });
    }
    this.drawWebGPUCursorPolygon(pass, { x: projected.x, y: projected.y, scale: drawScale, alpha, style });
  }

  private drawWebGPUSolidCircle(pass: GPURenderPassEncoder, input: { x: number; y: number; radius: number; color: readonly number[] }): void {
    if (input.radius <= 0) return;
    this.drawWebGPUSolidQuad(pass, {
      x: input.x - input.radius,
      y: input.y - input.radius,
      w: input.radius * 2,
      h: input.radius * 2,
      color: input.color,
      maskMode: 2,
      maskFrame: [input.x - input.radius, input.y - input.radius, input.radius * 2, input.radius * 2],
      maskRadius: input.radius,
    });
  }

  private drawWebGPURing(pass: GPURenderPassEncoder, input: { x: number; y: number; radius: number; width: number; color: readonly number[] }): void {
    if (input.radius <= 0) return;
    this.drawWebGPUSolidQuad(pass, {
      x: input.x - input.radius - input.width,
      y: input.y - input.radius - input.width,
      w: input.radius * 2 + input.width * 2,
      h: input.radius * 2 + input.width * 2,
      color: input.color,
      maskMode: 3,
      maskFrame: [input.x - input.radius, input.y - input.radius, input.radius * 2, input.radius * 2],
      maskRadius: input.radius,
      ringWidth: input.width,
    });
  }

  private drawWebGPUCursorPolygon(pass: GPURenderPassEncoder, input: { x: number; y: number; scale: number; alpha: number; style: 'default' | 'subtle' | 'spotlight' }): void {
    const fillPositions: number[] = [];
    for (const index of CURSOR_POLYGON_TRIANGLES) {
      const point = CURSOR_POLYGON_POINTS[index];
      fillPositions.push(input.x + point[0] * input.scale, input.y + point[1] * input.scale);
    }
    this.drawWebGPUSolidPositions(pass, fillPositions, [CURSOR_FILL[0], CURSOR_FILL[1], CURSOR_FILL[2], input.alpha]);
    const outlineColor = input.style === 'spotlight' ? CURSOR_SPOTLIGHT_OUTLINE : CURSOR_OUTLINE;
    for (let index = 0; index < CURSOR_POLYGON_POINTS.length; index += 1) {
      const a = CURSOR_POLYGON_POINTS[index] ?? CURSOR_POLYGON_POINTS[0];
      const b = CURSOR_POLYGON_POINTS[(index + 1) % CURSOR_POLYGON_POINTS.length] ?? CURSOR_POLYGON_POINTS[0];
      this.drawWebGPULine(pass, {
        x0: input.x + a[0] * input.scale,
        y0: input.y + a[1] * input.scale,
        x1: input.x + b[0] * input.scale,
        y1: input.y + b[1] * input.scale,
        width: (input.style === 'spotlight' ? CURSOR_OUTLINE_WIDTH * 1.6 : CURSOR_OUTLINE_WIDTH) * input.scale,
        color: [outlineColor[0], outlineColor[1], outlineColor[2], outlineColor[3] * input.alpha],
      });
    }
  }

  private drawWebGPULine(pass: GPURenderPassEncoder, input: { x0: number; y0: number; x1: number; y1: number; width: number; color: readonly number[] }): void {
    const dx = input.x1 - input.x0;
    const dy = input.y1 - input.y0;
    const length = Math.hypot(dx, dy);
    if (length <= 0) return;
    const nx = -dy / length * input.width * 0.5;
    const ny = dx / length * input.width * 0.5;
    this.drawWebGPUSolidPositions(pass, [
      input.x0 + nx, input.y0 + ny,
      input.x1 + nx, input.y1 + ny,
      input.x0 - nx, input.y0 - ny,
      input.x0 - nx, input.y0 - ny,
      input.x1 + nx, input.y1 + ny,
      input.x1 - nx, input.y1 - ny,
    ], input.color);
  }

  private drawWebGPUSolidQuad(pass: GPURenderPassEncoder, input: { x: number; y: number; w: number; h: number; color: readonly number[]; maskMode?: number; maskFrame?: readonly number[]; maskRadius?: number; ringWidth?: number }): void {
    const x0 = input.x;
    const y0 = input.y;
    const x1 = input.x + input.w;
    const y1 = input.y + input.h;
    this.drawWebGPUSolidPositions(pass, [
      x0, y0,
      x1, y0,
      x0, y1,
      x0, y1,
      x1, y0,
      x1, y1,
    ], input.color, input.maskMode, input.maskFrame, input.maskRadius, input.ringWidth);
  }

  private drawWebGPUSolidPositions(
    pass: GPURenderPassEncoder,
    positions: readonly number[],
    color: readonly number[],
    maskMode = 0,
    maskFrame: readonly number[] = [0, 0, 0, 0],
    maskRadius = 0,
    ringWidth = 0,
  ): void {
    const device = this.device;
    const canvas = this.presentationCanvas;
    if (!device || !canvas || !this.solidPipeline) throw new Error('Missing WebGPU solid state.');
    const positionArray = new Float32Array(positions);
    const texCoords = new Float32Array((positions.length / 2) * 2).fill(0.5);
    const vertices = webGPUVertexData(positionArray, texCoords, positionArray);
    const uniforms = webGPUUniforms({
      resolution: [canvas.width, canvas.height],
      color0: [color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1],
      maskMode,
      maskFrame,
      maskRadius,
      ringWidth,
    });
    pass.setPipeline(this.solidPipeline);
    pass.setVertexBuffer(0, this.writeWebGPUVertexBuffer(vertices));
    pass.setBindGroup(0, this.createWebGPUUniformBindGroup(this.solidPipeline, uniforms));
    pass.draw(positions.length / 2);
  }

  private ensureImageTextureView(image: HTMLImageElement, reason = 'draw'): WebGPUTextureView {
    const device = this.device;
    if (!device) throw new Error('Missing WebGPU image device.');
    const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const { width, height } = this.resolvePreviewBackgroundTextureSize(naturalWidth, naturalHeight);
    if (
      !this.backgroundTexture ||
      this.backgroundTextureSource !== image ||
      this.backgroundTextureWidth !== width ||
      this.backgroundTextureHeight !== height ||
      this.backgroundTextureNaturalWidth !== naturalWidth ||
      this.backgroundTextureNaturalHeight !== naturalHeight
    ) {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.backgroundTexture?.destroy();
      this.backgroundTextureView = null;
      this.backgroundTexture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: WEBGPU_TEXTURE_USAGE.TEXTURE_BINDING | WEBGPU_TEXTURE_USAGE.COPY_DST | WEBGPU_TEXTURE_USAGE.RENDER_ATTACHMENT,
      });
      this.backgroundTextureView = this.backgroundTexture.createView();
      this.backgroundTextureSource = image;
      this.backgroundTextureWidth = width;
      this.backgroundTextureHeight = height;
      this.backgroundTextureNaturalWidth = naturalWidth;
      this.backgroundTextureNaturalHeight = naturalHeight;
      const source = this.preparePreviewBackgroundTextureSource(image, width, height, naturalWidth, naturalHeight);
      device.queue.copyExternalImageToTexture({ source }, { texture: this.backgroundTexture }, [width, height]);
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.log('background-image-texture-uploaded', {
        reason,
        width,
        height,
        sourceWidth: naturalWidth,
        sourceHeight: naturalHeight,
        downscaled: width !== naturalWidth || height !== naturalHeight,
        uploadMs: Math.round((endedAt - startedAt) * 10) / 10,
      }, reason === 'draw' ? 'warn' : 'debug');
    }
    if (!this.backgroundTextureView) this.backgroundTextureView = this.backgroundTexture.createView();
    return this.backgroundTextureView;
  }

  private isBackgroundTextureReady(image: HTMLImageElement): boolean {
    const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const { width, height } = this.resolvePreviewBackgroundTextureSize(naturalWidth, naturalHeight);
    return Boolean(
      this.backgroundTexture &&
      this.backgroundTextureView &&
      this.backgroundTextureSource === image &&
      this.backgroundTextureWidth === width &&
      this.backgroundTextureHeight === height &&
      this.backgroundTextureNaturalWidth === naturalWidth &&
      this.backgroundTextureNaturalHeight === naturalHeight,
    );
  }

  private startBackgroundImagePrewarm(image: HTMLImageElement, reason: string): void {
    if (!this.isReady()) return;
    const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const { width, height } = this.resolvePreviewBackgroundTextureSize(naturalWidth, naturalHeight);
    if (this.isBackgroundTextureReady(image)) return;
    const key = `${width}x${height}:${naturalWidth}x${naturalHeight}`;
    if (this.backgroundBitmapPrewarmPromise && this.backgroundBitmapPrewarmKey === key && this.backgroundBitmapPrewarmImage === image) return;
    const needsResize = width !== naturalWidth || height !== naturalHeight;
    if (!needsResize || typeof createImageBitmap !== 'function') {
      try {
        this.ensureImageTextureView(image, reason);
      } catch (error) {
        this.log('background-image-prewarm-failed', { reason: String((error as Error)?.message || error) }, 'warn');
      }
      return;
    }
    this.backgroundBitmapPrewarmKey = key;
    this.backgroundBitmapPrewarmImage = image;
    this.backgroundBitmapPrewarmPromise = createImageBitmap(image, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    }).then((bitmap) => {
      if (this.disposed || this.pendingBackgroundImage !== image || !this.isReady()) {
        bitmap.close();
        return;
      }
      this.releasePreparedBackgroundBitmap();
      this.preparedBackgroundBitmap = bitmap;
      this.preparedBackgroundBitmapImage = image;
      this.preparedBackgroundBitmapWidth = width;
      this.preparedBackgroundBitmapHeight = height;
      this.preparedBackgroundBitmapNaturalWidth = naturalWidth;
      this.preparedBackgroundBitmapNaturalHeight = naturalHeight;
      this.log('background-image-bitmap-prepared', {
        reason,
        width,
        height,
        sourceWidth: naturalWidth,
        sourceHeight: naturalHeight,
      });
      this.ensureImageTextureView(image, reason);
    }).catch((error) => {
      if (this.disposed || this.pendingBackgroundImage !== image || !this.isReady()) return;
      this.log('background-image-bitmap-prewarm-failed', { reason: String((error as Error)?.message || error) }, 'warn');
      try {
        this.ensureImageTextureView(image, reason);
      } catch (fallbackError) {
        this.log('background-image-prewarm-failed', { reason: String((fallbackError as Error)?.message || fallbackError) }, 'warn');
      }
    }).finally(() => {
      if (this.backgroundBitmapPrewarmKey === key) {
        this.backgroundBitmapPrewarmPromise = null;
        this.backgroundBitmapPrewarmImage = null;
        this.backgroundBitmapPrewarmKey = '';
      }
    });
  }

  private resolvePreviewBackgroundTextureSize(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
    const canvasWidth = Math.max(1, this.presentationCanvas?.width ?? naturalWidth);
    const canvasHeight = Math.max(1, this.presentationCanvas?.height ?? naturalHeight);
    return {
      width: Math.max(1, Math.min(naturalWidth, canvasWidth)),
      height: Math.max(1, Math.min(naturalHeight, canvasHeight)),
    };
  }

  private preparePreviewBackgroundTextureSource(
    image: HTMLImageElement,
    width: number,
    height: number,
    naturalWidth: number,
    naturalHeight: number,
  ): WebGPUBackgroundTextureSource {
    if (
      this.preparedBackgroundBitmap &&
      this.preparedBackgroundBitmapImage === image &&
      this.preparedBackgroundBitmapWidth === width &&
      this.preparedBackgroundBitmapHeight === height &&
      this.preparedBackgroundBitmapNaturalWidth === naturalWidth &&
      this.preparedBackgroundBitmapNaturalHeight === naturalHeight
    ) {
      return this.preparedBackgroundBitmap;
    }
    if (width === naturalWidth && height === naturalHeight) return image;
    const canvas = this.ensureBackgroundUploadCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return image;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  }

  private releasePreparedBackgroundBitmap(): void {
    this.preparedBackgroundBitmap?.close();
    this.preparedBackgroundBitmap = null;
    this.preparedBackgroundBitmapImage = null;
    this.preparedBackgroundBitmapWidth = 0;
    this.preparedBackgroundBitmapHeight = 0;
    this.preparedBackgroundBitmapNaturalWidth = 0;
    this.preparedBackgroundBitmapNaturalHeight = 0;
  }

  private ensureBackgroundUploadCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    if (
      this.backgroundUploadCanvas &&
      this.backgroundUploadCanvas.width === width &&
      this.backgroundUploadCanvas.height === height
    ) {
      return this.backgroundUploadCanvas;
    }
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.backgroundUploadCanvas = canvas;
    return canvas;
  }

  private resetReusableBufferFrame(): void {
    this.nextVertexBufferIndex = 0;
    this.nextUniformBufferIndex = 0;
  }

  private writeWebGPUVertexBuffer(data: Float32Array): GPUBuffer {
    const buffer = this.writeReusableWebGPUBuffer(this.vertexBuffers, this.nextVertexBufferIndex, data, WEBGPU_BUFFER_USAGE.VERTEX).buffer;
    this.nextVertexBufferIndex += 1;
    return buffer;
  }

  private writeWebGPUUniformBuffer(data: Float32Array): GPUBuffer {
    const buffer = this.writeReusableWebGPUBuffer(this.uniformBuffers, this.nextUniformBufferIndex, data, WEBGPU_BUFFER_USAGE.UNIFORM).buffer;
    this.nextUniformBufferIndex += 1;
    return buffer;
  }

  private writeReusableWebGPUBuffer(
    pool: WebGPUReusableBuffer[],
    index: number,
    data: Float32Array,
    usage: GPUFlagsConstant,
  ): WebGPUReusableBuffer {
    const device = this.device;
    if (!device) throw new Error('Missing WebGPU buffer device.');
    const requiredSize = webGPUBufferSize(data);
    let entry = pool[index];
    if (!entry || entry.usage !== usage || entry.size < requiredSize) {
      entry?.buffer?.destroy?.();
      entry = {
        buffer: device.createBuffer({
          size: requiredSize,
          usage: usage | WEBGPU_BUFFER_USAGE.COPY_DST,
        }),
        size: requiredSize,
        usage,
      };
      pool[index] = entry;
    }
    device.queue.writeBuffer(entry.buffer, 0, data);
    return entry;
  }

  private createWebGPUUniformBindGroup(pipeline: GPURenderPipeline, uniforms: Float32Array): GPUBindGroup {
    const device = this.device;
    if (!device) throw new Error('Missing WebGPU bind group device.');
    const entry = this.writeReusableWebGPUBuffer(this.uniformBuffers, this.nextUniformBufferIndex, uniforms, WEBGPU_BUFFER_USAGE.UNIFORM);
    this.nextUniformBufferIndex += 1;
    if (!entry.uniformBindGroups) entry.uniformBindGroups = new WeakMap<GPURenderPipeline, GPUBindGroup>();
    const cachedBindGroup = entry.uniformBindGroups.get(pipeline);
    if (cachedBindGroup) return cachedBindGroup;
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 2, resource: { buffer: entry.buffer } }],
    });
    entry.uniformBindGroups.set(pipeline, bindGroup);
    return bindGroup;
  }

  private destroyReusableBuffers(): void {
    for (const entry of [...this.vertexBuffers, ...this.uniformBuffers]) entry.buffer?.destroy?.();
    this.vertexBuffers = [];
    this.uniformBuffers = [];
    this.nextVertexBufferIndex = 0;
    this.nextUniformBufferIndex = 0;
  }

  private recordMotionBlurSamples(samples: number, blurPx: number): void {
    if (!Number.isFinite(samples) || samples < 3) return;
    this.motionBlurFrameCount += 1;
    if (samples > this.maxMotionBlurSamples) {
      this.maxMotionBlurSamples = samples;
      this.log('motion-blur-active', {
        samples,
        blurPx: Math.round(blurPx * 100) / 100,
        motionBlurFrameCount: this.motionBlurFrameCount,
      });
    }
    this.updateRegistry({
      maxMotionBlurSamples: this.maxMotionBlurSamples,
      motionBlurFrameCount: this.motionBlurFrameCount,
    });
  }

  private log(event: string, detail: Record<string, unknown> = {}, level: 'debug' | 'warn' = 'debug'): void {
    const atMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const payload = {
      id: this.id,
      atMs,
      disposed: this.disposed,
      drawCount: this.stats.drawCount,
      contextStatus: this.stats.contextStatus,
      fallbackReason: this.stats.fallbackReason,
      ...detail,
    };
    if (typeof window !== 'undefined') {
      const target = window as WebGPURendererDebugWindow;
      const log = Array.isArray(target.__roughCutWebgpuRendererLog) ? target.__roughCutWebgpuRendererLog : [];
      log.push({
        atMs,
        event,
        payload,
      });
      target.__roughCutWebgpuRendererLog = log.slice(-160);
    }
    if (typeof console === 'undefined') return;
    if (level === 'warn') console.warn(WEBGPU_RENDERER_LOG_PREFIX, event, JSON.stringify(payload));
    else console.debug(WEBGPU_RENDERER_LOG_PREFIX, event, JSON.stringify(payload));
  }

  private updateRegistry(
    patch: Partial<RendererDebugRegistryEntry> | ((entry: RendererDebugRegistryEntry) => Partial<RendererDebugRegistryEntry>),
  ): void {
    if (typeof window === 'undefined') return;
    const registry = readWebGPURendererRegistry();
    const existing = registry[this.id] ?? {
      id: this.id,
      createdAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      disposed: false,
      contextCreates: 0,
      contextResets: 0,
      fallbackReason: null,
      canvasKind: 'none' as const,
    };
    registry[this.id] = {
      ...existing,
      ...(typeof patch === 'function' ? patch(existing) : patch),
    };
    (window as WebGPURendererDebugWindow).__roughCutWebgpuRendererInstances = registry;
  }
}

export class WebGLScreenLayerRenderer implements ScreenLayerRenderer {
  readonly kind = 'webgl' as const;
  private readonly id = nextWebGLRendererId++;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGLRenderingContext | null = null;
  private screenTexture: WebGLTextureState | null = null;
  private cameraTexture: WebGLTextureState | null = null;
  private imageTexture: WebGLTextureState | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private previousTexCoordBuffer: WebGLBuffer | null = null;
  private nextTexCoordBuffer: WebGLBuffer | null = null;
  private canvasPositionBuffer: WebGLBuffer | null = null;
  private parts: WebGLProgramParts | null = null;
  private fallback: Canvas2DScreenLayerRenderer | null = null;
  private disposed = false;
  private slowFrameLogCount = 0;
  private stats: ScreenLayerRendererStats = {
    requestedRendererKind: 'webgl',
    rendererKind: 'webgl',
    contextStatus: 'missing-context',
    drawCostMs: null,
    drawCount: 0,
    fallbackReason: null,
  };

  constructor() {
    this.log('created');
    this.updateRegistry({ disposed: false });
  }

  isSupported(): boolean {
    return this.ensureContext();
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    if (!this.ensureContext()) {
      this.ensureFallback('webgl-context-unavailable').resize(width, height);
      return;
    }
    const canvas = this.canvas;
    if (!canvas) return;
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    this.gl?.viewport(0, 0, nextWidth, nextHeight);
  }

  draw(input: ScreenLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.screenTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer) {
      return this.drawFallback(input, 'webgl-context-unavailable');
    }
    if (this.gl.isContextLost()) return this.drawFallback(input, 'webgl-context-lost', 'context-lost');

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const screenWidth = Math.max(1, Math.ceil(input.screenSource.w * input.screenDrawScale));
      const screenHeight = Math.max(1, Math.ceil(input.screenSource.h * input.screenDrawScale));
      const motionBlurRenderScale = resolveWebGLMotionBlurRenderScale({
        enabled: resolveWebGLMotionBlurEnabled(),
        blurPx: input.blurPx,
      });
      const targetWidth = Math.max(1, Math.ceil(screenWidth * motionBlurRenderScale));
      const targetHeight = Math.max(1, Math.ceil(screenHeight * motionBlurRenderScale));
      this.resize(targetWidth, targetHeight);
      this.drawWebGL({
        ...input,
        canvasWidth: targetWidth,
        canvasHeight: targetHeight,
        screenX: 0,
        screenY: 0,
        screenDrawScale: input.screenDrawScale * motionBlurRenderScale,
      });
      input.ctx.drawImage(this.canvas as CanvasImageSource, input.screenX, input.screenY, screenWidth, screenHeight);
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        requestedRendererKind: 'webgl',
        rendererKind: 'webgl',
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: null,
      };
      return this.getDebugStats();
    } catch {
      return this.drawFallback(input, 'webgl-draw-failed', 'draw-failed');
    }
  }

  drawBackground(input: BackgroundLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.screenTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) {
      const stats = this.ensureFallback('webgl-context-unavailable').drawBackground(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', fallbackReason: 'webgl-context-unavailable' };
      return this.getDebugStats();
    }
    if (this.gl.isContextLost()) {
      const stats = this.ensureFallback('webgl-context-lost').drawBackground(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'context-lost', fallbackReason: 'webgl-context-lost' };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      this.resize(input.canvasWidth, input.canvasHeight);
      this.drawBackgroundWebGL(input);
      input.ctx.drawImage(this.canvas as CanvasImageSource, 0, 0, input.canvasWidth, input.canvasHeight);
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        requestedRendererKind: 'webgl',
        rendererKind: 'webgl',
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: null,
      };
      return this.getDebugStats();
    } catch {
      const stats = this.ensureFallback('webgl-background-draw-failed').drawBackground(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'draw-failed', fallbackReason: 'webgl-background-draw-failed' };
      return this.getDebugStats();
    }
  }

  private drawBackgroundWebGL(input: BackgroundLayerDrawInput): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.imageTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');
    const positions = fullCanvasPositions(input.canvasWidth, input.canvasHeight);
    const texCoords = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]);
    gl.viewport(0, 0, input.canvasWidth, input.canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(parts.program);
    gl.uniform2f(parts.resolutionUniform, input.canvasWidth, input.canvasHeight);
    gl.uniform1i(parts.textureUniform, 0);
    gl.uniform1f(parts.motionBlurSamplesUniform, 1);
    gl.uniform1f(parts.maskModeUniform, 0);
    gl.uniform4f(parts.maskFrameUniform, 0, 0, input.canvasWidth, input.canvasHeight);
    gl.uniform1f(parts.maskRadiusUniform, 0);
    gl.uniform1f(parts.ringWidthUniform, 0);
    gl.uniform4f(parts.solidColorUniform, 0, 0, 0, 0);
    const start = cssColorToRgba(input.startColor);
    const end = cssColorToRgba(input.endColor);
    gl.uniform4f(parts.gradientStartUniform, start[0], start[1], start[2], start[3]);
    gl.uniform4f(parts.gradientEndUniform, end[0], end[1], end[2], end[3]);
    gl.uniform1f(parts.renderModeUniform, 2);
    bindGeometry(gl, parts, {
      positionBuffer: this.positionBuffer,
      texCoordBuffer: this.texCoordBuffer,
      previousTexCoordBuffer: this.previousTexCoordBuffer,
      nextTexCoordBuffer: this.nextTexCoordBuffer,
      canvasPositionBuffer: this.canvasPositionBuffer,
      positions,
      texCoords,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (input.image?.complete && input.image.naturalWidth > 0 && input.image.naturalHeight > 0) {
      gl.uniform1f(parts.renderModeUniform, 0);
      gl.activeTexture(gl.TEXTURE0);
      uploadImageTexture(gl, this.imageTexture, input.image);
      bindGeometry(gl, parts, {
        positionBuffer: this.positionBuffer,
        texCoordBuffer: this.texCoordBuffer,
        previousTexCoordBuffer: this.previousTexCoordBuffer,
        nextTexCoordBuffer: this.nextTexCoordBuffer,
        canvasPositionBuffer: this.canvasPositionBuffer,
        positions,
        texCoords,
      });
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  drawCamera(input: CameraLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.cameraTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) {
      return this.ensureFallback('webgl-context-unavailable').drawCamera(input);
    }
    if (this.gl.isContextLost()) {
      const stats = this.ensureFallback('webgl-context-lost').drawCamera(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'context-lost', fallbackReason: 'webgl-context-lost' };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      this.resize(input.canvasWidth, input.canvasHeight);
      this.drawCameraWebGL(input);
      input.ctx.save();
      if (input.shadow && input.presentation?.shadowEnabled !== false) {
        input.ctx.shadowColor = `rgba(0, 0, 0, ${input.presentation?.shadowOpacity ?? 0.45})`;
        input.ctx.shadowBlur = input.presentation?.shadowBlur ?? 24;
        input.ctx.shadowOffsetY = 8;
      }
      input.ctx.drawImage(this.canvas as CanvasImageSource, 0, 0, input.canvasWidth, input.canvasHeight);
      input.ctx.restore();
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        requestedRendererKind: 'webgl',
        rendererKind: 'webgl',
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: null,
      };
      return this.getDebugStats();
    } catch {
      const stats = this.ensureFallback('webgl-camera-draw-failed').drawCamera(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'draw-failed', fallbackReason: 'webgl-camera-draw-failed' };
      return this.getDebugStats();
    }
  }

  drawCursorOverlay(input: CursorLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) {
      const stats = this.ensureFallback('webgl-context-unavailable').drawCursorOverlay(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', fallbackReason: 'webgl-context-unavailable' };
      return this.getDebugStats();
    }
    if (this.gl.isContextLost()) {
      const stats = this.ensureFallback('webgl-context-lost').drawCursorOverlay(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'context-lost', fallbackReason: 'webgl-context-lost' };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const bounds = resolveCursorOverlayBounds(input);
      if (!bounds) {
        const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.stats = {
          requestedRendererKind: 'webgl',
          rendererKind: 'webgl',
          contextStatus: 'available',
          drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
          drawCount: this.stats.drawCount + 1,
          fallbackReason: null,
        };
        return this.getDebugStats();
      }
      this.resize(bounds.w, bounds.h);
      this.drawCursorOverlayWebGL({
        ...input,
        canvasWidth: bounds.w,
        canvasHeight: bounds.h,
        screenX: input.screenX - bounds.x,
        screenY: input.screenY - bounds.y,
      });
      input.ctx.save();
      input.ctx.setTransform(1, 0, 0, 1, 0, 0);
      input.ctx.drawImage(this.canvas as CanvasImageSource, bounds.x, bounds.y, bounds.w, bounds.h);
      input.ctx.restore();
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.stats = {
        requestedRendererKind: 'webgl',
        rendererKind: 'webgl',
        contextStatus: 'available',
        drawCostMs: Math.round((endedAt - startedAt) * 10) / 10,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: null,
      };
      return this.getDebugStats();
    } catch {
      const stats = this.ensureFallback('webgl-cursor-overlay-draw-failed').drawCursorOverlay(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'draw-failed', fallbackReason: 'webgl-cursor-overlay-draw-failed' };
      return this.getDebugStats();
    }
  }

  drawFrame(input: CompositorFrameDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    this.usePresentationCanvas(input.presentationCanvas);
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.screenTexture || !this.cameraTexture || !this.imageTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) {
      const stats = this.ensureFallback('webgl-context-unavailable').drawFrame(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', fallbackReason: 'webgl-context-unavailable' };
      return this.getDebugStats();
    }
    if (this.gl.isContextLost()) {
      const stats = this.ensureFallback('webgl-context-lost').drawFrame(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'context-lost', fallbackReason: 'webgl-context-lost' };
      return this.getDebugStats();
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const { canvasWidth, canvasHeight } = input.background;
      const phaseTimings: Record<string, number> = {};
      let phaseStartedAt = startedAt;
      const markPhase = (name: string) => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        phaseTimings[name] = Math.round((now - phaseStartedAt) * 10) / 10;
        phaseStartedAt = now;
      };
      this.resize(canvasWidth, canvasHeight);
      markPhase('resize');
      this.drawBackgroundWebGL(input.background);
      markPhase('background');
      this.drawWebGL(input.screen, { clear: false });
      markPhase('screen');
      this.drawCursorOverlayWebGL(input.cursor, { clear: false });
      markPhase('cursor');
      if (input.camera) {
        this.drawCameraWebGL({
          ...input.camera,
          ctx: input.background.ctx,
          canvasWidth,
          canvasHeight,
        }, { clear: false });
      }
      markPhase('camera');
      if (!input.presentationCanvas) {
        input.background.ctx.drawImage(this.canvas as CanvasImageSource, 0, 0, canvasWidth, canvasHeight);
      }
      markPhase('present');
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const drawCostMs = Math.round((endedAt - startedAt) * 10) / 10;
      if (drawCostMs > 50 && this.slowFrameLogCount < 20) {
        this.slowFrameLogCount += 1;
        this.log('slow-frame', {
          drawCostMs,
          phases: phaseTimings,
          canvasWidth,
          canvasHeight,
          hasCamera: Boolean(input.camera),
          screenVideoWidth: input.screen.video.videoWidth,
          screenVideoHeight: input.screen.video.videoHeight,
          cameraVideoWidth: input.camera?.video.videoWidth ?? null,
          cameraVideoHeight: input.camera?.video.videoHeight ?? null,
        }, 'warn');
      }
      this.stats = {
        requestedRendererKind: 'webgl',
        rendererKind: 'webgl',
        contextStatus: 'available',
        drawCostMs,
        drawCount: this.stats.drawCount + 1,
        fallbackReason: null,
      };
      return this.getDebugStats();
    } catch {
      const stats = this.ensureFallback('webgl-frame-draw-failed').drawFrame(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'draw-failed', fallbackReason: 'webgl-frame-draw-failed' };
      return this.getDebugStats();
    }
  }

  getDebugStats(): ScreenLayerRendererStats {
    return { ...this.stats };
  }

  preparePresentationCanvas(canvas: HTMLCanvasElement, width: number, height: number): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    this.usePresentationCanvas(canvas);
    if (!this.ensureContext() || !this.gl) {
      this.stats = { ...this.stats, contextStatus: 'missing-context', fallbackReason: 'webgl-context-unavailable' };
      return this.getDebugStats();
    }
    this.resize(width, height);
    return this.getDebugStats();
  }

  prepareBackgroundImage(image: HTMLImageElement | null): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return this.getDebugStats();
    if (!this.ensureContext() || !this.gl || !this.imageTexture) return this.getDebugStats();
    uploadImageTexture(this.gl, this.imageTexture, image);
    return this.getDebugStats();
  }

  dispose(): void {
    if (this.disposed) return;
    this.log('dispose', {
      drawCount: this.stats.drawCount,
      contextStatus: this.stats.contextStatus,
      fallbackReason: this.stats.fallbackReason,
    });
    this.disposed = true;
    this.fallback?.dispose();
    this.fallback = null;
    this.screenTexture = null;
    this.cameraTexture = null;
    this.imageTexture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.previousTexCoordBuffer = null;
    this.nextTexCoordBuffer = null;
    this.canvasPositionBuffer = null;
    this.parts = null;
    this.gl = null;
    this.canvas = null;
    this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
    this.updateRegistry({ disposed: true });
  }

  private resetContext(reason = 'reset'): void {
    this.log('context-reset', {
      reason,
      hadContext: Boolean(this.gl),
      canvasKind: describeRendererCanvas(this.canvas),
    });
    this.screenTexture = null;
    this.cameraTexture = null;
    this.imageTexture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.previousTexCoordBuffer = null;
    this.nextTexCoordBuffer = null;
    this.canvasPositionBuffer = null;
    this.parts = null;
    this.gl = null;
    this.canvas = null;
    this.updateRegistry((entry) => ({ contextResets: entry.contextResets + 1, canvasKind: 'none' }));
  }

  private usePresentationCanvas(canvas: HTMLCanvasElement | null | undefined): void {
    if (!canvas || this.canvas === canvas) return;
    this.resetContext('presentation-canvas-switch');
    this.canvas = canvas;
    this.log('presentation-canvas-attached', {
      width: canvas.width,
      height: canvas.height,
    });
    this.updateRegistry({ canvasKind: 'html-canvas' });
  }

  private drawFallback(input: ScreenLayerDrawInput, reason: string, contextStatus: ScreenLayerContextStatus = 'fallback'): ScreenLayerRendererStats {
    const stats = this.ensureFallback(reason).draw(input);
    this.stats = {
      ...stats,
      requestedRendererKind: 'webgl',
      rendererKind: 'canvas2d',
      contextStatus,
      fallbackReason: reason,
      drawCount: stats.drawCount,
    };
    return this.getDebugStats();
  }

  private ensureFallback(reason: string): Canvas2DScreenLayerRenderer {
    if (!this.fallback) {
      this.log('fallback-created', { reason });
      this.fallback = new Canvas2DScreenLayerRenderer(reason, 'webgl');
    }
    this.updateRegistry({ fallbackReason: reason });
    return this.fallback;
  }

  private ensureContext(): boolean {
    if (this.disposed) return false;
    if (this.gl && this.parts && this.screenTexture && this.cameraTexture && this.imageTexture && this.positionBuffer && this.texCoordBuffer && this.previousTexCoordBuffer && this.nextTexCoordBuffer && this.canvasPositionBuffer) return !this.gl.isContextLost();
    const canvas = this.canvas ?? createRendererCanvas();
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    }) as WebGLRenderingContext | null;
    if (!gl) {
      this.stats = { ...this.stats, contextStatus: 'missing-context', fallbackReason: 'webgl-context-unavailable' };
      this.log('context-create-failed', { canvasKind: describeRendererCanvas(canvas) }, 'warn');
      this.updateRegistry({ fallbackReason: 'webgl-context-unavailable', canvasKind: describeRendererCanvas(canvas) });
      return false;
    }
    const parts = createProgram(gl);
    const screenTexture = createTextureState(gl);
    const cameraTexture = createTextureState(gl);
    const imageTexture = createTextureState(gl);
    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const previousTexCoordBuffer = gl.createBuffer();
    const nextTexCoordBuffer = gl.createBuffer();
    const canvasPositionBuffer = gl.createBuffer();
    if (!parts || !screenTexture || !cameraTexture || !imageTexture || !positionBuffer || !texCoordBuffer || !previousTexCoordBuffer || !nextTexCoordBuffer || !canvasPositionBuffer) {
      this.stats = { ...this.stats, contextStatus: 'missing-context', fallbackReason: 'webgl-init-failed' };
      return false;
    }
    this.canvas = canvas;
    this.gl = gl;
    this.parts = parts;
    this.screenTexture = screenTexture;
    this.cameraTexture = cameraTexture;
    this.imageTexture = imageTexture;
    this.positionBuffer = positionBuffer;
    this.texCoordBuffer = texCoordBuffer;
    this.previousTexCoordBuffer = previousTexCoordBuffer;
    this.nextTexCoordBuffer = nextTexCoordBuffer;
    this.canvasPositionBuffer = canvasPositionBuffer;
    this.stats = { ...this.stats, contextStatus: 'available', fallbackReason: null };
    this.log('context-created', {
      canvasKind: describeRendererCanvas(canvas),
      width: canvas.width,
      height: canvas.height,
      activeInstances: Object.keys(readWebGLRendererRegistry()).length,
    });
    this.updateRegistry((entry) => ({
      contextCreates: entry.contextCreates + 1,
      fallbackReason: null,
      canvasKind: describeRendererCanvas(canvas),
    }));
    return true;
  }

  private log(event: string, detail: Record<string, unknown> = {}, level: 'debug' | 'warn' = 'debug'): void {
    const payload = {
      id: this.id,
      disposed: this.disposed,
      drawCount: this.stats.drawCount,
      contextStatus: this.stats.contextStatus,
      fallbackReason: this.stats.fallbackReason,
      ...detail,
    };
    if (typeof window !== 'undefined') {
      const target = window as WebGLRendererDebugWindow;
      const log = Array.isArray(target.__roughCutWebglRendererLog) ? target.__roughCutWebglRendererLog : [];
      log.push({
        atMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        event,
        payload,
      });
      target.__roughCutWebglRendererLog = log.slice(-160);
    }
    if (typeof console === 'undefined') return;
    if (level === 'warn') console.warn(WEBGL_RENDERER_LOG_PREFIX, event, JSON.stringify(payload));
    else console.debug(WEBGL_RENDERER_LOG_PREFIX, event, JSON.stringify(payload));
  }

  private updateRegistry(
    patch: Partial<NonNullable<WebGLRendererDebugWindow['__roughCutWebglRendererInstances']>[number]> |
      ((entry: NonNullable<WebGLRendererDebugWindow['__roughCutWebglRendererInstances']>[number]) => Partial<NonNullable<WebGLRendererDebugWindow['__roughCutWebglRendererInstances']>[number]>),
  ): void {
    if (typeof window === 'undefined') return;
    const registry = readWebGLRendererRegistry();
    const existing = registry[this.id] ?? {
      id: this.id,
      createdAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      disposed: false,
      contextCreates: 0,
      contextResets: 0,
      fallbackReason: null,
      canvasKind: 'none' as const,
    };
    registry[this.id] = {
      ...existing,
      ...(typeof patch === 'function' ? patch(existing) : patch),
    };
    (window as WebGLRendererDebugWindow).__roughCutWebglRendererInstances = registry;
  }

  private drawWebGL(input: ScreenLayerDrawInput, options: { clear?: boolean } = {}): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.screenTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');

    const screenWidth = input.screenSource.w * input.screenDrawScale;
    const screenHeight = input.screenSource.h * input.screenDrawScale;
    const x0 = input.screenX;
    const y0 = input.screenY;
    const x1 = input.screenX + screenWidth;
    const y1 = input.screenY + screenHeight;
    const positions = new Float32Array([
      x0, y0,
      x1, y0,
      x0, y1,
      x0, y1,
      x1, y0,
      x1, y1,
    ]);
    const canvasPositions = positions;
    const texCoords = new Float32Array([
      ...sourceTexCoordForCanvasPoint(input, x0, y0),
      ...sourceTexCoordForCanvasPoint(input, x1, y0),
      ...sourceTexCoordForCanvasPoint(input, x0, y1),
      ...sourceTexCoordForCanvasPoint(input, x0, y1),
      ...sourceTexCoordForCanvasPoint(input, x1, y0),
      ...sourceTexCoordForCanvasPoint(input, x1, y1),
    ]);
    const previousTransform = input.previousTransform ?? input.transform;
    const nextTransform = input.nextTransform ?? input.transform;
    const previousTexCoords = new Float32Array([
      ...sourceTexCoordForCanvasPoint(input, x0, y0, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, previousTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y1, previousTransform),
    ]);
    const nextTexCoords = new Float32Array([
      ...sourceTexCoordForCanvasPoint(input, x0, y0, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x0, y1, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y0, nextTransform),
      ...sourceTexCoordForCanvasPoint(input, x1, y1, nextTransform),
    ]);
    const motionBlurSamples = resolveWebGLMotionBlurSampleCount({
      enabled: resolveWebGLMotionBlurEnabled(),
      blurPx: input.blurPx,
    });

    gl.viewport(0, 0, input.canvasWidth, input.canvasHeight);
    if (options.clear !== false) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(parts.program);
    gl.uniform2f(parts.resolutionUniform, input.canvasWidth, input.canvasHeight);
    gl.uniform1i(parts.textureUniform, 0);
    gl.uniform1f(parts.motionBlurSamplesUniform, motionBlurSamples);
    gl.uniform1f(parts.renderModeUniform, 0);
    gl.uniform4f(parts.solidColorUniform, 0, 0, 0, 0);
    gl.uniform1f(parts.maskModeUniform, 0);
    gl.uniform4f(parts.maskFrameUniform, 0, 0, input.canvasWidth, input.canvasHeight);
    gl.uniform1f(parts.maskRadiusUniform, 0);
    gl.uniform1f(parts.ringWidthUniform, 0);
    gl.activeTexture(gl.TEXTURE0);
    uploadVideoTexture(gl, this.screenTexture, input.video);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.positionAttribute);
    gl.vertexAttribPointer(parts.positionAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.texCoordAttribute);
    gl.vertexAttribPointer(parts.texCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.previousTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, previousTexCoords, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.previousTexCoordAttribute);
    gl.vertexAttribPointer(parts.previousTexCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nextTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, nextTexCoords, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.nextTexCoordAttribute);
    gl.vertexAttribPointer(parts.nextTexCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.canvasPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, canvasPositions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.canvasPositionAttribute);
    gl.vertexAttribPointer(parts.canvasPositionAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawCameraWebGL(input: CameraLayerDrawInput, options: { clear?: boolean } = {}): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.cameraTexture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');
    const { frame, source } = input;
    const x0 = frame.x;
    const y0 = frame.y;
    const x1 = frame.x + frame.w;
    const y1 = frame.y + frame.h;
    const positions = new Float32Array([
      x0, y0,
      x1, y0,
      x0, y1,
      x0, y1,
      x1, y0,
      x1, y1,
    ]);
    const u0 = source.sx / input.sourceWidth;
    const u1 = (source.sx + source.sw) / input.sourceWidth;
    const v0 = source.sy / input.sourceHeight;
    const v1 = (source.sy + source.sh) / input.sourceHeight;
    const texCoords = new Float32Array([
      u0, v0,
      u1, v0,
      u0, v1,
      u0, v1,
      u1, v0,
      u1, v1,
    ]);
    gl.viewport(0, 0, input.canvasWidth, input.canvasHeight);
    if (options.clear !== false) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(parts.program);
    gl.uniform2f(parts.resolutionUniform, input.canvasWidth, input.canvasHeight);
    gl.uniform1i(parts.textureUniform, 0);
    gl.uniform1f(parts.motionBlurSamplesUniform, 1);
    gl.uniform1f(parts.renderModeUniform, 0);
    gl.uniform4f(parts.solidColorUniform, 0, 0, 0, 0);
    gl.uniform1f(parts.maskModeUniform, input.presentation?.shape === 'circle' ? 2 : 1);
    gl.uniform4f(parts.maskFrameUniform, frame.x, frame.y, frame.w, frame.h);
    gl.uniform1f(parts.maskRadiusUniform, input.radius);
    gl.uniform1f(parts.ringWidthUniform, 0);
    gl.activeTexture(gl.TEXTURE0);
    uploadVideoTexture(gl, this.cameraTexture, input.video);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.positionAttribute);
    gl.vertexAttribPointer(parts.positionAttribute, 2, gl.FLOAT, false, 0, 0);
    for (const [buffer, attribute] of [
      [this.texCoordBuffer, parts.texCoordAttribute],
      [this.previousTexCoordBuffer, parts.previousTexCoordAttribute],
      [this.nextTexCoordBuffer, parts.nextTexCoordAttribute],
    ] as const) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.canvasPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.canvasPositionAttribute);
    gl.vertexAttribPointer(parts.canvasPositionAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawCursorOverlayWebGL(input: CursorLayerDrawInput, options: { clear?: boolean } = {}): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');
    const canvasWidth = Math.max(1, Math.round(input.canvasWidth));
    const canvasHeight = Math.max(1, Math.round(input.canvasHeight));
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    if (options.clear !== false) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(parts.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(parts.resolutionUniform, canvasWidth, canvasHeight);
    gl.uniform1i(parts.textureUniform, 0);
    gl.uniform1f(parts.motionBlurSamplesUniform, 1);

    const clickEffect = input.clickEffect ?? 'ring';
    if (clickEffect !== 'none') {
      for (const ring of activeClickEmphasisAtFrame(input.cursorEvents, input.cursorFrame)) {
        const projected = projectCursorSourcePoint(input, ring.x, ring.y);
        const radius = ring.radius * projected.scale;
        const width = 4 * projected.scale;
        if (clickEffect === 'ripple') {
          this.drawSolidCircle({ x: projected.x, y: projected.y, radius, color: [CLICK_RIPPLE[0], CLICK_RIPPLE[1], CLICK_RIPPLE[2], CLICK_RIPPLE[3] * ring.alpha] });
        } else {
          this.drawRing({ x: projected.x, y: projected.y, radius, width, color: [CLICK_RING[0], CLICK_RING[1], CLICK_RING[2], ring.alpha] });
        }
      }
    }

    if (input.cursorPosition && input.visible !== false && input.cursorInside) {
      const style = input.style === 'subtle' || input.style === 'spotlight' ? input.style : 'default';
      const rawSize = Number.isFinite(input.sizePercent) ? Number(input.sizePercent) : 100;
      const scale = Math.max(0.5, Math.min(1.5, rawSize / 100));
      const alpha = style === 'subtle' ? 0.6 : 1;
      const projected = projectCursorSourcePoint(input, input.cursorPosition.x, input.cursorPosition.y);
      const x = projected.x;
      const y = projected.y;
      const drawScale = scale * projected.scale;
      if (style === 'spotlight') {
        this.drawSolidCircle({
          x: x + 12 * drawScale,
          y: y + 16 * drawScale,
          radius: 36 * drawScale,
          color: [...CURSOR_SPOTLIGHT],
        });
      }
      this.drawCursorPolygon({ x, y, scale: drawScale, alpha, style });
    }
    gl.disable(gl.BLEND);
  }

  private drawSolidCircle(input: { x: number; y: number; radius: number; color: readonly number[] }): void {
    const radius = Math.max(0, input.radius);
    if (radius <= 0) return;
    this.drawSolidQuad({
      x: input.x - radius,
      y: input.y - radius,
      w: radius * 2,
      h: radius * 2,
      color: input.color,
      maskMode: 2,
      maskFrame: [input.x - radius, input.y - radius, radius * 2, radius * 2],
      maskRadius: radius,
    });
  }

  private drawRing(input: { x: number; y: number; radius: number; width: number; color: readonly number[] }): void {
    const radius = Math.max(0, input.radius);
    if (radius <= 0) return;
    this.drawSolidQuad({
      x: input.x - radius - input.width,
      y: input.y - radius - input.width,
      w: radius * 2 + input.width * 2,
      h: radius * 2 + input.width * 2,
      color: input.color,
      maskMode: 3,
      maskFrame: [input.x - radius, input.y - radius, radius * 2, radius * 2],
      maskRadius: radius,
      ringWidth: input.width,
    });
  }

  private drawCursorPolygon(input: { x: number; y: number; scale: number; alpha: number; style: 'default' | 'subtle' | 'spotlight' }): void {
    const fillPositions: number[] = [];
    for (const index of CURSOR_POLYGON_TRIANGLES) {
      const point = CURSOR_POLYGON_POINTS[index];
      fillPositions.push(input.x + point[0] * input.scale, input.y + point[1] * input.scale);
    }
    const gl = this.gl;
    if (!gl) throw new Error('Missing WebGL state.');
    this.drawSolidPositions(fillPositions, [CURSOR_FILL[0], CURSOR_FILL[1], CURSOR_FILL[2], input.alpha], gl.TRIANGLES);
    const outlineColor = input.style === 'spotlight' ? CURSOR_SPOTLIGHT_OUTLINE : CURSOR_OUTLINE;
    const outlinePositions = CURSOR_POLYGON_POINTS.flatMap((point) => [input.x + point[0] * input.scale, input.y + point[1] * input.scale]);
    this.drawSolidPositions(outlinePositions, [outlineColor[0], outlineColor[1], outlineColor[2], outlineColor[3] * input.alpha], gl.LINE_LOOP, (input.style === 'spotlight' ? CURSOR_OUTLINE_WIDTH * 1.6 : CURSOR_OUTLINE_WIDTH) * input.scale);
  }

  private drawSolidQuad(input: { x: number; y: number; w: number; h: number; color: readonly number[]; maskMode?: number; maskFrame?: readonly number[]; maskRadius?: number; ringWidth?: number }): void {
    const x0 = input.x;
    const y0 = input.y;
    const x1 = input.x + input.w;
    const y1 = input.y + input.h;
    this.drawSolidPositions([
      x0, y0,
      x1, y0,
      x0, y1,
      x0, y1,
      x1, y0,
      x1, y1,
    ], input.color, this.gl?.TRIANGLES ?? 4, 1, input.maskMode, input.maskFrame, input.maskRadius, input.ringWidth);
  }

  private drawSolidPositions(
    positions: readonly number[],
    color: readonly number[],
    mode: number,
    lineWidth = 1,
    maskMode = 0,
    maskFrame: readonly number[] = [0, 0, 0, 0],
    maskRadius = 0,
    ringWidth = 0,
  ): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');
    const positionArray = new Float32Array(positions);
    const vertexCount = positions.length / 2;
    const dummyTexCoords = new Float32Array(vertexCount * 2).fill(0.5);
    gl.uniform1f(parts.renderModeUniform, 1);
    gl.uniform4f(parts.solidColorUniform, color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1);
    gl.uniform1f(parts.maskModeUniform, maskMode);
    gl.uniform4f(parts.maskFrameUniform, maskFrame[0] ?? 0, maskFrame[1] ?? 0, maskFrame[2] ?? 0, maskFrame[3] ?? 0);
    gl.uniform1f(parts.maskRadiusUniform, maskRadius);
    gl.uniform1f(parts.ringWidthUniform, ringWidth);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positionArray, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.positionAttribute);
    gl.vertexAttribPointer(parts.positionAttribute, 2, gl.FLOAT, false, 0, 0);
    for (const [buffer, attribute] of [
      [this.texCoordBuffer, parts.texCoordAttribute],
      [this.previousTexCoordBuffer, parts.previousTexCoordAttribute],
      [this.nextTexCoordBuffer, parts.nextTexCoordAttribute],
    ] as const) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, dummyTexCoords, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.canvasPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positionArray, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(parts.canvasPositionAttribute);
    gl.vertexAttribPointer(parts.canvasPositionAttribute, 2, gl.FLOAT, false, 0, 0);
    if (mode === gl.LINE_LOOP) gl.lineWidth(lineWidth);
    gl.drawArrays(mode, 0, vertexCount);
  }
}

function resolveWebGLMotionBlurEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const target = window as unknown as { __roughCutWebglMotionBlur?: unknown };
  if (target.__roughCutWebglMotionBlur === true) return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get('webglMotionBlur') === '1' || params.get('webglMotionBlur') === 'true') return true;
  try {
    return window.localStorage?.getItem('roughCutWebglMotionBlur') === '1';
  } catch {
    return false;
  }
}

function readWebGLRendererRegistry(): NonNullable<WebGLRendererDebugWindow['__roughCutWebglRendererInstances']> {
  if (typeof window === 'undefined') return {};
  const target = window as WebGLRendererDebugWindow;
  if (!target.__roughCutWebglRendererInstances) target.__roughCutWebglRendererInstances = {};
  return target.__roughCutWebglRendererInstances;
}

function readWebGPURendererRegistry(): NonNullable<WebGPURendererDebugWindow['__roughCutWebgpuRendererInstances']> {
  if (typeof window === 'undefined') return {};
  const target = window as WebGPURendererDebugWindow;
  if (!target.__roughCutWebgpuRendererInstances) target.__roughCutWebgpuRendererInstances = {};
  return target.__roughCutWebgpuRendererInstances;
}

function describeRendererCanvas(canvas: HTMLCanvasElement | OffscreenCanvas | null): 'html-canvas' | 'offscreen-canvas' | 'none' {
  if (!canvas) return 'none';
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement
    ? 'html-canvas'
    : 'offscreen-canvas';
}

function createRendererCanvas(): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  const documentRef = typeof document !== 'undefined' ? document : null;
  if (!documentRef) throw new Error('No document available for WebGL screen-layer canvas.');
  return documentRef.createElement('canvas');
}

const WEBGPU_VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 40,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
    { shaderLocation: 1, offset: 8, format: 'float32x2' },
    { shaderLocation: 2, offset: 16, format: 'float32x2' },
    { shaderLocation: 3, offset: 24, format: 'float32x2' },
    { shaderLocation: 4, offset: 32, format: 'float32x2' },
  ],
};

const WEBGPU_VERTEX_SHADER = `
  struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
    @location(1) previousTexCoord: vec2f,
    @location(2) nextTexCoord: vec2f,
    @location(3) canvasPosition: vec2f,
  };
  struct Uniforms {
    resolution: vec2f,
    motionBlurSamples: f32,
    maskMode: f32,
    maskFrame: vec4f,
    maskRadius: f32,
    ringWidth: f32,
    _pad: vec2f,
    color0: vec4f,
    color1: vec4f,
  };
  @group(0) @binding(2) var<uniform> uniforms: Uniforms;
  @vertex
  fn vertexMain(
    @location(0) position: vec2f,
    @location(1) texCoord: vec2f,
    @location(2) previousTexCoord: vec2f,
    @location(3) nextTexCoord: vec2f,
    @location(4) canvasPosition: vec2f,
  ) -> VertexOut {
    var out: VertexOut;
    let zeroToOne = position / uniforms.resolution;
    let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
    out.position = vec4f(clipSpace * vec2f(1.0, -1.0), 0.0, 1.0);
    out.texCoord = texCoord;
    out.previousTexCoord = previousTexCoord;
    out.nextTexCoord = nextTexCoord;
    out.canvasPosition = canvasPosition;
    return out;
  }
`;

const WEBGPU_FRAGMENT_COMMON = `
  struct Uniforms {
    resolution: vec2f,
    motionBlurSamples: f32,
    maskMode: f32,
    maskFrame: vec4f,
    maskRadius: f32,
    ringWidth: f32,
    _pad: vec2f,
    color0: vec4f,
    color1: vec4f,
  };
  @group(0) @binding(2) var<uniform> uniforms: Uniforms;
  fn applyMask(canvasPosition: vec2f) -> bool {
    if (uniforms.maskMode > 2.5) {
      let center = uniforms.maskFrame.xy + uniforms.maskFrame.zw * 0.5;
      let radius = min(uniforms.maskFrame.z, uniforms.maskFrame.w) * 0.5;
      let distanceFromCenter = distance(canvasPosition, center);
      return distanceFromCenter <= radius + uniforms.ringWidth * 0.5 && distanceFromCenter >= radius - uniforms.ringWidth * 0.5;
    }
    if (uniforms.maskMode > 1.5) {
      let center = uniforms.maskFrame.xy + uniforms.maskFrame.zw * 0.5;
      return distance(canvasPosition, center) <= min(uniforms.maskFrame.z, uniforms.maskFrame.w) * 0.5;
    }
    if (uniforms.maskMode > 0.5) {
      let halfSize = uniforms.maskFrame.zw * 0.5;
      let center = uniforms.maskFrame.xy + halfSize;
      let q = abs(canvasPosition - center) - halfSize + vec2f(uniforms.maskRadius, uniforms.maskRadius);
      let outside = length(max(q, vec2f(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - uniforms.maskRadius;
      return outside <= 0.0;
    }
    return true;
  }
  fn texVisible(coord: vec2f) -> bool {
    return coord.x >= 0.0 && coord.x <= 1.0 && coord.y >= 0.0 && coord.y <= 1.0;
  }
`;

function createWebGPUExternalPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
  const vertexModule = device.createShaderModule({ code: WEBGPU_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({
    code: `${WEBGPU_FRAGMENT_COMMON}
      @group(0) @binding(0) var videoTexture: texture_external;
      @group(0) @binding(1) var videoSampler: sampler;
      fn sampleIfVisible(coord: vec2f) -> vec4f {
        if (!texVisible(coord)) { return vec4f(0.0); }
        return textureSampleBaseClampToEdge(videoTexture, videoSampler, coord);
      }
      @fragment
      fn fragmentMain(
        @location(0) texCoord: vec2f,
        @location(1) previousTexCoord: vec2f,
        @location(2) nextTexCoord: vec2f,
        @location(3) canvasPosition: vec2f,
      ) -> @location(0) vec4f {
        if (!texVisible(texCoord) || !applyMask(canvasPosition)) { discard; }
        var color = textureSampleBaseClampToEdge(videoTexture, videoSampler, texCoord) * 0.44;
        var weight = 0.44;
        if (uniforms.motionBlurSamples >= 3.0) {
          color += sampleIfVisible(previousTexCoord) * 0.18;
          color += sampleIfVisible(nextTexCoord) * 0.18;
          weight += 0.36;
        }
        if (uniforms.motionBlurSamples >= 5.0) {
          color += sampleIfVisible(mix(previousTexCoord, texCoord, 0.5)) * 0.10;
          color += sampleIfVisible(mix(texCoord, nextTexCoord, 0.5)) * 0.10;
          weight += 0.20;
        }
        return color / weight;
      }
    `,
  });
  return createWebGPUPipeline(device, format, vertexModule, fragmentModule);
}

function createWebGPUTexturePipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
  const vertexModule = device.createShaderModule({ code: WEBGPU_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({
    code: `${WEBGPU_FRAGMENT_COMMON}
      @group(0) @binding(0) var imageTexture: texture_2d<f32>;
      @group(0) @binding(1) var imageSampler: sampler;
      @fragment
      fn fragmentMain(
        @location(0) texCoord: vec2f,
        @location(1) previousTexCoord: vec2f,
        @location(2) nextTexCoord: vec2f,
        @location(3) canvasPosition: vec2f,
      ) -> @location(0) vec4f {
        _ = previousTexCoord;
        _ = nextTexCoord;
        if (!texVisible(texCoord) || !applyMask(canvasPosition)) { discard; }
        return textureSample(imageTexture, imageSampler, texCoord);
      }
    `,
  });
  return createWebGPUPipeline(device, format, vertexModule, fragmentModule);
}

function createWebGPUGradientPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
  const vertexModule = device.createShaderModule({ code: WEBGPU_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({
    code: `${WEBGPU_FRAGMENT_COMMON}
      @fragment
      fn fragmentMain(
        @location(0) texCoord: vec2f,
        @location(1) previousTexCoord: vec2f,
        @location(2) nextTexCoord: vec2f,
        @location(3) canvasPosition: vec2f,
      ) -> @location(0) vec4f {
        _ = texCoord;
        _ = previousTexCoord;
        _ = nextTexCoord;
        let t = clamp((canvasPosition.x + canvasPosition.y) / max(uniforms.resolution.x + uniforms.resolution.y, 1.0), 0.0, 1.0);
        return mix(uniforms.color0, uniforms.color1, t);
      }
    `,
  });
  return createWebGPUPipeline(device, format, vertexModule, fragmentModule, [{ binding: 2, visibility: WEBGPU_SHADER_STAGE.VERTEX | WEBGPU_SHADER_STAGE.FRAGMENT, buffer: { type: 'uniform' } }]);
}

function createWebGPUSolidPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
  const vertexModule = device.createShaderModule({ code: WEBGPU_VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({
    code: `${WEBGPU_FRAGMENT_COMMON}
      @fragment
      fn fragmentMain(
        @location(0) texCoord: vec2f,
        @location(1) previousTexCoord: vec2f,
        @location(2) nextTexCoord: vec2f,
        @location(3) canvasPosition: vec2f,
      ) -> @location(0) vec4f {
        _ = texCoord;
        _ = previousTexCoord;
        _ = nextTexCoord;
        if (!applyMask(canvasPosition)) { discard; }
        return uniforms.color0;
      }
    `,
  });
  return createWebGPUPipeline(device, format, vertexModule, fragmentModule, [{ binding: 2, visibility: WEBGPU_SHADER_STAGE.VERTEX | WEBGPU_SHADER_STAGE.FRAGMENT, buffer: { type: 'uniform' } }]);
}

function createWebGPUPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  vertexModule: GPUShaderModule,
  fragmentModule: GPUShaderModule,
  bindGroupEntries?: GPUBindGroupLayoutEntry[],
): GPURenderPipeline {
  const layout = bindGroupEntries
    ? device.createPipelineLayout({ bindGroupLayouts: [device.createBindGroupLayout({ entries: bindGroupEntries })] })
    : 'auto';
  return device.createRenderPipeline({
    layout,
    vertex: {
      module: vertexModule,
      entryPoint: 'vertexMain',
      buffers: [WEBGPU_VERTEX_BUFFER_LAYOUT],
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'fragmentMain',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });
}

function webGPUBufferSize(data: Float32Array): number {
  return Math.max(4, Math.ceil(data.byteLength / 4) * 4);
}

function fullCanvasTexCoords(): Float32Array {
  return new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    0, 1,
    1, 0,
    1, 1,
  ]);
}

function webGPUVertexData(
  positions: Float32Array,
  texCoords: Float32Array,
  canvasPositions: Float32Array,
  previousTexCoords: Float32Array = texCoords,
  nextTexCoords: Float32Array = texCoords,
): Float32Array {
  const vertexCount = positions.length / 2;
  const data = new Float32Array(vertexCount * 10);
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 10;
    data[offset] = positions[index * 2] ?? 0;
    data[offset + 1] = positions[index * 2 + 1] ?? 0;
    data[offset + 2] = texCoords[index * 2] ?? 0;
    data[offset + 3] = texCoords[index * 2 + 1] ?? 0;
    data[offset + 4] = previousTexCoords[index * 2] ?? data[offset + 2] ?? 0;
    data[offset + 5] = previousTexCoords[index * 2 + 1] ?? data[offset + 3] ?? 0;
    data[offset + 6] = nextTexCoords[index * 2] ?? data[offset + 2] ?? 0;
    data[offset + 7] = nextTexCoords[index * 2 + 1] ?? data[offset + 3] ?? 0;
    data[offset + 8] = canvasPositions[index * 2] ?? data[offset] ?? 0;
    data[offset + 9] = canvasPositions[index * 2 + 1] ?? data[offset + 1] ?? 0;
  }
  return data;
}

function webGPUUniforms(input: {
  resolution: readonly [number, number];
  motionBlurSamples?: number;
  maskMode?: number;
  maskFrame?: readonly number[];
  maskRadius?: number;
  ringWidth?: number;
  color0?: readonly number[];
  color1?: readonly number[];
}): Float32Array {
  const maskFrame = input.maskFrame ?? [0, 0, 0, 0];
  const color0 = input.color0 ?? [0, 0, 0, 0];
  const color1 = input.color1 ?? [0, 0, 0, 0];
  return new Float32Array([
    input.resolution[0], input.resolution[1], input.motionBlurSamples ?? 1, input.maskMode ?? 0,
    maskFrame[0] ?? 0, maskFrame[1] ?? 0, maskFrame[2] ?? 0, maskFrame[3] ?? 0,
    input.maskRadius ?? 0, input.ringWidth ?? 0, 0, 0,
    color0[0] ?? 0, color0[1] ?? 0, color0[2] ?? 0, color0[3] ?? 0,
    color1[0] ?? 0, color1[1] ?? 0, color1[2] ?? 0, color1[3] ?? 0,
  ]);
}

function createProgram(gl: WebGLRenderingContext): WebGLProgramParts | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    attribute vec2 a_previousTexCoord;
    attribute vec2 a_nextTexCoord;
    attribute vec2 a_canvasPosition;
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;
    varying vec2 v_previousTexCoord;
    varying vec2 v_nextTexCoord;
    varying vec2 v_canvasPosition;
    void main() {
      vec2 zeroToOne = a_position / u_resolution;
      vec2 clipSpace = zeroToOne * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      v_texCoord = a_texCoord;
      v_previousTexCoord = a_previousTexCoord;
      v_nextTexCoord = a_nextTexCoord;
      v_canvasPosition = a_canvasPosition;
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform highp vec2 u_resolution;
    uniform float u_motionBlurSamples;
    uniform float u_maskMode;
    uniform vec4 u_maskFrame;
    uniform float u_maskRadius;
    uniform float u_renderMode;
    uniform vec4 u_solidColor;
    uniform vec4 u_gradientStart;
    uniform vec4 u_gradientEnd;
    uniform float u_ringWidth;
    varying vec2 v_texCoord;
    varying vec2 v_previousTexCoord;
    varying vec2 v_nextTexCoord;
    varying vec2 v_canvasPosition;
    vec4 sampleIfVisible(vec2 coord) {
      if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) return vec4(0.0);
      return texture2D(u_texture, coord);
    }
    void main() {
      if (v_texCoord.x < 0.0 || v_texCoord.x > 1.0 || v_texCoord.y < 0.0 || v_texCoord.y > 1.0) discard;
      if (u_maskMode > 2.5) {
        vec2 center = u_maskFrame.xy + u_maskFrame.zw * 0.5;
        float radius = min(u_maskFrame.z, u_maskFrame.w) * 0.5;
        float distanceFromCenter = distance(v_canvasPosition, center);
        if (distanceFromCenter > radius + u_ringWidth * 0.5 || distanceFromCenter < radius - u_ringWidth * 0.5) discard;
      } else if (u_maskMode > 1.5) {
        vec2 center = u_maskFrame.xy + u_maskFrame.zw * 0.5;
        if (distance(v_canvasPosition, center) > min(u_maskFrame.z, u_maskFrame.w) * 0.5) discard;
      } else if (u_maskMode > 0.5) {
        vec2 halfSize = u_maskFrame.zw * 0.5;
        vec2 center = u_maskFrame.xy + halfSize;
        vec2 q = abs(v_canvasPosition - center) - halfSize + vec2(u_maskRadius);
        float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_maskRadius;
        if (outside > 0.0) discard;
      }
      if (u_renderMode > 0.5) {
        if (u_renderMode > 1.5) {
          float t = clamp((v_canvasPosition.x + v_canvasPosition.y) / max(u_resolution.x + u_resolution.y, 1.0), 0.0, 1.0);
          gl_FragColor = mix(u_gradientStart, u_gradientEnd, t);
          return;
        }
        gl_FragColor = u_solidColor;
        return;
      }
      vec4 color = texture2D(u_texture, v_texCoord) * 0.44;
      float weight = 0.44;
      if (u_motionBlurSamples >= 3.0) {
        color += sampleIfVisible(v_previousTexCoord) * 0.18;
        color += sampleIfVisible(v_nextTexCoord) * 0.18;
        weight += 0.36;
      }
      if (u_motionBlurSamples >= 5.0) {
        color += sampleIfVisible(mix(v_previousTexCoord, v_texCoord, 0.5)) * 0.10;
        color += sampleIfVisible(mix(v_texCoord, v_nextTexCoord, 0.5)) * 0.10;
        weight += 0.20;
      }
      gl_FragColor = color / weight;
    }
  `);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return {
    program,
    positionAttribute: gl.getAttribLocation(program, 'a_position'),
    texCoordAttribute: gl.getAttribLocation(program, 'a_texCoord'),
    previousTexCoordAttribute: gl.getAttribLocation(program, 'a_previousTexCoord'),
    nextTexCoordAttribute: gl.getAttribLocation(program, 'a_nextTexCoord'),
    canvasPositionAttribute: gl.getAttribLocation(program, 'a_canvasPosition'),
    resolutionUniform: gl.getUniformLocation(program, 'u_resolution'),
    textureUniform: gl.getUniformLocation(program, 'u_texture'),
    motionBlurSamplesUniform: gl.getUniformLocation(program, 'u_motionBlurSamples'),
    maskModeUniform: gl.getUniformLocation(program, 'u_maskMode'),
    maskFrameUniform: gl.getUniformLocation(program, 'u_maskFrame'),
    maskRadiusUniform: gl.getUniformLocation(program, 'u_maskRadius'),
    renderModeUniform: gl.getUniformLocation(program, 'u_renderMode'),
    solidColorUniform: gl.getUniformLocation(program, 'u_solidColor'),
    gradientStartUniform: gl.getUniformLocation(program, 'u_gradientStart'),
    gradientEndUniform: gl.getUniformLocation(program, 'u_gradientEnd'),
    ringWidthUniform: gl.getUniformLocation(program, 'u_ringWidth'),
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function fullCanvasPositions(canvasWidth: number, canvasHeight: number): Float32Array {
  return new Float32Array([
    0, 0,
    canvasWidth, 0,
    0, canvasHeight,
    0, canvasHeight,
    canvasWidth, 0,
    canvasWidth, canvasHeight,
  ]);
}

function bindGeometry(
  gl: WebGLRenderingContext,
  parts: WebGLProgramParts,
  input: {
    positionBuffer: WebGLBuffer;
    texCoordBuffer: WebGLBuffer;
    previousTexCoordBuffer: WebGLBuffer;
    nextTexCoordBuffer: WebGLBuffer;
    canvasPositionBuffer: WebGLBuffer;
    positions: Float32Array;
    texCoords: Float32Array;
  },
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, input.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, input.positions, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(parts.positionAttribute);
  gl.vertexAttribPointer(parts.positionAttribute, 2, gl.FLOAT, false, 0, 0);
  for (const [buffer, attribute] of [
    [input.texCoordBuffer, parts.texCoordAttribute],
    [input.previousTexCoordBuffer, parts.previousTexCoordAttribute],
    [input.nextTexCoordBuffer, parts.nextTexCoordAttribute],
  ] as const) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, input.texCoords, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, input.canvasPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, input.positions, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(parts.canvasPositionAttribute);
  gl.vertexAttribPointer(parts.canvasPositionAttribute, 2, gl.FLOAT, false, 0, 0);
}

function createTextureState(gl: WebGLRenderingContext): WebGLTextureState | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return { texture, width: 0, height: 0, imageSource: null, videoFrameKey: null };
}

function uploadVideoTexture(gl: WebGLRenderingContext, state: WebGLTextureState, video: HTMLVideoElement): void {
  const width = Math.max(1, video.videoWidth || 1);
  const height = Math.max(1, video.videoHeight || 1);
  const frameKey = video.getVideoPlaybackQuality?.().totalVideoFrames ?? null;
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (frameKey !== null && state.videoFrameKey === frameKey && state.width === width && state.height === height) return;
  if (state.width === width && state.height === height) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    state.videoFrameKey = frameKey;
    state.imageSource = null;
    return;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  state.width = width;
  state.height = height;
  state.imageSource = null;
  state.videoFrameKey = frameKey;
}

function uploadImageTexture(gl: WebGLRenderingContext, state: WebGLTextureState, image: HTMLImageElement): void {
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (state.imageSource === image && state.width === width && state.height === height) return;
  if (state.width === width && state.height === height) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
    state.imageSource = image;
    state.videoFrameKey = null;
    return;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  state.width = width;
  state.height = height;
  state.imageSource = image;
  state.videoFrameKey = null;
}

function cssColorToRgba(color: string): [number, number, number, number] {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const hexValue = hex?.[1];
  if (hexValue) {
    const raw = hexValue.length === 3
      ? hexValue.split('').map((part) => `${part}${part}`).join('')
      : hexValue;
    return [
      parseInt(raw.slice(0, 2), 16) / 255,
      parseInt(raw.slice(2, 4), 16) / 255,
      parseInt(raw.slice(4, 6), 16) / 255,
      1,
    ];
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    return [
      Math.max(0, Math.min(255, Number(rgb[1]))) / 255,
      Math.max(0, Math.min(255, Number(rgb[2]))) / 255,
      Math.max(0, Math.min(255, Number(rgb[3]))) / 255,
      Math.max(0, Math.min(1, rgb[4] === undefined ? 1 : Number(rgb[4]))),
    ];
  }
  return [0, 0, 0, 1];
}

function addCameraShapePath(
  ctx: CanvasRenderingContext2D,
  frame: ScreenLayerCameraFrame,
  presentation: ScreenLayerCameraPresentation | null | undefined,
  radius: number,
): void {
  if (presentation?.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(frame.x + frame.w / 2, frame.y + frame.h / 2, Math.min(frame.w, frame.h) / 2, 0, Math.PI * 2);
    return;
  }
  addRoundedRect(ctx, frame.x, frame.y, frame.w, frame.h, radius);
}

function addRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function resolveCursorOverlayBounds(input: CursorLayerDrawInput): ScreenLayerCameraFrame | null {
  const boxes: ScreenLayerCameraFrame[] = [];
  const addBox = (x: number, y: number, w: number, h: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(input.canvasWidth, Math.ceil(x + w));
    const y1 = Math.min(input.canvasHeight, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  };

  const clickEffect = input.clickEffect ?? 'ring';
  if (clickEffect !== 'none') {
    for (const ring of activeClickEmphasisAtFrame(input.cursorEvents, input.cursorFrame)) {
      const projected = projectCursorSourcePoint(input, ring.x, ring.y);
      const radius = ring.radius * projected.scale;
      const pad = Math.max(6, 6 * projected.scale);
      addBox(projected.x - radius - pad, projected.y - radius - pad, radius * 2 + pad * 2, radius * 2 + pad * 2);
    }
  }

  if (input.cursorPosition && input.visible !== false && input.cursorInside) {
    const rawSize = Number.isFinite(input.sizePercent) ? Number(input.sizePercent) : 100;
    const scale = Math.max(0.5, Math.min(1.5, rawSize / 100));
    const projected = projectCursorSourcePoint(input, input.cursorPosition.x, input.cursorPosition.y);
    const drawScale = scale * projected.scale;
    const spotlightPad = input.style === 'spotlight' ? 56 * drawScale : 0;
    const pad = Math.max(10, 12 * drawScale, spotlightPad);
    addBox(projected.x - pad, projected.y - pad, 32 * drawScale + pad * 2, 40 * drawScale + pad * 2);
  }

  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.w));
  const y1 = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function projectCursorSourcePoint(input: CursorLayerDrawInput, sourceX: number, sourceY: number): { x: number; y: number; scale: number } {
  const scale = Number.isFinite(input.transform.scale) && input.transform.scale > 0 ? input.transform.scale : 1;
  const offsetX = Number.isFinite(input.transform.offsetX) ? input.transform.offsetX : 0;
  const offsetY = Number.isFinite(input.transform.offsetY) ? input.transform.offsetY : 0;
  const sourceCenterX = input.screenSource.x + input.screenSource.w / 2;
  const sourceCenterY = input.screenSource.y + input.screenSource.h / 2;
  const localX = input.screenSource.w / 2 + offsetX + (sourceX - sourceCenterX) * scale;
  const localY = input.screenSource.h / 2 + offsetY + (sourceY - sourceCenterY) * scale;
  return {
    x: input.screenX + localX * input.screenDrawScale,
    y: input.screenY + localY * input.screenDrawScale,
    scale: input.screenDrawScale * scale,
  };
}

function sourceTexCoordForCanvasPoint(
  input: ScreenLayerDrawInput,
  canvasX: number,
  canvasY: number,
  transform: ScreenLayerCameraTransform = input.transform,
): [number, number] {
  const scale = Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
  const localX = (canvasX - input.screenX) / input.screenDrawScale;
  const localY = (canvasY - input.screenY) / input.screenDrawScale;
  const sourceX = (localX - (input.screenSource.w / 2 + transform.offsetX)) / scale
    + input.screenSource.x
    + input.screenSource.w / 2;
  const sourceY = (localY - (input.screenSource.h / 2 + transform.offsetY)) / scale
    + input.screenSource.y
    + input.screenSource.h / 2;
  return [sourceX / input.sourceWidth, sourceY / input.sourceHeight];
}
