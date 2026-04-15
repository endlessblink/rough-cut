/**
 * CropOverlay — interactive visual crop editor.
 * Renders a dark mask with a bright crop box on top of the screen region content.
 * Users drag edges/corners to resize and drag the interior to reposition.
 * All coordinates are in source pixel space; CSS percentages map them to the viewport.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { RegionCrop } from '@rough-cut/project-model';

// ─── Constants ───────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 3;
const MIN_CROP_PX = 50;

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGE_CURSORS: Record<Edge, string> = {
  n: 'n-resize',
  s: 's-resize',
  e: 'e-resize',
  w: 'w-resize',
  ne: 'ne-resize',
  nw: 'nw-resize',
  se: 'se-resize',
  sw: 'sw-resize',
};

const ALL_EDGES: Edge[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

// ─── Handle styles (local copy — matches PreviewCard pattern) ───────────────

const HANDLE_DOT = 10;
const HANDLE_HIT = 24;

function getCropHandleStyle(edge: Edge): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    cursor: EDGE_CURSORS[edge],
    zIndex: 10,
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const off = -HANDLE_HIT / 2;
  switch (edge) {
    case 'nw':
      return { ...base, top: off, left: off };
    case 'n':
      return { ...base, top: off, left: '50%', marginLeft: off };
    case 'ne':
      return { ...base, top: off, right: off };
    case 'w':
      return { ...base, top: '50%', left: off, marginTop: off };
    case 'e':
      return { ...base, top: '50%', right: off, marginTop: off };
    case 'sw':
      return { ...base, bottom: off, left: off };
    case 's':
      return { ...base, bottom: off, left: '50%', marginLeft: off };
    case 'se':
      return { ...base, bottom: off, right: off };
  }
}

function CropHandleDot() {
  return (
    <div
      style={{
        width: HANDLE_DOT,
        height: HANDLE_DOT,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.9)',
        border: '1.5px solid rgba(0,0,0,0.4)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}
    />
  );
}

// ─── Clamping ───────────────────────────────────────────────────────────────

function clampCrop(
  x: number,
  y: number,
  w: number,
  h: number,
  srcW: number,
  srcH: number,
): { x: number; y: number; width: number; height: number } {
  w = Math.max(MIN_CROP_PX, Math.min(w, srcW));
  h = Math.max(MIN_CROP_PX, Math.min(h, srcH));
  x = Math.max(0, Math.min(x, srcW - w));
  y = Math.max(0, Math.min(y, srcH - h));
  return { x, y, width: w, height: h };
}

function roundCrop(c: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.round(c.x),
    y: Math.round(c.y),
    width: Math.round(c.width),
    height: Math.round(c.height),
  };
}

// ─── Resize logic ───────────────────────────────────────────────────────────
// Always locks to the crop box's current aspect ratio during drag.
// Uses a single diagonal metric: project the mouse delta onto the
// corner→center diagonal. This gives a smooth, predictable 1-axis feel.

function applyCropResize(
  orig: { x: number; y: number; width: number; height: number },
  edge: Edge,
  dX: number,
  dY: number,
  srcW: number,
  srcH: number,
): { x: number; y: number; width: number; height: number } {
  const ratio = orig.width / orig.height;
  let { x, y, width: w, height: h } = orig;

  // For corners: use the diagonal projection (smooth single-axis feel)
  if (edge.length === 2) {
    // Determine the sign of growth for each axis based on which corner
    const sx = edge.includes('e') ? 1 : -1;
    const sy = edge.includes('s') ? 1 : -1;

    // Project mouse delta onto the diagonal direction
    const diag = (sx * dX + sy * dY) / 2;
    const dw = diag;
    const dh = diag / ratio;

    w = orig.width + dw;
    h = orig.height + dh;

    // Anchor opposite corner
    if (edge.includes('w')) x = orig.x + orig.width - w;
    if (edge.includes('n')) y = orig.y + orig.height - h;

    // Minimum size
    if (w < MIN_CROP_PX) {
      w = MIN_CROP_PX;
      h = w / ratio;
    }
    if (h < MIN_CROP_PX) {
      h = MIN_CROP_PX;
      w = h * ratio;
    }
    if (edge.includes('w')) x = orig.x + orig.width - w;
    if (edge.includes('n')) y = orig.y + orig.height - h;

    return clampCrop(x, y, w, h, srcW, srcH);
  }

  // For edges: single axis drives, other follows to maintain ratio
  if (edge === 'e') {
    w = orig.width + dX;
    h = w / ratio;
  } else if (edge === 'w') {
    w = orig.width - dX;
    h = w / ratio;
    x = orig.x + orig.width - w;
  } else if (edge === 's') {
    h = orig.height + dY;
    w = h * ratio;
    x = orig.x + (orig.width - w) / 2;
  } else if (edge === 'n') {
    h = orig.height - dY;
    w = h * ratio;
    y = orig.y + orig.height - h;
    x = orig.x + (orig.width - w) / 2;
  }

  if (w < MIN_CROP_PX) {
    w = MIN_CROP_PX;
    h = w / ratio;
  }
  if (h < MIN_CROP_PX) {
    h = MIN_CROP_PX;
    w = h * ratio;
  }

  return clampCrop(x, y, w, h, srcW, srcH);
}

// ─── Drag state ─────────────────────────────────────────────────────────────

interface CropDragState {
  mode: 'move' | 'resize';
  edge?: Edge;
  startX: number;
  startY: number;
  originalCrop: { x: number; y: number; width: number; height: number };
  moved: boolean;
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CropOverlayProps {
  crop: RegionCrop;
  sourceWidth: number;
  sourceHeight: number;
  onCropChange: (patch: Partial<RegionCrop>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called when user clicks outside the crop box (dark mask area) */
  onExit?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CropOverlay({
  crop,
  sourceWidth,
  sourceHeight,
  onCropChange,
  containerRef,
  onExit,
}: CropOverlayProps) {
  const dragRef = useRef<CropDragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onCropChangeRef = useRef(onCropChange);
  onCropChangeRef.current = onCropChange;

  const cropRef = useRef(crop);
  cropRef.current = crop;

  // Crop box as CSS percentages
  const pctLeft = (crop.x / sourceWidth) * 100;
  const pctTop = (crop.y / sourceHeight) * 100;
  const pctWidth = (crop.width / sourceWidth) * 100;
  const pctHeight = (crop.height / sourceHeight) * 100;

  // Get container size for pixel→source conversion
  const getFrameSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { w: sourceWidth, h: sourceHeight };
    return { w: el.clientWidth, h: el.clientHeight };
  }, [containerRef, sourceWidth, sourceHeight]);

  // Document-level pointer listeners
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setIsDragging(true);
      }

      const frame = getFrameSize();
      const dSrcX = (dx / frame.w) * sourceWidth;
      const dSrcY = (dy / frame.h) * sourceHeight;

      const cb = onCropChangeRef.current;

      if (drag.mode === 'move') {
        const result = clampCrop(
          drag.originalCrop.x + dSrcX,
          drag.originalCrop.y + dSrcY,
          drag.originalCrop.width,
          drag.originalCrop.height,
          sourceWidth,
          sourceHeight,
        );
        cb(roundCrop(result));
      } else if (drag.mode === 'resize' && drag.edge) {
        const result = applyCropResize(
          drag.originalCrop,
          drag.edge,
          dSrcX,
          dSrcY,
          sourceWidth,
          sourceHeight,
        );
        cb(roundCrop(result));
      }
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [getFrameSize, sourceWidth, sourceHeight]);

  // Handlers
  const handleBoxPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        originalCrop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
        moved: false,
      };
    },
    [crop.x, crop.y, crop.width, crop.height],
  );

  const handleResizeDown = useCallback(
    (edge: Edge, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        mode: 'resize',
        edge,
        startX: e.clientX,
        startY: e.clientY,
        originalCrop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
        moved: false,
      };
      setIsDragging(true);
    },
    [crop.x, crop.y, crop.width, crop.height],
  );

  // Dark mask color
  const maskColor = 'rgba(0,0,0,0.55)';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
      {/* 4-strip dark mask — clicking any strip exits crop mode */}
      {/* Top */}
      <div
        onClick={onExit}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${pctTop}%`,
          background: maskColor,
          pointerEvents: 'auto',
          cursor: 'pointer',
        }}
      />
      {/* Bottom */}
      <div
        onClick={onExit}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          top: `${pctTop + pctHeight}%`,
          background: maskColor,
          pointerEvents: 'auto',
          cursor: 'pointer',
        }}
      />
      {/* Left */}
      <div
        onClick={onExit}
        style={{
          position: 'absolute',
          left: 0,
          top: `${pctTop}%`,
          width: `${pctLeft}%`,
          height: `${pctHeight}%`,
          background: maskColor,
          pointerEvents: 'auto',
          cursor: 'pointer',
        }}
      />
      {/* Right */}
      <div
        onClick={onExit}
        style={{
          position: 'absolute',
          right: 0,
          top: `${pctTop}%`,
          left: `${pctLeft + pctWidth}%`,
          height: `${pctHeight}%`,
          background: maskColor,
          pointerEvents: 'auto',
        }}
      />

      {/* Crop box */}
      <div
        onPointerDown={handleBoxPointerDown}
        style={{
          position: 'absolute',
          left: `${pctLeft}%`,
          top: `${pctTop}%`,
          width: `${pctWidth}%`,
          height: `${pctHeight}%`,
          border: '2px solid rgba(255,255,255,0.85)',
          cursor: isDragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Rule of thirds grid */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              left: '33.33%',
              top: 0,
              bottom: 0,
              width: 1,
              background: 'rgba(255,255,255,0.15)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '66.66%',
              top: 0,
              bottom: 0,
              width: 1,
              background: 'rgba(255,255,255,0.15)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '33.33%',
              left: 0,
              right: 0,
              height: 1,
              background: 'rgba(255,255,255,0.15)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '66.66%',
              left: 0,
              right: 0,
              height: 1,
              background: 'rgba(255,255,255,0.15)',
            }}
          />
        </div>

        {/* Resize handles */}
        {ALL_EDGES.map((edge) => (
          <div
            key={edge}
            onPointerDown={(e) => handleResizeDown(edge, e)}
            style={getCropHandleStyle(edge)}
          >
            <CropHandleDot />
          </div>
        ))}
      </div>
    </div>
  );
}
