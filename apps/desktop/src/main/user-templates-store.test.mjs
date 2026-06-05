import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUserTemplatesStore, defaultUserTemplatesPath } from './user-templates-store.mjs';
import { createRecordingTemplateOverridesStore, defaultRecordingTemplateOverridesPath } from './recording-template-overrides-store.mjs';
import {
  createDefaultCameraPresentation,
  createDefaultRecordingBackgroundStyle,
} from '@rough-cut/project-model';

async function makeTmp() {
  return await mkdtemp(join(tmpdir(), 'user-tpl-'));
}

function makeSaveInput(overrides = {}) {
  return {
    label: 'My Template',
    aspectRatio: '9:16',
    background: createDefaultRecordingBackgroundStyle(),
    camera: createDefaultCameraPresentation(),
    presentation: { screenFrame: null, cameraFrame: null },
    ...overrides,
  };
}

test('list returns [] when file does not exist', async () => {
  const dir = await makeTmp();
  try {
    const store = createUserTemplatesStore({ filePath: defaultUserTemplatesPath(dir) });
    assert.deepEqual(await store.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('save then list round-trips and writes valid JSON', async () => {
  const dir = await makeTmp();
  try {
    const filePath = defaultUserTemplatesPath(dir);
    const store = createUserTemplatesStore({ filePath, now: () => 1234 });
    const saved = await store.save(makeSaveInput({ label: '  Mobile Vertical  ' }));
    assert.equal(saved.label, 'Mobile Vertical');
    assert.equal(saved.aspectRatio, '9:16');
    assert.match(saved.id, /^tpl_[0-9a-f]{16}$/);

    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, saved.id);

    assert.ok(existsSync(filePath));
    const onDisk = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.templates.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('save persists screenFrame and cameraFrame', async () => {
  const dir = await makeTmp();
  try {
    const store = createUserTemplatesStore({ filePath: defaultUserTemplatesPath(dir) });
    const saved = await store.save(
      makeSaveInput({
        presentation: {
          screenFrame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
          cameraFrame: { x: 0.7, y: 0.7, w: 0.2, h: 0.2 },
        },
      }),
    );
    assert.deepEqual(saved.screenFrame, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
    assert.deepEqual(saved.cameraFrame, { x: 0.7, y: 0.7, w: 0.2, h: 0.2 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename updates label and timestamp', async () => {
  const dir = await makeTmp();
  try {
    let now = 1000;
    const store = createUserTemplatesStore({
      filePath: defaultUserTemplatesPath(dir),
      now: () => now,
    });
    const a = await store.save(makeSaveInput({ label: 'Original' }));
    now = 2000;
    const b = await store.rename({ id: a.id, label: 'Renamed' });
    assert.equal(b.label, 'Renamed');
    assert.equal(b.createdAt, 1000);
    assert.equal(b.updatedAt, 2000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('delete removes by id and reports removed: true / false', async () => {
  const dir = await makeTmp();
  try {
    const store = createUserTemplatesStore({ filePath: defaultUserTemplatesPath(dir) });
    const a = await store.save(makeSaveInput());
    const r1 = await store.delete({ id: a.id });
    assert.deepEqual(r1, { removed: true });
    const r2 = await store.delete({ id: a.id });
    assert.deepEqual(r2, { removed: false });
    assert.deepEqual(await store.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('malformed file returns empty list without throwing', async () => {
  const dir = await makeTmp();
  try {
    const filePath = defaultUserTemplatesPath(dir);
    await writeFile(filePath, 'not json at all', 'utf8');
    const store = createUserTemplatesStore({ filePath });
    assert.deepEqual(await store.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('concurrent saves are serialized (no lost writes)', async () => {
  const dir = await makeTmp();
  try {
    const store = createUserTemplatesStore({ filePath: defaultUserTemplatesPath(dir) });
    const labels = Array.from({ length: 8 }, (_, i) => `Template ${i}`);
    await Promise.all(labels.map((label) => store.save(makeSaveInput({ label }))));
    const list = await store.list();
    assert.equal(list.length, 8);
    const seen = new Set(list.map((t) => t.label));
    for (const label of labels) assert.ok(seen.has(label), `missing ${label}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects empty label on save', async () => {
  const dir = await makeTmp();
  try {
    const store = createUserTemplatesStore({ filePath: defaultUserTemplatesPath(dir) });
    await assert.rejects(() => store.save(makeSaveInput({ label: '   ' })), /label/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recording template overrides round-trip and replace by template id', async () => {
  const dir = await makeTmp();
  try {
    let now = 1000;
    const filePath = defaultRecordingTemplateOverridesPath(dir);
    const store = createRecordingTemplateOverridesStore({ filePath, now: () => now });
    const first = await store.save({
      templateId: 'tutorial-16-9',
      aspectRatio: '16:9',
      background: createDefaultRecordingBackgroundStyle(),
      camera: createDefaultCameraPresentation(),
      presentation: {
        screenFrame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
        cameraFrame: { x: 0.2, y: 0.25, w: 0.2, h: 0.5 },
      },
    });
    assert.equal(first.updatedAt, 1000);

    now = 2000;
    await store.save({
      templateId: 'tutorial-16-9',
      aspectRatio: '16:9',
      background: createDefaultRecordingBackgroundStyle(),
      camera: createDefaultCameraPresentation(),
      presentation: {
        screenFrame: { x: 0.3, y: 0.2, w: 0.55, h: 0.45 },
        cameraFrame: { x: 0.1, y: 0.15, w: 0.25, h: 0.66 },
      },
    });

    const reloaded = createRecordingTemplateOverridesStore({ filePath });
    const list = await reloaded.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].templateId, 'tutorial-16-9');
    assert.equal(list[0].updatedAt, 2000);
    assert.deepEqual(list[0].cameraFrame, { x: 0.1, y: 0.15, w: 0.25, h: 0.66 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
