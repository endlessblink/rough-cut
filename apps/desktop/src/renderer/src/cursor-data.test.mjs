import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import {
  getCursorClickEvents,
  getCursorEvents,
  getCursorMoveEvents,
  getRecordingFps,
  getRecordingSourceSize,
} from './cursor-data.mjs';

function withRecordingAsset({ cursorEvents = [], fps, width, height } = {}) {
  const base = createProject();
  const metadata = { cursorEvents };
  if (fps !== undefined) metadata.fps = fps;
  if (width !== undefined) metadata.width = width;
  if (height !== undefined) metadata.height = height;
  const asset = createAsset('recording', '/tmp/recording.webm', { duration: 300, metadata });
  return { ...base, assets: [asset] };
}

test('getCursorEvents returns empty array when project has no assets', () => {
  const project = createProject();
  assert.deepEqual(getCursorEvents(project), []);
});

test('getCursorEvents returns empty array when document is null/undefined', () => {
  assert.deepEqual(getCursorEvents(null), []);
  assert.deepEqual(getCursorEvents(undefined), []);
});

test('getCursorEvents returns the recorded events when present', () => {
  const events = [
    { frame: 0, x: 100, y: 200, type: 'move', button: 0 },
    { frame: 30, x: 400, y: 500, type: 'move', button: 0 },
  ];
  const project = withRecordingAsset({ cursorEvents: events });
  assert.deepEqual(getCursorEvents(project), events);
});

test('getCursorClickEvents filters to type=down + button=0', () => {
  const events = [
    { frame: 0, x: 100, y: 200, type: 'move', button: 0 },
    { frame: 10, x: 100, y: 200, type: 'down', button: 0 },
    { frame: 20, x: 100, y: 200, type: 'down', button: 1 }, // right-click, excluded
    { frame: 30, x: 100, y: 200, type: 'up', button: 0 },
  ];
  const project = withRecordingAsset({ cursorEvents: events });
  const clicks = getCursorClickEvents(project);
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].frame, 10);
});

test('getCursorClickEvents returns empty array today (recorder emits no clicks)', () => {
  const project = withRecordingAsset({
    cursorEvents: [{ frame: 0, x: 100, y: 200, type: 'move', button: 0 }],
  });
  assert.deepEqual(getCursorClickEvents(project), []);
});

test('getCursorMoveEvents filters to type=move', () => {
  const events = [
    { frame: 0, x: 100, y: 200, type: 'move', button: 0 },
    { frame: 10, x: 100, y: 200, type: 'down', button: 0 },
    { frame: 20, x: 200, y: 300, type: 'move', button: 0 },
  ];
  const project = withRecordingAsset({ cursorEvents: events });
  const moves = getCursorMoveEvents(project);
  assert.equal(moves.length, 2);
  assert.equal(moves[0].frame, 0);
  assert.equal(moves[1].frame, 20);
});

test('getRecordingFps prefers asset metadata over settings.frameRate', () => {
  const project = withRecordingAsset({ fps: 60 });
  assert.equal(getRecordingFps(project), 60);
});

test('getRecordingFps falls back to settings.frameRate when asset metadata is missing fps', () => {
  const project = withRecordingAsset({});
  // createProject defaults settings.frameRate to 30.
  assert.equal(getRecordingFps(project), 30);
});

test('getRecordingFps returns the documented default 30 when document is empty', () => {
  assert.equal(getRecordingFps(null), 30);
  assert.equal(getRecordingFps(undefined), 30);
  assert.equal(getRecordingFps({}), 30);
});

test('getRecordingSourceSize prefers asset metadata over settings.resolution', () => {
  const project = withRecordingAsset({ width: 2560, height: 1440 });
  assert.deepEqual(getRecordingSourceSize(project), { width: 2560, height: 1440 });
});

test('getRecordingSourceSize falls back to settings.resolution when asset has no width/height', () => {
  const project = withRecordingAsset({});
  // createProject default settings.resolution is 1920x1080.
  assert.deepEqual(getRecordingSourceSize(project), { width: 1920, height: 1080 });
});

test('getRecordingSourceSize returns documented defaults when document is empty', () => {
  assert.deepEqual(getRecordingSourceSize(null), { width: 1920, height: 1080 });
  assert.deepEqual(getRecordingSourceSize({}), { width: 1920, height: 1080 });
});
