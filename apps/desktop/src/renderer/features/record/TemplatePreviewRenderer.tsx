/**
 * TemplatePreviewRenderer
 *
 * Orchestrates layout computation, MediaFrame rendering, drag/resize interaction,
 * and the debug overlay for a given LayoutTemplate.
 *
 * Responsibilities:
 *   1. Measures its container with a ResizeObserver
 *   2. Calls getLayoutRects() to get pixel-space frame rects
 *   3. Renders MediaFrame components for each non-null slot
 *   4. Wires up useRegionDragResize for interactive editing when enabled
 *   5. Renders DebugOverlay when requested
 *
 * NOT responsible for: background, chrome, border radius on the card itself —
 * those belong to CardChrome or the parent.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { LayoutTemplate } from './templates.js';
import type { Rect, FitMode } from './template-layout/types.js';
import { getLayoutRects } from './template-layout/layout-registry.js';
import { DebugOverlay, DEBUG_COLORS } from './template-layout/DebugOverlay.js';
import { useDebugToggle } from './template-layout/useDebugToggle.js';
import { MediaFrame } from './MediaFrame.js';
import {
  useRegionDragResize,
  ALL_EDGES,
  CORNER_EDGES,
  getHandleStyle,
  HandleDot,
} from './useRegionDragResize.js';
import type { Edge } from './useRegionDragResize.js';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TemplatePreviewRendererProps {
  /** The active layout template */
  template: LayoutTemplate;
  /** Screen media content (video element, compositor canvas, etc.) */
  screenContent?: React.ReactNode;
  /** Camera media content */
  cameraContent?: React.ReactNode;
  /** Screen source aspect ratio (width/height, e.g. 1920/1080 = 1.777…) */
  screenAspect?: number;
  /** Camera source aspect ratio */
  cameraAspect?: number;
  /** Corner radius for the screen frame (px) */
  screenCornerRadius?: number;
  /** Box shadow for the screen frame */
  screenShadow?: string;
  /** Whether drag/resize interaction is enabled */
  interactionEnabled?: boolean;
  /** Called when a region is moved/resized — receives pixel-space Rect */
  onRegionChange?: (region: 'screen' | 'camera', rect: Rect) => void;
  /** User-supplied rect overrides (pixel space) — supersede computed rects */
  screenRectOverride?: Rect;
  cameraRectOverride?: Rect;
  /** Force the debug overlay on (Ctrl+Shift+D also toggles it) */
  showDebugOverlay?: boolean;
}

// ─── z-index helpers ──────────────────────────────────────────────────────────

function resolveZIndices(zOrder: LayoutTemplate['zOrder']): {
  screenZ: number;
  cameraZ: number;
} {
  return zOrder === 'screen-above'
    ? { screenZ: 2, cameraZ: 1 }
    : { screenZ: 1, cameraZ: 2 };
}

// ─── fitMode helpers ──────────────────────────────────────────────────────────

function screenFitMode(kind: LayoutTemplate['kind']): FitMode {
  if (kind === 'SOCIAL_VERTICAL') return 'contain';
  return 'fill';
}

// ─── SelectionOverlay ─────────────────────────────────────────────────────────
//
// Renders the hover-selection border + resize handle dots for one region.

interface SelectionOverlayProps {
  region: 'screen' | 'camera';
  rect: Rect;
  circular: boolean;
  isHovered: boolean;
  isDragging: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onResizeStart: (edge: Edge, e: React.PointerEvent) => void;
}

function SelectionOverlay({
  region,
  rect,
  circular,
  isHovered,
  isDragging,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onResizeStart,
}: SelectionOverlayProps) {
  const edges = circular ? CORNER_EDGES : ALL_EDGES;
  const showHandles = isHovered && !isDragging;

  return (
    <div
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderRadius: circular ? '50%' : undefined,
        border: isHovered ? '2px solid rgba(90,160,250,0.6)' : '2px solid transparent',
        boxSizing: 'border-box',
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
      aria-label={`${region} region`}
    >
      {showHandles &&
        edges.map((edge) => (
          <div
            key={edge}
            style={getHandleStyle(edge)}
            onPointerDown={(e) => {
              onResizeStart(edge, e);
            }}
          >
            <HandleDot />
          </div>
        ))}
    </div>
  );
}

// ─── TemplatePreviewRenderer ──────────────────────────────────────────────────

export function TemplatePreviewRenderer({
  template,
  screenContent,
  cameraContent,
  screenAspect,
  cameraAspect,
  screenCornerRadius = 0,
  screenShadow,
  interactionEnabled = false,
  onRegionChange,
  screenRectOverride,
  cameraRectOverride,
  showDebugOverlay = false,
}: TemplatePreviewRendererProps) {
  // ── Container measurement ────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measure immediately
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Layout computation ───────────────────────────────────────────────────

  const { width: containerW, height: containerH } = containerSize;

  const canvasRect: Rect = { x: 0, y: 0, width: containerW, height: containerH };

  const computed = getLayoutRects(template.kind, canvasRect);

  const screenRect = screenRectOverride ?? computed.screenFrame;
  const cameraRect = cameraRectOverride ?? computed.cameraFrame;

  // ── zIndex ────────────────────────────────────────────────────────────────

  const { screenZ, cameraZ } = resolveZIndices(template.zOrder);

  // ── Drag/resize ───────────────────────────────────────────────────────────

  const { isDragging, hoveredRegion, startMove, startResize, setHoveredRegion } =
    useRegionDragResize({
      containerRef,
      onRegionChange,
      enabled: interactionEnabled,
    });

  const handleScreenPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactionEnabled || !screenRect) return;
      startMove('screen', screenRect, e);
    },
    [interactionEnabled, screenRect, startMove],
  );

  const handleCameraPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactionEnabled || !cameraRect) return;
      startMove('camera', cameraRect, e);
    },
    [interactionEnabled, cameraRect, startMove],
  );

  const handleScreenResizeStart = useCallback(
    (edge: Edge, e: React.PointerEvent) => {
      if (!interactionEnabled || !screenRect) return;
      startResize('screen', screenRect, edge, e);
    },
    [interactionEnabled, screenRect, startResize],
  );

  const handleCameraResizeStart = useCallback(
    (edge: Edge, e: React.PointerEvent) => {
      if (!interactionEnabled || !cameraRect) return;
      startResize('camera', cameraRect, edge, e);
    },
    [interactionEnabled, cameraRect, startResize],
  );

  // ── Debug overlay ─────────────────────────────────────────────────────────

  const [debugVisible] = useDebugToggle(showDebugOverlay);

  const debugRects = [
    { rect: canvasRect, label: 'canvas', color: DEBUG_COLORS.canvas },
    ...(screenRect ? [{ rect: screenRect, label: 'screenFrame', color: DEBUG_COLORS.screenFrame }] : []),
    ...(cameraRect ? [{ rect: cameraRect, label: 'cameraFrame', color: DEBUG_COLORS.cameraFrame }] : []),
  ];

  // ── CSS transition ────────────────────────────────────────────────────────

  const frameTransition = isDragging ? 'none' : 'all 300ms ease';

  // ── Nothing to render until measured ────────────────────────────────────

  if (containerW === 0 || containerH === 0) {
    return (
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', height: '100%' }}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isCircularCamera = template.kind === 'PIP';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Screen frame */}
      {screenRect && (
        <MediaFrame
          frame={screenRect}
          fitMode={screenFitMode(template.kind)}
          mediaAspect={screenAspect}
          borderRadius={screenCornerRadius}
          shadow={screenShadow}
          zIndex={screenZ}
          label="Screen"
          transition={frameTransition}
        >
          {screenContent}
        </MediaFrame>
      )}

      {/* Camera frame */}
      {cameraRect && (
        <MediaFrame
          frame={cameraRect}
          fitMode="fill"
          mediaAspect={cameraAspect}
          zIndex={cameraZ}
          circular={isCircularCamera}
          label="Camera"
          transition={frameTransition}
        >
          {cameraContent}
        </MediaFrame>
      )}

      {/* Interaction overlays */}
      {interactionEnabled && (
        <>
          {screenRect && (
            <SelectionOverlay
              region="screen"
              rect={screenRect}
              circular={false}
              isHovered={hoveredRegion === 'screen'}
              isDragging={isDragging && hoveredRegion === 'screen'}
              onPointerEnter={() => setHoveredRegion('screen')}
              onPointerLeave={() => { if (!isDragging) setHoveredRegion(null); }}
              onPointerDown={handleScreenPointerDown}
              onResizeStart={handleScreenResizeStart}
            />
          )}

          {cameraRect && (
            <SelectionOverlay
              region="camera"
              rect={cameraRect}
              circular={isCircularCamera}
              isHovered={hoveredRegion === 'camera'}
              isDragging={isDragging && hoveredRegion === 'camera'}
              onPointerEnter={() => setHoveredRegion('camera')}
              onPointerLeave={() => { if (!isDragging) setHoveredRegion(null); }}
              onPointerDown={handleCameraPointerDown}
              onResizeStart={handleCameraResizeStart}
            />
          )}
        </>
      )}

      {/* Debug overlay — always last child so it renders on top */}
      <DebugOverlay
        visible={debugVisible}
        rects={debugRects}
        containerWidth={containerW}
        containerHeight={containerH}
      />
    </div>
  );
}
