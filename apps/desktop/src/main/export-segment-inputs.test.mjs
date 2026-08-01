/**
 * A multi-segment export must not decode one stream into parallel branches.
 *
 * ffmpeg has no cross-branch backpressure. When every `trim` branch reads the same
 * decoded input, `concat` drains branch 0 while branches 1..N queue every frame handed
 * to them. On a 33-minute 1080p project the last branch alone covers ~42,000 frames at
 * ~8MB each — it wants hundreds of GB and simply grows until the machine dies. Measured
 * 2026-08-01: one render reached 63GB and left a 78GB box with 2GB available.
 *
 * The fix is to give each segment its own seeked input, so a branch only ever decodes
 * the frames it actually uses and has nothing to buffer on anyone else's behalf.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStyledExportArgs } from './export-service.mjs';

// Deliberately shaped like the real project that killed the machine: a short opening
// segment, then one starting far away in the source. The gap is what gets buffered.
const SEGMENTS = [
  { timelineIn: 0, timelineOut: 60, sourceIn: 30, sourceOut: 90 },
  { timelineIn: 60, timelineOut: 260, sourceIn: 900, sourceOut: 1100 },
  { timelineIn: 260, timelineOut: 560, sourceIn: 1500, sourceOut: 1800 },
];

function styledArgs(overrides = {}) {
  return buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceFps: 30,
    timelineSegments: SEGMENTS,
    timelineDurationFrames: 560,
    ...overrides,
  });
}

function filterGraph(args) {
  return args[args.indexOf('-filter_complex') + 1];
}

test('every timeline segment decodes from its own input, not one shared stream', () => {
  const args = styledArgs();
  const graph = filterGraph(args);

  // Each segment branch must name a distinct input index. Asserting on the set of
  // referenced inputs rather than on filter syntax, so the graph can be rewritten
  // freely as long as the branches stop sharing a decoder.
  const videoInputsUsed = new Set([...graph.matchAll(/\[(\d+):v\]/g)].map((match) => match[1]));

  assert.equal(
    videoInputsUsed.size,
    SEGMENTS.length,
    `segments share a decoded input (${[...videoInputsUsed].join(',')}), `
      + 'so concat drains one branch while the others buffer every frame',
  );
});

test('one input is opened per segment, plus the original for audio', () => {
  const args = styledArgs();
  const inputs = args.reduce((count, arg) => (arg === '-i' ? count + 1 : count), 0);
  assert.equal(inputs, SEGMENTS.length + 1, 'expected a dedicated input per segment');
});

test('each segment input is seeked to that segment, so it decodes only its own frames', () => {
  const args = styledArgs();
  const seeks = args.reduce((count, arg) => (arg === '-ss' ? count + 1 : count), 0);

  assert.ok(
    seeks >= SEGMENTS.length,
    `expected a seek per segment, found ${seeks} — an unseeked input decodes the whole file`,
  );
});

test('a single-segment export still uses one input', () => {
  const args = styledArgs({
    timelineSegments: [{ timelineIn: 0, timelineOut: 60, sourceIn: 30, sourceOut: 90 }],
    timelineDurationFrames: 60,
  });
  const inputs = args.reduce((count, arg) => (arg === '-i' ? count + 1 : count), 0);
  assert.equal(inputs, 1, 'one segment should not multiply inputs');
});
