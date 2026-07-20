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
 * @property {number} [micGainPercent]            Mic gain percent, 0–200
 * @property {number} [systemAudioGainPercent]    System-audio gain percent, 0–200
 */

/**
 * @typedef {Object} FfmpegCaptureHandle
 * @property {() => Promise<string>} stop — Send SIGINT and wait for clean exit. Returns output path.
 * @property {() => Promise<string>} [cancel] — Terminate capture without preserving output integrity. Returns output path.
 * @property {string} outputPath
 */

const USE_FFMPEG_CAPTURE =
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'x11' ||
    (process.env.DISPLAY !== undefined && process.env.DISPLAY !== ''));

// Screen capture finalization can legitimately take many seconds for libx264
// to flush a long mux, so the screen path keeps the original generous
// ceilings. Regression-guarded by ffmpeg-capture-args.test.mjs.
export const FFMPEG_STOP_TIMEOUT_MS = 60_000;
export const FFMPEG_SIGINT_TIMEOUT_MS = 60_000;
export const FFMPEG_SIGTERM_TIMEOUT_MS = 15_000;

// Camera capture has a different failure mode: ffmpeg blocked in an
// uninterruptible v4l2 read on a stuck device. Soft signals don't reach it,
// only SIGKILL does, so 60+60+15 = 135s of waiting is purely dead time that
// freezes the UI after Stop. Use a tighter cascade so camera-stop wedges fall
// back to "screen-only project" within ~10s. Symptomatic fix; the underlying
// v4l2 signal-blocking behavior is tracked separately.
export const FFMPEG_CAMERA_STOP_TIMEOUT_MS = 5_000;
export const FFMPEG_CAMERA_SIGINT_TIMEOUT_MS = 5_000;
export const FFMPEG_CAMERA_SIGTERM_TIMEOUT_MS = 3_000;

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
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
  onFirstFrame = null,
}) {
  const args = buildFfmpegCaptureArgs({
    outputPath,
    fps,
    display,
    width,
    height,
    micSource,
    micGainPercent,
    systemAudioSource,
    systemAudioGainPercent,
  });

  console.info('[ffmpeg-capture] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  const stderrState = createStderrDropWatcher('[ffmpeg-capture]');
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    logProcessOutput('[ffmpeg-capture:stderr]', text);
    stderrState.observe(text);
  });

  proc.stdout?.on('data', (chunk) => {
    logProcessOutput('[ffmpeg-capture:stdout]', chunk.toString());
  });

  // Wall-clock anchor for cursor sync. Primary source: ffmpeg's stderr
  // banner, where the x11grab input's `start:` is the exact wall-clock of
  // the first captured frame (see createInputBannerAnchorParser). Fallback: the
  // `-progress pipe:1` upper-bound detector, which is loose by the encoder
  // pipeline depth. Fires at most once, banner preferred.
  if (typeof onFirstFrame === 'function') {
    const fireFirstFrame = makeFirstFrameEmitter(onFirstFrame, '[ffmpeg-capture]');
    const banner = createInputBannerAnchorParser({
      onStart: (ms, meta) => fireFirstFrame(ms, { source: 'banner', ...meta }),
    });
    proc.stderr?.on('data', (chunk) => banner.observe(chunk.toString()));
    const detector = createFirstFrameDetector({
      onFirstFrame: (ms) => {
        if (!banner.anchored) fireFirstFrame(ms, { source: 'progress' });
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
    getPid() { return proc.pid ?? null; },
    kill(signal = 'SIGTERM') {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill(signal); } catch { /* already gone */ }
      }
    },

    /**
     * Stop the FFmpeg process cleanly by sending 'q' to stdin.
     * Falls back to SIGINT if stdin write fails.
     * Returns the output file path.
     * @returns {Promise<string>}
     */
    stop() {
      return stopFfmpegProcess(proc, outputPath, '[ffmpeg-capture]', 'MP4 finalization');
    },
    cancel() {
      return cancelFfmpegProcess(proc, outputPath, '[ffmpeg-capture]');
    },
  };
}

export function startFfmpegCameraCapture({
  outputPath,
  fps,
  devicePath,
  width = 1280,
  height = 720,
}) {
  const args = buildFfmpegCameraCaptureArgs({ outputPath, fps, devicePath, width, height });
  console.info('[ffmpeg-camera] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let exitInfo = null;
  proc.stdout?.on('data', (chunk) => logProcessOutput('[ffmpeg-camera:stdout]', chunk.toString()));
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    logProcessOutput('[ffmpeg-camera:stderr]', text);
  });
  proc.on('error', (err) => console.error('[ffmpeg-camera] Process error:', err.message));
  const exitPromise = new Promise((resolve) => {
    proc.on('exit', (code, signal) => {
      exitInfo = { code, signal, stderr };
      if (code !== 0 && signal !== 'SIGINT') {
        console.warn('[ffmpeg-camera] Exited with code', code, 'signal', signal);
        if (stderr) console.warn('[ffmpeg-camera] stderr tail:', stderr.slice(-500));
      } else {
        console.info('[ffmpeg-camera] Stopped cleanly.');
      }
      resolve(exitInfo);
    });
  });

  return {
    outputPath,
    getPid() { return proc.pid ?? null; },
    getExitInfo() { return exitInfo; },
    whenExited() { return exitPromise; },
    kill(signal = 'SIGTERM') {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill(signal); } catch { /* already gone */ }
      }
    },
    stop() {
      return stopFfmpegProcess(proc, outputPath, '[ffmpeg-camera]', 'camera finalization', {
        stopMs: FFMPEG_CAMERA_STOP_TIMEOUT_MS,
        sigintMs: FFMPEG_CAMERA_SIGINT_TIMEOUT_MS,
        sigtermMs: FFMPEG_CAMERA_SIGTERM_TIMEOUT_MS,
      });
    },
    cancel() {
      return cancelFfmpegProcess(proc, outputPath, '[ffmpeg-camera]');
    },
  };
}

export function startFfmpegCameraPreview({
  devicePath,
  fps = 15,
  width = 1280,
  height = 720,
  previewWidth = 320,
  onFrame = null,
}) {
  const args = buildFfmpegCameraPreviewArgs({ devicePath, fps, width, height, previewWidth });
  console.info('[ffmpeg-camera-preview] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  const parser = createMjpegFrameParser((frame) => {
    if (typeof onFrame === 'function') onFrame(frame);
  });
  proc.stdout?.on('data', (chunk) => parser.observe(chunk));
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    logProcessOutput('[ffmpeg-camera-preview:stderr]', text);
  });
  proc.on('error', (err) => console.error('[ffmpeg-camera-preview] Process error:', err.message));

  const exitPromise = new Promise((resolve) => {
    proc.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
        console.warn('[ffmpeg-camera-preview] Exited with code', code, 'signal', signal);
        if (stderr) console.warn('[ffmpeg-camera-preview] stderr tail:', stderr.slice(-500));
      } else {
        console.info('[ffmpeg-camera-preview] Stopped cleanly.');
      }
      resolve({ code, signal, stderr });
    });
  });

  return {
    getPid() { return proc.pid ?? null; },
    whenExited() { return exitPromise; },
    stop() {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill('SIGTERM'); } catch { /* already gone */ }
      }
      return exitPromise;
    },
  };
}

export function startFfmpegUnifiedCapture({
  outputPath,
  fps,
  display,
  width,
  height,
  cameraDevicePath,
  cameraWidth = 1280,
  cameraHeight = 720,
  micSource = null,
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
  onFirstFrame = null,
}) {
  const args = buildFfmpegUnifiedCaptureArgs({
    outputPath,
    fps,
    display,
    width,
    height,
    cameraDevicePath,
    cameraWidth,
    cameraHeight,
    micSource,
    micGainPercent,
    systemAudioSource,
    systemAudioGainPercent,
  });
  console.info('[ffmpeg-unified] Starting:', 'ffmpeg', args.join(' '));

  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let exitInfo = null;
  const stderrState = createStderrDropWatcher('[ffmpeg-unified]');

  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    logProcessOutput('[ffmpeg-unified:stderr]', text);
    stderrState.observe(text);
  });
  proc.stdout?.on('data', (chunk) => logProcessOutput('[ffmpeg-unified:stdout]', chunk.toString()));

  if (typeof onFirstFrame === 'function') {
    const fireFirstFrame = makeFirstFrameEmitter(onFirstFrame, '[ffmpeg-unified]');
    const banner = createInputBannerAnchorParser({
      onStart: (ms, meta) => fireFirstFrame(ms, { source: 'banner', ...meta }),
    });
    proc.stderr?.on('data', (chunk) => banner.observe(chunk.toString()));
    const detector = createFirstFrameDetector({
      onFirstFrame: (ms) => {
        if (!banner.anchored) fireFirstFrame(ms, { source: 'progress' });
      },
    });
    proc.stdout?.on('data', (chunk) => detector.observe(chunk.toString(), Date.now()));
  }

  proc.on('error', (err) => console.error('[ffmpeg-unified] Process error:', err.message));
  const exitPromise = new Promise((resolve) => {
    proc.on('exit', (code, signal) => {
      exitInfo = { code, signal, stderr };
      if (code !== 0 && signal !== 'SIGINT') {
        console.warn('[ffmpeg-unified] Exited with code', code, 'signal', signal);
        if (stderr) console.warn('[ffmpeg-unified] stderr tail:', stderr.slice(-500));
      } else {
        console.info('[ffmpeg-unified] Stopped cleanly.');
      }
      resolve(exitInfo);
    });
  });

  return {
    outputPath,
    getPid() { return proc.pid ?? null; },
    getExitInfo() { return exitInfo; },
    whenExited() { return exitPromise; },
    kill(signal = 'SIGTERM') {
      if (proc.exitCode === null && proc.signalCode === null) {
        try { proc.kill(signal); } catch { /* already gone */ }
      }
    },
    stop() {
      return stopFfmpegProcess(proc, outputPath, '[ffmpeg-unified]', 'MKV finalization');
    },
    cancel() {
      return cancelFfmpegProcess(proc, outputPath, '[ffmpeg-unified]');
    },
  };
}

function cancelFfmpegProcess(proc, outputPath, tag) {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve(outputPath);
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimeout);
      clearTimeout(resolveTimeout);
      resolve(outputPath);
    };
    const killTimeout = setTimeout(() => {
      if (!settled) proc.kill('SIGKILL');
    }, FFMPEG_SIGTERM_TIMEOUT_MS);
    const resolveTimeout = setTimeout(() => {
      console.warn(`${tag} Cancel did not emit exit after SIGTERM/SIGKILL window; continuing cleanup.`);
      settle();
    }, FFMPEG_SIGTERM_TIMEOUT_MS + 1000);

    proc.on('exit', settle);
    proc.on('close', settle);

    try {
      proc.stdin?.destroy();
    } catch {
      // Best-effort shutdown for cancellation; output will be deleted anyway.
    }
    console.info(`${tag} Cancelling capture.`);
    proc.kill('SIGTERM');
  });
}

export function buildFfmpegCameraCaptureArgs({
  outputPath,
  fps,
  devicePath,
  width = 1280,
  height = 720,
}) {
  if (typeof devicePath !== 'string' || devicePath.trim().length === 0) {
    throw new Error('Camera device path is required.');
  }
  const frameRate = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30;
  const captureWidth = Math.max(2, Math.round(width));
  const captureHeight = Math.max(2, Math.round(height));
  const keyframeInterval = Math.max(30, frameRate);
  return [
    '-y',
    '-progress',
    'pipe:1',
    '-stats_period',
    '0.05',
    // v4l2 reliability flags. Combined with the post-SIGKILL grace timer
    // in stopFfmpegProcess for defense against the camera ffmpeg wedging
    // in an uninterruptible v4l2 read on shutdown.
    // - use_wallclock_as_timestamps 1 sidesteps non-monotonic UVC PTS
    //   that contributes to internal queue stalls.
    // - thread_queue_size 1024 (was 512) lets the v4l2 producer thread
    //   drain its queue cleanly during shutdown.
    // - fflags nobuffer reduces internal queueing pressure.
    // (rw_timeout was tried but ffmpeg 6.1's v4l2 demuxer rejects it with
    //  "Option rw_timeout not found"; it's a libavformat option for
    //  network protocols, not v4l2.)
    '-use_wallclock_as_timestamps',
    '1',
    '-fflags',
    'nobuffer',
    '-thread_queue_size',
    '1024',
    '-f',
    'v4l2',
    // Force MJPEG input. UVC webcams typically only deliver high-resolution
    // frames at the requested framerate when negotiating MJPEG; YUYV
    // (uncompressed) caps at very low fps for 1280x720 (10 fps on the
    // Lenovo FHD UVC tested 2026-05-10). Without this ffmpeg negotiates
    // YUYV by default and the recorded camera stream is 10 fps regardless
    // of -framerate, making playback look "stuttery". Verified via
    // `v4l2-ctl --list-formats-ext` and a direct ffmpeg run.
    '-input_format',
    'mjpeg',
    '-framerate',
    String(frameRate),
    '-video_size',
    `${captureWidth}x${captureHeight}`,
    '-i',
    devicePath,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'superfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-g',
    String(keyframeInterval),
    '-keyint_min',
    String(keyframeInterval),
    '-x264-params',
    'scenecut=0:sliced-threads=0',
    outputPath,
  ];
}

export function buildFfmpegCameraPreviewArgs({
  devicePath,
  fps = 15,
  width = 1280,
  height = 720,
  previewWidth = 320,
}) {
  if (typeof devicePath !== 'string' || devicePath.trim().length === 0) {
    throw new Error('Camera device path is required for preview.');
  }
  const frameRate = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 15;
  const captureWidth = Math.max(2, Math.round(width));
  const captureHeight = Math.max(2, Math.round(height));
  const outputWidth = Math.max(2, Math.round(previewWidth));
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-thread_queue_size',
    '1024',
    '-f',
    'v4l2',
    '-input_format',
    'mjpeg',
    '-framerate',
    String(frameRate),
    '-video_size',
    `${captureWidth}x${captureHeight}`,
    '-i',
    devicePath,
    '-an',
    '-vf',
    `fps=${frameRate},scale=${outputWidth}:-1`,
    '-q:v',
    '6',
    '-f',
    'mjpeg',
    'pipe:1',
  ];
}

export function createMjpegFrameParser(onFrame) {
  let buffer = Buffer.alloc(0);
  return {
    observe(chunk) {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      while (buffer.length >= 4) {
        const start = findMarker(buffer, 0xff, 0xd8, 0);
        if (start < 0) {
          buffer = Buffer.alloc(0);
          return;
        }
        const end = findMarker(buffer, 0xff, 0xd9, start + 2);
        if (end < 0) {
          if (start > 0) buffer = buffer.subarray(start);
          return;
        }
        const frame = buffer.subarray(start, end + 2);
        buffer = buffer.subarray(end + 2);
        onFrame(Buffer.from(frame));
      }
    },
  };
}

function findMarker(buffer, first, second, fromIndex) {
  for (let index = Math.max(0, fromIndex); index < buffer.length - 1; index += 1) {
    if (buffer[index] === first && buffer[index + 1] === second) return index;
  }
  return -1;
}

// Grace period after SIGKILL before we give up waiting for proc.on('exit').
// On Linux, a process blocked in uninterruptible sleep (state D) — common
// with stuck v4l2 reads — won't deliver SIGKILL until the kernel-level call
// returns, which can be effectively never. If we keep awaiting proc.exit,
// the IPC stop handler hangs forever and the UI is frozen on "finalizing
// recording". This grace timer lets us resolve the promise and proceed; the
// zombie proc will die later or until the next app restart.
const FFMPEG_POSTKILL_GRACE_MS = 1_500;

function stopFfmpegProcess(proc, outputPath, tag, finalizationLabel, timeouts = null) {
  const stopMs = timeouts?.stopMs ?? FFMPEG_STOP_TIMEOUT_MS;
  const sigintMs = timeouts?.sigintMs ?? FFMPEG_SIGINT_TIMEOUT_MS;
  const sigtermMs = timeouts?.sigtermMs ?? FFMPEG_SIGTERM_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    let sigintTimeout = null;
    let sigtermTimeout = null;
    let postKillTimeout = null;
    let hardDeadline = null;
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(stdinTimeout);
      if (sigintTimeout) clearTimeout(sigintTimeout);
      if (sigtermTimeout) clearTimeout(sigtermTimeout);
      if (postKillTimeout) clearTimeout(postKillTimeout);
      if (hardDeadline) clearTimeout(hardDeadline);
      if (reason) console.warn(`${tag} ${reason}`);
      resolve(outputPath);
    };
    // The proc may have already exited before stopFfmpegProcess was called
    // (e.g. ffmpeg's -rw_timeout fired during capture, or v4l2 producer
    // crashed). In that case proc.on('exit') already fired and registering
    // a new listener catches nothing — the promise would hang forever. Bail
    // out immediately on any prior-exit signal.
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve(outputPath);
      return;
    }
    const stdinTimeout = setTimeout(() => {
      console.warn(`${tag} Timeout after q — sending SIGINT for ${finalizationLabel}.`);
      proc.kill('SIGINT');
      sigintTimeout = setTimeout(() => {
        console.warn(`${tag} Timeout after SIGINT — sending SIGTERM.`);
        proc.kill('SIGTERM');
        sigtermTimeout = setTimeout(() => {
          console.warn(`${tag} Timeout after SIGTERM — forcing SIGKILL; output may be corrupt.`);
          proc.kill('SIGKILL');
          postKillTimeout = setTimeout(() => {
            // Resolve regardless: if proc actually exited, exit/close handlers
            // already finished us; if it's truly stuck in D-state, the zombie
            // will die when the kernel call returns and we don't care.
            finish('Process did not exit after SIGKILL — likely uninterruptible sleep (e.g. stuck v4l2 read). Giving up wait; output is unusable.');
          }, FFMPEG_POSTKILL_GRACE_MS);
        }, sigtermMs);
      }, sigintMs);
    }, stopMs);

    // Belt-and-suspenders: even if every cascade step somehow fails to fire,
    // never let stop() block the recording-stop pipeline beyond this ceiling.
    // Stop + sigint + sigterm + sigkill grace plus a 1s safety margin.
    hardDeadline = setTimeout(() => {
      finish('Hard deadline reached — proceeding without confirmed exit.');
    }, stopMs + sigintMs + sigtermMs + FFMPEG_POSTKILL_GRACE_MS + 1_000);

    proc.on('exit', () => finish());
    proc.on('close', () => finish());

    try {
      proc.stdin?.write('q\n');
      proc.stdin?.end();
    } catch {
      proc.kill('SIGINT');
    }
  });
}

function logProcessOutput(prefix, text) {
  for (const line of text.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    if (trimmed) console.info(prefix, trimmed);
  }
}

export function buildFfmpegCaptureArgs({
  outputPath,
  fps,
  display,
  width,
  height,
  micSource = null,
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
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

  appendAudioFilterAndMaps(args, {
    hasSysAudio,
    hasMic,
    systemAudioIndex: hasSysAudio ? 1 : null,
    micIndex: hasMic ? (hasSysAudio ? 2 : 1) : null,
    systemAudioGainPercent,
    micGainPercent,
    videoMaps: ['0:v'],
  });
  // No audio → no -map needed (single input, auto-mapped)

  // --- Codecs ---
  // BUG-269 (2026-04-28): switched from libvpx (VP8) to libx264 (H.264).
  // The caller records to MKV, then remuxes to MP4 after a clean stop.
  // Keep this CRF-only for screen capture. VBV/CBR constraints caused visible
  // quality dips on wide desktop recordings during high-motion bursts.
  // Avoid zerolatency/sliced threads: that is useful for live streaming, but it
  // has caused Chromium/Electron playback artifacts on otherwise valid files.
  const keyframeInterval = Math.max(30, Math.round(fps));
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'superfast',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-g',
    String(keyframeInterval),
    '-keyint_min',
    String(keyframeInterval),
    '-x264-params',
    'scenecut=0:sliced-threads=0',
    '-threads',
    '0',
  );

  if (audioInputCount > 0) {
    // AAC for mp4 container compatibility. 192k stereo is transparent for
    // mic + system mix.
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  }

  args.push(outputPath);
  return args;
}

export function buildFfmpegUnifiedCaptureArgs({
  outputPath,
  fps,
  display,
  width,
  height,
  cameraDevicePath,
  cameraWidth = 1280,
  cameraHeight = 720,
  micSource = null,
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
}) {
  if (typeof cameraDevicePath !== 'string' || cameraDevicePath.trim().length === 0) {
    throw new Error('Camera device path is required for unified capture.');
  }
  const frameRate = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30;
  const hasMic = typeof micSource === 'string' && micSource.length > 0;
  const hasSysAudio = typeof systemAudioSource === 'string' && systemAudioSource.length > 0;
  const audioInputCount = (hasMic ? 1 : 0) + (hasSysAudio ? 1 : 0);
  const screenKeyframeInterval = Math.max(30, frameRate);
  const cameraKeyframeInterval = Math.max(30, frameRate);
  const captureCameraWidth = Math.max(2, Math.round(cameraWidth));
  const captureCameraHeight = Math.max(2, Math.round(cameraHeight));
  const args = [
    '-y',
    '-progress',
    'pipe:1',
    '-stats_period',
    '0.05',
    '-thread_queue_size',
    '1024',
    '-f',
    'x11grab',
    '-draw_mouse',
    '0',
    '-framerate',
    String(frameRate),
    '-video_size',
    `${width}x${height}`,
    '-i',
    display,
    '-use_wallclock_as_timestamps',
    '1',
    '-fflags',
    'nobuffer',
    '-thread_queue_size',
    '1024',
    '-f',
    'v4l2',
    '-input_format',
    'mjpeg',
    '-framerate',
    String(frameRate),
    '-video_size',
    `${captureCameraWidth}x${captureCameraHeight}`,
    '-i',
    cameraDevicePath,
  ];

  let nextInputIndex = 2;
  const systemAudioIndex = hasSysAudio ? nextInputIndex++ : null;
  const micIndex = hasMic ? nextInputIndex++ : null;

  if (hasSysAudio) {
    args.push(
      '-thread_queue_size',
      '1024',
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
      '1024',
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

  appendAudioFilterAndMaps(args, {
    hasSysAudio,
    hasMic,
    systemAudioIndex,
    micIndex,
    systemAudioGainPercent,
    micGainPercent,
    videoMaps: ['0:v', '1:v'],
  });

  args.push(
    '-c:v:0',
    'libx264',
    '-preset:v:0',
    'superfast',
    '-crf:v:0',
    '16',
    '-pix_fmt:v:0',
    'yuv420p',
    '-g:v:0',
    String(screenKeyframeInterval),
    '-keyint_min:v:0',
    String(screenKeyframeInterval),
    '-c:v:1',
    'libx264',
    '-preset:v:1',
    'superfast',
    '-crf:v:1',
    '18',
    '-pix_fmt:v:1',
    'yuv420p',
    '-g:v:1',
    String(cameraKeyframeInterval),
    '-keyint_min:v:1',
    String(cameraKeyframeInterval),
    '-x264-params',
    'scenecut=0:sliced-threads=0',
    '-threads',
    '0',
  );

  if (audioInputCount > 0) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  }

  args.push('-f', 'matroska', outputPath);
  return args;
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
/**
 * Wrap an onFirstFrame callback so it fires at most once across multiple
 * anchor sources (stderr banner + progress detector) and never throws into
 * the stream handlers.
 */
function makeFirstFrameEmitter(onFirstFrame, logPrefix) {
  let fired = false;
  return (ms, meta) => {
    if (fired) return;
    fired = true;
    try {
      onFirstFrame(ms, meta);
    } catch (err) {
      console.warn(`${logPrefix} onFirstFrame callback threw:`, err?.message ?? err);
    }
  };
}

/**
 * Parse ffmpeg's stderr input banners for the recording's first-frame
 * wall-clock:
 *
 *     Input #0, x11grab, from ':0+0,0':
 *       Duration: N/A, start: 1784052450.873226, bitrate: ...
 *
 * x11grab, and v4l2/pulse under `-use_wallclock_as_timestamps 1`, stamp
 * packets with av_gettime() (epoch microseconds), so each input's `start:`
 * is the exact wall-clock of its first captured packet. The anchor fired is
 * the LATEST epoch-plausible input start (the camera in unified capture).
 * NOTE: the muxed file's t=0 is the first *retained* packet, which is NOT
 * reliably the latest input's start — whether ffmpeg keeps any pre-camera
 * screen frames is a race (2026-07-14: none kept, file started at the
 * camera's start; 2026-07-19: one kept, file started 300 ms earlier at the
 * x11grab start and cursor telemetry ran ~9 frames ahead). The recording
 * session therefore corrects the anchor after stop by subtracting the
 * camera stream's start offset measured from the finished file
 * (probeVideoStreamStartOffsets), which pins file t=0 exactly no matter
 * which way the race went. onStart receives { epochStartCount } so the
 * session only applies that correction when the camera's epoch start was
 * actually seen (count >= 2).
 *
 * This is the preferred cursor-sync anchor: the `-progress`-based detector's
 * estimate is an upper bound loose by the whole encoder pipeline depth
 * (~1.5 s for libx264 superfast with lookahead), vs ~1 frame of error for
 * the banner value — both measured with a color-flip ground-truth harness.
 *
 * Waits for the `Output #`/`Stream mapping:` line (which follows all input
 * banners) before firing so no input is missed. Fires `onStart(epochMs)` at
 * most once; if no input has an epoch-plausible start, fires nothing and
 * leaves `anchored` false so the detector fallback stays live.
 */
export function createInputBannerAnchorParser({ onStart, maxBufferChars = 65536 }) {
  let buffer = '';
  let done = false;
  let anchored = false;
  return {
    observe(chunk) {
      if (done) return;
      buffer = (buffer + chunk).slice(-maxBufferChars);
      if (!/\n(?:Output #|Stream mapping:)/.test(buffer)) return;
      done = true;
      // The trailing comma is part of the match so a chunk split mid-number
      // can't yield a truncated value ("start: 178405245" + "0.873226," across
      // two chunks) — and by this point the full banner block is buffered.
      const re = /Input #\d+, [^\n]*\n[\s\S]{0,500}?start:\s*(\d+(?:\.\d+)?)\s*,/g;
      let best = null;
      let epochStartCount = 0;
      let match;
      while ((match = re.exec(buffer)) !== null) {
        const seconds = Number(match[1]);
        // Epoch-plausible only (> 2001-09-09): inputs without wallclock
        // timestamps report ~0 or monotonic-clock values and can't anchor.
        if (seconds > 1e9) {
          epochStartCount += 1;
          if (best === null || seconds > best) best = seconds;
        }
      }
      if (best === null) return;
      anchored = true;
      onStart(best * 1000, { epochStartCount });
    },
    get anchored() {
      return anchored;
    },
  };
}

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
 * @param {{ outputPath: string, micSource?: string | null, micGainPercent?: number, systemAudioSource?: string | null, systemAudioGainPercent?: number }} options
 * @returns {FfmpegCaptureHandle | null}
 */
export function startFfmpegAudioCapture({
  outputPath,
  micSource = null,
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
}) {
  const args = buildFfmpegAudioCaptureArgs({
    outputPath,
    micSource,
    micGainPercent,
    systemAudioSource,
    systemAudioGainPercent,
  });
  if (!args) return null;

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
        }, FFMPEG_STOP_TIMEOUT_MS);

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

export function buildFfmpegAudioCaptureArgs({
  outputPath,
  micSource = null,
  micGainPercent = 100,
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

  appendAudioFilterAndMaps(args, {
    hasSysAudio,
    hasMic,
    systemAudioIndex: hasSysAudio ? 0 : null,
    micIndex: hasMic ? (hasSysAudio ? 1 : 0) : null,
    systemAudioGainPercent,
    micGainPercent,
    videoMaps: [],
  });

  args.push('-c:a', 'libopus', '-b:a', '128k', outputPath);
  return args;
}

export function buildFfmpegAudioLevelProbeArgs({
  micSource = null,
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
}) {
  const hasMic = typeof micSource === 'string' && micSource.length > 0;
  const hasSysAudio = typeof systemAudioSource === 'string' && systemAudioSource.length > 0;
  if (!hasMic && !hasSysAudio) return null;

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

  const filters = [];
  const sysRef = hasSysAudio
    ? audioRef({ inputIndex: 0, name: 'levelsysa', gainPercent: systemAudioGainPercent, filters })
    : null;
  const micRef = hasMic
    ? audioRef({ inputIndex: hasSysAudio ? 1 : 0, name: 'levelmica', gainPercent: micGainPercent, filters })
    : null;
  let levelInput;
  if (hasSysAudio && hasMic) {
    filters.push(`${sysRef.filterPad}${micRef.filterPad}amix=inputs=2[audiolevelmix]`);
    levelInput = '[audiolevelmix]';
  } else {
    levelInput = hasSysAudio ? sysRef.filterPad : micRef.filterPad;
  }
  filters.push(`${levelInput}astats=metadata=1:reset=0.15,ametadata=print:key=lavfi.astats.Overall.RMS_level[audiolevel]`);
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[audiolevel]',
    '-f',
    'null',
    '-',
  );
  return args;
}

export function audioRmsDbToLevel(rmsDb) {
  const value = Number(rmsDb);
  if (!Number.isFinite(value)) return 0;
  if (value <= -60) return 0;
  if (value >= 0) return 1;
  return Math.max(0, Math.min(1, (value + 60) / 60));
}

export function createAudioLevelParser(onLevel) {
  let buffer = '';
  let lastEmitMs = 0;
  return {
    observe(chunk) {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const match = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?inf|-?\d+(?:\.\d+)?)/iu);
        if (!match) continue;
        const rmsDb = match[1].toLowerCase() === '-inf' ? -Infinity : Number(match[1]);
        const now = Date.now();
        if (now - lastEmitMs < 33) continue;
        lastEmitMs = now;
        onLevel({
          rmsDb: Number.isFinite(rmsDb) ? rmsDb : null,
          level: audioRmsDbToLevel(rmsDb),
          at: now,
        });
      }
    },
  };
}

export function startFfmpegAudioLevelProbe({
  micSource = null,
  micGainPercent = 100,
  systemAudioSource = null,
  systemAudioGainPercent = 100,
  onLevel,
}) {
  const args = buildFfmpegAudioLevelProbeArgs({
    micSource,
    micGainPercent,
    systemAudioSource,
    systemAudioGainPercent,
  });
  if (!args) return null;

  console.info('[ffmpeg-audio-level] Starting:', 'ffmpeg', args.join(' '));
  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  const parser = createAudioLevelParser(onLevel);
  const stderrState = createStderrDropWatcher('[ffmpeg-audio-level]');
  proc.stdout?.on('data', (chunk) => parser.observe(chunk.toString()));
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    stderrState.observe(text);
    parser.observe(text);
  });

  proc.on('error', (err) => {
    console.error('[ffmpeg-audio-level] Process error:', err.message);
  });

  proc.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGINT' && signal !== 'SIGTERM') {
      console.warn('[ffmpeg-audio-level] Exited with code', code, 'signal', signal);
      if (stderr) console.warn('[ffmpeg-audio-level] stderr tail:', stderr.slice(-500));
    } else {
      console.info('[ffmpeg-audio-level] Stopped cleanly.');
    }
  });

  return {
    getPid() { return proc.pid ?? null; },
    stop() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[ffmpeg-audio-level] Timeout waiting for exit — killing.');
          proc.kill('SIGKILL');
          resolve();
        }, 1500);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
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

function appendAudioFilterAndMaps(args, {
  hasSysAudio,
  hasMic,
  systemAudioIndex,
  micIndex,
  systemAudioGainPercent = 100,
  micGainPercent = 100,
  videoMaps = [],
}) {
  const maps = [...videoMaps];
  if (!hasSysAudio && !hasMic) {
    for (const map of maps) args.push('-map', map);
    return;
  }

  const filters = [];
  const sysRef = hasSysAudio
    ? audioRef({ inputIndex: systemAudioIndex, name: 'sysa', gainPercent: systemAudioGainPercent, filters })
    : null;
  const micRef = hasMic
    ? audioRef({ inputIndex: micIndex, name: 'mica', gainPercent: micGainPercent, filters })
    : null;

  if (hasSysAudio && hasMic) {
    filters.push(`${sysRef.filterPad}${micRef.filterPad}amix=inputs=2[a]`);
    maps.push('[a]');
  } else if (hasSysAudio) {
    maps.push(sysRef.mapPad);
  } else {
    maps.push(micRef.mapPad);
  }

  if (filters.length > 0) args.push('-filter_complex', filters.join(';'));
  for (const map of maps) args.push('-map', map);
}

function audioRef({ inputIndex, name, gainPercent, filters }) {
  const gain = normalizeAudioGain(gainPercent);
  const filterInput = `[${inputIndex}:a]`;
  const directMap = `${inputIndex}:a`;
  if (Math.abs(gain - 1) <= 0.001) return { filterPad: filterInput, mapPad: directMap };
  const output = `[${name}]`;
  filters.push(`${filterInput}volume=${gain.toFixed(2)}${output}`);
  return { filterPad: output, mapPad: output };
}

function normalizeAudioGain(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(2, number / 100));
}
