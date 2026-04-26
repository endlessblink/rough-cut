import type { CameraAspectRatio, NormalizedRect } from '@rough-cut/project-model';

export function cameraAspectRatioValue(ratio: CameraAspectRatio): number {
  switch (ratio) {
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '16:9':
    default:
      return 16 / 9;
  }
}

export function reshapeNormalizedCameraFrameToAspect(
  frame: NormalizedRect,
  targetAspect: number,
  canvasAspect: number,
): NormalizedRect {
  if (frame.w <= 0 || frame.h <= 0 || targetAspect <= 0 || canvasAspect <= 0) return frame;

  const currentAspect = (frame.w / frame.h) * canvasAspect;
  let nextW = frame.w;
  let nextH = frame.h;

  if (currentAspect > targetAspect) {
    nextW = frame.h * (targetAspect / canvasAspect);
  } else {
    nextH = frame.w * (canvasAspect / targetAspect);
  }

  return {
    x: frame.x + (frame.w - nextW) / 2,
    y: frame.y + (frame.h - nextH) / 2,
    w: nextW,
    h: nextH,
  };
}
