/**
 * Pure helpers for fitting media content inside a frame rect.
 *
 * These functions compute a content rect (in the same pixel coordinate space
 * as the input frame) that describes where the media should be drawn.
 * They do NOT know about React, DOM, or CSS — callers apply the result however
 * they see fit.
 *
 * `mediaAspect` is width / height of the source media (e.g. 16/9 = 1.777…).
 */

import type { Rect } from './types.js';

/**
 * Letterbox / pillarbox fit: scale the media to fit entirely within the frame,
 * centered, with empty bars on the sides or top/bottom.
 *
 * Equivalent to CSS `object-fit: contain`.
 */
export function fitContain(frame: Rect, mediaAspect: number): Rect {
  const frameAspect = frame.width / frame.height;

  let width: number;
  let height: number;

  if (mediaAspect > frameAspect) {
    // Media is wider than frame — constrained by width, bars on top/bottom
    width = frame.width;
    height = frame.width / mediaAspect;
  } else {
    // Media is taller than frame — constrained by height, bars on sides
    height = frame.height;
    width = frame.height * mediaAspect;
  }

  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

/**
 * Crop fit: scale the media to cover the entire frame, centered,
 * cropping any overflow on sides or top/bottom.
 *
 * Equivalent to CSS `object-fit: cover`.
 */
export function fitCover(frame: Rect, mediaAspect: number): Rect {
  const frameAspect = frame.width / frame.height;

  let width: number;
  let height: number;

  if (mediaAspect > frameAspect) {
    // Media is wider than frame — constrained by height, crop sides
    height = frame.height;
    width = frame.height * mediaAspect;
  } else {
    // Media is taller than frame — constrained by width, crop top/bottom
    width = frame.width;
    height = frame.width / mediaAspect;
  }

  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}
