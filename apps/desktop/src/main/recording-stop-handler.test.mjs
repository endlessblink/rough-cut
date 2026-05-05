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
