/**
 * RcSelect — dark-styled native select dropdown.
 * Used for click effect, export format, etc.
 */
import { BORDER_LIGHT } from './tokens.js';

interface RcSelectProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}

export function RcSelect({ value, onChange, children }: RcSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 28,
        width: '100%',
        borderRadius: 6,
        border: `1px solid ${BORDER_LIGHT}`,
        background: 'rgba(0,0,0,0.60)',
        padding: '0 8px',
        fontSize: 11,
        color: 'rgba(255,255,255,0.80)',
        fontFamily: 'inherit',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {children}
    </select>
  );
}
