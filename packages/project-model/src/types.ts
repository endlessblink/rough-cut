// Branded ID types — nominal typing via intersection with a branded tag
export type ProjectId = string & { readonly __brand: 'ProjectId' };
export type LibraryId = string & { readonly __brand: 'LibraryId' };
export type AssetId = string & { readonly __brand: 'AssetId' };
export type TrackId = string & { readonly __brand: 'TrackId' };
export type ClipId = string & { readonly __brand: 'ClipId' };
export type EffectId = string & { readonly __brand: 'EffectId' };
export type TransitionId = string & { readonly __brand: 'TransitionId' };
export type PresetId = string & { readonly __brand: 'PresetId' };
export type LibrarySourceId = string & { readonly __brand: 'LibrarySourceId' };
export type LibraryTranscriptSegmentId = string & {
  readonly __brand: 'LibraryTranscriptSegmentId';
};
export type VisualAnalysisEntryId = string & { readonly __brand: 'VisualAnalysisEntryId' };

/**
 * All temporal values in the project model are integer frame numbers.
 * This is a documentation alias — at runtime it's just `number`.
 */
export type Frame = number;

// Cursor event types for recording sidecar data
export type CursorEventType = 'move' | 'down' | 'up' | 'scroll';
export type MouseButton = 0 | 1 | 2; // left | middle | right

// Union types
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';
export type AssetType = 'video' | 'audio' | 'image' | 'recording' | 'motion';
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

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
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
  readonly recordingDefaults?: RecordingPresentation;
  readonly destinationPresetId?: string | null;
}

export type ZoomMarkerId = string & { readonly __brand: 'ZoomMarkerId' };
export type CameraLayoutMarkerId = string & { readonly __brand: 'CameraLayoutMarkerId' };
export type RecordingVisibilitySegmentId = string & {
  readonly __brand: 'RecordingVisibilitySegmentId';
};

export interface ZoomFocalPoint {
  readonly x: number; // normalized 0–1 within source frame
  readonly y: number; // normalized 0–1
}

export interface ZoomMarker {
  readonly id: ZoomMarkerId;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly kind: 'auto' | 'manual';
  readonly strength: number; // 0–1
  readonly focalPoint: ZoomFocalPoint;
  readonly zoomInDuration: Frame;
  readonly zoomOutDuration: Frame;
}

export type ZoomFollowAnimation = 'focused' | 'smooth';

export interface ZoomPresentation {
  readonly autoIntensity: number; // 0–1
  readonly followCursor: boolean;
  readonly followAnimation: ZoomFollowAnimation;
  readonly followPadding: number; // 0–0.3 normalized viewport padding per edge
  readonly markers: readonly ZoomMarker[];
  /** When true (default), auto zoom markers are generated from recorded mouse clicks. */
  readonly autoFromClicks?: boolean;
}

export interface CameraLayoutMarker {
  readonly id: CameraLayoutMarkerId;
  readonly frame: Frame;
  readonly camera: CameraPresentation;
  readonly cameraFrame?: NormalizedRect;
  readonly templateId?: string;
}

export interface RecordingVisibility {
  readonly cameraVisible: boolean;
  readonly cursorVisible: boolean;
  readonly clicksVisible: boolean;
  readonly overlaysVisible: boolean;
}

export interface RecordingVisibilitySegment extends RecordingVisibility {
  readonly id: RecordingVisibilitySegmentId;
  readonly frame: Frame;
}

export type CursorStyle = 'subtle' | 'default' | 'spotlight';
export type ClickEffect = 'none' | 'ripple' | 'ring';

export interface CursorPresentation {
  readonly style: CursorStyle;
  readonly clickEffect: ClickEffect;
  readonly sizePercent: number; // 50–150
  readonly clickSoundEnabled: boolean;
}

export interface CursorEvent {
  readonly frame: Frame;
  readonly x: number;
  readonly y: number;
  readonly type: CursorEventType;
  readonly button: MouseButton;
}

export type CameraShape = 'circle' | 'rounded' | 'square';
export type CameraPosition = 'corner-br' | 'corner-bl' | 'corner-tr' | 'corner-tl' | 'center';
export type CameraAspectRatio = '16:9' | '1:1' | '9:16' | '4:3';

export interface CameraPresentation {
  readonly shape: CameraShape;
  readonly aspectRatio: CameraAspectRatio;
  readonly position: CameraPosition;
  readonly roundness: number;
  readonly size: number;
  readonly visible: boolean;
  readonly padding: number;
  readonly inset: number;
  readonly insetColor: string;
  readonly shadowEnabled: boolean;
  readonly shadowBlur: number;
  readonly shadowOpacity: number;
}

export interface RecordingBackgroundStyle {
  readonly bgColor: string;
  readonly bgGradient: string | null;
  readonly bgPadding: number;
  readonly bgCornerRadius: number;
  readonly bgInset: number;
  readonly bgInsetColor: string;
  readonly bgShadowEnabled: boolean;
  readonly bgShadowBlur: number;
  readonly bgShadowOpacity: number;
}

export type CropAspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:3';

/** Static crop viewport into source content. Coordinates are in source pixels. */
export interface RegionCrop {
  readonly enabled: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: CropAspectRatio;
}

export interface RecordingPresentation {
  readonly templateId: string;
  readonly zoom: ZoomPresentation;
  readonly cursor: CursorPresentation;
  readonly camera: CameraPresentation;
  readonly cameraLayouts?: readonly CameraLayoutMarker[];
  readonly visibilitySegments?: readonly RecordingVisibilitySegment[];
  readonly background?: RecordingBackgroundStyle;
  readonly screenFrame?: NormalizedRect;
  readonly cameraFrame?: NormalizedRect;
  readonly screenCrop?: RegionCrop;
  readonly cameraCrop?: RegionCrop;
  // highlights, titles to be added later
}

// --- AI Annotations ---

export type AIAnnotationId = string & { readonly __brand: 'AIAnnotationId' };
export type AnnotationStatus = 'pending' | 'accepted' | 'rejected';

export interface TranscriptWord {
  readonly word: string;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly confidence: number;
}

export interface CaptionSegment {
  readonly id: AIAnnotationId;
  readonly assetId: AssetId;
  readonly status: AnnotationStatus;
  readonly confidence: number;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly text: string;
  readonly words: readonly TranscriptWord[];
}

export type CaptionPosition = 'bottom' | 'center';

export interface CaptionStyle {
  readonly fontSize: number;
  readonly position: CaptionPosition;
  readonly backgroundOpacity: number;
}

export interface AIAnnotations {
  readonly captionSegments: readonly CaptionSegment[];
  readonly captionStyle: CaptionStyle;
}

// --- AI Libraries ---

export interface LibraryTranscriptSegment {
  readonly id: LibraryTranscriptSegmentId;
  readonly assetId?: AssetId;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly text: string;
  readonly words: readonly TranscriptWord[];
  readonly confidence: number;
  readonly language?: string;
}

export interface VisualAnalysisEntry {
  readonly id: VisualAnalysisEntryId;
  readonly assetId?: AssetId;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly confidence?: number;
  readonly metadata: Record<string, unknown>;
}

export interface LibrarySource {
  readonly id: LibrarySourceId;
  readonly assetId?: AssetId;
  readonly type: AssetType;
  readonly name: string;
  readonly filePath: string;
  readonly duration: Frame;
  readonly transcriptSegments: readonly LibraryTranscriptSegment[];
  readonly visualAnalysis: readonly VisualAnalysisEntry[];
  readonly metadata: Record<string, unknown>;
}

export interface Library {
  readonly id: LibraryId;
  readonly name: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly sources: readonly LibrarySource[];
  readonly metadata: Record<string, unknown>;
}

export interface LibraryDocument extends Library {
  readonly version: number;
}

export interface ProjectLibraryReference {
  readonly libraryId: LibraryId;
  readonly name: string;
  readonly filePath: string;
}

// --- Motion Compositions ---

export type MotionCompositionId = string & { readonly __brand: 'MotionCompositionId' };

export interface MotionComposition {
  readonly id: MotionCompositionId;
  readonly templateId: string;
  readonly name: string;
  readonly durationFrames: Frame;
  readonly props: Record<string, unknown>;
  readonly createdAt: string;
}

export interface Asset {
  readonly id: AssetId;
  readonly type: AssetType;
  readonly filePath: string;
  readonly duration: Frame;
  readonly metadata: Record<string, unknown>;
  readonly thumbnailPath?: string;
  readonly presentation?: RecordingPresentation;
  readonly cameraAssetId?: string;
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
  readonly keepClickSounds: boolean;
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
  readonly aiAnnotations: AIAnnotations;
  readonly motionCompositions: readonly MotionComposition[];
  readonly libraryReferences: readonly ProjectLibraryReference[];
}
