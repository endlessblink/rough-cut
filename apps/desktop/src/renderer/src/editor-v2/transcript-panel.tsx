import React from 'react';
import { CleanupReviewPanel } from './cleanup-review-panel';
import { isTypingTarget } from '../nle/keyboard.mjs';
import {
  REVIEW_PLAYBACK_RATES,
  advanceJoinVerification,
  beginJoinVerification,
  cancelJoinVerification,
  normalizeReviewPlaybackRate,
  type JoinVerification,
} from './manual-review-playback.mjs';
import {
  addManualCleanupCut,
  cleanupDraftContextSignature,
  cleanupSessionSnapshot,
  chooseCleanupJoinAlternative,
  cleanupSuggestionsFromAnalysis,
  createCleanupSession,
  createInteractionLatencyTracker,
  createLatestSeekCoordinator,
  createTranscriptTimelineIndex,
  deriveRetryReplacementSuggestions,
  deriveScreenActionLandmarks,
  deriveWaitTreatmentSuggestions,
  draftTimelineDuration,
  draftTimelineFrame,
  loadCleanupSessionSnapshot,
  persistCleanupSessionSnapshot,
  planNaturalJoin,
  resolveCleanupDraftProjection,
  searchScreenActionLandmarks,
  timelineFrameForScreenActionLandmark,
  transcriptWordEntryAtTimelineFrame,
  transcriptWordSelectionTimelineRanges,
  undoCleanupDecision,
  redoCleanupDecision,
  type CleanupDraftProjection,
  type CleanupSession,
  type ProjectDocument,
  type ScreenActionLandmark,
  type TranscriptTimelineWordEntry,
  type TranscriptWord,
} from '@rough-cut/project-model';

export function TranscriptPanel({
  document,
  projectPath,
  playheadFrame,
  fps,
  onSeek,
  durationFrames,
  isPlaying,
  onPlayingChange,
  playbackRate,
  onPlaybackRateChange,
  onDocumentChange,
  onDraftProjectionChange,
  onFinalizeDraft,
}: {
  document: ProjectDocument;
  projectPath: string;
  playheadFrame: number;
  fps: number;
  onSeek: (frame: number) => void;
  durationFrames: number;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  onDocumentChange?: (document: ProjectDocument) => void;
  onDraftProjectionChange: (projection: CleanupDraftProjection) => void;
  onFinalizeDraft?: () => void;
}) {
  const recordingAssetId = React.useMemo(
    () => document.assets.find((asset) => asset.type === 'recording')?.id ?? null,
    [document.assets],
  );
  const cleanupSuggestions = React.useMemo(
    () =>
      cleanupSuggestionsFromAnalysis(
        deriveRetryReplacementSuggestions(document),
        deriveWaitTreatmentSuggestions(document),
      ),
    [document.timeline, document.transcript],
  );
  const seededSession = React.useMemo(
    () =>
      createCleanupSession(
        cleanupSuggestions,
        recordingAssetId
          ? loadCleanupSessionSnapshot(document, recordingAssetId)
          : null,
        cleanupDraftContextSignature(document, cleanupSuggestions),
      ),
    [cleanupSuggestions, document, recordingAssetId],
  );
  const [cleanupSession, setCleanupSession] =
    React.useState<CleanupSession>(seededSession);
  const sessionSeedKey = `${document.id}:${seededSession.analysisSignature}`;
  const sessionSeedKeyRef = React.useRef(sessionSeedKey);
  React.useEffect(() => {
    if (sessionSeedKeyRef.current === sessionSeedKey) return;
    sessionSeedKeyRef.current = sessionSeedKey;
    setCleanupSession(seededSession);
  }, [seededSession, sessionSeedKey]);
  const cleanupDraftProjection = React.useMemo(
    () => resolveCleanupDraftProjection(cleanupSession),
    [cleanupSession],
  );
  const commitCleanupSession = React.useCallback(
    (next: CleanupSession, options: { deferPersist?: boolean } = {}) => {
      setCleanupSession(next);
      if (!recordingAssetId || !onDocumentChange) return;
      const persist = () =>
        onDocumentChange(
          persistCleanupSessionSnapshot(
            document,
            recordingAssetId,
            cleanupSessionSnapshot(next),
          ),
        );
      if (options.deferPersist) {
        window.setTimeout(persist, 0);
      } else {
        persist();
      }
    },
    [document, onDocumentChange, recordingAssetId],
  );
  React.useEffect(() => {
    onDraftProjectionChange(cleanupDraftProjection);
  }, [cleanupDraftProjection, onDraftProjectionChange]);
  const reviewSeek = useLatestFrameSeek(onSeek);
  const [manualSeekVersion, setManualSeekVersion] = React.useState(0);
  const requestSeek = React.useCallback(
    (frame: number) => {
      onPlayingChange(false);
      setManualSeekVersion((current) => current + 1);
      reviewSeek(frame);
    },
    [onPlayingChange, reviewSeek],
  );
  const timelineIndex = React.useMemo(
    () => createTranscriptTimelineIndex(document),
    [document],
  );
  const draftPlayheadFrame = Math.round(playheadFrame);
  const draftTimelineIndex = React.useMemo(
    () => ({
      ...timelineIndex,
      words: timelineIndex.words.map((entry) => {
        if (entry.firstTimelineFrame === null) return entry;
        return isRemovedByCleanupProjection(
          cleanupDraftProjection,
          entry.firstTimelineFrame,
        )
          ? { ...entry, firstTimelineFrame: null }
          : {
              ...entry,
              firstTimelineFrame: draftTimelineFrame(
                cleanupDraftProjection,
                entry.firstTimelineFrame,
              ),
            };
      }),
    }),
    [cleanupDraftProjection, timelineIndex],
  );
  const activeEntry = React.useMemo(
    () =>
      transcriptWordEntryAtTimelineFrame(
        draftTimelineIndex,
        draftPlayheadFrame,
      ),
    [draftPlayheadFrame, draftTimelineIndex],
  );
  const wordChunks = React.useMemo(
    () => chunk(draftTimelineIndex.words, 120),
    [draftTimelineIndex.words],
  );
  const [wordSelection, setWordSelection] = React.useState<{
    anchor: number;
    focus: number;
  } | null>(null);
  const [followPlayback, setFollowPlayback] = React.useState(true);
  const [lastManualCutId, setLastManualCutId] = React.useState<string | null>(null);
  const [joinVerification, setJoinVerification] =
    React.useState<JoinVerification | null>(null);
  const [completedJoinVerifications, setCompletedJoinVerifications] =
    React.useState(0);
  const joinVerificationReachedStartRef = React.useRef(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const selectedWordCount = wordSelection
    ? Math.abs(wordSelection.focus - wordSelection.anchor) + 1
    : 0;
  const selectedSuggestion = wordSelection
    ? suggestionForEntry(
        cleanupSession,
        timelineIndex.words[wordSelection.focus] ?? null,
      )
    : null;
  const replacementFrame = selectedSuggestion?.replacementRanges?.[0]
    ? draftTimelineFrame(
        cleanupDraftProjection,
        selectedSuggestion.replacementRanges[0].startFrame,
      )
    : null;
  const lastManualCut =
    (lastManualCutId
      ? cleanupSession.suggestions.find(
          (suggestion) => suggestion.id === lastManualCutId,
        )
      : null) ??
    cleanupSession.suggestions
      .filter(
        (suggestion) =>
          suggestion.kind === 'manual' && suggestion.naturalJoinPlan,
      )
      .at(-1) ??
    null;
  const lastManualDecision = lastManualCut
    ? cleanupSession.decisions.find(
        (decision) => decision.suggestionId === lastManualCut.id,
      ) ?? null
    : null;
  const hasSaferJoinAlternative =
    lastManualCut?.naturalJoinPlan?.alternatives.some(
      (alternative) => alternative.id === 'silence-safe',
    ) ?? false;
  const selectedJoinAlternative =
    !hasSaferJoinAlternative
      ? 'requested'
      : lastManualCut?.naturalJoinPlan &&
    lastManualDecision?.status === 'adjusted' &&
    sameTimelineRanges(
      lastManualDecision.adjustedRanges ?? [],
      lastManualCut.naturalJoinPlan.requestedRanges,
    )
        ? 'requested'
        : 'silence-safe';
  const pendingReviewCount = cleanupSession.decisions.filter((decision) => {
    const suggestion = cleanupSession.suggestions.find(
      (candidate) => candidate.id === decision.suggestionId,
    );
    return suggestion?.kind !== 'manual' && decision.status === 'pending';
  }).length;
  const draftChangeCount =
    cleanupDraftProjection.removals.length +
    cleanupDraftProjection.compressions.length;
  const canFinalizeDraft =
    draftChangeCount > 0 &&
    pendingReviewCount === 0 &&
    cleanupDraftProjection.compressions.length === 0 &&
    Boolean(onFinalizeDraft);
  const finalizeDraftTitle =
    cleanupDraftProjection.compressions.length > 0
      ? 'Wait compression needs matching preview and export support before finalizing'
      : pendingReviewCount > 0
        ? `Review ${pendingReviewCount} remaining suggestion${
            pendingReviewCount === 1 ? '' : 's'
          } first`
        : 'Apply the draft as one undoable timeline edit';
  const [visualJoinCheck, setVisualJoinCheck] = React.useState<{
    status: 'idle' | 'checking' | 'ready' | 'unavailable';
    score: number;
    warning: boolean;
  }>({ status: 'idle', score: 0, warning: false });
  React.useEffect(() => {
    const plan = lastManualCut?.naturalJoinPlan;
    const recordingAsset = document.assets.find(
      (asset) => asset.type === 'recording',
    );
    const ranges =
      lastManualDecision?.status === 'adjusted'
        ? lastManualDecision.adjustedRanges ?? []
        : plan?.refinedRanges ?? [];
    const bridge = (
      window as Window & {
        roughCut?: {
          inspectVisualDiscontinuity?: (
            payload: Record<string, unknown>,
          ) => Promise<{ score: number; warning: boolean }>;
        };
      }
    ).roughCut;
    if (
      !plan ||
      !recordingAsset ||
      !projectPath ||
      ranges.length === 0 ||
      !bridge?.inspectVisualDiscontinuity
    ) {
      setVisualJoinCheck({ status: 'idle', score: 0, warning: false });
      return undefined;
    }
    const samples = ranges.flatMap((range) => {
      const clip = document.timeline.tracks
        .flatMap((track) => track.clips)
        .find(
          (candidate) =>
            candidate.id === range.clipId &&
            candidate.mediaId === range.sourceId,
        );
      if (!clip) return [];
      return [
        {
          projectPath,
          sourcePath: recordingAsset.filePath,
          beforeFrame: Math.max(
            0,
            clip.sourceIn + range.startFrame - clip.timelineIn - 1,
          ),
          afterFrame:
            clip.sourceIn + range.endFrame - clip.timelineIn,
          fps,
        },
      ];
    });
    if (samples.length === 0) {
      setVisualJoinCheck({ status: 'unavailable', score: 0, warning: false });
      return undefined;
    }
    let cancelled = false;
    setVisualJoinCheck({ status: 'checking', score: 0, warning: false });
    void Promise.all(
      samples.map((payload) => bridge.inspectVisualDiscontinuity!(payload)),
    )
      .then((results) => {
        if (cancelled) return;
        const highest = results.reduce(
          (current, result) =>
            result.score > current.score ? result : current,
          results[0]!,
        );
        setVisualJoinCheck({
          status: 'ready',
          score: highest.score,
          warning: results.some((result) => result.warning),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setVisualJoinCheck({
            status: 'unavailable',
            score: 0,
            warning: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    document,
    fps,
    lastManualCut,
    lastManualDecision,
    projectPath,
  ]);
  const cutSelectedWords = React.useCallback(() => {
    if (!wordSelection) return;
    const ranges = transcriptWordSelectionTimelineRanges(
      document,
      wordSelection.anchor,
      wordSelection.focus,
    ).filter(
      (range) =>
        !cleanupDraftProjection.removals.some(
          (removed) =>
            removed.startFrame <= range.startFrame &&
            removed.endFrame >= range.endFrame,
        ),
    );
    if (ranges.length === 0) return;
    const startIndex = Math.min(wordSelection.anchor, wordSelection.focus);
    const endIndex = Math.max(wordSelection.anchor, wordSelection.focus);
    const rangeKey = ranges
      .map((range) => `${range.startFrame}-${range.endFrame}`)
      .join(':');
    const suggestionId = `manual:${startIndex}:${endIndex}:${rangeKey}`;
    const naturalJoinPlan = planNaturalJoin(document, ranges);
    const nextSession = addManualCleanupCut(
      cleanupSession,
      naturalJoinPlan.refinedRanges,
      suggestionId,
      naturalJoinPlan,
    );
    setManualSeekVersion((current) => current + 1);
    commitCleanupSession(nextSession, { deferPersist: true });
    const nextProjection = resolveCleanupDraftProjection(nextSession);
    onDraftProjectionChange(nextProjection);
    const joinFrame = draftTimelineFrame(
      nextProjection,
      naturalJoinPlan.refinedRanges[0]!.startFrame,
    );
    const verification = beginJoinVerification({
      joinFrame,
      fps,
      durationFrames: draftTimelineDuration(nextProjection, durationFrames),
      reviewRate: playbackRate,
    });
    setJoinVerification(verification);
    // This path explicitly seeks into the verification window; the seek and
    // playback updates may batch before React observes the start frame.
    joinVerificationReachedStartRef.current = true;
    onPlaybackRateChange(1);
    reviewSeek(verification.startFrame);
    onPlayingChange(true);
    setLastManualCutId(suggestionId);
    setWordSelection(null);
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [
    cleanupDraftProjection.removals,
    cleanupSession,
    commitCleanupSession,
    document,
    durationFrames,
    fps,
    onDraftProjectionChange,
    onPlaybackRateChange,
    onPlayingChange,
    playbackRate,
    reviewSeek,
    wordSelection,
  ]);

  React.useEffect(() => {
    if (
      joinVerification &&
      !joinVerificationReachedStartRef.current
    ) {
      if (draftPlayheadFrame > joinVerification.startFrame + 1) return;
      joinVerificationReachedStartRef.current = true;
    }
    const transition = advanceJoinVerification(
      joinVerification,
      draftPlayheadFrame,
    );
    if (!transition.completed) return;
    setJoinVerification(null);
    setCompletedJoinVerifications((current) => current + 1);
    joinVerificationReachedStartRef.current = false;
    onPlaybackRateChange(transition.resumeRate);
  }, [
    draftPlayheadFrame,
    joinVerification,
    onPlaybackRateChange,
  ]);

  React.useEffect(() => {
    if (
      !joinVerification ||
      isPlaying ||
      draftPlayheadFrame >= joinVerification.endFrame - 1
    ) {
      return;
    }
    onPlayingChange(true);
  }, [
    draftPlayheadFrame,
    isPlaying,
    joinVerification,
    onPlayingChange,
  ]);

  React.useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const isUndoRedo =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'z';
      if (
        (!panelRef.current?.contains(documentGlobal().activeElement) && !isUndoRedo) ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      if (
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        ['1', '2', '3', '4'].includes(event.key)
      ) {
        event.preventDefault();
        setJoinVerification(cancelJoinVerification(joinVerification));
        onPlaybackRateChange(
          REVIEW_PLAYBACK_RATES[Number(event.key) - 1] ?? 1,
        );
        return;
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        wordSelection
      ) {
        event.preventDefault();
        cutSelectedWords();
        return;
      }
      if (isUndoRedo) {
        event.preventDefault();
        commitCleanupSession(
          event.shiftKey
            ? redoCleanupDecision(cleanupSession)
            : undoCleanupDecision(cleanupSession),
        );
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === 'Enter' &&
        canFinalizeDraft
      ) {
        event.preventDefault();
        onFinalizeDraft?.();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [
    cleanupSession,
    canFinalizeDraft,
    commitCleanupSession,
    cutSelectedWords,
    onFinalizeDraft,
    onPlaybackRateChange,
    joinVerification,
    wordSelection,
  ]);
  const [landmarkQuery, setLandmarkQuery] = React.useState('');
  const [textEditorOpen, setTextEditorOpen] = React.useState(false);
  const [textEditorValue, setTextEditorValue] = React.useState('');
  const landmarks = React.useMemo(
    () => deriveScreenActionLandmarks(document),
    [document],
  );
  const visibleLandmarks = React.useMemo(
    () => searchScreenActionLandmarks(landmarks, landmarkQuery),
    [landmarkQuery, landmarks],
  );

  return (
    <div
      ref={panelRef}
      className="ev2Transcript"
      data-ui-region="transcript-panel"
      data-total-words={timelineIndex.words.length}
      data-selected-words={selectedWordCount}
      data-cleanup-history-depth={cleanupSession.history.past.length}
      data-cleanup-finalizable={canFinalizeDraft ? 'true' : 'false'}
      data-review-playback-rate={playbackRate}
      data-join-verification={joinVerification?.phase}
      data-join-verification-start={joinVerification?.startFrame}
      data-join-verification-end={joinVerification?.endFrame}
      data-completed-join-verifications={completedJoinVerifications}
      tabIndex={-1}
    >
      <div className="ev2TranscriptStatus">
        <span>{draftTimelineIndex.words.length.toLocaleString()} words</span>
        <div
          className="ev2ReviewSpeed"
          role="group"
          aria-label="Review speed"
        >
          {REVIEW_PLAYBACK_RATES.map((rate, index) => (
            <button
              type="button"
              key={rate}
              aria-pressed={normalizeReviewPlaybackRate(playbackRate) === rate}
              title={`${rate}× review speed (Shift+${index + 1})`}
              onClick={() => {
                setJoinVerification(cancelJoinVerification(joinVerification));
                onPlaybackRateChange(rate);
              }}
            >
              {rate}×
            </button>
          ))}
        </div>
        <code>{formatTranscriptTime(draftPlayheadFrame, fps)}</code>
      </div>
      <TranscriptTextEditor
        document={document}
        durationFrames={durationFrames}
        value={textEditorValue}
        open={textEditorOpen}
        canSave={Boolean(onDocumentChange)}
        onOpen={() => {
          setTextEditorValue(transcriptText(document));
          setTextEditorOpen(true);
        }}
        onCancel={() => setTextEditorOpen(false)}
        onChange={setTextEditorValue}
        onSave={(nextDocument) => {
          onDocumentChange?.(nextDocument);
          setTextEditorOpen(false);
        }}
      />
      <section
        className="ev2EditMap"
        aria-label="Editing actions"
        data-edit-surface-map="true"
      >
        <span className="ev2EditMapTitle">Editing actions</span>
        <div className="ev2EditMapItems">
          <span data-edit-surface="transcript-words">
            <strong>Transcript words</strong>
            <small>Select, seek, or cut</small>
          </span>
          <span data-edit-surface="screen-actions">
            <strong>Screen actions</strong>
            <small>Search and seek</small>
          </span>
          <span data-edit-surface="timeline-inspector">
            <strong>Timeline / inspector</strong>
            <small>Trim, move, and adjust</small>
          </span>
        </div>
        <span className="ev2EditMapNote">Transcript wording is read-only; this view edits timing.</span>
      </section>
      <CleanupReviewPanel
        session={cleanupSession}
        durationFrames={durationFrames}
        fps={fps}
        playheadFrame={playheadFrame}
        onSeek={reviewSeek}
        onPlayingChange={onPlayingChange}
        onSessionChange={commitCleanupSession}
        manualSeekVersion={manualSeekVersion}
        suspendPlayback={joinVerification !== null}
      />
      <ScreenActionLandmarks
        landmarks={visibleLandmarks}
        totalCount={landmarks.length}
        query={landmarkQuery}
        playheadFrame={draftPlayheadFrame}
        onQueryChange={setLandmarkQuery}
        onSeek={requestSeek}
        projection={cleanupDraftProjection}
      />
      <div
        className="ev2TranscriptEditBar"
        aria-live="polite"
        data-natural-join-controls={
          lastManualCut?.naturalJoinPlan && selectedWordCount === 0
            ? 'true'
            : undefined
        }
        data-audio-safety={
          lastManualCut?.naturalJoinPlan && selectedWordCount === 0
            ? lastManualCut.naturalJoinPlan.audioSafety
            : undefined
        }
        data-visual-discontinuity={visualJoinCheck.status}
      >
        {lastManualCut?.naturalJoinPlan && selectedWordCount === 0 ? (
          <>
            <span className="ev2TranscriptJoinSummary">
              <strong>
                {lastManualCut.naturalJoinPlan.audioSafety === 'safe'
                  ? 'Speech-safe boundary'
                  : 'Check speech join'}
              </strong>
              <small>
                {lastManualCut.naturalJoinPlan.audioWarning ??
                  (selectedJoinAlternative === 'silence-safe'
                    ? 'Moved into a nearby pause'
                    : 'Nearby pause available')}
              </small>
              {visualJoinCheck.status === 'checking' ? (
                <small>Checking visual join…</small>
              ) : visualJoinCheck.status === 'ready' ? (
                <small
                  className={
                    visualJoinCheck.warning
                      ? 'ev2TranscriptJoinWarning'
                      : undefined
                  }
                >
                  {visualJoinCheck.warning
                    ? `! Visual jump likely (${Math.round(
                        visualJoinCheck.score * 100,
                      )}%)`
                    : 'Visual join looks stable'}
                </small>
              ) : visualJoinCheck.status === 'unavailable' ? (
                <small>Visual check unavailable</small>
              ) : null}
            </span>
            <button
              type="button"
              aria-pressed={selectedJoinAlternative === 'requested'}
              onClick={() =>
                commitCleanupSession(
                  chooseCleanupJoinAlternative(
                    cleanupSession,
                    lastManualCut.id,
                    'requested',
                  ),
                )
              }
            >
              Exact
            </button>
            <button
              type="button"
              aria-pressed={selectedJoinAlternative === 'silence-safe'}
              disabled={!hasSaferJoinAlternative}
              onClick={() =>
                commitCleanupSession(
                  chooseCleanupJoinAlternative(
                    cleanupSession,
                    lastManualCut.id,
                    'silence-safe',
                  ),
                )
              }
            >
              Safer
            </button>
          </>
        ) : (
          <>
            <span>
              {selectedWordCount > 0
                ? `${selectedWordCount} word${selectedWordCount === 1 ? '' : 's'} selected`
                : 'Select words to cut'}
            </span>
            <button
              type="button"
              disabled={selectedWordCount === 0}
              onClick={cutSelectedWords}
            >
              Cut <kbd>Delete</kbd>
            </button>
          </>
        )}
        <button
          type="button"
          disabled={cleanupSession.history.past.length === 0}
          onClick={() =>
            commitCleanupSession(undoCleanupDecision(cleanupSession))
          }
          aria-label="Undo draft cleanup"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={cleanupSession.history.future.length === 0}
          onClick={() =>
            commitCleanupSession(redoCleanupDecision(cleanupSession))
          }
          aria-label="Redo draft cleanup"
        >
          Redo
        </button>
        {draftChangeCount > 0 ? (
          <button
            type="button"
            className="primary"
            disabled={!canFinalizeDraft}
            onClick={onFinalizeDraft}
            title={finalizeDraftTitle}
            aria-label={`Finalize ${draftChangeCount} draft change${
              draftChangeCount === 1 ? '' : 's'
            }`}
          >
            Finalize <kbd>Ctrl/⌘ ↵</kbd>
          </button>
        ) : null}
        {selectedWordCount > 0 ? (
          <button
            type="button"
            disabled={replacementFrame === null}
            onClick={() => {
              if (replacementFrame !== null) requestSeek(replacementFrame);
            }}
            aria-label="Jump to replacement take"
          >
            Replacement →
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={followPlayback}
          onClick={() => setFollowPlayback((current) => !current)}
        >
          {followPlayback ? 'Following' : 'Resume follow'}
        </button>
      </div>
      <WindowedTranscriptWords
        chunks={wordChunks}
        activeWordIndex={activeEntry?.wordIndex ?? null}
        selection={wordSelection}
        followPlayback={followPlayback}
        session={cleanupSession}
        onFollowPlaybackChange={setFollowPlayback}
        onSelectionChange={setWordSelection}
        onSeek={requestSeek}
      />
    </div>
  );
}

function useLatestFrameSeek(onSeek: (frame: number) => void) {
  const onSeekRef = React.useRef(onSeek);
  onSeekRef.current = onSeek;
  const latency = React.useMemo(
    () => createInteractionLatencyTracker({ budgets: { seek: 50 } }),
    [],
  );
  const coordinator = React.useMemo(
    () =>
      createLatestSeekCoordinator({
        performSeek: (frame, signal) =>
          new Promise<void>((resolve) => {
            const finishLatency = latency.start('seek');
            if (!signal.aborted) onSeekRef.current(frame);
            finishLatency();
            resolve();
          }),
      }),
    [latency],
  );
  React.useEffect(() => () => coordinator.cancel(), [coordinator]);
  return React.useCallback(
    (frame: number) => {
      void coordinator.request(frame);
    },
    [coordinator],
  );
}

function isRemovedByCleanupProjection(
  projection: ReturnType<typeof resolveCleanupDraftProjection>,
  frame: number,
) {
  return projection.removals.some(
    (range) => frame >= range.startFrame && frame < range.endFrame,
  );
}

const TRANSCRIPT_CHUNK_ESTIMATED_HEIGHT = 86;
const TRANSCRIPT_CHUNK_OVERSCAN = 2;

function TranscriptTextEditor({
  document,
  durationFrames,
  value,
  open,
  canSave,
  onOpen,
  onCancel,
  onChange,
  onSave,
}: {
  document: ProjectDocument;
  durationFrames: number;
  value: string;
  open: boolean;
  canSave: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: (document: ProjectDocument) => void;
}) {
  const originalWordCount = document.transcript?.words.length ?? 0;
  const nextWordCount = tokenizeTranscript(value).length;

  return (
    <section className="ev2TranscriptTextEditor" aria-label="Transcript text editing">
      <div className="ev2TranscriptTextEditorHeader">
        <div>
          <strong>Edit transcript text</strong>
          <span>{originalWordCount > 0 ? 'Change the words without changing the cut.' : 'Add text to create a transcript.'}</span>
        </div>
        {!open ? (
          <button type="button" onClick={onOpen} disabled={!canSave}>
            {originalWordCount > 0 ? 'Edit text' : 'Add transcript text'}
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <textarea
            autoFocus
            value={value}
            rows={5}
            aria-label="Transcript text editor"
            placeholder="Type or paste the spoken words…"
            onChange={(event) => onChange(event.currentTarget.value)}
          />
          <div className="ev2TranscriptTextEditorFooter">
            <span>
              {nextWordCount === originalWordCount
                ? 'Existing word timing will be preserved.'
                : 'Changing the word count redistributes timing across the transcript.'}
            </span>
            <div>
              <button type="button" onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={value.trim().length === 0}
                onClick={() => onSave(updateTranscriptText(document, value, durationFrames))}
              >
                Save transcript
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function transcriptText(document: ProjectDocument) {
  const paragraphs = document.transcript?.paragraphs ?? [];
  if (paragraphs.length > 0) return paragraphs.map((paragraph) => paragraph.text).join('\n');
  return (document.transcript?.words ?? []).map((word) => word.word).join(' ');
}

function tokenizeTranscript(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function updateTranscriptText(
  document: ProjectDocument,
  value: string,
  durationFrames: number,
): ProjectDocument {
  const tokens = tokenizeTranscript(value);
  const previousWords = document.transcript?.words ?? [];
  const firstFrame = previousWords[0]?.startFrame ?? 0;
  const lastFrame = previousWords.at(-1)?.endFrame ?? Math.max(firstFrame + 1, durationFrames);
  const span = Math.max(1, lastFrame - firstFrame);
  const preserveTiming = tokens.length === previousWords.length;
  const words = tokens.map((word, index) => {
    const previous = preserveTiming ? previousWords[index] : undefined;
    const startFrame = previous?.startFrame ?? Math.round(firstFrame + (span * index) / Math.max(1, tokens.length));
    const endFrame = previous?.endFrame ?? Math.max(startFrame + 1, Math.round(firstFrame + (span * (index + 1)) / Math.max(1, tokens.length)));
    return {
      word,
      startFrame,
      endFrame,
      confidence: previous?.confidence ?? 0.5,
    };
  });
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let wordOffset = 0;
  const paragraphs = lines.map((line, index) => {
    const lineWordCount = tokenizeTranscript(line).length;
    const lineWords = words.slice(wordOffset, wordOffset + lineWordCount);
    wordOffset += lineWordCount;
    return {
      text: line,
      startFrame: lineWords[0]?.startFrame ?? Math.round(firstFrame + (span * index) / Math.max(1, lines.length)),
      endFrame: lineWords.at(-1)?.endFrame ?? Math.max(firstFrame + 1, Math.round(firstFrame + (span * (index + 1)) / Math.max(1, lines.length))),
    };
  });
  return {
    ...document,
    transcript: {
      words,
      paragraphs,
      nonSpeech: document.transcript?.nonSpeech ?? [],
    },
  };
}

function WindowedTranscriptWords({
  chunks,
  activeWordIndex,
  selection,
  followPlayback,
  session,
  onFollowPlaybackChange,
  onSelectionChange,
  onSeek,
}: {
  chunks: readonly (readonly TranscriptTimelineWordEntry[])[];
  activeWordIndex: number | null;
  selection: { anchor: number; focus: number } | null;
  followPlayback: boolean;
  session: CleanupSession;
  onFollowPlaybackChange: (follow: boolean) => void;
  onSelectionChange: (
    selection: { anchor: number; focus: number } | null,
  ) => void;
  onSeek: (frame: number) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  const scrollFrame = React.useRef<number | null>(null);
  const selecting = React.useRef(false);
  const selectionAnchor = React.useRef<number | null>(null);
  const [focusedWordIndex, setFocusedWordIndex] = React.useState<number | null>(null);
  const [viewport, setViewport] = React.useState({ top: 0, height: 320 });
  const [measuredHeights, setMeasuredHeights] = React.useState<
    Readonly<Record<number, number>>
  >({});
  const offsets = React.useMemo(() => {
    const values = [0];
    for (let index = 0; index < chunks.length; index += 1) {
      values.push(
        values[index]! +
          (measuredHeights[index] ?? TRANSCRIPT_CHUNK_ESTIMATED_HEIGHT),
      );
    }
    return values;
  }, [chunks.length, measuredHeights]);
  const activeChunkIndex =
    activeWordIndex === null ? null : Math.floor(activeWordIndex / 120);
  const visibleStart = chunkIndexAtOffset(offsets, viewport.top);
  const visibleEnd = chunkIndexAtOffset(
    offsets,
    viewport.top + viewport.height,
  );
  const mountedChunkIndices = React.useMemo(() => {
    const indices = new Set<number>();
    for (
      let index = Math.max(0, visibleStart - TRANSCRIPT_CHUNK_OVERSCAN);
      index <=
      Math.min(chunks.length - 1, visibleEnd + TRANSCRIPT_CHUNK_OVERSCAN);
      index += 1
    ) {
      indices.add(index);
    }
    if (activeChunkIndex !== null) {
      indices.add(activeChunkIndex);
      if (activeChunkIndex > 0) indices.add(activeChunkIndex - 1);
      if (activeChunkIndex + 1 < chunks.length) indices.add(activeChunkIndex + 1);
    }
    if (focusedWordIndex !== null) {
      indices.add(Math.floor(focusedWordIndex / 120));
    }
    return [...indices].sort((left, right) => left - right);
  }, [
    activeChunkIndex,
    chunks.length,
    focusedWordIndex,
    visibleEnd,
    visibleStart,
  ]);

  const updateViewport = React.useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    setViewport({ top: element.scrollTop, height: element.clientHeight });
  }, []);

  React.useLayoutEffect(() => {
    updateViewport();
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, [updateViewport]);

  React.useEffect(
    () => () => {
      if (scrollFrame.current !== null) {
        window.cancelAnimationFrame(scrollFrame.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    const stopSelecting = () => {
      selecting.current = false;
    };
    window.addEventListener('pointerup', stopSelecting);
    window.addEventListener('pointercancel', stopSelecting);
    return () => {
      window.removeEventListener('pointerup', stopSelecting);
      window.removeEventListener('pointercancel', stopSelecting);
    };
  }, []);

  React.useLayoutEffect(() => {
    if (followPlayback) {
      activeRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeWordIndex, followPlayback]);

  React.useLayoutEffect(() => {
    if (focusedWordIndex === null) return;
    containerRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-word-index="${focusedWordIndex}"]`,
      )
      ?.focus({ preventScroll: true });
  }, [focusedWordIndex]);

  const moveKeyboardFocus = React.useCallback(
    (wordIndex: number, direction: -1 | 1, extendSelection: boolean) => {
      const nextWordIndex = nextSelectableWordIndex(chunks, wordIndex, direction);
      if (nextWordIndex === null) return;
      setFocusedWordIndex(nextWordIndex);
      onFollowPlaybackChange(false);
      if (extendSelection) {
        onSelectionChange({
          anchor:
            selection &&
            wordIndex >= Math.min(selection.anchor, selection.focus) &&
            wordIndex <= Math.max(selection.anchor, selection.focus)
              ? selection.anchor
              : wordIndex,
          focus: nextWordIndex,
        });
      } else {
        onSelectionChange(null);
      }
    },
    [chunks, onFollowPlaybackChange, onSelectionChange, selection],
  );

  const recordHeight = React.useCallback((index: number, height: number) => {
    setMeasuredHeights((current) =>
      Math.abs((current[index] ?? 0) - height) < 1
        ? current
        : { ...current, [index]: height },
    );
  }, []);

  return (
    <div
      ref={containerRef}
      className="ev2TranscriptWords"
      aria-label="Recording transcript"
      onWheel={() => onFollowPlaybackChange(false)}
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) {
          onFollowPlaybackChange(false);
        }
      }}
      onKeyDown={(event) => {
        if (['PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) {
          onFollowPlaybackChange(false);
        }
      }}
      onScroll={() => {
        if (scrollFrame.current !== null) return;
        scrollFrame.current = window.requestAnimationFrame(() => {
          scrollFrame.current = null;
          updateViewport();
        });
      }}
    >
      <div
        className="ev2TranscriptWindow"
        style={{ height: offsets[offsets.length - 1] ?? 0 }}
      >
        {mountedChunkIndices.map((chunkIndex) => (
          <MeasuredTranscriptChunk
            key={chunkIndex}
            chunkIndex={chunkIndex}
            entries={chunks[chunkIndex] ?? []}
            top={offsets[chunkIndex] ?? 0}
            activeWordIndex={activeWordIndex}
            activeRef={activeRef}
            selection={selection}
            selecting={selecting}
            selectionAnchor={selectionAnchor}
            session={session}
            onSelectionChange={onSelectionChange}
            onFocusedWordChange={setFocusedWordIndex}
            onMoveKeyboardFocus={moveKeyboardFocus}
            onHeight={recordHeight}
            onSeek={onSeek}
          />
        ))}
      </div>
    </div>
  );
}

function MeasuredTranscriptChunk({
  chunkIndex,
  entries,
  top,
  activeWordIndex,
  activeRef,
  selection,
  selecting,
  selectionAnchor,
  session,
  onSelectionChange,
  onFocusedWordChange,
  onMoveKeyboardFocus,
  onHeight,
  onSeek,
}: {
  chunkIndex: number;
  entries: readonly TranscriptTimelineWordEntry[];
  top: number;
  activeWordIndex: number | null;
  activeRef: React.MutableRefObject<HTMLButtonElement | null>;
  selection: { anchor: number; focus: number } | null;
  selecting: React.MutableRefObject<boolean>;
  selectionAnchor: React.MutableRefObject<number | null>;
  session: CleanupSession;
  onSelectionChange: (
    selection: { anchor: number; focus: number } | null,
  ) => void;
  onFocusedWordChange: (wordIndex: number) => void;
  onMoveKeyboardFocus: (
    wordIndex: number,
    direction: -1 | 1,
    extendSelection: boolean,
  ) => void;
  onHeight: (index: number, height: number) => void;
  onSeek: (frame: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => onHeight(chunkIndex, element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [chunkIndex, onHeight]);

  return (
    <div ref={ref} className="ev2TranscriptChunk" style={{ top }}>
      {entries.map((entry) => {
        const { word, wordIndex, firstTimelineFrame } = entry;
        const active = wordIndex === activeWordIndex;
        const selected =
          selection !== null &&
          wordIndex >= Math.min(selection.anchor, selection.focus) &&
          wordIndex <= Math.max(selection.anchor, selection.focus);
        const suggestionState = suggestionStateForEntry(session, entry);
        return (
          <button
            key={wordKey(word, wordIndex)}
            ref={active ? activeRef : null}
            type="button"
            className="ev2TranscriptWord"
            aria-current={active ? 'true' : undefined}
            aria-pressed={selected}
            aria-label={
              firstTimelineFrame === null
                ? `${word.word}, removed from timeline`
                : `Seek to ${word.word}`
            }
            title={
              firstTimelineFrame === null
                ? undefined
                : 'Enter seeks · Space selects · Shift+Arrow extends'
            }
            disabled={firstTimelineFrame === null}
            data-removed={firstTimelineFrame === null ? 'true' : undefined}
            data-word-index={wordIndex}
            data-timeline-frame={firstTimelineFrame ?? undefined}
            data-suggestion-state={suggestionState ?? undefined}
            onFocus={() => onFocusedWordChange(wordIndex)}
            onKeyDown={(event) => {
              if (
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                event.preventDefault();
                onMoveKeyboardFocus(
                  wordIndex,
                  event.key === 'ArrowLeft' ? -1 : 1,
                  event.shiftKey,
                );
                return;
              }
              if (event.key === ' ') {
                event.preventDefault();
                onSelectionChange({ anchor: wordIndex, focus: wordIndex });
                return;
              }
              if (event.key === 'Enter' && firstTimelineFrame !== null) {
                event.preventDefault();
                onSeek(firstTimelineFrame);
              }
            }}
            onPointerDown={(event) => {
              if (firstTimelineFrame === null) return;
              selecting.current = true;
              selectionAnchor.current =
                event.shiftKey && selection ? selection.anchor : wordIndex;
              onSelectionChange({
                anchor: selectionAnchor.current,
                focus: wordIndex,
              });
              event.currentTarget.focus({ preventScroll: true });
            }}
            onPointerEnter={() => {
              if (
                selecting.current &&
                selectionAnchor.current !== null &&
                firstTimelineFrame !== null
              ) {
                onSelectionChange({
                  anchor: selectionAnchor.current,
                  focus: wordIndex,
                });
              }
            }}
            onPointerUp={() => {
              selecting.current = false;
            }}
            onPointerCancel={() => {
              selecting.current = false;
            }}
            onClick={() => {
              if (firstTimelineFrame !== null) onSeek(firstTimelineFrame);
            }}
          >
            {word.word}
          </button>
        );
      })}
    </div>
  );
}

function suggestionStateForEntry(
  session: CleanupSession,
  entry: TranscriptTimelineWordEntry,
): string | null {
  const suggestion = suggestionForEntry(session, entry);
  if (!suggestion) return null;
  const status =
    session.decisions.find(
      (decision) => decision.suggestionId === suggestion.id,
    )?.status ?? 'pending';
  return `${suggestion.kind}-${status}`;
}

function suggestionForEntry(
  session: CleanupSession,
  entry: TranscriptTimelineWordEntry | null,
): CleanupSession['suggestions'][number] | null {
  if (!entry) return null;
  for (const suggestion of session.suggestions) {
    if (suggestion.kind === 'manual') continue;
    const overlaps = suggestion.timelineRanges.some((suggestionRange) =>
      entry.timelineRanges.some(
        (wordRange) =>
          suggestionRange.startFrame < wordRange.endFrame &&
          suggestionRange.endFrame > wordRange.startFrame,
      ),
    );
    if (overlaps) return suggestion;
  }
  return null;
}

function nextSelectableWordIndex(
  chunks: readonly (readonly TranscriptTimelineWordEntry[])[],
  wordIndex: number,
  direction: -1 | 1,
): number | null {
  const words = chunks.flat();
  for (
    let nextIndex = wordIndex + direction;
    nextIndex >= 0 && nextIndex < words.length;
    nextIndex += direction
  ) {
    if (words[nextIndex]?.firstTimelineFrame !== null) return nextIndex;
  }
  return null;
}

function sameTimelineRanges(
  left: readonly {
    startFrame: number;
    endFrame: number;
    sourceId: string;
    clipId: string;
  }[],
  right: readonly {
    startFrame: number;
    endFrame: number;
    sourceId: string;
    clipId: string;
  }[],
) {
  return (
    left.length === right.length &&
    left.every(
      (range, index) =>
        range.startFrame === right[index]?.startFrame &&
        range.endFrame === right[index]?.endFrame &&
        range.sourceId === right[index]?.sourceId &&
        range.clipId === right[index]?.clipId,
    )
  );
}

function chunkIndexAtOffset(offsets: readonly number[], offset: number): number {
  if (offsets.length <= 1) return 0;
  let low = 0;
  let high = offsets.length - 2;
  let result = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1]! <= offset) {
      result = Math.min(offsets.length - 2, middle + 1);
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function ScreenActionLandmarks({
  landmarks,
  totalCount,
  query,
  playheadFrame,
  onQueryChange,
  onSeek,
  projection,
}: {
  landmarks: readonly ScreenActionLandmark[];
  totalCount: number;
  query: string;
  playheadFrame: number;
  onQueryChange: (query: string) => void;
  onSeek: (frame: number) => void;
  projection: ReturnType<typeof resolveCleanupDraftProjection>;
}) {
  return (
    <section className="ev2Landmarks" aria-label="Screen actions">
      <label className="ev2LandmarkSearch">
        <span>
          Actions <small>{totalCount}</small>
        </span>
        <input
          type="search"
          value={query}
          placeholder="Search"
          aria-label="Search screen actions"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className="ev2LandmarkList">
        {landmarks.length === 0 ? (
          <span className="ev2LandmarkEmpty">
            {query ? 'No matching actions' : 'No detected actions'}
          </span>
        ) : (
          landmarks.map((landmark) => {
            const frame = timelineFrameForScreenActionLandmark(landmark);
            const draftFrame =
              frame === null ||
              isRemovedByCleanupProjection(projection, frame)
                ? null
                : draftTimelineFrame(projection, frame);
            const evidenceSources = landmark.evidence
              .map((evidence) => evidenceSourceLabel(evidence.source))
              .filter((source, index, sources) => sources.indexOf(source) === index)
              .join('+');
            const active = landmark.timelineRanges.some(
              (range) =>
                playheadFrame >= draftTimelineFrame(projection, range.startFrame) &&
                playheadFrame < draftTimelineFrame(projection, range.endFrame),
            );
            return (
              <button
                key={landmark.id}
                type="button"
                className="ev2Landmark"
                aria-current={active ? 'true' : undefined}
                aria-label={`Seek to ${landmark.label}. ${Math.round(
                  landmark.confidence * 100,
                )}% confidence. Evidence: ${evidenceSources}`}
                data-timeline-frame={draftFrame ?? undefined}
                title={landmark.evidence.map((evidence) => evidence.detail).join(' · ')}
                disabled={draftFrame === null}
                onClick={() => {
                  if (draftFrame !== null) onSeek(draftFrame);
                }}
              >
                <span className="ev2LandmarkKind">{landmarkKindLabel(landmark)}</span>
                <span className="ev2LandmarkLabel">{landmark.label}</span>
                <span className="ev2LandmarkEvidence">{evidenceSources}</span>
                <span className="ev2LandmarkConfidence">
                  {Math.round(landmark.confidence * 100)}%
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function wordKey(word: TranscriptWord, index: number) {
  return `${word.startFrame}:${word.endFrame}:${index}`;
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function formatTranscriptTime(frame: number, fps: number) {
  const seconds = Math.max(0, Math.round(frame)) / Math.max(1, fps);
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function landmarkKindLabel(landmark: ScreenActionLandmark) {
  if (landmark.kind === 'command') return 'CMD';
  if (landmark.kind === 'error') return 'ERR';
  if (landmark.kind === 'wait') return 'WAIT';
  if (landmark.kind === 'file-change') return 'FILE';
  if (landmark.kind === 'application-change') return 'APP';
  return 'VIEW';
}

function evidenceSourceLabel(source: ScreenActionLandmark['evidence'][number]['source']) {
  if (source === 'transcript') return 'VOICE';
  if (source === 'non-speech') return 'AUDIO';
  return 'CLICK';
}

function documentGlobal(): Document {
  return window.document;
}
