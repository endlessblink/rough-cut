import { describe, expect, it } from 'vitest';
import type {
  ProjectDocument,
  TranscriptParagraph,
  TranscriptWord,
} from './index.js';
import { deriveRetryReplacementSuggestions } from './retry-suggestions.js';

function projectFromParagraphs(texts: readonly string[]): ProjectDocument {
  let frame = 0;
  const words: TranscriptWord[] = [];
  const paragraphs: TranscriptParagraph[] = [];
  for (const text of texts) {
    const startFrame = frame;
    for (const value of text.split(' ')) {
      words.push({
        word: value,
        startFrame: frame,
        endFrame: frame + 6,
        confidence: 1,
      });
      frame += 8;
    }
    paragraphs.push({ startFrame, endFrame: frame - 2, text });
    frame += 30;
  }
  return {
    settings: { frameRate: 30 },
    assets: [{ id: 'recording', type: 'recording' }],
    transcript: { words, paragraphs, nonSpeech: [] },
    timeline: {
      sources: [
        {
          id: 'screen-source',
          kind: 'screen',
          mediaType: 'video',
          assetId: 'recording',
          label: 'Screen',
          duration: frame,
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
              id: 'screen-clip',
              mediaId: 'screen-source',
              trackId: 'screen-track',
              timelineIn: 0,
              timelineOut: frame,
              sourceIn: 0,
              sourceOut: frame,
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

describe('retry replacement suggestions', () => {
  it('suggests removing a failed command when a later successful retry replaces it', () => {
    const document = projectFromParagraphs([
      'run pnpm build',
      'the build failed with an error',
      'run pnpm build and now it passes',
    ]);

    const [suggestion] = deriveRetryReplacementSuggestions(document);

    expect(suggestion?.disposition).toBe('suggest-remove');
    expect(suggestion?.reason).toContain('spoken failure');
    expect(suggestion?.replacement.sourceStartFrame).toBe(
      document.transcript?.paragraphs[2]?.startFrame,
    );
    expect(suggestion?.evidence.map((evidence) => evidence.kind)).toEqual([
      'repeated-meaning',
      'spoken-error',
      'later-completion',
    ]);
  });

  it('maps a corrected command to the complete later take', () => {
    const [suggestion] = deriveRetryReplacementSuggestions(
      projectFromParagraphs([
        'install the package',
        'actually install the package with pnpm instead',
      ]),
    );

    expect(suggestion?.disposition).toBe('suggest-remove');
    expect(suggestion?.reason).toContain('Correction language');
    expect(suggestion?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('uses trustworthy screen outcomes when speech does not name failure or success', () => {
    const document = projectFromParagraphs([
      'run pnpm build',
      'check the terminal output',
      'run pnpm build',
    ]);
    const paragraphs = document.transcript!.paragraphs;
    const [suggestion] = deriveRetryReplacementSuggestions(document, {
      screenOutcomes: [
        {
          frame: paragraphs[1]!.startFrame,
          outcome: 'failure',
          detail: 'terminal exited with status 1',
        },
        {
          frame: paragraphs[2]!.endFrame,
          outcome: 'success',
          detail: 'terminal exited with status 0',
        },
      ],
    });

    expect(suggestion?.disposition).toBe('suggest-remove');
    expect(suggestion?.reason).toContain('failed screen outcome');
    expect(suggestion?.evidence.map((evidence) => evidence.kind)).toEqual([
      'repeated-meaning',
      'screen-failure',
      'screen-success',
    ]);
  });

  it('keeps an abandoned explanation flagged when replacement evidence is uncertain', () => {
    const [suggestion] = deriveRetryReplacementSuggestions(
      projectFromParagraphs([
        'the resolver maps every source frame',
        'the resolver maps every source frame into the final timeline result',
      ]),
    );

    expect(suggestion?.disposition).toBe('keep-flagged');
    expect(suggestion?.reason).toContain('not certain enough to cut');
  });

  it('maps an exact repeated sentence to its explicitly corrected take', () => {
    const [suggestion] = deriveRetryReplacementSuggestions(
      projectFromParagraphs([
        'the preview follows the canonical timeline',
        'sorry the preview follows the canonical timeline and now works',
      ]),
    );

    expect(suggestion?.disposition).toBe('suggest-remove');
    expect(suggestion?.replacement.sourceStartFrame).toBeGreaterThan(
      suggestion?.remove.sourceEndFrame ?? Number.POSITIVE_INFINITY,
    );
    expect(suggestion?.evidence.map((evidence) => evidence.kind)).toContain(
      'correction-language',
    );
  });

  it('never proposes deleting legitimate repeated teaching material', () => {
    const suggestions = deriveRetryReplacementSuggestions(
      projectFromParagraphs([
        'remember the timeline is canonical',
        'next we edit the preview',
        'remember the timeline is canonical',
      ]),
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.disposition).toBe('keep-flagged');
  });

  it('returns deterministic source boundaries and replacement mappings', () => {
    const document = projectFromParagraphs([
      'test the export',
      'the export crashed',
      'test the export and it works',
    ]);

    const first = deriveRetryReplacementSuggestions(document);
    const second = deriveRetryReplacementSuggestions(document);

    expect(first).toEqual(second);
    expect(first[0]?.remove.timelineRanges).toEqual([
      {
        startFrame: 0,
        endFrame: 22,
        clipId: 'screen-clip',
        sourceId: 'screen-source',
      },
    ]);
    expect(first[0]?.replacement.timelineRanges).toHaveLength(1);
  });

  it('offers a nearby trailing-pause boundary without changing the default cut', () => {
    const document = projectFromParagraphs([
      'run the test',
      'the test failed',
      'run the test and now it passes',
    ]) as unknown as {
      transcript: {
        words: TranscriptWord[];
        paragraphs: TranscriptParagraph[];
        nonSpeech: Array<{
          kind: 'silence';
          startFrame: number;
          endFrame: number;
        }>;
      };
    };
    const firstEnd = document.transcript.paragraphs[0]!.endFrame;
    document.transcript.nonSpeech = [
      { kind: 'silence', startFrame: firstEnd + 2, endFrame: firstEnd + 20 },
    ];

    const [suggestion] = deriveRetryReplacementSuggestions(
      document as unknown as ProjectDocument,
    );

    expect(suggestion?.remove.sourceEndFrame).toBe(firstEnd);
    expect(suggestion?.alternatives).toEqual([
      expect.objectContaining({
        label: 'include-trailing-pause',
        sourceEndFrame: firstEnd + 20,
      }),
    ]);
  });
});
