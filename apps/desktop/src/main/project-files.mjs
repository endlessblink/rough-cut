import { copyFile, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  createAsset,
  createClip,
  createProject,
  createTrack,
  validateProject,
} from '../../../../packages/project-model/dist/index.js';
import { migrate } from '../../../../packages/project-model/dist/migrations.js';

export function createProjectForRecording({ recording, now = new Date() }) {
  const fps = recording.fps || 30;
  const cameraSourceInFrames = Math.max(0, Math.round(recording.sync?.cameraSourceInFrames ?? recording.camera?.sourceInFrames ?? 0));
  const wallClockDurationFrames = Math.max(
    1,
    Math.round(((Date.parse(recording.stoppedAt) - Date.parse(recording.startedAt)) / 1000) * fps),
  );
  const durationFrames = Math.max(1, Math.round(recording.sync?.syncedDurationFrames ?? wallClockDurationFrames));
  const name = basename(recording.outputPath).replace(/\.mp4$/i, '');
  const asset = createAsset('recording', recording.outputPath, {
    duration: durationFrames,
    metadata: {
      rawPath: recording.rawPath,
      width: recording.width,
      height: recording.height,
      fps,
      startedAt: recording.startedAt,
      stoppedAt: recording.stoppedAt,
      display: recording.display ?? null,
      capture: recording.capture ?? recording.captureRegion ?? null,
      cursorTelemetryPath: recording.cursorTelemetryPath,
      cursorEvents: Array.isArray(recording.cursorEvents) ? recording.cursorEvents : [],
      audio: recording.audio ?? null,
      cameraError: recording.cameraError ?? null,
      sync: recording.sync ?? null,
      streamTiming: recording.streamTiming ?? null,
    },
  });
  const cameraAsset = recording.camera?.outputPath
    ? createAsset('video', recording.camera.outputPath, {
        pathMode: 'relative',
        duration: Math.max(durationFrames + cameraSourceInFrames, Math.round(recording.sync?.cameraFrames ?? 0) || durationFrames + cameraSourceInFrames),
        metadata: {
          rawPath: recording.camera.rawPath,
          width: recording.camera.width || 1280,
          height: recording.camera.height || 720,
          fps,
          startedAt: recording.startedAt,
          stoppedAt: recording.stoppedAt,
          isCamera: true,
          devicePath: recording.camera.devicePath ?? null,
          sourceInFrames: cameraSourceInFrames,
          prerollMs: recording.camera.prerollMs ?? null,
          sync: recording.sync ?? null,
          streamTiming: recording.camera.streamTiming ?? recording.streamTiming?.camera ?? null,
        },
      })
    : null;
  const recordingAsset = cameraAsset ? { ...asset, cameraAssetId: cameraAsset.id } : asset;
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(recordingAsset.id, track.id, {
    name,
    timelineIn: 0,
    timelineOut: durationFrames,
    sourceIn: 0,
    sourceOut: durationFrames,
  });
  const cameraTrack = cameraAsset ? createTrack('video', { name: 'Camera', index: 1 }) : null;
  const cameraClip = cameraAsset && cameraTrack
    ? createClip(cameraAsset.id, cameraTrack.id, {
        name: `${name} camera`,
        timelineIn: 0,
        timelineOut: durationFrames,
        sourceIn: cameraSourceInFrames,
        sourceOut: cameraSourceInFrames + durationFrames,
      })
    : null;

  return validateProject(
    createProject({
      name,
      createdAt: now.toISOString(),
      modifiedAt: now.toISOString(),
      settings: {
        resolution: { width: ensureEven(recording.width), height: ensureEven(recording.height) },
        frameRate: fps,
        backgroundColor: '#000000',
        sampleRate: 48000,
        destinationPresetId: null,
      },
      assets: cameraAsset ? [recordingAsset, cameraAsset] : [recordingAsset],
      composition: {
        duration: durationFrames,
        tracks: cameraTrack && cameraClip
          ? [{ ...track, clips: [clip] }, { ...cameraTrack, clips: [cameraClip] }]
          : [{ ...track, clips: [clip] }],
        transitions: [],
      },
      exportSettings: {
        format: 'mp4',
        codec: 'h264',
        bitrate: 15_000_000,
        resolution: { width: ensureEven(recording.width), height: ensureEven(recording.height) },
        frameRate: fps,
        keepClickSounds: true,
      },
    }),
  );
}

export const PROJECT_FILE_EXTENSION = '.roughcut';

export class ProjectPathError extends Error {
  constructor(message, { reason, candidate } = {}) {
    super(message);
    this.name = 'ProjectPathError';
    this.code = 'PROJECT_PATH_INVALID';
    this.reason = reason ?? 'invalid';
    this.candidate = candidate ?? null;
  }
}

export function validateProjectPath(candidate, options = {}) {
  const { allowedRoots = null, requireExtension = PROJECT_FILE_EXTENSION } = options;

  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new ProjectPathError('Project path is required', { reason: 'empty', candidate });
  }
  if (candidate.includes('\0')) {
    throw new ProjectPathError('Project path contains a null byte', { reason: 'null-byte', candidate });
  }

  const resolved = resolve(candidate);

  if (requireExtension && !resolved.toLowerCase().endsWith(String(requireExtension).toLowerCase())) {
    throw new ProjectPathError(
      `Project path must end with ${requireExtension}`,
      { reason: 'bad-extension', candidate },
    );
  }

  if (Array.isArray(allowedRoots) && allowedRoots.length > 0) {
    const insideAny = allowedRoots.some((root) => isPathWithinRoot(resolved, root));
    if (!insideAny) {
      throw new ProjectPathError(
        'Project path is outside the allowed projects directory',
        { reason: 'outside-root', candidate },
      );
    }
  }

  return resolved;
}

function isPathWithinRoot(absolutePath, root) {
  if (typeof root !== 'string' || root.length === 0) return false;
  const absoluteRoot = resolve(root);
  const rel = relative(absoluteRoot, absolutePath);
  if (rel === '' || rel === '.') return false;
  if (rel.startsWith('..') && (rel.length === 2 || rel[2] === sep)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

export const PROJECT_TEMP_SUFFIX = '.tmp';
export const PROJECT_BACKUP_SUFFIX = '.bak';

export async function saveProjectFile(projectPath, project) {
  const document = validateProject(prepareProjectForSave(projectPath, {
    ...project,
    modifiedAt: new Date().toISOString(),
  }));
  const json = `${JSON.stringify(document, null, 2)}\n`;
  // Use a unique tmp path per call so two concurrent saves can never collide
  // on the same inode. Without this, parallel `open(tmpPath, 'w')` calls would
  // truncate each other and write interleaved bytes into the same file,
  // producing corrupt JSON after rename. The IPC handler in main/index.mjs
  // already serializes saves; this is defense-in-depth for any caller that
  // bypasses the queue (e.g. saveProjectForRecording at recording-stop).
  const tmpPath = `${projectPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}${PROJECT_TEMP_SUFFIX}`;
  const backupPath = `${projectPath}${PROJECT_BACKUP_SUFFIX}`;

  await mkdir(dirname(projectPath), { recursive: true });

  // Write to the unique tmp and fsync so the bytes are durable before we
  // rename. If the process dies between open and rename, the original file at
  // projectPath is untouched and the tmp can be cleaned up on next launch.
  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(json, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  // Snapshot the previous good file (if any) into a .bak before atomic replace
  // so we always have one prior generation to fall back to.
  const previous = await stat(projectPath).catch(() => null);
  if (previous?.isFile()) {
    await copyFile(projectPath, backupPath);
  }

  await rename(tmpPath, projectPath);

  return { path: projectPath, document };
}

export async function openProjectFile(projectPath) {
  const tmpPath = `${projectPath}${PROJECT_TEMP_SUFFIX}`;
  const backupPath = `${projectPath}${PROJECT_BACKUP_SUFFIX}`;
  const interruptedTmp = await stat(tmpPath).catch(() => null);
  const backupInfo = await stat(backupPath).catch(() => null);
  const raw = await readFile(projectPath, 'utf8');
  let document;
  let recoveredFromBackup = false;
  try {
    document = migrate(JSON.parse(raw));
  } catch (parseError) {
    // The main file is corrupt (e.g. a previous concurrent-save race left
    // interleaved bytes). Try the .bak — saveProjectFile snapshots the
    // previous good file before each atomic replace, so the .bak is the
    // most recent known-clean generation.
    if (!backupInfo?.isFile()) throw parseError;
    const backupRaw = await readFile(backupPath, 'utf8');
    document = migrate(JSON.parse(backupRaw));
    recoveredFromBackup = true;
  }
  document = await resolveProjectAssetPaths(projectPath, document);
  return {
    path: projectPath,
    document,
    recoveredFromBackup,
    interruptedSave: interruptedTmp?.isFile()
      ? { tmpPath, size: interruptedTmp.size, modifiedAt: interruptedTmp.mtime.toISOString() }
      : null,
    backup: backupInfo?.isFile()
      ? { path: backupPath, size: backupInfo.size, modifiedAt: backupInfo.mtime.toISOString() }
      : null,
  };
}

function prepareProjectForSave(projectPath, project) {
  const projectDir = dirname(projectPath);
  return {
    ...project,
    assets: project.assets.map((asset) => prepareAssetForSave(projectDir, asset)),
  };
}

function prepareAssetForSave(projectDir, asset) {
  if (asset.pathMode !== 'relative') return { ...asset, pathMode: 'absolute' };
  const absoluteFilePath = isAbsolute(asset.filePath) ? asset.filePath : resolve(projectDir, asset.filePath);
  const relativeFilePath = relative(projectDir, absoluteFilePath);
  if (!relativeFilePath || relativeFilePath.startsWith('..') || isAbsolute(relativeFilePath)) {
    return { ...asset, filePath: absoluteFilePath, pathMode: 'absolute' };
  }
  const metadata = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  return {
    ...asset,
    filePath: relativeFilePath,
    pathMode: 'relative',
    metadata: {
      ...metadata,
      absoluteFilePath: typeof metadata.absoluteFilePath === 'string'
        ? metadata.absoluteFilePath
        : absoluteFilePath,
    },
  };
}

async function resolveProjectAssetPaths(projectPath, project) {
  const projectDir = dirname(projectPath);
  return {
    ...project,
    assets: await Promise.all(project.assets.map((asset) => resolveAssetPath(projectDir, asset))),
  };
}

async function resolveAssetPath(projectDir, asset) {
  if (asset.pathMode !== 'relative' || isAbsolute(asset.filePath)) return asset;
  const relativeCandidate = resolve(projectDir, asset.filePath);
  const relativeInfo = await stat(relativeCandidate).catch(() => null);
  if (relativeInfo?.isFile()) return { ...asset, filePath: relativeCandidate };
  const fallback = asset.metadata?.absoluteFilePath;
  if (typeof fallback === 'string' && isAbsolute(fallback)) {
    return { ...asset, filePath: fallback };
  }
  return { ...asset, filePath: relativeCandidate };
}

export async function discardInterruptedSave(projectPath) {
  const tmpPath = `${projectPath}${PROJECT_TEMP_SUFFIX}`;
  await unlink(tmpPath).catch((err) => {
    if (err?.code === 'ENOENT') return;
    throw err;
  });
}

export async function saveProjectForRecording(recording) {
  const project = createProjectForRecording({ recording });
  const projectPath = join(dirname(recording.outputPath), `${basename(recording.outputPath, '.mp4')}.roughcut`);
  return saveProjectFile(projectPath, project);
}

export function getPrimaryRecording(project) {
  const asset = project.assets.find((item) => item.type === 'recording' || item.type === 'video');
  if (!asset) return null;
  const primaryClip = getPrimaryAssetClip(project, asset);
  const cameraAsset = getLinkedCameraAsset(project, asset);
  const cameraClip = cameraAsset ? getLinkedCameraClip(project, cameraAsset) : null;
  const sourceIn = typeof primaryClip?.sourceIn === 'number' ? primaryClip.sourceIn : 0;
  const sourceOut = typeof primaryClip?.sourceOut === 'number' ? primaryClip.sourceOut : asset.duration;
  const cutRanges = normalizeCutRanges(asset.presentation?.cutRanges, sourceIn, sourceOut);
  const removedDuration = cutRanges.reduce((sum, range) => sum + range.endFrame - range.startFrame, 0);
  return {
    assetId: asset.id,
    filePath: asset.filePath,
    duration: asset.duration,
    sourceIn,
    sourceOut,
    trimmedDuration: Math.max(1, sourceOut - sourceIn - removedDuration),
    width: typeof asset.metadata.width === 'number' ? asset.metadata.width : project.settings.resolution.width,
    height: typeof asset.metadata.height === 'number' ? asset.metadata.height : project.settings.resolution.height,
    fps: typeof asset.metadata.fps === 'number' ? asset.metadata.fps : project.settings.frameRate,
    cursorEvents: Array.isArray(asset.metadata.cursorEvents) ? asset.metadata.cursorEvents : [],
    cursorTelemetryPath: typeof asset.metadata.cursorTelemetryPath === 'string' ? asset.metadata.cursorTelemetryPath : null,
    audio: asset.metadata.audio && typeof asset.metadata.audio === 'object' ? asset.metadata.audio : null,
    presentation: asset.presentation ?? null,
    cutRanges,
    zoomMarkers: Array.isArray(asset.presentation?.zoom?.markers) ? asset.presentation.zoom.markers : [],
    camera: cameraAsset
      ? {
          assetId: cameraAsset.id,
          filePath: cameraAsset.filePath,
          duration: cameraAsset.duration,
          width: typeof cameraAsset.metadata.width === 'number' ? cameraAsset.metadata.width : 1280,
          height: typeof cameraAsset.metadata.height === 'number' ? cameraAsset.metadata.height : 720,
          fps: typeof cameraAsset.metadata.fps === 'number' ? cameraAsset.metadata.fps : project.settings.frameRate,
          sourceInFrames: typeof cameraClip?.sourceIn === 'number' ? cameraClip.sourceIn : 0,
        }
      : null,
  };
}

function normalizeCutRanges(ranges, sourceIn, sourceOut) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => {
      const startFrame = clampFrame(range?.startFrame, sourceIn, sourceOut - 1);
      const endFrame = clampFrame(range?.endFrame, startFrame + 1, sourceOut);
      return range?.id && endFrame > startFrame ? { id: String(range.id), startFrame, endFrame } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame);
}

function clampFrame(value, min, max) {
  const frame = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, frame));
}

export function getLinkedCameraAsset(project, recordingAsset) {
  if (!recordingAsset?.cameraAssetId) return null;
  return project.assets.find((asset) => asset.id === recordingAsset.cameraAssetId && asset.metadata?.isCamera) ?? null;
}

function getLinkedCameraClip(project, cameraAsset) {
  for (const track of project.composition?.tracks ?? []) {
    const clip = track.clips?.find((item) => item.assetId === cameraAsset.id);
    if (clip) return clip;
  }
  return null;
}

function getPrimaryAssetClip(project, asset) {
  for (const track of project.composition?.tracks ?? []) {
    const clip = track.clips?.find((item) => item.assetId === asset.id);
    if (clip) return clip;
  }
  return null;
}

function ensureEven(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}
