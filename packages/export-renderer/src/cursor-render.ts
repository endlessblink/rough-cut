import type { CursorPresentation } from '@rough-cut/project-model';

export interface CursorFrameData {
  readonly frames: Float32Array;
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

interface RawCursorEvent {
  frame: number;
  x: number;
  y: number;
  type: string;
  button: number;
}

export interface CursorRenderContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

const CLICK_EFFECT_DURATION_MS = 400;
const CURSOR_COLOR = 'rgba(255, 255, 255, 0.95)';
const CURSOR_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)';

export function parseNdjsonCursorEvents(ndjson: string): RawCursorEvent[] {
  return ndjson
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RawCursorEvent);
}

function scoreInBounds(
  events: readonly RawCursorEvent[],
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
): number {
  let count = 0;
  for (const event of events) {
    const x = event.x - offsetX;
    const y = event.y - offsetY;
    if (x >= 0 && x <= width && y >= 0 && y <= height) count += 1;
  }
  return count;
}

function normalizeCursorEvents(
  events: readonly RawCursorEvent[],
  sourceWidth: number,
  sourceHeight: number,
): readonly RawCursorEvent[] {
  if (events.length === 0 || sourceWidth <= 0 || sourceHeight <= 0) return events;

  const localScore = scoreInBounds(events, sourceWidth, sourceHeight, 0, 0);
  if (localScore === events.length) return events;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const event of events) {
    if (event.x < minX) minX = event.x;
    if (event.y < minY) minY = event.y;
    if (event.x > maxX) maxX = event.x;
    if (event.y > maxY) maxY = event.y;
  }

  const rangeXStart = Math.max(0, maxX - sourceWidth);
  const rangeXEnd = Math.max(0, minX);
  const rangeYStart = Math.max(0, maxY - sourceHeight);
  const rangeYEnd = Math.max(0, minY);
  if (rangeXStart > rangeXEnd || rangeYStart > rangeYEnd) return events;

  const guessedOffsetX = Math.round((rangeXStart + rangeXEnd) / 2);
  const guessedOffsetY = Math.round((rangeYStart + rangeYEnd) / 2);
  const guessedScore = scoreInBounds(
    events,
    sourceWidth,
    sourceHeight,
    guessedOffsetX,
    guessedOffsetY,
  );

  if (guessedScore <= localScore || guessedScore < Math.ceil(events.length * 0.8)) return events;

  return events.map((event) => ({
    ...event,
    x: event.x - guessedOffsetX,
    y: event.y - guessedOffsetY,
  }));
}

export function buildCursorFrameData(
  events: readonly RawCursorEvent[],
  totalFrames: number,
  sourceWidth: number,
  sourceHeight: number,
): CursorFrameData {
  const frames = new Float32Array(totalFrames * 3);
  frames.fill(-1);
  const sorted = [...normalizeCursorEvents(events, sourceWidth, sourceHeight)].sort(
    (a, b) => a.frame - b.frame,
  );

  for (const e of sorted) {
    if (e.frame < 0 || e.frame >= totalFrames) continue;
    const idx = e.frame * 3;
    frames[idx] = e.x / sourceWidth;
    frames[idx + 1] = e.y / sourceHeight;
    if (e.type === 'down') {
      frames[idx + 2] = 1;
    } else if (frames[idx + 2]! < 0) {
      frames[idx + 2] = 0;
    }
  }

  let lastKnownFrame = -1;
  for (let f = 0; f < totalFrames; f++) {
    const idx = f * 3;
    if (frames[idx]! >= 0) {
      if (lastKnownFrame >= 0 && f - lastKnownFrame > 1) {
        const startIdx = lastKnownFrame * 3;
        const endIdx = idx;
        const gap = f - lastKnownFrame;
        for (let g = 1; g < gap; g++) {
          const t = g / gap;
          const gIdx = (lastKnownFrame + g) * 3;
          frames[gIdx] = frames[startIdx]! + (frames[endIdx]! - frames[startIdx]!) * t;
          frames[gIdx + 1] =
            frames[startIdx + 1]! + (frames[endIdx + 1]! - frames[startIdx + 1]!) * t;
          frames[gIdx + 2] = 0;
        }
      }
      lastKnownFrame = f;
    }
  }

  if (lastKnownFrame >= 0) {
    let firstKnown = 0;
    while (firstKnown < totalFrames && frames[firstKnown * 3]! < 0) firstKnown++;

    if (firstKnown > 0 && firstKnown < totalFrames) {
      const srcIdx = firstKnown * 3;
      for (let f = 0; f < firstKnown; f++) {
        const idx = f * 3;
        frames[idx] = frames[srcIdx]!;
        frames[idx + 1] = frames[srcIdx + 1]!;
        frames[idx + 2] = 0;
      }
    }

    if (lastKnownFrame < totalFrames - 1) {
      const srcIdx = lastKnownFrame * 3;
      for (let f = lastKnownFrame + 1; f < totalFrames; f++) {
        const idx = f * 3;
        frames[idx] = frames[srcIdx]!;
        frames[idx + 1] = frames[srcIdx + 1]!;
        frames[idx + 2] = 0;
      }
    }
  }

  return { frames, frameCount: totalFrames, sourceWidth, sourceHeight };
}

export async function loadCursorFrameData(
  cursorEventsPath: string,
  totalFrames: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<CursorFrameData | null> {
  const response = await fetch(`media://${cursorEventsPath}`);
  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  return buildCursorFrameData(
    parseNdjsonCursorEvents(text),
    totalFrames,
    sourceWidth,
    sourceHeight,
  );
}

function getCursorAtFrame(
  data: CursorFrameData,
  sourceFrame: number,
): { x: number; y: number; isClick: boolean } | null {
  const frame = Math.max(0, Math.min(sourceFrame, data.frameCount - 1));
  const idx = frame * 3;
  if (idx + 2 >= data.frames.length) return null;
  const x = data.frames[idx]!;
  const y = data.frames[idx + 1]!;
  const isClick = data.frames[idx + 2]! > 0.5;
  if (x < 0 || y < 0) return null;
  return { x, y, isClick };
}

function applyZoomToPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  return {
    x: width / 2 + scale * (x * width - width / 2) + offsetX,
    y: height / 2 + scale * (y * height - height / 2) + offsetY,
  };
}

function applyCropToPoint(
  x: number,
  y: number,
  data: CursorFrameData,
  crop: { enabled?: boolean; x: number; y: number; width: number; height: number } | undefined,
): { x: number; y: number; scale: number } | null {
  if (!crop?.enabled) return { x, y, scale: 1 };

  const px = x * data.sourceWidth;
  const py = y * data.sourceHeight;
  if (px < crop.x || px > crop.x + crop.width || py < crop.y || py > crop.y + crop.height) {
    return null;
  }

  return {
    x: (px - crop.x) / crop.width,
    y: (py - crop.y) / crop.height,
    scale: data.sourceWidth / crop.width,
  };
}

function drawCursor(
  ctx: CursorRenderContext,
  px: number,
  py: number,
  size: number,
  style: string,
): void {
  ctx.save();
  ctx.translate(px, py);
  const s = size / 20;

  ctx.shadowColor = CURSOR_SHADOW_COLOR;
  ctx.shadowBlur = 3 * s;
  ctx.shadowOffsetX = 1 * s;
  ctx.shadowOffsetY = 1 * s;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18 * s);
  ctx.lineTo(5 * s, 14 * s);
  ctx.lineTo(9 * s, 22 * s);
  ctx.lineTo(12 * s, 20 * s);
  ctx.lineTo(8 * s, 12 * s);
  ctx.lineTo(14 * s, 12 * s);
  ctx.closePath();
  ctx.fillStyle = CURSOR_COLOR;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 1 * s;
  ctx.stroke();

  if (style === 'spotlight') {
    ctx.beginPath();
    ctx.arc(0, 0, 30 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 200, 0.12)';
    ctx.fill();
  }

  ctx.restore();
}

function drawClickEffect(
  ctx: CursorRenderContext,
  x: number,
  y: number,
  ageMs: number,
  effectType: string,
  radiusScale: number,
): void {
  if (ageMs < 0 || ageMs > CLICK_EFFECT_DURATION_MS) return;
  const progress = ageMs / CLICK_EFFECT_DURATION_MS;
  const alpha = 1 - progress;
  const radius = (8 + progress * 30) * radiusScale;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (effectType === 'ripple') {
    ctx.fillStyle = `rgba(100, 150, 255, ${(0.6 * alpha).toFixed(2)})`;
    ctx.fill();
  } else if (effectType === 'ring') {
    ctx.strokeStyle = `rgba(100, 150, 255, ${(0.8 * alpha).toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function renderCursorOverlay(
  ctx: CursorRenderContext,
  cursorData: CursorFrameData,
  sourceFrame: number,
  width: number,
  height: number,
  presentation: CursorPresentation,
  scale: number,
  offsetX: number,
  offsetY: number,
  frameRate: number,
  crop?: { enabled?: boolean; x: number; y: number; width: number; height: number },
): void {
  const cursor = getCursorAtFrame(cursorData, sourceFrame);
  if (!cursor) return;

  const croppedCursor = applyCropToPoint(cursor.x, cursor.y, cursorData, crop);
  if (!croppedCursor) return;

  const point = applyZoomToPoint(
    croppedCursor.x,
    croppedCursor.y,
    width,
    height,
    scale,
    offsetX,
    offsetY,
  );
  const cursorSize = (presentation.sizePercent / 100) * 20 * croppedCursor.scale * scale;
  const clickWindowFrames = Math.ceil((CLICK_EFFECT_DURATION_MS / 1000) * frameRate);

  if (presentation.clickEffect !== 'none') {
    for (let frame = Math.max(0, sourceFrame - clickWindowFrames); frame <= sourceFrame; frame++) {
      const pastCursor = getCursorAtFrame(cursorData, frame);
      if (!pastCursor?.isClick) continue;
      const croppedEffect = applyCropToPoint(pastCursor.x, pastCursor.y, cursorData, crop);
      if (!croppedEffect) continue;
      const effectPoint = applyZoomToPoint(
        croppedEffect.x,
        croppedEffect.y,
        width,
        height,
        scale,
        offsetX,
        offsetY,
      );
      drawClickEffect(
        ctx,
        effectPoint.x,
        effectPoint.y,
        ((sourceFrame - frame) / frameRate) * 1000,
        presentation.clickEffect,
        croppedEffect.scale * scale,
      );
    }
  }

  drawCursor(ctx, point.x, point.y, cursorSize, presentation.style);
}
