import { describe, it, expect } from 'vitest';
import {
  createProject,
  createClip,
  createTrack,
  createAsset,
  createEffectInstance,
  createKeyframeTrack,
  createKeyframe,
  createDefaultCameraPresentation,
} from './factories.js';
import { validateProject, CameraPresentationSchema } from './schemas.js';
import type { AssetId, TrackId } from './types.js';

describe('factories', () => {
  describe('createProject', () => {
    it('produces a valid document that passes schema validation', () => {
      const project = createProject();
      expect(() => validateProject(project)).not.toThrow();
    });

    it('has schema version 3', () => {
      const project = createProject();
      expect(project.version).toBe(3);
    });

    it('has 2 video + 2 audio tracks by default', () => {
      const project = createProject();
      const videoTracks = project.composition.tracks.filter((t) => t.type === 'video');
      const audioTracks = project.composition.tracks.filter((t) => t.type === 'audio');
      expect(videoTracks).toHaveLength(2);
      expect(audioTracks).toHaveLength(2);
    });

    it('has a valid UUID as id', () => {
      const project = createProject();
      expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('supports overrides', () => {
      const project = createProject({ name: 'My Project' });
      expect(project.name).toBe('My Project');
    });
  });

  describe('createClip', () => {
    it('has correct default transform', () => {
      const clip = createClip('a' as AssetId, 't' as TrackId);
      expect(clip.transform.opacity).toBe(1);
      expect(clip.transform.scaleX).toBe(1);
      expect(clip.transform.scaleY).toBe(1);
      expect(clip.transform.anchorX).toBe(0.5);
      expect(clip.transform.anchorY).toBe(0.5);
      expect(clip.transform.rotation).toBe(0);
    });

    it('generates unique IDs across calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createClip('a' as AssetId, 't' as TrackId).id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createTrack', () => {
    it('creates a video track with sensible defaults', () => {
      const track = createTrack('video');
      expect(track.type).toBe('video');
      expect(track.locked).toBe(false);
      expect(track.visible).toBe(true);
      expect(track.volume).toBe(1);
      expect(track.clips).toEqual([]);
    });

    it('creates an audio track', () => {
      const track = createTrack('audio');
      expect(track.type).toBe('audio');
      expect(track.name).toBe('Audio Track');
    });
  });

  describe('createAsset', () => {
    it('creates asset with type and path', () => {
      const asset = createAsset('video', '/path/to/video.mp4');
      expect(asset.type).toBe('video');
      expect(asset.filePath).toBe('/path/to/video.mp4');
      expect(asset.duration).toBe(0);
      expect(asset.metadata).toEqual({});
    });
  });

  describe('createEffectInstance', () => {
    it('creates enabled effect with empty params', () => {
      const effect = createEffectInstance('blur');
      expect(effect.effectType).toBe('blur');
      expect(effect.enabled).toBe(true);
      expect(effect.params).toEqual({});
      expect(effect.keyframes).toEqual([]);
    });
  });

  describe('createKeyframeTrack', () => {
    it('creates track with empty keyframes', () => {
      const track = createKeyframeTrack('transform.x');
      expect(track.property).toBe('transform.x');
      expect(track.keyframes).toEqual([]);
    });
  });

  describe('createKeyframe', () => {
    it('creates keyframe with linear easing by default', () => {
      const kf = createKeyframe(0, 100);
      expect(kf.frame).toBe(0);
      expect(kf.value).toBe(100);
      expect(kf.easing).toBe('linear');
      expect(kf.tangent).toBeUndefined();
    });

    it('accepts string values', () => {
      const kf = createKeyframe(10, '#ff0000');
      expect(kf.value).toBe('#ff0000');
    });

    it('accepts easing overrides', () => {
      const kf = createKeyframe(0, 0, { easing: 'ease-in' });
      expect(kf.easing).toBe('ease-in');
    });
  });

  describe('createDefaultCameraPresentation', () => {
    it('returns expected defaults', () => {
      const camera = createDefaultCameraPresentation();
      expect(camera.shape).toBe('rounded');
      expect(camera.aspectRatio).toBe('1:1');
      expect(camera.roundness).toBe(50);
      expect(camera.size).toBe(100);
      expect(camera.visible).toBe(true);
      expect(camera.padding).toBe(0);
      expect(camera.inset).toBe(0);
      expect(camera.insetColor).toBe('#ffffff');
      expect(camera.shadowEnabled).toBe(true);
      expect(camera.shadowBlur).toBe(24);
      expect(camera.shadowOpacity).toBe(0.45);
    });

    it('passes CameraPresentationSchema validation', () => {
      const camera = createDefaultCameraPresentation();
      expect(() => CameraPresentationSchema.parse(camera)).not.toThrow();
    });
  });

  describe('unique IDs across all factories', () => {
    it('all generated IDs are unique', () => {
      const ids = new Set<string>();
      const project = createProject();
      ids.add(project.id);
      for (const track of project.composition.tracks) {
        ids.add(track.id);
      }
      const asset = createAsset('video', '/test.mp4');
      ids.add(asset.id);
      const effect = createEffectInstance('blur');
      ids.add(effect.id);
      // 1 project + 4 tracks + 1 asset + 1 effect = 7
      expect(ids.size).toBe(7);
    });
  });
});
