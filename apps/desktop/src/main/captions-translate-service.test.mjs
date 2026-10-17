import assert from 'node:assert/strict';
import test from 'node:test';
import { translateCaptionLines, validateTranslation } from './captions-translate-service.mjs';

const lines = Array.from({ length: 100 }, (_, i) => ({ id: `cap_${i}`, text: `שורה ${i}` }));

// A stand-in for Claude: answers every requested id with "EN <id>". Never calls the real service.
function fakeAsk(calls) {
  return async ({ buildPrompt, validate, systemPrompt }) => {
    const prompt = buildPrompt([]);
    const requested = JSON.parse(prompt);
    calls.push({ size: requested.length, systemPrompt });
    const checked = validate({ lines: requested.map((item) => ({ id: item.id, text: `EN ${item.id}` })) });
    return checked.ok ? { ok: true, value: checked.value } : { ok: false, reason: checked.errors.join(';') };
  };
}

test('lines are translated in batches, keep their ids and order, and report progress', async () => {
  const calls = [];
  const progress = [];
  const result = await translateCaptionLines({ lines, targetLanguage: 'en', ask: fakeAsk(calls), onProgress: (p) => progress.push(p.done) });
  assert.equal(result.lines.length, 100);
  assert.deepEqual(result.lines.slice(0, 2), [{ id: 'cap_0', text: 'EN cap_0' }, { id: 'cap_1', text: 'EN cap_1' }]);
  assert.equal(result.lines[99].id, 'cap_99');
  assert.deepEqual(calls.map((c) => c.size).sort((a, b) => b - a), [45, 45, 10]);
  assert.match(calls[0].systemPrompt, /English/);
  assert.equal(progress.at(-1), 100);
});

test('an answer that skips lines is rejected so it can be retried', () => {
  const check = validateTranslation({ lines: [{ id: 'a', text: 'x' }] }, [{ id: 'a', text: '1' }, { id: 'b', text: '2' }]);
  assert.equal(check.ok, false);
  assert.match(check.errors[0], /missing ids: b/);
});

test('a Claude failure surfaces its plain reason', async () => {
  await assert.rejects(
    translateCaptionLines({ lines: lines.slice(0, 3), ask: async () => ({ ok: false, reason: 'Claude Code is not installed.' }) }),
    /Claude Code is not installed/,
  );
  assert.deepEqual(await translateCaptionLines({ lines: [], ask: async () => { throw new Error('unused'); } }), { lines: [] });
});
