import type { Rect, TemplateLayoutResult } from '../types.js';

/**
 * CAMERA_ONLY layout: camera fills the canvas while maintaining sourceAspect.
 * Centered in the canvas. No screen slot.
 *
 * +--------------------+
 * |                    |
 * |       camera       |
 * |                    |
 * +--------------------+
 */
export function layoutCameraOnly(canvas: Rect, sourceAspect: number): TemplateLayoutResult {
  let w = canvas.width;
  let h = w / sourceAspect;
  if (h > canvas.height) {
    h = canvas.height;
    w = h * sourceAspect;
  }
  const x = canvas.x + (canvas.width - w) / 2;
  const y = canvas.y + (canvas.height - h) / 2;

  return {
    screenFrame: null,
    cameraFrame: { x, y, width: w, height: h },
  };
}
