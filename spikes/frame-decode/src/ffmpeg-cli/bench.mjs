/**
 * Spike 1 - Step 4: FFmpeg via child process
 *
 * Tests frame extraction using ffmpeg CLI spawned as child process.
 * Runs in Node.js (no Electron needed).
 *
 * Usage: npm run bench:ffmpeg-cli
 *   (from spikes/frame-decode/ directory)
 */

import { spawn } from 'child_process';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE_ROOT = resolve(__dirname, '..', '..');
const TEST_MEDIA_DIR = resolve(SPIKE_ROOT, 'test-media');
const RESULTS_DIR = resolve(SPIKE_ROOT, '..', '..', 'results');

// ─── Video Descriptors ────────────────────────────────────────────────────────

const VIDEOS = [
  {
    name: '1080p-h264-30fps',
    path: resolve(TEST_MEDIA_DIR, 'test-1080p-h264-30fps-gop2s.mp4'),
    width: 1920,
    height: 1080,
    fps: 30,
    totalFrames: 300,
    gopFrames: 60,
  },
  {
    name: '4k-h264-60fps',
    path: resolve(TEST_MEDIA_DIR, 'test-4k-h264-60fps-gop2s.mp4'),
    width: 3840,
    height: 2160,
    fps: 60,
    totalFrames: 600,
    gopFrames: 120,
  },
  {
    name: '1080p-vp9-30fps',
    path: resolve(TEST_MEDIA_DIR, 'test-1080p-vp9-30fps.webm'),
    width: 1920,
    height: 1080,
    fps: 30,
    totalFrames: 300,
    gopFrames: null, // VP9, unknown GOP
  },
];

// ─── Core: Spawn FFmpeg and collect one RGBA frame ────────────────────────────

/**
 * Spawn ffmpeg and collect exactly one RGBA frame from stdout.
 *
 * @param {string[]} args - ffmpeg argument list (no 'ffmpeg' prefix)
 * @param {number} frameBytes - expected byte count for one frame
 * @returns {Promise<{ buffer: Buffer, wallMs: number }>}
 */
function spawnFfmpegFrame(args, frameBytes) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const chunks = [];
    let totalBytes = 0;

    proc.stdout.on('data', (chunk) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
      // Stop reading once we have a full frame (avoids hanging on multi-frame output)
      if (totalBytes >= frameBytes) {
        proc.stdout.destroy();
        proc.kill('SIGTERM');
      }
    });

    proc.stderr.on('data', () => {}); // suppress ffmpeg log noise

    proc.on('close', (_code) => {
      const wallMs = performance.now() - start;
      if (totalBytes < frameBytes) {
        reject(new Error(`Expected ${frameBytes} bytes, got ${totalBytes}. Args: ${args.join(' ')}`));
        return;
      }
      const buffer = Buffer.concat(chunks).subarray(0, frameBytes);
      resolve({ buffer, wallMs });
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Build ffmpeg args for fast seek (pre-input -ss).
 * Inaccurate — seeks to nearest keyframe before timestamp.
 */
function fastSeekArgs(videoPath, timeS, extraArgs = []) {
  return [
    '-ss', String(timeS),
    '-i', videoPath,
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    ...extraArgs,
    'pipe:1',
  ];
}

/**
 * Build ffmpeg args for accurate seek (post-input -ss).
 * Decodes from keyframe to exact position — slower.
 */
function accurateSeekArgs(videoPath, timeS, extraArgs = []) {
  return [
    '-i', videoPath,
    '-ss', String(timeS),
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    ...extraArgs,
    'pipe:1',
  ];
}

// ─── Pixel / Frame Verification ───────────────────────────────────────────────

/**
 * Sample center 10x10 region of an RGBA frame.
 * Returns average brightness (0-255).
 */
function centerBrightness(buffer, width, height) {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const size = 10;
  let sum = 0;
  let count = 0;
  for (let y = cy - size; y <= cy + size; y++) {
    for (let x = cx - size; x <= cx + size; x++) {
      const idx = (y * width + x) * 4;
      const r = buffer[idx];
      const g = buffer[idx + 1];
      const b = buffer[idx + 2];
      sum += (r + g + b) / 3;
      count++;
    }
  }
  return sum / count;
}

/**
 * Compare two RGBA buffers — returns fraction of pixels that differ by > threshold.
 */
function frameDiffFraction(bufA, bufB, threshold = 10) {
  let different = 0;
  const pixels = bufA.length / 4;
  for (let i = 0; i < bufA.length; i += 4) {
    const dr = Math.abs(bufA[i] - bufB[i]);
    const dg = Math.abs(bufA[i + 1] - bufB[i + 1]);
    const db = Math.abs(bufA[i + 2] - bufB[i + 2]);
    if (dr > threshold || dg > threshold || db > threshold) different++;
  }
  return different / pixels;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    min: sorted[0],
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtMs(ms) {
  return ms.toFixed(1).padStart(7) + 'ms';
}

function printTable(title, rows, columns) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(` ${title}`);
  console.log(`${'─'.repeat(80)}`);

  const widths = columns.map((c) => Math.max(c.label.length, ...rows.map((r) => String(r[c.key] ?? '').length)));
  const header = columns.map((c, i) => c.label.padEnd(widths[i])).join('  ');
  console.log(header);
  console.log(columns.map((c, i) => '─'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    console.log(columns.map((c, i) => String(row[c.key] ?? '').padEnd(widths[i])).join('  '));
  }
}

// ─── Benchmark 1: Single-Frame Extraction ─────────────────────────────────────

async function benchSingleFrame(video, iterations = 20) {
  console.log(`\n[Single-frame] ${video.name} — ${iterations} iterations per frame/method`);

  const frameBytes = video.width * video.height * 4;

  const fixedFrames = [0, 45, 150, video.totalFrames - 1];
  const randomFrames = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * video.totalFrames)
  );
  const testFrames = [...new Set([...fixedFrames, ...randomFrames])];

  const rows = [];

  for (const frameNum of testFrames) {
    const timeS = frameNum / video.fps;

    // Fast seek
    const fastTimes = [];
    let fastBrightness = 0;
    for (let i = 0; i < iterations; i++) {
      try {
        const { buffer, wallMs } = await spawnFfmpegFrame(fastSeekArgs(video.path, timeS), frameBytes);
        fastTimes.push(wallMs);
        if (i === 0) fastBrightness = centerBrightness(buffer, video.width, video.height);
      } catch (e) {
        fastTimes.push(Infinity);
      }
    }

    // Accurate seek
    const accurateTimes = [];
    let accurateBrightness = 0;
    for (let i = 0; i < iterations; i++) {
      try {
        const { buffer, wallMs } = await spawnFfmpegFrame(accurateSeekArgs(video.path, timeS), frameBytes);
        accurateTimes.push(wallMs);
        if (i === 0) accurateBrightness = centerBrightness(buffer, video.width, video.height);
      } catch (e) {
        accurateTimes.push(Infinity);
      }
    }

    const fs = stats(fastTimes);
    const as = stats(accurateTimes);

    const label = frameNum === 0 ? 'keyframe' :
                  frameNum === 45 ? 'mid-GOP' :
                  frameNum === 150 ? '5s-seek' :
                  frameNum === video.totalFrames - 1 ? 'last' : 'random';

    rows.push({
      frame: `${String(frameNum).padStart(3)} (${label})`,
      'fast p50': fmtMs(fs.p50),
      'fast p95': fmtMs(fs.p95),
      'fast max': fmtMs(fs.max),
      'acc p50': fmtMs(as.p50),
      'acc p95': fmtMs(as.p95),
      'acc max': fmtMs(as.max),
      'fast bright': fastBrightness.toFixed(0),
      'acc bright': accurateBrightness.toFixed(0),
    });

    process.stdout.write('.');
  }
  console.log(' done');

  printTable(`Single-Frame Seek — ${video.name}`, rows, [
    { key: 'frame', label: 'Frame' },
    { key: 'fast p50', label: 'Fast p50' },
    { key: 'fast p95', label: 'Fast p95' },
    { key: 'fast max', label: 'Fast max' },
    { key: 'acc p50', label: 'Acc p50' },
    { key: 'acc p95', label: 'Acc p95' },
    { key: 'acc max', label: 'Acc max' },
    { key: 'fast bright', label: 'FastBright' },
    { key: 'acc bright', label: 'AccBright' },
  ]);

  return { video: video.name, rows };
}

// ─── Benchmark 2: Persistent Process Sequential Decode ────────────────────────

/**
 * Spawn ffmpeg once, decode frames 0-29 sequentially by piping all stdout frames.
 * We can't seek mid-stream, so we decode from start and collect frames in order.
 */
async function benchPersistentProcess(video) {
  console.log(`\n[Persistent] ${video.name} — decoding frames 0-29 sequentially`);

  const frameBytes = video.width * video.height * 4;
  const frameCount = 30;
  const args = [
    '-i', video.path,
    '-frames:v', String(frameCount),
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    'pipe:1',
  ];

  return new Promise((resolve, reject) => {
    const start = performance.now();
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stderr.on('data', () => {}); // suppress

    let buf = Buffer.alloc(0);
    const frameTimes = [];
    let lastFrameTime = start;
    let frameIndex = 0;

    proc.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= frameBytes && frameIndex < frameCount) {
        const now = performance.now();
        frameTimes.push(now - lastFrameTime);
        lastFrameTime = now;
        buf = buf.subarray(frameBytes);
        frameIndex++;
      }
    });

    proc.on('close', () => {
      const totalMs = performance.now() - start;
      const s = stats(frameTimes);

      console.log(`  Total ${frameCount} frames: ${totalMs.toFixed(1)}ms  |  per-frame p50=${fmtMs(s.p50)} p95=${fmtMs(s.p95)} max=${fmtMs(s.max)}`);

      const rows = frameTimes.map((t, i) => ({ frame: i, 'time ms': t.toFixed(2) }));
      resolve({
        video: video.name,
        frameCount,
        totalMs,
        perFrameStats: s,
        frameTimes,
      });
    });

    proc.on('error', reject);
  });
}

// ─── Benchmark 3: Frame Accuracy Verification ─────────────────────────────────

async function benchFrameAccuracy(video) {
  if (!video.name.includes('1080p-h264')) return null;

  console.log(`\n[Accuracy] ${video.name} — frames around GOP boundary (60)`);

  const frameBytes = video.width * video.height * 4;
  const testFrames = [0, 1, 2, 3, 58, 59, 60, 61];
  const buffers = {};
  const brightnesses = {};

  for (const frameNum of testFrames) {
    const timeS = frameNum / video.fps;

    try {
      const { buffer } = await spawnFfmpegFrame(accurateSeekArgs(video.path, timeS), frameBytes);
      buffers[frameNum] = buffer;
      brightnesses[frameNum] = centerBrightness(buffer, video.width, video.height);
    } catch (e) {
      console.error(`  Failed frame ${frameNum}: ${e.message}`);
    }
    process.stdout.write('.');
  }
  console.log(' done');

  // Consecutive diff fractions
  const rows = [];
  for (let i = 0; i < testFrames.length; i++) {
    const fn = testFrames[i];
    const buf = buffers[fn];
    if (!buf) continue;

    let diffVsPrev = '-';
    if (i > 0 && buffers[testFrames[i - 1]]) {
      diffVsPrev = (frameDiffFraction(buf, buffers[testFrames[i - 1]]) * 100).toFixed(2) + '%';
    }

    rows.push({
      frame: String(fn),
      brightness: brightnesses[fn].toFixed(1),
      'diff vs prev': diffVsPrev,
      note: fn % 60 === 0 ? '← keyframe' : '',
    });
  }

  printTable(`Frame Accuracy — ${video.name}`, rows, [
    { key: 'frame', label: 'Frame' },
    { key: 'brightness', label: 'CenterBright' },
    { key: 'diff vs prev', label: 'DiffVsPrev' },
    { key: 'note', label: 'Note' },
  ]);

  return { video: video.name, rows };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(80));
  console.log(' FFmpeg CLI Frame Decode Benchmark');
  console.log('='.repeat(80));
  console.log(`  Spike root : ${SPIKE_ROOT}`);
  console.log(`  Results    : ${RESULTS_DIR}`);
  console.log(`  Date       : ${new Date().toISOString()}`);

  // Ensure results dir
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const allResults = {
    date: new Date().toISOString(),
    singleFrame: [],
    persistentProcess: [],
    frameAccuracy: null,
  };

  // ── 1. Single-frame extraction benchmark ──
  // Use fewer iterations for 4K (each frame is 4× larger → 4× slower decode)
  console.log('\n\n### BENCHMARK 1: Single-Frame Extraction ###');
  for (const video of VIDEOS) {
    const iterations = video.width >= 3840 ? 5 : 20;
    try {
      const result = await benchSingleFrame(video, iterations);
      allResults.singleFrame.push(result);
    } catch (e) {
      console.error(`  SKIPPED ${video.name}: ${e.message}`);
    }
  }

  // ── 2. Persistent process benchmark ──
  console.log('\n\n### BENCHMARK 2: Persistent Process Sequential Decode ###');
  for (const video of VIDEOS) {
    try {
      const result = await benchPersistentProcess(video);
      allResults.persistentProcess.push(result);
    } catch (e) {
      console.error(`  SKIPPED ${video.name}: ${e.message}`);
    }
  }

  // ── 3. Frame accuracy verification (1080p H.264 only) ──
  console.log('\n\n### BENCHMARK 3: Frame Accuracy Verification ###');
  const h264Video = VIDEOS.find((v) => v.name === '1080p-h264-30fps');
  if (h264Video) {
    try {
      allResults.frameAccuracy = await benchFrameAccuracy(h264Video);
    } catch (e) {
      console.error(`  SKIPPED accuracy: ${e.message}`);
    }
  }

  // ── 4. Write JSON results ──
  const outPath = resolve(RESULTS_DIR, 'ffmpeg-cli-results.json');
  const jsonStr = JSON.stringify(allResults, null, 2);
  const writeStream = createWriteStream(outPath);
  await new Promise((res, rej) => {
    writeStream.write(jsonStr, 'utf8', (err) => {
      if (err) rej(err); else writeStream.end(res);
    });
    writeStream.on('error', rej);
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log(` Results written to: ${outPath}`);
  console.log(`${'='.repeat(80)}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
