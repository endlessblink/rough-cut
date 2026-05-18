import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { addCutRange, listCutRanges, removeCutRange, visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';

test('addCutRange persists normalized non-destructive cut ranges', () => {
  const project = createProject();
  const asset = createAsset('recording', '/tmp/source.mp4', { duration: 300 });
  const document = { ...project, assets: [asset] };

  const next = addCutRange(document, asset.id, 90, 30, 300);
  const ranges = listCutRanges(next, asset.id, 300);

  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].startFrame, 30);
  assert.equal(ranges[0].endFrame, 90);
});

test('addCutRange mirrors removed ranges into shared timeline cut markers', () => {
  const project = createProject();
  const asset = createAsset('recording', '/tmp/source.mp4', { duration: 300 });
  const document = { ...project, assets: [asset], timeline: { ...project.timeline, linkedGroups: [{ id: `linked:${asset.id}`, kind: 'recording', sourceIds: [`source:${asset.id}:screen`], primarySourceId: `source:${asset.id}:screen`, syncPolicy: 'frame-locked' }], markers: [] } };

  const next = addCutRange(document, asset.id, 30, 90, 300);
  const range = listCutRanges(next, asset.id, 300)[0];

  assert.equal(next.timeline.markers.length, 1);
  assert.deepEqual(next.timeline.markers[0], {
    id: range.id,
    kind: 'cut',
    startFrame: 30,
    endFrame: 90,
    linkedGroupId: `linked:${asset.id}`,
    params: { range },
  });
});

test('removeCutRange restores a removed middle range', () => {
  const project = createProject();
  const asset = createAsset('recording', '/tmp/source.mp4', { duration: 300 });
  const document = addCutRange({ ...project, assets: [asset] }, asset.id, 30, 90, 300);
  const cutId = listCutRanges(document, asset.id, 300)[0].id;

  const restored = removeCutRange(document, asset.id, cutId, 300);

  assert.equal(listCutRanges(restored, asset.id, 300).length, 0);
  assert.equal(restored.timeline.markers.filter((marker) => marker.kind === 'cut').length, 0);
});

test('listCutRanges reads shared timeline cut markers before legacy presentation ranges', () => {
  const project = createProject();
  const asset = createAsset('recording', '/tmp/source.mp4', {
    duration: 300,
    presentation: {
      ...project.settings.recordingDefaults,
      cutRanges: [{ id: 'legacy-cut', startFrame: 10, endFrame: 20 }],
    },
  });
  const document = {
    ...project,
    assets: [asset],
    timeline: {
      ...project.timeline,
      markers: [{ id: 'timeline-cut', kind: 'cut', startFrame: 30, endFrame: 60, linkedGroupId: `linked:${asset.id}`, params: {} }],
    },
  };

  assert.deepEqual(listCutRanges(document, asset.id, 300), [{ id: 'timeline-cut', startFrame: 30, endFrame: 60 }]);
});

test('visible/source frame mapping skips removed ranges', () => {
  const ranges = [{ id: 'cut-1', startFrame: 30, endFrame: 60 }];

  assert.equal(visibleDurationFrames(ranges, 120), 90);
  assert.equal(visibleFrameToSourceFrame(ranges, 29, 120), 29);
  assert.equal(visibleFrameToSourceFrame(ranges, 30, 120), 60);
});
