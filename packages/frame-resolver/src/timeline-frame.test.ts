import { describe, expect, it } from 'vitest';
import {
  createAsset,
  createDefaultRecordingPresentation,
  createProject,
} from '@rough-cut/project-model';
import type { NleTrack } from '@rough-cut/project-model';
import { resolveTimelineFrame } from './timeline-frame.js';

function track(overrides: Partial<NleTrack>): NleTrack {
  return {
    id: 'track-1' as never,
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

function clip(
  id: string,
  sourceId: string,
  timelineIn: number,
  timelineOut: number,
  sourceIn = 0,
) {
  return {
    id: id as never,
    source: { kind: 'project-asset' as const, id: sourceId },
    timelineIn,
    timelineOut,
    sourceIn,
    sourceOut: sourceIn + (timelineOut - timelineIn),
  };
}

describe('resolveTimelineFrame', () => {
  it('returns an explicit gap for leading, internal, and trailing gaps', () => {
    const asset = createAsset('recording', '/tmp/screen.webm', { duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('first', asset.id, 10, 20), clip('second', asset.id, 40, 60)] })],
    });

    expect(resolveTimelineFrame(project, 0)).toMatchObject({ isGap: true, video: null, audio: [] });
    expect(resolveTimelineFrame(project, 30)).toMatchObject({ isGap: true, video: null, audio: [] });
    expect(resolveTimelineFrame(project, 60)).toMatchObject({ isGap: true, video: null, audio: [] });
  });

  it('maps timeline time to source media time and uses half-open clip ends', () => {
    const asset = createAsset('recording', '/tmp/screen.webm', { duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('trimmed', asset.id, 50, 100, 120)] })],
    });

    expect(resolveTimelineFrame(project, 50).video?.sourceFrame).toBe(120);
    expect(resolveTimelineFrame(project, 75).video?.sourceFrame).toBe(145);
    expect(resolveTimelineFrame(project, 100).isGap).toBe(true);
  });

  it('resolves cross-track active video, top video, and audio clips', () => {
    const screen = createAsset('recording', '/tmp/screen.webm', { duration: 300 });
    const overlay = createAsset('video', '/tmp/overlay.mp4', { duration: 300 });
    const voice = createAsset('audio', '/tmp/voice.wav', { duration: 300 });
    const project = createProject({
      assets: [screen, overlay, voice],
      tracks: [
        track({ id: 'video-bottom' as never, index: 0, clips: [clip('screen', screen.id, 0, 120)] }),
        track({ id: 'video-top' as never, index: 3, label: 'Overlay', clips: [clip('overlay', overlay.id, 20, 80)] }),
        track({ id: 'audio-1' as never, kind: 'audio', index: 1, label: 'Voice', clips: [clip('voice', voice.id, 0, 120)] }),
      ],
    });
    const result = resolveTimelineFrame(project, 30);

    expect(result.isGap).toBe(false);
    expect(result.video?.clip.id).toBe('overlay');
    expect(result.videoLayers.map((entry) => entry.clip.id)).toEqual(['screen', 'overlay']);
    expect(result.audio.map((entry) => entry.clip.id)).toEqual(['voice']);
  });

  it('resolves linked screen and camera clips with independent source offsets', () => {
    const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset' as never, duration: 330 });
    const recording = createAsset('recording', '/tmp/screen.webm', {
      duration: 300,
      cameraAssetId: camera.id,
      presentation: createDefaultRecordingPresentation(),
    });
    const project = createProject({
      assets: [recording, camera],
      tracks: [
        track({ id: 'screen-track' as never, index: 0, clips: [clip('screen', recording.id, 10, 110, 40)] }),
        track({ id: 'camera-track' as never, index: 1, clips: [clip('camera', camera.id, 10, 110, 70)] }),
      ],
    });

    const result = resolveTimelineFrame(project, 25);
    const linked = result.activeLinkedGroups[0];

    expect(linked?.group.id).toBe(`linked:${recording.id}`);
    expect(linked?.clips.map((entry) => [entry.clip.id, entry.media.kind, entry.sourceFrame])).toEqual([
      ['screen', 'screen', 55],
      ['camera', 'camera', 85],
    ]);
  });

  it('returns active timeline markers and effects only when video is active', () => {
    const asset = createAsset('recording', '/tmp/screen.webm', { duration: 300 });
    const base = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('screen', asset.id, 20, 80)] })],
    });
    const project = {
      ...base,
      timeline: {
        ...base.timeline,
        markers: [{ id: 'zoom-1', kind: 'zoom' as const, startFrame: 30, endFrame: 60, linkedGroupId: `linked:${asset.id}`, params: {} }],
        effects: [{ id: 'effect-1', kind: 'zoom' as const, ownerId: 'timeline', ownerType: 'timeline' as const, startFrame: 30, endFrame: 60, enabled: true, params: {} }],
      },
    };

    expect(resolveTimelineFrame(project, 40).markers.map((marker) => marker.id)).toEqual(['zoom-1']);
    expect(resolveTimelineFrame(project, 40).effects.map((effect) => effect.id)).toEqual(['effect-1']);
    expect(resolveTimelineFrame(project, 10).markers).toEqual([]);
    expect(resolveTimelineFrame(project, 10).effects).toEqual([]);
  });
});
