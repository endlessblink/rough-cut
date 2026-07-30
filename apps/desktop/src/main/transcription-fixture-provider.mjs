import { readFile } from 'node:fs/promises';

function positiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function validFrameRange(item) {
  return (
    item &&
    Number.isInteger(item.startFrame) &&
    Number.isInteger(item.endFrame) &&
    item.startFrame >= 0 &&
    item.endFrame >= item.startFrame
  );
}

function validateFixture(fixture) {
  if (!fixture || typeof fixture !== 'object') {
    throw new Error('Transcription fixture must be an object');
  }
  positiveNumber(fixture.durationMs, 'Transcription fixture duration');
  positiveNumber(fixture.fps, 'Transcription fixture fps');
  if (!Array.isArray(fixture.words)) throw new Error('Transcription fixture words are required');
  if (!Array.isArray(fixture.paragraphs)) {
    throw new Error('Transcription fixture paragraphs are required');
  }
  if (!Array.isArray(fixture.nonSpeech)) {
    throw new Error('Transcription fixture non-speech ranges are required');
  }
  for (const word of fixture.words) {
    if (
      !validFrameRange(word) ||
      typeof word.word !== 'string' ||
      !word.word.trim() ||
      !Number.isFinite(word.confidence) ||
      word.confidence < 0 ||
      word.confidence > 1
    ) {
      throw new Error('Invalid transcription fixture word');
    }
  }
  for (const paragraph of fixture.paragraphs) {
    if (
      !validFrameRange(paragraph) ||
      typeof paragraph.text !== 'string' ||
      !paragraph.text.trim()
    ) {
      throw new Error('Invalid transcription fixture paragraph');
    }
  }
  for (const segment of fixture.nonSpeech) {
    if (
      !validFrameRange(segment) ||
      !['silence', 'music', 'noise'].includes(segment.kind)
    ) {
      throw new Error('Invalid transcription fixture non-speech range');
    }
  }
  return fixture;
}

export async function loadTranscriptionFixture(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read transcription fixture: ${filePath}`, { cause: error });
  }
  return validateFixture(parsed);
}

export function createTranscriptionFixtureProvider(input) {
  const fixture = validateFixture(structuredClone(input));
  const atChunkStart = (item, startFrame, endFrame) =>
    item.startFrame >= startFrame && item.startFrame < endFrame;

  return {
    descriptor: { id: 'deterministic-fixture', model: 'fixture-v1' },
    durationMs: fixture.durationMs,
    fps: fixture.fps,
    async transcribeChunk({ startMs, endMs, signal }) {
      if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');
      const startFrame = Math.floor((startMs / 1_000) * fixture.fps);
      const endFrame = Math.ceil((endMs / 1_000) * fixture.fps);
      return {
        words: fixture.words.filter((item) => atChunkStart(item, startFrame, endFrame)),
        paragraphs: fixture.paragraphs.filter((item) =>
          atChunkStart(item, startFrame, endFrame),
        ),
        nonSpeech: fixture.nonSpeech.filter((item) =>
          atChunkStart(item, startFrame, endFrame),
        ),
      };
    },
  };
}
