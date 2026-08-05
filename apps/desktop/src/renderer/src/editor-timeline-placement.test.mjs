/**
 * The recording is a clip on a track, not a backdrop.
 *
 * What the user saw: the playhead parked well past the end of the recording,
 * over empty timeline, and the picture still showed the recording — camera
 * bubble, background and all. The compositor was handed the raw playhead time
 * and drew the recording at it, so the clip's position, its trim and any hole
 * cut in it made no difference to what appeared.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecordingLayer, resolveRecordingTimeSec, splitLayersByRecordingTrack } from './editor-timeline-placement.mjs';

const recording = (overrides = {}) => ({
  id: 'rec',
  isRecording: true,
  trackId: 'track-rec',
  from: 0,
  durationInFrames: 900,
  sourceStart: 0,
  ...overrides,
});

const viewer = (overrides = {}) => ({
  fps: 30,
  frame: 0,
  tracks: [{ id: 'track-rec', order: 0 }],
  layers: [recording()],
  ...overrides,
});

test('over the recording, the playhead maps to the recording\'s own time', () => {
  assert.equal(resolveRecordingTimeSec(viewer({ frame: 90 })), 3);
});

test('past the end of the recording there is nothing to draw', () => {
  // Exactly the reported case: 900 frames of recording, playhead beyond it.
  assert.equal(resolveRecordingTimeSec(viewer({ frame: 900 })), null);
  assert.equal(resolveRecordingTimeSec(viewer({ frame: 5000 })), null);
});

test('before the recording starts there is nothing to draw', () => {
  const moved = viewer({ frame: 100, layers: [recording({ from: 450 })] });
  assert.equal(resolveRecordingTimeSec(moved), null);
});

test('a recording moved later plays from its own start, not the timeline\'s', () => {
  const moved = viewer({ frame: 450, layers: [recording({ from: 450 })] });
  assert.equal(resolveRecordingTimeSec(moved), 0);
});

test('a trimmed recording resolves through its source offset', () => {
  // Head trimmed by 300 frames: the first visible frame is 10s into the source.
  const trimmed = viewer({ frame: 0, layers: [recording({ sourceStart: 300 })] });
  assert.equal(resolveRecordingTimeSec(trimmed), 10);
});

test('the last frame of the recording is inside it and the next one is not', () => {
  assert.equal(resolveRecordingTimeSec(viewer({ frame: 899 })), 899 / 30);
  assert.equal(resolveRecordingTimeSec(viewer({ frame: 900 })), null);
});

test('with no recording on the timeline nothing of it is drawn', () => {
  const titleOnly = viewer({ layers: [{ id: 'title', trackId: 'track-a', from: 0, durationInFrames: 90 }] });
  assert.equal(resolveRecordingTimeSec(titleOnly), null);
  assert.equal(findRecordingLayer(titleOnly.layers), null);
});

test('a nonsense frame rate resolves to nothing rather than dividing by zero', () => {
  assert.equal(resolveRecordingTimeSec(viewer({ fps: 0 })), null);
  assert.equal(resolveRecordingTimeSec(null), null);
});

// --- Track order is z-order -------------------------------------------------

const stack = () => viewer({
  tracks: [{ id: 'above', order: -1 }, { id: 'track-rec', order: 0 }, { id: 'below', order: 1 }],
  layers: [
    recording(),
    { id: 'over', trackId: 'above', from: 0, durationInFrames: 90 },
    { id: 'under', trackId: 'below', from: 0, durationInFrames: 90 },
  ],
});

test('a clip on a higher track covers the recording, a lower one is covered', () => {
  const { above, below } = splitLayersByRecordingTrack(stack());
  assert.deepEqual(above.map((l) => l.id), ['over']);
  assert.deepEqual(below.map((l) => l.id), ['under']);
});

test('the recording itself is never in either group', () => {
  const { above, below } = splitLayersByRecordingTrack(stack());
  assert.ok(![...above, ...below].some((layer) => layer.isRecording));
});

test('without a recording every layer simply draws over the program', () => {
  const noRecording = viewer({
    tracks: [{ id: 'a', order: 0 }],
    layers: [{ id: 'title', trackId: 'a', from: 0, durationInFrames: 90 }],
  });
  const { above, below } = splitLayersByRecordingTrack(noRecording);
  assert.deepEqual(above.map((l) => l.id), ['title']);
  assert.deepEqual(below, []);
});

test('a layer on the recording\'s own track counts as above it', () => {
  const sameTrack = viewer({
    layers: [recording(), { id: 'same', trackId: 'track-rec', from: 900, durationInFrames: 90 }],
  });
  const { above, below } = splitLayersByRecordingTrack(sameTrack);
  assert.deepEqual(above.map((l) => l.id), ['same']);
  assert.deepEqual(below, []);
});
