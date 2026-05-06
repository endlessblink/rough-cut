import { createDefaultRecordingBackgroundStyle } from './factories.js';
import type { RecordingBackgroundStyle } from './types.js';

export interface RecordingBackgroundPreset {
  readonly id: string;
  readonly label: string;
  readonly style: RecordingBackgroundStyle;
}

const defaultBackground = createDefaultRecordingBackgroundStyle();

export const RECORDING_BACKGROUND_PRESETS: readonly RecordingBackgroundPreset[] = [
  {
    id: 'coral-folds',
    label: 'Coral folds',
    style: {
      ...defaultBackground,
      bgColor: '#c96517',
      bgGradient: 'linear-gradient(135deg, #b85a16 0%, #d87424 30%, #c65263 68%, #d66bb1 100%)',
      bgImage: 'backgrounds/pexels-steve-29139964.jpg',
      bgPadding: 104,
      bgCornerRadius: 34,
      bgShadowBlur: 64,
      bgShadowOpacity: 0.28,
    },
  },
  {
    id: 'graphite-contours',
    label: 'Graphite contours',
    style: {
      ...defaultBackground,
      bgColor: '#242424',
      bgGradient: 'linear-gradient(135deg, #101010 0%, #252525 38%, #525252 68%, #1c1c1c 100%)',
      bgImage: 'backgrounds/dark-waves.png',
      bgPadding: 88,
      bgCornerRadius: 26,
      bgShadowBlur: 48,
      bgShadowOpacity: 0.34,
    },
  },
  {
    id: 'soft-blur',
    label: 'Soft blur',
    style: {
      ...defaultBackground,
      bgColor: '#cfd5e4',
      bgGradient: 'linear-gradient(135deg, #72c9e8 0%, #eff1f7 34%, #c9cedf 68%, #293223 100%)',
      bgImage: 'backgrounds/pexels-codioful-6985039.jpg',
      bgPadding: 112,
      bgCornerRadius: 42,
      bgShadowBlur: 74,
      bgShadowOpacity: 0.3,
    },
  },
  {
    id: 'black-sand',
    label: 'Black sand',
    style: {
      ...defaultBackground,
      bgColor: '#151515',
      bgGradient: 'linear-gradient(135deg, #090909 0%, #1a1a1a 36%, #343434 62%, #101010 100%)',
      bgImage: 'backgrounds/pexels-njeromin-12734294.jpg',
      bgPadding: 72,
      bgCornerRadius: 18,
      bgShadowBlur: 38,
      bgShadowOpacity: 0.26,
    },
  },
  {
    id: 'aqua-haze',
    label: 'Aqua haze',
    style: {
      ...defaultBackground,
      bgColor: '#bdeff4',
      bgGradient: 'linear-gradient(135deg, #095eea 0%, #70d6f2 26%, #dff7c2 52%, #fff7dc 74%, #e84cc9 100%)',
      bgImage: 'backgrounds/pexels-codioful-7135120.jpg',
      bgPadding: 96,
      bgCornerRadius: 32,
      bgShadowBlur: 58,
      bgShadowOpacity: 0.2,
    },
  },
  {
    id: 'mint-depth',
    label: 'Mint depth',
    style: {
      ...defaultBackground,
      bgColor: '#6bc8a6',
      bgGradient: 'linear-gradient(135deg, #d8efd1 0%, #9fd8c0 28%, #55ba91 56%, #00516b 100%)',
      bgImage: 'backgrounds/pexels-codioful-6985129.jpg',
      bgPadding: 96,
      bgCornerRadius: 32,
      bgShadowBlur: 58,
      bgShadowOpacity: 0.2,
    },
  },
  {
    id: 'violet-dusk',
    label: 'Violet dusk',
    style: {
      ...defaultBackground,
      bgColor: '#5b3150',
      bgGradient: 'linear-gradient(135deg, #24120c 0%, #6f3f55 28%, #d9cff0 48%, #8b4aa0 68%, #2a130f 100%)',
      bgImage: 'backgrounds/pexels-codioful-7130535.jpg',
      bgPadding: 96,
      bgCornerRadius: 32,
      bgShadowBlur: 58,
      bgShadowOpacity: 0.2,
    },
  },
  {
    id: 'amber-folds',
    label: 'Amber folds',
    style: {
      ...defaultBackground,
      bgColor: '#c36524',
      bgGradient: 'linear-gradient(135deg, #b45615 0%, #d8832c 36%, #c85b68 68%, #ce65aa 100%)',
      bgImage: 'backgrounds/pexels-steve-29097443.jpg',
      bgPadding: 96,
      bgCornerRadius: 32,
      bgShadowBlur: 58,
      bgShadowOpacity: 0.2,
    },
  },
  {
    id: 'pink-folds',
    label: 'Pink folds',
    style: {
      ...defaultBackground,
      bgColor: '#c86182',
      bgGradient: 'linear-gradient(135deg, #bf641e 0%, #d57734 34%, #c7547d 68%, #d071b6 100%)',
      bgImage: 'backgrounds/pexels-steve-29101878.jpg',
      bgPadding: 96,
      bgCornerRadius: 32,
      bgShadowBlur: 58,
      bgShadowOpacity: 0.2,
    },
  },
];

export function applyRecordingBackgroundPreset(
  current: Partial<RecordingBackgroundStyle> | undefined,
  presetId: string,
): RecordingBackgroundStyle {
  const preset = RECORDING_BACKGROUND_PRESETS.find((item) => item.id === presetId);
  const base = { ...defaultBackground, ...(current ?? {}) };
  if (!preset) {
    return base;
  }
  return {
    ...base,
    bgColor: preset.style.bgColor,
    bgGradient: preset.style.bgGradient,
    bgImage: preset.style.bgImage,
  };
}

export function getRecordingBackgroundPreset(presetId: string): RecordingBackgroundPreset | undefined {
  return RECORDING_BACKGROUND_PRESETS.find((preset) => preset.id === presetId);
}

export function getRecordingBackgroundColors(background: Partial<RecordingBackgroundStyle> | undefined): readonly [string, string] {
  const fallback = background?.bgColor ?? defaultBackground.bgColor;
  const gradientColors = background?.bgGradient?.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  if (gradientColors.length >= 2) {
    return [gradientColors[0] ?? fallback, gradientColors.at(-1) ?? fallback];
  }
  return [fallback, fallback];
}
