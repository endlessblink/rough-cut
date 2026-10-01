import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, protocol, screen, session, shell, Tray } from 'electron';
import { buildRegionSelectorHtml, parseRegionSelectorTitle, regionFromOverlayRect } from './region-selector.mjs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { isImportableMimeType, mimeForExtension } from '../shared/import-mime.mjs';
import { exportProjectToMp4 } from './export-service.mjs';
import { verifyExportedFile } from './export-verify.mjs';
import { createAppSettingsStore, defaultAppSettingsPath } from './app-settings-store.mjs';
import { pickDirectory, pickSavePath } from './file-picker.mjs';
import { projectFolderName } from './project-folders.mjs';
import { listGraphics } from '../shared/motion-graphics.mjs';
import { trackCensorRegion } from './censor-tracking.mjs';
import { assertReadableMp4, computeSyncedRecordingTiming, probeImportedMedia, probeVideoStreamsTiming, probeVideoTiming } from './media-probe.mjs';
import { duplicateProjectFile, getLinkedCameraAsset, getPrimaryRecording, openProjectFile, renameProjectFile, saveBlankProject, saveProjectFile, saveProjectForImport, saveProjectForRecording, validateProjectPath } from './project-files.mjs';
import { stopRecordingAndCreateProject } from './recording-stop-handler.mjs';
import { dismissRecovery, getRecoveryState, recoverFromMarker } from './recording-recovery.mjs';
import { deleteProjectFiles, listProjectSummaries } from './project-gallery.mjs';
import { registerMediaProtocol, toMediaUrl } from './media-protocol.mjs';
import { ensureClipVisual } from './clip-visuals.mjs';
import {
  inspectVisualDiscontinuity,
  resolveReferencedVisualSource,
} from './visual-discontinuity-service.mjs';
import { remuxMkvSegmentsToMp4, remuxMkvToMp4 } from './remux-service.mjs';
import { createRecordingSession, getPrimaryX11DisplayInfo } from './recording/recording-session.mjs';
import { startFfmpegAudioLevelProbe, startFfmpegCameraPreview } from './recording/ffmpeg-capture.mjs';
import { listPulseAudioMicSources, listPulseAudioSystemAudioSources } from './recording/audio-sources.mjs';
import { listV4l2CameraSources } from './recording/camera-sources.mjs';
import { getRecordingPreflightStatus } from './recording/preflight.mjs';
import { isXdotoolAvailable, readCursorViaXdotool } from './recording/xdotool-cursor.mjs';
import { installRuntimeLog } from './runtime-log.mjs';
import { createUserTemplatesStore, defaultUserTemplatesPath } from './user-templates-store.mjs';
import { createRecordingTemplateOverridesStore, defaultRecordingTemplateOverridesPath } from './recording-template-overrides-store.mjs';
import { createAiAssetsStore, defaultAiAssetsRoot } from './ai-assets-store.mjs';
import { registerAiAssetIpcHandlers } from './ai-assets-ipc.mjs';
import { createStabilizationService } from './stabilization-service.mjs';
import { createRecordingTranscriptionBridge } from './transcription-recording-bridge.mjs';
import { generateGraphic } from './claude-graphics-service.mjs';
import { typicalClaudeAnswerMs } from './claude-cli.mjs';
import { detectSilences, silencesToCutRanges } from './silence-detect.mjs';

/** Silent stretches of the open recording as cut ranges (frames); [] if none or unreadable. */
async function measureSilenceCuts({ project, recordingDurationFrames, fps }) {
  try {
    const document = project?.document ?? project;
    const recording = document?.assets?.find?.((asset) => asset?.type === 'recording');
    if (!recording) return [];
    const stored = recording.metadata?.absoluteFilePath || recording.filePath;
    const filePath = stored && isAbsolute(stored) ? stored : (stored && project?.path ? join(dirname(project.path), stored) : null);
    const rate = Number(fps) > 0 ? Number(fps) : 30;
    const result = await detectSilences({ filePath, durationSec: recordingDurationFrames / rate });
    if (!result.ok) {
      console.info(`[ai] silence scan skipped: ${result.reason}`);
      return [];
    }
    const existingCuts = (recording.presentation?.cutRanges ?? document?.cutRanges ?? []).filter((cut) => Number.isFinite(cut?.startFrame));
    const cuts = silencesToCutRanges(result.silences, { fps: rate, durationFrames: recordingDurationFrames, existingCuts });
    console.info(`[ai] silence scan: ${result.silences.length} silent stretches, ${cuts.length} cut suggestions`);
    return cuts;
  } catch (error) {
    console.info(`[ai] silence scan failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
import { createGraphicsStyleStore, defaultGraphicsStylePath } from './graphics-style-store.mjs';
import { persistTranscriptToProject } from './transcription-project-persistence.mjs';
import { createTranscriptionRuntime } from './transcription-runtime.mjs';
import {
  createRecordingTranscriptPersistence,
  createRecordingTranscriptionLifecycle,
} from './transcription-main-lifecycle.mjs';
import {
  analyzeProject,
  getAiStatus,
} from './ai-service.mjs';

const ownsSingleInstance = app.requestSingleInstanceLock();
if (!ownsSingleInstance) {
  app.quit();
  process.exit(0);
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-http-cache');
  // Electron's sound otherwise reaches PulseAudio/PipeWire as "Chromium", so a
  // remembered "Chromium muted" (from any other Chromium-based app) silently
  // muted all playback here (2026-10-01). Our own name keeps our own volume.
  if (!process.env.PULSE_PROP_OVERRIDE) {
    process.env.PULSE_PROP_OVERRIDE = "application.name='Rough Cut' application.id='rough-cut' application.icon_name='rough-cut'";
  }
}

if (process.platform === 'linux' && typeof app.setDesktopName === 'function') {
  app.setDesktopName('@rough-cut/desktop');
}

// The build this process started from. A hidden window (e.g. the recorder)
// can keep an old copy alive after its editor closes; launching from the dock
// then only re-showed that old copy, so fixes "never arrived" (2026-10-01).
const startedPackageStamp = readPackageStamp();
function readPackageStamp() {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package-identity.json'), 'utf8')).packagedAt ?? null;
  } catch {
    return null;
  }
}

app.on('second-instance', (_event, argv) => {
  const installedStamp = readPackageStamp();
  const recording = (() => {
    try { return recordingSession.status()?.state !== 'idle' || Boolean(activeRecordingFinalizePromise); } catch { return true; }
  })();
  if (startedPackageStamp && installedStamp && installedStamp !== startedPackageStamp && !recording) {
    console.info(`[startup] newer build installed (${installedStamp}, running ${startedPackageStamp}) — restarting into it`);
    // Relaunch the way the dock just launched us (new build's user-data dir).
    app.relaunch({ execPath: process.execPath, args: Array.isArray(argv) ? argv.slice(1) : process.argv.slice(1) });
    app.exit(0);
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
});

const runtimeLogPath = installRuntimeLog();
const dockProvenancePath = '/tmp/rough-cut-dock-provenance.json';

function recordDockProvenance() {
  const launchSource = process.env.ROUGH_CUT_DOCK_LAUNCH === '1'
    ? 'installed-desktop-entry'
    : 'unknown';
  let packageIdentity = null;
  try {
    packageIdentity = JSON.parse(readFileSync(join(app.getAppPath(), 'package-identity.json'), 'utf8'));
  } catch {
    // Development and older packages have no identity; the visual gate rejects them.
  }
  const provenance = {
    version: 1,
    launchSource,
    pid: process.pid,
    parentPid: process.ppid,
    executable: process.execPath,
    appPath: app.getAppPath(),
    packageIdentity,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(dockProvenancePath, `${JSON.stringify(provenance)}\n`, 'utf8');
  console.info(`[startup] provenance source=${launchSource} pid=${process.pid} path=${dockProvenancePath}`);
  return provenance;
}

configurePreviewGpuCommandLine();

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
const defaultRecordingsDir = join(app.getPath('documents'), 'Rough Cut MVP', 'recordings');
const appSettingsStore = createAppSettingsStore({
  filePath: defaultAppSettingsPath(app.getPath('userData')),
  onLog: (msg) => console.warn(msg),
});
// Where projects live. Chosen in the Projects view and applied on the next start, because
// the recorder and the path checks are created once at launch.
const recordingsDir = appSettingsStore.getProjectsDir() ?? defaultRecordingsDir;
const defaultExportsDir = join(app.getPath('documents'), 'Rough Cut MVP', 'exports');
// The export folder can change at any time (Export panel > Save to), so read it when it is needed.
const currentExportsDir = () => appSettingsStore.getExportsDir() ?? defaultExportsDir;

function quitSmokeApp(exitCode = process.exitCode ?? 0) {
  app.quit();
  setTimeout(() => app.exit(exitCode), 1000);
  setTimeout(() => process.exit(exitCode), 2500);
}

function buildAllowedProjectRoots() {
  // The default folder stays allowed so projects made before a folder change still open.
  const roots = [...new Set([recordingsDir, defaultRecordingsDir])];
  // Tests / smokes write fixtures to a tmp dir and pass it via ROUGH_CUT_UI_SMOKE_PROJECT_PATH.
  // Without including its parent dir, validateProjectPath rejects the fixture as outside-root.
  const smokeProject = process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH;
  if (smokeProject) roots.push(dirname(smokeProject));
  const playbackProject = process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH;
  if (playbackProject) roots.push(dirname(playbackProject));
  return roots;
}
const markerPath = join(app.getPath('userData'), 'recording-recovery.json');
const userTemplatesStore = createUserTemplatesStore({
  filePath: defaultUserTemplatesPath(app.getPath('userData')),
  onLog: (msg) => console.warn(msg),
});
const recordingTemplateOverridesStore = createRecordingTemplateOverridesStore({
  filePath: defaultRecordingTemplateOverridesPath(app.getPath('userData')),
  onLog: (msg) => console.warn(msg),
});
const aiAssetsStore = createAiAssetsStore({
  rootDir: defaultAiAssetsRoot(app.getPath('userData')),
  onLog: (msg) => console.warn(msg),
});
const stabilizationService = createStabilizationService({
  cacheRoot: join(app.getPath('userData'), 'stabilization-cache'),
});
const recordingStopShortcut = 'CommandOrControl+Shift+R';
const recordingRestartShortcut = 'CommandOrControl+Shift+N';
let hiddenRecorderWindow = null;
let recordingTray = null;
let recordingTrayWindow = null;
let hiddenRecordingOptions = null;
let hiddenRecordingStopping = false;
let activeRecordingFinalizePromise = null;
let activeCameraPreview = null;
let activeAudioPreview = null;
let activeExportController = null;
let activeCensorTrackController = null;
const studioWindowBoundsById = new Map();
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
const recordingTranscriptionBridgePromise = createTranscriptionRuntime({
  environment: process.env,
  userDataDir: app.getPath('userData'),
  onLog: (message) => console.warn(message),
  persistTranscript: persistRecordingTranscript,
  onStateChange: (job) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PROGRESS, job);
      }
    }
  },
}).then(async (runtime) => {
  const bridge = createRecordingTranscriptionBridge({
    service: runtime.service,
    fixtureDurationMs: runtime.fixtureDurationMs,
    incrementalDuringCapture: runtime.incrementalDuringCapture,
    dispose: runtime.dispose,
    onLog: (message) => console.warn(message),
  });
  await bridge.initialize();
  return bridge;
}).catch((error) => {
  console.warn(`[transcription] runtime unavailable: ${error?.message ?? error}`);
  return null;
});
const recordingTranscriptionLifecycle = createRecordingTranscriptionLifecycle({
  getBridge: () => recordingTranscriptionBridgePromise,
});

async function listCameraSources() {
  const sources = await listV4l2CameraSources();
  const smokeCameraPath = process.env.ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH;
  if (!smokeCameraPath) return sources;
  return [
    {
      id: smokeCameraPath,
      name: smokeCameraPath,
      label: `Smoke camera (${smokeCameraPath})`,
    },
    ...sources.filter((source) => source.name !== smokeCameraPath),
  ];
}

async function listMicSources() {
  const sources = await listPulseAudioMicSources().catch(() => []);
  const smokeMicSource = process.env.ROUGH_CUT_SMOKE_MIC_SOURCE;
  if (!smokeMicSource) return sources;
  return [
    { id: smokeMicSource, name: smokeMicSource, label: 'Smoke microphone', state: 'RUNNING' },
    ...sources.filter((source) => source.name !== smokeMicSource),
  ];
}

async function listSystemAudioSources() {
  const sources = await listPulseAudioSystemAudioSources().catch(() => []);
  const smokeSystemAudioSource = process.env.ROUGH_CUT_SMOKE_SYSTEM_AUDIO_SOURCE;
  if (!smokeSystemAudioSource) return sources;
  return [
    { id: smokeSystemAudioSource, name: smokeSystemAudioSource, label: 'Smoke system audio', state: 'RUNNING', monitor: true },
    ...sources.filter((source) => source.name !== smokeSystemAudioSource),
  ];
}

function createMainWindow({ mode = 'editor', projectPath = null } = {}) {
  const isRecorder = mode === 'recorder';
  const smokeBounds = requestedSmokeWindowBounds();
  const window = new BrowserWindow({
    width: smokeBounds?.width ?? (isRecorder ? 760 : 1120),
    height: smokeBounds?.height ?? (isRecorder ? 620 : 740),
    minWidth: isRecorder ? 720 : 860,
    minHeight: isRecorder ? 560 : 560,
    resizable: !isRecorder,
    maximizable: !isRecorder,
    autoHideMenuBar: true,
    title: 'Rough Cut MVP',
    backgroundColor: '#16120f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!isRecorder && !smokeBounds) {
    // Some window managers ignore an immediate maximize while the native
    // surface is still being created. Re-assert it once the window is visible
    // so the editor cannot open as a clipped, partially hidden work surface.
    maximizeStudioWindow(window);
    window.once('ready-to-show', () => maximizeStudioWindow(window));
  }

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

  window.webContents.session.webRequest.onErrorOccurred((details) => {
    if (details.url.includes('/assets/') || details.url.includes('/editor/')) {
      console.error(`[renderer] resource request failed ${details.url}: ${details.error}`);
    }
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
        quitSmokeApp();
      }
    });
  }

  if (process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH) {
    window.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const smokeFunction = process.env.ROUGH_CUT_UI_SMOKE_LAYOUT_ONLY === '1'
          ? runRendererSidebarLayoutSmoke
          : process.env.ROUGH_CUT_UI_SMOKE_STARTUP_RECORD_BUTTON === '1'
          ? runRendererStartupRecordButtonSmoke
          : process.env.ROUGH_CUT_UI_SMOKE_RECORD_FLOW === '1'
          ? runRendererRecordingFlowSmoke
          : runRendererUiSmoke;
        const result = await window.webContents.executeJavaScript(
          `(${smokeFunction.toString()})(${JSON.stringify({
            doubleStop: process.env.ROUGH_CUT_UI_SMOKE_DOUBLE_STOP === '1',
            pauseResume: process.env.ROUGH_CUT_UI_SMOKE_PAUSE_RESUME === '1',
            restart: process.env.ROUGH_CUT_UI_SMOKE_RESTART === '1',
            cameraWarning: process.env.ROUGH_CUT_UI_SMOKE_CAMERA_WARNING === '1',
            cancelFlow: process.env.ROUGH_CUT_UI_SMOKE_CANCEL_FLOW === '1',
            invalidRegion: process.env.ROUGH_CUT_UI_SMOKE_INVALID_REGION === '1',
            audioGainOnly: process.env.ROUGH_CUT_UI_SMOKE_AUDIO_GAIN_ONLY === '1',
            startupPanelOnly: process.env.ROUGH_CUT_UI_SMOKE_STARTUP_PANEL_ONLY === '1',
            startupOpenEditor: process.env.ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_EDITOR === '1',
            startupOpenProjects: process.env.ROUGH_CUT_UI_SMOKE_STARTUP_OPEN_PROJECTS === '1',
            startupCreateBlankProject: process.env.ROUGH_CUT_UI_SMOKE_STARTUP_CREATE_BLANK_PROJECT === '1',
            sidebarExpectLoaded: Boolean(process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH),
            cleanupReview: process.env.ROUGH_CUT_UI_SMOKE_CLEANUP_REVIEW === '1',
            projectPath: process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH ?? null,
          })})`,
          true,
        );
        if (process.env.ROUGH_CUT_UI_SMOKE_RECORD_FLOW === '1' && result.savedState === 'saved') {
          await waitForRendererLoad(window.webContents, 35000);
          const editorResult = await window.webContents.executeJavaScript(`(${runRendererEditorLoadedSmoke.toString()})()`, true);
          Object.assign(result, editorResult);
        }
        if (process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH) {
          const image = await window.webContents.capturePage();
          await mkdir(dirname(process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH), { recursive: true });
          await writeFile(process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH, image.toPNG());
          result.hasVisualScreenshot = true;
        }
        const captureOpenSelectScreenshot = async (selector, path) => {
          await window.webContents.executeJavaScript(`
            (async () => {
              const selector = ${JSON.stringify(selector)};
              document.querySelector('button[aria-label="Camera"]')?.click();
              await new Promise((resolve) => setTimeout(resolve, 120));
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
              await new Promise((resolve) => setTimeout(resolve, 40));
              if (selector.includes('Camera source crop')) {
                const cropToggle = document.querySelector('[aria-label="Camera source crop"] input[type="checkbox"]');
                if (cropToggle && !cropToggle.checked) {
                  cropToggle.click();
                  await new Promise((resolve) => setTimeout(resolve, 160));
                }
              }
              document.querySelector(selector)?.click();
              await new Promise((resolve) => setTimeout(resolve, 120));
            })();
          `, true);
          const image = await window.webContents.capturePage();
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, image.toPNG());
        };
        if (process.env.ROUGH_CUT_UI_SMOKE_OPEN_SELECT_SCREENSHOT_PATH) {
          await captureOpenSelectScreenshot('[aria-label="Camera layout"] .inspectorSelectField:nth-of-type(1) .inspectorSelectButton', process.env.ROUGH_CUT_UI_SMOKE_OPEN_SELECT_SCREENSHOT_PATH);
          result.hasOpenSelectScreenshot = true;
        }
        if (process.env.ROUGH_CUT_UI_SMOKE_OPEN_SHAPE_SCREENSHOT_PATH) {
          await captureOpenSelectScreenshot('[aria-label="Camera layout"] .inspectorSelectField:nth-of-type(2) .inspectorSelectButton', process.env.ROUGH_CUT_UI_SMOKE_OPEN_SHAPE_SCREENSHOT_PATH);
          result.hasOpenShapeScreenshot = true;
        }
        if (process.env.ROUGH_CUT_UI_SMOKE_OPEN_ASPECT_SCREENSHOT_PATH) {
          await captureOpenSelectScreenshot('[aria-label="Camera source crop"] .inspectorSelectButton', process.env.ROUGH_CUT_UI_SMOKE_OPEN_ASPECT_SCREENSHOT_PATH);
          result.hasOpenAspectScreenshot = true;
        }
        if (process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_TIMELINE_PATH) {
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Zoom"]')?.click();`, true);
          await new Promise((resolve) => setTimeout(resolve, 400));
          const timelineImage = await window.webContents.capturePage();
          await mkdir(dirname(process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_TIMELINE_PATH), { recursive: true });
          await writeFile(process.env.ROUGH_CUT_UI_SMOKE_SCREENSHOT_TIMELINE_PATH, timelineImage.toPNG());
          result.hasTimelineScreenshot = true;
        }
        if (process.env.ROUGH_CUT_UI_SMOKE_SIDEBAR_SCREENSHOT_DIR && result.hasAllSidebarTabs) {
          const screenshotDir = process.env.ROUGH_CUT_UI_SMOKE_SIDEBAR_SCREENSHOT_DIR;
          const sidebarScreenshots = [];
          for (const tool of ['Background', 'Timeline', 'Cursor', 'Camera']) {
            await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="${tool}"]')?.click();`, true);
            await new Promise((resolve) => setTimeout(resolve, 400));
            const image = await window.webContents.capturePage();
            const path = join(screenshotDir, `${tool.toLowerCase()}-board.png`);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, image.toPNG());
            sidebarScreenshots.push({ tool, path });
          }
          result.sidebarScreenshots = sidebarScreenshots;
          result.hasSidebarVisualSnapshots = sidebarScreenshots.length === 4;
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
        quitSmokeApp();
      }
    });
  }

  loadRenderer(window, {
    mode,
    projectPath: projectPath || process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH || process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH || null,
  });

  return window;
}

function requestedSmokeWindowBounds() {
  const width = Number(process.env.ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH);
  const height = Number(process.env.ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT);
  if (!Number.isFinite(width) || width <= 0) return null;
  return {
    width,
    height: Number.isFinite(height) && height > 0 ? height : 740,
  };
}

function maximizeStudioWindow(window) {
  if (!window || window.isDestroyed()) return;
  window.setResizable(true);
  window.setMaximizable(true);
  window.setMinimumSize(860, 560);
  window.maximize();
  // X11 window managers can ignore a maximize sent right after a fixed-size
  // (recorder) window becomes resizable. The editor then stayed recorder-sized
  // and was placed half below the screen, so it looked like it never opened
  // (2026-09-27). Fall back to filling the display the window is on.
  setTimeout(() => {
    if (window.isDestroyed() || window.isMaximized() || window.isFullScreen()) return;
    window.setBounds(screen.getDisplayMatching(window.getBounds()).workArea);
    window.maximize();
  }, 300);
}

// Keep a fixed-size window fully inside the visible area of its display.
function keepWindowOnScreen(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height);
  if (x !== bounds.x || y !== bounds.y || width !== bounds.width || height !== bounds.height) {
    window.setBounds({ x, y, width, height });
  }
}

function listCaptureDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    label: display.label || `Display ${display.id}`,
    primary: display.id === primaryId,
    scaleFactor: display.scaleFactor,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
  }));
}

function waitForRendererLoad(webContents, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for renderer reload'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      webContents.off('did-finish-load', onLoad);
      webContents.off('did-fail-load', onFail);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onFail = (_event, errorCode, errorDescription) => {
      cleanup();
      reject(new Error(`Renderer failed to load: ${errorCode} ${errorDescription}`));
    };
    webContents.once('did-finish-load', onLoad);
    webContents.once('did-fail-load', onFail);
  });
}

// Recording edit is the landing surface whenever a project is open; the
// ROUGH_CUT_STARTUP_VIEW override can pick another view. Recorder windows keep
// the capture surface.
function rendererInitialView({ mode, projectPath = null }) {
  const forcedView = process.env.ROUGH_CUT_STARTUP_VIEW?.trim();
  if (forcedView === 'recording' || forcedView === 'projects' || forcedView === 'editor' || forcedView === 'ai') {
    return forcedView;
  }
  if (mode === 'recorder') return null;
  if (projectPath) return 'editor';
  return 'projects';
}

function webglScreenLayerEnabled() {
  return process.env.ROUGH_CUT_WEBGL_SCREEN_LAYER === '1' || process.env.VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER === '1';
}

function webgpuScreenLayerEnabled() {
  return process.env.ROUGH_CUT_WEBGPU_SCREEN_LAYER === '1' || process.env.VITE_ROUGH_CUT_WEBGPU_SCREEN_LAYER === '1';
}

function screenLayerRendererSelection() {
  const value = process.env.ROUGH_CUT_SCREEN_LAYER_RENDERER || process.env.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER || '';
  const normalized = value.trim().toLowerCase();
  if (['auto', 'webgpu', 'webgl', 'canvas2d'].includes(normalized)) return normalized;
  return '';
}

function webgpuPreviewDefaultDisabled() {
  return process.env.ROUGH_CUT_DISABLE_WEBGPU_DEFAULT === '1' || process.env.VITE_ROUGH_CUT_DISABLE_WEBGPU_DEFAULT === '1';
}

function previewGpuCommandLineFlagsEnabled() {
  const renderer = screenLayerRendererSelection();
  return (
    webgpuScreenLayerEnabled() ||
    renderer === 'auto' ||
    renderer === 'webgpu' ||
    webgpuPreviewDefaultEnabled() ||
    process.env.ROUGH_CUT_WEBGPU_PREVIEW_FLAGS === '1' ||
    process.env.VITE_ROUGH_CUT_WEBGPU_PREVIEW_FLAGS === '1'
  );
}

function webgpuPreviewDefaultEnabled() {
  return (
    !webgpuPreviewDefaultDisabled() &&
    !screenLayerRendererSelection() &&
    !webglScreenLayerEnabled() &&
    !webgpuScreenLayerEnabled()
  );
}

function configurePreviewGpuCommandLine() {
  if (!previewGpuCommandLineFlagsEnabled()) return;
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch(
    'enable-features',
    'Vulkan,AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL,VaapiVideoDecoder,VaapiIgnoreDriverChecks',
  );
}

function webglMotionBlurEnabled() {
  return process.env.ROUGH_CUT_WEBGL_MOTION_BLUR === '1' || process.env.VITE_ROUGH_CUT_WEBGL_MOTION_BLUR === '1';
}

function experimentalHeadlessExportUiEnabled() {
  return process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1' || process.env.VITE_ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI === '1';
}

function applyRendererFeatureFlags(params) {
  const renderer = screenLayerRendererSelection();
  if (renderer) params.set('screenLayerRenderer', renderer);
  if (webgpuPreviewDefaultEnabled()) params.set('screenLayerRenderer', 'auto');
  if (webglScreenLayerEnabled()) params.set('screenLayerRenderer', 'webgl');
  if (webgpuScreenLayerEnabled()) params.set('screenLayerRenderer', 'webgpu');
  if (webglMotionBlurEnabled()) params.set('webglMotionBlur', '1');
  if (experimentalHeadlessExportUiEnabled()) params.set('experimentalHeadlessExportUi', '1');
}

function rendererSearch({ mode = 'editor', projectPath = null } = {}) {
  const params = new URLSearchParams();
  if (projectPath) params.set('projectPath', projectPath);
  if (mode === 'recorder') params.set('mode', 'recorder');
  const initialView = rendererInitialView({ mode, projectPath });
  if (initialView) params.set('view', initialView);
  applyRendererFeatureFlags(params);
  const value = params.toString();
  return value ? `?${value}` : undefined;
}

// The recording setup window stays above other windows, including a
// full-screen app on another monitor, which KWin otherwise keeps on top of it
// when the window is dragged there (2026-09-27). The editor stacks normally.
function setRecorderStacking(window, recorder) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(Boolean(recorder), recorder ? 'floating' : 'normal');
}

function loadRenderer(window, { mode = 'editor', projectPath = null } = {}) {
  setRecorderStacking(window, mode === 'recorder');
  const search = rendererSearch({ mode, projectPath });
  const shouldLoadBuiltRenderer = process.env.ROUGH_CUT_LOAD_BUILT_RENDERER === '1' || process.env.ROUGH_CUT_UI_SMOKE_RESULT_PATH;
  const initialView = rendererInitialView({ mode, projectPath });

  if (app.isPackaged || process.env.ROUGH_CUT_DOCK_LAUNCH === '1') {
    window.webContents.once('did-finish-load', () => {
      if (!window.isDestroyed()) window.webContents.reloadIgnoringCache();
    });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    if (projectPath) url.searchParams.set('projectPath', projectPath);
    if (mode === 'recorder') url.searchParams.set('mode', 'recorder');
    if (initialView) url.searchParams.set('view', initialView);
    applyRendererFeatureFlags(url.searchParams);
    window.loadURL(url.toString());
  } else if (!app.isPackaged) {
    if (shouldLoadBuiltRenderer) {
      window.loadFile(join(__dirname, '../../dist/renderer/index.html'), search ? { search } : undefined);
    } else {
      const url = new URL('http://127.0.0.1:7545');
      if (projectPath) url.searchParams.set('projectPath', projectPath);
      if (mode === 'recorder') url.searchParams.set('mode', 'recorder');
      if (initialView) url.searchParams.set('view', initialView);
      applyRendererFeatureFlags(url.searchParams);
      window.loadURL(url.toString());
    }
  } else {
    window.loadFile(join(__dirname, '../../dist/renderer/index.html'), search ? { search } : undefined);
  }
}

async function stopActiveCameraPreview(token = null) {
  const preview = activeCameraPreview;
  if (!preview || (token && preview.token !== token)) return;
  activeCameraPreview = null;
  try {
    await Promise.race([
      preview.handle.stop(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (err) {
    console.warn('[camera-preview] stop failed:', err?.message ?? err);
  }
}

async function stopActiveAudioPreview(token = null) {
  const preview = activeAudioPreview;
  if (!preview || (token && preview.token !== token)) return;
  activeAudioPreview = null;
  try {
    await Promise.race([
      preview.handle.stop(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (err) {
    console.warn('[audio-preview] stop failed:', err?.message ?? err);
  }
}

ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
ipcMain.handle(IPC_CHANNELS.APP_GET_RUNTIME_LOG_PATH, () => runtimeLogPath);
let playbackDebugReportWrite = Promise.resolve();
ipcMain.handle(IPC_CHANNELS.APP_WRITE_PLAYBACK_DEBUG_REPORT, (_event, report = {}) => {
  const reportPath = process.env.ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH;
  if (!reportPath) return { ok: false, skipped: true, reason: 'ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH not set' };
  const write = playbackDebugReportWrite.then(async () => {
    const payload = {
      writtenAt: new Date().toISOString(),
      reportPath,
      ...report,
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return { ok: true, path: reportPath };
  });
  playbackDebugReportWrite = write.catch(() => undefined);
  return write;
});
ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, (_event, itemPath) => {
  if (typeof itemPath === 'string' && itemPath.length > 0) shell.showItemInFolder(itemPath);
});
ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, (_event, itemPath) => {
  if (typeof itemPath !== 'string' || itemPath.length === 0) return 'Missing path.';
  return shell.openPath(itemPath);
});
function describeProjectsDir() {
  const saved = appSettingsStore.getProjectsDir();
  return { current: recordingsDir, saved: saved ?? defaultRecordingsDir, isDefault: saved === null, defaultDir: defaultRecordingsDir, restartRequired: (saved ?? defaultRecordingsDir) !== recordingsDir };
}
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_PROJECTS_DIR, () => describeProjectsDir());
ipcMain.handle(IPC_CHANNELS.SETTINGS_CHOOSE_PROJECTS_DIR, async (event) => {
  const chosen = await pickDirectory({
    title: 'Choose where projects live',
    defaultPath: recordingsDir,
    electronDialog: dialog,
    parentWindow: BrowserWindow.fromWebContents(event.sender) ?? undefined,
  });
  if (!chosen) return describeProjectsDir();
  await mkdir(chosen, { recursive: true });
  appSettingsStore.setProjectsDir(chosen);
  return describeProjectsDir();
});
function describeExportsDir() {
  const saved = appSettingsStore.getExportsDir();
  return { current: saved ?? defaultExportsDir, isDefault: saved === null, defaultDir: defaultExportsDir };
}
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_EXPORTS_DIR, async () => {
  await mkdir(currentExportsDir(), { recursive: true }).catch(() => undefined); // so "Open folder" always has somewhere to open
  return describeExportsDir();
});
ipcMain.handle(IPC_CHANNELS.SETTINGS_CHOOSE_EXPORTS_DIR, async (event) => {
  await mkdir(currentExportsDir(), { recursive: true });
  const chosen = await pickDirectory({
    title: 'Choose where exports are saved',
    defaultPath: currentExportsDir(),
    electronDialog: dialog,
    parentWindow: BrowserWindow.fromWebContents(event.sender) ?? undefined,
  });
  if (!chosen) return describeExportsDir();
  await mkdir(chosen, { recursive: true });
  appSettingsStore.setExportsDir(chosen);
  return describeExportsDir();
});
ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET_EXPORTS_DIR, () => {
  appSettingsStore.resetExportsDir();
  return describeExportsDir();
});
ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET_PROJECTS_DIR, () => {
  appSettingsStore.resetProjectsDir();
  return describeProjectsDir();
});
ipcMain.handle(IPC_CHANNELS.APP_RELAUNCH, () => {
  app.relaunch();
  app.exit(0);
});
ipcMain.handle(IPC_CHANNELS.APP_OPEN_EDITOR, (event, projectPath = null) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) return;
  studioWindowBoundsById.delete(senderWindow.id);
  const smokeBounds = requestedSmokeWindowBounds();
  if (smokeBounds) {
    senderWindow.setResizable(true);
    senderWindow.setMaximizable(true);
    senderWindow.setMinimumSize(860, 560);
    senderWindow.setSize(smokeBounds.width, smokeBounds.height);
    senderWindow.center();
  } else {
    maximizeStudioWindow(senderWindow);
  }
  senderWindow.show();
  loadRenderer(senderWindow, { mode: 'editor', projectPath });
});
ipcMain.handle(IPC_CHANNELS.APP_SET_WINDOW_PROFILE, (event, profile = 'studio') => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) return { ok: false, reason: 'missing-window' };
  if (senderWindow.isDestroyed()) return { ok: false, reason: 'destroyed-window' };
  if (senderWindow.isFullScreen()) return { ok: false, reason: 'fullscreen' };

  setRecorderStacking(senderWindow, profile === 'recording');
  if (profile === 'recording') {
    if (!studioWindowBoundsById.has(senderWindow.id)) {
      studioWindowBoundsById.set(senderWindow.id, senderWindow.getBounds());
    }
    if (senderWindow.isMaximized()) senderWindow.unmaximize();
    senderWindow.setResizable(true);
    senderWindow.setMaximizable(true);
    senderWindow.setMinimumSize(720, 560);
    senderWindow.setSize(760, 620);
    senderWindow.center();
    keepWindowOnScreen(senderWindow);
    setTimeout(() => keepWindowOnScreen(senderWindow), 300);
    return { ok: true, profile, bounds: senderWindow.getBounds() };
  }

  if (profile === 'studio') {
    const smokeBounds = requestedSmokeWindowBounds();
    studioWindowBoundsById.delete(senderWindow.id);
    if (smokeBounds) {
      if (senderWindow.isMaximized()) senderWindow.unmaximize();
      senderWindow.setResizable(true);
      senderWindow.setMaximizable(true);
      senderWindow.setMinimumSize(860, 560);
      senderWindow.setSize(smokeBounds.width, smokeBounds.height);
      senderWindow.center();
    } else {
      maximizeStudioWindow(senderWindow);
    }
    return { ok: true, profile, bounds: senderWindow.getBounds() };
  }

  return { ok: false, reason: 'unknown-profile', profile };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_MIC_SOURCES, async () => listMicSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES, async () => listSystemAudioSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_CAMERA_SOURCES, async () => listCameraSources());
ipcMain.handle(IPC_CHANNELS.RECORDING_CAMERA_PREVIEW_START, async (event, options = {}) => {
  const devicePath = typeof options.devicePath === 'string' ? options.devicePath.trim() : '';
  if (!devicePath) throw new Error('Camera device path is required.');
  await stopActiveCameraPreview();
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sender = event.sender;
  const handle = startFfmpegCameraPreview({
    devicePath,
    onFrame: (frame) => {
      if (activeCameraPreview?.token !== token || sender.isDestroyed()) return;
      sender.send(IPC_CHANNELS.RECORDING_CAMERA_PREVIEW_FRAME, {
        token,
        dataUrl: `data:image/jpeg;base64,${frame.toString('base64')}`,
      });
    },
  });
  activeCameraPreview = { token, sender, handle };
  sender.once('destroyed', () => {
    if (activeCameraPreview?.token === token) void stopActiveCameraPreview(token);
  });
  return { token, pid: handle.getPid?.() ?? null };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_CAMERA_PREVIEW_STOP, async (_event, token = null) => {
  await stopActiveCameraPreview(token);
  return { stopped: true };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_AUDIO_PREVIEW_START, async (event, options = {}) => {
  const micSource = typeof options.micSource === 'string' ? options.micSource.trim() : '';
  if (!micSource) throw new Error('Select a microphone before showing input activity.');
  await stopActiveAudioPreview();
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const handle = startFfmpegAudioLevelProbe({
    micSource,
    micGainPercent: options.micGainPercent,
    onLevel: (level) => {
      if (activeAudioPreview?.token !== token || event.sender.isDestroyed()) return;
      event.sender.send(IPC_CHANNELS.RECORDING_AUDIO_PREVIEW_LEVEL, {
        token,
        ...level,
      });
    },
  });
  if (!handle) throw new Error('No microphone source is available for input activity.');
  activeAudioPreview = { token, sender: event.sender, handle };
  event.sender.once('destroyed', () => {
    if (activeAudioPreview?.token === token) void stopActiveAudioPreview(token);
  });
  return { token, pid: handle.getPid?.() ?? null };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_AUDIO_PREVIEW_STOP, async (_event, token = null) => {
  await stopActiveAudioPreview(token);
  return { stopped: true };
});
// Draw a capture region on one screen. The renderer has called this since the
// region picker landed (2026-05-09), but the handler was never registered, so
// choosing Region always failed (found 2026-09-27).
ipcMain.handle(IPC_CHANNELS.RECORDING_SELECT_CAPTURE_REGION, async (event, options = {}) => {
  const displays = screen.getAllDisplays();
  const display = displays.find((candidate) => String(candidate.id) === String(options?.displayId ?? '')) ?? screen.getPrimaryDisplay();
  const scale = display.scaleFactor > 0 ? display.scaleFactor : 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(display.bounds.width * scale), height: Math.round(display.bounds.height * scale) },
  }).catch(() => []);
  const snapshot = sources.find((source) => String(source.display_id) === String(display.id))?.thumbnail;
  const initial = options?.initialRegion;
  const initialRect = initial && String(initial.displayId ?? '') === String(display.id) && Number.isFinite(initial.x) && Number.isFinite(initial.y)
    ? { x: initial.x / scale, y: initial.y / scale, width: initial.width / scale, height: initial.height / scale }
    : null;
  const parent = BrowserWindow.fromWebContents(event.sender);
  const overlay = new BrowserWindow({
    ...display.bounds,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#050508',
    title: 'Select region',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  const html = buildRegionSelectorHtml({ snapshotDataUrl: snapshot && !snapshot.isEmpty() ? snapshot.toDataURL() : '', initialRect });
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (!overlay.isDestroyed()) overlay.destroy();
      if (parent && !parent.isDestroyed()) parent.focus();
      resolve(result);
    };
    overlay.webContents.on('page-title-updated', (_titleEvent, title) => {
      const result = parseRegionSelectorTitle(title);
      if (!result) return;
      settle(result.cancelled ? null : regionFromOverlayRect(result.rect, display));
    });
    overlay.on('closed', () => settle(null));
    void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
      overlay.setBounds(display.bounds);
      overlay.show();
      overlay.focus();
    });
  });
});

ipcMain.handle(IPC_CHANNELS.RECORDING_GET_DISPLAYS, async () => {
  // Each screen carries the desktop-capture source id the recorder uses for its
  // live preview card, so the user sees exactly which screen will be recorded.
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []);
  return listCaptureDisplays().map((display) => ({
    ...display,
    previewSourceId: sources.find((source) => String(source.display_id) === display.id)?.id ?? null,
  }));
});
ipcMain.handle(IPC_CHANNELS.RECORDING_GET_PREFLIGHT_STATUS, async (_event, options = {}) => {
  const [micSources, systemAudioSources, cameraSources] = await Promise.all([
    listMicSources().catch(() => []),
    listSystemAudioSources().catch(() => []),
    listCameraSources().catch(() => []),
  ]);
  return getRecordingPreflightStatus({
    recordingsDir,
    displayInfo: getPrimaryX11DisplayInfo(screen),
    micSources,
    systemAudioSources,
    cameraSources,
    options,
  });
});
ipcMain.handle(IPC_CHANNELS.RECORDING_START, async (event, options = {}) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const { hideWindowDuringRecording, ...recordingOptions } = options ?? {};
  await stopActiveAudioPreview();
  await stopActiveCameraPreview();
  if (hideWindowDuringRecording && senderWindow) {
    hiddenRecorderWindow = senderWindow;
    hiddenRecordingOptions = recordingOptions;
    senderWindow.hide();
    registerHiddenRecordingStopShortcut(senderWindow);
    // X11 desktop capture records the composited desktop. Give the window
    // manager a short repaint window after unmapping the recorder surface.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const status = await recordingSession.start(recordingOptions);
  await recordingTranscriptionLifecycle.recordingStarted(status);
  if (hideWindowDuringRecording && senderWindow) showRecordingTray(senderWindow);
  return status;
});
ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, async () => {
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(null, 'finalizing');
  try {
    const result = await finalizeActiveRecording();
    updateRecordingTray(null, 'saved');
    return result;
  } catch (err) {
    console.error('[recording:stop] failed', err);
    throw err;
  }
});
ipcMain.handle(IPC_CHANNELS.RECORDING_PAUSE, async () => {
  const status = await recordingSession.pause();
  updateRecordingTray(null, status.state === 'recording' && status.paused ? 'paused' : 'recording');
  return status;
});
ipcMain.handle(IPC_CHANNELS.RECORDING_RESUME, async () => {
  const status = await recordingSession.resume();
  updateRecordingTray(null, 'recording');
  return status;
});
ipcMain.handle(IPC_CHANNELS.RECORDING_RESTART, async (_event, options = null) => {
  updateRecordingTray(null, 'restarting');
  await stopActiveAudioPreview();
  const status = await recordingSession.restart(options);
  await (await recordingTranscriptionBridgePromise)?.recordingRestarted(status);
  updateRecordingTray(null, 'recording');
  return status;
});
ipcMain.handle(IPC_CHANNELS.RECORDING_CANCEL, async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const shouldShowRecorderAfterCancel = Boolean(senderWindow && hiddenRecorderWindow === senderWindow);
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(null, 'canceling');
  try {
    console.info('[recording:cancel] requested');
    const result = await recordingSession.cancel();
    await (await recordingTranscriptionBridgePromise)?.recordingCancelled();
    console.info(`[recording:cancel] completed ${JSON.stringify(result)}`);
    if (shouldShowRecorderAfterCancel && senderWindow && !senderWindow.isDestroyed()) senderWindow.show();
    updateRecordingTray(null, 'discarded');
    return result;
  } catch (err) {
    console.error('[recording:cancel] failed', err);
    throw err;
  }
});
ipcMain.handle(IPC_CHANNELS.RECORDING_STATUS, () => {
  const status = recordingSession.status();
  void recordingTranscriptionLifecycle.recordingProgress(status);
  return status;
});
ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async () => {
  await mkdir(recordingsDir, { recursive: true });
  const result = await dialog.showOpenDialog({
    title: 'Open Rough Cut project',
    defaultPath: recordingsDir,
    properties: ['openFile'],
    filters: [{ name: 'Rough Cut Project', extensions: ['roughcut'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  // The user explicitly picked this path via the OS dialog, so we trust it.
  // Keep the extension + null-byte checks but skip the allowlist.
  const safePath = validateProjectPath(result.filePaths[0]);
  return formatProject(await openProjectFile(safePath));
});
// P-AI-C/TASK-167 — Library "Import file" picker. Filters the dialog to the
// supported types so the common case never sees a rejection. Returns
// {filePath, mimeType} on success, null if the user cancelled, or
// {filePath, mimeType: null} if the user switched to "All files" and picked
// something unsupported (renderer surfaces the rejection toast).
ipcMain.handle(IPC_CHANNELS.LIBRARY_PICK_IMPORT_FILE, async () => {
  await mkdir(recordingsDir, { recursive: true });
  const result = await dialog.showOpenDialog({
    title: 'Import file',
    defaultPath: recordingsDir,
    properties: ['openFile'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mov', 'mp3', 'wav', 'png', 'jpg', 'jpeg'] },
      { name: 'Video', extensions: ['mp4', 'mov'] },
      { name: 'Audio', extensions: ['mp3', 'wav'] },
      { name: 'Image', extensions: ['png', 'jpg', 'jpeg'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const mimeType = mimeForExtension(filePath);
  return { filePath, mimeType };
});
// P-AI-C/TASK-168 — probe the imported file in place and write a sibling
// .roughcut. The file itself is never copied or moved.
ipcMain.handle(IPC_CHANNELS.LIBRARY_CREATE_FROM_IMPORT, async (_event, payload) => {
  const importedFilePath = payload?.importedFilePath;
  const importedMimeType = payload?.importedMimeType;
  if (typeof importedFilePath !== 'string' || importedFilePath.length === 0) {
    throw new Error('importedFilePath is required');
  }
  const mime = typeof importedMimeType === 'string' && importedMimeType.length > 0
    ? importedMimeType
    : mimeForExtension(importedFilePath);
  if (!isImportableMimeType(mime ?? '')) {
    throw new Error('Unsupported file type for import');
  }
  const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image';
  const probe = await probeImportedMedia(importedFilePath, { kind });
  await mkdir(recordingsDir, { recursive: true });
  const saved = await saveProjectForImport({
    importedFilePath,
    mimeType: mime,
    probe,
    recordingsDir,
  });
  return formatProject(saved);
});
// P-AI-C/TASK-169 — create a blank .roughcut. Returns the new project state
// so the renderer can immediately open it.
ipcMain.handle(IPC_CHANNELS.LIBRARY_CREATE_BLANK_PROJECT, async (_event, payload) => {
  const name = typeof payload?.name === 'string' && payload.name.trim().length > 0
    ? payload.name.trim()
    : 'Untitled';
  const aspectRatio = typeof payload?.aspectRatio === 'string' ? payload.aspectRatio : undefined;
  await mkdir(recordingsDir, { recursive: true });
  const saved = await saveBlankProject({ recordingsDir, name, aspectRatio });
  return formatProject(saved);
});
ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, async (_event, projectPath) => {
  const safePath = validateProjectPath(projectPath, { allowedRoots: buildAllowedProjectRoots() });
  try {
    const opened = await openProjectFile(safePath);
    return formatProject(opened);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.warn('[project:open-path] missing project file', safePath);
      return null;
    }
    throw err;
  }
});
// Serialize concurrent saves per project path. The renderer can fire two
// project:save calls in quick succession (e.g. autosave + manual save). The
// atomic write in saveProjectFile uses a fixed `.tmp` suffix per path; two
// parallel saves both `open(...,'w')` the same tmp file and write into the
// same inode at offset 0, producing interleaved bytes and a corrupt JSON
// after rename. Queueing per path makes saves strictly sequential, which is
// what saveProjectFile already assumes.
const projectSaveQueues = new Map();
ipcMain.handle(IPC_CHANNELS.PROJECT_SAVE, async (_event, { path, document }) => {
  const safePath = validateProjectPath(path, { allowedRoots: buildAllowedProjectRoots() });
  const prev = projectSaveQueues.get(safePath) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => saveProjectFile(safePath, document).then(formatProject));
  projectSaveQueues.set(safePath, next);
  try {
    return await next;
  } finally {
    if (projectSaveQueues.get(safePath) === next) projectSaveQueues.delete(safePath);
  }
});
ipcMain.handle(IPC_CHANNELS.TRANSCRIPTION_TRANSCRIBE_PROJECT, async (_event, payload = {}) => {
  const bridge = await recordingTranscriptionBridgePromise;
  if (!bridge) return { state: 'unavailable', job: null };
  return await bridge.transcribeExisting(payload);
});
ipcMain.handle(IPC_CHANNELS.RECENT_PROJECTS_GET, async () => {
  await mkdir(recordingsDir, { recursive: true });
  return listProjectSummaries({
    dir: recordingsDir,
    onError: (path, err) => console.warn('[recent-projects] skipping unreadable project', path, err?.message ?? err),
  });
});
// Enqueue an operation onto the per-path projectSaveQueues so any in-flight
// save completes before mutate runs and so back-to-back mutations on the same
// project serialize cleanly. Callers must handle their own errors — this
// wrapper only manages ordering.
function enqueueProjectOp(safePath, op) {
  const prev = projectSaveQueues.get(safePath) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(() => op());
  projectSaveQueues.set(safePath, next);
  next.finally(() => {
    if (projectSaveQueues.get(safePath) === next) projectSaveQueues.delete(safePath);
  });
  return next;
}

const persistRecordingTranscriptThroughProjectQueue =
  createRecordingTranscriptPersistence({
    validateProjectPath,
    getAllowedRoots: buildAllowedProjectRoots,
    enqueueProjectOp,
    persistTranscript: persistTranscriptToProject,
  });

function persistRecordingTranscript(input) {
  return persistRecordingTranscriptThroughProjectQueue(input);
}

class OpenProjectLockedError extends Error {
  constructor(targetPath) {
    super('Cannot rename or delete the currently-open project. Close it first.');
    this.name = 'OpenProjectLockedError';
    this.code = 'OPEN_PROJECT_LOCKED';
    this.path = targetPath;
  }
}

// Bulk delete. Sequential to keep error reporting tractable — a Promise.all
// failure on item 3 of 5 would leave 4-5 in an indeterminate state.
ipcMain.handle(IPC_CHANNELS.RECENT_PROJECTS_REMOVE, async (_event, payload) => {
  const list = Array.isArray(payload?.paths)
    ? payload.paths
    : Array.isArray(payload)
      ? payload
      : typeof payload === 'string' ? [payload] : typeof payload?.path === 'string' ? [payload.path] : [];
  const openProjectPath = typeof payload?.openProjectPath === 'string' ? payload.openProjectPath : null;
  const deleted = [];
  const failed = [];

  for (const candidate of list) {
    try {
      const safePath = validateProjectPath(candidate, { allowedRoots: buildAllowedProjectRoots() });
      if (openProjectPath && safePath === openProjectPath) {
        throw new OpenProjectLockedError(safePath);
      }
      await enqueueProjectOp(safePath, () => deleteProjectFiles(safePath, {
        onError: (path, err) => console.warn('[delete] sibling cleanup failed', path, err?.message ?? err),
      }));
      deleted.push(safePath);
    } catch (err) {
      failed.push({
        path: typeof candidate === 'string' ? candidate : String(candidate),
        error: err?.message ?? String(err),
        code: err?.code ?? null,
      });
    }
  }

  return { deleted, failed };
});

ipcMain.handle(IPC_CHANNELS.PROJECT_DUPLICATE, async (_event, payload) => {
  const fromPath = typeof payload?.path === 'string' ? payload.path : null;
  if (!fromPath) throw new Error('duplicate: path is required');
  const safePath = validateProjectPath(fromPath, { allowedRoots: buildAllowedProjectRoots() });
  // Duplicate doesn't mutate the source, so the open-project lock doesn't
  // apply. We still serialize through the source's projectSaveQueues so an
  // autosave on the source can't race the read.
  const result = await enqueueProjectOp(safePath, () => duplicateProjectFile({ fromPath: safePath }));
  return formatProject(result);
});

ipcMain.handle(IPC_CHANNELS.PROJECT_RENAME, async (_event, payload) => {
  const fromPath = typeof payload?.path === 'string' ? payload.path : null;
  const toName = typeof payload?.name === 'string' ? payload.name : null;
  if (!fromPath || !toName) throw new Error('rename: path and name are required');

  // Renaming the currently-open project is now allowed. The renderer pauses
  // autosave during the rename via `renameInFlightRef`, and the resulting
  // ProjectState is fed back through setProject so the autosave useEffect
  // re-binds to the new path. The save-queue serialization here keeps
  // pre-flight autosaves ordered correctly with the rename.
  const safePath = validateProjectPath(fromPath, { allowedRoots: buildAllowedProjectRoots() });
  const result = await enqueueProjectOp(safePath, () => renameProjectFile({ fromPath: safePath, toName }));
  return formatProject(result);
});
ipcMain.handle(IPC_CHANNELS.USER_TEMPLATE_LIST, () => userTemplatesStore.list());
ipcMain.handle(IPC_CHANNELS.USER_TEMPLATE_SAVE, (_event, payload) => userTemplatesStore.save(payload ?? {}));
ipcMain.handle(IPC_CHANNELS.USER_TEMPLATE_RENAME, (_event, payload) => userTemplatesStore.rename(payload ?? {}));
ipcMain.handle(IPC_CHANNELS.USER_TEMPLATE_DELETE, (_event, payload) => userTemplatesStore.delete(payload ?? {}));
ipcMain.handle(IPC_CHANNELS.RECORDING_TEMPLATE_OVERRIDE_LIST, () => recordingTemplateOverridesStore.list());
ipcMain.handle(IPC_CHANNELS.RECORDING_TEMPLATE_OVERRIDE_SAVE, (_event, payload) => recordingTemplateOverridesStore.save(payload ?? {}));
registerAiAssetIpcHandlers(ipcMain, { store: aiAssetsStore });

ipcMain.handle(IPC_CHANNELS.AI_GET_STATUS, () => getAiStatus());
const graphicsStyleStore = createGraphicsStyleStore({ filePath: defaultGraphicsStylePath(app.getPath('appData')) });
const graphicRequests = new Map();
// Last few Claude exchanges, for diagnosing a bad or missing result. Under
// appData so it survives rebuilds (each dock build gets its own userData).
const claudeDebugDir = join(app.getPath('appData'), 'rough-cut-mvp', 'claude-log');
ipcMain.handle(IPC_CHANNELS.GRAPHICS_GET_STYLE, () => graphicsStyleStore.get());
ipcMain.handle(IPC_CHANNELS.GRAPHICS_SET_STYLE, (_event, style) => graphicsStyleStore.set(style));
ipcMain.handle(IPC_CHANNELS.GRAPHICS_CANCEL, (_event, requestId) => {
  graphicRequests.get(requestId)?.abort();
  return { ok: true };
});
ipcMain.handle(IPC_CHANNELS.GRAPHICS_GENERATE, async (event, payload = {}) => {
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : `graphic-${Date.now()}`;
  const controller = new AbortController();
  graphicRequests.set(requestId, controller);
  // How long one Claude answer usually takes here, so the progress bar's pace
  // matches this computer and account rather than a guess.
  const expectedMs = await typicalClaudeAnswerMs(claudeDebugDir, payload.existing ? 'graphic-change' : 'graphic');
  const sendProgress = (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.GRAPHICS_PROGRESS, { requestId, expectedMs, ...progress });
  };
  try {
    const width = Number(payload.canvas?.width);
    const height = Number(payload.canvas?.height);
    return await generateGraphic({
      request: payload.request,
      existing: payload.existing ?? null,
      others: Array.isArray(payload.others) ? payload.others : [],
      usedDirections: Array.isArray(payload.usedDirections) ? payload.usedDirections : [],
      lengthSec: Number(payload.lengthSec) > 0 ? Number(payload.lengthSec) : null,
      canvas: {
        width: Number.isFinite(width) && width > 0 ? Math.round(width) : 1920,
        height: Number.isFinite(height) && height > 0 ? Math.round(height) : 1080,
      },
      fps: Number(payload.fps) > 0 ? Number(payload.fps) : 30,
      style: {
        ...(await graphicsStyleStore.get()),
        ...(typeof payload.styleId === 'string' ? { styleId: payload.styleId } : {}),
        ...(payload.creativity !== undefined ? { creativity: payload.creativity } : {}),
        ...(typeof payload.styleLock === 'boolean' ? { styleLock: payload.styleLock } : {}),
      },
      signal: controller.signal,
      debugDir: claudeDebugDir,
      onProgress: sendProgress,
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    graphicRequests.delete(requestId);
  }
});
ipcMain.handle(IPC_CHANNELS.AI_ANALYZE_PROJECT, async (_event, payload) => {
  try {
    // Measure dead air locally first: Claude never hears the recording.
    const silenceCuts = await measureSilenceCuts(payload ?? {});
    return await analyzeProject({ ...(payload ?? {}), silenceCuts, debugDir: claudeDebugDir });
  } catch (err) {
    // Re-shape into a serializable payload so the renderer can render a
    // human-readable error without losing the code field.
    return {
      error: {
        code: err?.code ?? 'AI_UNKNOWN',
        message: err?.message ?? String(err),
      },
    };
  }
});

ipcMain.handle(IPC_CHANNELS.RECENT_PROJECTS_CLEAR, () => {
  // The gallery is a live folder scan, not a curated list — there is no
  // separate "recent" store to clear. Returning a no-op keeps the channel
  // contract honest while leaving destructive bulk-delete out of scope.
  return { cleared: false, reason: 'gallery-is-live-scan' };
});
ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_GET, () => getRecoveryState({ markerPath }));
ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_RECOVER, async () => {
  return recoverFromMarker({
    markerPath,
    remuxMkvToMp4,
    assertReadableMp4,
    saveProjectForRecording,
    formatProject,
    onLog: (line) => console.info(line),
  });
});
ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_DISMISS, (_event, options = {}) => {
  return dismissRecovery({ markerPath, deleteFiles: Boolean(options?.deleteFiles) });
});
ipcMain.handle(IPC_CHANNELS.EXPORT_PICK_OUTPUT_PATH, async (event, projectName = 'rough-cut-export') => {
  if (process.env.ROUGH_CUT_UI_SMOKE_EXPORT_PATH) return process.env.ROUGH_CUT_UI_SMOKE_EXPORT_PATH;

  // One regular place for every export: <exports folder>/<project>/<date_time> <project>.mp4
  const safeName = String(projectName).replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'rough-cut-export';
  const exportFolder = join(currentExportsDir(), safeName);
  await mkdir(exportFolder, { recursive: true });
  // The KDE file dialog on KDE, the standard one elsewhere; null means the person cancelled.
  return pickSavePath({
    title: 'Export MP4',
    defaultPath: join(exportFolder, `${projectFolderName(new Date(), safeName)}.mp4`),
    electronDialog: dialog,
    parentWindow: BrowserWindow.fromWebContents(event.sender) ?? undefined,
  });
});
async function countGraphicsInSavedProject(projectPath) {
  try {
    const saved = JSON.parse(await readFile(projectPath, 'utf8'));
    return listGraphics(saved).filter((graphic) => graphic.enabled && graphic.html).length;
  } catch {
    return -1; // unreadable or unsaved: only a diagnostic, never a reason to stop
  }
}
ipcMain.handle(IPC_CHANNELS.EXPORT_START, async (event, {
  document,
  projectPath,
  outputPath,
  mode,
  exportScope,
}) => {
  if (activeExportController) throw new Error('An export is already running. Cancel it before starting another export.');
  const controller = new AbortController();
  activeExportController = controller;
  try {
    const preparedStabilizationTransforms = await prepareExportStabilizationTransforms({
      document,
      projectPath,
      signal: controller.signal,
      onProgress: (progress) => event.sender.send(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, {
        phase: progress.phase === 'analyzing' ? 'analyzing-stabilization' : 'building-stabilized-video',
        progress: progress.phase === 'analyzing'
          ? progress.progress * 0.5
          : 0.5 + progress.progress * 0.5,
      }),
    });
    // What the project says it contains, so a missing piece can never go unnoticed (and can be diagnosed from the log).
    const graphicsInDocument = mode === 'styled'
      ? listGraphics(document).filter((graphic) => graphic.enabled && graphic.html).length
      : 0;
    const graphicsInSavedFile = await countGraphicsInSavedProject(projectPath);
    console.info(`[export] start mode=${mode} scope=${exportScope} output=${outputPath} graphicsInEditor=${graphicsInDocument} graphicsInSavedProject=${graphicsInSavedFile}`);
    const result = await exportProjectToMp4({
      project: document,
      outputPath,
      mode,
      exportScope,
      signal: controller.signal,
      preparedStabilizationTransforms,
      onProgress: (progress) => event.sender.send(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, progress),
    });
    if (result?.cancelled || !result?.outputPath) {
      console.info('[export] cancelled');
      return result;
    }
    // Every export is checked the moment it lands, so a silent, frozen or animation-less file is flagged
    // here instead of being found by watching it. A failing check never fails the export.
    const verification = await verifyExportedFile({
      outputPath: result.outputPath,
      project: document,
      exportScope,
      mode,
      graphics: { expected: graphicsInDocument, included: result.graphicsCount ?? 0, error: result.graphicsError ?? null },
    }).catch((error) => ({ ok: true, problems: [], summary: '', unavailable: String(error?.message ?? error) }));
    console.info(`[export] finished ok=${verification.ok} graphicsIncluded=${result.graphicsCount ?? 0}/${graphicsInDocument} ${verification.summary}`);
    return { ...result, verification };
  } finally {
    if (activeExportController === controller) activeExportController = null;
  }
});

async function prepareExportStabilizationTransforms({
  document,
  projectPath,
  signal,
  onProgress,
}) {
  const prepared = new Map();
  const recording = getPrimaryRecording(document);
  const exportedAssetIds = new Set([
    recording?.assetId,
    recording?.camera?.assetId,
  ].filter(Boolean));
  const enabledEffects = (document?.timeline?.effects ?? []).filter(
    (effect) => effect?.kind === 'stabilization'
      && effect.ownerType === 'source'
      && effect.enabled === true,
  );
  for (const effect of enabledEffects) {
    if (signal?.aborted) {
      const error = new Error('Export was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    const source = document?.timeline?.sources?.find((entry) => entry?.id === effect.ownerId);
    const asset = document?.assets?.find((entry) => entry?.id === source?.assetId);
    if (asset?.type !== 'video' || !exportedAssetIds.has(asset.id)) continue;
    const sourcePath = asset.filePath ?? asset.path;
    if (typeof sourcePath !== 'string' || !sourcePath) {
      throw new Error(`The stabilized video ${asset.id} has no readable source file`);
    }
    if (!isAbsolute(sourcePath) && (typeof projectPath !== 'string' || !projectPath)) {
      throw new Error('Export needs the current project path to rebuild stabilization');
    }
    const resolvedSourcePath = isAbsolute(sourcePath)
      ? sourcePath
      : join(dirname(projectPath), sourcePath);
    const result = await stabilizationService.prepare({
      sourceId: source.id,
      sourcePath: resolvedSourcePath,
      strength: effect.params?.strength,
      signal,
      onProgress,
    });
    prepared.set(source.id, result.transformPath);
  }
  return prepared;
}
ipcMain.handle(IPC_CHANNELS.CENSOR_TRACK, async (event, payload = {}) => {
  const { document, regionId } = payload;
  const recording = getPrimaryRecording(document);
  const sourcePath = recording?.filePath;
  if (!sourcePath) throw new Error('censor:track needs a recording to analyse');
  const region = (recording?.presentation?.censorRegions ?? []).find((entry) => entry.id === regionId);
  if (!region) throw new Error(`censor:track could not find the censor ${regionId}`);

  // Cancels with the export controller pattern: analysis spawns ffmpeg, so an
  // abandoned window must not leave it running.
  const controller = new AbortController();
  activeCensorTrackController?.abort();
  activeCensorTrackController = controller;
  try {
    return await trackCensorRegion({
      sourcePath,
      region,
      fps: document?.settings?.fps ?? 30,
      sourceWidth: recording?.metadata?.width ?? recording?.width,
      sourceHeight: recording?.metadata?.height ?? recording?.height,
      signal: controller.signal,
      onProgress: (progress) => event.sender.send(IPC_CHANNELS.CENSOR_TRACK_PROGRESS, progress),
    });
  } finally {
    if (activeCensorTrackController === controller) activeCensorTrackController = null;
  }
});
ipcMain.handle(IPC_CHANNELS.STABILIZATION_SUPPORT, () => stabilizationService.probeSupport());
ipcMain.handle(IPC_CHANNELS.STABILIZATION_CANCEL, (_event, jobId) => ({
  cancelled: stabilizationService.cancel(jobId),
}));
ipcMain.handle(IPC_CHANNELS.STABILIZATION_PREPARE, async (event, payload = {}) => {
  const { document, projectPath, sourceId, strength } = payload;
  if (typeof projectPath !== 'string' || !projectPath) {
    throw new Error('stabilization:prepare needs the current project path');
  }
  const source = document?.timeline?.sources?.find((entry) => entry?.id === sourceId);
  if (!source) throw new Error(`Cannot find stabilization source ${sourceId}`);
  const asset = document?.assets?.find((entry) => entry?.id === source.assetId);
  if (!asset || asset.type !== 'video') {
    throw new Error('Only imported and camera video can be stabilized');
  }
  const sourcePath = asset.filePath ?? asset.path;
  if (typeof sourcePath !== 'string' || !sourcePath) {
    throw new Error('The selected video has no readable source file');
  }
  const resolvedSourcePath = isAbsolute(sourcePath)
    ? sourcePath
    : join(dirname(projectPath), sourcePath);
  const result = await stabilizationService.prepare({
    sourceId,
    sourcePath: resolvedSourcePath,
    strength,
    onProgress: (progress) => event.sender.send(IPC_CHANNELS.STABILIZATION_PROGRESS, progress),
  });
  return {
    jobId: result.jobId,
    sourceId: result.sourceId,
    cacheKey: result.cacheKey,
    strength: result.strength,
    methodVersion: result.methodVersion,
    reused: result.reused,
    proxyUrl: toMediaUrl(result.proxyPath),
  };
});
ipcMain.handle(IPC_CHANNELS.CLIP_VISUALS_GET, async (_event, payload = {}) => {
  const { projectPath, sourcePath, kind, durationSec, targetTiles, targetWidthPx } = payload;
  if (typeof projectPath !== 'string' || !projectPath) throw new Error('clip-visuals: projectPath required');
  if (typeof sourcePath !== 'string' || !sourcePath) throw new Error('clip-visuals: sourcePath required');
  const resolvedSource = isAbsolute(sourcePath) ? sourcePath : join(dirname(projectPath), sourcePath);
  const visual = await ensureClipVisual({
    projectPath,
    sourcePath: resolvedSource,
    kind,
    durationSec: Number(durationSec) || 1,
    targetTiles,
    targetWidthPx,
  });
  const { path: visualPath, ...meta } = visual;
  return { ...meta, url: toMediaUrl(visualPath) };
});
const visualDiscontinuityRequests = new Map();
ipcMain.handle(
  IPC_CHANNELS.VISUAL_DISCONTINUITY_INSPECT,
  async (_event, payload = {}) => {
    const { projectPath, sourcePath, beforeFrame, afterFrame, fps } = payload;
    if (typeof projectPath !== 'string' || !projectPath) {
      throw new Error('visual-discontinuity: projectPath required');
    }
    if (typeof sourcePath !== 'string' || !sourcePath) {
      throw new Error('visual-discontinuity: sourcePath required');
    }
    const safeProjectPath = validateProjectPath(projectPath, {
      allowedRoots: buildAllowedProjectRoots(),
    });
    const project = await openProjectFile(safeProjectPath);
    const resolvedSource = resolveReferencedVisualSource({
      projectPath: safeProjectPath,
      sourcePath,
      assets: project.document.assets,
    });
    const requestKey = [
      resolvedSource,
      beforeFrame,
      afterFrame,
      fps,
    ].join(':');
    const current = visualDiscontinuityRequests.get(requestKey);
    if (current) return current;
    const request = inspectVisualDiscontinuity({
      sourcePath: resolvedSource,
      beforeFrame,
      afterFrame,
      fps,
    }).catch((error) => {
      visualDiscontinuityRequests.delete(requestKey);
      throw error;
    });
    visualDiscontinuityRequests.set(requestKey, request);
    if (visualDiscontinuityRequests.size > 128) {
      visualDiscontinuityRequests.delete(
        visualDiscontinuityRequests.keys().next().value,
      );
    }
    return request;
  },
);

ipcMain.handle(IPC_CHANNELS.DEBUG_DUMP_SAVE, async (_event, payload = {}) => {
  const { projectPath, dump } = payload;
  if (typeof projectPath !== 'string' || !projectPath) throw new Error('debug-dump: projectPath required');
  const dir = join(dirname(projectPath), '.roughcut-debug');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpPath = join(dir, `editor-dump-${stamp}.json`);
  await writeFile(dumpPath, `${JSON.stringify(dump ?? {}, null, 2)}\n`, 'utf8');
  return { path: dumpPath };
});

ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, () => {
  if (!activeExportController) return { cancelled: false };
  activeExportController.abort();
  return { cancelled: true };
});

async function runMainProcessHeadlessExportSmoke() {
  const resultPath = process.env.ROUGH_CUT_HEADLESS_EXPORT_SMOKE_RESULT_PATH;
  const projectPath = process.env.ROUGH_CUT_HEADLESS_EXPORT_SMOKE_PROJECT_PATH;
  const outputPath = process.env.ROUGH_CUT_HEADLESS_EXPORT_SMOKE_OUTPUT_PATH;
  if (!resultPath || !projectPath || !outputPath) return false;

  const progress = [];
  const writeReport = async (report) => {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  };

  try {
    const opened = await openProjectFile(projectPath);
    const startedAt = Date.now();
    const result = await exportProjectToMp4({
      project: opened.document,
      outputPath,
      mode: 'experimental-headless',
      onProgress: (event) => progress.push(event),
    });
    await writeReport({
      ok: true,
      projectPath,
      outputPath,
      durationMs: Date.now() - startedAt,
      result,
      progress,
    });
    console.info(`[headless-export-smoke] wrote ${resultPath}`);
  } catch (err) {
    process.exitCode = 1;
    await writeReport({
      ok: false,
      projectPath,
      outputPath,
      error: err instanceof Error ? err.message : String(err),
      progress,
    });
    console.error('[headless-export-smoke] failed', err);
  } finally {
    app.quit();
    setTimeout(() => app.exit(process.exitCode ?? 0), 1000).unref?.();
  }
  return true;
}

async function openDockStartup({ startupMode, startupProjectPath }) {
  createMainWindow({ mode: startupMode, projectPath: startupProjectPath });
}

// Only an explicitly requested project opens at startup. Auto-selecting the most
// recent recording meant a plain launch always landed inside a project — and,
// combined with the route above, always in the advanced Editor. A plain launch
// belongs in the Projects gallery so the choice stays the user's.
async function resolveDockStartupProject(explicitProjectPath) {
  return explicitProjectPath ?? null;
}

app.whenReady().then(() => {
  recordDockProvenance();
  registerMediaProtocol();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  if (process.env.ROUGH_CUT_HEADLESS_EXPORT_SMOKE_RESULT_PATH) {
    void runMainProcessHeadlessExportSmoke();
    return;
  }
  const requestedProjectPath = process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH || process.env.ROUGH_CUT_UI_SMOKE_PROJECT_PATH || null;
  const startupProjectPathPromise = resolveDockStartupProject(requestedProjectPath);
  const requestedMode = process.env.ROUGH_CUT_STARTUP_MODE;
  void startupProjectPathPromise.then((startupProjectPath) => {
    const startupMode = requestedMode === 'editor'
        || process.env.ROUGH_CUT_UI_SMOKE_FORCE_EDITOR === '1'
        || startupProjectPath
        ? 'editor'
        : 'recorder';
    console.info(`[startup] mode=${startupMode} requested=${requestedMode ?? 'default'} project=${startupProjectPath ?? 'none'}`);
    return openDockStartup({ startupMode, startupProjectPath });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void startupProjectPathPromise.then((startupProjectPath) => openDockStartup({
        startupMode: 'editor',
        startupProjectPath,
      }));
    }
  });
});

app.on('window-all-closed', () => {
  if (process.env.ROUGH_CUT_HEADLESS_EXPORT_SMOKE_RESULT_PATH) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  void recordingTranscriptionBridgePromise.then((bridge) => bridge?.dispose());
  void stopActiveAudioPreview();
  void stopActiveCameraPreview();
  globalShortcut.unregister(recordingStopShortcut);
  globalShortcut.unregister(recordingRestartShortcut);
  destroyRecordingTray();
});

async function runRendererSidebarLayoutSmoke(options = {}) {
  const waitFor = async (predicate, label, timeoutMs = 5000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const waitForFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const waitForAnimationCondition = async (
    predicate,
    label,
    timeoutMs = 1000,
  ) => {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const value = await predicate();
      if (value) return value;
      await waitForFrame();
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const expectLoaded = Boolean(options.sidebarExpectLoaded);
  await waitFor(
    () => expectLoaded
      ? document.querySelector('[data-ui-region="editor-workspace"]')
      : document.querySelector('[data-ui-region="editor-workspace"]') || document.querySelector('[data-ui-region="editor-empty"]'),
    expectLoaded ? 'loaded editor workspace' : 'editor workspace or empty state',
    expectLoaded ? 10000 : 5000,
  );
  const knownDeadCopy = [
    'Cursor style controls are planned for TASK-044.',
    'Save failures and degraded media states appear here when available.',
    'will live in this bottom rail',
    'appear here once a project is loaded',
  ];
  const hasNoSidebarPlaceholderCopy = knownDeadCopy.every((copy) => !document.body.textContent?.includes(copy));
  if (!expectLoaded && document.querySelector('[data-ui-region="editor-empty"]')) {
    const emptyRect = rectToRoundedObject(document.querySelector('[data-ui-region="editor-empty"]')?.getBoundingClientRect());
    const hasSmallViewportOverflowGuard = window.innerWidth <= 900 && document.documentElement.scrollWidth <= window.innerWidth + 2;
    return {
      ok: Boolean(emptyRect) && hasNoSidebarPlaceholderCopy && hasSmallViewportOverflowGuard,
      hasEmptyEditorState: Boolean(emptyRect),
      hasNoSidebarPlaceholderCopy,
      hasSmallViewportOverflowGuard,
      width: window.innerWidth,
      height: window.innerHeight,
      mode: 'empty',
      rects: { empty: emptyRect },
    };
  }
  if (new URL(window.location.href).searchParams.has('projectPath')) {
    await waitFor(() => document.querySelector('video'), 'loaded project video', 10000);
  }
  const snapshots = [];
  const toolAssertions = {};
  const projectLoaded = Boolean(document.querySelector('video'));
  const expectedTools = ['Background', 'Zoom', 'Cursor', 'Camera'];
  for (const label of expectedTools) {
    document.querySelector(`button[aria-label="${label}"]`)?.click();
    await waitFor(() => document.querySelector(`[aria-label="${label} board"]`), `${label} board`);
    await waitForFrame();
    toolAssertions[label] = await collectToolAssertion(label);
    snapshots.push({ tool: label, rects: collectRects(), assertion: toolAssertions[label] });
  }

  const baseline = snapshots[0]?.rects ?? {};
  const stableRegions = ['shell', 'editor', 'stage', 'timeline', 'inspector', 'preview'].every((region) => snapshots.every((snapshot) => sameRect(baseline[region], snapshot.rects[region])));
  const hasAllSidebarTabs = expectedTools.every((label) => document.querySelector(`button[aria-label="${label}"]`));
  const hasStableCentralStageAcrossSidebarTabs = snapshots.every((snapshot) => sameRect(baseline.stage, snapshot.rects.stage));
  const hasStableTimelineAcrossSidebarTabs = snapshots.every((snapshot) => sameRect(baseline.timeline, snapshot.rects.timeline));
  const hasRepresentativeSidebarControls = Object.values(toolAssertions).every(Boolean);
  const hasSmallViewportOverflowGuard = window.innerWidth <= 900
    && Boolean(document.querySelector('.setupBoard'))
    && Array.from(document.querySelectorAll('.setupBoard, [data-ui-region="right-inspector"], [data-ui-region="central-stage"]')).every((element) => element.scrollWidth <= element.clientWidth + 2);
  const ok = stableRegions
    && hasAllSidebarTabs
    && hasStableCentralStageAcrossSidebarTabs
    && hasStableTimelineAcrossSidebarTabs
    && hasRepresentativeSidebarControls
    && hasNoSidebarPlaceholderCopy
    && hasSmallViewportOverflowGuard;
  return {
    ok,
    hasStableToolSwitchLayout: stableRegions,
    hasAllSidebarTabs,
    hasStableCentralStageAcrossSidebarTabs,
    hasStableTimelineAcrossSidebarTabs,
    hasRepresentativeSidebarControls,
    hasNoSidebarPlaceholderCopy,
    hasSmallViewportOverflowGuard,
    width: window.innerWidth,
    height: window.innerHeight,
    mode: projectLoaded ? 'loaded' : 'empty',
    toolAssertions,
    snapshots,
  };

  async function collectToolAssertion(label) {
    if (label === 'Background') {
      Array.from(document.querySelectorAll('[aria-label="Background type"] button')).find((button) => button.textContent === 'Wallpaper')?.click();
      const preset = await waitFor(() => document.querySelector('button[aria-label="Soft blur"]'), 'background soft blur preset');
      await waitFor(() => !preset.disabled, 'background soft blur preset enabled');
      preset.click();
      await waitFor(() => preset.getAttribute('aria-pressed') === 'true', 'background preset mutates selected state');
      return Boolean(
        document.querySelector('[data-inspector-group="canvas-background"]')
          && preset.getAttribute('aria-pressed') === 'true'
      );
    }
    if (label === 'Zoom') {
      if (!projectLoaded) return Boolean(document.body.textContent?.includes('No timeline yet'));
      const clearButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Restore all hidden ranges');
      return Boolean(
        document.querySelector('[data-ui-region="timeline-zoom-control-panel"]')
          && document.querySelector('[data-cut-range-panel="true"]')
          && clearButton
          && document.body.textContent?.includes('Removed parts')
      );
    }
    if (label === 'Cursor') {
      const spotlight = await waitFor(() => document.querySelector('[data-cursor-style="spotlight"]'), 'cursor spotlight style');
      spotlight.click();
      await waitFor(() => spotlight.getAttribute('aria-checked') === 'true', 'cursor style mutates selected state');
      return Boolean(document.querySelector('[data-cursor-controls="true"]') && spotlight.getAttribute('aria-checked') === 'true');
    }
    if (label === 'Camera') {
      const cameraControls = document.querySelector('[data-camera-pip-controls="true"]');
      if (!cameraControls) return Boolean(document.body.textContent?.includes('No camera yet'));
      const shapeTile = (name) => Array.from(document.querySelectorAll('[aria-label="Camera shape"] button')).find((button) => button.textContent?.trim() === name);
      const circleTile = await waitFor(() => shapeTile('Circle'), 'camera shape control');
      await waitFor(() => !circleTile.disabled, 'camera shape control enabled');
      circleTile.click();
      await waitFor(() => shapeTile('Circle')?.getAttribute('aria-pressed') === 'true', 'camera shape mutates selected state');
      return Boolean(cameraControls);
    }
    return false;
  }

  function collectRects() {
    return {
      shell: rectToRoundedObject(document.querySelector('[data-ui-shell="recording-studio"]')?.getBoundingClientRect()),
      editor: rectToRoundedObject(document.querySelector('[data-ui-region="editor-workspace"]')?.getBoundingClientRect()),
      stage: rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect()),
      timeline: rectToRoundedObject(document.querySelector('[data-ui-region="timeline-review-rail"]')?.getBoundingClientRect()),
      inspector: rectToRoundedObject(document.querySelector('[data-ui-region="right-inspector"]')?.getBoundingClientRect()),
      preview: rectToRoundedObject((document.querySelector('canvas.styledPreviewCanvas') ?? document.querySelector('.emptyStage'))?.getBoundingClientRect()),
    };
  }

  function rectToRoundedObject(rect) {
    if (!rect) return null;
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function sameRect(a, b) {
    if (!a || !b) return false;
    return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 1);
  }
}

// External SIGTERM / SIGINT (force-quit, OOM, init-system shutdown): synchronously
// SIGTERM every spawned ffmpeg/xinput child so they don't outlive Electron.
// Marker is intentionally left in place — TASK-088 surfaces it for recovery on
// next launch. Don't await stop() here — Node exits as the event loop drains.
function reapAndExit(signal) {
  try {
    const preview = activeAudioPreview;
    activeAudioPreview = null;
    preview?.handle?.kill?.('SIGTERM');
  } catch (err) {
    console.error(`[audio-preview] ${signal}: reap failed`, err);
  }
  try {
    const reaped = recordingSession.terminateChildren('SIGTERM');
    if (reaped.length > 0) {
      console.warn(`[recording] ${signal}: SIGTERMed ${reaped.length} child process(es): ${reaped.map((c) => `${c.name}(${c.pid ?? '?'})`).join(', ')}`);
    }
  } catch (err) {
    console.error(`[recording] ${signal}: reap failed`, err);
  }
  // 128 + signal-number convention.
  process.exit(signal === 'SIGINT' ? 130 : 143);
}
process.on('SIGTERM', () => reapAndExit('SIGTERM'));
process.on('SIGINT', () => reapAndExit('SIGINT'));

function registerHiddenRecordingStopShortcut(window) {
  globalShortcut.unregister(recordingStopShortcut);
  globalShortcut.unregister(recordingRestartShortcut);
  const registered = globalShortcut.register(recordingStopShortcut, async () => {
    await stopHiddenRecordingAndOpenEditor(window);
  });
  const restartRegistered = globalShortcut.register(recordingRestartShortcut, async () => {
    await restartHiddenRecording(window);
  });
  if (!registered) console.warn(`[recording] failed to register stop shortcut ${recordingStopShortcut}`);
  if (!restartRegistered) console.warn(`[recording] failed to register restart shortcut ${recordingRestartShortcut}`);
}

function unregisterHiddenRecordingStopShortcut() {
  globalShortcut.unregister(recordingStopShortcut);
  globalShortcut.unregister(recordingRestartShortcut);
  hiddenRecorderWindow = null;
  hiddenRecordingOptions = null;
}

async function finalizeActiveRecording() {
  if (activeRecordingFinalizePromise) return activeRecordingFinalizePromise;
  const finalRecordingStatus = recordingSession.status();
  await recordingTranscriptionLifecycle.recordingStopping(finalRecordingStatus);
  activeRecordingFinalizePromise = stopRecordingAndCreateProject({
    recordingSession,
    assertReadableMp4,
    remuxMkvToMp4,
    remuxMkvSegmentsToMp4,
    saveProjectForRecording,
    formatProject,
    probeVideoTiming,
    probeVideoStreamsTiming,
    computeSyncedRecordingTiming,
  }).then(async (result) => {
    await recordingTranscriptionLifecycle.recordingStopped(result);
    const bridge = await recordingTranscriptionBridgePromise;
    if (bridge && result?.state === 'saved' && result.project?.path) {
      return {
        ...result,
        project: formatProject(await openProjectFile(result.project.path)),
      };
    }
    return result;
  }).finally(() => {
    activeRecordingFinalizePromise = null;
  });
  return activeRecordingFinalizePromise;
}

async function stopHiddenRecordingAndOpenEditor(window) {
  if (hiddenRecordingStopping) return;
  hiddenRecordingStopping = true;
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(window, 'finalizing');
  try {
    const stopped = await finalizeActiveRecording();
    if (stopped.state === 'saved' && stopped.project && !window.isDestroyed()) {
      window.setResizable(true);
      window.setMaximizable(true);
      window.setMinimumSize(860, 560);
      window.setSize(1120, 740);
      window.center();
      window.show();
      loadRenderer(window, { mode: 'editor', projectPath: stopped.project.path });
    }
  } catch (err) {
    console.error('[recording:shortcut-stop] failed', err);
    if (!window.isDestroyed()) window.show();
  } finally {
    updateRecordingTray(window, 'saved');
    hiddenRecordingStopping = false;
  }
}

async function restartHiddenRecording(window) {
  if (hiddenRecordingStopping) return;
  hiddenRecordingStopping = true;
  try {
    const nextOptions = hiddenRecordingOptions ?? {};
    updateRecordingTray(window, 'restarting');
    await recordingSession.cancel();
    await (await recordingTranscriptionBridgePromise)?.recordingCancelled();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const status = await recordingSession.start(nextOptions);
  await recordingTranscriptionLifecycle.recordingStarted(status);
    hiddenRecordingStopping = false;
    if (!window.isDestroyed()) showRecordingTray(window);
  } catch (err) {
    console.error('[recording:shortcut-restart] failed', err);
    if (!window.isDestroyed()) window.show();
  } finally {
    hiddenRecordingStopping = false;
  }
}

async function cancelHiddenRecording(window) {
  if (hiddenRecordingStopping) return;
  hiddenRecordingStopping = true;
  unregisterHiddenRecordingStopShortcut();
  updateRecordingTray(window, 'canceling');
  try {
    await recordingSession.cancel();
    await (await recordingTranscriptionBridgePromise)?.recordingCancelled();
    if (!window.isDestroyed()) {
      window.show();
      loadRenderer(window, { mode: 'recorder' });
    }
    updateRecordingTray(window, 'discarded');
  } catch (err) {
    console.error('[recording:shortcut-cancel] failed', err);
    if (!window.isDestroyed()) window.show();
  } finally {
    hiddenRecordingStopping = false;
  }
}

function showRecordingTray(window) {
  updateRecordingTray(window, 'recording');
}

function updateRecordingTray(window, state) {
  if (window) recordingTrayWindow = window;
  if (!recordingTray || recordingTray.isDestroyed()) {
    if (hiddenRecordingStopping && state === 'recording') return;
    const icon = createRecordingTrayIcon(state);
    if (icon.isEmpty()) console.warn('[recording-tray] recording tray icon is empty; status indicator may not appear');
    recordingTray = new Tray(icon);
    recordingTray.on('click', () => recordingTray?.popUpContextMenu());
  } else {
    const icon = createRecordingTrayIcon(state);
    if (!icon.isEmpty()) recordingTray.setImage(icon);
  }

  const menuWindow = window ?? recordingTrayWindow;
  recordingTray.setToolTip(recordingTrayTooltip(state));
  // Linux requires setContextMenu() after each menu change; mutating items is not enough.
  recordingTray.setContextMenu(Menu.buildFromTemplate(recordingTrayMenuTemplate(menuWindow, state)));
}

function recordingTrayTooltip(state) {
  if (state === 'saved') return 'Rough Cut saved your recording.';
  if (state === 'discarded') return 'Rough Cut discarded the recording.';
  if (state === 'paused') return 'Rough Cut recording is paused.';
  if (state === 'restarting') return 'Rough Cut is restarting your recording.';
  if (state === 'finalizing') return 'Rough Cut is finalizing your recording.';
  if (state === 'canceling') return 'Rough Cut is canceling and discarding the take.';
  return `Rough Cut is recording. Stop: ${recordingStopShortcut}. Restart: ${recordingRestartShortcut}.`;
}

function recordingTrayMenuTemplate(window, state) {
  if (state === 'saved') {
    return [
      { label: 'Recording saved', enabled: false },
      { label: 'Editor is open', enabled: false },
      { type: 'separator' },
      { label: 'Open editor', click: () => { if (window && !window.isDestroyed()) window.show(); } },
    ];
  }
  if (state === 'discarded') {
    return [
      { label: 'Recording discarded', enabled: false },
      { label: 'Ready for another take', enabled: false },
      { type: 'separator' },
      { label: 'Show recorder', click: () => { if (window && !window.isDestroyed()) window.show(); } },
    ];
  }
  if (state === 'finalizing') {
    return [
      { label: 'Finalizing recording...', enabled: false },
      { label: 'Saving and opening editor', enabled: false },
    ];
  }
  if (state === 'canceling') {
    return [
      { label: 'Canceling recording...', enabled: false },
      { label: 'Discarding current take', enabled: false },
    ];
  }
  if (state === 'restarting') {
    return [
      { label: 'Restarting recording...', enabled: false },
      { label: 'Discarding current take', enabled: false },
    ];
  }
  if (state === 'paused') {
    return [
      { label: 'Recording paused', enabled: false },
      { type: 'separator' },
      { label: 'Resume recording', click: async () => { await recordingSession.resume(); updateRecordingTray(window, 'recording'); } },
      { label: `Stop recording (${recordingStopShortcut})`, click: () => { if (window) void stopHiddenRecordingAndOpenEditor(window); } },
      { label: `Restart recording (${recordingRestartShortcut})`, click: () => { if (window) void restartHiddenRecording(window); } },
      { type: 'separator' },
      { label: 'Cancel and discard take', click: () => { if (window) void cancelHiddenRecording(window); } },
    ];
  }
  return [
    { label: 'Recording...', enabled: false },
    { type: 'separator' },
    { label: `Stop recording (${recordingStopShortcut})`, click: () => { if (window) void stopHiddenRecordingAndOpenEditor(window); } },
    { label: `Restart recording (${recordingRestartShortcut})`, click: () => { if (window) void restartHiddenRecording(window); } },
    { label: 'Pause recording', click: async () => { await recordingSession.pause(); updateRecordingTray(window, 'paused'); } },
    { type: 'separator' },
    { label: 'Cancel and discard take', click: () => { if (window) void cancelHiddenRecording(window); } },
  ];
}

function destroyRecordingTray() {
  if (recordingTray && !recordingTray.isDestroyed()) {
    recordingTray.setContextMenu(null);
    recordingTray.setToolTip('');
    recordingTray.destroy();
  }
  recordingTray = null;
  recordingTrayWindow = null;
}

function createRecordingTrayIcon(state = 'recording') {
  // Electron only guarantees PNG/JPEG nativeImage support cross-platform.
  // Linux StatusNotifier trays are especially inconsistent with SVG data URLs.
  const pngByState = {
    recording: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfEF/u4/+hiPAcXYahnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAVeYcFnAz8g4AAAAASUVORK5CYII=',
    finalizing: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfE13nc/9HFuJO+YqhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsA4YwcFh9atbUAAAAASUVORK5CYII=',
    canceling: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfElMU7/qOL5cR6YKhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAR+YcFuEAROcAAAAASUVORK5CYII=',
    saved: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfEW/rU/9FFrJQ+YqhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAfe4cFsU7Bl0AAAAASUVORK5CYII=',
    discarded: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVR4nGNgGPKAEZfElMU7/qOL5cR6YKhnIlYzLnEMA3BpxiXPhE+SGEOweoEUMNwMwBbP2ACyOgwXEDIEXR6rF3AZQqwL6QsAR+YcFuEAROcAAAAASUVORK5CYII=',
  };
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngByState[state] ?? pngByState.recording}`);
}

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

async function runRendererStartupRecordButtonSmoke(options = {}) {
  const waitFor = async (predicate, label, timeoutMs = 25000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}; body=${document.body.innerText.slice(0, 800)}`);
  };

  try {
    await waitFor(() => document.querySelector('[data-ui-shell="recording-studio"]'), 'studio shell');
    const hasInitialPreRecordPanel = Boolean(await waitFor(() => document.querySelector('[data-ui-region="pre-record-panel"]'), 'startup pre-record panel'));
    const hasRecordingWorkspace = Boolean(await waitFor(() => document.querySelector('[data-ui-region="recording-workspace"]'), 'recording workspace'));
    const hasRecordingTab = Boolean(
      Array.from(document.querySelectorAll('[data-ui-region="app-view-tabstrip"] button[aria-pressed="true"]'))
        .some((button) => button.textContent?.includes('Recording')),
    );
    const compactWindow = await waitFor(() => (
      window.outerWidth <= 820 && window.outerHeight <= 680
        ? { width: window.outerWidth, height: window.outerHeight }
        : null
    ), 'compact recording window');
    const readWindowProfile = () => {
      const availWidth = window.screen?.availWidth || window.outerWidth;
      const availHeight = window.screen?.availHeight || window.outerHeight;
      return {
        width: window.outerWidth,
        height: window.outerHeight,
        availWidth,
        availHeight,
        fillsAvailableScreen: window.outerWidth >= Math.floor(availWidth * 0.9)
          && window.outerHeight >= Math.floor(availHeight * 0.9),
      };
    };
    if (options.startupOpenEditor) {
      const openEditorButton = await waitFor(() => document.querySelector('[data-open-editor="pre-record"]:not(:disabled)'), 'pre-record open editor button');
      openEditorButton.click();
      await waitFor(() => !document.querySelector('[data-ui-region="recording-workspace"]'), 'recording workspace closed after opening editor');
      const studioWindow = await waitFor(() => {
        const profile = readWindowProfile();
        return profile.fillsAvailableScreen ? profile : null;
      }, 'maximized studio window after leaving recording');
      const hasEditorEmptyState = Boolean(await waitFor(() => document.querySelector('[data-ui-region="editor-empty"]'), 'empty editor state'));
      if (options.startupOpenProjects) {
        const openProjectsButton = await waitFor(() => document.querySelector('[data-ui-region="editor-empty"] button'), 'open projects button');
        openProjectsButton.click();
        await waitFor(() => !document.querySelector('[data-ui-region="recording-workspace"]'), 'recording workspace stays closed after opening projects');
        const hasProjectsView = Boolean(await waitFor(() => document.querySelector('[data-ui-region="project-library"]'), 'project library'));
        if (options.startupCreateBlankProject) {
          // "New empty project" lives in the library's New menu.
          (await waitFor(() => document.querySelector('[data-ui-region="library-new-menu"]'), 'library new menu'))?.click();
          const createBlankButton = await waitFor(() => document.querySelector('[data-testid="library-blank-project"]:not(:disabled)'), 'new empty project button');
          createBlankButton.click();
          const projectName = 'Smoke empty project';
          const nameInput = await waitFor(() => document.querySelector('#project-name-input'), 'project name input');
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          valueSetter?.call(nameInput, projectName);
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          const submitButton = await waitFor(() => Array.from(document.querySelectorAll('.projectNameActions button[type="submit"]')).find((button) => !button.disabled), 'project name submit button');
          submitButton.click();
          const hasBlankEmptyState = Boolean(await waitFor(() => document.querySelector('[data-testid="project-preview-empty"]'), 'Recording edit empty state after blank project'));
          const hasNamedProject = Boolean(await waitFor(() => document.body.innerText.includes(projectName), 'named blank project in editor'));
          const hasRecordingEditTab = Boolean(
            Array.from(document.querySelectorAll('[data-ui-region="app-view-tabstrip"] button[aria-pressed="true"]'))
              .some((button) => button.textContent?.includes('Recording edit')),
          );
          return {
            ok: hasInitialPreRecordPanel && hasRecordingWorkspace && hasRecordingTab && hasEditorEmptyState && hasProjectsView && hasBlankEmptyState && hasNamedProject && hasRecordingEditTab,
            hasInitialPreRecordPanel,
            hasRecordingWorkspace,
            hasRecordingTab,
            compactWindow,
            studioWindow,
            hasEditorEmptyState,
            hasProjectsView,
            hasBlankEmptyState,
            hasNamedProject,
            hasRecordingEditTab,
            openedEditorFromPanel: true,
            openedProjectsFromEditor: true,
            createdBlankProjectFromProjects: true,
          };
        }
        return {
          ok: hasInitialPreRecordPanel && hasRecordingWorkspace && hasRecordingTab && hasEditorEmptyState && hasProjectsView,
          hasInitialPreRecordPanel,
          hasRecordingWorkspace,
          hasRecordingTab,
          compactWindow,
          studioWindow,
          hasEditorEmptyState,
          hasProjectsView,
          openedEditorFromPanel: true,
          openedProjectsFromEditor: true,
        };
      }
      return {
        ok: hasInitialPreRecordPanel && hasRecordingWorkspace && hasRecordingTab && hasEditorEmptyState,
        hasInitialPreRecordPanel,
        hasRecordingWorkspace,
        hasRecordingTab,
        compactWindow,
        studioWindow,
        hasEditorEmptyState,
        openedEditorFromPanel: true,
      };
    }
    if (options.startupPanelOnly) {
      return {
        ok: hasInitialPreRecordPanel && hasRecordingWorkspace && hasRecordingTab,
        hasInitialPreRecordPanel,
        hasRecordingWorkspace,
        hasRecordingTab,
        compactWindow,
        panelOnly: true,
      };
    }
    const topRecordButton = await waitFor(() => document.querySelector('[data-recording-action="primary"]:not(:disabled)'), 'top record button');
    topRecordButton.click();
    await waitFor(() => document.querySelector('[data-recording-state="recording"]'), 'recording state after top button click');
    const activeStatus = await window.roughCut.getRecordingStatus();
    const startedFromTopButton = activeStatus?.state === 'recording';
    await window.roughCut.cancelRecording();
    await waitFor(async () => (await window.roughCut.getRecordingStatus())?.state === 'idle', 'idle state after startup smoke cancel');
    return {
      ok: hasInitialPreRecordPanel && hasRecordingWorkspace && hasRecordingTab && startedFromTopButton,
      hasInitialPreRecordPanel,
      hasRecordingWorkspace,
      hasRecordingTab,
      compactWindow,
      startedFromTopButton,
      canceledState: 'idle',
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
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
  const hasStudioShell = Boolean(await waitFor(
    () => document.querySelector('[data-ui-shell="recording-studio"]') || document.querySelector('[data-ui-region="pre-record-panel"]'),
    'recording studio shell or launcher',
  ));
  const hasCaptureBar = Boolean(await waitFor(() => document.querySelector('[data-ui-region="capture-bar"]'), 'capture bar region'));
  const hasNoInertTopBarIcons = !document.querySelector('[data-ui-region="capture-bar"] .titleIcon')
    && !Array.from(document.querySelectorAll('[data-ui-region="capture-bar"] .topActions button.iconButton')).some((button) => !button.getAttribute('title') || !button.getAttribute('aria-label'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
  const hasShortcutsDialog = Boolean(await waitFor(() => document.querySelector('[data-ui-region="shortcuts-dialog"]'), 'shortcuts dialog'));
  document.querySelector('[data-ui-region="shortcuts-dialog"] button')?.click();
  await waitFor(() => !document.querySelector('[data-ui-region="shortcuts-dialog"]'), 'shortcuts dialog closed');
  // Studio shell: capture sources live in the recorder, not in a device row above the editor.
  const hasNoLegacyDeviceRow = !document.querySelector('[data-ui-region="capture-command-area"]');
  const hasStateBanner = Boolean(await waitFor(() => document.querySelector('[data-ui-region="state-banner"]'), 'state banner region'));
  const hasCentralStage = Boolean(await waitFor(() => document.querySelector('[data-ui-region="central-stage"]'), 'central stage region'));
  const hasTimelineRail = Boolean(await waitFor(() => document.querySelector('[data-ui-region="timeline-review-rail"]'), 'timeline rail region'));
  const hasTimelineScrubber = Boolean(await waitFor(() => document.querySelector('input[aria-label="Scrub timeline"]'), 'timeline scrubber'));
  const hasKeyboardTimelineScrubber = Boolean(document.querySelector('input[aria-label="Scrub timeline"][aria-valuetext]'));
  const timelineScrubberInput = document.querySelector('input[aria-label="Scrub timeline"]');
  const hasTimelineScrubberFineStep = timelineScrubberInput?.getAttribute('step') === 'any';
  let hasTimelineArrowKeyAdvance = false;
  if (timelineScrubberInput instanceof HTMLInputElement) {
    timelineScrubberInput.focus();
    const beforeValue = Number(timelineScrubberInput.value);
    timelineScrubberInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    timelineScrubberInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await waitFor(() => Number(timelineScrubberInput.value) > beforeValue, 'timeline arrow key advance');
    hasTimelineArrowKeyAdvance = Number(timelineScrubberInput.value) > beforeValue;
  }
  // Trim handles only exist for a selected clip and selection starts empty (the old Editor tab used to select it), so select the screen clip first.
  const screenClipBody = await waitFor(() => document.querySelector('[data-timeline-lane="screen"] .clipBody'), 'screen clip body');
  if (screenClipBody instanceof HTMLElement) {
    screenClipBody.click();
  }
  const hasTrimHandles = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="screen"] .trimHandleStart') && document.querySelector('[data-timeline-lane="screen"] .trimHandleEnd'), 'timeline trim handles'));
  const hasTimelineLiveRegion = Boolean(document.querySelector('[data-ui-region="timeline-live-region"][aria-live="polite"]'));
  const hasKeyboardTrimHandles = Boolean(
    document.querySelector('[data-timeline-lane="screen"] .trimHandleStart[role="slider"][aria-valuenow]')
      && document.querySelector('[data-timeline-lane="screen"] .trimHandleEnd[role="slider"][aria-valuenow]'),
  );
  const hasZoomLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="zoom"]'), 'zoom timeline lane'));
  const hasClickLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="clicks"]'), 'click timeline lane'));
  const hasCameraLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="camera"]'), 'camera timeline lane'));
  const hasAudioLane = Boolean(await waitFor(() => document.querySelector('[data-timeline-lane="audio"]'), 'audio timeline lane'));
  const hasRightInspector = Boolean(await waitFor(() => document.querySelector('[data-ui-region="right-inspector"]'), 'right inspector region'));
  const hasExportStatusArea = Boolean(await waitFor(() => document.querySelector('[data-ui-region="export-status-area"]'), 'export status region'));
  await waitFor(() => video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0, 'video metadata');
  const styledPreviewCanvas = await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'styled preview canvas');
  const hasStyledPreviewCanvas = true;
  const hasFrameDragHandles = styledPreviewCanvas?.getAttribute('data-screen-draggable') === 'true' && styledPreviewCanvas?.getAttribute('data-camera-draggable') === 'true';
  document.querySelector('button[aria-label="Zoom"]')?.click();
  const stageRectBeforeToolSwitch = rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect());
  await waitFor(() => document.querySelector('[data-timeline-lane="zoom"][aria-label="Zoom markers"]'), 'zoom marker lane');
  const hasZoomMarkerPanel = true;
  const hasTimelineZoomControlPanel = Boolean(document.querySelector('[data-ui-region="timeline-zoom-control-panel"]'));
  const hasNoAutoZoomDecisionPanel = !document.querySelector('[aria-label="Auto-zoom suggestions"]');
  const hasGenerateAutoZoomsControl = Boolean(document.querySelector('[data-ui-region="auto-zoom-generation-row"]')?.closest('[aria-label="Auto zoom"]')?.querySelector('button'));
  const hasZoomResizeHandles = Boolean(document.querySelector('[data-timeline-lane="zoom"] .zoomResizeStart') && document.querySelector('[data-timeline-lane="zoom"] .zoomResizeEnd'));
  const hasKeyboardZoomControls = Boolean(
    document.querySelector('[data-timeline-lane="zoom"] .timelineRegion[role="button"][tabindex="0"]')
      && document.querySelector('[data-timeline-lane="zoom"] .zoomResizeStart[role="slider"][tabindex="0"]')
      && document.querySelector('[data-timeline-lane="zoom"] .zoomResizeEnd[role="slider"][tabindex="0"]'),
  );
  const hasNoSetupBoardHorizontalOverflow = Boolean(await waitFor(() => {
    const board = document.querySelector('.setupBoard');
    return board && board.scrollWidth <= board.clientWidth + 1;
  }, 'setup board without horizontal overflow'));
  // Clicking a zoom region opens the Zoom tab; clicking a clip keeps whatever tab
  // is open (clips are edited on the timeline itself).
  document.querySelector('button[aria-label="Background"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Background board"]'), 'background board before zoom click');
  const zoomRegion = document.querySelector('[data-timeline-lane="zoom"] .timelineRegion');
  zoomRegion?.click();
  const hasZoomInspectorContext = zoomRegion
    ? Boolean(await waitFor(() => document.querySelector('[aria-label="Zoom board"]'), 'zoom board active after zoom region click'))
    : false;
  document.querySelector('[data-timeline-lane="screen"] .clipBody')?.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const hasRecordingInspectorContext = Boolean(document.querySelector('[aria-label="Zoom board"]'));
  const hasInspectorContext = hasZoomInspectorContext || hasRecordingInspectorContext;
  // Removed-range list lives on the Zoom tab; the range-cut toggle lives on the timeline.
  const hasCutControls = Boolean(
    document.querySelector('[data-cut-range-panel="true"]')
      && document.querySelector('button[aria-label="Range cut mode"]')
      && document.querySelector('[data-timeline-lane="screen"]'),
  );
  // Tool-switch stability: Cursor -> Background -> Cursor.
  document.querySelector('button[aria-label="Cursor"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Cursor board"]'), 'cursor board active');
  const stageRectAfterInspectorSwitch = rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect());
  document.querySelector('button[aria-label="Background"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Background board"]'), 'background board active');
  const stageRectAfterBackgroundSwitch = rectToRoundedObject(document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect());
  const hasStableToolSwitchLayout = sameRect(stageRectBeforeToolSwitch, stageRectAfterInspectorSwitch) && sameRect(stageRectBeforeToolSwitch, stageRectAfterBackgroundSwitch);
  // Background owns wallpapers/gradients/colors; Frame owns size, look, layouts,
  // and (under "More") shadow detail and screen crop.
  const hasBackgroundGroup = Boolean(document.querySelector('[aria-label="Background board"] [data-inspector-group="canvas-background"]'));
  document.querySelector('button[aria-label="Frame"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Frame board"]'), 'frame board active');
  const hasInspectorGroups = hasBackgroundGroup && Boolean(
    document.querySelector('[data-inspector-group="templates"]')
      && document.querySelector('[data-inspector-group="screen-crop"]')
      && document.querySelector('[data-inspector-group="screen-frame"]')
      && document.querySelector('[data-inspector-group="screen-shadow"]')
  );
  const hasExportAspectChip = Boolean(document.querySelector('.exportPresetChip[data-active-aspect-ratio]'));
  // Cursor controls now live on a dedicated Cursor tab in the tool rail.
  document.querySelector('button[aria-label="Cursor"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Cursor board"]'), 'cursor board active');
  const hasCursorPresentationControls = Boolean(document.querySelector('[data-cursor-controls="true"]'));
  const hasCursorTab = Boolean(document.querySelector('button[aria-label="Cursor"]'));
  // Camera now has its own tab too.
  document.querySelector('button[aria-label="Camera"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Camera board"]'), 'camera board active');
  const hasCameraTab = Boolean(document.querySelector('button[aria-label="Camera"]'));
  const hasCameraPipControls = Boolean(document.querySelector('[data-camera-pip-controls="true"]'));
  // Return to Background for the remaining assertions (Background owns templates + aspect ratio now).
  document.querySelector('button[aria-label="Background"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Background board"]'), 'background board re-active after camera tab');
  await waitFor(() => document.querySelector('[data-export-format="styled"]'), 'styled export format');
  const hasReviewExportActions = Boolean(document.querySelector('[data-export-format="styled"]') && document.querySelector('[data-export-format="raw"]') && document.querySelector('[data-export-action="export"]'));
  const hasExperimentalHeadlessExportAction = Boolean(document.querySelector('[data-export-format="experimental-headless"]'));
  const hasRawPresetDetails = document.body.textContent?.includes('Raw export keeps the original recording unchanged.') ?? false;
  // The export pop-over summarises the styled look as key/value rows, not a sentence.
  const hasStyledPresetDetails = Boolean(document.querySelector('[data-export-summary="styled"] .exportPresetChip[data-active-aspect-ratio]'));

  const inputByLabel = (text, type = 'range') => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    return label?.querySelector(`input[type="${type}"]`) ?? null;
  };
  const controlByLabel = (root, text, selector) => {
    const label = Array.from(root?.querySelectorAll('label') ?? []).find((label) => label.textContent?.includes(text));
    return label?.querySelector(selector) ?? null;
  };
  const outputTextByLabel = (text) => {
    const label = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes(text));
    // Read the number only; panel readouts carry units such as " px" or "%".
    return label?.querySelector('output')?.textContent?.replace(/[^0-9.-]/g, '') ?? null;
  };
  const setControlValue = (control, value) => {
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    valueSetter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    if (control instanceof HTMLInputElement && control.type === 'range') {
      control.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }
  };
  const waitForEnabled = (control, label) => waitFor(() => !control.disabled, `${label} enabled`);
  const waitForButtonEnabled = (button, label) => waitFor(() => button instanceof HTMLButtonElement && !button.disabled, `${label} enabled`);

  // Layout templates live on the Frame tab. Aspect ratio is verified through the
  // export summary chip's `data-active-aspect-ratio` attribute.
  document.querySelector('button[aria-label="Frame"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Frame board"]'), 'frame board for templates');
  await waitFor(() => document.querySelector('.exportPresetChip[data-active-aspect-ratio]'), 'aspect ratio chip');
  const activeAspectRatio = () => document.querySelector('.exportPresetChip[data-active-aspect-ratio]')?.getAttribute('data-active-aspect-ratio') ?? null;
  const readCameraRect = (label) => waitFor(() => {
    const rect = window.__roughCutCanvasCameraRect;
    return rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)
      ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
      : null;
  }, label);
  const readCameraRectMatching = (label, predicate, timeoutMs = 5000) => waitFor(() => {
    const rect = window.__roughCutCanvasCameraRect;
    const value = rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)
      ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
      : null;
    return value && predicate(value) ? value : null;
  }, label, timeoutMs);
  const split16Template = await waitFor(() => document.querySelector('[data-template-id="tutorial-16-9"]'), 'FocuSee split 16:9 template preset');
  await waitForButtonEnabled(split16Template, 'FocuSee split 16:9 template preset');
  split16Template.click();
  await waitFor(() => activeAspectRatio() === '16:9', 'FocuSee split aspect ratio value', 15000);
  await waitFor(() => split16Template.getAttribute('aria-pressed') === 'true', 'FocuSee split template selected');
  const split16Bounds = (rect) =>
    rect.x >= 0.1
      && rect.x <= 0.11
      && rect.y >= 0.16
      && rect.y <= 0.18
      && rect.w >= 0.24
      && rect.w <= 0.25
      && rect.h >= 0.65
      && rect.h <= 0.67;
  const split16TemplateCameraRect = await readCameraRectMatching('FocuSee split template camera rect', split16Bounds, 15000);
  const hasFocuSeeSplitCameraLayoutBounds = true;
  const youtube16Template = await waitFor(() => document.querySelector('[data-template-id="youtube-16-9"]'), 'FocuSee YouTube 16:9 template preset');
  await waitForButtonEnabled(youtube16Template, 'FocuSee YouTube 16:9 template preset');
  youtube16Template.click();
  await waitFor(() => activeAspectRatio() === '16:9', 'FocuSee YouTube aspect ratio value', 15000);
  await waitFor(() => youtube16Template.getAttribute('aria-pressed') === 'true', 'FocuSee YouTube template selected');
  const youtube16Bounds = (rect) =>
    rect.x >= 0.1
      && rect.x <= 0.11
      && rect.y >= 0.52
      && rect.y <= 0.54
      && rect.w >= 0.2
      && rect.w <= 0.21
      && rect.h >= 0.36
      && rect.h <= 0.37;
  const youtube16TemplateCameraRect = await readCameraRectMatching('FocuSee YouTube template camera rect', youtube16Bounds, 15000);
  const hasFocuSeeYouTubeCameraLayoutBounds = true;
  const mobileTemplate = await waitFor(() => document.querySelector('[data-template-id="mobile-9-16"]'), 'mobile template preset');
  await waitForButtonEnabled(mobileTemplate, 'mobile template preset');
  mobileTemplate.click();
  await waitFor(() => activeAspectRatio() === '9:16', 'vertical aspect ratio value', 15000);
  await waitFor(() => mobileTemplate.getAttribute('aria-pressed') === 'true', 'mobile template selected');
  const mobileTemplateBounds = (rect) =>
    rect.x >= 0.07
      && rect.y >= 0.67
      && rect.w >= 0.82
      && rect.w <= 0.86
      && rect.h >= 0.25
      && rect.h <= 0.28
      && rect.x + rect.w <= 0.94
      && rect.y + rect.h <= 0.98;
  const mobileTemplateCameraRect = await readCameraRectMatching('mobile template camera rect', mobileTemplateBounds, 15000);
  const hasTemplateCameraLayoutBounds = true;
  const hasTemplatePresetSelection = true;

  // Wallpapers live on Background; shadow detail, screen crop, padding and
  // roundness live on Frame.
  document.querySelector('button[aria-label="Background"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Background board"]'), 'background board for presets');
  Array.from(document.querySelectorAll('[aria-label="Background type"] button')).find((button) => button.textContent === 'Wallpaper')?.click();
  const backgroundPreset = await waitFor(() => document.querySelector('button[aria-label="Soft blur"]'), 'background preset');
  await waitForEnabled(backgroundPreset, 'background preset');
  backgroundPreset.click();
  await waitFor(() => document.querySelector('button[aria-label="Soft blur"]')?.getAttribute('aria-pressed') === 'true', 'background preset selected', 15000);
  const hasBackgroundPresetSelection = true;
  const hasNoInactiveBackgroundTabs = !Array.from(document.querySelectorAll('button')).some((button) => button.textContent === 'Image' || button.textContent === 'Video');
  document.querySelector('button[aria-label="Frame"]')?.click();
  await waitFor(() => document.querySelector('[aria-label="Frame board"]'), 'frame board for look controls');
  const hasBackgroundShadowControls = ['Enable shadow', 'Softness', 'Distance', 'Angle'].every((text) => document.body.textContent?.includes(text));
  const hasScreenCropControls = ['Manual screen crop', 'Crop aspect', 'Crop zoom', 'Crop X', 'Crop Y'].every((text) => document.body.textContent?.includes(text));

  const paddingInput = await waitFor(() => inputByLabel('Padding'), 'padding control');
  await waitForEnabled(paddingInput, 'padding control');
  const paddingRangeLabel = paddingInput.closest('label');
  const rangeControl = paddingRangeLabel?.querySelector('.rangeControl');
  const rangeVisual = paddingRangeLabel?.querySelector('.rangeVisual');
  const rangeFill = paddingRangeLabel?.querySelector('.rangeFill');
  const rangeThumb = paddingRangeLabel?.querySelector('.rangeThumb');
  const rangeVisualStyle = rangeVisual ? getComputedStyle(rangeVisual) : null;
  const hasCustomRangeSkin = Boolean(
    rangeControl
      && rangeVisual
      && rangeFill
      && rangeThumb
      && rangeControl.contains(paddingInput)
      && rangeVisualStyle
      && (rangeVisualStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' || rangeVisualStyle.backgroundImage !== 'none')
      && rangeVisualStyle.borderRadius !== '0px',
  );
  setControlValue(paddingInput, 96);
  await waitFor(() => paddingInput.closest('label')?.querySelector('output')?.textContent?.replace(/[^0-9.-]/g, '') === '96', 'padding output');

  const radiusInput = await waitFor(() => inputByLabel('Roundness'), 'corner radius control');
  await waitForEnabled(radiusInput, 'corner radius control');
  const initialCornerRadius = outputTextByLabel('Roundness');
  setControlValue(radiusInput, 44);
  await waitFor(() => outputTextByLabel('Roundness') === '44', 'corner radius output');
  await waitForEnabled(radiusInput, 'corner radius save complete');
  const undoButton = await waitFor(() => {
    const button = document.querySelector('button[aria-label="Undo last edit"]');
    return button && !button.disabled ? button : null;
  }, 'undo button enabled');
  undoButton.click();
  await waitFor(() => initialCornerRadius && outputTextByLabel('Roundness') === initialCornerRadius, 'corner radius undo output');
  await waitFor(() => {
    const control = inputByLabel('Roundness');
    return control && !control.disabled ? control : null;
  }, 'corner radius undo save complete');
  const redoButton = await waitFor(() => {
    const button = document.querySelector('button[aria-label="Redo last edit"]');
    return button && !button.disabled ? button : null;
  }, 'redo button enabled');
  redoButton.click();
  await waitFor(() => outputTextByLabel('Roundness') === '44', 'corner radius redo output');
  const hasUndoRedoControls = true;

  const shadowInput = await waitFor(() => inputByLabel('Softness'), 'shadow softness control');
  await waitForEnabled(shadowInput, 'shadow softness control');
  setControlValue(shadowInput, 72);
  await waitFor(() => shadowInput.closest('label')?.querySelector('output')?.textContent?.replace(/[^0-9.-]/g, '') === '72', 'shadow softness output');

  let cameraPosition = null;
  let cameraShape = null;
  let cameraSize = null;
  let circleCameraRect = null;
  let hasCircleCameraPixelSquare = false;
  let hasCameraCropControls = false;
  let hasRectangleAfterCircleShape = false;
  if (hasCameraPipControls) {
    // Camera controls live on the Camera tab now.
    document.querySelector('button[aria-label="Camera"]')?.click();
    await waitFor(() => document.querySelector('[aria-label="Camera board"]'), 'camera board active for control exercise');
    const cameraLayoutGroup = await waitFor(() => document.querySelector('[aria-label="Camera layout"]'), 'camera layout group');
    const cameraSourceCropGroup = await waitFor(() => document.querySelector('[aria-label="Camera source crop"]'), 'camera source crop group');
    hasCameraCropControls = Boolean(
      controlByLabel(cameraSourceCropGroup, 'Manual crop', 'input[type="checkbox"]') &&
      controlByLabel(cameraSourceCropGroup, 'Aspect', 'select') &&
      controlByLabel(cameraSourceCropGroup, 'Zoom', 'input[type="range"]') &&
      controlByLabel(cameraSourceCropGroup, 'X position', 'input[type="range"]') &&
      controlByLabel(cameraSourceCropGroup, 'Y position', 'input[type="range"]')
    );
    // Position is a grid of buttons; shape is a row of labelled tiles.
    const positionButton = (label) => document.querySelector(`[aria-label="Camera position"] button[aria-label="${label}"]`);
    const topLeft = await waitFor(() => positionButton('Top left'), 'camera position control');
    await waitForButtonEnabled(topLeft, 'camera position control');
    topLeft.click();
    await waitFor(() => positionButton('Top left')?.getAttribute('aria-pressed') === 'true', 'camera position value');
    cameraPosition = 'corner-tl';
    const shapeTile = (label) => Array.from(document.querySelectorAll('[aria-label="Camera shape"] button')).find((button) => button.textContent?.trim() === label);
    const shapePressed = (label) => shapeTile(label)?.getAttribute('aria-pressed') === 'true';
    await waitFor(() => shapeTile('Circle'), 'camera shape control');
    const originalCameraRect = await readCameraRect('camera rect before circle shape change');
    shapeTile('Circle').click();
    await waitFor(() => shapePressed('Circle'), 'camera shape value');
    const firstCircleCameraRect = await readCameraRect('circle camera rect after shape change');
    shapeTile('Square').click();
    await waitFor(() => shapePressed('Square'), 'camera square shape value');
    const squareCameraRect = await readCameraRect('camera rect after returning to square shape');
    hasRectangleAfterCircleShape = Boolean(
      originalCameraRect &&
      squareCameraRect &&
      Math.abs((squareCameraRect.w * 9) - (squareCameraRect.h * 16)) > 0.05
    );
    shapeTile('Circle').click();
    await waitFor(() => shapePressed('Circle'), 'camera final circle shape value');
    cameraShape = 'circle';
    const cameraSizeInput = await waitFor(() => controlByLabel(document.querySelector('[aria-label="Camera board"]'), 'Size', 'input[type="range"]'), 'camera size control');
    await waitForEnabled(cameraSizeInput, 'camera size control');
    setControlValue(cameraSizeInput, 130);
    await waitFor(() => cameraSizeInput.closest('label')?.querySelector('output')?.textContent?.replace(/[^0-9.-]/g, '') === '130', 'camera size output');
    cameraSize = Number(cameraSizeInput.value);
    circleCameraRect = await readCameraRect('circle camera rect after size change');
    hasCircleCameraPixelSquare = Math.abs((circleCameraRect.w * 9) - (circleCameraRect.h * 16)) <= 0.02;
  }

  // Measure canvas render fps during 1s of playback. The draw counter is
  // incremented by tick() in VideoPreview via window.__roughCutCanvasDrawCount.
  window.__roughCutCanvasDrawCount = 0;
  const playBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Play'));
  if (playBtn && !playBtn.disabled) playBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const canvasDrawCount = window.__roughCutCanvasDrawCount ?? 0;
  const canvasRenderFps = Math.round(canvasDrawCount);
  const pauseBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Pause'));
  if (pauseBtn) pauseBtn.click();

  // Export is pick-then-go: choose the Styled look, then press Export.
  const styledFormat = await waitFor(() => {
    const button = document.querySelector('[data-export-format="styled"]');
    return button && !button.disabled ? button : null;
  }, 'styled export format');
  styledFormat.click();
  const exportButton = await waitFor(() => {
    const button = document.querySelector('[data-export-action="export"][data-export-format="styled"]');
    return button && !button.disabled ? button : null;
  }, 'styled export button');
  exportButton.click();
  const hasExportProgressMeter = Boolean(await waitFor(() => document.querySelector('[data-export-progress-meter="true"]'), 'export progress meter', 5000).catch(() => null));

  await waitFor(() => document.body.textContent?.includes('Exported to:'), 'export completion', 30000);

  return {
    ok: true,
    title: document.querySelector('h2')?.textContent ?? null,
    duration: video.duration,
    currentTime: video.currentTime,
    hasPlaybackButton: Boolean(
      Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Play')),
    ),
    exportMode: 'styled',
    hasStyledMode: hasReviewExportActions,
    hasReviewExportActions,
    hasExperimentalHeadlessExportAction,
    hasRawPresetDetails,
    hasStyledPresetDetails,
    hasTemplatePresetSelection,
    hasFocuSeeSplitCameraLayoutBounds,
    split16TemplateCameraRect,
    hasFocuSeeYouTubeCameraLayoutBounds,
    youtube16TemplateCameraRect,
    hasTemplateCameraLayoutBounds,
    mobileTemplateCameraRect,
    hasBackgroundPresetSelection,
    hasNoInactiveBackgroundTabs,
    hasBackgroundShadowControls,
    hasScreenCropControls,
    hasCustomRangeSkin,
    hasZoomMarkerPanel,
    hasTimelineZoomControlPanel,
    hasStableToolSwitchLayout,
    hasZoomResizeHandles,
    hasKeyboardZoomControls,
    hasTimelineLiveRegion,
    hasKeyboardTrimHandles,
    hasNoSetupBoardHorizontalOverflow,
    hasNoAutoZoomDecisionPanel,
    hasGenerateAutoZoomsControl,
    hasInspectorContext,
    hasInspectorGroups,
    hasCursorPresentationControls,
    hasCursorTab,
    hasCameraTab,
    hasExportAspectChip,
    hasCameraPipControls,
    hasCameraCropControls,
    hasCutControls,
    hasStyledPreviewCanvas,
    hasFrameDragHandles,
    hasUndoRedoControls,
    hasStudioShell,
    hasCaptureBar,
    hasNoInertTopBarIcons,
    hasShortcutsDialog,
    hasNoLegacyDeviceRow,
    hasStateBanner,
    hasCentralStage,
    hasTimelineRail,
    hasTimelineScrubber,
    hasKeyboardTimelineScrubber,
    hasTimelineScrubberFineStep,
    hasTimelineArrowKeyAdvance,
    hasTrimHandles,
    hasZoomLane,
    hasClickLane,
    hasCameraLane,
    hasAudioLane,
    hasRightInspector,
    hasExportStatusArea,
    hasExportProgressMeter,
    hasExportResult: document.body.textContent?.includes('Exported to:') ?? false,
    canvasRenderFps,
    aspectRatio: activeAspectRatio(),
    padding: Number(paddingInput.value),
    cornerRadius: Number(radiusInput.value),
    shadowSize: Number(shadowInput.value),
    cameraPosition,
    cameraShape,
    cameraSize,
    circleCameraRect,
    hasCircleCameraPixelSquare,
    hasRectangleAfterCircleShape,
  };

  function rectToRoundedObject(rect) {
    if (!rect) return null;
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function sameRect(a, b) {
    if (!a || !b) return false;
    return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 1);
  }
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
  await waitFor(
    () => document.querySelector('[data-ui-shell="recording-studio"]') || document.querySelector('[data-ui-region="pre-record-panel"]'),
    'recording studio shell or launcher',
  );
  const initialState = document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state');
  const preRecordPanel = document.querySelector('[data-ui-region="pre-record-panel"]');
  if (!preRecordPanel) {
    const recordButton = await waitFor(() => findButton('Record'), 'record button');
    recordButton.click();
  }
  await waitFor(() => document.querySelector('[data-ui-region="pre-record-panel"]'), 'pre-record panel');
  await waitFor(() => document.querySelector('[data-open-editor="pre-record"]'), 'pre-record open editor button');
  const preflightPanel = await waitFor(() => document.querySelector('[data-ui-region="recording-preflight-status"]'), 'preflight status panel');
  const hasPreflightWarningsCopy = document.body.textContent?.includes('screen-only recording') ?? false;
  // One row: a live card per screen plus Region. The region overlay itself is
  // exercised by scripts/visual-region-selector-playwright.mjs.
  const sourcePicker = await waitFor(() => document.querySelector('[data-ui-region="capture-source-picker"]'), 'capture source picker');
  const captureTargetSelect = { get value() { return sourcePicker.getAttribute('data-capture-mode'); } };
  await waitFor(() => document.querySelector('[data-source-option="region"]'), 'region source card');
  const screenCards = await waitFor(() => {
    const cards = document.querySelectorAll('[data-screen-option]');
    return cards.length > 0 ? cards : null;
  }, 'screen cards');
  // A previous run may have left Region picked; clicking a screen card must
  // always switch back to recording that whole screen.
  const lastScreenCard = screenCards[screenCards.length - 1];
  lastScreenCard.click();
  await waitFor(() => captureTargetSelect.value === 'display', 'display target selected');
  await waitFor(() => lastScreenCard.getAttribute('aria-pressed') === 'true', 'screen card selected');
  const hasNoRegionNumberInputs = !document.querySelector('.numberField, .regionControls input[type="number"]');
  const hasCaptureSourcePicker = Boolean(sourcePicker);
  const hasDisabledWindowSource = !document.querySelector('[data-source-option="window"]');
  if (options.audioGainOnly) {
    await waitFor(() => {
      const mic = document.querySelector('select[aria-label="Mic source"]');
      const system = document.querySelector('select[aria-label="System source"]');
      const micCount = mic ? Array.from(mic.options).filter((option) => option.value && option.value !== '__off' && !option.disabled).length : 0;
      const systemCount = system ? Array.from(system.options).filter((option) => option.value && option.value !== '__off' && !option.disabled).length : 0;
      return micCount > 0 && systemCount > 0;
    }, 'smoke audio source options');
  }
  const micSelect = document.querySelector('select[aria-label="Mic source"]');
  const systemSelect = document.querySelector('select[aria-label="System source"]');
  let hasMicAudioGainControl = false;
  let micAudioGainValue = null;
  let exercisedMicAudioGainControl = false;
  let hasSystemAudioGainControl = false;
  let systemAudioGainValue = null;
  let exercisedSystemAudioGainControl = false;
  let hasMicAudioWaveform = false;
  let hasCustomAudioGainRangeSkin = false;
  const selectableMicOption = micSelect
    ? Array.from(micSelect.options).find((option) => option.value && option.value !== '__off' && !option.disabled)
    : null;
  const selectableSystemOption = systemSelect
    ? Array.from(systemSelect.options).find((option) => option.value && option.value !== '__off' && !option.disabled)
    : null;
  const micOptionCount = micSelect ? Array.from(micSelect.options).filter((option) => option.value && option.value !== '__off' && !option.disabled).length : 0;
  const systemOptionCount = systemSelect ? Array.from(systemSelect.options).filter((option) => option.value && option.value !== '__off' && !option.disabled).length : 0;
  if (micSelect && systemSelect && selectableMicOption && selectableSystemOption) {
    micSelect.value = selectableMicOption.value;
    micSelect.dispatchEvent(new Event('change', { bubbles: true }));
    systemSelect.value = selectableSystemOption.value;
    systemSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const micGainControl = await waitFor(() => document.querySelector('[data-ui-region="mic-audio-gain"]'), 'mic audio gain control');
    const systemGainControl = await waitFor(() => document.querySelector('[data-ui-region="system-audio-gain"]'), 'system audio gain control');
    const waveformControl = await waitFor(() => document.querySelector('[data-ui-region="mic-audio-waveform"]'), 'mic audio waveform');
    const micGainInput = micGainControl?.querySelector('input[type="range"]');
    const systemGainInput = systemGainControl?.querySelector('input[type="range"]');
    if (micGainInput) {
      micGainInput.value = '150';
      micGainInput.dispatchEvent(new Event('input', { bubbles: true }));
      micGainInput.dispatchEvent(new Event('change', { bubbles: true }));
      hasMicAudioGainControl = true;
      micAudioGainValue = Number(micGainInput.value);
      exercisedMicAudioGainControl = micAudioGainValue === 150;
    }
    if (systemGainInput) {
      systemGainInput.value = '50';
      systemGainInput.dispatchEvent(new Event('input', { bubbles: true }));
      systemGainInput.dispatchEvent(new Event('change', { bubbles: true }));
      hasSystemAudioGainControl = true;
      systemAudioGainValue = Number(systemGainInput.value);
      exercisedSystemAudioGainControl = systemAudioGainValue === 50;
    }
    hasMicAudioWaveform = Boolean(waveformControl?.querySelector('.audioLevelMeter span'));
    hasCustomAudioGainRangeSkin = Boolean(
      micGainControl?.querySelector('.rangeVisual .rangeFill')
        && micGainControl?.querySelector('.rangeVisual .rangeThumb')
        && systemGainControl?.querySelector('.rangeVisual .rangeFill')
        && systemGainControl?.querySelector('.rangeVisual .rangeThumb'),
    );
  } else {
    hasMicAudioGainControl = Boolean(document.querySelector('[data-ui-region="mic-audio-gain"]'));
    hasSystemAudioGainControl = Boolean(document.querySelector('[data-ui-region="system-audio-gain"]'));
    hasMicAudioWaveform = Boolean(document.querySelector('[data-ui-region="mic-audio-waveform"] .audioLevelMeter span'));
  }
  let hasInvalidRegionRejected = !options.invalidRegion;
  if (options.audioGainOnly) {
    return {
      ok: true,
      audioGainOnly: true,
      hasPreRecordPanel: true,
      hasPreflightPanel: Boolean(preflightPanel),
      hasCaptureTargetSelect: Boolean(captureTargetSelect),
      hasCaptureSourcePicker,
      hasDisabledWindowSource,
      hasMicAudioGainControl,
      micAudioGainValue,
      exercisedMicAudioGainControl,
      hasSystemAudioGainControl,
      systemAudioGainValue,
      exercisedSystemAudioGainControl,
      hasMicAudioWaveform,
      hasCustomAudioGainRangeSkin,
      micOptionCount,
      systemOptionCount,
      hasNoRegionNumberInputs,
      hasInvalidRegionRejected,
      selectedCaptureTarget: captureTargetSelect.value,
      initialState,
    };
  }
  if (options.invalidRegion) {
    try {
      await window.roughCut.startRecording({ captureRegion: { mode: 'region', x: 1900, y: 100, width: 400, height: 300 } });
      hasInvalidRegionRejected = false;
      await window.roughCut.cancelRecording().catch(() => undefined);
    } catch (err) {
      hasInvalidRegionRejected = /outside the attached display bounds|Capture region is invalid/.test(err?.message ?? String(err));
    }
  }
  let selectedCameraSource = null;
  if (options.cameraWarning) {
    const cameraSelect = await waitFor(() => document.querySelector('select[aria-label="Camera source"]'), 'camera source select');
    const cameraOption = await waitFor(
      () => Array.from(cameraSelect.options).find((option) => option.value && option.value !== '__off' && !option.disabled),
      'camera source option',
    );
    selectedCameraSource = cameraOption.value;
    cameraSelect.value = selectedCameraSource;
    cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => cameraSelect.value === selectedCameraSource, 'camera source selected');
  }
  const hasPreRecordCameraSetup = options.cameraWarning
    ? Boolean(await waitFor(() => document.querySelector('[data-ui-region="pre-record-camera-setup"]'), 'pre-record camera setup'))
    : Boolean(document.querySelector('[data-ui-region="pre-record-camera-setup"]'));
  const preRecordCameraPreviewState = options.cameraWarning
    ? await waitFor(() => document.querySelector('[data-camera-preview-state]')?.getAttribute('data-camera-preview-state'), 'camera preview state', 15000)
    : document.querySelector('[data-camera-preview-state]')?.getAttribute('data-camera-preview-state') ?? null;
  const startButton = await waitFor(() => document.querySelector('[data-recording-start="pre-record"]'), 'pre-record start button');
  startButton.click();
  await waitFor(() => document.querySelector('[data-recording-state="recording"]'), 'recording state banner');
  const liveCameraFailureBanner = options.cameraWarning
    ? await waitFor(() => document.querySelector('[data-ui-region="recording-camera-failure"]'), 'live camera failure banner', 15000)
    : document.querySelector('[data-ui-region="recording-camera-failure"]');
  const hasLiveCameraFailureBanner = Boolean(liveCameraFailureBanner);
  const hasLiveCameraFailureActions = Boolean(liveCameraFailureBanner)
    && ['Stop and retry with camera off', 'Continue screen-only'].every((label) => liveCameraFailureBanner.textContent?.includes(label));
  await new Promise((resolve) => setTimeout(resolve, 1800));
  let hasRestartedState = false;
  if (options.restart) {
    const beforeRestartStatus = await window.roughCut.getRecordingStatus();
    const beforeRestartPath = beforeRestartStatus?.state === 'recording' ? beforeRestartStatus.outputPath : null;
    const restartButton = await waitFor(() => document.querySelector('[data-recording-action="restart"]:not(:disabled)'), 'restart button');
    restartButton.click();
    await waitFor(async () => {
      const status = await window.roughCut.getRecordingStatus();
      return status?.state === 'recording'
        && status.outputPath
        && status.outputPath !== beforeRestartPath
        && document.querySelector('[data-recording-state="recording"]')
        && document.querySelector('[data-recording-action="pause-resume"]:not(:disabled)');
    }, 'restarted recording state', 30000);
    hasRestartedState = true;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  let hasPausedState = false;
  let hasResumedState = false;
  if (options.pauseResume) {
    const pauseButton = await waitFor(() => document.querySelector('[data-recording-action="pause-resume"]:not(:disabled)'), 'pause button');
    pauseButton.click();
    await waitFor(() => document.querySelector('[data-recording-state="paused"]'), 'paused recording state', 30000);
    hasPausedState = true;
    const resumeButton = await waitFor(() => document.querySelector('[data-recording-action="pause-resume"]:not(:disabled)'), 'resume button');
    resumeButton.click();
    await waitFor(() => document.querySelector('[data-recording-state="recording"]'), 'resumed recording state', 30000);
    hasResumedState = true;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  if (options.cancelFlow) {
    const cancelButton = await waitFor(() => findButton('Cancel and discard'), 'cancel button');
    cancelButton.click();
    await waitFor(() => document.querySelector('[data-recording-state="idle"]'), 'idle recording state after cancel', 30000);
    return {
      ok: true,
      hasStudioShell: Boolean(document.querySelector('[data-ui-shell="recording-studio"]')),
      hasPreRecordPanel: true,
      hasPreflightPanel: Boolean(preflightPanel),
      hasPreflightWarningsCopy,
      hasCaptureTargetSelect: Boolean(captureTargetSelect),
      hasCaptureSourcePicker,
      hasDisabledWindowSource,
      hasMicAudioGainControl,
      micAudioGainValue,
      exercisedMicAudioGainControl,
      hasSystemAudioGainControl,
      systemAudioGainValue,
      exercisedSystemAudioGainControl,
      hasMicAudioWaveform,
      hasCustomAudioGainRangeSkin,
      micOptionCount,
      systemOptionCount,
      hasNoRegionNumberInputs,
      hasInvalidRegionRejected,
      selectedCaptureTarget: captureTargetSelect.value,
      initialState,
      canceledState: document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state'),
      hasSavedMessage: document.body.textContent?.includes('Saved to:') ?? false,
      hasReviewWorkspace: Boolean(document.querySelector('[data-ui-region="post-recording-review"]')),
      hasVideo: Boolean(document.querySelector('[data-ui-region="editor-workspace"] video')),
      cancelFlow: true,
      hasLiveCameraFailureBanner,
      hasLiveCameraFailureActions,
      pauseResumeFlow: Boolean(options.pauseResume),
      hasPausedState,
      hasResumedState,
    };
  }

  const stopButton = await waitFor(() => findButton('Stop recording'), 'stop button');
  stopButton.click();
  await waitFor(() => stopButton.textContent.includes('Stopping...') && stopButton.disabled, 'stopping lock');
  if (options.doubleStop) {
    stopButton.click();
  }
  await waitFor(() => document.querySelector('[data-recording-state="saved"]'), 'saved recording state', 30000);
  const savedState = document.querySelector('[data-ui-region="state-banner"]')?.getAttribute('data-recording-state');
  const hasSavedMessage = document.body.textContent?.includes('Saved to:') ?? false;
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  const video = document.querySelector('video');
  const hasCentralStage = Boolean(document.querySelector('[data-ui-region="central-stage"]'));
  const hasTimelineRail = Boolean(document.querySelector('[data-ui-region="timeline-review-rail"]'));
  const hasRightInspector = Boolean(document.querySelector('[data-ui-region="right-inspector"]'));
  const reviewWorkspace = document.querySelector('[data-ui-region="post-recording-review"]');
  const hasReviewWorkspace = Boolean(reviewWorkspace);
  const rectJson = (rect) => rect ? {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  } : null;
  const editorWorkspaceRect = document.querySelector('[data-ui-region="editor-workspace"]')?.getBoundingClientRect();
  const centralStageRect = document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect();
  const timelineRailRect = document.querySelector('[data-ui-region="timeline-review-rail"]')?.getBoundingClientRect();
  const hasVisibleReviewWorkspace = Boolean(
    editorWorkspaceRect
      && centralStageRect
      && timelineRailRect
      && editorWorkspaceRect.width > 0
      && editorWorkspaceRect.height > 0
      && centralStageRect.width > 0
      && centralStageRect.height > 0
      && timelineRailRect.width > 0
      && timelineRailRect.height > 0,
  );
  const savedBannerRect = document.querySelector('[data-recording-state="saved"]')?.getBoundingClientRect();
  const savedBannerHidden = !savedBannerRect || savedBannerRect.width === 0 || savedBannerRect.height === 0;
  const hasPostRecordingActions = Boolean(document.querySelector('[data-ui-region="post-recording-actions"]'));
  const hasReviewExportActions = Boolean(document.querySelector('[data-export-format="styled"]') && document.querySelector('[data-export-format="raw"]') && document.querySelector('[data-export-action="export"]'));
  const reviewLinkText = document.querySelector('[data-ui-region="post-recording-review"] .exportLinks')?.textContent ?? '';
  const hasReviewNextActions = ['Recording folder', 'Diagnostics', 'Project file', 'New take'].every((label) => reviewLinkText.includes(label));
  const reviewCameraWarningText = document.querySelector('[data-review-warning="camera"]')?.textContent ?? '';
  const hasReviewCameraWarning = reviewCameraWarningText.includes('Screen recording preserved') && reviewCameraWarningText.includes('without webcam PiP');
  const hasStateCameraWarning = document.body.textContent?.includes('Camera was unavailable') ?? false;
  const hasStudioShell = Boolean(document.querySelector('[data-ui-shell="recording-studio"]'));

  return {
    ok: true,
    hasStudioShell,
    hasPreRecordPanel: true,
    hasPreflightPanel: Boolean(preflightPanel),
    hasPreflightWarningsCopy,
    hasCaptureTargetSelect: Boolean(captureTargetSelect),
    hasCaptureSourcePicker,
    hasDisabledWindowSource,
    hasMicAudioGainControl,
    micAudioGainValue,
    exercisedMicAudioGainControl,
    hasSystemAudioGainControl,
    systemAudioGainValue,
    exercisedSystemAudioGainControl,
    hasMicAudioWaveform,
    hasCustomAudioGainRangeSkin,
    micOptionCount,
    systemOptionCount,
    hasNoRegionNumberInputs,
    hasInvalidRegionRejected,
    selectedCaptureTarget: captureTargetSelect.value,
    initialState,
    savedState,
    hasSavedMessage,
    hasProjectTitle: Boolean(document.querySelector('h2')?.textContent),
    hasCentralStage,
    hasTimelineRail,
    hasRightInspector,
    hasReviewWorkspace,
    hasVisibleReviewWorkspace,
    reviewWorkspaceGeometry: {
      editorWorkspace: rectJson(editorWorkspaceRect),
      centralStage: rectJson(centralStageRect),
      timelineRail: rectJson(timelineRailRect),
    },
    savedBannerHidden,
    hasPostRecordingActions,
    hasReviewExportActions,
    hasReviewNextActions,
    selectedCameraSource,
    hasPreRecordCameraSetup,
    preRecordCameraPreviewState,
    hasReviewCameraWarning,
    hasStateCameraWarning,
    hasLiveCameraFailureBanner,
    hasLiveCameraFailureActions,
    hasStyledPreviewCanvas: Boolean(canvas),
    hasVideo: Boolean(video),
    duration: video?.duration ?? null,
    doubleStop: Boolean(options.doubleStop),
    restartFlow: Boolean(options.restart),
    hasRestartedState,
    pauseResumeFlow: Boolean(options.pauseResume),
    hasPausedState,
    hasResumedState,
    hasStoppingLock: true,
  };
}

async function runRendererEditorLoadedSmoke() {
  const waitFor = async (predicate, label, timeoutMs = 30000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}; body=${document.body.innerText.slice(0, 800)}`);
  };

  await waitFor(() => document.querySelector('[data-ui-shell="recording-studio"]'), 'post-recording editor shell');
  await waitFor(() => document.querySelector('canvas.styledPreviewCanvas'), 'post-recording preview canvas');
  await waitFor(() => document.querySelector('video'), 'post-recording video');
  await waitFor(() => document.querySelector('[data-ui-region="post-recording-review"]'), 'post-recording review workspace');
  const reviewCameraWarningText = document.querySelector('[data-review-warning="camera"]')?.textContent ?? '';
  const rectJson = (rect) => rect ? {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  } : null;
  const editorWorkspaceRect = document.querySelector('[data-ui-region="editor-workspace"]')?.getBoundingClientRect();
  const centralStageRect = document.querySelector('[data-ui-region="central-stage"]')?.getBoundingClientRect();
  const timelineRailRect = document.querySelector('[data-ui-region="timeline-review-rail"]')?.getBoundingClientRect();
  const hasVisibleReviewWorkspace = Boolean(
    editorWorkspaceRect
      && centralStageRect
      && timelineRailRect
      && editorWorkspaceRect.width > 0
      && editorWorkspaceRect.height > 0
      && centralStageRect.width > 0
      && centralStageRect.height > 0
      && timelineRailRect.width > 0
      && timelineRailRect.height > 0,
  );
  const savedBannerRect = document.querySelector('[data-recording-state="saved"]')?.getBoundingClientRect();
  const savedBannerHidden = !savedBannerRect || savedBannerRect.width === 0 || savedBannerRect.height === 0;

  return {
    hasStudioShell: Boolean(document.querySelector('[data-ui-shell="recording-studio"]')),
    hasCentralStage: Boolean(document.querySelector('[data-ui-region="central-stage"]')),
    hasTimelineRail: Boolean(document.querySelector('[data-ui-region="timeline-review-rail"]')),
    hasRightInspector: Boolean(document.querySelector('[data-ui-region="right-inspector"]')),
    hasReviewWorkspace: Boolean(document.querySelector('[data-ui-region="post-recording-review"]')),
    hasPostRecordingActions: Boolean(document.querySelector('[data-ui-region="post-recording-actions"]')),
    hasReviewExportActions: Boolean(document.querySelector('[data-export-format="styled"]') && document.querySelector('[data-export-format="raw"]') && document.querySelector('[data-export-action="export"]')),
    hasReviewNextActions: ['Recording folder', 'Diagnostics', 'Project file', 'New take'].every((label) => (document.querySelector('[data-ui-region="post-recording-review"] .exportLinks')?.textContent ?? '').includes(label)),
    hasReviewCameraWarning: reviewCameraWarningText.includes('Screen recording preserved') && reviewCameraWarningText.includes('without webcam PiP'),
    hasVisibleReviewWorkspace,
    reviewWorkspaceGeometry: {
      editorWorkspace: rectJson(editorWorkspaceRect),
      centralStage: rectJson(centralStageRect),
      timelineRail: rectJson(timelineRailRect),
    },
    savedBannerHidden,
    hasStyledPreviewCanvas: Boolean(document.querySelector('canvas.styledPreviewCanvas')),
    hasVideo: Boolean(document.querySelector('video')),
    duration: document.querySelector('video')?.duration ?? null,
  };
}
