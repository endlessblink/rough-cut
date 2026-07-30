import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSonaProvider, parseSonaTranscript } from './sona-provider.mjs';

test('maps real Sona segment JSON into conservative transcript words and silence', () => {
  assert.deepEqual(
    parseSonaTranscript(
      {
        text: ' Hello, this is local speech.',
        segments: [
          { start: 0.5, end: 2.5, text: ' Hello, this is local speech.' },
        ],
      },
      { startMs: 2_000, endMs: 5_000, fps: 30 },
    ),
    {
      words: [
        { word: 'Hello,', startFrame: 75, endFrame: 90, confidence: 0.6 },
        { word: 'this', startFrame: 90, endFrame: 100, confidence: 0.6 },
        { word: 'is', startFrame: 100, endFrame: 105, confidence: 0.6 },
        { word: 'local', startFrame: 105, endFrame: 118, confidence: 0.6 },
        { word: 'speech.', startFrame: 118, endFrame: 135, confidence: 0.6 },
      ],
      paragraphs: [
        { text: 'Hello, this is local speech.', startFrame: 75, endFrame: 135 },
      ],
      nonSpeech: [
        { kind: 'silence', startFrame: 60, endFrame: 75 },
        { kind: 'silence', startFrame: 135, endFrame: 150 },
      ],
    },
  );
});

test('prefers real Sona word timestamps when the backend supplies them', () => {
  assert.deepEqual(
    parseSonaTranscript(
      {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'hello world',
            words: [
              { word: 'hello', start: 0.1, end: 0.4, probability: 0.94 },
              { word: 'world', start: 0.55, end: 0.9, probability: 0.91 },
            ],
          },
        ],
      },
      { startMs: 2_000, endMs: 3_000, fps: 30 },
    ).words,
    [
      { word: 'hello', startFrame: 63, endFrame: 72, confidence: 0.94 },
      { word: 'world', startFrame: 77, endFrame: 87, confidence: 0.91 },
    ],
  );
});

test('does not duplicate exact words exposed at both response levels', () => {
  const word = { word: 'hello', start: 0.1, end: 0.4 };
  assert.equal(
    parseSonaTranscript(
      {
        words: [word],
        segments: [{ start: 0, end: 1, text: 'hello', words: [word] }],
      },
      { startMs: 0, endMs: 1_000, fps: 30 },
    ).words.length,
    1,
  );
});

test('cancelling a cold Sona start aborts readiness and kills the server', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-sona-test-'));
  try {
    const modelPath = join(dir, 'model.bin');
    await writeFile(modelPath, 'model');
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    child.exitCode = null;
    const kills = [];
    child.kill = (signal) => {
      kills.push(signal);
      child.exitCode = 1;
      child.emit('close', null, signal);
      return true;
    };
    const provider = await createSonaProvider({
      modelPath,
      runProcess: async (_command, args) => {
        if (args.includes('-y')) await writeFile(args.at(-1), 'audio');
      },
      spawnProcess: () => child,
      fetchImpl: async () => ({ ok: false }),
    });
    assert.equal(provider.incrementalDuringCapture, true);
    const controller = new AbortController();
    const operation = provider.transcribeChunk({
      sourcePath: '/recording.mkv',
      fps: 30,
      startMs: 0,
      endMs: 1_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(operation, { name: 'AbortError' });
    assert.deepEqual(kills, ['SIGKILL']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
