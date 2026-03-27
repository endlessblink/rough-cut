// Branded ID types — nominal typing via intersection with a branded tag
export type ProjectId = string & { readonly __brand: 'ProjectId' };
export type AssetId = string & { readonly __brand: 'AssetId' };
export type TrackId = string & { readonly __brand: 'TrackId' };
export type ClipId = string & { readonly __brand: 'ClipId' };
export type EffectId = string & { readonly __brand: 'EffectId' };
export type TransitionId = string & { readonly __brand: 'TransitionId' };
export type PresetId = string & { readonly __brand: 'PresetId' };

/**
 * All temporal values in the project model are integer frame numbers.
 * This is a documentation alias — at runtime it's just `number`.
 */
export type Frame = number;

// Union types
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';
export type AssetType = 'video' | 'audio' | 'image' | 'recording';
export type TrackType = 'video' | 'audio';
export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type ExportCodec = 'h264' | 'h265' | 'vp9';
export type FrameRate = 24 | 30 | 60;
export type SampleRate = 44100 | 48000;

// Interfaces

export interface Resolution {
  readonly width: number;
  readonly height: number;
}

export interface BackgroundConfig {
  readonly type: 'solid' | 'gradient';
  readonly color: string;
  readonly gradientStart?: string;
  readonly gradientEnd?: string;
  readonly gradientAngle?: number;
}

export interface ProjectSettings {
  readonly resolution: Resolution;
  readonly frameRate: FrameRate;
  readonly backgroundColor: string;
  readonly sampleRate: SampleRate;
  readonly backgroundConfig?: BackgroundConfig;
}

export type ZoomMarkerId = string & { readonly __brand: 'ZoomMarkerId' };

export interface ZoomMarker {
  readonly id: ZoomMarkerId;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly kind: 'auto' | 'manual';
  readonly strength: number; // 0–1
}

export interface ZoomPresentation {
  readonly autoIntensity: number; // 0–1
  readonly markers: readonly ZoomMarker[];
}

export type CursorStyle = 'subtle' | 'default' | 'spotlight';
export type ClickEffect = 'none' | 'ripple' | 'ring';

export interface CursorPresentation {
  readonly style: CursorStyle;
  readonly clickEffect: ClickEffect;
  readonly sizePercent: number; // 50–150
  readonly clickSoundEnabled: boolean;
}

export type CameraShape = 'circle' | 'rounded' | 'square';

export interface CameraPresentation {
  readonly shape: CameraShape;
  readonly roundness: number;
  readonly size: number;
  readonly visible: boolean;
}

export interface RecordingPresentation {
  readonly zoom: ZoomPresentation;
  readonly cursor: CursorPresentation;
  readonly camera: CameraPresentation;
  // highlights, titles to be added later
}

export interface Asset {
  readonly id: AssetId;
  readonly type: AssetType;
  readonly filePath: string;
  readonly duration: Frame;
  readonly metadata: Record<string, unknown>;
  readonly thumbnailPath?: string;
  readonly presentation?: RecordingPresentation;
}

export interface ClipTransform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly opacity: number;
}

export interface Tangent {
  readonly inX: number;
  readonly inY: number;
  readonly outX: number;
  readonly outY: number;
}

export interface Keyframe {
  readonly frame: Frame;
  readonly value: number | string;
  readonly easing: EasingType;
  readonly tangent?: Tangent;
}

export interface KeyframeTrack {
  readonly property: string;
  readonly keyframes: readonly Keyframe[];
}

export interface EffectInstance {
  readonly id: EffectId;
  readonly effectType: string;
  readonly enabled: boolean;
  readonly params: Record<string, unknown>;
  readonly keyframes: readonly KeyframeTrack[];
}

export interface Clip {
  readonly id: ClipId;
  readonly assetId: AssetId;
  readonly trackId: TrackId;
  readonly name?: string;
  readonly enabled: boolean;
  readonly timelineIn: Frame;
  readonly timelineOut: Frame;
  readonly sourceIn: Frame;
  readonly sourceOut: Frame;
  readonly transform: ClipTransform;
  readonly effects: readonly EffectInstance[];
  readonly keyframes: readonly KeyframeTrack[];
}

export interface Track {
  readonly id: TrackId;
  readonly type: TrackType;
  readonly name: string;
  readonly index: number;
  readonly locked: boolean;
  readonly visible: boolean;
  readonly volume: number;
  readonly clips: readonly Clip[];
}

export interface Transition {
  readonly id: TransitionId;
  readonly type: string;
  readonly clipAId: ClipId;
  readonly clipBId: ClipId;
  readonly duration: Frame;
  readonly params: Record<string, unknown>;
  readonly easing: EasingType;
}

export interface Composition {
  readonly duration: Frame;
  readonly tracks: readonly Track[];
  readonly transitions: readonly Transition[];
}

export interface MotionPreset {
  readonly id: PresetId;
  readonly name: string;
  readonly keyframeTracks: readonly KeyframeTrack[];
  readonly category: string;
}

export interface ExportSettings {
  readonly format: ExportFormat;
  readonly codec: ExportCodec;
  readonly bitrate: number;
  readonly resolution: Resolution;
  readonly frameRate: number;
}

export interface ProjectDocument {
  readonly version: number;
  readonly id: ProjectId;
  readonly name: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly settings: ProjectSettings;
  readonly assets: readonly Asset[];
  readonly composition: Composition;
  readonly motionPresets: readonly MotionPreset[];
  readonly exportSettings: ExportSettings;
}
