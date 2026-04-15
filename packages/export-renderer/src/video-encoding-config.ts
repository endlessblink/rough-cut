import type { ExportSettings } from '@rough-cut/project-model';
import { canEncodeVideo, type VideoCodec, type VideoEncodingConfig } from 'mediabunny';

export type ExportHardwareAcceleration = 'no-preference' | 'prefer-hardware' | 'prefer-software';

export interface ResolvedVideoEncodingConfig {
  config: VideoEncodingConfig;
  hardwareAcceleration: ExportHardwareAcceleration;
}

type CanEncodeVideoFn = typeof canEncodeVideo;

function toVideoCodec(codec: ExportSettings['codec']): VideoCodec {
  switch (codec) {
    case 'h264':
      return 'avc';
    case 'h265':
      return 'hevc';
    case 'vp9':
      return 'vp9';
  }
}

function createEncodingConfig(
  settings: ExportSettings,
  hardwareAcceleration: ExportHardwareAcceleration,
): VideoEncodingConfig {
  return {
    codec: toVideoCodec(settings.codec),
    bitrate: settings.bitrate,
    bitrateMode: 'variable',
    latencyMode: 'quality',
    keyFrameInterval: 2,
    hardwareAcceleration,
  };
}

export async function resolveVideoEncodingConfig(
  settings: ExportSettings,
  canEncodeVideoImpl: CanEncodeVideoFn = canEncodeVideo,
): Promise<ResolvedVideoEncodingConfig> {
  const codec = toVideoCodec(settings.codec);
  const probeOptions = {
    width: settings.resolution.width,
    height: settings.resolution.height,
    bitrate: settings.bitrate,
    bitrateMode: 'variable' as const,
    latencyMode: 'quality' as const,
  };

  for (const hardwareAcceleration of [
    'prefer-hardware',
    'no-preference',
    'prefer-software',
  ] as const) {
    if (await canEncodeVideoImpl(codec, { ...probeOptions, hardwareAcceleration })) {
      return {
        config: createEncodingConfig(settings, hardwareAcceleration),
        hardwareAcceleration,
      };
    }
  }

  throw new Error(
    `No supported WebCodecs encoder config for ${settings.codec} at ` +
      `${settings.resolution.width}x${settings.resolution.height}`,
  );
}

export function supportsWebCodecsExport(settings: ExportSettings): boolean {
  if (settings.format !== 'mp4') {
    return false;
  }

  return settings.codec === 'h264' || settings.codec === 'h265';
}
