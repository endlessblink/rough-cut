import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryVideoTrack = vi.fn();
const inputDispose = vi.fn();
const sampleClose = vi.fn();
const sampleDraw = vi.fn();
const sinkGetSample = vi.fn();

vi.mock('mediabunny', () => {
  class MockInput {
    dispose = inputDispose;

    async getPrimaryVideoTrack(): Promise<unknown> {
      return getPrimaryVideoTrack();
    }
  }

  class MockBlobSource {
    constructor(_blob: Blob) {}
  }

  class MockVideoSampleSink {
    constructor(_track: unknown) {}

    async getSample(timestamp: number): Promise<unknown> {
      return sinkGetSample(timestamp);
    }
  }

  return {
    ALL_FORMATS: ['mock-format'],
    BlobSource: MockBlobSource,
    Input: MockInput,
    VideoSampleSink: MockVideoSampleSink,
  };
});

import { MediaBunnyVideoScrubber } from './media-bunny-video-scrubber.js';

describe('MediaBunnyVideoScrubber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrimaryVideoTrack.mockResolvedValue({ id: 'track-1' });
    sinkGetSample.mockResolvedValue({
      displayWidth: 320,
      displayHeight: 180,
      codedWidth: 320,
      codedHeight: 180,
      draw: sampleDraw,
      close: sampleClose,
    });

    const ctx = {
      clearRect: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    });
  });

  it('fetches and draws the requested frame once initialized', async () => {
    const scrubber = new MediaBunnyVideoScrubber('/tmp/test.mp4');
    const canvas = await scrubber.getFrameCanvas(1.25);

    expect(fetch).toHaveBeenCalledWith('media:///tmp/test.mp4');
    expect(sinkGetSample).toHaveBeenCalledWith(1.25);
    expect(sampleDraw).toHaveBeenCalledOnce();
    expect(sampleClose).toHaveBeenCalledOnce();
    expect(canvas).toBeTruthy();
  });

  it('reuses the loaded track across calls', async () => {
    const scrubber = new MediaBunnyVideoScrubber('/tmp/test.mp4');

    await scrubber.getFrameCanvas(0);
    await scrubber.getFrameCanvas(0.5);

    expect(fetch).toHaveBeenCalledOnce();
    expect(getPrimaryVideoTrack).toHaveBeenCalledOnce();
    expect(sinkGetSample).toHaveBeenCalledTimes(2);
  });

  it('returns null when no sample exists at the requested timestamp', async () => {
    sinkGetSample.mockResolvedValueOnce(null);
    const scrubber = new MediaBunnyVideoScrubber('/tmp/test.mp4');

    const canvas = await scrubber.getFrameCanvas(3);

    expect(canvas).toBeNull();
    expect(sampleDraw).not.toHaveBeenCalled();
  });

  it('disposes the mediabunny input', async () => {
    const scrubber = new MediaBunnyVideoScrubber('/tmp/test.mp4');
    await scrubber.getFrameCanvas(0);

    scrubber.dispose();

    expect(inputDispose).toHaveBeenCalledOnce();
  });
});
