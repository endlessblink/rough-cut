export type { ParamDefinition, ParamType, ResolvedParams, EffectDefinition } from './types.js';

export {
  registerEffect,
  getEffect,
  getAllEffects,
  getEffectsByCategory,
  clearRegistry,
  getDefaultParams,
} from './registry.js';

export { resolveEasing } from './easing.js';

export {
  interpolateNumber,
  evaluateSingleTrack,
  evaluateKeyframeTracks,
} from './interpolation.js';

export {
  gaussianBlurEffect,
  zoomPanEffect,
  roundCornersEffect,
  registerBuiltinEffects,
} from './effects/index.js';
