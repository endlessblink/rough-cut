import { describe, expect, it } from 'vitest';
import type { ProjectDocument, TranscriptWord } from './types.js';
import {
  createTranscriptTimelineIndex,
  sourceFrameTimelineRanges,
  timelineFrameForSourceFrame,
  timelineFrameForTranscriptWord,
  transcriptWordEntryAtTimelineFrame,
  transcriptWordAtTimelineFrame,
  transcriptWordSelectionTimelineRanges,
  transcriptWordTimelineRanges,
} from './transcript-timeline.js';

function word(word: string, startFrame: number, endFrame: number): TranscriptWord {
  return { word, startFrame, endFrame, confidence: 1 } as TranscriptWord;
}

function project(words: readonly TranscriptWord[]): ProjectDocument {
  return {
    transcript: { words, paragraphs: [], nonSpeech: [] },
    timeline: {
      sources: [
        {
          id: 'screen-source',
          kind: 'screen',
          mediaType: 'video',
          label: 'Screen',
          duration: 100,
        },
      ],
      linkedGroups: [],
      tracks: [
        {
          id: 'screen-track',
          kind: 'video',
          index: 0,
          label: 'Screen',
          enabled: true,
          locked: false,
          muted: false,
          clips: [
            {
              id: 'clip-a',
              mediaId: 'screen-source',
              trackId: 'screen-track',
              timelineIn: 0,
              timelineOut: 30,
              sourceIn: 0,
              sourceOut: 30,
            },
            {
              id: 'clip-b',
              mediaId: 'screen-source',
              trackId: 'screen-track',
              timelineIn: 50,
              timelineOut: 80,
              sourceIn: 50,
              sourceOut: 80,
            },
          ],
        },
      ],
      markers: [],
      effects: [],
      exportSettings: {},
    },
  } as unknown as ProjectDocument;
}

describe('transcript timeline alignment', () => {
  it('turns an inclusive word selection into merged canonical half-open ranges', () => {
    const document = project([
      word('select', 10, 20),
      word('these', 21, 25),
      word('words', 26, 30),
    ]);

    expect(transcriptWordSelectionTimelineRanges(document, 2, 0)).toEqual([
      {
        startFrame: 10,
        endFrame: 30,
        clipId: 'clip-a',
        sourceId: 'screen-source',
      },
    ]);
  });

  it('preserves separate canonical ranges when a selection crosses removed media', () => {
    const document = project([
      word('before', 10, 20),
      word('removed', 35, 40),
      word('after', 52, 58),
    ]);

    expect(transcriptWordSelectionTimelineRanges(document, 0, 2)).toEqual([
      {
        startFrame: 10,
        endFrame: 20,
        clipId: 'clip-a',
        sourceId: 'screen-source',
      },
      {
        startFrame: 52,
        endFrame: 58,
        clipId: 'clip-b',
        sourceId: 'screen-source',
      },
    ]);
  });

  it('maps source-timed words through cuts and timeline gaps', () => {
    const visible = word('visible', 10, 20);
    const removed = word('removed', 35, 40);
    const afterGap = word('after', 52, 58);
    const document = project([visible, removed, afterGap]);

    expect(transcriptWordTimelineRanges(document, visible)).toEqual([
      { startFrame: 10, endFrame: 20, clipId: 'clip-a', sourceId: 'screen-source' },
    ]);
    expect(transcriptWordTimelineRanges(document, removed)).toEqual([]);
    expect(transcriptWordTimelineRanges(document, afterGap)).toEqual([
      { startFrame: 52, endFrame: 58, clipId: 'clip-b', sourceId: 'screen-source' },
    ]);
    expect(timelineFrameForTranscriptWord(document, afterGap)).toBe(52);
  });

  it('splits a word range that crosses removed source material', () => {
    const crossing = word('crossing', 25, 55);
    expect(transcriptWordTimelineRanges(project([crossing]), crossing)).toEqual([
      { startFrame: 25, endFrame: 30, clipId: 'clip-a', sourceId: 'screen-source' },
      { startFrame: 50, endFrame: 55, clipId: 'clip-b', sourceId: 'screen-source' },
    ]);
  });

  it('maps generic source activity through the same canonical screen clips', () => {
    const document = project([]);

    expect(sourceFrameTimelineRanges(document, { startFrame: 25, endFrame: 55 })).toEqual([
      { startFrame: 25, endFrame: 30, clipId: 'clip-a', sourceId: 'screen-source' },
      { startFrame: 50, endFrame: 55, clipId: 'clip-b', sourceId: 'screen-source' },
    ]);
    expect(timelineFrameForSourceFrame(document, 52)).toBe(52);
    expect(timelineFrameForSourceFrame(document, 40)).toBeNull();
  });

  it('resolves the spoken word from a canonical timeline frame', () => {
    const first = word('first', 10, 20);
    const second = word('second', 52, 58);
    const document = project([first, second]);

    expect(transcriptWordAtTimelineFrame(document, 55)).toBe(second);
    expect(transcriptWordAtTimelineFrame(document, 40)).toBeNull();
    expect(transcriptWordAtTimelineFrame(document, 58)).toBeNull();
  });

  it('indexes word lookup once across cuts, gaps, and removed words', () => {
    const document = project([
      word('before', 10, 20),
      word('removed', 40, 50),
      word('after', 70, 80),
    ]);
    const index = createTranscriptTimelineIndex(document);

    expect(index.words.map((entry) => entry.firstTimelineFrame)).toEqual([
      10,
      null,
      70,
    ]);
    expect(transcriptWordEntryAtTimelineFrame(index, 15)?.word.word).toBe(
      'before',
    );
    expect(transcriptWordEntryAtTimelineFrame(index, 45)).toBeNull();
    expect(transcriptWordEntryAtTimelineFrame(index, 75)?.word.word).toBe(
      'after',
    );
  });
});
