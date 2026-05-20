import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { createDragSession, timelineInFromPointerFrame, updateDragSession } from './drag-session.mjs';

const videoAsset = createAsset('video', '/tmp/video.mp4', { id: 'video-asset', duration: 600 });
const audioAsset = createAsset('audio', '/tmp/audio.wav', { id: 'audio-asset', duration: 600 });

function track(overrides = {}) {
  return {
    id: 'v1',
    kind: 'video',
    index: 0,
    label: 'Video',
    enabled: true,
    locked: false,
    muted: false,
    clips: [],
    ...overrides,
  };
}

function clip(overrides = {}) {
  return {
    id: 'c1',
    source: { kind: 'project-asset', id: videoAsset.id },
    timelineIn: 100,
    timelineOut: 160,
    sourceIn: 20,
    sourceOut: 80,
    ...overrides,
  };
}

function project(tracks) {
  return {
    document: createProject({
      assets: [videoAsset, audioAsset],
      composition: { duration: 300, tracks: [], transitions: [] },
      tracks,
    }),
  };
}

test('drag session preserves pointer grab offset and source timing', () => {
  const p = project([track({ clips: [clip()] })]);
  const session = createDragSession(p, 'c1', 115, 300);

  assert.equal(session.grabOffsetFrames, 15);
  assert.equal(timelineInFromPointerFrame(session, 140), 125);
  assert.deepEqual(session.original, { timelineIn: 100, timelineOut: 160, sourceIn: 20, sourceOut: 80 });
});

test('drag session clamps same-track movement between neighboring clips', () => {
  const p = project([track({ clips: [clip({ id: 'left', timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 }), clip(), clip({ id: 'right', timelineIn: 180, timelineOut: 240, sourceIn: 0, sourceOut: 60 })] })]);
  const session = createDragSession(p, 'c1', 100, 300);
  const movedLeft = updateDragSession(session, p, { timelineIn: 50, targetTrackId: 'v1' });
  const movedRight = updateDragSession(session, p, { timelineIn: 200, targetTrackId: 'v1' });

  assert.deepEqual([movedLeft.preview.timelineIn, movedLeft.preview.timelineOut], [80, 140]);
  assert.deepEqual([movedRight.preview.timelineIn, movedRight.preview.timelineOut], [120, 180]);
});

test('drag session allows same-kind tracks and rejects cross-kind or locked targets', () => {
  const p = project([
    track({ id: 'v1', clips: [clip()] }),
    track({ id: 'v2', index: 1, clips: [] }),
    track({ id: 'locked', index: 2, locked: true, clips: [] }),
    track({ id: 'a1', kind: 'audio', index: 3, clips: [{ ...clip(), id: 'audio', source: { kind: 'project-asset', id: audioAsset.id } }] }),
  ]);
  const session = createDragSession(p, 'c1', 110, 300);

  assert.equal(updateDragSession(session, p, { timelineIn: 120, targetTrackId: 'v2' }).valid, true);
  assert.equal(updateDragSession(session, p, { timelineIn: 120, targetTrackId: 'a1' }).invalidReason, 'cross-kind');
  assert.equal(updateDragSession(session, p, { timelineIn: 120, targetTrackId: 'locked' }).invalidReason, 'locked-track');
});

test('drag session uses the requested gap when moving across compatible tracks', () => {
  const p = project([
    track({ id: 'v1', clips: [clip()] }),
    track({
      id: 'v2',
      index: 1,
      clips: [
        clip({ id: 'early', timelineIn: 0, timelineOut: 40, sourceIn: 0, sourceOut: 40 }),
        clip({ id: 'late', timelineIn: 220, timelineOut: 280, sourceIn: 0, sourceOut: 60 }),
      ],
    }),
  ]);
  const session = createDragSession(p, 'c1', 110, 300);
  const moved = updateDragSession(session, p, { timelineIn: 140, targetTrackId: 'v2' });

  assert.equal(moved.valid, true);
  assert.deepEqual([moved.preview.timelineIn, moved.preview.timelineOut], [140, 200]);
});
