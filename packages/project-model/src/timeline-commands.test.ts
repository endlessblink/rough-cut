import { describe, expect, it } from 'vitest';
import {
  createAsset,
  createDefaultRecordingPresentation,
  createProject,
} from './factories.js';
import type { NleTrack } from './track.js';
import {
  deleteClip,
  moveClip,
  reorderTrack,
  restoreFullSource,
  restoreSourceEdge,
  rippleDeleteRange,
  splitClip,
  TimelineCommandError,
  trimClipEdge,
  updateTrackSettings,
} from './timeline-commands.js';
import { assertTimelineInvariants } from './shared-timeline.js';

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

function commandProject() {
  const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
  return createProject({
    assets: [asset],
    tracks: [track({ clips: [clip('c1', asset.id, 50, 150, 20)] })],
  });
}

describe('timeline command service', () => {
  it('trims head and tail by changing timeline and source edges together', () => {
    const project = commandProject();
    const head = trimClipEdge(project, { clipId: 'c1', edge: 'head', frame: 80 });
    const headClip = head.document.timeline.tracks[0]?.clips[0];
    const tail = trimClipEdge(head.document, { clipId: 'c1', edge: 'tail', frame: 120 });
    const tailClip = tail.document.timeline.tracks[0]?.clips[0];

    expect(headClip).toMatchObject({ timelineIn: 80, timelineOut: 150, sourceIn: 50, sourceOut: 120 });
    expect(tailClip).toMatchObject({ timelineIn: 80, timelineOut: 120, sourceIn: 50, sourceOut: 90 });
    expect(head.undoSnapshot).toMatchObject({ type: 'trimClipEdge' });
    expect(head.undoSnapshot.before).toEqual(project.timeline);
    assertTimelineInvariants(tail.document.timeline);
  });

  it('moves a clip by timeline time only', () => {
    const project = commandProject();
    const result = moveClip(project, { clipId: 'c1', timelineIn: 100 });
    const moved = result.document.timeline.tracks[0]?.clips[0];

    expect(moved).toMatchObject({ timelineIn: 100, timelineOut: 200, sourceIn: 20, sourceOut: 120 });
    expect(result.undoSnapshot.type).toBe('moveClip');
  });

  it('moves clips across same-kind tracks while preserving source offsets', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [
        track({ id: 'v1' as never, index: 0, clips: [clip('c1', asset.id, 20, 80, 10)] }),
        track({ id: 'v2' as never, index: 1, label: 'Video 2', clips: [] }),
      ],
    });
    const result = moveClip(project, { clipId: 'c1', timelineIn: 100, targetTrackId: 'v2' });

    expect(result.document.timeline.tracks[0]?.clips).toEqual([]);
    expect(result.document.timeline.tracks[1]?.clips[0]).toMatchObject({
      id: 'c1',
      trackId: 'v2',
      timelineIn: 100,
      timelineOut: 160,
      sourceIn: 10,
      sourceOut: 70,
    });
  });

  it('moves linked clips in time when one linked clip changes compatible tracks', () => {
    const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset' as never, duration: 330 });
    const recording = createAsset('recording', '/tmp/screen.webm', {
      id: 'recording-asset' as never,
      duration: 300,
      cameraAssetId: camera.id,
      presentation: createDefaultRecordingPresentation(),
    });
    const project = createProject({
      assets: [recording, camera],
      tracks: [
        track({ id: 'screen-track' as never, index: 0, clips: [clip('screen', recording.id, 0, 100, 10)] }),
        track({ id: 'camera-track' as never, index: 1, clips: [clip('camera', camera.id, 0, 100, 40)] }),
        track({ id: 'overlay-track' as never, index: 2, clips: [] }),
      ],
    });
    const result = moveClip(project, { clipId: 'screen', timelineIn: 120, targetTrackId: 'overlay-track' });

    expect(result.document.timeline.tracks.find((track) => track.id === 'screen-track')?.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'overlay-track')?.clips[0]).toMatchObject({
      id: 'screen',
      timelineIn: 120,
      timelineOut: 220,
      sourceIn: 10,
      sourceOut: 110,
    });
    expect(result.document.timeline.tracks.find((track) => track.id === 'camera-track')?.clips[0]).toMatchObject({
      id: 'camera',
      timelineIn: 120,
      timelineOut: 220,
      sourceIn: 40,
      sourceOut: 140,
    });
  });

  it('rejects clip mutations on locked tracks but keeps locked tracks playable elsewhere', () => {
    const project = commandProject();
    const locked = updateTrackSettings(project, { trackId: 'video-1', locked: true }).document;

    expect(locked.timeline.tracks[0]?.locked).toBe(true);
    expect(() => moveClip(locked, { clipId: 'c1', timelineIn: 100 })).toThrow(TimelineCommandError);
    expect(() => trimClipEdge(locked, { clipId: 'c1', edge: 'head', frame: 90 })).toThrow(TimelineCommandError);
    expect(() => splitClip(locked, { clipId: 'c1', frame: 100 })).toThrow(TimelineCommandError);
    expect(() => deleteClip(locked, { clipId: 'c1' })).toThrow(TimelineCommandError);
  });

  it('updates track mute and height and reorders visual track indices', () => {
    const asset = createAsset('audio', '/tmp/audio.wav', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [
        track({ id: 'a1' as never, kind: 'audio', index: 0, label: 'A1', clips: [clip('a', asset.id, 0, 50)] }),
        track({ id: 'a2' as never, kind: 'audio', index: 1, label: 'A2', clips: [] }),
      ],
    });
    const updated = updateTrackSettings(project, { trackId: 'a1', muted: true, height: 84 }).document;
    const reordered = reorderTrack(updated, { trackId: 'a1', direction: 'up' }).document;

    expect(updated.timeline.tracks[0]).toMatchObject({ muted: true, height: 84 });
    expect(reordered.timeline.tracks.find((track) => track.id === 'a1')?.index).toBe(1);
    expect(reordered.timeline.tracks.find((track) => track.id === 'a2')?.index).toBe(0);
  });

  it('splits all linked recording clips at the same timeline frame', () => {
    const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset' as never, duration: 330 });
    const recording = createAsset('recording', '/tmp/screen.webm', {
      id: 'recording-asset' as never,
      duration: 300,
      cameraAssetId: camera.id,
      presentation: createDefaultRecordingPresentation(),
    });
    const project = createProject({
      assets: [recording, camera],
      tracks: [
        track({ id: 'screen-track' as never, index: 0, clips: [clip('screen', recording.id, 0, 100, 10)] }),
        track({ id: 'camera-track' as never, index: 1, clips: [clip('camera', camera.id, 0, 100, 40)] }),
      ],
    });
    const ids = ['screen-l', 'screen-r', 'camera-l', 'camera-r'];
    const result = splitClip(project, { clipId: 'screen', frame: 50, idFactory: () => ids.shift()! });

    expect(result.document.timeline.tracks[0]?.clips).toMatchObject([
      { id: 'screen-l', timelineIn: 0, timelineOut: 50, sourceIn: 10, sourceOut: 60 },
      { id: 'screen-r', timelineIn: 50, timelineOut: 100, sourceIn: 60, sourceOut: 110 },
    ]);
    expect(result.document.timeline.tracks[1]?.clips).toMatchObject([
      { id: 'camera-l', timelineIn: 0, timelineOut: 50, sourceIn: 40, sourceOut: 90 },
      { id: 'camera-r', timelineIn: 50, timelineOut: 100, sourceIn: 90, sourceOut: 140 },
    ]);
    assertTimelineInvariants(result.document.timeline);
  });

  it('edits only the selected linked segment after a split, not every sibling segment', () => {
    const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset' as never, duration: 330 });
    const recording = createAsset('recording', '/tmp/screen.webm', {
      id: 'recording-asset' as never,
      duration: 300,
      cameraAssetId: camera.id,
      presentation: createDefaultRecordingPresentation(),
    });
    const project = createProject({
      assets: [recording, camera],
      tracks: [
        track({ id: 'screen-track' as never, index: 0, clips: [clip('screen', recording.id, 0, 100, 10)] }),
        track({ id: 'camera-track' as never, index: 1, clips: [clip('camera', camera.id, 0, 100, 40)] }),
      ],
    });
    const ids = ['screen-l', 'screen-r', 'camera-l', 'camera-r'];
    const split = splitClip(project, { clipId: 'screen', frame: 50, idFactory: () => ids.shift()! });
    const moved = moveClip(split.document, { clipId: 'screen-r', timelineIn: 120 }).document;
    const trimmed = trimClipEdge(moved, { clipId: 'screen-r', edge: 'tail', frame: 150 }).document;

    expect(trimmed.timeline.tracks[0]?.clips).toMatchObject([
      { id: 'screen-l', timelineIn: 0, timelineOut: 50, sourceIn: 10, sourceOut: 60 },
      { id: 'screen-r', timelineIn: 120, timelineOut: 150, sourceIn: 60, sourceOut: 90 },
    ]);
    expect(trimmed.timeline.tracks[1]?.clips).toMatchObject([
      { id: 'camera-l', timelineIn: 0, timelineOut: 50, sourceIn: 40, sourceOut: 90 },
      { id: 'camera-r', timelineIn: 120, timelineOut: 150, sourceIn: 90, sourceOut: 120 },
    ]);
    assertTimelineInvariants(trimmed.timeline);
  });

  it('defaults deleteClip to leave-gap and supports explicit ripple deletes', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('a', asset.id, 0, 50), clip('b', asset.id, 80, 120), clip('c', asset.id, 150, 180)] })],
    });
    const leaveGap = deleteClip(project, { clipId: 'b' });
    const ripple = deleteClip(project, { clipId: 'b', mode: 'ripple' });

    expect(leaveGap.document.timeline.tracks[0]?.clips.map((item) => [item.id, item.timelineIn, item.timelineOut])).toEqual([
      ['a', 0, 50],
      ['c', 150, 180],
    ]);
    expect(ripple.document.timeline.tracks[0]?.clips.map((item) => [item.id, item.timelineIn, item.timelineOut])).toEqual([
      ['a', 0, 50],
      ['c', 110, 140],
    ]);
  });

  it('rippleDeleteRange removes whole clips and shifts following timeline time', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('a', asset.id, 0, 50), clip('b', asset.id, 50, 100), clip('c', asset.id, 120, 180)] })],
    });
    const result = rippleDeleteRange(project, { startFrame: 50, endFrame: 100 });

    expect(result.document.timeline.tracks[0]?.clips.map((item) => [item.id, item.timelineIn, item.timelineOut])).toEqual([
      ['a', 0, 50],
      ['c', 70, 130],
    ]);
    expect(result.undoSnapshot.type).toBe('rippleDeleteRange');
  });

  it('restores a source edge and the full source range', () => {
    const project = commandProject();
    const head = restoreSourceEdge(project, { clipId: 'c1', edge: 'head' });
    const full = restoreFullSource(project, { clipId: 'c1' });

    expect(head.document.timeline.tracks[0]?.clips[0]).toMatchObject({
      timelineIn: 30,
      timelineOut: 150,
      sourceIn: 0,
      sourceOut: 120,
    });
    expect(full.document.timeline.tracks[0]?.clips[0]).toMatchObject({
      timelineIn: 30,
      timelineOut: 330,
      sourceIn: 0,
      sourceOut: 300,
    });
  });

  it('rejects overlaps, invalid ranges, and partial ripple ranges', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('a', asset.id, 0, 50), clip('b', asset.id, 80, 120)] })],
    });

    expect(() => moveClip(project, { clipId: 'b', timelineIn: 40 })).toThrow(TimelineCommandError);
    expect(() => trimClipEdge(project, { clipId: 'b', edge: 'head', frame: 130 })).toThrow(TimelineCommandError);
    expect(() => rippleDeleteRange(project, { startFrame: 40, endFrame: 90 })).toThrow(TimelineCommandError);
  });
});
