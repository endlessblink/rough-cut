import type { EffectDefinition } from '../types.js';

export const roundCornersEffect: EffectDefinition = {
  type: 'round-corners',
  name: 'Rounded Corners',
  category: 'stylize',
  params: [
    {
      key: 'radius',
      type: 'number',
      label: 'Radius',
      defaultValue: 12,
      min: 0,
      max: 100,
      step: 1,
    },
  ],
};
