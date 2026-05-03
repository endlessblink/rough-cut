import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';

// Pre-compute per-frame crop parameters via getZoomTransformAtFrame, then
// emit a sendcmd file that drives FFmpeg's crop filter parameters per
// timestamp. The same math runs in the renderer's canvas preview, so the
// export and preview agree pixel-by-pixel.
//
// resolveTrackedCursor (timeline-engine) expects getCursorPosition to return
// normalized [0, 1] coordinates. cursorAtFrame returns source pixels — we
// normalize at the boundary.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function transformToCropWindow(transform, sourceWidth, sourceHeight) {
  const scale = transform.scale;
  if (!Number.isFinite(scale) || scale <= 0) {
    return { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  }
  const offsetX = transform.translateX * sourceWidth;
  const offsetY = transform.translateY * sourceHeight;
  const w = sourceWidth / scale;
  const h = sourceHeight / scale;
  const rawX = sourceWidth / 2 - sourceWidth / (2 * scale) - offsetX / scale;
  const rawY = sourceHeight / 2 - sourceHeight / (2 * scale) - offsetY / scale;
  const x = clamp(rawX, 0, sourceWidth - w);
  const y = clamp(rawY, 0, sourceHeight - h);
  return { x, y, w, h };
}

function formatNumber(value) {
  // Avoid scientific notation, keep three decimals — FFmpeg accepts decimals.
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.000000';
  return seconds.toFixed(6);
}

function buildCursorPositionLookup(cursorEvents, sourceWidth, sourceHeight) {
  if (!Array.isArray(cursorEvents) || cursorEvents.length === 0) {
    return () => null;
  }
  // Inline a binary-search lookup so we don't depend on the renderer's
  // styled-preview module from main-process code.
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
  if (sorted.length === 0) return () => null;
  return (frame) => {
    if (!Number.isFinite(frame)) return null;
    if (frame <= sorted[0].frame) {
      return { x: sorted[0].x / sourceWidth, y: sorted[0].y / sourceHeight };
    }
    const last = sorted[sorted.length - 1];
    if (frame >= last.frame) {
      return { x: last.x / sourceWidth, y: last.y / sourceHeight };
    }
    let lo = 0;
    let hi = sorted.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].frame <= frame) lo = mid;
      else hi = mid;
    }
    const a = sorted[lo];
    const b = sorted[hi];
    const span = b.frame - a.frame;
    if (span <= 0) return { x: a.x / sourceWidth, y: a.y / sourceHeight };
    const t = (frame - a.frame) / span;
    return {
      x: (a.x + (b.x - a.x) * t) / sourceWidth,
      y: (a.y + (b.y - a.y) * t) / sourceHeight,
    };
  };
}

export function buildZoomSendcmd({
  markers = [],
  cursorEvents = [],
  sourceWidth,
  sourceHeight,
  fps,
  totalFrames,
  presentationOptions = {},
} = {}) {
  if (!Array.isArray(markers) || markers.length === 0) {
    return { filterFragment: null, sendcmdContent: '', present: false, initialCrop: null };
  }
  if (
    !Number.isInteger(sourceWidth) ||
    sourceWidth <= 0 ||
    !Number.isInteger(sourceHeight) ||
    sourceHeight <= 0
  ) {
    throw new Error('buildZoomSendcmd requires positive integer source dimensions.');
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('buildZoomSendcmd requires positive fps.');
  }
  if (!Number.isInteger(totalFrames) || totalFrames <= 0) {
    throw new Error('buildZoomSendcmd requires positive integer totalFrames.');
  }

  const followCursor = presentationOptions.followCursor !== false;
  const followAnimation = presentationOptions.followAnimation ?? 'focused';
  const followPadding = Number.isFinite(presentationOptions.followPadding)
    ? presentationOptions.followPadding
    : 0.18;

  const cursorLookup = buildCursorPositionLookup(cursorEvents, sourceWidth, sourceHeight);
  const transformOptions = followCursor
    ? { followCursor: true, followAnimation, followPadding, getCursorPosition: cursorLookup }
    : undefined;

  const lines = [];
  let initialCrop = null;
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const transform = getZoomTransformAtFrame(frame, markers, transformOptions);
    const window = transformToCropWindow(transform, sourceWidth, sourceHeight);
    if (frame === 0) initialCrop = window;
    const timestamp = formatTimestamp(frame / fps);
    lines.push(
      `${timestamp} crop x ${formatNumber(window.x)}, crop y ${formatNumber(window.y)}, crop w ${formatNumber(window.w)}, crop h ${formatNumber(window.h)};`,
    );
  }

  const cropInit = initialCrop ?? { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  const filterFragment = `crop=w=${formatNumber(cropInit.w)}:h=${formatNumber(cropInit.h)}:x=${formatNumber(cropInit.x)}:y=${formatNumber(cropInit.y)}`;

  return {
    filterFragment,
    sendcmdContent: `${lines.join('\n')}\n`,
    present: true,
    initialCrop: cropInit,
  };
}

export async function createZoomSendcmdLayer({
  markers = [],
  cursorEvents = [],
  sourceWidth,
  sourceHeight,
  fps,
  totalFrames,
  presentationOptions = {},
} = {}) {
  const result = buildZoomSendcmd({
    markers,
    cursorEvents,
    sourceWidth,
    sourceHeight,
    fps,
    totalFrames,
    presentationOptions,
  });
  if (!result.present) return null;

  const root = await mkdtemp(join(tmpdir(), 'rough-cut-zoom-sendcmd-'));
  const path = join(root, 'zoom.cmd');
  await writeFile(path, result.sendcmdContent, 'utf8');
  return {
    path,
    filterFragment: result.filterFragment,
    initialCrop: result.initialCrop,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
