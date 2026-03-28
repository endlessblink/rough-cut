/**
 * RecordingSessionManager
 *
 * Orchestrates the full recording session flow in the Electron main process:
 *   idle → countdown → recording → stopping → idle
 *
 * The floating toolbar is now owned by the renderer via window.open() +
 * React Portal — this module no longer creates or manages any BrowserWindow
 * beyond the main app window.
 *
 * Responsibilities:
 *  - IPC registration for session start/stop
 *  - 3-second countdown with per-tick notifications to renderer
 *  - Elapsed-time heartbeat to main window (React Portal reads it via preload)
 *  - Global shortcut (Ctrl+Shift+Esc / Cmd+Shift+Esc) to stop recording
 *  - System tray icon with "Stop Recording" menu item
 *  - Clean teardown on app quit
 *
 * Usage (in main/index.mjs):
 *   import { initSessionManager } from './recording/recording-session-manager.mjs';
 *   // After createWindow():
 *   initSessionManager(mainWindow);
 */

import { ipcMain, globalShortcut, Tray, Menu, nativeImage, app } from 'electron';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../../shared/ipc-channels.mjs';

const __filename = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {'idle' | 'countdown' | 'recording' | 'stopping'} */
let state = 'idle';

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;

/** @type {Tray | null} */
let tray = null;

/** @type {ReturnType<typeof setInterval> | null} */
let elapsedTimer = null;

/** Millisecond timestamp when recording phase started. */
let recordingStartMs = 0;

// ---------------------------------------------------------------------------
// Tiny inline red-circle icon for the tray (8×8 px, base64 PNG)
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
 * @param {import('electron').BrowserWindow | null} win
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
 *  4. Start elapsed timer → mainWindow.webContents
 *  5. Register global shortcut + create tray
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

    // Elapsed heartbeat → mainWindow (React Portal reads it via the preload bridge
    // since the portal is rendered in the same renderer process)
    elapsedTimer = setInterval(() => {
      const elapsedMs = Date.now() - recordingStartMs;
      safeSend(mainWindow, IPC_CHANNELS.RECORDING_SESSION_ELAPSED, elapsedMs);
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
 *  4. Tear down elapsed timer, shortcut, tray
 *  5. Transition back to 'idle'
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

  state = 'idle';
}

/**
 * Tear down all transient session resources (timer, shortcut, tray).
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
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the session manager.
 * Must be called once after the main BrowserWindow is created.
 *
 * @param {import('electron').BrowserWindow} win  The application's main window.
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
