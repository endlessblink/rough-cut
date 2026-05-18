import test from 'node:test';
import assert from 'node:assert/strict';
import { canSplitClipById, removeClipById, splitClipById } from './clip-mutations.mjs';

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
