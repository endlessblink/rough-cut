import assert from 'node:assert/strict';
import test from 'node:test';
import { clipAudioGain, clipGainAtFrame, masterGain, previewNeedsLimiter, segmentAudioGain, slotGain } from './audio-volume.mjs';

const segments = [
  { clipId: 'a', timelineIn: 0, timelineOut: 30, trackIndex: 0 },
  { clipId: 'b', timelineIn: 30, timelineOut: 90, trackIndex: 0, audioGain: 0.5 },
  { clipId: 'c', timelineIn: 90, timelineOut: 120, trackIndex: 0, audioGain: 0 },
];

test('a clip without a level plays as recorded; muted is 0', () => {
  assert.equal(clipAudioGain({}), 1);
  assert.equal(clipAudioGain({ audio: { volume: 0.5 } }), 0.5);
  assert.equal(clipAudioGain({ audio: { volume: 2, muted: true } }), 0);
  assert.equal(clipAudioGain(null), 1);
});

test('the clip gain changes exactly at clip boundaries', () => {
  assert.equal(clipGainAtFrame(segments, 0), 1);
  assert.equal(clipGainAtFrame(segments, 29), 1);
  assert.equal(clipGainAtFrame(segments, 30), 0.5);
  assert.equal(clipGainAtFrame(segments, 89), 0.5);
  assert.equal(clipGainAtFrame(segments, 90), 0);
  assert.equal(clipGainAtFrame(segments, 500), 1, 'a gap is not a clip');
});

test('a slider being dragged overrides only the clips it is for', () => {
  const override = { clipIds: ['b'], gain: 1.5 };
  assert.equal(clipGainAtFrame(segments, 40, override), 1.5);
  assert.equal(clipGainAtFrame(segments, 10, override), 1);
  assert.equal(segmentAudioGain(segments[2], override), 0);
  assert.equal(segmentAudioGain(null), 1);
});

test('the slot level is the cut-join fade times the clip volume', () => {
  assert.equal(slotGain(1, segments[1]), 0.5);
  assert.equal(slotGain(0.5, segments[1]), 0.25);
  assert.equal(slotGain(0, segments[0]), 0, 'the standby stays silent until it takes over');
  assert.equal(slotGain(1, segments[0]), 1, 'untouched clips keep exactly the old level');
});

test('the master is the track volume, or silent while the pickup mute is on', () => {
  assert.equal(masterGain(), 1);
  assert.equal(masterGain({ trackGain: 2 }), 2);
  assert.equal(masterGain({ trackGain: 2, audioMuted: true }), 0);
  assert.equal(masterGain({ trackGain: 9 }), 4);
});

test('the preview limiter is only switched in when something plays above 100%', () => {
  assert.equal(previewNeedsLimiter({ trackGain: 1, segments }), false);
  assert.equal(previewNeedsLimiter({ trackGain: 2, segments }), true);
  assert.equal(previewNeedsLimiter({ trackGain: 2, segments: [segments[1]] }), false, '200% x 50% = 100%');
  assert.equal(previewNeedsLimiter({ trackGain: 1, segments, override: { clipIds: ['a'], gain: 1.2 } }), true);
  assert.equal(previewNeedsLimiter({ trackGain: 0, segments, override: { clipIds: ['a'], gain: 2 } }), false);
  assert.equal(previewNeedsLimiter({ trackGain: 1.5 }), true);
});
