/**
 * camera-recorder.ts — WebCodecs H.264 camera recorder via mediabunny.
 *
 * Replaces MediaRecorder VP9 (60-150% CPU) with H.264 OpenH264 (~20-30% CPU).
 * Uses mediabunny's MediaStreamVideoTrackSource which handles
 * MediaStreamTrackProcessor → VideoEncoder → MP4 muxing internally.
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  MediaStreamVideoTrackSource,
} from 'mediabunny';

export class CameraRecorder {
  private output: Output | null = null;
  private target: BufferTarget | null = null;

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

    const settings = track.getSettings();
    this.output.addVideoTrack(videoSource, {
      frameRate: settings.frameRate ?? 30,
    });

    await this.output.start();
    console.info('[CameraRecorder] Started H.264 recording',
      `${settings.width}x${settings.height} @${settings.frameRate}fps`);
  }

  async stop(): Promise<Uint8Array> {
    if (!this.output || !this.target) throw new Error('Not recording');

    await this.output.finalize();
    const buffer = this.target.buffer;
    console.info('[CameraRecorder] Stopped, MP4 size:', buffer.byteLength, 'bytes');

    this.output = null;
    this.target = null;
    return buffer;
  }
}
