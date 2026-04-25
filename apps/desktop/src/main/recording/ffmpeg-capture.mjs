// @ts-check
import { spawn } from 'node:child_process';

/**
 * @typedef {Object} FfmpegCaptureOptions
 * @property {string} outputPath          — Where to write the captured video
 * @property {number} fps                 — Capture frame rate (24, 30, 60)
 * @property {string} display             — X11 display string, e.g. ':0.0' or ':0.0+1920,0'
 * @property {number} width               — Capture width in pixels
 * @property {number} height              — Capture height in pixels
 * @property {string | null} [micSource]          PulseAudio mic source name, or null to skip
 * @property {string | null} [systemAudioSource]  PulseAudio monitor source name, or null to skip
 * @property {number} [systemAudioGainPercent]    System-audio gain percent, 0–100
 */

/**
 * @typedef {Object} FfmpegCaptureHandle
 * @property {() => Promise<string>} stop — Send SIGINT and wait for clean exit. Returns output path.
 * @property {string} outputPath
 */

const USE_FFMPEG_CAPTURE =
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'x11' ||
    (process.env.DISPLAY !== undefined && process.env.DISPLAY !== ''));

/**
 * Whether FFmpeg x11grab capture is available on this platform.
 * @returns {boolean}
 */
export function isFfmpegCaptureAvailable() {
  return USE_FFMPEG_CAPTURE;
}

/**
 * Start an FFmpeg x11grab capture process.
 *
 * Uses `-draw_mouse 0` to exclude the system cursor from the capture.
 * The user still sees their cursor on screen.
 *
 * `onFirstFrame` (optional): invoked exactly once with a wall-clock millisecond
 * timestamp estimating when FFmpeg captured its first frame. Derived by
 * parsing `-progress pipe:1` blocks on stdout: each block satisfies
 * `firstFrameWallClock <= arrival_wallclock - out_time_us/1000`, so we take
 * the minimum across the first few blocks. The session manager uses this to
 * anchor the cursor sidecar to the actual file frame 0 (not to MediaRecorder
 * start, which fires later than FFmpeg's first capture on Linux/X11).
 *
 * @param {FfmpegCaptureOptions} options
 * @returns {FfmpegCaptureHandle}
 */
export function startFfmpegCapture({
  outputPath,
  fps,
  display,
  width,
  height,
  micSource = null,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
  onFirstFrame = null,
}) {
  const hasMic = typeof micSource === 'string' && micSource.length > 0;
  const hasSysAudio = typeof systemAudioSource === 'string' && systemAudioSource.length > 0;
  const audioInputCount = (hasMic ? 1 : 0) + (hasSysAudio ? 1 : 0);

  // --- Build args ---
  // -thread_queue_size 512: with multiple inputs (video + audio), ffmpeg's
  // demuxer uses a bounded inter-thread packet queue (default 8). When libvpx
  // stalls briefly, the x11grab thread blocks on enqueue and silently drops
  // frames — observed as captured-at-60 files that actually contain ~40 fps.
  // Applying to every input keeps audio packets from backpressuring video too.
  const args = [
    '-y', // Overwrite output
    // Realtime progress to stdout. Used by the cursor-sync first-frame parser
    // (see createFirstFrameDetector + onFirstFrame option) to derive the
    // wall-clock of the actual first captured frame.
    '-progress',
    'pipe:1',
    '-stats_period',
    '0.05',
    // Input 0: x11grab video
    '-thread_queue_size',
    '512',
    '-f',
    'x11grab',
    '-draw_mouse',
    '0',
    '-framerate',
    String(fps),
    '-video_size',
    `${width}x${height}`,
    '-i',
    display,
  ];

  // Input 1 (if present): system audio monitor
  if (hasSysAudio) {
    args.push(
      '-thread_queue_size',
      '512',
      '-f',
      'pulse',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-i',
      systemAudioSource,
    );
  }

  // Input 2 (or 1 if no system audio): microphone
  if (hasMic) {
    args.push(
      '-thread_queue_size',
      '512',
      '-f',
      'pulse',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-i',
      micSource,
    );
  }

  // --- Filter + mapping ---
  const systemAudioGain = Math.max(0, Math.min(1, Number(systemAudioGainPercent) / 100 || 0));
  const needsSystemAudioGain = hasSysAudio && Math.abs(systemAudioGain - 1) > 0.001;
  if (hasSysAudio && hasMic) {
    const sysChain = needsSystemAudioGain
      ? `[1:a]volume=${systemAudioGain.toFixed(2)}[sysa];[sysa][2:a]amix=inputs=2[a]`
      : '[1:a][2:a]amix=inputs=2[a]';
    args.push('-filter_complex', sysChain);
    args.push('-map', '0:v', '-map', '[a]');
  } else if (hasSysAudio) {
    if (needsSystemAudioGain) {
      args.push('-filter_complex', `[1:a]volume=${systemAudioGain.toFixed(2)}[a]`);
      args.push('-map', '0:v', '-map', '[a]');
    } else {
      args.push('-map', '0:v', '-map', '1:a');
    }
  } else if (hasMic) {
    args.push('-map', '0:v', '-map', '1:a');
  }
  // No audio → no -map needed (single input, auto-mapped)

  // --- Codecs ---
  // libvpx VP8 defaults single-threaded and cpu-used 4 can't sustain 1080p60
  // on this pipeline — drops ~33% of input frames. -threads 8 + cpu-used 8
  // closes the gap on multi-core hosts without changing codec/container.
  args.push(
    '-c:v',
    'libvpx', // VP8 — same codec as MediaRecorder WebM
    '-b:v',
    '8M', // 8 Mbps bitrate
    '-deadline',
    'realtime', // Low-latency encoding
    '-cpu-used',
    '8', // Realtime speed tier for VP8 (range -16..16, higher = faster)
    '-threads',
    '8', // Multi-threaded encode — VP8 scales well up to ~8
    '-auto-alt-ref',
    '0', // Disable alt-ref for realtime
  );

  if (audioInputCount > 0) {
    args.push('-c:a', 'libopus', '-b:a', '128k');
  }

  args.push(outputPath);

  console.info('[ffmpeg-capture] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  const stderrState = createStderrDropWatcher('[ffmpeg-capture]');
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    stderrState.observe(text);
  });

  // Wall-clock anchor for cursor sync. The first few `-progress pipe:1`
  // blocks let us bound when FFmpeg actually muxed frame 0; see
  // createFirstFrameDetector for the math. Fires at most once.
  if (typeof onFirstFrame === 'function') {
    const detector = createFirstFrameDetector({
      onFirstFrame: (ms) => {
        try {
          onFirstFrame(ms);
        } catch (err) {
          console.warn('[ffmpeg-capture] onFirstFrame callback threw:', err?.message ?? err);
        }
      },
    });
    proc.stdout?.on('data', (chunk) => detector.observe(chunk.toString(), Date.now()));
  }

  proc.on('error', (err) => {
    console.error('[ffmpeg-capture] Process error:', err.message);
  });

  proc.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGINT') {
      console.warn('[ffmpeg-capture] Exited with code', code, 'signal', signal);
      // Log last 500 chars of stderr for debugging
      if (stderr) console.warn('[ffmpeg-capture] stderr tail:', stderr.slice(-500));
    } else {
      console.info('[ffmpeg-capture] Stopped cleanly.');
    }
  });

  return {
    outputPath,

    /**
     * Stop the FFmpeg process cleanly by sending 'q' to stdin.
     * Falls back to SIGINT if stdin write fails.
     * Returns the output file path.
     * @returns {Promise<string>}
     */
    stop() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[ffmpeg-capture] Timeout waiting for exit — killing.');
          proc.kill('SIGKILL');
          resolve(outputPath);
        }, 5000);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve(outputPath);
        });

        // Send 'q' to stdin for clean exit (FFmpeg's preferred stop method)
        try {
          proc.stdin?.write('q');
          proc.stdin?.end();
        } catch {
          // stdin may be closed — fall back to SIGINT
          proc.kill('SIGINT');
        }
      });
    },
  };
}

/**
 * Watch an ffmpeg stderr stream for signs of silent frame drops or
 * demuxer backpressure. FFmpeg buffers these warnings to stderr only —
 * without this, a "captured at 60 fps" file that actually contains 40 fps
 * leaves no log trail. Emits at most one warning per distinct condition
 * after a 2 s grace period (to skip normal startup jitter).
 *
 * @param {string} tag  Log prefix, e.g. '[ffmpeg-capture]'.
 */
function createStderrDropWatcher(tag) {
  const startMs = Date.now();
  const GRACE_MS = 2000;
  let lastDropCount = 0;
  let queueWarningLogged = false;
  return {
    /** @param {string} text */
    observe(text) {
      if (!queueWarningLogged && text.includes('Thread message queue blocking')) {
        queueWarningLogged = true;
        console.warn(
          `${tag} thread_queue_size too small — input backpressure detected; frames may drop.`,
        );
      }
      const match = text.match(/drop=(\d+)/);
      if (!match) return;
      const n = Number(match[1]);
      if (n <= lastDropCount) return;
      const delta = n - lastDropCount;
      lastDropCount = n;
      if (Date.now() - startMs > GRACE_MS) {
        console.warn(`${tag} frame drops: +${delta} (total ${n}).`);
      }
    },
  };
}

/**
 * First-frame wall-clock detector for FFmpeg `-progress pipe:1` output.
 *
 * Each progress block emitted by ffmpeg contains an `out_time_us` field — the
 * PTS (in microseconds) of the most recently encoded frame. For x11grab with
 * `-framerate F`, frame N has PTS `(N-1)/F * 1e6`. Crucially, `out_time_us`
 * tracks ENCODED-timeline progress, not wall-clock; ffmpeg's progress timer
 * fires on its own cadence (`-stats_period`) regardless of when frames mux.
 *
 * Invariant for every block where `out_time_us > 0`:
 *
 *     first_frame_wall_clock <= block_arrival_wall_clock - out_time_us / 1000
 *
 * Reasoning: by the moment the block is emitted, ffmpeg has produced
 * `out_time_us` µs of encoded timeline, so the first frame must have been
 * captured at least that long before. The expression is therefore a strict
 * upper bound on the true first-frame wall-clock. Taking the minimum across
 * the early blocks converges to the truth quickly — empirically within
 * ~250 ms (libvpx realtime, 1080p60 on this machine).
 *
 * Blocks with `out_time_us === 0` are timer ticks before frame 1 muxed and
 * are ignored. Fires `onFirstFrame(minMs)` exactly once after `maxBlocks`
 * non-zero blocks have been observed OR `maxWindowMs` ms have elapsed since
 * the first non-zero block (whichever first).
 *
 * Stateless wrt time: the caller passes wall-clock at observe-time. This
 * keeps the helper deterministic for unit testing.
 *
 * @param {{
 *   onFirstFrame: (firstFrameWallClockMs: number) => void,
 *   maxBlocks?: number,
 *   maxWindowMs?: number,
 * }} options
 */
export function createFirstFrameDetector({
  onFirstFrame,
  maxBlocks = 5,
  maxWindowMs = 500,
}) {
  let buffer = '';
  let pendingOutTimeUs = null;
  let bestMs = Number.POSITIVE_INFINITY;
  let nonZeroBlocks = 0;
  let firstNonZeroAt = null;
  let fired = false;

  function emitIfReady(now) {
    if (fired) return;
    if (!Number.isFinite(bestMs)) return;
    const enoughBlocks = nonZeroBlocks >= maxBlocks;
    const elapsedEnough =
      firstNonZeroAt !== null && now - firstNonZeroAt >= maxWindowMs;
    if (enoughBlocks || elapsedEnough) {
      fired = true;
      onFirstFrame(bestMs);
    }
  }

  return {
    /**
     * Feed a chunk of stdout text plus the wall-clock at receive-time.
     * @param {string} chunk
     * @param {number} arrivalMs
     */
    observe(chunk, arrivalMs) {
      if (fired) return;
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('out_time_us=')) {
          const v = Number(line.slice('out_time_us='.length));
          pendingOutTimeUs = Number.isFinite(v) ? v : null;
          continue;
        }
        if (line === 'progress=continue' || line === 'progress=end') {
          if (pendingOutTimeUs !== null && pendingOutTimeUs > 0) {
            const candidate = arrivalMs - pendingOutTimeUs / 1000;
            if (candidate < bestMs) bestMs = candidate;
            if (firstNonZeroAt === null) firstNonZeroAt = arrivalMs;
            nonZeroBlocks += 1;
          }
          pendingOutTimeUs = null;
          emitIfReady(arrivalMs);
          if (fired) return;
        }
      }
      // After processing all complete lines in this chunk, an in-flight
      // block could still be ready by elapsed time alone.
      emitIfReady(arrivalMs);
    },
  };
}

/**
 * Start an FFmpeg audio-only capture process using PulseAudio/PipeWire sources.
 *
 * @param {{ outputPath: string, micSource?: string | null, systemAudioSource?: string | null, systemAudioGainPercent?: number }} options
 * @returns {FfmpegCaptureHandle | null}
 */
export function startFfmpegAudioCapture({
  outputPath,
  micSource = null,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
}) {
  const hasMic = typeof micSource === 'string' && micSource.length > 0;
  const hasSysAudio = typeof systemAudioSource === 'string' && systemAudioSource.length > 0;
  const audioInputCount = (hasMic ? 1 : 0) + (hasSysAudio ? 1 : 0);

  if (audioInputCount === 0) return null;

  const args = ['-y'];

  if (hasSysAudio) {
    args.push(
      '-thread_queue_size',
      '512',
      '-f',
      'pulse',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-i',
      systemAudioSource,
    );
  }
  if (hasMic) {
    args.push(
      '-thread_queue_size',
      '512',
      '-f',
      'pulse',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-i',
      micSource,
    );
  }

  const systemAudioGain = Math.max(0, Math.min(1, Number(systemAudioGainPercent) / 100 || 0));
  const needsSystemAudioGain = hasSysAudio && Math.abs(systemAudioGain - 1) > 0.001;
  if (hasSysAudio && hasMic) {
    const sysChain = needsSystemAudioGain
      ? `[0:a]volume=${systemAudioGain.toFixed(2)}[sysa];[sysa][1:a]amix=inputs=2[a]`
      : '[0:a][1:a]amix=inputs=2[a]';
    args.push('-filter_complex', sysChain, '-map', '[a]');
  } else if (hasSysAudio && needsSystemAudioGain) {
    args.push('-filter_complex', `[0:a]volume=${systemAudioGain.toFixed(2)}[a]`, '-map', '[a]');
  } else {
    args.push('-map', '0:a');
  }

  args.push('-c:a', 'libopus', '-b:a', '128k', outputPath);

  console.info('[ffmpeg-audio-capture] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  const stderrState = createStderrDropWatcher('[ffmpeg-audio-capture]');
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    stderrState.observe(text);
  });

  proc.on('error', (err) => {
    console.error('[ffmpeg-audio-capture] Process error:', err.message);
  });

  proc.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGINT') {
      console.warn('[ffmpeg-audio-capture] Exited with code', code, 'signal', signal);
      if (stderr) console.warn('[ffmpeg-audio-capture] stderr tail:', stderr.slice(-500));
    } else {
      console.info('[ffmpeg-audio-capture] Stopped cleanly.');
    }
  });

  return {
    outputPath,
    stop() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[ffmpeg-audio-capture] Timeout waiting for exit — killing.');
          proc.kill('SIGKILL');
          resolve(outputPath);
        }, 5000);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve(outputPath);
        });

        try {
          proc.stdin?.write('q');
          proc.stdin?.end();
        } catch {
          proc.kill('SIGINT');
        }
      });
    },
  };
}
