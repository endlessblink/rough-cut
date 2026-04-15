import { describe, expect, it, vi } from 'vitest';
import { CameraFrameDecoder } from './camera-frame-decoder.js';

describe('CameraFrameDecoder', () => {
  it('resets decoder state on backward seeks', () => {
    const decoder = new CameraFrameDecoder() as unknown as {
      _lastRequestedSampleIndex: number;
      _pendingFrames: Array<{ close: () => void }>;
      _buffer: Map<number, { close: () => void }>;
      codecConfig: VideoDecoderConfig;
      decoder: {
        state: string;
        reset: () => void;
        configure: (config: VideoDecoderConfig) => void;
      };
      _resetForBackwardSeek: (sampleIndex: number) => void;
    };

    const closePending = vi.fn();
    const closeBuffered = vi.fn();
    const reset = vi.fn();
    const configure = vi.fn();
    const codecConfig = { codec: 'avc1.64001f' } as VideoDecoderConfig;

    decoder._lastRequestedSampleIndex = 120;
    decoder._pendingFrames = [{ close: closePending }];
    decoder._buffer = new Map([[119, { close: closeBuffered }]]);
    decoder.codecConfig = codecConfig;
    decoder.decoder = { state: 'configured', reset, configure };

    decoder._resetForBackwardSeek(10);

    expect(closePending).toHaveBeenCalledTimes(1);
    expect(closeBuffered).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith(codecConfig);
    expect(decoder._buffer.size).toBe(0);
    expect(decoder._pendingFrames).toEqual([]);
    expect(decoder._lastRequestedSampleIndex).toBe(-1);
  });

  it('does nothing when playback keeps moving forward', () => {
    const decoder = new CameraFrameDecoder() as unknown as {
      _lastRequestedSampleIndex: number;
      _pendingFrames: Array<{ close: () => void }>;
      _buffer: Map<number, { close: () => void }>;
      codecConfig: VideoDecoderConfig;
      decoder: {
        state: string;
        reset: () => void;
        configure: (config: VideoDecoderConfig) => void;
      };
      _resetForBackwardSeek: (sampleIndex: number) => void;
    };

    const closePending = vi.fn();
    const closeBuffered = vi.fn();
    const reset = vi.fn();
    const configure = vi.fn();

    decoder._lastRequestedSampleIndex = 10;
    decoder._pendingFrames = [{ close: closePending }];
    decoder._buffer = new Map([[9, { close: closeBuffered }]]);
    decoder.codecConfig = { codec: 'avc1.64001f' } as VideoDecoderConfig;
    decoder.decoder = { state: 'configured', reset, configure };

    decoder._resetForBackwardSeek(10);

    expect(closePending).not.toHaveBeenCalled();
    expect(closeBuffered).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(configure).not.toHaveBeenCalled();
    expect(decoder._buffer.size).toBe(1);
    expect(decoder._pendingFrames).toHaveLength(1);
  });
});
