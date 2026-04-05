import { app, BrowserWindow, ipcMain, dialog, protocol, net, session, desktopCapturer, screen } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { homedir } from 'node:os';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { getSources, saveRecording } from './recording/capture-service.mjs';
import { initSessionManager } from './recording/recording-session-manager.mjs';
import { getRecentProjects, addRecentProject, removeRecentProject, clearRecentProjects, getRecordingLocation, setRecordingLocation, getFavoriteLocations, addFavoriteLocation, removeFavoriteLocation } from './recent-projects-service.mjs';
import { registerAIHandlers } from './ai/ai-service.mjs';

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

  // Exclude main window from screen capture — Rough Cut's own UI should never
  // appear in recordings.  On macOS this sets NSWindow.sharingType = none;
  // on Linux it is a harmless no-op.
  mainWindow.setContentProtection(true);

  // In dev, load from Vite dev server
  if (!app.isPackaged) {
    mainWindow.maximize();
    mainWindow.loadURL('http://127.0.0.1:7544');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  }
}

// Register IPC handlers
function registerIpcHandlers() {
  // Project: Open -- native file dialog, read JSON, return parsed document + filePath
  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const filePath = result.filePaths[0];
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    // Return the raw data -- the renderer will validate via the project-model package
    const firstThumb = Array.isArray(data.assets) ? data.assets.find((a) => a.thumbnailPath) : null;
    addRecentProject({
      filePath,
      name: data.name ?? filePath.split('/').pop().replace(/\.roughcut$/, ''),
      modifiedAt: new Date().toISOString(),
      resolution: data.settings?.resolution
        ? `${data.settings.resolution.width}x${data.settings.resolution.height}`
        : undefined,
      assetCount: Array.isArray(data.assets) ? data.assets.length : undefined,
      thumbnailPath: firstThumb?.thumbnailPath,
    });
    return { project: data, filePath };
  });

  // Project: Save
  ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, async (_e, { project, filePath }) => {
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
    const firstThumb = Array.isArray(project.assets) ? project.assets.find((a) => a.thumbnailPath) : null;
    addRecentProject({
      filePath,
      name: project.name ?? filePath.split('/').pop().replace(/\.roughcut$/, ''),
      modifiedAt: new Date().toISOString(),
      resolution: project.settings?.resolution
        ? `${project.settings.resolution.width}x${project.settings.resolution.height}`
        : undefined,
      assetCount: Array.isArray(project.assets) ? project.assets.length : undefined,
      thumbnailPath: firstThumb?.thumbnailPath,
    });
    return true;
  });

  // Project: Save As
  ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE_AS, async (_e, { project }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, JSON.stringify(project, null, 2), 'utf-8');
    const firstThumb = Array.isArray(project.assets) ? project.assets.find((a) => a.thumbnailPath) : null;
    addRecentProject({
      filePath: result.filePath,
      name: project.name ?? result.filePath.split('/').pop().replace(/\.roughcut$/, ''),
      modifiedAt: new Date().toISOString(),
      resolution: project.settings?.resolution
        ? `${project.settings.resolution.width}x${project.settings.resolution.height}`
        : undefined,
      assetCount: Array.isArray(project.assets) ? project.assets.length : undefined,
      thumbnailPath: firstThumb?.thumbnailPath,
    });
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

  // Recent Projects: Get (stale entries pruned automatically)
  ipcMain.handle(IPC_CHANNELS.RECENT_PROJECTS_GET, async () => {
    return getRecentProjects();
  });

  // Recent Projects: Remove by file path
  ipcMain.handle(IPC_CHANNELS.RECENT_PROJECTS_REMOVE, async (_e, { filePath }) => {
    removeRecentProject(filePath);
  });

  // Recent Projects: Clear all
  ipcMain.handle(IPC_CHANNELS.RECENT_PROJECTS_CLEAR, async () => {
    clearRecentProjects();
  });

  // Project: Open by known file path (no dialog)
  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, async (_e, { filePath }) => {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  });

  // App: Version
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());

  // File system: read a text file (used for cursor event sidecar loading)
  ipcMain.handle(IPC_CHANNELS.READ_TEXT_FILE, async (_e, filePath) => {
    if (!filePath || !existsSync(filePath)) return null;
    return readFile(filePath, 'utf-8');
  });

  // Project: Auto-save — saves silently after recording completes.
  // If filePath is provided, overwrites that file; otherwise resolves a path in ~/Documents/Rough Cut/.
  ipcMain.handle(IPC_CHANNELS.PROJECT_AUTO_SAVE, async (_e, { project, filePath }) => {
    try {
      if (!filePath) {
        const safeName = (project.name || 'Untitled Project').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Untitled Project';
        // Use configured recording location, fall back to ~/Documents/Rough Cut
        const configuredLocation = getRecordingLocation();
        // Validate configured location exists and is usable
        let defaultDir;
        if (configuredLocation && existsSync(configuredLocation)) {
          defaultDir = configuredLocation;
        } else {
          // Fall back to ~/Documents/Rough Cut
          defaultDir = join(homedir(), 'Documents', 'Rough Cut');
        }
        if (!existsSync(defaultDir)) {
          mkdirSync(defaultDir, { recursive: true });
        }
        filePath = join(defaultDir, `${safeName}.roughcut`);

        if (existsSync(filePath)) {
          // Check if the file belongs to the same project (by id); if so, overwrite is correct.
          try {
            const existing = JSON.parse(await readFile(filePath, 'utf-8'));
            if (existing.id !== project.id) {
              let i = 2;
              while (existsSync(join(defaultDir, `${safeName} ${i}.roughcut`))) {
                i++;
              }
              filePath = join(defaultDir, `${safeName} ${i}.roughcut`);
            }
          } catch {
            // Unreadable file — use a numbered suffix to avoid collision.
            let i = 2;
            while (existsSync(join(defaultDir, `${safeName} ${i}.roughcut`))) {
              i++;
            }
            filePath = join(defaultDir, `${safeName} ${i}.roughcut`);
          }
        }
      }

      await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');

      const firstThumb = Array.isArray(project.assets) ? project.assets.find((a) => a.thumbnailPath) : null;
      addRecentProject({
        filePath,
        name: project.name ?? filePath.split('/').pop().replace(/\.roughcut$/, ''),
        modifiedAt: new Date().toISOString(),
        resolution: project.settings?.resolution
          ? `${project.settings.resolution.width}x${project.settings.resolution.height}`
          : undefined,
        assetCount: Array.isArray(project.assets) ? project.assets.length : undefined,
        thumbnailPath: firstThumb?.thumbnailPath,
      });

      return filePath;
    } catch (err) {
      console.error('[auto-save] Failed:', err);
      throw err;  // Re-throw so the renderer .catch() fires
    }
  });

  // Storage: Get recording location
  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_RECORDING_LOCATION, () => {
    return getRecordingLocation();
  });

  // Storage: Set recording location
  ipcMain.handle(IPC_CHANNELS.STORAGE_SET_RECORDING_LOCATION, (_e, { path }) => {
    setRecordingLocation(path);
  });

  // Storage: Pick directory via native dialog
  ipcMain.handle(IPC_CHANNELS.STORAGE_PICK_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  // Storage: Get mounted volumes (Linux — reads /proc/mounts)
  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_MOUNTED_VOLUMES, async () => {
    try {
      const content = await readFile('/proc/mounts', 'utf-8');
      const volumes = [];

      // Filesystem types that represent real disk partitions
      const REAL_FS_TYPES = new Set([
        'ext4', 'ext3', 'ext2', 'btrfs', 'xfs', 'ntfs', 'ntfs3',
        'vfat', 'fat32', 'exfat', 'fuseblk', 'nfs', 'nfs4', 'cifs', 'f2fs',
      ]);

      for (const line of content.split('\n')) {
        const parts = line.split(' ');
        if (parts.length < 3) continue;

        const mountPoint = parts[1];
        const fsType = parts[2];

        // Only include real filesystem types
        if (!REAL_FS_TYPES.has(fsType)) continue;

        // Exclude Docker-related paths
        if (mountPoint.includes('/docker/') || mountPoint.includes('overlay2')) continue;

        // Exclude paths with long hex segments (40+ hex chars = Docker/snap hashes)
        if (/\/[0-9a-f]{32,}/.test(mountPoint)) continue;

        // Only include user-relevant mount points
        if (
          mountPoint === '/' ||
          mountPoint.startsWith('/media/') ||
          mountPoint.startsWith('/mnt/') ||
          mountPoint === '/home'
        ) {
          const name = mountPoint === '/'
            ? 'System'
            : mountPoint === '/home'
              ? 'Home'
              : mountPoint.split('/').pop();

          volumes.push({ path: mountPoint, name });
        }
      }

      // Deduplicate by path
      const seen = new Set();
      return volumes.filter(v => {
        if (seen.has(v.path)) return false;
        seen.add(v.path);
        return true;
      });
    } catch {
      // Fallback for non-Linux
      return [{ path: '/', name: 'System' }];
    }
  });

  // Storage: Favorites CRUD
  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_FAVORITES, () => {
    return getFavoriteLocations();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_ADD_FAVORITE, (_e, { path }) => {
    addFavoriteLocation(path);
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_REMOVE_FAVORITE, (_e, { path }) => {
    removeFavoriteLocation(path);
  });

  registerAIHandlers(mainWindow);
}

// macOS audio loopback support (ScreenCaptureKit)
app.commandLine.appendSwitch(
  'enable-features',
  'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride'
);

// Register media:// as a privileged scheme (must happen before app.whenReady)
// stream: true enables range requests for video seeking
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true } },
]);

// Enable hardware video decode on Linux (must be before app.ready)
// NOTE: WebRtcPipeWireCamera REMOVED — PipeWire ignores getUserMedia resolution
// constraints, always delivers native camera resolution (1080p) which caps at
// 5fps YUYV over USB. Without PipeWire, V4L2 direct access honors constraints
// and can deliver 640x480 YUYV at 30fps.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch(
    'enable-features',
    'AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL',
  );
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
} else {
  app.commandLine.appendSwitch('enable-features', 'WebRtcPipeWireCamera');
}

app.whenReady().then(() => {
  // Permission CHECK handler (synchronous pre-flight — getUserMedia needs this)
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, details) => {
    if (permission === 'media') return true;
    return false;
  });

  // Permission REQUEST handler (async — approves the actual request)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Handle media:// URLs by serving local files with range request support.
  // Uses createReadStream to support HTTP 206 Partial Content for video seeking.
  protocol.handle('media', (req) => {
    const filePath = decodeURIComponent(req.url.replace('media://', ''));

    if (!existsSync(filePath)) {
      return new Response('Not Found', { status: 404 });
    }

    const stat = statSync(filePath);
    const total = stat.size;
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeTypes = { webm: 'video/webm', mp4: 'video/mp4', mkv: 'video/x-matroska', jpg: 'image/jpeg', png: 'image/png' };
    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    const rangeHeader = req.headers.get('range');

    if (rangeHeader) {
      // Parse Range: bytes=START-END
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : total - 1;
        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });
        return new Response(stream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
          },
        });
      }
    }

    // No range request — serve the full file
    const stream = createReadStream(filePath);
    return new Response(stream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Content-Type': contentType,
      },
    });
  });

  // Store selected source ID — updated via IPC from panel window
  let selectedSourceId = null;

  ipcMain.on(IPC_CHANNELS.PANEL_SET_SOURCE, (_e, { sourceId }) => {
    selectedSourceId = sourceId;
  });

  // Intercept getDisplayMedia() from any renderer (panel window uses this)
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = selectedSourceId
        ? sources.find(s => s.id === selectedSourceId) ?? sources[0]
        : sources[0];
      if (!source) { callback(undefined); return; }
      callback({ video: source, audio: 'loopback' });
    } catch (err) {
      console.error('[display-media-handler] Error:', err);
      callback(undefined); // MUST call or getDisplayMedia hangs forever
    }
  });

  registerIpcHandlers();
  createWindow();

  // Pass source info getter so the session manager can use FFmpeg x11grab
  initSessionManager(mainWindow, () => {
    if (!selectedSourceId) return null;
    // Parse Electron source ID (e.g. 'screen:0:0') for x11grab display string
    const isScreen = selectedSourceId.startsWith('screen:');
    if (!isScreen) return null; // window capture — FFmpeg x11grab can't target a specific window

    // Get the display bounds for the selected screen
    const displays = screen.getAllDisplays();
    const screenIndex = parseInt(selectedSourceId.split(':')[1] ?? '0', 10);
    const display = displays[screenIndex] ?? displays[0];
    if (!display) return null;

    return {
      sourceId: selectedSourceId,
      display: `${process.env.DISPLAY || ':0'}.0+${display.bounds.x},${display.bounds.y}`,
      width: display.bounds.width,
      height: display.bounds.height,
    };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
