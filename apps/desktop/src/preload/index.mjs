import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';

contextBridge.exposeInMainWorld('roughCut', {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  channels: IPC_CHANNELS,
});
