import type { ProjectDocument, Clip, Track, Transition, ZoomPresentation, CursorPresentation } from '@rough-cut/project-model';
import { selectActiveClipsAtFrame, getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import { evaluateKeyframeTracks, getDefaultParams } from '@rough-cut/effect-registry';
import type {
  RenderFrame,
  RenderLayer,
  ResolvedTransform,
  ResolvedEffect,
  ActiveTransition,
  CameraTransform,
  ResolvedCursorPresentation,
} from './types.js';

const DEFAULT_CAMERA_TRANSFORM: CameraTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const DEFAULT_CURSOR_PRESENTATION: ResolvedCursorPresentation = {
  style: 'default',
  clickEffect: 'none',
  sizePercent: 100,
  clickSoundEnabled: false,
};

/**
 * Resolve camera transform from zoom presentation for a given frame.
 * Delegates to getZoomTransformAtFrame() for full marker support:
 * focal-point panning, smooth ramp-in/out, connected-zoom interpolation.
 * Falls back to auto-intensity base zoom when no markers are active.
 */
function resolveCameraTransformForFrame(
  zoom: ZoomPresentation | undefined,
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
): CameraTransform {
  if (!zoom) return DEFAULT_CAMERA_TRANSFORM;

  // Use the full zoom engine for markers (handles easing, focal points, connected gaps)
  const zt = getZoomTransformAtFrame(frame, zoom.markers);

  if (zt.scale !== 1 || zt.translateX !== 0 || zt.translateY !== 0) {
    // translateX/translateY are in fraction-of-container × scale units — convert to pixels
    return {
      scale: zt.scale,
      offsetX: zt.translateX * canvasWidth,
      offsetY: zt.translateY * canvasHeight,
    };
  }

  // No active marker — apply auto-intensity as subtle center zoom (no pan)
  const t = zoom.autoIntensity;
  if (t <= 0) return DEFAULT_CAMERA_TRANSFORM;
  const scale = 1 + t * 0.08; // subtle: 0→1x, 1→1.08x
  return { scale, offsetX: 0, offsetY: 0 };
}

/**
 * Resolve cursor presentation from recording settings.
 * Returns defaults if cursor settings are missing.
 */
function resolveCursorPresentation(
  cursor: CursorPresentation | undefined,
): ResolvedCursorPresentation {
  if (!cursor) return DEFAULT_CURSOR_PRESENTATION;
  return {
    style: cursor.style,
    clickEffect: cursor.clickEffect,
    sizePercent: cursor.sizePercent,
    clickSoundEnabled: cursor.clickSoundEnabled,
  };
}

/**
 * Find the first recording asset in the project.
 * Used to derive presentation settings for the active recording.
 */
function findActiveRecordingAsset(project: ProjectDocument) {
  return project.assets.find((a) => a.type === 'recording');
}

/**
 * Resolve a complete render description for a single frame.
 *
 * This is the architectural keystone — both preview and export call this.
 * Same ProjectDocument + same frame number = same RenderFrame output.
 */
export function resolveFrame(project: ProjectDocument, frame: number): RenderFrame {
  const { settings, composition } = project;
  const tracks = composition.tracks;

  // 1. Find active clips at this frame
  const activeClips = selectActiveClipsAtFrame(tracks, frame);

  // 2. Resolve each active clip into a RenderLayer
  const layers: RenderLayer[] = activeClips
    .map((clip) => resolveClipLayer(clip, tracks, frame))
    .sort((a, b) => a.trackIndex - b.trackIndex); // z-order: low index = bottom

  // 3. Find active transitions
  const transitions = resolveTransitions(composition.transitions, tracks, frame);

  // 4. Resolve recording presentation (zoom + cursor)
  const activeRecording = findActiveRecordingAsset(project);
  const presentation = activeRecording?.presentation;
  const cameraTransform = resolveCameraTransformForFrame(
    presentation?.zoom, frame, settings.resolution.width, settings.resolution.height,
  );
  const cursor = resolveCursorPresentation(presentation?.cursor);
  const screenCrop = presentation?.screenCrop?.enabled ? presentation.screenCrop : undefined;

  return {
    frame,
    width: settings.resolution.width,
    height: settings.resolution.height,
    backgroundColor: settings.backgroundColor,
    layers,
    transitions,
    cameraTransform,
    cursor,
    screenCrop,
  };
}

function findTrackForClip(clip: Clip, tracks: readonly Track[]): Track | undefined {
  return tracks.find((t) => t.id === clip.trackId);
}

function resolveClipLayer(clip: Clip, tracks: readonly Track[], frame: number): RenderLayer {
  const track = findTrackForClip(clip, tracks);
  const trackIndex = track?.index ?? 0;

  // Calculate source frame: how far into the source media are we?
  const sourceFrame = clip.sourceIn + (frame - clip.timelineIn);

  // Relative frame within this clip (for keyframe evaluation)
  const clipLocalFrame = frame - clip.timelineIn;

  // Resolve transform — start with static values, animate via keyframe tracks
  const transform = resolveTransform(clip, clipLocalFrame);

  // Resolve effects
  const effects = resolveEffects(clip, clipLocalFrame);

  return {
    clipId: clip.id,
    trackId: clip.trackId,
    trackIndex,
    assetId: clip.assetId,
    sourceFrame,
    transform,
    effects,
  };
}

function resolveTransform(clip: Clip, clipLocalFrame: number): ResolvedTransform {
  // Static defaults from the clip transform
  const staticTransform = clip.transform;

  // Build defaults map for evaluateKeyframeTracks
  const defaults: Record<string, number | string | boolean> = {
    'transform.x': staticTransform.x,
    'transform.y': staticTransform.y,
    'transform.scaleX': staticTransform.scaleX,
    'transform.scaleY': staticTransform.scaleY,
    'transform.rotation': staticTransform.rotation,
    'transform.anchorX': staticTransform.anchorX,
    'transform.anchorY': staticTransform.anchorY,
    'transform.opacity': staticTransform.opacity,
  };

  // Filter clip keyframes to only transform.* tracks
  const transformKeyframeTracks = clip.keyframes.filter((kft) =>
    kft.property.startsWith('transform.'),
  );

  const resolved =
    transformKeyframeTracks.length > 0
      ? evaluateKeyframeTracks(transformKeyframeTracks, clipLocalFrame, defaults)
      : defaults;

  return {
    x: (resolved['transform.x'] as number) ?? staticTransform.x,
    y: (resolved['transform.y'] as number) ?? staticTransform.y,
    scaleX: (resolved['transform.scaleX'] as number) ?? staticTransform.scaleX,
    scaleY: (resolved['transform.scaleY'] as number) ?? staticTransform.scaleY,
    rotation: (resolved['transform.rotation'] as number) ?? staticTransform.rotation,
    anchorX: (resolved['transform.anchorX'] as number) ?? staticTransform.anchorX,
    anchorY: (resolved['transform.anchorY'] as number) ?? staticTransform.anchorY,
    opacity: (resolved['transform.opacity'] as number) ?? staticTransform.opacity,
  };
}

function resolveEffects(clip: Clip, clipLocalFrame: number): ResolvedEffect[] {
  return clip.effects.map((effect) => {
    // Get registered defaults for this effect type (fallback to static params)
    const registryDefaults = getDefaultParams(effect.effectType);

    // Merge static params on top of registry defaults
    const staticParams: Record<string, number | string | boolean> = {
      ...registryDefaults,
    };
    for (const [key, value] of Object.entries(effect.params)) {
      if (
        typeof value === 'number' ||
        typeof value === 'string' ||
        typeof value === 'boolean'
      ) {
        staticParams[key] = value;
      }
    }

    // Evaluate any keyframe tracks on this effect
    const resolvedParams =
      effect.keyframes.length > 0
        ? evaluateKeyframeTracks(effect.keyframes, clipLocalFrame, staticParams)
        : { ...staticParams };

    return {
      effectType: effect.effectType,
      enabled: effect.enabled,
      params: resolvedParams,
    };
  });
}

function resolveTransitions(
  transitions: readonly Transition[],
  tracks: readonly Track[],
  frame: number,
): ActiveTransition[] {
  const result: ActiveTransition[] = [];

  for (const transition of transitions) {
    // Find clipA to determine its timelineOut (where the transition zone starts)
    const clipA = findClipById(transition.clipAId, tracks);
    if (clipA === undefined) continue;

    // The transition overlaps with the end of clipA.
    // transitionStart = clipA.timelineOut - transition.duration
    const transitionStart = clipA.timelineOut - transition.duration;
    const transitionEnd = clipA.timelineOut;

    if (frame < transitionStart || frame >= transitionEnd) continue;

    const rawProgress = (frame - transitionStart) / transition.duration;
    const progress = Math.min(1, Math.max(0, rawProgress));

    result.push({
      type: transition.type,
      progress,
      params: transition.params,
      clipAId: transition.clipAId,
      clipBId: transition.clipBId,
    });
  }

  return result;
}

function findClipById(
  clipId: import('@rough-cut/project-model').ClipId,
  tracks: readonly Track[],
): Clip | undefined {
  for (const track of tracks) {
    const found = track.clips.find((c) => c.id === clipId);
    if (found !== undefined) return found;
  }
  return undefined;
}

