import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

interface LoadedTrack {
  input: Input;
  sink: VideoSampleSink;
}

/**
 * Fetches exact decoded frames for paused scrubbing while native video playback
 * continues to use HTMLVideoElement for low-overhead real-time playback.
 */
export class MediaBunnyVideoScrubber {
  private readonly filePath: string;
  private loadPromise: Promise<LoadedTrack> | null = null;
  private loadedTrack: LoadedTrack | null = null;
  private disposed = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getFrameCanvas(timestampSeconds: number): Promise<HTMLCanvasElement | null> {
    if (this.disposed) return null;

    const track = await this.loadTrack();
    if (!track || this.disposed) return null;

    const sample = await track.sink.getSample(Math.max(0, timestampSeconds));
    if (!sample || this.disposed) {
      sample?.close();
      return null;
    }

    try {
      const canvas = this.getOrCreateCanvas();
      const width = Math.max(1, sample.displayWidth || sample.codedWidth || 1);
      const height = Math.max(1, sample.displayHeight || sample.codedHeight || 1);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sample.draw(ctx, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      sample.close();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.loadedTrack?.input.dispose();
    this.loadedTrack = null;
    this.loadPromise = null;
    this.canvas = null;
  }

  private async loadTrack(): Promise<LoadedTrack | null> {
    if (this.loadedTrack) return this.loadedTrack;
    if (!this.loadPromise) {
      this.loadPromise = this.createTrack();
    }

    try {
      const track = await this.loadPromise;
      if (this.disposed) {
        track.input.dispose();
        return null;
      }

      this.loadedTrack = track;
      return track;
    } catch {
      this.loadPromise = null;
      return null;
    }
  }

  private async createTrack(): Promise<LoadedTrack> {
    const response = await fetch(`media://${this.filePath}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch media://${this.filePath}: ${response.status}`);
    }

    const blob = await response.blob();
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      input.dispose();
      throw new Error(`No primary video track for ${this.filePath}`);
    }

    return {
      input,
      sink: new VideoSampleSink(videoTrack),
    };
  }

  private getOrCreateCanvas(): HTMLCanvasElement {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }

    return this.canvas;
  }
}
