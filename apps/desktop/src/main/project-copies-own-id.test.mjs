import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectForRecording, duplicateProjectFile, giveCopyItsOwnId, openProjectFile, saveProjectFile } from './project-files.mjs';
import { buildSummary, listProjectSummaries, nameClashingProjectsByFile } from './project-gallery.mjs';

const recording = {
  state: 'saved',
  startedAt: '2026-04-28T12:00:00.000Z',
  stoppedAt: '2026-04-28T12:00:10.000Z',
  outputPath: '/tmp/copies-fixture.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  cursorTelemetryPath: '/tmp/copies-fixture.cursor.json',
};

async function withDir(fn) {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-copies-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('Duplicate gives the copy its own project id', () => withDir(async (root) => {
  const fromPath = join(root, 'walkthrough.roughcut');
  const original = await saveProjectFile(fromPath, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'walkthrough.mp4') } }));
  const result = await duplicateProjectFile({ fromPath });
  assert.notEqual(result.document.id, original.document.id);
  assert.equal((await openProjectFile(result.path)).document.id, result.document.id);
  assert.equal((await openProjectFile(fromPath)).document.id, original.document.id, 'original keeps its id');
}));

test('a copy made outside the app gets its own id when opened; the file named after the video keeps the original', () => withDir(async (root) => {
  const mainPath = join(root, 'walkthrough.roughcut');
  const copyPath = join(root, 'a.roughcut');
  const saved = await saveProjectFile(mainPath, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'walkthrough.mp4') } }));
  await copyFile(mainPath, copyPath);
  const doc = saved.document;
  const deps = { newId: () => 'fresh-id' };
  assert.equal((await giveCopyItsOwnId(copyPath, doc, deps)).id, 'fresh-id');
  assert.equal((await giveCopyItsOwnId(mainPath, doc, deps)).id, doc.id);
  assert.notEqual((await openProjectFile(copyPath, { ownIdForCopies: true })).document.id, doc.id);
}));

test('when no file is named after the video, the shortest name keeps the original id', () => withDir(async (root) => {
  const mainPath = join(root, 'walk.roughcut');
  const copyPath = join(root, 'walk.claude-edit.roughcut');
  const saved = await saveProjectFile(mainPath, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'rough-cut-2026.mp4') } }));
  await copyFile(mainPath, copyPath);
  const doc = saved.document;
  const deps = { newId: () => 'fresh-id' };
  assert.equal((await giveCopyItsOwnId(copyPath, doc, deps)).id, 'fresh-id');
  assert.equal((await giveCopyItsOwnId(mainPath, doc, deps)).id, doc.id);
  // Opening without the option (gallery listing, export) never changes the id.
  assert.equal((await openProjectFile(copyPath)).document.id, doc.id);
}));

test('a project alone in its folder keeps its id when opened', () => withDir(async (root) => {
  const mainPath = join(root, 'solo.roughcut');
  const saved = await saveProjectFile(mainPath, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'solo.mp4') } }));
  const opened = await openProjectFile(mainPath, { ownIdForCopies: true });
  assert.equal(opened.document.id, saved.document.id);
}));

test('projects in one folder that share a name are shown by their file name', () => {
  const summaries = nameClashingProjectsByFile([
    { path: '/r/a/walk.roughcut', name: 'walk' },
    { path: '/r/a/walk.claude-edit.roughcut', name: 'walk' },
    { path: '/r/a/launch.roughcut', name: 'Launch edit' },
    { path: '/r/b/walk.roughcut', name: 'walk' },
  ]);
  assert.deepEqual(summaries.map((s) => s.name), ['walk', 'walk.claude-edit', 'Launch edit', 'walk']);
});

test('a copy made outside the app sorts by its own newer file time', () => {
  const summary = buildSummary({
    projectPath: '/r/a/walk.roughcut',
    document: { name: 'walk', modifiedAt: '2026-10-19T10:00:00.000Z' },
    modifiedAt: '2026-10-20T15:00:00.000Z',
    fileModifiedAt: '2026-10-20T15:00:00.000Z',
  });
  assert.equal(summary.modifiedAt, '2026-10-20T15:00:00.000Z');
  const edited = buildSummary({
    projectPath: '/r/a/walk.roughcut',
    document: { name: 'walk', modifiedAt: '2026-10-20T16:00:00.000Z' },
    modifiedAt: '2026-10-20T15:00:00.000Z',
    fileModifiedAt: '2026-10-20T15:00:00.000Z',
  });
  assert.equal(edited.modifiedAt, '2026-10-20T16:00:00.000Z');
});

test('the gallery lists every copy in a recording folder as its own card, newest first', () => withDir(async (root) => {
  const folder = join(root, '2026-10-19_2228 Recording');
  await (await import('node:fs/promises')).mkdir(folder);
  const mainPath = join(folder, 'walk.roughcut');
  await saveProjectFile(mainPath, createProjectForRecording({ recording: { ...recording, outputPath: join(folder, 'walk.mp4') } }));
  const copyPath = join(folder, 'walk.claude-edit.roughcut');
  await copyFile(mainPath, copyPath);
  const later = new Date(Date.now() + 60_000);
  await utimes(copyPath, later, later);
  await writeFile(join(folder, 'notes.txt'), 'x');
  const summaries = await listProjectSummaries({ dir: root });
  assert.deepEqual(summaries.map((s) => s.name), ['walk.claude-edit', 'walk']);
}));
