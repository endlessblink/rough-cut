import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timelineFrameToSourceFrame,
  activeClipAt,
  splitClipAtFrame,
  applySplitOnTrack,
} from './timeline-frames.mjs';

// Anchor clip used throughout: lives on the timeline 100..400 (half-open),
// pulling source frames 1000..1300 from its media file.
const ANCHOR = Object.freeze({
  id: 'c1',
  assetId: 'a1',
  trackId: 't1',
  timelineIn: 100,
  timelineOut: 400,
  sourceIn: 1000,
  sourceOut: 1300,
  enabled: true,
});

// --- timelineFrameToSourceFrame: maps timeline → source within half-open range ---

test('timelineFrameToSourceFrame returns the source frame inside the clip', () => {
  assert.equal(timelineFrameToSourceFrame(ANCHOR, 100), 1000); // first frame
  assert.equal(timelineFrameToSourceFrame(ANCHOR, 250), 1150);
  assert.equal(timelineFrameToSourceFrame(ANCHOR, 399), 1299); // last frame
});

test('timelineFrameToSourceFrame rejects frames outside the half-open range', () => {
  assert.equal(timelineFrameToSourceFrame(ANCHOR, 99), null);
  assert.equal(timelineFrameToSourceFrame(ANCHOR, 400), null); // exclusive upper
  assert.equal(timelineFrameToSourceFrame(ANCHOR, 1000), null);
});

test('timelineFrameToSourceFrame handles invalid input', () => {
  assert.equal(timelineFrameToSourceFrame(null, 100), null);
  assert.equal(timelineFrameToSourceFrame(ANCHOR, NaN), null);
  assert.equal(timelineFrameToSourceFrame({}, 100), null);
});

// --- activeClipAt: walks track clips, returns the one whose half-open range covers frame ---

test('activeClipAt returns the covering clip and null for gaps', () => {
  const track = { clips: [ANCHOR, { ...ANCHOR, id: 'c2', timelineIn: 500, timelineOut: 700, sourceIn: 2000, sourceOut: 2200 }] };
  assert.equal(activeClipAt(track, 100)?.id, 'c1');
  assert.equal(activeClipAt(track, 399)?.id, 'c1');
  assert.equal(activeClipAt(track, 400), null); // gap (exclusive upper)
  assert.equal(activeClipAt(track, 499), null); // gap
  assert.equal(activeClipAt(track, 500)?.id, 'c2');
});

// --- splitClipAtFrame: load-bearing half-open invariants ---

test('splitClipAtFrame produces adjacent, non-overlapping halves whose source ranges sum to the original', () => {
  const result = splitClipAtFrame(ANCHOR, 250);
  assert.ok(result, 'expected a non-null split');
  const { left, right } = result;
  // Timeline invariants — half-open adjacency.
  assert.equal(left.timelineIn, ANCHOR.timelineIn);
  assert.equal(left.timelineOut, 250);
  assert.equal(right.timelineIn, 250);
  assert.equal(right.timelineOut, ANCHOR.timelineOut);
  assert.equal(left.timelineOut, right.timelineIn, 'no gap and no overlap');
  // Source invariants — source split aligns with timeline split.
  assert.equal(left.sourceIn, ANCHOR.sourceIn);
  assert.equal(left.sourceOut, 1150); // sourceIn + (250 - 100)
  assert.equal(right.sourceIn, 1150);
  assert.equal(right.sourceOut, ANCHOR.sourceOut);
  assert.equal(left.sourceOut, right.sourceIn, 'source frames are continuous across the split');
  // Coverage invariant — the two halves cover the original exactly.
  const originalTimelineSpan = ANCHOR.timelineOut - ANCHOR.timelineIn;
  const halvesTimelineSpan = (left.timelineOut - left.timelineIn) + (right.timelineOut - right.timelineIn);
  assert.equal(halvesTimelineSpan, originalTimelineSpan);
  const originalSourceSpan = ANCHOR.sourceOut - ANCHOR.sourceIn;
  const halvesSourceSpan = (left.sourceOut - left.sourceIn) + (right.sourceOut - right.sourceIn);
  assert.equal(halvesSourceSpan, originalSourceSpan);
});

test('splitClipAtFrame is a no-op at clip edges (zero-width halves would result)', () => {
  assert.equal(splitClipAtFrame(ANCHOR, 100), null); // at timelineIn
  assert.equal(splitClipAtFrame(ANCHOR, 400), null); // at timelineOut
  assert.equal(splitClipAtFrame(ANCHOR, 50), null);  // before
  assert.equal(splitClipAtFrame(ANCHOR, 500), null); // after
});

test('splitClipAtFrame rounds non-integer frames before splitting', () => {
  const a = splitClipAtFrame(ANCHOR, 250.4);
  const b = splitClipAtFrame(ANCHOR, 250.6);
  assert.equal(a.left.timelineOut, 250);
  assert.equal(b.left.timelineOut, 251);
});

test('splitClipAtFrame preserves passthrough fields (id assignment is caller responsibility)', () => {
  const result = splitClipAtFrame({ ...ANCHOR, name: 'Intro', enabled: false }, 200);
  assert.equal(result.left.name, 'Intro');
  assert.equal(result.right.name, 'Intro');
  assert.equal(result.left.enabled, false);
  assert.equal(result.right.enabled, false);
});

test('splitClipAtFrame bails on retimed clips (timeline span != source span)', () => {
  // Retime: 300 timeline frames pulling 600 source frames (2x slow-mo).
  const retimed = { ...ANCHOR, sourceOut: 1600 };
  assert.equal(splitClipAtFrame(retimed, 250), null);
});

// --- applySplitOnTrack: immutable replacement ---

test('applySplitOnTrack replaces the original clip with [left, right] in place', () => {
  const track = {
    id: 't1',
    clips: [
      { ...ANCHOR, id: 'before', timelineIn: 0, timelineOut: 50 },
      ANCHOR,
      { ...ANCHOR, id: 'after', timelineIn: 500, timelineOut: 600 },
    ],
  };
  const { left, right } = splitClipAtFrame(ANCHOR, 250);
  const next = applySplitOnTrack(track, ANCHOR.id, { ...left, id: 'L' }, { ...right, id: 'R' });
  assert.notEqual(next, track, 'returns a new object');
  assert.deepEqual(next.clips.map((c) => c.id), ['before', 'L', 'R', 'after']);
});

test('applySplitOnTrack is a no-op (same reference) when the clipId is not found', () => {
  const track = { id: 't1', clips: [ANCHOR] };
  const { left, right } = splitClipAtFrame(ANCHOR, 250);
  const next = applySplitOnTrack(track, 'nonexistent', left, right);
  assert.equal(next, track);
});
