// Dev-only: clips added from outside the recording and camera takes recorded over
// timeline playback. Agreed spec: docs/SPEC-dev-insert-and-camera-takes-2026-10-20.md.
//
// Everything here is behind a local switch that only Noam's own dock copy turns on.
// Public builds never set it, so they never register these handlers.
//
// Source files and source projects are never modified or moved. The only files
// written are a finished export of another project and camera takes, both saved
// next to the current project. ffmpeg runs only through the capped, low-priority
// wrapper the export uses.
import { existsSync } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEV_FEATURES_ENV = 'ROUGH_CUT_DEV_FEATURES';
export const DEV_FEATURES_SWITCH_FILE = 'dev-features.on';
/** Folder beside the project that holds takes and finished exports of other projects. */
export const DEV_MEDIA_FOLDER = 'added-media';
/** A camera take is a live recording; anything longer than this is a stuck recorder. */
export const MAX_TAKE_BYTES = 4 * 1024 * 1024 * 1024;

export const INSERTABLE_VIDEO_EXTENSIONS = Object.freeze(['mp4', 'mov', 'mkv', 'webm', 'm4v']);

/** The switch: an environment variable from the dock launcher, or a file in the app config folder. */
export function devFeaturesEnabled({ env = process.env, userDataDir = null, exists = existsSync } = {}) {
  const value = String(env?.[DEV_FEATURES_ENV] ?? '').trim().toLowerCase();
  if (value === '1' || value === 'on' || value === 'true') return true;
  if (value === '0' || value === 'off' || value === 'false') return false;
  return Boolean(userDataDir) && exists(join(userDataDir, DEV_FEATURES_SWITCH_FILE));
}

export function classifyInsertPick(filePath) {
  const extension = extname(String(filePath ?? '')).slice(1).toLowerCase();
  if (extension === 'roughcut') return 'project';
  if (INSERTABLE_VIDEO_EXTENSIONS.includes(extension)) return 'video';
  return null;
}

export function devMediaDir(projectPath) {
  return join(dirname(projectPath), DEV_MEDIA_FOLDER);
}

/**
 * Probe a picked video and describe it in the current project's frames. Timeline
 * frames are always the project's frame rate, whatever the file's own rate is.
 */
export async function describeInsertableVideo(filePath, { projectFps = 30, probe, kind = 'video' } = {}) {
  const info = await probe(filePath, { kind });
  const seconds = Number(info?.durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Could not read how long this video is.');
  const fps = Number.isFinite(projectFps) && projectFps > 0 ? projectFps : 30;
  return {
    filePath,
    name: basename(filePath),
    durationFrames: Math.max(1, Math.round(seconds * fps)),
    durationSeconds: seconds,
    hasAudio: kind === 'audio' || info?.hasAudio === true,
    width: Number.isFinite(info?.width) ? info.width : null,
    height: Number.isFinite(info?.height) ? info.height : null,
    fps: Number.isFinite(info?.fps) ? info.fps : null,
  };
}

/**
 * Another project comes in with its finished look: export it (styled, through the
 * normal capped export) into this project's folder, then treat the result as a clip.
 */
export async function exportProjectForInsert({ sourceProjectPath, targetProjectPath, openProject, exportProject, onProgress = () => undefined, signal = null, now = new Date() }) {
  if (sourceProjectPath === targetProjectPath) throw new Error('A project cannot be added into itself.');
  const opened = await openProject(sourceProjectPath);
  const document = opened?.document ?? opened;
  if (!document?.assets) throw new Error('That project could not be opened.');
  const folder = devMediaDir(targetProjectPath);
  await mkdir(folder, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const outputPath = join(folder, `${basename(sourceProjectPath, '.roughcut')}-${stamp}.mp4`);
  const result = await exportProject({ project: document, outputPath, mode: 'styled', onProgress, signal });
  if (result?.cancelled) return null;
  return outputPath;
}

/**
 * Camera takes are streamed from the renderer's recorder in chunks, written to a
 * part file, then remuxed (no re-encode) so the file has a duration and seek index.
 */
export function createTakeWriter({ now = () => new Date(), uuid = randomUUID } = {}) {
  const sessions = new Map();
  return {
    async begin({ projectPath, kind = 'camera' }) {
      if (typeof projectPath !== 'string' || !projectPath.endsWith('.roughcut')) throw new Error('Save the project before recording a camera take.');
      const folder = devMediaDir(projectPath);
      await mkdir(folder, { recursive: true });
      const id = uuid();
      const stamp = now().toISOString().replace(/[:.]/g, '-');
      // Voice-over takes are sound only; camera takes are picture and sound.
      const prefix = kind === 'voice' ? 'voice-take' : 'camera-take';
      const partPath = join(folder, `${prefix}-${stamp}.part.webm`);
      const finalPath = join(folder, `${prefix}-${stamp}.webm`);
      const handle = await open(partPath, 'w');
      sessions.set(id, { handle, partPath, finalPath, bytes: 0 });
      return { id, path: finalPath };
    },
    async append(id, chunk) {
      const session = sessions.get(id);
      if (!session) throw new Error('No camera take is being recorded.');
      const buffer = Buffer.from(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk);
      session.bytes += buffer.length;
      if (session.bytes > MAX_TAKE_BYTES) throw new Error('The camera take is too large.');
      await session.handle.write(buffer);
      return session.bytes;
    },
    async finish(id, { remux }) {
      const session = sessions.get(id);
      if (!session) throw new Error('No camera take is being recorded.');
      sessions.delete(id);
      await session.handle.close();
      const size = (await stat(session.partPath)).size;
      if (size === 0) {
        await rm(session.partPath, { force: true });
        throw new Error('The camera take is empty.');
      }
      const ok = await remux(session.partPath, session.finalPath);
      if (ok) {
        await rm(session.partPath, { force: true });
      } else {
        // Keep the recording even when the remux fails; it still plays.
        await rename(session.partPath, session.finalPath);
      }
      return session.finalPath;
    },
    async cancel(id) {
      const session = sessions.get(id);
      if (!session) return false;
      sessions.delete(id);
      await session.handle.close().catch(() => undefined);
      await rm(session.partPath, { force: true });
      return true;
    },
    activeCount: () => sessions.size,
  };
}

/** Stream copy into a fresh WebM so it gains a duration and cues. No re-encode, two threads. */
export function buildTakeRemuxArgs(inputPath, outputPath) {
  return ['-y', '-v', 'error', '-fflags', '+genpts', '-i', inputPath, '-map', '0', '-c', 'copy', '-threads', '2', outputPath];
}
