import React from 'react';
import {
  adjustedCleanupSuggestionRanges,
  cleanupReviewPlaybackPlan,
  cleanupReviewSegmentsForStage,
  createCleanupReviewState,
  decideCleanupSuggestion,
  draftTimelineFrame,
  resolveCleanupDraftProjection,
  transitionCleanupReview,
  type CleanupReviewCommand,
  type CleanupReviewState,
  type CleanupSession,
} from '@rough-cut/project-model';
import { isTypingTarget } from '../nle/keyboard.mjs';

export function CleanupReviewPanel({
  session,
  durationFrames,
  fps,
  playheadFrame,
  onSeek,
  onPlayingChange,
  onSessionChange,
  manualSeekVersion,
  suspendPlayback,
}: {
  session: CleanupSession;
  durationFrames: number;
  fps: number;
  playheadFrame: number;
  onSeek: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSessionChange: (session: CleanupSession) => void;
  manualSeekVersion: number;
  suspendPlayback: boolean;
}) {
  const [review, setReview] = React.useState<CleanupReviewState>(() =>
    createCleanupReviewState(session),
  );
  const reviewStateRef = React.useRef(review);
  reviewStateRef.current = review;
  const [segmentIndex, setSegmentIndex] = React.useState(0);
  const reviewRef = React.useRef<HTMLElement | null>(null);
  const onSeekRef = React.useRef(onSeek);
  const onPlayingChangeRef = React.useRef(onPlayingChange);
  const onSessionChangeRef = React.useRef(onSessionChange);
  const sessionRef = React.useRef(session);
  const skipPlaybackEffectRef = React.useRef(false);
  const boundaryGestureRef = React.useRef<{
    suggestionId: string;
    adjustments: CleanupReviewState['boundaryAdjustmentFrames'];
  } | null>(null);
  const commitBoundaryAdjustmentRef = React.useRef<() => void>(() => undefined);
  onSeekRef.current = onSeek;
  onPlayingChangeRef.current = onPlayingChange;
  onSessionChangeRef.current = onSessionChange;
  sessionRef.current = session;
  const draftProjection = React.useMemo(
    () => resolveCleanupDraftProjection(session),
    [session],
  );

  React.useEffect(() => {
    const nextReview = createCleanupReviewState(session);
    reviewStateRef.current = nextReview;
    boundaryGestureRef.current = null;
    setReview(nextReview);
  }, [session.analysisSignature]);

  React.useLayoutEffect(() => {
    if (manualSeekVersion === 0) return;
    skipPlaybackEffectRef.current = true;
    setReview((current) =>
      {
        const next = transitionCleanupReview(current, { type: 'pause' }).state;
        reviewStateRef.current = next;
        return next;
      },
    );
  }, [manualSeekVersion]);

  const activeSuggestionId = review.suggestionIds[review.activeIndex] ?? null;
  const suggestion =
    session.suggestions.find((candidate) => candidate.id === activeSuggestionId) ??
    null;
  const plan = React.useMemo(
    () =>
      suggestion
        ? cleanupReviewPlaybackPlan(suggestion, {
            durationFrames,
            fps,
            boundaryAdjustmentFrames: review.boundaryAdjustmentFrames,
          })
        : null,
    [
      durationFrames,
      fps,
      review.boundaryAdjustmentFrames,
      suggestion,
    ],
  );
  const stageSegments = React.useMemo(
    () =>
      plan
        ? cleanupReviewSegmentsForStage(plan, review.stage).map((segment) => ({
            startFrame: draftTimelineFrame(
              draftProjection,
              segment.startFrame,
            ),
            endFrame: draftTimelineFrame(
              draftProjection,
              segment.endFrame,
            ),
          }))
        : [],
    [draftProjection, plan, review.stage],
  );

  const dispatch = React.useCallback(
    (command: CleanupReviewCommand) => {
      const currentReview = reviewStateRef.current;
      const currentSession = sessionRef.current;
      const currentSuggestionId =
        currentReview.suggestionIds[currentReview.activeIndex];
      const currentSuggestion = currentSession.suggestions.find(
        (candidate) => candidate.id === currentSuggestionId,
      );
      if (command.type === 'accept' && currentSuggestion?.keptByDefault) return;
      boundaryGestureRef.current = null;
      const transition = transitionCleanupReview(currentReview, command);
      reviewStateRef.current = transition.state;
      setReview(transition.state);
      if (transition.decision) {
        const existingDecision = currentSession.decisions.find(
          (decision) =>
            decision.suggestionId === transition.decision?.suggestionId,
        );
        if (
          transition.decision.status !== 'accepted' ||
          existingDecision?.status !== 'adjusted'
        ) {
          const nextSession = decideCleanupSuggestion(
            currentSession,
            transition.decision.suggestionId,
            transition.decision.status,
          );
          sessionRef.current = nextSession;
          onSessionChangeRef.current(nextSession);
        }
      }
      window.requestAnimationFrame(() => {
        reviewRef.current?.focus({ preventScroll: true });
      });
    },
    [],
  );

  const adjustBoundary = React.useCallback(
    (
      command: Extract<CleanupReviewCommand, { type: 'adjust-boundary' }>,
      commitImmediately = false,
    ) => {
      const currentReview = reviewStateRef.current;
      const suggestionId = currentReview.suggestionIds[currentReview.activeIndex];
      if (!suggestionId) return;
      const existingGesture = boundaryGestureRef.current;
      const adjustments =
        existingGesture?.suggestionId === suggestionId
          ? existingGesture.adjustments
          : currentReview.boundaryAdjustmentFrames;
      const nextAdjustments = {
        ...adjustments,
        [command.edge]: adjustments[command.edge] + command.deltaFrames,
      };
      boundaryGestureRef.current = { suggestionId, adjustments: nextAdjustments };
      const nextReview = {
        ...currentReview,
        boundaryAdjustmentFrames: nextAdjustments,
      };
      reviewStateRef.current = nextReview;
      setReview(nextReview);
      if (commitImmediately) {
        commitBoundaryAdjustmentRef.current();
      }
      window.requestAnimationFrame(() => {
        reviewRef.current?.focus({ preventScroll: true });
      });
    },
    [],
  );

  const commitBoundaryAdjustment = React.useCallback(() => {
    const gesture = boundaryGestureRef.current;
    boundaryGestureRef.current = null;
    if (!gesture) return;
    const currentSession = sessionRef.current;
    const currentSuggestion = currentSession.suggestions.find(
      (candidate) => candidate.id === gesture.suggestionId,
    );
    if (
      !currentSuggestion ||
      currentSuggestion.keptByDefault ||
      currentSuggestion.proposedAction !== 'remove'
    ) {
      return;
    }
    const adjustedRanges = adjustedCleanupSuggestionRanges(
      currentSuggestion,
      gesture.adjustments,
      durationFrames,
    );
    if (adjustedRanges.length === 0) return;
    const nextSession = decideCleanupSuggestion(
      currentSession,
      currentSuggestion.id,
      'adjusted',
      adjustedRanges,
    );
    sessionRef.current = nextSession;
    onSessionChangeRef.current(nextSession);
  }, [durationFrames]);
  commitBoundaryAdjustmentRef.current = commitBoundaryAdjustment;

  React.useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        reviewStateRef.current.closed ||
        isTypingTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const command = reviewCommandForKey(event.key, event.shiftKey);
      if (!command) return;
      event.preventDefault();
      if (command.type === 'adjust-boundary') {
        adjustBoundary(command);
      } else {
        dispatch(command);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== '[' && event.key !== ']') return;
      commitBoundaryAdjustment();
    };
    documentGlobal().addEventListener('keydown', handleKey);
    documentGlobal().addEventListener('keyup', handleKeyUp);
    return () => {
      documentGlobal().removeEventListener('keydown', handleKey);
      documentGlobal().removeEventListener('keyup', handleKeyUp);
    };
  }, [adjustBoundary, commitBoundaryAdjustment, dispatch]);

  React.useEffect(() => {
    setSegmentIndex(0);
    if (suspendPlayback) return;
    if (skipPlaybackEffectRef.current) {
      skipPlaybackEffectRef.current = false;
      return;
    }
    if (!review.playing) return;
    if (stageSegments.length === 0) {
      onPlayingChangeRef.current(false);
      return;
    }
    onSeekRef.current(stageSegments[0]!.startFrame);
    onPlayingChangeRef.current(true);
  }, [
    review.activeIndex,
    review.playing,
    review.stage,
    suspendPlayback,
    stageSegments,
  ]);

  React.useEffect(() => {
    if (!review.playing || suspendPlayback) return;
    const segment = stageSegments[segmentIndex];
    if (!segment || playheadFrame < segment.endFrame - 1) return;
    const nextSegment = stageSegments[segmentIndex + 1];
    if (nextSegment) {
      setSegmentIndex(segmentIndex + 1);
      onSeek(nextSegment.startFrame);
      return;
    }
    onPlayingChange(false);
    dispatch({ type: 'playback-ended' });
  }, [
    dispatch,
    onPlayingChange,
    onSeek,
    playheadFrame,
    review.playing,
    segmentIndex,
    suspendPlayback,
    stageSegments,
  ]);

  if (!suggestion) {
    return session.suggestions.some((candidate) => candidate.kind !== 'manual') ? (
      <section
        ref={reviewRef}
        className="ev2CleanupReview"
        aria-label="Smart cleanup review"
        data-review-closed="true"
        tabIndex={-1}
      >
        <div className="ev2CleanupReviewHeader">
          <span>Review complete</span>
          <strong>Draft</strong>
        </div>
        <p className="ev2CleanupReason">
          All suggestions are reviewed. Your draft remains reversible.
        </p>
        <div className="ev2CleanupActions">
          <button type="button" disabled>Replay <kbd>R</kbd></button>
          <button type="button" disabled>Keep <kbd>X</kbd></button>
          <button type="button" className="primary" disabled>Accept <kbd>A</kbd></button>
        </div>
      </section>
    ) : null;
  }
  const decision = session.decisions.find(
    (candidate) => candidate.suggestionId === suggestion.id,
  );
  return (
    <section
      ref={reviewRef}
      className="ev2CleanupReview"
      aria-label="Smart cleanup review"
      data-review-closed={review.closed ? 'true' : undefined}
      data-boundary-start={review.boundaryAdjustmentFrames.start}
      data-boundary-end={review.boundaryAdjustmentFrames.end}
      tabIndex={-1}
    >
      <div className="ev2CleanupReviewHeader">
        <span>
          {review.closed
            ? 'Review complete'
            : `Review ${review.activeIndex + 1}/${review.suggestionIds.length}`}
        </span>
        <strong>{suggestion.kind === 'retry' ? 'Retry' : 'Wait'}</strong>
        <code>{Math.round(suggestion.confidence * 100)}%</code>
      </div>
      <div className="ev2CleanupStages" aria-label="Review playback stage">
        {(['before', 'treatment', 'result'] as const).map((stage) => (
          <span
            key={stage}
            aria-current={review.stage === stage ? 'step' : undefined}
          >
            {stage === 'treatment' ? 'Cut' : stage}
          </span>
        ))}
      </div>
      <p className="ev2CleanupReason">
        {review.closed
          ? 'All suggestions are reviewed. Your draft remains reversible.'
          : suggestion.reason}
      </p>
      <div className="ev2CleanupActions">
        <button type="button" onClick={() => dispatch({ type: 'replay' })} disabled={review.closed}>
          Replay <kbd>R</kbd>
        </button>
        <button type="button" onClick={() => dispatch({ type: 'reject' })} disabled={review.closed}>
          Keep <kbd>X</kbd>
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => dispatch({ type: 'accept' })}
          disabled={review.closed || suggestion.keptByDefault}
          title={
            suggestion.proposedAction === 'compress'
              ? 'Compression stays preview-only until speed playback and export match'
              : suggestion.keptByDefault
                ? 'This uncertain suggestion is kept by default'
              : 'Accept draft treatment'
          }
        >
          Accept <kbd>A</kbd>
        </button>
      </div>
      <div className="ev2CleanupNavigation" aria-label="Review navigation">
        <button type="button" onClick={() => dispatch({ type: 'previous' })} disabled={review.closed || review.activeIndex === 0}>
          Back <kbd>K</kbd>
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'next' })}
          disabled={review.closed || review.activeIndex + 1 >= review.suggestionIds.length}
        >
          Next <kbd>J</kbd>
        </button>
      </div>
      <div className="ev2CleanupBoundaryActions" aria-label="Adjust cut boundary">
        <button type="button" onClick={() => adjustBoundary({ type: 'adjust-boundary', edge: 'start', deltaFrames: -1 }, true)} disabled={review.closed || suggestion.keptByDefault || suggestion.proposedAction !== 'remove'}>
          In −
        </button>
        <button type="button" onClick={() => adjustBoundary({ type: 'adjust-boundary', edge: 'start', deltaFrames: 1 }, true)} disabled={review.closed || suggestion.keptByDefault || suggestion.proposedAction !== 'remove'}>
          In +
        </button>
        <button type="button" onClick={() => adjustBoundary({ type: 'adjust-boundary', edge: 'end', deltaFrames: -1 }, true)} disabled={review.closed || suggestion.keptByDefault || suggestion.proposedAction !== 'remove'}>
          Out −
        </button>
        <button type="button" onClick={() => adjustBoundary({ type: 'adjust-boundary', edge: 'end', deltaFrames: 1 }, true)} disabled={review.closed || suggestion.keptByDefault || suggestion.proposedAction !== 'remove'}>
          Out +
        </button>
        <span aria-live="polite">
          {review.closed
            ? 'Draft ready'
            : suggestion.proposedAction === 'compress'
            ? 'Preview only'
            : decision?.status === 'pending'
              ? 'Pending'
              : decision?.status}
        </span>
      </div>
    </section>
  );
}

function reviewCommandForKey(
  key: string,
  shiftKey: boolean,
): CleanupReviewCommand | null {
  const normalized = key.toLocaleLowerCase();
  if (normalized === 'r') return { type: 'replay' };
  if (normalized === 'a') return { type: 'accept' };
  if (normalized === 'x') return { type: 'reject' };
  if (normalized === 'j') return { type: 'next' };
  if (normalized === 'k') return { type: 'previous' };
  if (key === 'Escape') return { type: 'escape' };
  if (key === '[') {
    return {
      type: 'adjust-boundary',
      edge: shiftKey ? 'end' : 'start',
      deltaFrames: -1,
    };
  }
  if (key === ']') {
    return {
      type: 'adjust-boundary',
      edge: shiftKey ? 'end' : 'start',
      deltaFrames: 1,
    };
  }
  return null;
}

function documentGlobal(): Document {
  return window.document;
}
