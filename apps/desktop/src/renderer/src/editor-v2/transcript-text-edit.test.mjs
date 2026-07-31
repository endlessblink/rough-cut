import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTranscriptTextEdit } from './transcript-text-edit.mjs';

function documentWithWords(tokens) {
  return {
    transcript: {
      words: tokens.map((word, index) => ({
        word,
        startFrame: index * 10,
        endFrame: (index + 1) * 10,
        confidence: 0.9,
      })),
      paragraphs: [],
      nonSpeech: [],
    },
  };
}

test('same-count wording corrections preserve every word timing', () => {
  const original = documentWithWords(['שלום', 'עולם']);
  const result = applyTranscriptTextEdit(original, 'שלום לכולם', 20);

  assert.deepEqual(result.removals, []);
  assert.deepEqual(
    result.document.transcript.words.map(({ word, startFrame, endFrame }) => ({
      word,
      startFrame,
      endFrame,
    })),
    [
      { word: 'שלום', startFrame: 0, endFrame: 10 },
      { word: 'לכולם', startFrame: 10, endFrame: 20 },
    ],
  );
});

test('deleting one repeated word creates one timed cut and keeps the repetition around it', () => {
  const original = documentWithWords(['אני', 'רוצה', 'רוצה', 'לנסות']);
  const result = applyTranscriptTextEdit(original, 'אני רוצה לנסות', 40);

  assert.equal(result.removals.length, 1);
  assert.equal(result.removals[0].endFrame - result.removals[0].startFrame, 10);
  assert.deepEqual(
    result.document.transcript.words.map(({ word, startFrame, endFrame }) => ({
      word,
      startFrame,
      endFrame,
    })),
    [
      { word: 'אני', startFrame: 0, endFrame: 10 },
      { word: 'רוצה', startFrame: 10, endFrame: 20 },
      { word: 'לנסות', startFrame: 20, endFrame: 30 },
    ],
  );
});

test('deleting a phrase returns its exact contiguous media range', () => {
  const original = documentWithWords(['אחד', 'שתיים', 'שלוש', 'ארבע']);
  const result = applyTranscriptTextEdit(original, 'אחד ארבע', 40);

  assert.deepEqual(
    result.removals.map(({ startFrame, endFrame }) => ({ startFrame, endFrame })),
    [{ startFrame: 10, endFrame: 30 }],
  );
});
