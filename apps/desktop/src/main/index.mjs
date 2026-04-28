import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 860,
    minHeight: 560,
    title: 'Rough Cut MVP',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
