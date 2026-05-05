const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = {
  APP_GET_VERSION: 'app:get-version',
  PROJECT_OPEN: 'project:open',
  PROJECT_OPEN_PATH: 'project:open-path',
  PROJECT_SAVE: 'project:save',
  EXPORT_PICK_OUTPUT_PATH: 'export:pick-output-path',
  EXPORT_START: 'export:start',
  EXPORT_PROGRESS_EMIT: 'export:progress-emit',
  RECORDING_GET_MIC_SOURCES: 'recording:get-mic-sources',
  RECORDING_GET_SYSTEM_AUDIO_SOURCES: 'recording:get-system-audio-sources',
  RECORDING_GET_CAMERA_SOURCES: 'recording:get-camera-sources',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_STATUS: 'recording:status',
};

contextBridge.exposeInMainWorld('roughCut', {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getMicSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_MIC_SOURCES),
  getSystemAudioSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES),
  getCameraSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_CAMERA_SOURCES),
  startRecording: (options) => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_START, options),
  stopRecording: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP),
  getRecordingStatus: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STATUS),
  openProject: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),
  openProjectPath: (path) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_PATH, path),
  saveProject: (project) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE, project),
  pickExportOutputPath: (projectName) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PICK_OUTPUT_PATH, projectName),
  exportProject: (payload) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_START, payload),
  onExportProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, listener);
  },
  channels: IPC_CHANNELS,
});
