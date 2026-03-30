import type { Rect, TemplateLayoutResult } from '../types.js';

const PADDING_FRAC = 0.06;       // 6% inset on all four sides
const CAMERA_H_FRAC = 0.11;      // camera band = 11% of inner height
const GAP_FRAC = 0.02;           // gap between screen frame and camera band = 2% of inner height
const SCREEN_W_FRAC = 0.24;      // narrow portrait column = 24% of inner width

/**
 * SOCIAL_VERTICAL layout: designed for 9:16 portrait canvases.
 *
 * A uniform 6% padding creates an inner area. Inside that inner area:
 *   - Camera band sits at the bottom (full inner width, 11% of inner height).
 *   - A 2% gap separates the camera from the screen frame.
 *   - Screen frame is a narrow centered column (24% of inner width) occupying
 *     all remaining height above the gap.
 *
 * +--------------------+  ← 6% padding (top)
 * |     +------+       |
 * |     |      |       |  ← screen frame (narrow column, centered)
 * |     |screen|       |
 * |     +------+       |
 * |    (2% gap)        |
 * | +----------------+ |
 * | |    camera      | |  ← camera band (full inner width)
 * | +----------------+ |
 * +--------------------+  ← 6% padding (bottom)
 */
export function layoutSocialVertical(canvas: Rect): TemplateLayoutResult {
  const padX = canvas.width * PADDING_FRAC;
  const padY = canvas.height * PADDING_FRAC;

  const innerX = canvas.x + padX;
  const innerY = canvas.y + padY;
  const innerWidth = canvas.width - padX * 2;
  const innerHeight = canvas.height - padY * 2;

  const cameraHeight = innerHeight * CAMERA_H_FRAC;
  const gapHeight = innerHeight * GAP_FRAC;
  const screenAreaHeight = innerHeight - cameraHeight - gapHeight;

  const screenWidth = innerWidth * SCREEN_W_FRAC;
  const screenX = innerX + (innerWidth - screenWidth) / 2;

  return {
    screenFrame: {
      x: screenX,
      y: innerY,
      width: screenWidth,
      height: Math.max(0, screenAreaHeight),
    },
    cameraFrame: {
      x: innerX,
      y: innerY + screenAreaHeight + gapHeight,
      width: innerWidth,
      height: cameraHeight,
    },
  };
}
