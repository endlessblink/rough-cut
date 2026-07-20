import test from 'node:test';
import assert from 'node:assert/strict';
import { alignCursorEvents, deriveCursorAnchorsFromEventsLog } from './cursor-alignment.mjs';

const FPS = 30;

function move(timeMs, x = 10, y = 20) {
  return { frame: Math.round((timeMs / 1000) * FPS), timeMs, x, y, type: 'move', button: 0 };
}

test('alignCursorEvents passes events through when anchors are missing or zero', () => {
  const events = [move(0), move(500), move(1000)];
  assert.deepEqual(alignCursorEvents(events, null, FPS), events);
  assert.deepEqual(alignCursorEvents(events, [], FPS), events);
  assert.deepEqual(alignCursorEvents(events, [{ baseTimeMs: 0, anchorOffsetMs: 0 }], FPS), events);
});

test('alignCursorEvents shifts LATER for a negative gap (unified capture: telemetry clock starts after first video frame)', () => {
  // Measured on 2026-07-14: firstFrameMs - segmentStartedAtMs = -1107.
  const events = [move(0), move(5815), move(7175)];
  const aligned = alignCursorEvents(events, [{ baseTimeMs: 0, anchorOffsetMs: -1107 }], FPS);
  assert.equal(aligned.length, 3);
  assert.equal(aligned[0].timeMs, 1107);
  assert.equal(aligned[1].timeMs, 6922);
  assert.equal(aligned[1].frame, Math.round((6922 / 1000) * FPS));
  assert.equal(aligned[2].timeMs, 8282);
  assert.equal(aligned[2].frame, 248);
});

test('alignCursorEvents shifts EARLIER for a positive gap and drops pre-video events instead of clamping', () => {
  // Screen-only capture: ffmpeg's first frame lands after the telemetry
  // clock starts, e.g. +400ms. Events from before the first video frame
  // have nothing to align to and must be dropped (frame-0 clamping was the
  // 4ef0aa3 regression).
  const events = [move(9), move(200), move(500), move(1400)];
  const aligned = alignCursorEvents(events, [{ baseTimeMs: 0, anchorOffsetMs: 400 }], FPS);
  assert.deepEqual(aligned.map((event) => event.timeMs), [100, 1000]);
  assert.deepEqual(aligned.map((event) => event.frame), [3, 30]);
});

test('alignCursorEvents preserves event fields other than frame/timeMs', () => {
  const click = { frame: 174, timeMs: 5815, x: 785, y: 481, type: 'down', button: 0 };
  const [aligned] = alignCursorEvents([click], [{ baseTimeMs: 0, anchorOffsetMs: -1107 }], FPS);
  assert.equal(aligned.type, 'down');
  assert.equal(aligned.button, 0);
  assert.equal(aligned.x, 785);
  assert.equal(aligned.y, 481);
});

test('alignCursorEvents applies cumulative per-segment offsets', () => {
  // Segment 1: 0..2000 on the telemetry clock, gap +100.
  // Segment 2: starts at baseTimeMs 2000, its own gap +300 (cumulative 400).
  const events = [move(1000), move(2500)];
  const anchors = [
    { baseTimeMs: 0, anchorOffsetMs: 100 },
    { baseTimeMs: 2000, anchorOffsetMs: 300 },
  ];
  const aligned = alignCursorEvents(events, anchors, FPS);
  assert.deepEqual(aligned.map((event) => event.timeMs), [900, 2100]);
});

test('alignCursorEvents drops events landing before their own segment start', () => {
  const anchors = [
    { baseTimeMs: 0, anchorOffsetMs: 0 },
    { baseTimeMs: 2000, anchorOffsetMs: 500 },
  ];
  // Aligned segment-2 start is 2000 - 0 = 2000; event at 2200 aligns to 1700
  // which is before the segment's first video frame -> dropped.
  const events = [move(1000), move(2200), move(2800)];
  const aligned = alignCursorEvents(events, anchors, FPS);
  assert.deepEqual(aligned.map((event) => event.timeMs), [1000, 2300]);
});

test('alignCursorEvents is idempotent-safe on already-empty or invalid input', () => {
  assert.deepEqual(alignCursorEvents([], [{ baseTimeMs: 0, anchorOffsetMs: -500 }], FPS), []);
  assert.deepEqual(alignCursorEvents(null, [{ baseTimeMs: 0, anchorOffsetMs: -500 }], FPS), []);
});

test('deriveCursorAnchorsFromEventsLog recovers the signed gap from a legacy log', () => {
  // Mirrors rough-cut-2026-07-14T16-46-15-389Z.events.log: recording-start at
  // epoch 1784047575.389s, first frame at 1784047575787ms, first telemetry
  // sample at t=1784047576.903s with elapsedMs=9 (segment clock zero =
  // 1784047576894ms) -> gap = 575787 - 576894 = -1107ms.
  const log = [
    JSON.stringify({ t: 1784047575.389, kind: 'recording-start', startedAt: '2026-07-14T16:46:15.389Z', fps: 30 }),
    JSON.stringify({ t: 1784047576.132, kind: 'first-frame-anchor', firstFrameMs: 1784047575787, segmentIndex: 1 }),
    JSON.stringify({ t: 1784047576.9, kind: 'cursor-sample-begin' }),
    JSON.stringify({ t: 1784047576.903, kind: 'cursor-sample-end', ok: true, tookMs: 2, x: 100, y: 100, frame: 0, elapsedMs: 9 }),
    '',
  ].join('\n');
  const anchors = deriveCursorAnchorsFromEventsLog(log);
  assert.deepEqual(anchors, [{ baseTimeMs: 0, anchorOffsetMs: -1107 }]);
});

test('deriveCursorAnchorsFromEventsLog refuses multi-segment logs and incomplete logs', () => {
  const resumeLog = [
    JSON.stringify({ t: 1, kind: 'recording-start', startedAt: '2026-07-14T16:46:15.389Z' }),
    JSON.stringify({ t: 2, kind: 'first-frame-anchor', firstFrameMs: 1500, segmentIndex: 1 }),
    JSON.stringify({ t: 3, kind: 'cursor-sample-end', ok: true, elapsedMs: 5 }),
    JSON.stringify({ t: 4, kind: 'recording-resume', segmentIndex: 2 }),
  ].join('\n');
  assert.equal(deriveCursorAnchorsFromEventsLog(resumeLog), null);
  assert.equal(deriveCursorAnchorsFromEventsLog(''), null);
  assert.equal(deriveCursorAnchorsFromEventsLog('not json\n{"kind":"noise"}'), null);
  // No successful cursor sample -> segment clock zero unknown.
  const noSample = [
    JSON.stringify({ t: 1, kind: 'recording-start', startedAt: '2026-07-14T16:46:15.389Z' }),
    JSON.stringify({ t: 2, kind: 'first-frame-anchor', firstFrameMs: 1500, segmentIndex: 1 }),
  ].join('\n');
  assert.equal(deriveCursorAnchorsFromEventsLog(noSample), null);
});

test('deriveCursorAnchorsFromEventsLog skips positive legacy offsets (estimator-error dominated)', () => {
  // Legacy first-frame-anchor values are upper bounds: a positive gap on a
  // screen-only recording is ~all encoder-pipeline estimation error (true
  // offset is near zero) and shifting by it would overcorrect by seconds.
  const log = [
    JSON.stringify({ t: 1000.0, kind: 'recording-start', startedAt: '2026-07-14T16:46:15.389Z' }),
    JSON.stringify({ t: 1001.6, kind: 'first-frame-anchor', firstFrameMs: 1001600, segmentIndex: 1 }),
    JSON.stringify({ t: 1000.11, kind: 'cursor-sample-end', ok: true, elapsedMs: 10 }),
  ].join('\n');
  assert.equal(deriveCursorAnchorsFromEventsLog(log), null);
});
