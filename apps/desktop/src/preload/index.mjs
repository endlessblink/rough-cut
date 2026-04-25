import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';

/** The API exposed to the renderer process via window.roughcut */
const api = {
  // ---- Project I/O ----

  /** Open a .roughcut file via native dialog. Returns parsed JSON or null. */
  projectOpen: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),

  /** Save project to a known file path. Returns true on success. */
  projectSave: (project, filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE, { project, filePath }),

  /** Save-as via native dialog. Returns the chosen path or null. */
  projectSaveAs: (project) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE_AS, { project }),

  /** Request a new project. Returns null (renderer creates via createProject). */
  projectNew: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_NEW),

  /** Open a .roughcutlib file via native dialog. Returns parsed JSON or null. */
  libraryOpen: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_OPEN),

  /** Save library to a known file path. Returns true on success. */
  librarySave: (library, filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SAVE, { library, filePath }),

  /** Save-as via native dialog. Returns the chosen path or null. */
  librarySaveAs: (library) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SAVE_AS, { library }),

  // ---- Export ----

  /** Start export. Progress and completion are reported via events. */
  exportStart: (project, settings, outputPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_START, { project, settings, outputPath }),

  /** Cancel a running export. */
  exportCancel: () => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CANCEL),

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

  /** Relay export progress from renderer-side pipelines back through main. */
  exportEmitProgress: (progress) => ipcRenderer.send(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, progress),

  /** Relay export completion from renderer-side pipelines back through main. */
  exportEmitComplete: (result) => ipcRenderer.send(IPC_CHANNELS.EXPORT_COMPLETE_EMIT, result),

  /** Pick an export output path via native save dialog. */
  exportPickOutputPath: (projectName, format) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PICK_OUTPUT_PATH, { projectName, format }),

  /** Finalize a renderer-produced export, muxing audio when possible. */
  exportFinalizeMedia: (project, videoPath, outputPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_FINALIZE_MEDIA, { project, videoPath, outputPath }),

  // ---- Recording ----

  /** Get available screen/window capture sources. */
  recordingGetSources: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_SOURCES),

  /** Get capture-space bounds for all attached displays. */
  recordingGetDisplayBounds: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_DISPLAY_BOUNDS),

  /** Get available system-audio sources when supported by the platform. */
  recordingGetSystemAudioSources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES),

  /** Read the resolved mic source's PulseAudio volume. */
  recordingGetMicVolume: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_MIC_VOLUME),

  /** Set the resolved mic source's PulseAudio volume (0–100 percent). */
  recordingSetMicVolume: (percent) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_SET_MIC_VOLUME, { percent }),

  /** Get platform-specific permission guidance for recording preflight. */
  recordingGetPreflightStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_PREFLIGHT_STATUS),

  /** Open the OS settings page for a recording permission when supported. */
  recordingOpenPermissionSettings: (kind) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_OPEN_PERMISSION_SETTINGS, { kind }),

  /** Get any persisted recovery marker from an interrupted recording session. */
  recordingRecoveryGet: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RECOVERY_GET),

  /** Import the recoverable partial take from an interrupted session. */
  recordingRecoveryRecover: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RECOVERY_RECOVER),

  /** Dismiss the interrupted-recording recovery marker. */
  recordingRecoveryDismiss: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RECOVERY_DISMISS),

  /** Save a finished recording. Buffer is an ArrayBuffer, metadata has fps/width/height/durationMs. */
  recordingSaveRecording: (buffer, metadata) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP, { buffer, metadata }),

  // ---- Recording Session ----

  /** Start a recording session (countdown → record → toolbar). */
  recordingSessionStart: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_SESSION_START),

  /** Stop the active recording session. */
  recordingSessionStop: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_SESSION_STOP),

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

  /** Subscribe to current panel-reported connection issues. */
  onSessionConnectionIssuesChanged: (callback) => {
    const handler = (_event, issues) => callback(issues);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_SESSION_CONNECTION_ISSUES_CHANGED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_SESSION_CONNECTION_ISSUES_CHANGED, handler);
  },

  /** Notify main process that the toolbar window is ready. */
  notifyToolbarReady: () => ipcRenderer.send(IPC_CHANNELS.RECORDING_SESSION_TOOLBAR_READY),

  // ---- Recent Projects ----

  /** Get recent projects list. Stale entries are pruned automatically. */
  recentProjectsGet: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT_PROJECTS_GET),

  /** Remove a project from recents by file path. */
  recentProjectsRemove: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECENT_PROJECTS_REMOVE, { filePath }),

  /** Clear all recent projects. */
  recentProjectsClear: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT_PROJECTS_CLEAR),

  /** Open a project by known file path (no dialog). Returns parsed ProjectDocument. */
  projectOpenPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_PATH, { filePath }),

  /** Open a library by known file path (no dialog). Returns parsed LibraryDocument. */
  libraryOpenPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_OPEN_PATH, { filePath }),

  // ---- App ----

  /** Get the app version string. */
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),

  /** Open a file or folder path with the OS shell. */
  shellOpenPath: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, filePath),

  /** Reveal a file in its containing folder. */
  shellShowItemInFolder: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, filePath),

  // ---- File system ----

  /** Read a text file from disk (used for cursor event sidecar loading). Returns string or null. */
  readTextFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.READ_TEXT_FILE, filePath),

  /** Read a binary file from disk as ArrayBuffer (used for WebCodecs camera decode). Returns ArrayBuffer or null. */
  readBinaryFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.READ_BINARY_FILE, filePath),

  /** Write a binary file to disk from an ArrayBuffer. */
  writeBinaryFile: (filePath, buffer) =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_BINARY_FILE, { filePath, buffer }),

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
  storagePickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_PICK_DIRECTORY),

  /** Get mounted volumes/partitions. */
  storageGetMountedVolumes: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_MOUNTED_VOLUMES),

  /** Get favorite locations. */
  storageGetFavorites: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_FAVORITES),

  /** Add a path to favorites. */
  storageAddFavorite: (path) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_ADD_FAVORITE, { path }),

  /** Remove a path from favorites. */
  storageRemoveFavorite: (path) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_REMOVE_FAVORITE, { path }),

  /** Get the auto zoom intensity setting (0–1). */
  storageGetAutoZoomIntensity: () =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_AUTO_ZOOM_INTENSITY),

  /** Set the auto zoom intensity setting (0–1). */
  storageSetAutoZoomIntensity: (intensity) =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SET_AUTO_ZOOM_INTENSITY, { intensity }),

  // ---- Recording Panel ----

  /** Open the floating recording panel window. */
  openRecordingPanel: () => ipcRenderer.invoke(IPC_CHANNELS.PANEL_OPEN),

  /** Close the floating recording panel window. */
  closeRecordingPanel: () => ipcRenderer.invoke(IPC_CHANNELS.PANEL_CLOSE),

  /** Resize the floating recording panel between setup and mini modes. */
  panelResize: (mode) => ipcRenderer.invoke(IPC_CHANNELS.PANEL_RESIZE, { mode }),

  /** Tell main process which source the panel selected. */
  panelSetSource: (sourceId) => ipcRenderer.send(IPC_CHANNELS.PANEL_SET_SOURCE, { sourceId }),

  /** Get the shared Record config. */
  recordingConfigGet: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_CONFIG_GET),

  /** Update the shared Record config. */
  recordingConfigUpdate: (patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_CONFIG_UPDATE, { patch }),

  /** Publish the active project's timeline frameRate so the cursor recorder
   *  can sample at the same cadence the playback transport uses.
   *  @param {number} fps */
  setRecordingTimelineFps: (fps) =>
    ipcRenderer.send(IPC_CHANNELS.RECORDING_SET_TIMELINE_FPS, { fps }),

  /** Subscribe to shared Record config changes. */
  onRecordingConfigChanged: (callback) => {
    const handler = (_event, config) => callback(config);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_CONFIG_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_CONFIG_CHANGED, handler);
  },

  /** Start recording (triggers countdown in session manager).
   *  @param {{ micEnabled?: boolean, sysAudioEnabled?: boolean, countdownSeconds?: number, selectedMicDeviceId?: string | null, selectedMicLabel?: string | null, selectedSystemAudioSourceId?: string | null }} [audioConfig] */
  panelStartRecording: (audioConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_START_RECORDING, audioConfig),

  /** Stop recording. */
  panelStopRecording: () => ipcRenderer.invoke(IPC_CHANNELS.PANEL_STOP_RECORDING),

  /** Report current panel connection issues to the main session manager. */
  panelReportConnectionIssues: (issues) =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_CONNECTION_ISSUES_CHANGED, issues),

  /** Notify session manager that recording is paused. */
  panelPause: () => ipcRenderer.send('panel:pause'),

  /** Notify session manager that recording is resumed. */
  panelResume: () => ipcRenderer.send('panel:resume'),

  /** Subscribe to pause requests initiated outside the panel UI (for example the tray). */
  onPanelPauseRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('panel:tray-pause', handler);
    return () => ipcRenderer.removeListener('panel:tray-pause', handler);
  },

  /** Subscribe to resume requests initiated outside the panel UI (for example the tray). */
  onPanelResumeRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('panel:tray-resume', handler);
    return () => ipcRenderer.removeListener('panel:tray-resume', handler);
  },

  /** Notify main that the panel's MediaRecorder has started (for cursor sync). */
  panelMediaRecorderStarted: (timestampMs) =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_MEDIA_RECORDER_STARTED, { timestampMs }),

  /** Send recording buffer to main for saving. Optionally includes camera buffer. */
  panelSaveRecording: (buffer, metadata, cameraBuffer) =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_SAVE_RECORDING, { buffer, metadata, cameraBuffer }),

  /** Subscribe to recording asset ready events (main window). Returns unsubscribe. */
  onRecordingAssetReady: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_ASSET_READY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_ASSET_READY, handler);
  },

  // ---- AI Analysis ----

  /** Get API key for a provider. */
  aiGetApiKey: (provider) => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_API_KEY, { provider }),

  /** Set API key for a provider. */
  aiSetApiKey: (provider, apiKey) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SET_API_KEY, { provider, apiKey }),

  /** Get provider config. */
  aiGetProviderConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_PROVIDER_CONFIG),

  /** Set provider config. */
  aiSetProviderConfig: (provider) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SET_PROVIDER_CONFIG, { provider }),

  /** Transcribe a library source and persist transcript segments into its .roughcutlib file. */
  aiTranscribeLibrarySource: (libraryFilePath, sourceId, fps) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_TRANSCRIBE_LIBRARY_SOURCE, {
      libraryFilePath,
      sourceId,
      fps,
    }),

  /** Analyze assets for captions. Returns CaptionSegment[]. */
  aiAnalyzeCaptions: (assets, fps) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_ANALYZE_CAPTIONS, { assets, fps }),

  /** Cancel running analysis. */
  aiCancelAnalysis: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_ANALYSIS),

  /** Subscribe to analysis progress events. Returns unsubscribe function. */
  onAIProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.AI_ANALYSIS_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_ANALYSIS_PROGRESS, handler);
  },

  /** [DEBUG] Reload the most recent recording from disk. Returns RecordingResult or null. */
  debugLoadLastRecording: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_LOAD_LAST_RECORDING),

  /** [DEBUG] Inspect the last source granted by the display-media handler. */
  debugGetLastDisplayMediaSelection: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_GET_LAST_DISPLAY_MEDIA_SELECTION),

  /** [DEBUG] Seed or clear the interrupted-recording recovery marker. */
  debugSetRecordingRecovery: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_SET_RECORDING_RECOVERY, payload),

  /** [DEBUG] Override available capture sources for deterministic mode/source tests. */
  debugSetCaptureSources: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_SET_CAPTURE_SOURCES, payload),

  /** [DEBUG] Override display bounds for deterministic cursor tests. */
  debugSetDisplayBounds: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_SET_DISPLAY_BOUNDS, payload),

  /** [DEBUG] Trigger auto-zoom generation from a cursor NDJSON file, bypassing a real recording session. */
  debugApplyAutoZoom: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_APPLY_AUTO_ZOOM, payload),

  /** Load the zoom sidecar (recording-xxx.zoom.json). Returns ZoomPresentation or null. */
  zoomLoadSidecar: (recordingFilePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.ZOOM_LOAD_SIDECAR, { recordingFilePath }),

  /** Save the zoom sidecar next to the recording file. Returns true on success. */
  zoomSaveSidecar: (recordingFilePath, presentation) =>
    ipcRenderer.invoke(IPC_CHANNELS.ZOOM_SAVE_SIDECAR, { recordingFilePath, presentation }),
};

contextBridge.exposeInMainWorld('roughcut', api);
