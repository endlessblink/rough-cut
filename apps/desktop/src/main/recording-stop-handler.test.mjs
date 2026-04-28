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
  });

  assert.equal(result.state, 'saved');
  assert.equal(result.project.path, '/tmp/capture.roughcut');
  assert.equal(result.project.mediaUrl, 'media://file/test');
});
