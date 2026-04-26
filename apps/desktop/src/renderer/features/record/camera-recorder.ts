/**
 * camera-recorder.ts — WebCodecs H.264 camera recorder via mediabunny.
 *
 * Replaces MediaRecorder VP9 (60-150% CPU) with H.264 OpenH264 (~20-30% CPU).
 * Uses mediabunny's MediaStreamVideoTrackSource which handles
 * MediaStreamTrackProcessor → VideoEncoder → MP4 muxing internally.
 */

import { Output, Mp4OutputFormat, BufferTarget, MediaStreamVideoTrackSource } from 'mediabunny';

export class CameraRecorder {
  private output: Output | null = null;
  private target: BufferTarget | null = null;
  private errorPromise: Promise<never> | null = null;

  async start(cameraStream: MediaStream): Promise<void> {
    const track = cameraStream.getVideoTracks()[0];
    if (!track) throw new Error('No video track in camera stream');

    this.target = new BufferTarget();
    this.output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: this.target,
    });

    const videoSource = new MediaStreamVideoTrackSource(track, {
      codec: 'avc',
      bitrate: 3_000_000,
      keyFrameInterval: 1,
      latencyMode: 'realtime',
    });

    // TASK-182 diagnostic: log whenever the video source errors so we can tell
    // "errorPromise invalidated finalize" from other first-take failure modes.
    this.errorPromise = videoSource.errorPromise.then((err) => {
      console.warn(
        '[CameraRecorder][task-182] videoSource.errorPromise resolved',
        'track.readyState=' + track.readyState,
        'track.muted=' + track.muted,
        'err=',
        err,
      );
      void this.output?.cancel().catch(() => {});
      throw err;
    });

    const settings = track.getSettings();
    this.output.addVideoTrack(videoSource, {
      frameRate: settings.frameRate ?? 30,
    });

    await this.output.start();
    console.info(
      '[CameraRecorder] Started H.264 recording',
      `${settings.width}x${settings.height} @${settings.frameRate}fps`,
      'trackId=' + track.id,
    );
  }

  async stop(timeoutMs: number = 3000): Promise<Uint8Array> {
    if (!this.output || !this.target) throw new Error('Not recording');

    // TASK-182 diagnostic: label which branch of the race won so we can
    // distinguish "finalize completed cleanly" from "errorPromise killed it"
    // from "timeout — no frames arrived" in captured logs.
    const stopStartedAt = Date.now();
    const finalize: Promise<'finalize'> = this.output
      .finalize()
      .then(() => 'finalize' as const)
      .catch((err) => {
        console.warn(
          '[CameraRecorder][task-182] finalize() rejected after',
          Date.now() - stopStartedAt,
          'ms:',
          err,
        );
        throw err;
      });
    const errorGate: Promise<'errorGate'> = this.errorPromise
      ? this.errorPromise.then(
          () => 'errorGate' as const,
          () => 'errorGate' as const,
        )
      : (new Promise<never>(() => {}) as Promise<never>);
    // TASK-182 fix: hard timeout. Observed 2026-04-22 13:27 — camera track was
    // ACTIVE at REC click but delivered ~0.000384 fps (effectively no frames)
    // while the panel was hidden during recording, so Mediabunny's finalize()
    // waited forever for encoding to drain. Without this, stopMediaRecorder →
    // finalizePanelRecording → cameraRecorder.stop() hangs the entire stop
    // flow, and the panel UI cannot dismiss. With the timeout, the panel
    // saves a screen-only take and the app stays responsive.
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeout: Promise<'timeout'> = new Promise((resolve) => {
      timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs);
    });

    let winner: 'finalize' | 'errorGate' | 'timeout' | null = null;
    try {
      winner = await Promise.race([finalize, errorGate, timeout]);
    } catch (raceErr) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.warn(
        '[CameraRecorder][task-182] stop race rejected after',
        Date.now() - stopStartedAt,
        'ms, buffer-present=' + Boolean(this.target?.buffer),
        'err=',
        raceErr,
      );
      throw raceErr;
    }
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (winner === 'timeout') {
      console.warn(
        '[CameraRecorder][task-182] finalize did not complete within',
        timeoutMs,
        'ms — abandoning camera sidecar',
        'buffer-present=' + Boolean(this.target?.buffer),
      );
      // Cancel the output so mediabunny releases resources.
      void this.output?.cancel().catch(() => {});
      this.output = null;
      this.target = null;
      this.errorPromise = null;
      throw new Error('Camera recorder finalize timed out');
    }

    const buffer = this.target.buffer;
    if (!buffer) {
      console.error(
        '[CameraRecorder][task-182] no buffer after race',
        'winner=' + winner,
        'elapsed=' + (Date.now() - stopStartedAt) + 'ms',
      );
      throw new Error('Camera recorder produced no buffer');
    }
    console.info(
      '[CameraRecorder] Stopped, MP4 size:',
      buffer.byteLength,
      'bytes',
      'winner=' + winner,
      'elapsed=' + (Date.now() - stopStartedAt) + 'ms',
    );

    this.output = null;
    this.target = null;
    this.errorPromise = null;
    return new Uint8Array(buffer);
  }
}
