/**
 * CursorOverlay — Canvas 2D overlay that renders a custom cursor sprite
 * and click effects on top of the video playback.
 *
 * Always mounts its canvas DOM — never returns null. The rAF loop checks
 * for data availability each frame via a ref. This prevents mount/unmount
 * churn that destroys the canvas and ResizeObserver.
 */
import { useRef, useEffect } from 'react';
import { transportStore } from '../hooks/use-stores.js';
import type { CursorPresentation, RegionCrop } from '@rough-cut/project-model';
import type { ZoomTransform } from '@rough-cut/timeline-engine';
import {
  INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE,
  resolveBackwardSubframeInterpolation,
} from './cursor-subframe-interpolation.js';

/** Pre-indexed cursor data: [x0, y0, clickFlag0, x1, y1, clickFlag1, ...] */
export interface CursorFrameData {
  readonly frames: Float32Array;
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

interface CursorOverlayProps {
  cursorData: CursorFrameData | null;
  presentation: CursorPresentation;
  showCursor?: boolean;
  clipTimelineIn: number;
  zoomTransform: ZoomTransform;
  getZoomTransform?: (sourceFrame: number, cursorData: CursorFrameData) => ZoomTransform;
  crop?: RegionCrop;
  /** Project frame rate. Drives backward sub-frame interpolation timing. */
  fps: number;
}

interface ClickEffect {
  x: number;
  y: number;
  startTime: number;
}

const CLICK_EFFECT_DURATION_MS = 400;
const CURSOR_COLOR = 'rgba(255, 255, 255, 1)';
const CURSOR_SHADOW_COLOR = 'rgba(0, 0, 0, 0.55)';
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

function drawCursor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  style: string,
) {
  ctx.save();
  ctx.translate(px, py);
  const s = size / 20;

  // Crisp drop-shadow: tiny blur, small offset, opaque enough to read on
  // light backgrounds. The previous 3·s blur was the source of the
  // "blurry cursor" look — kept only as a 1·s depth cue.
  ctx.shadowColor = CURSOR_SHADOW_COLOR;
  ctx.shadowBlur = 1 * s;
  ctx.shadowOffsetX = 1 * s;
  ctx.shadowOffsetY = 1 * s;

  // Arrow shape
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
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = 1.5 * s;
  ctx.lineJoin = 'round';
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
  ctx: CanvasRenderingContext2D,
  effect: ClickEffect,
  now: number,
  effectType: string,
  radiusScale: number,
) {
  const elapsed = now - effect.startTime;
  if (elapsed > CLICK_EFFECT_DURATION_MS) return;
  const progress = elapsed / CLICK_EFFECT_DURATION_MS;
  const alpha = 1 - progress;
  const radius = (8 + progress * 30) * radiusScale;

  ctx.save();
  if (effectType === 'ripple') {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(100, 150, 255, ${(0.6 * alpha).toFixed(2)})`;
    ctx.fill();
  } else if (effectType === 'ring') {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 150, 255, ${(0.8 * alpha).toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

function applyZoomToPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  zoomTransform: ZoomTransform,
): { x: number; y: number } {
  return {
    x: width * (0.5 + zoomTransform.scale * (x - 0.5 + zoomTransform.translateX)),
    y: height * (0.5 + zoomTransform.scale * (y - 0.5 + zoomTransform.translateY)),
  };
}

function applyCropToPoint(
  x: number,
  y: number,
  data: CursorFrameData,
  crop: RegionCrop | undefined,
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

export function CursorOverlay({
  cursorData,
  presentation,
  showCursor = true,
  clipTimelineIn,
  zoomTransform,
  getZoomTransform,
  crop,
  fps,
}: CursorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickEffectsRef = useRef<ClickEffect[]>([]);
  const lastClickFrameRef = useRef(-1);
  const sizeRef = useRef({ width: 0, height: 0 });
  const rafIdRef = useRef(0);

  // Backward sub-frame interpolation timing. We lerp from cursor[N-1] to
  // cursor[N] across the ~33 ms window the playhead holds at frame N. The
  // cursor visually arrives at N right as the playhead advances to N+1 —
  // never overshoots, never snaps back. (Forward interp does the opposite
  // and looks like a stutter on fast moves.)
  const interpolationStateRef = useRef(INITIAL_BACKWARD_SUBFRAME_INTERPOLATION_STATE);

  // Store props in refs so the rAF loop always reads current values
  // without restarting the effect.
  const cursorDataRef = useRef(cursorData);
  cursorDataRef.current = cursorData;
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const clipTimelineInRef = useRef(clipTimelineIn);
  clipTimelineInRef.current = clipTimelineIn;
  const zoomTransformRef = useRef(zoomTransform);
  zoomTransformRef.current = zoomTransform;
  const getZoomTransformRef = useRef(getZoomTransform);
  getZoomTransformRef.current = getZoomTransform;
  const showCursorRef = useRef(showCursor);
  showCursorRef.current = showCursor;
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  // ResizeObserver — only updates CSS sizeRef. The actual canvas backing
  // store is sized inside the rAF loop, where it can pick up cursorData's
  // sourceWidth/Height as soon as that arrives without effect-ordering
  // gymnastics.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      sizeRef.current = { width, height };
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Single rAF loop — runs for the lifetime of the component.
  // Reads cursorData from a ref each frame, so no effect restart needed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    function render() {
      if (!running || !ctx || !canvas) return;

      const { width, height } = sizeRef.current;
      const data = cursorDataRef.current;
      const pres = presentationRef.current;
      const clipIn = clipTimelineInRef.current;
      const activeCrop = cropRef.current;

      // Always sync the canvas size to the host CSS frame (so tests and
      // tooling can rely on stable pixel dimensions even before cursor
      // data arrives).
      if (width > 0 && canvas.style.width !== `${width}px`) {
        canvas.style.width = `${width}px`;
      }
      if (height > 0 && canvas.style.height !== `${height}px`) {
        canvas.style.height = `${height}px`;
      }

      // Match the cursor canvas backing store to the source resolution
      // (e.g. 1920×1080), the same approach the Pixi compositor sibling
      // uses. Sizing only by CSS pixels × devicePixelRatio leaves a 628-px
      // backing on a 1920-source preview, which the browser then bilinearly
      // upscales — that scaling is what produced the "blurry cursor" look.
      // Falls back to cssW × DPR when cursor data hasn't loaded yet so the
      // canvas always covers the host without smearing.
      const dpr = window.devicePixelRatio || 1;
      const targetW = data ? data.sourceWidth : Math.max(1, Math.round(width * dpr));
      const targetH = data ? data.sourceHeight : Math.max(1, Math.round(height * dpr));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;

      // Nothing more to draw if the cursor sidecar hasn't loaded yet.
      if (width === 0 || height === 0 || !data) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      // Drawing coords are in CSS pixels; scale up to the backing store.
      const scaleX = canvas.width / width;
      const scaleY = canvas.height / height;
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const transport = transportStore.getState();
      const projectFrame = transport.playheadFrame;
      const isPlaying = transport.isPlaying;
      const sourceFrame = projectFrame - clipIn;
      const zoom = getZoomTransformRef.current?.(sourceFrame, data) ?? zoomTransformRef.current;

      // Track when the integer playhead last advanced so we can lerp the
      // cursor BACKWARD from cursor[N-1] toward cursor[N] across the
      // ~1/fps window the playhead holds. By the time the playhead jumps
      // to N+1, the cursor has just arrived at N — no overshoot.
      const now = performance.now();
      const interpolation = resolveBackwardSubframeInterpolation(interpolationStateRef.current, {
        projectFrame,
        isPlaying,
        nowMs: now,
        fps: fpsRef.current,
      });
      interpolationStateRef.current = interpolation.nextState;

      const currCursor = getCursorAtFrame(data, sourceFrame);
      if (!currCursor) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }
      const prevCursor = sourceFrame > 0 ? getCursorAtFrame(data, sourceFrame - 1) : null;

      const cursor =
        prevCursor && interpolation.shouldInterpolate
          ? {
              x: prevCursor.x + (currCursor.x - prevCursor.x) * interpolation.lerpT,
              y: prevCursor.y + (currCursor.y - prevCursor.y) * interpolation.lerpT,
              isClick: currCursor.isClick,
            }
          : currCursor;

      const croppedCursor = applyCropToPoint(cursor.x, cursor.y, data, activeCrop);
      if (!croppedCursor) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const point = applyZoomToPoint(croppedCursor.x, croppedCursor.y, width, height, zoom);
      const px = point.x;
      const py = point.y;

      // Click effects (anchored to the integer source frame so they fire once)
      if (currCursor.isClick && sourceFrame !== lastClickFrameRef.current) {
        lastClickFrameRef.current = sourceFrame;
        if (pres.clickEffect !== 'none') {
          clickEffectsRef.current.push({ x: currCursor.x, y: currCursor.y, startTime: now });
        }
      }

      clickEffectsRef.current = clickEffectsRef.current.filter(
        (e) => now - e.startTime < CLICK_EFFECT_DURATION_MS,
      );
      for (const effect of clickEffectsRef.current) {
        const croppedEffect = applyCropToPoint(effect.x, effect.y, data, activeCrop);
        if (!croppedEffect) continue;
        const effectPoint = applyZoomToPoint(croppedEffect.x, croppedEffect.y, width, height, zoom);
        drawClickEffect(
          ctx,
          { ...effect, x: effectPoint.x, y: effectPoint.y },
          now,
          pres.clickEffect,
          croppedEffect.scale * zoom.scale,
        );
      }

      if (showCursorRef.current) {
        const cursorSize = (pres.sizePercent / 100) * 20 * croppedCursor.scale * zoom.scale;
        drawCursor(ctx, px, py, cursorSize, pres.style);
      }

      rafIdRef.current = requestAnimationFrame(render);
    }

    rafIdRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []); // Empty deps — runs once, reads everything from refs

  // Always render DOM — never return null
  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
