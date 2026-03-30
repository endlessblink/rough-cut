import type { Rect, TemplateLayoutResult } from '../types.js';

/**
 * CAMERA_ONLY layout: camera fills the entire canvas, no screen slot.
 *
 * +--------------------+
 * |                    |
 * |       camera       |
 * |                    |
 * +--------------------+
 */
export function layoutCameraOnly(canvas: Rect): TemplateLayoutResult {
  return {
    screenFrame: null,
    cameraFrame: { ...canvas },
  };
}
