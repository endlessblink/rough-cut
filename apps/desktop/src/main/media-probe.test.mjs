import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertReadableMp4 } from './media-probe.mjs';

test('rejects invalid mp4 files before project save', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-invalid-mp4-'));
  const filePath = join(root, 'broken.mp4');
  await writeFile(filePath, Buffer.from('not an mp4'));

  await assert.rejects(() => assertReadableMp4(filePath), /Recording did not finalize/);

  await rm(root, { recursive: true, force: true });
});
