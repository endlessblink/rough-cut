import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeFrameToAspect, shouldCropAspectResizeFrame } from './camera-frame.mjs';

function area(frame) {
  return frame.w * frame.h;
}

function center(frame) {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}

function pixelAspect(frame, canvasAspect = 16 / 9) {
  return (frame.w * canvasAspect) / frame.h;
}

test('camera aspect resize preserves visual footprint and center for wide and tall targets', () => {
  const frame = { x: 0.34, y: 0.3, w: 0.24, h: 0.32 };
  for (const aspect of ['16:9', '9:16', '4:3']) {
    const resized = resizeFrameToAspect(frame, aspect, '16:9');
    assert.equal(Number((area(resized) / area(frame)).toFixed(2)), 1);
    assert.ok(Math.abs(center(resized).x - center(frame).x) < 0.001);
    assert.ok(Math.abs(center(resized).y - center(frame).y) < 0.001);
  }
});

test('camera aspect resize matches requested pixel aspect', () => {
  const frame = { x: 0.2, y: 0.18, w: 0.3, h: 0.28 };
  assert.ok(Math.abs(pixelAspect(resizeFrameToAspect(frame, '16:9', '16:9')) - 16 / 9) < 0.001);
  assert.ok(Math.abs(pixelAspect(resizeFrameToAspect(frame, '9:16', '16:9')) - 9 / 16) < 0.001);
  assert.ok(Math.abs(pixelAspect(resizeFrameToAspect(frame, '4:3', '16:9')) - 4 / 3) < 0.001);
});

test('camera aspect resize clamps edge frames inside the canvas without collapsing', () => {
  const resized = resizeFrameToAspect({ x: 0.91, y: 0.82, w: 0.18, h: 0.22 }, '9:16', '16:9');
  assert.ok(resized.x >= 0);
  assert.ok(resized.y >= 0);
  assert.ok(resized.x + resized.w <= 1);
  assert.ok(resized.y + resized.h <= 1);
  assert.ok(resized.w >= 0.05);
  assert.ok(resized.h >= 0.05);
});

test('crop aspect claims the PiP frame only while frame aspect is free', () => {
  assert.equal(shouldCropAspectResizeFrame({ nextAspect: '16:9', cameraShape: 'rounded', frameAspect: 'free' }), true);
  assert.equal(shouldCropAspectResizeFrame({ nextAspect: '9:16', cameraShape: 'rounded', frameAspect: '16:9' }), false);
  assert.equal(shouldCropAspectResizeFrame({ nextAspect: '16:9', cameraShape: 'circle', frameAspect: 'free' }), false);
  assert.equal(shouldCropAspectResizeFrame({ nextAspect: 'free', cameraShape: 'rounded', frameAspect: 'free' }), false);
});
