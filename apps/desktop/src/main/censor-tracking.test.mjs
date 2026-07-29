import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  matchTemplateOffset,
  trackRectAcrossFrames,
  simplifyCensorKeyframes,
  createRectTracker,
} from './censor-tracking.mjs';

const W = 160;
const H = 90;

/**
 * A grey frame with a textured patch drawn at (x, y).
 *
 * Textured on purpose: a flat block matches equally well everywhere it fits, so a
 * tracker tested against one would score identically at every offset and its
 * "success" would say nothing.
 */
function frameWithPatch(x, y, size = 20, noiseSeed = 1) {
  const buffer = new Uint8Array(W * H);
  // Deterministic background texture — no Math.random, so a failure reproduces.
  for (let i = 0; i < buffer.length; i += 1) buffer[i] = 90 + ((i * 37 + noiseSeed * 11) % 24);
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      buffer[py * W + px] = (dx * 7 + dy * 13) % 2 === 0 ? 240 : 20;
    }
  }
  return buffer;
}

test('matchTemplateOffset finds a patch that moved', () => {
  const first = frameWithPatch(40, 30);
  const moved = frameWithPatch(46, 27);

  const result = matchTemplateOffset({
    template: first,
    frame: moved,
    width: W,
    height: H,
    rect: { x: 40, y: 30, w: 20, h: 20 },
    searchRadius: 10,
  });

  assert.equal(result.dx, 6, `expected dx 6, got ${result.dx}`);
  assert.equal(result.dy, -3, `expected dy -3, got ${result.dy}`);
  assert.ok(result.score > 0.9, `expected a confident match, got ${result.score}`);
});

test('matchTemplateOffset reports low confidence when the patch is gone', () => {
  const first = frameWithPatch(40, 30);
  // Same background, no patch anywhere: nothing to match.
  const empty = frameWithPatch(-100, -100);

  const result = matchTemplateOffset({
    template: first,
    frame: empty,
    width: W,
    height: H,
    rect: { x: 40, y: 30, w: 20, h: 20 },
    searchRadius: 10,
  });

  assert.ok(result.score < 0.8, `expected low confidence, got ${result.score}`);
});

test('matchTemplateOffset survives a global brightness change', () => {
  // Auto-exposure and window focus changes shift the whole frame's brightness. A
  // raw difference metric would lose the target; a normalized one must not.
  const first = frameWithPatch(40, 30);
  const brighter = frameWithPatch(45, 30).map((value) => Math.min(255, value + 30));

  const result = matchTemplateOffset({
    template: first,
    frame: Uint8Array.from(brighter),
    width: W,
    height: H,
    rect: { x: 40, y: 30, w: 20, h: 20 },
    searchRadius: 10,
  });

  assert.equal(result.dx, 5);
  assert.ok(result.score > 0.9, `expected brightness not to matter, got ${result.score}`);
});

test('trackRectAcrossFrames follows a patch across a sequence', () => {
  const frames = [];
  for (let i = 0; i < 8; i += 1) frames.push(frameWithPatch(40 + i * 3, 30 + i));

  const keyframes = trackRectAcrossFrames({
    frames,
    width: W,
    height: H,
    startFrame: 100,
    startRect: { x: 40 / W, y: 30 / H, w: 20 / W, h: 20 / H },
  });

  assert.equal(keyframes.length, 8);
  assert.equal(keyframes[0].frame, 100);
  assert.equal(keyframes[7].frame, 107);
  // Normalized back out, the last keyframe must sit on the patch's last position.
  assert.ok(Math.abs(keyframes[7].rect.x - (40 + 21) / W) < 0.01, `drifted to ${keyframes[7].rect.x * W}`);
  assert.ok(Math.abs(keyframes[7].rect.y - (30 + 7) / H) < 0.01, `drifted to ${keyframes[7].rect.y * H}`);
  // Size is never inferred: this tracker follows position only.
  assert.ok(keyframes.every((keyframe) => Math.abs(keyframe.rect.w - 20 / W) < 1e-9));
});

test('trackRectAcrossFrames holds position instead of wandering when it loses the target', () => {
  // Losing the target must not fling the censor somewhere random — that would
  // uncover the content it exists to hide. Holding still is the safe failure.
  const frames = [frameWithPatch(40, 30), frameWithPatch(40, 30), frameWithPatch(-100, -100), frameWithPatch(-100, -100)];

  const keyframes = trackRectAcrossFrames({
    frames,
    width: W,
    height: H,
    startFrame: 0,
    startRect: { x: 40 / W, y: 30 / H, w: 20 / W, h: 20 / H },
  });

  const lastTwo = keyframes.slice(-2);
  for (const keyframe of lastTwo) {
    assert.ok(Math.abs(keyframe.rect.x - 40 / W) < 0.02, `wandered to ${keyframe.rect.x * W}`);
    assert.ok(Math.abs(keyframe.rect.y - 30 / H) < 0.02, `wandered to ${keyframe.rect.y * H}`);
  }
});

test('trackRectAcrossFrames keeps the rect inside the frame', () => {
  const frames = [];
  for (let i = 0; i < 10; i += 1) frames.push(frameWithPatch(120 + i * 6, 30));

  const keyframes = trackRectAcrossFrames({
    frames,
    width: W,
    height: H,
    startFrame: 0,
    startRect: { x: 120 / W, y: 30 / H, w: 20 / W, h: 20 / H },
  });

  for (const keyframe of keyframes) {
    assert.ok(keyframe.rect.x >= 0, `x went negative: ${keyframe.rect.x}`);
    assert.ok(keyframe.rect.x + keyframe.rect.w <= 1 + 1e-9, `ran past the right edge: ${keyframe.rect.x + keyframe.rect.w}`);
  }
});

test('simplifyCensorKeyframes drops keyframes a straight line already covers', () => {
  // Every keyframe becomes its own filter in the export, so a per-frame track on a
  // long clip is thousands of filters for a path a handful of points describe.
  const keyframes = [];
  for (let frame = 0; frame <= 60; frame += 1) {
    keyframes.push({ frame, rect: { x: frame / 600, y: 0.2, w: 0.1, h: 0.1 } });
  }

  const simplified = simplifyCensorKeyframes(keyframes, 0.002);

  assert.ok(simplified.length < 5, `expected a straight path to collapse, kept ${simplified.length}`);
  assert.equal(simplified[0].frame, 0);
  assert.equal(simplified[simplified.length - 1].frame, 60);
});

test('simplifyCensorKeyframes keeps the corners of a path that changes direction', () => {
  const keyframes = [];
  for (let frame = 0; frame <= 30; frame += 1) keyframes.push({ frame, rect: { x: frame / 300, y: 0.2, w: 0.1, h: 0.1 } });
  for (let frame = 31; frame <= 60; frame += 1) keyframes.push({ frame, rect: { x: 0.1, y: 0.2 + (frame - 30) / 300, w: 0.1, h: 0.1 } });

  const simplified = simplifyCensorKeyframes(keyframes, 0.002);
  const corner = simplified.find((keyframe) => keyframe.frame >= 28 && keyframe.frame <= 33);

  assert.ok(corner, 'expected the turn to survive simplification');
  assert.ok(simplified.length < 12, `expected a compact path, kept ${simplified.length}`);
});

test('simplifyCensorKeyframes never returns fewer than the endpoints', () => {
  const simplified = simplifyCensorKeyframes([
    { frame: 0, rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
    { frame: 30, rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
  ], 0.002);
  assert.equal(simplified.length, 2);
});

test('createRectTracker fed one frame at a time matches tracking the whole array', () => {
  // The whole-array form is convenient for tests but cannot be what runs on a real
  // recording: a censor covering five minutes is 9000 analysis frames, which held
  // 1.2GB and peaked the process at 2.4GB when measured. The streaming form must
  // agree with it exactly, or "it is cheaper" would mean "it is a different tracker".
  const frames = [];
  for (let i = 0; i < 12; i += 1) frames.push(frameWithPatch(40 + i * 3, 30 + (i % 4)));

  const startRect = { x: 40 / W, y: 30 / H, w: 20 / W, h: 20 / H };
  const wholeArray = trackRectAcrossFrames({ frames, width: W, height: H, startFrame: 7, startRect });

  const tracker = createRectTracker({ width: W, height: H, startFrame: 7, startRect });
  for (const frame of frames) tracker.push(frame);

  assert.deepEqual(tracker.keyframes(), wholeArray);
});

test('createRectTracker holds no reference to the frames it has seen', () => {
  // The point of the streaming form. If it kept them, it would be the array form
  // with extra steps and would still exhaust memory on a long censor.
  const tracker = createRectTracker({
    width: W,
    height: H,
    startFrame: 0,
    startRect: { x: 40 / W, y: 30 / H, w: 20 / W, h: 20 / H },
  });
  for (let i = 0; i < 30; i += 1) tracker.push(frameWithPatch(40 + i, 30));

  // One template, whatever the length of the clip.
  assert.equal(tracker.retainedFrames(), 1);
  assert.equal(tracker.keyframes().length, 30);
});
