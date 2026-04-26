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
import type { CameraPresentation, RegionCrop, NormalizedRect } from '@rough-cut/project-model';
import { getCameraBorderRadius } from '@rough-cut/frame-resolver';
import { CropOverlay } from './CropOverlay.js';
import { alignRect } from './snap-guides.js';
import type { Alignment } from './snap-guides.js';

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
  /** Camera presentation controls from the inspector */
  cameraPresentation?: CameraPresentation;
  /** Corner radius for the screen frame (px) */
  screenCornerRadius?: number;
  /** Box shadow for the screen frame */
  screenShadow?: string;
  /** Extra padding around the screen frame only (px) */
  screenPadding?: number;
  /** Optional screen border width (px) */
  screenInset?: number;
  /** Optional screen border color */
  screenInsetColor?: string;
  /** Whether drag/resize interaction is enabled */
  interactionEnabled?: boolean;
  /** Called when a region is moved/resized — receives pixel-space Rect */
  onRegionChange?: (region: 'screen' | 'camera', rect: Rect) => void;
  /** User-supplied rect overrides (pixel space) — supersede computed rects */
  screenRectOverride?: Rect;
  cameraRectOverride?: Rect;
  screenNormalizedFrameOverride?: NormalizedRect;
  cameraNormalizedFrameOverride?: NormalizedRect;
  onScreenNormalizedFrameChange?: (rect: NormalizedRect) => void;
  /** Persisted normalized camera frame updates for save/reopen fidelity */
  onCameraNormalizedFrameChange?: (rect: NormalizedRect) => void;
  /** Force the debug overlay on (Ctrl+Shift+D also toggles it) */
  showDebugOverlay?: boolean;
  /** Screen crop state */
  screenCrop?: RegionCrop;
  /** Camera crop state */
  cameraCrop?: RegionCrop;
  /** Which region crop mode currently targets */
  cropRegion?: 'screen' | 'camera' | null;
  /** Whether crop editing mode is active */
  cropModeActive?: boolean;
  /** Toggle crop mode */
  onCropModeChange?: (active: boolean) => void;
  onScreenCropModeChange?: (active: boolean) => void;
  onCameraCropModeChange?: (active: boolean) => void;
  /** Update crop rect */
  onScreenCropChange?: (patch: Partial<RegionCrop>) => void;
  /** Update camera crop rect */
  onCameraCropChange?: (patch: Partial<RegionCrop>) => void;
  /** Source resolution for crop math */
  screenSourceWidth?: number;
  screenSourceHeight?: number;
  cameraSourceWidth?: number;
  cameraSourceHeight?: number;
  /** Imperative alignment ref — parent writes a callback that triggers alignment */
  alignRef?: React.MutableRefObject<((a: Alignment) => void) | null>;
  /** Called when the hovered region changes (for alignment toolbar enable/disable) */
  onHoveredRegionChange?: (region: 'screen' | 'camera' | null) => void;
  /** Called when a region is clicked (for sticky selection) */
  onRegionClick?: (region: 'screen' | 'camera' | null) => void;
  /** Currently selected region (sticky, set by click) */
  selectedRegion?: 'screen' | 'camera' | null;
  /** Current active zoom scale for camera auto-shrink behavior */
  activeZoomScale?: number;
  /** Debug/verification aid: which layout snapshot frame is currently active */
  activeLayoutFrame?: number | null;
  activeLayoutVisible?: boolean | null;
}

function normalizedRectToCanvasRect(rect: NormalizedRect, width: number, height: number): Rect {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.w * width,
    height: rect.h * height,
  };
}

function canvasRectToNormalizedRect(rect: Rect, width: number, height: number): NormalizedRect {
  return {
    x: rect.x / width,
    y: rect.y / height,
    w: rect.width / width,
    h: rect.height / height,
  };
}

// ─── z-index helpers ──────────────────────────────────────────────────────────

function resolveZIndices(zOrder: LayoutTemplate['zOrder']): {
  screenZ: number;
  cameraZ: number;
} {
  return zOrder === 'screen-above' ? { screenZ: 2, cameraZ: 1 } : { screenZ: 1, cameraZ: 2 };
}

function getCameraAspectRatio(cameraPresentation?: CameraPresentation): number {
  if (cameraPresentation?.shape === 'circle') return 1;

  switch (cameraPresentation?.aspectRatio) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '4:3':
      return 4 / 3;
    case '1:1':
    default:
      return 1;
  }
}

function getCameraFrameRect(frame: Rect, cameraPresentation?: CameraPresentation): Rect {
  if (!cameraPresentation) return frame;

  const targetAspect = getCameraAspectRatio(cameraPresentation);

  let width = frame.width;
  let height = width / targetAspect;

  if (height > frame.height) {
    height = frame.height;
    width = height * targetAspect;
  }

  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

function positionCameraFrame(
  frame: Rect,
  canvasRect: Rect,
  cameraPresentation?: CameraPresentation,
  activeZoomScale = 1,
): Rect | null {
  if (cameraPresentation?.visible === false) return null;

  const zoomAmount = Math.max(0, activeZoomScale - 1);
  const zoomProgress = Math.min(zoomAmount / 1.5, 1);
  const autoShrinkFactor = 1 - zoomProgress * 0.28;
  const sizeScale = Math.max(0, cameraPresentation?.size ?? 100) / 100;
  const effectiveSizeScale = sizeScale * autoShrinkFactor;
  const width = frame.width * effectiveSizeScale;
  const height = frame.height * effectiveSizeScale;

  const leftMargin = frame.x - canvasRect.x;
  const rightMargin = canvasRect.x + canvasRect.width - (frame.x + frame.width);
  const topMargin = frame.y - canvasRect.y;
  const bottomMargin = canvasRect.y + canvasRect.height - (frame.y + frame.height);

  switch (cameraPresentation?.position) {
    case 'corner-tl':
      return { x: canvasRect.x + leftMargin, y: canvasRect.y + topMargin, width, height };
    case 'corner-tr':
      return {
        x: canvasRect.x + canvasRect.width - rightMargin - width,
        y: canvasRect.y + topMargin,
        width,
        height,
      };
    case 'corner-bl':
      return {
        x: canvasRect.x + leftMargin,
        y: canvasRect.y + canvasRect.height - bottomMargin - height,
        width,
        height,
      };
    case 'center':
      return {
        x: canvasRect.x + (canvasRect.width - width) / 2,
        y: canvasRect.y + (canvasRect.height - height) / 2,
        width,
        height,
      };
    case 'corner-br':
    default:
      return {
        x: canvasRect.x + canvasRect.width - rightMargin - width,
        y: canvasRect.y + canvasRect.height - bottomMargin - height,
        width,
        height,
      };
  }
}

function applyCameraAutoShrink(
  frame: Rect,
  canvasRect: Rect,
  cameraPresentation?: CameraPresentation,
  activeZoomScale = 1,
): Rect {
  const zoomAmount = Math.max(0, activeZoomScale - 1);
  const zoomProgress = Math.min(zoomAmount / 1.5, 1);
  const autoShrinkFactor = 1 - zoomProgress * 0.28;
  if (autoShrinkFactor >= 0.999) return frame;

  const width = frame.width * autoShrinkFactor;
  const height = frame.height * autoShrinkFactor;
  const leftMargin = frame.x - canvasRect.x;
  const rightMargin = canvasRect.x + canvasRect.width - (frame.x + frame.width);
  const topMargin = frame.y - canvasRect.y;
  const bottomMargin = canvasRect.y + canvasRect.height - (frame.y + frame.height);

  switch (cameraPresentation?.position) {
    case 'corner-tl':
      return { x: canvasRect.x + leftMargin, y: canvasRect.y + topMargin, width, height };
    case 'corner-tr':
      return {
        x: canvasRect.x + canvasRect.width - rightMargin - width,
        y: canvasRect.y + topMargin,
        width,
        height,
      };
    case 'corner-bl':
      return {
        x: canvasRect.x + leftMargin,
        y: canvasRect.y + canvasRect.height - bottomMargin - height,
        width,
        height,
      };
    case 'center':
      return {
        x: canvasRect.x + (canvasRect.width - width) / 2,
        y: canvasRect.y + (canvasRect.height - height) / 2,
        width,
        height,
      };
    case 'corner-br':
    default:
      return {
        x: canvasRect.x + canvasRect.width - rightMargin - width,
        y: canvasRect.y + canvasRect.height - bottomMargin - height,
        width,
        height,
      };
  }
}

function getCameraFrameBorderRadius(
  cameraPresentation: CameraPresentation | undefined,
  frame: Rect | null,
): number | string {
  if (!cameraPresentation) return 0;
  if (!frame) return cameraPresentation.shape === 'circle' ? '50%' : 0;
  return getCameraBorderRadius(cameraPresentation, frame.width, frame.height);
}

// ─── TemplatePreviewRenderer ──────────────────────────────────────────────────

export function TemplatePreviewRenderer({
  template,
  screenContent,
  cameraContent,
  screenAspect,
  cameraAspect,
  cameraPresentation,
  screenCornerRadius = 0,
  screenShadow,
  screenPadding = 0,
  screenInset = 0,
  screenInsetColor = '#ffffff',
  interactionEnabled = false,
  onRegionChange,
  screenRectOverride,
  cameraRectOverride,
  screenNormalizedFrameOverride,
  cameraNormalizedFrameOverride,
  onScreenNormalizedFrameChange,
  onCameraNormalizedFrameChange,
  showDebugOverlay = false,
  screenCrop,
  cameraCrop,
  cropRegion = 'screen',
  cropModeActive = false,
  onCropModeChange,
  onScreenCropModeChange,
  onCameraCropModeChange,
  onScreenCropChange,
  onCameraCropChange,
  screenSourceWidth = 1920,
  screenSourceHeight = 1080,
  cameraSourceWidth = 1920,
  cameraSourceHeight = 1080,
  alignRef,
  onHoveredRegionChange,
  onRegionClick,
  selectedRegion,
  activeZoomScale = 1,
  activeLayoutFrame = null,
  activeLayoutVisible = null,
}: TemplatePreviewRendererProps) {
  const insetRect = useCallback((rect: Rect, inset: number, aspect: number): Rect => {
    const targetAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : rect.width / rect.height;
    const clampedInset = Math.max(0, Math.min(inset, Math.floor((rect.width - 1) / 2)));
    const width = Math.max(1, rect.width - clampedInset * 2);
    const height = Math.max(1, width / targetAspect);

    return {
      x: rect.x + clampedInset,
      y: rect.y + (rect.height - height) / 2,
      width,
      height,
    };
  }, []);

  // ── Container measurement ────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateContainerSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }

      setContainerSize((prev) => {
        if (prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
    };

    // Keep the current preview subtree mounted if ResizeObserver briefly reports
    // 0x0 during a window resize gesture.
    updateContainerSize(el.clientWidth, el.clientHeight);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        updateContainerSize(width, height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Layout computation ───────────────────────────────────────────────────

  const { width: containerW, height: containerH } = containerSize;

  const canvasRect: Rect = { x: 0, y: 0, width: containerW, height: containerH };
  const previewScale = Math.min(containerW / screenSourceWidth, containerH / screenSourceHeight);
  const scaledScreenPadding = screenPadding * previewScale;
  const scaledScreenInset = screenInset * previewScale;
  const scaledScreenCornerRadius =
    typeof screenCornerRadius === 'number' ? screenCornerRadius * previewScale : screenCornerRadius;
  const scaledCameraPadding = (cameraPresentation?.padding ?? 0) * previewScale;
  const scaledCameraInset = (cameraPresentation?.inset ?? 0) * previewScale;
  const scaledCameraShadowBlur = (cameraPresentation?.shadowBlur ?? 24) * previewScale;
  const cameraShadow = cameraPresentation?.shadowEnabled
    ? `0 ${Math.round(scaledCameraShadowBlur * 0.25)}px ${scaledCameraShadowBlur}px rgba(0,0,0,${cameraPresentation.shadowOpacity ?? 0.45})`
    : undefined;

  const computed = getLayoutRects(template.kind, canvasRect, screenAspect ?? 16 / 9);

  const handleRegionChange = useCallback(
    (region: 'screen' | 'camera', rect: Rect) => {
      onRegionChange?.(region, rect);
      if (containerW <= 0 || containerH <= 0) {
        return;
      }
      if (region === 'screen') {
        onScreenNormalizedFrameChange?.(canvasRectToNormalizedRect(rect, containerW, containerH));
      }
      if (region === 'camera') {
        onCameraNormalizedFrameChange?.(canvasRectToNormalizedRect(rect, containerW, containerH));
      }
    },
    [
      containerH,
      containerW,
      onCameraNormalizedFrameChange,
      onRegionChange,
      onScreenNormalizedFrameChange,
    ],
  );

  const normalizedScreenFrame = screenNormalizedFrameOverride
    ? normalizedRectToCanvasRect(screenNormalizedFrameOverride, containerW, containerH)
    : null;
  const rawScreenRect = screenRectOverride ?? normalizedScreenFrame ?? computed.screenFrame;
  const normalizedCameraFrameRaw = cameraNormalizedFrameOverride
    ? normalizedRectToCanvasRect(cameraNormalizedFrameOverride, containerW, containerH)
    : null;
  // BUG-005 fix: when shape is 'circle', the persisted frame may have non-square w/h.
  // Enforce 1:1 by taking the smaller dimension and centering.
  const normalizedCameraFrame = (() => {
    if (!normalizedCameraFrameRaw || cameraPresentation?.shape !== 'circle') {
      return normalizedCameraFrameRaw;
    }
    const side = Math.min(normalizedCameraFrameRaw.width, normalizedCameraFrameRaw.height);
    return {
      x: normalizedCameraFrameRaw.x + (normalizedCameraFrameRaw.width - side) / 2,
      y: normalizedCameraFrameRaw.y + (normalizedCameraFrameRaw.height - side) / 2,
      width: side,
      height: side,
    };
  })();
  const cameraRect = cameraRectOverride ?? computed.cameraFrame;
  const screenRect = rawScreenRect
    ? insetRect(
        rawScreenRect,
        scaledScreenPadding,
        screenAspect ?? rawScreenRect.width / rawScreenRect.height,
      )
    : null;
  const rawCameraFrame =
    cameraPresentation?.visible === false
      ? null
      : normalizedCameraFrame
        ? applyCameraAutoShrink(normalizedCameraFrame, canvasRect, cameraPresentation, activeZoomScale)
        : cameraRect
          ? positionCameraFrame(
              getCameraFrameRect(cameraRect, cameraPresentation),
              canvasRect,
              cameraPresentation,
              activeZoomScale,
            )
          : null;
  const cameraFrame = rawCameraFrame;

  // ── zIndex ────────────────────────────────────────────────────────────────

  const { screenZ, cameraZ } = resolveZIndices(template.zOrder);

  // ── Drag/resize ───────────────────────────────────────────────────────────

  const cameraDragAspect = cameraFrame ? getCameraAspectRatio(cameraPresentation) : cameraAspect;

  const { isDragging, hoveredRegion, startMove, startResize, setHoveredRegion, activeGuidesRef } =
    useRegionDragResize({
      containerRef,
      onRegionChange: handleRegionChange,
      enabled: interactionEnabled,
      snapConfig: interactionEnabled
        ? {
            containerWidth: containerW,
            containerHeight: containerH,
            screenRect: screenRect ?? null,
            cameraRect: cameraFrame ?? null,
          }
        : undefined,
    });

  const handleScreenPointerDown = useCallback(
    (e: React.PointerEvent) => {
      onRegionClick?.('screen');
      if (!interactionEnabled || !screenRect) return;
      startMove('screen', screenRect, e, screenAspect);
    },
    [interactionEnabled, screenRect, startMove, screenAspect, onRegionClick],
  );

  const handleCameraPointerDown = useCallback(
    (e: React.PointerEvent) => {
      onRegionClick?.('camera');
      if (!interactionEnabled || !cameraFrame) return;
      startMove('camera', cameraFrame, e, cameraDragAspect);
    },
    [interactionEnabled, cameraFrame, startMove, cameraDragAspect, onRegionClick],
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
      if (!interactionEnabled || !cameraFrame) return;
      startResize('camera', cameraFrame, edge, e, cameraDragAspect);
    },
    [interactionEnabled, cameraFrame, startResize, cameraDragAspect],
  );

  const handleScreenDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const activateCrop = onScreenCropModeChange ?? onCropModeChange;
      if (!activateCrop || !screenCrop?.enabled) return;
      e.stopPropagation();
      activateCrop(true);
    },
    [onCropModeChange, onScreenCropModeChange, screenCrop?.enabled],
  );

  const handleCameraDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const activateCrop = onCameraCropModeChange ?? onCropModeChange;
      if (!activateCrop || !cameraCrop?.enabled) return;
      e.stopPropagation();
      activateCrop(true);
    },
    [onCameraCropModeChange, onCropModeChange, cameraCrop?.enabled],
  );

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

  // ── Notify parent when hovered region changes ─────────────────────────────

  useEffect(() => {
    onHoveredRegionChange?.(hoveredRegion);
  }, [hoveredRegion, onHoveredRegionChange]);

  // ── Imperative alignment ref ─────────────────────────────────────────────

  // Keep a stable ref to hoveredRegion so alignRef callback reads latest value
  const hoveredRegionRef = useRef(hoveredRegion);
  hoveredRegionRef.current = hoveredRegion;

  // Keep a stable ref to selectedRegion so alignRef callback reads latest value
  const selectedRegionRef = useRef(selectedRegion);
  selectedRegionRef.current = selectedRegion;

  useEffect(() => {
    if (!alignRef) return;
    alignRef.current = (alignment: Alignment) => {
      const region = selectedRegionRef.current ?? hoveredRegionRef.current;
      if (!region || !onRegionChange) return;

      const currentRect = region === 'screen' ? screenRect : cameraFrame;
      if (!currentRect) return;

      const container: Rect = { x: 0, y: 0, width: containerW, height: containerH };
      const aligned = alignRect(currentRect, container, alignment);
      onRegionChange(region, aligned);
    };
    return () => {
      if (alignRef) alignRef.current = null;
    };
  }, [alignRef, onRegionChange, screenRect, cameraFrame, containerW, containerH]);

  // ── Snap guide rendering state (force re-render on drag frame) ───────────

  // We need to re-read activeGuidesRef during drag. The isDragging state
  // already triggers re-renders; we read the ref inside render.
  const guides = (isDragging ? activeGuidesRef.current : null) ?? [];

  // ── Crop overlay ref ──────────────────────────────────────────────────────

  const cropWrapperRef = useRef<HTMLDivElement>(null);

  const debugRects = [
    { rect: canvasRect, label: 'canvas', color: DEBUG_COLORS.canvas },
    ...(screenRect
      ? [{ rect: screenRect, label: 'screenFrame', color: DEBUG_COLORS.screenFrame }]
      : []),
    ...(cameraFrame
      ? [{ rect: cameraFrame, label: 'cameraFrame', color: DEBUG_COLORS.cameraFrame }]
      : []),
  ];

  // ── CSS transition ────────────────────────────────────────────────────────

  const frameTransition = isDragging ? 'none' : 'all 300ms ease';
  const isCircularCamera = cameraPresentation?.shape === 'circle';
  const cameraBorderRadius = getCameraFrameBorderRadius(cameraPresentation, cameraFrame);
  const isScreenCropActive = cropModeActive && cropRegion !== 'camera';
  const isCameraCropActive = cropModeActive && cropRegion === 'camera';
  const activeCropLabel = isCameraCropActive
    ? 'Focusing camera'
    : isScreenCropActive
      ? 'Focusing screen'
      : null;

  // ── Nothing to render until measured ────────────────────────────────────

  if (containerW === 0 || containerH === 0) {
    return (
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="template-preview-root"
      data-template-id={template.id}
      data-camera-visible={cameraPresentation?.visible === false ? 'false' : 'true'}
      data-camera-position={cameraPresentation?.position ?? 'unknown'}
      data-camera-shape={cameraPresentation?.shape ?? 'unknown'}
      data-camera-frame-x={cameraFrame ? (cameraFrame.x / containerW).toFixed(4) : ''}
      data-camera-frame-y={cameraFrame ? (cameraFrame.y / containerH).toFixed(4) : ''}
      data-camera-frame-w={cameraFrame ? (cameraFrame.width / containerW).toFixed(4) : ''}
      data-camera-frame-h={cameraFrame ? (cameraFrame.height / containerH).toFixed(4) : ''}
      data-active-layout-frame={activeLayoutFrame == null ? '' : String(activeLayoutFrame)}
      data-active-layout-visible={
        activeLayoutVisible == null ? '' : activeLayoutVisible ? 'true' : 'false'
      }
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onRegionClick?.(null);
      }}
    >
      {/* Screen frame — always visible, even during crop mode */}
      {screenRect && (
        <MediaFrame
          frame={screenRect}
          fitMode="fill"
          mediaAspect={screenAspect}
          borderRadius={scaledScreenCornerRadius}
          shadow={screenShadow}
          border={
            scaledScreenInset > 0 ? `${scaledScreenInset}px solid ${screenInsetColor}` : undefined
          }
          zIndex={screenZ}
          label="Screen"
          testId="record-screen-frame"
          transition={frameTransition}
          interactive={interactionEnabled}
          isHovered={hoveredRegion === 'screen'}
          isSelected={selectedRegion === 'screen'}
          isDragging={isDragging && hoveredRegion === 'screen'}
          onPointerEnter={() => setHoveredRegion('screen')}
          onPointerLeave={() => {
            if (!isDragging) setHoveredRegion(null);
          }}
          onPointerDown={handleScreenPointerDown}
          onDoubleClick={handleScreenDoubleClick}
          onResizeStart={handleScreenResizeStart}
          crop={screenCrop}
          cropModeActive={isScreenCropActive}
          sourceWidth={screenSourceWidth}
          sourceHeight={screenSourceHeight}
        >
          {screenContent}
        </MediaFrame>
      )}

      {/* Camera frame */}
      {cameraFrame && (
        <MediaFrame
          frame={cameraFrame}
          fitMode="fill"
          mediaAspect={cameraAspect}
          zIndex={cameraZ}
          circular={isCircularCamera}
          borderRadius={cameraBorderRadius}
          shadow={cameraShadow}
          contentPadding={scaledCameraPadding}
          border={
            scaledCameraInset > 0
              ? `${scaledCameraInset}px solid ${cameraPresentation?.insetColor ?? '#ffffff'}`
              : undefined
          }
          label="Camera"
          testId="record-camera-frame"
          transition={frameTransition}
          interactive={interactionEnabled}
          isHovered={hoveredRegion === 'camera'}
          isSelected={selectedRegion === 'camera'}
          isDragging={isDragging && hoveredRegion === 'camera'}
          onPointerEnter={() => setHoveredRegion('camera')}
          onPointerLeave={() => {
            if (!isDragging) setHoveredRegion(null);
          }}
          onPointerDown={handleCameraPointerDown}
          onDoubleClick={handleCameraDoubleClick}
          onResizeStart={handleCameraResizeStart}
          crop={cameraCrop}
          cropModeActive={isCameraCropActive}
          sourceWidth={cameraSourceWidth}
          sourceHeight={cameraSourceHeight}
        >
          {cameraContent}
        </MediaFrame>
      )}

      {/* Crop overlay — positioned at the active cropped frame */}
      {isScreenCropActive && screenCrop?.enabled && screenRect && onScreenCropChange && (
        <div
          ref={cropWrapperRef}
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
            sourceWidth={screenSourceWidth}
            sourceHeight={screenSourceHeight}
            onCropChange={onScreenCropChange}
            containerRef={cropWrapperRef}
            onExit={onCropModeChange ? () => onCropModeChange(false) : undefined}
          />
        </div>
      )}

      {isCameraCropActive && cameraCrop?.enabled && cameraFrame && onCameraCropChange && (
        <div
          ref={cropWrapperRef}
          style={{
            position: 'absolute',
            left: cameraFrame.x,
            top: cameraFrame.y,
            width: cameraFrame.width,
            height: cameraFrame.height,
            zIndex: 30,
            overflow: 'visible',
          }}
        >
          <CropOverlay
            crop={cameraCrop}
            sourceWidth={cameraSourceWidth}
            sourceHeight={cameraSourceHeight}
            onCropChange={onCameraCropChange}
            containerRef={cropWrapperRef}
            onExit={onCropModeChange ? () => onCropModeChange(false) : undefined}
          />
        </div>
      )}

      {activeCropLabel && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.92)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.02em',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {activeCropLabel}
        </div>
      )}

      {/* Snap guide lines */}
      {guides.map((guide, i) =>
        guide.axis === 'x' ? (
          <div
            key={`snap-${i}`}
            style={{
              position: 'absolute',
              left: guide.position,
              top: 0,
              width: 0,
              height: '100%',
              borderLeft: '1px dashed rgba(59,130,246,0.8)',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        ) : (
          <div
            key={`snap-${i}`}
            style={{
              position: 'absolute',
              left: 0,
              top: guide.position,
              width: '100%',
              height: 0,
              borderTop: '1px dashed rgba(59,130,246,0.8)',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        ),
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
