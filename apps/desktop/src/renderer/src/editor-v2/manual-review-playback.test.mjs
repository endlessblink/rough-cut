import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_PLAYBACK_RATES,
  beginJoinVerification,
  advanceJoinVerification,
  cancelJoinVerification,
} from './manual-review-playback.mjs';

test('manual review exposes the fixed pitch-safe speed set', () => {
  assert.deepEqual(REVIEW_PLAYBACK_RATES, [1, 1.5, 2, 3]);
});

test('a transcript cut verifies the join at normal speed before resuming fast review', () => {
  const verification = beginJoinVerification({
    joinFrame: 300,
    fps: 30,
    durationFrames: 900,
    reviewRate: 2,
  });

  assert.deepEqual(verification, {
    phase: 'verifying',
    startFrame: 278,
    endFrame: 323,
    reviewRate: 2,
  });
  assert.deepEqual(advanceJoinVerification(verification, 322), {
    verification,
    completed: false,
  });
  assert.deepEqual(advanceJoinVerification(verification, 323), {
    verification: null,
    completed: true,
    resumeRate: 2,
  });
});

test('join verification clamps around timeline edges and ignores invalid rates', () => {
  assert.deepEqual(
    beginJoinVerification({
      joinFrame: 2,
      fps: 30,
      durationFrames: 20,
      reviewRate: 7,
    }),
    {
      phase: 'verifying',
      startFrame: 0,
      endFrame: 20,
      reviewRate: 1,
    },
  );
});

test('manual seek or pause cancels automatic resume', () => {
  const verification = beginJoinVerification({
    joinFrame: 300,
    fps: 30,
    durationFrames: 900,
    reviewRate: 3,
  });

  assert.equal(cancelJoinVerification(verification), null);
  assert.deepEqual(advanceJoinVerification(null, 900), {
    verification: null,
    completed: false,
  });
});
