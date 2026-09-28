import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import { resolveFramedCrop } from '@rough-cut/frame-resolver';

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

// A screen crop is the viewport the zoom works inside (as in the preview), so
// the zoom window and the cursor are both expressed relative to it.
function normalizeViewport(viewport, sourceWidth, sourceHeight) {
  if (!viewport) return { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  const w = clamp(Number(viewport.w) || sourceWidth, 1, sourceWidth);
  const h = clamp(Number(viewport.h) || sourceHeight, 1, sourceHeight);
  return {
    x: clamp(Number(viewport.x) || 0, 0, sourceWidth - w),
    y: clamp(Number(viewport.y) || 0, 0, sourceHeight - h),
    w,
    h,
  };
}

export function buildCursorPositionLookup(cursorEvents, viewport) {
  if (!Array.isArray(cursorEvents) || cursorEvents.length === 0) {
    return () => null;
  }
  const point = (x, y) => ({ x: (x - viewport.x) / viewport.w, y: (y - viewport.y) / viewport.h });
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
      return point(sorted[0].x, sorted[0].y);
    }
    const last = sorted[sorted.length - 1];
    if (frame >= last.frame) {
      return point(last.x, last.y);
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
    if (span <= 0) return point(a.x, a.y);
    const t = (frame - a.frame) / span;
    return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
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
  viewport = null,
  // Per-frame viewport for a screen crop that moves (follow cursor / framing
  // ranges). Takes precedence over `viewport`.
  viewportAt = null,
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
  const followAnimation = presentationOptions.followAnimation ?? 'smooth';
  const followPadding = Number.isFinite(presentationOptions.followPadding)
    ? presentationOptions.followPadding
    : 0.22;

  const staticView = normalizeViewport(viewport, sourceWidth, sourceHeight);
  const viewAt = typeof viewportAt === 'function'
    ? (frame) => normalizeViewport(viewportAt(frame), sourceWidth, sourceHeight)
    : () => staticView;
  // The zoom aims inside the crop, so the cursor is re-expressed in the crop
  // shown at that same frame (as the preview's cursorLookupInCropSpace does).
  const fullSourceLookup = buildCursorPositionLookup(cursorEvents, { x: 0, y: 0, w: sourceWidth, h: sourceHeight });
  const cursorLookup = (frame) => {
    const point = fullSourceLookup(frame);
    if (!point) return null;
    const view = viewAt(frame);
    return {
      x: (point.x * sourceWidth - view.x) / view.w,
      y: (point.y * sourceHeight - view.y) / view.h,
    };
  };
  const transformOptions = followCursor
    ? { followCursor: true, followAnimation, followPadding, fps, getCursorPosition: cursorLookup }
    : undefined;

  const lines = [];
  let initialCrop = null;
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const view = viewAt(frame);
    const transform = getZoomTransformAtFrame(frame, markers, transformOptions);
    const local = transformToCropWindow(transform, view.w, view.h);
    const window = { ...local, x: local.x + view.x, y: local.y + view.y };
    if (frame === 0) initialCrop = window;
    const timestamp = formatTimestamp(frame / fps);
    lines.push(
      `${timestamp} crop x ${formatNumber(window.x)}, crop y ${formatNumber(window.y)}, crop w ${formatNumber(window.w)}, crop h ${formatNumber(window.h)};`,
    );
  }

  const cropInit = initialCrop ?? staticView;
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
  viewport = null,
  viewportAt = null,
} = {}) {
  const result = buildZoomSendcmd({
    markers,
    cursorEvents,
    sourceWidth,
    sourceHeight,
    fps,
    totalFrames,
    presentationOptions,
    viewport,
    viewportAt,
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

/**
 * The screen crop for every exported (timeline) frame when it moves — following
 * the cursor and/or held by framing ranges. Each timeline frame is mapped back to
 * its recording frame and resolved with the preview's own `resolveFramedCrop`,
 * with the cursor in recording frames, so export pans exactly where the preview
 * does. Returns null when the crop is off or never moves.
 *
 * `segments` are the timeline→recording mappings of the exported screen clips.
 */
export function buildScreenCropTrack({
  screenCrop,
  framingRanges = [],
  sourceCursorEvents = [],
  sourceWidth,
  sourceHeight,
  fps,
  totalFrames,
  segments = [],
} = {}) {
  if (!screenCrop?.enabled) return null;
  const ranges = Array.isArray(framingRanges) ? framingRanges : [];
  if (!screenCrop.followCursor && ranges.length === 0) return null;
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(fps > 0) || !(totalFrames > 0)) return null;

  const w = clamp(Math.round(Number(screenCrop.width) || sourceWidth), 1, sourceWidth);
  const h = clamp(Math.round(Number(screenCrop.height) || sourceHeight), 1, sourceHeight);
  const base = {
    ...screenCrop,
    width: w,
    height: h,
    x: clamp(Math.round(Number(screenCrop.x) || 0), 0, sourceWidth - w),
    y: clamp(Math.round(Number(screenCrop.y) || 0), 0, sourceHeight - h),
  };
  const cursor = buildCursorPositionLookup(sourceCursorEvents, { x: 0, y: 0, w: sourceWidth, h: sourceHeight });
  const sourceFrameAt = (frame) => {
    const segment = segments.find((candidate) => frame >= candidate.timelineIn && frame < candidate.timelineOut);
    return segment ? segment.sourceIn + (frame - segment.timelineIn) : null;
  };

  const crops = [];
  let lastCrop = base;
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const sourceFrame = sourceFrameAt(frame);
    // A gap shows no recording; hold the last position so nothing jumps.
    if (sourceFrame !== null) {
      lastCrop = resolveFramedCrop(base, sourceWidth, sourceHeight, sourceFrame, fps, cursor, ranges);
    }
    crops.push({ x: lastCrop.x, y: lastCrop.y, w: lastCrop.width, h: lastCrop.height });
  }
  return crops;
}

/**
 * sendcmd driving crop x/y per frame for a moving (non-zoomed) screen crop.
 *
 * FFmpeg crops on whole pixels (even ones for 4:2:0 video), and the narrow
 * Story slice is then scaled up ~1.8x — so cropping the source directly turns a
 * slow glide into visible 2–4 px steps. With `renderSize` (the size the crop is
 * finally drawn at), the source is first scaled so the crop is already at that
 * size, converted to RGBA, and cropped exactly: each step is then one output
 * pixel, the finest the video can show.
 */
export function buildCropPanSendcmd(crops, fps, { sourceWidth = null, sourceHeight = null, renderSize = null } = {}) {
  if (!Array.isArray(crops) || crops.length === 0) return null;
  const first = crops[0];
  const scale = renderSize && sourceWidth > 0 && sourceHeight > 0 && first.w > 0
    ? renderSize.w / first.w
    : 1;
  const lines = [];
  let previous = null;
  crops.forEach((crop, frame) => {
    const x = Math.round(crop.x * scale);
    const y = Math.round(crop.y * scale);
    // Only emit changes — a held crop would otherwise write a line per frame.
    if (previous && previous.x === x && previous.y === y) return;
    previous = { x, y };
    lines.push(`${formatTimestamp(frame / fps)} crop x ${x}, crop y ${y};`);
  });
  const cropW = Math.round(first.w * scale);
  const cropH = Math.round(first.h * scale);
  const cropStep = `crop=w=${cropW}:h=${cropH}:x=${Math.round(first.x * scale)}:y=${Math.round(first.y * scale)}`;
  const filterFragment = scale === 1
    ? cropStep
    : `scale=${Math.round(sourceWidth * scale)}:${Math.round(sourceHeight * scale)}:flags=bicubic,format=rgba,${cropStep}:exact=1`;
  return {
    filterFragment,
    sendcmdContent: `${lines.join('\n')}\n`,
  };
}

export async function createCropPanSendcmdLayer(crops, fps, options = {}) {
  const result = buildCropPanSendcmd(crops, fps, options);
  if (!result) return null;
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-crop-sendcmd-'));
  const path = join(root, 'crop.cmd');
  await writeFile(path, result.sendcmdContent, 'utf8');
  return {
    path,
    filterFragment: result.filterFragment,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
