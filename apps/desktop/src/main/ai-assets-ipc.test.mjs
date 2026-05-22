import test from 'node:test';
import assert from 'node:assert/strict';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { registerAiAssetIpcHandlers } from './ai-assets-ipc.mjs';

function makeIpcHarness() {
  const handlers = new Map();
  return {
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    invoke(channel, payload) {
      const handler = handlers.get(channel);
      assert.ok(handler, `missing handler for ${channel}`);
      return handler({}, payload);
    },
  };
}

function makeStore() {
  const assets = new Map([
    ['ai-asset-1', {
      id: 'ai-asset-1',
      kind: 'audio',
      providerId: 'openai',
      sourcePrompt: 'Narrate',
      createdAt: '2026-05-21T10:00:00.000Z',
      tags: [],
      sessionId: 's1',
      filePath: '/tmp/ai-asset-1.wav',
    }],
  ]);
  return {
    list: async () => [...assets.values()],
    resolve: async (id) => assets.get(id) ?? null,
    update: async (id, patch) => {
      const asset = assets.get(id);
      if (!asset) throw new Error(`AI asset not found: ${id}`);
      const updated = { ...asset, ...patch };
      assets.set(id, updated);
      return updated;
    },
    delete: async (id) => {
      const removed = assets.delete(id);
      return { removed };
    },
  };
}

test('AI asset IPC registers list/resolve/tag/delete handlers', async () => {
  const harness = makeIpcHarness();
  registerAiAssetIpcHandlers(harness.ipcMain, { store: makeStore() });

  const list = await harness.invoke(IPC_CHANNELS.AI_ASSET_LIST);
  assert.equal(list.length, 1);

  const resolved = await harness.invoke(IPC_CHANNELS.AI_ASSET_RESOLVE, { id: 'ai-asset-1' });
  assert.equal(resolved.id, 'ai-asset-1');

  const tagged = await harness.invoke(IPC_CHANNELS.AI_ASSET_TAG, { id: 'ai-asset-1', tags: ['approved'] });
  assert.deepEqual(tagged.tags, ['approved']);

  assert.deepEqual(await harness.invoke(IPC_CHANNELS.AI_ASSET_DELETE, { id: 'ai-asset-1' }), { removed: true });
});

test('AI asset resolve returns null for missing assets', async () => {
  const harness = makeIpcHarness();
  registerAiAssetIpcHandlers(harness.ipcMain, { store: makeStore() });

  assert.equal(await harness.invoke(IPC_CHANNELS.AI_ASSET_RESOLVE, { id: 'missing' }), null);
});

test('AI asset IPC rejects bad payloads before touching the store', async () => {
  const harness = makeIpcHarness();
  let touched = false;
  registerAiAssetIpcHandlers(harness.ipcMain, {
    store: {
      list: async () => [],
      resolve: async () => { touched = true; return null; },
      update: async () => { touched = true; return null; },
      delete: async () => { touched = true; return { removed: false }; },
    },
  });

  await assert.rejects(() => harness.invoke(IPC_CHANNELS.AI_ASSET_RESOLVE, {}), /id is required/);
  await assert.rejects(() => harness.invoke(IPC_CHANNELS.AI_ASSET_TAG, { id: 'x', tags: 'nope' }), /tags are required/);
  await assert.rejects(() => harness.invoke(IPC_CHANNELS.AI_ASSET_DELETE, null), /id is required/);
  assert.equal(touched, false);
});

test('AI asset delete is blocked when asset is referenced', async () => {
  const harness = makeIpcHarness();
  let deleted = false;
  registerAiAssetIpcHandlers(harness.ipcMain, {
    store: {
      list: async () => [],
      resolve: async () => null,
      update: async () => null,
      delete: async () => { deleted = true; return { removed: true }; },
    },
    isAssetReferenced: (id) => id === 'ai-asset-1',
  });

  assert.deepEqual(await harness.invoke(IPC_CHANNELS.AI_ASSET_DELETE, { id: 'ai-asset-1' }), {
    removed: false,
    blocked: true,
    reason: 'asset-referenced',
  });
  assert.equal(deleted, false);
});
