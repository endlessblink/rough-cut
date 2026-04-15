import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryVideoTrack = vi.fn();
const inputDispose = vi.fn();
const sampleClose = vi.fn();
const sampleToVideoFrame = vi.fn();
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

import { MediaBunnyFrameSource } from './media-bunny-frame-source.js';

describe('MediaBunnyFrameSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrimaryVideoTrack.mockResolvedValue({ id: 'track-1' });
    sampleToVideoFrame.mockReturnValue({ close: vi.fn() });
    sinkGetSample.mockResolvedValue({
      toVideoFrame: sampleToVideoFrame,
      close: sampleClose,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
  });

  it('loads and returns a decoded frame', async () => {
    const source = new MediaBunnyFrameSource('/tmp/test.mp4');
    const frame = await source.getFrame(1.5);

    expect(fetch).toHaveBeenCalledWith('media:///tmp/test.mp4');
    expect(sinkGetSample).toHaveBeenCalledWith(1.5);
    expect(sampleToVideoFrame).toHaveBeenCalledOnce();
    expect(sampleClose).toHaveBeenCalledOnce();
    expect(frame).toBeTruthy();
  });

  it('reuses the loaded input across calls', async () => {
    const source = new MediaBunnyFrameSource('/tmp/test.mp4');
    await source.getFrame(0);
    await source.getFrame(0.2);

    expect(fetch).toHaveBeenCalledOnce();
    expect(getPrimaryVideoTrack).toHaveBeenCalledOnce();
  });

  it('disposes the mediabunny input', async () => {
    const source = new MediaBunnyFrameSource('/tmp/test.mp4');
    await source.getFrame(0);

    source.dispose();

    expect(inputDispose).toHaveBeenCalledOnce();
  });
});
