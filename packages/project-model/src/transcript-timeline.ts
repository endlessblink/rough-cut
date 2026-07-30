import type { Frame, ProjectDocument, TranscriptWord } from './types.js';

export interface TranscriptTimelineRange {
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly clipId: string;
  readonly sourceId: string;
}

export interface SourceFrameRange {
  readonly startFrame: Frame;
  readonly endFrame: Frame;
}

export interface TranscriptTimelineWordEntry {
  readonly word: TranscriptWord;
  readonly wordIndex: number;
  readonly timelineRanges: readonly TranscriptTimelineRange[];
  readonly firstTimelineFrame: Frame | null;
}

export interface TranscriptTimelineIndex {
  readonly words: readonly TranscriptTimelineWordEntry[];
  readonly intervals: readonly {
    readonly startFrame: Frame;
    readonly endFrame: Frame;
    readonly wordIndex: number;
  }[];
}

export function primaryScreenSourceId(document: ProjectDocument): string | null {
  return document.timeline.sources.find((source) => source.kind === 'screen')?.id ?? null;
}

function screenClips(document: ProjectDocument, sourceId: string) {
  return document.timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.mediaId === sourceId)
    .sort((left, right) => left.timelineIn - right.timelineIn);
}

export function transcriptWordTimelineRanges(
  document: ProjectDocument,
  word: TranscriptWord,
): readonly TranscriptTimelineRange[] {
  return sourceFrameTimelineRanges(document, word);
}

export function transcriptWordSelectionTimelineRanges(
  document: ProjectDocument,
  anchorWordIndex: number,
  focusWordIndex: number,
): readonly TranscriptTimelineRange[] {
  const words = document.transcript?.words ?? [];
  if (
    words.length === 0 ||
    !Number.isInteger(anchorWordIndex) ||
    !Number.isInteger(focusWordIndex)
  ) {
    return [];
  }
  const startIndex = Math.max(
    0,
    Math.min(words.length - 1, Math.min(anchorWordIndex, focusWordIndex)),
  );
  const endIndex = Math.max(
    0,
    Math.min(words.length - 1, Math.max(anchorWordIndex, focusWordIndex)),
  );
  const ranges = words
    .slice(startIndex, endIndex + 1)
    .flatMap((word) => transcriptWordTimelineRanges(document, word))
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        left.endFrame - right.endFrame,
    );
  const merged: TranscriptTimelineRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.clipId === range.clipId &&
      previous.sourceId === range.sourceId &&
      range.startFrame <= previous.endFrame + 1
    ) {
      merged[merged.length - 1] = {
        ...previous,
        endFrame: Math.max(previous.endFrame, range.endFrame),
      };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

export function sourceFrameTimelineRanges(
  document: ProjectDocument,
  sourceRange: SourceFrameRange,
): readonly TranscriptTimelineRange[] {
  const sourceId = primaryScreenSourceId(document);
  if (!sourceId || sourceRange.endFrame <= sourceRange.startFrame) return [];

  const ranges: TranscriptTimelineRange[] = [];
  for (const clip of screenClips(document, sourceId)) {
    const sourceStart = Math.max(sourceRange.startFrame, clip.sourceIn);
    const sourceEnd = Math.min(sourceRange.endFrame, clip.sourceOut);
    if (sourceEnd <= sourceStart) continue;
    ranges.push({
      startFrame: (clip.timelineIn + sourceStart - clip.sourceIn) as Frame,
      endFrame: (clip.timelineIn + sourceEnd - clip.sourceIn) as Frame,
      clipId: clip.id,
      sourceId,
    });
  }
  return ranges;
}

export function timelineFrameForSourceFrame(
  document: ProjectDocument,
  sourceFrame: number,
): Frame | null {
  if (!Number.isFinite(sourceFrame)) return null;
  return (
    sourceFrameTimelineRanges(document, {
      startFrame: Math.max(0, Math.floor(sourceFrame)),
      endFrame: Math.max(0, Math.floor(sourceFrame)) + 1,
    })[0]?.startFrame ?? null
  );
}

export function timelineFrameForTranscriptWord(
  document: ProjectDocument,
  word: TranscriptWord,
): Frame | null {
  return transcriptWordTimelineRanges(document, word)[0]?.startFrame ?? null;
}

export function transcriptWordAtTimelineFrame(
  document: ProjectDocument,
  timelineFrame: number,
): TranscriptWord | null {
  const transcript = document.transcript;
  const sourceId = primaryScreenSourceId(document);
  if (!transcript || !sourceId || !Number.isFinite(timelineFrame)) return null;

  for (const clip of screenClips(document, sourceId)) {
    if (timelineFrame < clip.timelineIn || timelineFrame >= clip.timelineOut) continue;
    const sourceFrame = clip.sourceIn + timelineFrame - clip.timelineIn;
    return (
      transcript.words.find(
        (word) => sourceFrame >= word.startFrame && sourceFrame < word.endFrame,
      ) ?? null
    );
  }
  return null;
}

export function createTranscriptTimelineIndex(
  document: ProjectDocument,
): TranscriptTimelineIndex {
  const sourceId = primaryScreenSourceId(document);
  const words = document.transcript?.words ?? [];
  if (!sourceId || words.length === 0) return { words: [], intervals: [] };
  const clips = screenClips(document, sourceId);
  const entries = words.map((word, wordIndex): TranscriptTimelineWordEntry => {
    const timelineRanges: TranscriptTimelineRange[] = [];
    for (const clip of clips) {
      const sourceStart = Math.max(word.startFrame, clip.sourceIn);
      const sourceEnd = Math.min(word.endFrame, clip.sourceOut);
      if (sourceEnd <= sourceStart) continue;
      timelineRanges.push({
        startFrame: (clip.timelineIn + sourceStart - clip.sourceIn) as Frame,
        endFrame: (clip.timelineIn + sourceEnd - clip.sourceIn) as Frame,
        clipId: clip.id,
        sourceId,
      });
    }
    return {
      word,
      wordIndex,
      timelineRanges,
      firstTimelineFrame: timelineRanges[0]?.startFrame ?? null,
    };
  });
  const intervals = entries
    .flatMap((entry) =>
      entry.timelineRanges.map((range) => ({
        startFrame: range.startFrame,
        endFrame: range.endFrame,
        wordIndex: entry.wordIndex,
      })),
    )
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        left.endFrame - right.endFrame ||
        left.wordIndex - right.wordIndex,
    );
  return { words: entries, intervals };
}

export function transcriptWordEntryAtTimelineFrame(
  index: TranscriptTimelineIndex,
  timelineFrame: number,
): TranscriptTimelineWordEntry | null {
  if (!Number.isFinite(timelineFrame) || index.intervals.length === 0) return null;
  let low = 0;
  let high = index.intervals.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (index.intervals[middle]!.startFrame <= timelineFrame) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  for (let intervalIndex = candidate; intervalIndex >= 0; intervalIndex -= 1) {
    const interval = index.intervals[intervalIndex]!;
    if (interval.endFrame <= timelineFrame) break;
    if (timelineFrame < interval.endFrame) {
      return index.words[interval.wordIndex] ?? null;
    }
  }
  return null;
}
