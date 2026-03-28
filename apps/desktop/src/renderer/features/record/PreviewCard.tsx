import React, { useState } from 'react';

interface PreviewCardBackground {
  bgColor: string;
  bgGradient: string | null;
  bgPadding: number;
  bgCornerRadius: number;
  bgInset: number;
  bgInsetColor: string;
  bgShadowEnabled: boolean;
  bgShadowBlur: number;
}

interface PreviewCardProps {
  hasActiveSource?: boolean;
  hasRecordingAsset?: boolean;
  onChooseSource?: () => void;
  background?: PreviewCardBackground;
  children?: React.ReactNode;
}

// ─── EmptyIcon ──────────────────────────────────────────────────────────────

function EmptyIcon() {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect
          x="2"
          y="4"
          width="20"
          height="14"
          rx="2"
          stroke="rgba(255,255,255,0.60)"
          strokeWidth="1.5"
        />
        <line
          x1="8"
          y1="21"
          x2="16"
          y2="21"
          stroke="rgba(255,255,255,0.60)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ─── PreviewEmptyState ──────────────────────────────────────────────────────

interface PreviewEmptyStateProps {
  onChooseSource?: () => void;
}

function PreviewEmptyState({ onChooseSource }: PreviewEmptyStateProps) {
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
      <EmptyIcon />
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.88)',
        }}
      >
        Select a source to preview
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1.5,
          color: 'rgba(255,255,255,0.60)',
        }}
      >
        Choose a screen or window to start recording.
      </span>
      {onChooseSource && (
        <button
          onClick={onChooseSource}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
          style={{
            marginTop: 6,
            height: 32,
            padding: '0 16px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            border: btnHovered
              ? '1px solid rgba(255,255,255,0.32)'
              : '1px solid rgba(255,255,255,0.20)',
            background: btnHovered
              ? 'rgba(255,255,255,0.10)'
              : 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.88)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
        >
          Choose source...
        </button>
      )}
    </div>
  );
}

// ─── PreviewCardInner ───────────────────────────────────────────────────────

function PreviewCardInner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.85) 55%, #000000 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Faint inner border */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
          borderRadius: 18,
          pointerEvents: 'none',
        }}
      />
      {/* Content */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

// ─── PreviewCard ────────────────────────────────────────────────────────────

export function PreviewCard({ hasActiveSource = false, hasRecordingAsset = false, onChooseSource, background, children }: PreviewCardProps) {
  const showContent = (hasActiveSource || hasRecordingAsset) && children;
  const bg = background;

  // Compute outer card background (gradient takes priority over solid color)
  const cardBackground = bg?.bgGradient ?? bg?.bgColor ?? '#050505';

  // Compute inner content styling from background config
  const contentPadding = bg ? bg.bgPadding : 0;
  const contentRadius = bg ? bg.bgCornerRadius : 0;
  const contentShadow = bg?.bgShadowEnabled
    ? `0 ${Math.round(bg.bgShadowBlur * 0.3)}px ${bg.bgShadowBlur}px rgba(0,0,0,0.6)`
    : 'none';
  const contentBorder = bg && bg.bgInset > 0
    ? `${bg.bgInset}px solid ${bg.bgInsetColor}`
    : 'none';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 1040,
        aspectRatio: '16 / 9',
        background: showContent ? cardBackground : '#050505',
        borderRadius: 18,
        boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
        overflow: 'hidden',
      }}
    >
      {/* Content layer */}
      {showContent ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: contentPadding,
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              borderRadius: contentRadius,
              overflow: 'hidden',
              boxShadow: contentShadow,
              border: contentBorder,
            }}
          >
            {children}
          </div>
        </div>
      ) : (
        <PreviewCardInner>
          <PreviewEmptyState onChooseSource={onChooseSource} />
        </PreviewCardInner>
      )}

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          background:
            'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.85) 55%, #000000 100%)',
          pointerEvents: 'none',
          opacity: showContent ? 0 : 1,
        }}
      />
      {/* Faint inner border */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
          borderRadius: 18,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
