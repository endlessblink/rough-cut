import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { openProjectFile, PROJECT_FILE_EXTENSION, saveProjectFile } from './project-files.mjs';
import { toMediaUrl } from './media-protocol.mjs';
import { buildThumbnailPath, extractThumbnail, fileExists } from './thumbnail-service.mjs';
import { PROJECT_SIBLING_SPECS, siblingPathFor } from './project-sibling-specs.mjs';

// Re-export the table so existing consumers don't need to update their imports.
export { PROJECT_SIBLING_SPECS } from './project-sibling-specs.mjs';

// Delete the .roughcut file plus every recognized sibling next to it. Missing
// siblings are silently ignored (the recording flow doesn't always produce
// every artifact). Sibling failures are logged via onError so a partial
// cleanup can still report success on the primary file.
//
// Caller is responsible for serializing through the IPC save queue.
export async function deleteProjectFiles(projectPath, { onError } = {}) {
  const removed = [];

  // Remove the .roughcut first.
  await unlink(projectPath).catch((err) => {
    if (err?.code === 'ENOENT') return;
    throw err;
  });
  removed.push(projectPath);

  for (const spec of PROJECT_SIBLING_SPECS) {
    const siblingPath = siblingPathFor(projectPath, spec, PROJECT_FILE_EXTENSION);
    try {
      await unlink(siblingPath);
      removed.push(siblingPath);
    } catch (err) {
      if (err?.code === 'ENOENT') continue;
      onError?.(siblingPath, err);
    }
  }

  return { removed };
}

export async function listRecordingProjectPaths(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
  const paths = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(PROJECT_FILE_EXTENSION)) continue;
    paths.push(join(dir, entry.name));
  }
  return paths;
}

export async function readProjectSummary(projectPath, { onError, generateMissingThumbnail = true } = {}) {
  let info;
  try {
    info = await stat(projectPath);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
  let opened;
  try {
    opened = await openProjectFile(projectPath);
  } catch (err) {
    onError?.(projectPath, err);
    return null;
  }
  let document = opened.document;
  if (generateMissingThumbnail) {
    const updated = await ensureProjectThumbnail({ projectPath, document, onError });
    if (updated) document = updated;
  }
  return buildSummary({ projectPath, document, modifiedAt: info.mtime.toISOString() });
}

export async function ensureProjectThumbnail({ projectPath, document, onError, extract = extractThumbnail, persist = saveProjectFile }) {
  const assets = Array.isArray(document?.assets) ? document.assets : [];
  const recordingIndex = assets.findIndex((asset) => asset.type === 'recording' || asset.type === 'video');
  if (recordingIndex < 0) return null;
  const recordingAsset = assets[recordingIndex];
  if (recordingAsset.thumbnailPath && await fileExists(recordingAsset.thumbnailPath)) return null;
  if (!recordingAsset.filePath) return null;
  if (!(await fileExists(recordingAsset.filePath))) return null;

  const thumbPath = buildThumbnailPath(projectPath);
  const frameRate = Number(document?.settings?.frameRate) || 30;
  const durationFrames = Number(document?.composition?.duration) || 0;
  const midpointSeconds = durationFrames > 0 ? (durationFrames / frameRate) * 0.5 : 0;

  try {
    await extract({ videoPath: recordingAsset.filePath, outputPath: thumbPath, atSeconds: midpointSeconds });
  } catch (err) {
    onError?.(projectPath, err);
    return null;
  }

  const nextAssets = [...assets];
  nextAssets[recordingIndex] = { ...recordingAsset, thumbnailPath: thumbPath };
  const nextDocument = { ...document, assets: nextAssets };
  try {
    const saved = await persist(projectPath, nextDocument);
    return saved.document ?? nextDocument;
  } catch (err) {
    onError?.(projectPath, err);
    return nextDocument;
  }
}

export function buildSummary({ projectPath, document, modifiedAt }) {
  const assets = Array.isArray(document?.assets) ? document.assets : [];
  const recordingAsset = assets.find((asset) => asset.type === 'recording' || asset.type === 'video') ?? null;
  const cameraAsset = recordingAsset?.cameraAssetId
    ? assets.find((asset) => asset.id === recordingAsset.cameraAssetId) ?? null
    : null;
  const frameRate = Number(document?.settings?.frameRate) || 30;
  const durationFrames = Number(document?.composition?.duration) || 0;
  const durationMs = Math.round((durationFrames / frameRate) * 1000);
  const thumbnailSourcePath = recordingAsset?.thumbnailPath ?? null;
  const width = Number(document?.settings?.resolution?.width) || null;
  const height = Number(document?.settings?.resolution?.height) || null;
  return {
    path: projectPath,
    name: typeof document?.name === 'string' && document.name.length > 0 ? document.name : projectPath,
    createdAt: document?.createdAt ?? null,
    modifiedAt: document?.modifiedAt ?? modifiedAt,
    durationFrames,
    durationMs,
    frameRate,
    width,
    height,
    resolutionLabel: deriveResolutionLabel(width, height),
    hasCamera: Boolean(cameraAsset),
    thumbnailUrl: thumbnailSourcePath ? toMediaUrl(thumbnailSourcePath) : null,
    recordingUrl: recordingAsset?.filePath ? toMediaUrl(recordingAsset.filePath) : null,
  };
}

export function deriveResolutionLabel(width, height) {
  if (!width || !height) return null;
  // Anchor on the shorter side so 1920x1080 → 1080p and 1080x1920 (vertical) → 1080p too.
  const short = Math.min(width, height);
  if (short >= 2160) return '4K';
  if (short >= 1440) return '1440p';
  if (short >= 1080) return '1080p';
  if (short >= 720) return '720p';
  return `${short}p`;
}

export async function listProjectSummaries({ dir, onError } = {}) {
  const paths = await listRecordingProjectPaths(dir);
  const summaries = await Promise.all(paths.map((path) => readProjectSummary(path, { onError })));
  return summaries
    .filter(Boolean)
    .sort((a, b) => {
      const left = Date.parse(a.modifiedAt ?? '') || 0;
      const right = Date.parse(b.modifiedAt ?? '') || 0;
      return right - left;
    });
}
