import type { ProjectDocument } from '@rough-cut/project-model';

type ExportSettingsWithLegacyBitrate = ProjectDocument['exportSettings'] & {
  videoBitrate?: unknown;
  crf?: unknown;
  keepClickSounds?: unknown;
};

export function bitrateFromCrf(crf: number): number {
  switch (crf) {
    case 18:
      return 10_000_000;
    case 22:
      return 5_000_000;
    case 23:
      return 6_000_000;
    case 26:
      return 2_000_000;
    default:
      return 1_000_000;
  }
}

export function resolveExportBitrate(settings: ExportSettingsWithLegacyBitrate): number | null {
  if (Number.isFinite(settings.bitrate) && settings.bitrate > 0) {
    return settings.bitrate;
  }

  const legacyVideoBitrate = settings.videoBitrate;
  if (typeof legacyVideoBitrate === 'number' && Number.isFinite(legacyVideoBitrate) && legacyVideoBitrate > 0) {
    return legacyVideoBitrate;
  }

  const legacyCrf = settings.crf;
  if (typeof legacyCrf === 'number' && Number.isFinite(legacyCrf)) {
    return bitrateFromCrf(legacyCrf);
  }

  return null;
}

export function normalizeExportSettings<T extends ExportSettingsWithLegacyBitrate>(settings: T): T {
  const bitrate = resolveExportBitrate(settings);
  const keepClickSounds =
    typeof settings.keepClickSounds === 'boolean' ? settings.keepClickSounds : true;
  const bitrateChanged = bitrate !== null && bitrate !== settings.bitrate;
  const clickSoundsChanged = keepClickSounds !== settings.keepClickSounds;

  if (!bitrateChanged && !clickSoundsChanged) {
    return settings;
  }

  return {
    ...settings,
    ...(bitrateChanged ? { bitrate } : {}),
    keepClickSounds,
  };
}
