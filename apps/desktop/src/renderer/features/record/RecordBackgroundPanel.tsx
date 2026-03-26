/**
 * RecordBackgroundPanel — background color, padding, corner radius, and shadow controls.
 * Extracted from RecordRightPanel for use inside InspectorShell.
 */
import { ControlLabel, RcSlider, RcToggleButton } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordBackgroundPanelProps {
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  padding: number;
  onPaddingChange: (value: number) => void;
  cornerRadius: number;
  onCornerRadiusChange: (value: number) => void;
  shadowEnabled: boolean;
  onShadowEnabledChange: (enabled: boolean) => void;
  shadowBlur: number;
  onShadowBlurChange: (value: number) => void;
}

// ─── Color swatches ───────────────────────────────────────────────────────────

const BG_COLORS = [
  '#000000',
  '#1a1a2e',
  '#16213e',
  '#0f3460',
  '#533483',
  '#2c3333',
  '#1b2430',
  '#161a30',
];

const ACCENT_COLOR = '#ff6b5a';

// ─── RecordBackgroundPanel ────────────────────────────────────────────────────

export function RecordBackgroundPanel({
  backgroundColor,
  onBackgroundColorChange,
  padding,
  onPaddingChange,
  cornerRadius,
  onCornerRadiusChange,
  shadowEnabled,
  onShadowEnabledChange,
  shadowBlur,
  onShadowBlurChange,
}: RecordBackgroundPanelProps) {
  return (
    <>
      <div>
        <ControlLabel label="Background color" />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 6,
          }}
        >
          {BG_COLORS.map((color) => {
            const isSelected = backgroundColor === color;
            return (
              <button
                key={color}
                onClick={() => onBackgroundColorChange(color)}
                title={color}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: isSelected
                    ? `2px solid ${ACCENT_COLOR}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <ControlLabel label="Padding" value={`${padding}px`} />
        <RcSlider
          min={0}
          max={200}
          step={5}
          value={padding}
          onChange={onPaddingChange}
        />
      </div>

      <div>
        <ControlLabel label="Corner radius" value={`${cornerRadius}px`} />
        <RcSlider
          min={0}
          max={40}
          step={1}
          value={cornerRadius}
          onChange={onCornerRadiusChange}
        />
      </div>

      <RcToggleButton
        label="Shadow"
        value={shadowEnabled}
        onChange={onShadowEnabledChange}
      />

      {shadowEnabled && (
        <div>
          <ControlLabel label="Shadow blur" value={`${shadowBlur}px`} />
          <RcSlider
            min={0}
            max={50}
            step={1}
            value={shadowBlur}
            onChange={onShadowBlurChange}
          />
        </div>
      )}
    </>
  );
}
