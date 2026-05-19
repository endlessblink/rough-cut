import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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

test('runtime log rotates instead of growing forever', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-runtime-log-'));
  const logPath = join(root, 'app-runtime.log');
  installRuntimeLog(logPath, { maxBytes: 100 });

  console.info('[test-runtime-log] first line that exceeds the cap');
  console.info('[test-runtime-log] second line rotates the file');

  const current = await readFile(logPath, 'utf8');
  const rotated = await readFile(`${logPath}.1`, 'utf8');
  const currentStats = await stat(logPath);

  assert.match(current, /second line/);
  assert.match(rotated, /first line/);
  assert.ok(currentStats.size < 1024);

  await rm(root, { recursive: true, force: true });
});
