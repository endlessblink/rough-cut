import type { Rect, TemplateLayoutResult } from '../types.js';

/**
 * FULL_SCREEN layout: screen fills the canvas while maintaining sourceAspect.
 * Centered in the canvas. No camera slot.
 *
 * +--------------------+
 * |                    |
 * |       screen       |
 * |                    |
 * +--------------------+
 */
export function layoutScreenOnly(canvas: Rect, sourceAspect: number): TemplateLayoutResult {
  let w = canvas.width;
  let h = w / sourceAspect;
  if (h > canvas.height) {
    h = canvas.height;
    w = h * sourceAspect;
  }
  const x = canvas.x + (canvas.width - w) / 2;
  const y = canvas.y + (canvas.height - h) / 2;

  return {
    screenFrame: { x, y, width: w, height: h },
    cameraFrame: null,
  };
}
