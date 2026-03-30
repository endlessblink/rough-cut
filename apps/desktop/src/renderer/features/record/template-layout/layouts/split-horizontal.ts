import type { Rect, TemplateLayoutResult } from '../types.js';

// Screen gets 62% of canvas width; camera gets 36%; gap is 2%
const SCREEN_W_FRAC = 0.62;
const CAMERA_W_FRAC = 0.36;
const GAP_FRAC = 0.02;

/**
 * SPLIT_HORIZONTAL layout: camera on the left (36% width),
 * screen on the right (62% width), with a 2% gap between.
 * Heights derived from sourceAspect; frames are centered vertically.
 *
 * +-------+--+-----------+
 * |       |  |           |
 * | camera|  |  screen   |
 * |       |  |           |
 * +-------+--+-----------+
 */
export function layoutSplitHorizontal(canvas: Rect, sourceAspect: number): TemplateLayoutResult {
  const gap = canvas.width * GAP_FRAC;
  const screenWidth = canvas.width * SCREEN_W_FRAC;
  const cameraWidth = canvas.width * CAMERA_W_FRAC;

  const screenHeight = screenWidth / sourceAspect;
  const cameraHeight = cameraWidth / sourceAspect;

  // Camera left, screen right; center each vertically
  const cameraX = canvas.x;
  const screenX = canvas.x + cameraWidth + gap;
  const cameraY = canvas.y + (canvas.height - cameraHeight) / 2;
  const screenY = canvas.y + (canvas.height - screenHeight) / 2;

  return {
    screenFrame: {
      x: screenX,
      y: screenY,
      width: screenWidth,
      height: screenHeight,
    },
    cameraFrame: {
      x: cameraX,
      y: cameraY,
      width: cameraWidth,
      height: cameraHeight,
    },
  };
}
