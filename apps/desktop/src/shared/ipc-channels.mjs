/** IPC channels -- the contract between main and renderer */
export const IPC_CHANNELS = {
  // Project I/O
  PROJECT_OPEN: 'project:open',
  PROJECT_SAVE: 'project:save',
  PROJECT_SAVE_AS: 'project:save-as',
  PROJECT_NEW: 'project:new',
  PROJECT_OPEN_PATH: 'project:open-path',

  // Recent Projects
  RECENT_PROJECTS_GET: 'recent-projects:get',
  RECENT_PROJECTS_REMOVE: 'recent-projects:remove',
  RECENT_PROJECTS_CLEAR: 'recent-projects:clear',

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

  // Recording Session (floating toolbar flow)
  RECORDING_SESSION_START: 'recording-session:start',
  RECORDING_SESSION_STOP: 'recording-session:stop',
  RECORDING_SESSION_STATUS_CHANGED: 'recording-session:status-changed',
  RECORDING_SESSION_COUNTDOWN_TICK: 'recording-session:countdown-tick',
  RECORDING_SESSION_ELAPSED: 'recording-session:elapsed',
  RECORDING_SESSION_TOOLBAR_READY: 'recording-session:toolbar-ready',

  // Recording Panel (self-contained floating window)
  PANEL_OPEN: 'panel:open',
  PANEL_CLOSE: 'panel:close',
  PANEL_RESIZE: 'panel:resize',
  PANEL_SET_SOURCE: 'panel:set-source',
  PANEL_START_RECORDING: 'panel:start-recording',
  PANEL_STOP_RECORDING: 'panel:stop-recording',
  PANEL_SAVE_RECORDING: 'panel:save-recording',
  RECORDING_ASSET_READY: 'recording:asset-ready',

  // App
  APP_GET_VERSION: 'app:get-version',

  // Auto-save
  PROJECT_AUTO_SAVE: 'project:auto-save',

  // Storage settings
  STORAGE_GET_RECORDING_LOCATION: 'storage:get-recording-location',
  STORAGE_SET_RECORDING_LOCATION: 'storage:set-recording-location',
  STORAGE_PICK_DIRECTORY: 'storage:pick-directory',
  STORAGE_GET_MOUNTED_VOLUMES: 'storage:get-mounted-volumes',
  STORAGE_GET_FAVORITES: 'storage:get-favorites',
  STORAGE_ADD_FAVORITE: 'storage:add-favorite',
  STORAGE_REMOVE_FAVORITE: 'storage:remove-favorite',

  // AI Analysis
  AI_ANALYZE_CAPTIONS: 'ai:analyze-captions',
  AI_ANALYSIS_PROGRESS: 'ai:analysis-progress',
  AI_CANCEL_ANALYSIS: 'ai:cancel-analysis',
  AI_SET_API_KEY: 'ai:set-api-key',
  AI_GET_API_KEY: 'ai:get-api-key',
  AI_GET_PROVIDER_CONFIG: 'ai:get-provider-config',
  AI_SET_PROVIDER_CONFIG: 'ai:set-provider-config',

  // File system
  READ_TEXT_FILE: 'fs:read-text-file',
  READ_BINARY_FILE: 'fs:read-binary-file',

  // Debug (temporary)
  DEBUG_LOAD_LAST_RECORDING: 'debug:load-last-recording',
};
