import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { RegionCrop } from '@rough-cut/project-model';
import type { LayoutTemplate, NormalizedRect, InstanceLayout } from './templates.js';
import { toCssRect, resolveRect } from './templates.js';
import { CropOverlay } from './CropOverlay.js';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviewCardProps {
  /** Active layout template controlling region placement */
  layout: LayoutTemplate;
  /** Screen capture content (LivePreviewVideo or compositor canvas) */
  screenNode?: React.ReactNode;
  /** Camera/webcam content (real webcam or placeholder) */
  cameraNode?: React.ReactNode;
  onChooseSource?: () => void;
  /** Screen recording's native aspect ratio (e.g. '16 / 9') */
  screenAspectRatio?: string;
  /** Camera's native aspect ratio (e.g. '4 / 3') */
  cameraAspectRatio?: string;
  /** User overrides for region positions/sizes */
  instanceLayout?: InstanceLayout;
  /** Called when user drags/resizes a region */
  onRegionChange?: (region: 'screen' | 'camera', rect: NormalizedRect) => void;
  /** Background solid color (hex) */
  bgColor?: string;
  /** Background CSS gradient string (takes priority over bgColor) */
  bgGradient?: string | null;
  /** Padding between background edge and content frame (px) */
  bgPadding?: number;
  /** Corner radius on the content frame (px) */
  bgCornerRadius?: number;
  /** Whether to show a drop shadow on the content frame */
  bgShadowEnabled?: boolean;
  /** Shadow blur radius (px) */
  bgShadowBlur?: number;
  /** Inset border width around content frame (px) */
  bgInset?: number;
  /** Inset border color (hex) */
  bgInsetColor?: string;
  /** Screen region crop (source-pixel coordinates) */
  screenCrop?: RegionCrop;
  /** Camera region crop (source-pixel coordinates) */
  cameraCrop?: RegionCrop;
  /** Source resolution for crop math (screen) */
  sourceWidth?: number;
  /** Source resolution for crop math (screen) */
  sourceHeight?: number;
  /** Whether visual crop editing mode is active */
  cropModeActive?: boolean;
  /** Called when crop overlay changes the crop rect */
  onScreenCropChange?: (patch: Partial<RegionCrop>) => void;
}

// ─── Drag/resize state types ─────────────────────────────────────────────────

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface DragState {
  region: 'screen' | 'camera';
  startX: number;
  startY: number;
  originalRect: NormalizedRect;
  mode: 'move' | 'resize';
  edge?: Edge;
  moved: boolean;
}

const DRAG_THRESHOLD = 3;
const MIN_SIZE = 0.1;

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

// ─── Resize handle positions ─────────────────────────────────────────────────

const HANDLE_DOT = 10;
const HANDLE_HIT = 24; // large invisible hit area for easy grabbing

function getHandleStyle(edge: Edge): React.CSSProperties {
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

function HandleDot() {
  return (
    <div style={{
      width: HANDLE_DOT,
      height: HANDLE_DOT,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.9)',
      border: '1.5px solid rgba(0,0,0,0.4)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
    }} />
  );
}

const ALL_EDGES: Edge[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
const CORNER_EDGES: Edge[] = ['nw', 'ne', 'sw', 'se'];

// ─── Crop transform math ────────────────────────────────────────────────────

interface CropTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

/**
 * Compute CSS transform values to render a crop viewport.
 * Uses "cover" strategy: crop rect fills the viewport completely.
 * Applied as: transform-origin: 0 0; transform: scale(S) translate(Tx, Ty)
 * where translate values are in pre-scale (source pixel) space.
 */
function computeCropTransform(
  viewW: number,
  viewH: number,
  crop: RegionCrop,
): CropTransform {
  const scale = Math.max(viewW / crop.width, viewH / crop.height);
  return { scale, translateX: -crop.x, translateY: -crop.y };
}

// ─── Clamping helpers ────────────────────────────────────────────────────────

function clampRect(r: NormalizedRect): NormalizedRect {
  let { x, y, w, h } = r;
  w = Math.max(MIN_SIZE, Math.min(w, 1));
  h = Math.max(MIN_SIZE, Math.min(h, 1));
  x = Math.max(0, Math.min(x, 1 - w));
  y = Math.max(0, Math.min(y, 1 - h));
  return { x, y, w, h };
}

function applyResize(
  original: NormalizedRect,
  edge: Edge,
  dxNorm: number,
  dyNorm: number,
): NormalizedRect {
  const aspect = original.w / original.h;
  let { x, y, w, h } = original;

  // Corner handles: aspect-ratio-locked resize.
  // Use whichever axis moved more to drive the resize, derive the other.
  if (edge.length === 2) {
    const absDx = Math.abs(dxNorm);
    const absDy = Math.abs(dyNorm);
    const useX = absDx >= absDy;

    let dw: number;
    let dh: number;

    if (useX) {
      dw = edge.includes('e') ? dxNorm : -dxNorm;
      dh = dw / aspect;
    } else {
      dh = edge.includes('s') ? dyNorm : -dyNorm;
      dw = dh * aspect;
    }

    w = w + dw;
    h = h + dh;

    // Anchor the opposite corner
    if (edge.includes('w')) x = original.x + original.w - w;
    if (edge.includes('n')) y = original.y + original.h - h;

    // Enforce minimum (aspect-locked)
    if (w < MIN_SIZE) {
      w = MIN_SIZE;
      h = w / aspect;
      if (edge.includes('w')) x = original.x + original.w - w;
      if (edge.includes('n')) y = original.y + original.h - h;
    }
    if (h < MIN_SIZE) {
      h = MIN_SIZE;
      w = h * aspect;
      if (edge.includes('w')) x = original.x + original.w - w;
      if (edge.includes('n')) y = original.y + original.h - h;
    }

    return clampRect({ x, y, w, h });
  }

  // Edge handles: single-axis resize, derive other axis to keep aspect ratio.
  if (edge === 'e') {
    w = w + dxNorm;
    h = w / aspect;
  } else if (edge === 'w') {
    const dw = -dxNorm;
    w = w + dw;
    h = w / aspect;
    x = original.x + original.w - w;
    y = original.y + (original.h - h) / 2; // center vertically
  } else if (edge === 's') {
    h = h + dyNorm;
    w = h * aspect;
    x = original.x + (original.w - w) / 2; // center horizontally
  } else if (edge === 'n') {
    const dh = -dyNorm;
    h = h + dh;
    w = h * aspect;
    y = original.y + original.h - h;
    x = original.x + (original.w - w) / 2; // center horizontally
  }

  // Enforce minimum (aspect-locked)
  if (w < MIN_SIZE) {
    w = MIN_SIZE;
    h = w / aspect;
  }
  if (h < MIN_SIZE) {
    h = MIN_SIZE;
    w = h * aspect;
  }

  return clampRect({ x, y, w, h });
}

// ─── Placeholder icons ───────────────────────────────────────────────────────

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

// ─── Region placeholder ──────────────────────────────────────────────────────

function RegionPlaceholder({
  kind,
  onChooseSource,
}: {
  kind: 'screen' | 'camera';
  onChooseSource?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isScreen = kind === 'screen';

  return (
    <div
      onClick={isScreen ? onChooseSource : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: isScreen
          ? 'rgba(90,160,250,0.08)'
          : 'rgba(255,107,90,0.08)',
        border: `1px solid ${isScreen ? 'rgba(90,160,250,0.15)' : 'rgba(255,107,90,0.15)'}`,
        borderRadius: 'inherit',
        color: isScreen ? 'rgba(90,160,250,0.6)' : 'rgba(255,107,90,0.6)',
        cursor: isScreen && onChooseSource ? 'pointer' : 'default',
        opacity: hovered && isScreen ? 1 : 0.8,
        transition: 'opacity 150ms ease, background 150ms ease',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {isScreen ? <ScreenPlaceholderIcon /> : <CameraPlaceholderIcon />}
      <span style={{ fontSize: 10, fontWeight: 500, textAlign: 'center', padding: '0 8px' }}>
        {isScreen ? 'Screen' : 'Camera'}
      </span>
    </div>
  );
}

// ─── PreviewCard ──────────────────────────────────────────────────────────────
//
// Multi-region layout container (Focusee/Screen Studio pattern):
//
//   Layer 1 — Background canvas: gradient or solid color, ALWAYS visible
//   Layer 2 — Content frame: padded, rounded, shadowed, ALWAYS visible
//   Layer 3 — Regions: screen + camera positioned by NormalizedRects from template
//
// Templates define where screen and camera sit inside the frame.
// When no content is provided for a region, a colored placeholder is shown.

export function PreviewCard({
  layout,
  screenNode,
  cameraNode,
  onChooseSource,
  screenAspectRatio = '16 / 9',
  cameraAspectRatio = '4 / 3',
  instanceLayout,
  onRegionChange,
  bgColor = '#4a1942',
  bgGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  bgPadding = 40,
  bgCornerRadius = 12,
  bgShadowEnabled = true,
  bgShadowBlur = 20,
  bgInset = 0,
  bgInsetColor = '#ffffff',
  screenCrop,
  cameraCrop,
  sourceWidth = 1920,
  sourceHeight = 1080,
  cropModeActive = false,
  onScreenCropChange,
}: PreviewCardProps) {
  const { zOrder, aspectRatio } = layout;
  const hasAnyContent = Boolean(screenNode) || Boolean(cameraNode);

  // Resolve rects: user override wins over template base
  const screenRect = resolveRect(layout.screenRect, instanceLayout?.screenRect);
  const cameraRect = resolveRect(layout.cameraRect, instanceLayout?.cameraRect);

  // Ref to the content frame div (Layer 2) for pixel-to-normalized conversion
  const contentFrameRef = useRef<HTMLDivElement>(null);

  // Ref to the screen MediaFrame for CropOverlay coordinate conversion
  const screenFrameRef = useRef<HTMLDivElement>(null);

  // Mutable drag state stored in ref to avoid re-renders on every pixel
  const dragRef = useRef<DragState | null>(null);

  // Render state: only these cause re-renders
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<'screen' | 'camera' | null>(null);

  // CSS aspect ratio from template
  const cssAspectRatio = aspectRatio.replace(':', ' / ');

  // Aspect-ratio-preserving padding: different px for horizontal vs vertical
  // so the padded area keeps the same ratio as the card. Prevents sub-pixel gaps.
  const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
  const cardAspect = ratioW / ratioH;
  const padH = bgPadding; // horizontal padding (left/right)
  const padV = Math.round(bgPadding / cardAspect); // vertical padding (top/bottom) — preserves ratio

  // Background: gradient takes priority over solid color
  const background = bgGradient ?? bgColor;

  // Content frame shadow
  const shadow = bgShadowEnabled
    ? `0 ${Math.round(bgShadowBlur * 0.3)}px ${bgShadowBlur}px rgba(0,0,0,0.6)`
    : 'none';

  // Content frame border
  const border = bgInset > 0
    ? `${bgInset}px solid ${bgInsetColor}`
    : 'none';

  // Z-index for layering
  const screenZ = zOrder === 'screen-above' ? 2 : 1;
  const cameraZ = zOrder === 'camera-above' ? 2 : 1;

  // ─── Drag/resize handlers ────────────────────────────────────────────────
  // Uses document-level listeners so pointer tracking works even when the
  // cursor leaves the region or the component boundary.

  const getContainerSize = useCallback(() => {
    const el = contentFrameRef.current;
    if (!el) return { w: 1, h: 1 };
    return { w: el.clientWidth, h: el.clientHeight };
  }, []);

  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const cb = onRegionChangeRef.current;
      if (!drag || !cb) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setIsDragging(true);
      }

      const container = getContainerSize();
      const dxNorm = dx / container.w;
      const dyNorm = dy / container.h;

      if (drag.mode === 'move') {
        cb(drag.region, clampRect({
          x: drag.originalRect.x + dxNorm,
          y: drag.originalRect.y + dyNorm,
          w: drag.originalRect.w,
          h: drag.originalRect.h,
        }));
      } else if (drag.mode === 'resize' && drag.edge) {
        cb(drag.region, applyResize(drag.originalRect, drag.edge, dxNorm, dyNorm));
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
  }, [getContainerSize]);

  const handlePointerDown = useCallback(
    (region: 'screen' | 'camera', rect: NormalizedRect, e: React.PointerEvent) => {
      if (!onRegionChange) return;
      e.preventDefault();
      dragRef.current = {
        region,
        startX: e.clientX,
        startY: e.clientY,
        originalRect: { ...rect },
        mode: 'move',
        moved: false,
      };
    },
    [onRegionChange],
  );

  const handleResizePointerDown = useCallback(
    (region: 'screen' | 'camera', rect: NormalizedRect, edge: Edge, e: React.PointerEvent) => {
      if (!onRegionChange) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        region,
        startX: e.clientX,
        startY: e.clientY,
        originalRect: { ...rect },
        mode: 'resize',
        edge,
        moved: false,
      };
      setIsDragging(true);
    },
    [onRegionChange],
  );

  // ─── Region renderer ──────────────────────────────────────────────────────

  const renderRegion = (
    kind: 'screen' | 'camera',
    rect: NormalizedRect,
    zIndex: number,
    content: React.ReactNode | undefined,
  ) => {
    const isCircle = kind === 'camera' && layout.kind === 'PIP';
    const isHovered = hoveredRegion === kind;
    const canInteract = !!onRegionChange;
    const activeDrag = dragRef.current;
    const isBeingDragged = isDragging && activeDrag?.region === kind;

    // Each region's content maintains its own native aspect ratio
    const contentAspect = kind === 'screen' ? screenAspectRatio : (isCircle ? '1' : cameraAspectRatio);
    const frameRadius = kind === 'screen' ? bgCornerRadius : (isCircle ? '50%' : 4);

    return (
      /* RegionBox — bounding box from NormalizedRect, flex-centers the MediaFrame */
      <div
        key={kind}
        onMouseEnter={() => setHoveredRegion(kind)}
        onMouseLeave={() => { if (!isDragging) setHoveredRegion(null); }}
        style={{
          ...toCssRect(rect),
          zIndex,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        {/* MediaFrame — maintains content's native aspect ratio, carries shadow/radius */}
        <div
          onPointerDown={canInteract ? (e) => handlePointerDown(kind, rect, e) : undefined}
          style={{
            position: 'relative',
            width: '100%',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            flex: '0 1 auto',
            aspectRatio: contentAspect,
            borderRadius: frameRadius,
            boxShadow: kind === 'screen' ? shadow : 'none',
            border: kind === 'screen' ? border : 'none',
            overflow: 'hidden',
            cursor: canInteract ? (isBeingDragged ? 'grabbing' : 'grab') : undefined,
            transition: isDragging ? 'none' : 'all 300ms ease',
          }}
        >
          {/* MediaViewport — clips content, applies crop transform */}
          {content ? (
            (() => {
              const crop = kind === 'screen' ? screenCrop : cameraCrop;
              if (crop?.enabled) {
                const mediaFrameEl = contentFrameRef.current;
                const viewW = mediaFrameEl?.clientWidth ?? sourceWidth;
                const viewH = mediaFrameEl?.clientHeight ?? sourceHeight;
                const t = computeCropTransform(viewW, viewH, crop);
                return (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    transformOrigin: '0 0',
                    transform: `scale(${t.scale}) translate(${t.translateX}px, ${t.translateY}px)`,
                    willChange: 'transform',
                  }}>
                    {content}
                  </div>
                );
              }
              return content;
            })()
          ) : (
            <RegionPlaceholder
              kind={kind}
              onChooseSource={kind === 'screen' ? onChooseSource : undefined}
            />
          )}

          {/* Interaction overlay */}
          {canInteract && (isHovered || isBeingDragged) && (
            <>
              <div style={{
                position: 'absolute',
                inset: 0,
                border: '2px solid rgba(90,160,250,0.6)',
                borderRadius: 'inherit',
                pointerEvents: 'none',
                zIndex: 9,
              }} />
              {!isDragging && (isCircle ? CORNER_EDGES : ALL_EDGES).map((edge) => (
                <div
                  key={edge}
                  data-edge={edge}
                  onPointerDown={(e) => handleResizePointerDown(kind, rect, edge, e)}
                  style={getHandleStyle(edge)}
                >
                  <HandleDot />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    /* Layer 1 — Background canvas */
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'auto',
        maxWidth: 1040,
        maxHeight: '100%',
        flex: '0 1 auto',
        aspectRatio: cssAspectRatio,
        borderRadius: 18,
        overflow: 'hidden',
        background,
        boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
        transition: 'aspect-ratio 300ms ease, background 200ms ease',
      }}
    >
      {/* Padded area — regions live inside, flex-centered */}
      <div
        ref={contentFrameRef}
        style={{
          position: 'absolute',
          top: padV,
          right: padH,
          bottom: padV,
          left: padH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Screen region — carries shadow, border-radius, border directly */}
        {screenRect && renderRegion('screen', screenRect, screenZ, screenNode)}

        {/* Camera region */}
        {cameraRect && renderRegion('camera', cameraRect, cameraZ, cameraNode)}

        {/* Empty state */}
        {!screenRect && !cameraRect && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: bgCornerRadius,
              background: 'rgba(5,5,5,0.88)',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12,
              userSelect: 'none',
            }}
          >
            No layout regions defined
          </div>
        )}
      </div>
    </div>
  );
}
