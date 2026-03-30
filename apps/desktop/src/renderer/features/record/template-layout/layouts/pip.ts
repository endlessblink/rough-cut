import type { Rect, TemplateLayoutResult } from '../types.js';

// Camera occupies 24% of canvas width and 26% of canvas height
const CAMERA_W_FRAC = 0.24;
const CAMERA_H_FRAC = 0.26;
// 4% margin from the bottom-right edges
const MARGIN_FRAC = 0.04;

/**
 * PIP (Picture-in-Picture) layout: screen fills the entire canvas,
 * camera is a small overlay in the bottom-right corner.
 *
 * +--------------------+
 * |                    |
 * |       screen       |
 * |               +--+ |
 * |               |cam| |
 * +--------------------+
 */
export function layoutPip(canvas: Rect): TemplateLayoutResult {
  const cameraWidth = canvas.width * CAMERA_W_FRAC;
  const cameraHeight = canvas.height * CAMERA_H_FRAC;
  const marginX = canvas.width * MARGIN_FRAC;
  const marginY = canvas.height * MARGIN_FRAC;

  return {
    screenFrame: { ...canvas },
    cameraFrame: {
      x: canvas.x + canvas.width - cameraWidth - marginX,
      y: canvas.y + canvas.height - cameraHeight - marginY,
      width: cameraWidth,
      height: cameraHeight,
    },
  };
}
