import { app, BrowserWindow, dialog, ipcMain, protocol, screen } from 'electron';
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

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 860,
    minHeight: 560,
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

  const rendererProjectPath = process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH || null;
  const shouldLoadBuiltRenderer = process.env.ROUGH_CUT_LOAD_BUILT_RENDERER === '1' || process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH;

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    if (rendererProjectPath) url.searchParams.set('projectPath', rendererProjectPath);
    window.loadURL(url.toString());
  } else if (!app.isPackaged) {
    if (shouldLoadBuiltRenderer) {
      window.loadFile(
        join(__dirname, '../../dist/renderer/index.html'),
        rendererProjectPath ? { search: `?projectPath=${encodeURIComponent(rendererProjectPath)}` } : undefined,
      );
    } else {
      window.loadURL('http://127.0.0.1:7545');
    }
  } else {
    window.loadFile(
      join(__dirname, '../../dist/renderer/index.html'),
      rendererProjectPath ? { search: `?projectPath=${encodeURIComponent(rendererProjectPath)}` } : undefined,
    );
  }

  return window;
}

ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_MIC_SOURCES, async () => listPulseAudioMicSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES, async () => listPulseAudioSystemAudioSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_CAMERA_SOURCES, async () => listV4l2CameraSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_START, (_event, options = {}) => recordingSession.start(options));
ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, async () => {
  try {
    return await stopRecordingAndCreateProject({
      recordingSession,
      assertReadableMp4,
      remuxMkvToMp4,
      saveProjectForRecording,
      formatProject,
    });
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
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

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
  const hasStudioShell = Boolean(await waitFor(() => document.querySelector('[data-ui-shell="recording-studio"]'), 'recording studio shell'));
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
  const recordButton = await waitFor(() => findButton('Record'), 'record button');
  const hasStudioShell = Boolean(await waitFor(() => document.querySelector('[data-ui-shell="recording-studio"]'), 'recording studio shell'));
  const initialState = document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state');
  recordButton.click();
  await waitFor(() => document.querySelector('[data-ui-region="pre-record-panel"]'), 'pre-record panel');
  const preRecordStartButton = await waitFor(() => document.querySelector('[data-recording-start="pre-record"]'), 'pre-record start button');
  preRecordStartButton.click();
  await waitFor(() => document.querySelector('[data-recording-state="recording"]'), 'recording state banner');
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const stopButton = await waitFor(() => findButton('Stop recording'), 'stop button');
  stopButton.click();
  if (options.doubleStop) {
    stopButton.click();
  }
  await waitFor(() => document.querySelector('[data-recording-state="saved"]'), 'saved recording state', 30000);
  const canvas = await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'post-recording preview canvas', 30000);
  const video = await waitFor(() => document.querySelector('video'), 'post-recording video element', 30000);
  await waitFor(() => video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0, 'post-recording video metadata', 30000);
  const hasCentralStage = Boolean(document.querySelector('[data-ui-region="central-stage"]'));
  const hasTimelineRail = Boolean(document.querySelector('[data-ui-region="timeline-review-rail"]'));
  const hasRightInspector = Boolean(document.querySelector('[data-ui-region="right-inspector"]'));

  return {
    ok: true,
    hasStudioShell,
    hasPreRecordPanel: true,
    initialState,
    savedState: document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state'),
    hasSavedMessage: document.body.textContent?.includes('Saved to:') ?? false,
    hasProjectTitle: Boolean(document.querySelector('h2')?.textContent),
    hasCentralStage,
    hasTimelineRail,
    hasRightInspector,
    hasStyledPreviewCanvas: Boolean(canvas),
    hasVideo: Boolean(video),
    duration: video.duration,
    doubleStop: Boolean(options.doubleStop),
  };
}
