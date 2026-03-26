/** IPC channels -- the contract between main and renderer */
export const IPC_CHANNELS = {
  // Project I/O
  PROJECT_OPEN: 'project:open',
  PROJECT_SAVE: 'project:save',
  PROJECT_SAVE_AS: 'project:save-as',
  PROJECT_NEW: 'project:new',

  // Export
  EXPORT_START: 'export:start',
  EXPORT_CANCEL: 'export:cancel',
  EXPORT_PROGRESS: 'export:progress',
  EXPORT_COMPLETE: 'export:complete',

  // Recording
  RECORDING_GET_SOURCES: 'recording:get-sources',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_STATUS: 'recording:status',

  // App
  APP_GET_VERSION: 'app:get-version',
};
