import type { ProjectDocument, TranscriptWord } from './types.js';
import type { TranscriptTimelineRange } from './transcript-timeline.js';

export interface NaturalJoinAlternative {
  readonly id: 'requested' | 'silence-safe';
  readonly label: string;
  readonly ranges: readonly TranscriptTimelineRange[];
}

export interface NaturalJoinPlan {
  readonly requestedRanges: readonly TranscriptTimelineRange[];
  readonly refinedRanges: readonly TranscriptTimelineRange[];
  readonly audioSafety: 'safe' | 'caution';
  readonly audioWarning: string | null;
  readonly crossfadeFrames: number;
  readonly alternatives: readonly NaturalJoinAlternative[];
}

export interface VisualDiscontinuityScore {
  readonly score: number;
  readonly warning: boolean;
}

export function planNaturalJoin(
  document: ProjectDocument,
  requestedRanges: readonly TranscriptTimelineRange[],
  {
    maximumBoundaryShiftFrames = 12,
  }: {
    readonly maximumBoundaryShiftFrames?: number;
  } = {},
): NaturalJoinPlan {
  const words = [...(document.transcript?.words ?? [])].sort(
    (left, right) => left.startFrame - right.startFrame,
  );
  const silences = (document.transcript?.nonSpeech ?? [])
    .filter((segment) => segment.kind === 'silence')
    .sort((left, right) => left.startFrame - right.startFrame);
  let safeBoundaryCount = 0;
  const refinedRanges = requestedRanges.map((range) => {
    const clip = document.timeline.tracks
      .flatMap((track) => track.clips)
      .find(
        (candidate) =>
          candidate.id === range.clipId && candidate.mediaId === range.sourceId,
      );
    if (!clip) return range;
    const sourceStart = clip.sourceIn + range.startFrame - clip.timelineIn;
    const sourceEnd = clip.sourceIn + range.endFrame - clip.timelineIn;
    const safeStart = safeBoundaryInSpeechGap(
      words,
      silences,
      sourceStart,
      'start',
      maximumBoundaryShiftFrames,
    );
    const safeEnd = safeBoundaryInSpeechGap(
      words,
      silences,
      sourceEnd,
      'end',
      maximumBoundaryShiftFrames,
    );
    if (safeStart !== null) safeBoundaryCount += 1;
    if (safeEnd !== null) safeBoundaryCount += 1;
    const startFrame =
      clip.timelineIn + (safeStart ?? sourceStart) - clip.sourceIn;
    const endFrame = clip.timelineIn + (safeEnd ?? sourceEnd) - clip.sourceIn;
    return endFrame > startFrame
      ? { ...range, startFrame, endFrame }
      : range;
  });
  const boundaryCount = requestedRanges.length * 2;
  const audioSafety =
    boundaryCount > 0 && safeBoundaryCount === boundaryCount ? 'safe' : 'caution';
  const changed = !sameRanges(requestedRanges, refinedRanges);
  return {
    requestedRanges,
    refinedRanges,
    audioSafety,
    audioWarning:
      audioSafety === 'safe'
        ? null
        : 'No nearby silence protects every speech boundary; verify this join.',
    crossfadeFrames: 2,
    alternatives: [
      {
        id: 'requested',
        label: 'Exact word boundary',
        ranges: requestedRanges,
      },
      ...(changed
        ? [
            {
              id: 'silence-safe' as const,
              label: 'Nearby safer boundary',
              ranges: refinedRanges,
            },
          ]
        : []),
    ],
  };
}

export function scoreVisualDiscontinuity(
  beforeRgba: Uint8Array,
  afterRgba: Uint8Array,
  warningThreshold = 0.22,
): VisualDiscontinuityScore {
  if (
    beforeRgba.length !== afterRgba.length ||
    beforeRgba.length < 4 ||
    beforeRgba.length % 4 !== 0
  ) {
    throw new Error('Visual discontinuity samples must be equal RGBA buffers');
  }
  let difference = 0;
  let channelCount = 0;
  for (let index = 0; index < beforeRgba.length; index += 4) {
    difference += Math.abs(beforeRgba[index]! - afterRgba[index]!);
    difference += Math.abs(beforeRgba[index + 1]! - afterRgba[index + 1]!);
    difference += Math.abs(beforeRgba[index + 2]! - afterRgba[index + 2]!);
    channelCount += 3;
  }
  const score = difference / (channelCount * 255);
  return {
    score,
    warning: score >= warningThreshold,
  };
}

function safeBoundaryInSpeechGap(
  words: readonly TranscriptWord[],
  silences: readonly {
    readonly startFrame: number;
    readonly endFrame: number;
  }[],
  requestedFrame: number,
  edge: 'start' | 'end',
  maximumShiftFrames: number,
): number | null {
  const previous = findPreviousWord(words, requestedFrame);
  const next = words.find((word) => word.startFrame >= requestedFrame) ?? null;
  if (!previous || !next || next.startFrame <= previous.endFrame) return null;
  const gapStart = previous.endFrame;
  const gapEnd = next.startFrame;
  const silence = silences
    .map((segment) => ({
      startFrame: Math.max(gapStart, segment.startFrame),
      endFrame: Math.min(gapEnd, segment.endFrame),
    }))
    .filter((segment) => segment.endFrame > segment.startFrame)
    .sort(
      (left, right) =>
        Math.abs(midpoint(left) - requestedFrame) -
        Math.abs(midpoint(right) - requestedFrame),
    )[0];
  const candidate = silence ? midpoint(silence) : Math.round((gapStart + gapEnd) / 2);
  const directionallySafe =
    edge === 'start'
      ? Math.min(candidate, requestedFrame)
      : Math.max(candidate, requestedFrame);
  return Math.abs(directionallySafe - requestedFrame) <=
    Math.max(0, Math.round(maximumShiftFrames))
    ? directionallySafe
    : null;
}

function findPreviousWord(
  words: readonly TranscriptWord[],
  requestedFrame: number,
): TranscriptWord | null {
  let previous: TranscriptWord | null = null;
  for (const word of words) {
    if (word.endFrame > requestedFrame) break;
    previous = word;
  }
  return previous;
}

function midpoint(range: { readonly startFrame: number; readonly endFrame: number }) {
  return Math.round((range.startFrame + range.endFrame) / 2);
}

function sameRanges(
  left: readonly TranscriptTimelineRange[],
  right: readonly TranscriptTimelineRange[],
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
