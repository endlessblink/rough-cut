/**
 * RecordCropPanel — per-region static crop controls.
 * Enable/disable crop, choose aspect ratio presets, adjust x/y/w/h numerically.
 */
import type { RegionCrop, CropAspectRatio } from '@rough-cut/project-model';
import { ControlLabel, PillRadioRow, RcToggleButton } from '../../ui/index.js';
import type { PillOption } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordCropPanelProps {
  screenCrop: RegionCrop;
  onScreenCropChange: (patch: Partial<RegionCrop>) => void;
  onScreenCropReset: () => void;
  sourceWidth: number;
  sourceHeight: number;
}

// ─── Options ──────────────────────────────────────────────────────────────────

const ASPECT_OPTIONS: PillOption<CropAspectRatio>[] = [
  { id: 'free', label: 'Free' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
];

function aspectToNumber(a: CropAspectRatio): number | null {
  switch (a) {
    case '16:9': return 16 / 9;
    case '9:16': return 9 / 16;
    case '1:1': return 1;
    case '4:3': return 4 / 3;
    default: return null;
  }
}

// ─── Inline number input ────────────────────────────────────────────────────

function CropNumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 14, textAlign: 'right' }}>
        {label}
      </span>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        style={{
          width: 60,
          padding: '3px 6px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          color: '#ccc',
          fontSize: 11,
          fontFamily: 'monospace',
          outline: 'none',
        }}
      />
    </div>
  );
}

// ─── RecordCropPanel ────────────────────────────────────────────────────────

export function RecordCropPanel({
  screenCrop,
  onScreenCropChange,
  onScreenCropReset,
  sourceWidth,
  sourceHeight,
}: RecordCropPanelProps) {
  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      // Enable with full-source crop
      onScreenCropChange({ enabled: true, x: 0, y: 0, width: sourceWidth, height: sourceHeight });
    } else {
      onScreenCropChange({ enabled: false });
    }
  };

  const handleAspectChange = (aspect: CropAspectRatio) => {
    onScreenCropChange({ aspectRatio: aspect });

    // Recompute crop dimensions to match new aspect ratio, centered
    const ratio = aspectToNumber(aspect);
    if (ratio) {
      const currentCenterX = screenCrop.x + screenCrop.width / 2;
      const currentCenterY = screenCrop.y + screenCrop.height / 2;

      let newW: number;
      let newH: number;

      // Fit inside current crop, maintaining center
      if (screenCrop.width / screenCrop.height > ratio) {
        newH = screenCrop.height;
        newW = newH * ratio;
      } else {
        newW = screenCrop.width;
        newH = newW / ratio;
      }

      const newX = Math.max(0, Math.min(currentCenterX - newW / 2, sourceWidth - newW));
      const newY = Math.max(0, Math.min(currentCenterY - newH / 2, sourceHeight - newH));

      onScreenCropChange({ width: Math.round(newW), height: Math.round(newH), x: Math.round(newX), y: Math.round(newY) });
    }
  };

  const handleDimensionChange = (key: 'x' | 'y' | 'width' | 'height', value: number) => {
    const patch: Partial<RegionCrop> = { [key]: value };

    // If aspect ratio is locked, adjust the other dimension
    const ratio = aspectToNumber(screenCrop.aspectRatio);
    if (ratio) {
      if (key === 'width') {
        patch.height = Math.round(value / ratio);
      } else if (key === 'height') {
        patch.width = Math.round(value * ratio);
      }
    }

    onScreenCropChange(patch);
  };

  return (
    <>
      <RcToggleButton
        label="Crop screen"
        value={screenCrop.enabled}
        onChange={handleToggle}
      />

      {screenCrop.enabled && (
        <>
          <div>
            <ControlLabel label="Aspect ratio" />
            <PillRadioRow
              value={screenCrop.aspectRatio}
              options={ASPECT_OPTIONS}
              onChange={handleAspectChange}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
            <CropNumberInput label="X" value={screenCrop.x} min={0} max={sourceWidth - 1} onChange={(v) => handleDimensionChange('x', v)} />
            <CropNumberInput label="Y" value={screenCrop.y} min={0} max={sourceHeight - 1} onChange={(v) => handleDimensionChange('y', v)} />
            <CropNumberInput label="W" value={screenCrop.width} min={10} max={sourceWidth} onChange={(v) => handleDimensionChange('width', v)} />
            <CropNumberInput label="H" value={screenCrop.height} min={10} max={sourceHeight} onChange={(v) => handleDimensionChange('height', v)} />
          </div>

          <button
            onClick={onScreenCropReset}
            style={{
              marginTop: 6,
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.5)',
              fontSize: 11,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Reset crop
          </button>
        </>
      )}
    </>
  );
}
