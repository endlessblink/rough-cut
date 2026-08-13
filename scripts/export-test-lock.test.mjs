import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { acquireExportTestLock } from './export-test-lock.mjs';

test('rejects a live owner in a separate export test process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-lock-'));
  const lockPath = join(root, 'export.lock');
  const moduleUrl = new URL('./export-test-lock.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { acquireExportTestLock } from ${JSON.stringify(moduleUrl)};
    acquireExportTestLock(process.env.ROUGH_CUT_TEST_LOCK);
    console.log('locked');
    setInterval(() => {}, 1000);
  `], {
    env: { ...process.env, ROUGH_CUT_TEST_LOCK: lockPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('locked')) resolve();
      });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`lock owner exited early: ${code}`)));
    });
    assert.throws(() => acquireExportTestLock(lockPath), /already running/);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
    await rm(root, { recursive: true, force: true });
  }
});
