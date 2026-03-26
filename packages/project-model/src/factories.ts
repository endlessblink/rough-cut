// crypto.randomUUID is available globally in Node 20+
declare const crypto: { randomUUID(): string };
const generateId = (): string => crypto.randomUUID();
import type {
  ProjectDocument,
  ProjectId,
  AssetId,
  TrackId,
  ClipId,
  EffectId,
  PresetId,
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
  CursorPresentation,
  RecordingPresentation,
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
function zoomMarkerId(): ZoomMarkerId {
  return generateId() as ZoomMarkerId;
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

export function createAsset(
  type: AssetType,
  filePath: string,
  overrides?: Partial<Asset>,
): Asset {
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
    ...overrides,
  };
}

export function createDefaultZoomPresentation(): ZoomPresentation {
  return {
    autoIntensity: 0.5,
    markers: [],
  };
}

export function createDefaultCursorPresentation(): CursorPresentation {
  return {
    style: 'default',
    clickEffect: 'none',
    sizePercent: 100,
    clickSoundEnabled: false,
  };
}

export function createDefaultRecordingPresentation(): RecordingPresentation {
  return {
    zoom: createDefaultZoomPresentation(),
    cursor: createDefaultCursorPresentation(),
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
    },
    ...overrides,
  };
}
