/**
 * RecordCameraPanel — camera shape, roundness, size, and visibility controls.
 * Extracted from RecordRightPanel for use inside InspectorShell.
 */
import type {
  CameraAspectRatio,
  CameraPresentation,
  CameraShape,
  CameraPosition,
  RegionCrop,
} from '@rough-cut/project-model';
import { ControlLabel, PillRadioRow, RcSlider, RcSelect, RcToggleButton } from '../../ui/index.js';
import type { PillOption } from '../../ui/index.js';
import { RecordCropPanel } from './RecordCropPanel.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordCameraPanelProps {
  camera: CameraPresentation;
  onCameraChange: (patch: Partial<CameraPresentation>) => void;
  layoutSnapshotCount?: number;
  onAddLayoutSnapshot?: () => void;
  onAddLayoutPreset?: (
    preset: 'hide-camera' | 'top-left' | 'presentation' | 'talking-head',
  ) => void;
  selectedLayoutMarkerId?: string | null;
  onDeleteSelectedLayoutMarker?: () => void;
  cameraCrop: RegionCrop;
  onCameraCropChange: (patch: Partial<RegionCrop>) => void;
  onCameraCropReset: () => void;
  cropModeActive: boolean;
  onCropModeChange: (active: boolean) => void;
  sourceWidth: number;
  sourceHeight: number;
  zoomMarkerCount?: number;
}

// ─── Options ──────────────────────────────────────────────────────────────────

const SHAPE_OPTIONS: PillOption<CameraShape>[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'square', label: 'Square' },
];

const ASPECT_RATIO_OPTIONS: PillOption<CameraAspectRatio>[] = [
  { id: '16:9', label: '16:9' },
  { id: '1:1', label: '1:1' },
  { id: '9:16', label: '9:16' },
  { id: '4:3', label: '4:3' },
];

const POSITION_LABELS: Record<CameraPosition, string> = {
  'corner-br': 'Bottom Right',
  'corner-bl': 'Bottom Left',
  'corner-tr': 'Top Right',
  'corner-tl': 'Top Left',
  center: 'Center',
};

const ACCENT = '#ff6b5a';
const CAMERA_INSET_COLORS = ['#ffffff', '#000000', '#1a1a2e', '#ff6b5a'];

// ─── RecordCameraPanel ────────────────────────────────────────────────────────

export function RecordCameraPanel({
  camera,
  onCameraChange,
  layoutSnapshotCount = 0,
  onAddLayoutSnapshot,
  onAddLayoutPreset,
  selectedLayoutMarkerId = null,
  onDeleteSelectedLayoutMarker,
  cameraCrop,
  onCameraCropChange,
  onCameraCropReset,
  cropModeActive,
  onCropModeChange,
  sourceWidth,
  sourceHeight,
  zoomMarkerCount = 0,
}: RecordCameraPanelProps) {
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

          {camera.shape !== 'circle' && (
            <div>
              <ControlLabel label="Aspect" />
              <PillRadioRow
                value={camera.aspectRatio}
                options={ASPECT_RATIO_OPTIONS}
                onChange={(v) => onCameraChange({ aspectRatio: v })}
              />
            </div>
          )}

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
              {(Object.entries(POSITION_LABELS) as [CameraPosition, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </RcSelect>
          </div>

          <div>
            <ControlLabel label="Size" value={`${camera.size}%`} />
            <RcSlider
              label="Size"
              min={50}
              max={200}
              step={5}
              value={camera.size}
              onChange={(v) => onCameraChange({ size: v })}
            />
          </div>

          <button
            type="button"
            data-testid="camera-layout-add"
            onClick={() => onAddLayoutSnapshot?.()}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '8px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Add layout snapshot
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            {[
              { id: 'hide-camera', label: 'Hide Camera', testId: 'camera-layout-preset-hide' },
              { id: 'top-left', label: 'Top Left', testId: 'camera-layout-preset-top-left' },
              {
                id: 'presentation',
                label: 'Presentation',
                testId: 'camera-layout-preset-presentation',
              },
              {
                id: 'talking-head',
                label: 'Talking Head',
                testId: 'camera-layout-preset-talking-head',
              },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={preset.testId}
                onClick={() =>
                  onAddLayoutPreset?.(
                    preset.id as 'hide-camera' | 'top-left' | 'presentation' | 'talking-head',
                  )
                }
                style={{
                  padding: '7px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.82)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
            {layoutSnapshotCount} layout snapshot{layoutSnapshotCount === 1 ? '' : 's'} on this
            recording.
          </div>

          {selectedLayoutMarkerId && (
            <button
              type="button"
              data-testid="camera-layout-delete"
              onClick={() => onDeleteSelectedLayoutMarker?.()}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,120,120,0.95)',
                background: 'rgba(255,120,120,0.12)',
                border: '1px solid rgba(255,120,120,0.35)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Delete selected layout marker
            </button>
          )}

          <div>
            <ControlLabel label="Padding" value={`${camera.padding}px`} />
            <RcSlider
              label="Camera padding"
              min={0}
              max={120}
              step={2}
              value={camera.padding}
              onChange={(v) => onCameraChange({ padding: v })}
            />
          </div>

          <div>
            <ControlLabel label="Inset" value={camera.inset > 0 ? `${camera.inset}px` : 'Off'} />
            <RcSlider
              label="Camera inset"
              min={0}
              max={20}
              step={1}
              value={camera.inset}
              onChange={(v) => onCameraChange({ inset: v })}
            />
            {camera.inset > 0 && (
              <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                {CAMERA_INSET_COLORS.map((color) => (
                  <button
                    key={color}
                    aria-label={`Camera inset color ${color}`}
                    onClick={() => onCameraChange({ insetColor: color })}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: color,
                      border:
                        camera.insetColor === color
                          ? `2px solid ${ACCENT}`
                          : '1px solid rgba(255,255,255,0.12)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Camera inset custom color"
                  value={camera.insetColor}
                  onChange={(e) => onCameraChange({ insetColor: e.target.value })}
                  style={{
                    width: 18,
                    height: 18,
                    border: 'none',
                    borderRadius: 4,
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                />
              </div>
            )}
          </div>

          <RcToggleButton
            label="Shadow"
            value={camera.shadowEnabled}
            onChange={(value) => onCameraChange({ shadowEnabled: value })}
          />

          {camera.shadowEnabled && (
            <div>
              <ControlLabel label="Shadow blur" value={`${camera.shadowBlur}px`} />
              <RcSlider
                label="Camera shadow blur"
                min={0}
                max={50}
                step={1}
                value={camera.shadowBlur}
                onChange={(v) => onCameraChange({ shadowBlur: v })}
              />
              <ControlLabel
                label="Shadow opacity"
                value={`${Math.round(camera.shadowOpacity * 100)}%`}
              />
              <RcSlider
                label="Camera shadow opacity"
                min={0}
                max={1}
                step={0.05}
                value={camera.shadowOpacity}
                onChange={(v) => onCameraChange({ shadowOpacity: v })}
              />
            </div>
          )}

          <RecordCropPanel
            targetLabel="camera"
            crop={cameraCrop}
            onCropChange={onCameraCropChange}
            onCropReset={onCameraCropReset}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            cropModeActive={cropModeActive}
            onCropModeChange={onCropModeChange}
            zoomMarkerCount={zoomMarkerCount}
          />
        </>
      )}
    </>
  );
}
