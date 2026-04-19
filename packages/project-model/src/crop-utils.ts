import type { RegionCrop } from './types.js';

function clampCropToSource(crop: RegionCrop, sourceWidth: number, sourceHeight: number): RegionCrop {
  const width = Math.max(1, Math.min(crop.width, sourceWidth));
  const height = Math.max(1, Math.min(crop.height, sourceHeight));
  const x = Math.max(0, Math.min(crop.x, sourceWidth - width));
  const y = Math.max(0, Math.min(crop.y, sourceHeight - height));

  return {
    ...crop,
    x,
    y,
    width,
    height,
  };
}

/**
 * Older Record-tab builds stored crop coordinates in template-space rather than
 * source-space. When we know that legacy reference size, scale the crop back
 * into the recording's real pixel dimensions before rendering/editing/exporting.
 */
export function normalizeRegionCrop(
  crop: RegionCrop | undefined,
  sourceWidth: number,
  sourceHeight: number,
  legacyWidth?: number,
  legacyHeight?: number,
): RegionCrop | undefined {
  if (!crop) return undefined;
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return crop;

  const hasLegacyBounds =
    Number.isFinite(legacyWidth) &&
    Number.isFinite(legacyHeight) &&
    (legacyWidth ?? 0) > 0 &&
    (legacyHeight ?? 0) > 0;

  if (!hasLegacyBounds) {
    return clampCropToSource(crop, sourceWidth, sourceHeight);
  }

  const legacyW = legacyWidth as number;
  const legacyH = legacyHeight as number;
  const fitsLegacyBounds =
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= legacyW + 0.5 &&
    crop.y + crop.height <= legacyH + 0.5;
  const sourceDiffersFromLegacy =
    Math.abs(sourceWidth - legacyW) > 0.5 || Math.abs(sourceHeight - legacyH) > 0.5;

  if (!fitsLegacyBounds || !sourceDiffersFromLegacy) {
    return clampCropToSource(crop, sourceWidth, sourceHeight);
  }

  return clampCropToSource(
    {
      ...crop,
      x: Math.round((crop.x / legacyW) * sourceWidth),
      y: Math.round((crop.y / legacyH) * sourceHeight),
      width: Math.round((crop.width / legacyW) * sourceWidth),
      height: Math.round((crop.height / legacyH) * sourceHeight),
    },
    sourceWidth,
    sourceHeight,
  );
}
