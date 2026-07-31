import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFreecutStatus, resolveFreecutRoot } from './freecut-window.mjs';

test('FreeCut status recognizes a built dist folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-freecut-test-'));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html>');
    const app = { isPackaged: false };
    assert.equal(await resolveFreecutRoot({ app, env: { ROUGH_CUT_FREECUT_DIST: root } }), root);
    assert.deepEqual(await getFreecutStatus({ app, env: { ROUGH_CUT_FREECUT_DIST: root } }), { available: true, root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('FreeCut status stays unavailable when no packaged dist exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-freecut-missing-'));
  try {
    const app = { isPackaged: true, getAppPath: () => root };
    assert.equal(await resolveFreecutRoot({ app, env: {} }), null);
    assert.deepEqual(await getFreecutStatus({ app, env: {} }), { available: false, root: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
