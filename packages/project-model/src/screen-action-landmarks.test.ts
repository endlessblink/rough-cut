import { describe, expect, it } from 'vitest';
import type { ProjectDocument, TranscriptWord } from './types.js';
import {
  deriveScreenActionLandmarks,
  searchScreenActionLandmarks,
  timelineFrameForScreenActionLandmark,
} from './screen-action-landmarks.js';

function word(value: string, startFrame: number, endFrame: number): TranscriptWord {
  return { word: value, startFrame, endFrame, confidence: 1 } as TranscriptWord;
}

function project({ withCursor = true }: { withCursor?: boolean } = {}): ProjectDocument {
  return {
    settings: { frameRate: 30 },
    assets: [
      {
        id: 'recording-asset',
        type: 'recording',
        metadata: withCursor
          ? { cursorEvents: [{ frame: 35, type: 'down', x: 100, y: 100 }] }
          : {},
      },
    ],
    transcript: {
      words: [
        word('Now', 0, 8),
        word('run', 10, 18),
        word('pnpm', 20, 28),
        word('test', 30, 40),
        word('the', 50, 58),
        word('build', 60, 70),
        word('failed', 72, 84),
      ],
      paragraphs: [],
      nonSpeech: [{ kind: 'silence', startFrame: 120, endFrame: 240 }],
    },
    timeline: {
      sources: [
        {
          id: 'screen-source',
          kind: 'screen',
          mediaType: 'video',
          assetId: 'recording-asset',
          label: 'Screen',
          duration: 300,
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
              timelineOut: 300,
              sourceIn: 0,
              sourceOut: 300,
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

describe('screen-action landmarks', () => {
  it('derives conservative command, error, and wait landmarks with evidence', () => {
    const landmarks = deriveScreenActionLandmarks(project());

    expect(landmarks.map((landmark) => landmark.kind)).toEqual([
      'command',
      'error',
      'wait',
    ]);
    expect(landmarks[0]?.label).toBe('Command: run pnpm test');
    expect(landmarks[0]?.evidence.map((evidence) => evidence.source)).toEqual([
      'transcript',
      'cursor',
    ]);
    expect(landmarks[0]?.confidence).toBe(0.84);
    expect(landmarks[1]?.label).toContain('failed');
    expect(landmarks[2]?.label).toBe('Wait: 4s silence');
  });

  it('is searchable and seeks through the canonical timeline', () => {
    const landmarks = deriveScreenActionLandmarks(project());
    const failures = searchScreenActionLandmarks(landmarks, 'failed');

    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe('error');
    expect(timelineFrameForScreenActionLandmark(failures[0]!)).toBe(72);
    expect(searchScreenActionLandmarks(landmarks, 'silence')[0]?.kind).toBe('wait');
  });

  it('degrades to transcript and non-speech evidence when cursor telemetry is absent', () => {
    const landmarks = deriveScreenActionLandmarks(project({ withCursor: false }));

    expect(landmarks).toHaveLength(3);
    expect(landmarks[0]?.evidence.map((evidence) => evidence.source)).toEqual([
      'transcript',
    ]);
    expect(landmarks[0]?.confidence).toBe(0.78);
  });

  it('does not emit lexical near-matches or short pauses', () => {
    const document = project({ withCursor: false }) as unknown as {
      transcript: {
        words: TranscriptWord[];
        paragraphs: never[];
        nonSpeech: Array<{ kind: 'silence'; startFrame: number; endFrame: number }>;
      };
    };
    document.transcript.words = [word('runner', 0, 10), word('successful', 12, 20)];
    document.transcript.nonSpeech = [{ kind: 'silence', startFrame: 30, endFrame: 60 }];

    expect(deriveScreenActionLandmarks(document as unknown as ProjectDocument)).toEqual([]);
  });

  it('conservatively identifies application, file, and visible-state changes', () => {
    const document = project({ withCursor: false }) as unknown as {
      transcript: {
        words: TranscriptWord[];
        paragraphs: never[];
        nonSpeech: never[];
      };
    };
    document.transcript.words = [
      word('switch', 0, 8),
      word('to', 10, 14),
      word('terminal', 16, 28),
      word('open', 40, 48),
      word('package.json', 50, 68),
      word('now', 80, 88),
      word('we', 90, 94),
      word('see', 96, 104),
    ];
    document.transcript.nonSpeech = [];

    const landmarks = deriveScreenActionLandmarks(
      document as unknown as ProjectDocument,
    );

    expect(landmarks.map((landmark) => landmark.kind)).toEqual([
      'application-change',
      'file-change',
      'visual-change',
    ]);
    expect(landmarks.map((landmark) => landmark.label)).toEqual([
      'Application: switch to terminal',
      'File: open package.json',
      'Visual change: now we see',
    ]);
  });
});
