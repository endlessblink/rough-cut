import { useState } from 'react';

export type RecordMode = 'fullscreen' | 'window' | 'region';

interface ModeSelectorRowProps {
  mode: RecordMode;
  onChange: (mode: RecordMode) => void;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function FullScreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function WindowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function RegionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 2" />
    </svg>
  );
}

// ─── Mode config ──────────────────────────────────────────────────────────────

const MODES: { id: RecordMode; label: string; minWidth: number; icon: React.ReactNode }[] = [
  { id: 'fullscreen', label: 'Full Screen', minWidth: 104, icon: <FullScreenIcon /> },
  { id: 'window', label: 'Window', minWidth: 80, icon: <WindowIcon /> },
  { id: 'region', label: 'Region', minWidth: 80, icon: <RegionIcon /> },
];

// ─── ModeSelectorRow ──────────────────────────────────────────────────────────

export function ModeSelectorRow({ mode, onChange }: ModeSelectorRowProps) {
  const [hoveredMode, setHoveredMode] = useState<RecordMode | null>(null);
  const [pressedMode, setPressedMode] = useState<RecordMode | null>(null);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        flexShrink: 0,
        paddingLeft: 32,
      }}
    >
      {MODES.map(({ id, label, minWidth, icon }) => {
        const isActive = mode === id;
        const isHovered = hoveredMode === id;
        const isPressed = pressedMode === id;

        let background: string;
        let border: string;
        let color: string;

        if (isPressed) {
          background = 'rgba(255,255,255,0.16)';
          border = isActive
            ? '1px solid rgba(255,255,255,0.30)'
            : '1px solid rgba(255,255,255,0.18)';
          color = isActive ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.84)';
        } else if (isActive) {
          background = 'rgba(255,255,255,0.14)';
          border = '1px solid rgba(255,255,255,0.30)';
          color = 'rgba(255,255,255,0.96)';
        } else if (isHovered) {
          background = 'rgba(255,255,255,0.06)';
          border = '1px solid rgba(255,255,255,0.18)';
          color = 'rgba(255,255,255,0.84)';
        } else {
          background = 'rgba(255,255,255,0.02)';
          border = '1px solid rgba(255,255,255,0.10)';
          color = 'rgba(255,255,255,0.60)';
        }

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            onMouseEnter={() => setHoveredMode(id)}
            onMouseLeave={() => { setHoveredMode(null); setPressedMode(null); }}
            onMouseDown={() => setPressedMode(id)}
            onMouseUp={() => setPressedMode(null)}
            style={{
              height: 32,
              minWidth,
              padding: '0 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              background,
              border,
              color,
              transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
              fontFamily: 'inherit',
              userSelect: 'none',
              boxSizing: 'border-box',
            }}
          >
            {icon}
            {label}
          </button>
        );
      })}
    </div>
  );
}
