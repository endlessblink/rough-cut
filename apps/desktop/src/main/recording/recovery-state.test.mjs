import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecoveryStateService } from './recovery-state.mjs';

async function createService() {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-state-'));
  const markerPath = join(root, 'recording-recovery.json');
  return {
    root,
    markerPath,
    service: createRecoveryStateService({
      getRecoveryFilePath: () => markerPath,
    }),
  };
}

test('readRecordingRecoveryMarker clears malformed JSON markers', async () => {
  const { markerPath, service } = await createService();
  await writeFile(markerPath, '{not valid json', 'utf-8');

  const result = await service.readRecordingRecoveryMarker();

  assert.equal(result, null);
  assert.equal(existsSync(markerPath), false);
});

test('readRecordingRecoveryMarker clears manifests that point at empty video artifacts', async () => {
  const { root, markerPath, service } = await createService();
  const emptyVideoPath = join(root, 'partial.webm');
  await writeFile(emptyVideoPath, Buffer.alloc(0));

  await service.writeRecordingRecoveryMarker({
    startedAt: '2026-04-19T10:00:00.000Z',
    recordingsDir: root,
    expectedArtifacts: {
      videoPath: emptyVideoPath,
      audioPath: null,
      cursorPath: null,
    },
  });

  const result = await service.readRecordingRecoveryMarker();

  assert.equal(result, null);
  assert.equal(existsSync(markerPath), false);
});

test('readRecordingRecoveryMarker keeps valid video artifacts and ignores broken optional sidecars', async () => {
  const { root, service } = await createService();
  const videoPath = join(root, 'partial.webm');
  const missingAudioPath = join(root, 'missing.wav');
  const micAudioPath = join(root, 'partial-mic.webm');
  const systemAudioPath = join(root, 'partial-system-audio.webm');
  const emptyCursorPath = join(root, 'cursor.ndjson');
  await writeFile(videoPath, Buffer.from('video-data'));
  await writeFile(micAudioPath, Buffer.from('mic-data'));
  await writeFile(systemAudioPath, Buffer.from('system-audio-data'));
  await writeFile(emptyCursorPath, Buffer.alloc(0));

  await service.writeRecordingRecoveryMarker({
    recordingsDir: root,
    sessionState: 'recording',
    interruptionReason: 'power-loss',
    expectedArtifacts: {
      videoPath,
      audioPath: missingAudioPath,
      micAudioPath,
      systemAudioPath,
      cursorPath: emptyCursorPath,
    },
  });

  const recovery = await service.readRecordingRecoveryMarker();

  assert.ok(recovery);
  assert.equal(recovery.canRecover, true);
  assert.equal(recovery.recoveryCandidate.videoPath, videoPath);
  assert.equal(recovery.recoveryCandidate.audioPath, null);
  assert.equal(recovery.recoveryCandidate.micAudioPath, micAudioPath);
  assert.equal(recovery.recoveryCandidate.systemAudioPath, systemAudioPath);
  assert.equal(recovery.recoveryCandidate.cursorPath, null);
  const videoStats = await stat(videoPath);
  assert.equal(recovery.recoveryCandidate.videoFileSize, videoStats.size);
});

test('readRecordingRecoveryMarker keeps a valid autosaved project snapshot for recovery context', async () => {
  const { root, service } = await createService();
  const videoPath = join(root, 'partial.webm');
  const snapshotPath = join(root, 'project.roughcut');
  await writeFile(videoPath, Buffer.from('video-data'));
  await writeFile(snapshotPath, Buffer.from('{"name":"Recovered Context"}'));

  await service.writeRecordingRecoveryMarker({
    recordingsDir: root,
    projectName: 'Recovered Context',
    projectSnapshotPath: snapshotPath,
    projectSnapshotTakenAt: '2026-04-25T10:00:00.000Z',
    expectedArtifacts: {
      videoPath,
      audioPath: null,
      cursorPath: null,
    },
  });

  const recovery = await service.readRecordingRecoveryMarker();

  assert.ok(recovery);
  assert.equal(recovery.projectName, 'Recovered Context');
  assert.equal(recovery.recoveryCandidate.projectSnapshotPath, snapshotPath);
});

test('clearRecordingRecoveryMarker is safe when the file is already gone', async () => {
  const { markerPath, service } = await createService();

  await service.clearRecordingRecoveryMarker();

  await assert.doesNotReject(() => readFile(markerPath, 'utf-8').catch(() => null));
});
