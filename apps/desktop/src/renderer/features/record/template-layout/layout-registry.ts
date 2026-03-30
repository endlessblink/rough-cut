/**
 * Layout registry: maps LayoutKind to the correct pure layout function.
 *
 * Usage:
 *   const result = getLayoutRects('PIP', canvasRect, 16 / 9);
 *   // result.screenFrame and result.cameraFrame are pixel Rects (or null)
 */

import type { LayoutKind } from '../templates.js';
import type { Rect, TemplateLayoutResult } from './types.js';

import { layoutScreenOnly } from './layouts/screen-only.js';
import { layoutPip } from './layouts/pip.js';
import { layoutSplitVertical } from './layouts/split-vertical.js';
import { layoutSplitHorizontal } from './layouts/split-horizontal.js';
import { layoutSocialVertical } from './layouts/social-vertical.js';
import { layoutCameraOnly } from './layouts/camera-only.js';

/**
 * Returns the ideal card aspect ratio (w/h) for a given layout + source aspect.
 * The card will tightly wrap the layout content with no dead space.
 */
export function getCardAspect(
  kind: LayoutKind,
  sourceAspect: number = 16 / 9,
): number {
  const GAP = 0.02; // approximate gap fraction
  switch (kind) {
    case 'FULL_SCREEN':
    case 'PIP':
    case 'CAMERA_ONLY':
      // Single block fills the card
      return sourceAspect;
    case 'SPLIT_VERTICAL':
    case 'SOCIAL_VERTICAL':
      // Two blocks stacked: card height = 2 * blockH + gap*cardH
      // blockH = blockW / sourceAspect, blockW = cardW
      // cardH = 2 * cardW / sourceAspect + gap * cardH
      // cardH * (1 - gap) = 2 * cardW / sourceAspect
      // cardAspect = cardW / cardH = sourceAspect * (1 - GAP) / 2
      return sourceAspect * (1 - GAP) / 2;
    case 'SPLIT_HORIZONTAL': {
      // Two blocks side by side: screen 62%, camera 36%, gap 2%
      // Height determined by taller block = max(0.62, 0.36) * cardW / sourceAspect = 0.62 * cardW / sa
      // cardAspect = cardW / (0.62 * cardW / sa) = sa / 0.62
      return sourceAspect / 0.62;
    }
  }
}

/**
 * Returns the screen and camera frame rects for a given layout kind,
 * subdividing the provided canvas rect into slots.
 *
 * All returned rects obey: height === width / sourceAspect — always.
 *
 * @param kind         - One of the LayoutKind values from templates.ts
 * @param canvas       - The inner canvas rect (pixel coordinates, x/y typically 0,0)
 * @param sourceAspect - Width-to-height ratio of the source media (default 16/9)
 * @returns            - { screenFrame, cameraFrame } — either may be null if unused
 */
export function getLayoutRects(
  kind: LayoutKind,
  canvas: Rect,
  sourceAspect: number = 16 / 9,
): TemplateLayoutResult {
  switch (kind) {
    case 'FULL_SCREEN':
      return layoutScreenOnly(canvas, sourceAspect);
    case 'PIP':
      return layoutPip(canvas, sourceAspect);
    case 'SPLIT_VERTICAL':
      return layoutSplitVertical(canvas, sourceAspect);
    case 'SPLIT_HORIZONTAL':
      return layoutSplitHorizontal(canvas, sourceAspect);
    case 'SOCIAL_VERTICAL':
      return layoutSocialVertical(canvas, sourceAspect);
    case 'CAMERA_ONLY':
      return layoutCameraOnly(canvas, sourceAspect);
  }
}
