import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTranscriptionRuntime } from './transcription-runtime.mjs';

const fixture = {
  durationMs: 1_000,
  fps: 30,
  words: [{ word: 'hello', startFrame: 0, endFrame: 10, confidence: 1 }],
  paragraphs: [{ text: 'hello', startFrame: 0, endFrame: 10 }],
  nonSpeech: [],
};

test('disabled runtime does not read or initialize fixture state', async () => {
  const runtime = await createTranscriptionRuntime({
    environment: { ROUGH_CUT_SMART_ROUGH_CUT: '0' },
    userDataDir: '/path/that/does/not/exist',
  });
    assert.equal(runtime.enabled, false);
    assert.equal(runtime.service, null);
    assert.equal(runtime.fixtureDurationMs, null);
    assert.equal(runtime.incrementalDuringCapture, false);
    assert.doesNotThrow(() => runtime.dispose());
});

test('enabled fixture runtime processes and persists deterministic words', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-runtime-'));
  try {
    const fixturePath = join(dir, 'transcript.json');
    await writeFile(fixturePath, JSON.stringify(fixture), 'utf8');
    const persisted = [];
    const runtime = await createTranscriptionRuntime({
      environment: {
        ROUGH_CUT_SMART_ROUGH_CUT: '1',
        ROUGH_CUT_TRANSCRIPTION_FIXTURE_PATH: fixturePath,
      },
      userDataDir: dir,
      persistTranscript: async (input) => persisted.push(input),
    });

    assert.equal(runtime.enabled, true);
    assert.equal(runtime.available, true);
    assert.equal(runtime.fixtureDurationMs, 1_000);
    assert.deepEqual(await runtime.service.initialize(), []);

    const started = await runtime.service.beginRecording({
      sourcePath: '/recordings/raw.mkv',
      fps: 30,
    });
    const finished = await runtime.service.finishRecording({
      jobId: started.job.id,
      projectPath: '/projects/final.roughcut',
      totalMs: runtime.fixtureDurationMs,
    });
    assert.equal(finished.status, 'completed');
    assert.equal(finished.transcript.words[0].word, 'hello');
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].projectPath, '/projects/final.roughcut');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('enabled runtime fails closed when fixture cannot be loaded', async () => {
  const logs = [];
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-runtime-'));
  try {
    const runtime = await createTranscriptionRuntime({
      environment: {
        ROUGH_CUT_SMART_ROUGH_CUT: '1',
        ROUGH_CUT_TRANSCRIPTION_FIXTURE_PATH: join(dir, 'missing.json'),
      },
      userDataDir: dir,
      onLog: (message) => logs.push(message),
      resolveFallbackModel: async () => null,
    });
    assert.equal(runtime.enabled, true);
    assert.equal(runtime.available, false);
    assert.match(logs[0], /fixture/i);
    assert.deepEqual(
      await runtime.service.beginRecording({
        sourcePath: '/recordings/raw.mkv',
        fps: 30,
      }),
      { state: 'unavailable', job: null },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('enabled runtime discovers an installed Sona fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-runtime-'));
  try {
    const calls = [];
    const runtime = await createTranscriptionRuntime({
      environment: {},
      userDataDir: dir,
      resolveFallbackModel: async () => '/models/vibe-model.bin',
      createFallbackProvider: async (input) => {
        calls.push(input);
        return {
          descriptor: { id: 'sona-local', model: 'vibe-model.bin' },
          incrementalDuringCapture: false,
          transcribeChunk: async () => ({
            words: [],
            paragraphs: [],
            nonSpeech: [],
          }),
        };
      },
    });

    assert.equal(runtime.available, true);
    assert.equal(runtime.incrementalDuringCapture, false);
    assert.deepEqual(calls, [
      {
        command: 'sona',
        modelPath: '/models/vibe-model.bin',
        ffmpegPath: 'ffmpeg',
        language: 'auto',
      },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('enabled runtime selects a configured whisper.cpp provider', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-runtime-'));
  try {
    const calls = [];
    const provider = {
      descriptor: { id: 'whisper.cpp', model: 'ggml-base.en.bin' },
      transcribeChunk: async () => ({
        words: [],
        paragraphs: [],
        nonSpeech: [],
      }),
    };
    const runtime = await createTranscriptionRuntime({
      environment: {
        ROUGH_CUT_SMART_ROUGH_CUT: '1',
        ROUGH_CUT_WHISPER_COMMAND: '/opt/whisper-cli',
        ROUGH_CUT_WHISPER_MODEL_PATH: '/models/ggml-base.en.bin',
        ROUGH_CUT_TRANSCRIPTION_LANGUAGE: 'en',
      },
      userDataDir: dir,
      createLocalProvider: async (input) => {
        calls.push(input);
        return provider;
      },
    });

    assert.equal(runtime.enabled, true);
    assert.equal(runtime.available, true);
    assert.deepEqual(calls, [
      {
        command: '/opt/whisper-cli',
        modelPath: '/models/ggml-base.en.bin',
        ffmpegPath: 'ffmpeg',
        language: 'en',
      },
    ]);
    const started = await runtime.service.beginRecording({
      sourcePath: '/recordings/raw.mkv',
      fps: 30,
    });
    assert.equal(started.state, 'queued');
    assert.deepEqual(started.job.provider, {
      kind: 'local',
      id: 'whisper.cpp',
      model: 'ggml-base.en.bin',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('enabled runtime prefers configured Hebrew verbatim word timing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcription-runtime-'));
  try {
    const calls = [];
    const runtime = await createTranscriptionRuntime({
      environment: {
        ROUGH_CUT_FASTER_WHISPER_PYTHON: '/venv/bin/python',
        ROUGH_CUT_FASTER_WHISPER_MODEL_PATH: '/models/ivrit-hebrew',
        ROUGH_CUT_TRANSCRIPTION_LANGUAGE: 'he',
      },
      userDataDir: dir,
      createVerbatimProvider: async (input) => {
        calls.push(input);
        return {
          descriptor: {
            id: 'faster-whisper-hebrew',
            model: 'ivrit-hebrew',
          },
          incrementalDuringCapture: false,
          transcribeChunk: async () => ({
            words: [],
            paragraphs: [],
            nonSpeech: [],
          }),
        };
      },
      resolveFallbackModel: async () => {
        throw new Error('Sona must not be selected');
      },
    });

    assert.equal(runtime.available, true);
    assert.equal(runtime.incrementalDuringCapture, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pythonPath, '/venv/bin/python');
    assert.equal(calls[0].modelPath, '/models/ivrit-hebrew');
    assert.equal(calls[0].language, 'he');
    assert.match(calls[0].helperPath, /faster-whisper-worker\.py$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
