import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordingTranscriptionBridge } from './transcription-recording-bridge.mjs';

function harness(overrides = {}) {
  const calls = [];
  let nextId = 0;
  const service = {
    async initialize() {
      calls.push(['initialize']);
      return [];
    },
    async beginRecording(input) {
      calls.push(['beginRecording', input]);
      return { state: 'queued', job: { id: `job-${++nextId}` } };
    },
    async processAvailable(jobId, totalMs) {
      calls.push(['processAvailable', jobId, totalMs]);
      return { id: jobId, status: 'queued' };
    },
    async updateCaptureHealth(status) {
      calls.push(['updateCaptureHealth', status]);
      return false;
    },
    async finishRecording(input) {
      calls.push(['finishRecording', input]);
      return { id: input.jobId, status: 'completed' };
    },
    async prepareRecordingFinalization(input) {
      calls.push(['prepareRecordingFinalization', input]);
      return { id: input.jobId, status: 'queued', ...input };
    },
    async cancelRecording(jobId) {
      calls.push(['cancelRecording', jobId]);
      return { id: jobId, status: 'cancelled' };
    },
    ...overrides,
  };
  return { service, calls };
}

const recordingStatus = {
  state: 'recording',
  rawPath: '/recordings/raw.mkv',
  fps: 30,
  micSource: 'default',
  recordedDurationMs: 5_000,
};

test('bridge follows recording start, progress, and saved stop', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({
    service,
    fixtureDurationMs: 8_000,
  });

  await bridge.initialize();
  await bridge.recordingStarted(recordingStatus);
  await bridge.recordingProgress(recordingStatus);
  await bridge.recordingStopped({
    state: 'saved',
    project: { path: '/projects/final.roughcut' },
  });

  assert.deepEqual(calls, [
    ['initialize'],
    [
      'beginRecording',
      { sourcePath: '/recordings/raw.mkv', fps: 30 },
    ],
    ['updateCaptureHealth', recordingStatus],
    ['processAvailable', 'job-1', 5_000],
    [
      'prepareRecordingFinalization',
      {
        jobId: 'job-1',
        projectPath: '/projects/final.roughcut',
        totalMs: 5_000,
      },
    ],
    [
      'finishRecording',
      {
        jobId: 'job-1',
        projectPath: '/projects/final.roughcut',
        totalMs: 5_000,
      },
    ],
  ]);
  assert.equal(bridge.getActiveJobId(), null);
});

test('production transcription waits for complete chunks instead of decoding tiny updates', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({ service });
  await bridge.recordingStarted({ ...recordingStatus, recordedDurationMs: 0 });

  await bridge.recordingProgress({ ...recordingStatus, recordedDurationMs: 4_000 });
  await bridge.recordingProgress({ ...recordingStatus, recordedDurationMs: 14_999 });
  await bridge.recordingProgress({ ...recordingStatus, recordedDurationMs: 15_001 });
  await bridge.recordingProgress({ ...recordingStatus, recordedDurationMs: 20_000 });
  await bridge.recordingProgress({ ...recordingStatus, recordedDurationMs: 30_000 });

  assert.deepEqual(
    calls.filter((call) => call[0] === 'processAvailable'),
    [
      ['processAvailable', 'job-1', 15_000],
      ['processAvailable', 'job-1', 30_000],
    ],
  );
});

test('a provider marked non-incremental records progress but waits until stop to analyze', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({
    service,
    incrementalDuringCapture: false,
  });
  await bridge.recordingStarted({ ...recordingStatus, recordedDurationMs: 0 });
  await bridge.recordingProgress({ ...recordingStatus, recordedDurationMs: 30_000 });
  bridge.recordingStopping({ ...recordingStatus, recordedDurationMs: 31_000 });
  await bridge.recordingStopped({
    state: 'saved',
    project: { path: '/projects/final.roughcut' },
  });

  assert.equal(calls.some((call) => call[0] === 'processAvailable'), false);
  assert.deepEqual(calls.at(-1), [
    'finishRecording',
    {
      jobId: 'job-1',
      projectPath: '/projects/final.roughcut',
      totalMs: 31_000,
    },
  ]);
});

test('restart cancels the previous job before starting the new take', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({
    service,
    fixtureDurationMs: 8_000,
  });
  await bridge.recordingStarted(recordingStatus);
  await bridge.recordingRestarted({
    ...recordingStatus,
    rawPath: '/recordings/restarted.mkv',
  });

  assert.deepEqual(calls.slice(1), [
    ['cancelRecording', 'job-1'],
    [
      'beginRecording',
      { sourcePath: '/recordings/restarted.mkv', fps: 30 },
    ],
  ]);
  assert.equal(bridge.getActiveJobId(), 'job-2');
});

test('cancel discards the active transcription job', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({ service });
  await bridge.recordingStarted(recordingStatus);
  await bridge.recordingCancelled();

  assert.deepEqual(calls.at(-1), ['cancelRecording', 'job-1']);
  assert.equal(bridge.getActiveJobId(), null);
});

test('screen-only recordings do not create transcription jobs', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({ service });
  assert.deepEqual(
    await bridge.recordingStarted({
      ...recordingStatus,
      micSource: null,
      systemAudioSource: null,
    }),
    { state: 'unavailable', job: null },
  );
  assert.equal(calls.some((call) => call[0] === 'beginRecording'), false);
});

test('stop boundary is captured without waiting for another transcription chunk', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({
    service,
    fixtureDurationMs: 8_000,
  });
  await bridge.recordingStarted({ ...recordingStatus, recordedDurationMs: 0 });
  bridge.recordingStopping({ ...recordingStatus, recordedDurationMs: 3_500 });
  await bridge.recordingStopped({
    state: 'saved',
    project: { path: '/projects/short.roughcut' },
  });

  assert.deepEqual(calls.at(-1), [
    'finishRecording',
    {
      jobId: 'job-1',
      projectPath: '/projects/short.roughcut',
      totalMs: 3_500,
    },
  ]);
});

test('project embedding waits for deferred recording finalization', async () => {
  const { service, calls } = harness();
  const bridge = createRecordingTranscriptionBridge({ service });
  await bridge.recordingStarted({ ...recordingStatus, recordedDurationMs: 0 });
  bridge.recordingStopping({ ...recordingStatus, recordedDurationMs: 2_000 });
  let releaseFinalization;
  const finalizationPromise = new Promise((resolve) => {
    releaseFinalization = resolve;
  });

  const stopped = bridge.recordingStopped({
    state: 'saved',
    project: { path: '/projects/final.roughcut' },
    finalizationPromise,
  });
  await Promise.resolve();
  assert.equal(
    calls.some((call) => call[0] === 'prepareRecordingFinalization'),
    true,
    'restart metadata is durable before deferred project work finishes',
  );
  assert.equal(
    calls.some((call) => call[0] === 'finishRecording'),
    false,
    'transcript write cannot race the deferred project rewrite',
  );

  releaseFinalization({ state: 'complete' });
  await stopped;
  assert.equal(calls.at(-1)[0], 'finishRecording');
});

test('bridge failures are logged and never fail the recording lifecycle', async () => {
  const logs = [];
  const { service } = harness({
    beginRecording: async () => {
      throw new Error('fixture broken');
    },
  });
  const bridge = createRecordingTranscriptionBridge({
    service,
    onLog: (message) => logs.push(message),
  });

  assert.equal(await bridge.recordingStarted(recordingStatus), null);
  assert.match(logs[0], /fixture broken/);
  assert.equal(bridge.getActiveJobId(), null);
});
