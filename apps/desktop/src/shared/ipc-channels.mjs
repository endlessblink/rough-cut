/** IPC channels -- the contract between main and renderer */
export const IPC_CHANNELS = {
  // Project I/O
  PROJECT_OPEN: 'project:open',
  PROJECT_SAVE: 'project:save',
  PROJECT_SAVE_AS: 'project:save-as',
  PROJECT_NEW: 'project:new',
  PROJECT_OPEN_PATH: 'project:open-path',
  LIBRARY_OPEN: 'library:open',
  LIBRARY_SAVE: 'library:save',
  LIBRARY_SAVE_AS: 'library:save-as',
  LIBRARY_OPEN_PATH: 'library:open-path',

  // Recent Projects
  RECENT_PROJECTS_GET: 'recent-projects:get',
  RECENT_PROJECTS_REMOVE: 'recent-projects:remove',
  RECENT_PROJECTS_CLEAR: 'recent-projects:clear',

  // Export
  EXPORT_START: 'export:start',
  EXPORT_CANCEL: 'export:cancel',
  EXPORT_PROGRESS: 'export:progress',
  EXPORT_COMPLETE: 'export:complete',
  EXPORT_PROGRESS_EMIT: 'export:progress-emit',
  EXPORT_COMPLETE_EMIT: 'export:complete-emit',
  EXPORT_PICK_OUTPUT_PATH: 'export:pick-output-path',
  EXPORT_FINALIZE_MEDIA: 'export:finalize-media',
  EXPORT_OPEN_FILE: 'export:open-file',
  EXPORT_SHOW_IN_FOLDER: 'export:show-in-folder',

  // Recording
  RECORDING_GET_SOURCES: 'recording:get-sources',
  RECORDING_GET_DISPLAY_BOUNDS: 'recording:get-display-bounds',
  RECORDING_GET_SYSTEM_AUDIO_SOURCES: 'recording:get-system-audio-sources',
  RECORDING_GET_PREFLIGHT_STATUS: 'recording:get-preflight-status',
  RECORDING_GET_MIC_VOLUME: 'recording:get-mic-volume',
  RECORDING_SET_MIC_VOLUME: 'recording:set-mic-volume',
  RECORDING_OPEN_PERMISSION_SETTINGS: 'recording:open-permission-settings',
  RECORDING_RECOVERY_GET: 'recording:recovery-get',
  RECORDING_RECOVERY_RECOVER: 'recording:recovery-recover',
  RECORDING_RECOVERY_DISMISS: 'recording:recovery-dismiss',
  RECORDING_RECOVERY_SET_CONTEXT: 'recording:recovery-set-context',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_STATUS: 'recording:status',

  // Recording Session (floating toolbar flow)
  RECORDING_SESSION_START: 'recording-session:start',
  RECORDING_SESSION_STOP: 'recording-session:stop',
  RECORDING_SESSION_STATUS_CHANGED: 'recording-session:status-changed',
  RECORDING_SESSION_COUNTDOWN_TICK: 'recording-session:countdown-tick',
  RECORDING_SESSION_ELAPSED: 'recording-session:elapsed',
  RECORDING_SESSION_CONNECTION_ISSUES_CHANGED: 'recording-session:connection-issues-changed',
  RECORDING_SESSION_TOOLBAR_READY: 'recording-session:toolbar-ready',

  // Recording Panel (self-contained floating window)
  PANEL_OPEN: 'panel:open',
  PANEL_CLOSE: 'panel:close',
  PANEL_RESIZE: 'panel:resize',
  PANEL_SET_SOURCE: 'panel:set-source',
  PANEL_START_RECORDING: 'panel:start-recording',
  PANEL_STOP_RECORDING: 'panel:stop-recording',
  PANEL_SAVE_RECORDING: 'panel:save-recording',
  PANEL_CONNECTION_ISSUES_CHANGED: 'panel:connection-issues-changed',
  RECORDING_ASSET_READY: 'recording:asset-ready',

  // Recording sync
  PANEL_MEDIA_RECORDER_STARTED: 'panel:media-recorder-started',
  RECORDING_CONFIG_GET: 'recording-config:get',
  RECORDING_CONFIG_UPDATE: 'recording-config:update',
  RECORDING_CONFIG_CHANGED: 'recording-config:changed',
  // Renderer publishes the active project's timeline frameRate so the main
  // process (and its panel) can record cursor samples at the same cadence the
  // playback transport will use to look them up.
  RECORDING_SET_TIMELINE_FPS: 'recording:set-timeline-fps',

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
  STORAGE_GET_AUTO_ZOOM_INTENSITY: 'storage:get-auto-zoom-intensity',
  STORAGE_SET_AUTO_ZOOM_INTENSITY: 'storage:set-auto-zoom-intensity',

  // AI Analysis
  AI_ANALYZE_CAPTIONS: 'ai:analyze-captions',
  AI_TRANSCRIBE_LIBRARY_SOURCE: 'ai:transcribe-library-source',
  AI_ANALYSIS_PROGRESS: 'ai:analysis-progress',
  AI_CANCEL_ANALYSIS: 'ai:cancel-analysis',
  AI_SET_API_KEY: 'ai:set-api-key',
  AI_GET_API_KEY: 'ai:get-api-key',
  AI_GET_PROVIDER_CONFIG: 'ai:get-provider-config',
  AI_SET_PROVIDER_CONFIG: 'ai:set-provider-config',

  // File system
  READ_TEXT_FILE: 'fs:read-text-file',
  READ_BINARY_FILE: 'fs:read-binary-file',
  WRITE_BINARY_FILE: 'fs:write-binary-file',

  // Debug (temporary)
  DEBUG_LOAD_LAST_RECORDING: 'debug:load-last-recording',
  DEBUG_GET_LAST_DISPLAY_MEDIA_SELECTION: 'debug:get-last-display-media-selection',
  DEBUG_SET_RECORDING_RECOVERY: 'debug:set-recording-recovery',
  DEBUG_SET_CAPTURE_SOURCES: 'debug:set-capture-sources',
  DEBUG_SET_DISPLAY_BOUNDS: 'debug:set-display-bounds',
  DEBUG_SET_RECORDING_PREFLIGHT_STATUS: 'debug:set-recording-preflight-status',
  DEBUG_SET_RECORDING_PERMISSION_SETTINGS_RESULT: 'debug:set-recording-permission-settings-result',
  DEBUG_APPLY_AUTO_ZOOM: 'debug:apply-auto-zoom',

  // Zoom marker persistence (sidecar alongside the recording .webm)
  ZOOM_LOAD_SIDECAR: 'zoom:load-sidecar',
  ZOOM_SAVE_SIDECAR: 'zoom:save-sidecar',

  // Shell
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
};
