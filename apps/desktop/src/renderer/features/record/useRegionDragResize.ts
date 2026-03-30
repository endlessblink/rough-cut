/**
 * useRegionDragResize
 *
 * Drag-to-move and edge/corner resize interactions for PreviewCard regions.
 * Works in pixel space (Rect) — no normalized coordinates.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { isDragging, hoveredRegion, startMove, startResize, setHoveredRegion } =
 *     useRegionDragResize({ containerRef, onRegionChange });
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Rect } from './template-layout/types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface RegionDragConfig {
  /** Ref to the container element for coordinate conversion */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Called when a region rect changes (pixel coords) */
  onRegionChange?: (region: 'screen' | 'camera', rect: Rect) => void;
  /** Whether interaction is enabled (default: true) */
  enabled?: boolean;
}

export interface RegionDragResult {
  /** Whether any region is currently being dragged */
  isDragging: boolean;
  /** Which region is currently hovered */
  hoveredRegion: 'screen' | 'camera' | null;
  /** Call this to start a move drag on a region */
  startMove: (region: 'screen' | 'camera', currentRect: Rect, e: React.PointerEvent, sourceAspect?: number) => void;
  /** Call this to start a resize drag on a region edge */
  startResize: (region: 'screen' | 'camera', currentRect: Rect, edge: Edge, e: React.PointerEvent, sourceAspect?: number) => void;
  /** Set which region is hovered (for showing handles) */
  setHoveredRegion: (region: 'screen' | 'camera' | null) => void;
}

// ─── Internal drag state ──────────────────────────────────────────────────────

interface DragState {
  region: 'screen' | 'camera';
  startX: number;
  startY: number;
  originalRect: Rect;
  mode: 'move' | 'resize';
  edge?: Edge;
  moved: boolean;
  sourceAspect?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum pixel movement before a drag starts (prevents accidental drags on click) */
export const DRAG_THRESHOLD = 3;

/** Minimum side length of a region in pixels */
export const MIN_SIZE = 40;

// ─── Handle rendering helpers (exported for use in renderers) ─────────────────

export const EDGE_CURSORS: Record<Edge, string> = {
  n: 'n-resize',
  s: 's-resize',
  e: 'e-resize',
  w: 'w-resize',
  ne: 'ne-resize',
  nw: 'nw-resize',
  se: 'se-resize',
  sw: 'sw-resize',
};

export const ALL_EDGES: Edge[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
export const CORNER_EDGES: Edge[] = ['nw', 'ne', 'sw', 'se'];

const HANDLE_DOT = 10;
const HANDLE_HIT = 24; // large invisible hit area for easy grabbing

export function getHandleStyle(edge: Edge): React.CSSProperties {
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

  // Handles sit fully inside the region so they never get clipped
  const off = -2; // slight inset from region edge
  switch (edge) {
    case 'nw': return { ...base, top: off, left: off };
    case 'n':  return { ...base, top: off, left: '50%', marginLeft: -HANDLE_HIT / 2 };
    case 'ne': return { ...base, top: off, right: off };
    case 'w':  return { ...base, top: '50%', left: off, marginTop: -HANDLE_HIT / 2 };
    case 'e':  return { ...base, top: '50%', right: off, marginTop: -HANDLE_HIT / 2 };
    case 'sw': return { ...base, bottom: off, left: off };
    case 's':  return { ...base, bottom: off, left: '50%', marginLeft: -HANDLE_HIT / 2 };
    case 'se': return { ...base, bottom: off, right: off };
  }
}

export function HandleDot() {
  return (
    React.createElement('div', {
      style: {
        width: HANDLE_DOT,
        height: HANDLE_DOT,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.9)',
        border: '1.5px solid rgba(0,0,0,0.4)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }
    })
  );
}

// ─── Pixel-space math helpers ─────────────────────────────────────────────────

function clampRect(r: Rect, containerW: number, containerH: number, aspect?: number): Rect {
  let { x, y, width, height } = r;

  // Clamp to container bounds
  width  = Math.max(MIN_SIZE, Math.min(width,  containerW));
  height = Math.max(MIN_SIZE, Math.min(height, containerH));

  // If we have a locked aspect ratio, restore it after clamping
  if (aspect != null) {
    // Fit within both constraints while maintaining aspect
    const maxW = Math.min(width, containerW);
    const maxH = Math.min(height, containerH);
    // Use whichever constraint is tighter
    if (maxW / aspect <= maxH) {
      width = maxW;
      height = width / aspect;
    } else {
      height = maxH;
      width = height * aspect;
    }
    // Enforce minimum (aspect-locked)
    if (width < MIN_SIZE) {
      width = MIN_SIZE;
      height = width / aspect;
    }
    if (height < MIN_SIZE) {
      height = MIN_SIZE;
      width = height * aspect;
    }
  }

  x = Math.max(0, Math.min(x, containerW - width));
  y = Math.max(0, Math.min(y, containerH - height));
  return { x, y, width, height };
}

function applyResize(
  original: Rect,
  edge: Edge,
  dx: number,
  dy: number,
  containerW: number,
  containerH: number,
  sourceAspect?: number,
): Rect {
  const aspect = sourceAspect ?? (original.width / original.height);
  let { x, y, width, height } = original;

  // Corner handles: aspect-ratio-locked resize.
  // Whichever axis moved more drives the resize; the other is derived.
  if (edge.length === 2) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const useX = absDx >= absDy;

    let dw: number;
    let dh: number;

    if (useX) {
      dw = edge.includes('e') ? dx : -dx;
      dh = dw / aspect;
    } else {
      dh = edge.includes('s') ? dy : -dy;
      dw = dh * aspect;
    }

    width  = width  + dw;
    height = height + dh;

    // Anchor the opposite corner
    if (edge.includes('w')) x = original.x + original.width  - width;
    if (edge.includes('n')) y = original.y + original.height - height;

    // Enforce minimum (aspect-locked)
    if (width < MIN_SIZE) {
      width  = MIN_SIZE;
      height = width / aspect;
      if (edge.includes('w')) x = original.x + original.width  - width;
      if (edge.includes('n')) y = original.y + original.height - height;
    }
    if (height < MIN_SIZE) {
      height = MIN_SIZE;
      width  = height * aspect;
      if (edge.includes('w')) x = original.x + original.width  - width;
      if (edge.includes('n')) y = original.y + original.height - height;
    }

    return clampRect({ x, y, width, height }, containerW, containerH, aspect);
  }

  // Edge handles: single-axis resize, aspect-locked.
  if (edge === 'e') {
    width  = width + dx;
    height = width / aspect;
  } else if (edge === 'w') {
    const dw = -dx;
    width  = width + dw;
    height = width / aspect;
    x = original.x + original.width  - width;
    y = original.y + (original.height - height) / 2; // center vertically
  } else if (edge === 's') {
    height = height + dy;
    width  = height * aspect;
    x = original.x + (original.width - width) / 2;  // center horizontally
  } else if (edge === 'n') {
    const dh = -dy;
    height = height + dh;
    width  = height * aspect;
    y = original.y + original.height - height;
    x = original.x + (original.width - width) / 2;  // center horizontally
  }

  // Enforce minimum (aspect-locked)
  if (width < MIN_SIZE) {
    width  = MIN_SIZE;
    height = width / aspect;
  }
  if (height < MIN_SIZE) {
    height = MIN_SIZE;
    width  = height * aspect;
  }

  return clampRect({ x, y, width, height }, containerW, containerH, aspect);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRegionDragResize({
  containerRef,
  onRegionChange,
  enabled = true,
}: RegionDragConfig): RegionDragResult {
  // Mutable drag state stored in ref — avoids re-renders on every pointer pixel
  const dragRef = useRef<DragState | null>(null);

  // Render state: only these two trigger re-renders
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<'screen' | 'camera' | null>(null);

  // Keep callback ref stable so the effect doesn't need to re-subscribe
  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;

  const getContainerSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { w: 1, h: 1 };
    return { w: el.clientWidth, h: el.clientHeight };
  }, [containerRef]);

  // Document-level pointer listeners — active for the lifetime of the component.
  // The move handler only does work when dragRef.current is set.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const cb = onRegionChangeRef.current;
      if (!drag || !cb || !enabled) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setIsDragging(true);
      }

      const { w: containerW, h: containerH } = getContainerSize();

      if (drag.mode === 'move') {
        cb(drag.region, clampRect(
          {
            x: drag.originalRect.x + dx,
            y: drag.originalRect.y + dy,
            width:  drag.originalRect.width,
            height: drag.originalRect.height,
          },
          containerW,
          containerH,
        ));
      } else if (drag.mode === 'resize' && drag.edge) {
        cb(drag.region, applyResize(drag.originalRect, drag.edge, dx, dy, containerW, containerH, drag.sourceAspect));
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
  }, [getContainerSize, enabled]);

  const startMove = useCallback(
    (region: 'screen' | 'camera', currentRect: Rect, e: React.PointerEvent, sourceAspect?: number) => {
      if (!onRegionChangeRef.current || !enabled) return;
      e.preventDefault();
      dragRef.current = {
        region,
        startX: e.clientX,
        startY: e.clientY,
        originalRect: { ...currentRect },
        mode: 'move',
        moved: false,
        sourceAspect,
      };
    },
    [enabled],
  );

  const startResize = useCallback(
    (region: 'screen' | 'camera', currentRect: Rect, edge: Edge, e: React.PointerEvent, sourceAspect?: number) => {
      if (!onRegionChangeRef.current || !enabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        region,
        startX: e.clientX,
        startY: e.clientY,
        originalRect: { ...currentRect },
        mode: 'resize',
        edge,
        moved: false,
        sourceAspect,
      };
      // Resize starts immediately (no threshold) so set dragging right away
      setIsDragging(true);
    },
    [enabled],
  );

  return {
    isDragging,
    hoveredRegion,
    startMove,
    startResize,
    setHoveredRegion,
  };
}
