import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { canSplitClipById, removeClipById, splitClipById, trimClipById } from './clip-mutations.mjs';

const asset = createAsset('video', '/tmp/a1.mp4', { id: 'a1', duration: 600 });
const cameraAsset = createAsset('video', '/tmp/cam.mp4', { id: 'cam1', duration: 600 });

const baseClip = {
  id: 'c1',
  source: { kind: 'project-asset', id: asset.id },
  timelineIn: 0,
  timelineOut: 300,
  sourceIn: 0,
  sourceOut: 300,
};

function track(overrides = {}) {
  return {
    id: 't1',
    kind: 'video',
    index: 0,
    label: 'Video',
    enabled: true,
    locked: false,
    muted: false,
    clips: [baseClip],
    ...overrides,
  };
}

function makeProject(tracks = [track()], assets = [asset]) {
  const document = createProject({
    assets,
    composition: { duration: 600, tracks: [], transitions: [] },
    tracks,
  });
  return { path: '/tmp/p.roughcut', document };
}

test('removeClipById removes clips from canonical timeline only', () => {
  const project = makeProject([track({ clips: [baseClip, { ...baseClip, id: 'c2', timelineIn: 300, timelineOut: 600, sourceIn: 0, sourceOut: 300 }] })]);
  const next = removeClipById(project, 'c1');

  assert.notEqual(next, project);
  assert.deepEqual(next.document.timeline.tracks[0].clips.map((clip) => clip.id), ['c2']);
  assert.deepEqual(next.document.tracks[0].clips.map((clip) => clip.id), ['c1', 'c2'], 'legacy mirror is not rewritten');
});

test('removeClipById returns the SAME project reference when clip is not found', () => {
  const project = makeProject();
  assert.equal(removeClipById(project, 'nonexistent'), project);
});

test('splitClipById uses the command service and preserves half-open continuity', () => {
  const project = makeProject();
  const next = splitClipById(project, 'c1', 100);
  const clips = next.document.timeline.tracks[0].clips;

  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [
    [0, 100, 0, 100],
    [100, 300, 100, 300],
  ]);
  assert.notEqual(clips[0].id, 'c1');
  assert.notEqual(clips[1].id, 'c1');
});

test('splitClipById splits linked clips at the same timeline frame', () => {
  const project = makeProject([
    track({ id: 'screen-track', clips: [{ ...baseClip, id: 'screen', source: { kind: 'project-asset', id: asset.id }, timelineIn: 0, timelineOut: 200, sourceIn: 20, sourceOut: 220 }] }),
    track({ id: 'camera-track', index: 1, clips: [{ ...baseClip, id: 'camera', source: { kind: 'project-asset', id: cameraAsset.id }, timelineIn: 0, timelineOut: 200, sourceIn: 40, sourceOut: 240 }] }),
  ], [asset, cameraAsset]);
  const document = {
    ...project.document,
    timeline: {
      ...project.document.timeline,
      linkedGroups: [{ id: 'linked-1', kind: 'manual-sync', sourceIds: [`source:${asset.id}`, `source:${cameraAsset.id}`], primarySourceId: `source:${asset.id}`, syncPolicy: 'frame-locked' }],
      tracks: project.document.timeline.tracks.map((timelineTrack) => ({
        ...timelineTrack,
        clips: timelineTrack.clips.map((clip) => ({ ...clip, linkGroupId: 'linked-1' })),
      })),
    },
  };

  const next = splitClipById({ ...project, document }, 'screen', 80);
  assert.deepEqual(next.document.timeline.tracks.map((item) => item.clips.length), [2, 2]);
  assert.deepEqual(next.document.timeline.tracks[1].clips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 80], [80, 200]]);
});

test('splitClipById is a no-op at clip edges, outside, or unknown clip ids', () => {
  const project = makeProject();
  assert.equal(splitClipById(project, 'c1', 0), project);
  assert.equal(splitClipById(project, 'c1', 300), project);
  assert.equal(splitClipById(project, 'c1', 1000), project);
  assert.equal(splitClipById(project, 'nope', 50), project);
});

test('canSplitClipById reports whether splitClipById would mutate', () => {
  const project = makeProject();
  assert.equal(canSplitClipById(project, 'c1', 100), true);
  assert.equal(canSplitClipById(project, 'c1', 0), false);
  assert.equal(canSplitClipById(project, 'missing', 100), false);
});

test('trimClipById trims edges through canonical command service', () => {
  const project = makeProject();
  const left = trimClipById(project, 'c1', 'left', 80).document.timeline.tracks[0].clips[0];
  const right = trimClipById(project, 'c1', 'right', 180).document.timeline.tracks[0].clips[0];

  assert.deepEqual([left.timelineIn, left.timelineOut, left.sourceIn, left.sourceOut], [80, 300, 80, 300]);
  assert.deepEqual([right.timelineIn, right.timelineOut, right.sourceIn, right.sourceOut], [0, 180, 0, 180]);
});

test('trimClipById returns no-op for command-service rejected trims', () => {
  const project = makeProject([track({ clips: [
    { ...baseClip, id: 'c0', timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 },
    { ...baseClip, id: 'c1', timelineIn: 100, timelineOut: 300, sourceIn: 100, sourceOut: 300 },
  ] })]);

  assert.equal(trimClipById(project, 'c1', 'left', 20), project);
  assert.equal(trimClipById(project, 'missing', 'right', 100), project);
  assert.equal(trimClipById(project, 'c1', 'middle', 100), project);
});

test('trimClipById ignores stale mirrors and mutates the canonical timeline', () => {
  const project = makeProject();
  const staleMirror = { ...project.document.tracks[0], clips: [{ ...project.document.tracks[0].clips[0], timelineIn: 50, sourceIn: 50 }] };
  const next = trimClipById({ ...project, document: { ...project.document, tracks: [staleMirror] } }, 'c1', 'left', 80);

  assert.equal(next.document.timeline.tracks[0].clips[0].timelineIn, 80);
  assert.equal(next.document.tracks[0].clips[0].timelineIn, 50, 'legacy mirror remains stale and ignored');
});
