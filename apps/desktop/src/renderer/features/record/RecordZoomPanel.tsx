/**
 * RecordZoomPanel — zoom intensity slider + zoom markers lane.
 * Extracted from RecordRightPanel for use inside InspectorShell.
 */
import React, { useState, useCallback } from 'react';
import type { ZoomMarker } from '@rough-cut/project-model';
import { ControlLabel, RcSlider } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordZoomPanelProps {
  durationFrames: number;
  currentFrame: number;
  zoomMarkers: readonly ZoomMarker[];
  zoomIntensity: number;
  onZoomIntensityChange: (value: number) => void;
  onAddZoomMarker: (frame: number) => void;
  onSelectZoomMarker: (id: string) => void;
}

// ─── intensityLabel ───────────────────────────────────────────────────────────

function intensityLabel(value: number): string {
  if (value <= 0.1) return 'Off';
  if (value <= 0.3) return 'Low';
  if (value <= 0.6) return 'Medium';
  if (value <= 0.8) return 'High';
  return 'Max';
}

// ─── ZoomIntensitySlider ─────────────────────────────────────────────────────

function ZoomIntensitySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <ControlLabel label="Auto zoom intensity" value={intensityLabel(value)} />
      <RcSlider min={0} max={100} step={1} value={value * 100} onChange={(v) => onChange(v / 100)} />
    </div>
  );
}

// ─── ZoomMarkersLane ─────────────────────────────────────────────────────────

function ZoomMarkersLane({
  durationFrames,
  markers,
  currentFrame,
  onAddMarker,
  onSelectMarker,
}: {
  durationFrames: number;
  markers: readonly ZoomMarker[];
  currentFrame: number;
  onAddMarker: (frame: number) => void;
  onSelectMarker: (id: string) => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (durationFrames <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const frame = Math.round(durationFrames * ratio);
      onAddMarker(frame);
    },
    [durationFrames, onAddMarker],
  );

  const playheadPct = durationFrames > 0 ? (currentFrame / durationFrames) * 100 : 0;

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        height: 28,
        width: '100%',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.05)',
        cursor: 'crosshair',
        overflow: 'hidden',
      }}
    >
      {/* Empty state */}
      {markers.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'rgba(255,255,255,0.30)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          Click to add zoom
        </div>
      )}

      {/* Playhead */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${playheadPct}%`,
          width: 1,
          background: '#ff6b5a',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Markers */}
      {markers.map((m) => {
        const left = durationFrames > 0 ? (m.startFrame / durationFrames) * 100 : 0;
        const width = durationFrames > 0 ? ((m.endFrame - m.startFrame) / durationFrames) * 100 : 1.5;

        return (
          <MarkerPill
            key={m.id}
            left={left}
            width={Math.max(width, 1.5)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectMarker(m.id);
            }}
          />
        );
      })}
    </div>
  );
}

// ─── MarkerPill ───────────────────────────────────────────────────────────────

function MarkerPill({
  left,
  width,
  onClick,
}: {
  left: number;
  width: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: 3,
        height: 22,
        left: `${left}%`,
        width: `${width}%`,
        minWidth: 4,
        borderRadius: 3,
        background: hovered ? 'rgba(255,107,90,1)' : 'rgba(255,107,90,0.70)',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 80ms ease',
        zIndex: 1,
      }}
    />
  );
}

// ─── RecordZoomPanel ──────────────────────────────────────────────────────────

export function RecordZoomPanel({
  durationFrames,
  currentFrame,
  zoomMarkers,
  zoomIntensity,
  onZoomIntensityChange,
  onAddZoomMarker,
  onSelectZoomMarker,
}: RecordZoomPanelProps) {
  return (
    <>
      <ZoomIntensitySlider value={zoomIntensity} onChange={onZoomIntensityChange} />

      <div style={{ marginTop: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            marginBottom: 4,
          }}
        >
          <span>Zoom markers</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
            {zoomMarkers.length > 0
              ? `${zoomMarkers.length} marker${zoomMarkers.length > 1 ? 's' : ''}`
              : ''}
          </span>
        </div>
        <ZoomMarkersLane
          durationFrames={durationFrames}
          markers={zoomMarkers}
          currentFrame={currentFrame}
          onAddMarker={onAddZoomMarker}
          onSelectMarker={onSelectZoomMarker}
        />
      </div>
    </>
  );
}
