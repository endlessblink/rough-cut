import type { Rect, TemplateLayoutResult } from '../types.js';

// Camera occupies 24% of canvas width; height derived from sourceAspect
const CAMERA_W_FRAC = 0.24;
// 4% margin from the bottom-right edges
const MARGIN_FRAC = 0.04;

/**
 * PIP (Picture-in-Picture) layout: screen fills the canvas (maintaining sourceAspect,
 * centered), camera is a small overlay in the bottom-right corner.
 *
 * +--------------------+
 * |                    |
 * |       screen       |
 * |               +--+ |
 * |               |cam| |
 * +--------------------+
 */
export function layoutPip(canvas: Rect, sourceAspect: number): TemplateLayoutResult {
  // Screen: fill canvas, maintain aspect, center
  let sw = canvas.width;
  let sh = sw / sourceAspect;
  if (sh > canvas.height) {
    sh = canvas.height;
    sw = sh * sourceAspect;
  }
  const sx = canvas.x + (canvas.width - sw) / 2;
  const sy = canvas.y + (canvas.height - sh) / 2;

  // Camera: 24% of canvas width, height derived from sourceAspect, bottom-right
  const cameraWidth = canvas.width * CAMERA_W_FRAC;
  const cameraHeight = cameraWidth / sourceAspect;
  const marginX = canvas.width * MARGIN_FRAC;
  const marginY = canvas.height * MARGIN_FRAC;

  return {
    screenFrame: { x: sx, y: sy, width: sw, height: sh },
    cameraFrame: {
      x: canvas.x + canvas.width - cameraWidth - marginX,
      y: canvas.y + canvas.height - cameraHeight - marginY,
      width: cameraWidth,
      height: cameraHeight,
    },
  };
}
