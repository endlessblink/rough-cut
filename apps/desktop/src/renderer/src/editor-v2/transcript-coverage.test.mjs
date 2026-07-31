import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTranscriptCoverage,
  removeTranscriptBlockRanges,
  transcriptCoverageBlockIndexAtFrame,
} from './transcript-coverage.mjs';

test('finds the visible transcript block for the canonical playhead frame', () => {
  const blocks = [
    { kind: 'word', startFrame: 0, endFrame: 3 },
    { kind: 'word', startFrame: 3, endFrame: 6 },
    { kind: 'pause', startFrame: 6, endFrame: 9 },
  ];

  assert.equal(transcriptCoverageBlockIndexAtFrame(blocks, 0), 0);
  assert.equal(transcriptCoverageBlockIndexAtFrame(blocks, 3), 1);
  assert.equal(transcriptCoverageBlockIndexAtFrame(blocks, 8), 2);
  assert.equal(transcriptCoverageBlockIndexAtFrame(blocks, 9), 2);
  assert.equal(transcriptCoverageBlockIndexAtFrame(blocks, -1), -1);
});

function transcriptDocument({ words = [], paragraphs = [], nonSpeech = [] } = {}) {
  return { transcript: { words, paragraphs, nonSpeech } };
}

function word(text, startFrame, endFrame, confidence = 0.9) {
  return { word: text, startFrame, endFrame, confidence };
}

test('covers the complete duration with ordered contiguous non-overlapping blocks', () => {
  const blocks = buildTranscriptCoverage(
    transcriptDocument({
      words: [word('hello', 5, 12), word('world', 18, 25)],
      nonSpeech: [
        { kind: 'silence', startFrame: 0, endFrame: 8 },
        { kind: 'music', startFrame: 25, endFrame: 30 },
      ],
    }),
    35,
  );

  assert.equal(blocks[0].startFrame, 0);
  assert.equal(blocks.at(-1).endFrame, 35);
  assert.equal(
    blocks.reduce(
      (duration, block) => duration + block.endFrame - block.startFrame,
      0,
    ),
    35,
  );
  for (let index = 1; index < blocks.length; index += 1) {
    assert.equal(blocks[index - 1].endFrame, blocks[index].startFrame);
  }
  assert.deepEqual(
    blocks.map(({ kind, startFrame, endFrame }) => ({
      kind,
      startFrame,
      endFrame,
    })),
    [
      { kind: 'pause', startFrame: 0, endFrame: 5 },
      { kind: 'word', startFrame: 5, endFrame: 12 },
      { kind: 'unrecognized', startFrame: 12, endFrame: 18 },
      { kind: 'word', startFrame: 18, endFrame: 25 },
      { kind: 'music', startFrame: 25, endFrame: 30 },
      { kind: 'unrecognized', startFrame: 30, endFrame: 35 },
    ],
  );
});

test('represents omitted speech as unrecognized and explicit silence as pause', () => {
  const blocks = buildTranscriptCoverage(
    transcriptDocument({
      words: [word('heard', 10, 20)],
      nonSpeech: [{ kind: 'silence', startFrame: 20, endFrame: 30 }],
    }),
    40,
  );

  assert.deepEqual(
    blocks.map(({ kind, startFrame, endFrame }) => [
      kind,
      startFrame,
      endFrame,
    ]),
    [
      ['unrecognized', 0, 10],
      ['word', 10, 20],
      ['pause', 20, 30],
      ['unrecognized', 30, 40],
    ],
  );
});

test('gives words priority over overlapping non-speech', () => {
  const blocks = buildTranscriptCoverage(
    transcriptDocument({
      words: [word('spoken', 5, 15, 0.73)],
      nonSpeech: [{ kind: 'noise', startFrame: 0, endFrame: 20 }],
    }),
    20,
  );

  assert.deepEqual(blocks, [
    { kind: 'noise', startFrame: 0, endFrame: 5 },
    {
      kind: 'word',
      startFrame: 5,
      endFrame: 15,
      wordIndex: 0,
      text: 'spoken',
      confidence: 0.73,
    },
    { kind: 'noise', startFrame: 15, endFrame: 20 },
  ]);
});

test('removes coalesced selected ranges and shifts remaining transcript timing', () => {
  const document = transcriptDocument({
    words: [
      word('keep', 0, 10),
      word('remove', 10, 20),
      word('after', 25, 35),
    ],
    paragraphs: [
      { text: 'keep remove after', startFrame: 0, endFrame: 35, speaker: 'A' },
    ],
    nonSpeech: [
      { kind: 'silence', startFrame: 20, endFrame: 25 },
      { kind: 'music', startFrame: 35, endFrame: 45 },
    ],
  });

  const result = removeTranscriptBlockRanges(document, [
    { startFrame: 10, endFrame: 20 },
    { startFrame: 20, endFrame: 25 },
  ]);

  assert.deepEqual(result.removals, [
    {
      suggestionId: 'transcript-block:10:25:0',
      startFrame: 10,
      endFrame: 25,
    },
  ]);
  assert.deepEqual(result.document.transcript.words, [
    word('keep', 0, 10),
    word('after', 10, 20),
  ]);
  assert.deepEqual(result.document.transcript.paragraphs, [
    { text: 'keep remove after', startFrame: 0, endFrame: 20, speaker: 'A' },
  ]);
  assert.deepEqual(result.document.transcript.nonSpeech, [
    { kind: 'music', startFrame: 20, endFrame: 30 },
  ]);
});

test('keeps repeated words as distinct indexed blocks', () => {
  const blocks = buildTranscriptCoverage(
    transcriptDocument({
      words: [word('again', 0, 5), word('again', 5, 10)],
    }),
    10,
  );

  assert.deepEqual(
    blocks.map(({ wordIndex, text, startFrame, endFrame }) => ({
      wordIndex,
      text,
      startFrame,
      endFrame,
    })),
    [
      { wordIndex: 0, text: 'again', startFrame: 0, endFrame: 5 },
      { wordIndex: 1, text: 'again', startFrame: 5, endFrame: 10 },
    ],
  );
});

test('absorbs meaningless micro-gaps while preserving complete coverage', () => {
  const blocks = buildTranscriptCoverage(
    transcriptDocument({
      words: [word('one', 0, 5), word('two', 6, 12)],
    }),
    12,
    { minimumReviewFrames: 3 },
  );

  assert.deepEqual(blocks, [
    {
      kind: 'word',
      startFrame: 0,
      endFrame: 6,
      wordIndex: 0,
      text: 'one',
      confidence: 0.9,
    },
    {
      kind: 'word',
      startFrame: 6,
      endFrame: 12,
      wordIndex: 1,
      text: 'two',
      confidence: 0.9,
    },
  ]);
});
