import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createAiAssetsStore, defaultAiAssetsIndexPath, defaultAiAssetsRoot } from './ai-assets-store.mjs';

async function makeTmp() {
  return await mkdtemp(join(tmpdir(), 'ai-assets-'));
}

function makeStore(dir, overrides = {}) {
  return createAiAssetsStore({
    rootDir: defaultAiAssetsRoot(dir),
    now: () => '2026-05-21T10:00:00.000Z',
    ...overrides,
  });
}

test('list returns [] when index does not exist', async () => {
  const dir = await makeTmp();
  try {
    assert.deepEqual(await makeStore(dir).list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('add copies source file into stable kind/session layout and indexes metadata', async () => {
  const dir = await makeTmp();
  try {
    const sourceFilePath = join(dir, 'voice.wav');
    await writeFile(sourceFilePath, 'wav bytes', 'utf8');
    const store = makeStore(dir);

    const asset = await store.add({
      id: 'ai-asset-1',
      kind: 'audio',
      providerId: 'elevenlabs',
      sourcePrompt: 'Narrate intro',
      tags: ['voiceover'],
      sessionId: 'session 1',
      sourceFilePath,
    });

    assert.equal(asset.filePath, join(defaultAiAssetsRoot(dir), 'audio', 'session-1', 'ai-asset-1.wav'));
    assert.equal(await readFile(asset.filePath, 'utf8'), 'wav bytes');
    assert.deepEqual(await store.list(), [asset]);

    const index = JSON.parse(await readFile(defaultAiAssetsIndexPath(dir), 'utf8'));
    assert.equal(index.version, 1);
    assert.equal(index.assets[0].id, 'ai-asset-1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('add can persist bytes when no source file exists', async () => {
  const dir = await makeTmp();
  try {
    const asset = await makeStore(dir).add({
      id: 'ai-image-1',
      kind: 'image',
      providerId: 'codex-cli',
      sourcePrompt: 'Generate cover',
      sessionId: 'session-1',
      extension: 'png',
      bytes: Buffer.from('png bytes'),
    });

    assert.equal(asset.filePath, join(defaultAiAssetsRoot(dir), 'image', 'session-1', 'ai-image-1.png'));
    assert.equal(await readFile(asset.filePath, 'utf8'), 'png bytes');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update changes metadata but preserves file path', async () => {
  const dir = await makeTmp();
  try {
    const store = makeStore(dir);
    const asset = await store.add({
      id: 'ai-asset-1',
      kind: 'audio',
      providerId: 'openai',
      sourcePrompt: 'Original prompt',
      sessionId: 's1',
      extension: 'wav',
      tags: [],
    });

    const updated = await store.update(asset.id, {
      tags: ['approved', 'voiceover'],
      sourcePrompt: 'Updated prompt',
    });

    assert.equal(updated.filePath, asset.filePath);
    assert.deepEqual(updated.tags, ['approved', 'voiceover']);
    assert.equal(updated.sourcePrompt, 'Updated prompt');
    assert.deepEqual((await store.list())[0], updated);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('delete removes metadata and stored file', async () => {
  const dir = await makeTmp();
  try {
    const store = makeStore(dir);
    const asset = await store.add({
      id: 'ai-asset-1',
      kind: 'audio',
      providerId: 'openai',
      sourcePrompt: 'Prompt',
      sessionId: 's1',
      extension: 'wav',
    });

    assert.equal(existsSync(asset.filePath), true);
    assert.deepEqual(await store.delete(asset.id), { removed: true });
    assert.equal(existsSync(asset.filePath), false);
    assert.deepEqual(await store.delete(asset.id), { removed: false });
    assert.deepEqual(await store.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('corrupted index recovers as empty and can be overwritten by next add', async () => {
  const dir = await makeTmp();
  try {
    const indexPath = defaultAiAssetsIndexPath(dir);
    await mkdir(dirname(indexPath), { recursive: true });
    await writeFile(indexPath, '{ not json', 'utf8');
    const logs = [];
    const store = makeStore(dir, { onLog: (message) => logs.push(message) });

    assert.deepEqual(await store.list(), []);
    assert.equal(logs.some((line) => line.includes('read error')), true);

    const asset = await store.add({
      id: 'ai-asset-1',
      kind: 'video',
      providerId: 'replicate',
      sourcePrompt: 'Generate b-roll',
      sessionId: 's1',
      extension: 'mp4',
    });

    assert.deepEqual(await store.list(), [asset]);
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    assert.equal(index.assets.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('concurrent adds are serialized with no lost assets', async () => {
  const dir = await makeTmp();
  try {
    const store = makeStore(dir);
    await Promise.all(
      Array.from({ length: 6 }, (_, index) => store.add({
        id: `ai-asset-${index}`,
        kind: 'audio',
        providerId: 'openai',
        sourcePrompt: `Prompt ${index}`,
        sessionId: 's1',
        extension: 'wav',
      })),
    );

    const ids = new Set((await store.list()).map((asset) => asset.id));
    assert.equal(ids.size, 6);
    for (let index = 0; index < 6; index += 1) assert.equal(ids.has(`ai-asset-${index}`), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
