import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTranscriptionJobStore,
  defaultTranscriptionJobsPath,
} from './transcription-job-store.mjs';
import { createTranscriptionJobRunner } from './transcription-job-runner.mjs';

async function setup(run) {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-runner-'));
  try {
    const store = createTranscriptionJobStore({
      filePath: defaultTranscriptionJobsPath(dir),
      createId: () => 'job-1',
      now: (() => {
        let value = 0;
        return () => ++value;
      })(),
    });
    const job = await store.create({
      sourcePath: '/recordings/session.mkv',
      projectPath: '/projects/session.roughcut',
      provider: { kind: 'local', id: 'fixture', model: 'deterministic-v1' },
      fps: 30,
    });
    await run({ store, job });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('runner incrementally transcribes deterministic chunks and completes', async () => {
  await setup(async ({ store, job }) => {
    const calls = [];
    const runner = createTranscriptionJobRunner({
      store,
      chunkDurationMs: 1_000,
      transcribeChunk: async ({ startMs, endMs }) => {
        calls.push([startMs, endMs]);
        return {
          words: [
            {
              word: `${startMs}-${endMs}`,
              startFrame: Math.round((startMs / 1_000) * 30),
              endFrame: Math.round((endMs / 1_000) * 30),
              confidence: 1,
            },
          ],
        };
      },
    });

    const completed = await runner.run(job.id, { totalMs: 2_500 });

    assert.equal(completed.status, 'completed');
    assert.equal(completed.checkpointMs, 2_500);
    assert.deepEqual(calls, [
      [0, 1_000],
      [1_000, 2_000],
      [2_000, 2_500],
    ]);
    assert.deepEqual(
      completed.transcript.words.map((word) => word.word),
      ['0-1000', '1000-2000', '2000-2500'],
    );
  });
});

test('runner resumes from a persisted checkpoint instead of retranscribing it', async () => {
  await setup(async ({ store, job }) => {
    await store.start(job.id);
    await store.appendProgress(job.id, {
      checkpointMs: 1_000,
      words: [{ word: 'existing', startFrame: 0, endFrame: 30, confidence: 1 }],
    });
    await store.recoverInterrupted();

    const calls = [];
    const runner = createTranscriptionJobRunner({
      store,
      chunkDurationMs: 1_000,
      transcribeChunk: async ({ startMs, endMs }) => {
        calls.push([startMs, endMs]);
        return { words: [] };
      },
    });

    const completed = await runner.run(job.id, { totalMs: 2_000 });
    assert.equal(completed.status, 'completed');
    assert.deepEqual(calls, [[1_000, 2_000]]);
  });
});

test('incremental run parks at the available recording boundary', async () => {
  await setup(async ({ store, job }) => {
    const runner = createTranscriptionJobRunner({
      store,
      chunkDurationMs: 1_000,
      transcribeChunk: async () => ({ words: [] }),
    });

    const parked = await runner.run(job.id, { totalMs: 2_000, finalize: false });
    assert.equal(parked.status, 'queued');
    assert.equal(parked.checkpointMs, 2_000);

    const completed = await runner.run(job.id, { totalMs: 3_000, finalize: true });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.checkpointMs, 3_000);
  });
});

test('capture danger aborts active analysis and persists a resumable pause', async () => {
  await setup(async ({ store, job }) => {
    let enteredChunk;
    const chunkStarted = new Promise((resolve) => {
      enteredChunk = resolve;
    });
    const runner = createTranscriptionJobRunner({
      store,
      transcribeChunk: ({ signal }) =>
        new Promise((resolve, reject) => {
          enteredChunk();
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('capture load', 'AbortError')),
            { once: true },
          );
        }),
    });

    const running = runner.run(job.id, { totalMs: 10_000 });
    await chunkStarted;
    await runner.setCaptureSafe(false);
    const paused = await running;

    assert.equal(paused.status, 'paused');
    assert.equal(paused.pauseReason, 'capture-load');
    assert.equal(paused.checkpointMs, 0);

    await runner.setCaptureSafe(true);
    const queued = await store.get(job.id);
    assert.equal(queued.status, 'queued');
  });
});

test('provider failure marks the job failed with actionable state', async () => {
  await setup(async ({ store, job }) => {
    const runner = createTranscriptionJobRunner({
      store,
      transcribeChunk: async () => {
        throw new Error('local model unavailable');
      },
    });

    await assert.rejects(() => runner.run(job.id, { totalMs: 1_000 }), /local model unavailable/);
    const failed = await store.get(job.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'local model unavailable');
  });
});

test('concurrent run calls reserve one worker before asynchronous startup', async () => {
  await setup(async ({ store, job }) => {
    let releaseChunk;
    const chunkGate = new Promise((resolve) => {
      releaseChunk = resolve;
    });
    let providerCalls = 0;
    const runner = createTranscriptionJobRunner({
      store,
      transcribeChunk: async () => {
        providerCalls += 1;
        await chunkGate;
        return { words: [] };
      },
    });

    const first = runner.run(job.id, { totalMs: 1_000 });
    await assert.rejects(
      () => runner.run(job.id, { totalMs: 1_000 }),
      /already running/i,
    );
    releaseChunk();
    await first;
    assert.equal(providerCalls, 1);
  });
});
