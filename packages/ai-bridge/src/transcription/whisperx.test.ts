import { describe, expect, it } from 'vitest';
import { whisperXToTranscriptWords } from './whisperx.js';

describe('whisperXToTranscriptWords', () => {
  it('parses word_segments output', () => {
    const words = whisperXToTranscriptWords(
      {
        word_segments: [
          { word: 'Hello', start: 0, end: 0.5, score: 0.9 },
          { word: 'world', start: 0.5, end: 1.0, score: 0.8 },
        ],
      },
      30,
    );

    expect(words).toEqual([
      { word: 'Hello', startFrame: 0, endFrame: 15, confidence: 0.9 },
      { word: 'world', startFrame: 15, endFrame: 30, confidence: 0.8 },
    ]);
  });

  it('falls back to segment words output', () => {
    const words = whisperXToTranscriptWords(
      {
        segments: [
          {
            text: 'Hello world',
            words: [
              { text: 'Hello', start: 0, end: 0.25 },
              { text: 'world', start: 0.25, end: 0.75 },
            ],
          },
        ],
      },
      40,
    );

    expect(words[0]?.word).toBe('Hello');
    expect(words[1]?.endFrame).toBe(30);
  });
});
