import { createRequire } from 'node:module';
import { createServer } from 'node:net';

// Windows system audio ("what you hear"). ffmpeg has no WASAPI loopback input, so a native module
// (loopback-capture, WASAPI) delivers 48 kHz stereo s16le chunks to a tiny local TCP feed, and ffmpeg reads the
// feed as one more raw audio input. Everything downstream (mix, gain, remux) sees an ordinary audio input.
//
// WASAPI loopback delivers NOTHING while the PC is silent, so the feed pads silence against the wall clock;
// otherwise ffmpeg would stall waiting for audio and the track would drift out of sync with the video.

export const LOOPBACK_SOURCE_ID = 'wasapi-loopback';
export const LOOPBACK_SAMPLE_RATE = 48000;
export const LOOPBACK_CHANNELS = 2;
export const LOOPBACK_BYTES_PER_FRAME = 4; // s16le stereo

// Continuous audio arrives in 10 ms chunks with scheduling jitter. Padding only after a deficit this large keeps
// jitter from punching 10 ms holes into real audio; real silence is padded in blocks of at least this size.
const PAD_AFTER_DEFICIT_MS = 60;

/**
 * Keeps a PCM stream continuous against the wall clock. `push` real audio, call `drain(nowMs)` on a timer, and
 * write what it returns: queued audio first (never dropped), then zeros once the stream is far enough behind.
 */
export function createPcmPacer({ startMs, sampleRate = LOOPBACK_SAMPLE_RATE, bytesPerFrame = LOOPBACK_BYTES_PER_FRAME, padAfterDeficitMs = PAD_AFTER_DEFICIT_MS } = {}) {
  const queue = [];
  let writtenFrames = 0;
  const padAfterFrames = Math.round((padAfterDeficitMs * sampleRate) / 1000);

  return {
    push(buffer) {
      if (buffer?.length) queue.push(buffer);
    },
    drain(nowMs) {
      const out = [];
      while (queue.length > 0) {
        const buffer = queue.shift();
        out.push(buffer);
        writtenFrames += Math.floor(buffer.length / bytesPerFrame);
      }
      const targetFrames = Math.floor(((nowMs - startMs) * sampleRate) / 1000);
      const deficit = targetFrames - writtenFrames;
      if (deficit >= padAfterFrames) {
        out.push(Buffer.alloc(deficit * bytesPerFrame));
        writtenFrames += deficit;
      }
      return out;
    },
    get writtenFrames() {
      return writtenFrames;
    },
  };
}

function defaultLoadCapture() {
  const require = createRequire(import.meta.url);
  const { LoopbackCapture } = require('loopback-capture');
  return new LoopbackCapture();
}

export function isLoopbackAvailable({ platform = process.platform, loadCapture = defaultLoadCapture } = {}) {
  if (platform !== 'win32') return false;
  try {
    return Boolean(loadCapture());
  } catch {
    return false;
  }
}

/**
 * Starts capturing system audio and serves it on 127.0.0.1:<port>. Resolves to `{ url, close }` once listening.
 * Each ffmpeg segment (a pause/resume starts a new one) connects, gets a continuous stream from that moment, and
 * may disconnect; the capture itself runs until `close()`.
 */
export async function createLoopbackFeed({ loadCapture = defaultLoadCapture, now = Date.now, tickMs = 20, host = '127.0.0.1' } = {}) {
  const capture = loadCapture();
  let pacer = null;
  let client = null;
  let timer = null;
  let closed = false;

  const server = createServer((socket) => {
    if (closed) return socket.destroy();
    client?.destroy();
    client = socket;
    socket.setNoDelay(true);
    pacer = createPcmPacer({ startMs: now() });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (client === socket) {
        client = null;
        pacer = null;
      }
    });
  });
  server.on('error', (err) => console.warn('[system-audio] feed error:', err?.message ?? err));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address();

  capture.startSystemAudio((chunk) => {
    // Audio is only kept while ffmpeg is connected; before that there is nothing to be in sync with.
    pacer?.push(Buffer.from(chunk));
  });
  timer = setInterval(() => {
    if (!client || !pacer || client.destroyed) return;
    for (const buffer of pacer.drain(now())) client.write(buffer);
  }, tickMs);
  timer.unref?.();

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try { capture.stop(); } catch { /* already stopped */ }
    client?.destroy();
    server.close();
  }

  return { url: `tcp://${host}:${port}`, port, close };
}
