import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaneClips } from './timeline-clips.mjs';

const makeProject = (composition) => ({
  document: { composition },
});

test('buildLaneClips returns [] for null/empty projects', () => {
  assert.deepEqual(buildLaneClips(null, 'video'), []);
  assert.deepEqual(buildLaneClips({}, 'video'), []);
  assert.deepEqual(buildLaneClips(makeProject({}), 'video'), []);
  assert.deepEqual(buildLaneClips(makeProject({ duration: 0, tracks: [] }), 'video'), []);
});

test('buildLaneClips returns [] for captions and motion-graphics (not in v13 schema)', () => {
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
