import type { ClipId, TrackId, AssetId, CursorStyle, ClickEffect, RegionCrop } from '@rough-cut/project-model';
import type { ResolvedParams } from '@rough-cut/effect-registry';

/**
 * A single layer to render — one per active clip, z-ordered.
 * Contains everything a renderer needs to draw this layer.
 */
export interface RenderLayer {
  /** Which clip produced this layer */
  clipId: ClipId;
  /** Track this clip belongs to (for z-ordering) */
  trackId: TrackId;
  /** Track z-order index (higher = on top) */
  trackIndex: number;
  /** Source asset ID (renderer uses this to load the video/image) */
  assetId: AssetId;
  /** Which frame of the SOURCE media to decode */
  sourceFrame: number;
  /** Resolved transform at this frame (after keyframe interpolation) */
  transform: ResolvedTransform;
  /** Resolved effect params, keyed by effectType → ResolvedParams */
  effects: ResolvedEffect[];
}

/**
 * Transform values after keyframe interpolation.
 * Same fields as ClipTransform but potentially animated.
 */
export interface ResolvedTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
  opacity: number;
}

/**
 * An effect with its params resolved at the current frame.
 */
export interface ResolvedEffect {
  effectType: string;
  enabled: boolean;
  params: ResolvedParams;
}

/**
 * Active transition at the current frame.
 */
export interface ActiveTransition {
  type: string;
  /** Progress through the transition, 0 to 1 */
  progress: number;
  /** Params for the transition */
  params: Record<string, unknown>;
  /** The two clips being blended */
  clipAId: ClipId;
  clipBId: ClipId;
}

/**
 * Camera transform derived from zoom presentation.
 * Applied to the recording layer in the renderer.
 */
export interface CameraTransform {
  /** Zoom scale factor. 1 = no zoom. */
  scale: number;
  /** Horizontal offset in normalized units. 0 = centered. */
  offsetX: number;
  /** Vertical offset in normalized units. 0 = centered. */
  offsetY: number;
}

/**
 * Resolved cursor presentation for the current frame.
 * The renderer uses this to style the cursor overlay.
 */
export interface ResolvedCursorPresentation {
  style: CursorStyle;
  clickEffect: ClickEffect;
  sizePercent: number;
  clickSoundEnabled: boolean;
}

/**
 * Complete render description for a single frame.
 * Both preview and export renderers consume this.
 */
export interface RenderFrame {
  /** The timeline frame number */
  frame: number;
  /** Project resolution */
  width: number;
  height: number;
  /** Background color */
  backgroundColor: string;
  /** Layers to render, sorted by z-order (index 0 = bottom) */
  layers: RenderLayer[];
  /** Active transitions at this frame */
  transitions: ActiveTransition[];
  /** Camera transform from zoom presentation (recording-level) */
  cameraTransform: CameraTransform;
  /** Cursor presentation settings (recording-level) */
  cursor: ResolvedCursorPresentation;
  /** Screen crop viewport (recording-level, source pixel coordinates) */
  screenCrop?: RegionCrop;
}
