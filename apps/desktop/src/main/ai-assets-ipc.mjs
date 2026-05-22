import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';

function idFromPayload(payload) {
  const id = typeof payload === 'string' ? payload : payload?.id;
  if (typeof id !== 'string' || !id) throw new Error('AI asset id is required');
  return id;
}

function tagsFromPayload(payload) {
  if (!Array.isArray(payload?.tags)) throw new Error('AI asset tags are required');
  return payload.tags;
}

export function registerAiAssetIpcHandlers(ipcMain, { store, isAssetReferenced = () => false }) {
  if (!ipcMain?.handle) throw new Error('ipcMain.handle is required');
  if (!store) throw new Error('AI assets store is required');

  ipcMain.handle(IPC_CHANNELS.AI_ASSET_LIST, () => store.list());

  ipcMain.handle(IPC_CHANNELS.AI_ASSET_RESOLVE, async (_event, payload) => {
    const id = idFromPayload(payload);
    return store.resolve(id);
  });

  ipcMain.handle(IPC_CHANNELS.AI_ASSET_TAG, async (_event, payload) => {
    const id = idFromPayload(payload);
    return store.update(id, { tags: tagsFromPayload(payload) });
  });

  ipcMain.handle(IPC_CHANNELS.AI_ASSET_DELETE, async (_event, payload) => {
    const id = idFromPayload(payload);
    if (isAssetReferenced(id)) {
      return { removed: false, blocked: true, reason: 'asset-referenced' };
    }
    return store.delete(id);
  });
}
