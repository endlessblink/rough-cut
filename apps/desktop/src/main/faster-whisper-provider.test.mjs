import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import {
  createFasterWhisperWorker,
  parseFasterWhisperTranscript,
} from './faster-whisper-provider.mjs';

test('keeps repeated fillers as separate words with exact timestamps', () => {
  const transcript = parseFasterWhisperTranscript(
    {
      segments: [
        {
          start: 0.4,
          end: 2.2,
          text: 'אממ אממ אני אני מתחיל',
          words: [
            { word: 'אממ', start: 0.4, end: 0.65, probability: 0.91 },
            { word: 'אממ', start: 0.68, end: 0.9, probability: 0.89 },
            { word: 'אני', start: 1.0, end: 1.2, probability: 0.96 },
            { word: 'אני', start: 1.25, end: 1.48, probability: 0.95 },
            { word: 'מתחיל', start: 1.55, end: 2.2, probability: 0.93 },
          ],
        },
      ],
    },
    { startMs: 10_000, endMs: 13_000, fps: 30 },
  );

  assert.deepEqual(
    transcript.words.map(({ word, startFrame, endFrame }) => ({
      word,
      startFrame,
      endFrame,
    })),
    [
      { word: 'אממ', startFrame: 312, endFrame: 320 },
      { word: 'אממ', startFrame: 320, endFrame: 327 },
      { word: 'אני', startFrame: 330, endFrame: 336 },
      { word: 'אני', startFrame: 338, endFrame: 344 },
      { word: 'מתחיל', startFrame: 347, endFrame: 366 },
    ],
  );
  assert.deepEqual(transcript.nonSpeech, [
    { kind: 'unrecognized', startFrame: 300, endFrame: 312 },
    { kind: 'unrecognized', startFrame: 366, endFrame: 390 },
  ]);
});

test('worker reuses one loaded model and resolves JSON-line responses by id', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = () => {
    child.exitCode = 0;
    child.emit('close', 0);
  };
  const writes = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));
  let spawnCount = 0;
  const worker = createFasterWhisperWorker({
    pythonPath: '/venv/bin/python',
    helperPath: '/app/faster-whisper-worker.py',
    modelPath: '/models/ivrit-hebrew',
    spawnProcess: () => {
      spawnCount += 1;
      return child;
    },
  });

  const first = worker.transcribe('/tmp/one.wav', { language: 'he' });
  const firstRequest = JSON.parse(writes[0]);
  child.stdout.write(`${JSON.stringify({
    id: firstRequest.id,
    result: { segments: [] },
  })}\n`);
  assert.deepEqual(await first, { segments: [] });

  const second = worker.transcribe('/tmp/two.wav', { language: 'he' });
  const secondRequest = JSON.parse(writes[1]);
  child.stdout.write(`${JSON.stringify({
    id: secondRequest.id,
    result: { segments: [] },
  })}\n`);
  assert.deepEqual(await second, { segments: [] });
  assert.equal(spawnCount, 1);

  worker.dispose();
});
