import electron from 'electron';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';

const { app } = electron;

function getRecoveryFilePath() {
  return join(app.getPath('userData'), 'recording-recovery.json');
}

function toNonEmptyPath(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getArtifactCandidate(filePath, deps = {}) {
  const { existsSyncFn = existsSync, statSyncFn = statSync } = deps;
  const normalizedPath = toNonEmptyPath(filePath);
  if (!normalizedPath || !existsSyncFn(normalizedPath)) return null;

  try {
    const stats = statSyncFn(normalizedPath);
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

export function normalizeRecordingRecoveryManifest(payload = {}, now = () => new Date().toISOString()) {
  const expectedArtifacts = payload.expectedArtifacts ?? {};
  return {
    version: 2,
    startedAt:
      typeof payload.startedAt === 'string' && payload.startedAt.trim().length > 0
        ? payload.startedAt
        : now(),
    recordingsDir: toNonEmptyPath(payload.recordingsDir) ?? '',
    projectName: toNonEmptyPath(payload.projectName),
    projectFilePath: toNonEmptyPath(payload.projectFilePath),
    projectSnapshotPath: toNonEmptyPath(payload.projectSnapshotPath),
    projectSnapshotTakenAt: toNonEmptyPath(payload.projectSnapshotTakenAt),
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
      micAudioPath: toNonEmptyPath(expectedArtifacts.micAudioPath),
      systemAudioPath: toNonEmptyPath(expectedArtifacts.systemAudioPath),
      cursorPath: toNonEmptyPath(expectedArtifacts.cursorPath),
    },
  };
}

export function buildActionableRecoveryState(manifest, deps = {}) {
  if (!manifest || typeof manifest !== 'object') return null;

  const normalized = normalizeRecordingRecoveryManifest(manifest, deps.now);
  const videoArtifact = getArtifactCandidate(normalized.expectedArtifacts.videoPath, deps);
  if (!videoArtifact) return null;

  const audioArtifact = getArtifactCandidate(normalized.expectedArtifacts.audioPath, deps);
  const micAudioArtifact = getArtifactCandidate(normalized.expectedArtifacts.micAudioPath, deps);
  const systemAudioArtifact = getArtifactCandidate(
    normalized.expectedArtifacts.systemAudioPath,
    deps,
  );
  const cursorArtifact = getArtifactCandidate(normalized.expectedArtifacts.cursorPath, deps);
  const projectSnapshotArtifact = getArtifactCandidate(normalized.projectSnapshotPath, deps);

  return {
    ...normalized,
    interruptionReason: normalized.interruptionReason ?? 'unexpected-exit',
    canRecover: true,
    recoveryCandidate: {
      videoPath: videoArtifact.path,
      videoFileSize: videoArtifact.size,
      videoModifiedAt: videoArtifact.modifiedAt,
      audioPath: audioArtifact?.path ?? null,
      micAudioPath: micAudioArtifact?.path ?? null,
      systemAudioPath: systemAudioArtifact?.path ?? null,
      cursorPath: cursorArtifact?.path ?? null,
      projectSnapshotPath: projectSnapshotArtifact?.path ?? null,
    },
  };
}

export function createRecoveryStateService({
  getRecoveryFilePath,
  existsSyncFn = existsSync,
  statSyncFn = statSync,
  readFileFn = readFile,
  writeFileFn = writeFile,
  unlinkFn = unlink,
  now = () => new Date().toISOString(),
}) {
  return {
    async writeRecordingRecoveryMarker(payload) {
      const data = normalizeRecordingRecoveryManifest(payload, now);
      await writeFileFn(getRecoveryFilePath(), JSON.stringify(data, null, 2), 'utf-8');
      return data;
    },

    async readRecordingRecoveryMarker() {
      const filePath = getRecoveryFilePath();
      if (!existsSyncFn(filePath)) return null;
      try {
        const raw = await readFileFn(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const recovery = buildActionableRecoveryState(parsed, {
          existsSyncFn,
          statSyncFn,
          now,
        });
        if (recovery) return recovery;

        await this.clearRecordingRecoveryMarker();
        return null;
      } catch {
        await this.clearRecordingRecoveryMarker();
        return null;
      }
    },

    async clearRecordingRecoveryMarker() {
      try {
        await unlinkFn(getRecoveryFilePath());
      } catch {
        /* ignore */
      }
    },
  };
}

const recoveryStateService = createRecoveryStateService({ getRecoveryFilePath });

export async function writeRecordingRecoveryMarker(payload) {
  return recoveryStateService.writeRecordingRecoveryMarker(payload);
}

export async function readRecordingRecoveryMarker() {
  return recoveryStateService.readRecordingRecoveryMarker();
}

export async function clearRecordingRecoveryMarker() {
  return recoveryStateService.clearRecordingRecoveryMarker();
}
