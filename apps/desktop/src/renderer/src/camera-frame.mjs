export function resizeFrameToAspect(frame, frameAspect, canvasAspectRatio) {
  const [canvasW, canvasH] = aspectRatioDims(canvasAspectRatio);
  const target = cameraAspectValue(frameAspect);
  const centerX = frame.x + frame.w / 2;
  const centerY = frame.y + frame.h / 2;
  const pixelW = frame.w * canvasW;
  const pixelH = frame.h * canvasH;
  const pixelArea = Math.max(1, pixelW * pixelH);
  let nextPixelW = Math.sqrt(pixelArea * target);
  let nextPixelH = nextPixelW / target;
  const minPixelW = canvasW * 0.05;
  const minPixelH = canvasH * 0.05;
  const minScale = Math.max(1, minPixelW / nextPixelW, minPixelH / nextPixelH);
  nextPixelW *= minScale;
  nextPixelH *= minScale;
  const fitScale = Math.min(1, canvasW / nextPixelW, canvasH / nextPixelH);
  nextPixelW *= fitScale;
  nextPixelH *= fitScale;
  const nextW = Math.max(0.05, Math.min(1, nextPixelW / canvasW));
  const nextH = Math.max(0.05, Math.min(1, nextPixelH / canvasH));
  return {
    x: Math.max(0, Math.min(1 - nextW, centerX - nextW / 2)),
    y: Math.max(0, Math.min(1 - nextH, centerY - nextH / 2)),
    w: nextW,
    h: nextH,
  };
}

export function shouldCropAspectResizeFrame({ nextAspect, cameraShape, frameAspect }) {
  return nextAspect !== 'free' && cameraShape !== 'circle' && frameAspect === 'free';
}

export function moveFrameToCameraPosition(frame, position, canvasAspectRatio) {
  const current = clampNormalizedFrame(frame);
  if (position === 'center') {
    return clampNormalizedFrame({
      ...current,
      x: (1 - current.w) / 2,
      y: (1 - current.h) / 2,
    });
  }
  const [canvasW, canvasH] = aspectRatioDims(canvasAspectRatio);
  const marginPx = Math.min(canvasW, canvasH) * 0.06;
  const marginX = marginPx / canvasW;
  const marginY = marginPx / canvasH;
  const left = position === 'corner-tl' || position === 'corner-bl';
  const top = position === 'corner-tl' || position === 'corner-tr';
  return clampNormalizedFrame({
    ...current,
    x: left ? marginX : 1 - current.w - marginX,
    y: top ? marginY : 1 - current.h - marginY,
  });
}

export function resizeFrameToCameraSize(frame, previousSize, nextSize) {
  const current = clampNormalizedFrame(frame);
  const scale = Math.max(0.25, Math.min(4, nextSize / Math.max(1, previousSize || 100)));
  const centerX = current.x + current.w / 2;
  const centerY = current.y + current.h / 2;
  const nextW = Math.max(0.05, Math.min(1, current.w * scale));
  const nextH = Math.max(0.05, Math.min(1, current.h * scale));
  return clampNormalizedFrame({
    x: centerX - nextW / 2,
    y: centerY - nextH / 2,
    w: nextW,
    h: nextH,
  });
}

export function aspectRatioDims(aspectRatio) {
  if (aspectRatio === '9:16') return [9, 16];
  if (aspectRatio === '1:1') return [1, 1];
  if (aspectRatio === '4:3') return [4, 3];
  if (aspectRatio === '3:4') return [3, 4];
  if (aspectRatio === '4:5') return [4, 5];
  return [16, 9];
}

function cameraAspectValue(aspect) {
  if (aspect === '16:9') return 16 / 9;
  if (aspect === '9:16') return 9 / 16;
  if (aspect === '4:3') return 4 / 3;
  return 1;
}

function clampNormalizedFrame(frame) {
  const w = Math.max(0.05, Math.min(1, Number.isFinite(frame.w) ? frame.w : 0.2));
  const h = Math.max(0.05, Math.min(1, Number.isFinite(frame.h) ? frame.h : 0.2));
  return {
    x: Math.max(0, Math.min(1 - w, Number.isFinite(frame.x) ? frame.x : 0)),
    y: Math.max(0, Math.min(1 - h, Number.isFinite(frame.y) ? frame.y : 0)),
    w,
    h,
  };
}
