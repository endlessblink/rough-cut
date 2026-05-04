import type { ProjectAspectRatio, Resolution } from './types.js';

export const PROJECT_ASPECT_RATIOS = ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '4:5'] as const satisfies readonly ProjectAspectRatio[];

export const PROJECT_ASPECT_RATIO_LABELS: Readonly<Record<ProjectAspectRatio, string>> = {
  auto: 'Auto',
  '16:9': 'Wide 16:9',
  '9:16': 'Vertical 9:16',
  '1:1': 'Square 1:1',
  '4:3': 'Classic 4:3',
  '3:4': 'Tall 3:4',
  '4:5': 'Portrait 4:5',
};

export function getProjectAspectRatioValue(
  aspectRatio: ProjectAspectRatio,
  nativeAspectRatio = 16 / 9,
): number {
  if (aspectRatio === 'auto') return nativeAspectRatio > 0 ? nativeAspectRatio : 16 / 9;
  const parts = aspectRatio.split(':').map(Number);
  const width = parts[0] ?? 0;
  const height = parts[1] ?? 0;
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

export function getStyledCanvasResolution({
  aspectRatio,
  sourceWidth = 1920,
  sourceHeight = 1080,
  longEdge = 1920,
}: {
  aspectRatio: ProjectAspectRatio;
  sourceWidth?: number;
  sourceHeight?: number;
  longEdge?: number;
}): Resolution {
  const nativeAspectRatio = sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;
  const ratio = getProjectAspectRatioValue(aspectRatio, nativeAspectRatio);
  const safeLongEdge = Math.max(2, Math.floor(longEdge / 2) * 2);

  if (ratio >= 1) {
    return {
      width: safeLongEdge,
      height: Math.max(2, Math.floor((safeLongEdge / ratio) / 2) * 2),
    };
  }

  return {
    width: Math.max(2, Math.floor((safeLongEdge * ratio) / 2) * 2),
    height: safeLongEdge,
  };
}
