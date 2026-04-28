import type { EffectDefinition } from '../types.js';

export const backgroundPadEffect: EffectDefinition = {
  type: 'background-pad',
  name: 'Background Padding',
  category: 'stylize',
  params: [
    {
      key: 'padding',
      type: 'number',
      label: 'Padding',
      defaultValue: 40,
      min: 0,
      max: 200,
      step: 1,
    },
  ],
};
