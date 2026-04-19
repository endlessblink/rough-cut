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
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function RcSlider({
  value,
  min,
  max,
  step = 1,
  label,
  disabled = false,
  onChange,
}: RcSliderProps) {
  const safeValue = Number.isFinite(value) ? value : min;
  const slider = (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={safeValue}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        height: 4,
        accentColor: ACCENT_COLOR,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
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
        <span
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.65)',
            fontFamily: 'monospace',
            userSelect: 'none',
          }}
        >
          {step < 1 ? safeValue.toFixed(2) : safeValue}
        </span>
      </div>
      {slider}
    </div>
  );
}
