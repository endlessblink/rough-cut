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
  onChange: (value: number) => void;
}

export function RcSlider({ value, min, max, step = 1, onChange }: RcSliderProps) {
  return (
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
}
