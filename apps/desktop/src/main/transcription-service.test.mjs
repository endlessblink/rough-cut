import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptionService } from './transcription-service.mjs';

function createHarness(overrides = {}) {
  const jobs = new Map();
  let id = 0;
  const calls = [];
  const store = {
    async create(input) {
      const job = { id: `job-${++id}`, status: 'queued', checkpointMs: 0, ...input };
      jobs.set(job.id, job);
      calls.push(['create', input]);
      return job;
    },
    async attachProject(jobId, projectPath, totalMs) {
      const job = { ...jobs.get(jobId), projectPath, totalMs };
      jobs.set(jobId, job);
      calls.push(['attachProject', jobId, projectPath, totalMs]);
      return job;
    },
    async recoverInterrupted() {
      calls.push(['recoverInterrupted']);
      return overrides.recovered ?? [];
    },
    async list() {
      calls.push(['list']);
      return [...jobs.values()];
    },
    async markProjectPersisted(jobId) {
      const job = { ...jobs.get(jobId), projectPersistedAt: 10_000 };
      jobs.set(jobId, job);
      calls.push(['markProjectPersisted', jobId]);
      return job;
    },
  };
  const runner = {
    async run(jobId, options) {
      calls.push(['run', jobId, options]);
      return { ...jobs.get(jobId), status: options.finalize ? 'completed' : 'queued' };
    },
    async setCaptureSafe(safe) {
      calls.push(['setCaptureSafe', safe]);
      return [];
    },
  };
  return { store, runner, calls };
}

const localProvider = { id: 'whisper-local', model: 'small' };
const cloudProvider = { id: 'cloud', model: 'large' };

test('disabled service leaves recording untouched', async () => {
  const harness = createHarness();
  const service = createTranscriptionService({
    enabled: false,
    ...harness,
    localProvider,
  });

  assert.deepEqual(
    await service.beginRecording({
      sourcePath: '/recordings/raw.mkv',
      fps: 30,
    }),
    { state: 'disabled', job: null },
  );
  assert.deepEqual(harness.calls, []);
});

test('unavailable local provider does not silently opt into cloud', async () => {
  const harness = createHarness();
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider: null,
    cloudEnabled: false,
    cloudProvider,
  });

  assert.deepEqual(
    await service.beginRecording({ sourcePath: '/recordings/raw.mkv', fps: 30 }),
    { state: 'unavailable', job: null },
  );
  assert.deepEqual(harness.calls, []);
});

test('recording analysis starts local, parks incrementally, then finishes after stop', async () => {
  const harness = createHarness();
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
    cloudEnabled: true,
    cloudProvider,
  });

  const started = await service.beginRecording({
    sourcePath: '/recordings/raw.mkv',
    fps: 30,
  });
  assert.equal(started.state, 'queued');
  assert.equal(started.job.provider.kind, 'local');
  assert.equal(started.job.projectPath, null);

  await service.processAvailable(started.job.id, 15_000);
  await service.finishRecording({
    jobId: started.job.id,
    projectPath: '/projects/final.roughcut',
    totalMs: 22_000,
  });

  assert.deepEqual(harness.calls, [
    [
      'create',
      {
        sourcePath: '/recordings/raw.mkv',
        projectPath: null,
        provider: { kind: 'local', id: 'whisper-local', model: 'small' },
        fps: 30,
      },
    ],
    ['run', started.job.id, { totalMs: 15_000, finalize: false }],
    ['attachProject', started.job.id, '/projects/final.roughcut', 22_000],
    ['setCaptureSafe', true],
    ['run', started.job.id, { totalMs: 22_000, finalize: true }],
  ]);
});

test('capture danger latches analysis off until recording stops', async () => {
  const harness = createHarness();
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
  });

  await service.updateCaptureHealth({
    recordingState: 'recording',
    frameDrops: 1,
    previousFrameDrops: 0,
  });
  await service.updateCaptureHealth({
    recordingState: 'recording',
    frameDrops: 1,
    previousFrameDrops: 1,
  });

  assert.deepEqual(harness.calls, [['setCaptureSafe', false]]);
});

test('initialize restores capture-paused work and returns only recovered jobs', async () => {
  const recovered = [{ id: 'recovered-1', status: 'queued' }];
  const harness = createHarness({ recovered });
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
  });

  assert.deepEqual(await service.initialize(), recovered);
  assert.deepEqual(harness.calls, [
    ['recoverInterrupted'],
    ['setCaptureSafe', true],
    ['list'],
  ]);
});

test('recording stop waits for an in-flight incremental chunk before finalizing', async () => {
  const harness = createHarness();
  let releaseIncremental;
  const incrementalGate = new Promise((resolve) => {
    releaseIncremental = resolve;
  });
  let firstRun = true;
  harness.runner.run = async (jobId, options) => {
    harness.calls.push(['run', jobId, options]);
    if (firstRun) {
      firstRun = false;
      await incrementalGate;
    }
    return { status: options.finalize ? 'completed' : 'queued' };
  };
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
  });
  const started = await service.beginRecording({
    sourcePath: '/recordings/raw.mkv',
    fps: 30,
  });

  const incremental = service.processAvailable(started.job.id, 10_000);
  const finishing = service.finishRecording({
    jobId: started.job.id,
    projectPath: '/projects/final.roughcut',
    totalMs: 12_000,
  });
  await Promise.resolve();
  assert.equal(
    harness.calls.filter((call) => call[0] === 'run').length,
    1,
    'final run waits for the active checkpoint',
  );

  releaseIncremental();
  await incremental;
  await finishing;
  assert.deepEqual(
    harness.calls.filter((call) => call[0] === 'run'),
    [
      ['run', started.job.id, { totalMs: 10_000, finalize: false }],
      ['run', started.job.id, { totalMs: 12_000, finalize: true }],
    ],
  );
});

test('finalization checkpoint attaches the project before waiting for active analysis', async () => {
  const harness = createHarness();
  let releaseIncremental;
  const incrementalGate = new Promise((resolve) => {
    releaseIncremental = resolve;
  });
  harness.runner.run = async (jobId, options) => {
    harness.calls.push(['run', jobId, options]);
    await incrementalGate;
    return { status: 'queued' };
  };
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
  });
  const started = await service.beginRecording({
    sourcePath: '/recordings/raw.mkv',
    fps: 30,
  });
  const incremental = service.processAvailable(started.job.id, 10_000);

  const checkpoint = service.prepareRecordingFinalization({
    jobId: started.job.id,
    projectPath: '/projects/final.roughcut',
    totalMs: 12_000,
  });
  await Promise.resolve();
  assert.deepEqual(
    harness.calls.find((call) => call[0] === 'attachProject'),
    ['attachProject', started.job.id, '/projects/final.roughcut', 12_000],
  );

  releaseIncremental();
  await incremental;
  await checkpoint;
});

test('recording without a provider clears capture suspension when it stops', async () => {
  const harness = createHarness();
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider: null,
    cloudEnabled: false,
  });

  const unavailable = await service.beginRecording({
    sourcePath: '/recordings/unavailable.mkv',
    fps: 30,
  });
  assert.equal(unavailable.job, null);
  await service.updateCaptureHealth({
    recordingState: 'recording',
    queueWarnings: 1,
  });
  assert.equal(service.isCaptureSuspended(), true);

  await service.finishRecording({
    jobId: null,
    projectPath: '/projects/unavailable.roughcut',
    totalMs: 1_000,
  });
  assert.equal(service.isCaptureSuspended(), false);
  assert.deepEqual(harness.calls, [
    ['setCaptureSafe', false],
    ['setCaptureSafe', true],
  ]);
});

test('cancel clears capture priority and cancels the active job', async () => {
  const harness = createHarness();
  harness.runner.cancel = async (jobId) => {
    harness.calls.push(['cancel', jobId]);
    return { id: jobId, status: 'cancelled' };
  };
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
  });
  const started = await service.beginRecording({
    sourcePath: '/recordings/raw.mkv',
    fps: 30,
  });
  await service.updateCaptureHealth({
    recordingState: 'recording',
    queueWarnings: 1,
  });

  const cancelled = await service.cancelRecording(started.job.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(service.isCaptureSuspended(), false);
  assert.deepEqual(harness.calls.slice(-2), [
    ['cancel', started.job.id],
    ['setCaptureSafe', true],
  ]);
});

test('completed transcript is embedded in its project and marked persisted', async () => {
  const harness = createHarness();
  const persisted = [];
  harness.runner.run = async (jobId, options) => {
    harness.calls.push(['run', jobId, options]);
    const job = {
      id: jobId,
      status: 'completed',
      projectPath: '/projects/final.roughcut',
      provider: { kind: 'local', id: 'fixture', model: 'v1' },
      fps: 30,
      transcript: {
        words: [{ word: 'hello', startFrame: 0, endFrame: 10, confidence: 1 }],
        paragraphs: [],
        nonSpeech: [],
      },
    };
    return job;
  };
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
    persistTranscript: async (input) => persisted.push(input),
  });
  const started = await service.beginRecording({
    sourcePath: '/recordings/raw.mkv',
    fps: 30,
  });

  await service.finishRecording({
    jobId: started.job.id,
    projectPath: '/projects/final.roughcut',
    totalMs: 1_000,
  });

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].projectPath, '/projects/final.roughcut');
  assert.equal(persisted[0].transcript.words[0].word, 'hello');
  assert.deepEqual(harness.calls.at(-1), ['markProjectPersisted', started.job.id]);
});

test('existing recordings can be transcribed and persisted on demand', async () => {
  const harness = createHarness();
  const persisted = [];
  harness.runner.run = async (jobId, options) => {
    harness.calls.push(['run', jobId, options]);
    return {
      ...harness.store,
      id: jobId,
      status: 'completed',
      projectPath: '/projects/existing.roughcut',
      provider: { kind: 'local', id: 'whisper-local', model: 'small' },
      fps: 30,
      transcript: {
        words: [{ word: 'existing', startFrame: 0, endFrame: 12, confidence: 1 }],
        paragraphs: [],
        nonSpeech: [],
      },
    };
  };
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
    persistTranscript: async (input) => persisted.push(input),
  });

  const result = await service.transcribeExisting({
    sourcePath: '/recordings/existing.mkv',
    projectPath: '/projects/existing.roughcut',
    fps: 30,
    totalMs: 42_000,
  });

  assert.equal(result.state, 'completed');
  assert.equal(result.job.transcript.words[0].word, 'existing');
  assert.equal(persisted.length, 1);
  assert.deepEqual(
    harness.calls.filter((call) => ['create', 'attachProject', 'run'].includes(call[0])),
    [
      ['create', {
        sourcePath: '/recordings/existing.mkv',
        projectPath: null,
        provider: { kind: 'local', id: 'whisper-local', model: 'small' },
        fps: 30,
      }],
      ['attachProject', 'job-1', '/projects/existing.roughcut', 42_000],
      ['run', 'job-1', { totalMs: 42_000, finalize: true }],
    ],
  );
});

test('startup retries a completed transcript whose project write was interrupted', async () => {
  const harness = createHarness();
  const completed = {
    id: 'job-retry',
    status: 'completed',
    projectPath: '/projects/retry.roughcut',
    provider: { kind: 'local', id: 'fixture', model: 'v1' },
    fps: 30,
    transcript: { words: [], paragraphs: [], nonSpeech: [] },
  };
  harness.store.list = async () => {
    harness.calls.push(['list']);
    return [completed];
  };
  const persisted = [];
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
    persistTranscript: async (input) => persisted.push(input),
  });

  await service.initialize();
  assert.equal(persisted[0].jobId, 'job-retry');
  assert.deepEqual(harness.calls.at(-1), ['markProjectPersisted', 'job-retry']);
});

test('startup resumes a queued finalization that already has a project and stop boundary', async () => {
  const harness = createHarness();
  const queued = {
    id: 'job-recovered-finalize',
    status: 'queued',
    projectPath: '/projects/recovered.roughcut',
    totalMs: 24_000,
    provider: { kind: 'local', id: 'fixture', model: 'v1' },
    fps: 30,
    transcript: { words: [], paragraphs: [], nonSpeech: [] },
  };
  harness.store.list = async () => {
    harness.calls.push(['list']);
    return [queued];
  };
  harness.runner.run = async (jobId, options) => {
    harness.calls.push(['run', jobId, options]);
    return { ...queued, status: 'completed' };
  };
  const persisted = [];
  const service = createTranscriptionService({
    enabled: true,
    ...harness,
    localProvider,
    persistTranscript: async (input) => persisted.push(input),
  });

  await service.initialize();

  assert.deepEqual(
    harness.calls.find((call) => call[0] === 'run'),
    ['run', queued.id, { totalMs: queued.totalMs, finalize: true }],
  );
  assert.equal(persisted[0].projectPath, queued.projectPath);
  assert.deepEqual(harness.calls.at(-1), ['markProjectPersisted', queued.id]);
});
