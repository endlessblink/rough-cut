/**
 * RecordZoomPanel — auto-zoom controls and cursor-follow framing.
 * Per-marker editing happens on the timeline zoom track, not in this panel.
 */
import { ControlLabel, RcSlider } from '../../ui/index.js';

type ZoomFollowAnimation = 'focused' | 'smooth';

export interface RecordZoomPanelProps {
  zoomIntensity: number;
  onZoomIntensityChange: (value: number) => void;
  zoomFollowCursor: boolean;
  onZoomFollowCursorChange: (value: boolean) => void;
  zoomFollowAnimation: ZoomFollowAnimation;
  onZoomFollowAnimationChange: (value: ZoomFollowAnimation) => void;
  zoomFollowPadding: number;
  onZoomFollowPaddingChange: (value: number) => void;
  zoomMarkerCount: number;
  canRegenerateAutoZoom: boolean;
  onRegenerateAutoZoom: () => void;
  focusBridgeActive?: boolean;
}

function intensityLabel(value: number): string {
  if (value <= 0.1) return 'Off';
  if (value <= 0.3) return 'Low';
  if (value <= 0.6) return 'Medium';
  if (value <= 0.8) return 'High';
  return 'Max';
}

function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function RecordZoomPanel({
  zoomIntensity,
  onZoomIntensityChange,
  zoomFollowCursor,
  onZoomFollowCursorChange,
  zoomFollowAnimation,
  onZoomFollowAnimationChange,
  zoomFollowPadding,
  onZoomFollowPaddingChange,
  zoomMarkerCount,
  canRegenerateAutoZoom,
  onRegenerateAutoZoom,
  focusBridgeActive = false,
}: RecordZoomPanelProps) {
  const safeZoomIntensity = clampNumber(zoomIntensity, 0, 0, 1);
  const safeZoomFollowPadding = clampNumber(zoomFollowPadding, 0.12, 0, 0.3);

  return (
    <>
      <div>
        <ControlLabel label="Auto zoom intensity" value={intensityLabel(safeZoomIntensity)} />
        <RcSlider
          min={0}
          max={100}
          step={1}
          value={safeZoomIntensity * 100}
          onChange={(v) => onZoomIntensityChange(v / 100)}
        />
      </div>

      <label
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'rgba(255,255,255,0.82)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={zoomFollowCursor}
          onChange={(e) => onZoomFollowCursorChange(e.target.checked)}
        />
        Follow cursor during auto zoom
      </label>

      <div style={{ marginTop: 12, opacity: zoomFollowCursor ? 1 : 0.45 }}>
        <ControlLabel
          label="Follow style"
          value={zoomFollowAnimation === 'focused' ? 'Focused' : 'Smooth'}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {(['focused', 'smooth'] as const).map((option) => {
            const active = option === zoomFollowAnimation;
            return (
              <button
                key={option}
                type="button"
                disabled={!zoomFollowCursor}
                onClick={() => onZoomFollowAnimationChange(option)}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: `1px solid ${active ? 'rgba(255,138,101,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  background: active ? 'rgba(255,138,101,0.16)' : 'rgba(255,255,255,0.05)',
                  color: active ? 'rgba(255,214,204,0.96)' : 'rgba(255,255,255,0.72)',
                  cursor: zoomFollowCursor ? 'pointer' : 'default',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {option === 'focused' ? 'Focused' : 'Smooth'}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12, opacity: zoomFollowCursor ? 1 : 0.45 }}>
        <ControlLabel
          label="Cursor framing"
          value={`${Math.round(safeZoomFollowPadding * 100)}%`}
        />
        <RcSlider
          min={0}
          max={30}
          step={1}
          value={safeZoomFollowPadding * 100}
          disabled={!zoomFollowCursor}
          onChange={(v) => onZoomFollowPaddingChange(v / 100)}
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

      {focusBridgeActive && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(255,138,101,0.08)',
            border: '1px solid rgba(255,138,101,0.16)',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'rgba(255,240,235,0.88)',
          }}
        >
          Screen focus is active. Create a zoom marker from the Focus panel to reuse the same
          framing on the timeline, then fine-tune it here.
        </div>
      )}

      <button
        type="button"
        onClick={onRegenerateAutoZoom}
        disabled={!canRegenerateAutoZoom}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '8px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: canRegenerateAutoZoom ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
          background: canRegenerateAutoZoom ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6,
          cursor: canRegenerateAutoZoom ? 'pointer' : 'default',
        }}
      >
        Recreate auto zoom
      </button>
    </>
  );
}
