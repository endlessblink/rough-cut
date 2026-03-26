import { z } from 'zod';
import type { ProjectDocument } from './types.js';

// --- Primitives ---

const nonNegativeInt = z.number().int().nonnegative();
const unit = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const positiveEvenInt = z.number().int().positive().refine((n) => n % 2 === 0, {
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

export const AssetTypeSchema = z.enum(['video', 'audio', 'image', 'recording']);
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

// --- Project Settings ---

export const ProjectSettingsSchema = z.object({
  resolution: ResolutionSchema,
  frameRate: FrameRateSchema,
  backgroundColor: hexColor,
  sampleRate: SampleRateSchema,
});

// --- Asset ---

// --- ZoomMarker ---

export const ZoomMarkerSchema = z.object({
  id: z.string().min(1),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  kind: z.enum(['auto', 'manual']),
  strength: unit,
});

// --- ZoomPresentation ---

export const ZoomPresentationSchema = z.object({
  autoIntensity: unit,
  markers: z.array(ZoomMarkerSchema),
});

// --- CursorPresentation ---

export const CursorStyleSchema = z.enum(['subtle', 'default', 'spotlight']);
export const ClickEffectSchema = z.enum(['none', 'ripple', 'ring']);

export const CursorPresentationSchema = z.object({
  style: CursorStyleSchema,
  clickEffect: ClickEffectSchema,
  sizePercent: z.number().min(50).max(150),
  clickSoundEnabled: z.boolean(),
});

// --- RecordingPresentation ---

export const RecordingPresentationSchema = z.object({
  zoom: ZoomPresentationSchema,
  cursor: CursorPresentationSchema,
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  filePath: z.string().min(1),
  duration: nonNegativeInt,
  metadata: z.record(z.unknown()),
  thumbnailPath: z.string().optional(),
  presentation: RecordingPresentationSchema.optional(),
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
});

/**
 * Validate and parse an unknown value into a ProjectDocument.
 * Throws a ZodError if validation fails.
 */
export function validateProject(data: unknown): ProjectDocument {
  return ProjectDocumentSchema.parse(data) as unknown as ProjectDocument;
}
