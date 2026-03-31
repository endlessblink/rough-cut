/**
 * RcSlider — horizontal slider for continuous presentation values.
 * Used for zoom intensity, cursor size, volume, speed, etc.
 */
import { ACCENT_COLOR } from './tokens.js';

interface RcSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}

export function RcSlider({ value, min, max, step = 1, label, onChange }: RcSliderProps) {
  const slider = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        height: 4,
        accentColor: ACCENT_COLOR,
        cursor: 'pointer',
      }}
    />
  );

  if (!label) return slider;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', userSelect: 'none' }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', userSelect: 'none' }}>
          {step < 1 ? value.toFixed(2) : value}
        </span>
      </div>
      {slider}
    </div>
  );
}
