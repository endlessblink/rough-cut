import type { CameraAspectRatio, CameraPresentation } from '@rough-cut/project-model';

export interface CameraLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const BASE_CAMERA_WIDTH_FRACTION = 0.24;
const CAMERA_MARGIN_FRACTION = 0.04;
const MAX_ROUNDED_RADIUS_FRACTION_BY_ASPECT: Record<CameraAspectRatio, number> = {
  '16:9': 0.06,
  '1:1': 0.14,
  '9:16': 0.06,
  '4:3': 0.1,
};

function clampRoundness(roundness: number): number {
  return Math.max(0, Math.min(100, roundness));
}

function getMaxRoundedRadiusFraction(camera: CameraPresentation): number {
  return MAX_ROUNDED_RADIUS_FRACTION_BY_ASPECT[camera.aspectRatio];
}

export function getCameraAspectRatioValue(camera: CameraPresentation): number {
  if (camera.shape === 'circle') return 1;

  switch (camera.aspectRatio) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '4:3':
      return 4 / 3;
    case '1:1':
    default:
      return 1;
  }
}

export function getCameraAspectRatioCss(camera: CameraPresentation): string {
  const ratio = getCameraAspectRatioValue(camera);
  if (ratio === 1) return '1 / 1';
  if (ratio === 16 / 9) return '16 / 9';
  if (ratio === 9 / 16) return '9 / 16';
  return '4 / 3';
}

export function getCameraLayoutRect(
  camera: CameraPresentation,
  canvasWidth: number,
  canvasHeight: number,
): CameraLayoutRect {
  const width = canvasWidth * BASE_CAMERA_WIDTH_FRACTION * (camera.size / 100);
  const height = width / getCameraAspectRatioValue(camera);
  const marginX = canvasWidth * CAMERA_MARGIN_FRACTION;
  const marginY = canvasHeight * CAMERA_MARGIN_FRACTION;

  let x = canvasWidth - marginX - width;
  let y = canvasHeight - marginY - height;

  switch (camera.position) {
    case 'corner-tl':
      x = marginX;
      y = marginY;
      break;
    case 'corner-tr':
      x = canvasWidth - marginX - width;
      y = marginY;
      break;
    case 'corner-bl':
      x = marginX;
      y = canvasHeight - marginY - height;
      break;
    case 'center':
      x = (canvasWidth - width) / 2;
      y = (canvasHeight - height) / 2;
      break;
    case 'corner-br':
    default:
      break;
  }

  return { x, y, width, height };
}

export function getCameraBorderRadius(
  camera: CameraPresentation,
  width: number,
  height: number,
): number {
  if (camera.shape === 'square') return 0;
  if (camera.shape === 'circle') return Math.min(width, height) / 2;
  return Math.min(width, height) * getMaxRoundedRadiusFraction(camera) * (clampRoundness(camera.roundness) / 100);
}

export function getCameraBorderRadiusCss(camera: CameraPresentation): string {
  if (camera.shape === 'square') return '0';
  if (camera.shape === 'circle') return '50%';
  return `${getMaxRoundedRadiusFraction(camera) * clampRoundness(camera.roundness)}%`;
}
