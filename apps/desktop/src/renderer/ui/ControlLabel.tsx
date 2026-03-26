/**
 * ControlLabel — standard label row for controls.
 * Shows a label on the left and optional value on the right.
 */
import { TEXT_TERTIARY } from './tokens.js';

interface ControlLabelProps {
  label: string;
  value?: string;
}

export function ControlLabel({ label, value }: ControlLabelProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
        color: TEXT_TERTIARY,
        marginBottom: 4,
      }}
    >
      <span>{label}</span>
      {value !== undefined && (
        <span style={{ color: 'rgba(255,255,255,0.72)' }}>{value}</span>
      )}
    </div>
  );
}
