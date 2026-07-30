import type { Frame, ProjectDocument } from './types.js';
import type { RetryReplacementSuggestion } from './retry-suggestions.js';
import type {
  WaitTreatmentSuggestion,
  WaitTreatmentAction,
} from './wait-treatment-suggestions.js';
import type { TranscriptTimelineRange } from './transcript-timeline.js';
import type { NaturalJoinPlan } from './natural-join.js';

export type CleanupSuggestionKind = 'retry' | 'wait' | 'manual';
export type CleanupDecisionStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'adjusted'
  | 'restored';

export interface CleanupSuggestion {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: CleanupSuggestionKind;
  readonly proposedAction: WaitTreatmentAction;
  readonly timelineRanges: readonly TranscriptTimelineRange[];
  readonly replacementRanges?: readonly TranscriptTimelineRange[];
  readonly targetDurationFrames: Frame;
  readonly confidence: number;
  readonly reason: string;
  readonly keptByDefault: boolean;
  readonly naturalJoinPlan?: NaturalJoinPlan;
}

export interface CleanupDecision {
  readonly suggestionId: string;
  readonly status: CleanupDecisionStatus;
  readonly adjustedRanges?: readonly TranscriptTimelineRange[];
}

export interface CleanupSessionSnapshot {
  readonly version: 1;
  readonly analysisSignature: string;
  readonly decisions: readonly CleanupDecision[];
  readonly manualSuggestions?: readonly CleanupSuggestion[];
  readonly history?: CleanupSession['history'];
}

export interface CleanupSession {
  readonly suggestions: readonly CleanupSuggestion[];
  readonly decisions: readonly CleanupDecision[];
  readonly history: {
    readonly past: readonly (readonly CleanupDecision[])[];
    readonly future: readonly (readonly CleanupDecision[])[];
  };
  readonly analysisSignature: string;
  readonly analysisChanged: boolean;
}

export interface CleanupDraftRemoval {
  readonly suggestionId: string;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
}

export interface CleanupDraftCompression {
  readonly suggestionId: string;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly targetDurationFrames: Frame;
}

export interface CleanupDraftProjection {
  readonly removals: readonly CleanupDraftRemoval[];
  readonly compressions: readonly CleanupDraftCompression[];
}

const CLEANUP_DRAFT_METADATA_KEY = 'smartCleanupDraft';

export function cleanupSuggestionsFromAnalysis(
  retrySuggestions: readonly RetryReplacementSuggestion[],
  waitSuggestions: readonly WaitTreatmentSuggestion[],
): readonly CleanupSuggestion[] {
  return [
    ...retrySuggestions.map(
      (suggestion): CleanupSuggestion => ({
        id: `cleanup:${suggestion.id}`,
        sourceId: suggestion.id,
        kind: 'retry',
        proposedAction: 'remove',
        timelineRanges: suggestion.remove.timelineRanges,
        replacementRanges: suggestion.replacement.timelineRanges,
        targetDurationFrames: 0,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        keptByDefault: suggestion.disposition === 'keep-flagged',
      }),
    ),
    ...waitSuggestions.map(
      (suggestion): CleanupSuggestion => ({
        id: `cleanup:${suggestion.id}`,
        sourceId: suggestion.id,
        kind: 'wait',
        proposedAction: suggestion.action,
        timelineRanges: suggestion.timelineRanges,
        targetDurationFrames: suggestion.targetDurationFrames,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        keptByDefault:
          suggestion.disposition === 'keep-flagged' ||
          suggestion.action === 'compress',
      }),
    ),
  ].sort(
    (left, right) =>
      (left.timelineRanges[0]?.startFrame ?? 0) -
        (right.timelineRanges[0]?.startFrame ?? 0) ||
      left.id.localeCompare(right.id),
  );
}

export function createCleanupSession(
  suggestions: readonly CleanupSuggestion[],
  snapshot?: CleanupSessionSnapshot | null,
  contextSignature?: string,
): CleanupSession {
  const analysisSignature = contextSignature ?? cleanupAnalysisSignature(suggestions);
  const analysisChanged = Boolean(
    snapshot && snapshot.analysisSignature !== analysisSignature,
  );
  const manualSuggestions = analysisChanged ? [] : snapshot?.manualSuggestions ?? [];
  const allSuggestions = [...suggestions, ...manualSuggestions].sort(
    (left, right) =>
      (left.timelineRanges[0]?.startFrame ?? 0) -
        (right.timelineRanges[0]?.startFrame ?? 0) ||
      left.id.localeCompare(right.id),
  );
  const persisted = new Map(
    (analysisChanged ? [] : snapshot?.decisions ?? []).map((decision) => [
      decision.suggestionId,
      decision,
    ]),
  );
  const decisions = allSuggestions.map((suggestion) => {
    const decision = persisted.get(suggestion.id);
    return decision && validDecisionForSuggestion(decision, suggestion)
      ? decision
      : { suggestionId: suggestion.id, status: 'pending' as const };
  });
  return {
    suggestions: allSuggestions,
    decisions,
    history: analysisChanged
      ? { past: [], future: [] }
      : validHistoryForSuggestions(snapshot?.history, allSuggestions) ?? {
          past: [],
          future: [],
        },
    analysisSignature,
    analysisChanged,
  };
}

export function addManualCleanupCut(
  session: CleanupSession,
  timelineRanges: readonly TranscriptTimelineRange[],
  suggestionId: string,
  naturalJoinPlan?: NaturalJoinPlan,
): CleanupSession {
  if (!suggestionId.trim()) {
    throw new Error('Manual cleanup cuts require a stable suggestion id');
  }
  if (!validAdjustedRanges(timelineRanges)) {
    throw new Error('Manual cleanup cuts require positive timeline ranges');
  }
  if (session.suggestions.some((suggestion) => suggestion.id === suggestionId)) {
    return session;
  }
  const suggestion: CleanupSuggestion = {
    id: suggestionId,
    sourceId: suggestionId,
    kind: 'manual',
    proposedAction: 'remove',
    timelineRanges,
    targetDurationFrames: 0,
    confidence: 1,
    reason: 'Manual transcript cut',
    keptByDefault: false,
    ...(naturalJoinPlan ? { naturalJoinPlan } : {}),
  };
  const restored: CleanupDecision = {
    suggestionId,
    status: 'restored',
  };
  const accepted: CleanupDecision = {
    suggestionId,
    status: 'accepted',
  };
  const previousDecisions = [...session.decisions, restored];
  return {
    ...session,
    suggestions: [...session.suggestions, suggestion].sort(
      (left, right) =>
        (left.timelineRanges[0]?.startFrame ?? 0) -
          (right.timelineRanges[0]?.startFrame ?? 0) ||
        left.id.localeCompare(right.id),
    ),
    decisions: [...session.decisions, accepted],
    history: {
      past: [
        ...session.history.past.map((decisions) => [...decisions, restored]),
        previousDecisions,
      ],
      future: [],
    },
  };
}

export function chooseCleanupJoinAlternative(
  session: CleanupSession,
  suggestionId: string,
  alternativeId: NaturalJoinPlan['alternatives'][number]['id'],
): CleanupSession {
  const suggestion = session.suggestions.find(
    (candidate) => candidate.id === suggestionId,
  );
  const alternative = suggestion?.naturalJoinPlan?.alternatives.find(
    (candidate) => candidate.id === alternativeId,
  );
  if (!suggestion || !alternative) {
    throw new Error(`Cleanup join alternative not found: ${suggestionId}/${alternativeId}`);
  }
  return decideCleanupSuggestion(
    session,
    suggestionId,
    'adjusted',
    alternative.ranges,
  );
}

export function decideCleanupSuggestion(
  session: CleanupSession,
  suggestionId: string,
  status: Exclude<CleanupDecisionStatus, 'pending' | 'restored'>,
  adjustedRanges?: readonly TranscriptTimelineRange[],
): CleanupSession {
  const suggestion = session.suggestions.find((candidate) => candidate.id === suggestionId);
  if (!suggestion) throw new Error(`Cleanup suggestion not found: ${suggestionId}`);
  if (status === 'accepted' && suggestion.keptByDefault) {
    throw new Error('Kept-by-default cleanup suggestions cannot be accepted');
  }
  if (status === 'adjusted' && !validAdjustedRanges(adjustedRanges)) {
    throw new Error('Adjusted cleanup decisions require positive timeline ranges');
  }
  const nextDecision: CleanupDecision = {
    suggestionId,
    status,
    ...(status === 'adjusted' ? { adjustedRanges } : {}),
  };
  return replaceDecision(session, nextDecision);
}

export function restoreCleanupSuggestion(
  session: CleanupSession,
  suggestionId: string,
): CleanupSession {
  const current = session.decisions.find(
    (decision) => decision.suggestionId === suggestionId,
  );
  if (!current) throw new Error(`Cleanup suggestion not found: ${suggestionId}`);
  if (current.status !== 'accepted' && current.status !== 'adjusted') return session;
  return replaceDecision(session, { suggestionId, status: 'restored' });
}

export function undoCleanupDecision(session: CleanupSession): CleanupSession {
  const previous = session.history.past[session.history.past.length - 1];
  if (!previous) return session;
  return {
    ...session,
    decisions: previous,
    history: {
      past: session.history.past.slice(0, -1),
      future: [session.decisions, ...session.history.future],
    },
  };
}

export function redoCleanupDecision(session: CleanupSession): CleanupSession {
  const next = session.history.future[0];
  if (!next) return session;
  return {
    ...session,
    decisions: next,
    history: {
      past: [...session.history.past, session.decisions],
      future: session.history.future.slice(1),
    },
  };
}

export function cancelCleanupSession(session: CleanupSession): CleanupSession {
  return {
    ...session,
    decisions: session.suggestions.map((suggestion) => ({
      suggestionId: suggestion.id,
      status: 'pending',
    })),
    history: { past: [], future: [] },
  };
}

export function cleanupSessionSnapshot(
  session: CleanupSession,
): CleanupSessionSnapshot {
  return {
    version: 1,
    analysisSignature: session.analysisSignature,
    decisions: session.decisions,
    manualSuggestions: session.suggestions.filter(
      (suggestion) => suggestion.kind === 'manual',
    ),
    history: session.history,
  };
}

export function cleanupDraftContextSignature(
  document: ProjectDocument,
  suggestions: readonly CleanupSuggestion[],
): string {
  return JSON.stringify({
    suggestions: cleanupAnalysisSignature(suggestions),
    transcript:
      document.transcript?.words.map((word) => [
        word.word,
        word.startFrame,
        word.endFrame,
      ]) ?? [],
    clips: document.timeline.tracks.flatMap((track) =>
      track.clips.map((clip) => [
        clip.id,
        clip.mediaId,
        clip.timelineIn,
        clip.timelineOut,
        clip.sourceIn,
        clip.sourceOut,
      ]),
    ),
  });
}

export function resolveCleanupDraftProjection(
  session: CleanupSession,
): CleanupDraftProjection {
  const applied = new Map(
    session.decisions
      .filter(
        (decision) =>
          decision.status === 'accepted' || decision.status === 'adjusted',
      )
      .map((decision) => [decision.suggestionId, decision]),
  );
  const removals: CleanupDraftRemoval[] = [];
  const compressions: CleanupDraftCompression[] = [];

  for (const suggestion of session.suggestions) {
    const decision = applied.get(suggestion.id);
    if (!decision) continue;
    const ranges =
      decision.status === 'adjusted'
        ? decision.adjustedRanges ?? []
        : suggestion.timelineRanges;
    for (const range of ranges) {
      if (suggestion.proposedAction === 'remove') {
        removals.push({
          suggestionId: suggestion.id,
          startFrame: range.startFrame,
          endFrame: range.endFrame,
        });
      } else {
        compressions.push({
          suggestionId: suggestion.id,
          startFrame: range.startFrame,
          endFrame: range.endFrame,
          targetDurationFrames: Math.min(
            suggestion.targetDurationFrames,
            range.endFrame - range.startFrame,
          ),
        });
      }
    }
  }

  const normalizedRemovals = mergeRemovals(removals);
  const normalizedCompressions = nonOverlappingCompressions(
    compressions
      .filter(
        (compression) =>
          !normalizedRemovals.some(
            (removal) =>
              removal.startFrame < compression.endFrame &&
              removal.endFrame > compression.startFrame,
          ),
      )
      .sort((left, right) => left.startFrame - right.startFrame),
  );
  return {
    removals: normalizedRemovals,
    compressions: normalizedCompressions,
  };
}

export function draftTimelineFrame(
  projection: CleanupDraftProjection,
  timelineFrame: Frame,
): Frame {
  const events = [
    ...projection.removals.map((range) => ({ ...range, kind: 'remove' as const })),
    ...projection.compressions.map((range) => ({
      ...range,
      kind: 'compress' as const,
    })),
  ].sort((left, right) => left.startFrame - right.startFrame);
  let savedFrames = 0;
  for (const event of events) {
    if (timelineFrame <= event.startFrame) break;
    const duration = event.endFrame - event.startFrame;
    if (timelineFrame < event.endFrame) {
      if (event.kind === 'remove') {
        return Math.max(0, event.startFrame - savedFrames);
      }
      const progress = (timelineFrame - event.startFrame) / duration;
      return Math.max(
        0,
        Math.round(
          event.startFrame -
            savedFrames +
            progress * event.targetDurationFrames,
        ),
      );
    }
    savedFrames +=
      event.kind === 'remove'
        ? duration
        : duration - event.targetDurationFrames;
  }
  return Math.max(0, Math.round(timelineFrame - savedFrames));
}

export function draftTimelineDuration(
  projection: CleanupDraftProjection,
  baseDurationFrames: Frame,
): Frame {
  return draftTimelineFrame(projection, baseDurationFrames);
}

export function timelineFrameForDraftFrame(
  projection: CleanupDraftProjection,
  draftFrame: Frame,
  baseDurationFrames: Frame,
): Frame {
  const events = [
    ...projection.removals.map((range) => ({ ...range, kind: 'remove' as const })),
    ...projection.compressions.map((range) => ({
      ...range,
      kind: 'compress' as const,
    })),
  ].sort((left, right) => left.startFrame - right.startFrame);
  let savedFrames = 0;
  for (const event of events) {
    const draftStart = event.startFrame - savedFrames;
    if (draftFrame < draftStart) break;
    const duration = event.endFrame - event.startFrame;
    if (event.kind === 'remove') {
      savedFrames += duration;
      continue;
    }
    const draftEnd = draftStart + event.targetDurationFrames;
    if (draftFrame < draftEnd) {
      const progress =
        event.targetDurationFrames === 0
          ? 1
          : (draftFrame - draftStart) / event.targetDurationFrames;
      return clampFrame(
        event.startFrame + Math.round(progress * duration),
        event.startFrame,
        event.endFrame,
      );
    }
    savedFrames += duration - event.targetDurationFrames;
  }
  return clampFrame(
    Math.round(draftFrame + savedFrames),
    0,
    Math.max(0, baseDurationFrames),
  );
}

export function persistCleanupSessionSnapshot(
  document: ProjectDocument,
  recordingAssetId: string,
  snapshot: CleanupSessionSnapshot,
): ProjectDocument {
  return updateRecordingMetadata(document, recordingAssetId, {
    [CLEANUP_DRAFT_METADATA_KEY]: snapshot,
  });
}

export function loadCleanupSessionSnapshot(
  document: ProjectDocument,
  recordingAssetId: string,
): CleanupSessionSnapshot | null {
  const asset = document.assets.find((candidate) => candidate.id === recordingAssetId);
  return parseCleanupSessionSnapshot(
    asset?.metadata?.[CLEANUP_DRAFT_METADATA_KEY],
  );
}

export function clearCleanupSessionSnapshot(
  document: ProjectDocument,
  recordingAssetId: string,
): ProjectDocument {
  const asset = document.assets.find((candidate) => candidate.id === recordingAssetId);
  if (!asset?.metadata || !(CLEANUP_DRAFT_METADATA_KEY in asset.metadata)) {
    return document;
  }
  const metadata = { ...asset.metadata };
  delete metadata[CLEANUP_DRAFT_METADATA_KEY];
  return updateRecordingMetadata(document, recordingAssetId, metadata, true);
}

function replaceDecision(
  session: CleanupSession,
  nextDecision: CleanupDecision,
): CleanupSession {
  const currentDecision = session.decisions.find(
    (decision) => decision.suggestionId === nextDecision.suggestionId,
  );
  if (currentDecision && sameCleanupDecision(currentDecision, nextDecision)) {
    return session;
  }
  return {
    ...session,
    decisions: session.decisions.map((decision) =>
      decision.suggestionId === nextDecision.suggestionId
        ? nextDecision
        : decision,
    ),
    history: {
      past: [...session.history.past, session.decisions],
      future: [],
    },
  };
}

function sameCleanupDecision(
  left: CleanupDecision,
  right: CleanupDecision,
): boolean {
  if (
    left.suggestionId !== right.suggestionId ||
    left.status !== right.status
  ) {
    return false;
  }
  const leftRanges = left.adjustedRanges ?? [];
  const rightRanges = right.adjustedRanges ?? [];
  return (
    leftRanges.length === rightRanges.length &&
    leftRanges.every((range, index) => {
      const other = rightRanges[index];
      return (
        other !== undefined &&
        range.startFrame === other.startFrame &&
        range.endFrame === other.endFrame &&
        range.sourceId === other.sourceId &&
        range.clipId === other.clipId
      );
    })
  );
}

function validDecisionForSuggestion(
  decision: CleanupDecision,
  suggestion: CleanupSuggestion,
): boolean {
  return (
    decision.suggestionId === suggestion.id &&
    (decision.status !== 'adjusted' ||
      validAdjustedRanges(decision.adjustedRanges))
  );
}

function validAdjustedRanges(
  ranges: readonly TranscriptTimelineRange[] | undefined,
): ranges is readonly TranscriptTimelineRange[] {
  return Boolean(
    ranges?.length &&
      ranges.every(
        (range) =>
          Number.isInteger(range.startFrame) &&
          Number.isInteger(range.endFrame) &&
          range.endFrame > range.startFrame,
      ),
  );
}

function cleanupAnalysisSignature(
  suggestions: readonly CleanupSuggestion[],
): string {
  return JSON.stringify(
    suggestions.map((suggestion) => ({
      id: suggestion.id,
      sourceId: suggestion.sourceId,
      kind: suggestion.kind,
      proposedAction: suggestion.proposedAction,
      timelineRanges: suggestion.timelineRanges.map((range) => ({
        sourceId: range.sourceId,
        clipId: range.clipId,
        startFrame: range.startFrame,
        endFrame: range.endFrame,
      })),
      replacementRanges: suggestion.replacementRanges?.map((range) => ({
        sourceId: range.sourceId,
        clipId: range.clipId,
        startFrame: range.startFrame,
        endFrame: range.endFrame,
      })),
      targetDurationFrames: suggestion.targetDurationFrames,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
      keptByDefault: suggestion.keptByDefault,
      naturalJoinPlan: suggestion.naturalJoinPlan,
    })),
  );
}

function mergeRemovals(
  removals: readonly CleanupDraftRemoval[],
): readonly CleanupDraftRemoval[] {
  const sorted = [...removals].sort(
    (left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
  const merged: CleanupDraftRemoval[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startFrame > previous.endFrame) {
      merged.push(range);
    } else {
      merged[merged.length - 1] = {
        suggestionId: `${previous.suggestionId}+${range.suggestionId}`,
        startFrame: previous.startFrame,
        endFrame: Math.max(previous.endFrame, range.endFrame),
      };
    }
  }
  return merged;
}

function nonOverlappingCompressions(
  compressions: readonly CleanupDraftCompression[],
): readonly CleanupDraftCompression[] {
  const accepted: CleanupDraftCompression[] = [];
  for (const compression of compressions) {
    const previous = accepted[accepted.length - 1];
    if (!previous || compression.startFrame >= previous.endFrame) {
      accepted.push(compression);
    }
  }
  return accepted;
}

function parseCleanupSessionSnapshot(
  value: unknown,
): CleanupSessionSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CleanupSessionSnapshot>;
  if (
    candidate.version !== 1 ||
    typeof candidate.analysisSignature !== 'string' ||
    !Array.isArray(candidate.decisions)
  ) {
    return null;
  }
  const decisions = candidate.decisions.filter(
    (decision): decision is CleanupDecision =>
      Boolean(
        decision &&
          typeof decision === 'object' &&
          typeof decision.suggestionId === 'string' &&
          ['pending', 'accepted', 'rejected', 'adjusted', 'restored'].includes(
            decision.status,
          ) &&
          (decision.status !== 'adjusted' ||
            validAdjustedRanges(decision.adjustedRanges)),
      ),
  );
  const manualSuggestions = Array.isArray(candidate.manualSuggestions)
    ? candidate.manualSuggestions.filter(validManualSuggestion)
    : [];
  const history = parseCleanupHistory(candidate.history);
  return {
    version: 1,
    analysisSignature: candidate.analysisSignature,
    decisions,
    manualSuggestions,
    ...(history ? { history } : {}),
  };
}

function validManualSuggestion(value: unknown): value is CleanupSuggestion {
  if (!value || typeof value !== 'object') return false;
  const suggestion = value as Partial<CleanupSuggestion>;
  return Boolean(
    typeof suggestion.id === 'string' &&
      suggestion.id.length > 0 &&
      typeof suggestion.sourceId === 'string' &&
      suggestion.kind === 'manual' &&
      suggestion.proposedAction === 'remove' &&
      Array.isArray(suggestion.timelineRanges) &&
      validAdjustedRanges(suggestion.timelineRanges) &&
      suggestion.targetDurationFrames === 0 &&
      suggestion.keptByDefault === false &&
      (suggestion.naturalJoinPlan === undefined ||
        validNaturalJoinPlan(suggestion.naturalJoinPlan)),
  );
}

function validNaturalJoinPlan(value: unknown): value is NaturalJoinPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<NaturalJoinPlan>;
  return Boolean(
    validAdjustedRanges(plan.requestedRanges) &&
      validAdjustedRanges(plan.refinedRanges) &&
      (plan.audioSafety === 'safe' || plan.audioSafety === 'caution') &&
      (plan.audioWarning === null || typeof plan.audioWarning === 'string') &&
      Number.isInteger(plan.crossfadeFrames) &&
      Number(plan.crossfadeFrames) > 0 &&
      Array.isArray(plan.alternatives) &&
      plan.alternatives.every(
        (alternative) =>
          alternative &&
          (alternative.id === 'requested' || alternative.id === 'silence-safe') &&
          typeof alternative.label === 'string' &&
          validAdjustedRanges(alternative.ranges),
      ),
  );
}

function parseCleanupHistory(value: unknown): CleanupSession['history'] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CleanupSession['history']>;
  if (!Array.isArray(candidate.past) || !Array.isArray(candidate.future)) return null;
  const parseStack = (
    stack: readonly unknown[],
  ): readonly (readonly CleanupDecision[])[] | null => {
    const parsed = stack.map((entry) =>
      Array.isArray(entry)
        ? entry.filter(
            (decision): decision is CleanupDecision =>
              Boolean(
                decision &&
                  typeof decision === 'object' &&
                  typeof decision.suggestionId === 'string' &&
                  ['pending', 'accepted', 'rejected', 'adjusted', 'restored'].includes(
                    decision.status,
                  ) &&
                  (decision.status !== 'adjusted' ||
                    validAdjustedRanges(decision.adjustedRanges)),
              ),
          )
        : null,
    );
    return parsed.some((entry) => entry === null)
      ? null
      : (parsed as readonly (readonly CleanupDecision[])[]);
  };
  const past = parseStack(candidate.past);
  const future = parseStack(candidate.future);
  return past && future ? { past, future } : null;
}

function validHistoryForSuggestions(
  history: CleanupSession['history'] | undefined,
  suggestions: readonly CleanupSuggestion[],
): CleanupSession['history'] | null {
  if (!history) return null;
  const suggestionIds = new Set(suggestions.map((suggestion) => suggestion.id));
  const validStack = (stack: readonly (readonly CleanupDecision[])[]) =>
    stack.every(
      (decisions) =>
        decisions.length === suggestions.length &&
        decisions.every(
          (decision) =>
            suggestionIds.has(decision.suggestionId) &&
            validDecisionForSuggestion(
              decision,
              suggestions.find(
                (suggestion) => suggestion.id === decision.suggestionId,
              )!,
            ),
        ),
    );
  return validStack(history.past) && validStack(history.future) ? history : null;
}

function updateRecordingMetadata(
  document: ProjectDocument,
  recordingAssetId: string,
  patchOrMetadata: Record<string, unknown>,
  replace = false,
): ProjectDocument {
  let found = false;
  const assets = document.assets.map((asset) => {
    if (asset.id !== recordingAssetId) return asset;
    found = true;
    return {
      ...asset,
      metadata: replace
        ? patchOrMetadata
        : { ...asset.metadata, ...patchOrMetadata },
    };
  });
  if (!found) throw new Error(`Recording asset not found: ${recordingAssetId}`);
  return { ...document, assets };
}

function clampFrame(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
