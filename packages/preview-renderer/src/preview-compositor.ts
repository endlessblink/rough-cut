import 'pixi.js/unsafe-eval';
import {
  Application,
  Graphics,
  Text,
  Container,
  TextStyle,
  Sprite,
  Texture,
  VideoSource,
  CanvasSource,
  BlurFilter,
  Filter,
} from 'pixi.js';
import type { ProjectDocument, Asset, RegionCrop } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { registerBuiltinEffects } from '@rough-cut/effect-registry';
import type { RenderFrame, RenderLayer } from '@rough-cut/frame-resolver';
import type { CompositorConfig, CompositorState, CompositorEvents } from './types.js';
import { CameraFrameDecoder } from './camera-frame-decoder.js';
import { MediaBunnyVideoScrubber } from './media-bunny-video-scrubber.js';

let videoSourceCspPatchApplied = false;

function applyVideoSourceCspPatch(): void {
  if (videoSourceCspPatchApplied) return;
  videoSourceCspPatchApplied = true;

  const proto = VideoSource.prototype as unknown as {
    load: () => Promise<unknown>;
    _load: Promise<unknown> | null;
    resource: HTMLVideoElement;
    options: { preload?: boolean; preloadTimeoutMs?: number };
    _onPlayStart: () => void;
    _onPlayStop: () => void;
    _onSeeked: () => void;
    _onCanPlay: () => void;
    _onCanPlayThrough: () => void;
    _onError: (event: Event) => void;
    _isSourceReady: () => boolean;
    _mediaReady: () => void;
    isValid: boolean;
    _resolve: ((value: unknown) => void) | null;
    _reject: ((reason?: unknown) => void) | null;
    _preloadTimeout?: ReturnType<typeof setTimeout>;
    alphaMode: string;
  };

  proto.load = async function patchedVideoSourceLoad() {
    if (this._load) {
      return this._load;
    }

    const source = this.resource;
    const options = this.options;
    if (
      (source.readyState === source.HAVE_ENOUGH_DATA || source.readyState === source.HAVE_FUTURE_DATA) &&
      source.width &&
      source.height
    ) {
      (source as HTMLVideoElement & { complete?: boolean }).complete = true;
    }

    source.addEventListener('play', this._onPlayStart);
    source.addEventListener('pause', this._onPlayStop);
    source.addEventListener('seeked', this._onSeeked);

    if (!this._isSourceReady()) {
      if (!options.preload) {
        source.addEventListener('canplay', this._onCanPlay);
      }
      source.addEventListener('canplaythrough', this._onCanPlayThrough);
      source.addEventListener('error', this._onError, true);
    } else {
      this._mediaReady();
    }

    // Pixi's default load() always probes a base64-encoded WebM via
    // detectVideoAlphaMode(), which violates this app's strict CSP. We already
    // force alphaMode explicitly on all preview VideoSource instances, so keep
    // that value and skip the probe entirely.
    this._load = new Promise((resolve, reject) => {
      if (this.isValid) {
        resolve(this);
      } else {
        this._resolve = resolve;
        this._reject = reject;
        if (options.preloadTimeoutMs !== undefined) {
          this._preloadTimeout = setTimeout(() => {
            this._onError(new ErrorEvent(`Preload exceeded timeout of ${options.preloadTimeoutMs}ms`));
          });
        }
        source.load();
      }
    });

    return this._load;
  };
}

applyVideoSourceCspPatch();

/** Color palette for layer placeholders — cycled deterministically by clipId hash */
const LAYER_COLORS = [
  0x4a90d9, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x3498db, 0xe91e63,
  0x00bcd4,
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
  videoSprite?: Sprite;
  roundCornersMask?: Graphics;
  circleMask?: Graphics; // circular mask for camera PiP
  lastEffectKey?: string; // serialized effect params for dirty check
  lastEffectOpacity?: number; // cached computed opacity from effects
}

interface VideoCache {
  video: HTMLVideoElement;
  texture: Texture | null;
  scrubTexture: Texture | null;
  scrubber: MediaBunnyVideoScrubber | null;
  loaded: boolean;
  lastSeekTime: number;
  lastScrubSourceFrame: number;
  pendingScrubSourceFrame: number | null;
}

/**
 * PreviewCompositor — renders RenderFrames to a PixiJS canvas.
 *
 * Supports two rendering modes per layer:
 * - Video-backed: uses HTMLVideoElement + PixiJS Texture for real frame preview
 * - Placeholder: colored rectangles with clip IDs (fallback)
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
  private lastRenderedFrame = -1;
  private lastRenderedProject: ProjectDocument | null = null;
  private _playing = false;
  private lastLoggedPrimaryPlaybackAssetId: string | null = null;
  private preferredPlaybackAssetId: string | null = null;
  private cursorDataByAssetId: Map<string, { frames: Float32Array; frameCount: number }> =
    new Map();

  // Layer cache — reuse PixiJS objects to avoid GC pressure at 60fps
  private layerCache: Map<string, LayerCache> = new Map();

  // Video element cache — one per asset, reused across frames
  private videoCache: Map<string, VideoCache> = new Map();

  // Camera decoder cache — WebCodecs-based, frame-locked to screen
  private cameraDecoders: Map<
    string,
    {
      decoder: CameraFrameDecoder;
      texture: Texture | null;
      canvas: HTMLCanvasElement | null;
      ctx: CanvasRenderingContext2D | null;
      ready: boolean;
      lastDecodedTime: number;
    }
  > = new Map();

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
      autoStart: false,
      autoDensity: false,
      resolution: 1,
    };

    if (this.config.canvas) {
      initOptions['canvas'] = this.config.canvas;
    }

    this.app = new Application();
    await this.app.init(initOptions);
    this.app.ticker?.stop();

    // Create a dedicated container for all timeline layers
    this.layerContainer = new Container();
    this.app.stage.addChild(this.layerContainer);

    this.initialized = true;
    this.setState('idle');

    // If setProject was called before init finished, render now
    if (this.project) {
      this.renderCurrentFrame(true);
    }

    return this.app.canvas as HTMLCanvasElement;
  }

  /** Get the canvas element (for mounting in React via ref) */
  getCanvas(): HTMLCanvasElement | null {
    return (this.app?.canvas as HTMLCanvasElement | undefined) ?? null;
  }

  /** Set the project document. Call whenever the project changes. */
  setProject(project: ProjectDocument): void {
    const prevProjectId = this.project?.id;
    const newProjectId = project.id;

    this.project = project;

    // When switching to a different project, clear stale video/layer caches
    if (prevProjectId && newProjectId && prevProjectId !== newProjectId) {
      for (const vc of this.videoCache.values()) {
        vc.video.pause();
        vc.video.src = '';
        vc.texture?.destroy();
        vc.scrubTexture?.destroy();
        vc.scrubber?.dispose();
      }
      this.videoCache.clear();
      for (const entry of this.cameraDecoders.values()) {
        entry.decoder.dispose();
        entry.texture?.destroy();
      }
      this.cameraDecoders.clear();
      if (this.layerContainer) {
        for (const [, cached] of this.layerCache) {
          this.layerContainer.removeChild(cached.container);
          cached.container.destroy({ children: true });
        }
        this.layerCache.clear();
      }
    }

    // Only touch the renderer if init() has completed.
    // NOTE: Do NOT resize to project.settings.resolution — that reflects the
    // template card shape (e.g. 1080x1080 for square).  The compositor always
    // renders at source recording resolution (1920x1080).  CSS scaling handles
    // the display fit.
    if (this.initialized && this.app?.renderer) {
      this.renderCurrentFrame(true);
    }
  }

  /** Start native video playback — HTMLVideoElement.play() drives timing */
  play(): void {
    this._playing = true;
    const fps = this.project?.settings.frameRate ?? 30;
    for (const [assetId, vc] of this.videoCache.entries()) {
      if (vc.loaded && vc.video.readyState >= 2) {
        vc.video.currentTime =
          this.resolveMediaTimeForAsset(assetId, this.currentFrame) ?? this.currentFrame / fps;
        // Play while still muted, then unmute on success. Chromium always
        // allows muted play(); an unmuted play() can fail if the user gesture
        // was lost through async awaits in PlaybackManager._beginPlayback.
        const video = vc.video;
        video
          .play()
          .then(() => {
            video.muted = false;
          })
          .catch((e) => {
            console.error('[compositor] play() FAILED:', e);
          });
        if (vc.texture?.source) {
          (vc.texture.source as VideoSource).autoUpdate = true;
        }
      }
    }
  }

  /** Pause native video playback — return to frame-accurate seeking mode */
  pause(): void {
    this._playing = false;
    for (const vc of this.videoCache.values()) {
      vc.video.pause();
      if (vc.texture?.source) {
        (vc.texture.source as VideoSource).autoUpdate = false;
      }
    }
  }

  /** Get the current playback time from the first loaded video element */
  getVideoCurrentTime(): number {
    const activeVideo = this.getPrimaryPlaybackVideoCache();
    if (activeVideo?.video.loaded && activeVideo.video.video.readyState >= 2) {
      return activeVideo.video.video.currentTime;
    }

    return -1;
  }

  /** Map native video playback back to the project timeline frame. */
  getPlaybackFrame(): number {
    const fps = this.project?.settings.frameRate ?? 30;
    const primaryPlayback = this.getPrimaryPlaybackVideoCache();
    if (primaryPlayback?.video.loaded && primaryPlayback.video.video.readyState >= 2) {
      const sourceFrame = Math.round(primaryPlayback.video.video.currentTime * fps);
      return this.resolveTimelineFrameForAsset(primaryPlayback.assetId, sourceFrame) ?? sourceFrame;
    }

    return -1;
  }

  /** Check if native video playback is active */
  isPlayingNative(): boolean {
    return this._playing;
  }

  /** Detect native playback completion from the compositor-owned media elements. */
  hasPlaybackEnded(): boolean {
    return this.getPrimaryPlaybackVideoCache()?.video.video.ended ?? false;
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
    // PixiJS overwrites inline styles after renderer.resize(); re-assert !important fill.
    const canvas = this.app?.canvas as HTMLCanvasElement | undefined;
    if (canvas?.style) {
      canvas.style.cssText =
        'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;display:block !important;';
    }
    this.renderCurrentFrame(true);
  }

  setPreferredPlaybackAssetId(assetId: string | null): void {
    this.preferredPlaybackAssetId = assetId;
  }

  setCursorFrameData(
    assetId: string,
    cursorData: { frames: Float32Array; frameCount: number } | null,
  ): void {
    if (!cursorData) {
      this.cursorDataByAssetId.delete(assetId);
    } else {
      this.cursorDataByAssetId.set(assetId, cursorData);
    }
    this.renderCurrentFrame(true);
  }

  /** Clean up PixiJS resources */
  dispose(): void {
    this.pause();
    this.setState('disposed');
    this.layerCache.clear();
    // Clean up video elements
    for (const vc of this.videoCache.values()) {
      vc.video.pause();
      vc.video.src = '';
      vc.texture?.destroy();
      vc.scrubTexture?.destroy();
      vc.scrubber?.dispose();
    }
    this.videoCache.clear();
    for (const entry of this.cameraDecoders.values()) {
      entry.decoder.dispose();
      entry.texture?.destroy();
    }
    this.cameraDecoders.clear();
    this.layerContainer?.destroy({ children: true });
    this.layerContainer = null;
    this.app?.destroy();
    this.app = null;
    this.lastRenderedFrame = -1;
    this.lastRenderedProject = null;
  }

  private setState(next: CompositorState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }

  /** Render the current frame using resolveFrame + PixiJS */
  private renderCurrentFrame(force = false): void {
    if (!this.initialized || !this.app || !this.project) return;
    if (
      !force &&
      this.lastRenderedFrame === this.currentFrame &&
      this.lastRenderedProject === this.project
    ) {
      return;
    }

    const renderFrame = resolveFrame(this.project, this.currentFrame, {
      getCursorPosition: (assetId, sourceFrame) => {
        const data = this.cursorDataByAssetId.get(assetId);
        if (!data) return null;
        const frame = Math.max(0, Math.min(sourceFrame, data.frameCount - 1));
        const idx = frame * 3;
        if (idx + 1 >= data.frames.length) return null;
        const x = data.frames[idx] ?? -1;
        const y = data.frames[idx + 1] ?? -1;
        if (x < 0 || y < 0) return null;
        return { x, y };
      },
    });
    this.renderRenderFrame(renderFrame);
    this.app.render();
    this.lastRenderedFrame = this.currentFrame;
    this.lastRenderedProject = this.project;
    this.events.onFrameRendered?.(this.currentFrame);
  }

  /** Render a RenderFrame to the PixiJS stage */
  private renderRenderFrame(frame: RenderFrame): void {
    if (!this.layerContainer) return;

    // Track which clipIds are active this frame so we can evict stale cache entries
    const activeClipIds = new Set<string>();

    // Use the compositor's own canvas dimensions for sprite sizing, not the
    // RenderFrame's dimensions.  RenderFrame.width/height reflect the project's
    // template resolution (e.g. 1080×1080 for a square card), but the preview
    // compositor always renders at source recording resolution (1920×1080).
    for (const layer of frame.layers) {
      activeClipIds.add(layer.clipId);
      this.renderLayer(layer, this.config.width, this.config.height, frame.screenCrop);
    }

    // Remove cached objects for layers no longer active
    for (const [clipId, cached] of this.layerCache) {
      if (!activeClipIds.has(clipId)) {
        this.layerContainer.removeChild(cached.container);
        cached.container.destroy({ children: true });
        this.layerCache.delete(clipId);
      }
    }

    // Apply camera transform from zoom presentation
    if (frame.cameraTransform && this.layerContainer) {
      const { scale, offsetX, offsetY } = frame.cameraTransform;
      this.layerContainer.scale.set(scale);
      this.layerContainer.position.set(
        (this.config.width / 2) * (1 - scale) + offsetX,
        (this.config.height / 2) * (1 - scale) + offsetY,
      );
    }
  }

  /** Find asset by ID from the current project */
  private findAsset(assetId: string): Asset | undefined {
    return this.project?.assets.find((a) => a.id === assetId);
  }

  /** Get or create a video element + texture for an asset */
  private getOrCreateVideo(assetId: string, filePath: string): VideoCache {
    let vc = this.videoCache.get(assetId);
    if (vc) return vc;

    const video = document.createElement('video');
    const mediaSrc = `media://${filePath}`;
    video.src = mediaSrc;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true; // mute to allow autoplay
    video.playsInline = true;

    vc = {
      video,
      texture: null,
      scrubTexture: null,
      scrubber: null,
      loaded: false,
      lastSeekTime: -1,
      lastScrubSourceFrame: -1,
      pendingScrubSourceFrame: null,
    };

    // Once metadata is loaded, create the PixiJS texture
    video.addEventListener(
      'loadeddata',
      () => {
        if (!vc) return;
        try {
          const videoSource = new VideoSource({
            resource: video,
            autoPlay: false,
            alphaMode: 'premultiply-alpha-on-upload',
          });
          vc.texture = new Texture({ source: videoSource });
          vc.loaded = true;
          // If playback is active, auto-start this newly loaded video
          if (this._playing) {
            vc.video.currentTime =
              this.resolveMediaTimeForAsset(assetId, this.currentFrame) ??
              this.currentFrame / (this.project?.settings.frameRate ?? 30);
            const video = vc.video;
            video
              .play()
              .then(() => {
                video.muted = false;
              })
              .catch(() => {});
            videoSource.autoUpdate = true;
          }
          this.renderCurrentFrame(true);
        } catch {
          vc.loaded = false;
        }
      },
      { once: true },
    );

    video.addEventListener(
      'error',
      () => {
        console.warn(`[compositor] Failed to load video: ${filePath}`, video.error);
        if (vc) vc.loaded = false;
      },
      { once: true },
    );

    this.videoCache.set(assetId, vc);
    return vc;
  }

  // Camera rendering is handled by CameraPlaybackCanvas (React template slot).
  // The compositor no longer decodes camera frames — it skips camera layers in renderLayer().

  private renderLayer(
    layer: RenderLayer,
    frameWidth: number,
    frameHeight: number,
    screenCrop?: RegionCrop,
  ): void {
    if (!this.layerContainer) return;

    const { clipId, assetId, sourceFrame, transform, effects } = layer;

    // Try to resolve the asset for video rendering
    const asset = this.findAsset(assetId);
    const fps = this.project?.settings.frameRate ?? 30;

    // Check if this asset has a video file we can display
    const isVideoAsset =
      asset && (asset.type === 'recording' || asset.type === 'video') && asset.filePath;
    const isCamera = !!(asset?.metadata as Record<string, unknown> | undefined)?.isCamera;
    let videoCache: VideoCache | null = null;

    if (isVideoAsset && asset.filePath && isCamera) {
      // Camera rendering is handled by CameraPlaybackCanvas in the React template slot.
      // The compositor skips camera layers entirely — return early.
      return;
    } else if (isVideoAsset && asset.filePath) {
      // Screen/other video: HTMLVideoElement path (unchanged)
      videoCache = this.getOrCreateVideo(assetId, asset.filePath);

      // Native video playback stays on the HTMLVideoElement path. Paused scrubbing
      // requests an exact decoded frame through MediaBunny to avoid seek drift.
      if (videoCache.loaded && videoCache.video.readyState >= 2) {
        if (!this._playing) {
          const targetTime = sourceFrame / fps;
          if (Math.abs(videoCache.video.currentTime - targetTime) > 0.02) {
            videoCache.video.currentTime = targetTime;
            videoCache.lastSeekTime = targetTime;
          }
          this.requestAccurateVideoFrame(videoCache, asset.filePath, sourceFrame, fps);
          if (videoCache.lastScrubSourceFrame !== sourceFrame && videoCache.texture?.source) {
            (videoCache.texture.source as VideoSource).update();
          }
        }
        // During playback: autoUpdate handles texture upload, no seeking needed
      }
    }

    // Decide: render video sprite or placeholder
    const activeTexture =
      !this._playing && videoCache?.lastScrubSourceFrame === sourceFrame && videoCache.scrubTexture
        ? videoCache.scrubTexture
        : videoCache?.texture;
    const useVideo = !!(videoCache?.loaded && activeTexture);

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

    if (useVideo && activeTexture) {
      // ── Video-backed rendering ──
      // Hide placeholder rect and label
      rect.visible = false;
      label.visible = false;

      // Create or update video sprite
      if (!cached.videoSprite) {
        const sprite = new Sprite(activeTexture);
        container.addChild(sprite);
        cached.videoSprite = sprite;
      } else {
        cached.videoSprite.texture = activeTexture;
      }

      const sprite = cached.videoSprite;
      sprite.visible = true;

      if (!isCamera && screenCrop) {
        // Crop: scale sprite up so the crop region fills the frame,
        // then offset so the crop top-left aligns with the frame origin.
        // screenCrop applies only to screen/non-camera layers.
        const sourceW = videoCache!.video.videoWidth || frameWidth;
        const sourceH = videoCache!.video.videoHeight || frameHeight;
        const cropScale = sourceW / screenCrop.width;
        sprite.width = frameWidth * cropScale;
        sprite.height = frameHeight * cropScale;
        sprite.x = -(screenCrop.x / sourceW) * sprite.width;
        sprite.y = -(screenCrop.y / sourceH) * sprite.height;
      } else {
        // No crop (camera layers never crop, screen layers with no crop): fill the frame
        sprite.width = frameWidth;
        sprite.height = frameHeight;
        sprite.x = 0;
        sprite.y = 0;
      }

      // Position: anchor point in the frame + user offset.
      // pivot places the anchor point of the sprite at the container's position.
      container.position.set(
        transform.anchorX * frameWidth + transform.x,
        transform.anchorY * frameHeight + transform.y,
      );
      container.scale.set(transform.scaleX, transform.scaleY);
      container.pivot.set(transform.anchorX * frameWidth, transform.anchorY * frameHeight);
    } else {
      // ── Placeholder rendering ──
      rect.visible = true;
      label.visible = true;
      if (cached.videoSprite) cached.videoSprite.visible = false;

      const rectW = Math.round(frameWidth * 0.8);
      const rectH = Math.round(frameHeight * 0.8);

      // Center the placeholder in the frame
      const centerX = (frameWidth - rectW) / 2;
      const centerY = (frameHeight - rectH) / 2;
      container.position.set(
        centerX + transform.anchorX * rectW + transform.x,
        centerY + transform.anchorY * rectH + transform.y,
      );
      container.scale.set(transform.scaleX, transform.scaleY);
      container.pivot.set(transform.anchorX * rectW, transform.anchorY * rectH);

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

    container.rotation = (transform.rotation * Math.PI) / 180;

    // Apply z-order
    container.zIndex = layer.trackIndex;
    this.layerContainer!.sortableChildren = true;

    // ── Effect rendering ──────────────────────────────────────────────
    // Build a cache key from the enabled effects so we can skip the
    // destroy+rebuild cycle when nothing has changed between frames.
    // For round-corners we also include the mask target dimensions so
    // that resizing the sprite correctly invalidates the cached mask.
    const roundCornersEffect = effects.find((e) => e.enabled && e.effectType === 'round-corners');
    let maskDimSuffix = '';
    if (roundCornersEffect) {
      const maskTarget = cached.videoSprite?.visible ? cached.videoSprite : rect;
      maskDimSuffix = `|mask:${maskTarget.width}x${maskTarget.height}`;
    }
    const effectKey =
      effects
        .filter((e) => e.enabled)
        .map((e) => `${e.effectType}:${JSON.stringify(e.params)}`)
        .join('|') + maskDimSuffix;

    if (effectKey === cached.lastEffectKey) {
      // Effects unchanged — only update opacity in case keyframes changed it
      container.alpha = Math.max(
        0,
        Math.min(1, transform.opacity * (cached.lastEffectOpacity ?? 1)),
      );
      return;
    }

    // Effects changed — invalidate key before rebuild so a mid-rebuild error
    // doesn't leave a stale key in place
    cached.lastEffectKey = undefined;

    // Clear previous effects before rebuilding
    container.filters = null;
    if (cached.roundCornersMask) {
      container.mask = null;
      container.removeChild(cached.roundCornersMask);
      cached.roundCornersMask.destroy();
      cached.roundCornersMask = undefined;
    }

    const filters: Filter[] = [];
    let effectOpacity = 1;

    for (const effect of effects) {
      if (!effect.enabled) continue;

      switch (effect.effectType) {
        case 'gaussian-blur': {
          const radius = (effect.params['radius'] as number) ?? 5;
          const qualityStr = (effect.params['quality'] as string) ?? 'medium';
          const quality = qualityStr === 'low' ? 2 : qualityStr === 'high' ? 8 : 4;
          filters.push(new BlurFilter({ strength: radius, quality }));
          break;
        }
        case 'round-corners': {
          const cornerRadius = (effect.params['radius'] as number) ?? 12;
          // Apply rounded-corner mask to the content sprite or placeholder rect
          const maskTarget = cached.videoSprite?.visible ? cached.videoSprite : rect;
          const maskW = maskTarget.width;
          const maskH = maskTarget.height;
          if (maskW > 0 && maskH > 0) {
            const mask = new Graphics();
            mask.roundRect(0, 0, maskW, maskH, cornerRadius).fill({ color: 0xffffff });
            // Position mask at the same local position as the sprite/rect
            mask.position.set(maskTarget.x, maskTarget.y);
            container.addChild(mask);
            container.mask = mask;
            cached.roundCornersMask = mask;
          }
          break;
        }
        case 'opacity': {
          const v = effect.params['opacity'];
          if (typeof v === 'number') effectOpacity = v;
          break;
        }
        // 'shadow' — requires @pixi/filter-drop-shadow (not installed).
        // Skip silently until the dependency is added.
        default:
          break;
      }
    }

    container.filters = filters.length > 0 ? filters : null;
    container.alpha = Math.max(0, Math.min(1, transform.opacity * effectOpacity));

    // Persist the key and opacity so the next frame can skip the rebuild
    cached.lastEffectKey = effectKey;
    cached.lastEffectOpacity = effectOpacity;

    // ── Camera circle mask ───────────────────────────────────────────
    // Apply circular clipping to camera PiP layers (replaces CSS borderRadius: 50%)
    if (isCamera && cached.videoSprite?.visible) {
      const spriteW = cached.videoSprite.width;
      const spriteH = cached.videoSprite.height;
      const radius = Math.min(spriteW, spriteH) / 2;

      if (!cached.circleMask) {
        const mask = new Graphics();
        mask.circle(spriteW / 2, spriteH / 2, radius).fill({ color: 0xffffff });
        mask.position.set(cached.videoSprite.x, cached.videoSprite.y);
        container.addChild(mask);
        container.mask = mask;
        cached.circleMask = mask;
      } else {
        // Update mask position/size if sprite changed
        cached.circleMask.clear();
        cached.circleMask.circle(spriteW / 2, spriteH / 2, radius).fill({ color: 0xffffff });
        cached.circleMask.position.set(cached.videoSprite.x, cached.videoSprite.y);
        container.mask = cached.circleMask;
      }
    } else if (!isCamera && cached.circleMask) {
      // Non-camera layer had a circle mask (shouldn't happen) — clean up
      container.mask = null;
      container.removeChild(cached.circleMask);
      cached.circleMask.destroy();
      cached.circleMask = undefined;
    }
  }

  private resolveMediaTimeForAsset(assetId: string, timelineFrame: number): number | null {
    if (!this.project) return null;

    const fps = this.project.settings.frameRate ?? 30;
    const renderFrame = resolveFrame(this.project, timelineFrame);
    const layer = renderFrame.layers.find((entry) => entry.assetId === assetId);
    return layer ? layer.sourceFrame / fps : null;
  }

  private resolveTimelineFrameForAsset(
    assetId: string,
    sourceFrame: number,
    hintFrame = this.currentFrame,
  ): number | null {
    if (!this.project) return null;

    let bestFrame: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const track of this.project.composition.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId !== assetId) continue;

        const clipDuration = clip.timelineOut - clip.timelineIn;
        const sourceStart = clip.sourceIn;
        const sourceEnd = clip.sourceIn + clipDuration;
        if (sourceFrame < sourceStart || sourceFrame >= sourceEnd) continue;

        const timelineFrame = clip.timelineIn + (sourceFrame - clip.sourceIn);
        const distance = Math.abs(timelineFrame - hintFrame);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestFrame = timelineFrame;
        }
      }
    }

    return bestFrame;
  }

  private getPrimaryPlaybackVideoCache(): { assetId: string; video: VideoCache } | null {
    if (!this.project) return null;

    const renderFrame = resolveFrame(this.project, this.currentFrame);
    const preferredLayer = this.preferredPlaybackAssetId
      ? renderFrame.layers.find((layer) => layer.assetId === this.preferredPlaybackAssetId)
      : null;
    const orderedLayers = preferredLayer
      ? [preferredLayer, ...renderFrame.layers.filter((layer) => layer !== preferredLayer)]
      : renderFrame.layers;
    for (const layer of orderedLayers) {
      const asset = this.findAsset(layer.assetId);
      const isPlayableVideo =
        asset &&
        (asset.type === 'recording' || asset.type === 'video') &&
        asset.filePath &&
        !(asset.metadata as Record<string, unknown> | undefined)?.isCamera;

      if (!isPlayableVideo) continue;

      const video = this.videoCache.get(layer.assetId);
      if (!video) continue;

      if (this.lastLoggedPrimaryPlaybackAssetId !== layer.assetId) {
        this.lastLoggedPrimaryPlaybackAssetId = layer.assetId;
        console.info('[PreviewCompositor] Primary playback asset selected', {
          assetId: layer.assetId,
          clipId: layer.clipId,
          sourceFrame: layer.sourceFrame,
          timelineFrame: this.currentFrame,
          filePath: asset.filePath,
          loaded: video.loaded,
          readyState: video.video.readyState,
        });
      }

      return { assetId: layer.assetId, video };
    }

    if (this.lastLoggedPrimaryPlaybackAssetId !== null) {
      this.lastLoggedPrimaryPlaybackAssetId = null;
      console.info('[PreviewCompositor] No primary playback asset for frame', this.currentFrame);
    }

    return null;
  }

  private requestAccurateVideoFrame(
    videoCache: VideoCache,
    filePath: string,
    sourceFrame: number,
    fps: number,
  ): void {
    if (videoCache.pendingScrubSourceFrame === sourceFrame) return;
    if (videoCache.lastScrubSourceFrame === sourceFrame) return;

    videoCache.pendingScrubSourceFrame = sourceFrame;
    videoCache.scrubber ??= new MediaBunnyVideoScrubber(filePath);

    void videoCache.scrubber.getFrameCanvas(sourceFrame / fps).then((canvas) => {
      if (!canvas) {
        if (videoCache.pendingScrubSourceFrame === sourceFrame) {
          videoCache.pendingScrubSourceFrame = null;
        }
        return;
      }
      if (videoCache.pendingScrubSourceFrame !== sourceFrame) return;

      videoCache.scrubTexture?.destroy();
      videoCache.scrubTexture = new Texture({ source: new CanvasSource({ resource: canvas }) });
      videoCache.lastScrubSourceFrame = sourceFrame;
      videoCache.pendingScrubSourceFrame = null;

      if (!this._playing) {
        this.renderCurrentFrame(true);
      }
    });
  }
}
