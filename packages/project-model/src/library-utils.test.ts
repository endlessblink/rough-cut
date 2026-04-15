import { describe, expect, it } from 'vitest';
import {
  createLibraryDocument,
  createLibrarySource,
  createLibraryTranscriptSegment,
  createTranscriptWord,
} from './factories.js';
import { updateLibrarySourceTranscript } from './library-utils.js';

describe('updateLibrarySourceTranscript', () => {
  it('replaces transcript segments and records transcription metadata', () => {
    const source = createLibrarySource('video', '/tmp/interview.mp4');
    const library = createLibraryDocument('Interview', { sources: [source] });
    const transcript = [
      createLibraryTranscriptSegment(0, 30, 'Hello world', [
        createTranscriptWord('Hello', 0, 12),
        createTranscriptWord('world', 13, 30),
      ]),
    ];

    const updated = updateLibrarySourceTranscript(library, source.id, transcript, {
      provider: 'groq',
      model: 'whisper-large-v3',
      fps: 30,
      transcribedAt: '2026-04-15T12:00:00.000Z',
      language: 'en',
    });

    expect(updated.modifiedAt).toBe('2026-04-15T12:00:00.000Z');
    expect(updated.sources[0]?.transcriptSegments).toEqual(transcript);
    expect(updated.sources[0]?.metadata).toMatchObject({
      transcription: {
        provider: 'groq',
        model: 'whisper-large-v3',
        fps: 30,
        transcribedAt: '2026-04-15T12:00:00.000Z',
        segmentCount: 1,
        wordCount: 2,
        language: 'en',
      },
    });
  });

  it('throws when the source is missing', () => {
    const library = createLibraryDocument();

    expect(() =>
      updateLibrarySourceTranscript(
        library,
        'missing-source' as (typeof library.sources)[number]['id'],
        [],
        {
          provider: 'groq',
          model: 'whisper-large-v3',
          fps: 30,
          transcribedAt: '2026-04-15T12:00:00.000Z',
        },
      ),
    ).toThrow(/Library source not found/);
  });
});
