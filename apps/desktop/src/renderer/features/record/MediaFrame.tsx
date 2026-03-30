import React from 'react';
import type { Rect, FitMode } from './template-layout/types.js';

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
// Single-responsibility component: absolutely positions one frame and fits
// media inside it according to fitMode. No drag, resize, crop, or layout logic.
//
// fitMode behaviour:
//   fill    — children stretch to fill the entire frame (no aspect-ratio enforcement)
//   contain — children letterboxed/pillarboxed, preserving mediaAspect
//   cover   — children fill frame completely, overflowing and clipped to frame

export function MediaFrame({
  frame,
  fitMode,
  children,
  mediaAspect,
  borderRadius = 0,
  shadow,
  zIndex,
  circular = false,
  label,
  transition = 'all 300ms ease',
}: MediaFrameProps) {
  // Circular frames override borderRadius to '50%'
  const resolvedRadius = circular ? '50%' : borderRadius;

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
  };

  // ─── Placeholder ──────────────────────────────────────────────────────────

  if (!children) {
    const isCamera = label?.toLowerCase().includes('camera');
    const accentColor = isCamera ? 'rgba(255,107,90,0.6)' : 'rgba(90,160,250,0.6)';
    const accentBg = isCamera ? 'rgba(255,107,90,0.08)' : 'rgba(90,160,250,0.08)';
    const accentBorder = isCamera ? 'rgba(255,107,90,0.15)' : 'rgba(90,160,250,0.15)';

    return (
      <div style={frameStyle}>
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
      </div>
    );
  }

  // ─── Fill mode ────────────────────────────────────────────────────────────

  if (fitMode === 'fill') {
    return (
      <div style={frameStyle}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {children}
        </div>
      </div>
    );
  }

  // ─── Contain mode ─────────────────────────────────────────────────────────
  // Letterbox/pillarbox: media preserves aspect ratio, dark bars fill unused space.

  if (fitMode === 'contain') {
    return (
      <div style={{ ...frameStyle, background: 'rgba(0,0,0,0.85)' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio: mediaAspect !== undefined ? String(mediaAspect) : undefined,
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Cover mode ───────────────────────────────────────────────────────────
  // Media fills the frame completely, cropping overflow. Frame's overflow:hidden clips it.

  return (
    <div style={frameStyle}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            minWidth: '100%',
            minHeight: '100%',
            aspectRatio: mediaAspect !== undefined ? String(mediaAspect) : undefined,
            flexShrink: 0,
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
