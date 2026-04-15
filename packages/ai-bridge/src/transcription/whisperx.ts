export interface TranscriptWord {
  readonly word: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly confidence: number;
}

export interface WhisperXWord {
  readonly word?: string;
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
  readonly score?: number;
  readonly confidence?: number;
}

export interface WhisperXSegment {
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
  readonly words?: readonly WhisperXWord[];
}

export interface WhisperXJson {
  readonly language?: string;
  readonly segments?: readonly WhisperXSegment[];
  readonly word_segments?: readonly WhisperXWord[];
}

export function whisperXToTranscriptWords(response: WhisperXJson, fps: number): TranscriptWord[] {
  const rawWords = Array.isArray(response.word_segments)
    ? response.word_segments
    : (response.segments ?? []).flatMap((segment) => segment.words ?? []);

  return rawWords
    .map((word) => {
      const text = typeof word.word === 'string' ? word.word : word.text;
      if (!text || typeof word.start !== 'number' || typeof word.end !== 'number') {
        return null;
      }

      return {
        word: text.trim(),
        startFrame: Math.round(word.start * fps),
        endFrame: Math.round(word.end * fps),
        confidence:
          typeof word.score === 'number'
            ? word.score
            : typeof word.confidence === 'number'
              ? word.confidence
              : 1,
      } satisfies TranscriptWord;
    })
    .filter((word): word is TranscriptWord => {
      return word !== null && word.word.length > 0;
    });
}
