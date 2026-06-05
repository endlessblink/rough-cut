import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dismissRecovery, getRecoveryState, readRecoveryMarker, recoverFromMarker } from './recording-recovery.mjs';

const baseMarker = {
  version: 1,
  startedAt: '2026-04-28T12:00:00.000Z',
  rawPath: '/tmp/rough-cut-recovery-raw.mkv',
  outputPath: '/tmp/rough-cut-recovery-raw.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  display: ':0+0,0',
  captureRegion: null,
  cursorTelemetryPath: '/tmp/rough-cut-recovery-raw.cursor.json',
  systemAudioSource: null,
};

test('readRecoveryMarker returns null when the marker file does not exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-missing-'));
  const markerPath = join(root, 'no-such-marker.json');
  assert.equal(await readRecoveryMarker(markerPath), null);
  await rm(root, { recursive: true, force: true });
});

test('readRecoveryMarker returns the parsed marker when present', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-read-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify(baseMarker), 'utf8');
  const marker = await readRecoveryMarker(markerPath);
  assert.equal(marker.startedAt, baseMarker.startedAt);
  assert.equal(marker.rawPath, baseMarker.rawPath);
  await rm(root, { recursive: true, force: true });
});

test('getRecoveryState reports unavailable when the raw .mkv is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-norawfile-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify(baseMarker), 'utf8');
  const state = await getRecoveryState({ markerPath, fileExists: async () => false });
  assert.equal(state.available, false);
  assert.equal(state.rawAvailable, false);
  assert.deepEqual(state.marker?.startedAt, baseMarker.startedAt);
  await rm(root, { recursive: true, force: true });
});

test('getRecoveryState reports available when both marker and raw .mkv are present', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-avail-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify(baseMarker), 'utf8');
  const state = await getRecoveryState({ markerPath, fileExists: async (path) => path === baseMarker.rawPath });
  assert.equal(state.available, true);
  assert.equal(state.rawAvailable, true);
  assert.equal(state.cameraRawAvailable, false);
  await rm(root, { recursive: true, force: true });
});

test('recoverFromMarker remuxes, saves a project, and clears the marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-recover-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify(baseMarker), 'utf8');

  const remuxCalls = [];
  let savedRecording = null;

  const result = await recoverFromMarker({
    markerPath,
    fileExists: async () => true,
    remuxMkvToMp4: async ({ rawPath, outputPath }) => {
      remuxCalls.push({ rawPath, outputPath });
      return { outputPath, integrity: { advertisedFrames: 30, decodedFrames: 30 }, warning: null };
    },
    assertReadableMp4: async () => undefined,
    saveProjectForRecording: async (recording) => {
      savedRecording = recording;
      return { path: '/tmp/recovered.roughcut', document: { name: 'recovered' } };
    },
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/recovered' }),
    now: () => new Date('2026-04-28T12:01:00.000Z'),
  });

  assert.equal(result.state, 'recovered');
  assert.equal(remuxCalls.length, 1);
  assert.equal(remuxCalls[0].rawPath, baseMarker.rawPath);
  assert.equal(savedRecording.outputPath, baseMarker.outputPath);
  assert.equal(savedRecording.stoppedAt, '2026-04-28T12:01:00.000Z');
  assert.equal(result.project.mediaUrl, 'media://file/recovered');
  assert.equal(existsSync(markerPath), false);
  assert.deepEqual(result.remuxWarnings, []);

  await rm(root, { recursive: true, force: true });
});

test('recoverFromMarker preserves system audio gain metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-audio-gain-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify({
    ...baseMarker,
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    systemAudioGainPercent: 50,
  }), 'utf8');

  let savedRecording = null;
  await recoverFromMarker({
    markerPath,
    fileExists: async () => true,
    remuxMkvToMp4: async ({ outputPath }) => ({ outputPath, integrity: { advertisedFrames: 30, decodedFrames: 30 }, warning: null }),
    assertReadableMp4: async () => undefined,
    saveProjectForRecording: async (recording) => {
      savedRecording = recording;
      return { path: '/tmp/recovered.roughcut', document: { name: 'recovered' } };
    },
    formatProject: (project) => project,
  });

  assert.deepEqual(savedRecording.audio, {
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    systemAudioGainPercent: 50,
  });

  await rm(root, { recursive: true, force: true });
});

test('recoverFromMarker propagates partial-recovery warnings to the result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-warn-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify(baseMarker), 'utf8');

  const result = await recoverFromMarker({
    markerPath,
    fileExists: async () => true,
    remuxMkvToMp4: async ({ outputPath }) => ({
      outputPath,
      integrity: { advertisedFrames: 100, decodedFrames: 60 },
      warning: 'Partial recording: 60/100 frames decoded.',
    }),
    assertReadableMp4: async () => undefined,
    saveProjectForRecording: async () => ({ path: '/tmp/recovered.roughcut', document: { name: 'recovered' } }),
    formatProject: (project) => project,
  });

  assert.equal(result.remuxWarnings.length, 1);
  assert.equal(result.remuxWarnings[0].source, 'screen');
  assert.match(result.remuxWarnings[0].message, /Partial recording/);

  await rm(root, { recursive: true, force: true });
});

test('recoverFromMarker falls back to screen-only when the camera remux fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-camera-fail-'));
  const markerPath = join(root, 'recovery.json');
  const markerWithCamera = {
    ...baseMarker,
    cameraRawPath: '/tmp/recovery-camera.mkv',
    cameraOutputPath: '/tmp/recovery-camera.mp4',
    cameraDevicePath: '/dev/video2',
  };
  await writeFile(markerPath, JSON.stringify(markerWithCamera), 'utf8');

  let savedRecording = null;
  const result = await recoverFromMarker({
    markerPath,
    fileExists: async () => true,
    remuxMkvToMp4: async ({ rawPath, outputPath }) => {
      if (rawPath === markerWithCamera.cameraRawPath) {
        throw new Error('camera remux failed');
      }
      return { outputPath, integrity: {}, warning: null };
    },
    assertReadableMp4: async () => undefined,
    saveProjectForRecording: async (recording) => {
      savedRecording = recording;
      return { path: '/tmp/recovered.roughcut', document: { name: 'recovered' } };
    },
    formatProject: (project) => project,
  });

  assert.equal(result.state, 'recovered');
  assert.equal(savedRecording.camera, null);
  assert.equal(savedRecording.cameraOutputPath, null);
  assert.match(savedRecording.cameraError, /camera remux failed/);
});

test('recoverFromMarker rejects when no recovery is available', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-none-'));
  const markerPath = join(root, 'recovery.json');
  // No marker file written.
  await assert.rejects(
    () => recoverFromMarker({
      markerPath,
      fileExists: async () => false,
      remuxMkvToMp4: async () => ({}),
      assertReadableMp4: async () => undefined,
      saveProjectForRecording: async () => ({}),
    }),
    /No recoverable recording/,
  );
  await rm(root, { recursive: true, force: true });
});

test('dismissRecovery removes only the marker by default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-dismiss-keep-'));
  const markerPath = join(root, 'recovery.json');
  await writeFile(markerPath, JSON.stringify(baseMarker), 'utf8');

  const result = await dismissRecovery({ markerPath, fileExists: async () => true });

  assert.equal(result.dismissed, true);
  assert.deepEqual(result.removed, []);
  assert.equal(existsSync(markerPath), false);
  await rm(root, { recursive: true, force: true });
});

test('dismissRecovery deletes raw artifacts when deleteFiles is true', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-dismiss-purge-'));
  const markerPath = join(root, 'recovery.json');
  const rawPath = join(root, 'raw.mkv');
  const cursorPath = join(root, 'raw.cursor.json');
  await writeFile(rawPath, 'raw bytes', 'utf8');
  await writeFile(cursorPath, '{}', 'utf8');
  await writeFile(markerPath, JSON.stringify({ ...baseMarker, rawPath, cursorTelemetryPath: cursorPath, outputPath: join(root, 'raw.mp4') }), 'utf8');

  const result = await dismissRecovery({ markerPath, deleteFiles: true });

  assert.equal(result.dismissed, true);
  assert.ok(result.removed.includes(rawPath));
  assert.ok(result.removed.includes(cursorPath));
  assert.equal(existsSync(rawPath), false);
  assert.equal(existsSync(markerPath), false);
  await rm(root, { recursive: true, force: true });
});

test('dismissRecovery is a no-op when no marker exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-dismiss-noop-'));
  const result = await dismissRecovery({ markerPath: join(root, 'no-such-marker.json') });
  assert.equal(result.dismissed, false);
  assert.deepEqual(result.removed, []);
  await rm(root, { recursive: true, force: true });
});
