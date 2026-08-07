import { createHash } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { listRecordingProjectPaths } from './project-gallery.mjs';
import { openProjectFile, saveProjectFile, validateProjectPath } from './project-files.mjs';
import { getStyledCanvasResolution } from '@rough-cut/project-model';
// Deliberately no import from './export-service.mjs'. Serving the Editor its
// media must not be able to reach an encoder at all — see the note below.

const FREECUT_SCHEMA_VERSION = 1;

/**
 * ## Serving the Editor its media never encodes anything
 *
 * `resolveMedia` runs on *every* HTTP request for a clip, including every `Range`
 * request a `<video>` element issues (`freecut-window.mjs` serves 206s).
 *
 * This module used to answer those requests with a full-length styled render, and
 * it went exactly as badly as that sounds: 9 `ffmpeg` processes spawned within 3
 * seconds all writing the same target, 64GB RSS in 7 minutes, and a second
 * incident that pinned the machine at 76GB RAM + 31GB swap for 4.6 hours while
 * producing nothing. It was then wrapped in an in-process single-flight map, a
 * cross-process lockfile and a global one-at-a-time queue — three layers of
 * machinery whose entire job was to make an encode that should never have been
 * happening slightly less ruinous. Opening a project still meant ffmpeg, for as
 * long as the recording was.
 *
 * The premise was the bug. A preview must never wait on a render, at any project
 * length — and it does not need to: Rough Cut's compositor draws the Editor's
 * viewer live from the raw media, the same way Recording edit is drawn. So this
 * module hands back files and nothing else. The one place a rendered file is
 * legitimate is an Export the user explicitly asked for.
 */

export function createFreecutHost({
  recordingsDir,
  allowedRoots = [recordingsDir],
} = {}) {
  if (!recordingsDir) throw new Error('FreeCut host requires the Rough Cut recordings directory.');
  const registeredProjectPaths = new Set();

  return {
    dispose() {
      // Nothing long-running to tear down: this host only reads files. The
      // abort controller that used to live here existed to kill an orphaned
      // render, and there are no renders any more.
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
        // NOTHING here may start an encode. Opening a project used to fire a
        // full-length styled export in the background, so simply arriving in the
        // Editor put ffmpeg on the machine for as long as the recording was —
        // and the length of the recording is beside the point, a preview must
        // never wait on a render at all. The picture the user sees is composited
        // live by Rough Cut's compositor straight from the raw media, so the
        // program request only has to hand back decodable frames of the right
        // length. The raw recording is exactly that, at zero cost.
        const asset = opened.document.assets?.find((candidate) => (
          isProgramMedia ? candidate.id === styledDescriptor.sourceAssetId : candidate.id === assetId
        ));
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

/**
 * The canvas both views share.
 *
 * `settings.resolution` is the *source* recording's size and never changes — the
 * cursor layer and the compositor both read it as their coordinate space. The
 * shape of the finished program is `settings.aspectRatio`, which the user picks
 * in Recording edit and which Recording edit's preview and Export already resolve
 * through `getStyledCanvasResolution`. Handing the Editor the source size instead
 * left it on a 16:9 viewer while the program was vertical, so Rough Cut's
 * compositor painted a letterboxed picture into a wide black frame: two views of
 * one timeline that did not agree on the frame. Derive it the same way here and
 * the Editor shows every aspect Recording edit accepts.
 */
export function freecutCanvasResolution(document) {
  return getStyledCanvasResolution({
    aspectRatio: document?.settings?.aspectRatio ?? 'auto',
    sourceWidth: numberOr(document?.settings?.resolution?.width, 1920),
    sourceHeight: numberOr(document?.settings?.resolution?.height, 1080),
  });
}

export function toFreecutProject(document, roughCutPath, styledProgram = null) {
  const fps = numberOr(document.settings?.frameRate, 30);
  const canvas = freecutCanvasResolution(document);
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
      // The Editor's preview resolves a clip's video strictly by mediaId
      // (use-preview-composition-model: resolvedUrls.get(item.mediaId)) and
      // ignores `src` entirely — `src` is only honoured by thumbnail and inline
      // composition paths. Pointing mediaId at the raw source asset therefore
      // played the bare screen recording no matter what `src` said, which is
      // why the composited program never actually appeared. Point mediaId at
      // the program, and register it in `media` below so it can resolve.
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
        mediaId: isPrimaryVideo ? styledProgram.mediaId : asset.id,
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

  // The composited program must appear in the media library, because that is the
  // only thing the Editor's preview resolves against. Without this entry the
  // collapsed clip has nothing to play.
  const programMedia = styledProgram ? [{
    id: styledProgram.mediaId,
    storageType: 'workspace',
    roughCutUrl: `/__rough_cut__/media/${encodeURIComponent(document.id)}/${encodeURIComponent(styledProgram.mediaId)}`,
    fileName: `${document.name || 'program'}.mp4`,
    fileSize: 0,
    mimeType: 'video/mp4',
    duration: numberOr(document.composition?.duration, 0) / fps,
    // The program IS the canvas — it is the composite the user chose the shape
    // of, not a raw source, so it carries the styled canvas size.
    width: canvas.width,
    height: canvas.height,
    fps,
    codec: '',
    bitrate: 0,
    tags: [],
    createdAt: Date.parse(document.createdAt ?? '') || Date.now(),
    updatedAt: Date.parse(document.modifiedAt ?? '') || Date.now(),
  }] : [];

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
      width: canvas.width,
      height: canvas.height,
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
    media: [...programMedia, ...media],
  };
}

// True when the Editor is showing the collapsed program feed: one item whose
// source is the rendered program. FreeCut preserves a /__rough_cut__/ src
// verbatim, so this marker survives the round trip.
function isProgramCollapsedTimeline(timeline) {
  return (timeline?.items ?? []).some(
    (item) => (typeof item?.mediaId === 'string' && item.mediaId.endsWith('__program'))
      || (typeof item?.src === 'string' && item.src.includes('__program')),
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

// There is deliberately no render function here any more.
//
// This module used to own one — a full-length styled export, carefully made
// single-flight and lock-guarded after it once spawned nine ffmpeg processes at
// 76GB RAM. All of that machinery was in service of an idea that was wrong to
// begin with: that showing a preview may cost an encode. It may not, at any
// project length. Rough Cut's compositor draws every view live from the raw
// media, and serving media is now a file lookup. Anything that needs a rendered
// file is an explicit user-initiated Export, which lives in export-service.

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
