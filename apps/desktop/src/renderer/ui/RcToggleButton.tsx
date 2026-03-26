/**
 * RcToggleButton — full-width On/Off toggle button.
 * Used for click sound, show cursor, snap, etc.
 */
import { useState } from 'react';
import { BG_CONTROL, BG_CONTROL_HOVER } from './tokens.js';

interface RcToggleButtonProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function RcToggleButton({ label, value, onChange }: RcToggleButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onChange(!value)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 28,
        width: '100%',
        borderRadius: 6,
        padding: '0 8px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: value
          ? hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.10)'
          : hovered ? BG_CONTROL_HOVER : BG_CONTROL,
        transition: 'background 100ms ease',
      }}
    >
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)' }}>{label}</span>
      <span style={{ fontSize: 11, color: value ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.50)' }}>
        {value ? 'On' : 'Off'}
      </span>
    </button>
  );
}
