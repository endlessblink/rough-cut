import type { Rect, TemplateLayoutResult } from '../types.js';

// Camera occupies 36% of canvas width; screen gets the rest
const CAMERA_W_FRAC = 0.36;
// Gap between camera and screen as a fraction of canvas width
const GAP_FRAC = 0.02;

/**
 * SPLIT_HORIZONTAL layout: camera on the left (36% width),
 * screen on the right (remaining width), with a small gap between.
 *
 * +-------+--+-----------+
 * |       |  |           |
 * | camera|  |  screen   |
 * |       |  |           |
 * +-------+--+-----------+
 */
export function layoutSplitHorizontal(canvas: Rect): TemplateLayoutResult {
  const gap = canvas.width * GAP_FRAC;
  const cameraWidth = canvas.width * CAMERA_W_FRAC;
  const screenWidth = canvas.width - cameraWidth - gap;

  return {
    screenFrame: {
      x: canvas.x + cameraWidth + gap,
      y: canvas.y,
      width: screenWidth,
      height: canvas.height,
    },
    cameraFrame: {
      x: canvas.x,
      y: canvas.y,
      width: cameraWidth,
      height: canvas.height,
    },
  };
}
