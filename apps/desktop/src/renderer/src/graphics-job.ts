import React from 'react';

/**
 * The one Claude graphic generation in flight, kept outside the Graphics panel
 * so switching tool tabs (which unmounts the panel) neither loses its progress
 * nor makes it look stopped. The finished graphic is handed to whatever add /
 * replace handler the editor registered most recently, so it lands in the
 * current project state, not a stale copy from when the job started.
 */

export type GraphicJobKind = 'new' | 'change';
export type GraphicJobStage = 'starting' | 'writing' | 'checking';

export type GraphicJob = {
  requestId: string;
  kind: GraphicJobKind;
  targetId: string | null;
  request: string;
  stage: GraphicJobStage;
  attempt: number;
  retryReason: string | null;
  /** When the current attempt started (ms since epoch). */
  attemptStartedAt: number;
  /** Typical length of one Claude answer on this computer. */
  expectedMs: number;
};

export type GraphicJobProblem = { reason: string; errors?: string[] };

type State = { job: GraphicJob | null; problem: GraphicJobProblem | null; finishedKind: GraphicJobKind | null; finishedAt: number };

let state: State = { job: null, problem: null, finishedKind: null, finishedAt: 0 };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** Registered by the editor on every render; always the latest closures. */
export const graphicJobHandlers: {
  add: ((graphic: unknown, request: string) => void) | null;
  replace: ((id: string, graphic: unknown, request: string) => void) | null;
} = { add: null, replace: null };

let unsubscribeProgress: (() => void) | null = null;
function listenForProgress() {
  if (unsubscribeProgress || typeof window === 'undefined') return;
  unsubscribeProgress = window.roughCut?.onGraphicsProgress?.((progress: { requestId: string; stage: GraphicJobStage; attempt?: number; retryReason?: string | null; startedAt?: number; expectedMs?: number }) => {
    const job = state.job;
    if (!job || progress.requestId !== job.requestId) return;
    set({
      job: {
        ...job,
        stage: progress.stage,
        attempt: progress.attempt ?? job.attempt,
        retryReason: progress.stage === 'writing' ? progress.retryReason ?? null : job.retryReason,
        attemptStartedAt: progress.stage === 'writing' ? progress.startedAt ?? Date.now() : job.attemptStartedAt,
        expectedMs: progress.expectedMs ?? job.expectedMs,
      },
    });
  }) ?? null;
}

let counter = 0;

export async function startGraphicJob({ kind, targetId = null, request, payload }: {
  kind: GraphicJobKind;
  targetId?: string | null;
  request: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  if (state.job || typeof window === 'undefined' || typeof window.roughCut?.generateGraphic !== 'function') return false;
  listenForProgress();
  counter += 1;
  const requestId = `graphic-request-${Date.now()}-${counter}`;
  set({
    job: { requestId, kind, targetId, request, stage: 'starting', attempt: 1, retryReason: null, attemptStartedAt: Date.now(), expectedMs: 75_000 },
    problem: null,
  });
  try {
    const result = await window.roughCut.generateGraphic({ ...payload, requestId, request }) as
      | { ok: true; graphic: unknown }
      | { ok: false; reason: string; errors?: string[]; cancelled?: boolean };
    if (!result.ok) {
      set({ job: null, problem: result.cancelled ? null : { reason: result.reason, errors: result.errors } });
      return false;
    }
    if (kind === 'new') graphicJobHandlers.add?.(result.graphic, request);
    else if (targetId) graphicJobHandlers.replace?.(targetId, result.graphic, request);
    set({ job: null, problem: null, finishedKind: kind, finishedAt: Date.now() });
    return true;
  } catch (error) {
    set({ job: null, problem: { reason: error instanceof Error ? error.message : String(error) } });
    return false;
  }
}

export function cancelGraphicJob() {
  const job = state.job;
  if (job) void window.roughCut?.cancelGraphic?.(job.requestId);
}

export function clearGraphicJobProblem() {
  if (state.problem) set({ problem: null });
}

export function useGraphicJob() {
  return React.useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
    () => state,
  );
}

/**
 * Progress for the bar, 0–1, from real stages and the typical answer time:
 * an attempt fills to 90% on an ease that slows near the end (never "done"
 * before Claude is), checking jumps to 95%, a retry continues from 50%.
 */
export function graphicJobProgress(job: GraphicJob, now: number) {
  if (job.stage === 'checking') return 0.95;
  const elapsed = Math.max(0, now - job.attemptStartedAt);
  const fraction = 1 - Math.exp(-elapsed / Math.max(5_000, job.expectedMs * 0.55));
  const base = job.attempt > 1 ? 0.5 : 0.02;
  return Math.min(0.9, base + (0.9 - base) * fraction);
}

export function graphicJobSecondsLeft(job: GraphicJob, now: number) {
  if (job.stage === 'checking') return 0;
  return Math.max(0, Math.round((job.expectedMs - (now - job.attemptStartedAt)) / 1000));
}
