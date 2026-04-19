import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';

function getRecoveryFilePath() {
  return join(app.getPath('userData'), 'recording-recovery.json');
}

function toNonEmptyPath(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getArtifactCandidate(filePath) {
  const normalizedPath = toNonEmptyPath(filePath);
  if (!normalizedPath || !existsSync(normalizedPath)) return null;

  try {
    const stats = statSync(normalizedPath);
    if (!stats.isFile() || stats.size <= 0) return null;
    return {
      path: normalizedPath,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

function normalizeRecordingRecoveryManifest(payload = {}) {
  const expectedArtifacts = payload.expectedArtifacts ?? {};
  return {
    version: 2,
    startedAt:
      typeof payload.startedAt === 'string' && payload.startedAt.trim().length > 0
        ? payload.startedAt
        : new Date().toISOString(),
    recordingsDir: toNonEmptyPath(payload.recordingsDir) ?? '',
    sourceId: toNonEmptyPath(payload.sourceId),
    recordMode: toNonEmptyPath(payload.recordMode),
    sessionState: toNonEmptyPath(payload.sessionState) ?? 'recording',
    interruptionReason: toNonEmptyPath(payload.interruptionReason),
    interruptedAt: toNonEmptyPath(payload.interruptedAt),
    captureMetadata:
      payload.captureMetadata && typeof payload.captureMetadata === 'object'
        ? {
            fps:
              typeof payload.captureMetadata.fps === 'number' ? payload.captureMetadata.fps : null,
            width:
              typeof payload.captureMetadata.width === 'number'
                ? payload.captureMetadata.width
                : null,
            height:
              typeof payload.captureMetadata.height === 'number'
                ? payload.captureMetadata.height
                : null,
            timelineFps:
              typeof payload.captureMetadata.timelineFps === 'number'
                ? payload.captureMetadata.timelineFps
                : null,
          }
        : null,
    expectedArtifacts: {
      videoPath: toNonEmptyPath(expectedArtifacts.videoPath),
      audioPath: toNonEmptyPath(expectedArtifacts.audioPath),
      cursorPath: toNonEmptyPath(expectedArtifacts.cursorPath),
    },
  };
}

function buildActionableRecoveryState(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;

  const normalized = normalizeRecordingRecoveryManifest(manifest);
  const videoArtifact = getArtifactCandidate(normalized.expectedArtifacts.videoPath);
  if (!videoArtifact) return null;

  const audioArtifact = getArtifactCandidate(normalized.expectedArtifacts.audioPath);
  const cursorArtifact = getArtifactCandidate(normalized.expectedArtifacts.cursorPath);

  return {
    ...normalized,
    interruptionReason: normalized.interruptionReason ?? 'unexpected-exit',
    canRecover: true,
    recoveryCandidate: {
      videoPath: videoArtifact.path,
      videoFileSize: videoArtifact.size,
      videoModifiedAt: videoArtifact.modifiedAt,
      audioPath: audioArtifact?.path ?? null,
      cursorPath: cursorArtifact?.path ?? null,
    },
  };
}

export async function writeRecordingRecoveryMarker(payload) {
  const data = normalizeRecordingRecoveryManifest(payload);
  await writeFile(getRecoveryFilePath(), JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

export async function readRecordingRecoveryMarker() {
  const filePath = getRecoveryFilePath();
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const recovery = buildActionableRecoveryState(parsed);
    if (recovery) return recovery;

    await clearRecordingRecoveryMarker();
    return null;
  } catch {
    return null;
  }
}

export async function clearRecordingRecoveryMarker() {
  try {
    await unlink(getRecoveryFilePath());
  } catch {
    /* ignore */
  }
}
