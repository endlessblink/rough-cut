// Translate subtitle lines (e.g. Hebrew speech -> English captions).
//
// Uses the local Claude Code login through claude-cli, like the AI tab: no API key to manage.
// Lines keep their ids (and so their timing); only the wording changes. Long recordings are
// sent in batches so one slow answer never holds the whole job.

import { askClaudeForJson } from './claude-cli.mjs';

const LANGUAGE_NAMES = { en: 'English', he: 'Hebrew' };
const BATCH_SIZE = 45;
const CONCURRENCY = 3;

const SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: { id: { type: 'string' }, text: { type: 'string' } },
      },
    },
  },
});

export function languageName(code) {
  return LANGUAGE_NAMES[code] ?? String(code);
}

export function buildTranslationSystemPrompt(targetLanguage) {
  const target = languageName(targetLanguage);
  return [
    `You translate video subtitle lines into ${target}.`,
    'The lines come from a screen-recording tutorial/demo that was automatically transcribed, so they can contain small recognition mistakes: translate what the speaker most likely meant.',
    'Rules: keep each line short and natural for on-screen reading; keep product names, brand names and technical terms (for example "H3 Max", "Director", "API") as spoken; do not add commentary; do not merge, split, reorder or drop lines.',
    'Return every id you were given exactly once, with its translated text. An empty or meaningless line stays an empty string.',
  ].join('\n');
}

export function buildTranslationPrompt(lines, errors = []) {
  const body = JSON.stringify(lines.map((line) => ({ id: line.id, text: line.text })));
  return errors.length > 0
    ? `${body}\n\nYour previous answer was rejected: ${errors.join('; ')}`
    : body;
}

/** Check an answer returned every requested id exactly once. */
export function validateTranslation(value, lines) {
  const answered = Array.isArray(value?.lines) ? value.lines : [];
  const byId = new Map(answered.filter((item) => typeof item?.id === 'string' && typeof item?.text === 'string').map((item) => [item.id, item.text]));
  const missing = lines.filter((line) => !byId.has(line.id)).map((line) => line.id);
  if (missing.length > 0) return { ok: false, errors: [`missing ids: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`] };
  return { ok: true, value: lines.map((line) => ({ id: line.id, text: byId.get(line.id).trim() })) };
}

/**
 * @param {{ id: string, text: string }[]} lines
 * @returns {Promise<{ lines: { id: string, text: string }[] }>} same ids, translated text
 */
export async function translateCaptionLines({
  lines,
  targetLanguage = 'en',
  signal = null,
  ask = askClaudeForJson,
  debugDir = null,
  onProgress = () => {},
}) {
  const usable = (Array.isArray(lines) ? lines : []).filter((line) => line && typeof line.id === 'string' && typeof line.text === 'string');
  if (usable.length === 0) return { lines: [] };
  const batches = [];
  for (let index = 0; index < usable.length; index += BATCH_SIZE) batches.push(usable.slice(index, index + BATCH_SIZE));
  const results = new Array(batches.length);
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const mine = next;
      next += 1;
      const batch = batches[mine];
      const answer = await ask({
        systemPrompt: buildTranslationSystemPrompt(targetLanguage),
        schema: SCHEMA,
        buildPrompt: (errors) => buildTranslationPrompt(batch, errors),
        validate: (value) => validateTranslation(value, batch),
        signal,
        label: 'captions-translate',
        debugDir,
      });
      if (!answer.ok) {
        const error = new Error(answer.reason ?? 'The translation did not finish.');
        error.code = answer.cancelled ? 'CAPTIONS_CANCELLED' : 'CAPTIONS_CLAUDE';
        throw error;
      }
      results[mine] = answer.value;
      done += batch.length;
      onProgress({ done, total: usable.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));
  return { lines: results.flat() };
}
