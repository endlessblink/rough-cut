import type { EffectDefinition } from '../types.js';

export const gaussianBlurEffect: EffectDefinition = {
  type: 'gaussian-blur',
  name: 'Gaussian Blur',
  category: 'blur',
  params: [
    {
      key: 'radius',
      type: 'number',
      label: 'Radius',
      defaultValue: 5,
      min: 0,
      max: 100,
      step: 0.5,
    },
    {
      key: 'quality',
      type: 'enum',
      label: 'Quality',
      defaultValue: 'medium',
      options: ['low', 'medium', 'high'],
    },
  ],
};
