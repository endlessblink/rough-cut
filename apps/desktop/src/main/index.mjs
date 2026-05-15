import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, protocol, screen, session, shell, Tray } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { exportProjectToMp4 } from './export-service.mjs';
import { assertReadableMp4, computeSyncedRecordingTiming, probeVideoStreamsTiming, probeVideoTiming } from './media-probe.mjs';
import { getLinkedCameraAsset, getPrimaryRecording, openProjectFile, saveProjectFile, saveProjectForRecording, validateProjectPath } from './project-files.mjs';
import { stopRecordingAndCreateProject } from './recording-stop-handler.mjs';
import { dismissRecovery, getRecoveryState, recoverFromMarker } from './recording-recovery.mjs';
import { registerMediaProtocol, toMediaUrl } from './media-protocol.mjs';
import { remuxMkvToMp4 } from './remux-service.mjs';
import { createRecordingSession, getPrimaryX11DisplayInfo } from './recording/recording-session.mjs';
import { startFfmpegCameraPreview } from './recording/ffmpeg-capture.mjs';
import { listPulseAudioMicSources, listPulseAudioSystemAudioSources } from './recording/audio-sources.mjs';
import { listV4l2CameraSources } from './recording/camera-sources.mjs';
import { getRecordingPreflightStatus } from './recording/preflight.mjs';
import { isXdotoolAvailable, readCursorViaXdotool } from './recording/xdotool-cursor.mjs';
import { installRuntimeLog } from './runtime-log.mjs';

const runtimeLogPath = installRuntimeLog();

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

function buildAllowedProjectRoots() {
  const roots = [recordingsDir];
  // Tests / smokes write fixtures to a tmp dir and pass it via ROUGH_CUT_UI_SMOKE_PROJECT_PATH.
  // Without including its parent dir, validateProjectPath rejects the fixture as outside-root.
  const smokeProject = process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH;
  if (smokeProject) roots.push(dirname(smokeProject));
  return roots;
}
const markerPath = join(app.getPath('userData'), 'recording-recovery.json');
const recordingStopShortcut = 'CommandOrControl+Shift+R';
const recordingRestartShortcut = 'CommandOrControl+Shift+N';
let hiddenRecorderWindow = null;
let recordingTray = null;
let recordingTrayWindow = null;
let hiddenRecordingOptions = null;
let hiddenRecordingStopping = false;
let activeRecordingFinalizePromise = null;
let activeCameraPreview = null;
let activeExportController = null;
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

async function listCameraSources() {
  const sources = await listV4l2CameraSources();
  const smokeCameraPath = process.env.ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH;
  if (!smokeCameraPath) return sources;
  return [
    {
      id: smokeCameraPath,
      name: smokeCameraPath,
      label: `Smoke camera (${smokeCameraPath})`,
    },
    ...sources.filter((source) => source.name !== smokeCameraPath),
  ];
}

function createMainWindow({ mode = 'editor', projectPath = null } = {}) {
  const isRecorder = mode === 'recorder';
  const smokeWindowWidth = Number(process.env.ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH);
  const smokeWindowHeight = Number(process.env.ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT);
  const window = new BrowserWindow({
    width: Number.isFinite(smokeWindowWidth) && smokeWindowWidth > 0 ? smokeWindowWidth : isRecorder ? 760 : 1120,
    height: Number.isFinite(smokeWindowHeight) && smokeWindowHeight > 0 ? smokeWindowHeight : isRecorder ? 620 : 740,
    minWidth: isRecorder ? 720 : 860,
    minHeight: isRecorder ? 560 : 560,
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
        const smokeFunction = process.env.ROUGH_CUT_UI_SMOKE_LAYOUT_ONLY === '1'
          ? runRendererSidebarLayoutSmoke
          : process.env.ROUGH_CUT_UI_SMOKE_RECORD_FLOW === '1'
          ? runRendererRecordingFlowSmoke
          : runRendererUiSmoke;
        const result = await window.webContents.executeJavaScript(
          `(${smokeFunction.toString()})(${JSON.stringify({
            doubleStop: process.env.ROUGH_CUT_UI_SMOKE_DOUBLE_STOP === '1',
            cameraWarning: process.env.ROUGH_CUT_UI_SMOKE_CAMERA_WARNING === '1',
            cancelFlow: process.env.ROUGH_CUT_UI_SMOKE_CANCEL_FLOW === '1',
            invalidRegion: process.env.ROUGH_CUT_UI_SMOKE_INVALID_REGION === '1',
          })})`,
          true,
        );
        if (process.env.ROUGH_CUT_UI_SMOKE_RECORD_FLOW === '1' && result.savedState === 'saved') {
          await waitForRendererLoad(window.webContents, 35000);
          const editorResult = await window.webContents.executeJavaScript(`(${runRendererEditorLoadedSmoke.toString()})()`, true);
          Object.assign(result, editorResult);
        }
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

function listCaptureDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    label: display.label || `Display ${display.id}`,
    primary: display.id === primaryId,
    scaleFactor: display.scaleFactor,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
  }));
}

function waitForRendererLoad(webContents, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for renderer reload'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      webContents.off('did-finish-load', onLoad);
      webContents.off('did-fail-load', onFail);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onFail = (_event, errorCode, errorDescription) => {
      cleanup();
      reject(new Error(`Renderer failed to load: ${errorCode} ${errorDescription}`));
    };
    webContents.once('did-finish-load', onLoad);
    webContents.once('did-fail-load', onFail);
  });
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

async function stopActiveCameraPreview(token = null) {
  const preview = activeCameraPreview;
  if (!preview || (token && preview.token !== token)) return;
  activeCameraPreview = null;
  try {
    await Promise.race([
      preview.handle.stop(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (err) {
    console.warn('[camera-preview] stop failed:', err?.message ?? err);
  }
}

ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
ipcMain.handle(IPC_CHANNELS.APP_GET_RUNTIME_LOG_PATH, () => runtimeLogPath);
ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, (_event, itemPath) => {
  if (typeof itemPath === 'string' && itemPath.length > 0) shell.showItemInFolder(itemPath);
});
ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, (_event, itemPath) => {
  if (typeof itemPath !== 'string' || itemPath.length === 0) return 'Missing path.';
  return shell.openPath(itemPath);
});
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
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_CAMERA_SOURCES, async () => listCameraSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_CAMERA_PREVIEW_START, async (event, options = {}) => {
  const devicePath = typeof options.devicePath === 'string' ? options.devicePath.trim() : '';
  if (!devicePath) throw new Error('Camera device path is required.');
  await stopActiveCameraPreview();
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sender = event.sender;
  const handle = startFfmpegCameraPreview({
    devicePath,
    onFrame: (frame) => {
      if (activeCameraPreview?.token !== token || sender.isDestroyed()) return;
      sender.send(IPC_CHANNELS.RECORDING_CAMERA_PREVIEW_FRAME, {
        token,
        dataUrl: `data:image/jpeg;base64,${frame.toString('base64')}`,
      });
    },
  });
  activeCameraPreview = { token, sender, handle };
  sender.once('destroyed', () => {
    if (activeCameraPreview?.token === token) void stopActiveCameraPreview(token);
  });
  return { token, pid: handle.getPid?.() ?? null };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_CAMERA_PREVIEW_STOP, async (_event, token = null) => {
  await stopActiveCameraPreview(token);
  return { stopped: true };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_DISPLAYS, () => listCaptureDisplays());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_PREFLIGHT_STATUS, async (_event, options = {}) => {
  const [micSources, systemAudioSources, cameraSources] = await Promise.all([
    listPulseAudioMicSources().catch(() => []),
    listPulseAudioSystemAudioSources().catch(() => []),
    listCameraSources().catch(() => []),
  ]);
  return getRecordingPreflightStatus({
    recordingsDir,
    displayInfo: getPrimaryX11DisplayInfo(screen),
    micSources,
    systemAudioSources,
    cameraSources,
    options,
  });
});
ipcMain.handle(IPC_CHANNELS.RECORDING_START, async (event, options = {}) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const { hideWindowDuringRecording, ...recordingOptions } = options ?? {};
  await stopActiveCameraPreview();
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
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(null, 'finalizing');
  try {
    const result = await finalizeActiveRecording();
    updateRecordingTray(null, 'saved');
    return result;
  } catch (err) {
    console.error('[recording:stop] failed', err);
    throw err;
  }
});
ipcMain.handle(IPC_CHANNELS.RECORDING_CANCEL, async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const shouldShowRecorderAfterCancel = Boolean(senderWindow && hiddenRecorderWindow === senderWindow);
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(null, 'canceling');
  try {
    console.info('[recording:cancel] requested');
    const result = await recordingSession.cancel();
    console.info(`[recording:cancel] completed ${JSON.stringify(result)}`);
    if (shouldShowRecorderAfterCancel && senderWindow && !senderWindow.isDestroyed()) senderWindow.show();
    updateRecordingTray(null, 'discarded');
    return result;
  } catch (err) {
    console.error('[recording:cancel] failed', err);
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
  // The user explicitly picked this path via the OS dialog, so we trust it.
  // Keep the extension + null-byte checks but skip the allowlist.
  const safePath = validateProjectPath(result.filePaths[0]);
  return formatProject(await openProjectFile(safePath));
});
ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, (_event, projectPath) => {
  const safePath = validateProjectPath(projectPath, { allowedRoots: buildAllowedProjectRoots() });
  return openProjectFile(safePath).then(formatProject);
});
// Serialize concurrent saves per project path. The renderer can fire two
// project:save calls in quick succession (e.g. autosave + manual save). The
// atomic write in saveProjectFile uses a fixed `.tmp` suffix per path; two
// parallel saves both `open(...,'w')` the same tmp file and write into the
// same inode at offset 0, producing interleaved bytes and a corrupt JSON
// after rename. Queueing per path makes saves strictly sequential, which is
// what saveProjectFile already assumes.
const projectSaveQueues = new Map();
ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, async (_event, { path, document }) => {
  const safePath = validateProjectPath(path, { allowedRoots: buildAllowedProjectRoots() });
  const prev = projectSaveQueues.get(safePath) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => saveProjectFile(safePath, document).then(formatProject));
  projectSaveQueues.set(safePath, next);
  try {
    return await next;
  } finally {
    if (projectSaveQueues.get(safePath) === next) projectSaveQueues.delete(safePath);
  }
});
ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_GET, () => getRecoveryState({ markerPath }));
ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_RECOVER, async () => {
  return recoverFromMarker({
    markerPath,
    remuxMkvToMp4,
    assertReadableMp4,
    saveProjectForRecording,
    formatProject,
    onLog: (line) => console.info(line),
  });
});
ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_DISMISS, (_event, options = {}) => {
  return dismissRecovery({ markerPath, deleteFiles: Boolean(options?.deleteFiles) });
});
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
  if (activeExportController) throw new Error('An export is already running. Cancel it before starting another export.');
  const controller = new AbortController();
  activeExportController = controller;
  try {
    return await exportProjectToMp4({
      project: document,
      outputPath,
      mode,
      signal: controller.signal,
      onProgress: (progress) => event.sender.send(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, progress),
    });
  } finally {
    if (activeExportController === controller) activeExportController = null;
  }
});
ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, () => {
  if (!activeExportController) return { cancelled: false };
  activeExportController.abort();
  return { cancelled: true };
});

app.whenReady().then(() => {
  registerMediaProtocol();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  const startupProjectPath = process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH || null;
  const startupMode = process.env.ROUGH_CUT_UI_SMOKE_FORCE_EDITOR === '1' ? 'editor' : startupProjectPath ? 'editor' : 'recorder';
  createMainWindow({ mode: startupMode, projectPath: startupProjectPath });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ mode: startupMode, projectPath: startupProjectPath });
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

async function runRendererSidebarLayoutSmoke() {
  const waitFor = async (predicate, label, timeoutMs = 5000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const waitForFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  await waitFor(() => document.querySelector('[data-ui-region="editor-workspace"]'), 'editor workspace');
  if (new URL(window.location.href).searchParams.has('projectPath')) {
    await waitFor(() => document.querySelector('video'), 'loaded project video', 10000);
  }
  const snapshots = [];
  for (const label of ['Background', 'Timeline', 'Inspector']) {
    document.querySelector(`button[aria-label="${label}"]`)?.click();
    await waitFor(() => document.querySelector(`[aria-label="${label} board"]`), `${label} board`);
    await waitForFrame();
    snapshots.push({ tool: label, rects: collectRects() });
  }

  const baseline = snapshots[0]?.rects ?? {};
  const stableRegions = ['shell', 'editor', 'stage', 'timeline', 'inspector', 'preview'].every((region) => snapshots.every((snapshot) => sameRect(baseline[region], snapshot.rects[region])));
  return {
    ok: stableRegions,
    hasStableToolSwitchLayout: stableRegions,
    width: window.innerWidth,
    height: window.innerHeight,
    mode: document.querySelector('video') ? 'loaded' : 'empty',
    snapshots,
  };

  function collectRects() {
    return {
      shell: rectToRoundedObject(document.querySelector('[data-ui-shell="recording-studio"]')?.getBoundingClientRect()),
      editor: rectToRoundedObject(document.querySelector('[data-ui-region="editor-workspace"]')?.getBoundingClientRect()),
      stage: rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect()),
      timeline: rectToRoundedObject(document.querySelector('[data-ui-region="timeline-review-rail"]')?.getBoundingClientRect()),
      inspector: rectToRoundedObject(document.querySelector('[data-ui-region="right-inspector"]')?.getBoundingClientRect()),
      preview: rectToRoundedObject((document.querySelector('canvas.styledPreviewCanvas') ?? document.querySelector('.emptyStage'))?.getBoundingClientRect()),
    };
  }

  function rectToRoundedObject(rect) {
    if (!rect) return null;
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function sameRect(a, b) {
    if (!a || !b) return false;
    return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 1);
  }
}

// External SIGTERM / SIGINT (force-quit, OOM, init-system shutdown): synchronously
// SIGTERM every spawned ffmpeg/xinput child so they don't outlive Electron.
// Marker is intentionally left in place — TASK-088 surfaces it for recovery on
// next launch. Don't await stop() here — Node exits as the event loop drains.
function reapAndExit(signal) {
  try {
    const reaped = recordingSession.terminateChildren('SIGTERM');
    if (reaped.length > 0) {
      console.warn(`[recording] ${signal}: SIGTERMed ${reaped.length} child process(es): ${reaped.map((c) => `${c.name}(${c.pid ?? '?'})`).join(', ')}`);
    }
  } catch (err) {
    console.error(`[recording] ${signal}: reap failed`, err);
  }
  // 128 + signal-number convention.
  process.exit(signal === 'SIGINT' ? 130 : 143);
}
process.on('SIGTERM', () => reapAndExit('SIGTERM'));
process.on('SIGINT', () => reapAndExit('SIGINT'));

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
  if (activeRecordingFinalizePromise) return activeRecordingFinalizePromise;
  activeRecordingFinalizePromise = stopRecordingAndCreateProject({
    recordingSession,
    assertReadableMp4,
    remuxMkvToMp4,
    saveProjectForRecording,
    formatProject,
    probeVideoTiming,
    probeVideoStreamsTiming,
    computeSyncedRecordingTiming,
  }).finally(() => {
    activeRecordingFinalizePromise = null;
  });
  return activeRecordingFinalizePromise;
}

async function stopHiddenRecordingAndOpenEditor(window) {
  if (hiddenRecordingStopping) return;
  hiddenRecordingStopping = true;
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(window, 'finalizing');
  try {
    const stopped = await finalizeActiveRecording();
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
  } finally {
    updateRecordingTray(window, 'saved');
    hiddenRecordingStopping = false;
  }
}

async function restartHiddenRecording(window) {
  if (hiddenRecordingStopping) return;
  hiddenRecordingStopping = true;
  try {
    const nextOptions = hiddenRecordingOptions ?? {};
    updateRecordingTray(window, 'finalizing');
    await finalizeActiveRecording();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await recordingSession.start(nextOptions);
    hiddenRecordingStopping = false;
    if (!window.isDestroyed()) showRecordingTray(window);
  } catch (err) {
    console.error('[recording:shortcut-restart] failed', err);
    if (!window.isDestroyed()) window.show();
  } finally {
    hiddenRecordingStopping = false;
  }
}

async function cancelHiddenRecording(window) {
  if (hiddenRecordingStopping) return;
  hiddenRecordingStopping = true;
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(window, 'canceling');
  try {
    await recordingSession.cancel();
    if (!window.isDestroyed()) {
      window.show();
      loadRenderer(window, { mode: 'recorder' });
    }
    updateRecordingTray(window, 'discarded');
  } catch (err) {
    console.error('[recording:shortcut-cancel] failed', err);
    if (!window.isDestroyed()) window.show();
  } finally {
    hiddenRecordingStopping = false;
  }
}

function showRecordingTray(window) {
  updateRecordingTray(window, 'recording');
}

function updateRecordingTray(window, state) {
  if (window) recordingTrayWindow = window;
  if (!recordingTray || recordingTray.isDestroyed()) {
    if (hiddenRecordingStopping && state === 'recording') return;
    const icon = createRecordingTrayIcon(state);
    if (icon.isEmpty()) console.warn('[recording-tray] recording tray icon is empty; status indicator may not appear');
    recordingTray = new Tray(icon);
    recordingTray.on('click', () => recordingTray?.popUpContextMenu());
  } else {
    const icon = createRecordingTrayIcon(state);
    if (!icon.isEmpty()) recordingTray.setImage(icon);
  }

  const menuWindow = window ?? recordingTrayWindow;
  recordingTray.setToolTip(recordingTrayTooltip(state));
  // Linux requires setContextMenu() after each menu change; mutating items is not enough.
  recordingTray.setContextMenu(Menu.buildFromTemplate(recordingTrayMenuTemplate(menuWindow, state)));
}

function recordingTrayTooltip(state) {
  if (state === 'saved') return 'Rough Cut saved your recording.';
  if (state === 'discarded') return 'Rough Cut discarded the recording.';
  if (state === 'finalizing') return 'Rough Cut is finalizing your recording.';
  if (state === 'canceling') return 'Rough Cut is canceling and discarding the take.';
  return `Rough Cut is recording. Stop: ${recordingStopShortcut}. Restart: ${recordingRestartShortcut}.`;
}

function recordingTrayMenuTemplate(window, state) {
  if (state === 'saved') {
    return [
      { label: 'Recording saved', enabled: false },
      { label: 'Editor is open', enabled: false },
      { type: 'separator' },
      { label: 'Open editor', click: () => { if (window && !window.isDestroyed()) window.show(); } },
    ];
  }
  if (state === 'discarded') {
    return [
      { label: 'Recording discarded', enabled: false },
      { label: 'Ready for another take', enabled: false },
      { type: 'separator' },
      { label: 'Show recorder', click: () => { if (window && !window.isDestroyed()) window.show(); } },
    ];
  }
  if (state === 'finalizing') {
    return [
      { label: 'Finalizing recording...', enabled: false },
      { label: 'Saving and opening editor', enabled: false },
    ];
  }
  if (state === 'canceling') {
    return [
      { label: 'Canceling recording...', enabled: false },
      { label: 'Discarding current take', enabled: false },
    ];
  }
  return [
    { label: 'Recording...', enabled: false },
    { type: 'separator' },
    { label: `Stop recording (${recordingStopShortcut})`, click: () => { if (window) void stopHiddenRecordingAndOpenEditor(window); } },
    { label: `Restart recording (${recordingRestartShortcut})`, click: () => { if (window) void restartHiddenRecording(window); } },
    { label: 'Pause recording (segment pause pending)', enabled: false },
    { type: 'separator' },
    { label: 'Cancel and discard take', click: () => { if (window) void cancelHiddenRecording(window); } },
  ];
}

function destroyRecordingTray() {
  if (recordingTray && !recordingTray.isDestroyed()) {
    recordingTray.setContextMenu(null);
    recordingTray.setToolTip('');
    recordingTray.destroy();
  }
  recordingTray = null;
  recordingTrayWindow = null;
}

function createRecordingTrayIcon(state = 'recording') {
  // Electron only guarantees PNG/JPEG nativeImage support cross-platform.
  // Linux StatusNotifier trays are especially inconsistent with SVG data URLs.
  const pngByState = {
    recording: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfEF/u4/+hiPAcXYahnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAVeYcFnAz8g4AAAAASUVORK5CYII=',
    finalizing: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfE13nc/9HFuJO+YqhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsA4YwcFh9atbUAAAAASUVORK5CYII=',
    canceling: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfElMU7/qOL5cR6YKhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAR+YcFuEAROcAAAAASUVORK5CYII=',
    saved: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfEW/rU/9FFrJQ+YqhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAfe4cFsU7Bl0AAAAASUVORK5CYII=',
    discarded: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfElMU7/qOL5cR6YKhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAR+YcFuEAROcAAAAASUVORK5CYII=',
  };
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngByState[state] ?? pngByState.recording}`);
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
  const hasNoInertTopBarIcons = !document.querySelector('[data-ui-region="capture-bar"] .titleIcon')
    && !Array.from(document.querySelectorAll('[data-ui-region="capture-bar"] .topActions button.iconButton')).some((button) => !button.getAttribute('title') || !button.getAttribute('aria-label'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
  const hasShortcutsDialog = Boolean(await waitFor(() => document.querySelector('[data-ui-region="shortcuts-dialog"]'), 'shortcuts dialog'));
  document.querySelector('[data-ui-region="shortcuts-dialog"] button')?.click();
  await waitFor(() => !document.querySelector('[data-ui-region="shortcuts-dialog"]'), 'shortcuts dialog closed');
  const hasCaptureCommandArea = Boolean(await waitFor(() => document.querySelector('[data-ui-region="capture-command-area"]'), 'capture command region'));
  const hasStateBanner = Boolean(await waitFor(() => document.querySelector('[data-ui-region="state-banner"]'), 'state banner region'));
  const hasCentralStage = Boolean(await waitFor(() => document.querySelector('[data-ui-region="central-stage"]'), 'central stage region'));
  const hasTimelineRail = Boolean(await waitFor(() => document.querySelector('[data-ui-region="timeline-review-rail"]'), 'timeline rail region'));
  const hasTimelineScrubber = Boolean(await waitFor(() => document.querySelector('input[aria-label="Scrub timeline"]'), 'timeline scrubber'));
  const hasKeyboardTimelineScrubber = Boolean(document.querySelector('input[aria-label="Scrub timeline"][aria-valuetext]'));
  const timelineScrubberInput = document.querySelector('input[aria-label="Scrub timeline"]');
  const hasTimelineScrubberFineStep = timelineScrubberInput?.getAttribute('step') === 'any';
  let hasTimelineArrowKeyAdvance = false;
  if (timelineScrubberInput instanceof HTMLInputElement) {
    timelineScrubberInput.focus();
    const beforeValue = Number(timelineScrubberInput.value);
    timelineScrubberInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    timelineScrubberInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await waitFor(() => Number(timelineScrubberInput.value) > beforeValue, 'timeline arrow key advance');
    hasTimelineArrowKeyAdvance = Number(timelineScrubberInput.value) > beforeValue;
  }
  const hasTrimHandles = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="screen"] .trimHandleStart') && document.querySelector('[data-timeline-lane="screen"] .trimHandleEnd'), 'timeline trim handles'));
  const hasTimelineLiveRegion = Boolean(document.querySelector('[data-ui-region="timeline-live-region"][aria-live="polite"]'));
  const hasKeyboardTrimHandles = Boolean(
    document.querySelector('[data-timeline-lane="screen"] .trimHandleStart[role="slider"][aria-valuenow]')
      && document.querySelector('[data-timeline-lane="screen"] .trimHandleEnd[role="slider"][aria-valuenow]'),
  );
  const hasZoomLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="zoom"]'), 'zoom timeline lane'));
  const hasClickLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="clicks"]'), 'click timeline lane'));
  const hasCameraLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="camera"]'), 'camera timeline lane'));
  const hasAudioLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="audio"]'), 'audio timeline lane'));
  const hasRightInspector = Boolean(await waitFor(() => document.querySelector('[data-ui-region="right-inspector"]'), 'right inspector region'));
  const hasExportStatusArea = Boolean(await waitFor(() => document.querySelector('[data-ui-region="export-status-area"]'), 'export status region'));
  await waitFor(() => video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0, 'video metadata');
  const styledPreviewCanvas = await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'styled preview canvas');
  const hasStyledPreviewCanvas = true;
  const hasFrameDragHandles = styledPreviewCanvas?.getAttribute('data-screen-draggable') === 'true' && styledPreviewCanvas?.getAttribute('data-camera-draggable') === 'true';
  document.querySelector('button[aria-label="Timeline"]')?.click();
  const stageRectBeforeToolSwitch = rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect());
  await waitFor(() => document.querySelector('[aria-label="Zoom markers"]') && document.body.textContent?.includes('Markers'), 'zoom marker panel header');
  const hasZoomMarkerPanel = true;
  const hasTimelineZoomControlPanel = Boolean(document.querySelector('[data-ui-region="timeline-zoom-control-panel"]'));
  await waitFor(() => document.querySelector('[aria-label="Auto-zoom suggestions"]') && document.body.textContent?.includes('Suggestions'), 'auto-zoom suggestions panel header');
  const hasAutoZoomSuggestionsPanel = true;
  const hasZoomResizeHandles = Boolean(document.querySelector('[data-timeline-lane="zoom"] .zoomResizeStart') && document.querySelector('[data-timeline-lane="zoom"] .zoomResizeEnd'));
  const hasKeyboardZoomControls = Boolean(
    document.querySelector('[data-timeline-lane="zoom"] .timelineRegion[role="button"][tabindex="0"]')
      && document.querySelector('[data-timeline-lane="zoom"] .zoomResizeStart[role="slider"][tabindex="0"]')
      && document.querySelector('[data-timeline-lane="zoom"] .zoomResizeEnd[role="slider"][tabindex="0"]'),
  );
  const hasNoSetupBoardHorizontalOverflow = Boolean(await waitFor(() => {
    const board = document.querySelector('.setupBoard');
    return board && board.scrollWidth <= board.clientWidth + 1;
  }, 'setup board without horizontal overflow'));
  const zoomRegion = document.querySelector('[data-timeline-lane="zoom"] .timelineRegion');
  zoomRegion?.click();
  const hasZoomInspectorContext = zoomRegion
    ? Boolean(await waitFor(() => document.querySelector('[data-inspector-context="zoom"]'), 'zoom inspector context'))
    : false;
  document.querySelector('[data-timeline-lane="screen"] .clipBody')?.click();
  const hasRecordingInspectorContext = Boolean(await waitFor(() => document.querySelector('[data-inspector-context="recording"]'), 'recording inspector context'));
  const hasInspectorContext = hasZoomInspectorContext || hasRecordingInspectorContext;
  const hasTrimControls = Boolean(
    document.querySelector('[data-trim-summary="true"]')
      && Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Set start to playhead'))
      && Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Set end to playhead')),
  );
  const hasCutControls = Boolean(
    document.querySelector('[data-cut-range-panel="true"]')
      && Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Mark cut start'))
      && Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Cut to playhead')),
  );
  document.querySelector('button[aria-label="Inspector"]')?.click();
  await waitFor(() => document.querySelector('[data-inspector-context]'), 'inspector board active');
  const stageRectAfterInspectorSwitch = rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect());
  document.querySelector('button[aria-label="Background"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Background board"]'), 'background board active');
  const stageRectAfterBackgroundSwitch = rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect());
  const hasStableToolSwitchLayout = sameRect(stageRectBeforeToolSwitch, stageRectAfterInspectorSwitch) && sameRect(stageRectBeforeToolSwitch, stageRectAfterBackgroundSwitch);
  document.querySelector('button[aria-label="Inspector"]')?.click();
  await waitFor(() => document.querySelector('[data-inspector-group="camera"]'), 'inspector groups after tool stability check');
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
  await waitFor(() => document.querySelector('[data-export-action="styled"]'), 'styled review export action');
  const hasReviewExportActions = Boolean(document.querySelector('[data-export-action="styled"]') && document.querySelector('[data-export-action="raw"]'));
  const hasRawPresetDetails = document.body.textContent?.includes('Raw export keeps the original recording unchanged.') ?? false;
  const hasStyledPresetDetails = document.body.textContent?.includes('Styled preset: selected aspect ratio') ?? false;

  document.querySelector('button[aria-label="Background"]')?.click();
  const backgroundPreset = await waitFor(() => document.querySelector('button[aria-label="Soft blur"]'), 'background preset');
  backgroundPreset.click();
  await waitFor(() => backgroundPreset.getAttribute('aria-pressed') === 'true', 'background preset selected');
  const hasBackgroundPresetSelection = true;
  const hasNoInactiveBackgroundTabs = !Array.from(document.querySelectorAll('button')).some((button) => button.textContent === 'Image' || button.textContent === 'Video');
  const hasBackgroundShadowControls = ['Enable shadow', 'Strength', 'Softness', 'Distance'].every((text) => document.body.textContent?.includes(text));
  document.querySelector('button[aria-label="Inspector"]')?.click();

  const selectByLabel = (text) => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    return label?.querySelector('select') ?? null;
  };
  const inputByLabel = (text, type = 'range') => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    return label?.querySelector(`input[type="${type}"]`) ?? null;
  };
  const outputTextByLabel = (text) => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    return label?.querySelector('output')?.textContent ?? null;
  };
  const setControlValue = (control, value) => {
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    valueSetter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    if (control instanceof HTMLInputElement && control.type === 'range') {
      control.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }
  };
  const waitForEnabled = (control, label) => waitFor(() => !control.disabled, `${label} enabled`);

  const aspectRatioSelect = await waitFor(() => selectByLabel('Aspect ratio'), 'aspect ratio control');
  await waitForEnabled(aspectRatioSelect, 'aspect ratio control');
  const mobileTemplate = await waitFor(() => document.querySelector('[data-template-id="mobile-9-16"]'), 'mobile template preset');
  mobileTemplate.click();
  await waitFor(() => aspectRatioSelect.value === '9:16', 'vertical aspect ratio value');
  await waitFor(() => mobileTemplate.getAttribute('aria-pressed') === 'true', 'mobile template selected');
  const hasTemplatePresetSelection = true;

  const paddingInput = await waitFor(() => inputByLabel('Padding'), 'padding control');
  await waitForEnabled(paddingInput, 'padding control');
  const paddingRangeLabel = paddingInput.closest('label');
  const rangeControl = paddingRangeLabel?.querySelector('.rangeControl');
  const rangeVisual = paddingRangeLabel?.querySelector('.rangeVisual');
  const rangeFill = paddingRangeLabel?.querySelector('.rangeFill');
  const rangeThumb = paddingRangeLabel?.querySelector('.rangeThumb');
  const rangeVisualStyle = rangeVisual ? getComputedStyle(rangeVisual) : null;
  const hasCustomRangeSkin = Boolean(
    rangeControl
      && rangeVisual
      && rangeFill
      && rangeThumb
      && rangeControl.contains(paddingInput)
      && rangeVisualStyle
      && rangeVisualStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
      && rangeVisualStyle.borderRadius !== '0px',
  );
  setControlValue(paddingInput, 96);
  await waitFor(() => paddingInput.closest('label')?.querySelector('output')?.textContent === '96', 'padding output');

  const radiusInput = await waitFor(() => inputByLabel('Round corners'), 'corner radius control');
  await waitForEnabled(radiusInput, 'corner radius control');
  const initialCornerRadius = outputTextByLabel('Round corners');
  setControlValue(radiusInput, 44);
  await waitFor(() => outputTextByLabel('Round corners') === '44', 'corner radius output');
  await waitForEnabled(radiusInput, 'corner radius save complete');
  const undoButton = await waitFor(() => {
    const button = document.querySelector('button[aria-label="Undo last edit"]');
    return button && !button.disabled ? button : null;
  }, 'undo button enabled');
  undoButton.click();
  await waitFor(() => initialCornerRadius && outputTextByLabel('Round corners') === initialCornerRadius, 'corner radius undo output');
  await waitFor(() => {
    const control = inputByLabel('Round corners');
    return control && !control.disabled ? control : null;
  }, 'corner radius undo save complete');
  const redoButton = await waitFor(() => {
    const button = document.querySelector('button[aria-label="Redo last edit"]');
    return button && !button.disabled ? button : null;
  }, 'redo button enabled');
  redoButton.click();
  await waitFor(() => outputTextByLabel('Round corners') === '44', 'corner radius redo output');
  const hasUndoRedoControls = true;

  const shadowInput = await waitFor(() => inputByLabel('Shadow size'), 'shadow size control');
  await waitForEnabled(shadowInput, 'shadow size control');
  setControlValue(shadowInput, 72);
  await waitFor(() => shadowInput.closest('label')?.querySelector('output')?.textContent === '72', 'shadow size output');

  let cameraPosition = null;
  let cameraShape = null;
  let cameraSize = null;
  if (hasCameraPipControls) {
    const cameraPositionSelect = await waitFor(() => selectByLabel('Position'), 'camera position control');
    await waitForEnabled(cameraPositionSelect, 'camera position control');
    setControlValue(cameraPositionSelect, 'corner-tl');
    await waitFor(() => cameraPositionSelect.value === 'corner-tl', 'camera position value');
    cameraPosition = cameraPositionSelect.value;

    const cameraShapeSelect = await waitFor(() => selectByLabel('Shape'), 'camera shape control');
    await waitForEnabled(cameraShapeSelect, 'camera shape control');
    setControlValue(cameraShapeSelect, 'circle');
    await waitFor(() => cameraShapeSelect.value === 'circle', 'camera shape value');
    cameraShape = cameraShapeSelect.value;

    const cameraSizeInput = await waitFor(() => inputByLabel('Camera size'), 'camera size control');
    await waitForEnabled(cameraSizeInput, 'camera size control');
    setControlValue(cameraSizeInput, 130);
    await waitFor(() => cameraSizeInput.closest('label')?.querySelector('output')?.textContent === '130', 'camera size output');
    cameraSize = Number(cameraSizeInput.value);
  }

  // Measure canvas render fps during 1s of playback. The draw counter is
  // incremented by tick() in VideoPreview via window.__roughCutCanvasDrawCount.
  window.__roughCutCanvasDrawCount = 0;
  const playBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Play'));
  if (playBtn && !playBtn.disabled) playBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const canvasDrawCount = window.__roughCutCanvasDrawCount ?? 0;
  const canvasRenderFps = Math.round(canvasDrawCount);
  const pauseBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Pause'));
  if (pauseBtn) pauseBtn.click();

  const exportButton = await waitFor(() => {
    const button = document.querySelector('[data-export-action="styled"]');
    return button && !button.disabled ? button : null;
  }, 'styled review export button');
  exportButton.click();
  const hasExportProgressMeter = Boolean(await waitFor(() => document.querySelector('[data-export-progress-meter="true"]'), 'export progress meter', 5000).catch(() => null));

  await waitFor(() => document.body.textContent?.includes('Exported to:'), 'export completion', 30000);

  return {
    ok: true,
    title: document.querySelector('h2')?.textContent ?? null,
    duration: video.duration,
    currentTime: video.currentTime,
    hasPlaybackButton: Boolean(
      Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Play')),
    ),
    exportMode: 'styled',
    hasStyledMode: hasReviewExportActions,
    hasReviewExportActions,
    hasRawPresetDetails,
    hasStyledPresetDetails,
    hasTemplatePresetSelection,
    hasBackgroundPresetSelection,
    hasNoInactiveBackgroundTabs,
    hasBackgroundShadowControls,
    hasCustomRangeSkin,
    hasZoomMarkerPanel,
    hasTimelineZoomControlPanel,
    hasStableToolSwitchLayout,
    hasZoomResizeHandles,
    hasKeyboardZoomControls,
    hasTimelineLiveRegion,
    hasKeyboardTrimHandles,
    hasNoSetupBoardHorizontalOverflow,
    hasAutoZoomSuggestionsPanel,
    hasInspectorContext,
    hasInspectorGroups,
    hasCameraPipControls,
    hasTrimControls,
    hasCutControls,
    hasStyledPreviewCanvas,
    hasFrameDragHandles,
    hasUndoRedoControls,
    hasStudioShell,
    hasCaptureBar,
    hasNoInertTopBarIcons,
    hasShortcutsDialog,
    hasCaptureCommandArea,
    hasStateBanner,
    hasCentralStage,
    hasTimelineRail,
    hasTimelineScrubber,
    hasKeyboardTimelineScrubber,
    hasTimelineScrubberFineStep,
    hasTimelineArrowKeyAdvance,
    hasTrimHandles,
    hasZoomLane,
    hasClickLane,
    hasCameraLane,
    hasAudioLane,
    hasRightInspector,
    hasExportStatusArea,
    hasExportProgressMeter,
    hasExportResult: document.body.textContent?.includes('Exported to:') ?? false,
    canvasRenderFps,
    aspectRatio: aspectRatioSelect.value,
    padding: Number(paddingInput.value),
    cornerRadius: Number(radiusInput.value),
    shadowSize: Number(shadowInput.value),
    cameraPosition,
    cameraShape,
    cameraSize,
  };

  function rectToRoundedObject(rect) {
    if (!rect) return null;
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function sameRect(a, b) {
    if (!a || !b) return false;
    return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 1);
  }
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
  const preflightPanel = await waitFor(() => document.querySelector('[data-ui-region="recording-preflight-status"]'), 'preflight status panel');
  const hasPreflightWarningsCopy = document.body.textContent?.includes('screen-only recording') ?? false;
  const captureTargetSelect = await waitFor(
    () => document.querySelector('[data-ui-region="pre-record-panel"] select[aria-label="Capture target"]'),
    'capture target select',
  );
  const sourcePicker = await waitFor(() => document.querySelector('[data-ui-region="capture-source-picker"]'), 'capture source picker');
  const regionSourceCard = await waitFor(() => document.querySelector('[data-source-option="region"]'), 'region source card');
  const windowSourceCard = await waitFor(() => document.querySelector('[data-source-option="window"]'), 'window source card');
  await waitFor(() => captureTargetSelect.value === 'display', 'display target selected');
  regionSourceCard.click();
  await waitFor(() => captureTargetSelect.value === 'region', 'region target selected');
  await waitFor(() => document.querySelector('[aria-label="Selected capture region"]'), 'selected region summary');
  await waitFor(() => document.querySelector('[data-ui-region="capture-screen-picker"]'), 'region screen picker');
  const hasNoRegionNumberInputs = !document.querySelector('.numberField, .regionControls input[type="number"]');
  captureTargetSelect.value = 'display';
  captureTargetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => captureTargetSelect.value === 'display', 'display target reselected');
  const hasCaptureSourcePicker = Boolean(sourcePicker);
  const hasDisabledWindowSource = Boolean(windowSourceCard?.disabled);
  let hasInvalidRegionRejected = !options.invalidRegion;
  if (options.invalidRegion) {
    try {
      await window.roughCut.startRecording({ captureRegion: { mode: 'region', x: 1900, y: 100, width: 400, height: 300 } });
      hasInvalidRegionRejected = false;
      await window.roughCut.cancelRecording().catch(() => undefined);
    } catch (err) {
      hasInvalidRegionRejected = /outside the attached display bounds|Capture region is invalid/.test(err?.message ?? String(err));
    }
  }
  let selectedCameraSource = null;
  if (options.cameraWarning) {
    const cameraSelect = await waitFor(() => document.querySelector('select[aria-label="Camera source"]'), 'camera source select');
    const cameraOption = await waitFor(
      () => Array.from(cameraSelect.options).find((option) => option.value && option.value !== '__off' && !option.disabled),
      'camera source option',
    );
    selectedCameraSource = cameraOption.value;
    cameraSelect.value = selectedCameraSource;
    cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => cameraSelect.value === selectedCameraSource, 'camera source selected');
  }
  const hasPreRecordCameraSetup = options.cameraWarning
    ? Boolean(await waitFor(() => document.querySelector('[data-ui-region="pre-record-camera-setup"]'), 'pre-record camera setup'))
    : Boolean(document.querySelector('[data-ui-region="pre-record-camera-setup"]'));
  const preRecordCameraPreviewState = options.cameraWarning
    ? await waitFor(() => document.querySelector('[data-camera-preview-state]')?.getAttribute('data-camera-preview-state'), 'camera preview state', 15000)
    : document.querySelector('[data-camera-preview-state]')?.getAttribute('data-camera-preview-state') ?? null;
  const preRecordStartButton = await waitFor(() => document.querySelector('[data-recording-start="pre-record"]'), 'pre-record start button');
  preRecordStartButton.click();
  await waitFor(() => document.querySelector('[data-recording-state="recording"]'), 'recording state banner');
  const liveCameraFailureBanner = options.cameraWarning
    ? await waitFor(() => document.querySelector('[data-ui-region="recording-camera-failure"]'), 'live camera failure banner', 15000)
    : document.querySelector('[data-ui-region="recording-camera-failure"]');
  const hasLiveCameraFailureBanner = Boolean(liveCameraFailureBanner);
  const hasLiveCameraFailureActions = Boolean(liveCameraFailureBanner)
    && ['Stop and retry with camera off', 'Continue screen-only'].every((label) => liveCameraFailureBanner.textContent?.includes(label));
  await new Promise((resolve) => setTimeout(resolve, 1800));
  if (options.cancelFlow) {
    const cancelButton = await waitFor(() => findButton('Cancel and discard'), 'cancel button');
    cancelButton.click();
    await waitFor(() => document.querySelector('[data-recording-state="idle"]'), 'idle recording state after cancel', 30000);
    return {
      ok: true,
      hasStudioShell: Boolean(document.querySelector('[data-ui-shell="recording-studio"]')),
      hasPreRecordPanel: true,
      hasPreflightPanel: Boolean(preflightPanel),
      hasPreflightWarningsCopy,
      hasCaptureTargetSelect: Boolean(captureTargetSelect),
      hasCaptureSourcePicker,
      hasDisabledWindowSource,
      hasNoRegionNumberInputs,
      hasInvalidRegionRejected,
      selectedCaptureTarget: captureTargetSelect.value,
      initialState,
      canceledState: document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state'),
      hasSavedMessage: document.body.textContent?.includes('Saved to:') ?? false,
      hasReviewWorkspace: Boolean(document.querySelector('[data-ui-region="post-recording-review"]')),
      hasVideo: Boolean(document.querySelector('video')),
      cancelFlow: true,
      hasLiveCameraFailureBanner,
      hasLiveCameraFailureActions,
    };
  }
  const stopButton = await waitFor(() => findButton('Stop recording'), 'stop button');
  stopButton.click();
  await waitFor(() => stopButton.textContent.includes('Stopping...') && stopButton.disabled, 'stopping lock');
  if (options.doubleStop) {
    stopButton.click();
  }
  await waitFor(() => document.querySelector('[data-recording-state="saved"]'), 'saved recording state', 30000);
  const savedState = document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state');
  const hasSavedMessage = document.body.textContent?.includes('Saved to:') ?? false;
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  const video = document.querySelector('video');
  const hasCentralStage = Boolean(document.querySelector('[data-ui-region="central-stage"]'));
  const hasTimelineRail = Boolean(document.querySelector('[data-ui-region="timeline-review-rail"]'));
  const hasRightInspector = Boolean(document.querySelector('[data-ui-region="right-inspector"]'));
  const hasReviewWorkspace = Boolean(document.querySelector('[data-ui-region="post-recording-review"]'));
  const hasPostRecordingActions = Boolean(document.querySelector('[data-ui-region="post-recording-actions"]'));
  const reviewActionText = document.querySelector('[data-ui-region="post-recording-actions"]')?.textContent ?? '';
  const hasReviewExportActions = Boolean(document.querySelector('[data-export-action="styled"]') && document.querySelector('[data-export-action="raw"]'));
  const hasReviewNextActions = ['Folder', 'Diagnostics', 'Project', 'New'].every((label) => reviewActionText.includes(label));
  const reviewCameraWarningText = document.querySelector('[data-review-warning="camera"]')?.textContent ?? '';
  const hasReviewCameraWarning = reviewCameraWarningText.includes('Screen recording preserved') && reviewCameraWarningText.includes('without webcam PiP');
  const hasStateCameraWarning = document.body.textContent?.includes('Camera was unavailable') ?? false;
  const hasStudioShell = Boolean(document.querySelector('[data-ui-shell="recording-studio"]'));

  return {
    ok: true,
    hasStudioShell,
    hasPreRecordPanel: true,
    hasPreflightPanel: Boolean(preflightPanel),
    hasPreflightWarningsCopy,
    hasCaptureTargetSelect: Boolean(captureTargetSelect),
    hasCaptureSourcePicker,
    hasDisabledWindowSource,
    hasNoRegionNumberInputs,
    hasInvalidRegionRejected,
    selectedCaptureTarget: captureTargetSelect.value,
    initialState,
    savedState,
    hasSavedMessage,
    hasProjectTitle: Boolean(document.querySelector('h2')?.textContent),
    hasCentralStage,
    hasTimelineRail,
    hasRightInspector,
    hasReviewWorkspace,
    hasPostRecordingActions,
    hasReviewExportActions,
    hasReviewNextActions,
    selectedCameraSource,
    hasPreRecordCameraSetup,
    preRecordCameraPreviewState,
    hasReviewCameraWarning,
    hasStateCameraWarning,
    hasLiveCameraFailureBanner,
    hasLiveCameraFailureActions,
    hasStyledPreviewCanvas: Boolean(canvas),
    hasVideo: Boolean(video),
    duration: video?.duration ?? null,
    doubleStop: Boolean(options.doubleStop),
    hasStoppingLock: true,
  };
}

async function runRendererEditorLoadedSmoke() {
  const waitFor = async (predicate, label, timeoutMs = 30000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}; body=${document.body.innerText.slice(0, 800)}`);
  };

  await waitFor(() => document.querySelector('[data-ui-shell="recording-studio"]'), 'post-recording editor shell');
  await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'post-recording preview canvas');
  await waitFor(() => document.querySelector('video'), 'post-recording video');
  await waitFor(() => document.querySelector('[data-ui-region="post-recording-review"]'), 'post-recording review workspace');
  const reviewActionText = document.querySelector('[data-ui-region="post-recording-actions"]')?.textContent ?? '';
  const reviewCameraWarningText = document.querySelector('[data-review-warning="camera"]')?.textContent ?? '';

  return {
    hasStudioShell: Boolean(document.querySelector('[data-ui-shell="recording-studio"]')),
    hasCentralStage: Boolean(document.querySelector('[data-ui-region="central-stage"]')),
    hasTimelineRail: Boolean(document.querySelector('[data-ui-region="timeline-review-rail"]')),
    hasRightInspector: Boolean(document.querySelector('[data-ui-region="right-inspector"]')),
    hasReviewWorkspace: Boolean(document.querySelector('[data-ui-region="post-recording-review"]')),
    hasPostRecordingActions: Boolean(document.querySelector('[data-ui-region="post-recording-actions"]')),
    hasReviewExportActions: Boolean(document.querySelector('[data-export-action="styled"]') && document.querySelector('[data-export-action="raw"]')),
    hasReviewNextActions: ['Folder', 'Diagnostics', 'Project', 'New'].every((label) => reviewActionText.includes(label)),
    hasReviewCameraWarning: reviewCameraWarningText.includes('Screen recording preserved') && reviewCameraWarningText.includes('without webcam PiP'),
    hasStyledPreviewCanvas: Boolean(document.querySelector('canvas.styledPreviewCanvas')),
    hasVideo: Boolean(document.querySelector('video')),
    duration: document.querySelector('video')?.duration ?? null,
  };
}
