import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFrameWithRetry } from './graphics-capture.mjs';

const image = (empty = false) => ({ isEmpty: () => empty, tag: empty ? 'empty' : 'ok' });
const wc = (answers) => {
  const calls = { invalidate: 0, capture: [] };
  return {
    calls,
    invalidate() { calls.invalidate += 1; },
    async capturePage(rect) {
      calls.capture.push(rect);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
};
const noSleep = async () => undefined;

test('a good capture is returned straight away, with an explicit rectangle', async () => {
  const contents = wc([image()]);
  const result = await captureFrameWithRetry(contents, { width: 1920, height: 1080, sleep: noSleep });
  assert.equal(result.tag, 'ok');
  assert.deepEqual(contents.calls.capture, [{ x: 0, y: 0, width: 1920, height: 1080 }]);
});

test('an empty or rejected capture is retried and the frame is still obtained', async () => {
  const contents = wc([image(true), new Error('Current display surface not available for capture'), image()]);
  const waits = [];
  const result = await captureFrameWithRetry(contents, { width: 10, height: 10, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(result.tag, 'ok');
  assert.equal(contents.calls.capture.length, 3);
  assert.equal(contents.calls.invalidate, 3);
  assert.deepEqual(waits, [120, 240]);
});

test('if every try fails the error says why, so the export can report it', async () => {
  const contents = wc([image(true), image(true), new Error('GPU process gone')]);
  await assert.rejects(
    () => captureFrameWithRetry(contents, { width: 10, height: 10, sleep: noSleep }),
    /Could not capture an animation frame after 3 tries: GPU process gone/,
  );
});
