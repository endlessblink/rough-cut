import type { EffectDefinition } from '../types.js';

export const shadowEffect: EffectDefinition = {
  type: 'shadow',
  name: 'Drop Shadow',
  category: 'stylize',
  params: [
    {
      key: 'blur',
      type: 'number',
      label: 'Blur',
      defaultValue: 20,
      min: 0,
      max: 50,
      step: 1,
    },
    {
      key: 'offsetX',
      type: 'number',
      label: 'Offset X',
      defaultValue: 0,
      min: -20,
      max: 20,
      step: 1,
    },
    {
      key: 'offsetY',
      type: 'number',
      label: 'Offset Y',
      defaultValue: 4,
      min: 0,
      max: 20,
      step: 1,
    },
    {
      key: 'color',
      type: 'color',
      label: 'Color',
      defaultValue: '#000000',
    },
    {
      key: 'opacity',
      type: 'number',
      label: 'Opacity',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
};
