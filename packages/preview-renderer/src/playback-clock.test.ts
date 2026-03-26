import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaybackClock } from './playback-clock.js';

describe('PlaybackClock', () => {
  let rafCallbacks: Array<() => void>;
  let rafId: number;
  let performanceNow: number;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    performanceNow = 0;

    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
      // Clear pending callbacks on cancel
      rafCallbacks = [];
    });
    vi.stubGlobal('performance', { now: () => performanceNow });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Advance simulated time and flush all pending rAF callbacks for that tick */
  function advanceTime(ms: number): void {
    performanceNow += ms;
    const pending = rafCallbacks.splice(0);
    for (const cb of pending) cb();
  }

  it('starts at the given frame', () => {
    const clock = new PlaybackClock(30, vi.fn());
    clock.start(10);
    expect(clock.getCurrentFrame()).toBe(10);
  });

  it('defaults to frame 0 when no fromFrame given', () => {
    const clock = new PlaybackClock(30, vi.fn());
    clock.start();
    expect(clock.getCurrentFrame()).toBe(0);
  });

  it('calls onTick with increasing frame numbers at 30fps', () => {
    const ticks: number[] = [];
    const clock = new PlaybackClock(30, (f) => ticks.push(f));

    clock.start(0);
    // Each frame at 30fps = ~33.33ms
    advanceTime(34); // 1 frame
    advanceTime(34); // 2nd frame
    advanceTime(34); // 3rd frame

    expect(ticks.length).toBeGreaterThanOrEqual(3);
    // Frames should be strictly increasing
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it('does not tick after stop()', () => {
    const ticks: number[] = [];
    const clock = new PlaybackClock(30, (f) => ticks.push(f));

    clock.start(0);
    advanceTime(34); // 1 frame fires
    const countAfterOneFrame = ticks.length;

    clock.stop();
    advanceTime(34); // should be cancelled
    advanceTime(34);

    expect(ticks.length).toBe(countAfterOneFrame);
  });

  it('getCurrentFrame returns the latest advanced frame', () => {
    const clock = new PlaybackClock(60, vi.fn());
    clock.start(0);
    // 60fps = ~16.67ms per frame
    advanceTime(17);
    expect(clock.getCurrentFrame()).toBeGreaterThanOrEqual(1);
  });

  it('setFps changes the tick interval', () => {
    const ticks: number[] = [];
    const clock = new PlaybackClock(1, (f) => ticks.push(f)); // 1fps = 1000ms/frame
    clock.start(0);

    advanceTime(500); // not yet 1 full frame at 1fps
    expect(ticks.length).toBe(0);

    clock.setFps(2); // now 2fps = 500ms/frame — the 500ms already accumulated crosses threshold
    advanceTime(1); // tiny nudge triggers re-check
    expect(ticks.length).toBeGreaterThanOrEqual(1);
  });

  it('respects frame rate — 24fps produces ~24 ticks per second', () => {
    const ticks: number[] = [];
    const clock = new PlaybackClock(24, (f) => ticks.push(f));
    clock.start(0);

    // Simulate 1 second in 16ms increments (like real rAF)
    for (let i = 0; i < 62; i++) {
      advanceTime(16);
    }

    // Should be close to 24 ticks — allow ±2 for rounding
    expect(ticks.length).toBeGreaterThanOrEqual(22);
    expect(ticks.length).toBeLessThanOrEqual(26);
  });
});
