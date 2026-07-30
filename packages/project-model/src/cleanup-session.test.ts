import { describe, expect, it } from 'vitest';
import type { ProjectDocument } from './types.js';
import {
  cancelCleanupSession,
  addManualCleanupCut,
  cleanupSuggestionsFromAnalysis,
  cleanupSessionSnapshot,
  chooseCleanupJoinAlternative,
  clearCleanupSessionSnapshot,
  createCleanupSession,
  decideCleanupSuggestion,
  draftTimelineDuration,
  draftTimelineFrame,
  loadCleanupSessionSnapshot,
  persistCleanupSessionSnapshot,
  redoCleanupDecision,
  resolveCleanupDraftProjection,
  restoreCleanupSuggestion,
  timelineFrameForDraftFrame,
  undoCleanupDecision,
  type CleanupSuggestion,
} from './cleanup-session.js';

const suggestions: readonly CleanupSuggestion[] = [
  {
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
  },
  {
    id: 'cleanup:wait:one',
    sourceId: 'wait:one',
    kind: 'wait',
    proposedAction: 'compress',
    timelineRanges: [
      {
        startFrame: 220,
        endFrame: 400,
        sourceId: 'screen',
        clipId: 'clip',
      },
    ],
    targetDurationFrames: 90,
    confidence: 0.88,
    reason: 'progress remains visible',
    keptByDefault: false,
  },
];

function project(): ProjectDocument {
  return {
    assets: [
      {
        id: 'recording',
        type: 'recording',
        metadata: { cursorEvents: [] },
      },
    ],
  } as unknown as ProjectDocument;
}

describe('cleanup session', () => {
  it('adds, undoes, redoes, and reopens a manual transcript cut', () => {
    const base = decideCleanupSuggestion(
      createCleanupSession(suggestions),
      suggestions[0]!.id,
      'accepted',
    );
    const cut = addManualCleanupCut(
      base,
      [
        {
          startFrame: 20,
          endFrame: 40,
          sourceId: 'screen',
          clipId: 'clip',
        },
      ],
      'manual:0:2:20:40',
    );

    expect(resolveCleanupDraftProjection(cut).removals).toContainEqual(
      expect.objectContaining({ startFrame: 20, endFrame: 40 }),
    );
    expect(resolveCleanupDraftProjection(undoCleanupDecision(cut)).removals).toEqual([
      expect.objectContaining({ startFrame: 100, endFrame: 160 }),
    ]);
    expect(
      resolveCleanupDraftProjection(redoCleanupDecision(undoCleanupDecision(cut)))
        .removals,
    ).toContainEqual(expect.objectContaining({ startFrame: 20, endFrame: 40 }));

    const reopened = createCleanupSession(
      suggestions,
      cleanupSessionSnapshot(cut),
    );
    expect(reopened.suggestions).toContainEqual(
      expect.objectContaining({ id: 'manual:0:2:20:40', kind: 'manual' }),
    );
    expect(resolveCleanupDraftProjection(reopened)).toEqual(
      resolveCleanupDraftProjection(cut),
    );
    expect(resolveCleanupDraftProjection(undoCleanupDecision(reopened)).removals).toEqual([
      expect.objectContaining({ startFrame: 100, endFrame: 160 }),
    ]);
  });

  it('drops saved manual cuts when the transcript or timeline context changes', () => {
    const original = addManualCleanupCut(
      createCleanupSession(suggestions, null, 'context:one'),
      [
        {
          startFrame: 20,
          endFrame: 40,
          sourceId: 'screen',
          clipId: 'clip',
        },
      ],
      'manual:0:2:20:40',
    );

    const reopened = createCleanupSession(
      suggestions,
      cleanupSessionSnapshot(original),
      'context:two',
    );

    expect(reopened.analysisChanged).toBe(true);
    expect(reopened.suggestions.some((suggestion) => suggestion.kind === 'manual')).toBe(
      false,
    );
    expect(resolveCleanupDraftProjection(reopened).removals).toEqual([]);
  });

  it('keeps exact and silence-safe join boundaries reversible in the draft', () => {
    const requested = [
      {
        startFrame: 20,
        endFrame: 40,
        sourceId: 'screen',
        clipId: 'clip',
      },
    ];
    const refined = [{ ...requested[0]!, startFrame: 18, endFrame: 43 }];
    const cut = addManualCleanupCut(
      createCleanupSession(suggestions),
      refined,
      'manual:natural-join',
      {
        requestedRanges: requested,
        refinedRanges: refined,
        audioSafety: 'safe',
        audioWarning: null,
        crossfadeFrames: 2,
        alternatives: [
          { id: 'requested', label: 'Exact word boundary', ranges: requested },
          { id: 'silence-safe', label: 'Nearby safer boundary', ranges: refined },
        ],
      },
    );

    const exact = chooseCleanupJoinAlternative(
      cut,
      'manual:natural-join',
      'requested',
    );
    expect(resolveCleanupDraftProjection(exact).removals).toContainEqual(
      expect.objectContaining({ startFrame: 20, endFrame: 40 }),
    );
    expect(resolveCleanupDraftProjection(undoCleanupDecision(exact)).removals).toContainEqual(
      expect.objectContaining({ startFrame: 18, endFrame: 43 }),
    );
    expect(
      chooseCleanupJoinAlternative(
        exact,
        'manual:natural-join',
        'requested',
      ),
    ).toBe(exact);
  });

  it('keeps speed-compressed waits preview-only until media playback supports them', () => {
    const [suggestion] = cleanupSuggestionsFromAnalysis([], [
      {
        id: 'wait:progress',
        disposition: 'recommend',
        action: 'compress',
        sourceStartFrame: 220,
        sourceEndFrame: 400,
        timelineRanges: suggestions[1]!.timelineRanges,
        targetDurationFrames: 90,
        audioTreatment: 'soften',
        reason: 'progress remains visible',
        confidence: 0.88,
        activityEvidence: [],
        preview: { before: [], treatment: [], after: [] },
      },
    ]);

    expect(suggestion).toMatchObject({
      proposedAction: 'compress',
      keptByDefault: true,
    });
    expect(() =>
      decideCleanupSuggestion(
        createCleanupSession([suggestion!]),
        suggestion!.id,
        'accepted',
      ),
    ).toThrow(/kept-by-default/i);
  });

  it('updates draft projection immediately without mutating the base project', () => {
    const document = project();
    const session = decideCleanupSuggestion(
      createCleanupSession(suggestions),
      suggestions[0]!.id,
      'accepted',
    );
    const projection = resolveCleanupDraftProjection(session);

    expect(projection.removals).toEqual([
      { suggestionId: suggestions[0]!.id, startFrame: 100, endFrame: 160 },
    ]);
    expect(draftTimelineDuration(projection, 500)).toBe(440);
    expect(document.assets[0]?.metadata).toEqual({ cursorEvents: [] });
  });

  it('supports reject, adjusted boundaries, restore, undo, and redo', () => {
    let session = createCleanupSession(suggestions);
    session = decideCleanupSuggestion(session, suggestions[0]!.id, 'rejected');
    session = decideCleanupSuggestion(session, suggestions[1]!.id, 'adjusted', [
      {
        startFrame: 240,
        endFrame: 360,
        sourceId: 'screen',
        clipId: 'clip',
      },
    ]);
    expect(resolveCleanupDraftProjection(session).compressions[0]).toMatchObject({
      startFrame: 240,
      endFrame: 360,
      targetDurationFrames: 90,
    });

    session = restoreCleanupSuggestion(session, suggestions[1]!.id);
    expect(resolveCleanupDraftProjection(session).compressions).toEqual([]);
    session = undoCleanupDecision(session);
    expect(resolveCleanupDraftProjection(session).compressions).toHaveLength(1);
    session = redoCleanupDecision(session);
    expect(resolveCleanupDraftProjection(session).compressions).toEqual([]);
  });

  it('cancels back to the exact empty draft projection', () => {
    const accepted = decideCleanupSuggestion(
      createCleanupSession(suggestions),
      suggestions[0]!.id,
      'accepted',
    );
    const canceled = cancelCleanupSession(accepted);

    expect(resolveCleanupDraftProjection(canceled)).toEqual({
      removals: [],
      compressions: [],
    });
    expect(canceled.history).toEqual({ past: [], future: [] });
  });

  it('persists and reconstructs unfinished decisions through recording metadata', () => {
    const session = decideCleanupSuggestion(
      createCleanupSession(suggestions),
      suggestions[0]!.id,
      'accepted',
    );
    const savedDocument = persistCleanupSessionSnapshot(
      project(),
      'recording',
      cleanupSessionSnapshot(session),
    );
    const loaded = loadCleanupSessionSnapshot(savedDocument, 'recording');
    const reopened = createCleanupSession(suggestions, loaded);

    expect(reopened.decisions).toEqual(session.decisions);
    expect(resolveCleanupDraftProjection(reopened)).toEqual(
      resolveCleanupDraftProjection(session),
    );
    expect(
      loadCleanupSessionSnapshot(
        clearCleanupSessionSnapshot(savedDocument, 'recording'),
        'recording',
      ),
    ).toBeNull();
  });

  it('drops stale decisions and flags changed analysis after reopen', () => {
    const original = decideCleanupSuggestion(
      createCleanupSession(suggestions),
      suggestions[0]!.id,
      'accepted',
    );
    const changed = [
      ...suggestions,
      {
        ...suggestions[0]!,
        id: 'cleanup:retry:new',
        sourceId: 'retry:new',
      },
    ];
    const reopened = createCleanupSession(changed, cleanupSessionSnapshot(original));

    expect(reopened.analysisChanged).toBe(true);
    expect(reopened.decisions[0]?.status).toBe('pending');
    expect(reopened.decisions[2]?.status).toBe('pending');
  });

  it('flags a changed compression target even when its id and range are unchanged', () => {
    const original = decideCleanupSuggestion(
      createCleanupSession(suggestions),
      suggestions[1]!.id,
      'accepted',
    );
    const changed = [
      suggestions[0]!,
      { ...suggestions[1]!, targetDurationFrames: 60 },
    ];
    const reopened = createCleanupSession(changed, cleanupSessionSnapshot(original));

    expect(reopened.analysisChanged).toBe(true);
    expect(reopened.decisions[1]?.status).toBe('pending');
    expect(resolveCleanupDraftProjection(reopened).compressions).toEqual([]);
  });

  it('maps source timeline frames through accepted removals and compression', () => {
    let session = createCleanupSession(suggestions);
    session = decideCleanupSuggestion(session, suggestions[0]!.id, 'accepted');
    session = decideCleanupSuggestion(session, suggestions[1]!.id, 'accepted');
    const projection = resolveCleanupDraftProjection(session);

    expect(draftTimelineFrame(projection, 130)).toBe(100);
    expect(draftTimelineFrame(projection, 190)).toBe(130);
    expect(draftTimelineFrame(projection, 310)).toBe(205);
    expect(draftTimelineFrame(projection, 500)).toBe(350);
    expect(timelineFrameForDraftFrame(projection, 100, 500)).toBe(160);
    expect(timelineFrameForDraftFrame(projection, 205, 500)).toBe(310);
    expect(timelineFrameForDraftFrame(projection, 350, 500)).toBe(500);
  });

  it('maps a removal correctly when an earlier compression already shortened time', () => {
    const reordered: readonly CleanupSuggestion[] = [
      {
        ...suggestions[1]!,
        timelineRanges: [
          {
            startFrame: 40,
            endFrame: 100,
            sourceId: 'screen',
            clipId: 'clip',
          },
        ],
        targetDurationFrames: 30,
      },
      {
        ...suggestions[0]!,
        timelineRanges: [
          {
            startFrame: 160,
            endFrame: 220,
            sourceId: 'screen',
            clipId: 'clip',
          },
        ],
      },
    ];
    let session = createCleanupSession(reordered);
    session = decideCleanupSuggestion(session, reordered[0]!.id, 'accepted');
    session = decideCleanupSuggestion(session, reordered[1]!.id, 'accepted');
    const projection = resolveCleanupDraftProjection(session);

    expect(draftTimelineFrame(projection, 190)).toBe(130);
    expect(draftTimelineFrame(projection, 260)).toBe(170);
  });
});
