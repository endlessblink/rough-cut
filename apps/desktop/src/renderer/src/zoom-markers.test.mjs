import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAsset,
  createDefaultRecordingPresentation,
  createProject,
  validateProject,
} from '@rough-cut/project-model';
import {
  addManualMarkerAt,
  canAddMarkerAt,
  getPrimaryRecordingAsset,
  listMarkers,
  removeMarker,
} from './zoom-markers.mjs';

function projectWithRecording({ duration = 600 } = {}) {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/recording.webm', {
    duration,
    presentation: createDefaultRecordingPresentation(),
  });
  return { ...base, assets: [asset] };
}

test('getPrimaryRecordingAsset returns the first recording or video asset', () => {
  const project = projectWithRecording();
  const asset = getPrimaryRecordingAsset(project);
  assert.equal(asset?.type, 'recording');
});

test('getPrimaryRecordingAsset returns null when no recording asset exists', () => {
  const project = createProject();
  assert.equal(getPrimaryRecordingAsset(project), null);
});

test('canAddMarkerAt rejects negative or non-finite times', () => {
  const project = projectWithRecording();
  assert.equal(canAddMarkerAt(project, -1, 30), false);
  assert.equal(canAddMarkerAt(project, Number.NaN, 30), false);
  assert.equal(canAddMarkerAt(project, Number.POSITIVE_INFINITY, 30), false);
});

test('canAddMarkerAt rejects when no recording asset exists', () => {
  const project = createProject();
  assert.equal(canAddMarkerAt(project, 1, 30), false);
});

test('canAddMarkerAt rejects when not enough room before end of asset', () => {
  const project = projectWithRecording({ duration: 30 });
  assert.equal(canAddMarkerAt(project, 1.0, 30), false);
});

test('canAddMarkerAt accepts a moment with enough room', () => {
  const project = projectWithRecording({ duration: 600 });
  assert.equal(canAddMarkerAt(project, 2.0, 30), true);
});

test('addManualMarkerAt produces a project that passes validateProject', () => {
  const project = projectWithRecording();
  const next = addManualMarkerAt(project, 2.0, 30);
  assert.notEqual(next, project);
  assert.doesNotThrow(() => validateProject(next));
});

test('addManualMarkerAt appends a manual marker at the rounded frame', () => {
  const project = projectWithRecording();
  const next = addManualMarkerAt(project, 2.0, 30);
  const markers = listMarkers(next);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].kind, 'manual');
  assert.equal(markers[0].startFrame, 60);
  assert.equal(markers[0].endFrame, 120);
});

test('addManualMarkerAt clamps endFrame to asset duration', () => {
  const project = projectWithRecording({ duration: 80 });
  const next = addManualMarkerAt(project, 1.0, 30);
  const marker = listMarkers(next)[0];
  assert.equal(marker.startFrame, 30);
  assert.equal(marker.endFrame, 80);
});

test('addManualMarkerAt is a no-op when no recording asset exists', () => {
  const project = createProject();
  const next = addManualMarkerAt(project, 2.0, 30);
  assert.equal(next, project);
});

test('addManualMarkerAt is a no-op when canAddMarkerAt is false', () => {
  const project = projectWithRecording({ duration: 30 });
  const next = addManualMarkerAt(project, 1.0, 30);
  assert.equal(next, project);
});

test('addManualMarkerAt keeps markers sorted by startFrame', () => {
  let project = projectWithRecording();
  project = addManualMarkerAt(project, 4.0, 30);
  project = addManualMarkerAt(project, 1.0, 30);
  project = addManualMarkerAt(project, 7.0, 30);
  const markers = listMarkers(project);
  assert.equal(markers.length, 3);
  assert.equal(markers[0].startFrame, 30);
  assert.equal(markers[1].startFrame, 120);
  assert.equal(markers[2].startFrame, 210);
});

test('removeMarker removes only the matching id and preserves order', () => {
  let project = projectWithRecording();
  project = addManualMarkerAt(project, 1.0, 30);
  project = addManualMarkerAt(project, 4.0, 30);
  project = addManualMarkerAt(project, 7.0, 30);
  const markers = listMarkers(project);
  const target = markers[1];
  const next = removeMarker(project, target.id);
  const remaining = listMarkers(next);
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].id, markers[0].id);
  assert.equal(remaining[1].id, markers[2].id);
});

test('removeMarker is a no-op when id does not match', () => {
  let project = projectWithRecording();
  project = addManualMarkerAt(project, 2.0, 30);
  const next = removeMarker(project, 'nonexistent-id');
  assert.equal(next, project);
});
