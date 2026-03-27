/**
 * RecordCameraPanel — camera shape, roundness, size, and visibility controls.
 * Extracted from RecordRightPanel for use inside InspectorShell.
 */
import type { CameraPresentation, CameraShape, CameraPosition } from '@rough-cut/project-model';
import { ControlLabel, PillRadioRow, RcSlider, RcSelect, RcToggleButton } from '../../ui/index.js';
import type { PillOption } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordCameraPanelProps {
  camera: CameraPresentation;
  onCameraChange: (patch: Partial<CameraPresentation>) => void;
}

// ─── Options ──────────────────────────────────────────────────────────────────

const SHAPE_OPTIONS: PillOption<CameraShape>[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'square', label: 'Square' },
];

const POSITION_LABELS: Record<CameraPosition, string> = {
  'corner-br': 'Bottom Right',
  'corner-bl': 'Bottom Left',
  'corner-tr': 'Top Right',
  'corner-tl': 'Top Left',
  'center': 'Center',
};

// ─── RecordCameraPanel ────────────────────────────────────────────────────────

export function RecordCameraPanel({ camera, onCameraChange }: RecordCameraPanelProps) {
  return (
    <>
      <RcToggleButton
        label="Show camera"
        value={camera.visible}
        onChange={(v) => onCameraChange({ visible: v })}
      />

      {camera.visible && (
        <>
          <div>
            <ControlLabel label="Shape" />
            <PillRadioRow
              value={camera.shape}
              options={SHAPE_OPTIONS}
              onChange={(v) => onCameraChange({ shape: v })}
            />
          </div>

          {camera.shape === 'rounded' && (
            <div>
              <ControlLabel label="Roundness" value={`${camera.roundness}%`} />
              <RcSlider
                min={0}
                max={100}
                step={5}
                value={camera.roundness}
                onChange={(v) => onCameraChange({ roundness: v })}
              />
            </div>
          )}

          <div>
            <ControlLabel label="Position" />
            <RcSelect
              value={camera.position}
              onChange={(v) => onCameraChange({ position: v as CameraPosition })}
            >
              {(Object.entries(POSITION_LABELS) as [CameraPosition, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </RcSelect>
          </div>

          <div>
            <ControlLabel label="Size" value={`${camera.size}%`} />
            <RcSlider
              min={50}
              max={200}
              step={5}
              value={camera.size}
              onChange={(v) => onCameraChange({ size: v })}
            />
          </div>
        </>
      )}
    </>
  );
}
