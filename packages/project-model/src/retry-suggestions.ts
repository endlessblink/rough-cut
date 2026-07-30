import type { Frame, ProjectDocument, TranscriptWord } from './types.js';
import {
  sourceFrameTimelineRanges,
  type TranscriptTimelineRange,
} from './transcript-timeline.js';

export type RetrySuggestionDisposition = 'suggest-remove' | 'keep-flagged';

export interface RetrySuggestionBoundary {
  readonly label: 'spoken-attempt' | 'include-trailing-pause';
  readonly sourceStartFrame: Frame;
  readonly sourceEndFrame: Frame;
  readonly timelineRanges: readonly TranscriptTimelineRange[];
}

export interface RetrySuggestionEvidence {
  readonly kind:
    | 'repeated-meaning'
    | 'spoken-error'
    | 'screen-failure'
    | 'screen-success'
    | 'correction-language'
    | 'later-completion';
  readonly detail: string;
}

export interface RetryReplacementSuggestion {
  readonly id: string;
  readonly disposition: RetrySuggestionDisposition;
  readonly remove: RetrySuggestionBoundary;
  readonly replacement: RetrySuggestionBoundary;
  readonly alternatives: readonly RetrySuggestionBoundary[];
  readonly reason: string;
  readonly confidence: number;
  readonly evidence: readonly RetrySuggestionEvidence[];
}

export interface RetrySuggestionOptions {
  readonly minimumSimilarity?: number;
  readonly maximumDistanceSeconds?: number;
  readonly sentenceGapSeconds?: number;
  readonly screenOutcomes?: readonly RetryScreenOutcome[];
}

export interface RetryScreenOutcome {
  readonly frame: Frame;
  readonly outcome: 'failure' | 'success' | 'unchanged';
  readonly detail: string;
}

interface Attempt {
  readonly text: string;
  readonly words: readonly TranscriptWord[];
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly tokens: ReadonlySet<string>;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'this',
  'that',
  'to',
  'of',
  'for',
  'we',
  'i',
  'it',
  'is',
  'now',
  'so',
  'then',
]);
const ERROR_WORDS = new Set([
  'error',
  'errors',
  'failed',
  'failure',
  'exception',
  'crash',
  'crashed',
  'broken',
]);
const CORRECTION_WORDS = new Set([
  'actually',
  'correction',
  'instead',
  'rather',
  'retry',
  'again',
  'sorry',
]);
const COMPLETION_WORDS = new Set([
  'done',
  'fixed',
  'passes',
  'passed',
  'successful',
  'works',
  'working',
]);

export function deriveRetryReplacementSuggestions(
  document: ProjectDocument,
  options: RetrySuggestionOptions = {},
): readonly RetryReplacementSuggestion[] {
  const fps = document.settings?.frameRate ?? 30;
  const attempts = transcriptAttempts(
    document,
    Math.max(1, Math.round((options.sentenceGapSeconds ?? 1.5) * fps)),
  );
  const minimumSimilarity = options.minimumSimilarity ?? 0.55;
  const maximumDistanceFrames = Math.max(
    1,
    Math.round((options.maximumDistanceSeconds ?? 300) * fps),
  );
  const suggestions: RetryReplacementSuggestion[] = [];

  for (let earlierIndex = 0; earlierIndex < attempts.length - 1; earlierIndex += 1) {
    const earlier = attempts[earlierIndex]!;
    let best:
      | {
          readonly attempt: Attempt;
          readonly similarity: number;
          readonly correction: boolean;
          readonly error: boolean;
          readonly laterCompletion: boolean;
          readonly spokenError: boolean;
          readonly screenFailure?: RetryScreenOutcome;
          readonly textualCompletion: boolean;
          readonly screenSuccess?: RetryScreenOutcome;
        }
      | undefined;

    for (let laterIndex = earlierIndex + 1; laterIndex < attempts.length; laterIndex += 1) {
      const later = attempts[laterIndex]!;
      if (later.startFrame - earlier.endFrame > maximumDistanceFrames) break;
      const similarity = semanticSimilarity(earlier.tokens, later.tokens);
      if (similarity < minimumSimilarity) continue;
      const spokenError = hasErrorBetween(attempts, earlierIndex, laterIndex);
      const screenFailure = screenOutcomeBetween(
        options.screenOutcomes,
        earlier.startFrame,
        later.startFrame,
        'failure',
      );
      const textualCompletion = isMoreComplete(earlier, later);
      const screenSuccess = screenOutcomeBetween(
        options.screenOutcomes,
        later.startFrame,
        later.endFrame + Math.round(fps * 3),
        'success',
      );
      const candidate = {
        attempt: later,
        similarity,
        correction: hasCorrectionCue(later),
        error: spokenError || Boolean(screenFailure),
        laterCompletion: textualCompletion || Boolean(screenSuccess),
        spokenError,
        screenFailure,
        textualCompletion,
        screenSuccess,
      };
      if (!best || candidateScore(candidate) > candidateScore(best)) best = candidate;
    }

    if (!best) continue;
    const evidence: RetrySuggestionEvidence[] = [
      {
        kind: 'repeated-meaning',
        detail: `${Math.round(best.similarity * 100)}% transcript overlap`,
      },
    ];
    if (best.spokenError) {
      evidence.push({
        kind: 'spoken-error',
        detail: 'an error is spoken before the later attempt',
      });
    }
    if (best.screenFailure) {
      evidence.push({
        kind: 'screen-failure',
        detail: best.screenFailure.detail,
      });
    }
    if (best.correction) {
      evidence.push({
        kind: 'correction-language',
        detail: 'the later attempt uses correction language',
      });
    }
    if (best.textualCompletion) {
      evidence.push({
        kind: 'later-completion',
        detail: 'the later attempt is more complete or reports success',
      });
    }
    if (best.screenSuccess) {
      evidence.push({
        kind: 'screen-success',
        detail: best.screenSuccess.detail,
      });
    }

    const confidence = retryConfidence(best);
    const remove = boundaryForAttempt(document, earlier, 'spoken-attempt');
    const replacement = boundaryForAttempt(document, best.attempt, 'spoken-attempt');
    if (remove.timelineRanges.length === 0 || replacement.timelineRanges.length === 0) {
      continue;
    }
    const alternatives = trailingPauseAlternative(document, earlier, fps);
    const disposition: RetrySuggestionDisposition =
      confidence >= 0.75 && (best.error || best.correction) && best.laterCompletion
        ? 'suggest-remove'
        : 'keep-flagged';

    suggestions.push({
      id: suggestionId(earlier, best.attempt),
      disposition,
      remove,
      replacement,
      alternatives,
      reason: retryReason(disposition, best),
      confidence,
      evidence,
    });
  }

  return suggestions;
}

function transcriptAttempts(
  document: ProjectDocument,
  sentenceGapFrames: number,
): readonly Attempt[] {
  const words = document.transcript?.words ?? [];
  if (words.length === 0) return [];
  const paragraphs = document.transcript?.paragraphs ?? [];
  if (paragraphs.length > 0) {
    return paragraphs
      .map((paragraph) => {
        const paragraphWords = words.filter(
          (word) =>
            word.endFrame > paragraph.startFrame && word.startFrame < paragraph.endFrame,
        );
        return attemptFromWords(paragraphWords, paragraph.text);
      })
      .filter((attempt): attempt is Attempt => attempt !== null);
  }

  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (const word of words) {
    const previous = current[current.length - 1];
    if (
      previous &&
      (word.startFrame - previous.endFrame >= sentenceGapFrames ||
        /[.!?]$/.test(previous.word))
    ) {
      groups.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length > 0) groups.push(current);
  return groups
    .map((group) => attemptFromWords(group))
    .filter((attempt): attempt is Attempt => attempt !== null);
}

function attemptFromWords(
  words: readonly TranscriptWord[],
  fallbackText?: string,
): Attempt | null {
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return null;
  const text = words.map((word) => word.word).join(' ').trim() || fallbackText?.trim() || '';
  const tokens = new Set(
    words
      .map((word) => normalizeToken(word.word))
      .filter((token) => token && !STOP_WORDS.has(token)),
  );
  if (tokens.size === 0) return null;
  return {
    text,
    words,
    startFrame: first.startFrame,
    endFrame: last.endFrame,
    tokens,
  };
}

function semanticSimilarity(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  let intersection = 0;
  for (const token of smaller) {
    if (larger.has(token)) intersection += 1;
  }
  return smaller.size === 0 ? 0 : intersection / smaller.size;
}

function hasCorrectionCue(attempt: Attempt): boolean {
  return [...attempt.tokens].some((token) => CORRECTION_WORDS.has(token));
}

function hasErrorBetween(
  attempts: readonly Attempt[],
  earlierIndex: number,
  laterIndex: number,
): boolean {
  for (let index = earlierIndex; index < laterIndex; index += 1) {
    if ([...attempts[index]!.tokens].some((token) => ERROR_WORDS.has(token))) {
      return true;
    }
  }
  return false;
}

function isMoreComplete(earlier: Attempt, later: Attempt): boolean {
  const success = [...later.tokens].some((token) => COMPLETION_WORDS.has(token));
  return success || later.tokens.size >= earlier.tokens.size + 2;
}

function screenOutcomeBetween(
  outcomes: readonly RetryScreenOutcome[] | undefined,
  startFrame: number,
  endFrame: number,
  outcome: RetryScreenOutcome['outcome'],
): RetryScreenOutcome | undefined {
  return outcomes?.find(
    (candidate) =>
      candidate.outcome === outcome &&
      candidate.frame >= startFrame &&
      candidate.frame <= endFrame,
  );
}

function candidateScore(candidate: {
  readonly similarity: number;
  readonly correction: boolean;
  readonly error: boolean;
  readonly laterCompletion: boolean;
}): number {
  return (
    candidate.similarity +
    (candidate.correction ? 0.2 : 0) +
    (candidate.error ? 0.25 : 0) +
    (candidate.laterCompletion ? 0.15 : 0)
  );
}

function retryConfidence(candidate: {
  readonly similarity: number;
  readonly correction: boolean;
  readonly error: boolean;
  readonly laterCompletion: boolean;
}): number {
  const confidence =
    candidate.similarity * 0.4 +
    (candidate.correction ? 0.2 : 0) +
    (candidate.error ? 0.25 : 0) +
    (candidate.laterCompletion ? 0.15 : 0);
  return Math.round(Math.min(0.99, confidence) * 100) / 100;
}

function boundaryForAttempt(
  document: ProjectDocument,
  attempt: Attempt,
  label: RetrySuggestionBoundary['label'],
): RetrySuggestionBoundary {
  return {
    label,
    sourceStartFrame: attempt.startFrame,
    sourceEndFrame: attempt.endFrame,
    timelineRanges: sourceFrameTimelineRanges(document, {
      startFrame: attempt.startFrame,
      endFrame: attempt.endFrame,
    }),
  };
}

function trailingPauseAlternative(
  document: ProjectDocument,
  attempt: Attempt,
  fps: number,
): readonly RetrySuggestionBoundary[] {
  const pause = document.transcript?.nonSpeech.find(
    (segment) =>
      segment.kind === 'silence' &&
      segment.startFrame >= attempt.endFrame &&
      segment.startFrame - attempt.endFrame <= Math.round(fps * 0.5) &&
      segment.endFrame - segment.startFrame <= Math.round(fps * 2),
  );
  if (!pause) return [];
  const alternative: RetrySuggestionBoundary = {
    label: 'include-trailing-pause',
    sourceStartFrame: attempt.startFrame,
    sourceEndFrame: pause.endFrame,
    timelineRanges: sourceFrameTimelineRanges(document, {
      startFrame: attempt.startFrame,
      endFrame: pause.endFrame,
    }),
  };
  return alternative.timelineRanges.length > 0 ? [alternative] : [];
}

function retryReason(
  disposition: RetrySuggestionDisposition,
  candidate: {
    readonly attempt: Attempt;
    readonly correction: boolean;
    readonly error: boolean;
    readonly laterCompletion: boolean;
    readonly spokenError: boolean;
    readonly screenFailure?: RetryScreenOutcome;
    readonly textualCompletion: boolean;
    readonly screenSuccess?: RetryScreenOutcome;
  },
): string {
  if (disposition === 'keep-flagged') {
    return `Similar later take (“${candidate.attempt.text}”), but the replacement is not certain enough to cut.`;
  }
  if (candidate.spokenError) {
    return `A spoken failure is followed by the more complete take “${candidate.attempt.text}”.`;
  }
  if (candidate.screenFailure) {
    return `A failed screen outcome is followed by the successful take “${candidate.attempt.text}”.`;
  }
  return `Correction language introduces the more complete take “${candidate.attempt.text}”.`;
}

function suggestionId(earlier: Attempt, later: Attempt): string {
  return `retry:${earlier.startFrame}:${earlier.endFrame}:${later.startFrame}:${later.endFrame}`;
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9+#.-]/g, '');
}
