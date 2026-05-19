import test from 'node:test';
import assert from 'node:assert/strict';
import { canSplitClipById, moveClipById, removeClipById, splitClipById, trimClipById } from './clip-mutations.mjs';

const makeProject = (tracks) => ({
  path: '/tmp/p.roughcut',
  document: {
    name: 'demo',
    composition: { duration: 600, tracks },
  },
});

const makeProjectWithNleTracks = (tracks) => ({
  ...makeProject(tracks),
  document: {
    ...makeProject(tracks).document,
    tracks: tracks.map((track) => ({
      id: track.id,
      kind: track.type,
      index: track.index ?? 0,
      label: track.name ?? track.type,
      enabled: track.visible !== false,
      locked: track.locked === true,
      muted: track.type === 'audio' && track.volume === 0,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        source: { kind: 'project-asset', id: clip.assetId },
        timelineIn: clip.timelineIn,
        timelineOut: clip.timelineOut,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
      })),
    })),
  },
});

const makeProjectWithSharedTimelineTracks = (tracks, timelineTracks = tracks.map(toNleTrack)) => ({
  ...makeProjectWithNleTracks(tracks),
  document: {
    ...makeProjectWithNleTracks(tracks).document,
    timeline: { tracks: timelineTracks },
  },
});

function toNleTrack(track) {
  return {
    id: track.id,
    kind: track.type,
    index: track.index ?? 0,
    label: track.name ?? track.type,
    enabled: track.visible !== false,
    locked: track.locked === true,
    muted: track.type === 'audio' && track.volume === 0,
    clips: track.clips.map((clip) => ({
      id: clip.id,
      source: { kind: 'project-asset', id: clip.assetId },
      timelineIn: clip.timelineIn,
      timelineOut: clip.timelineOut,
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
    })),
  };
}

const baseClip = {
  id: 'c1',
  assetId: 'a1',
  trackId: 't1',
  timelineIn: 0,
  timelineOut: 300,
  sourceIn: 0,
  sourceOut: 300,
};

test('removeClipById returns a NEW project with the clip removed', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip, { ...baseClip, id: 'c2', timelineIn: 300, timelineOut: 600, sourceIn: 0, sourceOut: 300 }] }]);
  const next = removeClipById(project, 'c1');
  assert.notEqual(next, project, 'returns new project reference');
  assert.notEqual(next.document, project.document, 'document is new');
  assert.notEqual(next.document.composition, project.document.composition, 'composition is new');
  const clips = next.document.composition.tracks[0].clips;
  assert.equal(clips.length, 1);
  assert.equal(clips[0].id, 'c2');
});

test('removeClipById returns the SAME project reference when clip is not found (cheap no-op signal)', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = removeClipById(project, 'nonexistent');
  assert.equal(next, project);
});

test('splitClipById replaces the original clip with two new clips covering the same range', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = splitClipById(project, 'c1', 100);
  assert.notEqual(next, project);
  const clips = next.document.composition.tracks[0].clips;
  assert.equal(clips.length, 2);
  // Order preserved (left first, right second).
  assert.equal(clips[0].timelineIn, 0);
  assert.equal(clips[0].timelineOut, 100);
  assert.equal(clips[1].timelineIn, 100);
  assert.equal(clips[1].timelineOut, 300);
  // Half-open continuity invariant — total span unchanged.
  const span = (clips[0].timelineOut - clips[0].timelineIn) + (clips[1].timelineOut - clips[1].timelineIn);
  assert.equal(span, baseClip.timelineOut - baseClip.timelineIn);
  // IDs are fresh and distinct.
  assert.notEqual(clips[0].id, baseClip.id);
  assert.notEqual(clips[1].id, baseClip.id);
  assert.notEqual(clips[0].id, clips[1].id);
});

test('splitClipById keeps top-level NLE tracks in sync for dynamic timeline rendering', () => {
  const project = makeProjectWithNleTracks([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = splitClipById(project, 'c1', 100);
  const compositionClips = next.document.composition.tracks[0].clips;
  const nleClips = next.document.tracks[0].clips;

  assert.equal(nleClips.length, 2);
  assert.deepEqual(nleClips.map((clip) => clip.id), compositionClips.map((clip) => clip.id));
  assert.deepEqual(nleClips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 100], [100, 300]]);
  assert.equal(nleClips[0].source.id, 'a1');
});

test('removeClipById keeps top-level NLE tracks in sync for dynamic timeline rendering', () => {
  const project = makeProjectWithNleTracks([{ id: 't1', type: 'video', clips: [baseClip, { ...baseClip, id: 'c2', timelineIn: 300, timelineOut: 600 }] }]);
  const next = removeClipById(project, 'c1');

  assert.equal(next.document.composition.tracks[0].clips.length, 1);
  assert.equal(next.document.tracks[0].clips.length, 1);
  assert.equal(next.document.tracks[0].clips[0].id, 'c2');
});

test('removeClipById uses shared timeline tracks first and mirrors transitional fields', () => {
  const compositionClip = { ...baseClip, timelineOut: 300, sourceOut: 300 };
  const timelineClip = { id: 'c1', source: { kind: 'project-asset', id: 'a1' }, timelineIn: 40, timelineOut: 260, sourceIn: 40, sourceOut: 260 };
  const project = makeProjectWithSharedTimelineTracks(
    [{ id: 't1', type: 'video', clips: [compositionClip, { ...baseClip, id: 'c2', timelineIn: 300, timelineOut: 600 }] }],
    [{ id: 't1', kind: 'video', index: 0, label: 'Video', enabled: true, locked: false, muted: false, clips: [timelineClip] }],
  );

  const next = removeClipById(project, 'c1');
  assert.equal(next.document.timeline.tracks[0].clips.length, 0);
  assert.deepEqual(next.document.tracks[0].clips.map((clip) => clip.id), []);
  assert.deepEqual(next.document.composition.tracks[0].clips.map((clip) => clip.id), []);
});

test('splitClipById is a no-op at clip edges or outside', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  assert.equal(splitClipById(project, 'c1', 0), project);
  assert.equal(splitClipById(project, 'c1', 300), project);
  assert.equal(splitClipById(project, 'c1', 1000), project);
});

test('canSplitClipById reports whether splitClipById would mutate', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  assert.equal(canSplitClipById(project, 'c1', 100), true);
  assert.equal(canSplitClipById(project, 'c1', 0), false);
  assert.equal(canSplitClipById(project, 'missing', 100), false);
});

test('splitClipById is a no-op for an unknown clip id', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  assert.equal(splitClipById(project, 'nope', 50), project);
});

test('clip-mutations preserve sibling tracks (only the touched track is replaced)', () => {
  const otherTrack = { id: 't2', type: 'audio', clips: [{ ...baseClip, id: 'a1', trackId: 't2' }] };
  const project = makeProject([
    { id: 't1', type: 'video', clips: [baseClip] },
    otherTrack,
  ]);
  const next = removeClipById(project, 'c1');
  assert.equal(next.document.composition.tracks[1], otherTrack, 'sibling track preserved by reference');
});

test('trimClipById trims the left edge and keeps source timing aligned', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = trimClipById(project, 'c1', 'left', 80);
  assert.notEqual(next, project);
  const clip = next.document.composition.tracks[0].clips[0];
  assert.equal(clip.timelineIn, 80);
  assert.equal(clip.timelineOut, 300);
  assert.equal(clip.sourceIn, 80);
  assert.equal(clip.sourceOut, 300);
});

test('trimClipById trims the right edge and keeps source timing aligned', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = trimClipById(project, 'c1', 'right', 180);
  const clip = next.document.composition.tracks[0].clips[0];
  assert.equal(clip.timelineIn, 0);
  assert.equal(clip.timelineOut, 180);
  assert.equal(clip.sourceIn, 0);
  assert.equal(clip.sourceOut, 180);
});

test('trimClipById clamps trims before neighbors and preserves half-open span', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [
    { ...baseClip, id: 'c0', timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 },
    { ...baseClip, id: 'c1', timelineIn: 100, timelineOut: 300, sourceIn: 100, sourceOut: 300 },
    { ...baseClip, id: 'c2', timelineIn: 340, timelineOut: 500, sourceIn: 0, sourceOut: 160 },
  ] }]);

  const left = trimClipById(project, 'c1', 'left', 20).document.composition.tracks[0].clips[1];
  assert.equal(left.timelineIn, 80);
  assert.equal(left.sourceIn, 80);

  const right = trimClipById(project, 'c1', 'right', 500).document.composition.tracks[0].clips[1];
  assert.equal(right.timelineOut, 340);
  assert.equal(right.sourceOut, 340);
});

test('trimClipById refuses inverted edge trims and invalid clips', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [baseClip] }]);
  assert.equal(trimClipById(project, 'c1', 'left', 300).document.composition.tracks[0].clips[0].timelineIn, 299);
  assert.equal(trimClipById(project, 'c1', 'right', 0).document.composition.tracks[0].clips[0].timelineOut, 1);
  assert.equal(trimClipById(project, 'missing', 'right', 100), project);
  assert.equal(trimClipById(project, 'c1', 'middle', 100), project);
});

test('trimClipById keeps top-level NLE tracks in sync', () => {
  const project = makeProjectWithNleTracks([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = trimClipById(project, 'c1', 'left', 90);
  assert.equal(next.document.composition.tracks[0].clips[0].timelineIn, 90);
  assert.equal(next.document.tracks[0].clips[0].timelineIn, 90);
  assert.equal(next.document.tracks[0].clips[0].sourceIn, 90);
});

test('trimClipById trims linked recording screen and camera clips together', () => {
  const screen = { ...baseClip, id: 'screen', assetId: 'recording', timelineIn: 0, timelineOut: 180, sourceIn: 0, sourceOut: 180 };
  const camera = { ...baseClip, id: 'camera', assetId: 'camera', timelineIn: 0, timelineOut: 180, sourceIn: 30, sourceOut: 210 };
  const project = makeProjectWithSharedTimelineTracks([
    { id: 'screen-track', type: 'video', clips: [screen] },
    { id: 'camera-track', type: 'video', clips: [camera] },
  ]);
  project.document.assets = [{ id: 'recording', type: 'recording', cameraAssetId: 'camera' }, { id: 'camera', type: 'video' }];

  const next = trimClipById(project, 'screen', 'left', 45);

  assert.equal(next.document.timeline.tracks[0].clips[0].timelineIn, 45);
  assert.equal(next.document.timeline.tracks[0].clips[0].sourceIn, 45);
  assert.equal(next.document.timeline.tracks[1].clips[0].timelineIn, 45);
  assert.equal(next.document.timeline.tracks[1].clips[0].sourceIn, 75);
});

test('splitClipById keeps shared timeline, top-level tracks, and composition tracks in sync', () => {
  const project = makeProjectWithSharedTimelineTracks([{ id: 't1', type: 'video', clips: [baseClip] }]);
  const next = splitClipById(project, 'c1', 120);

  const timelineClips = next.document.timeline.tracks[0].clips;
  const nleClips = next.document.tracks[0].clips;
  const compositionClips = next.document.composition.tracks[0].clips;
  assert.equal(timelineClips.length, 2);
  assert.deepEqual(nleClips.map((clip) => clip.id), timelineClips.map((clip) => clip.id));
  assert.deepEqual(compositionClips.map((clip) => clip.id), timelineClips.map((clip) => clip.id));
  assert.deepEqual(timelineClips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 120], [120, 300]]);
  assert.deepEqual(compositionClips.map((clip) => clip.assetId), ['a1', 'a1']);
});

test('trimClipById uses shared timeline source range when mirrors are stale', () => {
  const project = makeProjectWithSharedTimelineTracks(
    [{ id: 't1', type: 'video', clips: [{ ...baseClip, timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 }] }],
    [{ id: 't1', kind: 'video', index: 0, label: 'Video', enabled: true, locked: false, muted: false, clips: [{ id: 'c1', source: { kind: 'project-asset', id: 'a1' }, timelineIn: 50, timelineOut: 250, sourceIn: 50, sourceOut: 250 }] }],
  );

  const next = trimClipById(project, 'c1', 'left', 80);
  assert.equal(next.document.timeline.tracks[0].clips[0].timelineIn, 80);
  assert.equal(next.document.timeline.tracks[0].clips[0].sourceIn, 80);
  assert.equal(next.document.tracks[0].clips[0].timelineIn, 80);
  assert.equal(next.document.composition.tracks[0].clips[0].timelineIn, 80);
});

test('trimClipById repairs empty shared timeline when editing a top-level track', () => {
  const project = makeProjectWithSharedTimelineTracks([{ id: 't1', type: 'video', clips: [baseClip] }], []);

  const next = trimClipById(project, 'c1', 'right', 180);

  assert.equal(next.document.timeline.tracks.length, 1);
  assert.equal(next.document.timeline.tracks[0].clips[0].timelineOut, 180);
  assert.equal(next.document.tracks[0].clips[0].timelineOut, 180);
  assert.equal(next.document.composition.tracks[0].clips[0].timelineOut, 180);
});

test('moveClipById moves clip timeline placement without changing source range', () => {
  const project = makeProjectWithSharedTimelineTracks([{ id: 't1', type: 'video', clips: [baseClip] }]);

  const next = moveClipById(project, 'c1', 90);
  const timelineClip = next.document.timeline.tracks[0].clips[0];
  const nleClip = next.document.tracks[0].clips[0];
  const compositionClip = next.document.composition.tracks[0].clips[0];

  assert.equal(timelineClip.timelineIn, 90);
  assert.equal(timelineClip.timelineOut, 390);
  assert.equal(timelineClip.sourceIn, 0);
  assert.equal(timelineClip.sourceOut, 300);
  assert.equal(nleClip.timelineIn, 90);
  assert.equal(compositionClip.timelineIn, 90);
});

test('moveClipById moves linked recording screen and camera clips together', () => {
  const screen = { ...baseClip, id: 'screen', assetId: 'recording', timelineIn: 30, timelineOut: 180, sourceIn: 30, sourceOut: 180 };
  const camera = { ...baseClip, id: 'camera', assetId: 'camera', timelineIn: 30, timelineOut: 180, sourceIn: 60, sourceOut: 210 };
  const project = makeProjectWithSharedTimelineTracks([
    { id: 'screen-track', type: 'video', clips: [screen] },
    { id: 'camera-track', type: 'video', clips: [camera] },
  ]);
  project.document.assets = [{ id: 'recording', type: 'recording', cameraAssetId: 'camera' }, { id: 'camera', type: 'video' }];

  const next = moveClipById(project, 'screen', 90);
  const screenClip = next.document.timeline.tracks[0].clips[0];
  const cameraClip = next.document.timeline.tracks[1].clips[0];

  assert.equal(screenClip.timelineIn, 90);
  assert.equal(screenClip.timelineOut, 240);
  assert.equal(screenClip.sourceIn, 30);
  assert.equal(screenClip.sourceOut, 180);
  assert.equal(cameraClip.timelineIn, 90);
  assert.equal(cameraClip.timelineOut, 240);
  assert.equal(cameraClip.sourceIn, 60);
  assert.equal(cameraClip.sourceOut, 210);
});

test('moveClipById moves linked recording clips when dragging the camera clip', () => {
  const screen = { ...baseClip, id: 'screen', assetId: 'recording', timelineIn: 30, timelineOut: 180, sourceIn: 30, sourceOut: 180 };
  const camera = { ...baseClip, id: 'camera', assetId: 'camera', timelineIn: 30, timelineOut: 180, sourceIn: 60, sourceOut: 210 };
  const project = makeProjectWithSharedTimelineTracks([
    { id: 'screen-track', type: 'video', clips: [screen] },
    { id: 'camera-track', type: 'video', clips: [camera] },
  ]);
  project.document.assets = [{ id: 'recording', type: 'recording', cameraAssetId: 'camera' }, { id: 'camera', type: 'video' }];

  const next = moveClipById(project, 'camera', 75);

  assert.equal(next.document.timeline.tracks[0].clips[0].timelineIn, 75);
  assert.equal(next.document.timeline.tracks[1].clips[0].timelineIn, 75);
});

test('moveClipById clamps linked recording movement against linked-track neighbors', () => {
  const screen = { ...baseClip, id: 'screen', assetId: 'recording', timelineIn: 30, timelineOut: 180, sourceIn: 30, sourceOut: 180 };
  const camera = { ...baseClip, id: 'camera', assetId: 'camera', timelineIn: 30, timelineOut: 180, sourceIn: 60, sourceOut: 210 };
  const cameraNeighbor = { ...baseClip, id: 'camera-neighbor', assetId: 'b-roll', timelineIn: 220, timelineOut: 260, sourceIn: 0, sourceOut: 40 };
  const project = makeProjectWithSharedTimelineTracks([
    { id: 'screen-track', type: 'video', clips: [screen] },
    { id: 'camera-track', type: 'video', clips: [camera, cameraNeighbor] },
  ]);
  project.document.assets = [{ id: 'recording', type: 'recording', cameraAssetId: 'camera' }, { id: 'camera', type: 'video' }, { id: 'b-roll', type: 'video' }];

  const next = moveClipById(project, 'screen', 100);

  assert.equal(next.document.timeline.tracks[0].clips[0].timelineIn, 70);
  assert.equal(next.document.timeline.tracks[0].clips[0].timelineOut, 220);
  assert.equal(next.document.timeline.tracks[1].clips[0].timelineIn, 70);
  assert.equal(next.document.timeline.tracks[1].clips[0].timelineOut, 220);
  assert.equal(next.document.timeline.tracks[1].clips[1].timelineIn, 220);
});

test('moveClipById clamps against neighbors and duration', () => {
  const project = makeProject([{ id: 't1', type: 'video', clips: [
    { ...baseClip, id: 'c0', timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 },
    { ...baseClip, id: 'c1', timelineIn: 100, timelineOut: 200, sourceIn: 0, sourceOut: 100 },
    { ...baseClip, id: 'c2', timelineIn: 240, timelineOut: 320, sourceIn: 0, sourceOut: 80 },
  ] }]);

  const beforeNeighbor = moveClipById(project, 'c1', 20).document.composition.tracks[0].clips[1];
  const afterNeighbor = moveClipById(project, 'c1', 500).document.composition.tracks[0].clips[1];

  assert.equal(beforeNeighbor.timelineIn, 80);
  assert.equal(beforeNeighbor.timelineOut, 180);
  assert.equal(afterNeighbor.timelineIn, 140);
  assert.equal(afterNeighbor.timelineOut, 240);
});
