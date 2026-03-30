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
import type { Rect } from './template-layout/types.js';
import { getLayoutRects } from './template-layout/index.js';
import { DebugOverlay, DEBUG_COLORS } from './template-layout/DebugOverlay.js';
import { useDebugToggle } from './template-layout/useDebugToggle.js';
import { MediaFrame } from './MediaFrame.js';
import { useRegionDragResize } from './useRegionDragResize.js';
import type { Edge } from './useRegionDragResize.js';
import type { RegionCrop } from '@rough-cut/project-model';
import { CropOverlay } from './CropOverlay.js';

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
  /** Screen crop state */
  screenCrop?: RegionCrop;
  /** Whether crop editing mode is active */
  cropModeActive?: boolean;
  /** Toggle crop mode */
  onCropModeChange?: (active: boolean) => void;
  /** Update crop rect */
  onScreenCropChange?: (patch: Partial<RegionCrop>) => void;
  /** Source resolution for crop math */
  sourceWidth?: number;
  sourceHeight?: number;
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
  screenCrop,
  cropModeActive = false,
  onCropModeChange,
  onScreenCropChange,
  sourceWidth = 1920,
  sourceHeight = 1080,
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

  const computed = getLayoutRects(template.kind, canvasRect, screenAspect ?? 16 / 9);

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
      startMove('screen', screenRect, e, screenAspect);
    },
    [interactionEnabled, screenRect, startMove, screenAspect],
  );

  const handleCameraPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactionEnabled || !cameraRect) return;
      startMove('camera', cameraRect, e, cameraAspect);
    },
    [interactionEnabled, cameraRect, startMove, cameraAspect],
  );

  const handleScreenResizeStart = useCallback(
    (edge: Edge, e: React.PointerEvent) => {
      if (!interactionEnabled || !screenRect) return;
      startResize('screen', screenRect, edge, e, screenAspect);
    },
    [interactionEnabled, screenRect, startResize, screenAspect],
  );

  const handleCameraResizeStart = useCallback(
    (edge: Edge, e: React.PointerEvent) => {
      if (!interactionEnabled || !cameraRect) return;
      startResize('camera', cameraRect, edge, e, cameraAspect);
    },
    [interactionEnabled, cameraRect, startResize, cameraAspect],
  );

  const handleScreenDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!onCropModeChange || !onScreenCropChange) return;
    e.stopPropagation();
    // Auto-enable crop with 10% inset if not enabled
    if (!screenCrop?.enabled) {
      const insetX = Math.round(sourceWidth * 0.1);
      const insetY = Math.round(sourceHeight * 0.1);
      onScreenCropChange({
        enabled: true,
        x: insetX,
        y: insetY,
        width: sourceWidth - insetX * 2,
        height: sourceHeight - insetY * 2,
      });
    }
    onCropModeChange(true);
  }, [onCropModeChange, onScreenCropChange, screenCrop?.enabled, sourceWidth, sourceHeight]);

  // ── Debug overlay ─────────────────────────────────────────────────────────

  const [debugVisible] = useDebugToggle(showDebugOverlay);

  // Escape exits crop mode
  useEffect(() => {
    if (!cropModeActive || !onCropModeChange) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCropModeChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cropModeActive, onCropModeChange]);

  // ── Crop overlay ref ──────────────────────────────────────────────────────

  const screenCropWrapperRef = useRef<HTMLDivElement>(null);

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
      {/* Screen frame — always visible, even during crop mode */}
      {screenRect && (
        <MediaFrame
          frame={screenRect}
          fitMode="fill"
          mediaAspect={screenAspect}
          borderRadius={screenCornerRadius}
          shadow={screenShadow}
          zIndex={screenZ}
          label="Screen"
          transition={frameTransition}
          interactive={interactionEnabled}
          isHovered={hoveredRegion === 'screen'}
          isDragging={isDragging && hoveredRegion === 'screen'}
          onPointerEnter={() => setHoveredRegion('screen')}
          onPointerLeave={() => { if (!isDragging) setHoveredRegion(null); }}
          onPointerDown={handleScreenPointerDown}
          onDoubleClick={handleScreenDoubleClick}
          onResizeStart={handleScreenResizeStart}
          crop={screenCrop}
          cropModeActive={cropModeActive}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
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
          interactive={interactionEnabled}
          isHovered={hoveredRegion === 'camera'}
          isDragging={isDragging && hoveredRegion === 'camera'}
          onPointerEnter={() => setHoveredRegion('camera')}
          onPointerLeave={() => { if (!isDragging) setHoveredRegion(null); }}
          onPointerDown={handleCameraPointerDown}
          onResizeStart={handleCameraResizeStart}
        >
          {cameraContent}
        </MediaFrame>
      )}

      {/* Crop overlay — positioned at screen frame */}
      {cropModeActive && screenCrop?.enabled && screenRect && onScreenCropChange && (
        <div
          ref={screenCropWrapperRef}
          style={{
            position: 'absolute',
            left: screenRect.x,
            top: screenRect.y,
            width: screenRect.width,
            height: screenRect.height,
            zIndex: 30,
            overflow: 'visible',
          }}
        >
          <CropOverlay
            crop={screenCrop}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            onCropChange={onScreenCropChange}
            containerRef={screenCropWrapperRef}
            onExit={onCropModeChange ? () => onCropModeChange(false) : undefined}
          />
        </div>
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
