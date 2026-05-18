import test from 'node:test';
import assert from 'node:assert/strict';
import { snapFrameToClipEdges } from './snap.mjs';

const project = {
  document: {
    composition: {
      duration: 600,
      tracks: [
        { type: 'video', clips: [{ id: 'v1', timelineIn: 10, timelineOut: 100 }] },
        { type: 'audio', clips: [{ id: 'a1', timelineIn: 240, timelineOut: 360 }] },
      ],
    },
  },
};

test('snapFrameToClipEdges collects snap candidates from all tracks', () => {
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
