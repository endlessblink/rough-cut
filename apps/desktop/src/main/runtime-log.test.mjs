import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultRuntimeLogPath, installRuntimeLog } from './runtime-log.mjs';

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

test('default log path never depends on the working directory unless dev/dock asks for it', () => {
  assert.equal(defaultRuntimeLogPath({ ROUGH_CUT_LOG_PATH: '/x/log' }, '/'), '/x/log');
  assert.equal(defaultRuntimeLogPath({ XDG_CONFIG_HOME: '/cfg' }, '/'), '/cfg/rough-cut-mvp/logs/app-runtime.log');
  assert.equal(defaultRuntimeLogPath({ ROUGH_CUT_DOCK_LAUNCH: '1' }, '/repo/dist/app'), '/repo/.logs/app-runtime.log');
  assert.ok(!defaultRuntimeLogPath({}, '/').startsWith('/.logs'));
});

test('an unwritable log location does not throw (startup must survive it)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-runtime-log-'));
  const blocker = join(root, 'a-file');
  await writeFile(blocker, 'x');
  // A directory cannot be created below a regular file (ENOTDIR).
  assert.doesNotThrow(() => installRuntimeLog(join(blocker, 'nested', 'app.log')));
  await rm(root, { recursive: true, force: true });
});
