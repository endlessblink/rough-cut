// Regression (2026-10-20, Noam: "Claude took too long to answer" while generating an
// animation): one slow Opus answer past the 240 s limit ended the job. Graphics now wait
// longer and ask once more on a timeout, and the progress says what is happening.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { CLAUDE_SLOW_RETRY_REASON, CLAUDE_TIMEOUT_MS, askClaudeForJson, runClaudeOnce } from './claude-cli.mjs';
import { GRAPHICS_TIMEOUT_MS, generateGraphic } from './claude-graphics-service.mjs';

const readyConnection = async () => ({ ok: true, status: 'ready' });
const answer = { ok: true, stdout: JSON.stringify({ type: 'result', subtype: 'success', structured_output: { title: 't', durationSec: 4, html: '<div>x</div>', fields: [] } }) };
const timedOut = { ok: false, timedOut: true, reason: 'Claude took too long to answer.' };

test('a graphic that times out once is asked for again and succeeds, with honest progress', async () => {
  const calls = [];
  const progress = [];
  const runOnce = async (options) => {
    calls.push(options.timeoutMs);
    return calls.length === 1 ? timedOut : answer;
  };
  const result = await generateGraphic({ request: 'a counter that shrinks', binary: '/bin/true', runOnce, connectionCheck: readyConnection, onProgress: (event) => progress.push(event) });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2, 'asked twice');
  assert.deepEqual(calls, [GRAPHICS_TIMEOUT_MS, GRAPHICS_TIMEOUT_MS]);
  assert.ok(GRAPHICS_TIMEOUT_MS >= 400_000, 'graphics wait well past the old 240 s');
  const retry = progress.filter((event) => event.stage === 'writing')[1];
  assert.equal(retry.retryReason, CLAUDE_SLOW_RETRY_REASON);
  assert.equal(retry.attempt, 1, 'a slow answer does not count as a failed attempt');
});

test('two timeouts in a row still end with the plain message', async () => {
  let count = 0;
  const result = await generateGraphic({ request: 'x', binary: '/bin/true', runOnce: async () => { count += 1; return timedOut; }, connectionCheck: readyConnection });
  assert.equal(result.ok, false);
  assert.match(result.reason, /took too long/);
  assert.equal(count, 2);
});

test('other Claude requests keep the short limit and no timeout retry', async () => {
  let count = 0;
  const seen = [];
  const result = await askClaudeForJson({
    systemPrompt: 's', schema: {}, buildPrompt: () => 'p', binary: '/bin/true', connectionCheck: readyConnection,
    runOnce: async (options) => { count += 1; seen.push(options.timeoutMs); return timedOut; },
  });
  assert.equal(result.ok, false);
  assert.equal(count, 1);
  assert.deepEqual(seen, [CLAUDE_TIMEOUT_MS]);
});

test('a cancelled request is never retried', async () => {
  const controller = new AbortController();
  let count = 0;
  const result = await generateGraphic({
    request: 'x', binary: '/bin/true', connectionCheck: readyConnection, signal: controller.signal,
    runOnce: async () => { count += 1; controller.abort(); return timedOut; },
  });
  assert.equal(result.ok, false);
  assert.equal(count, 1);
});

test('the real runner stops a silent Claude at the limit and says it timed out', async () => {
  let killed = false;
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: () => undefined };
    child.kill = () => { killed = true; };
    return child;
  };
  const result = await runClaudeOnce({ binary: 'claude', args: [], prompt: 'p', timeoutMs: 30, spawnImpl });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(killed, true);
});
