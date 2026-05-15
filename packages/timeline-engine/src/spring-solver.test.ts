import { describe, expect, it } from 'vitest';
import {
  clampDeltaMs,
  createSpringState,
  getCursorSpringConfig,
  getZoomSpringConfig,
  resetSpringState,
  stepSpring,
} from './spring-solver.js';

describe('clampDeltaMs', () => {
  it('floors to 1 ms and caps at 80 ms', () => {
    expect(clampDeltaMs(0)).toBeCloseTo(1000 / 60);
    expect(clampDeltaMs(-5)).toBeCloseTo(1000 / 60);
    expect(clampDeltaMs(NaN)).toBeCloseTo(1000 / 60);
    expect(clampDeltaMs(500)).toBe(80);
    expect(clampDeltaMs(16)).toBe(16);
    expect(clampDeltaMs(0.5)).toBe(1);
  });
});

describe('stepSpring', () => {
  it('first call snaps to target and initializes', () => {
    const s = createSpringState(0);
    expect(stepSpring(s, 5, 16, getZoomSpringConfig(0.5))).toBe(5);
    expect(s.initialized).toBe(true);
    expect(s.velocity).toBe(0);
  });

  it('converges monotonically to a static target (no overshoot at critical+ damping)', () => {
    const s = createSpringState(0);
    stepSpring(s, 0, 16, getZoomSpringConfig(0.5)); // init at 0
    let prev = 0;
    let lastSeen = 0;
    for (let i = 0; i < 200; i++) {
      const v = stepSpring(s, 1, 16, getZoomSpringConfig(0.5));
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
      lastSeen = v;
    }
    expect(lastSeen).toBeCloseTo(1, 3);
  });

  it('settles to target within reasonable time and pins to rest', () => {
    const s = createSpringState(0);
    stepSpring(s, 0, 16, getZoomSpringConfig(0.5));
    for (let i = 0; i < 500; i++) stepSpring(s, 1, 16, getZoomSpringConfig(0.5));
    expect(s.value).toBe(1);
    expect(s.velocity).toBe(0);
  });

  it('cursor spring tracks a moving target without losing it', () => {
    const s = createSpringState(0);
    stepSpring(s, 0, 16, getCursorSpringConfig(0.6));
    let target = 0;
    for (let i = 0; i < 60; i++) {
      target += 0.01;
      stepSpring(s, target, 16, getCursorSpringConfig(0.6));
    }
    // Spring lags a moving target but stays within 0.15 of it after 1s of ramp
    expect(Math.abs(s.value - target)).toBeLessThan(0.15);
  });

  it('handles target reversal without large overshoot on overdamped config', () => {
    const cfg = getZoomSpringConfig(0.5);
    const s = createSpringState(0);
    stepSpring(s, 0, 16, cfg);
    // Approach 1
    for (let i = 0; i < 30; i++) stepSpring(s, 1, 16, cfg);
    // Reverse to 0
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) samples.push(stepSpring(s, 0, 16, cfg));
    // No sample dips below -0.05 (small tolerance for floating point)
    expect(Math.min(...samples)).toBeGreaterThan(-0.05);
  });

  it('resetSpringState clears velocity and re-arms init', () => {
    const s = createSpringState(0);
    stepSpring(s, 1, 16, getZoomSpringConfig(0.5));
    stepSpring(s, 1, 16, getZoomSpringConfig(0.5));
    resetSpringState(s, 0);
    expect(s.value).toBe(0);
    expect(s.velocity).toBe(0);
    expect(s.initialized).toBe(false);
  });
});
