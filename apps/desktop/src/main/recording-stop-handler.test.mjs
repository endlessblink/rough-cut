import test from 'node:test';
import assert from 'node:assert/strict';
import { stopRecordingAndCreateProject } from './recording-stop-handler.mjs';

const savedRecording = {
  state: 'saved',
  startedAt: '2026-04-28T12:00:00.000Z',
  stoppedAt: '2026-04-28T12:00:03.000Z',
  rawPath: '/tmp/capture.mkv',
  outputPath: '/tmp/broken.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
};

test('invalid finalized MP4 prevents roughcut project creation', async () => {
  let saveCalled = false;

  await assert.rejects(
    () =>
      stopRecordingAndCreateProject({
        recordingSession: { stop: async () => savedRecording },
        assertReadableMp4: async () => {
          throw new Error('moov atom not found');
        },
        remuxMkvToMp4: async ({ rawPath, outputPath }) => {
          assert.equal(rawPath, savedRecording.rawPath);
          assert.equal(outputPath, savedRecording.outputPath);
        },
        saveProjectForRecording: async () => {
          saveCalled = true;
          return { path: '/tmp/broken.roughcut', document: {} };
        },
        formatProject: (project) => project,
      }),
    /moov atom not found/,
  );

  assert.equal(saveCalled, false);
});

test('valid finalized MP4 creates roughcut project', async () => {
  const result = await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => savedRecording },
    assertReadableMp4: async () => undefined,
    remuxMkvToMp4: async ({ rawPath, outputPath }) => {
      assert.equal(rawPath, savedRecording.rawPath);
      assert.equal(outputPath, savedRecording.outputPath);
    },
    saveProjectForRecording: async () => ({ path: '/tmp/capture.roughcut', document: { name: 'capture' } }),
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/test' }),
    writeRecordingDiagnosticsReport: async ({ recording, projectPath, remuxLogs }) => {
      assert.equal(recording.outputPath, savedRecording.outputPath);
      assert.equal(projectPath, '/tmp/capture.roughcut');
      assert.equal(remuxLogs.length, 0);
      return { path: '/tmp/capture.diagnostics.json', report: {} };
    },
  });

  assert.equal(result.state, 'saved');
  assert.equal(result.project.path, '/tmp/capture.roughcut');
  assert.equal(result.project.mediaUrl, 'media://file/test');
  assert.equal(result.diagnosticsPath, '/tmp/capture.diagnostics.json');
});

test('camera finalization failure saves a screen-only project with warning metadata', async () => {
  const recordingWithCamera = {
    ...savedRecording,
    cameraRawPath: '/tmp/camera.mkv',
    cameraOutputPath: '/tmp/camera.mp4',
    cameraDevicePath: '/dev/video2',
    camera: {
      rawPath: '/tmp/camera.mkv',
      outputPath: '/tmp/camera.mp4',
      devicePath: '/dev/video2',
      width: 1280,
      height: 720,
      fps: 30,
      sourceInFrames: 0,
      prerollMs: 0,
    },
  };
  const savedRecordings = [];

  const result = await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => recordingWithCamera },
    assertReadableMp4: async (path) => {
      if (path === '/tmp/camera.mp4') throw new Error('Device or resource busy');
    },
    remuxMkvToMp4: async () => undefined,
    saveProjectForRecording: async (recording) => {
      savedRecordings.push(recording);
      return { path: '/tmp/capture.roughcut', document: { name: 'capture' } };
    },
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/test' }),
    writeRecordingDiagnosticsReport: async () => ({ path: '/tmp/capture.diagnostics.json', report: {} }),
  });

  assert.equal(result.state, 'saved');
  assert.equal(result.project.mediaUrl, 'media://file/test');
  assert.equal(result.camera, null);
  assert.equal(result.cameraOutputPath, null);
  assert.match(result.cameraError, /Device or resource busy/);
  assert.equal(savedRecordings[0].camera, null);
});

test('probes screen and camera outputs before saving synced overlap metadata', async () => {
  const recordingWithCamera = {
    ...savedRecording,
    cameraRawPath: '/tmp/camera.mkv',
    cameraOutputPath: '/tmp/camera.mp4',
    cameraDevicePath: '/dev/video2',
    camera: {
      rawPath: '/tmp/camera.mkv',
      outputPath: '/tmp/camera.mp4',
      devicePath: '/dev/video2',
      width: 1280,
      height: 720,
      fps: 30,
      sourceInFrames: 75,
      prerollMs: 2500,
    },
  };
  let savedRecordingArg = null;

  const result = await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => recordingWithCamera },
    assertReadableMp4: async () => undefined,
    remuxMkvToMp4: async () => undefined,
    probeVideoTiming: async (path) => path === '/tmp/camera.mp4' ? { durationFrames: 132 } : { durationFrames: 70 },
    computeSyncedRecordingTiming: ({ screen, camera, cameraSourceInFrames }) => ({
      screenFrames: screen.durationFrames,
      cameraFrames: camera.durationFrames,
      cameraSourceInFrames,
      syncedDurationFrames: 57,
      syncWarning: 'Camera overlap is shorter than screen capture.',
    }),
    saveProjectForRecording: async (recording) => {
      savedRecordingArg = recording;
      return { path: '/tmp/capture.roughcut', document: { name: 'capture' } };
    },
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/test' }),
    writeRecordingDiagnosticsReport: async () => ({ path: '/tmp/capture.diagnostics.json', report: {} }),
  });

  assert.equal(savedRecordingArg.sync.syncedDurationFrames, 57);
  assert.equal(savedRecordingArg.cameraError, undefined);
  assert.equal(result.sync.syncedDurationFrames, 57);
});

test('does not return a sync trim warning as a camera finalization error', async () => {
  const syncWarning = 'Camera overlap is 4 frames shorter than screen capture; timeline was trimmed to the synced overlap.';
  const recordingWithCamera = {
    ...savedRecording,
    cameraRawPath: '/tmp/camera.mkv',
    cameraOutputPath: '/tmp/camera.mp4',
    cameraDevicePath: '/dev/video2',
    cameraError: syncWarning,
    camera: {
      rawPath: '/tmp/camera.mkv',
      outputPath: '/tmp/camera.mp4',
      devicePath: '/dev/video2',
      width: 1280,
      height: 720,
      fps: 30,
      sourceInFrames: 4,
      prerollMs: 0,
    },
  };
  let savedRecordingArg = null;

  const result = await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => recordingWithCamera },
    assertReadableMp4: async () => undefined,
    remuxMkvToMp4: async () => undefined,
    probeVideoTiming: async (path) => path === '/tmp/camera.mp4'
      ? { durationFrames: 566, durationSeconds: 18.871 }
      : { durationFrames: 566, durationSeconds: 18.871 },
    computeSyncedRecordingTiming: () => ({
      screenFrames: 566,
      cameraFrames: 566,
      cameraSourceInFrames: 4,
      syncedDurationFrames: 562,
      syncWarning,
    }),
    saveProjectForRecording: async (recording) => {
      savedRecordingArg = recording;
      return { path: '/tmp/capture.roughcut', document: { name: 'capture' } };
    },
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/test' }),
    writeRecordingDiagnosticsReport: async () => ({ path: '/tmp/capture.diagnostics.json', report: {} }),
  });

  assert.equal(savedRecordingArg.cameraError, null);
  assert.equal(result.cameraError, null);
  assert.equal(result.camera, recordingWithCamera.camera);
});

test('unified camera recording remuxes explicit screen and camera stream derivatives', async () => {
  const recordingWithUnifiedCamera = {
    ...savedRecording,
    rawPath: '/tmp/unified.mkv',
    cameraRawPath: '/tmp/unified.mkv',
    cameraOutputPath: '/tmp/camera.mp4',
    cameraDevicePath: '/dev/video2',
    camera: {
      rawPath: '/tmp/unified.mkv',
      outputPath: '/tmp/camera.mp4',
      devicePath: '/dev/video2',
      width: 1280,
      height: 720,
      fps: 30,
      sourceInFrames: 0,
      prerollMs: 0,
      sourceStreamIndex: 1,
    },
  };
  const remuxCalls = [];

  await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => recordingWithUnifiedCamera },
    assertReadableMp4: async () => undefined,
    remuxMkvToMp4: async ({ rawPath, outputPath, maps }) => {
      remuxCalls.push({ rawPath, outputPath, maps });
    },
    saveProjectForRecording: async () => ({ path: '/tmp/capture.roughcut', document: { name: 'capture' } }),
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/test' }),
    writeRecordingDiagnosticsReport: async () => ({ path: '/tmp/capture.diagnostics.json', report: {} }),
  });

  assert.deepEqual(remuxCalls, [
    { rawPath: '/tmp/unified.mkv', outputPath: savedRecording.outputPath, maps: ['0:v:0', '0:a?'] },
    { rawPath: '/tmp/unified.mkv', outputPath: '/tmp/camera.mp4', maps: ['0:v:1'] },
  ]);
});

test('unified camera recording derives camera offset from source stream timestamps', async () => {
  const recordingWithUnifiedCamera = {
    ...savedRecording,
    rawPath: '/tmp/unified.mkv',
    cameraRawPath: '/tmp/unified.mkv',
    cameraOutputPath: '/tmp/camera.mp4',
    cameraDevicePath: '/dev/video2',
    camera: {
      rawPath: '/tmp/unified.mkv',
      outputPath: '/tmp/camera.mp4',
      devicePath: '/dev/video2',
      width: 1280,
      height: 720,
      fps: 30,
      sourceInFrames: 0,
      prerollMs: 0,
      sourceStreamIndex: 1,
    },
  };
  let savedRecordingArg = null;

  const result = await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => recordingWithUnifiedCamera },
    assertReadableMp4: async () => undefined,
    remuxMkvToMp4: async () => undefined,
    probeVideoTiming: async () => {
      throw new Error('should probe unified source streams instead');
    },
    probeVideoStreamsTiming: async () => [
      { index: 0, startTimeSeconds: 0.1, durationSeconds: 6.7, durationFrames: 201, frameRate: 30 },
      { index: 1, startTimeSeconds: 0.2, durationSeconds: 6.7, durationFrames: 201, frameRate: 30 },
    ],
    computeSyncedRecordingTiming: ({ screen, camera, cameraSourceInFrames }) => ({
      screenFrames: screen.durationFrames,
      cameraFrames: camera.durationFrames,
      cameraSourceInFrames,
      syncedDurationFrames: 198,
      syncWarning: null,
    }),
    saveProjectForRecording: async (recording) => {
      savedRecordingArg = recording;
      return { path: '/tmp/capture.roughcut', document: { name: 'capture' } };
    },
    formatProject: (project) => ({ ...project, mediaUrl: 'media://file/test' }),
    writeRecordingDiagnosticsReport: async () => ({ path: '/tmp/capture.diagnostics.json', report: {} }),
  });

  assert.equal(savedRecordingArg.camera.sourceInFrames, 3);
  assert.equal(savedRecordingArg.sync.cameraSourceInFrames, 3);
  assert.equal(savedRecordingArg.streamTiming.camera.index, 1);
  assert.equal(result.sync.syncedDurationFrames, 198);
});

test('diagnostics failure does not block valid recording project creation', async () => {
  const result = await stopRecordingAndCreateProject({
    recordingSession: { stop: async () => savedRecording },
    assertReadableMp4: async () => undefined,
    remuxMkvToMp4: async () => undefined,
    saveProjectForRecording: async () => ({ path: '/tmp/capture.roughcut', document: { name: 'capture' } }),
    formatProject: (project) => project,
    writeRecordingDiagnosticsReport: async () => {
      throw new Error('diagnostics disk full');
    },
  });

  assert.equal(result.state, 'saved');
  assert.equal(result.project.path, '/tmp/capture.roughcut');
  assert.equal(result.diagnosticsPath, null);
});
