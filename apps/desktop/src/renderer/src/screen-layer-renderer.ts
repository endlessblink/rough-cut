import { drawZoomMotionSource } from './zoom-motion-renderer';

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
  blurPx: number;
  sharpZoom: boolean;
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
  resolutionUniform: WebGLUniformLocation | null;
  textureUniform: WebGLUniformLocation | null;
};

export class WebGLScreenLayerRenderer implements ScreenLayerRenderer {
  readonly kind = 'webgl' as const;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGLRenderingContext | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
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
    if (!this.ensureContext() || !this.gl || !this.canvas || !this.parts || !this.texture || !this.positionBuffer || !this.texCoordBuffer) {
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
    if (this.gl && this.parts && this.texture && this.positionBuffer && this.texCoordBuffer) return !this.gl.isContextLost();
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
    if (!parts || !texture || !positionBuffer || !texCoordBuffer) {
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
    this.stats = { ...this.stats, contextStatus: 'available', fallbackReason: null };
    return true;
  }

  private drawWebGL(input: ScreenLayerDrawInput): void {
    const gl = this.gl;
    const parts = this.parts;
    if (!gl || !parts || !this.texture || !this.positionBuffer || !this.texCoordBuffer) throw new Error('Missing WebGL state.');

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

    gl.viewport(0, 0, input.canvasWidth, input.canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(parts.program);
    gl.uniform2f(parts.resolutionUniform, input.canvasWidth, input.canvasHeight);
    gl.uniform1i(parts.textureUniform, 0);
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

    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;
    void main() {
      vec2 zeroToOne = a_position / u_resolution;
      vec2 clipSpace = zeroToOne * 2.0 - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      v_texCoord = a_texCoord;
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_texCoord;
    void main() {
      if (v_texCoord.x < 0.0 || v_texCoord.x > 1.0 || v_texCoord.y < 0.0 || v_texCoord.y > 1.0) discard;
      gl_FragColor = texture2D(u_texture, v_texCoord);
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
    resolutionUniform: gl.getUniformLocation(program, 'u_resolution'),
    textureUniform: gl.getUniformLocation(program, 'u_texture'),
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function sourceTexCoordForCanvasPoint(input: ScreenLayerDrawInput, canvasX: number, canvasY: number): [number, number] {
  const scale = Number.isFinite(input.transform.scale) && input.transform.scale > 0 ? input.transform.scale : 1;
  const localX = (canvasX - input.screenX) / input.screenDrawScale;
  const localY = (canvasY - input.screenY) / input.screenDrawScale;
  const sourceX = (localX - (input.screenSource.w / 2 + input.transform.offsetX)) / scale
    + input.screenSource.x
    + input.screenSource.w / 2;
  const sourceY = (localY - (input.screenSource.h / 2 + input.transform.offsetY)) / scale
    + input.screenSource.y
    + input.screenSource.h / 2;
  return [sourceX / input.sourceWidth, sourceY / input.sourceHeight];
}
