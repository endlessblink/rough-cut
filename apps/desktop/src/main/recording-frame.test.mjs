import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_GAP, FRAME_THICKNESS, buildFrameHtml, frameShapeRects, frameSupported, frameWindowBounds } from './recording-frame.mjs';

const display = { x: 0, y: 0, width: 1920, height: 1080 };

test('the outline surrounds the recorded area without covering it', () => {
  const margin = FRAME_GAP + FRAME_THICKNESS;
  assert.deepEqual(frameWindowBounds({ x: 300, y: 200, width: 640, height: 360 }, display), {
    x: 300 - margin, y: 200 - margin, width: 640 + 2 * margin, height: 360 + 2 * margin,
  });
});

test('a full-screen recording keeps the outline inside the display', () => {
  assert.deepEqual(frameWindowBounds({ x: 0, y: 0, width: 1920, height: 1080 }, display), { x: 0, y: 0, width: 1920, height: 1080 });
});

test('a second display at a negative offset works', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1080 };
  const bounds = frameWindowBounds({ x: -1500, y: 100, width: 400, height: 300 }, left);
  assert.equal(bounds.x, -1505);
  assert.equal(bounds.width, 410);
});

test('the outline page has a paused state and is limited to Windows', () => {
  assert.match(buildFrameHtml(), /setState/);
  assert.equal(frameSupported('win32'), true);
  assert.equal(frameSupported('linux'), false);
});
test('the window is shaped to a hollow outline so clicks pass through the middle', () => {
  const rects = frameShapeRects(100, 60, 3);
  assert.equal(rects.length, 4);
  const covered = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  assert.equal(covered, 100 * 60 - 94 * 54);
  assert.equal(frameShapeRects(4, 4, 3).every((r) => r.width > 0 && r.height > 0), true);
});
