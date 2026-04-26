export type LinkedExportPresetId =
  | 'draft'
  | 'balanced'
  | 'crisp'
  | 'social-vertical'
  | 'social-square';

export type DestinationPresetId = 'youtube-landscape' | 'reels-portrait' | 'square-social';

export interface DestinationPreset {
  id: DestinationPresetId;
  label: string;
  description: string;
  templateId: string;
  captureResolution: { width: number; height: number };
  exportPresetId: LinkedExportPresetId;
  exportResolution: { width: number; height: number };
  exportFrameRate: 24 | 30 | 60;
  exportBitrate: number;
}

export const DESTINATION_PRESETS: readonly DestinationPreset[] = [
  {
    id: 'youtube-landscape',
    label: 'YouTube',
    description: '16:9 tutorial framing with balanced HD export defaults.',
    templateId: 'presentation-16x9',
    captureResolution: { width: 1920, height: 1080 },
    exportPresetId: 'balanced',
    exportResolution: { width: 1920, height: 1080 },
    exportFrameRate: 30,
    exportBitrate: 10_000_000,
  },
  {
    id: 'reels-portrait',
    label: 'Reels / TikTok',
    description: '9:16 portrait framing tuned for vertical social delivery.',
    templateId: 'social-vertical',
    captureResolution: { width: 1080, height: 1920 },
    exportPresetId: 'social-vertical',
    exportResolution: { width: 1080, height: 1920 },
    exportFrameRate: 30,
    exportBitrate: 10_000_000,
  },
  {
    id: 'square-social',
    label: 'Square Social',
    description: '1:1 talking-head framing for feeds and carousel videos.',
    templateId: 'talking-head',
    captureResolution: { width: 1080, height: 1080 },
    exportPresetId: 'social-square',
    exportResolution: { width: 1080, height: 1080 },
    exportFrameRate: 30,
    exportBitrate: 10_000_000,
  },
];

export function getDestinationPreset(
  presetId: DestinationPresetId,
): DestinationPreset | undefined {
  return DESTINATION_PRESETS.find((preset) => preset.id === presetId);
}

export function isDestinationPresetId(value: string | null | undefined): value is DestinationPresetId {
  return Boolean(value && DESTINATION_PRESETS.some((preset) => preset.id === value));
}

export function matchDestinationPreset(params: {
  templateId: string | null | undefined;
  captureResolution: { width: number; height: number };
  exportSettings: {
    resolution: { width: number; height: number };
    frameRate: number;
    bitrate: number;
  };
}): DestinationPreset | null {
  return (
    DESTINATION_PRESETS.find((preset) => {
      return (
        preset.templateId === params.templateId &&
        preset.captureResolution.width === params.captureResolution.width &&
        preset.captureResolution.height === params.captureResolution.height &&
        preset.exportResolution.width === params.exportSettings.resolution.width &&
        preset.exportResolution.height === params.exportSettings.resolution.height &&
        preset.exportFrameRate === params.exportSettings.frameRate &&
        preset.exportBitrate === params.exportSettings.bitrate
      );
    }) ?? null
  );
}
