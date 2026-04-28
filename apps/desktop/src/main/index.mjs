import { app, BrowserWindow, dialog, ipcMain, protocol, screen } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { exportProjectToMp4 } from './export-service.mjs';
import { assertReadableMp4 } from './media-probe.mjs';
import { getPrimaryRecording, openProjectFile, saveProjectFile, saveProjectForRecording } from './project-files.mjs';
import { stopRecordingAndCreateProject } from './recording-stop-handler.mjs';
import { registerMediaProtocol } from './media-protocol.mjs';
import { remuxMkvToMp4 } from './remux-service.mjs';
import { createRecordingSession, getPrimaryX11DisplayInfo } from './recording/recording-session.mjs';
import { installRuntimeLog } from './runtime-log.mjs';

installRuntimeLog();

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

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    window.loadURL('http://127.0.0.1:7545');
  } else {
    window.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  }

  return window;
}

ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
ipcMain.handle(IPC_CHANNELS.RECORDING_START, () => recordingSession.start());
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
  const result = await dialog.showOpenDialog({
    title: 'Open Rough Cut project',
    properties: ['openFile'],
    filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return formatProject(await openProjectFile(result.filePaths[0]));
});
ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, (_event, projectPath) => openProjectFile(projectPath).then(formatProject));
ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, (_event, { path, document }) => saveProjectFile(path, document).then(formatProject));
ipcMain.handle(IPC_CHANNELS.EXPORT_PICK_OUTPUT_PATH, async (_event, projectName = 'rough-cut-export') => {
  const result = await dialog.showSaveDialog({
    title: 'Export MP4',
    defaultPath: `${projectName}.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});
ipcMain.handle(IPC_CHANNELS.EXPORT_START, async (event, { document, outputPath }) => {
  return exportProjectToMp4({
    project: document,
    outputPath,
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
  return {
    ...project,
    recording,
    mediaUrl: recording ? pathToFileURL(recording.filePath).toString() : null,
  };
}
