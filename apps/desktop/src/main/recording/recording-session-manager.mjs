/**
 * RecordingSessionManager
 *
 * Orchestrates the full recording session flow in the Electron main process
 * using a self-contained panel BrowserWindow.
 *
 * State machine: idle → panel-open → countdown → recording → stopping → idle
 *
 * Responsibilities:
 *  - Create / destroy the panel BrowserWindow
 *  - Run a 3-second countdown, sending ticks to panelWindow
 *  - Run an elapsed-time heartbeat (100 ms) to panelWindow
 *  - Global shortcut (CmdOrCtrl+Shift+Escape) to stop recording
 *  - System tray icon with "Stop Recording" menu item
 *  - Route recording results from the panel back to mainWindow
 *  - Handle panel closed externally
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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../../shared/ipc-channels.mjs';
import { saveRecording, saveRecordingFromFile } from './capture-service.mjs';
import { CursorRecorder } from './cursor-recorder.mjs';
import { isFfmpegCaptureAvailable, startFfmpegCapture } from './ffmpeg-capture.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IS_LINUX = process.platform === 'linux';
const PANEL_SETUP = { width: 500, height: 460 };
const PANEL_MINI  = { width: 340, height: 56 };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * @typedef {'idle' | 'panel-open' | 'countdown' | 'recording' | 'stopping'} SessionState
 */

/** @type {SessionState} */
let state = 'idle';

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;

/** @type {import('electron').BrowserWindow | null} */
let panelWindow = null;

/** @type {Tray | null} */
let tray = null;

/** @type {ReturnType<typeof setInterval> | null} */
let elapsedTimer = null;

/** @type {ReturnType<typeof setInterval> | null} */
let countdownTimer = null;

/** Whether the recording is currently paused. */
let isPaused = false;

/** Accumulated paused time in ms (subtracted from elapsed). */
let totalPausedMs = 0;

/** Timestamp when current pause started. */
let pauseStartMs = 0;

/** Millisecond timestamp when recording phase started. */
let recordingStartMs = 0;

/** @type {CursorRecorder} */
const cursorRecorder = new CursorRecorder();

/** @type {{ eventsPath: string, eventCount: number } | null} */
let lastCursorResult = null;

/** @type {import('./ffmpeg-capture.mjs').FfmpegCaptureHandle | null} */
let ffmpegHandle = null;

/** @type {(() => { sourceId: string, display: string, width: number, height: number } | null) | null} */
let getSourceInfo = null;

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

/**
 * Guard a state transition — logs and returns false if the current state is
 * not in the set of allowed states.
 * @param {string} fnName
 * @param {SessionState[]} allowed
 * @returns {boolean}
 */
function guardState(fnName, allowed) {
  if (!allowed.includes(state)) {
    console.warn(`[session-manager] ${fnName}() ignored — current state: ${state}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

/**
 * Create the system tray icon with Pause/Resume and Stop Recording menu items.
 * On Linux the tray is the PRIMARY recording control (no visible mini-controller).
 * @returns {Tray}
 */
function createTray() {
  const icon = nativeImage.createFromDataURL(RED_CIRCLE_DATA_URL);
  const t = new Tray(icon);
  t.setToolTip('Recording — 00:00');
  _rebuildTrayMenu(t);
  return t;
}

/**
 * Rebuild the tray context menu to reflect the current pause state.
 * @param {Tray} t
 */
function _rebuildTrayMenu(t) {
  if (!t || t.isDestroyed()) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isPaused ? 'Resume Recording' : 'Pause Recording',
      click: () => {
        _togglePauseFromTray();
      },
    },
    { type: 'separator' },
    {
      label: 'Stop Recording',
      click: () => {
        stopRecording().catch((err) =>
          console.error('[session-manager] stopRecording from tray failed:', err),
        );
      },
    },
  ]);
  t.setContextMenu(contextMenu);
}

/**
 * Toggle pause/resume from the tray — mirrors the panel's pause/resume IPC
 * so recording can be controlled entirely from the tray on Linux.
 */
function _togglePauseFromTray() {
  if (state !== 'recording') return;
  if (!isPaused) {
    isPaused = true;
    pauseStartMs = Date.now();
    safeSend(panelWindow, 'panel:tray-pause', null);
    console.info('[session-manager] Paused from tray');
  } else {
    totalPausedMs += Date.now() - pauseStartMs;
    isPaused = false;
    safeSend(panelWindow, 'panel:tray-resume', null);
    console.info('[session-manager] Resumed from tray, total paused:', totalPausedMs, 'ms');
  }
  if (tray) _rebuildTrayMenu(tray);
}

/**
 * Update the tray tooltip with the current elapsed time (called every 100 ms).
 */
function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return;
  try {
    const elapsedMs = Date.now() - recordingStartMs - totalPausedMs;
    const elapsed = formatElapsed(elapsedMs);
    const label = isPaused ? 'Paused' : 'Recording';
    tray.setToolTip(`${label} — ${elapsed}`);
  } catch {
    // Tray may have been destroyed concurrently — ignore
  }
}

// ---------------------------------------------------------------------------
// Panel window
// ---------------------------------------------------------------------------

/**
 * Compute the bottom-center position for the panel on the same display as
 * mainWindow, with a small margin from the bottom edge.
 * @param {{width: number, height: number}} panelSize
 * @returns {{x: number, y: number}}
 */
function getPanelPosition(panelSize) {
  try {
    const bounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
    const display = bounds
      ? screen.getDisplayMatching(bounds)
      : screen.getPrimaryDisplay();
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
    const x = Math.round(dx + (dw - panelSize.width) / 2);
    const y = Math.round(dy + dh - panelSize.height - 32); // 32 px margin from bottom
    return { x, y };
  } catch (err) {
    console.warn('[session-manager] getPanelPosition failed, using defaults:', err?.message ?? err);
    return { x: 100, y: 100 };
  }
}

/**
 * Compute the top-center position for the mini controller on the primary display.
 * @param {{width: number, height: number}} panelSize
 * @returns {{x: number, y: number}}
 */
function getMiniPosition(panelSize) {
  try {
    const display = screen.getPrimaryDisplay();
    const { x: dx, y: dy, width: dw } = display.workArea;
    const x = Math.round(dx + (dw - panelSize.width) / 2);
    const y = dy + 16;
    return { x, y };
  } catch (err) {
    console.warn('[session-manager] getMiniPosition failed:', err?.message ?? err);
    return { x: 100, y: 16 };
  }
}

/**
 * Resize the panel window to either 'mini' or 'setup' mode.
 * @param {'mini' | 'setup'} mode
 */
function resizePanel(mode) {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const size = mode === 'mini' ? PANEL_MINI : PANEL_SETUP;
  const pos = mode === 'mini'
    ? getMiniPosition(size)
    : getPanelPosition(size);
  panelWindow.setBounds({ ...pos, ...size });
  console.info(`[session-manager] Panel resized to ${mode} mode`);
}

// ---------------------------------------------------------------------------
// Public API — Panel lifecycle
// ---------------------------------------------------------------------------

/**
 * Create the panel BrowserWindow and transition to `panel-open`.
 * No-ops if a panel is already open.
 */
export function openPanel() {
  console.info('[session-manager] openPanel() called, state:', state);
  if (!guardState('openPanel', ['idle'])) return;

  const PANEL_W = 500;
  const PANEL_H = 460;
  const { x, y } = getPanelPosition({ width: PANEL_W, height: PANEL_H });

  const preloadPath = join(__dirname, '..', '..', 'preload', 'index.mjs');
  console.info('[session-manager] Creating panel window, preload:', preloadPath);

  panelWindow = new BrowserWindow({
    x,
    y,
    width: PANEL_W,
    height: PANEL_H,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    roundedCorners: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  // Exclude panel from screen capture so it never appears in recordings.
  panelWindow.setContentProtection(true);

  // Load panel renderer
  const panelUrl = !app.isPackaged
    ? 'http://127.0.0.1:7544/panel.html'
    : join(__dirname, '../../../dist/renderer/panel.html');

  console.info('[session-manager] Loading panel from:', panelUrl);

  if (!app.isPackaged) {
    panelWindow.loadURL(panelUrl);
  } else {
    panelWindow.loadFile(panelUrl);
  }

  // Pipe panel renderer console logs to main process terminal
  panelWindow.webContents.on('console-message', (_e, level, message) => {
    const prefix = ['[panel:LOG]', '[panel:WARN]', '[panel:ERR]'][level] ?? '[panel]';
    console.info(prefix, message);
  });

  panelWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[session-manager] Panel failed to load:', code, desc);
  });

  panelWindow.webContents.on('did-finish-load', () => {
    console.info('[session-manager] Panel finished loading.');
  });

  panelWindow.once('ready-to-show', () => {
    console.info('[session-manager] Panel ready to show.');
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.show();
    }
  });

  // If the panel is closed externally (user clicks X or OS closes it), clean up.
  panelWindow.on('closed', () => {
    console.info('[session-manager] Panel closed externally — cleaning up.');
    panelWindow = null;
    _cleanup();
    // Restore main window in case recording was active when panel was closed.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
    state = 'idle';
  });

  state = 'panel-open';
  console.info('[session-manager] Panel opened.');
}

/**
 * Destroy the panel BrowserWindow and transition to `idle`.
 * No-ops if no panel is open.
 */
export function closePanel() {
  if (!guardState('closePanel', ['panel-open', 'countdown', 'recording', 'stopping'])) return;

  _cleanup();
  _destroyPanel();
  // Restore main window in case recording was active.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
  state = 'idle';
  console.info('[session-manager] Panel closed.');
}

/**
 * Destroy the panel window reference.  Safe to call if already null/destroyed.
 */
function _destroyPanel() {
  if (panelWindow) {
    try {
      if (!panelWindow.isDestroyed()) panelWindow.destroy();
    } catch (err) {
      console.warn('[session-manager] panelWindow.destroy() failed:', err?.message ?? err);
    }
    panelWindow = null;
  }
}

// ---------------------------------------------------------------------------
// Public API — Recording lifecycle
// ---------------------------------------------------------------------------

/**
 * Begin the countdown, then signal the panel renderer to start its own
 * MediaRecorder.
 *
 * Flow:
 *  1. Guard: only when panel-open
 *  2. Run 3-second countdown — send ticks to panelWindow
 *  3. Transition to 'recording'
 *  4. Send `status-changed: 'recording'` to panelWindow
 *  5. Start elapsed timer (100 ms) → panelWindow
 *  6. Register global shortcut + create tray
 */
export async function startRecording() {
  if (!guardState('startRecording', ['panel-open'])) return;

  try {
    state = 'countdown';

    await _runCountdown();

    // Check if state was externally changed during countdown (e.g. panel closed)
    if (state !== 'countdown') {
      console.warn('[session-manager] Session aborted during countdown — bailing out.');
      return;
    }

    // --- Recording phase ---
    state = 'recording';
    recordingStartMs = Date.now();
    console.info('[session-manager] Recording phase started. Platform:', process.platform, 'Content protection:', IS_LINUX ? 'UNAVAILABLE' : 'enabled');

    // Start cursor recording — writes .cursor.ndjson alongside the video
    const recordingsDir = await (async () => {
      try {
        const { getRecordingLocation } = await import('../recent-projects-service.mjs');
        const loc = getRecordingLocation();
        console.info('[session-manager] Recording location:', loc || '(default /tmp)');
        return loc || '/tmp/rough-cut/recordings';
      } catch (e) {
        console.warn('[session-manager] getRecordingLocation failed:', e?.message);
        return '/tmp/rough-cut/recordings';
      }
    })();
    const cursorTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cursorPath = join(recordingsDir, `recording-${cursorTimestamp}.cursor.ndjson`);
    console.info('[session-manager] Cursor sidecar path:', cursorPath);
    try {
      const fps = 30;
      cursorRecorder.start(fps, cursorPath);
    } catch (err) {
      console.warn('[session-manager] CursorRecorder failed to start:', err?.message ?? err);
    }

    // Start FFmpeg x11grab capture (cursor-free) on Linux/X11
    ffmpegHandle = null;
    if (isFfmpegCaptureAvailable() && getSourceInfo) {
      const sourceInfo = getSourceInfo();
      if (sourceInfo) {
        const ffmpegPath = join(recordingsDir, `recording-${cursorTimestamp}.webm`);
        try {
          ffmpegHandle = startFfmpegCapture({
            outputPath: ffmpegPath,
            fps: 30,
            display: sourceInfo.display,
            width: sourceInfo.width,
            height: sourceInfo.height,
          });
          console.info('[session-manager] FFmpeg x11grab started →', ffmpegPath);
        } catch (err) {
          console.warn('[session-manager] FFmpeg capture failed to start:', err?.message ?? err);
          ffmpegHandle = null;
        }
      } else {
        console.info('[session-manager] No source info — skipping FFmpeg capture (window capture?)');
      }
    }

    // Hide main window so it cannot appear in the recording.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
      console.info('[session-manager] Main window hidden.');
    }

    // On macOS/Windows: shrink to mini-controller (content-protected, invisible
    // to capture).  On Linux: setContentProtection is a no-op, so hide the
    // panel entirely and rely on tray + global shortcut + notification.
    if (IS_LINUX) {
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.hide();
        console.info('[session-manager] Panel hidden (Linux — no content protection).');
      }
      // Show a persistent notification so the user knows how to stop
      const { Notification } = await import('electron');
      if (Notification.isSupported()) {
        const n = new Notification({
          title: 'Rough Cut — Recording',
          body: 'Press Ctrl+Shift+Esc to stop. Right-click tray icon to pause.',
          silent: true,
        });
        n.show();
        console.info('[session-manager] Recording notification shown.');
      }
    } else {
      resizePanel('mini');
      console.info('[session-manager] Panel resized to mini-controller.');
    }

    safeSend(panelWindow, IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'recording');
    console.info('[session-manager] Sent recording status to panel.');

    // Reset pause tracking
    isPaused = false;
    totalPausedMs = 0;
    pauseStartMs = 0;

    // Elapsed heartbeat → panelWindow (accounts for paused time)
    elapsedTimer = setInterval(() => {
      if (isPaused) return; // Don't update elapsed while paused
      const currentPausedMs = totalPausedMs;
      const elapsedMs = Date.now() - recordingStartMs - currentPausedMs;
      safeSend(panelWindow, IPC_CHANNELS.RECORDING_SESSION_ELAPSED, elapsedMs);
      updateTrayTooltip();
    }, 100);

    // Global shortcut to stop recording
    try {
      globalShortcut.register('CommandOrControl+Shift+Escape', () => {
        stopRecording().catch((err) =>
          console.error('[session-manager] stopRecording from shortcut failed:', err),
        );
      });
    } catch (err) {
      console.warn('[session-manager] Failed to register global shortcut:', err?.message ?? err);
    }

    // Tray icon
    tray = createTray();

    console.info('[session-manager] Recording started.');
  } catch (err) {
    console.error('[session-manager] startRecording() threw unexpectedly:', err);
    _cleanup();
    state = 'panel-open';
  }
}

/**
 * Signal the panel renderer to stop its MediaRecorder.
 *
 * Flow:
 *  1. Guard: only when recording
 *  2. Transition to 'stopping'
 *  3. Send `status-changed: 'stopping'` to panelWindow
 *     (panel renderer stops MediaRecorder and will call PANEL_SAVE_RECORDING)
 *  4. Tear down elapsed timer, shortcut, tray
 *     (final cleanup to idle happens after PANEL_SAVE_RECORDING resolves)
 */
export async function stopRecording() {
  if (!guardState('stopRecording', ['recording'])) return;

  console.info('[session-manager] stopRecording() — transitioning to stopping.');
  state = 'stopping';

  // On Linux the panel was hidden — show it so the renderer can process
  // MediaRecorder.stop() and assemble the recording blob.
  if (IS_LINUX && panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.showInactive();
    console.info('[session-manager] Panel restored for MediaRecorder teardown.');
  }

  // Tell panel renderer to stop MediaRecorder
  safeSend(panelWindow, IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'stopping');

  // Clear timers / shortcut / tray immediately
  _cleanup();

  // Stop cursor recording
  lastCursorResult = cursorRecorder.stop();
  if (lastCursorResult) {
    console.info('[session-manager] Cursor data:', lastCursorResult.eventCount, 'events →', lastCursorResult.eventsPath);
  }

  // Stop FFmpeg capture (wait for clean flush)
  if (ffmpegHandle) {
    try {
      await ffmpegHandle.stop();
      console.info('[session-manager] FFmpeg capture stopped →', ffmpegHandle.outputPath);
    } catch (err) {
      console.warn('[session-manager] FFmpeg stop failed:', err?.message ?? err);
      ffmpegHandle = null;
    }
  }

  // Restore main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    console.info('[session-manager] Main window restored.');
  }

  console.info('[session-manager] Stop signal sent to panel renderer.');
}

// ---------------------------------------------------------------------------
// Countdown (internal)
// ---------------------------------------------------------------------------

/**
 * Run the 3-second countdown.  Sends a tick per second to panelWindow.
 * Resolves once the final tick has been sent (after the 1-second pause for "1").
 * @returns {Promise<void>}
 */
function _runCountdown() {
  return new Promise((resolve) => {
    let secondsLeft = 3;
    safeSend(panelWindow, IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, secondsLeft);

    countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        resolve();
      } else {
        safeSend(panelWindow, IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, secondsLeft);
      }
    }, 1000);
  });
}

// ---------------------------------------------------------------------------
// Cleanup (internal)
// ---------------------------------------------------------------------------

/**
 * Tear down all transient session resources: countdown timer, elapsed timer,
 * global shortcut, and tray.
 * Safe to call from any state — all steps are individually guarded.
 */
function _cleanup() {
  // Clear countdown timer
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

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
// Public API — init
// ---------------------------------------------------------------------------

/**
 * Initialize the session manager.
 * Must be called once after the main BrowserWindow is created.
 *
 * Registers all IPC handlers for the panel recording flow.
 *
 * @param {import('electron').BrowserWindow} win  The application's main window.
 */
export function initSessionManager(win, sourceInfoGetter) {
  mainWindow = win;
  getSourceInfo = sourceInfoGetter || null;

  // ---- Panel lifecycle ----

  ipcMain.handle(IPC_CHANNELS.PANEL_OPEN, () => {
    openPanel();
  });

  ipcMain.handle(IPC_CHANNELS.PANEL_CLOSE, () => {
    closePanel();
  });

  ipcMain.handle(IPC_CHANNELS.PANEL_RESIZE, (_event, { mode }) => {
    resizePanel(mode);
  });

  // ---- Recording lifecycle ----

  ipcMain.handle(IPC_CHANNELS.PANEL_START_RECORDING, async () => {
    await startRecording();
  });

  ipcMain.handle(IPC_CHANNELS.PANEL_STOP_RECORDING, async () => {
    await stopRecording();
  });

  // Pause/resume elapsed timer when panel pauses/resumes MediaRecorder
  ipcMain.on('panel:pause', () => {
    if (state === 'recording' && !isPaused) {
      isPaused = true;
      pauseStartMs = Date.now();
      console.info('[session-manager] Recording paused');
    }
  });

  ipcMain.on('panel:resume', () => {
    if (state === 'recording' && isPaused) {
      totalPausedMs += Date.now() - pauseStartMs;
      isPaused = false;
      console.info('[session-manager] Recording resumed, total paused:', totalPausedMs, 'ms');
    }
  });

  /**
   * Called by the panel renderer once it has assembled the recording blob.
   * Saves the file via capture-service, then routes the result to mainWindow.
   */
  ipcMain.handle(IPC_CHANNELS.PANEL_SAVE_RECORDING, async (_event, { buffer, metadata, cameraBuffer }) => {
    try {
      // Use the recording location from app settings, or fall back to /tmp
      let projectDir = null;
      try {
        const { getRecordingLocation } = await import('../recent-projects-service.mjs');
        const configuredDir = getRecordingLocation();
        if (configuredDir) projectDir = configuredDir;
      } catch { /* ignore — fall back to /tmp */ }

      console.info('[session-manager] Saving recording to:', projectDir ?? '/tmp/rough-cut/recordings/');
      console.info('[session-manager] Camera buffer received:', cameraBuffer ? `${cameraBuffer.byteLength} bytes` : 'NONE');
      const camBuf = cameraBuffer ? Buffer.from(cameraBuffer) : null;

      // Use FFmpeg x11grab output (cursor-free) if available, otherwise MediaRecorder buffer
      let result;
      if (ffmpegHandle && existsSync(ffmpegHandle.outputPath)) {
        console.info('[session-manager] Using FFmpeg x11grab output (no cursor):', ffmpegHandle.outputPath);
        result = await saveRecordingFromFile(ffmpegHandle.outputPath, projectDir, metadata);
        // Still save camera if present
        if (camBuf) {
          const { saveRecording: saveCam } = await import('./capture-service.mjs');
          // Camera uses the MediaRecorder path — no FFmpeg capture for camera
        }
        ffmpegHandle = null;
      } else {
        console.info('[session-manager] Using MediaRecorder buffer (FFmpeg not available)');
        result = await saveRecording(Buffer.from(buffer), projectDir, metadata, camBuf);
      }

      // Attach cursor events path to result
      console.info('[session-manager] lastCursorResult:', lastCursorResult ? `${lastCursorResult.eventCount} events at ${lastCursorResult.eventsPath}` : 'NULL');
      if (lastCursorResult) {
        result.cursorEventsPath = lastCursorResult.eventsPath;
        lastCursorResult = null;
      }
      console.info('[session-manager] Final result keys:', Object.keys(result), 'cursorEventsPath:', result.cursorEventsPath ?? 'NOT SET');

      // Route result to the main renderer so it can create an Asset entry
      safeSend(mainWindow, IPC_CHANNELS.RECORDING_ASSET_READY, result);

      // Tear down panel and return to idle
      _destroyPanel();
      state = 'idle';

      console.info('[session-manager] Recording saved, transitioned to idle.');
      return result;
    } catch (err) {
      console.error('[session-manager] PANEL_SAVE_RECORDING failed:', err);
      _destroyPanel();
      state = 'idle';
      throw err;
    }
  });

  // ---- Legacy session handlers (keep for backward compat) ----

  ipcMain.handle(IPC_CHANNELS.RECORDING_SESSION_START, async () => {
    // Legacy path: open panel then immediately start recording
    openPanel();
    // Give the panel a tick to load before starting the countdown
    await new Promise((r) => setTimeout(r, 200));
    await startRecording();
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_SESSION_STOP, async () => {
    await stopRecording();
  });

  // ---- Safety net ----

  app.on('before-quit', () => {
    if (state === 'recording') {
      console.info('[session-manager] App quitting mid-recording — stopping session.');
      stopRecording().catch((err) =>
        console.error('[session-manager] stopRecording on quit failed:', err),
      );
    } else if (state === 'countdown') {
      // Abort countdown gracefully
      _cleanup();
      state = 'idle';
    }

    // Destroy panel window if still open
    _destroyPanel();
  });
}
