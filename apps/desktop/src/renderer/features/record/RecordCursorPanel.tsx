/**
 * RecordCursorPanel — cursor style, click effect, size, and sound controls.
 * Extracted from RecordRightPanel for use inside InspectorShell.
 */
import type { CursorPresentation, CursorStyle, ClickEffect } from '@rough-cut/project-model';
import { PillRadioRow, RcSlider, RcSelect, RcToggleButton, ControlLabel } from '../../ui/index.js';
import type { PillOption } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordCursorPanelProps {
  cursor: CursorPresentation;
  onCursorChange: (patch: Partial<CursorPresentation>) => void;
}

// ─── Cursor style options ─────────────────────────────────────────────────────

const CURSOR_STYLE_OPTIONS: PillOption<CursorStyle>[] = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'default', label: 'Default' },
  { id: 'spotlight', label: 'Spotlight' },
];

// ─── RecordCursorPanel ────────────────────────────────────────────────────────

export function RecordCursorPanel({ cursor, onCursorChange }: RecordCursorPanelProps) {
  return (
    <>
      <div>
        <ControlLabel label="Cursor style" />
        <PillRadioRow
          value={cursor.style}
          options={CURSOR_STYLE_OPTIONS}
          onChange={(style) => onCursorChange({ style })}
        />
      </div>

      <div>
        <ControlLabel label="Click effect" />
        <RcSelect
          value={cursor.clickEffect}
          onChange={(v) => onCursorChange({ clickEffect: v as ClickEffect })}
        >
          <option value="none">None</option>
          <option value="ripple">Ripple</option>
          <option value="ring">Highlight ring</option>
        </RcSelect>
      </div>

      <div>
        <ControlLabel label="Cursor size" value={`${cursor.sizePercent}%`} />
        <RcSlider
          min={50}
          max={150}
          step={5}
          value={cursor.sizePercent}
          onChange={(v) => onCursorChange({ sizePercent: v })}
        />
      </div>

      <div>
        <ControlLabel
          label="Motion blur"
          value={cursor.motionBlur === 0 ? 'Off' : `${cursor.motionBlur}%`}
        />
        <RcSlider
          min={0}
          max={100}
          step={5}
          value={cursor.motionBlur ?? 0}
          onChange={(v) => onCursorChange({ motionBlur: v })}
        />
      </div>

      <RcToggleButton
        label="Click sound"
        value={cursor.clickSoundEnabled}
        onChange={(v) => onCursorChange({ clickSoundEnabled: v })}
      />
    </>
  );
}
