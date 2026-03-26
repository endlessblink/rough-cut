import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { getSources, saveRecording } from './recording/capture-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Rough Cut',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to access electron modules
    },
  });

  // In dev, load from Vite dev server
  if (!app.isPackaged) {
    mainWindow.loadURL('http://127.0.0.1:7544');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  }
}

// Register IPC handlers
function registerIpcHandlers() {
  // Project: Open -- native file dialog, read JSON, return parsed document
  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const content = await readFile(result.filePaths[0], 'utf-8');
    const data = JSON.parse(content);
    // Return the raw data -- the renderer will validate via the project-model package
    return data;
  });

  // Project: Save
  ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, async (_e, { project, filePath }) => {
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
    return true;
  });

  // Project: Save As
  ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE_AS, async (_e, { project }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, JSON.stringify(project, null, 2), 'utf-8');
    return result.filePath;
  });

  // Project: New -- return a minimal project skeleton
  // The full createProject() lives in the renderer (workspace package via Vite).
  // Main process just signals "create new" -- renderer handles the model.
  ipcMain.handle(IPC_CHANNELS.PROJECT_NEW, () => {
    return null; // Signal to renderer to create a new project locally
  });

  // Export: Start
  // In a full build, this would call runExport from @rough-cut/export-renderer.
  // For now, the main process just acknowledges the request.
  // The workspace package import works when packages are built, but during dev
  // we keep this as a stub to avoid CJS/ESM issues with workspace packages.
  ipcMain.handle(IPC_CHANNELS.EXPORT_START, async (_e, { project, settings, outputPath }) => {
    try {
      // Dynamic import of the workspace package
      const { runExport } = await import('@rough-cut/export-renderer');
      await runExport(project, settings, outputPath, {
        onProgress: (progress) => {
          mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_PROGRESS, progress);
        },
        onComplete: (result) => {
          mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_COMPLETE, result);
        },
        onError: (error) => {
          mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_COMPLETE, {
            status: 'failed',
            error: error.message,
            totalFrames: 0,
            durationMs: 0,
          });
        },
      });
    } catch (err) {
      mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_COMPLETE, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        totalFrames: 0,
        durationMs: 0,
      });
    }
  });

  // Export: Cancel (stub for now)
  ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, () => {
    // TODO: implement cancellation via AbortController
  });

  // Recording: Get available capture sources (screens + windows)
  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SOURCES, async () => {
    return getSources();
  });

  // Recording: Save finished recording blob to disk and probe metadata
  ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, async (_e, { buffer, metadata }) => {
    const result = await saveRecording(buffer, metadata.projectDir, metadata);
    return result;
  });

  // App: Version
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
