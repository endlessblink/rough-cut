/**
 * AlignmentToolbar — 6 icon buttons for aligning the selected region
 * within the card frame. Horizontal: left, center-h, right.
 * Vertical: top, center-v, bottom.
 *
 * Keyboard shortcuts: Alt+A/H/D (horizontal), Alt+W/V/S (vertical).
 */

import { useEffect, useCallback } from 'react';
import type { Alignment } from './snap-guides.js';

export interface AlignmentToolbarProps {
  disabled?: boolean;
  onAlign: (alignment: Alignment) => void;
}

// ─── Inline SVG icons (16x16, stroke-based, currentColor) ───────────────────

function AlignLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="4" width="8" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="4" y="9" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AlignCenterHIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.5 1.5" />
      <rect x="3" y="4" width="10" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="4.5" y="9" width="7" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="4" width="8" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7" y="9" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AlignTopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="4" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="4" width="3" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AlignCenterVIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.5 1.5" />
      <rect x="4" y="3" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="4.5" width="3" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AlignBottomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="4" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="7" width="3" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

// ─── Button style helper ─────────────────────────────────────────────────────

const BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'rgba(255,255,255,0.7)',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 120ms ease, color 120ms ease',
};

const BUTTON_DISABLED_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  color: 'rgba(255,255,255,0.2)',
  cursor: 'default',
};

const DIVIDER_STYLE: React.CSSProperties = {
  width: 1,
  height: 18,
  background: 'rgba(255,255,255,0.08)',
  flexShrink: 0,
  margin: '0 4px',
};

// ─── Alignment definitions ───────────────────────────────────────────────────

interface AlignButton {
  alignment: Alignment;
  icon: React.ReactNode;
  title: string;
  shortcut: string; // Alt+key
}

const HORIZONTAL_BUTTONS: AlignButton[] = [
  { alignment: 'left', icon: <AlignLeftIcon />, title: 'Align Left (Alt+A)', shortcut: 'a' },
  { alignment: 'center-h', icon: <AlignCenterHIcon />, title: 'Center Horizontally (Alt+H)', shortcut: 'h' },
  { alignment: 'right', icon: <AlignRightIcon />, title: 'Align Right (Alt+D)', shortcut: 'd' },
];

const VERTICAL_BUTTONS: AlignButton[] = [
  { alignment: 'top', icon: <AlignTopIcon />, title: 'Align Top (Alt+W)', shortcut: 'w' },
  { alignment: 'center-v', icon: <AlignCenterVIcon />, title: 'Center Vertically (Alt+V)', shortcut: 'v' },
  { alignment: 'bottom', icon: <AlignBottomIcon />, title: 'Align Bottom (Alt+S)', shortcut: 's' },
];

// ─── AlignmentToolbar ────────────────────────────────────────────────────────

export function AlignmentToolbar({ disabled = false, onAlign }: AlignmentToolbarProps) {
  // Keyboard shortcuts — Alt+key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled || !e.altKey) return;

      const key = e.key.toLowerCase();
      const all = [...HORIZONTAL_BUTTONS, ...VERTICAL_BUTTONS];
      const match = all.find((b) => b.shortcut === key);
      if (match) {
        e.preventDefault();
        onAlign(match.alignment);
      }
    },
    [disabled, onAlign],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const renderButton = (btn: AlignButton) => (
    <button
      key={btn.alignment}
      title={btn.title}
      disabled={disabled}
      style={disabled ? BUTTON_DISABLED_STYLE : BUTTON_STYLE}
      onClick={() => onAlign(btn.alignment)}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {btn.icon}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {disabled && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', userSelect: 'none' }}>
          Click a region to align
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {HORIZONTAL_BUTTONS.map(renderButton)}
        <div style={DIVIDER_STYLE} />
        {VERTICAL_BUTTONS.map(renderButton)}
      </div>
    </div>
  );
}
