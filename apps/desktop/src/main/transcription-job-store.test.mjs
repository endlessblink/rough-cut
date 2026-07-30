import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTranscriptionJobStore,
  defaultTranscriptionJobsPath,
} from './transcription-job-store.mjs';

async function withStore(run) {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-jobs-'));
  try {
    const filePath = defaultTranscriptionJobsPath(dir);
    let now = 1_000;
    let nextId = 1;
    const store = createTranscriptionJobStore({
      filePath,
      now: () => now,
      createId: () => `job-${nextId++}`,
    });
    await run({
      dir,
      filePath,
      store,
      setNow(value) {
        now = value;
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function startInput(overrides = {}) {
  return {
    sourcePath: '/recordings/live-coding.mkv',
    projectPath: '/projects/live-coding.roughcut',
    provider: { kind: 'local', id: 'fixture', model: 'deterministic-v1' },
    fps: 30,
    ...overrides,
  };
}

test('create persists a resumable local-first job', async () => {
  await withStore(async ({ filePath, store }) => {
    const created = await store.create(startInput());

    assert.equal(created.id, 'job-1');
    assert.equal(created.status, 'queued');
    assert.equal(created.provider.kind, 'local');
    assert.equal(created.checkpointMs, 0);
    assert.deepEqual(created.transcript, { words: [], paragraphs: [], nonSpeech: [] });

    const reloaded = createTranscriptionJobStore({ filePath });
    assert.deepEqual(await reloaded.get(created.id), created);

    const onDisk = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.jobs.length, 1);
  });
});

test('recording-time job can attach its project after capture finalizes', async () => {
  await withStore(async ({ store }) => {
    const created = await store.create(startInput({ projectPath: null }));
    assert.equal(created.projectPath, null);

    const attached = await store.attachProject(
      created.id,
      '/projects/final.roughcut',
      24_000,
    );
    assert.equal(attached.projectPath, '/projects/final.roughcut');
    assert.equal(attached.totalMs, 24_000);
  });
});

test('incremental transcript progress survives reload', async () => {
  await withStore(async ({ filePath, store, setNow }) => {
    const created = await store.create(startInput());
    await store.start(created.id);
    setNow(2_000);
    const updated = await store.appendProgress(created.id, {
      checkpointMs: 4_000,
      totalMs: 60_000,
      words: [
        { word: 'const', startFrame: 0, endFrame: 8, confidence: 0.99 },
        { word: 'value', startFrame: 9, endFrame: 18, confidence: 0.98 },
      ],
      paragraphs: [{ text: 'const value', startFrame: 0, endFrame: 18 }],
      nonSpeech: [{ kind: 'silence', startFrame: 19, endFrame: 30 }],
    });

    assert.equal(updated.status, 'running');
    assert.equal(updated.checkpointMs, 4_000);
    assert.equal(updated.totalMs, 60_000);
    assert.equal(updated.transcript.words.length, 2);
    assert.equal(updated.updatedAt, 2_000);

    const reloaded = createTranscriptionJobStore({ filePath });
    assert.deepEqual(await reloaded.get(created.id), updated);
  });
});

test('capture load suspends analysis and safe capture resumes it', async () => {
  await withStore(async ({ store, setNow }) => {
    const created = await store.create(startInput());
    await store.start(created.id);

    setNow(2_000);
    const paused = await store.setCaptureSafe(false);
    assert.equal(paused[0].status, 'paused');
    assert.equal(paused[0].pauseReason, 'capture-load');
    assert.equal(paused[0].updatedAt, 2_000);

    setNow(3_000);
    const unchanged = await store.setCaptureSafe(false);
    assert.equal(unchanged[0].updatedAt, 2_000);

    setNow(4_000);
    const resumed = await store.setCaptureSafe(true);
    assert.equal(resumed[0].status, 'queued');
    assert.equal(resumed[0].pauseReason, undefined);
    assert.equal(resumed[0].updatedAt, 4_000);
  });
});

test('manual pause is not resumed by capture becoming safe', async () => {
  await withStore(async ({ store }) => {
    const created = await store.create(startInput());
    await store.start(created.id);
    await store.pause(created.id);
    await store.setCaptureSafe(false);
    await store.setCaptureSafe(true);

    const job = await store.get(created.id);
    assert.equal(job.status, 'paused');
    assert.equal(job.pauseReason, 'manual');
  });
});

test('reload recovers interrupted running work from its last checkpoint', async () => {
  await withStore(async ({ filePath, store, setNow }) => {
    const created = await store.create(startInput());
    await store.start(created.id);
    await store.appendProgress(created.id, { checkpointMs: 12_000 });

    setNow(5_000);
    const reloaded = createTranscriptionJobStore({ filePath, now: () => 5_000 });
    const recovered = await reloaded.recoverInterrupted();

    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, 'queued');
    assert.equal(recovered[0].checkpointMs, 12_000);
    assert.equal(recovered[0].recoveryCount, 1);
    assert.equal(recovered[0].updatedAt, 5_000);
  });
});

test('cancel and complete are terminal and reject later progress', async () => {
  await withStore(async ({ store }) => {
    const cancelled = await store.create(startInput());
    await store.cancel(cancelled.id);
    await assert.rejects(
      () => store.appendProgress(cancelled.id, { checkpointMs: 1_000 }),
      /terminal/i,
    );

    const completed = await store.create(startInput({ sourcePath: '/recordings/second.mkv' }));
    await store.start(completed.id);
    await store.complete(completed.id);
    await assert.rejects(() => store.start(completed.id), /terminal/i);
  });
});

test('park returns incremental recording analysis to the queue', async () => {
  await withStore(async ({ store }) => {
    const created = await store.create(startInput());
    await store.start(created.id);
    await store.appendProgress(created.id, { checkpointMs: 1_000 });
    const parked = await store.park(created.id);

    assert.equal(parked.status, 'queued');
    assert.equal(parked.checkpointMs, 1_000);
    assert.equal(parked.completedAt, undefined);
  });
});

test('concurrent progress writes serialize without losing transcript chunks', async () => {
  await withStore(async ({ store }) => {
    const created = await store.create(startInput());
    await store.start(created.id);

    await Promise.all([
      store.appendProgress(created.id, {
        checkpointMs: 1_000,
        words: [{ word: 'one', startFrame: 0, endFrame: 3, confidence: 1 }],
      }),
      store.appendProgress(created.id, {
        checkpointMs: 2_000,
        words: [{ word: 'two', startFrame: 4, endFrame: 7, confidence: 1 }],
      }),
    ]);

    const job = await store.get(created.id);
    assert.equal(job.checkpointMs, 2_000);
    assert.deepEqual(job.transcript.words.map((word) => word.word), ['one', 'two']);
  });
});

test('malformed provider transcript chunks are rejected before persistence', async () => {
  await withStore(async ({ store }) => {
    const created = await store.create(startInput());
    await store.start(created.id);

    await assert.rejects(
      () =>
        store.appendProgress(created.id, {
          checkpointMs: 1_000,
          words: [{ text: 'wrong field', startFrame: 0, endFrame: 3, confidence: 1 }],
        }),
      /transcript word/i,
    );

    const job = await store.get(created.id);
    assert.equal(job.checkpointMs, 0);
    assert.deepEqual(job.transcript.words, []);
  });
});

test('malformed job file is never treated as empty or overwritten', async () => {
  await withStore(async ({ filePath, store }) => {
    await writeFile(filePath, '{"version":1,"jobs":[', 'utf8');

    await assert.rejects(() => store.list(), /malformed|read/i);
    await assert.rejects(() => store.create(startInput()), /malformed|read/i);
    assert.equal(await readFile(filePath, 'utf8'), '{"version":1,"jobs":[');
  });
});

test('restart recovery returns only interrupted running jobs', async () => {
  await withStore(async ({ filePath, store }) => {
    const interrupted = await store.create(startInput());
    await store.start(interrupted.id);

    const paused = await store.create(
      startInput({ sourcePath: '/recordings/paused.mkv', projectPath: '/projects/paused.roughcut' }),
    );
    await store.start(paused.id);
    await store.pause(paused.id);

    const reloaded = createTranscriptionJobStore({ filePath });
    const recovered = await reloaded.recoverInterrupted();
    assert.deepEqual(recovered.map((job) => job.id), [interrupted.id]);

    const stillPaused = await reloaded.get(paused.id);
    assert.equal(stillPaused.status, 'paused');
    assert.equal(stillPaused.pauseReason, 'manual');
  });
});

test('completed job records project embedding only after persistence succeeds', async () => {
  await withStore(async ({ filePath, store, setNow }) => {
    const created = await store.create(startInput());
    await store.start(created.id);
    await store.complete(created.id);
    setNow(9_000);
    const persisted = await store.markProjectPersisted(created.id);

    assert.equal(persisted.projectPersistedAt, 9_000);
    const reloaded = createTranscriptionJobStore({ filePath });
    assert.equal((await reloaded.get(created.id)).projectPersistedAt, 9_000);
  });
});
