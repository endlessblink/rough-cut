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

  // ---- Recording Session ----

  /** Start a recording session (countdown → record → toolbar). */
  recordingSessionStart: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_SESSION_START),

  /** Stop the active recording session. */
  recordingSessionStop: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_SESSION_STOP),

  /** Subscribe to countdown ticks (3, 2, 1). Returns unsubscribe. */
  onSessionCountdownTick: (callback) => {
    const handler = (_event, seconds) => callback(seconds);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, handler);
  },

  /** Subscribe to session status changes ('recording', 'stopping', 'idle'). Returns unsubscribe. */
  onSessionStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, handler);
  },

  /** Subscribe to elapsed time updates (ms). Returns unsubscribe. */
  onSessionElapsed: (callback) => {
    const handler = (_event, ms) => callback(ms);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_SESSION_ELAPSED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_SESSION_ELAPSED, handler);
  },

  /** Notify main process that the toolbar window is ready. */
  notifyToolbarReady: () =>
    ipcRenderer.send(IPC_CHANNELS.RECORDING_SESSION_TOOLBAR_READY),

  // ---- Recent Projects ----

  /** Get recent projects list. Stale entries are pruned automatically. */
  recentProjectsGet: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECENT_PROJECTS_GET),

  /** Remove a project from recents by file path. */
  recentProjectsRemove: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECENT_PROJECTS_REMOVE, { filePath }),

  /** Clear all recent projects. */
  recentProjectsClear: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECENT_PROJECTS_CLEAR),

  /** Open a project by known file path (no dialog). Returns parsed ProjectDocument. */
  projectOpenPath: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_PATH, { filePath }),

  // ---- App ----

  /** Get the app version string. */
  getVersion: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),

  // ---- Auto-save ----

  /** Auto-save project. If filePath is provided, saves there (overwrite); otherwise creates in ~/Documents/Rough Cut/. Returns the resolved file path. */
  projectAutoSave: (project, filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_AUTO_SAVE, { project, filePath }),

  // ---- Storage ----

  /** Get the configured recording location (empty string = default). */
  storageGetRecordingLocation: () =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_RECORDING_LOCATION),

  /** Set the recording location path. */
  storageSetRecordingLocation: (path) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SET_RECORDING_LOCATION, { path }),

  /** Open a native directory picker dialog. Returns path or null. */
  storagePickDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_PICK_DIRECTORY),

  /** Get mounted volumes/partitions. */
  storageGetMountedVolumes: () =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_MOUNTED_VOLUMES),

  /** Get favorite locations. */
  storageGetFavorites: () =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_FAVORITES),

  /** Add a path to favorites. */
  storageAddFavorite: (path) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_ADD_FAVORITE, { path }),

  /** Remove a path from favorites. */
  storageRemoveFavorite: (path) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_REMOVE_FAVORITE, { path }),
};

contextBridge.exposeInMainWorld('roughcut', api);
