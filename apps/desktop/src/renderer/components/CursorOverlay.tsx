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
  clipTimelineIn: number;
  zoomTransform: ZoomTransform;
  crop?: RegionCrop;
  /** Project frame rate — used for sub-frame interpolation between samples. */
  fps: number;
}

interface ClickEffect {
  x: number;
  y: number;
  startTime: number;
}

const CLICK_EFFECT_DURATION_MS = 400;
const CURSOR_COLOR = 'rgba(255, 255, 255, 0.95)';
const CURSOR_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)';
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

/**
 * Linear interpolation between two adjacent integer-frame samples. Returns
 * null if the floor frame has no usable sample. Sub-frame `t` is clamped 0..1.
 */
function getCursorAtSubFrame(
  data: CursorFrameData,
  sourceFrameFloat: number,
): { x: number; y: number; isClick: boolean } | null {
  const floor = Math.floor(sourceFrameFloat);
  const t = Math.max(0, Math.min(1, sourceFrameFloat - floor));
  const a = getCursorAtFrame(data, floor);
  if (!a) return null;
  if (t <= 0) return a;
  const b = getCursorAtFrame(data, floor + 1);
  if (!b) return a;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    isClick: a.isClick,
  };
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

  ctx.shadowColor = CURSOR_SHADOW_COLOR;
  ctx.shadowBlur = 3 * s;
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
  clipTimelineIn,
  zoomTransform,
  crop,
  fps,
}: CursorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickEffectsRef = useRef<ClickEffect[]>([]);
  const lastClickFrameRef = useRef(-1);
  const sizeRef = useRef({ width: 0, height: 0 });
  const rafIdRef = useRef(0);

  // Sub-frame interpolation: track when the integer playheadFrame last
  // changed so we can lerp smoothly to the next sample during playback.
  const lastSeenPlayheadRef = useRef(-1);
  const lastFrameChangeMsRef = useRef(0);

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
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  // ResizeObserver — always active since DOM is always mounted
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      sizeRef.current = { width, height };
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
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
      const zoom = zoomTransformRef.current;
      const activeCrop = cropRef.current;

      // Nothing to draw — clear and wait
      if (width === 0 || height === 0 || !data) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const transport = transportStore.getState();
      const projectFrame = transport.playheadFrame;
      const isPlaying = transport.isPlaying;
      const now = performance.now();

      // Detect frame transitions for sub-frame interpolation timing
      if (projectFrame !== lastSeenPlayheadRef.current) {
        lastSeenPlayheadRef.current = projectFrame;
        lastFrameChangeMsRef.current = now;
      }

      const activeFps = fpsRef.current > 0 ? fpsRef.current : 30;
      const framePeriodMs = 1000 / activeFps;
      // Only interpolate during playback. When paused the user expects the
      // cursor to sit on the exact sample for the current frame.
      const subFrameT = isPlaying
        ? Math.max(0, Math.min(1, (now - lastFrameChangeMsRef.current) / framePeriodMs))
        : 0;

      const sourceFrameFloat = projectFrame - clipIn + subFrameT;
      const sourceFrame = Math.floor(sourceFrameFloat);

      const cursor = getCursorAtSubFrame(data, sourceFrameFloat);
      if (!cursor) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const croppedCursor = applyCropToPoint(cursor.x, cursor.y, data, activeCrop);
      if (!croppedCursor) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const point = applyZoomToPoint(croppedCursor.x, croppedCursor.y, width, height, zoom);
      const px = point.x;
      const py = point.y;

      // Click effects (anchored on integer source frame so they fire once)
      if (cursor.isClick && sourceFrame !== lastClickFrameRef.current) {
        lastClickFrameRef.current = sourceFrame;
        if (pres.clickEffect !== 'none') {
          clickEffectsRef.current.push({ x: cursor.x, y: cursor.y, startTime: now });
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

      const cursorSize = (pres.sizePercent / 100) * 20 * croppedCursor.scale * zoom.scale;

      // Motion-blur trail: sample backwards along the recent motion path and
      // draw faded copies before the main cursor. Only render during playback
      // (otherwise a trail at a paused frame is misleading) and skip when the
      // user has the slider at zero.
      const blur = Math.max(0, Math.min(100, pres.motionBlur ?? 0));
      if (blur > 0 && isPlaying) {
        const blurStrength = blur / 100;
        const trailSamples = Math.max(2, Math.ceil(blurStrength * 8));
        const trailSpanFrames = 0.5 + blurStrength * 1.5; // up to 2 frames back
        for (let i = trailSamples; i >= 1; i--) {
          const stepBack = (i / trailSamples) * trailSpanFrames;
          const sampleFrameFloat = sourceFrameFloat - stepBack;
          if (sampleFrameFloat < 0) continue;
          const sampled = getCursorAtSubFrame(data, sampleFrameFloat);
          if (!sampled) continue;
          const cropped = applyCropToPoint(sampled.x, sampled.y, data, activeCrop);
          if (!cropped) continue;
          const sp = applyZoomToPoint(cropped.x, cropped.y, width, height, zoom);
          // Skip trail samples that haven't actually moved — avoids a smear
          // when the cursor is stationary.
          const dxPx = (sp.x - px) * (sp.x - px) + (sp.y - py) * (sp.y - py);
          if (dxPx < 1) continue;
          const trailAlpha = (1 - i / (trailSamples + 1)) * 0.55 * blurStrength;
          ctx.save();
          ctx.globalAlpha = trailAlpha;
          drawCursor(ctx, sp.x, sp.y, cursorSize, pres.style);
          ctx.restore();
        }
      }

      // Main cursor on top
      drawCursor(ctx, px, py, cursorSize, pres.style);

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
