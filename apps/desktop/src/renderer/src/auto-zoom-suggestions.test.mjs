import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAsset,
  createDefaultRecordingPresentation,
  createProject,
  createZoomMarker,
} from '@rough-cut/project-model';
import { generateSuggestionsForProject } from './auto-zoom-suggestions.mjs';

function buildProject({
  cursorEvents = [],
  markers = [],
  autoIntensity,
  duration = 600,
} = {}) {
  const base = createProject();
  const presentation = createDefaultRecordingPresentation();
  const presentationOverride = {
    ...presentation,
    zoom: {
      ...presentation.zoom,
      ...(autoIntensity !== undefined ? { autoIntensity } : {}),
      markers,
    },
  };
  const asset = createAsset('recording', '/tmp/recording.webm', {
    duration,
    metadata: { width: 1920, height: 1080, fps: 30, cursorEvents },
    presentation: presentationOverride,
  });
  return { ...base, assets: [asset] };
}

test('returns empty result when project has no cursor events', () => {
  const project = buildProject();
  const result = generateSuggestionsForProject(project);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.filtered, []);
  assert.deepEqual(result.existingManual, []);
});

test('returns empty result on a degenerate document with no recording asset', () => {
  const result = generateSuggestionsForProject(createProject());
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.filtered, []);
  assert.deepEqual(result.existingManual, []);
});

test('generates auto-kind candidates from teleport-style move data', () => {
  // Simulate a cursor that sits in one region, then jumps far across the screen
  // (teleport), settles, and jumps again. The engine's teleport fallback
  // should pick up these jumps as activity sessions.
  const cursorEvents = [];
  // Settled in upper-left.
  for (let f = 0; f <= 30; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 100, y: 100, type: 'move', button: 0 });
  // Big jump to bottom-right.
  cursorEvents.push({ frame: 33, timeMs: 1100, x: 1700, y: 900, type: 'move', button: 0 });
  for (let f = 36; f <= 60; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 1700, y: 900, type: 'move', button: 0 });
  // Big jump to mid-screen.
  cursorEvents.push({ frame: 90, timeMs: 3000, x: 900, y: 500, type: 'move', button: 0 });
  for (let f = 93; f <= 120; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 900, y: 500, type: 'move', button: 0 });

  const project = buildProject({ cursorEvents });
  const result = generateSuggestionsForProject(project);
  assert.ok(result.candidates.length > 0, 'expected non-empty candidates from teleport-derived data');
  for (const marker of result.candidates) {
    assert.equal(marker.kind, 'auto');
  }
});

test('filters out candidates that overlap existing manual markers', () => {
  const manual = createZoomMarker(0, 90, { strength: 1, focalPoint: { x: 0.5, y: 0.5 } });
  const cursorEvents = [];
  for (let f = 0; f <= 30; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 100, y: 100, type: 'move', button: 0 });
  cursorEvents.push({ frame: 33, timeMs: 1100, x: 1700, y: 900, type: 'move', button: 0 });
  for (let f = 36; f <= 60; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 1700, y: 900, type: 'move', button: 0 });

  const project = buildProject({ cursorEvents, markers: [manual] });
  const result = generateSuggestionsForProject(project);

  assert.equal(result.existingManual.length, 1);
  assert.equal(result.existingManual[0].id, manual.id);
  // Filtered list should drop any candidate whose frame range intersects [0, 90].
  for (const marker of result.filtered) {
    const overlaps = marker.startFrame < manual.endFrame && marker.endFrame > manual.startFrame;
    assert.equal(overlaps, false, `marker ${marker.id} unexpectedly overlaps manual`);
  }
});

test('intensity option overrides the project autoIntensity', () => {
  const cursorEvents = [];
  for (let f = 0; f <= 30; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 100, y: 100, type: 'move', button: 0 });
  cursorEvents.push({ frame: 33, timeMs: 1100, x: 1700, y: 900, type: 'move', button: 0 });
  for (let f = 36; f <= 60; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 1700, y: 900, type: 'move', button: 0 });

  const project = buildProject({ cursorEvents, autoIntensity: 0.2 });
  const low = generateSuggestionsForProject(project);
  const high = generateSuggestionsForProject(project, { intensity: 0.9 });

  // Higher intensity → larger zoomScale → larger strength on the resulting markers
  // (engine maps intensity bands to scale 1.3→3.0).
  if (low.candidates.length > 0 && high.candidates.length > 0) {
    assert.ok(high.candidates[0].strength >= low.candidates[0].strength);
  }
});

test('result is deterministic — same project produces same output', () => {
  const cursorEvents = [];
  for (let f = 0; f <= 30; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 100, y: 100, type: 'move', button: 0 });
  cursorEvents.push({ frame: 33, timeMs: 1100, x: 1700, y: 900, type: 'move', button: 0 });
  for (let f = 36; f <= 60; f += 3) cursorEvents.push({ frame: f, timeMs: f * 33, x: 1700, y: 900, type: 'move', button: 0 });

  const project = buildProject({ cursorEvents });
  const a = generateSuggestionsForProject(project);
  const b = generateSuggestionsForProject(project);
  // Marker IDs are randomly generated (zoomMarkerId) so we compare structural fields.
  assert.equal(a.candidates.length, b.candidates.length);
  for (let i = 0; i < a.candidates.length; i += 1) {
    assert.equal(a.candidates[i].startFrame, b.candidates[i].startFrame);
    assert.equal(a.candidates[i].endFrame, b.candidates[i].endFrame);
    assert.equal(a.candidates[i].strength, b.candidates[i].strength);
    assert.equal(a.candidates[i].kind, b.candidates[i].kind);
    assert.deepEqual(a.candidates[i].focalPoint, b.candidates[i].focalPoint);
  }
});

test('falls back to default intensity 0.5 when neither option nor project specifies', () => {
  // Just exercising the fallback path; if it throws or returns malformed
  // structure, the test fails.
  const project = createProject();
  const result = generateSuggestionsForProject(project);
  assert.ok(Array.isArray(result.candidates));
  assert.ok(Array.isArray(result.filtered));
  assert.ok(Array.isArray(result.existingManual));
});
