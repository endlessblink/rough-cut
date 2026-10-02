import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppSettingsStore, defaultAppSettingsPath } from './app-settings-store.mjs';

async function withStore(run) {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-settings-'));
  try {
    const filePath = defaultAppSettingsPath(dir);
    await run({ dir, filePath, store: createAppSettingsStore({ filePath }) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('no settings file means the default projects folder', async () => {
  await withStore(({ store }) => assert.equal(store.getProjectsDir(), null));
});

test('a chosen projects folder is saved and read back', async () => {
  await withStore(async ({ store, filePath }) => {
    assert.equal(store.setProjectsDir('/data/My Videos/rough-cut'), '/data/My Videos/rough-cut');
    assert.equal(store.getProjectsDir(), '/data/My Videos/rough-cut');
    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).projectsDir, '/data/My Videos/rough-cut');
  });
});

test('resetting returns to the default and keeps other settings', async () => {
  await withStore(async ({ store, filePath }) => {
    await writeFile(filePath, JSON.stringify({ projectsDir: '/data/x', other: 1 }));
    store.resetProjectsDir();
    assert.equal(store.getProjectsDir(), null);
    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).other, 1);
  });
});

test('a relative or corrupt value is never used', async () => {
  await withStore(async ({ store, filePath }) => {
    assert.throws(() => store.setProjectsDir('relative/folder'), /full path/);
    await writeFile(filePath, JSON.stringify({ projectsDir: 'relative/folder' }));
    assert.equal(store.getProjectsDir(), null);
    await writeFile(filePath, '{not json');
    assert.equal(store.getProjectsDir(), null);
  });
});
