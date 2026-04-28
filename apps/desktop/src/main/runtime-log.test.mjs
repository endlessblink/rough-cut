import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installRuntimeLog } from './runtime-log.mjs';

test('runtime log mirrors console errors to file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-runtime-log-'));
  const logPath = join(root, 'app-runtime.log');
  installRuntimeLog(logPath);

  console.error('[test-runtime-log] visible failure');

  const log = await readFile(logPath, 'utf8');
  assert.match(log, /\[test-runtime-log\] visible failure/);

  await rm(root, { recursive: true, force: true });
});
