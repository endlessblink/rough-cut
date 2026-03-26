/**
 * Spike 2: Per-Platform Recording Test App
 *
 * Minimal Electron app to test desktopCapturer, webcam, mic,
 * system audio, and MediaRecorder on each platform.
 *
 * Usage:
 *   npm start                    — interactive mode (UI with buttons)
 *   npm run test:sources         — list available sources and exit
 *   npm run test:screen-30       — record screen at 30fps for 5s and exit
 *   npm run test:record-30s      — full 30-second recording test
 */
import { app, BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, 'index.html'));

  // Handle source enumeration
  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      displayId: s.display_id,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  });

  // Handle file saving
  ipcMain.handle('save-recording', async (_event, { buffer, filename }) => {
    const samplesDir = join(__dirname, '..', 'samples');
    if (!existsSync(samplesDir)) mkdirSync(samplesDir, { recursive: true });
    const filePath = join(samplesDir, filename);
    writeFileSync(filePath, Buffer.from(buffer));
    return filePath;
  });
});

app.on('window-all-closed', () => app.quit());
