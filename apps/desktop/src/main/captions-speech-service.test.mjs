import assert from 'node:assert/strict';
import test from 'node:test';
import { groupContiguousSections, wordsToSourceFrames } from './captions-speech-service.mjs';

test('clips that continue the same stretch of the recording are read together', () => {
  const groups = groupContiguousSections([
    { sourceIn: 1000, sourceOut: 1100 },
    { sourceIn: 1100, sourceOut: 1200 },
    { sourceIn: 5000, sourceOut: 5300 },
    { sourceIn: 0, sourceOut: 0 },
  ]);
  assert.deepEqual(groups, [{ sourceIn: 1000, sourceOut: 1200 }, { sourceIn: 5000, sourceOut: 5300 }]);
});

test('words land on the recording\'s own frames, offset by where the piece starts', () => {
  const words = wordsToSourceFrames([
    { word: ' Hello', start: 0.5, end: 0.9 },
    { word: 'world', start: 1, end: 1 },
    { word: '', start: 2, end: 3 },
  ], { sourceIn: 3000, fps: 30 });
  assert.deepEqual(words, [
    { word: 'Hello', startFrame: 3015, endFrame: 3027 },
    { word: 'world', startFrame: 3030, endFrame: 3031 },
  ]);
});
