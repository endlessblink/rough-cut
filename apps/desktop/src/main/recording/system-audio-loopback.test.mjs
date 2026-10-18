import assert from 'node:assert/strict';
import { connect } from 'node:net';
import test from 'node:test';
import { createLoopbackFeed, createPcmPacer, isLoopbackAvailable } from './system-audio-loopback.mjs';

const FRAME = 4;
const chunk10ms = (value = 1) => Buffer.alloc(480 * FRAME, value);
const totalFrames = (buffers) => buffers.reduce((sum, b) => sum + b.length / FRAME, 0);

test('real audio is passed through untouched and never dropped', () => {
  const pacer = createPcmPacer({ startMs: 0 });
  pacer.push(chunk10ms(7));
  pacer.push(chunk10ms(9));
  const out = pacer.drain(20);
  assert.equal(out.length, 2);
  assert.equal(out[0][0], 7);
  assert.equal(out[1][0], 9);
  assert.equal(pacer.writtenFrames, 960);
});

test('scheduling jitter in continuous audio never inserts silence', () => {
  const pacer = createPcmPacer({ startMs: 0 });
  const written = [];
  // Audio is produced at exactly real time (20 ms per 20 ms tick) but delivered in uneven bursts: every fifth
  // tick sees nothing, and the next one sees double. Worst case the stream is 20 ms behind the clock.
  for (let tick = 1; tick <= 50; tick += 1) {
    const chunks = tick % 5 === 4 ? 0 : tick % 5 === 0 ? 4 : 2;
    for (let i = 0; i < chunks; i += 1) pacer.push(chunk10ms());
    written.push(...pacer.drain(tick * 20));
  }
  const silent = written.filter((b) => b.every((byte) => byte === 0));
  assert.equal(silent.length, 0);
});

test('a silent PC is padded with zeros against the wall clock so the stream stays continuous', () => {
  const pacer = createPcmPacer({ startMs: 1000 });
  let frames = 0;
  for (let ms = 1020; ms <= 3000; ms += 20) frames += totalFrames(pacer.drain(ms));
  // 2.0 s of wall clock, padded in blocks of at least 60 ms: within one block of the ideal 96000 frames.
  assert.ok(Math.abs(frames - 96000) <= 3200, `got ${frames} frames`);
  assert.equal(frames, pacer.writtenFrames);
});

test('audio resuming after silence continues from the padded position without a hole', () => {
  const pacer = createPcmPacer({ startMs: 0 });
  let frames = 0;
  for (let ms = 20; ms <= 1000; ms += 20) frames += totalFrames(pacer.drain(ms)); // 1 s of silence
  pacer.push(chunk10ms(5));
  const out = pacer.drain(1020);
  assert.equal(out[0][0], 5);
  frames += totalFrames(out);
  assert.ok(frames >= 48000 - 3200, `got ${frames} frames`); // padding is block-sized, so within one block of 1 s
});

test('loopback is unavailable off Windows and when the module cannot load', () => {
  assert.equal(isLoopbackAvailable({ platform: 'linux', loadCapture: () => ({}) }), false);
  assert.equal(isLoopbackAvailable({ platform: 'win32', loadCapture: () => { throw new Error('missing'); } }), false);
  assert.equal(isLoopbackAvailable({ platform: 'win32', loadCapture: () => ({}) }), true);
});

test('the TCP feed serves a connected reader a continuous stream, pads silence, and closes cleanly', async () => {
  let deliver = null;
  let stopped = false;
  const fakeCapture = { startSystemAudio: (cb) => { deliver = cb; }, stop: () => { stopped = true; } };
  const feed = await createLoopbackFeed({ loadCapture: () => fakeCapture, tickMs: 10 });
  assert.match(feed.url, /^tcp:\/\/127\.0\.0\.1:\d+$/);

  const received = [];
  const socket = connect(feed.port, '127.0.0.1');
  socket.on('data', (data) => received.push(data));
  await new Promise((resolve) => socket.once('connect', resolve));
  await new Promise((resolve) => setTimeout(resolve, 40));
  deliver(chunk10ms(3)); // one real chunk, then silence
  await new Promise((resolve) => setTimeout(resolve, 500));

  const all = Buffer.concat(received);
  assert.ok(all.includes(Buffer.alloc(FRAME, 3)), 'real audio reaches the reader');
  // About 0.5 s of wall clock was served; padding comes in >= 60 ms blocks, so allow generous slack for timers.
  assert.ok(all.length / FRAME >= 48000 * 0.3, `served only ${all.length / FRAME} frames`);

  socket.destroy();
  feed.close();
  assert.equal(stopped, true);
});
