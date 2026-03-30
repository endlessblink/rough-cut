import type { Rect, TemplateLayoutResult } from '../types.js';

// Gap between screen and camera as a fraction of canvas height
const GAP_FRAC = 0.02;

/**
 * SPLIT_VERTICAL layout: screen on top, camera below, with a small gap.
 * Both frames are the same width (as wide as possible) and their heights
 * are derived from sourceAspect. The stack is centered in the canvas.
 *
 * +--------------------+
 * |       screen       |
 * +--------------------+
 *        (gap)
 * +--------------------+
 * |       camera       |
 * +--------------------+
 */
export function layoutSplitVertical(canvas: Rect, sourceAspect: number): TemplateLayoutResult {
  const gap = canvas.height * GAP_FRAC;

  // Start with full canvas width for each frame
  let frameWidth = canvas.width;
  let frameHeight = frameWidth / sourceAspect;
  const totalStack = frameHeight * 2 + gap;

  // If the stack overflows, shrink frameWidth to fit
  if (totalStack > canvas.height) {
    frameHeight = (canvas.height - gap) / 2;
    frameWidth = frameHeight * sourceAspect;
  }

  const totalH = frameHeight * 2 + gap;
  const startX = canvas.x + (canvas.width - frameWidth) / 2;
  const startY = canvas.y + (canvas.height - totalH) / 2;

  return {
    screenFrame: {
      x: startX,
      y: startY,
      width: frameWidth,
      height: frameHeight,
    },
    cameraFrame: {
      x: startX,
      y: startY + frameHeight + gap,
      width: frameWidth,
      height: frameHeight,
    },
  };
}
