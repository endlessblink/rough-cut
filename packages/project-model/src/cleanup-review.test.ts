import { describe, expect, it } from 'vitest';
import type { CleanupSession, CleanupSuggestion } from './cleanup-session.js';
import {
  adjustedCleanupSuggestionRanges,
  cleanupReviewPlaybackPlan,
  cleanupReviewSegmentsForStage,
  createCleanupReviewState,
  transitionCleanupReview,
} from './cleanup-review.js';

const suggestion: CleanupSuggestion = {
  id: 'cleanup:retry:one',
  sourceId: 'retry:one',
  kind: 'retry',
  proposedAction: 'remove',
  timelineRanges: [
    {
      startFrame: 100,
      endFrame: 160,
      sourceId: 'screen',
      clipId: 'clip',
    },
  ],
  targetDurationFrames: 0,
  confidence: 0.9,
  reason: 'later take succeeds',
  keptByDefault: false,
};

function session(): CleanupSession {
  return {
    suggestions: [
      suggestion,
      { ...suggestion, id: 'cleanup:retry:two', sourceId: 'retry:two' },
    ],
    decisions: [
      { suggestionId: suggestion.id, status: 'pending' },
      { suggestionId: 'cleanup:retry:two', status: 'pending' },
    ],
    history: { past: [], future: [] },
    analysisSignature: 'fixture',
    analysisChanged: false,
  };
}

describe('cleanup review', () => {
  it('plays before, treatment, and resulting join before pausing for a decision', () => {
    let state = createCleanupReviewState(session());
    expect(state).toMatchObject({ stage: 'before', playing: true });
    state = transitionCleanupReview(state, { type: 'playback-ended' }).state;
    expect(state).toMatchObject({ stage: 'treatment', playing: true });
    state = transitionCleanupReview(state, { type: 'playback-ended' }).state;
    expect(state).toMatchObject({ stage: 'result', playing: true });
    state = transitionCleanupReview(state, { type: 'playback-ended' }).state;
    expect(state).toMatchObject({ stage: 'decision', playing: false });
  });

  it('pauses guided playback when the user manually seeks elsewhere', () => {
    const state = createCleanupReviewState(session());

    expect(transitionCleanupReview(state, { type: 'pause' }).state).toMatchObject({
      stage: 'before',
      playing: false,
      closed: false,
    });
  });

  it('never includes proposed removed frames in resulting-join playback', () => {
    const plan = cleanupReviewPlaybackPlan(suggestion, {
      durationFrames: 300,
      fps: 30,
    });

    expect(plan.before).toEqual([{ startFrame: 40, endFrame: 100 }]);
    expect(plan.treatment).toEqual([{ startFrame: 100, endFrame: 160 }]);
    expect(plan.result).toEqual([
      { startFrame: 40, endFrame: 100 },
      { startFrame: 160, endFrame: 220 },
    ]);
    expect(cleanupReviewSegmentsForStage(plan, 'result')).not.toContainEqual(
      expect.objectContaining({ startFrame: 100 }),
    );
  });

  it('accepts or rejects then advances while returning one explicit decision', () => {
    const initial = createCleanupReviewState(session());
    const accepted = transitionCleanupReview(initial, { type: 'accept' });

    expect(accepted.decision).toEqual({
      suggestionId: suggestion.id,
      status: 'accepted',
    });
    expect(accepted.state).toMatchObject({
      activeIndex: 1,
      stage: 'before',
      playing: true,
    });
    const rejected = transitionCleanupReview(accepted.state, { type: 'reject' });
    expect(rejected.decision?.status).toBe('rejected');
    expect(rejected.state.closed).toBe(true);
  });

  it('supports replay, navigation, boundary adjustment, and escape', () => {
    let state = createCleanupReviewState(session());
    state = transitionCleanupReview(state, { type: 'next' }).state;
    expect(state.activeIndex).toBe(1);
    state = transitionCleanupReview(state, {
      type: 'adjust-boundary',
      edge: 'start',
      deltaFrames: -2,
    }).state;
    expect(state.boundaryAdjustmentFrames.start).toBe(-2);
    state = transitionCleanupReview(state, { type: 'replay' }).state;
    expect(state).toMatchObject({ stage: 'before', playing: true });
    state = transitionCleanupReview(state, { type: 'previous' }).state;
    expect(state.activeIndex).toBe(0);
    state = transitionCleanupReview(state, { type: 'escape' }).state;
    expect(state).toMatchObject({ closed: true, playing: false });
  });

  it('reopens with only pending or restored suggestions in the queue', () => {
    const reopened = session();
    const state = createCleanupReviewState({
      ...reopened,
      decisions: [
        { suggestionId: suggestion.id, status: 'accepted' },
        { suggestionId: 'cleanup:retry:two', status: 'pending' },
      ],
    });

    expect(state.suggestionIds).toEqual(['cleanup:retry:two']);
    expect(state.closed).toBe(false);
  });

  it('keeps manual transcript cuts out of the analysis review queue', () => {
    const base = session();
    const manualId = 'manual:selection';
    const state = createCleanupReviewState({
      ...base,
      suggestions: [
        ...base.suggestions,
        { ...base.suggestions[0]!, id: manualId, kind: 'manual' },
      ],
      decisions: [
        ...base.decisions,
        { suggestionId: manualId, status: 'restored' },
      ],
    });

    expect(state.suggestionIds).not.toContain(manualId);
  });

  it('applies frame-accurate alternative boundaries to every review phase', () => {
    const plan = cleanupReviewPlaybackPlan(suggestion, {
      durationFrames: 300,
      fps: 30,
      boundaryAdjustmentFrames: { start: -3, end: 5 },
    });

    expect(plan.before[0]?.endFrame).toBe(97);
    expect(plan.treatment[0]).toEqual({ startFrame: 97, endFrame: 165 });
    expect(plan.result[1]?.startFrame).toBe(165);
  });

  it('preserves source anchors while refining only the outer cut boundaries', () => {
    const multiRangeSuggestion: CleanupSuggestion = {
      ...suggestion,
      timelineRanges: [
        suggestion.timelineRanges[0]!,
        {
          startFrame: 200,
          endFrame: 240,
          sourceId: 'screen',
          clipId: 'clip-two',
        },
      ],
    };

    expect(
      adjustedCleanupSuggestionRanges(
        multiRangeSuggestion,
        { start: -3, end: 5 },
        300,
      ),
    ).toEqual([
      {
        ...suggestion.timelineRanges[0],
        startFrame: 97,
      },
      {
        ...multiRangeSuggestion.timelineRanges[1],
        endFrame: 245,
      },
    ]);
  });
});
