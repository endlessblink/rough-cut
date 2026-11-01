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
  rippleTrimClipEdge,
  rippleDeleteRange,
  splitClip,
  TimelineCommandError,
  trimClipEdge,
  trimEdge,
  updateTrackSettings,
} from './timeline-commands.js';
import { assertTimelineInvariants, canonicalizeProjectDocument } from './shared-timeline.js';

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

  it('ripple trims a clip tail and shifts downstream same-track clips by the edge delta', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('a', asset.id, 0, 50), clip('b', asset.id, 80, 120), clip('c', asset.id, 140, 180)] })],
    });

    const result = rippleTrimClipEdge(project, { clipId: 'b', edge: 'tail', frame: 100 });

    expect(result.document.timeline.tracks[0]?.clips.map((item) => [item.id, item.timelineIn, item.timelineOut, item.sourceIn, item.sourceOut])).toEqual([
      ['a', 0, 50, 0, 50],
      ['b', 80, 100, 0, 20],
      ['c', 120, 160, 0, 40],
    ]);
    expect(result.undoSnapshot.type).toBe('rippleTrimClipEdge');
    expect(result.undoSnapshot.before).toEqual(project.timeline);
    assertTimelineInvariants(result.document.timeline);
  });

  it('ripple trims a clip head and shifts downstream same-track clips by the edge delta', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('a', asset.id, 0, 50), clip('b', asset.id, 80, 120), clip('c', asset.id, 140, 180)] })],
    });

    const result = rippleTrimClipEdge(project, { clipId: 'b', edge: 'head', frame: 90 });

    expect(result.document.timeline.tracks[0]?.clips.map((item) => [item.id, item.timelineIn, item.timelineOut, item.sourceIn, item.sourceOut])).toEqual([
      ['a', 0, 50, 0, 50],
      ['b', 90, 120, 10, 40],
      ['c', 150, 190, 0, 40],
    ]);
    assertTimelineInvariants(result.document.timeline);
  });

  it('rejects ripple trims when the edited track is locked', () => {
    const project = commandProject();
    const locked = updateTrackSettings(project, { trackId: 'video-1', locked: true }).document;

    expect(() => rippleTrimClipEdge(locked, { clipId: 'c1', edge: 'tail', frame: 120 })).toThrow(TimelineCommandError);
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

  it('restores a hidden head on a clip already at the timeline start without going negative', () => {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 180 });
    const project = createProject({
      assets: [asset],
      tracks: [track({ clips: [clip('a', asset.id, 0, 164, 16)] })],
    });

    const head = restoreSourceEdge(project, { clipId: 'a', edge: 'head' });
    const full = restoreFullSource(project, { clipId: 'a' });

    expect(head.document.timeline.tracks[0]?.clips[0]).toMatchObject({ timelineIn: 0, timelineOut: 180, sourceIn: 0, sourceOut: 180 });
    expect(full.document.timeline.tracks[0]?.clips[0]).toMatchObject({ timelineIn: 0, timelineOut: 180, sourceIn: 0, sourceOut: 180 });
    assertTimelineInvariants(head.document.timeline);
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

describe('clip ids stay unique across sessions', () => {
  function splitProject() {
    const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
    return createProject({ assets: [asset], tracks: [track({ clips: [clip('c1', asset.id, 0, 300)] })] });
  }

  it('never reissues a split id, even from a fresh counter', () => {
    // 2026-09-26: a counter reset at launch reissued `clip-l-1`, so one click
    // selected two different clips.
    let document = splitProject();
    document = splitClip(document, { clipId: 'c1', frame: 100 }).document;
    const [left] = document.timeline.tracks[0]!.clips;
    document = splitClip(document, { clipId: left!.id, frame: 50 }).document;
    const ids = document.timeline.tracks[0]!.clips.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => !/^clip-[lr]-\d+$/.test(id))).toBe(true);
  });

  it('repairs a saved project that already holds duplicate clip ids, the same way every time', () => {
    const split = splitClip(splitProject(), { clipId: 'c1', frame: 100 }).document;
    const [first, second] = split.timeline.tracks[0]!.clips;
    const damaged = {
      ...split,
      timeline: {
        ...split.timeline,
        tracks: [{ ...split.timeline.tracks[0]!, clips: [first!, { ...second!, id: first!.id }] }],
      },
    };
    const repaired = canonicalizeProjectDocument(damaged as never);
    const ids = repaired.timeline.tracks[0]!.clips.map((item) => item.id);
    expect(ids).toEqual([first!.id, `${first!.id}~2`]);
    expect(canonicalizeProjectDocument(damaged as never).timeline.tracks[0]!.clips.map((item) => item.id)).toEqual(ids);
    expect(repaired.timeline.tracks[0]!.clips[1]).toMatchObject({ timelineIn: 100, timelineOut: 300 });
  });

  it('rejects a timeline with duplicate clip ids', () => {
    const split = splitClip(splitProject(), { clipId: 'c1', frame: 100 }).document;
    const [first, second] = split.timeline.tracks[0]!.clips;
    expect(() => assertTimelineInvariants({
      ...split.timeline,
      tracks: [{ ...split.timeline.tracks[0]!, clips: [first!, { ...second!, id: first!.id }] }],
    })).toThrow(/unique/);
  });
});

describe('trimEdge: the one trim command', () => {
  const asset = createAsset('video', '/tmp/screen.mp4', { id: 'asset-1' as never, duration: 300 });
  // gap: a 0-50, b 80-120, c 140-180   touching: a 0-50, b 50-90, c 90-130   (source starts leave room both sides)
  const layouts = {
    gap: [[0, 50], [80, 120], [140, 180]],
    touching: [[0, 50], [50, 90], [90, 130]],
  } as const;
  function build(layout: keyof typeof layouts) {
    return createProject({
      assets: [asset],
      tracks: [track({ clips: layouts[layout].map(([i, o], n) => clip('abc'[n]!, asset.id, i, o, 100)) })],
    });
  }
  const snapshot = (doc: { timeline: { tracks: readonly { clips: readonly { id: string; timelineIn: number; timelineOut: number; sourceIn: number; sourceOut: number }[] }[] } }) =>
    Object.fromEntries(doc.timeline.tracks[0]!.clips.map((c) => [c.id, [c.timelineIn, c.timelineOut, c.sourceIn, c.sourceOut]]));

  for (const layout of ['gap', 'touching'] as const) {
    for (const target of ['a', 'b', 'c'] as const) {
      for (const edge of ['head', 'tail'] as const) {
        for (const direction of ['shorten', 'extend'] as const) {
          for (const mode of ['normal', 'ripple'] as const) {
            it(`${mode} ${edge} ${direction} on ${target} (${layout})`, () => {
              const project = build(layout);
              const before = snapshot(canonicalizeProjectDocument(project));
              const [tin, tout] = before[target]! as number[];
              const step = direction === 'shorten' ? 5 : 5;
              // head moves right to shorten / left to extend; tail the opposite.
              const frame = edge === 'head' ? tin! + (direction === 'shorten' ? step : -step) : tout! + (direction === 'shorten' ? -step : step);
              const room = edge === 'head' ? tin! - Math.max(0, ...Object.values(before).filter((c) => c[1]! <= tin!).map((c) => c[1]!)) : Infinity;
              const nextIn = Math.min(Infinity, ...Object.values(before).filter((c) => c[0]! >= tout!).map((c) => c[0]!));
              const blocked = mode === 'normal' && direction === 'extend' && (edge === 'head' ? room < step : nextIn - tout! < step);
              if (blocked) {
                // No free space next to this edge: normal trim stops at the neighbour (clamped to 0 here).
                if ((edge === 'head' ? room : nextIn - tout!) === 0) {
                  expect(() => trimEdge(project, { clipId: target, edge, frame, mode })).toThrow(TimelineCommandError);
                  return;
                }
              }
              const result = trimEdge(project, { clipId: target, edge, frame, mode });
              assertTimelineInvariants(result.document.timeline);
              const after = snapshot(result.document);
              const moved = after[target]!;
              for (const c of Object.values(after)) expect(c[3]! - c[2]!).toBe(c[1]! - c[0]!);
              const applied = edge === 'head' ? moved[0]! - tin! : moved[1]! - tout!;
              if (mode === 'normal') {
                // only the dragged edge of the target moved; nothing else
                for (const id of ['a', 'b', 'c'].filter((id) => id !== target)) expect(after[id]).toEqual(before[id]);
                expect(Math.sign(applied)).toBe(Math.sign(frame - (edge === 'head' ? tin! : tout!)));
                if (direction === 'shorten') expect(applied).toBe(edge === 'head' ? step : -step);
              } else {
                // the clip start never moves; later clips slide by the length change; earlier clips stay
                expect(moved[0]).toBe(tin);
                const change = moved[1]! - tout!;
                expect(change).toBe(direction === 'shorten' ? -step : step);
                for (const id of ['a', 'b', 'c'].filter((id) => id !== target)) {
                  const was = before[id]! as number[];
                  const shift = was[0]! >= tout! ? change : 0;
                  expect(after[id]).toEqual([was[0]! + shift, was[1]! + shift, was[2], was[3]]);
                }
              }
            });
          }
        }
      }
    }
  }

  it('ripple head extend reveals earlier footage and grows to the right (clip start stays)', () => {
    const result = trimEdge(build('touching'), { clipId: 'b', edge: 'head', frame: 40, mode: 'ripple' });
    expect(snapshot(result.document)).toEqual({ a: [0, 50, 100, 150], b: [50, 100, 90, 140], c: [100, 140, 100, 140] });
  });

  it('normal extend stops at the neighbour and at the footage handle', () => {
    const project = build('gap');
    expect(snapshot(trimEdge(project, { clipId: 'b', edge: 'tail', frame: 500, mode: 'normal' }).document).b).toEqual([80, 140, 100, 160]);
    expect(snapshot(trimEdge(project, { clipId: 'b', edge: 'head', frame: 0, mode: 'normal' }).document).b).toEqual([50, 120, 70, 140]);
    const handle = createProject({ assets: [asset], tracks: [track({ clips: [clip('a', asset.id, 10, 50, 5)] })] });
    expect(snapshot(trimEdge(handle, { clipId: 'a', edge: 'head', frame: 0, mode: 'normal' }).document).a).toEqual([5, 50, 0, 45]);
  });

  it('roll moves the cut between two touching clips and keeps total length', () => {
    const forward = trimEdge(build('touching'), { clipId: 'b', edge: 'head', frame: 40, mode: 'roll' });
    expect(snapshot(forward.document)).toEqual({ a: [0, 40, 100, 140], b: [40, 90, 90, 140], c: [90, 130, 100, 140] });
    const back = trimEdge(build('touching'), { clipId: 'b', edge: 'tail', frame: 100, mode: 'roll' });
    expect(snapshot(back.document)).toEqual({ a: [0, 50, 100, 150], b: [50, 100, 100, 150], c: [100, 130, 110, 140] });
    expect(() => trimEdge(build('gap'), { clipId: 'b', edge: 'tail', frame: 100, mode: 'roll' })).toThrow(TimelineCommandError);
  });

  it('rejects locked tracks and no-op trims', () => {
    const project = build('gap');
    expect(() => trimEdge(project, { clipId: 'b', edge: 'tail', frame: 120, mode: 'normal' })).toThrow(TimelineCommandError);
    const locked = updateTrackSettings(project, { trackId: 'video-1', locked: true }).document;
    expect(() => trimEdge(locked, { clipId: 'b', edge: 'tail', frame: 110, mode: 'ripple' })).toThrow(TimelineCommandError);
  });
});
