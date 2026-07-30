import { describe, expect, it } from 'vitest';
import type { ProjectDocument } from './types.js';
import {
  planNaturalJoin,
  scoreVisualDiscontinuity,
} from './natural-join.js';

function project({
  words,
  nonSpeech = [],
}: {
  words: readonly {
    word: string;
    startFrame: number;
    endFrame: number;
    confidence: number;
  }[];
  nonSpeech?: readonly {
    kind: 'silence' | 'music' | 'noise';
    startFrame: number;
    endFrame: number;
  }[];
}): ProjectDocument {
  return {
    transcript: { words, paragraphs: [], nonSpeech },
    timeline: {
      sources: [
        {
          id: 'screen',
          kind: 'screen',
          mediaType: 'video',
          label: 'Screen',
          duration: 300,
        },
      ],
      linkedGroups: [],
      tracks: [
        {
          id: 'video',
          kind: 'video',
          index: 0,
          label: 'Video',
          enabled: true,
          locked: false,
          muted: false,
          clips: [
            {
              id: 'clip',
              mediaId: 'screen',
              trackId: 'video',
              timelineIn: 0,
              timelineOut: 300,
              sourceIn: 0,
              sourceOut: 300,
            },
          ],
        },
      ],
      markers: [],
      effects: [],
    },
  } as unknown as ProjectDocument;
}

describe('natural join planning', () => {
  it('moves word cuts into nearby silence without clipping adjacent speech', () => {
    const document = project({
      words: [
        { word: 'before', startFrame: 70, endFrame: 90, confidence: 1 },
        { word: 'remove', startFrame: 100, endFrame: 130, confidence: 1 },
        { word: 'after', startFrame: 140, endFrame: 160, confidence: 1 },
      ],
      nonSpeech: [
        { kind: 'silence', startFrame: 92, endFrame: 98 },
        { kind: 'silence', startFrame: 132, endFrame: 138 },
      ],
    });

    const plan = planNaturalJoin(document, [
      { startFrame: 100, endFrame: 130, sourceId: 'screen', clipId: 'clip' },
    ]);

    expect(plan.refinedRanges).toEqual([
      { startFrame: 95, endFrame: 135, sourceId: 'screen', clipId: 'clip' },
    ]);
    expect(plan.audioSafety).toBe('safe');
    expect(plan.crossfadeFrames).toBe(2);
    expect(plan.alternatives).toEqual([
      expect.objectContaining({ id: 'requested', ranges: plan.requestedRanges }),
      expect.objectContaining({ id: 'silence-safe', ranges: plan.refinedRanges }),
    ]);
  });

  it('keeps exact boundaries and warns when speech has no safe gap', () => {
    const document = project({
      words: [
        { word: 'before', startFrame: 70, endFrame: 100, confidence: 1 },
        { word: 'remove', startFrame: 100, endFrame: 130, confidence: 1 },
        { word: 'after', startFrame: 130, endFrame: 160, confidence: 1 },
      ],
    });

    const plan = planNaturalJoin(document, [
      { startFrame: 100, endFrame: 130, sourceId: 'screen', clipId: 'clip' },
    ]);

    expect(plan.refinedRanges).toEqual(plan.requestedRanges);
    expect(plan.audioSafety).toBe('caution');
    expect(plan.crossfadeFrames).toBe(2);
    expect(plan.audioWarning).toMatch(/no nearby silence/i);
  });

  it('scores visual state independently from speech safety', () => {
    const same = scoreVisualDiscontinuity(
      Uint8Array.from([20, 40, 60, 255, 30, 50, 70, 255]),
      Uint8Array.from([20, 40, 60, 255, 30, 50, 70, 255]),
    );
    const jump = scoreVisualDiscontinuity(
      Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255]),
      Uint8Array.from([255, 255, 255, 255, 255, 255, 255, 255]),
    );

    expect(same).toEqual({ score: 0, warning: false });
    expect(jump.score).toBe(1);
    expect(jump.warning).toBe(true);
  });
});
