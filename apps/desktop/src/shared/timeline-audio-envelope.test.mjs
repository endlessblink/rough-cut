import assert from 'node:assert/strict';
import test from 'node:test';
import {
  timelineJoinFadeFrames,
  timelineJoinGain,
} from './timeline-audio-envelope.mjs';

const segments = [
  { timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30 },
  { timelineIn: 30, timelineOut: 60, sourceIn: 45, sourceOut: 75 },
];

test('adds paired fades only at an adjacent discontinuous source join', () => {
  assert.deepEqual(timelineJoinFadeFrames(segments, 0), {
    fadeInFrames: 0,
    fadeOutFrames: 2,
  });
  assert.deepEqual(timelineJoinFadeFrames(segments, 1), {
    fadeInFrames: 2,
    fadeOutFrames: 0,
  });
  assert.deepEqual(
    timelineJoinFadeFrames(
      [
        segments[0],
        { ...segments[1], sourceIn: 30, sourceOut: 60 },
      ],
      0,
    ),
    { fadeInFrames: 0, fadeOutFrames: 0 },
  );
  assert.deepEqual(
    timelineJoinFadeFrames(
      [
        { ...segments[0], trackIndex: 1 },
        { ...segments[1], trackIndex: 2 },
      ],
      0,
    ),
    { fadeInFrames: 0, fadeOutFrames: 0 },
  );
});

test('uses the same two-frame linear envelope on both sides of the join', () => {
  assert.equal(timelineJoinGain(segments, segments[0], 27), 1);
  assert.equal(timelineJoinGain(segments, segments[0], 28), 1);
  assert.equal(timelineJoinGain(segments, segments[0], 29), 0.5);
  assert.equal(timelineJoinGain(segments, segments[1], 30), 0);
  assert.equal(timelineJoinGain(segments, segments[1], 31), 0.5);
  assert.equal(timelineJoinGain(segments, segments[1], 32), 1);
});
