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
  addManualMarkerAtFrame,
  addAutoZoomMarkersFromTelemetry,
  applySuggestion,
  canAddMarkerAt,
  findAvailableSpan,
  getPrimaryRecordingAsset,
  listMarkers,
  removeMarker,
  removeMarkers,
  updateMarkerFocalPoint,
  updateMarkerRange,
  updateMarkerStrength,
  withDefaultPresentation,
} from './zoom-markers.mjs';

function projectWithRecording({ duration = 600, cursorEvents = [], fps = 30, width = 1920, height = 1080 } = {}) {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/recording.webm', {
    duration,
    metadata: { cursorEvents, fps, width, height },
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

test('listMarkers treats legacy assets without zoom presentation as empty', () => {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/legacy.webm', {
    duration: 300,
    presentation: { background: createDefaultRecordingPresentation().background },
  });
  const project = { ...base, assets: [asset] };

  assert.deepEqual(listMarkers(project), []);
});

test('addManualMarkerAt backfills missing zoom presentation on legacy assets', () => {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/legacy.webm', {
    duration: 300,
    presentation: { background: createDefaultRecordingPresentation().background },
  });
  const project = { ...base, assets: [asset] };

  const next = addManualMarkerAt(project, 1, 30);
  assert.equal(listMarkers(next).length, 1);
  assert.doesNotThrow(() => validateProject(next));
});

test('withDefaultPresentation backfills required presentation sections on legacy assets', () => {
  const defaults = createDefaultRecordingPresentation();
  const presentation = withDefaultPresentation({
    background: {
      ...defaults.background,
      bgPadding: 96,
    },
  });
  const base = createProject();
  const asset = createAsset('recording', '/tmp/legacy.webm', {
    duration: 300,
    presentation,
  });

  assert.equal(presentation.background.bgPadding, 96);
  assert.deepEqual(presentation.zoom.markers, []);
  assert.equal(presentation.cursor.style, defaults.cursor.style);
  assert.equal(presentation.camera.visible, defaults.camera.visible);
  assert.doesNotThrow(() => validateProject({ ...base, assets: [asset] }));
});

test('addManualMarkerAt appends a manual marker at the rounded frame', () => {
  const project = projectWithRecording();
  const next = addManualMarkerAt(project, 2.0, 30);
  const markers = listMarkers(next);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].kind, 'manual');
  assert.equal(markers[0].startFrame, 60);
  assert.equal(markers[0].endFrame, 120);
  assert.equal(markers[0].zoomInDuration, 18);
  assert.equal(markers[0].zoomOutDuration, 18);
});

test('addManualMarkerAt mirrors zoom markers into the shared timeline', () => {
  const project = projectWithRecording();
  const asset = project.assets[0];

  const next = addManualMarkerAt(project, 2.0, 30);
  const marker = listMarkers(next)[0];

  assert.deepEqual(next.timeline.markers.filter((item) => item.kind === 'zoom'), [{
    id: marker.id,
    kind: 'zoom',
    startFrame: marker.startFrame,
    endFrame: marker.endFrame,
    linkedGroupId: `linked:${asset.id}`,
    params: { marker },
  }]);
});

test('listMarkers reads shared timeline zoom markers before legacy presentation markers', () => {
  const project = projectWithRecording();
  const asset = project.assets[0];
  const legacyMarker = createDefaultRecordingPresentation().zoom.markers[0];
  const timelineMarker = {
    id: 'timeline-zoom',
    startFrame: 90,
    endFrame: 150,
    kind: 'manual',
    strength: 0.7,
    focalPoint: { x: 0.5, y: 0.5 },
    zoomInDuration: 18,
    zoomOutDuration: 18,
  };
  const document = {
    ...project,
    assets: [{ ...asset, presentation: { ...asset.presentation, zoom: { ...asset.presentation.zoom, markers: legacyMarker ? [legacyMarker] : [] } } }],
    timeline: {
      ...project.timeline,
      markers: [{ id: timelineMarker.id, kind: 'zoom', startFrame: 90, endFrame: 150, linkedGroupId: `linked:${asset.id}`, params: { marker: timelineMarker } }],
    },
  };

  assert.deepEqual(listMarkers(document), [timelineMarker]);
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

test('removeMarkers removes multiple ids and keeps shared timeline zoom markers synced', () => {
  let project = projectWithRecording();
  project = addManualMarkerAt(project, 1.0, 30);
  project = addManualMarkerAt(project, 4.0, 30);
  project = addManualMarkerAt(project, 7.0, 30);
  const markers = listMarkers(project);
  const next = removeMarkers(project, [markers[0].id, markers[2].id]);
  const remaining = listMarkers(next);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, markers[1].id);
  assert.equal(next.timeline.markers.some((marker) => marker.id === markers[0].id), false);
  assert.equal(next.timeline.markers.some((marker) => marker.id === markers[2].id), false);
  assert.equal(next.timeline.markers.some((marker) => marker.id === markers[1].id), true);
});

test('removeMarkers is a no-op when no ids match', () => {
  const project = addManualMarkerAt(projectWithRecording(), 2.0, 30);
  assert.equal(removeMarkers(project, ['missing-a', 'missing-b']), project);
  assert.equal(removeMarkers(project, []), project);
});

test('removeMarker is a no-op when id does not match', () => {
  let project = projectWithRecording();
  project = addManualMarkerAt(project, 2.0, 30);
  const next = removeMarker(project, 'nonexistent-id');
  assert.equal(next, project);
});

test('updateMarkerRange moves a marker and keeps marker order sorted', () => {
  let project = projectWithRecording({ duration: 300 });
  project = addManualMarkerAt(project, 1.0, 30);
  project = addManualMarkerAt(project, 6.0, 30);
  const target = listMarkers(project)[0];

  const next = updateMarkerRange(project, target.id, 210, 270);
  const markers = listMarkers(next);

  assert.equal(markers[0].startFrame, 180);
  assert.equal(markers[1].id, target.id);
  assert.equal(markers[1].startFrame, 210);
  assert.equal(markers[1].endFrame, 270);
});

test('updateMarkerRange clamps edits to source bounds and minimum duration', () => {
  let project = projectWithRecording({ duration: 120 });
  project = addManualMarkerAt(project, 1.0, 30);
  const target = listMarkers(project)[0];

  const next = updateMarkerRange(project, target.id, 118, 119, { minDurationFrames: 15 });
  const marker = listMarkers(next)[0];

  assert.equal(marker.startFrame, 105);
  assert.equal(marker.endFrame, 120);
});

test('updateMarkerRange is a no-op for unknown marker ids', () => {
  const project = addManualMarkerAt(projectWithRecording(), 2.0, 30);

  assert.equal(updateMarkerRange(project, 'missing', 0, 30), project);
});

test('updateMarkerStrength updates and clamps marker zoom strength', () => {
  let project = addManualMarkerAt(projectWithRecording(), 2.0, 30);
  const target = listMarkers(project)[0];

  project = updateMarkerStrength(project, target.id, 0.45);
  assert.equal(listMarkers(project)[0].strength, 0.45);

  project = updateMarkerStrength(project, target.id, 2);
  assert.equal(listMarkers(project)[0].strength, 1);
});

test('updateMarkerFocalPoint sets focal, pins the marker, and clamps to [0,1]', () => {
  let project = addManualMarkerAt(projectWithRecording(), 2.0, 30);
  const target = listMarkers(project)[0];

  project = updateMarkerFocalPoint(project, target.id, 0.3, 0.7);
  let marker = listMarkers(project)[0];
  assert.deepEqual(marker.focalPoint, { x: 0.3, y: 0.7 });
  assert.equal(marker.followCursor, false);
  // Mirrored into the shared timeline too (full marker lives in params.marker).
  assert.equal(project.timeline.markers.find((m) => m.id === target.id)?.params?.marker?.followCursor, false);

  project = updateMarkerFocalPoint(project, target.id, 2, -1);
  marker = listMarkers(project)[0];
  assert.deepEqual(marker.focalPoint, { x: 1, y: 0 });
});

test('updateMarkerFocalPoint is a no-op when marker id does not match', () => {
  const project = addManualMarkerAt(projectWithRecording(), 2.0, 30);
  assert.equal(updateMarkerFocalPoint(project, 'missing', 0.5, 0.5), project);
});

test('updateMarkerRange and removeMarker keep shared timeline zoom markers synced', () => {
  let project = addManualMarkerAt(projectWithRecording(), 2.0, 30);
  const target = listMarkers(project)[0];

  project = updateMarkerRange(project, target.id, 120, 180);
  assert.equal(project.timeline.markers.find((marker) => marker.id === target.id)?.startFrame, 120);

  project = removeMarker(project, target.id);
  assert.equal(project.timeline.markers.some((marker) => marker.id === target.id), false);
});

test('applySuggestion appends an auto marker preserving suggestion fields with a fresh id', () => {
  const project = projectWithRecording();
  const suggestion = {
    id: 'suggested-1',
    startFrame: 60,
    endFrame: 120,
    kind: 'auto',
    strength: 0.8,
    focalPoint: { x: 0.25, y: 0.75 },
    zoomInDuration: 12,
    zoomOutDuration: 18,
  };

  const next = applySuggestion(project, suggestion);
  assert.notEqual(next, project);

  const markers = listMarkers(next);
  assert.equal(markers.length, 1);
  const applied = markers[0];
  assert.equal(applied.kind, 'auto');
  assert.notEqual(applied.id, suggestion.id);
  assert.equal(applied.startFrame, 60);
  assert.equal(applied.endFrame, 120);
  assert.equal(applied.strength, 0.8);
  assert.deepEqual(applied.focalPoint, { x: 0.25, y: 0.75 });
  assert.equal(applied.zoomInDuration, 12);
  assert.equal(applied.zoomOutDuration, 18);
});

test('addAutoZoomMarkersFromTelemetry creates auto markers from recorded click telemetry', () => {
  const project = projectWithRecording({
    duration: 300,
    cursorEvents: [
      { type: 'move', frame: 22, x: 960, y: 540 },
      { type: 'down', frame: 30, x: 960, y: 540, button: 'left' },
      { type: 'up', frame: 32, x: 960, y: 540, button: 'left' },
      { type: 'down', frame: 45, x: 980, y: 550, button: 'left' },
      { type: 'up', frame: 47, x: 980, y: 550, button: 'left' },
    ],
  });

  const next = addAutoZoomMarkersFromTelemetry(project);
  const markers = listMarkers(next);

  assert.notEqual(next, project);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].kind, 'auto');
  assert.ok(markers[0].startFrame <= 30);
  assert.ok(markers[0].endFrame > 30);
  assert.ok(Math.abs(markers[0].focalPoint.x - 0.5) < 0.01);
  assert.ok(Math.abs(markers[0].focalPoint.y - 0.5) < 0.01);
  assert.doesNotThrow(() => validateProject(next));
});

test('addAutoZoomMarkersFromTelemetry mirrors generated markers into the shared timeline', () => {
  const project = projectWithRecording({
    cursorEvents: [
      { type: 'down', frame: 90, x: 480, y: 270, button: 0 },
      { type: 'up', frame: 92, x: 480, y: 270, button: 0 },
      { type: 'down', frame: 105, x: 500, y: 280, button: 0 },
      { type: 'up', frame: 107, x: 500, y: 280, button: 0 },
    ],
  });
  const asset = project.assets[0];

  const next = addAutoZoomMarkersFromTelemetry(project);
  const marker = listMarkers(next)[0];

  assert.deepEqual(next.timeline.markers.filter((item) => item.kind === 'zoom'), [{
    id: marker.id,
    kind: 'zoom',
    startFrame: marker.startFrame,
    endFrame: marker.endFrame,
    linkedGroupId: `linked:${asset.id}`,
    params: { marker },
  }]);
});

test('addAutoZoomMarkersFromTelemetry preserves manual markers and skips overlapping auto candidates', () => {
  let project = projectWithRecording({
    cursorEvents: [
      { type: 'down', frame: 90, x: 960, y: 540, button: 0 },
      { type: 'up', frame: 92, x: 960, y: 540, button: 0 },
      { type: 'down', frame: 105, x: 980, y: 550, button: 0 },
      { type: 'up', frame: 107, x: 980, y: 550, button: 0 },
      { type: 'down', frame: 240, x: 1200, y: 640, button: 0 },
      { type: 'up', frame: 242, x: 1200, y: 640, button: 0 },
      { type: 'down', frame: 255, x: 1220, y: 650, button: 0 },
      { type: 'up', frame: 257, x: 1220, y: 650, button: 0 },
    ],
  });
  project = addManualMarkerAt(project, 2.5, 30);

  const next = addAutoZoomMarkersFromTelemetry(project);
  const markers = listMarkers(next);

  assert.equal(markers.length, 2);
  assert.equal(markers[0].kind, 'manual');
  assert.equal(markers[1].kind, 'auto');
  assert.ok(markers[1].startFrame >= markers[0].endFrame);
});

test('addAutoZoomMarkersFromTelemetry is repeat-safe for existing recordings', () => {
  const project = projectWithRecording({
    cursorEvents: [
      { type: 'down', frame: 90, x: 960, y: 540, button: 1 },
      { type: 'up', frame: 92, x: 960, y: 540, button: 1 },
      { type: 'down', frame: 105, x: 980, y: 550, button: 1 },
      { type: 'up', frame: 107, x: 980, y: 550, button: 1 },
    ],
  });

  const once = addAutoZoomMarkersFromTelemetry(project);
  const twice = addAutoZoomMarkersFromTelemetry(once);

  assert.equal(listMarkers(once).length, 1);
  assert.equal(listMarkers(twice).length, 1);
  assert.deepEqual(listMarkers(twice), listMarkers(once));
});

test('addAutoZoomMarkersFromTelemetry is a no-op when there is no cursor telemetry', () => {
  const project = projectWithRecording({ cursorEvents: [] });
  const next = addAutoZoomMarkersFromTelemetry(project);
  assert.equal(next, project);
  assert.deepEqual(listMarkers(next), []);
});

test('applySuggestion preserves existing markers and keeps the array sorted by startFrame', () => {
  let project = projectWithRecording();
  project = addManualMarkerAt(project, 4.0, 30);
  const earlierSuggestion = {
    id: 'earlier',
    startFrame: 0,
    endFrame: 30,
    kind: 'auto',
    strength: 1,
    focalPoint: { x: 0.5, y: 0.5 },
    zoomInDuration: 9,
    zoomOutDuration: 9,
  };
  const next = applySuggestion(project, earlierSuggestion);
  const markers = listMarkers(next);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].startFrame, 0);
  assert.equal(markers[1].startFrame, 120);
});

test('applySuggestion is a no-op when there is no recording asset', () => {
  const project = createProject();
  const next = applySuggestion(project, {
    id: 's',
    startFrame: 0,
    endFrame: 30,
    kind: 'auto',
    strength: 1,
    focalPoint: { x: 0.5, y: 0.5 },
    zoomInDuration: 9,
    zoomOutDuration: 9,
  });
  assert.equal(next, project);
});

test('addManualMarkerAtFrame creates a 60-frame marker on an empty lane', () => {
  const project = projectWithRecording({ duration: 600 });
  const next = addManualMarkerAtFrame(project, 100, 30);
  const markers = listMarkers(next);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].startFrame, 100);
  assert.equal(markers[0].endFrame, 160);
});

test('addManualMarkerAtFrame clamps the new span to the gap before the next marker', () => {
  let project = projectWithRecording({ duration: 600 });
  project = addManualMarkerAt(project, 150 / 30, 30); // marker at [150, 210]
  const next = addManualMarkerAtFrame(project, 100, 30); // would want [100, 160] but clamped to [100, 150]
  const markers = listMarkers(next).filter((m) => m.startFrame === 100);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].endFrame, 150);
});

test('addManualMarkerAtFrame is a no-op when atFrame lands inside an existing marker', () => {
  let project = projectWithRecording({ duration: 600 });
  project = addManualMarkerAt(project, 100 / 30, 30); // marker at [100, 160]
  const next = addManualMarkerAtFrame(project, 120, 30);
  assert.equal(next, project);
});

test('addManualMarkerAtFrame is a no-op when the available gap is below minSpan', () => {
  let project = projectWithRecording({ duration: 600 });
  project = addManualMarkerAt(project, 100 / 30, 30); // marker at [100, 160]
  project = addManualMarkerAt(project, 170 / 30, 30); // marker at [170, 230]
  // Only 10 frames of gap between 160..170 → below default minSpan=15.
  const next = addManualMarkerAtFrame(project, 162, 30);
  assert.equal(next, project);
});

test('findAvailableSpan returns null when atFrame is inside an existing marker', () => {
  let project = projectWithRecording({ duration: 600 });
  project = addManualMarkerAt(project, 100 / 30, 30); // marker at [100, 160]
  assert.equal(findAvailableSpan(project, 120), null);
});
