/**
 * ZoomMarkerInspector — fixed bar above the timeline.
 * Shown only when a zoom marker is selected. Exposes:
 *   - Strength slider (0–1, shows resulting scale via strengthToScale)
 *   - Duration (seconds)
 *   - Ease in / Ease out (frames)
 *   - Delete button
 */
import { useEffect } from 'react';
import type { ZoomMarker, ZoomMarkerId } from '@rough-cut/project-model';
import { strengthToScale } from '@rough-cut/timeline-engine';
import { RcSlider, ControlLabel } from '../../ui/index.js';

export interface ZoomMarkerInspectorProps {
  marker: ZoomMarker;
  fps: number;
  onPatch: (patch: Partial<ZoomMarker>) => void;
  onDelete: () => void;
  onDismiss: () => void;
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(n);
      }}
      style={{
        width: 64,
        padding: '4px 6px',
        fontSize: 11,
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.90)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 4,
        outline: 'none',
      }}
    />
  );
}

export function ZoomMarkerInspector({
  marker,
  fps,
  onPatch,
  onDelete,
  onDismiss,
}: ZoomMarkerInspectorProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const durationFrames = marker.endFrame - marker.startFrame;
  const durationSec = durationFrames / fps;
  const resultingScale = strengthToScale(marker.strength).toFixed(2);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 16,
        rowGap: 8,
        padding: '8px 12px',
        margin: '0 24px 6px',
        background: 'rgba(20,20,20,0.96)',
        border: '1px solid rgba(255,138,101,0.25)',
        borderRadius: 8,
        fontSize: 11,
        color: 'rgba(255,255,255,0.85)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'rgba(255,138,101,0.90)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        Zoom · {marker.kind}
      </div>

      {/* Strength */}
      <div style={{ minWidth: 160, flex: '1 1 160px' }}>
        <ControlLabel label="Strength" value={`${resultingScale}x`} />
        <RcSlider
          min={0}
          max={100}
          step={1}
          value={marker.strength * 100}
          onChange={(v) => onPatch({ strength: v / 100 })}
        />
      </div>

      {/* Duration */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Duration (s)</span>
        <NumberInput
          value={Number(durationSec.toFixed(2))}
          min={0.1}
          step={0.1}
          onChange={(sec) => {
            const newDur = Math.max(1, Math.round(sec * fps));
            onPatch({ endFrame: marker.startFrame + newDur });
          }}
        />
      </label>

      {/* Ease in */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Ease in (f)</span>
        <NumberInput
          value={marker.zoomInDuration}
          min={0}
          onChange={(v) => onPatch({ zoomInDuration: Math.max(0, Math.round(v)) })}
        />
      </label>

      {/* Ease out */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Ease out (f)</span>
        <NumberInput
          value={marker.zoomOutDuration}
          min={0}
          onChange={(v) => onPatch({ zoomOutDuration: Math.max(0, Math.round(v)) })}
        />
      </label>

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Delete marker"
        style={{
          marginLeft: 'auto',
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,120,120,0.95)',
          background: 'rgba(255,120,120,0.12)',
          border: '1px solid rgba(255,120,120,0.35)',
          borderRadius: 4,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Delete
      </button>
    </div>
  );
}

export type { ZoomMarkerId };
