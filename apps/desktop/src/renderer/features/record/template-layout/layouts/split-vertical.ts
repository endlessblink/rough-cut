import type { Rect, TemplateLayoutResult } from '../types.js';

// Gap between screen and camera as a fraction of canvas height
const GAP_FRAC = 0.02;

/**
 * SPLIT_VERTICAL layout: screen on top (full width, ~50% height),
 * camera below (full width, remaining height), with a small gap between.
 *
 * +--------------------+
 * |       screen       |
 * +--------------------+
 *        (gap)
 * +--------------------+
 * |       camera       |
 * +--------------------+
 */
export function layoutSplitVertical(canvas: Rect): TemplateLayoutResult {
  const gap = canvas.height * GAP_FRAC;
  const halfHeight = (canvas.height - gap) / 2;

  return {
    screenFrame: {
      x: canvas.x,
      y: canvas.y,
      width: canvas.width,
      height: halfHeight,
    },
    cameraFrame: {
      x: canvas.x,
      y: canvas.y + halfHeight + gap,
      width: canvas.width,
      height: halfHeight,
    },
  };
}
