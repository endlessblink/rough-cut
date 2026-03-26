import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('spikeAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
});
