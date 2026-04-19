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
  onCreateZoomFromFocus?: (crop: RegionCrop) => void;
  zoomMarkerCount?: number;
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

function clampCropToBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const safeWidth = Math.max(50, Math.min(Math.round(width), sourceWidth));
  const safeHeight = Math.max(50, Math.min(Math.round(height), sourceHeight));
  return {
    x: Math.max(0, Math.min(Math.round(x), sourceWidth - safeWidth)),
    y: Math.max(0, Math.min(Math.round(y), sourceHeight - safeHeight)),
    width: safeWidth,
    height: safeHeight,
  };
}

function centeredCrop(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  return clampCropToBounds(
    (sourceWidth - width) / 2,
    (sourceHeight - height) / 2,
    width,
    height,
    sourceWidth,
    sourceHeight,
  );
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
  onCreateZoomFromFocus,
  zoomMarkerCount = 0,
}: RecordCropPanelProps) {
  const cropLabel = targetLabel === 'camera' ? 'camera framing' : 'screen framing';
  const canCreateZoom = targetLabel === 'screen' && Boolean(onCreateZoomFromFocus);

  const applyPreset = (
    preset: 'fit' | 'focus' | 'top-trim' | 'left' | 'right' | CropAspectRatio,
  ) => {
    if (!crop.enabled) {
      onCropChange({ enabled: true });
    }

    if (preset === 'fit') {
      onCropChange({
        enabled: true,
        aspectRatio: 'free',
        x: 0,
        y: 0,
        width: sourceWidth,
        height: sourceHeight,
      });
      return;
    }

    if (preset === 'focus') {
      const next = centeredCrop(sourceWidth, sourceHeight, sourceWidth * 0.84, sourceHeight * 0.84);
      onCropChange({ enabled: true, aspectRatio: 'free', ...next });
      onCropModeChange(true);
      return;
    }

    if (preset === 'top-trim') {
      const insetY = Math.round(sourceHeight * 0.1);
      onCropChange({
        enabled: true,
        aspectRatio: 'free',
        x: 0,
        y: insetY,
        width: sourceWidth,
        height: sourceHeight - insetY,
      });
      return;
    }

    if (preset === 'left' || preset === 'right') {
      const width = Math.round(sourceWidth * 0.62);
      const height = sourceHeight;
      const x = preset === 'left' ? 0 : sourceWidth - width;
      onCropChange({ enabled: true, aspectRatio: 'free', x, y: 0, width, height });
      onCropModeChange(true);
      return;
    }

    const ratio = aspectToNumber(preset);
    if (!ratio) return;

    const sourceRatio = sourceWidth / sourceHeight;
    const next =
      sourceRatio > ratio
        ? centeredCrop(sourceWidth, sourceHeight, sourceHeight * ratio, sourceHeight)
        : centeredCrop(sourceWidth, sourceHeight, sourceWidth, sourceWidth / ratio);

    onCropChange({ enabled: true, aspectRatio: preset, ...next });
    onCropModeChange(true);
  };

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      const insetX = Math.round(sourceWidth * 0.08);
      const insetY = Math.round(sourceHeight * 0.08);
      onCropChange({
        enabled: true,
        aspectRatio: 'free',
        x: insetX,
        y: insetY,
        width: sourceWidth - insetX * 2,
        height: sourceHeight - insetY * 2,
      });
      onCropModeChange(true);
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
      <RcToggleButton label={`Focus ${targetLabel}`} value={crop.enabled} onChange={handleToggle} />

      {crop.enabled && (
        <>
          <div
            style={{
              marginTop: 2,
              fontSize: 12,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.72)',
            }}
          >
            Choose the part of the {cropLabel} that should stay visible. Rough Cut will frame
            around this area instead of making you start with a raw crop box.
          </div>

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
            {cropModeActive ? 'Done focusing' : 'Set focus area'}
          </button>

          <div>
            <ControlLabel label="Quick focus" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: targetLabel === 'screen' ? 'repeat(2, minmax(0, 1fr))' : '1fr 1fr',
                gap: 8,
              }}
            >
              <button
                onClick={() => applyPreset('focus')}
                style={quickPresetButtonStyle}
              >
                Focus center
              </button>
              <button onClick={() => applyPreset('fit')} style={quickPresetButtonStyle}>
                Show all
              </button>
              {targetLabel === 'screen' && (
                <button onClick={() => applyPreset('top-trim')} style={quickPresetButtonStyle}>
                  Hide top bar
                </button>
              )}
              {targetLabel === 'screen' && (
                <button onClick={() => applyPreset('left')} style={quickPresetButtonStyle}>
                  Left column
                </button>
              )}
              {targetLabel === 'screen' && (
                <button onClick={() => applyPreset('right')} style={quickPresetButtonStyle}>
                  Right column
                </button>
              )}
              <button onClick={() => applyPreset('9:16')} style={quickPresetButtonStyle}>
                Vertical cut
              </button>
              <button onClick={() => applyPreset('1:1')} style={quickPresetButtonStyle}>
                Square cut
              </button>
            </div>
          </div>

          {canCreateZoom && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(255,138,101,0.08)',
                border: '1px solid rgba(255,138,101,0.18)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'rgba(255,219,210,0.92)',
                }}
              >
                Turn this focus into motion
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.66)',
                }}
              >
                Create a manual zoom marker at the playhead using this focus area. Then refine
                timing and strength on the timeline zoom track.
              </div>
              <button
                type="button"
                onClick={() => onCreateZoomFromFocus?.(crop)}
                style={{
                  ...quickPresetButtonStyle,
                  width: '100%',
                  marginTop: 10,
                  background: 'rgba(255,138,101,0.16)',
                  border: '1px solid rgba(255,138,101,0.35)',
                  color: 'rgba(255,233,228,0.96)',
                }}
              >
                Create zoom marker from focus
              </button>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.46)',
                }}
              >
                {zoomMarkerCount > 0
                  ? `${zoomMarkerCount} zoom marker${zoomMarkerCount === 1 ? '' : 's'} already on the timeline.`
                  : 'No manual zoom markers yet.'}
              </div>
            </div>
          )}

          <div>
            <ControlLabel label="Advanced crop" />
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
            Reset focus
          </button>
        </>
      )}
    </>
  );
}

const quickPresetButtonStyle = {
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.82)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
} satisfies React.CSSProperties;
