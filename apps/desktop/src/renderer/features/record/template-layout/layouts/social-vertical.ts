import type { Rect, TemplateLayoutResult } from '../types.js';

const GAP_FRAC = 0.02; // gap between screen and camera = 2% of canvas height

/**
 * SOCIAL_VERTICAL layout: designed for 9:16 portrait canvases.
 *
 * Both screen and camera frames use the full canvas width;
 * heights are derived from sourceAspect. Stack is centered vertically.
 *
 * +--------------------+
 * | +----------------+ |
 * | |    screen      | |  ← full width, height = width / sourceAspect
 * | +----------------+ |
 * |    (gap)           |
 * | +----------------+ |
 * | |    camera      | |  ← full width, height = width / sourceAspect
 * | +----------------+ |
 * +--------------------+
 */
export function layoutSocialVertical(canvas: Rect, sourceAspect: number): TemplateLayoutResult {
  const gap = canvas.height * GAP_FRAC;

  // Both frames span the full canvas width
  let frameWidth = canvas.width;
  let frameHeight = frameWidth / sourceAspect;
  const totalStack = frameHeight * 2 + gap;

  // If the two frames overflow, shrink width to fit
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
