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
export const AssetPathModeSchema = z.enum(['relative', 'absolute']);
export const TrackTypeSchema = z.enum(['video', 'audio']);
export const ExportFormatSchema = z.enum(['mp4', 'webm', 'gif']);
export const ExportCodecSchema = z.enum(['h264', 'h265', 'vp9']);
export const FrameRateSchema = z.union([z.literal(24), z.literal(30), z.literal(60)]);
export const SampleRateSchema = z.union([z.literal(44100), z.literal(48000)]);
export const ProjectAspectRatioSchema = z.enum(['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '4:5']);

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
  aspectRatio: ProjectAspectRatioSchema.default('auto'),
  backgroundConfig: BackgroundConfigSchema.optional(),
  recordingDefaults: z.lazy(() => RecordingPresentationSchema).optional(),
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
  followAnimation: ZoomFollowAnimationSchema.default('smooth'),
  followPadding: z.number().min(0).max(0.3).default(0.22),
  cursorSmoothing: z.number().min(0).max(2).optional(),
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

export const RecordingVisibilitySchema = z.object({
  cameraVisible: z.boolean(),
  cursorVisible: z.boolean(),
  clicksVisible: z.boolean(),
  overlaysVisible: z.boolean(),
});

export const RecordingVisibilitySegmentSchema = RecordingVisibilitySchema.extend({
  id: z.string().min(1),
  frame: nonNegativeInt,
});

export const CutRangeSchema = z.object({
  id: z.string().min(1),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
}).refine((range) => range.endFrame > range.startFrame, {
  message: 'Cut range endFrame must be greater than startFrame',
  path: ['endFrame'],
});

export const RecordingBackgroundStyleSchema = z.object({
  bgColor: hexColor,
  bgGradient: z.string().nullable(),
  bgImage: z.string().min(1).nullable().optional(),
  bgPadding: nonNegativeInt,
  bgCornerRadius: nonNegativeInt,
  bgInset: nonNegativeInt,
  bgInsetColor: hexColor,
  bgShadowEnabled: z.boolean(),
  bgShadowBlur: nonNegativeInt,
  bgShadowOpacity: unit,
  bgShadowOffsetY: nonNegativeInt.optional(),
  bgShadowOffsetX: z.number().int().optional(),
});

// --- RecordingPresentation ---

export const RecordingPresentationSchema = z.object({
  templateId: z.string().min(1).default('screen-cam-br-16x9'),
  zoom: ZoomPresentationSchema,
  cursor: CursorPresentationSchema,
  camera: CameraPresentationSchema,
  cameraLayouts: z.array(CameraLayoutMarkerSchema).optional(),
  visibilitySegments: z.array(RecordingVisibilitySegmentSchema).optional(),
  cutRanges: z.array(CutRangeSchema).optional(),
  background: RecordingBackgroundStyleSchema.optional(),
  screenFrame: NormalizedRectSchema.optional(),
  cameraFrame: NormalizedRectSchema.optional(),
  screenCrop: RegionCropSchema.optional(),
  cameraCrop: RegionCropSchema.optional(),
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  filePath: z.string().min(1),
  pathMode: AssetPathModeSchema.default('absolute'),
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
  keepClickSounds: z.boolean().default(true),
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

// --- AI architecture: transcript / caption tracks / NLE tracks ---

export const TranscriptParagraphSchema = z.object({
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  text: z.string(),
  speaker: z.string().min(1).optional(),
});

export const TranscriptNonSpeechKindSchema = z.enum(['silence', 'music', 'noise']);

export const TranscriptNonSpeechSegmentSchema = z.object({
  kind: TranscriptNonSpeechKindSchema,
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
});

export const TranscriptSchema = z.object({
  words: z.array(TranscriptWordSchema),
  paragraphs: z.array(TranscriptParagraphSchema),
  nonSpeech: z.array(TranscriptNonSpeechSegmentSchema),
});

// Renamed from spec's `CaptionStyleSchema` — the existing CaptionStyleSchema
// describes a per-segment rendering style ({fontSize, position, ...}). The new
// kind union (subtitle / submagic / karaoke) is a distinct concept.
export const CaptionStyleKindSchema = z.enum(['subtitle', 'submagic', 'karaoke']);

export const CaptionPhraseSchema = z.object({
  text: z.string(),
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  emphasisWordIndex: z.number().int().nonnegative().optional(),
  paletteColorIndex: z.number().int().nonnegative().optional(),
});

export const CaptionTrackSchema = z.object({
  id: z.string().min(1),
  style: CaptionStyleKindSchema,
  phrases: z.array(CaptionPhraseSchema),
});

export const NleTrackKindSchema = z.enum(['video', 'audio', 'captions', 'motion-graphics']);
export const NleClipSourceKindSchema = z.enum(['project-asset', 'ai-asset']);

export const NleClipSourceSchema = z.object({
  kind: NleClipSourceKindSchema,
  id: z.string().min(1),
});

export const NleTrackClipSchema = z.object({
  id: z.string().min(1),
  source: NleClipSourceSchema,
  timelineIn: nonNegativeInt,
  timelineOut: nonNegativeInt,
  sourceIn: nonNegativeInt,
  sourceOut: nonNegativeInt,
}).refine((clip) => clip.timelineOut > clip.timelineIn, {
  message: 'Clip timelineOut must be greater than timelineIn',
  path: ['timelineOut'],
}).refine((clip) => clip.sourceOut > clip.sourceIn, {
  message: 'Clip sourceOut must be greater than sourceIn',
  path: ['sourceOut'],
});

export const NleTrackSchema = z.object({
  id: z.string().min(1),
  kind: NleTrackKindSchema,
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  enabled: z.boolean(),
  locked: z.boolean(),
  muted: z.boolean(),
  clips: z.array(NleTrackClipSchema),
});

export const TimelineSourceKindSchema = z.enum([
  'screen',
  'camera',
  'mic-audio',
  'system-audio',
  'cursor-telemetry',
  'project-asset',
  'generated-asset',
]);
export const TimelineSourceMediaTypeSchema = z.enum(['video', 'audio', 'telemetry', 'data']);

export const TimelineSourceSchema = z.object({
  id: z.string().min(1),
  kind: TimelineSourceKindSchema,
  mediaType: TimelineSourceMediaTypeSchema,
  assetId: z.string().min(1).optional(),
  label: z.string().min(1),
  duration: nonNegativeInt,
});

export const MediaReferenceSchema = TimelineSourceSchema;

export const TimelineLinkedGroupSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['recording', 'generated-set', 'manual-sync']),
  sourceIds: z.array(z.string().min(1)).min(1),
  primarySourceId: z.string().min(1),
  syncPolicy: z.enum(['frame-locked', 'manual-offset']),
});

export const TimelineMarkerKindSchema = z.enum([
  'zoom',
  'cut',
  'click',
  'cursor-style',
  'camera-layout',
  'annotation',
]);

export const TimelineMarkerSchema = z.object({
  id: z.string().min(1),
  kind: TimelineMarkerKindSchema,
  startFrame: nonNegativeInt,
  endFrame: nonNegativeInt,
  sourceId: z.string().min(1).optional(),
  linkedGroupId: z.string().min(1).optional(),
  params: z.record(z.unknown()),
}).refine((marker) => marker.endFrame > marker.startFrame, {
  message: 'Marker endFrame must be greater than startFrame',
  path: ['endFrame'],
}).refine((marker) => marker.sourceId !== undefined || marker.linkedGroupId !== undefined, {
  message: 'Marker must be owned by a source or linked group',
  path: ['sourceId'],
});

export const TimelineEffectSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['cursor', 'click', 'camera-pip', 'zoom', 'annotation']),
  ownerId: z.string().min(1),
  ownerType: z.enum(['clip', 'track', 'source', 'linked-group', 'timeline']),
  startFrame: nonNegativeInt.optional(),
  endFrame: nonNegativeInt.optional(),
  enabled: z.boolean(),
  params: z.record(z.unknown()),
});

export const TimelineClipSchema = z.object({
  id: z.string().min(1),
  mediaId: z.string().min(1),
  trackId: z.string().min(1),
  linkGroupId: z.string().min(1).optional(),
  timelineIn: nonNegativeInt,
  timelineOut: nonNegativeInt,
  sourceIn: nonNegativeInt,
  sourceOut: nonNegativeInt,
  // Transitional import adapter for existing NLE code. Canonical model code uses mediaId.
  source: NleClipSourceSchema.optional(),
}).refine((clip) => clip.timelineOut > clip.timelineIn, {
  message: 'Clip timelineOut must be greater than timelineIn',
  path: ['timelineOut'],
}).refine((clip) => clip.sourceOut > clip.sourceIn, {
  message: 'Clip sourceOut must be greater than sourceIn',
  path: ['sourceOut'],
}).refine((clip) => clip.timelineOut - clip.timelineIn === clip.sourceOut - clip.sourceIn, {
  message: 'Clip duration must match source duration until retiming exists',
  path: ['timelineOut'],
});

export const TimelineTrackSchema = z.object({
  id: z.string().min(1),
  kind: NleTrackKindSchema,
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  enabled: z.boolean(),
  locked: z.boolean(),
  muted: z.boolean(),
  height: z.number().int().min(36).max(140).optional(),
  clips: z.array(TimelineClipSchema),
});

export const SharedTimelineSchema = z.object({
  sources: z.array(MediaReferenceSchema),
  linkedGroups: z.array(TimelineLinkedGroupSchema),
  tracks: z.array(TimelineTrackSchema),
  markers: z.array(TimelineMarkerSchema),
  effects: z.array(TimelineEffectSchema),
  exportSettings: ExportSettingsSchema,
}).superRefine((timeline, context) => {
  const sourceIds = new Set(timeline.sources.map((source) => source.id));
  const linkedGroupIds = new Set(timeline.linkedGroups.map((group) => group.id));
  const trackIds = new Set(timeline.tracks.map((track) => track.id));
  const clipIds = new Set<string>();
  for (const group of timeline.linkedGroups) {
    if (!sourceIds.has(group.primarySourceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Linked group primarySourceId must reference a timeline source',
        path: ['linkedGroups'],
      });
    }
    for (const sourceId of group.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Linked group sourceIds must reference timeline sources',
          path: ['linkedGroups'],
        });
      }
    }
  }
  for (const [trackIndex, track] of timeline.tracks.entries()) {
    let previousTimelineOut = -1;
    for (const [clipIndex, clip] of track.clips.entries()) {
      clipIds.add(clip.id);
      if (clip.trackId !== track.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Clip trackId must match containing timeline track',
          path: ['tracks', trackIndex, 'clips', clipIndex, 'trackId'],
        });
      }
      const media = timeline.sources.find((source) => source.id === clip.mediaId);
      if (!media) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Clip mediaId must reference a timeline media reference',
          path: ['tracks', trackIndex, 'clips', clipIndex, 'mediaId'],
        });
      } else if (clip.sourceOut > media.duration) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Clip sourceOut must not exceed media duration',
          path: ['tracks', trackIndex, 'clips', clipIndex, 'sourceOut'],
        });
      }
      if (clip.linkGroupId && !linkedGroupIds.has(clip.linkGroupId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Clip linkGroupId must reference a linked group',
          path: ['tracks', trackIndex, 'clips', clipIndex, 'linkGroupId'],
        });
      }
      if (clip.timelineIn < previousTimelineOut) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Clips on the same track must be sorted and non-overlapping',
          path: ['tracks', trackIndex, 'clips', clipIndex, 'timelineIn'],
        });
      }
      previousTimelineOut = Math.max(previousTimelineOut, clip.timelineOut);
    }
  }
  for (const marker of timeline.markers) {
    if (marker.sourceId && !sourceIds.has(marker.sourceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Marker sourceId must reference a timeline source',
        path: ['markers'],
      });
    }
    if (marker.linkedGroupId && !linkedGroupIds.has(marker.linkedGroupId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Marker linkedGroupId must reference a linked group',
        path: ['markers'],
      });
    }
  }
  for (const [effectIndex, effect] of timeline.effects.entries()) {
    const ownerExists = effect.ownerType === 'timeline'
      || (effect.ownerType === 'clip' && clipIds.has(effect.ownerId))
      || (effect.ownerType === 'track' && trackIds.has(effect.ownerId))
      || (effect.ownerType === 'source' && sourceIds.has(effect.ownerId))
      || (effect.ownerType === 'linked-group' && linkedGroupIds.has(effect.ownerId));
    if (!ownerExists) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Effect ownerId must reference its declared owner type',
        path: ['effects', effectIndex, 'ownerId'],
      });
    }
    if ((effect.startFrame === undefined) !== (effect.endFrame === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Timeline effects must define both startFrame and endFrame or neither',
        path: ['effects', effectIndex, 'startFrame'],
      });
    }
    if (effect.startFrame !== undefined && effect.endFrame !== undefined && effect.endFrame <= effect.startFrame) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Effect endFrame must be greater than startFrame',
        path: ['effects', effectIndex, 'endFrame'],
      });
    }
  }
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
  // AI architecture additions. Optional until renderer creation paths all own them.
  transcript: TranscriptSchema.optional(),
  captionTracks: z.array(CaptionTrackSchema).optional(),
  tracks: z.array(NleTrackSchema).optional(),
  timeline: SharedTimelineSchema,
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
