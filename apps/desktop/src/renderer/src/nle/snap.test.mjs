import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { snapFrameToClipEdges, snapFrameToClipEdgesExcept } from './snap.mjs';

const videoAsset = createAsset('video', '/tmp/video.mp4', { id: 'video-asset', duration: 600 });
const audioAsset = createAsset('audio', '/tmp/audio.wav', { id: 'audio-asset', duration: 600 });

const project = {
  document: createProject({
    assets: [videoAsset, audioAsset],
    composition: { duration: 600, tracks: [], transitions: [] },
    tracks: [
      {
        id: 'v1',
        kind: 'video',
        index: 1,
        label: 'Video',
        enabled: true,
        locked: false,
        muted: false,
        clips: [{ id: 'v1', source: { kind: 'project-asset', id: videoAsset.id }, timelineIn: 10, timelineOut: 100, sourceIn: 0, sourceOut: 90 }],
      },
      {
        id: 'a1',
        kind: 'audio',
        index: 0,
        label: 'Audio',
        enabled: true,
        locked: false,
        muted: false,
        clips: [{ id: 'a1', source: { kind: 'project-asset', id: audioAsset.id }, timelineIn: 240, timelineOut: 360, sourceIn: 0, sourceOut: 120 }],
      },
    ],
  }),
};

test('snapFrameToClipEdges collects snap candidates from canonical timeline tracks', () => {
  assert.equal(snapFrameToClipEdges(98, project, 3), 100);
  assert.equal(snapFrameToClipEdges(242, project, 3), 240);
  assert.equal(snapFrameToClipEdges(358, project, 3), 360);
});

test('snapFrameToClipEdges respects the threshold', () => {
  assert.equal(snapFrameToClipEdges(96, project, 3), 96);
  assert.equal(snapFrameToClipEdges(97, project, 3), 100);
});

test('snapFrameToClipEdges snaps to timeline bounds', () => {
  assert.equal(snapFrameToClipEdges(2, project, 3), 0);
  assert.equal(snapFrameToClipEdges(598, project, 3), 600);
});

test('snapFrameToClipEdges leaves open space unchanged', () => {
  assert.equal(snapFrameToClipEdges(180, project, 5), 180);
});

test('snapFrameToClipEdges ignores stale composition tracks', () => {
  const staleProject = {
    ...project,
    document: {
      ...project.document,
      composition: { ...project.document.composition, tracks: [{ type: 'video', clips: [{ id: 'stale', timelineIn: 180, timelineOut: 220 }] }] },
    },
  };
  assert.equal(snapFrameToClipEdges(181, staleProject, 3), 181);
});

test('snapFrameToClipEdgesExcept skips the dragged clip own edges', () => {
  assert.equal(snapFrameToClipEdgesExcept(98, project, 3, 'v1'), 98);
  assert.equal(snapFrameToClipEdgesExcept(242, project, 3, 'v1'), 240);
});
