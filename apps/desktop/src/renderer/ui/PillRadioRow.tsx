/**
 * PillRadioRow — discrete preset selector (2–4 options).
 * Used for cursor style, layout presets, zoom behavior, etc.
 */
import { useState } from 'react';
import { BG_CONTROL, BG_CONTROL_HOVER, BG_CONTROL_ACTIVE } from './tokens.js';

export interface PillOption<T extends string> {
  id: T;
  label: string;
}

interface PillRadioRowProps<T extends string> {
  value: T;
  options: PillOption<T>[];
  onChange: (value: T) => void;
}

export function PillRadioRow<T extends string>({
  value,
  options,
  onChange,
}: PillRadioRowProps<T>) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', gap: 3, width: '100%' }}>
      {options.map((opt) => {
        const active = opt.id === value;
        const hovered = hoveredId === opt.id;

        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            onMouseEnter={() => setHoveredId(opt.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '4px 0',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: active ? 600 : 400,
              fontFamily: 'inherit',
              border: 'none',
              cursor: 'pointer',
              userSelect: 'none',
              minWidth: 0,
              background: active
                ? BG_CONTROL_ACTIVE
                : hovered
                  ? BG_CONTROL_HOVER
                  : BG_CONTROL,
              color: active ? '#000' : 'rgba(255,255,255,0.60)',
              transition: 'background 100ms ease, color 100ms ease',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: active ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.40)',
                flexShrink: 0,
              }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
