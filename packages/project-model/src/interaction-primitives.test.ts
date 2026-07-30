import { describe, expect, it, vi } from 'vitest';
import {
  createInteractionLatencyTracker,
  createLatestSeekCoordinator,
  createTransientGestureController,
} from './interaction-primitives.js';

describe('interaction primitives', () => {
  it('cancels obsolete seeks and settles only the newest frame', async () => {
    const pending = new Map<number, () => void>();
    const settled: number[] = [];
    const coordinator = createLatestSeekCoordinator({
      performSeek: (frame) =>
        new Promise<void>((resolve) => {
          pending.set(frame, resolve);
        }),
      onSettled: (frame) => settled.push(frame),
    });

    const first = coordinator.request(10);
    const second = coordinator.request(20);
    pending.get(10)?.();
    pending.get(20)?.();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(settled).toEqual([20]);
  });

  it('previews every gesture update but commits exactly once on release', () => {
    const previews: number[] = [];
    const commits: Array<[number, number]> = [];
    const gesture = createTransientGestureController({
      onPreview: (value: number) => previews.push(value),
      onCommit: (initial, final) => commits.push([initial, final]),
    });

    gesture.begin(10);
    gesture.update(11);
    gesture.update(12);

    expect(gesture.commit()).toBe(true);
    expect(gesture.commit()).toBe(false);
    expect(previews).toEqual([10, 11, 12]);
    expect(commits).toEqual([[10, 12]]);
  });

  it('cancels a gesture back to its exact initial value', () => {
    const previews: number[] = [];
    const onCommit = vi.fn();
    const gesture = createTransientGestureController({
      onPreview: (value: number) => previews.push(value),
      onCommit,
    });

    gesture.begin(5);
    gesture.update(9);

    expect(gesture.cancel()).toBe(true);
    expect(previews).toEqual([5, 9, 5]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('records development interaction latency against per-action budgets', () => {
    let clock = 100;
    const tracker = createInteractionLatencyTracker({
      now: () => clock,
      defaultBudgetMs: 50,
      budgets: { seek: 25 },
    });

    const finishSeek = tracker.start('seek');
    clock += 24;
    expect(finishSeek()).toMatchObject({ withinBudget: true, budgetMs: 25 });
    const finishAccept = tracker.start('accept');
    clock += 51;
    expect(finishAccept()).toMatchObject({ withinBudget: false, budgetMs: 50 });
    expect(tracker.samples()).toHaveLength(2);
  });
});
