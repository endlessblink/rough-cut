import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  session,
  desktopCapturer,
  screen,
  systemPreferences,
} from 'electron';
import { join, dirname, basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import {
  existsSync,
  mkdirSync,
  statSync,
  createReadStream,
  readdirSync,
  createWriteStream,
} from 'node:fs';
import { promisify } from 'node:util';
import { execFile as execFileCallback, execFileSync, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import {
  getSources,
  muxAudioIntoRecording,
  probeRecordingResult,
  reconcileSelectedSourceId,
  saveRecording,
  saveRecordingFromFile,
} from './recording/capture-service.mjs';
import {
  listSystemAudioSources,
  discoverAudioSources,
  getSourceVolumePercent,
  setSourceVolumePercent,
} from './recording/audio-sources.mjs';
import {
  snapshotIfFirstTouch,
  restoreAllSourceVolumesSync,
} from './recording/source-volume-registry.mjs';
import { initSessionManager, getLastFinalizedRecordingResult } from './recording/recording-session-manager.mjs';
import { resolveCaptureSourceInfo } from './recording/resolve-capture-source-info.mjs';
import {
  clearRecordingRecoveryMarker,
  readRecordingRecoveryMarker,
  writeRecordingRecoveryMarker,
} from './recording/recovery-state.mjs';
import {
  getRecentProjects,
  addRecentProject,
  removeRecentProject,
  clearRecentProjects,
  getRecordingLocation,
  setRecordingLocation,
  getAutoZoomIntensity,
  setAutoZoomIntensity,
  getFavoriteLocations,
  addFavoriteLocation,
  removeFavoriteLocation,
  DEFAULT_RECORDING_CONFIG,
  getRecordingConfig,
  setRecordingConfig,
} from './recent-projects-service.mjs';
import { registerAIHandlers } from './ai/ai-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE_ROOT = resolve(__dirname, '../../../..');
const DEFAULT_RUNTIME_LOG_PATH = join(WORKSPACE_ROOT, '.logs', 'app-runtime.log');
const CLICK_SOUND_ASSET_PATH = join(WORKSPACE_ROOT, 'aseets', 'mouse-click-1.wav');
const CLICK_SOUND_SAMPLE_RATE = 48_000;

function getRendererBaseUrl() {
  return (process.env.ROUGH_CUT_RENDERER_URL ?? 'http://127.0.0.1:7544').replace(/\/+$/, '');
}

function getRendererUrl(path = '/') {
  const baseUrl = getRendererBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

let runtimeLogMirrorInstalled = false;
let runtimeLogStream = null;

function normalizeRuntimeLogChunk(chunk, encoding) {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8');
  }
  return String(chunk);
}

function installRuntimeLogMirror() {
  if (runtimeLogMirrorInstalled) return;
  runtimeLogMirrorInstalled = true;

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const requestedPath = process.env.ROUGH_CUT_RUNTIME_LOG_PATH?.trim();
  const logPath = requestedPath
    ? (isAbsolute(requestedPath) ? requestedPath : resolve(WORKSPACE_ROOT, requestedPath))
    : DEFAULT_RUNTIME_LOG_PATH;

  try {
    mkdirSync(dirname(logPath), { recursive: true });
    runtimeLogStream = createWriteStream(logPath, { flags: 'a' });
  } catch (error) {
    originalStderrWrite(`[runtime-log] Failed to initialize ${logPath}: ${error?.message ?? error}\n`);
    return;
  }

  runtimeLogStream.on('error', (error) => {
    originalStderrWrite(`[runtime-log] Stream error for ${logPath}: ${error?.message ?? error}\n`);
    runtimeLogStream = null;
  });

  const mirrorChunk = (chunk, encoding) => {
    if (!runtimeLogStream) return;

    try {
      runtimeLogStream.write(normalizeRuntimeLogChunk(chunk, encoding));
    } catch (error) {
      originalStderrWrite(
        `[runtime-log] Failed to append to ${logPath}: ${error?.message ?? error}\n`,
      );
    }
  };

  process.stdout.write = function patchedStdoutWrite(chunk, encoding, callback) {
    mirrorChunk(chunk, encoding);
    return originalStdoutWrite(chunk, encoding, callback);
  };

  process.stderr.write = function patchedStderrWrite(chunk, encoding, callback) {
    mirrorChunk(chunk, encoding);
    return originalStderrWrite(chunk, encoding, callback);
  };

  runtimeLogStream.write(`\n=== Rough Cut runtime started ${new Date().toISOString()} pid=${process.pid} ===\n`);
  process.stderr.write(`[runtime-log] Mirroring app output to ${logPath}\n`);
  process.on('exit', () => runtimeLogStream?.end());
}

installRuntimeLogMirror();

if (!app.isPackaged) {
  // Dev-only stability workaround: this workstation intermittently crashes
  // Electron's GPU process before the app becomes usable. Disable GPU in dev
  // so recorder debugging can proceed on a stable runtime.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
  // Forward renderer console (including errors) to stderr of the main process.
  app.commandLine.appendSwitch('enable-logging', 'stderr');
}

let mainWindow = null;
let currentExportFinalizeProcess = null;
let cachedCaptureSources = [];
let debugCaptureSourcesOverride = null;
let debugDisplayBoundsOverride = null;
let debugRecordingPreflightStatusOverride = null;
let debugRecordingPermissionSettingsResultOverride = null;
let lastDisplayMediaSelection = null;
let cachedX11MonitorLayout = null;
const execFile = promisify(execFileCallback);

function isLinuxX11Session() {
  return (
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'x11' ||
      (process.env.DISPLAY !== undefined && process.env.DISPLAY !== ''))
  );
}

function normalizeX11DisplayName(displayName = process.env.DISPLAY || ':0') {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';
  if (!trimmed) return ':0.0';
  if (/\.\d+$/.test(trimmed)) return trimmed;
  return `${trimmed}.0`;
}

function parseX11MonitorsDiagnostic(output) {
  if (typeof output !== 'string' || output.trim() === '') return [];

  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\d+:\s+\S+\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)\s+(\S+)$/);
      if (!match) return null;
      return {
        width: Number(match[1]),
        height: Number(match[2]),
        x: Number(match[3]),
        y: Number(match[4]),
        name: match[5],
      };
    })
    .filter(Boolean);
}

function readX11MonitorLayoutSync() {
  if (!isLinuxX11Session()) return null;

  try {
    const stdout = execFileSync('xrandr', ['--listmonitors'], {
      encoding: 'utf-8',
      timeout: 2000,
    });
    const parsed = parseX11MonitorsDiagnostic(stdout);
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function getCurrentX11MonitorLayout() {
  return cachedX11MonitorLayout ?? readX11MonitorLayoutSync();
}

function resolveX11MonitorBounds(display, allDisplays = []) {
  const x11Monitors = getCurrentX11MonitorLayout();
  if (!x11Monitors || x11Monitors.length === 0) return null;

  const label = typeof display?.label === 'string' ? display.label.trim() : '';
  if (label) {
    const matchedByLabel = x11Monitors.find((monitor) => monitor.name === label);
    if (matchedByLabel) return matchedByLabel;
  }

  if (Array.isArray(allDisplays) && allDisplays.length === x11Monitors.length) {
    const sortedDisplays = [...allDisplays].sort(
      (a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y,
    );
    const sortedMonitors = [...x11Monitors].sort((a, b) => a.x - b.x || a.y - b.y);
    const displayIndex = sortedDisplays.findIndex((candidate) => candidate.id === display?.id);
    if (displayIndex >= 0) {
      return sortedMonitors[displayIndex] ?? null;
    }
  }

  return null;
}

function normalizeSupportedRecordMode(recordMode) {
  return recordMode === 'window' ? 'window' : 'fullscreen';
}

function normalizeSupportedRecordingConfig(config = {}) {
  const next = { ...DEFAULT_RECORDING_CONFIG, ...config };
  const recordMode = normalizeSupportedRecordMode(next.recordMode);
  const selectedSourceId = isSourceIdCompatibleWithMode(next.selectedSourceId, recordMode)
    ? next.selectedSourceId
    : null;

  return {
    ...next,
    recordMode,
    selectedSourceId,
  };
}

const persistedRecordingConfig = { ...DEFAULT_RECORDING_CONFIG, ...getRecordingConfig() };
let recordingConfig = normalizeSupportedRecordingConfig(persistedRecordingConfig);

if (JSON.stringify(recordingConfig) !== JSON.stringify(persistedRecordingConfig)) {
  setRecordingConfig(recordingConfig);
}

function getCaptureSourceTypeForMode(recordMode) {
  return recordMode === 'window' ? 'window' : 'screen';
}

function getSourceTypeFromId(sourceId) {
  if (!sourceId || typeof sourceId !== 'string') return null;
  return sourceId.startsWith('screen:') ? 'screen' : 'window';
}

function isSourceIdCompatibleWithMode(sourceId, recordMode) {
  const sourceType = getSourceTypeFromId(sourceId);
  return sourceType === getCaptureSourceTypeForMode(recordMode);
}

function getPermissionSettingsUrl(kind) {
  if (process.platform === 'darwin') {
    if (kind === 'screenCapture') {
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    }
    if (kind === 'microphone') {
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';
    }
    if (kind === 'camera') {
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera';
    }
  }

  if (process.platform === 'win32') {
    if (kind === 'microphone') return 'ms-settings:privacy-microphone';
    if (kind === 'camera') return 'ms-settings:privacy-webcam';
    if (kind === 'screenCapture') return 'ms-settings:privacy-broadfilesystemaccess';
  }

  return null;
}

function getMediaPermissionStatus(kind) {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      return systemPreferences.getMediaAccessStatus(kind);
    } catch {
      return 'not-determined';
    }
  }
  return 'granted';
}

function normalizePermissionDiagnostic(kind, status) {
  const canOpenSettings = getPermissionSettingsUrl(kind) !== null;
  if (process.platform === 'linux') {
    return {
      status: 'not-required',
      detail: 'No OS privacy gate is required here; use the preflight test to verify devices.',
      canOpenSettings: false,
    };
  }

  if (status === 'granted') {
    return {
      status: 'granted',
      detail: 'Ready.',
      canOpenSettings,
    };
  }

  return {
    status: 'attention',
    detail: 'Needs OS permission before recording will be reliable.',
    canOpenSettings,
  };
}

function buildRecordingPreflightStatus() {
  if (debugRecordingPreflightStatusOverride) {
    return debugRecordingPreflightStatusOverride;
  }

  const screenStatus =
    process.platform === 'darwin' ? getMediaPermissionStatus('screen') : 'granted';
  const microphoneStatus = getMediaPermissionStatus('microphone');
  const cameraStatus = getMediaPermissionStatus('camera');

  return {
    platform: process.platform,
    requiresFullRelaunch: process.platform === 'darwin',
    screenCapture: normalizePermissionDiagnostic('screenCapture', screenStatus),
    microphone: normalizePermissionDiagnostic('microphone', microphoneStatus),
    camera: normalizePermissionDiagnostic('camera', cameraStatus),
  };
}

function pickSourceForRecordMode(sources, recordMode, selectedSourceId, cachedSelectedSource) {
  const expectedType = getCaptureSourceTypeForMode(recordMode);
  const compatibleSources = sources.filter((source) => {
    const sourceType = source.id.startsWith('screen:') ? 'screen' : 'window';
    return sourceType === expectedType;
  });

  const compatibleSelectedSourceId = isSourceIdCompatibleWithMode(selectedSourceId, recordMode)
    ? selectedSourceId
    : null;

  if (!compatibleSelectedSourceId) {
    return null;
  }

  const source =
    compatibleSources.find((item) => item.id === compatibleSelectedSourceId) ??
    compatibleSources.find((item) => matchDesktopCaptureSource(item, cachedSelectedSource));

  return source ?? null;
}

function getDefaultSourceIdForRecordMode(sources, recordMode) {
  if (recordMode !== 'fullscreen') {
    return null;
  }

  return sources.find((source) => getSourceTypeFromId(source.id) === 'screen')?.id ?? null;
}

function applyDefaultSourceSelection(config, sources, options = {}) {
  const { preferFullscreenDefault = false } = options;
  if (config.selectedSourceId) {
    return config;
  }

  if (!preferFullscreenDefault && config.recordMode !== 'fullscreen') {
    return config;
  }

  const defaultSourceId = getDefaultSourceIdForRecordMode(sources, config.recordMode);
  if (!defaultSourceId) {
    return config;
  }

  return {
    ...config,
    selectedSourceId: defaultSourceId,
  };
}

function broadcastRecordingConfig() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.RECORDING_CONFIG_CHANGED, recordingConfig);
    }
  }
}

function applyRecordingConfigPatch(patch = {}) {
  const nextPatch = {};
  for (const key of Object.keys(DEFAULT_RECORDING_CONFIG)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      nextPatch[key] = patch[key];
    }
  }
  const normalizedConfig = normalizeSupportedRecordingConfig({ ...recordingConfig, ...nextPatch });
  const shouldPreferFullscreenDefault =
    Object.prototype.hasOwnProperty.call(nextPatch, 'recordMode') &&
    normalizedConfig.recordMode === 'fullscreen';
  recordingConfig = shouldPreferFullscreenDefault
    ? applyDefaultSourceSelection(normalizedConfig, cachedCaptureSources, {
        preferFullscreenDefault: true,
      })
    : normalizedConfig;
  setRecordingConfig(recordingConfig);
  return recordingConfig;
}

function reconcileCaptureSources(nextSources) {
  const reconciledSelectedSourceId = reconcileSelectedSourceId(
    cachedCaptureSources,
    nextSources,
    recordingConfig.selectedSourceId,
  );
  const nextSelectedSourceId = reconciledSelectedSourceId;
  cachedCaptureSources = nextSources;

  if (nextSelectedSourceId !== recordingConfig.selectedSourceId) {
    applyRecordingConfigPatch({ selectedSourceId: nextSelectedSourceId });
    broadcastRecordingConfig();
  }

  return nextSelectedSourceId;
}

function getAvailableCaptureSources() {
  return debugCaptureSourcesOverride ?? cachedCaptureSources;
}

function matchDesktopCaptureSource(source, cachedSource) {
  if (!cachedSource) return false;
  if (source.id === cachedSource.id) return true;
  if (cachedSource.displayId && source.display_id) {
    return source.display_id === cachedSource.displayId;
  }
  const sourceType = source.id.startsWith('screen:') ? 'screen' : 'window';
  return sourceType === cachedSource.type && source.name === cachedSource.name;
}

function getDisplayCaptureBounds(display, allDisplays = []) {
  const scaleFactor =
    Number.isFinite(display?.scaleFactor) && display.scaleFactor > 0 ? display.scaleFactor : 1;
  const bounds = display?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const useRawBoundsForX11 = isLinuxX11Session();

  if (useRawBoundsForX11) {
    const x11Bounds = resolveX11MonitorBounds(display, allDisplays);
    if (x11Bounds) {
      return {
        x: x11Bounds.x,
        y: x11Bounds.y,
        width: x11Bounds.width,
        height: x11Bounds.height,
        scaleFactor,
      };
    }

    return {
      x: Math.floor(bounds.x),
      y: Math.floor(bounds.y),
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
      scaleFactor,
    };
  }

  return {
    x: Math.floor(bounds.x * scaleFactor),
    y: Math.floor(bounds.y * scaleFactor),
    width: Math.ceil(bounds.width * scaleFactor),
    height: Math.ceil(bounds.height * scaleFactor),
    scaleFactor,
  };
}

/**
 * TASK-183: fetch X11's view of the monitor layout so logs can compare it to
 * Electron's `screen.getAllDisplays()` output. If Electron and xrandr disagree,
 * the FFmpeg `-video_size` and `+X,Y` offset derived from Electron bounds will
 * crop or mis-position the capture on the physical display.
 *
 * @returns {Promise<string | null>} Raw stdout from `xrandr --listmonitors`, or
 *   null when xrandr isn't available or this isn't Linux/X11.
 */
async function getX11MonitorsDiagnostic() {
  if (!isLinuxX11Session()) {
    return null;
  }
  try {
    const { stdout } = await execFile('xrandr', ['--listmonitors'], { timeout: 2000 });
    return stdout.trim();
  } catch (err) {
    return `xrandr unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function getDefaultProjectDir() {
  return join(app.getPath('documents'), 'Rough Cut');
}

function sanitizeFileStem(value) {
  return (value || 'rough-cut-export').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'rough-cut-export';
}

function getDefaultRecordingsDir() {
  return join(getDefaultProjectDir(), 'recordings');
}

const PROJECT_FILE_FILTER = { name: 'Rough Cut Project', extensions: ['roughcut'] };
const LIBRARY_FILE_FILTER = { name: 'Rough Cut Library', extensions: ['roughcutlib'] };

function getRecordingSearchDirs() {
  const dirs = [];
  const configuredLocation = getRecordingLocation();
  if (configuredLocation) dirs.push(configuredLocation);

  const defaultRecordingsDir = getDefaultRecordingsDir();
  if (!dirs.includes(defaultRecordingsDir)) dirs.push(defaultRecordingsDir);

  const legacyTmpDir = '/tmp/rough-cut/recordings';
  if (!dirs.includes(legacyTmpDir)) dirs.push(legacyTmpDir);

  return dirs;
}

function shouldSkipAudioSourceDiscoveryInDev() {
  return !app.isPackaged && process.env.ROUGH_CUT_SKIP_AUDIO_DISCOVERY === '1';
}

function toPortableProjectPath(projectDir, filePath) {
  if (!projectDir || !filePath || typeof filePath !== 'string' || !isAbsolute(filePath)) {
    return filePath;
  }

  return relative(projectDir, filePath).split('\\').join('/');
}

function serializeProjectPaths(project, projectFilePath) {
  if (!project || !projectFilePath) return project;

  const projectDir = dirname(projectFilePath);

  return {
    ...project,
    assets: Array.isArray(project.assets)
      ? project.assets.map((asset) => ({
          ...asset,
          ...(asset.filePath
            ? { filePath: toPortableProjectPath(projectDir, asset.filePath) }
            : {}),
          ...(asset.thumbnailPath
            ? { thumbnailPath: toPortableProjectPath(projectDir, asset.thumbnailPath) }
            : {}),
          ...(asset.metadata && typeof asset.metadata === 'object'
            ? {
                metadata: {
                  ...asset.metadata,
                  ...(asset.metadata.cursorEventsPath
                    ? {
                        cursorEventsPath: toPortableProjectPath(
                          projectDir,
                          asset.metadata.cursorEventsPath,
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        }))
      : project.assets,
    libraryReferences: Array.isArray(project.libraryReferences)
      ? project.libraryReferences.map((reference) => ({
          ...reference,
          ...(reference.filePath
            ? { filePath: toPortableProjectPath(projectDir, reference.filePath) }
            : {}),
        }))
      : project.libraryReferences,
  };
}

function resolveExistingMediaPath(filePath, projectDir = null) {
  if (!filePath) return filePath;

  const resolvedPath =
    !isAbsolute(filePath) && projectDir ? resolve(projectDir, filePath) : filePath;
  if (existsSync(resolvedPath)) return resolvedPath;

  const fileName = basename(resolvedPath);
  for (const dir of getRecordingSearchDirs()) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) return candidate;
  }

  return resolvedPath;
}

function repairProjectMediaPaths(project, projectFilePath = null) {
  if (!project || !Array.isArray(project.assets)) return project;

  const projectDir = projectFilePath ? dirname(projectFilePath) : null;

  return {
    ...project,
    assets: project.assets.map((asset) => ({
      ...asset,
      ...(asset.filePath ? { filePath: resolveExistingMediaPath(asset.filePath, projectDir) } : {}),
      ...(asset.thumbnailPath
        ? { thumbnailPath: resolveExistingMediaPath(asset.thumbnailPath, projectDir) }
        : {}),
      ...(asset.metadata && typeof asset.metadata === 'object'
        ? {
            metadata: {
              ...asset.metadata,
              ...(asset.metadata.cursorEventsPath
                ? {
                    cursorEventsPath: resolveExistingMediaPath(
                      asset.metadata.cursorEventsPath,
                      projectDir,
                    ),
                  }
                : {}),
            },
          }
        : {}),
    })),
    libraryReferences: Array.isArray(project.libraryReferences)
      ? project.libraryReferences.map((reference) => ({
          ...reference,
          ...(reference.filePath
            ? { filePath: resolveExistingMediaPath(reference.filePath, projectDir) }
            : {}),
        }))
      : project.libraryReferences,
  };
}

function zoomSidecarPath(recordingFilePath) {
  return recordingFilePath.replace(/\.(webm|mp4)$/i, '.zoom.json');
}

function resolveProjectRelativeMediaPath(filePath, projectFilePath = null) {
  if (!filePath) return filePath;
  if (isAbsolute(filePath) || !projectFilePath) return filePath;
  return resolve(dirname(projectFilePath), filePath);
}

async function loadZoomSidecar(recordingFilePath, projectFilePath = null) {
  try {
    if (!recordingFilePath) return null;
    const resolvedRecordingFilePath = resolveProjectRelativeMediaPath(
      recordingFilePath,
      projectFilePath,
    );
    const path = zoomSidecarPath(resolvedRecordingFilePath);
    if (!existsSync(path)) return null;
    const content = await readFile(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.markers)) {
      return {
        autoIntensity: typeof parsed.autoIntensity === 'number' ? parsed.autoIntensity : 0,
        followCursor: typeof parsed.followCursor === 'boolean' ? parsed.followCursor : true,
        followAnimation: parsed.followAnimation === 'smooth' ? 'smooth' : 'focused',
        followPadding: typeof parsed.followPadding === 'number' ? parsed.followPadding : 0.18,
        markers: parsed.markers,
      };
    }
    return null;
  } catch (err) {
    console.warn('[zoom-sidecar] Load failed:', err?.message ?? err);
    return null;
  }
}

async function hydrateProjectRecordSidecars(project) {
  if (!project || !Array.isArray(project.assets)) return project;

  const hydratedAssets = await Promise.all(
    project.assets.map(async (asset) => {
      if (asset?.type !== 'recording' || !asset.filePath) return asset;

      const loadedZoom = await loadZoomSidecar(asset.filePath);
      if (!loadedZoom) return asset;

      return {
        ...asset,
        presentation: {
          ...(asset.presentation ?? {}),
          zoom: loadedZoom,
        },
      };
    }),
  );

  return {
    ...project,
    assets: hydratedAssets,
  };
}

async function hydrateProjectRecordingDurations(project) {
  if (!project || !Array.isArray(project.assets) || !project.composition?.tracks) return project;

  const timelineFps = project.settings?.frameRate ?? 30;
  const assetUpdates = new Map();

  for (const asset of project.assets) {
    if (asset?.type !== 'recording' || !asset.filePath || !existsSync(asset.filePath)) continue;

    try {
      const metadata = probeRecordingResult(asset.filePath, { timelineFps });
      if (!metadata.durationFrames || metadata.durationFrames <= 0) continue;

      assetUpdates.set(asset.id, {
        duration: metadata.durationFrames,
        metadata: {
          ...asset.metadata,
          width: metadata.width,
          height: metadata.height,
          fps: metadata.fps,
          codec: metadata.codec,
          fileSize: metadata.fileSize,
          hasAudio: metadata.hasAudio,
        },
      });
    } catch (err) {
      console.warn('[project-open] Failed to probe recording metadata:', asset.filePath, err);
    }
  }

  if (assetUpdates.size === 0) return project;

  let maxCompositionDuration = 0;
  const nextTracks = project.composition.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const update = assetUpdates.get(clip.assetId);
      if (!update) {
        maxCompositionDuration = Math.max(maxCompositionDuration, clip.timelineOut);
        return clip;
      }

      const previousSourceDuration = Math.max(0, clip.sourceOut - clip.sourceIn);
      const nextSourceDuration = update.duration;
      const nextTimelineOut = clip.timelineIn + nextSourceDuration;

      const repairedClip = {
        ...clip,
        sourceOut: clip.sourceIn + nextSourceDuration,
        timelineOut: nextTimelineOut,
      };

      if (previousSourceDuration !== nextSourceDuration) {
        console.info('[project-open] Repaired recording clip duration:', {
          assetId: clip.assetId,
          clipId: clip.id,
          previousSourceDuration,
          nextSourceDuration,
        });
      }

      maxCompositionDuration = Math.max(maxCompositionDuration, repairedClip.timelineOut);
      return repairedClip;
    }),
  }));

  return {
    ...project,
    assets: project.assets.map((asset) => {
      const update = assetUpdates.get(asset.id);
      return update
        ? {
            ...asset,
            duration: update.duration,
            metadata: update.metadata,
          }
        : asset;
    }),
    composition: {
      ...project.composition,
      tracks: nextTracks,
      duration: Math.max(maxCompositionDuration, project.composition.duration ?? 0),
    },
  };
}

function collectExportAudioSegments(project) {
  if (!project?.composition?.tracks || !Array.isArray(project.assets)) return [];

  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const cameraAssetIds = new Set(
    project.assets.map((asset) => asset.cameraAssetId).filter(Boolean),
  );
  const segments = project.composition.tracks
    .filter((track) => track.visible && track.volume > 0)
    .flatMap((track) =>
      track.clips
        .filter((clip) => clip.enabled && clip.timelineOut > clip.timelineIn)
        .map((clip) => ({ clip, track, asset: assetsById.get(clip.assetId) ?? null }))
        .filter(
          (entry) =>
            entry.asset &&
            entry.asset.filePath &&
            !cameraAssetIds.has(entry.asset.id) &&
            entry.asset.metadata?.isCamera !== true &&
            ['recording', 'video', 'audio'].includes(entry.asset.type),
        ),
    )
    .sort((a, b) => a.clip.timelineIn - b.clip.timelineIn || a.track.index - b.track.index);

  return segments;
}

function getStringPath(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getObject(value) {
  return typeof value === 'object' && value !== null ? value : null;
}

function resolveAudioStemPaths(asset) {
  const direct = getObject(asset?.metadata?.audioStemPaths);
  const audioCapture = getObject(asset?.metadata?.audioCapture);
  const final = getObject(audioCapture?.final);
  const captureStems = getObject(final?.stems);
  const stems = direct ?? captureStems;
  if (!stems) return null;

  const paths = {
    micFilePath: getStringPath(stems.micFilePath),
    systemAudioFilePath: getStringPath(stems.systemAudioFilePath),
  };

  return paths.micFilePath || paths.systemAudioFilePath ? paths : null;
}

async function hasPrimaryAudioStream(filePath) {
  try {
    const { stdout } = await execFile('ffprobe', [
      '-v',
      'quiet',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function parsePcm16Wav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readTag = (offset) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (bytes.byteLength < 44 || readTag(0) !== 'RIFF' || readTag(8) !== 'WAVE') {
    throw new Error('Unsupported click sound WAV file');
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ') {
      const format = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      if (format !== 1) {
        throw new Error(`Unsupported click sound WAV encoding: ${format}`);
      }
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (channels <= 0 || sampleRate <= 0 || bitsPerSample !== 16 || dataOffset < 0 || dataSize <= 0) {
    throw new Error('Invalid click sound WAV metadata');
  }

  const frameCount = Math.floor(dataSize / (channels * 2));
  const channelData = Array.from({ length: channels }, () => new Float32Array(frameCount));
  let byteOffset = dataOffset;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      channelData[channel][frame] = view.getInt16(byteOffset, true) / 32768;
      byteOffset += 2;
    }
  }

  return { sampleRate, channelData };
}

function parseCursorEventsNdjson(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((event) => event && typeof event.frame === 'number' && typeof event.type === 'string');
}

async function loadCursorEventsForExportAsset(asset) {
  const candidatePaths = [];
  if (typeof asset?.metadata?.cursorEventsPath === 'string' && asset.metadata.cursorEventsPath.length > 0) {
    candidatePaths.push(asset.metadata.cursorEventsPath);
  }
  if (asset?.filePath) {
    candidatePaths.push(asset.filePath.replace(/\.(webm|mp4)$/i, '.cursor.ndjson'));
  }

  for (const path of candidatePaths) {
    try {
      const ndjson = await readFile(path, 'utf-8');
      if (!ndjson.trim()) continue;
      return parseCursorEventsNdjson(ndjson);
    } catch {}
  }

  return [];
}

async function buildExportClickTrack(project, outputPath, range, frameRate) {
  if (project?.exportSettings?.keepClickSounds === false || frameRate <= 0) {
    return null;
  }

  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const cameraAssetIds = new Set(
    project.assets
      .map((asset) => asset.cameraAssetId)
      .filter((assetId) => typeof assetId === 'string' && assetId.length > 0),
  );
  const rangeStartFrame = range?.startFrame ?? 0;
  const rangeEndFrame = range?.endFrame ?? project.composition.duration;
  const clickEvents = [];

  for (const track of project.composition.tracks) {
    if (!track.visible || track.type !== 'video') continue;

    for (const clip of track.clips) {
      if (!clip.enabled || clip.timelineOut <= clip.timelineIn) continue;
      const asset = assetsById.get(clip.assetId);
      if (!asset || !asset.presentation?.cursor?.clickSoundEnabled) continue;
      if (cameraAssetIds.has(asset.id) || asset.metadata?.isCamera === true) continue;
      if (asset.type !== 'recording' && asset.type !== 'video') continue;

      const cursorEvents = await loadCursorEventsForExportAsset(asset);
      if (cursorEvents.length === 0) continue;
      const eventsFps = typeof asset.metadata?.cursorEventsFps === 'number' ? asset.metadata.cursorEventsFps : 60;
      if (eventsFps <= 0) continue;

      for (const event of cursorEvents) {
        if (event.type !== 'down') continue;
        const sourceProjectFrame = Math.round((event.frame / eventsFps) * frameRate);
        if (sourceProjectFrame < clip.sourceIn || sourceProjectFrame >= clip.sourceOut) continue;

        const timelineFrame = clip.timelineIn + (sourceProjectFrame - clip.sourceIn);
        if (
          timelineFrame < clip.timelineIn ||
          timelineFrame >= clip.timelineOut ||
          timelineFrame < rangeStartFrame ||
          timelineFrame >= rangeEndFrame
        ) {
          continue;
        }

        clickEvents.push((timelineFrame - rangeStartFrame) / frameRate);
      }
    }
  }

  if (clickEvents.length === 0) {
    return null;
  }

  const clickBytes = await readFile(CLICK_SOUND_ASSET_PATH);
  const clickSound = parsePcm16Wav(clickBytes);
  const waveform = clickSound.channelData[0] ?? new Float32Array(0);
  if (waveform.length === 0) {
    return null;
  }

  const selectedDurationSeconds = Math.max(0, (rangeEndFrame - rangeStartFrame) / frameRate);
  const totalFrames = Math.max(
    1,
    Math.ceil(selectedDurationSeconds * CLICK_SOUND_SAMPLE_RATE) + waveform.length,
  );
  const mixed = new Float32Array(totalFrames);

  for (const timestampSeconds of clickEvents.sort((left, right) => left - right)) {
    const startFrame = Math.max(0, Math.round(timestampSeconds * CLICK_SOUND_SAMPLE_RATE));
    for (let i = 0; i < waveform.length && startFrame + i < mixed.length; i++) {
      mixed[startFrame + i] += waveform[i];
    }
  }

  const pcm = Buffer.allocUnsafe(mixed.length * 2);
  for (let i = 0; i < mixed.length; i++) {
    const sample = Math.max(-1, Math.min(1, mixed[i]));
    const int16 = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    pcm.writeInt16LE(int16, i * 2);
  }

  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(CLICK_SOUND_SAMPLE_RATE, 24);
  header.writeUInt32LE(CLICK_SOUND_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const clickTrackPath = `${outputPath}.click-sounds.wav`;
  await writeFile(clickTrackPath, Buffer.concat([header, pcm]));
  return clickTrackPath;
}

async function finalizeExportMedia(project, videoPath, outputPath, range) {
  const repairedProject = repairProjectMediaPaths(project);
  const segments = collectExportAudioSegments(repairedProject);
  const frameRate = repairedProject?.settings?.frameRate ?? 30;
  const audioInputs = [];
  const stemGroups = [];
  const clickTrackPath = await buildExportClickTrack(repairedProject, outputPath, range, frameRate);
  const selectedDurationSeconds = Math.max(
    0,
    ((range?.endFrame ?? repairedProject.composition.duration) - (range?.startFrame ?? 0)) / frameRate,
  );

  for (const segment of segments) {
    const stems = resolveAudioStemPaths(segment.asset);
    const group = { segment, mic: null, system: null };

    if (stems?.micFilePath && await hasPrimaryAudioStream(stems.micFilePath)) {
      group.mic = { segment, filePath: stems.micFilePath, role: 'mic' };
      audioInputs.push(group.mic);
    }
    if (stems?.systemAudioFilePath && await hasPrimaryAudioStream(stems.systemAudioFilePath)) {
      group.system = { segment, filePath: stems.systemAudioFilePath, role: 'system' };
      audioInputs.push(group.system);
    }

    if (group.mic || group.system) {
      stemGroups.push(group);
      continue;
    }

    if (await hasPrimaryAudioStream(segment.asset.filePath)) {
      audioInputs.push({ segment, filePath: segment.asset.filePath, role: 'mixed' });
    }
  }

  if (audioInputs.length === 0 && !clickTrackPath) {
    await rename(videoPath, outputPath);
    return { outputPath, audioIncluded: false };
  }

  const tempOutputPath = `${outputPath}.muxing.mp4`;
  const ffmpegArgs = ['-y', '-i', videoPath];
  for (const input of audioInputs) {
    ffmpegArgs.push('-i', input.filePath);
  }
  if (clickTrackPath) {
    ffmpegArgs.push('-i', clickTrackPath);
  }

  const filterParts = [];
  const inputLabels = new Map();
  const mixLabels = [];
  const consumedInputs = new Set();
  const rangeStartFrame = range?.startFrame ?? 0;
  const rangeEndFrame = range?.endFrame ?? repairedProject.composition.duration;
  const appendTimedAudioFilter = (input, inputIndex, outputLabel) => {
      const segment = input.segment;
      const overlapStartFrame = Math.max(segment.clip.timelineIn, rangeStartFrame);
      const overlapEndFrame = Math.min(
        segment.clip.timelineOut,
        rangeEndFrame,
      );
      if (overlapEndFrame <= overlapStartFrame) {
        return null;
      }

      const trimOffsetFrames = overlapStartFrame - segment.clip.timelineIn;
      const sourceStart = (segment.clip.sourceIn + trimOffsetFrames) / frameRate;
      const sourceEnd = sourceStart + (overlapEndFrame - overlapStartFrame) / frameRate;
      const delayMs = Math.max(
        0,
        Math.round(((overlapStartFrame - rangeStartFrame) / frameRate) * 1000),
      );
      filterParts.push(`[${inputIndex}:a:0]atrim=start=${sourceStart}:end=${sourceEnd},asetpts=PTS-STARTPTS,adelay=${delayMs}:all=1[${outputLabel}]`);
      return outputLabel;
  };

  audioInputs.forEach((input, index) => {
    const label = appendTimedAudioFilter(input, index + 1, `src${index}`);
    if (label) {
      inputLabels.set(input, label);
    }
  });

  stemGroups.forEach((group, index) => {
    const micLabel = group.mic ? inputLabels.get(group.mic) : null;
    const systemLabel = group.system ? inputLabels.get(group.system) : null;
    if (micLabel && systemLabel) {
      const micMixLabel = `mic${index}`;
      const duckKeyLabel = `duckkey${index}`;
      const duckedSystemLabel = `ducked${index}`;
      filterParts.push(`[${micLabel}]asplit=2[${micMixLabel}][${duckKeyLabel}]`);
      filterParts.push(`[${systemLabel}][${duckKeyLabel}]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=250:makeup=1[${duckedSystemLabel}]`);
      mixLabels.push(`[${micMixLabel}]`, `[${duckedSystemLabel}]`);
      consumedInputs.add(group.mic);
      consumedInputs.add(group.system);
    } else if (micLabel && group.mic) {
      mixLabels.push(`[${micLabel}]`);
      consumedInputs.add(group.mic);
    } else if (systemLabel && group.system) {
      mixLabels.push(`[${systemLabel}]`);
      consumedInputs.add(group.system);
    }
  });

  for (const input of audioInputs) {
    if (consumedInputs.has(input)) continue;
    const label = inputLabels.get(input);
    if (label) {
      mixLabels.push(`[${label}]`);
    }
  }

  if (clickTrackPath) {
    const clickLabel = `click${mixLabels.length}`;
    filterParts.push(
      `[${audioInputs.length + 1}:a:0]atrim=start=0:end=${selectedDurationSeconds},asetpts=PTS-STARTPTS[${clickLabel}]`,
    );
    mixLabels.push(`[${clickLabel}]`);
  }
  if (filterParts.length === 0) {
    if (clickTrackPath) {
      await unlink(clickTrackPath).catch(() => {});
    }
    await rename(videoPath, outputPath);
    return { outputPath, audioIncluded: false };
  }
  const mixInputs = mixLabels.join('');
  const filterComplex = `${filterParts.join(';')};${mixInputs}amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0[aout]`;

  ffmpegArgs.push(
    '-filter_complex',
    filterComplex,
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    tempOutputPath,
  );

  try {
    await new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      currentExportFinalizeProcess = child;
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        currentExportFinalizeProcess = null;
        reject(error);
      });
      child.on('close', (code) => {
        currentExportFinalizeProcess = null;
        if (code === 0) {
          resolve(undefined);
          return;
        }
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      });
    });
    if (clickTrackPath) {
      await unlink(clickTrackPath).catch(() => {});
    }
    await unlink(videoPath).catch(() => {});
    await rename(tempOutputPath, outputPath);
    return { outputPath, audioIncluded: true };
  } catch {
    if (clickTrackPath) {
      await unlink(clickTrackPath).catch(() => {});
    }
    await unlink(tempOutputPath).catch(() => {});
    await rename(videoPath, outputPath);
    return { outputPath, audioIncluded: false };
  }
}

function getMediaContentType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.webm':
      return 'video/webm';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function buildRangeResponse(filePath, rangeHeader) {
  const stat = statSync(filePath);
  const size = stat.size;
  const contentType = getMediaContentType(filePath);
  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
  };

  if (!rangeHeader) {
    return new Response(Readable.toWeb(createReadStream(filePath)), {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(size),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes */${size}`,
      },
    });
  }

  let start = match[1] ? Number.parseInt(match[1], 10) : 0;
  let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Number.parseInt(match[2], 10);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes */${size}`,
      },
    });
  }

  end = Math.min(end, size - 1);
  const chunkSize = end - start + 1;

  return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(chunkSize),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  });
}

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
    if (process.env.ROUGH_CUT_MINIMAL_BOOT === '1') {
      mainWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<!doctype html><html><body style="background:#111;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Rough Cut minimal boot</body></html>',
          ),
      );
    } else if (process.env.ROUGH_CUT_IMPORT_APP_ONLY === '1') {
      mainWindow.loadURL(getRendererUrl('/?import-app-only=1'));
    } else if (process.env.ROUGH_CUT_MINIMAL_RENDER === '1') {
      mainWindow.loadURL(getRendererUrl('/?minimal-render=1'));
    } else if (process.env.ROUGH_CUT_SHELL_ONLY === '1') {
      mainWindow.loadURL(getRendererUrl('/?shell-only=1'));
    } else if (process.env.ROUGH_CUT_RECORD_SHELL_ONLY === '1') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record&record-shell-only=1'));
    } else if (process.env.ROUGH_CUT_RECORD_ULTRA_MINIMAL === '1') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record&record-ultra-minimal=1'));
    } else if (process.env.ROUGH_CUT_RECORD_STORE_ONLY === '1') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record&record-store-only=1'));
    } else if (process.env.ROUGH_CUT_RECORD_RUNTIME_HOOKS === '1') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record&record-runtime-hooks=1'));
    } else if (process.env.ROUGH_CUT_RECORD_CHROME_ONLY === '1') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record&record-chrome-only=1'));
    } else if (process.env.ROUGH_CUT_RECORD_WORKSPACE_ONLY === '1') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record&record-workspace-only=1'));
    } else if (process.env.ROUGH_CUT_START_TAB === 'record') {
      mainWindow.loadURL(getRendererUrl('/?start-tab=record'));
    } else {
      mainWindow.loadURL(getRendererUrl('/'));
    }
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
    // Forward every renderer console message to the main-process stderr so
    // debugging from the terminal is possible even before DevTools attaches.
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levels = ['LOG', 'WARN', 'ERROR', 'INFO'];
      const label = levels[level] ?? `L${level}`;
      process.stderr.write(`[renderer:${label}] ${message}  (${sourceId}:${line})\n`);
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      process.stderr.write(
        `[renderer:CRASH] reason=${details.reason} exitCode=${details.exitCode}\n`,
      );
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      process.stderr.write(
        `[renderer:LOAD-FAIL] code=${errorCode} desc=${errorDescription} url=${validatedURL}\n`,
      );
    });
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  }
}

// Register IPC handlers
function registerIpcHandlers() {
  // Project: Open -- native file dialog, read JSON, return parsed document + filePath
  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [PROJECT_FILE_FILTER],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const filePath = result.filePaths[0];
    const content = await readFile(filePath, 'utf-8');
    const repairedProject = repairProjectMediaPaths(JSON.parse(content), filePath);
    const durationHydratedProject = await hydrateProjectRecordingDurations(repairedProject);
    const data = await hydrateProjectRecordSidecars(durationHydratedProject);
    // Return the raw data -- the renderer will validate via the project-model package
    const firstThumb = Array.isArray(data.assets) ? data.assets.find((a) => a.thumbnailPath) : null;
    addRecentProject({
      filePath,
      name:
        data.name ??
        filePath
          .split('/')
          .pop()
          .replace(/\.roughcut$/, ''),
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
    const serializedProject = serializeProjectPaths(project, filePath);
    await writeFile(filePath, JSON.stringify(serializedProject, null, 2), 'utf-8');
    const firstThumb = Array.isArray(project.assets)
      ? project.assets.find((a) => a.thumbnailPath)
      : null;
    addRecentProject({
      filePath,
      name:
        project.name ??
        filePath
          .split('/')
          .pop()
          .replace(/\.roughcut$/, ''),
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
      filters: [PROJECT_FILE_FILTER],
    });
    if (result.canceled || !result.filePath) return null;
    const serializedProject = serializeProjectPaths(project, result.filePath);
    await writeFile(result.filePath, JSON.stringify(serializedProject, null, 2), 'utf-8');
    const firstThumb = Array.isArray(project.assets)
      ? project.assets.find((a) => a.thumbnailPath)
      : null;
    addRecentProject({
      filePath: result.filePath,
      name:
        project.name ??
        result.filePath
          .split('/')
          .pop()
          .replace(/\.roughcut$/, ''),
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

  ipcMain.handle(IPC_CHANNELS.LIBRARY_OPEN, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [LIBRARY_FILE_FILTER],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const filePath = result.filePaths[0];
    const content = await readFile(filePath, 'utf-8');
    return { library: JSON.parse(content), filePath };
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SAVE, async (_e, { library, filePath }) => {
    await writeFile(filePath, JSON.stringify(library, null, 2), 'utf-8');
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SAVE_AS, async (_e, { library }) => {
    const defaultPath = join(
      getDefaultProjectDir(),
      `${sanitizeFileStem(library?.name || 'Untitled Library')}.roughcutlib`,
    );
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [LIBRARY_FILE_FILTER],
      properties: ['showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, JSON.stringify(library, null, 2), 'utf-8');
    return result.filePath;
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
      return await runExport(project, settings, outputPath, {
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
      const result = {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        totalFrames: 0,
        durationMs: 0,
      };
      mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_COMPLETE, result);
      return result;
    }
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, () => {
    if (currentExportFinalizeProcess) {
      currentExportFinalizeProcess.kill('SIGTERM');
      currentExportFinalizeProcess = null;
    }
  });

  ipcMain.on(IPC_CHANNELS.EXPORT_PROGRESS_EMIT, (_event, progress) => {
    mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_PROGRESS, progress);
  });

  ipcMain.on(IPC_CHANNELS.EXPORT_COMPLETE_EMIT, (_event, result) => {
    mainWindow?.webContents.send(IPC_CHANNELS.EXPORT_COMPLETE, result);
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_PICK_OUTPUT_PATH, async (_event, { projectName, format }) => {
    const extension = format === 'webm' ? 'webm' : format === 'gif' ? 'gif' : 'mp4';
    const defaultPath = join(
      app.getPath('videos'),
      `${sanitizeFileStem(projectName)}.${extension}`,
    );
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      properties: ['showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_FINALIZE_MEDIA,
    async (_event, { project, videoPath, outputPath, range }) => {
      return finalizeExportMedia(project, videoPath, outputPath, range);
    },
  );

  ipcMain.handle(IPC_CHANNELS.EXPORT_OPEN_FILE, async (_event, filePath) => {
    const error = await shell.openPath(filePath);
    return error.length === 0;
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_SHOW_IN_FOLDER, async (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  // Recording: Get available capture sources (screens + windows)
  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SOURCES, async () => {
    const probedSources = debugCaptureSourcesOverride ? null : await getSources();
    const nextSources = debugCaptureSourcesOverride ?? probedSources;
    reconcileCaptureSources(nextSources);
    return nextSources;
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_DISPLAY_BOUNDS, () => {
    if (Array.isArray(debugDisplayBoundsOverride)) return debugDisplayBoundsOverride;
    const displays = screen.getAllDisplays();
    return displays.map((display) => getDisplayCaptureBounds(display, displays));
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES, async () => {
    if (shouldSkipAudioSourceDiscoveryInDev()) return [];
    return listSystemAudioSources();
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_PREFLIGHT_STATUS, () => {
    return buildRecordingPreflightStatus();
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_OPEN_PERMISSION_SETTINGS, async (_e, { kind }) => {
    if (debugRecordingPermissionSettingsResultOverride) {
      const override =
        typeof debugRecordingPermissionSettingsResultOverride === 'function'
          ? debugRecordingPermissionSettingsResultOverride(kind)
          : debugRecordingPermissionSettingsResultOverride[kind] ??
            debugRecordingPermissionSettingsResultOverride.default ??
            debugRecordingPermissionSettingsResultOverride;
      if (override) {
        return override;
      }
    }

    const url = getPermissionSettingsUrl(kind);
    if (!url) {
      return {
        opened: false,
        requiresFullRelaunch: false,
        message: 'This platform does not expose a direct recording-permission settings link.',
      };
    }

    await shell.openExternal(url);
    return {
      opened: true,
      requiresFullRelaunch: process.platform === 'darwin',
      message:
        process.platform === 'darwin'
          ? 'Permissions may require a full app relaunch before Electron sees the new state.'
          : 'Opened the OS privacy settings for this recording permission.',
    };
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_GET, async () => {
    return readRecordingRecoveryMarker();
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_RECOVER, async () => {
    const recovery = await readRecordingRecoveryMarker();
    if (!recovery?.canRecover || !recovery.recoveryCandidate?.videoPath) {
      return null;
    }

    const metadata = {
      fps: recovery.captureMetadata?.fps ?? 30,
      width: recovery.captureMetadata?.width ?? 1920,
      height: recovery.captureMetadata?.height ?? 1080,
      durationMs: 0,
      timelineFps: recovery.captureMetadata?.timelineFps ?? 30,
    };
    const recoveryProjectDir =
      basename(recovery.recordingsDir) === 'recordings'
        ? dirname(recovery.recordingsDir)
        : recovery.recordingsDir;
    const projectDir = getRecordingLocation() || recoveryProjectDir || null;
    const result = await saveRecordingFromFile(
      recovery.recoveryCandidate.videoPath,
      projectDir,
      metadata,
    );

    if (recovery.recoveryCandidate.audioPath) {
      await muxAudioIntoRecording(result.filePath, recovery.recoveryCandidate.audioPath);
    }
    if (recovery.recoveryCandidate.micAudioPath || recovery.recoveryCandidate.systemAudioPath) {
      result.audioStemPaths = {
        micFilePath: recovery.recoveryCandidate.micAudioPath ?? null,
        systemAudioFilePath: recovery.recoveryCandidate.systemAudioPath ?? null,
      };
    }
    if (recovery.recoveryCandidate.cursorPath) {
      result.cursorEventsPath = recovery.recoveryCandidate.cursorPath;
    }
    if (recovery.recoveryCandidate.projectSnapshotPath) {
      result.recoveredProjectSnapshotPath = recovery.recoveryCandidate.projectSnapshotPath;
    }

    await clearRecordingRecoveryMarker();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RECORDING_ASSET_READY, result);
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_RECOVERY_DISMISS, async () => {
    await clearRecordingRecoveryMarker();
    return true;
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
    const repairedProject = repairProjectMediaPaths(JSON.parse(content), filePath);
    const durationHydratedProject = await hydrateProjectRecordingDurations(repairedProject);
    return hydrateProjectRecordSidecars(durationHydratedProject);
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_OPEN_PATH, async (_e, { filePath }) => {
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

  // File system: read a binary file and return as ArrayBuffer (used for WebCodecs camera decode)
  ipcMain.handle(IPC_CHANNELS.READ_BINARY_FILE, async (_e, filePath) => {
    if (!filePath || !existsSync(filePath)) return null;
    const buf = await readFile(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  ipcMain.handle(IPC_CHANNELS.WRITE_BINARY_FILE, async (_e, { filePath, buffer }) => {
    await writeFile(filePath, Buffer.from(buffer));
    return true;
  });

  // Debug: reload the most recent recording from disk (temporary — for camera decode testing)
  ipcMain.handle(IPC_CHANNELS.DEBUG_LOAD_LAST_RECORDING, async () => {
    const latestResult = getLastFinalizedRecordingResult();
    if (latestResult) {
      console.log('[DEBUG] Returning last finalized in-memory recording result');
      return latestResult;
    }

    const recordingDirs = getRecordingSearchDirs();
    const files = recordingDirs
      .flatMap((recordingDir) => {
        if (!existsSync(recordingDir)) return [];
        return readdirSync(recordingDir)
          .filter((f) => f.endsWith('.webm'))
          .map((f) => {
            const filePath = join(recordingDir, f);
            return { name: f, filePath, recordingDir, mtime: statSync(filePath).mtimeMs };
          });
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return null;

    const latest = files[0];
    const latestName = latest.name;
    const filePath = latest.filePath;
    const recordingDir = latest.recordingDir;
    const stat = statSync(filePath);

    // Check for camera sidecar
    const baseName = latestName.replace('.webm', '');
    const cameraCandidates = [
      join(recordingDir, baseName + '-camera.webm'),
      join(recordingDir, baseName + '-camera.mp4'),
    ];
    const cameraPath = cameraCandidates.find((candidate) => existsSync(candidate)) ?? null;
    const hasCameraFile = Boolean(cameraPath);

    // Try to get duration via ffprobe, fallback to 3 seconds at 30fps
    let durationFrames = 90; // default 3s at 30fps
    let width = 1920;
    let height = 1080;
    let fps = 30;
    let hasAudio = false;

    try {
      const { execSync } = await import('node:child_process');
      const probe = execSync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const info = JSON.parse(probe);
      const videoStream = info.streams?.find((s) => s.codec_type === 'video');
      const audioStream = info.streams?.find((s) => s.codec_type === 'audio');
      hasAudio = Boolean(audioStream);
      if (videoStream) {
        width = videoStream.width || width;
        height = videoStream.height || height;
        const duration = parseFloat(videoStream.duration || '0');
        if (duration > 0) {
          const r = parseFloat(
            videoStream.r_frame_rate?.split('/').reduce((a, b) => a / b) || '30',
          );
          fps = Math.round(r) || 30;
          durationFrames = Math.round(duration * fps);
        }
      }
      // Debug: log stream info to terminal
      console.log('[DEBUG] ffprobe:', filePath);
      console.log(
        '[DEBUG]   video:',
        videoStream
          ? `${videoStream.codec_name} ${videoStream.width}x${videoStream.height}`
          : 'NONE',
      );
      console.log(
        '[DEBUG]   audio:',
        audioStream ? `${audioStream.codec_name} ${audioStream.sample_rate}Hz` : 'NONE',
      );
      if (hasCameraFile) {
        try {
          const camProbe = execSync(
            `ffprobe -v quiet -print_format json -show_streams "${cameraPath}"`,
            { encoding: 'utf-8', timeout: 5000 },
          );
          const camInfo = JSON.parse(camProbe);
          const camVideo = camInfo.streams?.find((s) => s.codec_type === 'video');
          console.log(
            '[DEBUG]   camera:',
            camVideo ? `${camVideo.codec_name} ${camVideo.width}x${camVideo.height}` : 'NONE',
          );
        } catch {
          /* ignore */
        }
      }
    } catch {
      // ffprobe not available, use defaults
      console.log('[DEBUG] ffprobe not available, using defaults');
    }

    const result = {
      filePath,
      durationFrames,
      width,
      height,
      fps,
      codec: 'vp8',
      fileSize: stat.size,
      hasAudio,
      cameraFilePath: hasCameraFile ? cameraPath : undefined,
    };
    console.log(
      '[DEBUG] Returning:',
      JSON.stringify({ ...result, filePath: '...' + filePath.slice(-40) }),
    );
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_GET_LAST_DISPLAY_MEDIA_SELECTION, async () => {
    return lastDisplayMediaSelection;
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_SET_RECORDING_RECOVERY, async (_e, payload) => {
    if (!payload) {
      await clearRecordingRecoveryMarker();
      return null;
    }
    return writeRecordingRecoveryMarker(payload);
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_SET_CAPTURE_SOURCES, async (_e, payload) => {
    debugCaptureSourcesOverride = Array.isArray(payload) ? payload : null;
    if (debugCaptureSourcesOverride) {
      reconcileCaptureSources(debugCaptureSourcesOverride);
      broadcastRecordingConfig();
    }
    return debugCaptureSourcesOverride;
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_SET_DISPLAY_BOUNDS, async (_e, payload) => {
    debugDisplayBoundsOverride = Array.isArray(payload) ? payload : null;
    return debugDisplayBoundsOverride;
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_SET_RECORDING_PREFLIGHT_STATUS, async (_e, payload) => {
    debugRecordingPreflightStatusOverride = payload ?? null;
    return debugRecordingPreflightStatusOverride;
  });

  ipcMain.handle(
    IPC_CHANNELS.DEBUG_SET_RECORDING_PERMISSION_SETTINGS_RESULT,
    async (_e, payload) => {
      debugRecordingPermissionSettingsResultOverride = payload ?? null;
      return debugRecordingPermissionSettingsResultOverride;
    },
  );

  ipcMain.handle(IPC_CHANNELS.ZOOM_LOAD_SIDECAR, async (_e, { recordingFilePath, projectFilePath }) => {
    return loadZoomSidecar(recordingFilePath, projectFilePath ?? null);
  });

  ipcMain.handle(
    IPC_CHANNELS.ZOOM_SAVE_SIDECAR,
    async (_e, { recordingFilePath, projectFilePath, presentation }) => {
      try {
        if (!recordingFilePath || !presentation) return false;
        const resolvedRecordingFilePath = resolveProjectRelativeMediaPath(
          recordingFilePath,
          projectFilePath ?? null,
        );
        const path = zoomSidecarPath(resolvedRecordingFilePath);
        const payload = {
          version: 1,
          autoIntensity:
            typeof presentation.autoIntensity === 'number' ? presentation.autoIntensity : 0,
          followCursor:
            typeof presentation.followCursor === 'boolean' ? presentation.followCursor : true,
          followAnimation: presentation.followAnimation === 'smooth' ? 'smooth' : 'focused',
          followPadding:
            typeof presentation.followPadding === 'number' ? presentation.followPadding : 0.18,
          markers: Array.isArray(presentation.markers) ? presentation.markers : [],
        };
        await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
        return true;
      } catch (err) {
        console.warn('[zoom-sidecar] Save failed:', err?.message ?? err);
        return false;
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, (_e, filePath) => shell.openPath(filePath));
  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, (_e, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // Project: Auto-save — saves silently after recording completes.
  // If filePath is provided, overwrites that file; otherwise resolves a path in ~/Documents/Rough Cut/.
  ipcMain.handle(IPC_CHANNELS.PROJECT_AUTO_SAVE, async (_e, { project, filePath }) => {
    try {
      if (!filePath) {
        const safeName =
          (project.name || 'Untitled Project').replace(/[^a-zA-Z0-9 _-]/g, '').trim() ||
          'Untitled Project';
        // Use configured recording location, fall back to ~/Documents/Rough Cut
        const configuredLocation = getRecordingLocation();
        // Validate configured location exists and is usable
        let defaultDir;
        if (configuredLocation && existsSync(configuredLocation)) {
          defaultDir = configuredLocation;
        } else {
          // Fall back to ~/Documents/Rough Cut
          defaultDir = getDefaultProjectDir();
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

      const serializedProject = serializeProjectPaths(project, filePath);
      await writeFile(filePath, JSON.stringify(serializedProject, null, 2), 'utf-8');

      const firstThumb = Array.isArray(project.assets)
        ? project.assets.find((a) => a.thumbnailPath)
        : null;
      addRecentProject({
        filePath,
        name:
          project.name ??
          filePath
            .split('/')
            .pop()
            .replace(/\.roughcut$/, ''),
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
      throw err; // Re-throw so the renderer .catch() fires
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

  // Storage: Get/set auto zoom intensity
  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_AUTO_ZOOM_INTENSITY, () => {
    return getAutoZoomIntensity();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SET_AUTO_ZOOM_INTENSITY, (_e, { intensity }) => {
    setAutoZoomIntensity(intensity);
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
        'ext4',
        'ext3',
        'ext2',
        'btrfs',
        'xfs',
        'ntfs',
        'ntfs3',
        'vfat',
        'fat32',
        'exfat',
        'fuseblk',
        'nfs',
        'nfs4',
        'cifs',
        'f2fs',
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
          const name =
            mountPoint === '/'
              ? 'System'
              : mountPoint === '/home'
                ? 'Home'
                : mountPoint.split('/').pop();

          volumes.push({ path: mountPoint, name });
        }
      }

      // Deduplicate by path
      const seen = new Set();
      return volumes.filter((v) => {
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

  ipcMain.handle(IPC_CHANNELS.RECORDING_CONFIG_GET, () => ({ ...recordingConfig }));

  ipcMain.handle(IPC_CHANNELS.RECORDING_CONFIG_UPDATE, (_e, { patch }) => {
    applyRecordingConfigPatch(patch);
    broadcastRecordingConfig();
    return { ...recordingConfig };
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_MIC_VOLUME, async () => {
    const sourceName = await resolveCurrentMicPactlSource();
    if (!sourceName) return { sourceName: null, percent: null };
    const percent = await getSourceVolumePercent(sourceName);
    return { sourceName, percent };
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_SET_MIC_VOLUME, async (_e, { percent }) => {
    const sourceName = await resolveCurrentMicPactlSource();
    if (!sourceName) return { sourceName: null, percent: null, applied: false };
    await snapshotIfFirstTouch(sourceName);
    const applied = await setSourceVolumePercent(sourceName, percent);
    const finalPercent = await getSourceVolumePercent(sourceName);
    return { sourceName, percent: finalPercent, applied };
  });

  registerAIHandlers(mainWindow);
}

/**
 * Resolve the pactl source name for the currently configured mic, using the
 * same discoverAudioSources pipeline that the recording session uses. Returns
 * null when the user has no mic enabled, no source matches, or pactl fails.
 */
async function resolveCurrentMicPactlSource() {
  if (!recordingConfig?.micEnabled) return null;
  try {
    const sources = await discoverAudioSources({
      preferredMicSourceId: recordingConfig.selectedMicDeviceId ?? null,
      preferredMicLabel: recordingConfig.selectedMicLabel ?? null,
      strictMicSelection: Boolean(
        recordingConfig.selectedMicDeviceId || recordingConfig.selectedMicLabel,
      ),
    });
    return sources.micSource ?? null;
  } catch (err) {
    console.warn('[record-mic-volume] resolve failed:', err?.message ?? err);
    return null;
  }
}

// macOS audio loopback support (ScreenCaptureKit)
app.commandLine.appendSwitch(
  'enable-features',
  'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride',
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
if (process.platform === 'linux' && app.isPackaged) {
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
  // TASK-183 diagnostic: log Electron's and X11's view of the display layout
  // once at startup so secondary-display capture regressions have both
  // perspectives in the record.
  void getX11MonitorsDiagnostic().then((xrandrOutput) => {
    if (xrandrOutput === null) return;
    try {
      cachedX11MonitorLayout = parseX11MonitorsDiagnostic(xrandrOutput);
      const electronDisplays = screen.getAllDisplays().map((d) => ({
        id: d.id,
        label: d.label,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
      }));
      console.info('[task-183] Electron displays at startup:', JSON.stringify(electronDisplays));
      console.info('[task-183] xrandr --listmonitors:\n' + xrandrOutput);
    } catch (err) {
      console.warn('[task-183] Failed to log display diagnostic:', err);
    }
  });

  // Permission CHECK handler (synchronous pre-flight — getUserMedia needs this)
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, _requestingOrigin, details) => {
      if (permission === 'media') return true;
      return false;
    },
  );

  // Permission REQUEST handler (async — approves the actual request)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Handle media:// URLs by serving local files with explicit byte-range support.
  protocol.handle('media', (req) => {
    const filePath = decodeURIComponent(req.url.replace('media://', ''));
    if (!filePath || !existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }

    return buildRangeResponse(filePath, req.headers.get('range'));
  });

  ipcMain.on(IPC_CHANNELS.PANEL_SET_SOURCE, (_e, { sourceId }) => {
    applyRecordingConfigPatch({ selectedSourceId: sourceId });
    broadcastRecordingConfig();
  });

  // Intercept getDisplayMedia() from any renderer (panel window uses this)
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources =
        debugCaptureSourcesOverride ??
        (await desktopCapturer.getSources({ types: ['screen', 'window'] }));
      const selectedSourceId = recordingConfig.selectedSourceId;
      const recordMode = recordingConfig.recordMode;
      const cachedSelectedSource = cachedCaptureSources.find(
        (source) => source.id === selectedSourceId,
      );
      const source = pickSourceForRecordMode(
        sources,
        recordMode,
        selectedSourceId,
        cachedSelectedSource,
      );
      if (!source) {
        lastDisplayMediaSelection = {
          requestedRecordMode: recordMode,
          configuredSelectedSourceId: selectedSourceId,
          grantedSourceId: null,
          grantedSourceType: null,
        };
        callback(undefined);
        return;
      }

      lastDisplayMediaSelection = {
        requestedRecordMode: recordMode,
        configuredSelectedSourceId: selectedSourceId,
        grantedSourceId: source.id,
        grantedSourceType: source.id.startsWith('screen:') ? 'screen' : 'window',
      };

      callback({ video: source, audio: 'loopback' });
    } catch (err) {
      console.error('[display-media-handler] Error:', err);
      lastDisplayMediaSelection = null;
      callback(undefined); // MUST call or getDisplayMedia hangs forever
    }
  });

  registerIpcHandlers();
  createWindow();

  // Pass source info getter so the session manager can use FFmpeg x11grab
  initSessionManager(mainWindow, () => {
    const selectedSourceId =
      lastDisplayMediaSelection?.grantedSourceType === 'screen' &&
      typeof lastDisplayMediaSelection.grantedSourceId === 'string'
        ? lastDisplayMediaSelection.grantedSourceId
        : recordingConfig.selectedSourceId;

    return resolveCaptureSourceInfo({
      selectedSourceId,
      displays: screen.getAllDisplays(),
      cachedCaptureSources,
      x11DisplayName: normalizeX11DisplayName(),
      getDisplayCaptureBounds,
      logDiagnostic: (info) => {
        console.info('[session-source] Resolved capture display:', {
          ...info,
          lastDisplayMediaSelection,
        });
      },
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Restore any PulseAudio source volumes the mic-gain slider touched, so we
// don't leave the user's system mic at a reduced level after the app exits.
// will-quit runs synchronously after all windows close, so use the sync
// pactl call — async cleanup is unreliable while the event loop tears down.
app.on('will-quit', () => {
  try {
    restoreAllSourceVolumesSync();
  } catch (err) {
    console.warn('[mic-volume] will-quit restore failed:', err?.message ?? err);
  }
});
