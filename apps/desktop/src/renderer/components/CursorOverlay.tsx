/**
 * CursorOverlay — Canvas 2D overlay that renders a custom cursor sprite
 * and click effects on top of the video playback.
 *
 * Reads cursor position from a pre-processed cursor events array,
 * synced to the transport store playhead frame.
 */
import { useRef, useEffect } from 'react';
import { transportStore } from '../hooks/use-stores.js';
import type { CursorPresentation } from '@rough-cut/project-model';

/** Pre-indexed cursor data: [x0, y0, clickFlag0, x1, y1, clickFlag1, ...] */
export interface CursorFrameData {
  /** Normalized cursor positions indexed by frame: [x, y, isClick] per frame */
  readonly frames: Float32Array;
  /** Total number of frames in the data */
  readonly frameCount: number;
}

interface CursorOverlayProps {
  /** Pre-computed cursor frame data (null if no cursor data available) */
  cursorData: CursorFrameData | null;
  /** Cursor presentation settings from the asset */
  presentation: CursorPresentation;
  /** Clip timeline-in offset (to convert project frames to source frames) */
  clipTimelineIn: number;
}

/** Active click effect animation */
interface ClickEffect {
  x: number;
  y: number;
  startTime: number;
}

const CLICK_EFFECT_DURATION_MS = 400;
const CURSOR_COLOR = 'rgba(255, 255, 255, 0.95)';
const CURSOR_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)';
const CLICK_RIPPLE_COLOR = 'rgba(100, 150, 255, 0.6)';
const CLICK_RING_COLOR = 'rgba(100, 150, 255, 0.8)';

/**
 * Look up cursor position at a given source frame.
 * Returns null if no data or frame is out of range.
 */
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

  // x or y being -1 means no data at this frame
  if (x < 0 || y < 0) return null;

  return { x, y, isClick };
}

/**
 * Draw a simple arrow cursor at (px, py) on the canvas.
 */
function drawCursor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  style: string,
) {
  ctx.save();
  ctx.translate(px, py);

  const s = size / 20; // base cursor is ~20px

  // Shadow
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

  // Fill
  ctx.fillStyle = CURSOR_COLOR;
  ctx.fill();

  // Outline
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 1 * s;
  ctx.stroke();

  // Spotlight effect
  if (style === 'spotlight') {
    ctx.beginPath();
    ctx.arc(0, 0, 30 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 200, 0.12)';
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw a click effect (ripple or ring) at (px, py).
 */
function drawClickEffect(
  ctx: CanvasRenderingContext2D,
  effect: ClickEffect,
  now: number,
  effectType: string,
) {
  const elapsed = now - effect.startTime;
  if (elapsed > CLICK_EFFECT_DURATION_MS) return;

  const progress = elapsed / CLICK_EFFECT_DURATION_MS;
  const alpha = 1 - progress;
  const radius = 8 + progress * 30;

  ctx.save();

  if (effectType === 'ripple') {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = CLICK_RIPPLE_COLOR.replace(
      /[\d.]+\)$/,
      `${(0.6 * alpha).toFixed(2)})`,
    );
    ctx.fill();
  } else if (effectType === 'ring') {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = CLICK_RING_COLOR.replace(
      /[\d.]+\)$/,
      `${(0.8 * alpha).toFixed(2)})`,
    );
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.restore();
}

export function CursorOverlay({
  cursorData,
  presentation,
  clipTimelineIn,
}: CursorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickEffectsRef = useRef<ClickEffect[]>([]);
  const lastClickFrameRef = useRef(-1);
  const sizeRef = useRef({ width: 0, height: 0 });
  const rafIdRef = useRef(0);

  // Track container size via ResizeObserver (no React state — avoid re-renders)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      sizeRef.current = { width, height };

      // Resize canvas to match
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

  // Main render loop — rAF-based, reads transport store directly
  useEffect(() => {
    if (!cursorData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    function render() {
      if (!running || !ctx || !canvas) return;

      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Get current source frame
      const projectFrame = transportStore.getState().playheadFrame;
      const sourceFrame = projectFrame - clipTimelineIn;

      const cursor = getCursorAtFrame(cursorData!, sourceFrame);
      if (!cursor) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      // Convert normalized coords to canvas pixels
      const px = cursor.x * width;
      const py = cursor.y * height;

      // Track click effects
      const now = performance.now();
      if (cursor.isClick && sourceFrame !== lastClickFrameRef.current) {
        lastClickFrameRef.current = sourceFrame;
        if (presentation.clickEffect !== 'none') {
          clickEffectsRef.current.push({ x: px, y: py, startTime: now });
        }
      }

      // Draw active click effects
      clickEffectsRef.current = clickEffectsRef.current.filter(
        (e) => now - e.startTime < CLICK_EFFECT_DURATION_MS,
      );
      for (const effect of clickEffectsRef.current) {
        drawClickEffect(ctx, effect, now, presentation.clickEffect);
      }

      // Draw cursor
      const cursorSize = (presentation.sizePercent / 100) * 20;
      drawCursor(ctx, px, py, cursorSize, presentation.style);

      rafIdRef.current = requestAnimationFrame(render);
    }

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [cursorData, presentation, clipTimelineIn]);

  if (!cursorData) return null;

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
