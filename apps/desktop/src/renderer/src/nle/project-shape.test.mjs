import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProjectFps,
  resolveCompositionDurationFrames,
  frameToSeconds,
  secondsToFrame,
  formatTimecode,
} from './project-shape.mjs';

test('resolveProjectFps prefers recording.fps, then document.settings.frameRate, then 30', () => {
  assert.equal(resolveProjectFps({ recording: { fps: 60 } }), 60);
  assert.equal(resolveProjectFps({ document: { settings: { frameRate: 24 } } }), 24);
  assert.equal(resolveProjectFps({}), 30);
  assert.equal(resolveProjectFps(null), 30);
  assert.equal(resolveProjectFps({ recording: { fps: 0 } }), 30);
});

test('resolveCompositionDurationFrames prefers composition.duration, then recording.duration, then 1', () => {
  assert.equal(resolveCompositionDurationFrames({ document: { composition: { duration: 450 } } }), 450);
  assert.equal(resolveCompositionDurationFrames({ recording: { duration: 300 } }), 300);
  assert.equal(resolveCompositionDurationFrames({}), 1);
  assert.equal(resolveCompositionDurationFrames({ document: { composition: { duration: 0 } } }), 1);
});

test('frameToSeconds and secondsToFrame are inverses at the frame level', () => {
  assert.equal(frameToSeconds(60, 30), 2);
  assert.equal(secondsToFrame(2, 30), 60);
  assert.equal(secondsToFrame(frameToSeconds(123, 30), 30), 123);
  // Invalid input clamps/zeroes.
  assert.equal(frameToSeconds(NaN, 30), 0);
  assert.equal(secondsToFrame(-1, 30), 0);
  assert.equal(secondsToFrame(1, 0), 0);
});

test('formatTimecode renders mm:ss:ff with zero-padded components', () => {
  assert.equal(formatTimecode(0, 30), '00:00:00');
  assert.equal(formatTimecode(29, 30), '00:00:29');
  assert.equal(formatTimecode(30, 30), '00:01:00'); // wraps to next second
  assert.equal(formatTimecode(90, 30), '00:03:00');
  assert.equal(formatTimecode(1865, 30), '01:02:05');
});
