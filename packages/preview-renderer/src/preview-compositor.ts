import { Application, Graphics, Text, Container, TextStyle } from 'pixi.js';
import type { ProjectDocument } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { registerBuiltinEffects } from '@rough-cut/effect-registry';
import type { RenderFrame, RenderLayer } from '@rough-cut/frame-resolver';
import type { CompositorConfig, CompositorState, CompositorEvents } from './types.js';

/** Color palette for layer placeholders — cycled deterministically by clipId hash */
const LAYER_COLORS = [
  0x4a90d9, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x3498db, 0xe91e63, 0x00bcd4,
];

/** Derive a consistent color for a clipId without external libraries */
function colorForClipId(clipId: string): number {
  let hash = 0;
  for (let i = 0; i < clipId.length; i++) {
    hash = (hash * 31 + clipId.charCodeAt(i)) >>> 0;
  }
  return LAYER_COLORS[hash % LAYER_COLORS.length] ?? 0x4a90d9;
}

interface LayerCache {
  container: Container;
  rect: Graphics;
  label: Text;
}

/**
 * PreviewCompositor — renders RenderFrames to a PixiJS canvas.
 *
 * Usage:
 *   const compositor = new PreviewCompositor({ width: 1920, height: 1080 });
 *   await compositor.init();
 *   compositor.setProject(projectDocument);
 *   compositor.seekTo(42); // renders frame 42
 *   // Later: compositor.dispose();
 *
 * This class is NOT a React component. A thin <PreviewCanvas> adapter
 * in @rough-cut/ui will mount the compositor's canvas element.
 */
export class PreviewCompositor {
  private app: Application | null = null;
  private project: ProjectDocument | null = null;
  private currentFrame = 0;
  private state: CompositorState = 'idle';
  private config: Required<CompositorConfig>;
  private events: CompositorEvents;
  private layerContainer: Container | null = null;
  private initialized = false;

  // Layer cache — reuse PixiJS objects to avoid GC pressure at 60fps
  private layerCache: Map<string, LayerCache> = new Map();

  constructor(config: CompositorConfig = {}, events: CompositorEvents = {}) {
    this.config = {
      canvas: config.canvas ?? (undefined as unknown as HTMLCanvasElement),
      width: config.width ?? 1920,
      height: config.height ?? 1080,
      backgroundColor: config.backgroundColor ?? '#000000',
    };
    this.events = events;

    // Ensure effects are registered
    registerBuiltinEffects();
  }

  /** Initialize the PixiJS application. Must be called before rendering. */
  async init(): Promise<HTMLCanvasElement> {
    const initOptions: Record<string, unknown> = {
      width: this.config.width,
      height: this.config.height,
      background: this.config.backgroundColor,
      antialias: true,
      autoDensity: true,
    };

    if (this.config.canvas) {
      initOptions['canvas'] = this.config.canvas;
    }

    this.app = new Application();
    await this.app.init(initOptions);

    // Create a dedicated container for all timeline layers
    this.layerContainer = new Container();
    this.app.stage.addChild(this.layerContainer);

    this.initialized = true;
    this.setState('idle');

    // If setProject was called before init finished, render now
    if (this.project) {
      this.renderCurrentFrame();
    }

    return this.app.canvas as HTMLCanvasElement;
  }

  /** Get the canvas element (for mounting in React via ref) */
  getCanvas(): HTMLCanvasElement | null {
    return (this.app?.canvas as HTMLCanvasElement | undefined) ?? null;
  }

  /** Set the project document. Call whenever the project changes. */
  setProject(project: ProjectDocument): void {
    this.project = project;

    // Only touch the renderer if init() has completed
    if (this.initialized && this.app?.renderer) {
      const { width, height } = project.settings.resolution;
      this.app.renderer.resize(width, height);
      this.renderCurrentFrame();
    }
    // If not initialized yet, renderCurrentFrame will be called when init() finishes
  }

  /** Seek to a specific frame and render it */
  seekTo(frame: number): void {
    this.currentFrame = frame;
    this.renderCurrentFrame();
  }

  /** Get current frame number */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /** Get compositor state */
  getState(): CompositorState {
    return this.state;
  }

  /** Resize the compositor canvas */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.app?.renderer.resize(width, height);
  }

  /** Clean up PixiJS resources */
  dispose(): void {
    this.setState('disposed');
    this.layerCache.clear();
    this.layerContainer?.destroy({ children: true });
    this.layerContainer = null;
    this.app?.destroy();
    this.app = null;
  }

  private setState(next: CompositorState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }

  /** Render the current frame using resolveFrame + PixiJS */
  private renderCurrentFrame(): void {
    if (!this.initialized || !this.app || !this.project) return;

    const renderFrame = resolveFrame(this.project, this.currentFrame);
    this.renderRenderFrame(renderFrame);
    this.events.onFrameRendered?.(this.currentFrame);
  }

  /** Render a RenderFrame to the PixiJS stage */
  private renderRenderFrame(frame: RenderFrame): void {
    if (!this.layerContainer) return;

    // Track which clipIds are active this frame so we can evict stale cache entries
    const activeClipIds = new Set<string>();

    for (const layer of frame.layers) {
      activeClipIds.add(layer.clipId);
      this.renderLayer(layer, frame.width, frame.height);
    }

    // Remove cached objects for layers no longer active
    for (const [clipId, cached] of this.layerCache) {
      if (!activeClipIds.has(clipId)) {
        this.layerContainer.removeChild(cached.container);
        cached.container.destroy({ children: true });
        this.layerCache.delete(clipId);
      }
    }

    // Camera transform temporarily neutralized — verify basic framing first.
    // TODO: Re-enable once placeholder centering and stage sizing are confirmed.
    // if (frame.cameraTransform && this.layerContainer) {
    //   const { scale, offsetX, offsetY } = frame.cameraTransform;
    //   this.layerContainer.scale.set(scale);
    //   this.layerContainer.position.set(
    //     (this.config.width / 2) * (1 - scale) + offsetX,
    //     (this.config.height / 2) * (1 - scale) + offsetY,
    //   );
    // }
  }

  private renderLayer(layer: RenderLayer, frameWidth: number, frameHeight: number): void {
    if (!this.layerContainer) return;

    const { clipId, transform, effects } = layer;

    // Compute display size — use 80% of frame as placeholder rect size, centered
    const rectW = Math.round(frameWidth * 0.8);
    const rectH = Math.round(frameHeight * 0.8);

    let cached = this.layerCache.get(clipId);

    if (!cached) {
      // First time we see this clip — create PixiJS objects
      const container = new Container();
      const rect = new Graphics();
      const labelStyle = new TextStyle({
        fontSize: 14,
        fill: 0xffffff,
        fontFamily: 'monospace',
        wordWrap: false,
      });
      const label = new Text({ text: clipId, style: labelStyle });

      label.anchor.set(0.5, 0.5);

      container.addChild(rect);
      container.addChild(label);
      this.layerContainer.addChild(container);

      cached = { container, rect, label };
      this.layerCache.set(clipId, cached);
    }

    const { container, rect, label } = cached;

    // Position at frame center (pivot is already at rect center via anchorX/Y)
    container.position.set(frameWidth / 2 + transform.x, frameHeight / 2 + transform.y);
    container.scale.set(transform.scaleX, transform.scaleY);
    container.pivot.set(transform.anchorX * rectW, transform.anchorY * rectH);
    container.rotation = (transform.rotation * Math.PI) / 180;
    container.alpha = Math.max(0, Math.min(1, transform.opacity));

    // Apply z-order: higher trackIndex = rendered on top
    container.zIndex = layer.trackIndex;
    this.layerContainer.sortableChildren = true;

    // Determine opacity from effects (e.g. a hypothetical opacity effect)
    let effectOpacity = 1;
    for (const effect of effects) {
      if (effect.enabled && effect.effectType === 'opacity') {
        const v = effect.params['opacity'];
        if (typeof v === 'number') effectOpacity = v;
      }
    }
    container.alpha = Math.max(0, Math.min(1, transform.opacity * effectOpacity));

    // Redraw the colored rectangle
    const color = colorForClipId(clipId);
    rect.clear();
    rect
      .rect(0, 0, rectW, rectH)
      .fill({ color, alpha: 0.85 })
      .stroke({ color: 0xffffff, width: 2, alpha: 0.5 });

    // Update label text and position to center of rect
    label.text = clipId;
    label.position.set(rectW / 2, rectH / 2);
  }
}
