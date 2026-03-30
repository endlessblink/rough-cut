/**
 * Layout registry: maps LayoutKind to the correct pure layout function.
 *
 * Usage:
 *   const result = getLayoutRects('PIP', canvasRect);
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
 * Returns the screen and camera frame rects for a given layout kind,
 * subdividing the provided canvas rect into slots.
 *
 * @param kind    - One of the LayoutKind values from templates.ts
 * @param canvas  - The inner canvas rect (pixel coordinates, x/y typically 0,0)
 * @returns       - { screenFrame, cameraFrame } — either may be null if unused
 */
export function getLayoutRects(kind: LayoutKind, canvas: Rect): TemplateLayoutResult {
  switch (kind) {
    case 'FULL_SCREEN':
      return layoutScreenOnly(canvas);
    case 'PIP':
      return layoutPip(canvas);
    case 'SPLIT_VERTICAL':
      return layoutSplitVertical(canvas);
    case 'SPLIT_HORIZONTAL':
      return layoutSplitHorizontal(canvas);
    case 'SOCIAL_VERTICAL':
      return layoutSocialVertical(canvas);
    case 'CAMERA_ONLY':
      return layoutCameraOnly(canvas);
  }
}
