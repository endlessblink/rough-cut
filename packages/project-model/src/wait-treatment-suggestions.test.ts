import { describe, expect, it } from 'vitest';
import type { ProjectDocument, TranscriptWord } from './types.js';
import { deriveWaitTreatmentSuggestions } from './wait-treatment-suggestions.js';

function project(): ProjectDocument {
  const words: TranscriptWord[] = [
    { word: 'run', startFrame: 0, endFrame: 8, confidence: 1 },
    { word: 'the', startFrame: 10, endFrame: 18, confidence: 1 },
    { word: 'build', startFrame: 20, endFrame: 30, confidence: 1 },
    { word: 'done', startFrame: 340, endFrame: 350, confidence: 1 },
  ];
  return {
    settings: { frameRate: 30 },
    assets: [{ id: 'recording', type: 'recording' }],
    transcript: {
      words,
      paragraphs: [],
      nonSpeech: [{ kind: 'silence', startFrame: 40, endFrame: 340 }],
    },
    timeline: {
      sources: [
        {
          id: 'screen-source',
          kind: 'screen',
          mediaType: 'video',
          assetId: 'recording',
          label: 'Screen',
          duration: 400,
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
              timelineOut: 400,
              sourceIn: 0,
              sourceOut: 400,
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

describe('wait treatment suggestions', () => {
  it('recommends removing a long wait when covered telemetry observes no progress', () => {
    const [suggestion] = deriveWaitTreatmentSuggestions(project(), {
      activitySamples: [],
    });

    expect(suggestion).toMatchObject({
      disposition: 'recommend',
      action: 'remove',
      operation: 'build',
      targetDurationFrames: 0,
      audioTreatment: 'mute',
      confidence: 0.92,
    });
    expect(suggestion?.reason).toContain('no meaningful screen progress');
  });

  it('compresses meaningful progress to a fixed short duration and softens audio', () => {
    const [suggestion] = deriveWaitTreatmentSuggestions(project(), {
      compressedDurationSeconds: 4,
      activitySamples: [
        {
          frame: 180,
          kind: 'terminal-output',
          meaningful: true,
          detail: 'build output advanced',
        },
      ],
    });

    expect(suggestion).toMatchObject({
      disposition: 'recommend',
      action: 'compress',
      targetDurationFrames: 120,
      audioTreatment: 'soften',
    });
    expect(suggestion?.activityEvidence).toHaveLength(1);
    expect(suggestion?.reason).toContain('screen progress should remain visible');
  });

  it('keeps and flags waits when activity telemetry is unavailable', () => {
    const [suggestion] = deriveWaitTreatmentSuggestions(project());

    expect(suggestion?.disposition).toBe('keep-flagged');
    expect(suggestion?.confidence).toBeLessThan(0.75);
    expect(suggestion?.reason).toContain('removal is uncertain');
  });

  it('keeps and flags a wait when telemetry covers only part of it', () => {
    const [suggestion] = deriveWaitTreatmentSuggestions(project(), {
      activitySamples: [],
      activityCoverage: [{ startFrame: 40, endFrame: 180 }],
    });

    expect(suggestion?.disposition).toBe('keep-flagged');
    expect(suggestion?.reason).toContain('telemetry is unavailable');
  });

  it.each([
    ['install', 'install'],
    ['loading', 'loading'],
    ['waiting', 'waiting'],
  ] as const)('labels a spoken %s operation', (spokenWord, operation) => {
    const document = project() as unknown as {
      transcript: { words: TranscriptWord[] };
    };
    document.transcript.words[2] = {
      word: spokenWord,
      startFrame: 20,
      endFrame: 30,
      confidence: 1,
    };

    const [suggestion] = deriveWaitTreatmentSuggestions(
      document as unknown as ProjectDocument,
      { activitySamples: [] },
    );

    expect(suggestion?.operation).toBe(operation);
  });

  it('clamps adjustable compressed duration to the two-to-four-second range', () => {
    const tooShort = deriveWaitTreatmentSuggestions(project(), {
      compressedDurationSeconds: 0.5,
      activitySamples: [
        { frame: 100, kind: 'cursor', meaningful: true, detail: 'dragging' },
      ],
    });
    const tooLong = deriveWaitTreatmentSuggestions(project(), {
      compressedDurationSeconds: 10,
      activitySamples: [
        { frame: 100, kind: 'visual-change', meaningful: true, detail: 'progress' },
      ],
    });

    expect(tooShort[0]?.targetDurationFrames).toBe(60);
    expect(tooLong[0]?.targetDurationFrames).toBe(120);
  });

  it('provides canonical before, treatment, and after ranges for preview', () => {
    const [suggestion] = deriveWaitTreatmentSuggestions(project(), {
      activitySamples: [],
    });

    expect(suggestion?.preview.before[0]).toMatchObject({
      startFrame: 0,
      endFrame: 40,
    });
    expect(suggestion?.preview.treatment[0]).toMatchObject({
      startFrame: 40,
      endFrame: 340,
    });
    expect(suggestion?.preview.after[0]).toMatchObject({
      startFrame: 340,
      endFrame: 400,
    });
  });

  it('ignores short pauses and silence already removed from the timeline', () => {
    const short = project() as unknown as {
      transcript: {
        nonSpeech: Array<{ kind: 'silence'; startFrame: number; endFrame: number }>;
      };
    };
    short.transcript.nonSpeech = [
      { kind: 'silence', startFrame: 40, endFrame: 80 },
    ];
    expect(
      deriveWaitTreatmentSuggestions(short as unknown as ProjectDocument, {
        activitySamples: [],
      }),
    ).toEqual([]);

    const removed = project() as unknown as {
      timeline: {
        tracks: Array<{ clips: unknown[] }>;
      };
    };
    removed.timeline.tracks[0]!.clips = [];
    expect(
      deriveWaitTreatmentSuggestions(removed as unknown as ProjectDocument, {
        activitySamples: [],
      }),
    ).toEqual([]);
  });
});
