import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { buildLaneClips, buildTimelineTracks } from './timeline-clips.mjs';

const videoAsset = createAsset('video', '/tmp/video.mp4', { id: 'video-asset', duration: 600 });
const audioAsset = createAsset('audio', '/tmp/audio.wav', { id: 'audio-asset', duration: 600 });

function makeProject({ duration = 300, tracks = [], assets = [videoAsset, audioAsset], staleTracks = [] } = {}) {
  const document = createProject({
    assets,
    composition: { duration, tracks: [], transitions: [] },
    tracks,
  });
  return { document: { ...document, tracks: staleTracks.length > 0 ? staleTracks : document.tracks } };
}

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
    timelineIn: 0,
    timelineOut: 100,
    sourceIn: 0,
    sourceOut: 100,
    ...overrides,
  };
}

test('buildLaneClips returns [] for null/empty projects', () => {
  assert.deepEqual(buildLaneClips(null, 'video'), []);
  assert.deepEqual(buildLaneClips({}, 'video'), []);
  assert.deepEqual(buildLaneClips(makeProject({ duration: 0, tracks: [] }), 'video'), []);
});

test('buildTimelineTracks returns [] for a blank canonical timeline', () => {
  assert.deepEqual(buildTimelineTracks(makeProject({ duration: 0, tracks: [] })), []);
});

test('buildTimelineTracks maps canonical timeline tracks into dynamic rows', () => {
  const project = makeProject({
    duration: 120,
    tracks: [track({
      id: 'screen-track',
      label: 'Screen Recording',
      clips: [clip({ id: 'screen-clip', timelineIn: 0, timelineOut: 120, sourceOut: 120 })],
    })],
  });

  const rows = buildTimelineTracks(project);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'screen-track');
  assert.equal(rows[0].label, 'Screen Recording');
  assert.equal(rows[0].blocks[0].assetId, 'video-asset');
  assert.equal(rows[0].blocks[0].widthPct, 100);
});

test('buildTimelineTracks ignores stale transitional top-level tracks', () => {
  const project = makeProject({
    duration: 200,
    tracks: [track({ id: 'timeline-v1', label: 'Canonical Video', clips: [clip({ id: 'canonical', timelineIn: 50, timelineOut: 150, sourceOut: 100 })] })],
    staleTracks: [track({ id: 'stale-v1', label: 'Stale Video', clips: [clip({ id: 'stale', timelineIn: 0, timelineOut: 200, sourceOut: 200 })] })],
  });

  const rows = buildTimelineTracks(project);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'timeline-v1');
  assert.equal(rows[0].label, 'Canonical Video');
  assert.equal(rows[0].blocks[0].id, 'canonical');
  assert.equal(rows[0].blocks[0].leftPct, 25);
  assert.equal(rows[0].blocks[0].widthPct, 50);
});

test('buildTimelineTracks preserves multi-track order and generated track kinds', () => {
  const project = makeProject({
    duration: 200,
    tracks: [
      track({ id: 'a1', kind: 'audio', index: 0, label: 'Voice', clips: [{ ...clip({ id: 'audio', source: { kind: 'project-asset', id: audioAsset.id }, timelineIn: 0, timelineOut: 100, sourceOut: 100 }) }] }),
      track({ id: 'v1', kind: 'video', index: 3, label: 'V1', clips: [] }),
      track({ id: 'c1', kind: 'captions', index: 2, label: 'Captions', clips: [clip({ id: 'cap', timelineIn: 50, timelineOut: 150, sourceOut: 100 })] }),
      track({ id: 'mg1', kind: 'motion-graphics', index: 1, label: 'Lower thirds', enabled: false, clips: [] }),
    ],
  });

  const rows = buildTimelineTracks(project);
  assert.deepEqual(rows.map((row) => row.id), ['v1', 'c1', 'mg1', 'a1']);
  assert.equal(rows[1].kind, 'captions');
  assert.equal(rows[1].blocks[0].leftPct, 25);
  assert.equal(rows[1].blocks[0].widthPct, 50);
  assert.equal(rows[2].enabled, false);
});

test('buildTimelineTracks passes through compact track state for controls', () => {
  const project = makeProject({
    tracks: [track({ id: 'v1', locked: true, height: 84, clips: [] })],
  });
  const rows = buildTimelineTracks(project);

  assert.equal(rows[0].locked, true);
  assert.equal(rows[0].height, 84);
  assert.equal(rows[0].index, 0);
});

test('buildLaneClips returns [] for unsupported requested lanes', () => {
  const project = makeProject({ tracks: [track({ clips: [clip()] })] });
  assert.deepEqual(buildLaneClips(project, 'not-a-kind'), []);
});

test('buildLaneClips routes audio and video clips to their canonical lanes', () => {
  const project = makeProject({
    duration: 100,
    tracks: [
      track({ id: 'v', kind: 'video', clips: [clip({ id: 'video', timelineIn: 0, timelineOut: 100, sourceOut: 100 })] }),
      track({ id: 'a', kind: 'audio', clips: [{ ...clip({ id: 'audio', source: { kind: 'project-asset', id: audioAsset.id }, timelineIn: 0, timelineOut: 100, sourceOut: 100 }) }] }),
    ],
  });

  assert.equal(buildLaneClips(project, 'audio')[0].id, 'audio');
  assert.equal(buildLaneClips(project, 'video')[0].id, 'video');
});

test('buildLaneClips normalizes against computed timeline duration', () => {
  const project = makeProject({
    duration: 100,
    tracks: [track({ clips: [clip({ id: 'c', timelineIn: 50, timelineOut: 150, sourceOut: 100 })] })],
  });
  const blocks = buildLaneClips(project, 'video');
  assert.equal(blocks.length, 1);
  assert.equal(Math.round(blocks[0].leftPct), 33);
  assert.equal(Math.round(blocks[0].widthPct), 67);
});

test('buildLaneClips defaults canonical clip blocks to enabled', () => {
  const project = makeProject({
    duration: 100,
    tracks: [track({ clips: [clip({ id: 'on', timelineIn: 0, timelineOut: 50, sourceOut: 50 }), clip({ id: 'off', timelineIn: 50, timelineOut: 100, sourceIn: 50, sourceOut: 100, enabled: false })] })],
  });
  const blocks = buildLaneClips(project, 'video');
  assert.equal(blocks[0].enabled, true);
  assert.equal(blocks[1].enabled, true);
});
