import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProject,
  createTrack,
  createClip,
  createAsset,
  createEffectInstance,
  createKeyframeTrack,
  createKeyframe,
} from '@rough-cut/project-model';
import type {
  ProjectDocument,
  Track,
  Clip,
  AssetId,
  TrackId,
  ClipId,
  TransitionId,
} from '@rough-cut/project-model';
import {
  clearRegistry,
  registerBuiltinEffects,
} from '@rough-cut/effect-registry';
import { resolveFrame } from './resolve-frame.js';

// --- helpers ---

function makeAssetId(): AssetId {
  return 'asset-1' as AssetId;
}

function projectWith(tracks: Track[], transitions?: ProjectDocument['composition']['transitions']): ProjectDocument {
  return createProject({
    composition: {
      duration: 300,
      tracks,
      transitions: transitions ?? [],
    },
  });
}

function trackWith(clips: Clip[], overrides?: Partial<Track>): Track {
  return createTrack('video', { clips, index: 0, ...overrides });
}

function clipAt(timelineIn: number, timelineOut: number, overrides?: Partial<Clip>): Clip {
  return createClip(makeAssetId(), 'track-1' as TrackId, {
    timelineIn,
    timelineOut,
    sourceIn: 0,
    sourceOut: timelineOut - timelineIn,
    ...overrides,
  });
}

// --- tests ---

describe('resolveFrame', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltinEffects();
  });

  it('empty project — frame 0, no clips → 0 layers with correct resolution and background', () => {
    const project = projectWith([]);
    const result = resolveFrame(project, 0);

    expect(result.frame).toBe(0);
    expect(result.layers).toHaveLength(0);
    expect(result.transitions).toHaveLength(0);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.backgroundColor).toBe('#000000');
  });

  it('one clip on one track — active at frame 50 → 1 layer with correct sourceFrame', () => {
    const trackId = 'track-test' as TrackId;
    const clip = createClip(makeAssetId(), trackId, {
      timelineIn: 30,
      timelineOut: 90,
      sourceIn: 0,
      sourceOut: 60,
    });
    const track = createTrack('video', { id: trackId, clips: [clip], index: 1 });
    const project = projectWith([track]);

    const result = resolveFrame(project, 50);

    expect(result.layers).toHaveLength(1);
    const layer = result.layers[0]!;
    expect(layer.clipId).toBe(clip.id);
    // sourceFrame = sourceIn(0) + (frame(50) - timelineIn(30)) = 20
    expect(layer.sourceFrame).toBe(20);
    expect(layer.trackIndex).toBe(1);
    // default transform
    expect(layer.transform.x).toBe(0);
    expect(layer.transform.scaleX).toBe(1);
    expect(layer.transform.opacity).toBe(1);
  });

  it('source frame calculation — sourceIn=10, timelineIn=100, frame=115 → sourceFrame=25', () => {
    const clip = clipAt(100, 200, { sourceIn: 10, sourceOut: 110 });
    const track = trackWith([clip]);
    const project = projectWith([track]);

    const result = resolveFrame(project, 115);

    expect(result.layers).toHaveLength(1);
    expect(result.layers[0]!.sourceFrame).toBe(25);
  });

  it('two clips on different tracks — both active → 2 layers sorted by trackIndex', () => {
    const clipA = clipAt(0, 100);
    const clipB = clipAt(0, 100, { trackId: 'track-2' as TrackId });
    const trackA = trackWith([clipA], { index: 0, id: 'track-1' as TrackId });
    const trackB = trackWith([clipB], { index: 2, id: 'track-2' as TrackId });

    // Assign the clips to the correct tracks
    const clipAWithTrack = createClip(makeAssetId(), trackA.id, {
      timelineIn: 0,
      timelineOut: 100,
      sourceIn: 0,
      sourceOut: 100,
    });
    const clipBWithTrack = createClip(makeAssetId(), trackB.id, {
      timelineIn: 0,
      timelineOut: 100,
      sourceIn: 0,
      sourceOut: 100,
    });
    const ta = createTrack('video', { id: trackA.id, clips: [clipAWithTrack], index: 0 });
    const tb = createTrack('video', { id: trackB.id, clips: [clipBWithTrack], index: 2 });

    const project = projectWith([ta, tb]);
    const result = resolveFrame(project, 50);

    expect(result.layers).toHaveLength(2);
    expect(result.layers[0]!.trackIndex).toBeLessThan(result.layers[1]!.trackIndex);
  });

  it('clip with static effects — gaussian-blur with radius=10 → layer has 1 resolved effect', () => {
    const effect = createEffectInstance('gaussian-blur', {
      params: { radius: 10, quality: 'high' },
    });
    const clip = clipAt(0, 60, { effects: [effect] });
    const track = trackWith([clip]);
    const project = projectWith([track]);

    const result = resolveFrame(project, 30);

    expect(result.layers).toHaveLength(1);
    const layer = result.layers[0]!;
    expect(layer.effects).toHaveLength(1);
    expect(layer.effects[0]!.effectType).toBe('gaussian-blur');
    expect(layer.effects[0]!.enabled).toBe(true);
    expect(layer.effects[0]!.params['radius']).toBe(10);
    expect(layer.effects[0]!.params['quality']).toBe('high');
  });

  it('clip with keyframed transform — transform.x keyframed 0→100 over 30 frames, at relative frame 15 → x ≈ 50', () => {
    const kfTrack = createKeyframeTrack('transform.x');
    const kfTrackWithKeys = {
      ...kfTrack,
      keyframes: [createKeyframe(0, 0), createKeyframe(30, 100)],
    };
    const clip = clipAt(0, 60, { keyframes: [kfTrackWithKeys] });
    const track = trackWith([clip]);
    const project = projectWith([track]);

    // Frame 15 = clipLocalFrame 15, linear interpolation between 0→100
    const result = resolveFrame(project, 15);

    expect(result.layers).toHaveLength(1);
    const transform = result.layers[0]!.transform;
    expect(transform.x).toBeCloseTo(50, 1);
  });

  it('clip with keyframed effect — zoom-pan scale keyframed 1→2 over 20 frames, at midpoint → scale ≈ 1.5', () => {
    const kfTrack = createKeyframeTrack('scale');
    const kfTrackWithKeys = {
      ...kfTrack,
      keyframes: [createKeyframe(0, 1), createKeyframe(20, 2)],
    };
    const effect = createEffectInstance('zoom-pan', {
      params: { scale: 1 },
      keyframes: [kfTrackWithKeys],
    });
    const clip = clipAt(0, 60, { effects: [effect] });
    const track = trackWith([clip]);
    const project = projectWith([track]);

    // Frame 10 = clipLocalFrame 10, midpoint of 0→20
    const result = resolveFrame(project, 10);

    expect(result.layers).toHaveLength(1);
    const resolvedEffect = result.layers[0]!.effects[0]!;
    expect(resolvedEffect.effectType).toBe('zoom-pan');
    expect(resolvedEffect.params['scale']).toBeCloseTo(1.5, 1);
  });

  it('frame outside all clips → 0 layers', () => {
    const clip = clipAt(30, 60);
    const track = trackWith([clip]);
    const project = projectWith([track]);

    const result = resolveFrame(project, 100);

    expect(result.layers).toHaveLength(0);
  });

  it('invisible track — clip on hidden track → 0 layers', () => {
    const clip = clipAt(0, 60);
    const track = createTrack('video', {
      clips: [clip],
      visible: false,
    });
    const project = projectWith([track]);

    const result = resolveFrame(project, 30);

    expect(result.layers).toHaveLength(0);
  });

  describe('recording presentation', () => {
    it('no recording asset → default camera transform and cursor', () => {
      const project = projectWith([]);
      const result = resolveFrame(project, 0);

      expect(result.cameraTransform).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
      expect(result.cursor).toEqual({
        style: 'default',
        clickEffect: 'none',
        sizePercent: 100,
        clickSoundEnabled: false,
      });
    });

    it('recording with auto zoom intensity → scale reflects intensity', () => {
      const asset = createAsset('recording', '/test.webm', {
        presentation: {
          zoom: { autoIntensity: 1, markers: [] },
          cursor: { style: 'default', clickEffect: 'none', sizePercent: 100, clickSoundEnabled: false },
        },
      });
      const project = createProject({ assets: [asset] });
      const result = resolveFrame(project, 0);

      // autoIntensity=1 → scale = 1 + (1.08 - 1) * 1 = 1.08
      expect(result.cameraTransform.scale).toBeCloseTo(1.08, 2);
    });

    it('recording with zero auto intensity → scale = 1', () => {
      const asset = createAsset('recording', '/test.webm', {
        presentation: {
          zoom: { autoIntensity: 0, markers: [] },
          cursor: { style: 'default', clickEffect: 'none', sizePercent: 100, clickSoundEnabled: false },
        },
      });
      const project = createProject({ assets: [asset] });
      const result = resolveFrame(project, 0);

      expect(result.cameraTransform.scale).toBeCloseTo(1, 2);
    });

    it('recording with zoom marker at frame → scale from marker strength', () => {
      const asset = createAsset('recording', '/test.webm', {
        presentation: {
          zoom: {
            autoIntensity: 0.5,
            markers: [
              { id: 'zm-1' as import('@rough-cut/project-model').ZoomMarkerId, startFrame: 10, endFrame: 50, kind: 'manual' as const, strength: 0.5 },
            ],
          },
          cursor: { style: 'default', clickEffect: 'none', sizePercent: 100, clickSoundEnabled: false },
        },
      });
      const project = createProject({ assets: [asset] });

      // Frame 20 is inside the marker (10–50)
      const result = resolveFrame(project, 20);
      // strength=0.5 → scale = 1 + (1.2 - 1) * 0.5 = 1.10
      expect(result.cameraTransform.scale).toBeCloseTo(1.10, 2);
    });

    it('frame outside zoom marker → falls back to auto intensity', () => {
      const asset = createAsset('recording', '/test.webm', {
        presentation: {
          zoom: {
            autoIntensity: 0.5,
            markers: [
              { id: 'zm-1' as import('@rough-cut/project-model').ZoomMarkerId, startFrame: 10, endFrame: 50, kind: 'manual' as const, strength: 1 },
            ],
          },
          cursor: { style: 'default', clickEffect: 'none', sizePercent: 100, clickSoundEnabled: false },
        },
      });
      const project = createProject({ assets: [asset] });

      // Frame 60 is outside the marker
      const result = resolveFrame(project, 60);
      // autoIntensity=0.5 → scale = 1 + (1.08 - 1) * 0.5 = 1.04
      expect(result.cameraTransform.scale).toBeCloseTo(1.04, 2);
    });

    it('recording with cursor settings → reflected in resolved cursor', () => {
      const asset = createAsset('recording', '/test.webm', {
        presentation: {
          zoom: { autoIntensity: 0.5, markers: [] },
          cursor: { style: 'spotlight', clickEffect: 'ripple', sizePercent: 120, clickSoundEnabled: true },
        },
      });
      const project = createProject({ assets: [asset] });
      const result = resolveFrame(project, 0);

      expect(result.cursor.style).toBe('spotlight');
      expect(result.cursor.clickEffect).toBe('ripple');
      expect(result.cursor.sizePercent).toBe(120);
      expect(result.cursor.clickSoundEnabled).toBe(true);
    });
  });

  it('transition — two clips with transition, resolve at midpoint → progress ≈ 0.5', () => {
    const trackId = 'track-main' as TrackId;
    const clipA = createClip(makeAssetId(), trackId, {
      timelineIn: 0,
      timelineOut: 60,
      sourceIn: 0,
      sourceOut: 60,
    });
    const clipB = createClip(makeAssetId(), trackId, {
      timelineIn: 50,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 70,
    });
    const track = createTrack('video', {
      id: trackId,
      clips: [clipA, clipB],
    });

    // Transition duration = 10 frames, from frame 50 to 60 (clipA.timelineOut=60, so start=50)
    const transition = {
      id: 'tr-1' as TransitionId,
      type: 'dissolve',
      clipAId: clipA.id as ClipId,
      clipBId: clipB.id as ClipId,
      duration: 10,
      params: {},
      easing: 'linear' as const,
    };

    const project = projectWith([track], [transition]);

    // midpoint of transition: frame 55 (start=50, end=60)
    const result = resolveFrame(project, 55);

    expect(result.transitions).toHaveLength(1);
    const active = result.transitions[0]!;
    expect(active.type).toBe('dissolve');
    expect(active.progress).toBeCloseTo(0.5, 1);
    expect(active.clipAId).toBe(clipA.id);
    expect(active.clipBId).toBe(clipB.id);
  });
});
