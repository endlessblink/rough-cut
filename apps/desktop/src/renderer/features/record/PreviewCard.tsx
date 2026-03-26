import React, { useState } from 'react';

interface PreviewCardProps {
  hasActiveSource?: boolean;
  onChooseSource?: () => void;
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
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

// ─── PreviewCard ────────────────────────────────────────────────────────────

export function PreviewCard({ hasActiveSource = false, onChooseSource, children }: PreviewCardProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        width: '100%',
        maxWidth: 1040,
        aspectRatio: '16 / 9',
        background: '#050505',
        borderRadius: 18,
        boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
        overflow: 'hidden',
      }}
    >
      <PreviewCardInner>
        {hasActiveSource && children ? children : <PreviewEmptyState onChooseSource={onChooseSource} />}
      </PreviewCardInner>
    </div>
  );
}
