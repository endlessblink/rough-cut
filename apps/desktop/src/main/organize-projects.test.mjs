import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyOrganize, planOrganize, undoOrganize } from './organize-projects.mjs';

const A = '2026-06-02T15-49-33-067Z';
const B = '2026-06-08T16-03-52-373Z';
const C = '2026-06-09T09-00-00-000Z'; // logs only
const D = '2026-06-10T10-00-00-000Z'; // video, no project
const E = '2026-06-11T11-00-00-000Z'; // belongs to an unreadable project
const F = '2026-06-12T12-00-00-000Z'; // default-named project (name is its own timestamp)

function projectJson(root, name, stamp, { relative = true } = {}) {
  return `${JSON.stringify({
    version: 1,
    name,
    assets: [{
      id: 'a1',
      filePath: relative ? `rough-cut-${stamp}.mp4` : `${root}/rough-cut-${stamp}.mp4`,
      metadata: {
        rawPath: `${root}/rough-cut-${stamp}.mkv`,
        absoluteFilePath: `${root}/rough-cut-${stamp}.mp4`,
        cursorTelemetryPath: `${root}/rough-cut-${stamp}.cursor.json`,
        thumbnailPath: `${root}/rough-cut-${stamp}.thumb.jpg`,
      },
    }],
  }, null, 2)}\n`;
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-organize-'));
  const w = (name, content = name) => writeFile(join(root, name), content);
  // A: a recording with its own project, camera, logs; B: a renamed project; "copy" reuses A's recording.
  for (const suffix of ['.mp4', '.mkv', '-camera.mp4', '.cursor.json', '.events.log', '.diagnostics.json', '.thumb.jpg']) await w(`rough-cut-${A}${suffix}`);
  await w(`rough-cut-${A}.roughcut`, projectJson(root, 'Screen recording walkthrough', A));
  await w(`rough-cut-${A}.roughcut.bak`, 'older');
  for (const suffix of ['.mp4', '.mkv', '.cursor.json', '.thumb.jpg']) await w(`rough-cut-${B}${suffix}`);
  await w('herdr_1.roughcut', projectJson(root, 'Herdr demo', B));
  await w('herdr_1.roughcut.bak', 'bak');
  await w('copy of walkthrough.roughcut', projectJson(root, 'Walkthrough take 2', A, { relative: true }));
  await w(`rough-cut-${C}.diagnostics.json`);
  await w(`rough-cut-${C}.events.log`);
  await w(`rough-cut-${D}.mp4`);
  await w(`rough-cut-${D}.mkv`);
  await w(`rough-cut-${E}.mkv`);
  await w(`rough-cut-${E}.roughcut`, '{ this is not json');
  for (const suffix of ['.mp4', '.mkv']) await w(`rough-cut-${F}${suffix}`);
  await w(`rough-cut-${F}.roughcut`, projectJson(root, `rough-cut-${F}`, F));
  await w('Smoke.roughcut', `${JSON.stringify({ name: 'Smoke', createdAt: '2026-03-04T10:20:00.000Z', assets: [] }, null, 2)}\n`);
  await w('notes.txt', 'keep me');
  await mkdir(join(root, '.roughcut-visuals'));
  await writeFile(join(root, '.roughcut-visuals', 'cache.bin'), 'cache');
  return root;
}

async function snapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out[path.slice(root.length + 1)] = createHash('sha1').update(await readFile(path)).digest('hex');
    }
  }
  await walk(root);
  return out;
}

test('the plan groups every video, shares nothing twice and leaves the unknown alone', async () => {
  const root = await makeFixture();
  try {
    const plan = await planOrganize(root);
    const byFolder = Object.fromEntries(plan.groups.map((group) => [group.folderName, group.files.map((file) => file.name)]));
    const names = Object.keys(byFolder).sort();
    assert.ok(names.some((name) => /^2026-06-02_\d{4} Screen recording walkthrough$/.test(name)), names.join(' | '));
    const walkthrough = plan.groups.find((group) => group.projectFile === `rough-cut-${A}.roughcut`);
    assert.ok(walkthrough.files.some((file) => file.name === `rough-cut-${A}-camera.mp4`), 'camera file joins its recording');
    assert.ok(walkthrough.files.some((file) => file.name === `rough-cut-${A}.roughcut.bak`), 'backup joins its project');
    // The project that reuses recording A does not steal its files.
    const second = plan.groups.find((group) => group.projectFile === 'copy of walkthrough.roughcut');
    assert.deepEqual(second.files.map((file) => file.name), ['copy of walkthrough.roughcut']);
    const herdr = plan.groups.find((group) => group.projectFile === 'herdr_1.roughcut');
    assert.ok(herdr.files.some((file) => file.name === `rough-cut-${B}.mkv`) && herdr.files.some((file) => file.name === 'herdr_1.roughcut.bak'));
    // Orphans: a video recording is kept together, stray logs go to one leftovers folder.
    assert.ok(plan.groups.some((group) => group.kind === 'orphan' && group.files.some((file) => file.name === `rough-cut-${D}.mp4`)));
    const leftovers = plan.groups.find((group) => group.kind === 'leftovers');
    assert.deepEqual(leftovers.files.map((file) => file.name), [`rough-cut-${C}.diagnostics.json`, `rough-cut-${C}.events.log`]);
    // A default-named recording is just "Recording" (the date is already in front); no stamp falls back to the project's own date.
    const defaultNamed = plan.groups.find((group) => group.projectFile === `rough-cut-${F}.roughcut`);
    assert.match(defaultNamed.folderName, /^2026-06-12_\d{4} Recording$/);
    const smoke = plan.groups.find((group) => group.projectFile === 'Smoke.roughcut');
    assert.match(smoke.folderName, /^2026-03-0[34]_\d{4} Smoke$/);
    // Recordings nobody uses are tucked into one folder so they do not bury the real projects.
    const orphan = plan.groups.find((group) => group.kind === 'orphan');
    assert.equal(orphan.parentFolder, '_Unfiled recordings');
    assert.match(orphan.folderName, /^2026-06-10_\d{4} Recording$/);
    // Unreadable project and unknown files stay put, hidden folders are never scanned.
    assert.deepEqual(plan.unreadable, [`rough-cut-${E}.roughcut`]);
    const left = plan.leftInPlace.map((item) => item.name).sort();
    assert.deepEqual(left, [`rough-cut-${E}.mkv`, `rough-cut-${E}.roughcut`, 'notes.txt'].sort());
    // Every file is in exactly one group.
    const all = plan.groups.flatMap((group) => group.files.map((file) => file.name));
    assert.equal(new Set(all).size, all.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('apply moves the files, keeps every project pointing at real files, and undo restores every byte', async () => {
  const root = await makeFixture();
  try {
    const before = await snapshot(root);
    const plan = await planOrganize(root);
    const result = await applyOrganize(root, plan, { now: new Date('2026-10-02T12:00:00Z') });
    assert.equal(result.moved, plan.totals.files);

    // Nothing but folders, the unrecognised files and the hidden backup/caches are left loose.
    const top = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    assert.deepEqual(top, [`rough-cut-${E}.mkv`, `rough-cut-${E}.roughcut`, 'notes.txt'].sort());

    // The walkthrough project now points at its files inside its own folder...
    const walkthrough = plan.groups.find((group) => group.projectFile === `rough-cut-${A}.roughcut`);
    const walkDoc = JSON.parse(await readFile(join(root, walkthrough.folderName, walkthrough.projectFile), 'utf8'));
    assert.equal(walkDoc.assets[0].filePath, `rough-cut-${A}.mp4`);
    assert.equal(walkDoc.assets[0].metadata.rawPath, join(root, walkthrough.folderName, `rough-cut-${A}.mkv`));
    assert.equal(walkDoc.name, 'Screen recording walkthrough');
    // ...and the project that shares that recording reaches it across folders, relative and absolute alike.
    const second = plan.groups.find((group) => group.projectFile === 'copy of walkthrough.roughcut');
    const secondDoc = JSON.parse(await readFile(join(root, second.folderName, second.projectFile), 'utf8'));
    assert.equal(secondDoc.assets[0].filePath, `../${walkthrough.folderName}/rough-cut-${A}.mp4`);
    assert.equal((await stat(join(root, second.folderName, secondDoc.assets[0].filePath))).isFile(), true);
    assert.equal(secondDoc.assets[0].metadata.thumbnailPath, join(root, walkthrough.folderName, `rough-cut-${A}.thumb.jpg`));

    // Undo: every file back where it was, every byte identical, no leftover folders.
    await undoOrganize(result.manifestPath);
    await rm(result.backupDir, { recursive: true, force: true });
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual((await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name), ['.roughcut-visuals']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a run that hits a real error rolls back and reports it', async () => {
  const root = await makeFixture();
  try {
    const before = await snapshot(root);
    const plan = await planOrganize(root);
    // Make the second folder impossible to create: a file already sits where the folder must go.
    await writeFile(join(root, plan.groups[1].folderName), 'in the way');
    const withBlocker = await snapshot(root);
    await assert.rejects(() => applyOrganize(root, plan, { now: new Date('2026-10-02T12:00:00Z') }));
    await rm(join(root, (await readdir(root)).find((name) => name.startsWith('.organized-'))), { recursive: true, force: true });
    assert.deepEqual(await snapshot(root), withBlocker);
    assert.ok(Object.keys(before).length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
