import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  createWhisperCppProvider,
  parseWhisperCppTranscript,
  runTranscriptionProcess,
} from './whisper-cpp-provider.mjs';

const output = {
  transcription: [
    {
      offsets: { from: 600, to: 1_450 },
      text: ' hello world',
      tokens: [
        { text: '[_BEG_]', offsets: { from: 0, to: 0 }, p: 0.99 },
        { text: ' hello', offsets: { from: 600, to: 900 }, p: 0.9 },
        { text: ' world', offsets: { from: 900, to: 1_400 }, p: 0.8 },
        { text: '.', offsets: { from: 1_400, to: 1_450 }, p: 0.7 },
        { text: '[_TT_118]', offsets: { from: 1_450, to: 1_450 }, p: 0.2 },
      ],
    },
  ],
};

test('maps whisper.cpp full JSON into absolute transcript frames and silence', () => {
  assert.deepEqual(
    parseWhisperCppTranscript(output, { startMs: 2_000, endMs: 4_000, fps: 30 }),
    {
      words: [
        { word: 'hello', startFrame: 78, endFrame: 87, confidence: 0.9 },
        { word: 'world.', startFrame: 87, endFrame: 104, confidence: 0.7 },
      ],
      paragraphs: [{ text: 'hello world', startFrame: 78, endFrame: 104 }],
      nonSpeech: [
        { kind: 'silence', startFrame: 60, endFrame: 78 },
        { kind: 'silence', startFrame: 104, endFrame: 120 },
      ],
    },
  );
});

test('rejects spoken output without the word timing required by transcript editing', () => {
  assert.throws(
    () =>
      parseWhisperCppTranscript(
        {
          transcription: [
            { offsets: { from: 0, to: 500 }, text: 'hello', tokens: [] },
          ],
        },
        { startMs: 0, endMs: 500, fps: 30 },
      ),
    /word timing/i,
  );
  assert.deepEqual(
    parseWhisperCppTranscript(
      { transcription: [] },
      { startMs: 0, endMs: 500, fps: 30 },
    ),
    {
      words: [],
      paragraphs: [],
      nonSpeech: [{ kind: 'silence', startFrame: 0, endFrame: 15 }],
    },
  );
});

test('aborted transcription force-kills a child that ignores graceful termination', async () => {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  const kills = [];
  child.kill = (signal) => {
    kills.push(signal);
    if (signal === 'SIGKILL') child.emit('close', null, signal);
    return true;
  };
  const controller = new AbortController();
  const operation = runTranscriptionProcess('/opt/whisper-cli', [], {
    signal: controller.signal,
    spawnProcess: () => child,
    killTimeoutMs: 5,
  });
  controller.abort();

  await assert.rejects(operation, { name: 'AbortError' });
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
});

test('extracts a chunk, invokes whisper.cpp, and removes temporary files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-whisper-test-'));
  try {
    const modelPath = join(dir, 'ggml-base.en.bin');
    await writeFile(modelPath, 'model');
    const calls = [];
    let outputPrefix;
    const provider = await createWhisperCppProvider({
      command: '/opt/whisper-cli',
      modelPath,
      runProcess: async (command, args) => {
        calls.push([command, args]);
        const outputIndex = args.indexOf('--output-file');
        if (outputIndex >= 0) {
          outputPrefix = args[outputIndex + 1];
          await writeFile(`${outputPrefix}.json`, JSON.stringify(output));
        }
      },
    });

    assert.deepEqual(provider.descriptor, {
      id: 'whisper.cpp',
      model: 'ggml-base.en.bin',
    });
    assert.deepEqual(
      await provider.transcribeChunk({
        sourcePath: '/recordings/source.mkv',
        fps: 30,
        startMs: 2_000,
        endMs: 4_000,
      }),
      parseWhisperCppTranscript(output, { startMs: 2_000, endMs: 4_000, fps: 30 }),
    );
    assert.deepEqual(calls[0], ['ffmpeg', ['-version']]);
    assert.deepEqual(calls[1], ['/opt/whisper-cli', ['--version']]);
    assert.equal(calls[2][0], 'ffmpeg');
    assert.ok(calls[2][1].includes('/recordings/source.mkv'));
    assert.equal(calls[3][0], '/opt/whisper-cli');
    await assert.rejects(readFile(`${outputPrefix}.json`, 'utf8'), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
