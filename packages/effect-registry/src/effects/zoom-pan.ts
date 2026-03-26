import type { EffectDefinition } from '../types.js';

export const zoomPanEffect: EffectDefinition = {
  type: 'zoom-pan',
  name: 'Zoom & Pan',
  category: 'transform',
  params: [
    {
      key: 'scale',
      type: 'number',
      label: 'Scale',
      defaultValue: 1,
      min: 0.1,
      max: 10,
      step: 0.1,
    },
    {
      key: 'centerX',
      type: 'number',
      label: 'Center X',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: 'centerY',
      type: 'number',
      label: 'Center Y',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
};
