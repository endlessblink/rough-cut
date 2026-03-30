import React, { useRef } from 'react';
import type { RegionCrop } from '@rough-cut/project-model';
import type { Rect, FitMode } from './template-layout/types.js';
import {
  ALL_EDGES,
  CORNER_EDGES,
  getHandleStyle,
  HandleDot,
} from './useRegionDragResize.js';
import type { Edge } from './useRegionDragResize.js';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MediaFrameProps {
  /** Frame position and size in pixels relative to the renderer container */
  frame: Rect;
  /** How to fit media content inside the frame */
  fitMode: FitMode;
  /** The media content to render (video element, compositor canvas, placeholder, etc.) */
  children?: React.ReactNode;
  /** Media's native aspect ratio (width/height as a number, e.g. 16/9 = 1.777) — required for contain/cover */
  mediaAspect?: number;
  /** Corner radius on the frame (px) */
  borderRadius?: number | string;
  /** Box shadow on the frame */
  shadow?: string;
  /** Z-index for layering */
  zIndex?: number;
  /** Whether this is a circular frame (for PIP camera) */
  circular?: boolean;
  /** Optional label for debug overlay */
  label?: string;
  /** CSS transition (set to 'none' during drag) */
  transition?: string;
  /** Whether this frame is interactive (shows selection on hover) */
  interactive?: boolean;
  /** Whether currently hovered */
  isHovered?: boolean;
  /** Whether currently being dragged */
  isDragging?: boolean;
  /** Pointer event handlers */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  /** Resize handle handler */
  onResizeStart?: (edge: Edge, e: React.PointerEvent) => void;
  /** Active crop rect (applied as zoom transform when not in crop edit mode) */
  crop?: RegionCrop;
  /** Whether crop editing mode is active (suppresses zoom transform) */
  cropModeActive?: boolean;
  /** Source resolution for crop math */
  sourceWidth?: number;
  sourceHeight?: number;
}

// ─── Placeholder icons ────────────────────────────────────────────────────────

function ScreenPlaceholderIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
      <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CameraPlaceholderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
      <rect x="2" y="5" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 10l4.5-3v10L16 14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── MediaFrame ───────────────────────────────────────────────────────────────
//
// Single-responsibility component: absolutely positions one frame and fills
// media inside it. Layout functions guarantee that frame rects already match
// the source aspect ratio, so only 'fill' mode is needed.
//
// The FitMode prop is kept for API compatibility but only 'fill' is implemented.

export function MediaFrame({
  frame,
  children,
  borderRadius = 0,
  shadow,
  zIndex,
  circular = false,
  label,
  transition = 'all 300ms ease',
  interactive = false,
  isHovered = false,
  isDragging = false,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onDoubleClick,
  onResizeStart,
  crop,
  cropModeActive = false,
  sourceWidth = 1920,
  sourceHeight = 1080,
}: MediaFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  // Circular frames override borderRadius to '50%'
  const resolvedRadius = circular ? '50%' : borderRadius;

  const edges = circular ? CORNER_EDGES : ALL_EDGES;
  const showHandles = interactive && isHovered && !isDragging;
  const showBorder = interactive && (isHovered || isDragging);

  // Cursor reflects drag state
  const cursor = interactive ? (isDragging ? 'grabbing' : 'grab') : undefined;

  // ─── Outer frame div ──────────────────────────────────────────────────────

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.width,
    height: frame.height,
    overflow: 'hidden',
    borderRadius: resolvedRadius,
    boxShadow: shadow,
    zIndex,
    transition,
    cursor,
  };

  // ─── Placeholder ──────────────────────────────────────────────────────────

  if (!children) {
    const isCamera = label?.toLowerCase().includes('camera');
    const accentColor = isCamera ? 'rgba(255,107,90,0.6)' : 'rgba(90,160,250,0.6)';
    const accentBg = isCamera ? 'rgba(255,107,90,0.08)' : 'rgba(90,160,250,0.08)';
    const accentBorder = isCamera ? 'rgba(255,107,90,0.15)' : 'rgba(90,160,250,0.15)';

    return (
      <div
        style={frameStyle}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: accentBg,
            border: `1px solid ${accentBorder}`,
            borderRadius: 'inherit',
            color: accentColor,
            userSelect: 'none',
          }}
        >
          {isCamera ? <CameraPlaceholderIcon /> : <ScreenPlaceholderIcon />}
          {label && (
            <span style={{ fontSize: 10, fontWeight: 500, textAlign: 'center', padding: '0 8px' }}>
              {label}
            </span>
          )}
        </div>

        {/* Selection border */}
        {showBorder && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid rgba(90,160,250,0.6)',
              boxSizing: 'border-box',
              borderRadius: resolvedRadius,
              pointerEvents: 'none',
              zIndex: 9,
            }}
          />
        )}

        {/* Resize handles */}
        {showHandles && onResizeStart &&
          edges.map((edge) => (
            <div
              key={edge}
              style={getHandleStyle(edge)}
              onPointerDown={(e) => onResizeStart(edge, e)}
            >
              <HandleDot />
            </div>
          ))}
      </div>
    );
  }

  // ─── Crop transform ────────────────────────────────────────────────────────
  // When crop is enabled and we're NOT in crop edit mode, zoom into the cropped area.

  const applyCrop = crop?.enabled && !cropModeActive;
  let contentStyle: React.CSSProperties = { position: 'absolute', inset: 0 };

  if (applyCrop && crop) {
    const viewW = frame.width;
    const viewH = frame.height;
    const scale = Math.max(viewW / crop.width, viewH / crop.height);
    const tx = -crop.x;
    const ty = -crop.y;
    contentStyle = {
      position: 'absolute',
      inset: 0,
      transformOrigin: '0 0',
      transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
      willChange: 'transform',
    };
  }

  // ─── Fill mode (only mode) ────────────────────────────────────────────────

  return (
    <div
      ref={frameRef}
      style={frameStyle}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div style={contentStyle}>
        {children}
      </div>

      {/* Selection border — inside the frame, on top of content */}
      {showBorder && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid rgba(90,160,250,0.6)',
            boxSizing: 'border-box',
            borderRadius: resolvedRadius,
            pointerEvents: 'none',
            zIndex: 9,
          }}
        />
      )}

      {/* Resize handles */}
      {showHandles && onResizeStart &&
        edges.map((edge) => (
          <div
            key={edge}
            style={getHandleStyle(edge)}
            onPointerDown={(e) => onResizeStart(edge, e)}
          >
            <HandleDot />
          </div>
        ))}
    </div>
  );
}
