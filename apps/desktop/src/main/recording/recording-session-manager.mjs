/**
 * RecordingSessionManager
 *
 * Orchestrates the full recording session flow in the Electron main process:
 *   idle → countdown → recording → stopping → idle
 *
 * Responsibilities:
 *  - IPC registration for session start/stop
 *  - 3-second countdown with per-tick notifications to renderer
 *  - Floating toolbar window creation and readiness handshake
 *  - Hiding/restoring the main window around the session
 *  - Elapsed-time heartbeat to the toolbar
 *  - Global shortcut (Ctrl+Shift+Esc / Cmd+Shift+Esc) to stop recording
 *  - System tray icon with "Stop Recording" menu item
 *  - Clean teardown on app quit
 *
 * Usage (in main/index.mjs):
 *   import { initSessionManager } from './recording/recording-session-manager.mjs';
 *   // After createWindow():
 *   initSessionManager(mainWindow);
 */

import {
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  Tray,
  Menu,
  nativeImage,
  app,
} from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../../shared/ipc-channels.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {'idle' | 'countdown' | 'recording' | 'stopping'} */
let state = 'idle';

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {BrowserWindow | null} */
let toolbarWindow = null;

/** @type {Tray | null} */
let tray = null;

/** @type {ReturnType<typeof setInterval> | null} */
let elapsedTimer = null;

/** Millisecond timestamp when recording phase started. */
let recordingStartMs = 0;

// ---------------------------------------------------------------------------
// Tiny inline red-circle icon for the tray (8×8 px, base64 PNG)
// Generated via: canvas 8x8 filled red circle
// ---------------------------------------------------------------------------
const RED_CIRCLE_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAAXNSR0IArs4c6QAAAB' +
  'xJREFUKFNjYBgFgx8wMjD8Z2BgYGBkYGD4DwAIAAH/AJ9VQAAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safe webContents.send — no-ops if the window has been destroyed.
 * @param {BrowserWindow | null} win
 * @param {string} channel
 * @param {...unknown} args
 */
function safeSend(win, channel, ...args) {
  try {
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch (err) {
    console.warn(`[session-manager] safeSend(${channel}) failed:`, err?.message ?? err);
  }
}

/**
 * Format elapsed milliseconds as "MM:SS".
 * @param {number} ms
 * @returns {string}
 */
function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Compute bottom-center position for the toolbar on the display that contains mainWindow.
 * @returns {{ x: number, y: number }}
 */
function getToolbarPosition() {
  const TOOLBAR_WIDTH = 300;
  const TOOLBAR_HEIGHT = 48;
  const BOTTOM_OFFSET = 80;

  const bounds = mainWindow?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
  const display = screen.getDisplayMatching(bounds);
  const { x: wa_x, y: wa_y, width: wa_w, height: wa_h } = display.workArea;

  const x = Math.round(wa_x + (wa_w - TOOLBAR_WIDTH) / 2);
  const y = Math.round(wa_y + wa_h - TOOLBAR_HEIGHT - BOTTOM_OFFSET);
  return { x, y };
}

// ---------------------------------------------------------------------------
// Toolbar window
// ---------------------------------------------------------------------------

/**
 * Create the floating recording toolbar window and return it.
 * The caller is responsible for waiting on RECORDING_SESSION_TOOLBAR_READY.
 * @returns {BrowserWindow}
 */
function createToolbarWindow() {
  const { x, y } = getToolbarPosition();

  const win = new BrowserWindow({
    width: 300,
    height: 48,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Best-effort content protection — known broken on macOS 14+
  try {
    win.setContentProtection(true);
  } catch (err) {
    console.warn('[session-manager] setContentProtection failed (non-fatal):', err?.message ?? err);
  }

  if (!app.isPackaged) {
    win.loadURL('http://127.0.0.1:7544/toolbar.html');
  } else {
    win.loadFile(join(__dirname, '../../dist/renderer/toolbar.html'));
  }

  return win;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

/**
 * Create the system tray icon.
 * @returns {Tray}
 */
function createTray() {
  const icon = nativeImage.createFromDataURL(RED_CIRCLE_DATA_URL);
  const t = new Tray(icon);
  t.setToolTip('Recording — 00:00');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Stop Recording',
      click: () => {
        stopSession().catch((err) =>
          console.error('[session-manager] stopSession from tray failed:', err),
        );
      },
    },
  ]);
  t.setContextMenu(contextMenu);
  return t;
}

/**
 * Update the tray tooltip with current elapsed time (called every 100 ms).
 */
function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return;
  try {
    const elapsed = formatElapsed(Date.now() - recordingStartMs);
    tray.setToolTip(`Recording — ${elapsed}`);
  } catch {
    // Tray may have been destroyed concurrently — ignore
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Run the 3-second countdown, sending a tick per second to the renderer.
 * Resolves once the final tick has been sent.
 * @returns {Promise<void>}
 */
function runCountdown() {
  return new Promise((resolve) => {
    let secondsLeft = 3;
    safeSend(mainWindow, IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, secondsLeft);

    const interval = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        resolve();
      } else {
        safeSend(mainWindow, IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, secondsLeft);
      }
    }, 1000);
  });
}

/**
 * Begin a recording session.
 *
 * Flow:
 *  1. Guard: only when idle
 *  2. Run countdown (state = 'countdown')
 *  3. Transition to 'recording'
 *  4. Create toolbar window, wait for TOOLBAR_READY signal
 *  5. Hide main window
 *  6. Start elapsed timer + global shortcut + tray
 */
async function startSession() {
  if (state !== 'idle') {
    console.warn(`[session-manager] startSession() ignored — current state: ${state}`);
    return;
  }

  try {
    // --- Countdown ---
    state = 'countdown';

    await runCountdown();

    if (state !== 'countdown') {
      // Session was aborted externally during countdown
      console.warn('[session-manager] Session aborted during countdown — bailing out.');
      return;
    }

    // --- Recording phase ---
    state = 'recording';
    recordingStartMs = Date.now();

    safeSend(mainWindow, IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'recording');

    // Create toolbar and wait for it to signal readiness
    toolbarWindow = createToolbarWindow();

    await new Promise((resolve) => {
      ipcMain.once(IPC_CHANNELS.RECORDING_SESSION_TOOLBAR_READY, () => {
        resolve();
      });

      // Failsafe: if toolbar never reports ready within 5 s, proceed anyway
      setTimeout(() => {
        console.warn('[session-manager] Toolbar readiness timeout — proceeding without it.');
        resolve();
      }, 5000);
    });

    // Hide main window behind the toolbar
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    // Elapsed heartbeat → toolbar
    elapsedTimer = setInterval(() => {
      const elapsedMs = Date.now() - recordingStartMs;
      safeSend(toolbarWindow, IPC_CHANNELS.RECORDING_SESSION_ELAPSED, elapsedMs);
      updateTrayTooltip();
    }, 100);

    // Global shortcut to stop recording
    try {
      globalShortcut.register('CommandOrControl+Shift+Escape', () => {
        stopSession().catch((err) =>
          console.error('[session-manager] stopSession from shortcut failed:', err),
        );
      });
    } catch (err) {
      console.warn('[session-manager] Failed to register global shortcut:', err?.message ?? err);
    }

    // Tray icon
    tray = createTray();
  } catch (err) {
    console.error('[session-manager] startSession() threw unexpectedly:', err);
    // Attempt best-effort cleanup so app doesn't get stuck
    _cleanup();
  }
}

/**
 * Stop the active recording session.
 *
 * Flow:
 *  1. Guard: only when recording
 *  2. Transition to 'stopping'
 *  3. Signal renderer (triggers MediaRecorder.stop())
 *  4. Tear down elapsed timer, shortcut, tray, toolbar
 *  5. Restore main window
 *  6. Transition back to 'idle'
 */
async function stopSession() {
  if (state !== 'recording') {
    console.warn(`[session-manager] stopSession() ignored — current state: ${state}`);
    return;
  }

  state = 'stopping';

  // Tell renderer to stop MediaRecorder — it will handle the data and save
  safeSend(mainWindow, IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'stopping');

  _cleanup();

  // Restore main window
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (err) {
    console.error('[session-manager] Failed to restore main window:', err?.message ?? err);
  }

  state = 'idle';
}

/**
 * Tear down all transient session resources (timer, shortcut, tray, toolbar).
 * Safe to call from any state — all steps are individually guarded.
 */
function _cleanup() {
  // Clear elapsed timer
  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  // Unregister global shortcut
  try {
    globalShortcut.unregister('CommandOrControl+Shift+Escape');
  } catch (err) {
    console.warn('[session-manager] globalShortcut.unregister failed:', err?.message ?? err);
  }

  // Destroy tray
  if (tray) {
    try {
      if (!tray.isDestroyed()) tray.destroy();
    } catch (err) {
      console.warn('[session-manager] tray.destroy() failed:', err?.message ?? err);
    }
    tray = null;
  }

  // Destroy toolbar window
  if (toolbarWindow) {
    try {
      if (!toolbarWindow.isDestroyed()) toolbarWindow.destroy();
    } catch (err) {
      console.warn('[session-manager] toolbarWindow.destroy() failed:', err?.message ?? err);
    }
    toolbarWindow = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the session manager.
 * Must be called once after the main BrowserWindow is created.
 *
 * @param {BrowserWindow} win  The application's main window.
 */
export function initSessionManager(win) {
  mainWindow = win;

  // IPC: renderer → main: start a new session
  ipcMain.handle(IPC_CHANNELS.RECORDING_SESSION_START, async () => {
    await startSession();
  });

  // IPC: renderer → main: stop the active session
  ipcMain.handle(IPC_CHANNELS.RECORDING_SESSION_STOP, async () => {
    await stopSession();
  });

  // Safety net: if the app is quitting while a session is active, clean up
  app.on('before-quit', () => {
    if (state === 'recording') {
      console.info('[session-manager] App quitting mid-recording — stopping session.');
      stopSession().catch((err) =>
        console.error('[session-manager] stopSession on quit failed:', err),
      );
    } else if (state === 'countdown') {
      // Abort countdown gracefully
      state = 'idle';
      _cleanup();
    }
  });
}

// Expose internals for testing / integration use
export { startSession, stopSession };
