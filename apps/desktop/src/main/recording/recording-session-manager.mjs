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
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../../shared/ipc-channels.mjs';
import { getRecordingPauseCapability } from '../../shared/recording-pause-policy.mjs';
import {
  mergeRecordingResultWithFinalProbe,
  muxAudioIntoRecording,
  probeRecordingFile,
  saveRecording,
  saveRecordingFromFile,
} from './capture-service.mjs';
import { clearRecordingRecoveryMarker, writeRecordingRecoveryMarker } from './recovery-state.mjs';
import { CursorRecorder } from './cursor-recorder.mjs';
import {
  isFfmpegCaptureAvailable,
  startFfmpegAudioCapture,
  startFfmpegCapture,
} from './ffmpeg-capture.mjs';
import { discoverAudioSources, ensureSourceAudible } from './audio-sources.mjs';
import { getTrayIconDir } from './tray-icon-file.mjs';
import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Notification daemon suspension (Linux) — TASK-197
// ---------------------------------------------------------------------------
// During screen recording on Linux, x11grab captures the entire X root window.
// Any desktop notification (from Rough Cut OR any other app) gets baked into
// the take. Best-effort pause the user's notification daemon for the session;
// resume on stop. Tries dunst, mako, then GNOME's show-banners gsetting.
// If none respond, we log and proceed — the user can disable notifications
// manually. See TASK-198 for the structural Wayland/PipeWire migration.

let notificationDaemonSuspended = false;

function runSilent(cmd, args) {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { stdio: 'ignore' });
      p.on('close', (code) => resolve(code === 0));
      p.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function suspendNotificationsForRecording() {
  if (process.platform !== 'linux' || notificationDaemonSuspended) return;
  let handled = false;
  if (await runSilent('dunstctl', ['set-paused', 'true'])) {
    console.info('[session-manager] dunst paused for recording.');
    handled = true;
  }
  if (!handled && (await runSilent('makoctl', ['mode', '-a', 'do-not-disturb']))) {
    console.info('[session-manager] mako DND enabled for recording.');
    handled = true;
  }
  if (
    !handled &&
    (await runSilent('gsettings', [
      'set',
      'org.gnome.desktop.notifications',
      'show-banners',
      'false',
    ]))
  ) {
    console.info('[session-manager] GNOME banners disabled for recording.');
    handled = true;
  }
  if (!handled) {
    console.info(
      '[session-manager] No notification daemon found to suspend — desktop notifications may bake into capture.',
    );
  }
  notificationDaemonSuspended = handled;
}

async function resumeNotificationsAfterRecording() {
  if (process.platform !== 'linux' || !notificationDaemonSuspended) return;
  await runSilent('dunstctl', ['set-paused', 'false']);
  await runSilent('makoctl', ['mode', '-r', 'do-not-disturb']);
  await runSilent('gsettings', ['set', 'org.gnome.desktop.notifications', 'show-banners', 'true']);
  notificationDaemonSuspended = false;
  console.info('[session-manager] Notification daemons resumed.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getRendererBaseUrl() {
  return (process.env.ROUGH_CUT_RENDERER_URL ?? 'http://127.0.0.1:7544').replace(/\/+$/, '');
}

const IS_LINUX = process.platform === 'linux';
const PANEL_SETUP = { width: 500, height: 520 };
const PANEL_MINI = { width: 340, height: 56 };

// Single source of truth for screen-capture fps on the X11/FFmpeg path.
// Mirrors the 60 Hz target advertised in getDisplayMedia constraints. The
// cursor recorder is no longer locked to this — it samples at the project's
// timeline frameRate (see currentTimelineFps below) so cursor[N] and
// playheadFrame N share the same unit at lookup time.
const TARGET_CAPTURE_FPS = 60;

// Active project's timeline frame rate, published by the renderer via
// IPC_CHANNELS.RECORDING_SET_TIMELINE_FPS whenever the project loads or
// settings.frameRate changes. Default 30 matches the renderer fallback in
// PanelApp.tsx and App.tsx.
let currentTimelineFps = 30;

function clampTimelineFps(fps) {
  const n = Number(fps);
  if (!Number.isFinite(n) || n <= 0 || n > 120) return currentTimelineFps;
  return n;
}

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

/**
 * Linux-only floating "Stop Recording" pill. Replaces the tray on Linux
 * because Electron's Tray.destroy() does not reliably remove the icon on
 * KDE Plasma / libappindicator (Electron #17000, closed without fix), and
 * Tray.setImage() can segfault or leak (#36274, #20850). A tiny frameless
 * BrowserWindow positioned on a display OUTSIDE the captured region gives
 * a reliably destroyable, capture-safe stop control.
 * @type {import('electron').BrowserWindow | null}
 */
let stopPillWindow = null;

/** @type {ReturnType<typeof setInterval> | null} */
let elapsedTimer = null;

/** @type {ReturnType<typeof setInterval> | null} */
let countdownTimer = null;

/** Millisecond timestamp when recording phase started. */
let recordingStartMs = 0;

let pauseCapability = getRecordingPauseCapability({ capturesCursor: true });

/** @type {CursorRecorder} */
const cursorRecorder = new CursorRecorder();

/** @type {{ eventsPath: string, eventCount: number } | null} */
let lastCursorResult = null;

/** @type {import('./ffmpeg-capture.mjs').FfmpegCaptureHandle | null} */
let ffmpegHandle = null;

/** @type {import('./ffmpeg-capture.mjs').FfmpegCaptureHandle | null} */
let ffmpegAudioHandle = null;

/** @type {string | null} */
let ffmpegOutputPath = null;

/** @type {string | null} */
let ffmpegAudioOutputPath = null;

/** @type {{ version?: number, startedAt: string, recordingsDir: string, sourceId?: string | null, recordMode?: string | null, sessionState?: string | null, interruptionReason?: string | null, interruptedAt?: string | null, captureMetadata?: { fps?: number | null, width?: number | null, height?: number | null, timelineFps?: number | null } | null, expectedArtifacts?: { videoPath?: string | null, audioPath?: string | null, cursorPath?: string | null } | null } | null} */
let activeRecoveryMarker = null;

/** @type {(() => { sourceId: string, display: string, width: number, height: number, offsetX?: number, offsetY?: number } | null) | null} */
let getSourceInfo = null;

/** Recording config received from panel for the current recording. */
let pendingAudioConfig = {
  micEnabled: false,
  sysAudioEnabled: false,
  countdownSeconds: 3,
  selectedMicDeviceId: null,
  selectedMicLabel: null,
  selectedSystemAudioSourceId: null,
  systemAudioGainPercent: 100,
};

let activeAudioCapturePlan = {
  micSource: null,
  systemAudioSource: null,
};

let stopCompletion = null;
let shutdownPromise = null;
let captureResourcesStopped = false;
let panelDestroyInProgress = false;
let allowAppQuit = false;
let testHooks = null;
let lastFinalizedRecordingResult = null;

function getTestHook(name) {
  return testHooks && typeof testHooks[name] === 'function' ? testHooks[name] : null;
}

function broadcastSessionEvent(channel, ...args) {
  safeSend(panelWindow, channel, ...args);
  safeSend(mainWindow, channel, ...args);
}

function broadcastConnectionIssues(issues) {
  broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_CONNECTION_ISSUES_CHANGED, issues);
}

function createDeferred() {
  let settled = false;
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    reject = (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAudioCapturePlan(audioConfig) {
  const wantsMic = !!audioConfig?.micEnabled;
  const wantsSystemAudio = !!audioConfig?.sysAudioEnabled;

  if (!wantsMic && !wantsSystemAudio) {
    return {
      micSource: null,
      systemAudioSource: null,
      issues: null,
    };
  }

  const strictMicSelection = Boolean(
    audioConfig?.selectedMicDeviceId || audioConfig?.selectedMicLabel,
  );
  const strictSystemSelection = Boolean(audioConfig?.selectedSystemAudioSourceId);
  const sources = await discoverAudioSources({
    preferredSystemAudioSourceId: audioConfig?.selectedSystemAudioSourceId ?? null,
    preferredMicSourceId: audioConfig?.selectedMicDeviceId ?? null,
    preferredMicLabel: audioConfig?.selectedMicLabel ?? null,
    strictMicSelection,
    strictSystemSelection,
  });

  const micSource = wantsMic ? sources.micSource : null;
  const systemAudioSource = wantsSystemAudio ? sources.monitorSource : null;

  if (systemAudioSource) {
    await ensureSourceAudible(systemAudioSource);
  }

  const issues = {
    mic:
      wantsMic && !micSource
        ? strictMicSelection
          ? 'Selected microphone is unavailable for capture. Choose another input before recording.'
          : 'No microphone capture source is available. Choose another input or turn the mic off before recording.'
        : null,
    camera: null,
    systemAudio:
      wantsSystemAudio && !systemAudioSource
        ? strictSystemSelection
          ? 'Selected system audio source is unavailable for capture. Choose another output before recording.'
          : 'No system audio capture source is available. Choose another output or turn system audio off before recording.'
        : null,
    source: null,
  };

  return {
    micSource,
    systemAudioSource,
    issues: Object.values(issues).some(Boolean) ? issues : null,
  };
}

async function waitForCaptureFile(filePath, timeoutMs = 4000) {
  if (!filePath) return false;

  const startedAt = Date.now();
  let lastSize = -1;
  let stableReads = 0;

  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(filePath)) {
      const size = statSync(filePath).size;
      if (size > 0) {
        if (size === lastSize) {
          stableReads += 1;
          if (stableReads >= 2) return true;
        } else {
          lastSize = size;
          stableReads = 0;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return existsSync(filePath) && statSync(filePath).size > 0;
}

// ---------------------------------------------------------------------------
// Inline red-circle icon for the tray (16×16 px RGBA, base64 PNG).
// Sized for a visible Linux tray slot — the previous 8×8 icon rendered as a
// 1–2 pixel speck in most desktop environments and was effectively invisible.
// ---------------------------------------------------------------------------
const RED_CIRCLE_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVR4nGNgoAV4pqTECcTBQFwFxSA2J7GaQRr+48BVhDTj0oiCybEZv0ugfiZWMwxzIhsQTIYBweQ6H9Mb1DCAYi9QFogURyNVEhKRLsGflNHChLzMRCoAAEe1O6wqkYs0AAAAAElFTkSuQmCC';

// 16×16 fully transparent RGBA PNG — same footprint as RED_CIRCLE_DATA_URL,
// invisible content. Used to clear the Linux tray slot BEFORE destroying the
// tray: AppIndicator/StatusNotifierItem watchers on several desktops cache
// the last-rendered bitmap, so a plain destroy() can leave the red dot
// stranded in the status bar. Repainting with a same-size transparent icon
// and then destroying after a tick reliably removes it.
const TRANSPARENT_16_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAEklEQVR42mNgGAWjYBSMAggAAAQQAAGvRYgsAAAAAElFTkSuQmCC';

// KDE Plasma's KStatusNotifierItem (and some libappindicator3 panels) caches
// the last-loaded pixmap keyed by the icon *path or name* exposed over D-Bus.
// Calling tray.setImage(nativeImage) updates bytes in place without changing
// the path, so plasmashell keeps rendering the cached red dot after Stop.
// Work around it by writing each icon transition to a NEW file with a unique
// counter-suffixed filename, then calling tray.setImage(path) — the indicator
// sees a different resource and actually repaints. Extracted to
// `tray-icon-file.mjs` so the invariant can be unit-tested without Electron.

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

function deriveRecordModeFromSourceId(sourceId) {
  if (typeof sourceId !== 'string') return null;
  if (sourceId.startsWith('window:')) return 'window';
  if (sourceId.startsWith('screen:')) return 'screen';
  return null;
}

async function persistActiveRecoveryMarker(patch = {}) {
  const testPersistRecoveryMarker = getTestHook('persistRecoveryMarker');
  if (testPersistRecoveryMarker) {
    activeRecoveryMarker = await testPersistRecoveryMarker(activeRecoveryMarker, patch);
    return activeRecoveryMarker;
  }

  if (!activeRecoveryMarker) return null;

  activeRecoveryMarker = await writeRecordingRecoveryMarker({
    ...activeRecoveryMarker,
    ...patch,
    expectedArtifacts: {
      ...(activeRecoveryMarker.expectedArtifacts ?? {}),
      ...(patch.expectedArtifacts ?? {}),
    },
  });

  return activeRecoveryMarker;
}

function isWindowAlive(win) {
  return !!win && !win.isDestroyed() && !!win.webContents && !win.webContents.isDestroyed();
}

function getEffectiveElapsedMs() {
  if (!recordingStartMs) return 0;
  return Math.max(0, Date.now() - recordingStartMs);
}

async function resolveProjectDir() {
  const testResolveProjectDir = getTestHook('resolveProjectDir');
  if (testResolveProjectDir) {
    return testResolveProjectDir();
  }

  try {
    const { getRecordingLocation } = await import('../recent-projects-service.mjs');
    return getRecordingLocation() || null;
  } catch {
    return null;
  }
}

function buildFallbackRecordingMetadata() {
  const sourceInfo = getSourceInfo?.();
  return {
    fps: TARGET_CAPTURE_FPS,
    width: sourceInfo?.width ?? 1920,
    height: sourceInfo?.height ?? 1080,
    durationMs: getEffectiveElapsedMs(),
    timelineFps: currentTimelineFps,
    cursorEventsFps: currentTimelineFps,
  };
}

function resolveStopCompletion(result) {
  if (!stopCompletion) return;
  stopCompletion.resolve(result);
  stopCompletion = null;
}

function rejectStopCompletion(error) {
  if (!stopCompletion) return;
  stopCompletion.reject(error);
  stopCompletion = null;
}

function resetCaptureRefs() {
  ffmpegHandle = null;
  ffmpegAudioHandle = null;
  ffmpegOutputPath = null;
  ffmpegAudioOutputPath = null;
}

function transitionToIdle() {
  _cleanup();
  activeAudioCapturePlan = { micSource: null, systemAudioSource: null };
  recordingStartMs = 0;
  state = 'idle';
  broadcastConnectionIssues(null);
  broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'idle');

  // [TASK-197] Restore the user's notification daemon if we suspended it.
  void resumeNotificationsAfterRecording();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

async function stopActiveCaptureResources() {
  if (captureResourcesStopped) {
    _cleanup();
    return;
  }
  captureResourcesStopped = true;

  const testStopActiveCaptureResources = getTestHook('stopActiveCaptureResources');
  if (testStopActiveCaptureResources) {
    await testStopActiveCaptureResources();
    return;
  }

  _cleanup();

  try {
    lastCursorResult = cursorRecorder.stop();
    if (lastCursorResult) {
      console.info(
        '[session-manager] Cursor data:',
        lastCursorResult.eventCount,
        'events →',
        lastCursorResult.eventsPath,
      );
    }
  } catch (err) {
    console.warn('[session-manager] Cursor recorder stop failed:', err?.message ?? err);
    lastCursorResult = null;
  }

  if (ffmpegHandle) {
    try {
      await ffmpegHandle.stop();
      console.info('[session-manager] FFmpeg capture stopped →', ffmpegHandle.outputPath);
    } catch (err) {
      console.warn('[session-manager] FFmpeg stop failed:', err?.message ?? err);
    } finally {
      ffmpegHandle = null;
    }
  }

  if (ffmpegAudioHandle) {
    try {
      await ffmpegAudioHandle.stop();
      console.info(
        '[session-manager] FFmpeg audio-only capture stopped →',
        ffmpegAudioHandle.outputPath,
      );
    } catch (err) {
      console.warn('[session-manager] FFmpeg audio-only stop failed:', err?.message ?? err);
    } finally {
      ffmpegAudioHandle = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-zoom from clicks helpers
// ---------------------------------------------------------------------------

function zoomSidecarPathFor(recordingFilePath) {
  return recordingFilePath.replace(/\.(webm|mp4)$/i, '.zoom.json');
}

async function loadZoomSidecarForDecorate(recordingFilePath) {
  try {
    const path = zoomSidecarPathFor(recordingFilePath);
    if (!existsSync(path)) return null;
    const content = await readFile(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.markers)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate auto-zoom markers from the cursor NDJSON sidecar and append them
 * to the recording's zoom sidecar file. Existing manual markers are preserved
 * and act as blockers (auto markers overlapping a manual marker are skipped).
 * Prior auto markers are replaced by the fresh set.
 *
 * Respects the `autoFromClicks` flag on the recording's zoom presentation
 * (default: true when undefined). Reads `autoZoomIntensity` from user prefs.
 */
async function applyAutoZoomFromClicks(result) {
  try {
    const cursorEventsPath = result.cursorEventsPath;
    if (!cursorEventsPath || !existsSync(cursorEventsPath)) return;
    if (!result.filePath) return;

    // Read the autoFromClicks flag — load existing zoom sidecar first
    const existingSidecar = await loadZoomSidecarForDecorate(result.filePath);
    const autoFromClicks = existingSidecar?.autoFromClicks !== false; // default true
    if (!autoFromClicks) {
      console.info('[auto-zoom] autoFromClicks is disabled for this recording — skipping.');
      return;
    }

    // Read intensity from user preferences
    let intensity = 0.5;
    try {
      const { getAutoZoomIntensity } = await import('../recent-projects-service.mjs');
      intensity = getAutoZoomIntensity();
    } catch (e) {
      console.warn('[auto-zoom] Could not read autoZoomIntensity:', e?.message);
    }

    if (intensity <= 0) {
      console.info('[auto-zoom] autoZoomIntensity is 0 — skipping auto-zoom generation.');
      return;
    }

    // Parse cursor NDJSON
    const ndjsonText = await readFile(cursorEventsPath, 'utf-8');
    const cursorEvents = ndjsonText
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    // Generate auto zoom markers
    const { generateAutoZoomMarkers, filterAutoMarkersAgainstManual } = await import(
      '@rough-cut/timeline-engine'
    );

    const fps = result.fps || 30;
    const sourceWidth = result.width || 1920;
    const sourceHeight = result.height || 1080;

    const rawCandidates = generateAutoZoomMarkers(cursorEvents, intensity, fps, sourceWidth, sourceHeight);

    if (rawCandidates.length === 0) {
      console.info('[auto-zoom] No auto-zoom markers generated (no click triggers found).');
      return;
    }

    // Preserve existing manual markers, discard prior auto markers
    const existingManualMarkers = (existingSidecar?.markers ?? []).filter(
      (m) => m.kind === 'manual',
    );

    // Filter candidates against manual markers
    const filtered = filterAutoMarkersAgainstManual(rawCandidates, existingManualMarkers);

    // Merge: manual markers + new auto markers
    const allMarkers = [...existingManualMarkers, ...filtered];

    const sidecarPayload = {
      version: 1,
      autoIntensity: typeof existingSidecar?.autoIntensity === 'number'
        ? existingSidecar.autoIntensity
        : intensity,
      followCursor: typeof existingSidecar?.followCursor === 'boolean'
        ? existingSidecar.followCursor
        : true,
      followAnimation: existingSidecar?.followAnimation === 'smooth' ? 'smooth' : 'focused',
      followPadding: typeof existingSidecar?.followPadding === 'number'
        ? existingSidecar.followPadding
        : 0.18,
      autoFromClicks: true,
      markers: allMarkers,
    };

    const sidecarPath = zoomSidecarPathFor(result.filePath);
    await writeFile(sidecarPath, JSON.stringify(sidecarPayload, null, 2), 'utf-8');

    console.info(
      `[auto-zoom] Wrote ${filtered.length} auto markers (${existingManualMarkers.length} manual preserved) → ${sidecarPath}`,
    );
  } catch (err) {
    console.warn('[auto-zoom] applyAutoZoomFromClicks failed (non-fatal):', err?.message ?? err);
  }
}

async function decorateSavedResult(result, metadata) {
  if (lastCursorResult) {
    result.cursorEventsPath = lastCursorResult.eventsPath;
    lastCursorResult = null;
  }

  try {
    Object.assign(result, mergeRecordingResultWithFinalProbe(result, metadata));
  } catch (probeError) {
    console.warn(
      '[session-manager] Final recording re-probe failed; keeping provisional metadata:',
      probeError?.message ?? probeError,
    );
  }

  result.audioCapture = {
    requested: {
      micEnabled: pendingAudioConfig.micEnabled,
      sysAudioEnabled: pendingAudioConfig.sysAudioEnabled,
      selectedMicDeviceId: pendingAudioConfig.selectedMicDeviceId ?? null,
      selectedMicLabel: pendingAudioConfig.selectedMicLabel ?? null,
      selectedSystemAudioSourceId: pendingAudioConfig.selectedSystemAudioSourceId ?? null,
    },
    resolved: {
      micSource: activeAudioCapturePlan.micSource,
      systemAudioSource: activeAudioCapturePlan.systemAudioSource,
    },
    final: {
      hasAudio: result.hasAudio,
    },
  };

  // Generate auto-zoom markers from click events (non-fatal — errors are logged and swallowed).
  await applyAutoZoomFromClicks(result);

  return result;
}

async function finalizeSavedSession(result, metadata) {
  const testClearRecoveryMarker = getTestHook('clearRecoveryMarker');
  if (testClearRecoveryMarker) {
    await testClearRecoveryMarker(activeRecoveryMarker);
  } else {
    await clearRecordingRecoveryMarker();
  }
  activeRecoveryMarker = null;
  await decorateSavedResult(result, metadata);

  console.info(
    '[session-manager] Final result keys:',
    Object.keys(result),
    'cursorEventsPath:',
    result.cursorEventsPath ?? 'NOT SET',
  );

  lastFinalizedRecordingResult = structuredClone(result);

  safeSend(mainWindow, IPC_CHANNELS.RECORDING_ASSET_READY, result);
  _destroyPanel();
  transitionToIdle();
  resolveStopCompletion(result);
  return result;
}

async function finalizeInterruptedSession(reason) {
  if (activeRecoveryMarker) {
    activeRecoveryMarker = await persistActiveRecoveryMarker({
      sessionState: state,
      interruptionReason: reason,
      interruptedAt: new Date().toISOString(),
    }).catch((err) => {
      console.warn('[session-manager] Failed to update recovery marker:', err?.message ?? err);
      return activeRecoveryMarker;
    });
  }

  activeRecoveryMarker = null;
  resetCaptureRefs();
  _destroyPanel();
  transitionToIdle();
  resolveStopCompletion(null);
}

async function trySaveFromCaptureFiles(metadata) {
  const testTrySaveFromCaptureFiles = getTestHook('trySaveFromCaptureFiles');
  if (testTrySaveFromCaptureFiles) {
    return testTrySaveFromCaptureFiles(metadata);
  }

  const projectDir = await resolveProjectDir();
  const hasFfmpegOutput = await waitForCaptureFile(ffmpegOutputPath, 8000);
  const hasFfmpegAudioOutput = await waitForCaptureFile(ffmpegAudioOutputPath, 2500);

  if (!hasFfmpegOutput) {
    resetCaptureRefs();
    return null;
  }

  console.info(
    '[session-manager] Finalizing recording from FFmpeg capture fallback:',
    ffmpegOutputPath,
  );
  const result = await saveRecordingFromFile(ffmpegOutputPath, projectDir, metadata);
  if (hasFfmpegAudioOutput) {
    await muxAudioIntoRecording(result.filePath, ffmpegAudioOutputPath);
  }
  resetCaptureRefs();
  return result;
}

async function requestSessionShutdown(reason, options = {}) {
  const { preferRendererSave = true } = options;

  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    try {
      if (state === 'idle') {
        _destroyPanel();
        transitionToIdle();
        return null;
      }

      if (state === 'panel-open') {
        _destroyPanel();
        transitionToIdle();
        return null;
      }

      if (state === 'countdown') {
        console.info('[session-manager] Aborting countdown during shutdown:', reason);
        _destroyPanel();
        transitionToIdle();
        return null;
      }

      if (state !== 'recording' && state !== 'stopping') {
        console.warn('[session-manager] requestSessionShutdown ignored in state:', state);
        return null;
      }

      if (!stopCompletion) {
        stopCompletion = createDeferred();
      }

      if (state === 'recording') {
        console.info('[session-manager] Shutdown requested — transitioning to stopping:', reason);
        state = 'stopping';
        await persistActiveRecoveryMarker({
          sessionState: 'stopping',
          interruptedAt: new Date().toISOString(),
        }).catch((err) => {
          console.warn('[session-manager] Failed to update recovery marker before shutdown:', err);
          return null;
        });
        await stopActiveCaptureResources();
      } else {
        await stopActiveCaptureResources();
      }

      if (IS_LINUX && isWindowAlive(panelWindow)) {
        panelWindow.showInactive();
        console.info('[session-manager] Panel restored for renderer shutdown.');
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }

      let savedResult = null;
      const canUseRendererSave = preferRendererSave && isWindowAlive(panelWindow);

      if (canUseRendererSave) {
        broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'stopping');
        try {
          savedResult = await Promise.race([stopCompletion.promise, delay(8000).then(() => null)]);
        } catch (error) {
          console.warn('[session-manager] Renderer save handoff failed, falling back:', error);
        }
      }

      if (savedResult) {
        return savedResult;
      }

      const fallbackMetadata = buildFallbackRecordingMetadata();
      savedResult = await trySaveFromCaptureFiles(fallbackMetadata);
      if (savedResult) {
        return await finalizeSavedSession(savedResult, fallbackMetadata);
      }

      await finalizeInterruptedSession(reason);
      return null;
    } finally {
      shutdownPromise = null;
    }
  })();

  return shutdownPromise;
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
 * Destroy the active recording tray icon. Idempotent and safe to call from
 * any code path, including exit hooks.
 *
 * This is the single destruction path for the tray — anywhere the tray needs
 * to go away, call this, not tray.destroy() directly.
 */
function destroyTrayIfAny() {
  if (!tray) return;
  const current = tray;
  const wasDestroyed = current.isDestroyed();
  try {
    if (wasDestroyed) {
      tray = null;
      return;
    }

    try {
      current.removeAllListeners();
    } catch {
      // listeners may not exist — ignore
    }
    try {
      current.setToolTip('');
    } catch {
      // best-effort only
    }
    try {
      current.setContextMenu(Menu.buildFromTemplate([]));
    } catch {
      // older Electron may reject null — ignore
    }

    // macOS / Windows — destroy is well-behaved here. Linux no longer routes
    // recording state through the tray; see TASK-196's floating Stop pill.
    tray = null;
    try {
      current.setImage(nativeImage.createEmpty());
    } catch {
      // non-fatal — proceed to destroy
    }
    current.destroy();
    console.info(
      '[session-manager] Tray destroyed — wasAlreadyDestroyed=' + wasDestroyed,
    );
  } catch (err) {
    console.warn('[session-manager] destroyTrayIfAny() failed:', err?.message ?? err);
  }
}

/**
 * Actually destroy the tray, including on Linux. Use ONLY from the
 * `before-quit` path — once the app is quitting we don't care about the
 * AppIndicator stale-bitmap caching (the whole process is going away).
 */
function forceDestroyTrayOnQuit() {
  if (!tray) return;
  const current = tray;
  tray = null;
  try {
    if (!current.isDestroyed()) {
      try {
        current.removeAllListeners();
      } catch {
        // ignore
      }
      current.destroy();
    }
  } catch (err) {
    console.warn('[session-manager] forceDestroyTrayOnQuit() failed:', err?.message ?? err);
  }
}

/**
 * Create the system tray icon with explicit pause-unavailable state and stop.
 * Linux uses the floating Stop pill instead of the tray.
 *
 * DEFENSIVE: if a tray already exists (shouldn't happen in normal flow, but
 * would leak an orphan icon if it did — e.g. back-to-back recordings where a
 * prior cleanup was skipped), the old tray is destroyed first. This makes
 * createTray idempotent with respect to the module-level `tray` binding.
 * @returns {Tray | null}
 */
function createTray() {
  if (IS_LINUX) {
    console.warn('[session-manager] createTray() ignored on Linux; using Stop pill instead.');
    return null;
  }

  try {
    const redIcon = nativeImage.createFromDataURL(RED_CIRCLE_DATA_URL);
    if (redIcon.isEmpty?.()) {
      console.warn('[session-manager] Tray icon decoded empty — tray may render blank');
    }

    if (tray) {
      console.warn(
        '[session-manager] createTray called with existing tray — destroying prior tray first',
      );
      destroyTrayIfAny();
    }

    const t = new Tray(redIcon);
    t.setToolTip('Recording — 00:00 (click to stop)');
    _rebuildTrayMenu(t);
    console.info(
      '[session-manager] Tray created — ' +
        'iconSize=' + JSON.stringify(redIcon.getSize()) +
        ' platform=' +
        process.platform +
        ' xdgDesktop=' +
        (process.env.XDG_CURRENT_DESKTOP ?? 'unknown'),
    );
    return t;
  } catch (err) {
    console.error('[session-manager] createTray() failed:', err);
    return null;
  }
}

/**
 * Rebuild the tray context menu to reflect the current pause support state.
 * @param {Tray} t
 */
function _rebuildTrayMenu(t) {
  if (!t || t.isDestroyed()) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: pauseCapability.label,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Stop Recording',
      click: () => {
        console.info(
          '[session-manager] Tray Stop Recording clicked — state=' + state + ' panel=' + Boolean(panelWindow),
        );
        stopRecording()
          .then(() => console.info('[session-manager] Tray Stop Recording resolved'))
          .catch((err) =>
            console.error('[session-manager] stopRecording from tray failed:', err),
          );
      },
    },
    {
      label: 'Force Cancel (discard)',
      click: () => {
        console.warn(
          '[session-manager] Tray Force Cancel clicked — state=' + state + ' panel=' + Boolean(panelWindow),
        );
        // Escape hatch for when normal stop hangs. Destroys the panel window,
        // stops capture resources, and transitions to idle without waiting
        // for the renderer save handoff. The screen FFmpeg file already on
        // disk is preserved but is NOT imported as an asset; recovery markers
        // handle promoting it on next launch if the user wants.
        try {
          void stopActiveCaptureResources().catch((err) =>
            console.warn('[session-manager] Force cancel: stopActiveCaptureResources failed:', err),
          );
        } catch (err) {
          console.warn('[session-manager] Force cancel threw synchronously:', err);
        }
        _destroyPanel();
        transitionToIdle();
        if (stopCompletion) {
          try {
            stopCompletion.resolve(null);
          } catch {
            // ignore already-resolved
          }
          stopCompletion = null;
        }
        shutdownPromise = null;
      },
    },
  ]);
  t.setContextMenu(contextMenu);
}

/**
 * Update the tray tooltip with the current elapsed time (called every 100 ms).
 */
function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return;
  try {
    const elapsedMs = Date.now() - recordingStartMs;
    const elapsed = formatElapsed(elapsedMs);
    tray.setToolTip(`Recording — ${elapsed} (click to stop)`);
  } catch {
    // Tray may have been destroyed concurrently — ignore
  }
}

// ---------------------------------------------------------------------------
// Floating Stop pill (Linux — replaces the tray)
// ---------------------------------------------------------------------------

/**
 * Two rects intersect when they overlap in both dimensions.
 * @param {{x:number,y:number,width:number,height:number}} a
 * @param {{x:number,y:number,width:number,height:number}} b
 */
function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Find a connected display whose bounds do NOT intersect the captured region.
 * Returns null when every display overlaps the capture (single-monitor setups
 * or when the capture spans all displays).
 * @param {{x:number,y:number,width:number,height:number} | null} captureBounds
 * @returns {import('electron').Display | null}
 */
function findDisplayOutsideCapture(captureBounds) {
  if (!captureBounds) return null;
  try {
    const displays = screen.getAllDisplays();
    for (const d of displays) {
      if (!rectsIntersect(d.bounds, captureBounds)) return d;
    }
  } catch (err) {
    console.warn('[session-manager] findDisplayOutsideCapture failed:', err?.message ?? err);
  }
  return null;
}

const STOP_PILL_WIDTH = 180;
const STOP_PILL_HEIGHT = 40;

const STOP_PILL_HTML = `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:0;background:transparent;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-user-select:none;user-select:none;overflow:hidden;}
  button{display:flex;align-items:center;justify-content:center;gap:8px;
    width:${STOP_PILL_WIDTH}px;height:${STOP_PILL_HEIGHT}px;
    padding:0 14px;border:0;border-radius:20px;
    background:#161616f2;color:#fff;cursor:pointer;
    font-size:13px;font-weight:500;letter-spacing:.2px;
    box-shadow:0 4px 14px rgba(0,0,0,.35);}
  button:hover{background:#242424f2;}
  button:active{background:#0e0e0ef2;}
  .dot{width:10px;height:10px;border-radius:50%;background:#ef4444;
    box-shadow:0 0 6px #ef4444aa;animation:pulse 1.2s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.55;}}
</style></head>
<body><button id="stop" type="button"><span class="dot"></span>Stop Recording</button>
<script>
  document.getElementById('stop').addEventListener('click', () => {
    try { window.roughcut && window.roughcut.panelStopRecording && window.roughcut.panelStopRecording(); }
    catch (e) { /* ignore */ }
  });
</script></body></html>`;

/**
 * Open the floating Stop Recording pill on a display OUTSIDE the captured
 * region. No-ops when no such display exists (single-monitor capture) — the
 * user stops via Ctrl+Shift+Esc alone.
 */
function createStopPillWindow() {
  destroyStopPillWindow();

  const sourceInfo = getSourceInfo?.();
  const captureBounds = sourceInfo
    ? {
        x: sourceInfo.offsetX ?? 0,
        y: sourceInfo.offsetY ?? 0,
        width: sourceInfo.width ?? 0,
        height: sourceInfo.height ?? 0,
      }
    : null;

  const safeDisplay = findDisplayOutsideCapture(captureBounds);
  if (!safeDisplay) {
    console.info(
      '[session-manager] Stop pill skipped — no capture-safe display (single-monitor or full-span capture). ' +
        'User stops via Ctrl+Shift+Esc.',
    );
    return;
  }

  // Top-center of the safe display's work area.
  const { x: dx, y: dy, width: dw } = safeDisplay.workArea;
  const x = Math.round(dx + (dw - STOP_PILL_WIDTH) / 2);
  const y = dy + 16;

  try {
    const preloadPath = join(__dirname, '..', '..', 'preload', 'index.mjs');
    stopPillWindow = new BrowserWindow({
      x,
      y,
      width: STOP_PILL_WIDTH,
      height: STOP_PILL_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    stopPillWindow.setAlwaysOnTop(true, 'screen-saver');
    stopPillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Write the HTML to a temp file and loadFile it. Using a `data:` URL
    // here is brittle — preload + contextBridge + inline scripts don't always
    // line up on data: origins across Electron versions, and then the Stop
    // click is silent.
    const trayIconDir = getTrayIconDir();
    try {
      mkdirSync(trayIconDir, { recursive: true });
    } catch {
      // ignore — write will surface real errors
    }
    const pillHtmlPath = join(trayIconDir, `stop-pill-${process.pid}.html`);
    try {
      writeFileSync(pillHtmlPath, STOP_PILL_HTML, 'utf8');
    } catch (err) {
      console.warn('[session-manager] writing Stop pill HTML failed:', err?.message ?? err);
    }
    stopPillWindow.loadFile(pillHtmlPath);

    stopPillWindow.once('ready-to-show', () => {
      if (stopPillWindow && !stopPillWindow.isDestroyed()) stopPillWindow.showInactive();
    });
    stopPillWindow.on('closed', () => {
      stopPillWindow = null;
    });

    console.info(
      '[session-manager] Stop pill created at (' +
        x +
        ',' +
        y +
        ') on display id=' +
        safeDisplay.id +
        ' (capture on ' +
        JSON.stringify(captureBounds) +
        ')',
    );
  } catch (err) {
    console.warn('[session-manager] createStopPillWindow failed:', err?.message ?? err);
    stopPillWindow = null;
  }
}

/**
 * Tear down the floating Stop pill. Idempotent.
 */
function destroyStopPillWindow() {
  if (!stopPillWindow) return;
  const w = stopPillWindow;
  stopPillWindow = null;
  try {
    if (!w.isDestroyed()) w.destroy();
    console.info('[session-manager] Stop pill destroyed.');
  } catch (err) {
    console.warn('[session-manager] destroyStopPillWindow failed:', err?.message ?? err);
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
    const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
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
  const pos = mode === 'mini' ? getMiniPosition(size) : getPanelPosition(size);
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
  if (state === 'panel-open') {
    if (isWindowAlive(panelWindow)) {
      resizePanel('setup');
      panelWindow.show();
      panelWindow.focus();
      console.info('[session-manager] Existing panel focused.');
      return;
    }

    console.warn('[session-manager] Recovering stale panel-open state before reopening panel.');
    transitionToIdle();
  }

  if (!guardState('openPanel', ['idle'])) return;
  broadcastConnectionIssues(null);

  const PANEL_W = PANEL_SETUP.width;
  const PANEL_H = PANEL_SETUP.height;
  const { x, y } = getPanelPosition({ width: PANEL_W, height: PANEL_H });

  const preloadPath = join(__dirname, '..', '..', 'preload', 'index.mjs');
  console.info('[session-manager] Creating panel window, preload:', preloadPath);

  panelWindow = new BrowserWindow({
    x,
    y,
    width: PANEL_W,
    height: PANEL_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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
      // TASK-182: keep the renderer running at full speed even when the panel
      // is hidden during recording. Without this, Chromium throttles the
      // hidden page, which stalls MediaStreamTrack frame delivery and makes
      // the mediabunny camera sidecar deliver ~0 fps for the duration of the
      // take. The camera sidecar depends on live frames; throttling breaks it.
      backgroundThrottling: false,
    },
  });

  // Exclude panel from screen capture so it never appears in recordings.
  panelWindow.setContentProtection(true);

  // Load panel renderer
  const panelUrl = !app.isPackaged
    ? `${getRendererBaseUrl()}/panel.html`
    : join(__dirname, '../../../dist/renderer/panel.html');

  console.info('[session-manager] Loading panel from:', panelUrl);

  const loadPanelRenderer = () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;
    if (!app.isPackaged) {
      panelWindow.loadURL(panelUrl);
    } else {
      panelWindow.loadFile(panelUrl);
    }
  };

  loadPanelRenderer();

  // Pipe panel renderer console logs to main process terminal
  panelWindow.webContents.on('console-message', (_e, level, message) => {
    const prefix = ['[panel:LOG]', '[panel:WARN]', '[panel:ERR]'][level] ?? '[panel]';
    console.info(prefix, message);
  });

  panelWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[session-manager] Panel failed to load:', code, desc);
    if (!app.isPackaged && code === -102) {
      setTimeout(loadPanelRenderer, 250);
    }
  });

  panelWindow.webContents.on('did-finish-load', () => {
    console.info('[session-manager] Panel finished loading.');
  });

  panelWindow.webContents.on('render-process-gone', (_event, details) => {
    console.warn('[session-manager] Panel renderer disappeared:', details?.reason ?? 'unknown');
    if (state === 'recording' || state === 'stopping' || state === 'countdown') {
      void requestSessionShutdown('renderer-gone', { preferRendererSave: false }).catch((err) =>
        console.error('[session-manager] Shutdown after renderer loss failed:', err),
      );
    }
  });

  panelWindow.once('ready-to-show', () => {
    console.info('[session-manager] Panel ready to show.');
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.show();
    }
  });

  // If the panel is closed externally (user clicks X or OS closes it), clean up.
  panelWindow.on('closed', () => {
    const wasIntentional = panelDestroyInProgress;
    panelDestroyInProgress = false;
    panelWindow = null;
    if (wasIntentional) {
      return;
    }

    console.info('[session-manager] Panel closed unexpectedly.');
    if (state === 'recording' || state === 'stopping' || state === 'countdown') {
      void requestSessionShutdown('panel-closed', { preferRendererSave: false }).catch((err) =>
        console.error('[session-manager] Shutdown after panel close failed:', err),
      );
      return;
    }

    transitionToIdle();
  });

  state = 'panel-open';
  console.info('[session-manager] Panel opened.');
}

/**
 * Destroy the panel BrowserWindow and transition to `idle`.
 * No-ops if no panel is open.
 */
export async function closePanel() {
  if (!guardState('closePanel', ['panel-open', 'countdown', 'recording', 'stopping'])) return;

  await requestSessionShutdown('panel-closed');
  console.info('[session-manager] Panel closed.');
}

/**
 * Destroy the panel window reference.  Safe to call if already null/destroyed.
 */
function _destroyPanel() {
  if (panelWindow) {
    try {
      panelDestroyInProgress = true;
      if (!panelWindow.isDestroyed()) panelWindow.destroy();
    } catch (err) {
      panelDestroyInProgress = false;
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
 *  2. Run configured countdown — send ticks to the panel and main windows
 *  3. Transition to 'recording'
 *  4. Send `status-changed: 'recording'` to panelWindow
 *  5. Start elapsed timer (100 ms) → panelWindow
 *  6. Register global shortcut + create tray
 */
export async function startRecording() {
  if (!guardState('startRecording', ['panel-open'])) return;

  try {
    const audioCapturePlan = await resolveAudioCapturePlan(pendingAudioConfig);
    if (audioCapturePlan.issues) {
      activeAudioCapturePlan = { micSource: null, systemAudioSource: null };
      broadcastConnectionIssues(audioCapturePlan.issues);
      console.warn(
        '[session-manager] Blocking recording start because selected audio route is unavailable:',
        {
          pendingAudioConfig,
          audioCapturePlan,
        },
      );
      return;
    }

    activeAudioCapturePlan = {
      micSource: audioCapturePlan.micSource,
      systemAudioSource: audioCapturePlan.systemAudioSource,
    };

    state = 'countdown';

    await _runCountdown(pendingAudioConfig.countdownSeconds);

    // Check if state was externally changed during countdown (e.g. panel closed)
    if (state !== 'countdown') {
      console.warn('[session-manager] Session aborted during countdown — bailing out.');
      return;
    }

    // --- Recording phase ---
    state = 'recording';
    broadcastConnectionIssues(null);
    recordingStartMs = Date.now();
    captureResourcesStopped = false;
    console.info(
      '[session-manager] Recording phase started. Platform:',
      process.platform,
      'Content protection:',
      IS_LINUX ? 'UNAVAILABLE' : 'enabled',
    );

    // Start cursor recording — writes .cursor.ndjson alongside the video.
    // Default: ~/Documents/Rough Cut/recordings (persistent). Falls back to
    // /tmp only if the user's Documents directory is not accessible.
    const defaultRecordingsDir = join(app.getPath('documents'), 'Rough Cut', 'recordings');
    const recordingsDir = await (async () => {
      try {
        const { getRecordingLocation } = await import('../recent-projects-service.mjs');
        const loc = getRecordingLocation();
        console.info(
          '[session-manager] Recording location:',
          loc || `(default ${defaultRecordingsDir})`,
        );
        return loc || defaultRecordingsDir;
      } catch (e) {
        console.warn('[session-manager] getRecordingLocation failed:', e?.message);
        return defaultRecordingsDir;
      }
    })();
    // Ensure the recordings directory exists before FFmpeg/MediaRecorder tries to write to it
    try {
      if (!existsSync(recordingsDir)) mkdirSync(recordingsDir, { recursive: true });
    } catch (err) {
      console.warn(
        '[session-manager] Failed to create recordings dir:',
        recordingsDir,
        err?.message,
      );
    }
    const cursorTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cursorPath = join(recordingsDir, `recording-${cursorTimestamp}.cursor.ndjson`);
    const sourceInfo = getSourceInfo?.();
    const sourceId = sourceInfo?.sourceId ?? null;
    const ffmpegPath =
      isFfmpegCaptureAvailable() && sourceInfo
        ? join(recordingsDir, `recording-${cursorTimestamp}.webm`)
        : null;
    const ffmpegAudioPath =
      pendingAudioConfig.micEnabled || pendingAudioConfig.sysAudioEnabled
        ? join(recordingsDir, `recording-${cursorTimestamp}-audio.webm`)
        : null;
    console.info('[session-manager] Cursor sidecar path:', cursorPath);
    activeRecoveryMarker = await writeRecordingRecoveryMarker({
      startedAt: new Date().toISOString(),
      recordingsDir,
      sourceId,
      recordMode: deriveRecordModeFromSourceId(sourceId),
      sessionState: 'recording',
      captureMetadata: {
        fps: TARGET_CAPTURE_FPS,
        width: sourceInfo?.width ?? null,
        height: sourceInfo?.height ?? null,
        timelineFps: currentTimelineFps,
        cursorEventsFps: currentTimelineFps,
      },
      expectedArtifacts: {
        videoPath: ffmpegPath,
        audioPath: ffmpegAudioPath,
        cursorPath,
      },
    });
    try {
      // Cursor frames are indexed at the project's timeline fps so that
      // cursor[playheadFrame] is a direct lookup at playback time. See the
      // RECORDING_SET_TIMELINE_FPS handler below — currentTimelineFps is kept
      // in sync with project.settings.frameRate by the renderer.
      const cursorFps = currentTimelineFps;
      const initialPoint = screen.getCursorScreenPoint();
      cursorRecorder.start(cursorFps, cursorPath, {
        offsetX: sourceInfo?.offsetX ?? 0,
        offsetY: sourceInfo?.offsetY ?? 0,
        initialX: initialPoint?.x,
        initialY: initialPoint?.y,
      });
    } catch (err) {
      console.warn('[session-manager] CursorRecorder failed to start:', err?.message ?? err);
    }

    // [TASK-197] Suspend the notification daemon so popups (Rough Cut's or any
    // other app's) can't bake into the capture. Best-effort.
    await suspendNotificationsForRecording();

    // [TASK-197] Hide all Rough Cut UI BEFORE ffmpeg x11grab begins so the
    // first frames don't capture the main preview / panel / camera PiP.
    // Electron's `hide()` maps to async XUnmapWindow; we poll isVisible() then
    // add a 200ms compositor-repaint margin (Mutter/KWin/Picom).
    const hiddenWindows = [];
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.hide();
      hiddenWindows.push(['main', mainWindow]);
      console.info('[session-manager][pre-capture] Main window hide() called.');
    }
    if (IS_LINUX && panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
      panelWindow.hide();
      hiddenWindows.push(['panel', panelWindow]);
      console.info('[session-manager][pre-capture] Panel hide() called (Linux).');
    }
    {
      const hideDeadline = Date.now() + 500;
      while (Date.now() < hideDeadline) {
        const stillVisible = hiddenWindows.filter(([, w]) => !w.isDestroyed() && w.isVisible());
        if (stillVisible.length === 0) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      await new Promise((r) => setTimeout(r, 200));
      console.info('[session-manager][pre-capture] Hide confirmed, starting ffmpeg.');
    }

    // Start FFmpeg x11grab capture (cursor-free) on Linux/X11
    ffmpegHandle = null;
    ffmpegAudioHandle = null;
    ffmpegOutputPath = null;
    ffmpegAudioOutputPath = null;
    if (isFfmpegCaptureAvailable() && getSourceInfo) {
      if (sourceInfo) {
        const micSource = activeAudioCapturePlan.micSource;
        const systemAudioSource = activeAudioCapturePlan.systemAudioSource;
        console.info('[session-manager] Audio sources for FFmpeg:', {
          micSource,
          systemAudioSource,
          systemAudioGainPercent: pendingAudioConfig.systemAudioGainPercent,
        });

        try {
          ffmpegHandle = startFfmpegCapture({
            outputPath: ffmpegPath,
            fps: TARGET_CAPTURE_FPS,
            display: sourceInfo.display,
            width: sourceInfo.width,
            height: sourceInfo.height,
            micSource,
            systemAudioSource,
            systemAudioGainPercent: pendingAudioConfig.systemAudioGainPercent,
            // Anchor the cursor sidecar to FFmpeg's actual first-captured-
            // frame wall-clock (derived from `-progress pipe:1`). This is the
            // reliable signal on Linux/X11 — the played-back video is the
            // FFmpeg file, so cursor[0] must match file frame 0 not
            // MediaRecorder.start (which fires later in the panel renderer).
            onFirstFrame: (firstFrameMs) => {
              cursorRecorder.setStartTime(firstFrameMs);
              recordingStartMs = firstFrameMs;
              console.info(
                '[session-manager] FFmpeg first frame anchored at',
                new Date(firstFrameMs).toISOString(),
              );
            },
          });
          ffmpegOutputPath = ffmpegPath;
          console.info(
            '[session-manager] FFmpeg x11grab started →',
            ffmpegPath,
            micSource || systemAudioSource ? '(with audio)' : '(video-only)',
          );
        } catch (err) {
          console.warn('[session-manager] FFmpeg capture failed to start:', err?.message ?? err);
          ffmpegHandle = null;
        }
      } else {
        console.info(
          '[session-manager] No source info — skipping FFmpeg capture (window capture?)',
        );
      }
    }

    if (!ffmpegHandle && (pendingAudioConfig.micEnabled || pendingAudioConfig.sysAudioEnabled)) {
      try {
        const micSource = activeAudioCapturePlan.micSource;
        const systemAudioSource = activeAudioCapturePlan.systemAudioSource;
        const audioPath = ffmpegAudioPath;
        ffmpegAudioHandle = startFfmpegAudioCapture({
          outputPath: audioPath,
          micSource,
          systemAudioSource,
          systemAudioGainPercent: pendingAudioConfig.systemAudioGainPercent,
        });
        if (ffmpegAudioHandle) {
          ffmpegAudioOutputPath = audioPath;
          console.info('[session-manager] FFmpeg audio-only capture started →', audioPath, {
            micSource,
            systemAudioSource,
          });
        }
      } catch (err) {
        console.warn(
          '[session-manager] FFmpeg audio-only capture failed to start:',
          err?.message ?? err,
        );
        ffmpegAudioHandle = null;
      }
    }

    // [TASK-197] Main window + panel are already hidden by the pre-capture
    // block above, before ffmpeg started. On macOS/Windows: shrink to mini-
    // controller (content-protected, invisible to capture). On Linux: panel
    // stays hidden; setContentProtection is a no-op on X11 (Electron #12973),
    // and the OS notification cannot be excluded from x11grab — both would
    // bake into the take. Visible stop controls: Stop pill on a non-captured
    // display (created below) + global Ctrl+Shift+Esc shortcut.
    if (IS_LINUX) {
      // Deliberately not creating a Notification here — see TASK-197.
      console.info(
        '[session-manager] Skipped OS notification (Linux — would bake into x11grab capture).',
      );
    } else {
      resizePanel('mini');
      console.info('[session-manager] Panel resized to mini-controller.');
    }

    broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_STATUS_CHANGED, 'recording');
    console.info('[session-manager] Sent recording status to panel.');

    pauseCapability = getRecordingPauseCapability({
      screenCaptureBackend: ffmpegHandle ? 'ffmpeg' : 'media-recorder',
      audioCaptureBackend:
        ffmpegHandle || ffmpegAudioHandle
          ? 'ffmpeg'
          : pendingAudioConfig.micEnabled || pendingAudioConfig.sysAudioEnabled
            ? 'media-recorder'
            : 'none',
      capturesCursor: true,
      capturesCamera: false,
    });

    // Elapsed heartbeat → panelWindow
    elapsedTimer = setInterval(() => {
      const elapsedMs = Date.now() - recordingStartMs;
      broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_ELAPSED, elapsedMs);
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

    // Visible stop control.
    // - macOS / Windows: system tray with a red-dot icon (reliable there).
    // - Linux: the floating Stop pill on a capture-safe display. We skip the
    //   Electron tray entirely on Linux because destroy() is unreliable on
    //   KDE / libappindicator (Electron #17000) and leaves a stale red icon.
    if (IS_LINUX) {
      createStopPillWindow();
    } else {
      tray = createTray();
    }

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
  if (state !== 'recording' && state !== 'stopping') {
    console.warn(`[session-manager] stopRecording() ignored — current state: ${state}`);
    return;
  }

  await requestSessionShutdown('user-stop');
  console.info('[session-manager] Recording stop completed.');
}

async function handleBeforeQuit(event) {
  // Final safety net: neither the tray nor the floating Stop pill may survive
  // the quit. Both destroy paths are idempotent.
  if (allowAppQuit) {
    forceDestroyTrayOnQuit();
    destroyStopPillWindow();
    return;
  }
  if (state === 'idle' && !panelWindow) {
    forceDestroyTrayOnQuit();
    destroyStopPillWindow();
    return;
  }

  event.preventDefault();
  void requestSessionShutdown('app-quit')
    .catch((err) => {
      console.error('[session-manager] stopRecording on quit failed:', err);
    })
    .finally(() => {
      forceDestroyTrayOnQuit();
      destroyStopPillWindow();
      allowAppQuit = true;
      const testQuitApplication = getTestHook('quitApplication');
      if (testQuitApplication) {
        testQuitApplication();
      } else {
        app.quit();
      }
    });
}

export function __setSessionManagerTestHooks(hooks = null) {
  testHooks = hooks;
}

export function __setSessionManagerTestState(patch = {}) {
  if ('state' in patch) state = patch.state;
  if ('mainWindow' in patch) mainWindow = patch.mainWindow;
  if ('panelWindow' in patch) panelWindow = patch.panelWindow;
  if ('recordingStartMs' in patch) recordingStartMs = patch.recordingStartMs;
  if ('activeRecoveryMarker' in patch) activeRecoveryMarker = patch.activeRecoveryMarker;
  if ('pendingAudioConfig' in patch) pendingAudioConfig = { ...pendingAudioConfig, ...patch.pendingAudioConfig };
  if ('activeAudioCapturePlan' in patch) {
    activeAudioCapturePlan = { ...activeAudioCapturePlan, ...patch.activeAudioCapturePlan };
  }
  if ('stopCompletion' in patch) stopCompletion = patch.stopCompletion;
  if ('allowAppQuit' in patch) allowAppQuit = patch.allowAppQuit;
}

export function __getSessionManagerTestState() {
  return {
    state,
    allowAppQuit,
    hasPanelWindow: !!panelWindow,
    hasMainWindow: !!mainWindow,
    activeRecoveryMarker,
  };
}

export function __resetSessionManagerForTests() {
  testHooks = null;
  state = 'idle';
  mainWindow = null;
  panelWindow = null;
  tray = null;
  stopPillWindow = null;
  elapsedTimer = null;
  countdownTimer = null;
  recordingStartMs = 0;
  lastCursorResult = null;
  ffmpegHandle = null;
  ffmpegAudioHandle = null;
  ffmpegOutputPath = null;
  ffmpegAudioOutputPath = null;
  activeRecoveryMarker = null;
  getSourceInfo = null;
  pendingAudioConfig = {
    micEnabled: false,
    sysAudioEnabled: false,
    countdownSeconds: 3,
    selectedMicDeviceId: null,
    selectedMicLabel: null,
    selectedSystemAudioSourceId: null,
  };
  activeAudioCapturePlan = { micSource: null, systemAudioSource: null };
  stopCompletion = null;
  shutdownPromise = null;
  captureResourcesStopped = false;
  panelDestroyInProgress = false;
  allowAppQuit = false;
  pauseCapability = getRecordingPauseCapability({ capturesCursor: true });
}

export async function __handleBeforeQuitForTests(event) {
  await handleBeforeQuit(event);
}

export async function __requestSessionShutdownForTests(reason, options) {
  return requestSessionShutdown(reason, options);
}

globalThis.__roughCutSessionManagerTestApi = {
  __setSessionManagerTestHooks,
  __setSessionManagerTestState,
  __getSessionManagerTestState,
  __resetSessionManagerForTests,
  __handleBeforeQuitForTests,
  __requestSessionShutdownForTests,
};

// ---------------------------------------------------------------------------
// Countdown (internal)
// ---------------------------------------------------------------------------

/**
 * Run the configured countdown. Sends a tick per second to the panel and main windows.
 * Resolves once the final tick has been sent (after the 1-second pause for "1").
 * @returns {Promise<void>}
 */
function _runCountdown(configuredSeconds = 3) {
  return new Promise((resolve) => {
    let secondsLeft = Number.isFinite(configuredSeconds) ? Math.max(0, configuredSeconds) : 3;
    if (secondsLeft === 0) {
      resolve();
      return;
    }

    broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, secondsLeft);

    countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        resolve();
      } else {
        broadcastSessionEvent(IPC_CHANNELS.RECORDING_SESSION_COUNTDOWN_TICK, secondsLeft);
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

  // Destroy tray (macOS/Windows) and the floating Stop pill (Linux). Both
  // destroy paths are idempotent — either can run when the other's resource
  // was never created this session.
  destroyTrayIfAny();
  destroyStopPillWindow();
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

  ipcMain.handle(IPC_CHANNELS.PANEL_CLOSE, async () => {
    await closePanel();
  });

  ipcMain.handle(IPC_CHANNELS.PANEL_RESIZE, (_event, { mode }) => {
    resizePanel(mode);
  });

  // ---- Recording lifecycle ----

  ipcMain.handle(IPC_CHANNELS.PANEL_START_RECORDING, async (_event, audioConfig) => {
    pendingAudioConfig = {
      micEnabled: !!audioConfig?.micEnabled,
      sysAudioEnabled: !!audioConfig?.sysAudioEnabled,
      countdownSeconds: audioConfig?.countdownSeconds,
      selectedMicDeviceId: audioConfig?.selectedMicDeviceId ?? null,
      selectedMicLabel: audioConfig?.selectedMicLabel ?? null,
      selectedSystemAudioSourceId: audioConfig?.selectedSystemAudioSourceId ?? null,
      systemAudioGainPercent: audioConfig?.systemAudioGainPercent ?? 100,
    };
    console.info('[session-manager] Recording config from panel:', pendingAudioConfig);
    await startRecording();
  });

  ipcMain.handle(IPC_CHANNELS.PANEL_STOP_RECORDING, async () => {
    await stopRecording();
  });

  ipcMain.on(IPC_CHANNELS.PANEL_CONNECTION_ISSUES_CHANGED, (_event, issues) => {
    broadcastConnectionIssues(issues);
  });

  ipcMain.on('panel:pause', () => {
    if (state === 'recording') {
      console.warn('[session-manager] Ignoring pause request:', pauseCapability.reason);
    }
  });

  ipcMain.on('panel:resume', () => {
    if (state === 'recording') {
      console.warn('[session-manager] Ignoring resume request:', pauseCapability.reason);
    }
  });

  // Renderer publishes the active project's timeline frameRate so cursor
  // sampling matches what the playback transport will use to look it up.
  ipcMain.on(IPC_CHANNELS.RECORDING_SET_TIMELINE_FPS, (_event, payload) => {
    const next = clampTimelineFps(payload?.fps);
    if (next !== currentTimelineFps) {
      currentTimelineFps = next;
      console.info('[session-manager] Timeline fps set to', currentTimelineFps);
      safeSend(panelWindow, IPC_CHANNELS.RECORDING_SET_TIMELINE_FPS, {
        fps: currentTimelineFps,
      });
    }
  });

  // Rebase cursor recorder start time to match the actual MediaRecorder
  // start. On Linux/X11 we instead anchor to FFmpeg's first captured frame
  // (see startFfmpegCapture's onFirstFrame above) — that signal is later
  // than MediaRecorder.start would suggest is the correct anchor here, and
  // the FFmpeg file is the one we actually play back. The MediaRecorder
  // rebase is the right anchor only when the played-back file IS the
  // MediaRecorder buffer, i.e., the non-FFmpeg path.
  ipcMain.on(IPC_CHANNELS.PANEL_MEDIA_RECORDER_STARTED, (_event, { timestampMs }) => {
    if (state !== 'recording') return;
    if (isFfmpegCaptureAvailable()) return;
    cursorRecorder.rebaseStartTime(timestampMs);
    // Also rebase the elapsed timer origin for the toolbar
    recordingStartMs = timestampMs;
  });

  /**
   * Called by the panel renderer once it has assembled the recording blob.
   * Saves the file via capture-service, then routes the result to mainWindow.
   */
  ipcMain.handle(
    IPC_CHANNELS.PANEL_SAVE_RECORDING,
    async (_event, { buffer, metadata, cameraBuffer }) => {
      try {
        if (state !== 'stopping') {
          console.warn('[session-manager] Ignoring late panel save while state is', state);
          return null;
        }

        // The panel doesn't have access to the project store, so it ships
        // metadata.timelineFps as a hardcoded fallback. Override with the
        // value the session manager actually used to start the cursor
        // recorder so duration math and cursor lookup share one frame rate.
        if (metadata && typeof metadata === 'object') {
          metadata = {
            ...metadata,
            timelineFps: currentTimelineFps,
            cursorEventsFps: currentTimelineFps,
          };
        }

        const projectDir = await resolveProjectDir();

        console.info(
          '[session-manager] Saving recording to:',
          projectDir ?? '/tmp/rough-cut/recordings/',
        );
        console.info(
          '[session-manager] Camera buffer received:',
          cameraBuffer ? `${cameraBuffer.byteLength} bytes` : 'NONE',
        );
        const camBuf = cameraBuffer ? Buffer.from(cameraBuffer) : null;

        // Use FFmpeg x11grab output (cursor-free) if available, otherwise MediaRecorder buffer
        let result;
        const hasFfmpegOutput = await waitForCaptureFile(ffmpegOutputPath);
        const hasFfmpegAudioOutput = await waitForCaptureFile(ffmpegAudioOutputPath, 2500);
        if (hasFfmpegOutput) {
          // FFmpeg was already stopped by stopRecording() — file should be complete
          console.info(
            '[session-manager] Using FFmpeg x11grab output (no cursor):',
            ffmpegOutputPath,
          );
          result = await saveRecordingFromFile(ffmpegOutputPath, projectDir, metadata);
          if (hasFfmpegAudioOutput) {
            await muxAudioIntoRecording(result.filePath, ffmpegAudioOutputPath);
          }
          // Save camera recording if present (MediaRecorder path — no FFmpeg for camera)
          if (camBuf) {
            const { saveCameraRecording } = await import('./capture-service.mjs');
            const cameraPath = await saveCameraRecording(camBuf, result.filePath);
            result.cameraFilePath = cameraPath;
          }
          resetCaptureRefs();
        } else {
          console.info('[session-manager] Using MediaRecorder buffer (FFmpeg not available)');
          // Save screen recording (pass null for camera — we handle camera separately as MP4)
          result = await saveRecording(Buffer.from(buffer), projectDir, metadata, null);
          if (hasFfmpegAudioOutput) {
            await muxAudioIntoRecording(result.filePath, ffmpegAudioOutputPath);
          }
          const fallbackProbe = (() => {
            try {
              return probeRecordingFile(result.filePath);
            } catch {
              return null;
            }
          })();
          const fallbackLooksWrong =
            !!fallbackProbe &&
            (fallbackProbe.fps > 120 ||
              ((pendingAudioConfig.sysAudioEnabled || pendingAudioConfig.micEnabled) &&
                !fallbackProbe.hasAudio));
          if (fallbackLooksWrong && (await waitForCaptureFile(ffmpegOutputPath, 8000))) {
            console.warn(
              '[session-manager] MediaRecorder artifact looks wrong; switching to FFmpeg output',
              {
                fallbackPath: result.filePath,
                ffmpegOutputPath,
                fallbackProbe,
              },
            );
            result = await saveRecordingFromFile(ffmpegOutputPath, projectDir, metadata);
            if (hasFfmpegAudioOutput) {
              await muxAudioIntoRecording(result.filePath, ffmpegAudioOutputPath);
            }
          }
          // Save camera as MP4 separately (WebCodecs H.264 output, not WebM)
          if (camBuf) {
            const { saveCameraRecording } = await import('./capture-service.mjs');
            const cameraPath = await saveCameraRecording(camBuf, result.filePath);
            result.cameraFilePath = cameraPath;
          }
          resetCaptureRefs();
        }

        return await finalizeSavedSession(result, metadata);
      } catch (err) {
        console.error('[session-manager] PANEL_SAVE_RECORDING failed:', err);
        rejectStopCompletion(err);
        throw err;
      }
    },
  );

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

  // ---- Debug: test-only IPC for auto-zoom generation ----
  // Used by Playwright tests to trigger auto-zoom outside of a real recording session.
  ipcMain.handle(IPC_CHANNELS.DEBUG_APPLY_AUTO_ZOOM, async (_e, { filePath, cursorEventsPath, fps, width, height }) => {
    const fakeResult = { filePath, cursorEventsPath, fps: fps ?? 30, width: width ?? 1920, height: height ?? 1080 };
    await applyAutoZoomFromClicks(fakeResult);
    return loadZoomSidecarForDecorate(filePath);
  });

  // ---- Safety net ----

  app.on('before-quit', handleBeforeQuit);

  // Final safety net for tray + Stop pill cleanup. will-quit fires after
  // before-quit and after all windows are closed — last chance before the
  // process exits.
  app.on('will-quit', () => {
    forceDestroyTrayOnQuit();
    destroyStopPillWindow();
  });
}

export function getLastFinalizedRecordingResult() {
  return lastFinalizedRecordingResult ? structuredClone(lastFinalizedRecordingResult) : null;
}
