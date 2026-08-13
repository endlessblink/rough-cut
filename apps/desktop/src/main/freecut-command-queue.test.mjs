import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreecutCommandQueue } from './freecut-command-queue.mjs';

test('FreeCut writes are serialized per project', async () => {
  const queue = createFreecutCommandQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = queue.enqueue({ projectId: 'p1', opId: 'op-1', run: async () => { events.push('first-start'); await firstGate; events.push('first-end'); } });
  const second = queue.enqueue({ projectId: 'p1', opId: 'op-2', run: async () => events.push('second') });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['first-start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('retrying an operation returns the original receipt without saving twice', async () => {
  const queue = createFreecutCommandQueue();
  let runs = 0;
  const run = () => { runs += 1; return Promise.resolve({ ok: true, opId: 'same' }); };
  const first = queue.enqueue({ projectId: 'p1', opId: 'same', run });
  const retry = queue.enqueue({ projectId: 'p1', opId: 'same', run });
  assert.strictEqual(first, retry);
  assert.deepEqual(await retry, { ok: true, opId: 'same' });
  assert.equal(runs, 1);
});

test('different projects do not block one another', async () => {
  const queue = createFreecutCommandQueue();
  const events = [];
  await Promise.all([
    queue.enqueue({ projectId: 'p1', opId: 'p1-op', run: async () => events.push('p1') }),
    queue.enqueue({ projectId: 'p2', opId: 'p2-op', run: async () => events.push('p2') }),
  ]);
  assert.deepEqual(events.sort(), ['p1', 'p2']);
});
