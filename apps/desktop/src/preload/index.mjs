import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';

/** The API exposed to the renderer process via window.roughcut */
const api = {
  // ---- Project I/O ----

  /** Open a .roughcut file via native dialog. Returns parsed JSON or null. */
  projectOpen: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),

  /** Save project to a known file path. Returns true on success. */
  projectSave: (project, filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE, { project, filePath }),

  /** Save-as via native dialog. Returns the chosen path or null. */
  projectSaveAs: (project) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE_AS, { project }),

  /** Request a new project. Returns null (renderer creates via createProject). */
  projectNew: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_NEW),

  // ---- Export ----

  /** Start export. Progress and completion are reported via events. */
  exportStart: (project, settings, outputPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_START, { project, settings, outputPath }),

  /** Cancel a running export. */
  exportCancel: () =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CANCEL),

  /** Subscribe to export progress events. Returns an unsubscribe function. */
  onExportProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.EXPORT_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EXPORT_PROGRESS, handler);
  },

  /** Subscribe to export completion events. Returns an unsubscribe function. */
  onExportComplete: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on(IPC_CHANNELS.EXPORT_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EXPORT_COMPLETE, handler);
  },

  // ---- Recording ----

  /** Get available screen/window capture sources. */
  recordingGetSources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_SOURCES),

  /** Save a finished recording. Buffer is an ArrayBuffer, metadata has fps/width/height/durationMs. */
  recordingSaveRecording: (buffer, metadata) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP, { buffer, metadata }),

  // ---- App ----

  /** Get the app version string. */
  getVersion: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
};

contextBridge.exposeInMainWorld('roughcut', api);
