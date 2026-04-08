/**
 * CameraFrameDecoder — WebCodecs-based frame-accurate camera video decoder.
 *
 * Replaces HTMLVideoElement.play() for camera playback. Instead of two
 * independent video clocks drifting apart, this decodes camera frames
 * on-demand by timestamp, perfectly synced to the screen video's clock.
 *
 * Pipeline: fetch MP4 → mp4box.js demux → VideoDecoder → VideoFrame → PixiJS texture
 */

import { createFile, type Sample } from 'mp4box';

/** Decoded frame ready for PixiJS texture upload */
export interface DecodedFrame {
  frame: VideoFrame;
  /** Presentation time in seconds */
  timeSeconds: number;
}

interface SampleInfo {
  /** Composition time in seconds */
  cts: number;
  /** Decode time in seconds */
  dts: number;
  /** Duration in seconds */
  duration: number;
  /** Byte offset in file */
  offset: number;
  /** Byte size */
  size: number;
  /** Is keyframe (sync sample) */
  isSync: boolean;
  /** Index in the samples array */
  index: number;
}

export class CameraFrameDecoder {
  private decoder: VideoDecoder | null = null;
  private samples: SampleInfo[] = [];
  private keyframeIndices: number[] = [];
  private timescale = 1;
  private codecConfig: VideoDecoderConfig | null = null;

  /** The most recently decoded frame (caller must close after use) */
  private _currentFrame: VideoFrame | null = null;
  /** @internal used by _onDecodedFrame for diagnostics */
  _currentFrameTime = -1;

  /** Ring buffer of pre-decoded frames */
  private _buffer: Map<number, VideoFrame> = new Map(); // sampleIndex → frame
  private _bufferSize = 5;

  /** Raw file data for seeking (loaded once) */
  private _fileBuffer: ArrayBuffer | null = null;

  private _disposed = false;
  private _ready = false;
  /** Guard: only one getFrame() can be in-flight at a time */
  private _decoding = false;

  get ready(): boolean { return this._ready; }

  /**
   * Initialize: load the MP4, demux with mp4box.js, configure VideoDecoder.
   * Accepts a pre-loaded ArrayBuffer (from preload IPC bridge) or a URL string (fallback).
   */
  async init(source: string | ArrayBuffer): Promise<void> {
    if (this._disposed) return;

    // Load file into memory — accept pre-loaded ArrayBuffer or fetch from URL
    let buffer: ArrayBuffer;
    if (source instanceof ArrayBuffer) {
      buffer = source;
    } else {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${source}`);
      }
      buffer = await response.arrayBuffer();
    }
    this._fileBuffer = buffer;

    // Demux with mp4box.js
    const file = createFile();

    await new Promise<void>((resolve, reject) => {
      file.onReady = (info) => {
        const videoTrack = info.tracks.find((t) => t.type === 'video');
        if (!videoTrack) {
          reject(new Error('No video track in camera MP4'));
          return;
        }

        this.timescale = videoTrack.timescale;

        // Extract codec config for VideoDecoder
        const codec = videoTrack.codec;
        this.codecConfig = {
          codec,
          codedWidth: videoTrack.video?.width ?? videoTrack.track_width,
          codedHeight: videoTrack.video?.height ?? videoTrack.track_height,
          // Description is needed for H.264 (contains SPS/PPS)
          description: this._getAvcDescription(file, videoTrack.id),
        };

        // Set up sample extraction and start immediately inside onReady
        // (mp4box requires start() before flush can deliver samples)
        file.setExtractionOptions(videoTrack.id, undefined, { nbSamples: 100000 });
        file.start();
        resolve();
      };

      file.onError = (_module: string, message: string) => {
        reject(new Error(`mp4box error: ${message}`));
      };

      file.onSamples = (_id: number, _user: unknown, samples: Sample[]) => {
        for (const sample of samples) {
          const info: SampleInfo = {
            cts: sample.cts / this.timescale,
            dts: sample.dts / this.timescale,
            duration: sample.duration / this.timescale,
            offset: sample.offset,
            size: sample.size,
            isSync: sample.is_sync,
            index: this.samples.length,
          };
          if (info.isSync) {
            this.keyframeIndices.push(info.index);
          }
          this.samples.push(info);
        }
      };

      // Feed the buffer to mp4box — it requires a fileStart property
      const mp4Buffer = buffer as ArrayBuffer & { fileStart: number };
      mp4Buffer.fileStart = 0;
      file.appendBuffer(mp4Buffer as unknown as Parameters<typeof file.appendBuffer>[0]);
      file.flush();
    });

    // Flush again to ensure all samples are delivered
    // (start() was called inside onReady, samples flow on next flush)
    file.flush();

    // Configure VideoDecoder
    if (!this.codecConfig) {
      throw new Error('No codec config extracted from camera MP4');
    }

    const support = await VideoDecoder.isConfigSupported(this.codecConfig);
    if (!support.supported) {
      throw new Error(`VideoDecoder does not support codec: ${this.codecConfig.codec}`);
    }

    this.decoder = new VideoDecoder({
      output: (frame) => {
        this._onDecodedFrame(frame);
      },
      error: (err) => {
        console.error('[CameraFrameDecoder] VideoDecoder error:', err);
      },
    });

    this.decoder.configure(this.codecConfig);
    this._ready = true;
  }

  /**
   * Get a decoded VideoFrame for the given time.
   * The caller MUST call frame.close() after uploading to a PixiJS texture.
   */
  async getFrame(timeSeconds: number): Promise<VideoFrame | null> {
    if (!this._ready || !this.decoder || !this._fileBuffer || this.samples.length === 0) {
      return null;
    }
    if (this._decoding) return null;
    this._decoding = true;

    try {
      const sampleIndex = this._findSampleAtTime(timeSeconds);
      if (sampleIndex < 0) return null;

      // Check ring buffer (fast path)
      const buffered = this._buffer.get(sampleIndex);
      if (buffered) return buffered.clone();

      // Decode: find nearest keyframe, decode forward to target + buffer
      const kfIndex = this._findNearestKeyframe(sampleIndex);
      const endIndex = Math.min(sampleIndex + this._bufferSize, this.samples.length - 1);

      // Queue ALL chunks first, then flush ONCE
      for (let i = kfIndex; i <= endIndex; i++) {
        const sample = this.samples[i]!;
        const chunk = this._createChunk(sample);
        if (!chunk) continue;
        this.decoder.decode(chunk);
      }

      // Single flush — wait for all queued chunks to decode
      await this.decoder.flush();

      // The output callback fires for each decoded frame.
      // For the simple case, just return whatever we got.
      if (this._currentFrame) {
        const frame = this._currentFrame;
        this._currentFrame = null;
        return frame;
      }
      return null;
    } catch (err) {
      console.error('[CameraFrameDecoder] getFrame error:', err);
      return null;
    } finally {
      this._decoding = false;
    }
  }

  /**
   * Lightweight version: get frame synchronously if already in buffer.
   * Returns null if not buffered (caller should call getFrame() async).
   */
  getBufferedFrame(timeSeconds: number): VideoFrame | null {
    const sampleIndex = this._findSampleAtTime(timeSeconds);
    if (sampleIndex < 0) return null;
    const buffered = this._buffer.get(sampleIndex);
    return buffered ? buffered.clone() : null;
  }

  /**
   * Pre-fetch frames around a time for smooth playback.
   * Call this ahead of getFrame() during playback.
   */
  async prefetch(timeSeconds: number): Promise<void> {
    if (!this._ready || !this.decoder || !this._fileBuffer || this._decoding) return;

    const sampleIndex = this._findSampleAtTime(timeSeconds);
    if (sampleIndex < 0) return;

    // Check if we already have frames buffered around this time
    let allBuffered = true;
    for (let i = sampleIndex; i < Math.min(sampleIndex + this._bufferSize, this.samples.length); i++) {
      if (!this._buffer.has(i)) {
        allBuffered = false;
        break;
      }
    }
    if (allBuffered) return;

    // Decode from nearest keyframe
    const kfIndex = this._findNearestKeyframe(sampleIndex);
    await this.decoder.flush();
    this._clearBuffer();

    const endIndex = Math.min(sampleIndex + this._bufferSize, this.samples.length - 1);

    for (let i = kfIndex; i <= endIndex; i++) {
      const sample = this.samples[i]!;
      const chunk = this._createChunk(sample);
      if (!chunk) continue;

      this.decoder.decode(chunk);
      await this.decoder.flush();

      if (i >= sampleIndex && this._currentFrame) {
        this._buffer.set(i, this._currentFrame);
        this._currentFrame = null;
      } else if (this._currentFrame) {
        this._currentFrame.close();
        this._currentFrame = null;
      }
    }
  }

  /** Total duration in seconds */
  get duration(): number {
    if (this.samples.length === 0) return 0;
    const last = this.samples[this.samples.length - 1]!;
    return last.cts + last.duration;
  }

  dispose(): void {
    this._disposed = true;
    this._clearBuffer();
    if (this._currentFrame) {
      this._currentFrame.close();
      this._currentFrame = null;
    }
    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close();
    }
    this.decoder = null;
    this._fileBuffer = null;
    this.samples = [];
    this.keyframeIndices = [];
    this._ready = false;
  }

  // ── Internal ─────────────────────────────────────────────────

  private _onDecodedFrame(frame: VideoFrame): void {
    // Close previous frame if it wasn't consumed
    if (this._currentFrame) {
      this._currentFrame.close();
    }
    this._currentFrame = frame;
    this._currentFrameTime = frame.timestamp / 1_000_000; // μs → seconds
  }

  private _findSampleAtTime(timeSeconds: number): number {
    if (this.samples.length === 0) return -1;

    // Binary search for the sample whose cts is closest to timeSeconds
    let low = 0;
    let high = this.samples.length - 1;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.samples[mid]!.cts < timeSeconds) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Check if previous sample is closer
    if (low > 0) {
      const prev = this.samples[low - 1]!;
      const curr = this.samples[low]!;
      if (Math.abs(prev.cts - timeSeconds) < Math.abs(curr.cts - timeSeconds)) {
        return low - 1;
      }
    }

    return low;
  }

  private _findNearestKeyframe(sampleIndex: number): number {
    // Find the last keyframe at or before sampleIndex
    let kf = 0;
    for (const ki of this.keyframeIndices) {
      if (ki > sampleIndex) break;
      kf = ki;
    }
    return kf;
  }

  private _createChunk(sample: SampleInfo): EncodedVideoChunk | null {
    if (!this._fileBuffer) return null;

    const data = new Uint8Array(this._fileBuffer, sample.offset, sample.size);

    return new EncodedVideoChunk({
      type: sample.isSync ? 'key' : 'delta',
      timestamp: sample.cts * 1_000_000, // seconds → μs
      duration: sample.duration * 1_000_000,
      data,
    });
  }

  private _clearBuffer(): void {
    for (const frame of this._buffer.values()) {
      frame.close();
    }
    this._buffer.clear();
  }

  /**
   * Extract the avcC (or hvcC) description box from the mp4 track.
   * VideoDecoder needs this for H.264/H.265 initialization.
   *
   * mp4box.js exposes the codec-specific config through the track's
   * sample description entry. We use getTrackById() to navigate to
   * trak → mdia → minf → stbl → stsd → entries[0] → avcC/hvcC.
   */
  /**
   * Extract the avcC (or hvcC) description from the mp4 track.
   * VideoDecoder needs this for H.264/H.265 initialization.
   *
   * Uses the box's file position (start/size) to extract raw bytes
   * directly from the file buffer — avoids depending on mp4box.js
   * internal serialization methods.
   */
  private _getAvcDescription(file: ReturnType<typeof createFile>, trackId: number): Uint8Array | undefined {
    if (!this._fileBuffer) return undefined;

    // Navigate mp4box.js box tree: trak → mdia → minf → stbl → stsd → entries[0] → avcC/hvcC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trak = file.getTrackById(trackId) as any;
    if (!trak) { console.warn('[CameraFrameDecoder] No trak for id:', trackId); return undefined; }

    const stsd = trak?.mdia?.minf?.stbl?.stsd;
    const entries = stsd?.entries;
    if (!entries || entries.length === 0) { console.warn('[CameraFrameDecoder] No stsd entries'); return undefined; }

    const entry = entries[0];
    const configBox = entry?.avcC ?? entry?.hvcC;
    if (!configBox) { console.warn('[CameraFrameDecoder] No avcC/hvcC box found'); return undefined; }

    // Extract raw bytes using the box's position in the file
    // configBox.start = byte offset of box start (including header)
    // configBox.hdr_size = box header size (typically 8 bytes)
    // configBox.size = total box size (header + content)
    const start = configBox.start as number | undefined;
    const hdrSize = configBox.hdr_size as number | undefined;
    const size = configBox.size as number | undefined;

    if (start != null && hdrSize != null && size != null && size > hdrSize) {
      const contentStart = start + hdrSize;
      const contentSize = size - hdrSize;
      return new Uint8Array(this._fileBuffer.slice(contentStart, contentStart + contentSize));
    }

    // Fallback: try to find avcC by scanning the raw buffer for the 'avcC' fourcc
    console.warn('[CameraFrameDecoder] Box position not available, scanning for avcC...');
    const view = new Uint8Array(this._fileBuffer);
    const avcCTag = [0x61, 0x76, 0x63, 0x43]; // 'avcC'
    for (let i = 0; i < view.length - 8; i++) {
      if (view[i + 4] === avcCTag[0] && view[i + 5] === avcCTag[1] &&
          view[i + 6] === avcCTag[2] && view[i + 7] === avcCTag[3]) {
        // Found avcC box at offset i
        const boxSize = (view[i]! << 24) | (view[i + 1]! << 16) | (view[i + 2]! << 8) | view[i + 3]!;
        if (boxSize > 8 && boxSize < 1024) { // sanity check
          const content = this._fileBuffer.slice(i + 8, i + boxSize);
          return new Uint8Array(content);
        }
      }
    }

    console.error('[CameraFrameDecoder] Could not extract avcC description');
    return undefined;
  }
}
