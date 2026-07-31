import { basename, extname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { listRecordingProjectPaths } from './project-gallery.mjs';
import { openProjectFile, saveProjectFile, validateProjectPath } from './project-files.mjs';

const FREECUT_SCHEMA_VERSION = 1;

export function createFreecutHost({ recordingsDir, allowedRoots = [recordingsDir] } = {}) {
  if (!recordingsDir) throw new Error('FreeCut host requires the Rough Cut recordings directory.');

  return {
    async getSnapshot() {
      const paths = await listRecordingProjectPaths(recordingsDir);
      const projects = [];
      for (const path of paths) {
        try {
          const opened = await openProjectFile(path);
          projects.push(toFreecutProject(opened.document, path));
        } catch (error) {
          console.warn('[freecut-host] skipping unreadable project', path, error?.message ?? error);
        }
      }
      return { schemaVersion: FREECUT_SCHEMA_VERSION, projects };
    },

    async resolveMedia(projectId, assetId) {
      const paths = await listRecordingProjectPaths(recordingsDir);
      for (const path of paths) {
        const opened = await openProjectFile(path).catch(() => null);
        if (opened?.document?.id !== projectId) continue;
        const asset = opened.document.assets?.find((candidate) => candidate.id === assetId);
        if (!asset?.filePath) return null;
        const resolvedPath = resolve(asset.filePath);
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

export function toFreecutProject(document, roughCutPath) {
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
      items.push({
        id: clip.id,
        trackId: track.id,
        from: numberOr(clip.timelineIn, 0),
        durationInFrames: Math.max(1, numberOr(clip.timelineOut, 1) - numberOr(clip.timelineIn, 0)),
        label: clip.name || basename(asset.filePath ?? 'Media'),
        mediaId: asset.id,
        type,
        sourceStart: numberOr(clip.sourceIn, 0),
        sourceEnd: numberOr(clip.sourceOut, numberOr(asset.duration, 1)),
        sourceDuration: numberOr(asset.duration, 1),
        sourceFps: fps,
        volume: clip.volume,
        transform: clip.transform,
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
    timeline: {
      tracks: freecutTracks,
      items,
      transitions: [],
      keyframes: [],
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

export function fromFreecutProject(project, original) {
  const timeline = project?.timeline;
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
        enabled: true,
        timelineIn: numberOr(item.from, 0),
        timelineOut: numberOr(item.from, 0) + numberOr(item.durationInFrames, 1),
        sourceIn: numberOr(item.sourceStart, 0),
        sourceOut: numberOr(item.sourceEnd, numberOr(item.sourceStart, 0) + numberOr(item.durationInFrames, 1)),
        transform: item.transform,
        effects: [],
        keyframes: [],
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
    composition: {
      ...original.composition,
      duration: numberOr(project.duration, original.composition?.duration ?? 0),
      tracks,
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
