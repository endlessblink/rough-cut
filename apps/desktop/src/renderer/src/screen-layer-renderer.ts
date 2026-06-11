import { drawZoomMotionSource, resolveWebGLMotionBlurSampleCount } from './zoom-motion-renderer';

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

export type ScreenLayerRendererKind = 'canvas2d' | 'webgl';
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
  draw(input: ScreenLayerDrawInput): ScreenLayerRendererStats;
  drawCamera(input: CameraLayerDrawInput): ScreenLayerRendererStats;
  drawCursorOverlay(input: CursorLayerDrawInput): ScreenLayerRendererStats;
  getDebugStats(): ScreenLayerRendererStats;
  dispose(): void;
}

export function createScreenLayerRenderer(kind: ScreenLayerRendererKind = 'canvas2d'): ScreenLayerRenderer {
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
  ringWidthUniform: WebGLUniformLocation | null;
};

export class WebGLScreenLayerRenderer implements ScreenLayerRenderer {
  readonly kind = 'webgl' as const;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGLRenderingContext | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private previousTexCoordBuffer: WebGLBuffer | null = null;
  private nextTexCoordBuffer: WebGLBuffer | null = null;
  private canvasPositionBuffer: WebGLBuffer | null = null;
  private parts: WebGLProgramParts | null = null;
  private fallback: Canvas2DScreenLayerRenderer | null = null;
  private disposed = false;
  private stats: ScreenLayerRendererStats = {
    requestedRendererKind: 'webgl',
    rendererKind: 'webgl',
    contextStatus: 'missing-context',
    drawCostMs: null,
    drawCount: 0,
    fallbackReason: null,
  };

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
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.texture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer) {
      return this.drawFallback(input, 'webgl-context-unavailable');
    }
    if (this.gl.isContextLost()) return this.drawFallback(input, 'webgl-context-lost', 'context-lost');

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      this.resize(input.canvasWidth, input.canvasHeight);
      this.drawWebGL(input);
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
      return this.drawFallback(input, 'webgl-draw-failed', 'draw-failed');
    }
  }

  drawCamera(input: CameraLayerDrawInput): ScreenLayerRendererStats {
    if (this.disposed) {
      this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
      return this.getDebugStats();
    }
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.texture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) {
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
      this.resize(input.canvasWidth, input.canvasHeight);
      this.drawCursorOverlayWebGL(input);
      input.ctx.save();
      input.ctx.setTransform(1, 0, 0, 1, 0, 0);
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
      const stats = this.ensureFallback('webgl-cursor-overlay-draw-failed').drawCursorOverlay(input);
      this.stats = { ...stats, requestedRendererKind: 'webgl', rendererKind: 'canvas2d', contextStatus: 'draw-failed', fallbackReason: 'webgl-cursor-overlay-draw-failed' };
      return this.getDebugStats();
    }
  }

  getDebugStats(): ScreenLayerRendererStats {
    return { ...this.stats };
  }

  dispose(): void {
    this.disposed = true;
    this.fallback?.dispose();
    this.fallback = null;
    this.texture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.previousTexCoordBuffer = null;
    this.nextTexCoordBuffer = null;
    this.canvasPositionBuffer = null;
    this.parts = null;
    this.gl = null;
    this.canvas = null;
    this.stats = { ...this.stats, contextStatus: 'disposed', drawCostMs: null };
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
    if (!this.fallback) this.fallback = new Canvas2DScreenLayerRenderer(reason, 'webgl');
    return this.fallback;
  }

  private ensureContext(): boolean {
    if (this.disposed) return false;
    if (this.gl && this.parts && this.texture && this.positionBuffer && this.texCoordBuffer && this.previousTexCoordBuffer && this.nextTexCoordBuffer && this.canvasPositionBuffer) return !this.gl.isContextLost();
    const canvas = createRendererCanvas();
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
      return false;
    }
    const parts = createProgram(gl);
    const texture = gl.createTexture();
    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const previousTexCoordBuffer = gl.createBuffer();
    const nextTexCoordBuffer = gl.createBuffer();
    const canvasPositionBuffer = gl.createBuffer();
    if (!parts || !texture || !positionBuffer || !texCoordBuffer || !previousTexCoordBuffer || !nextTexCoordBuffer || !canvasPositionBuffer) {
      this.stats = { ...this.stats, contextStatus: 'missing-context', fallbackReason: 'webgl-init-failed' };
      return false;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.canvas = canvas;
    this.gl = gl;
    this.parts = parts;
    this.texture = texture;
    this.positionBuffer = positionBuffer;
    this.texCoordBuffer = texCoordBuffer;
    this.previousTexCoordBuffer = previousTexCoordBuffer;
    this.nextTexCoordBuffer = nextTexCoordBuffer;
    this.canvasPositionBuffer = canvasPositionBuffer;
    this.stats = { ...this.stats, contextStatus: 'available', fallbackReason: null };
    return true;
  }

  private drawWebGL(input: ScreenLayerDrawInput): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.texture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');

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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.video);

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

  private drawCameraWebGL(input: CameraLayerDrawInput): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.texture || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');
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
      u0, v1,
      u1, v1,
      u0, v0,
      u0, v0,
      u1, v1,
      u1, v0,
    ]);
    gl.viewport(0, 0, input.canvasWidth, input.canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.video);
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

  private drawCursorOverlayWebGL(input: CursorLayerDrawInput): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.positionBuffer || !this.texCoordBuffer || !this.previousTexCoordBuffer || !this.nextTexCoordBuffer || !this.canvasPositionBuffer) throw new Error('Missing WebGL state.');
    const canvasWidth = Math.max(1, Math.round(input.canvasWidth));
    const canvasHeight = Math.max(1, Math.round(input.canvasHeight));
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
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

function createRendererCanvas(): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  const documentRef = typeof document !== 'undefined' ? document : null;
  if (!documentRef) throw new Error('No document available for WebGL screen-layer canvas.');
  return documentRef.createElement('canvas');
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
    uniform float u_motionBlurSamples;
    uniform float u_maskMode;
    uniform vec4 u_maskFrame;
    uniform float u_maskRadius;
    uniform float u_renderMode;
    uniform vec4 u_solidColor;
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
