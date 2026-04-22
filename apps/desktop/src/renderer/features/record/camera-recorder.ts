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

  async stop(): Promise<Uint8Array> {
    if (!this.output || !this.target) throw new Error('Not recording');

    // TASK-182 diagnostic: label which branch of the race won so we can
    // distinguish "finalize completed cleanly" from "errorPromise killed it"
    // in captured logs.
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

    let winner: 'finalize' | 'errorGate' | null = null;
    try {
      winner = await Promise.race([finalize, errorGate]);
    } catch (raceErr) {
      console.warn(
        '[CameraRecorder][task-182] stop race rejected after',
        Date.now() - stopStartedAt,
        'ms, buffer-present=' + Boolean(this.target.buffer),
        'err=',
        raceErr,
      );
      throw raceErr;
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
