// Calls the locally logged-in Claude Code CLI for one structured answer.
//
// Every AI feature in the app goes through here, so there is no API key to
// manage: the user's own `claude` login is used. Each call is one-shot,
// tool-less and settings-free: no tools, no MCP servers, no user/project
// settings or hooks (--restricted), nothing saved, run from an empty folder so
// no project CLAUDE.md is picked up. The answer must match a JSON schema.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { inspectClaudeSubscription } from './claude-connection.mjs';

export const DEFAULT_CLAUDE_MODEL = 'sonnet';
export const CLAUDE_TIMEOUT_MS = 240_000;
const KEEP_DEBUG_RECORDS = 30;

/**
 * Keeps the last few Claude exchanges (prompt, raw answer, outcome) on disk so a
 * bad or missing result can be diagnosed from what Claude actually returned.
 * Local only, never sent anywhere. Best effort: a failed write is ignored.
 */
async function writeDebugRecord(debugDir, record) {
  if (!debugDir) return;
  try {
    await mkdir(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(debugDir, `${stamp}-${record.label}.json`), `${JSON.stringify(record, null, 2)}\n`);
    const files = (await readdir(debugDir)).filter((name) => name.endsWith('.json')).sort();
    await Promise.all(files.slice(0, Math.max(0, files.length - KEEP_DEBUG_RECORDS)).map((name) => rm(join(debugDir, name), { force: true })));
  } catch {
    // Diagnostics must never break the feature.
  }
}

/**
 * Where the `claude` binary is. A dock-launched app does not inherit an
 * interactive shell's PATH, so the usual install locations are checked too.
 */
export function resolveClaudeBinary({ env = process.env, home = homedir(), exists = existsSync } = {}) {
  if (env.ROUGH_CUT_CLAUDE_BIN) return exists(env.ROUGH_CUT_CLAUDE_BIN) ? env.ROUGH_CUT_CLAUDE_BIN : null;
  const candidates = [
    ...String(env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, 'claude')),
    join(home, '.npm-global', 'bin', 'claude'),
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  return candidates.find((candidate) => exists(candidate)) ?? null;
}

export const CLAUDE_MISSING_REASON = 'Claude Code is not installed on this computer. Install it and sign in by running `claude` once.';

export function buildClaudeArgs({ systemPrompt, schema, model = DEFAULT_CLAUDE_MODEL }) {
  return [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--system-prompt', systemPrompt,
    '--tools', '',
    '--restricted',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--model', model,
  ];
}

function stripFences(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Pull the answer out of `claude -p --output-format json` output. Structured
 * output may arrive as `structured_output` or as JSON text in `result`.
 */
export function parseClaudeResult(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(String(stdout ?? '').trim());
  } catch {
    return { ok: false, reason: 'Claude returned something that is not JSON.' };
  }
  if (envelope?.is_error || (envelope?.subtype && envelope.subtype !== 'success')) {
    const detail = typeof envelope.result === 'string' ? envelope.result.slice(0, 300) : envelope.subtype;
    return { ok: false, reason: `Claude reported an error: ${detail}` };
  }
  if (envelope?.structured_output && typeof envelope.structured_output === 'object') {
    return { ok: true, value: envelope.structured_output };
  }
  if (typeof envelope?.result === 'string') {
    try {
      return { ok: true, value: JSON.parse(stripFences(envelope.result)) };
    } catch {
      return { ok: false, reason: 'Claude answered, but not in the expected JSON shape.' };
    }
  }
  return { ok: false, reason: 'Claude returned no answer.' };
}

/** Runs the CLI once. The prompt goes over stdin so it is not visible in `ps`. */
export function runClaudeOnce({ binary, args, prompt, signal = null, timeoutMs = CLAUDE_TIMEOUT_MS, spawnImpl = spawn, cwd }) {
  return new Promise((resolve) => {
    const child = spawnImpl(binary, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'rough-cut' } });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => {
      child.kill('SIGTERM');
      finish({ ok: false, cancelled: true, reason: 'Cancelled.' });
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: false, reason: 'Claude took too long to answer.' });
    }, timeoutMs);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ ok: false, reason: `Could not start Claude: ${error.message}` }));
    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        finish({ ok: false, reason: `Claude exited with code ${code}: ${stderr.trim().slice(0, 300) || 'no output'}` });
        return;
      }
      finish({ ok: true, stdout });
    });
    child.stdin.end(prompt);
  });
}

/**
 * One structured request. `validate(value)` returns `{ ok: true, value }` or
 * `{ ok: false, errors }`; a rejected answer gets one retry with the problems
 * fed back through `buildPrompt(errors)`. Never throws for expected failures.
 */
export async function askClaudeForJson({
  systemPrompt,
  schema,
  buildPrompt,
  validate = (value) => ({ ok: true, value }),
  model = DEFAULT_CLAUDE_MODEL,
  signal = null,
  binary = resolveClaudeBinary(),
  runOnce = runClaudeOnce,
  connectionCheck = inspectClaudeSubscription,
  attempts = 2,
  label = 'claude',
  debugDir = null,
  log = (message) => console.info(message),
  /** Real stages for a progress bar: writing (per attempt), checking. */
  onProgress = () => {},
}) {
  if (!binary) {
    log(`[claude:${label}] not installed — no claude binary found`);
    return { ok: false, reason: CLAUDE_MISSING_REASON };
  }
  const connection = await connectionCheck({ binary });
  if (!connection.ok) return { ok: false, reason: connection.reason };
  const args = buildClaudeArgs({ systemPrompt, schema, model });
  const cwd = await mkdtemp(join(tmpdir(), 'rough-cut-claude-'));
  try {
    let errors = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const prompt = buildPrompt(errors);
      const startedAt = Date.now();
      log(`[claude:${label}] attempt ${attempt + 1} started (model ${model})`);
      onProgress({ stage: 'writing', attempt: attempt + 1, retryReason: errors[0] ?? null, startedAt });
      const run = await runOnce({ binary, args, prompt, signal, cwd });
      const ms = Date.now() - startedAt;
      if (!run.ok) {
        log(`[claude:${label}] attempt ${attempt + 1} failed after ${ms} ms: ${run.reason}`);
        await writeDebugRecord(debugDir, { label, attempt: attempt + 1, ms, model, prompt, outcome: 'failed', reason: run.reason });
        return { ok: false, reason: run.reason, cancelled: Boolean(run.cancelled) };
      }
      const parsed = parseClaudeResult(run.stdout);
      if (!parsed.ok) {
        log(`[claude:${label}] attempt ${attempt + 1} unreadable after ${ms} ms: ${parsed.reason}`);
        await writeDebugRecord(debugDir, { label, attempt: attempt + 1, ms, model, prompt, outcome: 'unreadable', reason: parsed.reason, stdout: String(run.stdout).slice(0, 200_000) });
        errors = [parsed.reason];
        continue;
      }
      onProgress({ stage: 'checking', attempt: attempt + 1 });
      const checked = validate(parsed.value);
      await writeDebugRecord(debugDir, { label, attempt: attempt + 1, ms, model, prompt, outcome: checked.ok ? 'accepted' : 'rejected', errors: checked.ok ? [] : checked.errors, answer: parsed.value });
      if (checked.ok) {
        log(`[claude:${label}] attempt ${attempt + 1} accepted after ${ms} ms`);
        return { ok: true, value: checked.value, raw: parsed.value };
      }
      log(`[claude:${label}] attempt ${attempt + 1} rejected after ${ms} ms: ${checked.errors.join('; ')}`);
      errors = checked.errors;
    }
    return { ok: false, reason: 'Claude\'s answer did not pass the format checks.', errors };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/**
 * Typical time for one Claude answer of this kind, from the local debug
 * records (median of the last few completed answers). Drives the pace of the
 * progress bar; falls back to a sensible default with no history.
 */
export async function typicalClaudeAnswerMs(debugDir, label, { fallbackMs = 75_000, sample = 8 } = {}) {
  if (!debugDir) return fallbackMs;
  try {
    const { readFile } = await import('node:fs/promises');
    const names = (await readdir(debugDir)).filter((name) => name.endsWith(`-${label}.json`)).sort().slice(-sample * 2);
    const times = [];
    for (const name of names) {
      try {
        const record = JSON.parse(await readFile(join(debugDir, name), 'utf8'));
        if ((record.outcome === 'accepted' || record.outcome === 'rejected') && Number(record.ms) > 1000) times.push(Number(record.ms));
      } catch {
        // A half-written record is skipped.
      }
    }
    const recent = times.slice(-sample).sort((a, b) => a - b);
    return recent.length > 0 ? recent[Math.floor(recent.length / 2)] : fallbackMs;
  } catch {
    return fallbackMs;
  }
}
