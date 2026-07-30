export interface LatestSeekCoordinator {
  request(frame: number): Promise<boolean>;
  cancel(): void;
}

export interface InteractionCancellationSignal {
  readonly aborted: boolean;
  onCancel(listener: () => void): () => void;
}

export function createLatestSeekCoordinator({
  performSeek,
  onSettled,
}: {
  readonly performSeek: (
    frame: number,
    signal: InteractionCancellationSignal,
  ) => void | Promise<void>;
  readonly onSettled?: (frame: number) => void;
}): LatestSeekCoordinator {
  let generation = 0;
  let active: MutableCancellationSignal | null = null;
  return {
    async request(frame: number) {
      generation += 1;
      const requestGeneration = generation;
      active?.cancel();
      const controller = new MutableCancellationSignal();
      active = controller;
      try {
        await performSeek(frame, controller);
      } catch (error) {
        if (controller.aborted || requestGeneration !== generation) {
          return false;
        }
        throw error;
      }
      if (controller.aborted || requestGeneration !== generation) {
        return false;
      }
      active = null;
      onSettled?.(frame);
      return true;
    },
    cancel() {
      generation += 1;
      active?.cancel();
      active = null;
    },
  };
}

class MutableCancellationSignal implements InteractionCancellationSignal {
  #aborted = false;
  readonly #listeners = new Set<() => void>();

  get aborted() {
    return this.#aborted;
  }

  onCancel(listener: () => void): () => void {
    if (this.#aborted) {
      listener();
      return () => undefined;
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  cancel() {
    if (this.#aborted) return;
    this.#aborted = true;
    for (const listener of this.#listeners) listener();
    this.#listeners.clear();
  }
}

export interface TransientGestureController<T> {
  readonly active: boolean;
  begin(value: T): void;
  update(value: T): void;
  commit(): boolean;
  cancel(): boolean;
}

export function createTransientGestureController<T>({
  onPreview,
  onCommit,
  onCancel,
}: {
  readonly onPreview: (value: T) => void;
  readonly onCommit: (initial: T, final: T) => void;
  readonly onCancel?: (initial: T) => void;
}): TransientGestureController<T> {
  let initial: T | undefined;
  let current: T | undefined;
  let active = false;
  return {
    get active() {
      return active;
    },
    begin(value: T) {
      if (active && initial !== undefined) onCancel?.(initial);
      initial = value;
      current = value;
      active = true;
      onPreview(value);
    },
    update(value: T) {
      if (!active) return;
      current = value;
      onPreview(value);
    },
    commit() {
      if (!active || initial === undefined || current === undefined) return false;
      const start = initial;
      const final = current;
      active = false;
      initial = undefined;
      current = undefined;
      onCommit(start, final);
      return true;
    },
    cancel() {
      if (!active || initial === undefined) return false;
      const start = initial;
      active = false;
      initial = undefined;
      current = undefined;
      onPreview(start);
      onCancel?.(start);
      return true;
    },
  };
}

export interface InteractionLatencySample {
  readonly name: string;
  readonly durationMs: number;
  readonly budgetMs: number;
  readonly withinBudget: boolean;
}

export interface InteractionLatencyTracker {
  start(name: string): () => InteractionLatencySample;
  samples(): readonly InteractionLatencySample[];
  clear(): void;
}

export function createInteractionLatencyTracker({
  now = () => Date.now(),
  defaultBudgetMs = 50,
  budgets = {},
  onSample,
}: {
  readonly now?: () => number;
  readonly defaultBudgetMs?: number;
  readonly budgets?: Readonly<Record<string, number>>;
  readonly onSample?: (sample: InteractionLatencySample) => void;
} = {}): InteractionLatencyTracker {
  const recorded: InteractionLatencySample[] = [];
  return {
    start(name: string) {
      const startedAt = now();
      let completed: InteractionLatencySample | null = null;
      return () => {
        if (completed) return completed;
        const budgetMs = budgets[name] ?? defaultBudgetMs;
        const durationMs = Math.max(0, now() - startedAt);
        completed = {
          name,
          durationMs,
          budgetMs,
          withinBudget: durationMs <= budgetMs,
        };
        recorded.push(completed);
        onSample?.(completed);
        return completed;
      };
    },
    samples() {
      return recorded;
    },
    clear() {
      recorded.splice(0, recorded.length);
    },
  };
}
