import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecordingTranscriptPersistence,
  createRecordingTranscriptionLifecycle,
} from './transcription-main-lifecycle.mjs';

test('main lifecycle forwards the exact production recording statuses in order', async () => {
  const calls = [];
  const bridge = {
    recordingStarted: async (status) => calls.push(['started', status]),
    recordingProgress: async (status) => calls.push(['progress', status]),
    recordingStopping: (status) => calls.push(['stopping', status]),
    recordingStopped: async (result) => calls.push(['stopped', result]),
  };
  const lifecycle = createRecordingTranscriptionLifecycle({
    getBridge: async () => bridge,
  });
  const status = { state: 'recording', fps: 30 };
  const stopped = { state: 'saved', project: { path: '/tmp/example.roughcut' } };

  await lifecycle.recordingStarted(status);
  await lifecycle.recordingProgress(status);
  await lifecycle.recordingStopping(status);
  await lifecycle.recordingStopped(stopped);

  assert.deepEqual(calls, [
    ['started', status],
    ['progress', status],
    ['stopping', status],
    ['stopped', stopped],
  ]);
});

test('recording transcript persistence validates and serializes through the project queue', async () => {
  const calls = [];
  const persist = createRecordingTranscriptPersistence({
    validateProjectPath: (path, options) => {
      calls.push(['validate', path, options]);
      return `/safe${path}`;
    },
    getAllowedRoots: () => ['/safe'],
    enqueueProjectOp: async (path, op) => {
      calls.push(['enqueue', path]);
      return op();
    },
    persistTranscript: async (input) => {
      calls.push(['persist', input]);
      return input;
    },
  });

  await persist({ projectPath: '/project.roughcut', transcript: { words: [] } });

  assert.deepEqual(calls, [
    ['validate', '/project.roughcut', { allowedRoots: ['/safe'] }],
    ['enqueue', '/safe/project.roughcut'],
    [
      'persist',
      {
        projectPath: '/safe/project.roughcut',
        transcript: { words: [] },
      },
    ],
  ]);
});
