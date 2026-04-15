import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

export class MediaBunnyFrameSource {
  private readonly filePath: string;
  private input: Input | null = null;
  private sink: VideoSampleSink | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getFrame(timestampSeconds: number): Promise<VideoFrame | null> {
    await this.ensureLoaded();
    if (!this.sink) return null;

    const sample = await this.sink.getSample(Math.max(0, timestampSeconds));
    if (!sample) return null;

    try {
      return sample.toVideoFrame();
    } finally {
      sample.close();
    }
  }

  dispose(): void {
    this.input?.dispose();
    this.input = null;
    this.sink = null;
    this.loadPromise = null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.sink) return;
    if (!this.loadPromise) {
      this.loadPromise = this.load();
    }
    await this.loadPromise;
  }

  private async load(): Promise<void> {
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

    this.input = input;
    this.sink = new VideoSampleSink(videoTrack);
  }
}
