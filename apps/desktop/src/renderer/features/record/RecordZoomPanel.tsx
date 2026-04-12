/**
 * RecordZoomPanel — auto-zoom intensity slider only.
 * Per-marker editing happens on the timeline zoom track, not in this panel.
 */
import { ControlLabel, RcSlider } from '../../ui/index.js';

export interface RecordZoomPanelProps {
  zoomIntensity: number;
  onZoomIntensityChange: (value: number) => void;
  zoomMarkerCount: number;
}

function intensityLabel(value: number): string {
  if (value <= 0.1) return 'Off';
  if (value <= 0.3) return 'Low';
  if (value <= 0.6) return 'Medium';
  if (value <= 0.8) return 'High';
  return 'Max';
}

export function RecordZoomPanel({
  zoomIntensity,
  onZoomIntensityChange,
  zoomMarkerCount,
}: RecordZoomPanelProps) {
  return (
    <>
      <div>
        <ControlLabel label="Auto zoom intensity" value={intensityLabel(zoomIntensity)} />
        <RcSlider
          min={0}
          max={100}
          step={1}
          value={zoomIntensity * 100}
          onChange={(v) => onZoomIntensityChange(v / 100)}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          lineHeight: 1.45,
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        {zoomMarkerCount > 0 ? (
          <>
            {zoomMarkerCount} marker{zoomMarkerCount > 1 ? 's' : ''} on the timeline zoom track.
            Click a marker there to edit.
          </>
        ) : (
          <>Add manual markers with the + button on the timeline zoom track.</>
        )}
      </div>
    </>
  );
}
