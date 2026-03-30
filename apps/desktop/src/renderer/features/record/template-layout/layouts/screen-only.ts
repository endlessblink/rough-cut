import type { Rect, TemplateLayoutResult } from '../types.js';

/**
 * FULL_SCREEN layout: screen fills the entire canvas, no camera slot.
 *
 * +--------------------+
 * |                    |
 * |       screen       |
 * |                    |
 * +--------------------+
 */
export function layoutScreenOnly(canvas: Rect): TemplateLayoutResult {
  return {
    screenFrame: { ...canvas },
    cameraFrame: null,
  };
}
