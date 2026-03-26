import { registerEffect } from '../registry.js';
import { gaussianBlurEffect } from './gaussian-blur.js';
import { zoomPanEffect } from './zoom-pan.js';
import { roundCornersEffect } from './round-corners.js';
import { shadowEffect } from './shadow.js';
import { backgroundPadEffect } from './background-pad.js';

export { gaussianBlurEffect } from './gaussian-blur.js';
export { zoomPanEffect } from './zoom-pan.js';
export { roundCornersEffect } from './round-corners.js';
export { shadowEffect } from './shadow.js';
export { backgroundPadEffect } from './background-pad.js';

export function registerBuiltinEffects(): void {
  registerEffect(gaussianBlurEffect);
  registerEffect(zoomPanEffect);
  registerEffect(roundCornersEffect);
  registerEffect(shadowEffect);
  registerEffect(backgroundPadEffect);
}
