import { createHash } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { listRecordingProjectPaths } from './project-gallery.mjs';
import { openProjectFile, saveProjectFile, validateProjectPath } from './project-files.mjs';
import { exportProjectToMp4, EXPORT_MODES } from './export-service.mjs';

const FREECUT_SCHEMA_VERSION = 1;

/**
 * ## Styled program renders are single-flight, and must stay that way
 *
 * `resolveMedia` runs on *every* HTTP request for a clip, including every `Range`
 * request a `<video>` element issues (`freecut-window.mjs` serves 206s). Until the
 * cache file exists, every one of those requests misses the cache at the same moment.
 *
 * Without a guard that means one clip fans out into N identical full 1080p renders.
 * Observed in production: 9 `ffmpeg` processes spawned within 3 seconds, all writing
 * the same target, 64GB RSS in 7 minutes, and a second incident that pinned the
 * machine at 76GB RAM + 31GB swap for 4.6 hours while producing nothing.
 *
 * Three layers keep that from recurring, and all three are load-bearing:
 *
 * 1. `inFlightStyledPrograms` — concurrent callers in this process share one render.
 *    This is what collapses the request burst.
 * 2. A lockfile — a *second app instance* cannot see our in-memory map, and two
 *    instances running at once is exactly what happened. Stale locks (dead pid) are
 *    reclaimed so a crash cannot wedge exports forever.
 * 3. `styledProgramQueue` — a global cap of one render at a time, so two *different*
 *    clips cannot stack into a second memory bomb. Both incidents included jobs with
 *    differing fingerprints, i.e. genuinely different renders overlapping.
 *
 * The render also writes to a `.partial-<pid>.mp4` sibling and is renamed into place
 * only on success, so "the cache file exists" means "finished and valid" — a killed
 * export can never leave a truncated file that a later request reads as a cache hit.
 * The partial keeps the `.mp4` extension because ffmpeg picks its muxer from it.
 */
const inFlightStyledPrograms = new Map();
let styledProgramQueue = Promise.resolve();

// A caller waiting on *another process*'s render gives up after this and reports the
// media as unavailable. An unbounded wait would turn a memory hang into a UI hang.
// Read per call, not at import, so it stays tunable at runtime and in tests.
const DEFAULT_STYLED_PROGRAM_WAIT_MS = 15 * 60_000;
const STYLED_PROGRAM_POLL_MS = 500;

function styledProgramWaitMs() {
  const configured = Number(process.env.ROUGH_CUT_STYLED_WAIT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STYLED_PROGRAM_WAIT_MS;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else — still alive.
    return error?.code === 'EPERM';
  }
}

async function acquireStyledProgramLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
      return handle;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = await readFile(lockPath, 'utf8').then(JSON.parse).catch(() => null);
      // A lock with no readable owner, or one whose owner died, is ours to reclaim.
      if (owner && isProcessAlive(owner.pid)) return null;
      await unlink(lockPath).catch(() => {});
    }
  }
  return null;
}

async function waitForStyledProgram(outputPath, timeoutMs = styledProgramWaitMs()) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await stat(outputPath).catch(() => null);
    if (info?.isFile() && info.size > 0) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, STYLED_PROGRAM_POLL_MS));
  }
  return false;
}

// Serialize onto the global queue while de-duplicating by target path. Callers for the
// same target share one promise; callers for different targets run one after another.
function runStyledProgramExclusive(outputPath, task) {
  const existing = inFlightStyledPrograms.get(outputPath);
  if (existing) return existing;

  const queued = styledProgramQueue.then(task, task);
  styledProgramQueue = queued.then(() => {}, () => {});
  inFlightStyledPrograms.set(outputPath, queued);
  void queued.then(
    () => { if (inFlightStyledPrograms.get(outputPath) === queued) inFlightStyledPrograms.delete(outputPath); },
    () => { if (inFlightStyledPrograms.get(outputPath) === queued) inFlightStyledPrograms.delete(outputPath); },
  );
  return queued;
}

export function createFreecutHost({
  recordingsDir,
  allowedRoots = [recordingsDir],
  // Injectable so tests can count renders without shelling out to ffmpeg.
  exportStyledProgram = exportProjectToMp4,
} = {}) {
  if (!recordingsDir) throw new Error('FreeCut host requires the Rough Cut recordings directory.');
  const registeredProjectPaths = new Set();
  const deferStyledRender = exportStyledProgram === exportProjectToMp4;
  // Aborted on app shutdown so a closing window cannot orphan a render. Both incidents
  // ended with ffmpeg reparented to `systemd --user`, still burning memory with nobody
  // reading its progress.
  const shutdown = new AbortController();

  return {
    dispose() {
      shutdown.abort();
    },

    registerProjectPath(projectPath) {
      if (typeof projectPath === 'string' && projectPath.trim()) registeredProjectPaths.add(resolve(projectPath));
    },

    async getSnapshot() {
      const paths = [...new Set([
        ...(await listRecordingProjectPaths(recordingsDir)),
        ...registeredProjectPaths,
      ])];
      const projects = [];
      const transcripts = [];
      for (const path of paths) {
        try {
          const opened = await openProjectFile(path);
          // Every project describes its program, not just the one Rough Cut has
          // registered. Gating this meant only the currently-open project was
          // collapsed to a single feed; every other project reached the Editor
          // as separate raw screen and camera clips on separate tracks.
          // This stays cheap — describeStyledProgram only hashes the document.
          // The expensive render is still deferred: it is triggered by
          // resolveMedia when the program is actually requested for playback.
          const styledProgram = describeStyledProgram(opened.document, path);
          const project = toFreecutProject(opened.document, path, styledProgram);
          projects.push(project);
          const transcript = toFreecutTranscript(opened.document, project);
          if (transcript) transcripts.push(transcript);
        } catch (error) {
          console.warn('[freecut-host] skipping unreadable project', path, error?.message ?? error);
        }
      }
      return { schemaVersion: FREECUT_SCHEMA_VERSION, projects, transcripts };
    },

    async resolveMedia(projectId, assetId) {
      const paths = [...new Set([
        ...(await listRecordingProjectPaths(recordingsDir)),
        ...registeredProjectPaths,
      ])];
      for (const path of paths) {
        const opened = await openProjectFile(path).catch(() => null);
        if (opened?.document?.id !== projectId) continue;
        const styledDescriptor = describeStyledProgram(opened.document, path);
        const isProgramMedia = styledDescriptor?.mediaId === assetId;
        const styledPath = isProgramMedia
          ? await findCompletedStyledCache(styledDescriptor.outputPath, opened.document.id)
          : null;
        if (isProgramMedia && !styledPath && deferStyledRender) {
          // Do not make every video range request wait for a full-length export.
          // The first request gets the source immediately while the styled cache
          // renders in the background; later requests promote to the finished cache.
          void ensureStyledProgram(opened.document, path, {
            signal: shutdown.signal,
            exportStyledProgram,
          }).catch((error) => console.warn('[freecut-host] background styled render failed', error?.message ?? error));
        }
        const awaitedStyledProgram = isProgramMedia && !styledPath && !deferStyledRender
          ? await ensureStyledProgram(opened.document, path, { signal: shutdown.signal, exportStyledProgram })
          : null;
        const styledProgram = styledPath
          ? { ...styledDescriptor, path: styledPath }
          : awaitedStyledProgram;
        if (styledProgram?.mediaId === assetId) {
          const info = await stat(styledProgram.path).catch(() => null);
          if (!info?.isFile()) return null;
          return { path: styledProgram.path, size: info.size, mimeType: 'video/mp4' };
        }
        // A program request that has no finished render resolves to nothing. It
        // must never fall back to the raw source: that is the unstyled recording
        // with no camera PiP, zoom or cursor, and a <video> element handed the
        // raw file never re-requests, so the Editor would stay wrong for the
        // whole session. The background render was already kicked off above.
        if (assetId.endsWith('__program')) return null;

        const asset = opened.document.assets?.find((candidate) => candidate.id === assetId);
        if (!asset?.filePath) return null;
        const resolvedPath = isAbsolute(asset.filePath)
          ? resolve(asset.filePath)
          : resolve(dirname(path), asset.filePath);
        const info = await stat(resolvedPath).catch(() => null);
        if (!info?.isFile()) return null;
        return { path: resolvedPath, size: info.size, mimeType: mimeTypeFor(resolvedPath) };
      }
      return null;
    },

    async saveProject(project) {
      const path = validateProjectPath(project?.roughCutPath, { allowedRoots });
      const opened = await openProjectFile(path);
      if (opened.document.id !== project.id) throw new Error('FreeCut project does not match Rough Cut project.');
      const document = fromFreecutProject(project, opened.document);
      return saveProjectFile(path, document);
    },
  };
}

// A stored timeline only counts once it actually has tracks. An empty one means
// FreeCut has not really opened this project, so the composition should seed it.
function hasStoredFreecutTimeline(document) {
  const stored = document?.freecutTimeline;
  return Boolean(stored && Array.isArray(stored.tracks) && stored.tracks.length > 0);
}

export function toFreecutProject(document, roughCutPath, styledProgram = null) {
  const fps = numberOr(document.settings?.frameRate, 30);
  const assets = Array.isArray(document.assets) ? document.assets : [];
  const tracks = Array.isArray(document.composition?.tracks) ? document.composition.tracks : [];
  const items = [];
  const freecutTracks = tracks.map((track, order) => {
    const kind = track.type === 'audio' ? 'audio' : 'video';
    for (const clip of track.clips ?? []) {
      const asset = assets.find((candidate) => candidate.id === clip.assetId);
      if (!asset) continue;
      const type = asset.type === 'audio' ? 'audio' : asset.type === 'image' ? 'image' : 'video';
      const isPrimaryVideo = styledProgram && asset.id === styledProgram.sourceAssetId && type === 'video';
      // The styled program is the finished composite: it already contains the
      // camera PiP, background, zoom, cursor and the mixed audio. Seeding the
      // other source clips alongside it draws the camera a second time on top
      // of itself and doubles the audio. Only the clip carrying the program
      // survives; the raw assets stay in `media` so they remain reachable.
      if (styledProgram && !isPrimaryVideo) continue;
      items.push({
        id: clip.id,
        trackId: track.id,
        from: numberOr(clip.timelineIn, 0),
        durationInFrames: Math.max(1, numberOr(clip.timelineOut, 1) - numberOr(clip.timelineIn, 0)),
        label: clip.name || basename(asset.filePath ?? 'Media'),
        mediaId: asset.id,
        ...(isPrimaryVideo ? {
          src: `/__rough_cut__/media/${encodeURIComponent(document.id)}/${encodeURIComponent(styledProgram.mediaId)}`,
        } : {}),
        type,
        sourceStart: numberOr(clip.sourceIn, 0),
        sourceEnd: numberOr(clip.sourceOut, numberOr(asset.duration, 1)),
        sourceDuration: numberOr(asset.duration, 1),
        sourceFps: fps,
        volume: clip.volume,
        transform: clip.transform,
        effects: clip.effects ?? [],
        keyframes: clip.keyframes ?? [],
      });
    }
    return {
      id: track.id,
      name: track.name || `Track ${order + 1}`,
      kind,
      height: 88,
      locked: Boolean(track.locked),
      visible: track.visible !== false,
      muted: false,
      solo: false,
      volume: 1,
      order,
    };
  });

  const media = assets.map((asset) => ({
    id: asset.id,
    storageType: 'workspace',
    roughCutUrl: `/__rough_cut__/media/${encodeURIComponent(document.id)}/${encodeURIComponent(asset.id)}`,
    fileName: basename(asset.filePath ?? asset.id),
    fileSize: 0,
    mimeType: mimeTypeFor(asset.filePath),
    duration: numberOr(asset.duration, 0) / fps,
    width: numberOr(asset.metadata?.width, numberOr(document.settings?.resolution?.width, 1920)),
    height: numberOr(asset.metadata?.height, numberOr(document.settings?.resolution?.height, 1080)),
    fps,
    codec: '',
    bitrate: 0,
    tags: [],
    createdAt: Date.parse(document.createdAt ?? '') || Date.now(),
    updatedAt: Date.parse(document.modifiedAt ?? '') || Date.now(),
  }));

  return {
    id: document.id,
    name: document.name || 'Untitled',
    description: '',
    createdAt: Date.parse(document.createdAt ?? '') || Date.now(),
    updatedAt: Date.parse(document.modifiedAt ?? '') || Date.now(),
    duration: numberOr(document.composition?.duration, 0),
    schemaVersion: FREECUT_SCHEMA_VERSION,
    metadata: {
      width: numberOr(document.settings?.resolution?.width, 1920),
      height: numberOr(document.settings?.resolution?.height, 1080),
      fps,
      backgroundColor: document.settings?.backgroundColor ?? '#000000',
    },
    // Once FreeCut has saved, its own timeline is authoritative for tracks and
    // items — it is the only place elements Rough Cut cannot model (titles,
    // transitions, effects) exist. Rebuilding from the composition here would
    // delete them on the next open, because FreeCut hydrates its stores from
    // exactly this object. The composition mapping below is the seed for a
    // project FreeCut has never opened.
    timeline: hasStoredFreecutTimeline(document) ? document.freecutTimeline : {
      // With the program collapsed to one item, every other track is empty —
      // its source is baked into the program. Emitting them anyway put a stray
      // empty "Camera" track beside the feed in the Editor.
      tracks: styledProgram
        ? freecutTracks.filter((track) => items.some((item) => item.trackId === track.id))
        : freecutTracks,
      items,
      transitions: document.composition?.transitions ?? [],
      keyframes: items
        .filter((item) => Array.isArray(item.keyframes) && item.keyframes.length > 0)
        .map((item) => ({ itemId: item.id, properties: item.keyframes })),
      markers: [],
      inPoint: null,
      outPoint: null,
      currentFrame: 0,
      scrollPosition: 0,
      zoomLevel: 1,
    },
    roughCutPath,
    roughCutAssets: assets.map((asset) => ({ id: asset.id, filePath: asset.filePath })),
    media,
  };
}

// True when the Editor is showing the collapsed program feed: one item whose
// source is the rendered program. FreeCut preserves a /__rough_cut__/ src
// verbatim, so this marker survives the round trip.
function isProgramCollapsedTimeline(timeline) {
  return (timeline?.items ?? []).some(
    (item) => typeof item?.src === 'string' && item.src.includes('__program'),
  );
}

export function fromFreecutProject(project, original) {
  const timeline = project?.timeline;

  // A collapsed program timeline is NOT a representation of the Rough Cut
  // composition: the camera and audio are baked into the rendered program and
  // have no items of their own. Rebuilding tracks from it would map those to
  // empty clip lists and delete the camera from the user's project. Keep the
  // composition exactly as it was and store the Editor's timeline alongside it.
  if (isProgramCollapsedTimeline(timeline)) {
    return {
      ...original,
      name: project.name || original.name,
      freecutTimeline: timeline,
    };
  }
  const tracks = (timeline?.tracks ?? []).map((track, index) => {
    const originalTrack = original.composition?.tracks?.find((candidate) => candidate.id === track.id) ?? {};
    const clips = (timeline?.items ?? [])
      .filter((item) => item.trackId === track.id && item.mediaId)
      .map((item) => ({
        ...(originalTrack.clips?.find((candidate) => candidate.id === item.id) ?? {}),
        id: item.id,
        assetId: item.mediaId,
        trackId: track.id,
        name: item.label,
        enabled: item.enabled !== false,
        timelineIn: numberOr(item.from, 0),
        timelineOut: numberOr(item.from, 0) + numberOr(item.durationInFrames, 1),
        sourceIn: numberOr(item.sourceStart, 0),
        sourceOut: numberOr(item.sourceEnd, numberOr(item.sourceStart, 0) + numberOr(item.durationInFrames, 1)),
        transform: item.transform,
        effects: item.effects ?? originalTrack.clips?.find((candidate) => candidate.id === item.id)?.effects ?? [],
        keyframes: item.keyframes ?? originalTrack.clips?.find((candidate) => candidate.id === item.id)?.keyframes ?? [],
        ...(item.volume === undefined ? {} : { volume: item.volume }),
      }));
    return {
      ...originalTrack,
      id: track.id,
      type: track.kind === 'audio' ? 'audio' : 'video',
      name: track.name,
      index,
      locked: Boolean(track.locked),
      visible: track.visible !== false,
      volume: numberOr(track.volume, 1),
      clips,
    };
  });

  return {
    ...original,
    name: project.name || original.name,
    // Kept verbatim so nothing the Editor added is lost. Rough Cut only models a
    // closed set of elements (cursor, click, camera-pip, zoom, annotation,
    // stabilization), so a title or transition has nowhere to live in the
    // composition below — mapping alone silently deleted them. Export still
    // reads the composition; this region is what makes the Editor round-trip.
    ...(timeline ? { freecutTimeline: timeline } : {}),
    composition: {
      ...original.composition,
      duration: numberOr(project.duration, original.composition?.duration ?? 0),
      tracks,
      transitions: timeline?.transitions ?? original.composition?.transitions ?? [],
    },
  };
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function mimeTypeFor(filePath = '') {
  const extension = extname(filePath).toLowerCase();
  return {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  }[extension] ?? 'application/octet-stream';
}

async function ensureStyledProgram(document, roughCutPath, {
  signal = undefined,
  exportStyledProgram = exportProjectToMp4,
} = {}) {
  const descriptor = describeStyledProgram(document, roughCutPath);
  if (!descriptor) return null;
  const { mediaId, outputPath, sourceAssetId } = descriptor;
  const cachedPath = await findCompletedStyledCache(outputPath, document.id);
  const hit = { mediaId, path: cachedPath ?? outputPath, sourceAssetId };

  // Fast path, and the one every request takes once the render has landed.
  if (cachedPath) return hit;

  const project = {
    ...document,
    assets: (document.assets ?? []).map((asset) => ({
      ...asset,
      filePath: asset.filePath && !isAbsolute(asset.filePath)
        ? resolve(dirname(roughCutPath), asset.filePath)
        : asset.filePath,
    })),
  };

  // Everything past here is de-duplicated: concurrent callers for this output share
  // one render, and renders for different outputs run one at a time. See the comment
  // on `inFlightStyledPrograms` for why all of that is load-bearing.
  const produced = await runStyledProgramExclusive(outputPath, async () => {
    // Re-check under the guard: a caller we queued behind may have just produced it.
    if (await findCompletedStyledCache(outputPath, document.id)) return true;

    const cacheDir = dirname(outputPath);
    await mkdir(cacheDir, { recursive: true });

    const lockPath = `${outputPath}.lock`;
    const lock = await acquireStyledProgramLock(lockPath);
    if (!lock) {
      // Another app instance owns this render. Wait for its result rather than
      // starting a second one; give up eventually so a request cannot hang forever.
      return waitForStyledProgram(outputPath);
    }

    // Keep the .mp4 suffix — ffmpeg picks its muxer from the extension.
    const partialPath = join(cacheDir, `.${basename(outputPath, '.mp4')}.partial-${process.pid}.mp4`);
    try {
      await exportStyledProgram({ project, outputPath: partialPath, mode: EXPORT_MODES.STYLED, signal });
      const generated = await stat(partialPath).catch(() => null);
      if (!generated?.isFile() || generated.size === 0) return false;
      // Publish atomically: "the cache file exists" now means "finished and valid".
      await rename(partialPath, outputPath);
      return true;
    } catch (error) {
      console.warn('[freecut-host] styled program generation failed; using raw media', error?.message ?? error);
      return false;
    } finally {
      await unlink(partialPath).catch(() => {});
      await lock.close().catch(() => {});
      await unlink(lockPath).catch(() => {});
    }
  }).catch((error) => {
    console.warn('[freecut-host] styled program render failed', error?.message ?? error);
    return false;
  });

  return produced ? hit : null;
}

// Only the render whose fingerprint matches the current project state counts as a
// hit. This used to fall back to the newest `<projectId>-*-web.mp4` in the folder
// regardless of fingerprint, which defeated invalidation completely: the Editor
// kept playing a render from an older edit state indefinitely, because every edit
// produced a fingerprint whose file did not exist while a stale one always did.
// `projectId` is retained so both call sites stay unchanged.
export async function findCompletedStyledCache(outputPath, _projectId) {
  const exact = await stat(outputPath).catch(() => null);
  return exact?.isFile() && exact.size > 0 ? outputPath : null;
}

// The fingerprint is a cache key for a full-length ffmpeg export, so it must
// cover exactly the inputs the styled render reads and nothing else. `modifiedAt`
// was in here and changes on every save — a rename or a transcript edit, neither
// of which moves a pixel, invalidated the whole recording's render.
export function describeStyledProgram(document, roughCutPath) {
  const sourceAsset = (document.assets ?? []).find((asset) => asset.type === 'recording' || asset.type === 'video');
  if (!sourceAsset?.filePath) return null;
  const mediaId = `${sourceAsset.id}__program`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({
      sourceAsset,
      composition: document.composition,
      settings: document.settings,
    }))
    .digest('hex')
    .slice(0, 16);
  const outputPath = join(dirname(roughCutPath), '.roughcut-freecut-cache', `${document.id}-${fingerprint}-web.mp4`);
  return { mediaId, outputPath, sourceAssetId: sourceAsset.id };
}

function toFreecutTranscript(document, project) {
  const source = document?.transcript;
  const mediaId = project?.roughCutAssets?.find((asset) => asset.id)?.id;
  const words = Array.isArray(source?.words)
    ? source.words
        .map((word) => ({
          text: String(word?.word ?? word?.text ?? '').trim(),
          start: numberOr(word?.startFrame, 0) / numberOr(project?.metadata?.fps, 30),
          end: numberOr(word?.endFrame, 0) / numberOr(project?.metadata?.fps, 30),
        }))
        .filter((word) => word.text && word.end > word.start)
    : [];
  if (!mediaId || words.length === 0) return null;
  return {
    id: mediaId,
    mediaId,
    model: 'whisper-tiny',
    language: source.language,
    quantization: 'fp32',
    text: words.map((word) => word.text).join(' '),
    segments: [{
      text: words.map((word) => word.text).join(' '),
      start: words[0].start,
      end: words.at(-1).end,
      words,
    }],
    createdAt: Date.parse(document.createdAt ?? '') || Date.now(),
    updatedAt: Date.parse(document.modifiedAt ?? '') || Date.now(),
  };
}
