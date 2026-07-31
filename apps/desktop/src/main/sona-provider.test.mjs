import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyDetectedPauses,
  createSonaProvider,
  parseSonaTranscript,
} from './sona-provider.mjs';

function wavWithSamples() {
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(38, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(2, 40);
  wav.writeInt16LE(1, 44);
  return wav;
}

function emptyWav() {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.write('data', 36);
  wav.writeUInt32LE(0, 40);
  return wav;
}

test('maps ASR gaps as unrecognized audio instead of inventing silence', () => {
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
      { kind: 'unrecognized', startFrame: 60, endFrame: 75 },
      { kind: 'unrecognized', startFrame: 135, endFrame: 150 },
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

test('splits unexplained ASR gaps into detected pauses and reviewable audio', () => {
  const transcript = {
    words: [],
    paragraphs: [],
    nonSpeech: [{ kind: 'unrecognized', startFrame: 30, endFrame: 90 }],
  };
  assert.deepEqual(
    applyDetectedPauses(
      transcript,
      [{ startSeconds: 0.5, endSeconds: 1.5 }],
      { startMs: 1_000, fps: 30 },
    ).nonSpeech,
    [
      { kind: 'unrecognized', startFrame: 30, endFrame: 45 },
      { kind: 'silence', startFrame: 45, endFrame: 75 },
      { kind: 'unrecognized', startFrame: 75, endFrame: 90 },
    ],
  );
});

test('keeps a detected short pause even when the ASR gap was below its segment threshold', () => {
  const transcript = { words: [], paragraphs: [], nonSpeech: [] };
  assert.deepEqual(
    applyDetectedPauses(
      transcript,
      [{ startSeconds: 0.2, endSeconds: 0.45 }],
      { startMs: 0, fps: 30 },
    ).nonSpeech,
    [{ kind: 'silence', startFrame: 6, endFrame: 14 }],
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

test('keeps fillers and repetitions when Sona supplies only partial exact words', () => {
  const result = parseSonaTranscript(
    {
      segments: [
        {
          start: 0,
          end: 1.2,
          text: 'אממ שלום אממ',
          words: [
            { word: 'שלום', start: 0.42, end: 0.78, probability: 0.95 },
          ],
        },
      ],
    },
    { startMs: 0, endMs: 1_200, fps: 30 },
  );

  assert.deepEqual(result.words.map((word) => word.word), [
    'אממ',
    'שלום',
    'אממ',
  ]);
  assert.deepEqual(result.words[1], {
    word: 'שלום',
    startFrame: 13,
    endFrame: 23,
    confidence: 0.95,
  });
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
        if (args.includes('-y')) await writeFile(args.at(-1), wavWithSamples());
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

test('treats an extracted WAV with no samples as timed silence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-sona-empty-test-'));
  try {
    const modelPath = join(dir, 'model.bin');
    await writeFile(modelPath, 'model');
    const provider = await createSonaProvider({
      modelPath,
      runProcess: async (_command, args) => {
        if (args.includes('-y')) await writeFile(args.at(-1), emptyWav());
      },
      fetchImpl: async () => {
        throw new Error('Empty audio must not be sent to Sona');
      },
    });

    assert.deepEqual(
      await provider.transcribeChunk({
        sourcePath: '/recording.mkv',
        fps: 30,
        startMs: 1_000,
        endMs: 16_000,
      }),
      {
        words: [],
        paragraphs: [],
        nonSpeech: [{ kind: 'silence', startFrame: 30, endFrame: 480 }],
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
