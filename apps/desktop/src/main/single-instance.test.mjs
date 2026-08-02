import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), 'index.mjs'), 'utf8');

test('desktop startup owns one Electron instance and focuses it on a dock relaunch', () => {
  assert.match(source, /app\.requestSingleInstanceLock\(\)/);
  assert.match(source, /app\.on\(['"]second-instance['"]/);
  assert.match(source, /window\.focus\(\)/);
});
