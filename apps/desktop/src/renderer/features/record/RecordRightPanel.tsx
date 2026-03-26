/**
 * RecordRightPanel: Presentation controls for the Record view.
 * Zoom presets, highlight keyframes, cursor styling, title overlays.
 * No structural editing — this is the presentation inspector.
 */
import React from 'react';

// ─── PanelSection ──────────────────────────────────────────────────────────────

interface PanelSectionProps {
  title: string;
  flex?: number;
  minHeight?: number;
  children?: React.ReactNode;
}

function PanelSection({ title, flex, minHeight = 48, children }: PanelSectionProps) {
  return (
    <section
      style={{
        borderRadius: 10,
        background: 'rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight,
        flex: flex ?? 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 28,
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: 'rgba(0,0,0,0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.68)',
            userSelect: 'none',
          }}
        >
          {title}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '8px 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flex: 1,
        }}
      >
        {children ?? (
          <span
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.36)',
              userSelect: 'none',
            }}
          >
            Coming soon
          </span>
        )}
      </div>
    </section>
  );
}

// ─── RecordRightPanel ──────────────────────────────────────────────────────────

export function RecordRightPanel() {
  return (
    <aside
      style={{
        flex: '0 0 260px',
        maxWidth: 260,
        minHeight: 420,
        borderRadius: 14,
        background:
          'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      <PanelSection title="Zoom" flex={1} minHeight={96} />
      <PanelSection title="Highlights" flex={1} minHeight={96} />
      <PanelSection title="Cursor" minHeight={72} />
      <PanelSection title="Titles" minHeight={72} />
    </aside>
  );
}
