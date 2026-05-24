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

export function cursorAtTimeMs(cursorEvents, currentTimeMs, fps = 30) {
  if (!Array.isArray(cursorEvents) || cursorEvents.length === 0) return null;
  if (!Number.isFinite(currentTimeMs)) return null;

  const fpsValue = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const sorted = cursorEvents
    .map((event) => {
      if (!event || (event.type !== undefined && event.type !== 'move')) return null;
      if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return null;
      const timeMs = Number.isFinite(event.timeMs)
        ? event.timeMs
        : Number.isFinite(event.frame)
          ? (event.frame / fpsValue) * 1000
          : Number.NaN;
      return Number.isFinite(timeMs) ? { timeMs, x: event.x, y: event.y } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.timeMs - b.timeMs);

  if (sorted.length === 0) return null;
  if (currentTimeMs <= sorted[0].timeMs) return { x: sorted[0].x, y: sorted[0].y };
  if (currentTimeMs >= sorted[sorted.length - 1].timeMs) {
    const last = sorted[sorted.length - 1];
    return { x: last.x, y: last.y };
  }

  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].timeMs <= currentTimeMs) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo];
  const b = sorted[hi];
  const span = b.timeMs - a.timeMs;
  if (span <= 0) return { x: a.x, y: a.y };
  const t = (currentTimeMs - a.timeMs) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function getCursorBoundsStatus(cursor, sourceWidth, sourceHeight) {
  if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return null;
  const width = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1920;
  const height = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1080;
  const outsideLeft = cursor.x < 0;
  const outsideRight = cursor.x > width;
  const outsideTop = cursor.y < 0;
  const outsideBottom = cursor.y > height;
  if (!outsideLeft && !outsideRight && !outsideTop && !outsideBottom) {
    return { inside: true, side: 'inside', distance: 0 };
  }

  const distances = [
    outsideLeft ? { side: 'left', distance: -cursor.x } : null,
    outsideRight ? { side: 'right', distance: cursor.x - width } : null,
    outsideTop ? { side: 'top', distance: -cursor.y } : null,
    outsideBottom ? { side: 'bottom', distance: cursor.y - height } : null,
  ].filter(Boolean);
  distances.sort((a, b) => b.distance - a.distance);
  return { inside: false, side: distances[0].side, distance: distances[0].distance };
}

export function drawCursorPath(ctx, x, y, options = {}) {
  if (!ctx) return;
  const style = options.style === 'subtle' || options.style === 'spotlight' ? options.style : 'default';
  const rawSize = Number.isFinite(options.sizePercent) ? options.sizePercent : 100;
  const scale = Math.max(0.5, Math.min(1.5, rawSize / 100));

  if (style === 'spotlight' && typeof ctx.save === 'function') {
    ctx.save();
    if (typeof ctx.beginPath === 'function') ctx.beginPath();
    if (typeof ctx.arc === 'function') ctx.arc(x + 12 * scale, y + 16 * scale, 36 * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(122, 167, 255, 0.22)';
    if (typeof ctx.fill === 'function') ctx.fill();
    if (typeof ctx.restore === 'function') ctx.restore();
  }

  if (style === 'subtle' && typeof ctx.save === 'function') ctx.save();
  if (style === 'subtle') ctx.globalAlpha = 0.6;

  ctx.beginPath();
  ctx.moveTo(x + CURSOR_POLYGON[0][0] * scale, y + CURSOR_POLYGON[0][1] * scale);
  for (let i = 1; i < CURSOR_POLYGON.length; i += 1) {
    ctx.lineTo(x + CURSOR_POLYGON[i][0] * scale, y + CURSOR_POLYGON[i][1] * scale);
  }
  ctx.closePath();
  ctx.fillStyle = CURSOR_FILL;
  ctx.fill();
  ctx.strokeStyle = style === 'spotlight' ? '#7AA7FF' : CURSOR_OUTLINE;
  ctx.lineWidth = (style === 'spotlight' ? CURSOR_OUTLINE_WIDTH * 1.6 : CURSOR_OUTLINE_WIDTH) * scale;
  ctx.stroke();

  if (style === 'subtle' && typeof ctx.restore === 'function') ctx.restore();
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

export function drawClickEmphasis(ctx, cursorEvents, currentFrame, clickEffect = 'ring') {
  if (!ctx) return;
  if (clickEffect === 'none') return;
  const rings = activeClickEmphasisAtFrame(cursorEvents, currentFrame);
  for (const ring of rings) {
    ctx.save();
    ctx.globalAlpha = ring.alpha;
    if (clickEffect === 'ripple') {
      ctx.fillStyle = 'rgba(122, 167, 255, 0.32)';
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      if (typeof ctx.fill === 'function') ctx.fill();
    } else {
      ctx.strokeStyle = '#7AA7FF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function clampedCameraTime(sourceTimeSec, cameraOffsetSec, cameraDurationSec, frameRate = 30) {
  const requested = (Number.isFinite(sourceTimeSec) ? sourceTimeSec : 0) + (Number.isFinite(cameraOffsetSec) ? cameraOffsetSec : 0);
  if (!Number.isFinite(cameraDurationSec) || cameraDurationSec <= 0) return Math.max(0, requested);
  const frameSlack = 1 / (Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30);
  const maxCameraTime = Math.max(0, cameraDurationSec - frameSlack);
  return Math.max(0, Math.min(requested, maxCameraTime));
}

export function cameraCoversSourceTime(sourceTimeSec, cameraOffsetSec, cameraDurationSec, frameRate = 30) {
  if (!Number.isFinite(cameraDurationSec) || cameraDurationSec <= 0) return true;
  const requested = (Number.isFinite(sourceTimeSec) ? sourceTimeSec : 0) + (Number.isFinite(cameraOffsetSec) ? cameraOffsetSec : 0);
  const frameSlack = 1 / (Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30);
  return requested <= Math.max(0, cameraDurationSec - frameSlack);
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

export function frameResizeHandles(rect) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return [
    { handle: 'nw', x: rect.x, y: rect.y },
    { handle: 'n', x: cx, y: rect.y },
    { handle: 'ne', x: right, y: rect.y },
    { handle: 'e', x: right, y: cy },
    { handle: 'se', x: right, y: bottom },
    { handle: 's', x: cx, y: bottom },
    { handle: 'sw', x: rect.x, y: bottom },
    { handle: 'w', x: rect.x, y: cy },
  ];
}

export function resizeHandleAtPoint(x, y, rect) {
  const radius = Math.max(12, Math.min(24, Math.min(rect.w, rect.h) * 0.11));
  let best = null;
  for (const handle of frameResizeHandles(rect)) {
    const distance = Math.hypot(x - handle.x, y - handle.y);
    if (distance <= radius && (!best || distance < best.distance)) best = { handle: handle.handle, distance };
  }
  return best?.handle ?? null;
}

export function cursorForResizeHandle(handle) {
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

export function moveRectFromPointer(origin, xCanvas, yCanvas, canvasWidth, canvasHeight) {
  const w = origin.width / canvasWidth;
  const h = origin.height / canvasHeight;
  return {
    x: Math.max(0, Math.min(1 - w, clampUnit((xCanvas - origin.offsetX) / canvasWidth, 0))),
    y: Math.max(0, Math.min(1 - h, clampUnit((yCanvas - origin.offsetY) / canvasHeight, 0))),
    w,
    h,
  };
}

export function resizeRectFromPointer(origin, xCanvas, yCanvas, canvasWidth, canvasHeight) {
  const handle = origin.handle ?? 'se';
  const minWidth = canvasWidth * 0.05;
  const minHeight = canvasHeight * 0.05;
  const right = origin.startX + origin.width;
  const bottom = origin.startY + origin.height;
  const centerX = origin.startX + origin.width / 2;
  const centerY = origin.startY + origin.height / 2;
  const hasWest = handle.includes('w');
  const hasEast = handle.includes('e');
  const hasNorth = handle.includes('n');
  const hasSouth = handle.includes('s');
  const anchorX = hasWest ? right : hasEast ? origin.startX : centerX;
  const anchorY = hasNorth ? bottom : hasSouth ? origin.startY : centerY;
  const maxWidth = hasWest ? anchorX : hasEast ? canvasWidth - anchorX : 2 * Math.min(anchorX, canvasWidth - anchorX);
  const maxHeight = hasNorth ? anchorY : hasSouth ? canvasHeight - anchorY : 2 * Math.min(anchorY, canvasHeight - anchorY);
  const pointerWidth = hasWest || hasEast ? Math.abs(xCanvas - anchorX) : Math.abs(yCanvas - anchorY) * origin.aspect;
  const pointerHeight = hasNorth || hasSouth ? Math.abs(yCanvas - anchorY) : Math.abs(xCanvas - anchorX) / origin.aspect;
  let width = Math.max(minWidth, pointerWidth, pointerHeight * origin.aspect);
  let height = width / origin.aspect;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / origin.aspect;
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = height * origin.aspect;
  }
  width = Math.max(minWidth, width);
  height = Math.max(minHeight, height);
  const nextX = hasWest ? anchorX - width : hasEast ? anchorX : anchorX - width / 2;
  const nextY = hasNorth ? anchorY - height : hasSouth ? anchorY : anchorY - height / 2;
  return {
    x: Math.max(0, Math.min(canvasWidth - width, nextX)) / canvasWidth,
    y: Math.max(0, Math.min(canvasHeight - height, nextY)) / canvasHeight,
    w: width / canvasWidth,
    h: height / canvasHeight,
  };
}

function clampUnit(value, min = 0) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(1, value));
}

// Decide how the timeline-mode preview keeps the screen <video> (a decode
// surface) aligned with the canonical virtual clock for one draw tick. Pure so
// it can be unit-tested independently of the DOM/rAF loop.
//
// - `drift`      = video.currentTime - expectedSourceTime (seconds); + = video ahead.
// - `playing`    = playback active and the video element not paused.
// - `contiguous` = expected source frame advanced forward by <=2 frames (same
//   clip, no cut/transition/gap/scrub jump).
// - `baseRate`   = canonical timeline speed (1x, or a jog/shuttle rate).
//
// Returns: { action: 'rate', playbackRate } | { action: 'seek' } | { action: 'hold' }.
//
// Playing forward through one clip with small drift nudges playbackRate
// (deadband 20ms, clamp +/-10% of base) instead of hard-seeking, keeping frames
// smooth (the seek-stepping it replaces froze frames then jumped, which zoom
// magnified into stutter). Scrub/paused, cut/transition/gap, or large drift
// hard-seek.
export function decideTimelineVideoSync({ drift, playing, contiguous, baseRate = 1, fps = 30 }) {
  const hardSeekTolerance = Math.max(0.035, 1 / Math.max(1, fps));
  const safeDrift = Number.isFinite(drift) ? drift : 0;
  const base = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 1;

  if (playing && contiguous && Math.abs(safeDrift) <= 0.35) {
    if (Math.abs(safeDrift) < 0.02) return { action: 'rate', playbackRate: base };
    const adjust = Math.max(-0.1, Math.min(0.1, safeDrift)); // +drift (ahead) -> slow down
    return { action: 'rate', playbackRate: base * (1 - adjust) };
  }
  if (Math.abs(safeDrift) > hardSeekTolerance) {
    return { action: 'seek' };
  }
  return { action: 'hold' };
}
