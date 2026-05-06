import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, protocol, screen, Tray } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { exportProjectToMp4 } from './export-service.mjs';
import { assertReadableMp4 } from './media-probe.mjs';
import { getLinkedCameraAsset, getPrimaryRecording, openProjectFile, saveProjectFile, saveProjectForRecording } from './project-files.mjs';
import { stopRecordingAndCreateProject } from './recording-stop-handler.mjs';
import { registerMediaProtocol, toMediaUrl } from './media-protocol.mjs';
import { remuxMkvToMp4 } from './remux-service.mjs';
import { createRecordingSession, getPrimaryX11DisplayInfo } from './recording/recording-session.mjs';
import { listPulseAudioMicSources, listPulseAudioSystemAudioSources } from './recording/audio-sources.mjs';
import { listV4l2CameraSources } from './recording/camera-sources.mjs';
import { isXdotoolAvailable, readCursorViaXdotool } from './recording/xdotool-cursor.mjs';
import { installRuntimeLog } from './runtime-log.mjs';

installRuntimeLog();

if (process.platform === 'linux' && !isXdotoolAvailable()) {
  console.warn(
    '[main] xdotool is not available. Cursor tracking will fall back to ' +
      "Electron's screen.getCursorScreenPoint(), which has a known multi-monitor " +
      'regression on Linux/X11 (electron/electron#42519). Install xdotool for ' +
      'reliable cursor capture across displays.',
  );
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const recordingsDir = join(app.getPath('documents'), 'Rough Cut MVP', 'recordings');
const markerPath = join(app.getPath('userData'), 'recording-recovery.json');
const recordingStopShortcut = 'CommandOrControl+Shift+R';
const recordingRestartShortcut = 'CommandOrControl+Shift+N';
let hiddenRecorderWindow = null;
let recordingTray = null;
let hiddenRecordingOptions = null;
const recordingSession = createRecordingSession({
  recordingsDir,
  markerPath,
  getDisplayInfo: () => getPrimaryX11DisplayInfo(screen),
  // xdotool-first cursor source. Electron's getCursorScreenPoint() returns
  // stale/stuck values when the cursor leaves the primary display on Linux/X11
  // (electron/electron#42519). Fall back to it on platforms where xdotool is
  // unavailable so the app still records cursor under simpler setups.
  getCursorPoint: () => readCursorViaXdotool() ?? screen.getCursorScreenPoint(),
});

function createMainWindow({ mode = 'editor', projectPath = null } = {}) {
  const isRecorder = mode === 'recorder';
  const window = new BrowserWindow({
    width: isRecorder ? 390 : 1120,
    height: isRecorder ? 300 : 740,
    minWidth: isRecorder ? 360 : 860,
    minHeight: isRecorder ? 260 : 560,
    resizable: !isRecorder,
    maximizable: !isRecorder,
    autoHideMenuBar: true,
    title: 'Rough Cut MVP',
    backgroundColor: '#16120f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const details = event && typeof event === 'object' && 'level' in event ? event : null;
    const resolvedLevel = details?.level ?? level;
    const resolvedMessage = details?.message ?? message;
    const resolvedLine = details?.lineNumber ?? line;
    const resolvedSource = details?.sourceId ?? sourceId;
    console.info(`[renderer:${resolvedLevel}] ${resolvedMessage} (${resolvedSource}:${resolvedLine})`);
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[renderer] preload failed: ${preloadPath}`, error);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone', details);
  });

  if (process.env.ROUGH_CUT_VISUAL_SMOKE_PATH) {
    window.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const image = await window.webContents.capturePage();
        await mkdir(dirname(process.env.ROUGH_CUT_VISUAL_SMOKE_PATH), { recursive: true });
        await writeFile(process.env.ROUGH_CUT_VISUAL_SMOKE_PATH, image.toPNG());
        console.info(`[visual-smoke] wrote ${process.env.ROUGH_CUT_VISUAL_SMOKE_PATH}`);
      } catch (err) {
        console.error('[visual-smoke] failed', err);
      } finally {
        app.quit();
      }
    });
  }

  if (process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH) {
    window.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const smokeFunction = process.env.ROUGH_CUT_UI_SMOKE_RECORD_FLOW === '1'
          ? runRendererRecordingFlowSmoke
          : runRendererUiSmoke;
        const result = await window.webContents.executeJavaScript(
          `(${smokeFunction.toString()})(${JSON.stringify({
            doubleStop: process.env.ROUGH_CUT_UI_SMOKE_DOUBLE_STOP === '1',
          })})`,
          true,
        );
        if (process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH) {
          const image = await window.webContents.capturePage();
          await mkdir(dirname(process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH), { recursive: true });
          await writeFile(process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH, image.toPNG());
          result.hasVisualScreenshot = true;
        }
        await mkdir(dirname(process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH), { recursive: true });
        await writeFile(process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
        console.info(`[ui-smoke] wrote ${process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH}`);
      } catch (err) {
        console.error('[ui-smoke] failed', err);
        await mkdir(dirname(process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH), { recursive: true });
        await writeFile(
          process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH,
          `${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2)}\n`,
        );
        process.exitCode = 1;
      } finally {
        app.quit();
      }
    });
  }

  loadRenderer(window, { mode, projectPath: projectPath || process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH || null });

  return window;
}

function rendererSearch({ mode = 'editor', projectPath = null } = {}) {
  const params = new URLSearchParams();
  if (projectPath) params.set('projectPath', projectPath);
  if (mode === 'recorder') params.set('mode', 'recorder');
  const value = params.toString();
  return value ? `?${value}` : undefined;
}

function loadRenderer(window, { mode = 'editor', projectPath = null } = {}) {
  const search = rendererSearch({ mode, projectPath });
  const shouldLoadBuiltRenderer = process.env.ROUGH_CUT_LOAD_BUILT_RENDERER === '1' || process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH;

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    if (projectPath) url.searchParams.set('projectPath', projectPath);
    if (mode === 'recorder') url.searchParams.set('mode', 'recorder');
    window.loadURL(url.toString());
  } else if (!app.isPackaged) {
    if (shouldLoadBuiltRenderer) {
      window.loadFile(join(__dirname, '../../dist/renderer/index.html'), search ? { search } : undefined);
    } else {
      const url = new URL('http://127.0.0.1:7545');
      if (projectPath) url.searchParams.set('projectPath', projectPath);
      if (mode === 'recorder') url.searchParams.set('mode', 'recorder');
      window.loadURL(url.toString());
    }
  } else {
    window.loadFile(join(__dirname, '../../dist/renderer/index.html'), search ? { search } : undefined);
  }
}

ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
ipcMain.handle(IPC_CHANNELS.APP_OPEN_EDITOR, (event, projectPath = null) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) return;
  senderWindow.setResizable(true);
  senderWindow.setMaximizable(true);
  senderWindow.setMinimumSize(860, 560);
  senderWindow.setSize(1120, 740);
  senderWindow.center();
  senderWindow.show();
  loadRenderer(senderWindow, { mode: 'editor', projectPath });
});
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_MIC_SOURCES, async () => listPulseAudioMicSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES, async () => listPulseAudioSystemAudioSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_CAMERA_SOURCES, async () => listV4l2CameraSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_START, async (event, options = {}) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const { hideWindowDuringRecording, ...recordingOptions } = options ?? {};
  if (hideWindowDuringRecording && senderWindow) {
    hiddenRecorderWindow = senderWindow;
    hiddenRecordingOptions = recordingOptions;
    senderWindow.hide();
    registerHiddenRecordingStopShortcut(senderWindow);
    // X11 desktop capture records the composited desktop. Give the window
    // manager a short repaint window after unmapping the recorder surface.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const status = await recordingSession.start(recordingOptions);
  if (hideWindowDuringRecording && senderWindow) showRecordingTray(senderWindow);
  return status;
});
ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, async () => {
  try {
    const result = await finalizeActiveRecording();
    unregisterHiddenRecordingStopShortcut();
    destroyRecordingTray();
    return result;
  } catch (err) {
    console.error('[recording:stop] failed', err);
    throw err;
  }
});
ipcMain.handle(IPC_CHANNELS.RECORDING_STATUS, () => recordingSession.status());
ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async () => {
  await mkdir(recordingsDir, { recursive: true });
  const result = await dialog.showOpenDialog({
    title: 'Open Rough Cut project',
    defaultPath: recordingsDir,
    properties: ['openFile'],
    filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return formatProject(await openProjectFile(result.filePaths[0]));
});
ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, (_event, projectPath) => openProjectFile(projectPath).then(formatProject));
ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, (_event, { path, document }) => saveProjectFile(path, document).then(formatProject));
ipcMain.handle(IPC_CHANNELS.EXPORT_PICK_OUTPUT_PATH, async (_event, projectName = 'rough-cut-export') => {
  if (process.env.ROUGH_CUT_UI_SMOKE_EXPORT_PATH) return process.env.ROUGH_CUT_UI_SMOKE_EXPORT_PATH;

  const result = await dialog.showSaveDialog({
    title: 'Export MP4',
    defaultPath: `${projectName}-export.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});
ipcMain.handle(IPC_CHANNELS.EXPORT_START, async (event, { document, outputPath, mode }) => {
  return exportProjectToMp4({
    project: document,
    outputPath,
    mode,
    onProgress: (progress) => event.sender.send(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, progress),
  });
});

app.whenReady().then(() => {
  registerMediaProtocol();
  createMainWindow({ mode: 'recorder' });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ mode: 'recorder' });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregister(recordingStopShortcut);
  globalShortcut.unregister(recordingRestartShortcut);
  destroyRecordingTray();
});

function registerHiddenRecordingStopShortcut(window) {
  globalShortcut.unregister(recordingStopShortcut);
  globalShortcut.unregister(recordingRestartShortcut);
  const registered = globalShortcut.register(recordingStopShortcut, async () => {
    await stopHiddenRecordingAndOpenEditor(window);
  });
  const restartRegistered = globalShortcut.register(recordingRestartShortcut, async () => {
    await restartHiddenRecording(window);
  });
  if (!registered) console.warn(`[recording] failed to register stop shortcut ${recordingStopShortcut}`);
  if (!restartRegistered) console.warn(`[recording] failed to register restart shortcut ${recordingRestartShortcut}`);
}

function unregisterHiddenRecordingStopShortcut() {
  globalShortcut.unregister(recordingStopShortcut);
  globalShortcut.unregister(recordingRestartShortcut);
  hiddenRecorderWindow = null;
  hiddenRecordingOptions = null;
}

async function finalizeActiveRecording() {
  return stopRecordingAndCreateProject({
    recordingSession,
    assertReadableMp4,
    remuxMkvToMp4,
    saveProjectForRecording,
    formatProject,
  });
}

async function stopHiddenRecordingAndOpenEditor(window) {
  try {
    const stopped = await finalizeActiveRecording();
    unregisterHiddenRecordingStopShortcut();
    destroyRecordingTray();
    if (stopped.state === 'saved' && stopped.project && !window.isDestroyed()) {
      window.setResizable(true);
      window.setMaximizable(true);
      window.setMinimumSize(860, 560);
      window.setSize(1120, 740);
      window.center();
      window.show();
      loadRenderer(window, { mode: 'editor', projectPath: stopped.project.path });
    }
  } catch (err) {
    console.error('[recording:shortcut-stop] failed', err);
    if (!window.isDestroyed()) window.show();
  }
}

async function restartHiddenRecording(window) {
  try {
    const nextOptions = hiddenRecordingOptions ?? {};
    await finalizeActiveRecording();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await recordingSession.start(nextOptions);
    if (!window.isDestroyed()) showRecordingTray(window);
  } catch (err) {
    console.error('[recording:shortcut-restart] failed', err);
    if (!window.isDestroyed()) window.show();
  }
}

function showRecordingTray(window) {
  if (!recordingTray || recordingTray.isDestroyed()) {
    const icon = createRecordingTrayIcon();
    if (icon.isEmpty()) console.warn('[recording-tray] recording tray icon is empty; status indicator may not appear');
    recordingTray = new Tray(icon);
    recordingTray.on('click', () => recordingTray?.popUpContextMenu());
  }
  recordingTray.setToolTip(`Rough Cut is recording. Stop: ${recordingStopShortcut}. Restart: ${recordingRestartShortcut}.`);
  recordingTray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Recording...', enabled: false },
    { type: 'separator' },
    { label: `Stop recording (${recordingStopShortcut})`, click: () => { void stopHiddenRecordingAndOpenEditor(window); } },
    { label: `Restart recording (${recordingRestartShortcut})`, click: () => { void restartHiddenRecording(window); } },
    { label: 'Pause recording (segment pause pending)', enabled: false },
  ]));
}

function destroyRecordingTray() {
  if (recordingTray && !recordingTray.isDestroyed()) recordingTray.destroy();
  recordingTray = null;
}

function createRecordingTrayIcon() {
  // Electron only guarantees PNG/JPEG nativeImage support cross-platform.
  // Linux StatusNotifier trays are especially inconsistent with SVG data URLs.
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII=',
  );
}

function formatProject(project) {
  const recording = getPrimaryRecording(project.document);
  const recordingAsset = recording ? project.document.assets.find((asset) => asset.id === recording.assetId) : null;
  const cameraAsset = recordingAsset ? getLinkedCameraAsset(project.document, recordingAsset) : null;
  return {
    ...project,
    recording,
    mediaUrl: recording ? toMediaUrl(recording.filePath) : null,
    cameraMediaUrl: cameraAsset ? toMediaUrl(cameraAsset.filePath) : null,
  };
}

async function runRendererUiSmoke() {
  const waitFor = async (predicate, label, timeoutMs = 5000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const video = await waitFor(() => document.querySelector('video'), 'video element', 10000).catch((err) => {
    throw new Error(`${err.message}; url=${window.location.href}; body=${document.body.innerText.slice(0, 500)}`);
  });
  const hasStudioShell = Boolean(await waitFor(
    () => document.querySelector('[data-ui-shell="recording-studio"]') || document.querySelector('[data-ui-region="pre-record-panel"]'),
    'recording studio shell or launcher',
  ));
  const hasCaptureBar = Boolean(await waitFor(() => document.querySelector('[data-ui-region="capture-bar"]'), 'capture bar region'));
  const hasCaptureCommandArea = Boolean(await waitFor(() => document.querySelector('[data-ui-region="capture-command-area"]'), 'capture command region'));
  const hasStateBanner = Boolean(await waitFor(() => document.querySelector('[data-ui-region="state-banner"]'), 'state banner region'));
  const hasCentralStage = Boolean(await waitFor(() => document.querySelector('[data-ui-region="central-stage"]'), 'central stage region'));
  const hasTimelineRail = Boolean(await waitFor(() => document.querySelector('[data-ui-region="timeline-review-rail"]'), 'timeline rail region'));
  const hasTimelineScrubber = Boolean(await waitFor(() => document.querySelector('input[aria-label="Scrub timeline"]'), 'timeline scrubber'));
  const hasTrimHandles = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="screen"] .trimHandleStart') && document.querySelector('[data-timeline-lane="screen"] .trimHandleEnd'), 'timeline trim handles'));
  const hasZoomLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="zoom"] .timelineRegion'), 'zoom timeline lane'));
  const hasClickLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="clicks"] .clickMarker'), 'click timeline lane'));
  const hasCameraLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="camera"] .presenceRegion'), 'camera timeline lane'));
  const hasAudioLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="audio"] .presenceRegion'), 'audio timeline lane'));
  const hasRightInspector = Boolean(await waitFor(() => document.querySelector('[data-ui-region="right-inspector"]'), 'right inspector region'));
  const hasExportActionsArea = Boolean(await waitFor(() => document.querySelector('[data-ui-region="export-actions-area"]'), 'export actions region'));
  await waitFor(() => video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0, 'video metadata');
  await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'styled preview canvas');
  const hasStyledPreviewCanvas = true;
  document.querySelector('button[aria-label="Timeline"]')?.click();
  await waitFor(() => document.body.textContent?.includes('Zoom markers'), 'zoom marker panel header');
  const hasZoomMarkerPanel = true;
  await waitFor(() => document.body.textContent?.includes('Auto-zoom suggestions'), 'auto-zoom suggestions panel header');
  const hasAutoZoomSuggestionsPanel = true;
  document.querySelector('[data-timeline-lane="zoom"] .timelineRegion')?.click();
  await waitFor(() => document.querySelector('[data-inspector-context="zoom"]'), 'zoom inspector context');
  const hasInspectorContext = true;
  document.querySelector('[data-timeline-lane="screen"] .clipBody')?.click();
  await waitFor(() => document.querySelector('[data-inspector-context="recording"]'), 'recording inspector context');
  const hasTrimControls = Boolean(
    document.querySelector('[data-trim-summary="true"]')
      && Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Set start to playhead'))
      && Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Set end to playhead')),
  );
  document.querySelector('button[aria-label="Inspector"]')?.click();
  const hasInspectorGroups = Boolean(
    document.querySelector('[data-inspector-group="canvas"]')
      && document.querySelector('[data-inspector-group="screen"]')
      && document.querySelector('[data-inspector-group="zoom"]')
      && document.querySelector('[data-inspector-group="cursor"]')
      && document.querySelector('[data-inspector-group="camera"]')
      && document.querySelector('[data-inspector-group="diagnostics"]')
      && document.querySelector('[data-inspector-group="export"]'),
  );
  const hasCameraPipControls = Boolean(document.querySelector('[data-camera-pip-controls="true"]'));
  const exportMode = await waitFor(() => document.querySelector('[data-export-mode-select="true"]'), 'export mode selection');
  const hasRawPresetDetails = document.body.textContent?.includes('Raw export keeps the original recording unchanged.') ?? false;
  exportMode.value = 'styled';
  exportMode.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => document.body.textContent?.includes('Styled preset: selected aspect ratio'), 'styled preset details');
  const hasStyledPresetDetails = true;

  const selectByLabel = (text) => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    return label?.querySelector('select') ?? null;
  };
  const inputByLabel = (text, type = 'range') => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    return label?.querySelector(`input[type="${type}"]`) ?? null;
  };
  const setControlValue = (control, value) => {
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    valueSetter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const waitForEnabled = (control, label) => waitFor(() => !control.disabled, `${label} enabled`);

  const aspectRatioSelect = await waitFor(() => selectByLabel('Aspect ratio'), 'aspect ratio control');
  await waitForEnabled(aspectRatioSelect, 'aspect ratio control');
  setControlValue(aspectRatioSelect, '9:16');
  await waitFor(() => aspectRatioSelect.value === '9:16', 'vertical aspect ratio value');

  const paddingInput = await waitFor(() => inputByLabel('Padding'), 'padding control');
  await waitForEnabled(paddingInput, 'padding control');
  setControlValue(paddingInput, 96);
  await waitFor(() => paddingInput.closest('label')?.querySelector('output')?.textContent === '96', 'padding output');

  const radiusInput = await waitFor(() => inputByLabel('Round corners'), 'corner radius control');
  await waitForEnabled(radiusInput, 'corner radius control');
  setControlValue(radiusInput, 44);
  await waitFor(() => radiusInput.closest('label')?.querySelector('output')?.textContent === '44', 'corner radius output');

  const shadowInput = await waitFor(() => inputByLabel('Shadow size'), 'shadow size control');
  await waitForEnabled(shadowInput, 'shadow size control');
  setControlValue(shadowInput, 72);
  await waitFor(() => shadowInput.closest('label')?.querySelector('output')?.textContent === '72', 'shadow size output');

  const cameraPositionSelect = await waitFor(() => selectByLabel('Position'), 'camera position control');
  await waitForEnabled(cameraPositionSelect, 'camera position control');
  setControlValue(cameraPositionSelect, 'corner-tl');
  await waitFor(() => cameraPositionSelect.value === 'corner-tl', 'camera position value');

  const cameraShapeSelect = await waitFor(() => selectByLabel('Shape'), 'camera shape control');
  await waitForEnabled(cameraShapeSelect, 'camera shape control');
  setControlValue(cameraShapeSelect, 'circle');
  await waitFor(() => cameraShapeSelect.value === 'circle', 'camera shape value');

  const cameraSizeInput = await waitFor(() => inputByLabel('Camera size'), 'camera size control');
  await waitForEnabled(cameraSizeInput, 'camera size control');
  setControlValue(cameraSizeInput, 130);
  await waitFor(() => cameraSizeInput.closest('label')?.querySelector('output')?.textContent === '130', 'camera size output');

  exportMode.value = 'styled';
  exportMode.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => exportMode.value === 'styled', 'styled export mode restored');

  const exportButton = await waitFor(
    () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Export MP4')),
    'export button',
  );
  exportButton.click();

  await waitFor(() => document.body.textContent?.includes('Exported to:'), 'export completion', 10000);

  return {
    ok: true,
    title: document.querySelector('h2')?.textContent ?? null,
    duration: video.duration,
    currentTime: video.currentTime,
    hasPlaybackButton: Boolean(
      Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Play')),
    ),
    exportMode: exportMode.value,
    hasStyledMode: Boolean(Array.from(document.querySelectorAll('option')).find((option) => option.value === 'styled')),
    hasRawPresetDetails,
    hasStyledPresetDetails,
    hasZoomMarkerPanel,
    hasAutoZoomSuggestionsPanel,
    hasInspectorContext,
    hasInspectorGroups,
    hasCameraPipControls,
    hasTrimControls,
    hasStyledPreviewCanvas,
    hasStudioShell,
    hasCaptureBar,
    hasCaptureCommandArea,
    hasStateBanner,
    hasCentralStage,
    hasTimelineRail,
    hasTimelineScrubber,
    hasTrimHandles,
    hasZoomLane,
    hasClickLane,
    hasCameraLane,
    hasAudioLane,
    hasRightInspector,
    hasExportActionsArea,
    hasExportResult: document.body.textContent?.includes('Exported to:') ?? false,
    aspectRatio: aspectRatioSelect.value,
    padding: Number(paddingInput.value),
    cornerRadius: Number(radiusInput.value),
    shadowSize: Number(shadowInput.value),
    cameraPosition: cameraPositionSelect.value,
    cameraShape: cameraShapeSelect.value,
    cameraSize: Number(cameraSizeInput.value),
  };
}

async function runRendererRecordingFlowSmoke(options = {}) {
  const waitFor = async (predicate, label, timeoutMs = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}; body=${document.body.innerText.slice(0, 800)}`);
  };

  const findButton = (text) => Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(text));
  await waitFor(
    () => document.querySelector('[data-ui-shell="recording-studio"]') || document.querySelector('[data-ui-region="pre-record-panel"]'),
    'recording studio shell or launcher',
  );
  const initialState = document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state');
  const preRecordPanel = document.querySelector('[data-ui-region="pre-record-panel"]');
  if (!preRecordPanel) {
    const recordButton = await waitFor(() => findButton('Record'), 'record button');
    recordButton.click();
  }
  await waitFor(() => document.querySelector('[data-ui-region="pre-record-panel"]'), 'pre-record panel');
  await waitFor(() => document.querySelector('[data-open-editor="pre-record"]'), 'pre-record open editor button');
  const captureTargetSelect = await waitFor(
    () => document.querySelector('[data-ui-region="pre-record-panel"] select[aria-label="Capture target"]'),
    'capture target select',
  );
  await waitFor(() => captureTargetSelect.value === 'display', 'display target selected');
  captureTargetSelect.value = 'region';
  captureTargetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => captureTargetSelect.value === 'region', 'region target selected');
  await waitFor(() => document.querySelector('[aria-label="Pre-record capture region controls"]'), 'region controls');
  captureTargetSelect.value = 'display';
  captureTargetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => captureTargetSelect.value === 'display', 'display target reselected');
  const preRecordStartButton = await waitFor(() => document.querySelector('[data-recording-start="pre-record"]'), 'pre-record start button');
  preRecordStartButton.click();
  await waitFor(() => document.querySelector('[data-recording-state="recording"]'), 'recording state banner');
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const stopButton = await waitFor(() => findButton('Stop recording'), 'stop button');
  stopButton.click();
  if (options.doubleStop) {
    stopButton.click();
  }
  await waitFor(
    () => document.querySelector('[data-recording-state="saved"]') || document.querySelector('[data-ui-shell="recording-studio"]'),
    'saved recording state or editor shell',
    30000,
  );
  const savedState = document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state');
  const hasSavedMessage = document.body.textContent?.includes('Saved to:') ?? false;
  if (document.querySelector('[data-ui-shell="recording-studio"]') && !document.querySelector('[data-recording-state="saved"]')) {
    await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'post-recording preview canvas', 30000);
  }
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  const video = document.querySelector('video');
  const hasCentralStage = Boolean(document.querySelector('[data-ui-region="central-stage"]'));
  const hasTimelineRail = Boolean(document.querySelector('[data-ui-region="timeline-review-rail"]'));
  const hasRightInspector = Boolean(document.querySelector('[data-ui-region="right-inspector"]'));
  const hasStudioShell = Boolean(document.querySelector('[data-ui-shell="recording-studio"]'));

  return {
    ok: true,
    hasStudioShell,
    hasPreRecordPanel: true,
    hasCaptureTargetSelect: Boolean(captureTargetSelect),
    selectedCaptureTarget: captureTargetSelect.value,
    initialState,
    savedState,
    hasSavedMessage,
    hasProjectTitle: Boolean(document.querySelector('h2')?.textContent),
    hasCentralStage,
    hasTimelineRail,
    hasRightInspector,
    hasStyledPreviewCanvas: Boolean(canvas),
    hasVideo: Boolean(video),
    duration: video?.duration ?? null,
    doubleStop: Boolean(options.doubleStop),
  };
}
