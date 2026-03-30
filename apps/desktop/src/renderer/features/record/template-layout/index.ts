/**
 * template-layout — pure pixel-rect layout system for the Record view.
 *
 * Public API:
 *   - Types: Rect, TemplateLayoutResult, FitMode, MediaSlot
 *   - Media fit helpers: fitContain, fitCover
 *   - Layout registry: getLayoutRects(kind, canvas)
 *   - Individual layout functions (re-exported for testing and direct use)
 */

export type { Rect, TemplateLayoutResult, FitMode, MediaSlot } from './types.js';

export { fitContain, fitCover } from './media-fit.js';

export { getLayoutRects, getCardAspect } from './layout-registry.js';

// Individual layout functions — useful for tests or direct use
export { layoutScreenOnly } from './layouts/screen-only.js';
export { layoutPip } from './layouts/pip.js';
export { layoutSplitVertical } from './layouts/split-vertical.js';
export { layoutSplitHorizontal } from './layouts/split-horizontal.js';
export { layoutSocialVertical } from './layouts/social-vertical.js';
export { layoutCameraOnly } from './layouts/camera-only.js';
