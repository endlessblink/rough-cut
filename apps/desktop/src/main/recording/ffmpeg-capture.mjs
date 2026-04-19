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
}) {
  const hasMic = typeof micSource === 'string' && micSource.length > 0;
  const hasSysAudio = typeof systemAudioSource === 'string' && systemAudioSource.length > 0;
  const audioInputCount = (hasMic ? 1 : 0) + (hasSysAudio ? 1 : 0);

  // --- Build args ---
  const args = [
    '-y', // Overwrite output
    // Input 0: x11grab video
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
    args.push('-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', systemAudioSource);
  }

  // Input 2 (or 1 if no system audio): microphone
  if (hasMic) {
    args.push('-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', micSource);
  }

  // --- Filter + mapping ---
  if (hasSysAudio && hasMic) {
    // Mix both audio sources into one stream
    args.push('-filter_complex', '[1:a][2:a]amix=inputs=2[a]');
    args.push('-map', '0:v', '-map', '[a]');
  } else if (audioInputCount === 1) {
    // Single audio source — map explicitly
    args.push('-map', '0:v', '-map', '1:a');
  }
  // No audio → no -map needed (single input, auto-mapped)

  // --- Codecs ---
  args.push(
    '-c:v',
    'libvpx', // VP8 — same codec as MediaRecorder WebM
    '-b:v',
    '8M', // 8 Mbps bitrate
    '-deadline',
    'realtime', // Low-latency encoding
    '-cpu-used',
    '4', // Fastest quality tradeoff
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
  proc.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

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
 * Start an FFmpeg audio-only capture process using PulseAudio/PipeWire sources.
 *
 * @param {{ outputPath: string, micSource?: string | null, systemAudioSource?: string | null }} options
 * @returns {FfmpegCaptureHandle | null}
 */
export function startFfmpegAudioCapture({
  outputPath,
  micSource = null,
  systemAudioSource = null,
}) {
  const hasMic = typeof micSource === 'string' && micSource.length > 0;
  const hasSysAudio = typeof systemAudioSource === 'string' && systemAudioSource.length > 0;
  const audioInputCount = (hasMic ? 1 : 0) + (hasSysAudio ? 1 : 0);

  if (audioInputCount === 0) return null;

  const args = ['-y'];

  if (hasSysAudio) {
    args.push('-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', systemAudioSource);
  }
  if (hasMic) {
    args.push('-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', micSource);
  }

  if (hasSysAudio && hasMic) {
    args.push('-filter_complex', '[0:a][1:a]amix=inputs=2[a]', '-map', '[a]');
  } else {
    args.push('-map', '0:a');
  }

  args.push('-c:a', 'libopus', '-b:a', '128k', outputPath);

  console.info('[ffmpeg-audio-capture] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
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
