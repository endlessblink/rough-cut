import { describe, it, expect } from 'vitest';
import { resolveEasing } from './easing.js';

describe('resolveEasing', () => {
  describe('linear', () => {
    it('returns 0 at t=0', () => {
      const fn = resolveEasing('linear');
      expect(fn(0)).toBe(0);
    });

    it('returns 1 at t=1', () => {
      const fn = resolveEasing('linear');
      expect(fn(1)).toBe(1);
    });

    it('returns 0.5 at t=0.5', () => {
      const fn = resolveEasing('linear');
      expect(fn(0.5)).toBeCloseTo(0.5, 5);
    });
  });

  describe('ease-in', () => {
    it('returns 0 at t=0', () => {
      const fn = resolveEasing('ease-in');
      expect(fn(0)).toBe(0);
    });

    it('returns 1 at t=1', () => {
      const fn = resolveEasing('ease-in');
      expect(fn(1)).toBe(1);
    });

    it('starts slow: output at t=0.5 is less than 0.5', () => {
      const fn = resolveEasing('ease-in');
      expect(fn(0.5)).toBeLessThan(0.5);
    });
  });

  describe('ease-out', () => {
    it('returns 0 at t=0', () => {
      const fn = resolveEasing('ease-out');
      expect(fn(0)).toBe(0);
    });

    it('returns 1 at t=1', () => {
      const fn = resolveEasing('ease-out');
      expect(fn(1)).toBe(1);
    });

    it('ends slow: output at t=0.5 is greater than 0.5', () => {
      const fn = resolveEasing('ease-out');
      expect(fn(0.5)).toBeGreaterThan(0.5);
    });
  });

  describe('ease-in-out', () => {
    it('returns 0 at t=0', () => {
      const fn = resolveEasing('ease-in-out');
      expect(fn(0)).toBe(0);
    });

    it('returns 1 at t=1', () => {
      const fn = resolveEasing('ease-in-out');
      expect(fn(1)).toBe(1);
    });

    it('is symmetric around t=0.5', () => {
      const fn = resolveEasing('ease-in-out');
      expect(fn(0.5)).toBeCloseTo(0.5, 3);
    });

    it('starts slow (< linear at t=0.25)', () => {
      const fn = resolveEasing('ease-in-out');
      expect(fn(0.25)).toBeLessThan(0.25);
    });

    it('ends fast then slow (> linear at t=0.75)', () => {
      const fn = resolveEasing('ease-in-out');
      expect(fn(0.75)).toBeGreaterThan(0.75);
    });
  });

  describe('cubic-bezier', () => {
    it('with custom tangent: returns 0 at t=0', () => {
      const fn = resolveEasing('cubic-bezier', { inX: 0.25, inY: 0.1, outX: 0.25, outY: 1 });
      expect(fn(0)).toBe(0);
    });

    it('with custom tangent: returns 1 at t=1', () => {
      const fn = resolveEasing('cubic-bezier', { inX: 0.25, inY: 0.1, outX: 0.25, outY: 1 });
      expect(fn(1)).toBe(1);
    });

    it('with custom tangent matches expected midpoint shape', () => {
      // ease tangent: (0.25, 0.1), (0.25, 1) — starts slow
      const fn = resolveEasing('cubic-bezier', { inX: 0.25, inY: 0.1, outX: 0.25, outY: 1 });
      const mid = fn(0.5);
      // Should be a valid value between 0 and 1
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
    });

    it('without tangent falls back gracefully', () => {
      const fn = resolveEasing('cubic-bezier');
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
      expect(fn(0.5)).toBeCloseTo(0.5, 3);
    });
  });
});
