import { describe, expect, it } from 'vitest';
import {
  createAsset,
  createDefaultCameraPresentation,
  createDefaultRecordingPresentation,
  createProject,
  createZoomMarker,
} from '@rough-cut/project-model';
import type { NleTrack } from '@rough-cut/project-model';
import { resolveTimelinePreviewFrame } from './resolve-frame.js';

function track(overrides: Partial<NleTrack>): NleTrack {
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

function clip(id: string, sourceId: string, timelineIn: number, timelineOut: number, sourceIn = 0) {
  return {
    id: id as never,
    source: { kind: 'project-asset' as const, id: sourceId },
    timelineIn,
    timelineOut,
    sourceIn,
    sourceOut: sourceIn + (timelineOut - timelineIn),
  };
}

describe('resolveTimelinePreviewFrame', () => {
  it('renders timeline gaps as empty preview instructions with hidden cursor', () => {
    const recording = createAsset('recording', '/tmp/screen.webm', {
      duration: 300,
      presentation: createDefaultRecordingPresentation(),
    });
    const project = createProject({
      assets: [recording],
      tracks: [track({ clips: [clip('screen', recording.id, 50, 120, 10)] })],
    });
    const result = resolveTimelinePreviewFrame(project, 10);

    expect(result.layers).toEqual([]);
    expect(result.cursor.visible).toBe(false);
    expect(result.cursor.clickEffect).toBe('none');
    expect(result.cameraTransform).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('resolves active clip preview from timeline time to source media time', () => {
    const recording = createAsset('recording', '/tmp/screen.webm', {
      duration: 300,
      presentation: createDefaultRecordingPresentation(),
    });
    const project = createProject({
      assets: [recording],
      tracks: [track({ clips: [clip('screen', recording.id, 50, 120, 10)] })],
    });
    const result = resolveTimelinePreviewFrame(project, 50);

    expect(result.layers[0]).toMatchObject({ assetId: recording.id, sourceFrame: 10, isCamera: false });
  });

  it('uses the recording source frame for zoom and cursor presentation', () => {
    const presentation = createDefaultRecordingPresentation();
    const recording = createAsset('recording', '/tmp/screen.webm', {
      duration: 300,
      metadata: { width: 1280, height: 720 },
      presentation: {
        ...presentation,
        zoom: {
          ...presentation.zoom,
          followCursor: false,
          markers: [createZoomMarker(15, 40, { strength: 0.5, zoomInDuration: 0, zoomOutDuration: 0 })],
        },
        cursor: { style: 'spotlight', clickEffect: 'ripple', sizePercent: 120, clickSoundEnabled: true },
      },
    });
    const project = createProject({
      assets: [recording],
      tracks: [track({ clips: [clip('screen', recording.id, 100, 160, 10)] })],
    });
    const result = resolveTimelinePreviewFrame(project, 105);

    expect(result.layers[0]?.sourceFrame).toBe(15);
    expect(result.cameraTransform.scale).toBeCloseTo(1.75, 2);
    expect(result.cursor).toMatchObject({ visible: true, style: 'spotlight', clickEffect: 'ripple', sizePercent: 120 });
  });

  it('resolves linked camera PiP layer with independent source offset', () => {
    const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset' as never, duration: 330 });
    const recording = createAsset('recording', '/tmp/screen.webm', {
      id: 'recording-asset' as never,
      duration: 300,
      cameraAssetId: camera.id,
      presentation: {
        ...createDefaultRecordingPresentation(),
        camera: { ...createDefaultCameraPresentation(), visible: true },
      },
    });
    const project = createProject({
      assets: [recording, camera],
      tracks: [
        track({ id: 'screen-track' as never, index: 0, clips: [clip('screen', recording.id, 10, 110, 40)] }),
        track({ id: 'camera-track' as never, index: 1, clips: [clip('camera', camera.id, 10, 110, 70)] }),
      ],
    });
    const result = resolveTimelinePreviewFrame(project, 25);

    expect(result.layers.map((layer) => [layer.assetId, layer.sourceFrame, layer.isCamera])).toEqual([
      [recording.id, 55, false],
      [camera.id, 85, true],
    ]);
    expect(result.cameraPresentation?.visible).toBe(true);
  });
});
