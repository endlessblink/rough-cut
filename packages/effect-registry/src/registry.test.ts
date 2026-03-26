import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerEffect,
  getEffect,
  getAllEffects,
  getEffectsByCategory,
  clearRegistry,
  getDefaultParams,
} from './registry.js';
import type { EffectDefinition } from './types.js';

const mockBlurEffect: EffectDefinition = {
  type: 'test-blur',
  name: 'Test Blur',
  category: 'blur',
  params: [
    { key: 'radius', type: 'number', label: 'Radius', defaultValue: 10, min: 0, max: 100 },
    { key: 'quality', type: 'enum', label: 'Quality', defaultValue: 'medium', options: ['low', 'medium', 'high'] },
  ],
};

const mockTransformEffect: EffectDefinition = {
  type: 'test-transform',
  name: 'Test Transform',
  category: 'transform',
  params: [
    { key: 'scale', type: 'number', label: 'Scale', defaultValue: 1.5 },
    { key: 'enabled', type: 'boolean', label: 'Enabled', defaultValue: true },
  ],
};

describe('effect registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and retrieves an effect', () => {
    registerEffect(mockBlurEffect);
    expect(getEffect('test-blur')).toEqual(mockBlurEffect);
  });

  it('returns undefined for unknown effect type', () => {
    expect(getEffect('nonexistent')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    registerEffect(mockBlurEffect);
    expect(() => registerEffect(mockBlurEffect)).toThrow('test-blur');
  });

  it('getAllEffects returns all registered effects', () => {
    registerEffect(mockBlurEffect);
    registerEffect(mockTransformEffect);
    const all = getAllEffects();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual(mockBlurEffect);
    expect(all).toContainEqual(mockTransformEffect);
  });

  it('getEffectsByCategory filters by category', () => {
    registerEffect(mockBlurEffect);
    registerEffect(mockTransformEffect);
    const blurs = getEffectsByCategory('blur');
    expect(blurs).toHaveLength(1);
    expect(blurs[0]).toEqual(mockBlurEffect);
  });

  it('getEffectsByCategory returns empty array for missing category', () => {
    registerEffect(mockBlurEffect);
    const stylize = getEffectsByCategory('stylize');
    expect(stylize).toHaveLength(0);
  });

  it('getDefaultParams returns defaults for all params', () => {
    registerEffect(mockBlurEffect);
    const defaults = getDefaultParams('test-blur');
    expect(defaults).toEqual({ radius: 10, quality: 'medium' });
  });

  it('getDefaultParams returns empty object for unknown type', () => {
    expect(getDefaultParams('nonexistent')).toEqual({});
  });

  it('clearRegistry removes all effects', () => {
    registerEffect(mockBlurEffect);
    clearRegistry();
    expect(getAllEffects()).toHaveLength(0);
    expect(getEffect('test-blur')).toBeUndefined();
  });

  it('getDefaultParams handles boolean defaults', () => {
    registerEffect(mockTransformEffect);
    const defaults = getDefaultParams('test-transform');
    expect(defaults).toEqual({ scale: 1.5, enabled: true });
  });
});
