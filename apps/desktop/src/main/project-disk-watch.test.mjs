import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectDiskWatch } from './project-disk-watch.mjs';
import { createProjectForRecording, onProjectFileWritten, saveProjectFile } from './project-files.mjs';

const recording = {
  state: 'saved',
  startedAt: '2026-04-28T12:00:00.000Z',
  stoppedAt: '2026-04-28T12:00:10.000Z',
  outputPath: '/tmp/watch-fixture.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  cursorTelemetryPath: '/tmp/watch-fixture.cursor.json',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('an outside change to the open project is reported once, and the app\'s own saves never are', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-watch-'));
  const changes = [];
  const watch = createProjectDiskWatch({ onOutsideChange: (path) => changes.push(path), debounceMs: 30 });
  const off = onProjectFileWritten((path) => watch.noteOwnWrite(path));
  try {
    const path = join(root, 'p.roughcut');
    await saveProjectFile(path, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'p.mp4') } }));
    await watch.opened(path);

    await saveProjectFile(path, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'p.mp4') } }));
    await wait(150);
    assert.deepEqual(changes, [], 'own save is not an outside change');
    assert.equal(await watch.changedOutside(path), false);

    // An agent replaces the file the way most tools do (write a temp, rename over).
    await writeFile(join(root, 'p.tmp'), '{"changed":true}');
    await rename(join(root, 'p.tmp'), path);
    await wait(200);
    assert.deepEqual(changes, [path]);
    assert.equal(await watch.changedOutside(path), true, 'a stale save must now be refused');

    await watch.accept(path);
    assert.equal(await watch.changedOutside(path), false, 'after reload or keep-mine, saving works again');
  } finally {
    off();
    watch.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test('a project never opened through the watch is never refused', async () => {
  const watch = createProjectDiskWatch({});
  assert.equal(await watch.changedOutside('/nowhere/x.roughcut'), false);
});
