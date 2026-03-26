import { registerEffect } from '../registry.js';
import { gaussianBlurEffect } from './gaussian-blur.js';
import { zoomPanEffect } from './zoom-pan.js';
import { roundCornersEffect } from './round-corners.js';

export { gaussianBlurEffect } from './gaussian-blur.js';
export { zoomPanEffect } from './zoom-pan.js';
export { roundCornersEffect } from './round-corners.js';

export function registerBuiltinEffects(): void {
  registerEffect(gaussianBlurEffect);
  registerEffect(zoomPanEffect);
  registerEffect(roundCornersEffect);
}
