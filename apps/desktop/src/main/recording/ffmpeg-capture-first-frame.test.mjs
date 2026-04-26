// Unit tests for createFirstFrameDetector — the helper that parses
// FFmpeg `-progress pipe:1` blocks on stdout and reports the wall-clock
// time of the actual first captured frame.
//
// The detector fires onFirstFrame(minMs) where:
//   minMs = min(arrival_wallclock_ms - out_time_us / 1000)
// across the first N progress blocks where out_time_us > 0.
//
// Empirically (1080p60 libvpx realtime on the dev workstation) the
// `arrival - out_time_us` upper bound converges to within 2 ms of truth
// by the third non-zero block, ~250 ms after spawn. The detector tightens
// the bound monotonically, then fires once.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createFirstFrameDetector } from './ffmpeg-capture.mjs';

function block({ frame, outTimeUs }) {
  return [
    `frame=${frame}`,
    `fps=0.00`,
    `bitrate=N/A`,
    `total_size=0`,
    `out_time_us=${outTimeUs}`,
    `out_time_ms=${Math.floor(outTimeUs / 1000)}`,
    `out_time=00:00:00.000000`,
    `dup_frames=0`,
    `drop_frames=0`,
    `speed=N/A`,
    `progress=continue`,
    '',
  ].join('\n');
}

test('createFirstFrameDetector: skips out_time_us=0 timer ticks', () => {
  let received = null;
  const det = createFirstFrameDetector({
    onFirstFrame: (ms) => {
      received = ms;
    },
    maxBlocks: 3,
    maxWindowMs: 10_000,
  });
  // Three blocks all with out_time_us=0 (e.g., the very first progress
  // tick before frame 1 has been muxed).
  for (let i = 0; i < 3; i++) {
    det.observe(block({ frame: 0, outTimeUs: 0 }), 1000 + i * 50);
  }
  assert.equal(received, null, 'must not fire on zero-out-time blocks');
});

test('createFirstFrameDetector: converges to min(arrival - out_time_us)', () => {
  let received = null;
  const det = createFirstFrameDetector({
    onFirstFrame: (ms) => {
      received = ms;
    },
    maxBlocks: 3,
    maxWindowMs: 10_000,
  });
  // Reproduce the empirical run logged in the plan:
  //   block 1: arrival=149.7  out_time_us=16667   → derived 133.0
  //   block 2: arrival=200.4  out_time_us=116667  → derived 83.7
  //   block 3: arrival=264.6  out_time_us=183333  → derived 81.3
  det.observe(block({ frame: 1, outTimeUs: 16667 }), 149.7);
  assert.equal(received, null, 'one block should not be enough (maxBlocks=3)');
  det.observe(block({ frame: 6, outTimeUs: 116667 }), 200.4);
  assert.equal(received, null, 'two blocks should not be enough');
  det.observe(block({ frame: 10, outTimeUs: 183333 }), 264.6);
  assert.ok(
    received !== null && Math.abs(received - 81.267) < 0.01,
    `expected derived ≈ 81.27, got ${received}`,
  );
});

test('createFirstFrameDetector: fires only once even with many blocks', () => {
  let calls = 0;
  const det = createFirstFrameDetector({
    onFirstFrame: () => {
      calls += 1;
    },
    maxBlocks: 2,
    maxWindowMs: 10_000,
  });
  for (let i = 0; i < 20; i++) {
    det.observe(block({ frame: i + 1, outTimeUs: (i + 1) * 16667 }), 100 + i * 50);
  }
  assert.equal(calls, 1, 'onFirstFrame must fire exactly once');
});

test('createFirstFrameDetector: fires when maxWindowMs elapses with one block', () => {
  let received = null;
  const det = createFirstFrameDetector({
    onFirstFrame: (ms) => {
      received = ms;
    },
    maxBlocks: 100,
    maxWindowMs: 50,
  });
  det.observe(block({ frame: 1, outTimeUs: 16667 }), 1000);
  assert.equal(received, null, 'within window — should not fire yet');
  // Subsequent block arrives >maxWindowMs later — emitter checks elapsed
  // time on the next observe call.
  det.observe(block({ frame: 2, outTimeUs: 33333 }), 1100);
  assert.ok(
    received !== null,
    'should fire after maxWindowMs elapsed since first non-zero block',
  );
});

test('createFirstFrameDetector: handles partial chunks split mid-line', () => {
  let received = null;
  const det = createFirstFrameDetector({
    onFirstFrame: (ms) => {
      received = ms;
    },
    maxBlocks: 1,
    maxWindowMs: 10_000,
  });
  // Split the block across three chunk arrivals at the same timestamp.
  det.observe('frame=1\nfps=0.00\nout_time_us=', 200);
  det.observe('16667\nout_time_ms=16\n', 200);
  det.observe('progress=continue\n', 200);
  assert.ok(
    received !== null && Math.abs(received - (200 - 16.667)) < 0.01,
    `expected ≈ ${200 - 16.667}, got ${received}`,
  );
});

test('createFirstFrameDetector: handles progress=end same as progress=continue', () => {
  let received = null;
  const det = createFirstFrameDetector({
    onFirstFrame: (ms) => {
      received = ms;
    },
    maxBlocks: 1,
    maxWindowMs: 10_000,
  });
  det.observe(
    [
      'frame=2',
      'out_time_us=33333',
      'progress=end',
      '',
    ].join('\n'),
    1000,
  );
  assert.ok(received !== null, 'final block (progress=end) should also count');
});
