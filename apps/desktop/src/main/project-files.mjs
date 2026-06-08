import { copyFile, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  createAsset,
  createClip,
  createDefaultRecordingPresentation,
  createProject,
  createTrack,
  validateProject,
} from '../../../../packages/project-model/dist/index.js';
import { generateAutoZoomMarkers } from '@rough-cut/timeline-engine';
import { migrate } from '../../../../packages/project-model/dist/migrations.js';
import { PROJECT_SIBLING_SPECS } from './project-sibling-specs.mjs';

export function createProjectForRecording({ recording, now = new Date() }) {
  const fps = recording.fps || 30;
  const cameraSourceInFrames = Math.max(0, Math.round(recording.sync?.cameraSourceInFrames ?? recording.camera?.sourceInFrames ?? 0));
  const wallClockDurationFrames = Math.max(
    1,
    Math.round(((Date.parse(recording.stoppedAt) - Date.parse(recording.startedAt)) / 1000) * fps),
  );
  const durationFrames = Math.max(1, Math.round(recording.sync?.syncedDurationFrames ?? wallClockDurationFrames));
  const name = basename(recording.outputPath).replace(/\.mp4$/i, '');
  const presentation = createRecordingPresentationForRecording(recording, fps, durationFrames);
  const asset = createAsset('recording', recording.outputPath, {
    duration: durationFrames,
    presentation,
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

function createRecordingPresentationForRecording(recording, fps, durationFrames) {
  const presentation = createDefaultRecordingPresentation();
  const cursorEvents = Array.isArray(recording.cursorEvents) ? recording.cursorEvents : [];
  const normalizedCursorEvents = normalizeCursorEventsForAutoZoom(cursorEvents);
  const width = Number.isFinite(recording.width) && recording.width > 0 ? recording.width : 1920;
  const height = Number.isFinite(recording.height) && recording.height > 0 ? recording.height : 1080;
  const markers = clampZoomMarkersToDuration(generateAutoZoomMarkers(
    normalizedCursorEvents,
    presentation.zoom.autoIntensity,
    fps,
    width,
    height,
  ), durationFrames);
  return {
    ...presentation,
    zoom: {
      ...presentation.zoom,
      markers,
    },
  };
}

function clampZoomMarkersToDuration(markers, durationFrames) {
  const maxFrame = Math.max(1, Math.round(durationFrames || 1));
  return markers
    .map((marker) => ({
      ...marker,
      startFrame: Math.max(0, Math.min(maxFrame - 1, Math.round(marker.startFrame))),
      endFrame: Math.max(0, Math.min(maxFrame, Math.round(marker.endFrame))),
    }))
    .filter((marker) => marker.endFrame > marker.startFrame);
}

function normalizeCursorEventsForAutoZoom(cursorEvents) {
  return cursorEvents.map((event) => {
    if (!event || typeof event !== 'object') return event;
    if (event.button === 0 || event.button === 'left' || event.button === 1) {
      return { ...event, button: 0 };
    }
    return event;
  });
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

  return { path: projectPath, document: await resolveProjectAssetPaths(projectPath, document) };
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

// Rename a project file on disk:
//   1. Atomically renames the .roughcut from fromPath to newPath
//   2. Renames the .bak sibling if it exists (keeps prior-generation safety net)
//   3. Reads the moved file, sets document.name = toName, saves through
//      saveProjectFile (atomic tmp+rename). This step also re-resolves asset
//      paths with the new dirname, but the dirname is the same so relative
//      paths are unchanged.
// Returns the new project state in the same shape as openProjectFile, so the
// renderer can swap React state and have its useEffect-bound autosave re-bind
// against the new path.
//
// Caller is responsible for serializing through the IPC save queue.
export async function renameProjectFile({ fromPath, toName }) {
  const trimmed = typeof toName === 'string' ? toName.trim() : '';
  if (!trimmed) throw new Error('Project name is required');
  if (/[\\/\0]/.test(trimmed)) throw new Error('Project name cannot contain slashes or null bytes');

  const dir = dirname(fromPath);
  const newPath = join(dir, `${trimmed}${PROJECT_FILE_EXTENSION}`);

  if (newPath !== fromPath) {
    const collision = await stat(newPath).catch(() => null);
    if (collision) {
      const err = new Error(`A project named "${trimmed}" already exists`);
      err.code = 'PROJECT_NAME_TAKEN';
      throw err;
    }
    await rename(fromPath, newPath);
    // Move the .bak sibling alongside so backup recovery still works.
    const fromBak = `${fromPath}${PROJECT_BACKUP_SUFFIX}`;
    const toBak = `${newPath}${PROJECT_BACKUP_SUFFIX}`;
    const bakExists = await stat(fromBak).catch(() => null);
    if (bakExists?.isFile()) {
      await rename(fromBak, toBak).catch(() => undefined);
    }
  }

  const opened = await openProjectFile(newPath);
  const renamedDocument = { ...opened.document, name: trimmed };
  const saved = await saveProjectFile(newPath, renamedDocument);
  return { path: saved.path, document: saved.document };
}

// Duplicate a project (.roughcut + every canonical sibling) to a new
// non-colliding name under the same directory. Reuses PROJECT_SIBLING_SPECS so
// it can never drift from deleteProjectFiles' notion of "what's a project."
//
// Auto-suffixes the new name with " (copy)", " (copy 2)", … bounded to 100
// tries. Updates the new project's JSON `name` field to match the new stem.
//
// Caller wraps this in `enqueueProjectOp(sourcePath, ...)` so concurrent
// duplicates of the same source serialize and can't both pick the same name.
// fs.copyFile uses libuv off-thread + copy_file_range on Linux — large
// .mp4/.mkv files copy without blocking the event loop.
export async function duplicateProjectFile({ fromPath }) {
  const dir = dirname(fromPath);
  const sourceStem = basename(fromPath).replace(new RegExp(`${escapeRegExp(PROJECT_FILE_EXTENSION)}$`, 'i'), '');

  // Pick a target name. Try plain " (copy)" first, then " (copy 2)" etc.
  let targetStem = `${sourceStem} (copy)`;
  let targetPath = join(dir, `${targetStem}${PROJECT_FILE_EXTENSION}`);
  for (let i = 2; i <= 100; i += 1) {
    const exists = await stat(targetPath).catch(() => null);
    if (!exists) break;
    targetStem = `${sourceStem} (copy ${i})`;
    targetPath = join(dir, `${targetStem}${PROJECT_FILE_EXTENSION}`);
  }
  // If we somehow exhausted 100 tries, throw — caller surfaces the error.
  const finalCollision = await stat(targetPath).catch(() => null);
  if (finalCollision) {
    const err = new Error(`Could not find a free duplicate name after 100 tries for ${fromPath}`);
    err.code = 'PROJECT_DUPLICATE_NAME_EXHAUSTED';
    throw err;
  }

  // Copy the .roughcut first so even if a sibling copy fails the duplicate is
  // at least visible in the gallery.
  await copyFile(fromPath, targetPath);

  // Copy every canonical sibling that exists.
  for (const spec of PROJECT_SIBLING_SPECS) {
    const sourceSibling = spec.kind === 'append'
      ? `${fromPath}${spec.suffix}`
      : join(dir, `${sourceStem}${spec.suffix}`);
    const targetSibling = spec.kind === 'append'
      ? `${targetPath}${spec.suffix}`
      : join(dir, `${targetStem}${spec.suffix}`);
    const sourceExists = await stat(sourceSibling).catch(() => null);
    if (!sourceExists?.isFile()) continue;
    await copyFile(sourceSibling, targetSibling);
  }

  // Rewrite the duplicate's JSON name to match the new stem so the gallery
  // and editor surfaces show the copy as a distinct project. saveProjectFile
  // refreshes modifiedAt as a side effect, landing the duplicate in "Today".
  const opened = await openProjectFile(targetPath);
  const renamedDoc = { ...opened.document, name: targetStem };
  const saved = await saveProjectFile(targetPath, renamedDoc);
  return { path: saved.path, document: saved.document };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// P-AI-C/TASK-168 — Build a validated ProjectDocument for an imported file.
// `probe` carries whatever metadata the caller could extract (durationFrames,
// width/height/fps for video). Pure: no I/O — that's the IPC handler's job.
const IMPORT_DEFAULT_FRAME_RATE = 30;
const IMPORT_DEFAULT_IMAGE_DURATION_SECONDS = 5;
const IMPORT_DEFAULT_RESOLUTION = { width: 1920, height: 1080 };

export function createProjectForImport({
  importedFilePath,
  mimeType,
  probe,
  now = new Date(),
}) {
  if (typeof importedFilePath !== 'string' || importedFilePath.length === 0) {
    throw new Error('createProjectForImport requires importedFilePath');
  }
  const kind = classifyImportKind(mimeType);
  const sourceFps = Number.isFinite(probe?.fps) && probe.fps > 0 ? probe.fps : IMPORT_DEFAULT_FRAME_RATE;
  // Snap the project's working fps to a schema-allowed value (24/30/60). The
  // playback transport reads `project.recording.fps` to convert
  // `video.currentTime → currentFrame`; if that fps disagrees with the
  // project's settings.frameRate, the canvas redraw cadence and the video's
  // native playback cadence drift and the user sees ~1 Hz stutter.
  // Always keep them equal. We still preserve the raw probe fps as
  // metadata.sourceFps for diagnostics / future re-conform.
  const projectFps = pickAllowedFps(sourceFps);
  const width = Number.isFinite(probe?.width) && probe.width > 0
    ? ensureEven(probe.width)
    : IMPORT_DEFAULT_RESOLUTION.width;
  const height = Number.isFinite(probe?.height) && probe.height > 0
    ? ensureEven(probe.height)
    : IMPORT_DEFAULT_RESOLUTION.height;
  const durationFrames = computeImportDurationFrames({ kind, probe, fps: projectFps });

  const name = basename(importedFilePath).replace(/\.[^./\\]+$/, '') || 'Imported clip';
  const assetType = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
  const trackType = kind === 'audio' ? 'audio' : 'video';

  const asset = createAsset(assetType, importedFilePath, {
    pathMode: 'absolute',
    duration: durationFrames,
    metadata: {
      width: kind === 'audio' ? null : width,
      height: kind === 'audio' ? null : height,
      // fps recorded here drives the playback transport — must match the
      // project's frameRate (see comment on projectFps above).
      fps: kind === 'audio' ? null : projectFps,
      sourceFps: kind === 'audio' ? null : sourceFps,
      mimeType: typeof mimeType === 'string' ? mimeType : null,
      importedAt: now.toISOString(),
      importKind: kind,
    },
  });

  const track = createTrack(trackType, {
    name: kind === 'audio' ? 'Audio' : 'Imported',
    index: 0,
  });
  const clip = createClip(asset.id, track.id, {
    name,
    timelineIn: 0,
    timelineOut: durationFrames,
    sourceIn: 0,
    sourceOut: durationFrames,
  });

  // P-AI-C/TASK-177 — video imports with an embedded audio stream get a
  // sibling audio asset over the same source file plus a dedicated audio
  // track. No demux: both assets reference `importedFilePath`. The
  // Recording-edit preview uses the asset.metadata.importKind === 'video'
  // signal to decide whether to unmute the source video element; the audio
  // asset/track makes the audio surface as a first-class timeline citizen
  // for transcription + per-track mute later.
  const includeSiblingAudio = kind === 'video' && probe?.hasAudio === true;
  const siblingAudioAsset = includeSiblingAudio
    ? createAsset('audio', importedFilePath, {
        pathMode: 'absolute',
        duration: durationFrames,
        metadata: {
          width: null,
          height: null,
          fps: null,
          sourceFps: null,
          mimeType: typeof mimeType === 'string' ? mimeType : null,
          importedAt: now.toISOString(),
          importKind: 'video',
          sourceAssetId: asset.id,
          audioSampleRate: toFiniteOrNull(probe?.audioSampleRate),
        },
      })
    : null;
  const siblingAudioTrack = includeSiblingAudio
    ? createTrack('audio', { name: 'Imported audio', index: 1 })
    : null;
  const siblingAudioClip = includeSiblingAudio
    ? createClip(siblingAudioAsset.id, siblingAudioTrack.id, {
        name: `${name} (audio)`,
        timelineIn: 0,
        timelineOut: durationFrames,
        sourceIn: 0,
        sourceOut: durationFrames,
      })
    : null;

  const assets = includeSiblingAudio ? [asset, siblingAudioAsset] : [asset];
  const tracks = includeSiblingAudio
    ? [
        { ...track, clips: [clip] },
        { ...siblingAudioTrack, clips: [siblingAudioClip] },
      ]
    : [{ ...track, clips: [clip] }];

  return validateProject(
    createProject({
      name,
      createdAt: now.toISOString(),
      modifiedAt: now.toISOString(),
      settings: {
        resolution: { width, height },
        frameRate: projectFps,
        backgroundColor: '#000000',
        sampleRate: 48000,
        destinationPresetId: null,
      },
      assets,
      composition: {
        duration: durationFrames,
        tracks,
        transitions: [],
      },
      exportSettings: {
        format: 'mp4',
        codec: 'h264',
        bitrate: 15_000_000,
        resolution: { width, height },
        frameRate: projectFps,
        keepClickSounds: true,
      },
    }),
  );
}

function classifyImportKind(mimeType) {
  if (typeof mimeType === 'string') {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
  }
  return 'video';
}

function computeImportDurationFrames({ kind, probe, fps }) {
  // Prefer seconds * project-fps over probe.durationFrames so the timeline
  // matches the project's frame rate (probe.durationFrames was computed at
  // the source's native fps, which may differ).
  if (Number.isFinite(probe?.durationSeconds) && probe.durationSeconds > 0) {
    return Math.max(1, Math.round(probe.durationSeconds * fps));
  }
  if (Number.isFinite(probe?.durationFrames) && probe.durationFrames > 0) {
    return Math.max(1, Math.round(probe.durationFrames));
  }
  if (kind === 'image') {
    return Math.max(1, Math.round(IMPORT_DEFAULT_IMAGE_DURATION_SECONDS * fps));
  }
  return Math.max(1, Math.round(5 * fps));
}

// Schema enforces FrameRate ∈ {24, 30, 60}. Map arbitrary source fps to the
// closest allowed setting for the project — clip duration stays in frames so
// playback length is preserved.
function pickAllowedFps(fps) {
  const allowed = [24, 30, 60];
  let best = 30;
  let bestDelta = Infinity;
  for (const candidate of allowed) {
    const delta = Math.abs(candidate - fps);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

// Pick a writable .roughcut path next to the imported file, falling back to
// `recordingsDir` if the source folder isn't writable. Always returns a path
// that does not exist yet (suffixed with " (2)", " (3)", ... on collision).
export async function pickImportProjectPath({ importedFilePath, recordingsDir }) {
  const stem = basename(importedFilePath).replace(/\.[^./\\]+$/, '') || 'Imported clip';
  const candidates = [dirname(importedFilePath), recordingsDir];
  for (const dir of candidates) {
    try {
      await mkdir(dir, { recursive: true });
      const path = await firstAvailableSuffixedPath(dir, stem);
      // Probe writability by touching the tmp suffix file.
      const probe = `${path}${PROJECT_TEMP_SUFFIX}`;
      await writeFileExclusive(probe).catch(() => null);
      await unlink(probe).catch(() => null);
      return path;
    } catch {
      // try the next candidate dir
    }
  }
  throw new Error('Could not find a writable location for the new project');
}

async function firstAvailableSuffixedPath(dir, stem) {
  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? '' : ` (${i + 1})`;
    const candidate = join(dir, `${stem}${suffix}${PROJECT_FILE_EXTENSION}`);
    const exists = await stat(candidate).then(() => true).catch(() => false);
    if (!exists) return candidate;
  }
  return join(dir, `${stem}-${Date.now()}${PROJECT_FILE_EXTENSION}`);
}

async function writeFileExclusive(path) {
  const handle = await open(path, 'wx');
  await handle.close();
}

export async function saveProjectForImport({
  importedFilePath,
  mimeType,
  probe,
  recordingsDir,
  now = new Date(),
}) {
  const project = createProjectForImport({ importedFilePath, mimeType, probe, now });
  const projectPath = await pickImportProjectPath({ importedFilePath, recordingsDir });
  return saveProjectFile(projectPath, project);
}

// P-AI-C/TASK-169 — blank project (no assets, no tracks). Used by the
// "Blank project" Library entry point and by the template-picker stub
// (TASK-170) which will pass an aspectRatio override.
export function createBlankProject({ name = 'Untitled', aspectRatio, now = new Date() } = {}) {
  // createProject() already produces near-blank shape; blank projects strip both
  // composition and generalized NLE tracks until the user imports or creates media.
  const base = createProject({
    name,
    createdAt: now.toISOString(),
    modifiedAt: now.toISOString(),
  });
  const merged = {
    ...base,
    assets: [],
    composition: { duration: 0, tracks: [], transitions: [] },
    tracks: [],
    settings: aspectRatio ? { ...base.settings, aspectRatio } : base.settings,
  };
  return validateProject(merged);
}

export async function pickBlankProjectPath({ recordingsDir, baseName = 'Untitled' }) {
  await mkdir(recordingsDir, { recursive: true });
  return firstAvailableSuffixedPath(recordingsDir, baseName);
}

export async function saveBlankProject({
  recordingsDir,
  name = 'Untitled',
  aspectRatio,
  now = new Date(),
}) {
  const project = createBlankProject({ name, aspectRatio, now });
  const projectPath = await pickBlankProjectPath({ recordingsDir, baseName: name });
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

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
