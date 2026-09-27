import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUT_PREROLL_LEAD_SEC,
  CUT_PREROLL_PREPARE_SEC,
  isPrerollableCut,
  planCutPreroll,
  standbyAlignedForCut,
} from './timeline-cut-preroll.mjs';

const fps = 30;
// 3 s removed: timeline [0,150) plays source [0,150), then [150,600) plays source [240,690).
const active = { timelineIn: 0, timelineOut: 150, sourceIn: 0, sourceOut: 150, trackIndex: 0 };
const next = { timelineIn: 150, timelineOut: 600, sourceIn: 240, sourceOut: 690, trackIndex: 0 };

test('only adjacent cuts that skip source are pre-rolled', () => {
  assert.equal(isPrerollableCut(active, next), true);
  // A point split continues the same source: the decoder is already there.
  assert.equal(isPrerollableCut(active, { ...next, sourceIn: 150, sourceOut: 600 }), false);
  // A gap on the timeline is not a cut to cross.
  assert.equal(isPrerollableCut(active, { ...next, timelineIn: 160 }), false);
  assert.equal(isPrerollableCut(active, null), false);
});

test('the standby stays idle until the cut is close', () => {
  const sourceFrame = active.sourceOut - Math.ceil((CUT_PREROLL_PREPARE_SEC + 0.5) * fps);
  assert.equal(planCutPreroll({ active, next, sourceFrame, fps }).phase, 'idle');
});

test('the standby is parked one lead ahead of the next clip, then started at the lead', () => {
  const prepare = planCutPreroll({ active, next, sourceFrame: active.sourceOut - 1.5 * fps, fps });
  assert.equal(prepare.phase, 'prepare');
  assert.equal(prepare.seekSourceSec, next.sourceIn / fps - CUT_PREROLL_LEAD_SEC);

  const play = planCutPreroll({ active, next, sourceFrame: active.sourceOut - CUT_PREROLL_LEAD_SEC * fps, fps });
  assert.equal(play.phase, 'play');
  assert.equal(play.key, prepare.key);
});

test('playback that starts inside the lead parks the standby only as far back as the time left', () => {
  const late = planCutPreroll({ active, next, sourceFrame: active.sourceOut - 9, fps });
  assert.equal(late.phase, 'play');
  assert.equal(late.seekSourceSec, (next.sourceIn - 9) / fps);
});

test('faster playback parks the standby further back in source time', () => {
  const plan = planCutPreroll({ active, next, sourceFrame: active.sourceOut - 3 * fps, fps, rate: 2 });
  assert.equal(plan.phase, 'prepare');
  assert.equal(plan.seekSourceSec, next.sourceIn / fps - CUT_PREROLL_LEAD_SEC * 2);
});

test('a next clip at the very start of its media cannot be pre-rolled before frame 0', () => {
  const fromStart = { ...next, sourceIn: 0, sourceOut: 450 };
  const early = planCutPreroll({ active: { ...active, sourceIn: 300, sourceOut: 450 }, next: fromStart, sourceFrame: 450 - 1.5 * fps, fps });
  assert.equal(early.phase, 'prepare');
  assert.equal(early.seekSourceSec, 0);
});

test('the standby takes over only when it is at the next clip, never far off', () => {
  assert.equal(standbyAlignedForCut(next.sourceIn / fps, next, fps), true);
  assert.equal(standbyAlignedForCut((next.sourceIn - 6) / fps, next, fps), true);
  assert.equal(standbyAlignedForCut((next.sourceIn + 2) / fps, next, fps), true);
  assert.equal(standbyAlignedForCut((next.sourceIn + 5) / fps, next, fps), false);
  assert.equal(standbyAlignedForCut((next.sourceIn - 30) / fps, next, fps), false);
  assert.equal(standbyAlignedForCut(Number.NaN, next, fps), false);
});
