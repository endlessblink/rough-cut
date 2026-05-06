// Cursor polygon path matching the styled-export ASS shape:
// m 0 0 l 0 26 l 7 20 l 12 33 l 18 31 l 13 19 l 24 19 l 0 0
const CURSOR_POLYGON = [
  [0, 0],
  [0, 26],
  [7, 20],
  [12, 33],
  [18, 31],
  [13, 19],
  [24, 19],
];

const CURSOR_FILL = '#ffffff';
const CURSOR_OUTLINE = '#333A46';
const CURSOR_OUTLINE_WIDTH = 2.2;
const CLICK_RING_DURATION_FRAMES = 12;

export function cursorAtFrame(cursorEvents, currentFrame) {
  if (!Array.isArray(cursorEvents) || cursorEvents.length === 0) return null;
  if (!Number.isFinite(currentFrame)) return null;

  // Filter to move events with finite numeric coords; tolerate other event types.
  const sorted = cursorEvents
    .filter(
      (event) =>
        event &&
        (event.type === undefined || event.type === 'move') &&
        Number.isFinite(event.frame) &&
        Number.isFinite(event.x) &&
        Number.isFinite(event.y),
    )
    .slice()
    .sort((a, b) => a.frame - b.frame);

  if (sorted.length === 0) return null;
  if (currentFrame <= sorted[0].frame) return { x: sorted[0].x, y: sorted[0].y };
  if (currentFrame >= sorted[sorted.length - 1].frame) {
    const last = sorted[sorted.length - 1];
    return { x: last.x, y: last.y };
  }

  // Binary search for the bracketing pair.
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].frame <= currentFrame) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo];
  const b = sorted[hi];
  const span = b.frame - a.frame;
  if (span <= 0) return { x: a.x, y: a.y };
  const t = (currentFrame - a.frame) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function drawCursorPath(ctx, x, y) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(x + CURSOR_POLYGON[0][0], y + CURSOR_POLYGON[0][1]);
  for (let i = 1; i < CURSOR_POLYGON.length; i += 1) {
    ctx.lineTo(x + CURSOR_POLYGON[i][0], y + CURSOR_POLYGON[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = CURSOR_FILL;
  ctx.fill();
  ctx.strokeStyle = CURSOR_OUTLINE;
  ctx.lineWidth = CURSOR_OUTLINE_WIDTH;
  ctx.stroke();
}

export function activeClickEmphasisAtFrame(cursorEvents, currentFrame, durationFrames = CLICK_RING_DURATION_FRAMES) {
  if (!Array.isArray(cursorEvents) || !Number.isFinite(currentFrame)) return [];
  const duration = Number.isFinite(durationFrames) && durationFrames > 0 ? durationFrames : CLICK_RING_DURATION_FRAMES;
  return cursorEvents
    .filter((event) => event && event.type === 'down' && Number.isFinite(event.frame) && Number.isFinite(event.x) && Number.isFinite(event.y))
    .map((event) => {
      const ageFrames = currentFrame - event.frame;
      if (ageFrames < 0 || ageFrames > duration) return null;
      const progress = ageFrames / duration;
      return {
        x: event.x,
        y: event.y,
        progress,
        radius: 14 + progress * 18,
        alpha: Math.max(0, 0.72 * (1 - progress)),
      };
    })
    .filter(Boolean);
}

export function drawClickEmphasis(ctx, cursorEvents, currentFrame) {
  if (!ctx) return;
  const rings = activeClickEmphasisAtFrame(cursorEvents, currentFrame);
  for (const ring of rings) {
    ctx.save();
    ctx.globalAlpha = ring.alpha;
    ctx.strokeStyle = '#7AA7FF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function coverSourceRect(sourceWidth, sourceHeight, destWidth, destHeight) {
  if (![sourceWidth, sourceHeight, destWidth, destHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const destAspect = destWidth / destHeight;
  if (sourceAspect > destAspect) {
    const width = sourceHeight * destAspect;
    return {
      sx: (sourceWidth - width) / 2,
      sy: 0,
      sw: width,
      sh: sourceHeight,
    };
  }
  const height = sourceWidth / destAspect;
  return {
    sx: 0,
    sy: (sourceHeight - height) / 2,
    sw: sourceWidth,
    sh: height,
  };
}
