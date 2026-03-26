import { describe, it, expect, beforeEach } from 'vitest';
import { clearRegistry, getAllEffects, getEffect, getDefaultParams } from '../registry.js';
import { registerBuiltinEffects, gaussianBlurEffect, zoomPanEffect, roundCornersEffect } from './index.js';

describe('builtin effects', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltinEffects();
  });

  it('registers exactly 3 effects', () => {
    expect(getAllEffects()).toHaveLength(3);
  });

  it('gaussian-blur is registered', () => {
    expect(getEffect('gaussian-blur')).toBeDefined();
    expect(getEffect('gaussian-blur')).toEqual(gaussianBlurEffect);
  });

  it('zoom-pan is registered', () => {
    expect(getEffect('zoom-pan')).toBeDefined();
    expect(getEffect('zoom-pan')).toEqual(zoomPanEffect);
  });

  it('round-corners is registered', () => {
    expect(getEffect('round-corners')).toBeDefined();
    expect(getEffect('round-corners')).toEqual(roundCornersEffect);
  });

  it('gaussian-blur has valid params', () => {
    const effect = getEffect('gaussian-blur')!;
    expect(effect.params.length).toBeGreaterThan(0);
    for (const param of effect.params) {
      expect(param.key).toBeTruthy();
      expect(param.label).toBeTruthy();
      expect(param.defaultValue).toBeDefined();
    }
  });

  it('zoom-pan has valid params', () => {
    const effect = getEffect('zoom-pan')!;
    expect(effect.params.length).toBeGreaterThan(0);
    for (const param of effect.params) {
      expect(param.key).toBeTruthy();
      expect(param.label).toBeTruthy();
      expect(param.defaultValue).toBeDefined();
    }
  });

  it('round-corners has valid params', () => {
    const effect = getEffect('round-corners')!;
    expect(effect.params.length).toBeGreaterThan(0);
    for (const param of effect.params) {
      expect(param.key).toBeTruthy();
      expect(param.label).toBeTruthy();
      expect(param.defaultValue).toBeDefined();
    }
  });

  it('getDefaultParams works for gaussian-blur', () => {
    const defaults = getDefaultParams('gaussian-blur');
    expect(defaults['radius']).toBe(5);
    expect(defaults['quality']).toBe('medium');
  });

  it('getDefaultParams works for zoom-pan', () => {
    const defaults = getDefaultParams('zoom-pan');
    expect(defaults['scale']).toBe(1);
    expect(defaults['centerX']).toBe(0.5);
    expect(defaults['centerY']).toBe(0.5);
  });

  it('getDefaultParams works for round-corners', () => {
    const defaults = getDefaultParams('round-corners');
    expect(defaults['radius']).toBe(12);
  });

  it('effects have correct categories', () => {
    expect(getEffect('gaussian-blur')!.category).toBe('blur');
    expect(getEffect('zoom-pan')!.category).toBe('transform');
    expect(getEffect('round-corners')!.category).toBe('stylize');
  });
});
