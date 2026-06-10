import { describe, expect, it } from 'vitest';
import {
  createAsset,
  createClip,
  createDefaultCameraPresentation,
  createDefaultRecordingPresentation,
  createProject,
  createTrack,
  createZoomMarker,
} from '@rough-cut/project-model';
import type { NleTrack, TrackId } from '@rough-cut/project-model';
import { resolveFrame, resolveTimelinePreviewFrame } from './resolve-frame.js';
import { resolveCompositionFrame } from './composition-frame.js';

function nleTrack(overrides: Partial<NleTrack>): NleTrack {
  return {
    id: 'video-1' as never,
    kind: 'video',
    index: 0,
    label: 'Video 1',
    enabled: true,
    locked: false,
    muted: false,
    clips: [],
    ...overrides,
  };
}

function nleClip(id: string, sourceId: string, timelineIn: number, timelineOut: number, sourceIn = 0) {
  return {
    id: id as never,
    source: { kind: 'project-asset' as const, id: sourceId },
    timelineIn,
    timelineOut,
    sourceIn,
    sourceOut: sourceIn + (timelineOut - timelineIn),
  };
}

function recordingProject() {
  const presentation = {
    ...createDefaultRecordingPresentation(),
    zoom: {
      ...createDefaultRecordingPresentation().zoom,
      followCursor: false,
      markers: [createZoomMarker(10, 70, { strength: 0.5, zoomInDuration: 10, zoomOutDuration: 10 })],
    },
    cursor: { style: 'spotlight' as const, clickEffect: 'ring' as const, sizePercent: 125, clickSoundEnabled: true },
    screenCrop: { enabled: true, x: 100, y: 50, width: 1000, height: 500, aspectRatio: 'free' as const },
    screenFrame: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 },
    cameraFrame: { x: 0.72, y: 0.66, w: 0.18, h: 0.24 },
    camera: { ...createDefaultCameraPresentation(), visible: true, shape: 'circle' as const },
  };
  const camera = createAsset('video', '/tmp/camera.mp4', {
    id: 'camera-asset' as never,
    duration: 120,
    metadata: { width: 640, height: 480, isCamera: true },
  });
  const recording = createAsset('recording', '/tmp/screen.webm', {
    id: 'recording-asset' as never,
    duration: 120,
    metadata: { width: 1280, height: 720, fps: 30 },
    cameraAssetId: camera.id,
    presentation,
  });
  const screenTrackId = 'screen-track' as TrackId;
  const cameraTrackId = 'camera-track' as TrackId;
  return createProject({
    assets: [recording, camera],
    composition: {
      duration: 120,
      transitions: [],
      tracks: [
        createTrack('video', {
          id: screenTrackId,
          index: 0,
          clips: [createClip(recording.id, screenTrackId, { timelineIn: 0, timelineOut: 120, sourceIn: 0, sourceOut: 120 })],
        }),
        createTrack('video', {
          id: cameraTrackId,
          index: 1,
          clips: [createClip(camera.id, cameraTrackId, { timelineIn: 0, timelineOut: 120, sourceIn: 0, sourceOut: 120 })],
        }),
      ],
    },
    tracks: [
      nleTrack({ id: 'nle-screen' as never, index: 0, clips: [nleClip('screen', recording.id, 20, 90, 5)] }),
      nleTrack({ id: 'nle-camera' as never, index: 1, clips: [nleClip('camera', camera.id, 20, 90, 5)] }),
    ],
  });
}

describe('resolveCompositionFrame', () => {
  it('matches existing recording preview values for no-zoom frames', () => {
    const project = recordingProject();
    const expected = resolveFrame(project, 0);
    const frame = resolveCompositionFrame(project, 0, { mode: 'recording' });

    expect(frame.timelineGap).toBe(false);
    expect(frame.screenLayer?.assetId).toBe(expected.layers.find((layer) => !layer.isCamera)?.assetId);
    expect(frame.screenLayer?.sourceFrame).toBe(0);
    expect(frame.screenLayer?.zoomTransform).toEqual(expected.cameraTransform);
    expect(frame.screenLayer?.crop).toEqual(expected.screenCrop);
    expect(frame.screenLayer?.frame).toEqual(expected.screenFrame);
    expect(frame.backgroundLayer.style).toEqual(expected.background);
  });

  it('exposes zoom ramp-in, hold, ramp-out, and motion velocity metadata', () => {
    const project = recordingProject();
    const rampIn = resolveCompositionFrame(project, 15, { mode: 'recording' });
    const hold = resolveCompositionFrame(project, 40, { mode: 'recording' });
    const rampOut = resolveCompositionFrame(project, 66, { mode: 'recording' });

    expect(rampIn.screenLayer?.zoomTransform.scale).toBeGreaterThan(1);
    expect(rampIn.screenLayer?.zoomTransform.scale).toBeLessThan(hold.screenLayer!.zoomTransform.scale);
    expect(hold.screenLayer?.zoomTransform.scale).toBeCloseTo(resolveFrame(project, 40).cameraTransform.scale, 5);
    expect(rampOut.screenLayer?.zoomTransform.scale).toBeGreaterThan(1);
    expect(rampOut.screenLayer?.zoomTransform.scale).toBeLessThan(hold.screenLayer!.zoomTransform.scale);
    expect(Math.abs(rampIn.motion.zoomVelocity.scalePerFrame)).toBeGreaterThan(0);
    expect(hold.motion.current).toEqual(hold.screenLayer?.zoomTransform);
  });

  it('resolves cursor visible and offscreen states from the same source frame', () => {
    const project = recordingProject();
    const inside = resolveCompositionFrame(project, 30, {
      mode: 'recording',
      getCursorPosition: () => ({ x: 0.5, y: 0.5 }),
    });
    const outside = resolveCompositionFrame(project, 30, {
      mode: 'recording',
      getCursorPosition: () => ({ x: 1.2, y: -0.1 }),
    });

    expect(inside.cursorLayer).toMatchObject({ visible: true, style: 'spotlight', sizePercent: 125, offscreen: false });
    expect(inside.clickLayer).toMatchObject({ visible: true, effect: 'ring', sourceFrame: 30 });
    expect(outside.cursorLayer).toMatchObject({ visible: true, offscreen: true });
  });

  it('includes camera PiP source, frame, crop, and presentation without switching renderers', () => {
    const project = recordingProject();
    const expected = resolveFrame(project, 25);
    const frame = resolveCompositionFrame(project, 25, { mode: 'recording' });

    expect(frame.cameraLayer?.assetId).toBe('camera-asset');
    expect(frame.cameraLayer?.sourceFrame).toBe(25);
    expect(frame.cameraLayer?.frame).toEqual(expected.cameraFrame);
    expect(frame.cameraLayer?.presentation).toEqual(expected.cameraPresentation);
    expect(frame.cameraLayer?.sourceSize).toEqual({ width: 640, height: 480 });
  });

  it('uses the same NLE timeline frame mapping as resolveTimelinePreviewFrame', () => {
    const project = recordingProject();
    const expected = resolveTimelinePreviewFrame(project, 30);
    const frame = resolveCompositionFrame(project, 30, { mode: 'timeline' });

    expect(frame.timelineGap).toBe(false);
    expect(frame.screenLayer?.sourceFrame).toBe(expected.layers.find((layer) => !layer.isCamera)?.sourceFrame);
    expect(frame.cameraLayer?.sourceFrame).toBe(expected.layers.find((layer) => layer.isCamera)?.sourceFrame);
    expect(frame.screenLayer?.zoomTransform).toEqual(expected.cameraTransform);
  });

  it('represents timeline gaps without stale screen or camera layers', () => {
    const project = recordingProject();
    const frame = resolveCompositionFrame(project, 10, { mode: 'timeline' });

    expect(frame.timelineGap).toBe(true);
    expect(frame.screenLayer).toBeNull();
    expect(frame.cameraLayer).toBeNull();
    expect(frame.cursorLayer.visible).toBe(false);
    expect(frame.motion.current).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
