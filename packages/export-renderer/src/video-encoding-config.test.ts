import { describe, expect, it, vi } from 'vitest';
import type { ExportSettings } from '@rough-cut/project-model';
import { resolveVideoEncodingConfig, supportsWebCodecsExport } from './video-encoding-config.js';

const SETTINGS: ExportSettings = {
  format: 'mp4',
  codec: 'h264',
  bitrate: 4_000_000,
  resolution: { width: 1920, height: 1080 },
  frameRate: 30,
};

describe('resolveVideoEncodingConfig', () => {
  it('prefers hardware acceleration when supported', async () => {
    const canEncodeVideo = vi.fn().mockResolvedValueOnce(true);

    const result = await resolveVideoEncodingConfig(SETTINGS, canEncodeVideo);

    expect(result.hardwareAcceleration).toBe('prefer-hardware');
    expect(result.config.codec).toBe('avc');
    expect(result.config.hardwareAcceleration).toBe('prefer-hardware');
  });

  it('falls back to no-preference before software', async () => {
    const canEncodeVideo = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await resolveVideoEncodingConfig(SETTINGS, canEncodeVideo);

    expect(canEncodeVideo).toHaveBeenNthCalledWith(
      1,
      'avc',
      expect.objectContaining({ hardwareAcceleration: 'prefer-hardware' }),
    );
    expect(canEncodeVideo).toHaveBeenNthCalledWith(
      2,
      'avc',
      expect.objectContaining({ hardwareAcceleration: 'no-preference' }),
    );
    expect(result.hardwareAcceleration).toBe('no-preference');
  });

  it('falls back to prefer-software when hardware is unavailable', async () => {
    const canEncodeVideo = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await resolveVideoEncodingConfig(SETTINGS, canEncodeVideo);

    expect(result.hardwareAcceleration).toBe('prefer-software');
    expect(result.config.hardwareAcceleration).toBe('prefer-software');
  });

  it('throws when no encoder configuration is supported', async () => {
    const canEncodeVideo = vi.fn().mockResolvedValue(false);

    await expect(resolveVideoEncodingConfig(SETTINGS, canEncodeVideo)).rejects.toThrow(
      'No supported WebCodecs encoder config',
    );
  });
});

describe('supportsWebCodecsExport', () => {
  it('supports mp4 h264/h265 only for now', () => {
    expect(supportsWebCodecsExport(SETTINGS)).toBe(true);
    expect(supportsWebCodecsExport({ ...SETTINGS, codec: 'h265' })).toBe(true);
    expect(supportsWebCodecsExport({ ...SETTINGS, codec: 'vp9' })).toBe(false);
    expect(supportsWebCodecsExport({ ...SETTINGS, format: 'webm' })).toBe(false);
  });
});
