import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isFfmpegCaptureAvailable, startFfmpegCameraCapture, startFfmpegCapture, startFfmpegUnifiedCapture } from './ffmpeg-capture.mjs';
import { createXinputButtonListener } from './xinput-button-listener.mjs';
import { probeVideoStreamStartOffsets } from '../media-probe.mjs';
import { createEventLogger, NULL_EVENT_LOGGER } from './event-logger.mjs';

const DEFAULT_FPS = 30;

// xdotool synchronous polling for cursor position. xinput motion events were
// briefly tried as a replacement (commit 4ef0aa3) to avoid xdotool's per-poll
// X11 connection setup that races with x11grab during compositor activity,
// but xinput's events have inherent X-server-pipeline latency (kernel → X
// server → xinput → pipe → Node) and are timestamped on receipt — so cursor
// data trailed the actual cursor by 50-150 ms. Reverted to xdotool polling
// here. The tear-race tradeoff is accepted (NVIDIA Allow Flipping setting
// helps; KDE compositor settings + future Wayland migration are the proper
// long-term fixes).
const DEFAULT_SAMPLE_INTERVAL_MS = 33;
const DEFAULT_CAMERA_WARMUP_MS = Number(process.env.ROUGH_CUT_CAMERA_WARMUP_MS ?? 1000);

// Diagnostic logging is on by default while we hunt the recording-tear race
// condition. Turn off by setting ROUGH_CUT_DEBUG_RECORDING=0.
const DIAGNOSTIC_LOGGING_DEFAULT =
  process.env.ROUGH_CUT_DEBUG_RECORDING !== '0';

export function createRecordingSession({
  recordingsDir,
  markerPath,
  getDisplayInfo,
  getCursorPoint = null,
  captureFactory = startFfmpegCapture,
  cameraCaptureFactory = startFfmpegCameraCapture,
  unifiedCaptureFactory = cameraCaptureFactory === startFfmpegCameraCapture ? startFfmpegUnifiedCapture : null,
  isCaptureAvailable = isFfmpegCaptureAvailable,
  now = () => new Date(),
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  cameraWarmupMs = DEFAULT_CAMERA_WARMUP_MS,
  buttonListenerFactory = createXinputButtonListener,
  eventLoggerFactory = createEventLogger,
  enableDiagnosticLogging = DIAGNOSTIC_LOGGING_DEFAULT,
  videoStreamStartProbe = probeVideoStreamStartOffsets,
}) {
  let active = null;
  let stopping = null;
  let canceling = null;
  let pausing = null;
  let resuming = null;
  let restarting = null;

  async function writeRecoveryMarker(session) {
    await writeFile(
      markerPath,
      JSON.stringify(
        {
          version: 1,
          startedAt: session.startedAt,
          rawPath: session.rawPath,
          outputPath: session.outputPath,
          display: session.display,
          width: session.width,
          height: session.height,
          captureRegion: session.captureRegion,
          fps: session.fps,
          cursorTelemetryPath: session.cursorTelemetryPath,
          micSource: session.micSource,
          micGainPercent: session.micGainPercent,
          systemAudioSource: session.systemAudioSource,
          systemAudioGainPercent: session.systemAudioGainPercent,
          cameraRawPath: session.cameraRawPath,
          cameraOutputPath: session.cameraOutputPath,
          cameraDevicePath: session.cameraDevicePath,
        },
        null,
        2,
      ),
    );
  }

  async function clearRecoveryMarker() {
    await rm(markerPath, { force: true });
  }

  function status() {
    if (!active) return { state: 'idle' };
    const recordedDurationMs = getRecordedDurationMs(active, now);
    return {
      state: 'recording',
      startedAt: active.startedAt,
      rawPath: active.rawPath,
      outputPath: active.outputPath,
      paused: Boolean(active.paused),
      recordedDurationMs,
      segmentCount: Math.max(1, active.segmentIndex ?? 1),
      pauseStartedAt: active.pauseStartedAt ?? null,
      micSource: active.micSource,
      micGainPercent: active.micGainPercent,
      systemAudioSource: active.systemAudioSource,
      systemAudioGainPercent: active.systemAudioGainPercent,
      cameraDevicePath: active.cameraDevicePath,
      cameraError: active.cameraError ?? null,
    };
  }

  async function start(options = {}) {
    if (active) throw new Error('A recording is already active.');
    if (!isCaptureAvailable()) throw new Error('FFmpeg x11grab capture is not available on this session.');
    const micSource = normalizeAudioSource(options.micSource);
    const micGainPercent = normalizeAudioGainPercent(options.micGainPercent);
    const systemAudioSource = normalizeAudioSource(options.systemAudioSource);
    const systemAudioGainPercent = normalizeAudioGainPercent(options.systemAudioGainPercent);
    const cameraDevicePath = normalizeCameraDevicePath(options.cameraDevicePath);

    await mkdir(recordingsDir, { recursive: true });

    const displayInfo = resolveCaptureDisplayInfo(getDisplayInfo(), options.captureRegion);
    const stampDate = now();
    const stamp = stampDate.toISOString().replace(/[:.]/g, '-');
    const rawPath = join(recordingsDir, `rough-cut-${stamp}.mkv`);
    const outputPath = join(recordingsDir, `rough-cut-${stamp}.mp4`);
    const cameraRawPath = cameraDevicePath ? join(recordingsDir, `rough-cut-${stamp}-camera.mkv`) : null;
    const cameraOutputPath = cameraDevicePath ? join(recordingsDir, `rough-cut-${stamp}-camera.mp4`) : null;
    const cursorTelemetryPath = join(recordingsDir, `rough-cut-${stamp}.cursor.json`);
    const eventsLogPath = join(recordingsDir, `rough-cut-${stamp}.events.log`);
    const eventLogger =
      enableDiagnosticLogging && typeof eventLoggerFactory === 'function'
        ? eventLoggerFactory({ path: eventsLogPath })
        : NULL_EVENT_LOGGER;
    eventLogger.start();
    const canUseUnifiedCapture = cameraDevicePath && typeof unifiedCaptureFactory === 'function';

    const startedAtDate = now();
    const session = {
      startedAt: startedAtDate.toISOString(),
      rawPath,
      outputPath,
      cameraRawPath: canUseUnifiedCapture ? rawPath : cameraRawPath,
      cameraOutputPath,
      cursorTelemetryPath,
      eventsLogPath,
      eventLogger,
      options: { micSource, micGainPercent, systemAudioSource, systemAudioGainPercent, cameraDevicePath, captureRegion: options.captureRegion ?? null },
      stamp,
      fps: DEFAULT_FPS,
      micSource,
      micGainPercent,
      systemAudioSource,
      systemAudioGainPercent,
      cameraDevicePath,
      cameraError: null,
      cameraPrerollMs: 0,
      cameraPrerollFrames: 0,
      segmentIndex: 1,
      segments: [],
      cameraSegments: [],
      recordedDurationMs: 0,
      currentSegmentStartedAtMs: null,
      pauseStartedAt: null,
      paused: false,
      cursorEvents: [],
      cursorAnchors: [],
      cursorTimer: null,
      buttonListener: null,
      latestCursorPoint: null,
      typingAnchor: null,
      // Track every spawned child so an external SIGTERM can reap them
      // synchronously from the process-level signal handler. Order: ffmpeg
      // (screen, then camera) and xinput button listener once telemetry
      // starts. Each entry is `{ name, getPid, kill }`.
      children: [],
      ...displayInfo,
    };

    eventLogger.event('recording-start', {
      startedAt: session.startedAt,
      fps: session.fps,
      width: session.width,
      height: session.height,
      display: session.display,
      captureRegion: session.captureRegion,
      sampleIntervalMs,
      micSource,
      micGainPercent,
      systemAudioSource,
      systemAudioGainPercent,
      cameraDevicePath,
      cameraError: session.cameraError,
    });

    await writeRecoveryMarker(session);

    active = session;
    await startActiveSegment(active, {
      captureFactory,
      cameraCaptureFactory,
      unifiedCaptureFactory,
      cameraWarmupMs,
      now,
      getCursorPoint,
      sampleIntervalMs,
      buttonListenerFactory,
    });
    return status();
  }

  function terminateChildren(signal = 'SIGTERM') {
    if (!active) return [];
    const reaped = [];
    for (const child of active.children ?? []) {
      const pid = typeof child.getPid === 'function' ? child.getPid() : null;
      let error = null;
      try {
        if (typeof child.kill === 'function') child.kill(signal);
      } catch (err) {
        error = err?.message ?? String(err);
      }
      reaped.push({ name: child.name, pid, signal, error });
    }
    return reaped;
  }

  async function stop() {
    if (canceling) return canceling;
    if (stopping) return stopping;
    if (pausing) await pausing;
    if (resuming) await resuming;
    if (restarting) return restarting;
    if (!active) return { state: 'idle' };

    const session = active;
    active = null;
    stopping = stopActiveSession(session, now).finally(() => {
      stopping = null;
    });
    return stopping;
  }

  async function cancel() {
    if (stopping) return stopping;
    if (canceling) return canceling;
    if (pausing) await pausing;
    if (resuming) await resuming;
    if (restarting) return restarting;
    if (!active) return { state: 'idle', canceled: false };

    const session = active;
    active = null;
    canceling = cancelActiveSession(session).finally(() => {
      canceling = null;
    });
    return canceling;
  }

  async function pause() {
    if (stopping) return stopping;
    if (canceling) return canceling;
    if (resuming) await resuming;
    if (pausing) return pausing;
    if (!active) return { state: 'idle' };
    if (active.paused) return status();

    const session = active;
    pausing = pauseActiveSession(session, now).finally(() => {
      pausing = null;
    });
    await pausing;
    return status();
  }

  async function resume() {
    if (stopping) return stopping;
    if (canceling) return canceling;
    if (pausing) await pausing;
    if (resuming) return resuming;
    if (!active) return { state: 'idle' };
    if (!active.paused) return status();

    const session = active;
    resuming = resumeActiveSession(session).finally(() => {
      resuming = null;
    });
    await resuming;
    return status();
  }

  async function restart(options = null) {
    if (stopping) return stopping;
    if (canceling) return canceling;
    if (restarting) return restarting;
    const nextOptions = options ?? active?.options ?? {};
    restarting = (async () => {
      if (active) {
        const session = active;
        active = null;
        await cancelActiveSession(session);
      }
      return start(nextOptions);
    })().finally(() => {
      restarting = null;
    });
    return restarting;
  }

  async function stopActiveSession(session, now) {
    session.stopped = true;
    stopTelemetry(session);
    if (session.eventLogger) session.eventLogger.event('recording-stop');
    if (!session.paused) {
      await stopCurrentSegment(session, 'stop', now, { videoStreamStartProbe });
    }
    const rawPath = session.segments.length > 1 ? session.rawPath : session.segments[0]?.rawPath ?? session.rawPath;
    let cameraRawPath = session.unifiedCapture ? rawPath : session.cameraSegments[0]?.rawPath ?? null;
    let cameraError = session.cameraError ?? null;
    const cameraRawSegments = session.cameraSegments.map((segment) => segment.rawPath).filter(Boolean);
    if (cameraRawSegments.length > 1) cameraRawPath = session.cameraRawPath;
    const isUnifiedCapture = Boolean(cameraRawPath && cameraRawPath === rawPath);

    // Cursor events stay RAW on the telemetry clock here and in the sidecar
    // (regression-guarded). The signed telemetry-vs-video gap per segment is
    // reported as `cursorAnchors`; alignment onto the video clock happens
    // exactly once at project ingestion (see shared/cursor-alignment.mjs for
    // the clock model — the gap's sign depends on the capture path). The
    // 2026-05-04 attempt to shift events in stop() clamped pre-ffmpeg events
    // to frame 0 AND assumed the wrong sign for unified capture; do not
    // re-anchor events here.

    await writeCursorTelemetrySidecar(session);
    await clearRecoveryMarker();
    if (session.eventLogger) session.eventLogger.stop();

    return {
      state: 'saved',
      startedAt: session.startedAt,
      stoppedAt: now().toISOString(),
      rawPath,
      outputPath: session.outputPath,
      rawSegments: session.segments.length > 1 ? session.segments.map((segment) => segment.rawPath) : null,
      cameraRawPath,
      cameraRawSegments: cameraRawSegments.length > 1 ? cameraRawSegments : null,
      cameraOutputPath: cameraRawPath && !cameraError ? session.cameraOutputPath : null,
      cameraDevicePath: session.cameraDevicePath,
      cameraError,
      camera: session.cameraOutputPath
        && cameraRawPath
        && !cameraError
        ? {
            rawPath: cameraRawPath,
            outputPath: session.cameraOutputPath,
            devicePath: session.cameraDevicePath,
            width: 1280,
            height: 720,
            fps: session.fps,
            sourceInFrames: isUnifiedCapture ? 0 : session.cameraPrerollFrames,
            prerollMs: isUnifiedCapture ? 0 : session.cameraPrerollMs,
            sourceStreamIndex: isUnifiedCapture ? 1 : 0,
          }
        : null,
      width: session.width,
      height: session.height,
      display: session.display,
      captureRegion: session.captureRegion,
      fps: session.fps,
      cursorTelemetryPath: session.cursorTelemetryPath,
      eventsLogPath: session.eventsLogPath,
      cursorEvents: session.cursorEvents,
      cursorAnchors: session.cursorAnchors,
      audio: buildAudioMetadata(session),
      capture: session.captureRegion,
    };
  }

  async function cancelActiveSession(session) {
    session.stopped = true;
    stopTelemetry(session);
    if (session.eventLogger) session.eventLogger.event('recording-cancel');
    await Promise.allSettled([
      cancelCapture(session.capture),
      session.cameraCapture ? cancelCapture(session.cameraCapture) : null,
    ]);
    await clearRecoveryMarker();
    if (session.eventLogger) session.eventLogger.stop();
    await deleteSessionArtifacts(session);
    return { state: 'idle', canceled: true };
  }

  async function pauseActiveSession(session, now) {
    if (session.paused) return;
    session.eventLogger?.event('recording-pause');
    await stopCurrentSegment(session, 'pause', now, { videoStreamStartProbe });
    session.paused = true;
    session.pauseStartedAt = now().toISOString();
  }

  async function resumeActiveSession(session) {
    if (!session.paused) return;
    session.segmentIndex += 1;
    session.paused = false;
    session.pauseStartedAt = null;
    session.eventLogger?.event('recording-resume', { segmentIndex: session.segmentIndex });
    await startActiveSegment(session, {
      captureFactory,
      cameraCaptureFactory,
      unifiedCaptureFactory,
      cameraWarmupMs,
      now,
      getCursorPoint,
      sampleIntervalMs,
      buttonListenerFactory,
    });
  }

  return { start, stop, cancel, pause, resume, restart, status, terminateChildren };
}

async function startActiveSegment(session, {
  captureFactory,
  cameraCaptureFactory,
  unifiedCaptureFactory,
  cameraWarmupMs,
  now,
  getCursorPoint,
  sampleIntervalMs,
  buttonListenerFactory,
}) {
  const paths = segmentPaths(session, session.segmentIndex);
  const canUseUnifiedCapture = session.cameraDevicePath && typeof unifiedCaptureFactory === 'function';
  let cameraCapture = null;
  let unifiedCapture = null;
  let capture = null;
  let cameraStartedAtDate = null;
  // The unified capture path awaits the ffmpeg spawn, so onFirstFrame can
  // fire BEFORE session.currentSegment exists — buffer the anchor locally
  // and attach it when the segment record is created below.
  let pendingFirstFrameMs = null;
  let pendingFirstFrameMeta = null;
  const noteFirstFrame = (firstFrameMs, meta = null) => {
    session.eventLogger?.event('first-frame-anchor', { firstFrameMs, segmentIndex: session.segmentIndex, ...(meta ?? {}) });
    if (!Number.isFinite(firstFrameMs)) return;
    if (pendingFirstFrameMs === null) {
      pendingFirstFrameMs = firstFrameMs;
      pendingFirstFrameMeta = meta;
    }
    if (session.currentSegment
      && session.currentSegment.index === session.segmentIndex
      && !Number.isFinite(session.currentSegment.firstFrameMs)) {
      session.currentSegment.firstFrameMs = pendingFirstFrameMs;
      session.currentSegment.firstFrameMeta = pendingFirstFrameMeta;
    }
  };

  if (session.cameraDevicePath && !canUseUnifiedCapture) {
    try {
      if (process.env.ROUGH_CUT_SMOKE_CAMERA_START_ERROR) {
        throw new Error(process.env.ROUGH_CUT_SMOKE_CAMERA_START_ERROR);
      }
      cameraStartedAtDate = now();
      cameraCapture = await spawnCameraCaptureWithRetry({
        factory: cameraCaptureFactory,
        outputPath: paths.cameraRawPath,
        devicePath: session.cameraDevicePath,
        maxAttempts: 6,
        earlyExitWindowMs: 1500,
        backoffMs: 500,
      });
      if (cameraCapture && cameraWarmupMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, cameraWarmupMs));
      }
    } catch (err) {
      cameraCapture = null;
      cameraStartedAtDate = null;
      session.cameraError = err instanceof Error ? err.message : String(err);
      console.warn(`[recording-session] camera capture disabled: ${session.cameraError}`);
      session.eventLogger?.event('camera-capture-disabled', { error: session.cameraError, cameraDevicePath: session.cameraDevicePath });
    }
  }

  if (canUseUnifiedCapture) {
    try {
      if (process.env.ROUGH_CUT_SMOKE_CAMERA_START_ERROR) {
        throw new Error(process.env.ROUGH_CUT_SMOKE_CAMERA_START_ERROR);
      }
      unifiedCapture = await spawnUnifiedCaptureWithRetry({
        factory: unifiedCaptureFactory,
        outputPath: paths.rawPath,
        fps: session.fps,
        display: session.display,
        width: session.width,
        height: session.height,
        cameraDevicePath: session.cameraDevicePath,
        micSource: session.micSource,
        micGainPercent: session.micGainPercent,
        systemAudioSource: session.systemAudioSource,
        systemAudioGainPercent: session.systemAudioGainPercent,
        onFirstFrame: noteFirstFrame,
        maxAttempts: 6,
        earlyExitWindowMs: 1500,
        backoffMs: 500,
      });
      capture = unifiedCapture;
    } catch (err) {
      unifiedCapture = null;
      session.cameraError = err instanceof Error ? err.message : String(err);
      console.warn(`[recording-session] unified camera capture disabled: ${session.cameraError}`);
      session.eventLogger?.event('camera-capture-disabled', { error: session.cameraError, cameraDevicePath: session.cameraDevicePath });
    }
  }

  if (!capture) {
    capture = captureFactory({
      outputPath: paths.rawPath,
      fps: session.fps,
      display: session.display,
      width: session.width,
      height: session.height,
      micSource: session.micSource,
      micGainPercent: session.micGainPercent,
      systemAudioSource: session.systemAudioSource,
      systemAudioGainPercent: session.systemAudioGainPercent,
      onFirstFrame: noteFirstFrame,
    });
  }

  const segmentStartedAtDate = now();
  const cameraPrerollMs = cameraStartedAtDate ? Math.max(0, segmentStartedAtDate.getTime() - cameraStartedAtDate.getTime()) : 0;
  if (session.segmentIndex === 1) {
    session.cameraPrerollMs = cameraCapture ? cameraPrerollMs : 0;
    session.cameraPrerollFrames = cameraCapture ? Math.max(0, Math.round((cameraPrerollMs / 1000) * DEFAULT_FPS)) : 0;
  }

  session.capture = capture;
  session.cameraCapture = cameraCapture;
  session.unifiedCapture = unifiedCapture;
  session.currentSegment = {
    index: session.segmentIndex,
    rawPath: paths.rawPath,
    cameraRawPath: unifiedCapture ? paths.rawPath : cameraCapture ? paths.cameraRawPath : null,
    startedAtMs: segmentStartedAtDate.getTime(),
    startedRecordedDurationMs: session.recordedDurationMs,
    firstFrameMs: pendingFirstFrameMs,
    firstFrameMeta: pendingFirstFrameMeta,
  };
  session.currentSegmentStartedAtMs = segmentStartedAtDate.getTime();
  registerChild(session, 'ffmpeg-screen', capture);
  if (cameraCapture) registerChild(session, 'ffmpeg-camera', cameraCapture);
  monitorCameraCaptureExit(session);
  startTelemetryAfterIpcReturn(session, { getCursorPoint, now, sampleIntervalMs, buttonListenerFactory });
}

async function stopCurrentSegment(session, reason, now, { videoStreamStartProbe = probeVideoStreamStartOffsets } = {}) {
  if (!session.currentSegment || !session.capture) return;
  stopTelemetry(session);
  const segment = session.currentSegment;
  const wasUnifiedCapture = Boolean(session.unifiedCapture);
  console.info(`[recording-session] phase=screen-capture-${reason}-begin`);
  const rawPath = await session.capture.stop();
  console.info(`[recording-session] phase=screen-capture-${reason}-done`);
  let cameraRawPath = session.unifiedCapture ? rawPath : null;
  if (session.cameraCapture) {
    try {
      console.info(`[recording-session] phase=camera-capture-${reason}-begin`);
      cameraRawPath = await session.cameraCapture.stop();
      console.info(`[recording-session] phase=camera-capture-${reason}-done`, { cameraRawPath });
    } catch (err) {
      session.cameraError = err instanceof Error ? err.message : String(err);
      console.warn(`[recording-session] phase=camera-capture-${reason}-failed; continuing screen-only: ${session.cameraError}`);
      session.eventLogger?.event('camera-capture-stop-failed', { error: session.cameraError, cameraDevicePath: session.cameraDevicePath, reason });
      cameraRawPath = null;
    }
  } else if (!session.unifiedCapture) {
    console.info(`[recording-session] phase=camera-capture-${reason}-skipped (no camera in session)`);
  }

  const stoppedAtMs = now().getTime();

  // Unified capture: the banner anchor is the CAMERA input's first-packet
  // wall-clock, but the muxed file's t=0 is the first *retained* packet.
  // Whether ffmpeg keeps any pre-camera screen frames is a race (2026-07-19:
  // one kept, so the file started 300 ms before the camera and cursor
  // telemetry ran ~9 frames ahead). The camera stream's start offset inside
  // the finished file measures exactly where the banner anchor sits on the
  // file timeline, so subtracting it pins the wall-clock of file t=0
  // regardless of which way the race went. Only valid when the banner saw
  // the camera's epoch start (epochStartCount >= 2).
  if (wasUnifiedCapture
    && Number.isFinite(segment.firstFrameMs)
    && segment.firstFrameMeta?.source === 'banner'
    && (segment.firstFrameMeta?.epochStartCount ?? 0) >= 2) {
    try {
      const streams = await videoStreamStartProbe(rawPath);
      const cameraStream = streams.length > 1 ? streams[streams.length - 1] : null;
      if (cameraStream && Number.isFinite(cameraStream.startTimeSeconds) && cameraStream.startTimeSeconds > 0) {
        const correctionMs = cameraStream.startTimeSeconds * 1000;
        segment.firstFrameMs -= correctionMs;
        session.eventLogger?.event('first-frame-anchor-correction', {
          correctionMs,
          firstFrameMs: segment.firstFrameMs,
          segmentIndex: segment.index,
        });
      }
    } catch (err) {
      console.warn('[recording-session] anchor correction probe failed; keeping banner anchor:', err?.message ?? err);
    }
  }

  const durationMs = Math.max(0, stoppedAtMs - segment.startedAtMs);
  session.recordedDurationMs += durationMs;
  // Signed telemetry-vs-video clock gap for this segment. Consumed by
  // alignCursorEvents at project ingestion; events themselves stay raw here.
  session.cursorAnchors.push({
    baseTimeMs: segment.startedRecordedDurationMs,
    anchorOffsetMs: Number.isFinite(segment.firstFrameMs) ? segment.firstFrameMs - segment.startedAtMs : 0,
  });
  session.segments.push({ ...segment, rawPath, durationMs });
  if (cameraRawPath && !session.cameraError) session.cameraSegments.push({ index: segment.index, rawPath: cameraRawPath, durationMs });
  session.capture = null;
  session.cameraCapture = null;
  session.unifiedCapture = null;
  session.currentSegment = null;
  session.currentSegmentStartedAtMs = null;
}

function segmentPaths(session, index) {
  if (index === 1) {
    return {
      rawPath: session.rawPath,
      cameraRawPath: session.cameraRawPath && session.cameraRawPath !== session.rawPath ? session.cameraRawPath : null,
    };
  }
  return {
    rawPath: join(dirname(session.rawPath), `rough-cut-${session.stamp}-segment-${index}.mkv`),
    cameraRawPath: session.cameraOutputPath ? join(dirname(session.rawPath), `rough-cut-${session.stamp}-segment-${index}-camera.mkv`) : null,
  };
}

function stopTelemetry(session) {
  if (session.cursorTimer) clearInterval(session.cursorTimer);
  session.cursorTimer = null;
  if (session.buttonListener) session.buttonListener.stop();
  session.buttonListener = null;
}

function getRecordedDurationMs(session, now) {
  if (!session || session.paused || !session.currentSegmentStartedAtMs) return Math.max(0, session.recordedDurationMs ?? 0);
  return Math.max(0, (session.recordedDurationMs ?? 0) + now().getTime() - session.currentSegmentStartedAtMs);
}

// Spawn ffmpeg-camera with retry-on-early-exit. The renderer's getUserMedia
// preview holds /dev/video* for a variable window after track.stop() that
// can exceed our pre-record delay. ffmpeg's own attempt to VIDIOC_REQBUFS is
// the only reliable busy probe (a plain fs.open succeeds for V4L2 even when
// streaming would fail), so we let ffmpeg itself test the device and retry
// the spawn after a short backoff if it exits within earlyExitWindowMs with
// a non-zero status. Falls through to the existing error path on
// maxAttempts exhaustion so the take still saves screen-only.
async function spawnCameraCaptureWithRetry({
  factory,
  outputPath,
  devicePath,
  maxAttempts = 6,
  earlyExitWindowMs = 1500,
  backoffMs = 500,
}) {
  let lastErrorMessage = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const capture = factory({
      outputPath,
      fps: DEFAULT_FPS,
      devicePath,
      width: 1280,
      height: 720,
    });
    // Test mocks may not expose whenExited; in that case skip the early-exit
    // race entirely and assume the spawn succeeded. Real ffmpeg-camera
    // handles always provide it.
    if (typeof capture.whenExited !== 'function') {
      return capture;
    }
    // Race the early-exit detection window against the proc actually exiting.
    // If exitInfo lands within the window with a non-zero code, treat it as
    // an EBUSY-style failure and retry. If the window elapses without exit,
    // ffmpeg is streaming — return the live handle.
    const exited = await Promise.race([
      capture.whenExited(),
      new Promise((resolve) => setTimeout(() => resolve(null), earlyExitWindowMs)),
    ]);
    if (exited === null) {
      if (attempt > 1) console.info(`[recording-session] camera spawn succeeded on attempt ${attempt}`);
      return capture;
    }
    const stderrTail = (exited.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
    lastErrorMessage = `ffmpeg-camera exited early (code=${exited.code} signal=${exited.signal ?? 'null'}): ${stderrTail || 'no stderr'}`;
    console.warn(`[recording-session] camera spawn attempt ${attempt}/${maxAttempts} failed: ${lastErrorMessage}`);
    // On EBUSY, identify who's still holding the device. Synchronous lsof is
    // best-effort diagnostic; don't fail the retry if the binary is missing.
    if (stderrTail.includes('Device or resource busy') || stderrTail.includes('Resource busy')) {
      try {
        const { execSync } = await import('node:child_process');
        const holders = execSync(`lsof ${devicePath} 2>/dev/null || true`, { encoding: 'utf8', timeout: 1000 }).trim();
        if (holders) {
          console.warn(`[recording-session] /dev holders during EBUSY:\n${holders}`);
        } else {
          console.warn(`[recording-session] lsof showed no holders for ${devicePath} — kernel-side V4L2 lock may be lingering past file-close`);
        }
      } catch (probeErr) {
        console.warn(`[recording-session] could not probe device holders: ${probeErr?.message ?? probeErr}`);
      }
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  // Throw so the existing catch in start() sets cameraError and continues
  // screen-only, exactly as if ffmpeg-camera had failed once and we gave up.
  throw new Error(lastErrorMessage ?? `ffmpeg-camera failed to start ${devicePath} after ${maxAttempts} attempts`);
}

async function spawnUnifiedCaptureWithRetry({
  factory,
  outputPath,
  fps,
  display,
  width,
  height,
  cameraDevicePath,
  micSource,
  micGainPercent,
  systemAudioSource,
  systemAudioGainPercent,
  onFirstFrame,
  maxAttempts = 6,
  earlyExitWindowMs = 1500,
  backoffMs = 500,
}) {
  let lastErrorMessage = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const capture = factory({
      outputPath,
      fps,
      display,
      width,
      height,
      cameraDevicePath,
      cameraWidth: 1280,
      cameraHeight: 720,
      micSource,
      micGainPercent,
      systemAudioSource,
      systemAudioGainPercent,
      onFirstFrame,
    });
    if (typeof capture.whenExited !== 'function') {
      return capture;
    }
    const exited = await Promise.race([
      capture.whenExited(),
      new Promise((resolve) => setTimeout(() => resolve(null), earlyExitWindowMs)),
    ]);
    if (exited === null) {
      if (attempt > 1) console.info(`[recording-session] unified capture spawn succeeded on attempt ${attempt}`);
      return capture;
    }
    const stderrTail = (exited.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
    lastErrorMessage = `ffmpeg-unified exited early (code=${exited.code} signal=${exited.signal ?? 'null'}): ${stderrTail || 'no stderr'}`;
    console.warn(`[recording-session] unified capture spawn attempt ${attempt}/${maxAttempts} failed: ${lastErrorMessage}`);
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw new Error(lastErrorMessage ?? `ffmpeg-unified failed to start ${cameraDevicePath} after ${maxAttempts} attempts`);
}

function registerChild(session, name, handle) {
  if (!session?.children || !handle) return;
  session.children.push({
    name,
    getPid: typeof handle.getPid === 'function' ? () => handle.getPid() : () => null,
    kill: typeof handle.kill === 'function' ? (signal) => handle.kill(signal) : () => {},
  });
}

function monitorCameraCaptureExit(session) {
  if (!session.cameraCapture || typeof session.cameraCapture.whenExited !== 'function') return;
  session.cameraCapture.whenExited().then((exited) => {
    if (session.stopped || !exited || exited.code === 0 || exited.signal === 'SIGINT' || exited.signal === 'SIGTERM') return;
    const stderrTail = (exited.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
    session.cameraError = `ffmpeg-camera exited during recording (code=${exited.code} signal=${exited.signal ?? 'null'}): ${stderrTail || 'no stderr'}`;
    console.warn(`[recording-session] camera failed during recording: ${session.cameraError}`);
    session.eventLogger?.event('camera-capture-failed-during-recording', { error: session.cameraError, cameraDevicePath: session.cameraDevicePath });
  }).catch((err) => {
    if (session.stopped) return;
    session.cameraError = err instanceof Error ? err.message : String(err);
    session.eventLogger?.event('camera-capture-monitor-failed', { error: session.cameraError, cameraDevicePath: session.cameraDevicePath });
  });
}

async function cancelCapture(capture) {
  if (!capture) return null;
  if (typeof capture.cancel === 'function') return capture.cancel();
  return capture.stop();
}

async function deleteSessionArtifacts(session) {
  const paths = [
    session.rawPath,
    session.outputPath,
    session.cursorTelemetryPath,
    session.eventsLogPath,
    session.cameraRawPath,
    session.cameraOutputPath,
    ...(session.segments ?? []).map((segment) => segment.rawPath),
    ...(session.cameraSegments ?? []).map((segment) => segment.rawPath),
    session.currentSegment?.rawPath,
    session.currentSegment?.cameraRawPath,
  ].filter(Boolean);
  await Promise.allSettled(paths.map((path) => rm(path, { force: true })));
}

function startTelemetryAfterIpcReturn(session, { getCursorPoint, now, sampleIntervalMs, buttonListenerFactory }) {
  setTimeout(() => {
    if (session.stopped || session.paused || !session.capture) return;

    // xdotool synchronous polling drives cursor sampling. Start it after the
    // IPC response path so a slow X11 query cannot leave the renderer stuck on
    // "Starting..." while FFmpeg is already recording.
    sampleCursor(session, getCursorPoint, now);
    if (typeof getCursorPoint === 'function') {
      session.cursorTimer = setInterval(
        () => sampleCursor(session, getCursorPoint, now),
        sampleIntervalMs,
      );
    }

    // xinput button listener captures click/drag events for auto-zoom
    // suggestions; motion events are not used for cursor sampling.
    if (typeof buttonListenerFactory === 'function') {
      session.buttonListener = buttonListenerFactory({
        onButton: (event) => recordButtonEvent(session, event, now),
        onKey: (event) => recordKeyEvent(session, event, now),
      });
      session.buttonListener.start();
      registerChild(session, 'xinput-button-listener', session.buttonListener);
    }
  }, 0);
}

function buildAudioMetadata(session) {
  const audio = {};
  if (session.micSource) {
    audio.micSource = session.micSource;
    audio.micGainPercent = session.micGainPercent;
  }
  if (session.systemAudioSource) {
    audio.systemAudioSource = session.systemAudioSource;
    audio.systemAudioGainPercent = session.systemAudioGainPercent;
  }
  return Object.keys(audio).length > 0 ? audio : null;
}

function normalizeAudioSource(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAudioGainPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(0, Math.min(200, Math.round(number)));
}

function normalizeCameraDevicePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\/dev\/video\d+$/.test(trimmed) ? trimmed : null;
}

export function resolveCaptureDisplayInfo(displayInfo, captureRegion) {
  const region = normalizeCaptureRegion(captureRegion);
  if (!region) {
    if (captureRegion && typeof captureRegion === 'object' && captureRegion.mode === 'region') {
      throw new Error('Capture region is invalid. Select a region at least 2 x 2 pixels inside an attached display.');
    }
    return { ...displayInfo, captureRegion: null };
  }

  const scaleFactor = Number.isFinite(displayInfo.scaleFactor) && displayInfo.scaleFactor > 0 ? displayInfo.scaleFactor : 1;
  const hasAbsoluteRegion = Number.isFinite(region.absoluteX) && Number.isFinite(region.absoluteY);
  const originX = hasAbsoluteRegion ? Math.round(region.absoluteX) : Math.round((displayInfo.originX ?? 0) + region.x * scaleFactor);
  const originY = hasAbsoluteRegion ? Math.round(region.absoluteY) : Math.round((displayInfo.originY ?? 0) + region.y * scaleFactor);
  const width = Math.max(2, hasAbsoluteRegion ? Math.round(region.width) : Math.round(region.width * scaleFactor));
  const height = Math.max(2, hasAbsoluteRegion ? Math.round(region.height) : Math.round(region.height * scaleFactor));
  assertCaptureRegionWithinBounds({ originX, originY, width, height, displayInfo });
  const baseDisplay = baseX11DisplayName(displayInfo.display ?? process.env.DISPLAY ?? ':0');

  return {
    ...displayInfo,
    display: `${baseDisplay}${formatX11Offset(originX)},${originY}`,
    originX,
    originY,
    width,
    height,
    captureRegion: {
      mode: 'region',
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      absoluteX: originX,
      absoluteY: originY,
    },
  };
}

export function normalizeCaptureRegion(value) {
  if (!value || typeof value !== 'object' || value.mode !== 'region') return null;
  const x = Math.round(Number(value.x));
  const y = Math.round(Number(value.y));
  const width = Math.round(Number(value.width));
  const height = Math.round(Number(value.height));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (x < 0 || y < 0 || width < 2 || height < 2) return null;
  const absoluteX = Number(value.absoluteX);
  const absoluteY = Number(value.absoluteY);
  return {
    mode: 'region',
    x,
    y,
    width,
    height,
    ...(Number.isFinite(absoluteX) && Number.isFinite(absoluteY) ? { absoluteX, absoluteY } : {}),
  };
}

function assertCaptureRegionWithinBounds({ originX, originY, width, height, displayInfo }) {
  if (!Number.isFinite(originX) || !Number.isFinite(originY) || !Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    throw new Error('Capture region is invalid. Select a region at least 2 x 2 pixels inside an attached display.');
  }
  const bounds = Array.isArray(displayInfo.displayBounds) && displayInfo.displayBounds.length > 0
    ? displayInfo.displayBounds
    : [{ x: displayInfo.originX ?? 0, y: displayInfo.originY ?? 0, width: displayInfo.width, height: displayInfo.height }];
  const insideDisplay = bounds.some((display) => {
    const x = Math.round(Number(display.x));
    const y = Math.round(Number(display.y));
    const w = Math.round(Number(display.width));
    const h = Math.round(Number(display.height));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    return originX >= x && originY >= y && originX + width <= x + w && originY + height <= y + h;
  });
  if (!insideDisplay) {
    throw new Error('Capture region extends outside the attached display bounds. Reselect a region fully inside one screen.');
  }
}

function baseX11DisplayName(display) {
  const text = String(display || ':0');
  const match = /^(.+?)([+-]\d+),(?:-?\d+)$/.exec(text);
  return match ? match[1] : text;
}

export function normalizeCursorPoint({ point, originX = 0, originY = 0, scaleFactor = 1 }) {
  return {
    x: Math.round(point.x * scaleFactor - originX),
    y: Math.round(point.y * scaleFactor - originY),
  };
}

export function getPrimaryX11DisplayInfo(screen, displayName = process.env.DISPLAY || ':0.0') {
  const primary = screen.getPrimaryDisplay();
  const bounds = primary.bounds;
  const scaleFactor = primary.scaleFactor || 1;
  const x = Math.round(bounds.x * scaleFactor);
  const y = Math.round(bounds.y * scaleFactor);
  const width = Math.round(bounds.width * scaleFactor);
  const height = Math.round(bounds.height * scaleFactor);

  return {
    display: `${displayName}${formatX11Offset(x)},${y}`,
    originX: x,
    originY: y,
    scaleFactor,
    width,
    height,
    displayBounds: typeof screen.getAllDisplays === 'function'
      ? screen.getAllDisplays().map((display) => {
          const displayScaleFactor = display.scaleFactor || 1;
          return {
            x: Math.round(display.bounds.x * displayScaleFactor),
            y: Math.round(display.bounds.y * displayScaleFactor),
            width: Math.round(display.bounds.width * displayScaleFactor),
            height: Math.round(display.bounds.height * displayScaleFactor),
          };
        })
      : [{ x, y, width, height }],
  };
}

function recordButtonEvent(session, event, now) {
  if (!session || !event) return;
  try {
    const elapsedMs = getRecordedDurationMs(session, now);
    const cursor = normalizeCursorPoint({
      point: { x: event.x, y: event.y },
      originX: session.originX || 0,
      originY: session.originY || 0,
      scaleFactor: session.scaleFactor || 1,
    });
    const frame = Math.max(0, Math.round((elapsedMs / 1000) * session.fps));
    session.latestCursorPoint = cursor;
    if (event.type === 'down' && event.button === 0) {
      session.typingAnchor = cursor;
    }
    session.cursorEvents.push({
      frame,
      timeMs: elapsedMs,
      x: cursor.x,
      y: cursor.y,
      type: event.type,
      button: event.button,
    });
    if (session.eventLogger) {
      session.eventLogger.event('xinput-event', {
        eventType: event.type,
        button: event.button,
        x: cursor.x,
        y: cursor.y,
        frame,
        elapsedMs,
      });
    }
  } catch (err) {
    console.warn('[recording-session] button event record failed:', err?.message ?? err);
  }
}

function recordKeyEvent(session, event, now) {
  if (!session || !event) return;
  try {
    const elapsedMs = getRecordedDurationMs(session, now);
    const eventPoint = Number.isFinite(event.x) && Number.isFinite(event.y)
      ? normalizeCursorPoint({
          point: { x: event.x, y: event.y },
          originX: session.originX || 0,
          originY: session.originY || 0,
          scaleFactor: session.scaleFactor || 1,
        })
      : null;
    const anchor = session.typingAnchor ?? session.latestCursorPoint ?? eventPoint;
    if (!anchor) return;
    const frame = Math.max(0, Math.round((elapsedMs / 1000) * session.fps));
    const keyEvent = {
      frame,
      timeMs: elapsedMs,
      x: anchor.x,
      y: anchor.y,
      type: 'key',
      button: 0,
      ...(Number.isInteger(event.keyCode) && event.keyCode >= 0 ? { keyCode: event.keyCode } : {}),
    };
    const last = session.cursorEvents.at(-1);
    if (
      last &&
      last.type === 'key' &&
      last.frame === keyEvent.frame &&
      last.x === keyEvent.x &&
      last.y === keyEvent.y &&
      last.keyCode === keyEvent.keyCode
    ) {
      return;
    }
    session.cursorEvents.push(keyEvent);
    if (session.eventLogger) {
      session.eventLogger.event('xinput-event', {
        eventType: 'key',
        keyCode: keyEvent.keyCode ?? null,
        x: keyEvent.x,
        y: keyEvent.y,
        frame,
        elapsedMs,
      });
    }
  } catch (err) {
    console.warn('[recording-session] key event record failed:', err?.message ?? err);
  }
}

function sampleCursor(session, getCursorPoint, now) {
  if (typeof getCursorPoint !== 'function') return;

  // Bracket the xdotool spawn with begin/end events so the diagnostic log
  // captures both the spawn moment and its duration. If a recording-tear
  // race correlates with cursor polling, the timestamps will line up.
  if (session.eventLogger) session.eventLogger.event('cursor-sample-begin');
  const sampleStart = Date.now();
  try {
    const point = getCursorPoint();
    const sampleTookMs = Date.now() - sampleStart;
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      if (session.eventLogger) {
        session.eventLogger.event('cursor-sample-end', {
          ok: false,
          tookMs: sampleTookMs,
        });
      }
      return;
    }
    const elapsedMs = getRecordedDurationMs(session, now);
    const cursor = normalizeCursorPoint({
      point,
      originX: session.originX || 0,
      originY: session.originY || 0,
      scaleFactor: session.scaleFactor || 1,
    });
    const frame = Math.max(0, Math.round((elapsedMs / 1000) * session.fps));
    session.latestCursorPoint = cursor;
    if (session.eventLogger) {
      session.eventLogger.event('cursor-sample-end', {
        ok: true,
        tookMs: sampleTookMs,
        x: cursor.x,
        y: cursor.y,
        frame,
        elapsedMs,
      });
    }
    const last = session.cursorEvents.at(-1);
    if (last && last.frame === frame && last.x === cursor.x && last.y === cursor.y) return;
    session.cursorEvents.push({ frame, timeMs: elapsedMs, x: cursor.x, y: cursor.y, type: 'move', button: 0 });
  } catch (err) {
    if (session.eventLogger) {
      session.eventLogger.event('cursor-sample-end', {
        ok: false,
        tookMs: Date.now() - sampleStart,
        error: err?.message ?? String(err),
      });
    }
    console.warn('[recording-session] cursor sample failed:', err?.message ?? err);
  }
}

async function writeCursorTelemetrySidecar(session) {
  try {
    await writeFile(
      session.cursorTelemetryPath,
      `${JSON.stringify(
        {
          version: 1,
          startedAt: session.startedAt,
          fps: session.fps,
          width: session.width,
          height: session.height,
          cursorAnchors: session.cursorAnchors,
          events: session.cursorEvents,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  } catch (err) {
    console.warn('[recording-session] cursor telemetry sidecar write failed:', err?.message ?? err);
  }
}

function formatX11Offset(value) {
  return value >= 0 ? `+${value}` : String(value);
}
