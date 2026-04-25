import { z } from 'zod';
import type { LibraryDocument, ProjectDocument } from './types.js';

// --- Primitives ---

const nonNegativeInt = z.number().int().nonnegative();
const unit = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const positiveEvenInt = z
  .number()
  .int()
  .positive()
  .refine((n) => n % 2 === 0, {
    message: 'Must be a positive even integer',
  });

// --- Enums ---

export const EasingTypeSchema = z.enum([
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'cubic-bezier',
]);

export const AssetTypeSchema = z.enum(['video', 'audio', 'image', 'recording', 'motion']);
export const TrackTypeSchema = z.enum(['video', 'audio']);
export const ExportFormatSchema = z.enum(['mp4', 'webm', 'gif']);
export const ExportCodecSchema = z.enum(['h264', 'h265', 'vp9']);
export const FrameRateSchema = z.union([z.literal(24), z.literal(30), z.literal(60)]);
export const SampleRateSchema = z.union([z.literal(44100), z.literal(48000)]);

// --- Resolution ---

export const ResolutionSchema = z.object({
  width: positiveEvenInt,
  height: positiveEvenInt,
});

// --- BackgroundConfig ---

export const BackgroundConfigSchema = z.object({
  type: z.enum(['solid', 'gradient']),
  color: z.string(),
  gradientStart: z.string().optional(),
  gradientEnd: z.string().optional(),
  gradientAngle: z.number().min(0).max(360).optional(),
});

// --- Project Settings ---

export const ProjectSettingsSchema = z.object({
  resolution: ResolutionSchema,
  frameRate: FrameRateSchema,
  backgroundColor: hexColor,
  sampleRate: SampleRateSchema,
  backgroundConfig: BackgroundConfigSchema.optional(),
  destinationPresetId: z.string().nullable().optional(),
});

// --- Asset ---

// --- ZoomMarker ---

export const ZoomFocalPointSchema = z.object({
  x: unit,
  y: unit,
});

export const ZoomMarkerSchema = z.object({
  id: z.string().min(1),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  kind: z.enum(['auto', 'manual']),
  strength: unit,
  focalPoint: ZoomFocalPointSchema,
  zoomInDuration: nonNegativeInt,
  zoomOutDuration: nonNegativeInt,
});

// --- ZoomPresentation ---

export const ZoomFollowAnimationSchema = z.enum(['focused', 'smooth']);

export const ZoomPresentationSchema = z.object({
  autoIntensity: unit,
  followCursor: z.boolean().default(true),
  followAnimation: ZoomFollowAnimationSchema.default('focused'),
  followPadding: z.number().min(0).max(0.3).default(0.18),
  markers: z.array(ZoomMarkerSchema),
  autoFromClicks: z.boolean().optional(),
});

// --- CursorPresentation ---

export const CursorStyleSchema = z.enum(['subtle', 'default', 'spotlight']);
export const ClickEffectSchema = z.enum(['none', 'ripple', 'ring']);

export const CursorPresentationSchema = z.object({
  style: CursorStyleSchema,
  clickEffect: ClickEffectSchema,
  sizePercent: z.number().min(50).max(150),
  clickSoundEnabled: z.boolean(),
  motionBlur: z.number().min(0).max(100).default(0),
});

export const CursorEventTypeSchema = z.enum(['move', 'down', 'up', 'scroll']);

export const CursorEventSchema = z.object({
  frame: nonNegativeInt,
  x: z.number(),
  y: z.number(),
  type: CursorEventTypeSchema,
  button: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

// --- CameraPresentation ---

export const CameraShapeSchema = z.enum(['circle', 'rounded', 'square']);
export const CameraPositionSchema = z.enum([
  'corner-br',
  'corner-bl',
  'corner-tr',
  'corner-tl',
  'center',
]);
export const CameraAspectRatioSchema = z.enum(['16:9', '1:1', '9:16', '4:3']);
export const CropAspectRatioSchema = z.enum(['free', '16:9', '9:16', '1:1', '4:3']);

export const CameraPresentationSchema = z.object({
  shape: CameraShapeSchema,
  aspectRatio: CameraAspectRatioSchema.default('1:1'),
  position: CameraPositionSchema,
  roundness: z.number().min(0).max(100),
  size: z.number().min(50).max(200),
  visible: z.boolean(),
  padding: z.number().min(0).max(200).default(0),
  inset: z.number().min(0).max(20).default(0),
  insetColor: z.string().default('#ffffff'),
  shadowEnabled: z.boolean().default(true),
  shadowBlur: z.number().min(0).max(50).default(24),
  shadowOpacity: z.number().min(0).max(1).default(0.45),
});

export const RegionCropSchema = z.object({
  enabled: z.boolean(),
  x: nonNegativeInt,
  y: nonNegativeInt,
  width: nonNegativeInt,
  height: nonNegativeInt,
  aspectRatio: CropAspectRatioSchema,
});

export const NormalizedRectSchema = z.object({
  x: unit,
  y: unit,
  w: unit,
  h: unit,
});

export const CameraLayoutMarkerSchema = z.object({
  id: z.string().min(1),
  frame: nonNegativeInt,
  camera: CameraPresentationSchema,
  cameraFrame: NormalizedRectSchema.optional(),
  templateId: z.string().min(1).optional(),
});

// --- RecordingPresentation ---

export const RecordingPresentationSchema = z.object({
  templateId: z.string().min(1).default('screen-cam-br-16x9'),
  zoom: ZoomPresentationSchema,
  cursor: CursorPresentationSchema,
  camera: CameraPresentationSchema,
  cameraLayouts: z.array(CameraLayoutMarkerSchema).optional(),
  cameraFrame: NormalizedRectSchema.optional(),
  screenCrop: RegionCropSchema.optional(),
  cameraCrop: RegionCropSchema.optional(),
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  filePath: z.string().min(1),
  duration: nonNegativeInt,
  metadata: z.record(z.unknown()),
  thumbnailPath: z.string().optional(),
  presentation: RecordingPresentationSchema.optional(),
  cameraAssetId: z.string().min(1).optional(),
});

// --- Tangent ---

export const TangentSchema = z.object({
  inX: z.number(),
  inY: z.number(),
  outX: z.number(),
  outY: z.number(),
});

// --- Keyframe ---

export const KeyframeSchema = z.object({
  frame: nonNegativeInt,
  value: z.union([z.number(), z.string()]),
  easing: EasingTypeSchema,
  tangent: TangentSchema.optional(),
});

// --- KeyframeTrack ---

export const KeyframeTrackSchema = z.object({
  property: z.string().min(1),
  keyframes: z.array(KeyframeSchema),
});

// --- EffectInstance ---

export const EffectInstanceSchema = z.object({
  id: z.string().min(1),
  effectType: z.string().min(1),
  enabled: z.boolean(),
  params: z.record(z.unknown()),
  keyframes: z.array(KeyframeTrackSchema),
});

// --- ClipTransform ---

export const ClipTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  rotation: z.number(),
  anchorX: unit,
  anchorY: unit,
  opacity: unit,
});

// --- Clip ---

export const ClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  trackId: z.string().min(1),
  name: z.string().optional(),
  enabled: z.boolean(),
  timelineIn: nonNegativeInt,
  timelineOut: nonNegativeInt,
  sourceIn: nonNegativeInt,
  sourceOut: nonNegativeInt,
  transform: ClipTransformSchema,
  effects: z.array(EffectInstanceSchema),
  keyframes: z.array(KeyframeTrackSchema),
});

// --- Track ---

export const TrackSchema = z.object({
  id: z.string().min(1),
  type: TrackTypeSchema,
  name: z.string().min(1),
  index: z.number().int().nonnegative(),
  locked: z.boolean(),
  visible: z.boolean(),
  volume: unit,
  clips: z.array(ClipSchema),
});

// --- Transition ---

export const TransitionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  clipAId: z.string().min(1),
  clipBId: z.string().min(1),
  duration: nonNegativeInt,
  params: z.record(z.unknown()),
  easing: EasingTypeSchema,
});

// --- Composition ---

export const CompositionSchema = z.object({
  duration: nonNegativeInt,
  tracks: z.array(TrackSchema),
  transitions: z.array(TransitionSchema),
});

// --- MotionPreset ---

export const MotionPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  keyframeTracks: z.array(KeyframeTrackSchema),
  category: z.string().min(1),
});

// --- ExportSettings ---

export const ExportSettingsSchema = z.object({
  format: ExportFormatSchema,
  codec: ExportCodecSchema,
  bitrate: z.number().positive(),
  resolution: ResolutionSchema,
  frameRate: z.number().positive(),
  keepClickSounds: z.boolean(),
});

// --- AI Annotations ---

export const AnnotationStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

export const TranscriptWordSchema = z.object({
  word: z.string(),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  confidence: unit,
});

export const CaptionSegmentSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  status: AnnotationStatusSchema,
  confidence: unit,
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  text: z.string(),
  words: z.array(TranscriptWordSchema),
});

export const CaptionStyleSchema = z.object({
  fontSize: z.number().min(12).max(72),
  position: z.enum(['bottom', 'center']),
  backgroundOpacity: unit,
});

export const AIAnnotationsSchema = z.object({
  captionSegments: z.array(CaptionSegmentSchema),
  captionStyle: CaptionStyleSchema,
});

// --- AI Libraries ---

export const LibraryTranscriptSegmentSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1).optional(),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  text: z.string(),
  words: z.array(TranscriptWordSchema),
  confidence: unit,
  language: z.string().min(1).optional(),
});

export const VisualAnalysisEntrySchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1).optional(),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  summary: z.string().min(1),
  tags: z.array(z.string()),
  confidence: unit.optional(),
  metadata: z.record(z.unknown()),
});

export const LibrarySourceSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1).optional(),
  type: AssetTypeSchema,
  name: z.string().min(1),
  filePath: z.string().min(1),
  duration: nonNegativeInt,
  transcriptSegments: z.array(LibraryTranscriptSegmentSchema),
  visualAnalysis: z.array(VisualAnalysisEntrySchema),
  metadata: z.record(z.unknown()),
});

export const LibrarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  sources: z.array(LibrarySourceSchema),
  metadata: z.record(z.unknown()),
});

export const LibraryDocumentSchema = LibrarySchema.extend({
  version: z.number().int().nonnegative(),
});

export const ProjectLibraryReferenceSchema = z.object({
  libraryId: z.string().min(1),
  name: z.string().min(1),
  filePath: z.string().min(1),
});

// --- Motion Compositions ---

export const MotionCompositionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  name: z.string().min(1),
  durationFrames: nonNegativeInt,
  props: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

// --- ProjectDocument ---

export const ProjectDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  settings: ProjectSettingsSchema,
  assets: z.array(AssetSchema),
  composition: CompositionSchema,
  motionPresets: z.array(MotionPresetSchema),
  exportSettings: ExportSettingsSchema,
  aiAnnotations: AIAnnotationsSchema,
  motionCompositions: z.array(MotionCompositionSchema),
  libraryReferences: z.array(ProjectLibraryReferenceSchema),
});

/**
 * Validate and parse an unknown value into a ProjectDocument.
 * Throws a ZodError if validation fails.
 */
export function validateProject(data: unknown): ProjectDocument {
  return ProjectDocumentSchema.parse(data) as unknown as ProjectDocument;
}

export function validateLibrary(data: unknown): LibraryDocument {
  return LibraryDocumentSchema.parse(data) as unknown as LibraryDocument;
}
