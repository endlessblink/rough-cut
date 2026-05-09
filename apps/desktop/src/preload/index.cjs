const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = {
  APP_GET_VERSION: 'app:get-version',
  APP_OPEN_EDITOR: 'app:open-editor',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  SHELL_OPEN_PATH: 'shell:open-path',
  PROJECT_OPEN: 'project:open',
  PROJECT_OPEN_PATH: 'project:open-path',
  PROJECT_SAVE: 'project:save',
  EXPORT_PICK_OUTPUT_PATH: 'export:pick-output-path',
  EXPORT_START: 'export:start',
  EXPORT_PROGRESS_EMIT: 'export:progress-emit',
  RECORDING_GET_MIC_SOURCES: 'recording:get-mic-sources',
  RECORDING_GET_SYSTEM_AUDIO_SOURCES: 'recording:get-system-audio-sources',
  RECORDING_GET_CAMERA_SOURCES: 'recording:get-camera-sources',
  RECORDING_GET_PREFLIGHT_STATUS: 'recording:get-preflight-status',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_CANCEL: 'recording:cancel',
  RECORDING_STATUS: 'recording:status',
  RECORDING_RECOVERY_GET: 'recording:recovery-get',
  RECORDING_RECOVERY_RECOVER: 'recording:recovery-recover',
  RECORDING_RECOVERY_DISMISS: 'recording:recovery-dismiss',
};

contextBridge.exposeInMainWorld('roughCut', {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  openEditor: (projectPath) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EDITOR, projectPath),
  showItemInFolder: (path) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, path),
  openPath: (path) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, path),
  getMicSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_MIC_SOURCES),
  getSystemAudioSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES),
  getCameraSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_CAMERA_SOURCES),
  getRecordingPreflightStatus: (options) => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_PREFLIGHT_STATUS, options),
  startRecording: (options) => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_START, options),
  stopRecording: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP),
  cancelRecording: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_CANCEL),
  getRecordingStatus: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STATUS),
  getRecoveryState: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RECOVERY_GET),
  recoverLastRecording: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RECOVERY_RECOVER),
  dismissRecovery: (options) => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RECOVERY_DISMISS, options ?? {}),
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
