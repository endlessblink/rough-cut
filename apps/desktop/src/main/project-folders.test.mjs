import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PROJECT_FOLDER_PATTERN, createProjectFolder, projectFolderName, removeProjectFolderIfSolo } from './project-folders.mjs';

test('folder names start with the local date and time, then the video name', () => {
  assert.equal(projectFolderName(new Date(2026, 9, 2, 14, 5), 'Walkthrough'), '2026-10-02_1405 Walkthrough');
  assert.equal(projectFolderName(new Date(2026, 0, 3, 9, 7)), '2026-01-03_0907 Recording');
});

test('names are made safe for a folder and capped', () => {
  const date = new Date(2026, 9, 2, 14, 5);
  assert.equal(projectFolderName(date, 'a/b\\c: d?'), '2026-10-02_1405 a-b-c- d-');
  assert.equal(projectFolderName(date, '   '), '2026-10-02_1405 Recording');
  assert.equal(projectFolderName(date, '../../etc'), '2026-10-02_1405 etc');
  assert.ok(projectFolderName(date, 'x'.repeat(200)).length <= '2026-10-02_1405 '.length + 60);
  assert.ok(PROJECT_FOLDER_PATTERN.test(projectFolderName(date, 'Hebrew שלום')));
});

test('creating folders never reuses one, even for the same minute and name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-folders-'));
  try {
    const date = new Date(2026, 9, 2, 14, 5);
    const first = await createProjectFolder(root, { date, name: 'Demo' });
    const second = await createProjectFolder(root, { date, name: 'Demo' });
    assert.notEqual(first, second);
    assert.deepEqual((await readdir(root)).sort(), ['2026-10-02_1405 Demo', '2026-10-02_1405 Demo (2)']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deleting the only project in a video folder removes the whole folder; a folder with another project or a foreign folder is kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-folders-'));
  try {
    const mine = join(root, '2026-10-02_1405 Demo');
    await mkdir(mine);
    await writeFile(join(mine, 'rough-cut-x-camera.mp4'), 'camera');
    await writeFile(join(mine, 'rough-cut-x.diagnostics.json'), '{}');
    assert.equal(await removeProjectFolderIfSolo(join(mine, 'Demo.roughcut')), true);
    assert.deepEqual(await readdir(root), []);

    const shared = join(root, '2026-10-02_1406 Shared');
    await mkdir(shared);
    await writeFile(join(shared, 'Other.roughcut'), '{}');
    await writeFile(join(shared, 'other.mp4'), 'x');
    assert.equal(await removeProjectFolderIfSolo(join(shared, 'Demo.roughcut')), false);

    const foreign = join(root, 'My Own Folder');
    await mkdir(foreign);
    await writeFile(join(foreign, 'precious.mp4'), 'x');
    assert.equal(await removeProjectFolderIfSolo(join(foreign, 'a.roughcut')), false);
    assert.deepEqual((await readdir(root)).sort(), ['2026-10-02_1406 Shared', 'My Own Folder']);
    assert.deepEqual(await readdir(foreign), ['precious.mp4']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
