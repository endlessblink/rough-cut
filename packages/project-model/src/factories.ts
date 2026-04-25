// crypto.randomUUID is available globally in Node 20+
declare const crypto: { randomUUID(): string };
const generateId = (): string => crypto.randomUUID();
import type {
  ProjectDocument,
  ProjectId,
  LibraryId,
  AssetId,
  TrackId,
  ClipId,
  EffectId,
  PresetId,
  LibrarySourceId,
  LibraryTranscriptSegmentId,
  VisualAnalysisEntryId,
  Track,
  Clip,
  Asset,
  ClipTransform,
  EffectInstance,
  KeyframeTrack,
  Keyframe,
  AssetType,
  TrackType,
  EasingType,
  ZoomMarkerId,
  ZoomMarker,
  ZoomPresentation,
  CameraLayoutMarkerId,
  CameraLayoutMarker,
  CursorPresentation,
  CameraPresentation,
  RegionCrop,
  RecordingPresentation,
  BackgroundConfig,
  AIAnnotationId,
  AIAnnotations,
  CaptionSegment,
  TranscriptWord,
  Library,
  LibraryDocument,
  LibrarySource,
  LibraryTranscriptSegment,
  VisualAnalysisEntry,
  ProjectLibraryReference,
  MotionCompositionId,
  MotionComposition,
} from './types.js';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_FRAME_RATE,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_RESOLUTION,
  DEFAULT_BACKGROUND_COLOR,
} from './constants.js';

function projectId(): ProjectId {
  return generateId() as ProjectId;
}
function assetId(): AssetId {
  return generateId() as AssetId;
}
function libraryId(): LibraryId {
  return generateId() as LibraryId;
}
function trackId(): TrackId {
  return generateId() as TrackId;
}
function clipId(): ClipId {
  return generateId() as ClipId;
}
function effectId(): EffectId {
  return generateId() as EffectId;
}
function presetId(): PresetId {
  return generateId() as PresetId;
}
function librarySourceId(): LibrarySourceId {
  return generateId() as LibrarySourceId;
}
function libraryTranscriptSegmentId(): LibraryTranscriptSegmentId {
  return generateId() as LibraryTranscriptSegmentId;
}
function visualAnalysisEntryId(): VisualAnalysisEntryId {
  return generateId() as VisualAnalysisEntryId;
}
function zoomMarkerId(): ZoomMarkerId {
  return generateId() as ZoomMarkerId;
}
function cameraLayoutMarkerId(): CameraLayoutMarkerId {
  return generateId() as CameraLayoutMarkerId;
}
function aiAnnotationId(): AIAnnotationId {
  return generateId() as AIAnnotationId;
}
function motionCompositionId(): MotionCompositionId {
  return generateId() as MotionCompositionId;
}

// Suppress unused-variable lint — these generators are public API surface
void presetId;

const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};

export function createKeyframe(
  frame: number,
  value: number | string,
  overrides?: Partial<Keyframe>,
): Keyframe {
  return {
    frame,
    value,
    easing: 'linear' as EasingType,
    ...overrides,
  };
}

export function createKeyframeTrack(property: string): KeyframeTrack {
  return {
    property,
    keyframes: [],
  };
}

export function createEffectInstance(
  effectType: string,
  overrides?: Partial<EffectInstance>,
): EffectInstance {
  return {
    id: effectId(),
    effectType,
    enabled: true,
    params: {},
    keyframes: [],
    ...overrides,
  };
}

export function createClip(
  assetIdValue: AssetId,
  trackIdValue: TrackId,
  overrides?: Partial<Clip>,
): Clip {
  return {
    id: clipId(),
    assetId: assetIdValue,
    trackId: trackIdValue,
    enabled: true,
    timelineIn: 0,
    timelineOut: 0,
    sourceIn: 0,
    sourceOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    effects: [],
    keyframes: [],
    ...overrides,
  };
}

export function createTrack(type: TrackType, overrides?: Partial<Track>): Track {
  return {
    id: trackId(),
    type,
    name: type === 'video' ? 'Video Track' : 'Audio Track',
    index: 0,
    locked: false,
    visible: true,
    volume: 1,
    clips: [],
    ...overrides,
  };
}

export function createAsset(type: AssetType, filePath: string, overrides?: Partial<Asset>): Asset {
  return {
    id: assetId(),
    type,
    filePath,
    duration: 0,
    metadata: {},
    ...overrides,
  };
}

export function createZoomMarker(
  startFrame: number,
  endFrame: number,
  overrides?: Partial<ZoomMarker>,
): ZoomMarker {
  return {
    id: zoomMarkerId(),
    startFrame,
    endFrame,
    kind: 'manual',
    strength: 1,
    focalPoint: { x: 0.5, y: 0.5 },
    zoomInDuration: 9, // ~0.3s at 30fps
    zoomOutDuration: 9,
    ...overrides,
  };
}

export function createDefaultZoomPresentation(): ZoomPresentation {
  return {
    autoIntensity: 0.5,
    followCursor: true,
    followAnimation: 'focused',
    followPadding: 0.18,
    markers: [],
    autoFromClicks: true,
  };
}

export function createDefaultCursorPresentation(): CursorPresentation {
  return {
    style: 'default',
    clickEffect: 'none',
    sizePercent: 100,
    clickSoundEnabled: false,
    motionBlur: 0,
  };
}

export function createCameraLayoutMarker(
  frame: number,
  camera: CameraPresentation,
  overrides?: Partial<CameraLayoutMarker>,
): CameraLayoutMarker {
  return {
    id: cameraLayoutMarkerId(),
    frame,
    camera,
    ...overrides,
  };
}

export function createDefaultCameraPresentation(): CameraPresentation {
  return {
    shape: 'rounded',
    aspectRatio: '1:1',
    position: 'corner-br',
    roundness: 50,
    size: 100,
    visible: true,
    padding: 0,
    inset: 0,
    insetColor: '#ffffff',
    shadowEnabled: true,
    shadowBlur: 24,
    shadowOpacity: 0.45,
  };
}

/** Creates a default (disabled) crop covering the full source. */
export function createDefaultRegionCrop(sourceW = 1920, sourceH = 1080): RegionCrop {
  return { enabled: false, x: 0, y: 0, width: sourceW, height: sourceH, aspectRatio: 'free' };
}

export function createDefaultRecordingPresentation(): RecordingPresentation {
  return {
    templateId: 'screen-cam-br-16x9',
    zoom: createDefaultZoomPresentation(),
    cursor: createDefaultCursorPresentation(),
    camera: createDefaultCameraPresentation(),
  };
}

export function createDefaultBackgroundConfig(): BackgroundConfig {
  return {
    type: 'solid',
    color: '#000000',
  };
}

export function createTranscriptWord(
  word: string,
  startFrame: number,
  endFrame: number,
  confidence = 1,
): TranscriptWord {
  return { word, startFrame, endFrame, confidence };
}

export function createCaptionSegment(
  assetIdValue: AssetId,
  startFrame: number,
  endFrame: number,
  text: string,
  words: readonly TranscriptWord[] = [],
  overrides?: Partial<CaptionSegment>,
): CaptionSegment {
  return {
    id: aiAnnotationId(),
    assetId: assetIdValue,
    status: 'pending',
    confidence: 1,
    startFrame,
    endFrame,
    text,
    words,
    ...overrides,
  };
}

export function createLibraryTranscriptSegment(
  startFrame: number,
  endFrame: number,
  text: string,
  words: readonly TranscriptWord[] = [],
  overrides?: Partial<LibraryTranscriptSegment>,
): LibraryTranscriptSegment {
  return {
    id: libraryTranscriptSegmentId(),
    startFrame,
    endFrame,
    text,
    words,
    confidence: 1,
    ...overrides,
  };
}

export function createVisualAnalysisEntry(
  startFrame: number,
  endFrame: number,
  summary: string,
  overrides?: Partial<VisualAnalysisEntry>,
): VisualAnalysisEntry {
  return {
    id: visualAnalysisEntryId(),
    startFrame,
    endFrame,
    summary,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

export function createLibrarySource(
  type: Asset['type'],
  filePath: string,
  overrides?: Partial<LibrarySource>,
): LibrarySource {
  return {
    id: librarySourceId(),
    type,
    name: filePath.split(/[\\/]/).pop() || filePath,
    filePath,
    duration: 0,
    transcriptSegments: [],
    visualAnalysis: [],
    metadata: {},
    ...overrides,
  };
}

export function createLibrary(name = 'Untitled Library', overrides?: Partial<Library>): Library {
  const now = new Date().toISOString();
  return {
    id: libraryId(),
    name,
    createdAt: now,
    modifiedAt: now,
    sources: [],
    metadata: {},
    ...overrides,
  };
}

export function createLibraryDocument(
  name = 'Untitled Library',
  overrides?: Partial<LibraryDocument>,
): LibraryDocument {
  return {
    version: CURRENT_SCHEMA_VERSION,
    ...createLibrary(name),
    ...overrides,
  };
}

export function createProjectLibraryReference(
  library: Library,
  filePath: string,
  overrides?: Partial<ProjectLibraryReference>,
): ProjectLibraryReference {
  return {
    libraryId: library.id,
    name: library.name,
    filePath,
    ...overrides,
  };
}

export function createDefaultAIAnnotations(): AIAnnotations {
  return {
    captionSegments: [],
    captionStyle: {
      fontSize: 28,
      position: 'bottom',
      backgroundOpacity: 0.55,
    },
  };
}

export function createMotionComposition(
  templateId: string,
  name: string,
  durationFrames: number,
  props: Record<string, unknown> = {},
  overrides?: Partial<MotionComposition>,
): MotionComposition {
  return {
    id: motionCompositionId(),
    templateId,
    name,
    durationFrames,
    props,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createProject(overrides?: Partial<ProjectDocument>): ProjectDocument {
  const now = new Date().toISOString();
  return {
    version: CURRENT_SCHEMA_VERSION,
    id: projectId(),
    name: 'Untitled Project',
    createdAt: now,
    modifiedAt: now,
    settings: {
      resolution: { ...DEFAULT_RESOLUTION },
      frameRate: DEFAULT_FRAME_RATE,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      sampleRate: DEFAULT_SAMPLE_RATE,
      destinationPresetId: null,
    },
    assets: [],
    composition: {
      duration: 0,
      tracks: [
        createTrack('video', { name: 'Video 1', index: 3 }),
        createTrack('video', { name: 'Video 2', index: 2 }),
        createTrack('audio', { name: 'Audio 1', index: 1 }),
        createTrack('audio', { name: 'Audio 2', index: 0 }),
      ],
      transitions: [],
    },
    motionPresets: [],
    exportSettings: {
      format: 'mp4',
      codec: 'h264',
      bitrate: 10_000_000,
      resolution: { ...DEFAULT_RESOLUTION },
      frameRate: DEFAULT_FRAME_RATE,
      keepClickSounds: true,
    },
    aiAnnotations: createDefaultAIAnnotations(),
    motionCompositions: [],
    libraryReferences: [],
    ...overrides,
  };
}
