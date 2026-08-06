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
import {
  findRecordingLayer,
  resolveOverlayLayerSource,
  resolveOverlayLayers,
  resolveRecordingTimeSec,
  splitLayersByRecordingTrack,
  viewerFromStoredTimeline,
} from './editor-timeline-placement.mjs';

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

// --- Every view is correct from a cold start ---------------------------------
// A clip added in the Editor belongs to the project, so Recording edit must show
// it after a restart without the Editor having been opened first.

const storedDocument = () => ({
  id: 'project-1',
  settings: { frameRate: 30 },
  freecutTimeline: {
    tracks: [{ id: 'title-track', order: -1 }, { id: 'rec-track', order: 0 }],
    items: [
      { id: 'rec', trackId: 'rec-track', type: 'video', mediaId: 'asset-1__program', from: 0, durationInFrames: 900 },
      { id: 'title', trackId: 'title-track', type: 'text', text: 'Hello', from: 0, durationInFrames: 90 },
      { id: 'cam', trackId: 'title-track', type: 'video', mediaId: 'asset-2', from: 120, durationInFrames: 90 },
    ],
  },
});

test('the saved timeline reads back in the shape the live bridge reports', () => {
  const viewer = viewerFromStoredTimeline(storedDocument());
  assert.equal(viewer.fps, 30);
  assert.deepEqual(viewer.tracks, [{ id: 'title-track', order: -1 }, { id: 'rec-track', order: 0 }]);
  assert.equal(findRecordingLayer(viewer.layers).id, 'rec');
});

test('a project the Editor has never touched seeds nothing', () => {
  assert.equal(viewerFromStoredTimeline({ id: 'p' }), null);
  assert.equal(viewerFromStoredTimeline({ id: 'p', freecutTimeline: { tracks: [], items: [] } }), null);
  assert.equal(viewerFromStoredTimeline(null), null);
});

test('layers saved above the recording are seeded above it', () => {
  const { above, below } = splitLayersByRecordingTrack(viewerFromStoredTimeline(storedDocument()));
  assert.deepEqual(above.map((l) => l.id), ['title', 'cam']);
  assert.deepEqual(below, []);
});

test('a layer with media is addressed at the same endpoint the Editor uses', () => {
  const resolved = resolveOverlayLayerSource({ id: 'cam', mediaId: 'asset-2' }, 'http://127.0.0.1:4321', 'project-1');
  assert.equal(resolved.src, 'http://127.0.0.1:4321/__rough_cut__/media/project-1/asset-2');
});

test('a layer with no media of its own keeps whatever it had', () => {
  const title = { id: 'title', type: 'text', text: 'Hello' };
  assert.deepEqual(resolveOverlayLayerSource(title, 'http://127.0.0.1:4321', 'project-1'), title);
  // No server yet is not a reason to invent a URL.
  assert.deepEqual(resolveOverlayLayerSource({ id: 'cam', mediaId: 'asset-2' }, null, 'project-1'), { id: 'cam', mediaId: 'asset-2' });
});

test('resolving the whole stack keeps the split and fills in the sources', () => {
  const { above, below } = resolveOverlayLayers(viewerFromStoredTimeline(storedDocument()), 'http://127.0.0.1:4321', 'project-1');
  assert.deepEqual(above.map((l) => l.id), ['title', 'cam']);
  assert.equal(above.find((l) => l.id === 'cam').src, 'http://127.0.0.1:4321/__rough_cut__/media/project-1/asset-2');
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
