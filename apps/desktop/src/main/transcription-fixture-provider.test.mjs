import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTranscriptionFixtureProvider,
  loadTranscriptionFixture,
} from './transcription-fixture-provider.mjs';

const fixture = {
  durationMs: 2_000,
  fps: 30,
  words: [
    { word: 'first', startFrame: 0, endFrame: 10, confidence: 1 },
    { word: 'second', startFrame: 31, endFrame: 45, confidence: 0.9 },
  ],
  paragraphs: [
    { text: 'first', startFrame: 0, endFrame: 10 },
    { text: 'second', startFrame: 31, endFrame: 45 },
  ],
  nonSpeech: [{ kind: 'silence', startFrame: 20, endFrame: 30 }],
};

test('fixture provider emits each item from the chunk where it starts', async () => {
  const provider = createTranscriptionFixtureProvider(fixture);

  assert.deepEqual(provider.descriptor, {
    id: 'deterministic-fixture',
    model: 'fixture-v1',
  });
  assert.equal(provider.durationMs, 2_000);
  assert.deepEqual(await provider.transcribeChunk({ startMs: 0, endMs: 1_000 }), {
    words: [fixture.words[0]],
    paragraphs: [fixture.paragraphs[0]],
    nonSpeech: [fixture.nonSpeech[0]],
  });
  assert.deepEqual(await provider.transcribeChunk({ startMs: 1_000, endMs: 2_000 }), {
    words: [fixture.words[1]],
    paragraphs: [fixture.paragraphs[1]],
    nonSpeech: [],
  });
});

test('fixture loader rejects malformed transcript data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-fixture-'));
  try {
    const validPath = join(dir, 'valid.json');
    await writeFile(validPath, JSON.stringify(fixture), 'utf8');
    assert.deepEqual(await loadTranscriptionFixture(validPath), fixture);

    const invalidPath = join(dir, 'invalid.json');
    await writeFile(
      invalidPath,
      JSON.stringify({ ...fixture, words: [{ text: 'wrong' }] }),
      'utf8',
    );
    await assert.rejects(() => loadTranscriptionFixture(invalidPath), /fixture word/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

