import type { Frame } from './types.js';
import type {
  CleanupDecisionStatus,
  CleanupSession,
  CleanupSuggestion,
} from './cleanup-session.js';
import type { TranscriptTimelineRange } from './transcript-timeline.js';

export type CleanupReviewStage = 'before' | 'treatment' | 'result' | 'decision';

export interface CleanupReviewSegment {
  readonly startFrame: Frame;
  readonly endFrame: Frame;
}

export interface CleanupReviewPlaybackPlan {
  readonly suggestionId: string;
  readonly action: CleanupSuggestion['proposedAction'];
  readonly before: readonly CleanupReviewSegment[];
  readonly treatment: readonly CleanupReviewSegment[];
  readonly result: readonly CleanupReviewSegment[];
  readonly targetDurationFrames: Frame;
}

export interface CleanupReviewState {
  readonly suggestionIds: readonly string[];
  readonly activeIndex: number;
  readonly stage: CleanupReviewStage;
  readonly playing: boolean;
  readonly closed: boolean;
  readonly boundaryAdjustmentFrames: {
    readonly start: Frame;
    readonly end: Frame;
  };
}

export type CleanupReviewCommand =
  | { readonly type: 'replay' }
  | { readonly type: 'pause' }
  | { readonly type: 'playback-ended' }
  | { readonly type: 'next' }
  | { readonly type: 'previous' }
  | { readonly type: 'accept' | 'reject' }
  | {
      readonly type: 'adjust-boundary';
      readonly edge: 'start' | 'end';
      readonly deltaFrames: Frame;
    }
  | { readonly type: 'escape' };

export interface CleanupReviewTransition {
  readonly state: CleanupReviewState;
  readonly decision?: {
    readonly suggestionId: string;
    readonly status: Extract<CleanupDecisionStatus, 'accepted' | 'rejected'>;
  };
}

export function createCleanupReviewState(
  session: CleanupSession,
): CleanupReviewState {
  const suggestionIds = session.decisions
    .filter(
      (decision) =>
        (decision.status === 'pending' || decision.status === 'restored') &&
        session.suggestions.find(
          (suggestion) => suggestion.id === decision.suggestionId,
        )?.kind !== 'manual',
    )
    .map((decision) => decision.suggestionId);
  return {
    suggestionIds,
    activeIndex: 0,
    stage: 'before',
    playing: suggestionIds.length > 0,
    closed: suggestionIds.length === 0,
    boundaryAdjustmentFrames: { start: 0, end: 0 },
  };
}

export function cleanupReviewPlaybackPlan(
  suggestion: CleanupSuggestion,
  {
    durationFrames,
    fps,
    boundaryAdjustmentFrames = { start: 0, end: 0 },
    contextSeconds = 2,
  }: {
    readonly durationFrames: Frame;
    readonly fps: number;
    readonly boundaryAdjustmentFrames?: {
      readonly start: Frame;
      readonly end: Frame;
    };
    readonly contextSeconds?: number;
  },
): CleanupReviewPlaybackPlan {
  const ranges = suggestion.timelineRanges
    .map((range) => ({
      startFrame: range.startFrame,
      endFrame: range.endFrame,
    }))
    .sort((left, right) => left.startFrame - right.startFrame);
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  if (!first || !last) {
    return {
      suggestionId: suggestion.id,
      action: suggestion.proposedAction,
      before: [],
      treatment: [],
      result: [],
      targetDurationFrames: suggestion.targetDurationFrames,
    };
  }
  const adjustedStart = clampFrame(
    first.startFrame + boundaryAdjustmentFrames.start,
    0,
    Math.max(0, last.endFrame - 1),
  );
  const adjustedEnd = clampFrame(
    last.endFrame + boundaryAdjustmentFrames.end,
    adjustedStart + 1,
    durationFrames,
  );
  const contextFrames = Math.max(1, Math.round(contextSeconds * fps));
  const beforeStart = Math.max(0, adjustedStart - contextFrames);
  const afterEnd = Math.min(durationFrames, adjustedEnd + contextFrames);
  const treatment = ranges.map((range, index) => ({
    startFrame:
      index === 0 ? adjustedStart : Math.max(adjustedStart, range.startFrame),
    endFrame:
      index === ranges.length - 1
        ? adjustedEnd
        : Math.min(adjustedEnd, range.endFrame),
  }));
  return {
    suggestionId: suggestion.id,
    action: suggestion.proposedAction,
    before:
      adjustedStart > beforeStart
        ? [{ startFrame: beforeStart, endFrame: adjustedStart }]
        : [],
    treatment: treatment.filter((range) => range.endFrame > range.startFrame),
    result: [
      ...(adjustedStart > beforeStart
        ? [{ startFrame: beforeStart, endFrame: adjustedStart }]
        : []),
      ...(afterEnd > adjustedEnd
        ? [{ startFrame: adjustedEnd, endFrame: afterEnd }]
        : []),
    ],
    targetDurationFrames: suggestion.targetDurationFrames,
  };
}

export function adjustedCleanupSuggestionRanges(
  suggestion: CleanupSuggestion,
  boundaryAdjustmentFrames: CleanupReviewState['boundaryAdjustmentFrames'],
  durationFrames: Frame,
): readonly TranscriptTimelineRange[] {
  const ranges = [...suggestion.timelineRanges].sort(
    (left, right) => left.startFrame - right.startFrame,
  );
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  if (!first || !last) return [];
  const adjustedStart = clampFrame(
    first.startFrame + boundaryAdjustmentFrames.start,
    0,
    Math.max(0, last.endFrame - 1),
  );
  const adjustedEnd = clampFrame(
    last.endFrame + boundaryAdjustmentFrames.end,
    adjustedStart + 1,
    durationFrames,
  );
  return ranges
    .map((range, index) => ({
      ...range,
      startFrame: index === 0 ? adjustedStart : range.startFrame,
      endFrame: index === ranges.length - 1 ? adjustedEnd : range.endFrame,
    }))
    .filter((range) => range.endFrame > range.startFrame);
}

export function transitionCleanupReview(
  state: CleanupReviewState,
  command: CleanupReviewCommand,
): CleanupReviewTransition {
  if (state.closed) return { state };
  if (command.type === 'escape') {
    return { state: { ...state, playing: false, closed: true } };
  }
  if (command.type === 'replay') {
    return {
      state: {
        ...state,
        stage: 'before',
        playing: true,
      },
    };
  }
  if (command.type === 'pause') {
    return { state: { ...state, playing: false } };
  }
  if (command.type === 'playback-ended') {
    if (state.stage === 'before') {
      return { state: { ...state, stage: 'treatment', playing: true } };
    }
    if (state.stage === 'treatment') {
      return { state: { ...state, stage: 'result', playing: true } };
    }
    return { state: { ...state, stage: 'decision', playing: false } };
  }
  if (command.type === 'adjust-boundary') {
    return {
      state: {
        ...state,
        boundaryAdjustmentFrames: {
          ...state.boundaryAdjustmentFrames,
          [command.edge]:
            state.boundaryAdjustmentFrames[command.edge] + command.deltaFrames,
        },
      },
    };
  }
  if (command.type === 'next' || command.type === 'previous') {
    const delta = command.type === 'next' ? 1 : -1;
    return {
      state: moveToSuggestion(state, state.activeIndex + delta),
    };
  }
  const suggestionId = state.suggestionIds[state.activeIndex];
  if (!suggestionId) return { state };
  const status = command.type === 'accept' ? 'accepted' : 'rejected';
  return {
    state: moveToSuggestion(state, state.activeIndex + 1),
    decision: { suggestionId, status },
  };
}

export function cleanupReviewSegmentsForStage(
  plan: CleanupReviewPlaybackPlan,
  stage: CleanupReviewStage,
): readonly CleanupReviewSegment[] {
  if (stage === 'before') return plan.before;
  if (stage === 'treatment') return plan.treatment;
  if (stage === 'result') return plan.result;
  return [];
}

function moveToSuggestion(
  state: CleanupReviewState,
  requestedIndex: number,
): CleanupReviewState {
  if (state.suggestionIds.length === 0) {
    return { ...state, playing: false, closed: true };
  }
  if (requestedIndex >= state.suggestionIds.length) {
    return {
      ...state,
      activeIndex: state.suggestionIds.length - 1,
      stage: 'decision',
      playing: false,
      closed: true,
      boundaryAdjustmentFrames: { start: 0, end: 0 },
    };
  }
  return {
    ...state,
    activeIndex: Math.max(0, requestedIndex),
    stage: 'before',
    playing: true,
    boundaryAdjustmentFrames: { start: 0, end: 0 },
  };
}

function clampFrame(value: number, minimum: number, maximum: number): Frame {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
