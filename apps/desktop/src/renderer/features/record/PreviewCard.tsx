import React, { useState } from 'react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviewCardProps {
  hasActiveSource?: boolean;
  onChooseSource?: () => void;
  /** CSS aspect-ratio value, e.g. '16 / 9', '9 / 16', '1 / 1' */
  aspectRatio?: string;
  /** Background solid color (hex) */
  bgColor?: string;
  /** Background CSS gradient string (takes priority over bgColor) */
  bgGradient?: string | null;
  /** Padding between background edge and video content (px) */
  bgPadding?: number;
  /** Corner radius on the video content (px) */
  bgCornerRadius?: number;
  /** Whether to show a drop shadow on the video content */
  bgShadowEnabled?: boolean;
  /** Shadow blur radius (px) */
  bgShadowBlur?: number;
  /** Inset border width around video content (px) */
  bgInset?: number;
  /** Inset border color (hex) */
  bgInsetColor?: string;
  children?: React.ReactNode;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function PreviewEmptyState({ onChooseSource }: { onChooseSource?: () => void }) {
  const [btnHovered, setBtnHovered] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
        maxWidth: 260,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 48, height: 48, borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="14" rx="2" stroke="rgba(255,255,255,0.60)" strokeWidth="1.5" />
          <line x1="8" y1="21" x2="16" y2="21" stroke="rgba(255,255,255,0.60)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>
        Select a source to preview
      </span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)', lineHeight: 1.5 }}>
        Choose a screen or window to start recording.
      </span>
      {onChooseSource && (
        <button
          onClick={onChooseSource}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
          style={{
            marginTop: 6, height: 32, padding: '0 16px', borderRadius: 999,
            fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
            border: btnHovered ? '1px solid rgba(255,255,255,0.32)' : '1px solid rgba(255,255,255,0.20)',
            background: btnHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.88)',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
        >
          Choose source...
        </button>
      )}
    </div>
  );
}

// ─── PreviewCard ──────────────────────────────────────────────────────────────
//
// 3-layer architecture (matches Recordly/Screen Studio):
//
//   Layer 1: Background    — CSS gradient or solid color, fills entire card
//   Layer 2: Content frame — padded, rounded, shadowed container for video
//   Layer 3: Children      — <video> or <canvas>, fills the content frame
//
// When no source is selected, shows the empty state with a dark background.

export function PreviewCard({
  hasActiveSource = false,
  onChooseSource,
  aspectRatio = '16 / 9',
  bgColor = '#050505',
  bgGradient = null,
  bgPadding = 0,
  bgCornerRadius = 0,
  bgShadowEnabled = false,
  bgShadowBlur = 20,
  bgInset = 0,
  bgInsetColor = '#ffffff',
  children,
}: PreviewCardProps) {
  const showContent = hasActiveSource && children;

  // Background: gradient takes priority over solid color
  const backgroundStyle = bgGradient ?? bgColor;



  // Shadow on the content frame
  const contentShadow = bgShadowEnabled
    ? `0 ${Math.round(bgShadowBlur * 0.3)}px ${bgShadowBlur}px rgba(0,0,0,0.6)`
    : 'none';

  // Inset border on the content frame
  const contentBorder = bgInset > 0
    ? `${bgInset}px solid ${bgInsetColor}`
    : 'none';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 1040,
        aspectRatio,
        borderRadius: 18,
        overflow: 'hidden',
        background: backgroundStyle,
        boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
        transition: 'aspect-ratio 300ms ease, background 200ms ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: bgPadding,
          borderRadius: bgCornerRadius,
          overflow: 'hidden',
          boxShadow: contentShadow,
          border: contentBorder,
          background: showContent ? 'transparent' : 'rgba(5,5,5,0.88)',
          transition: 'inset 200ms ease, border-radius 200ms ease, box-shadow 200ms ease, background 200ms ease',
        }}
      >
        {showContent ? (
          children
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PreviewEmptyState onChooseSource={onChooseSource} />
          </div>
        )}
      </div>
    </div>
  );
}
