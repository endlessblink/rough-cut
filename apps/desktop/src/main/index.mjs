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
import { existsSync, mkdirSync, statSync, createReadStream, readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { execFile as execFileCallback, spawn } from 'node:child_process';
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
import { listSystemAudioSources } from './recording/audio-sources.mjs';
import { initSessionManager, getLastFinalizedRecordingResult } from './recording/recording-session-manager.mjs';
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
let lastDisplayMediaSelection = null;
const execFile = promisify(execFileCallback);

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
  recordingConfig = normalizeSupportedRecordingConfig({ ...recordingConfig, ...nextPatch });
  setRecordingConfig(recordingConfig);
  return recordingConfig;
}

function reconcileCaptureSources(nextSources) {
  const nextSelectedSourceId = reconcileSelectedSourceId(
    cachedCaptureSources,
    nextSources,
    recordingConfig.selectedSourceId,
  );
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

function getDisplayCaptureBounds(display) {
  const scaleFactor =
    Number.isFinite(display?.scaleFactor) && display.scaleFactor > 0 ? display.scaleFactor : 1;
  const bounds = display?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const useRawBoundsForX11 =
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'x11' ||
      (process.env.DISPLAY !== undefined && process.env.DISPLAY !== ''));

  if (useRawBoundsForX11) {
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
  if (
    process.platform !== 'linux' ||
    !(process.env.XDG_SESSION_TYPE === 'x11' ||
      (process.env.DISPLAY !== undefined && process.env.DISPLAY !== ''))
  ) {
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

async function loadZoomSidecar(recordingFilePath) {
  try {
    if (!recordingFilePath) return null;
    const path = zoomSidecarPath(recordingFilePath);
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

async function finalizeExportMedia(project, videoPath, outputPath, range) {
  const repairedProject = repairProjectMediaPaths(project);
  const segments = collectExportAudioSegments(repairedProject);
  const frameRate = repairedProject?.settings?.frameRate ?? 30;
  const usableSegments = [];

  for (const segment of segments) {
    if (await hasPrimaryAudioStream(segment.asset.filePath)) {
      usableSegments.push(segment);
    }
  }

  if (usableSegments.length === 0) {
    await rename(videoPath, outputPath);
    return { outputPath, audioIncluded: false };
  }

  const tempOutputPath = `${outputPath}.muxing.mp4`;
  const ffmpegArgs = ['-y', '-i', videoPath];
  for (const segment of usableSegments) {
    ffmpegArgs.push('-i', segment.asset.filePath);
  }

  const filterParts = usableSegments
    .map((segment, index) => {
      const overlapStartFrame = Math.max(segment.clip.timelineIn, range?.startFrame ?? 0);
      const overlapEndFrame = Math.min(
        segment.clip.timelineOut,
        range?.endFrame ?? repairedProject.composition.duration,
      );
      if (overlapEndFrame <= overlapStartFrame) {
        return null;
      }

      const trimOffsetFrames = overlapStartFrame - segment.clip.timelineIn;
      const sourceStart = (segment.clip.sourceIn + trimOffsetFrames) / frameRate;
      const sourceEnd = sourceStart + (overlapEndFrame - overlapStartFrame) / frameRate;
      const delayMs = Math.max(
        0,
        Math.round(((overlapStartFrame - (range?.startFrame ?? 0)) / frameRate) * 1000),
      );
      return `[${index + 1}:a:0]atrim=start=${sourceStart}:end=${sourceEnd},asetpts=PTS-STARTPTS,adelay=${delayMs}:all=1[a${index}]`;
    })
    .filter(Boolean);
  if (filterParts.length === 0) {
    await rename(videoPath, outputPath);
    return { outputPath, audioIncluded: false };
  }
  const mixInputs = filterParts.map((_, index) => `[a${index}]`).join('');
  const filterComplex = `${filterParts.join(';')};${mixInputs}amix=inputs=${filterParts.length}:normalize=0:dropout_transition=0[aout]`;

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
    await unlink(videoPath).catch(() => {});
    await rename(tempOutputPath, outputPath);
    return { outputPath, audioIncluded: true };
  } catch {
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
      mainWindow.loadURL('http://127.0.0.1:7544/?import-app-only=1');
    } else if (process.env.ROUGH_CUT_MINIMAL_RENDER === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?minimal-render=1');
    } else if (process.env.ROUGH_CUT_SHELL_ONLY === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?shell-only=1');
    } else if (process.env.ROUGH_CUT_RECORD_SHELL_ONLY === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record&record-shell-only=1');
    } else if (process.env.ROUGH_CUT_RECORD_ULTRA_MINIMAL === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record&record-ultra-minimal=1');
    } else if (process.env.ROUGH_CUT_RECORD_STORE_ONLY === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record&record-store-only=1');
    } else if (process.env.ROUGH_CUT_RECORD_RUNTIME_HOOKS === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record&record-runtime-hooks=1');
    } else if (process.env.ROUGH_CUT_RECORD_CHROME_ONLY === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record&record-chrome-only=1');
    } else if (process.env.ROUGH_CUT_RECORD_WORKSPACE_ONLY === '1') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record&record-workspace-only=1');
    } else if (process.env.ROUGH_CUT_START_TAB === 'record') {
      mainWindow.loadURL('http://127.0.0.1:7544/?start-tab=record');
    } else {
      mainWindow.loadURL('http://127.0.0.1:7544');
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
    const nextSources = debugCaptureSourcesOverride ?? (await getSources());
    reconcileCaptureSources(nextSources);
    return nextSources;
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_DISPLAY_BOUNDS, () => {
    if (Array.isArray(debugDisplayBoundsOverride)) return debugDisplayBoundsOverride;
    return screen.getAllDisplays().map((display) => getDisplayCaptureBounds(display));
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_SYSTEM_AUDIO_SOURCES, async () => {
    if (shouldSkipAudioSourceDiscoveryInDev()) return [];
    return listSystemAudioSources();
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_PREFLIGHT_STATUS, () => {
    return buildRecordingPreflightStatus();
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_OPEN_PERMISSION_SETTINGS, async (_e, { kind }) => {
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
    if (recovery.recoveryCandidate.cursorPath) {
      result.cursorEventsPath = recovery.recoveryCandidate.cursorPath;
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

  ipcMain.handle(IPC_CHANNELS.ZOOM_LOAD_SIDECAR, async (_e, { recordingFilePath }) => {
    return loadZoomSidecar(recordingFilePath);
  });

  ipcMain.handle(
    IPC_CHANNELS.ZOOM_SAVE_SIDECAR,
    async (_e, { recordingFilePath, presentation }) => {
      try {
        if (!recordingFilePath || !presentation) return false;
        const path = zoomSidecarPath(recordingFilePath);
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

  registerAIHandlers(mainWindow);
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
    const selectedSourceId = recordingConfig.selectedSourceId;
    if (!selectedSourceId) return null;
    if (!selectedSourceId.startsWith('screen:')) return null; // x11grab can't target a window

    const displays = screen.getAllDisplays();
    // Electron's desktopCapturer gives each source a stable `display_id` that
    // matches `screen.getAllDisplays()[i].id`. The second segment of the
    // selectedSourceId (e.g. 'screen:2147483647:0') is the Electron display id,
    // NOT the array index — on multi-monitor setups, treating it as an index
    // silently falls back to the primary display.
    const cachedSource = cachedCaptureSources.find((entry) => entry.id === selectedSourceId);
    const displayIdFromCache = cachedSource?.displayId ? String(cachedSource.displayId) : null;
    const displayIdFromId = selectedSourceId.split(':')[1] ?? null;

    const resolvedDisplay =
      (displayIdFromCache && displays.find((d) => String(d.id) === displayIdFromCache)) ||
      (displayIdFromId && displays.find((d) => String(d.id) === displayIdFromId)) ||
      displays[0];

    if (!resolvedDisplay) return null;

    const captureBounds = getDisplayCaptureBounds(resolvedDisplay);

    console.info('[session-source] Resolved capture display:', {
      selectedSourceId,
      cachedSource: cachedSource
        ? {
            id: cachedSource.id,
            name: cachedSource.name,
            type: cachedSource.type,
            displayId: cachedSource.displayId,
          }
        : null,
      allDisplays: displays.map((display) => ({
        id: display.id,
        label: display.label,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor,
      })),
      displayId: resolvedDisplay.id,
      bounds: resolvedDisplay.bounds,
      captureBounds,
      scaleFactor: resolvedDisplay.scaleFactor,
    });

    return {
      sourceId: selectedSourceId,
      display: `${process.env.DISPLAY || ':0'}.0+${captureBounds.x},${captureBounds.y}`,
      width: captureBounds.width,
      height: captureBounds.height,
      offsetX: captureBounds.x,
      offsetY: captureBounds.y,
    };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
