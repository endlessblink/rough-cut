/**
 * RecordCropPanel — per-region static crop controls.
 * Toggle crop, choose aspect ratio, edit visually, reset.
 */
import type { RegionCrop, CropAspectRatio } from '@rough-cut/project-model';
import { ControlLabel, PillRadioRow, RcToggleButton } from '../../ui/index.js';
import type { PillOption } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordCropPanelProps {
  targetLabel: string;
  crop: RegionCrop;
  onCropChange: (patch: Partial<RegionCrop>) => void;
  onCropReset: () => void;
  sourceWidth: number;
  sourceHeight: number;
  cropModeActive: boolean;
  onCropModeChange: (active: boolean) => void;
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
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    default:
      return null;
  }
}

// ─── RecordCropPanel ────────────────────────────────────────────────────────

export function RecordCropPanel({
  targetLabel,
  crop,
  onCropChange,
  onCropReset,
  sourceWidth,
  sourceHeight,
  cropModeActive,
  onCropModeChange,
}: RecordCropPanelProps) {
  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      const insetX = Math.round(sourceWidth * 0.1);
      const insetY = Math.round(sourceHeight * 0.1);
      onCropChange({
        enabled: true,
        x: insetX,
        y: insetY,
        width: sourceWidth - insetX * 2,
        height: sourceHeight - insetY * 2,
      });
    } else {
      onCropModeChange(false);
      onCropChange({ enabled: false });
    }
  };

  const handleAspectChange = (aspect: CropAspectRatio) => {
    onCropChange({ aspectRatio: aspect });

    const ratio = aspectToNumber(aspect);
    if (ratio) {
      const currentCenterX = crop.x + crop.width / 2;
      const currentCenterY = crop.y + crop.height / 2;

      let newW: number;
      let newH: number;

      if (crop.width / crop.height > ratio) {
        newH = crop.height;
        newW = newH * ratio;
      } else {
        newW = crop.width;
        newH = newW / ratio;
      }

      const newX = Math.max(0, Math.min(currentCenterX - newW / 2, sourceWidth - newW));
      const newY = Math.max(0, Math.min(currentCenterY - newH / 2, sourceHeight - newH));

      onCropChange({
        width: Math.round(newW),
        height: Math.round(newH),
        x: Math.round(newX),
        y: Math.round(newY),
      });
    }
  };

  return (
    <>
      <RcToggleButton label={`Crop ${targetLabel}`} value={crop.enabled} onChange={handleToggle} />

      {crop.enabled && (
        <>
          <button
            onClick={() => onCropModeChange(!cropModeActive)}
            style={{
              padding: '6px 12px',
              background: cropModeActive ? 'rgba(90,160,250,0.2)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${cropModeActive ? 'rgba(90,160,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 6,
              color: cropModeActive ? 'rgba(90,160,250,1)' : 'rgba(255,255,255,0.7)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            {cropModeActive ? 'Done editing' : 'Edit crop visually'}
          </button>

          <div>
            <ControlLabel label="Aspect ratio" />
            <PillRadioRow
              value={crop.aspectRatio}
              options={ASPECT_OPTIONS}
              onChange={handleAspectChange}
            />
          </div>

          <button
            onClick={() => {
              onCropModeChange(false);
              onCropReset();
            }}
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
