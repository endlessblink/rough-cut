/**
 * RecordRightPanel: Presentation controls for the Record view.
 * Zoom presets, highlight keyframes, cursor styling, title overlays.
 * No structural editing — this is the presentation inspector.
 */
import React, { useState, useCallback } from 'react';
import type { ZoomMarker, CursorPresentation, CursorStyle, ClickEffect } from '@rough-cut/project-model';
import {
  InspectorCard,
  PillRadioRow,
  RcSlider,
  RcSelect,
  RcToggleButton,
  ControlLabel,
  RECORD_PANEL_WIDTH,
  CARD_GAP,
} from '../../ui/index.js';
import type { PillOption } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordRightPanelProps {
  durationFrames: number;
  currentFrame: number;
  fps: number;
  zoomMarkers: readonly ZoomMarker[];
  zoomIntensity: number;
  onZoomIntensityChange: (value: number) => void;
  onAddZoomMarker: (frame: number) => void;
  onSelectZoomMarker: (id: string) => void;
  onResetZoomMarkers: () => void;
  cursor: CursorPresentation;
  onCursorChange: (patch: Partial<CursorPresentation>) => void;
  onCursorReset: () => void;
}

// ─── intensityLabel ──────────────────────────────────────────────────────────

function intensityLabel(value: number): string {
  if (value <= 0.1) return 'Off';
  if (value <= 0.3) return 'Low';
  if (value <= 0.6) return 'Medium';
  if (value <= 0.8) return 'High';
  return 'Max';
}

// ─── ZoomIntensitySlider ────────────────────────────────────────────────────

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

// ─── ZoomMarkersLane ────────────────────────────────────────────────────────

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

// ─── Cursor style options ─────────────────────────────────────────────────────

const CURSOR_STYLE_OPTIONS: PillOption<CursorStyle>[] = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'default', label: 'Default' },
  { id: 'spotlight', label: 'Spotlight' },
];

// ─── RecordRightPanel ──────────────────────────────────────────────────────────

export function RecordRightPanel({
  durationFrames,
  currentFrame,
  zoomMarkers,
  zoomIntensity,
  onZoomIntensityChange,
  onAddZoomMarker,
  onSelectZoomMarker,
  onResetZoomMarkers,
  cursor,
  onCursorChange,
  onCursorReset,
}: RecordRightPanelProps) {
  return (
    <aside
      style={{
        flex: `0 0 ${RECORD_PANEL_WIDTH}px`,
        maxWidth: RECORD_PANEL_WIDTH,
        borderRadius: 14,
        background:
          'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: CARD_GAP,
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {/* Zoom card — wired */}
      <InspectorCard title="Zoom" onReset={onResetZoomMarkers} flex={1} minHeight={140}>
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
      </InspectorCard>

      {/* Cursor card — wired */}
      <InspectorCard title="Cursor" onReset={onCursorReset} minHeight={140}>
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
        <RcToggleButton
          label="Click sound"
          value={cursor.clickSoundEnabled}
          onChange={(v) => onCursorChange({ clickSoundEnabled: v })}
        />
      </InspectorCard>

      {/* Remaining sections — placeholders */}
      <InspectorCard title="Highlights" flex={1} minHeight={96} />
      <InspectorCard title="Titles" minHeight={72} />
    </aside>
  );
}
