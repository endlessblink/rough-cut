import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaneClips, buildTimelineTracks } from './timeline-clips.mjs';

const makeProject = (composition) => ({
  document: { composition },
});

const makeNleProject = ({ duration = 300, tracks = [] } = {}) => ({
  document: {
    composition: { duration, tracks: [] },
    tracks,
  },
});

test('buildLaneClips returns [] for null/empty projects', () => {
  assert.deepEqual(buildLaneClips(null, 'video'), []);
  assert.deepEqual(buildLaneClips({}, 'video'), []);
  assert.deepEqual(buildLaneClips(makeProject({}), 'video'), []);
  assert.deepEqual(buildLaneClips(makeProject({ duration: 0, tracks: [] }), 'video'), []);
});

test('buildTimelineTracks returns [] for a blank project instead of fixed broken lanes', () => {
  const project = makeNleProject({ duration: 0, tracks: [] });
  assert.deepEqual(buildTimelineTracks(project), []);
});

test('buildTimelineTracks maps single-recording NLE tracks into dynamic rows', () => {
  const project = makeNleProject({
    duration: 120,
    tracks: [
      {
        id: 'screen-track',
        kind: 'video',
        index: 0,
        label: 'Screen Recording',
        enabled: true,
        locked: false,
        muted: false,
        clips: [
          {
            id: 'screen-clip',
            source: { kind: 'project-asset', id: 'recording-asset' },
            timelineIn: 0,
            timelineOut: 120,
            sourceIn: 0,
            sourceOut: 120,
          },
        ],
      },
    ],
  });

  const rows = buildTimelineTracks(project);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'screen-track');
  assert.equal(rows[0].label, 'Screen Recording');
  assert.equal(rows[0].blocks[0].assetId, 'recording-asset');
  assert.equal(rows[0].blocks[0].widthPct, 100);
});

test('buildTimelineTracks preserves multi-track order and generated track kinds', () => {
  const project = makeNleProject({
    duration: 200,
    tracks: [
      { id: 'a1', kind: 'audio', index: 0, label: 'Voice', enabled: true, locked: false, muted: false, clips: [] },
      { id: 'v1', kind: 'video', index: 3, label: 'V1', enabled: true, locked: false, muted: false, clips: [] },
      {
        id: 'c1',
        kind: 'captions',
        index: 2,
        label: 'Captions',
        enabled: true,
        locked: false,
        muted: false,
        clips: [{ id: 'cap', source: { kind: 'ai-asset', id: 'caption-asset' }, timelineIn: 50, timelineOut: 150, sourceIn: 0, sourceOut: 100 }],
      },
      { id: 'mg1', kind: 'motion-graphics', index: 1, label: 'Lower thirds', enabled: false, locked: false, muted: false, clips: [] },
    ],
  });

  const rows = buildTimelineTracks(project);
  assert.deepEqual(rows.map((row) => row.id), ['v1', 'c1', 'mg1', 'a1']);
  assert.equal(rows[1].kind, 'captions');
  assert.equal(rows[1].blocks[0].leftPct, 25);
  assert.equal(rows[1].blocks[0].widthPct, 50);
  assert.equal(rows[2].enabled, false);
});

test('buildLaneClips returns [] for captions and motion-graphics in legacy composition fallback', () => {
  const project = makeProject({
    duration: 300,
    tracks: [
      { type: 'video', clips: [{ id: 'c1', timelineIn: 0, timelineOut: 300 }] },
    ],
  });
  assert.deepEqual(buildLaneClips(project, 'captions'), []);
  assert.deepEqual(buildLaneClips(project, 'motion-graphics'), []);
});

test('buildLaneClips maps video-track clips onto the Video lane with normalized percentages', () => {
  const project = makeProject({
    duration: 300,
    tracks: [
      {
        type: 'video',
        clips: [
          { id: 'c1', assetId: 'a1', name: 'Intro', timelineIn: 0, timelineOut: 150 },
          { id: 'c2', assetId: 'a2', name: 'Outro', timelineIn: 150, timelineOut: 300 },
        ],
      },
    ],
  });
  const blocks = buildLaneClips(project, 'video');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].id, 'c1');
  assert.equal(blocks[0].leftPct, 0);
  assert.equal(blocks[0].widthPct, 50);
  assert.equal(blocks[0].name, 'Intro');
  assert.equal(blocks[1].leftPct, 50);
  assert.equal(blocks[1].widthPct, 50);
});

test('buildLaneClips routes audio-track clips onto the Audio lane and ignores video', () => {
  const project = makeProject({
    duration: 100,
    tracks: [
      { type: 'video', clips: [{ id: 'v', timelineIn: 0, timelineOut: 100 }] },
      { type: 'audio', clips: [{ id: 'a', timelineIn: 0, timelineOut: 100 }] },
    ],
  });
  const audioBlocks = buildLaneClips(project, 'audio');
  assert.equal(audioBlocks.length, 1);
  assert.equal(audioBlocks[0].id, 'a');
  const videoBlocks = buildLaneClips(project, 'video');
  assert.equal(videoBlocks.length, 1);
  assert.equal(videoBlocks[0].id, 'v');
});

test('buildLaneClips clamps clips that overflow the composition duration', () => {
  const blocks = buildLaneClips(
    makeProject({
      duration: 100,
      tracks: [{ type: 'video', clips: [{ id: 'c', timelineIn: 50, timelineOut: 200 }] }],
    }),
    'video',
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].leftPct, 50);
  assert.equal(blocks[0].widthPct, 50);
});

test('buildLaneClips drops zero/negative-width clips', () => {
  const blocks = buildLaneClips(
    makeProject({
      duration: 100,
      tracks: [{
        type: 'video',
        clips: [
          { id: 'c1', timelineIn: 10, timelineOut: 10 },
          { id: 'c2', timelineIn: 50, timelineOut: 40 },
          { id: 'c3', timelineIn: 0, timelineOut: 50 },
        ],
      }],
    }),
    'video',
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, 'c3');
});

test('buildLaneClips passes through enabled flag (default true)', () => {
  const blocks = buildLaneClips(
    makeProject({
      duration: 100,
      tracks: [{
        type: 'video',
        clips: [
          { id: 'on', timelineIn: 0, timelineOut: 50 },
          { id: 'off', timelineIn: 50, timelineOut: 100, enabled: false },
        ],
      }],
    }),
    'video',
  );
  assert.equal(blocks[0].enabled, true);
  assert.equal(blocks[1].enabled, false);
});
