/**
 * Every ffmpeg render must run inside a kernel-enforced memory cap.
 *
 * Measured 2026-08-01: a single styled render climbed past 63GB and drove a 78GB machine
 * to 2GB available with load 21 — the desktop, not just the export, became unusable. The
 * graph that causes that is still being fixed; this cap is what keeps the failure local.
 *
 * These tests pin the shape of the wrapper. If someone later "simplifies" the spawn path
 * and drops the cap, this suite fails rather than the machine.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { memoryCappedCommand } from './export-service.mjs';

const ARGS = ['-y', '-i', 'in.mp4', 'out.mp4'];

function withEnv(value, run) {
  const previous = process.env.ROUGH_CUT_EXPORT_MEMORY_MAX;
  if (value === undefined) delete process.env.ROUGH_CUT_EXPORT_MEMORY_MAX;
  else process.env.ROUGH_CUT_EXPORT_MEMORY_MAX = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.ROUGH_CUT_EXPORT_MEMORY_MAX;
    else process.env.ROUGH_CUT_EXPORT_MEMORY_MAX = previous;
  }
}

test('ffmpeg is wrapped in a transient scope with a memory ceiling', { skip: process.platform !== 'linux' }, () => {
  const capped = withEnv(undefined, () => memoryCappedCommand('ffmpeg', ARGS));
  assert.ok(capped, 'ffmpeg must not run uncapped');
  assert.equal(capped.command, 'systemd-run');
  assert.ok(capped.args.includes('--scope'));
  assert.ok(capped.args.some((arg) => arg.startsWith('MemoryMax=')), 'no MemoryMax set');
});

test('swap is disabled for renders, because thrashing is what kills the desktop', { skip: process.platform !== 'linux' }, () => {
  const capped = withEnv(undefined, () => memoryCappedCommand('ffmpeg', ARGS));
  assert.ok(capped.args.includes('MemorySwapMax=0'));
});

test('the original ffmpeg command and every argument survive the wrapping, in order', { skip: process.platform !== 'linux' }, () => {
  const capped = withEnv(undefined, () => memoryCappedCommand('ffmpeg', ARGS));
  const tail = capped.args.slice(capped.args.indexOf('ffmpeg'));
  assert.deepEqual(tail, ['ffmpeg', ...ARGS]);
});

test('the default ceiling clears a healthy render but not a runaway', { skip: process.platform !== 'linux' }, () => {
  const capped = withEnv(undefined, () => memoryCappedCommand('ffmpeg', ARGS));
  const setting = capped.args.find((arg) => arg.startsWith('MemoryMax='));
  const gib = Number(setting.replace('MemoryMax=', '').replace(/G$/i, ''));
  // Real renders measured 9-31GB; the runaway was 63GB+.
  assert.ok(gib > 31, `ceiling ${gib}G would kill legitimate renders`);
  assert.ok(gib < 63, `ceiling ${gib}G would not have stopped the observed runaway`);
});

test('ffprobe and other tools are left alone', () => {
  assert.equal(memoryCappedCommand('ffprobe', ['-i', 'in.mp4']), null);
});

test('the cap can be turned off deliberately', { skip: process.platform !== 'linux' }, () => {
  assert.equal(withEnv('off', () => memoryCappedCommand('ffmpeg', ARGS)), null);
  assert.equal(withEnv('0', () => memoryCappedCommand('ffmpeg', ARGS)), null);
});

test('a custom ceiling is honoured', { skip: process.platform !== 'linux' }, () => {
  const capped = withEnv('8G', () => memoryCappedCommand('ffmpeg', ARGS));
  assert.ok(capped.args.includes('MemoryMax=8G'));
});
