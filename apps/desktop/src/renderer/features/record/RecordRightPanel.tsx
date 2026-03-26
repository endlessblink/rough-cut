/**
 * RecordRightPanel: Presentation controls for the Record view.
 * Zoom presets, highlight keyframes, cursor styling, title overlays.
 * No structural editing — this is the presentation inspector.
 */
import React, { useState, useCallback } from 'react';
import type { ZoomMarker, CursorPresentation, CursorStyle, ClickEffect } from '@rough-cut/project-model';

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

// ─── PanelSection ──────────────────────────────────────────────────────────────

interface PanelSectionProps {
  title: string;
  rightAction?: React.ReactNode;
  flex?: number;
  minHeight?: number;
  children?: React.ReactNode;
}

function PanelSection({ title, rightAction, flex, minHeight = 48, children }: PanelSectionProps) {
  return (
    <section
      style={{
        borderRadius: 10,
        background: 'rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight,
        flex: flex ?? 'none',
      }}
    >
      <div
        style={{
          height: 28,
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: 'rgba(0,0,0,0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.68)',
            userSelect: 'none',
          }}
        >
          {title}
        </span>
        {rightAction}
      </div>

      <div
        style={{
          padding: '8px 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flex: 1,
        }}
      >
        {children ?? (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.36)', userSelect: 'none' }}>
            Coming soon
          </span>
        )}
      </div>
    </section>
  );
}

// ─── ZoomIntensitySlider ────────────────────────────────────────────────────

function intensityLabel(value: number): string {
  if (value <= 0.1) return 'Off';
  if (value <= 0.3) return 'Low';
  if (value <= 0.6) return 'Medium';
  if (value <= 0.8) return 'High';
  return 'Max';
}

function ZoomIntensitySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const label = intensityLabel(value);

  return (
    <div>
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
        <span>Auto zoom intensity</span>
        <span style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{
          width: '100%',
          height: 4,
          accentColor: '#ff6b5a',
          cursor: 'pointer',
        }}
      />
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

// ─── CursorStyleSelector ────────────────────────────────────────────────────

const CURSOR_STYLES: { id: CursorStyle; label: string }[] = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'default', label: 'Default' },
  { id: 'spotlight', label: 'Spotlight' },
];

function CursorStyleSelector({
  value,
  onChange,
}: {
  value: CursorStyle;
  onChange: (v: CursorStyle) => void;
}) {
  const [hoveredId, setHoveredId] = useState<CursorStyle | null>(null);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
        Cursor style
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {CURSOR_STYLES.map((opt) => {
          const active = value === opt.id;
          const hovered = hoveredId === opt.id;

          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              onMouseEnter={() => setHoveredId(opt.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                fontFamily: 'inherit',
                border: 'none',
                cursor: 'pointer',
                userSelect: 'none',
                background: active
                  ? 'rgba(255,255,255,0.92)'
                  : hovered
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(255,255,255,0.05)',
                color: active ? '#000' : 'rgba(255,255,255,0.60)',
                transition: 'background 100ms ease, color 100ms ease',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: active ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.40)',
                  flexShrink: 0,
                }}
              />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── ClickEffectSelector ────────────────────────────────────────────────────

const CLICK_EFFECTS: { id: ClickEffect; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'ripple', label: 'Ripple' },
  { id: 'ring', label: 'Highlight ring' },
];

function ClickEffectSelector({
  value,
  onChange,
}: {
  value: ClickEffect;
  onChange: (v: ClickEffect) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
        Click effect
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ClickEffect)}
        style={{
          height: 28,
          width: '100%',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(0,0,0,0.60)',
          padding: '0 8px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.80)',
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {CLICK_EFFECTS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── CursorSizeSlider ────────────────────────────────────────────────────────

function CursorSizeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
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
        <span>Cursor size</span>
        <span style={{ color: 'rgba(255,255,255,0.72)' }}>{value}%</span>
      </div>
      <input
        type="range"
        min={50}
        max={150}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 4, accentColor: '#ff6b5a', cursor: 'pointer' }}
      />
    </div>
  );
}

// ─── ClickSoundToggle ────────────────────────────────────────────────────────

function ClickSoundToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onChange(!enabled)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 28,
        width: '100%',
        borderRadius: 6,
        padding: '0 8px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: enabled
          ? hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.10)'
          : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
        transition: 'background 100ms ease',
      }}
    >
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)' }}>Click sound</span>
      <span style={{ fontSize: 11, color: enabled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.50)' }}>
        {enabled ? 'On' : 'Off'}
      </span>
    </button>
  );
}

// ─── CursorResetButton ───────────────────────────────────────────────────────

function CursorResetButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        fontSize: 11,
        color: hovered ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.50)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'color 100ms ease',
      }}
    >
      Reset
    </button>
  );
}

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
  const [resetHovered, setResetHovered] = useState(false);

  return (
    <aside
      style={{
        flex: '0 0 260px',
        maxWidth: 260,
        borderRadius: 14,
        background:
          'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'hidden',
        overflowY: 'auto',
      }}
    >
      {/* Zoom card — wired */}
      <PanelSection
        title="Zoom"
        rightAction={
          <button
            onClick={onResetZoomMarkers}
            onMouseEnter={() => setResetHovered(true)}
            onMouseLeave={() => setResetHovered(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 11,
              color: resetHovered ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.50)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 100ms ease',
            }}
          >
            Reset
          </button>
        }
        flex={1}
        minHeight={140}
      >
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
              {zoomMarkers.length > 0 ? `${zoomMarkers.length} marker${zoomMarkers.length > 1 ? 's' : ''}` : ''}
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
      </PanelSection>

      {/* Cursor card — wired */}
      <PanelSection
        title="Cursor"
        rightAction={
          <CursorResetButton
            onClick={onCursorReset}
          />
        }
        minHeight={140}
      >
        <CursorStyleSelector
          value={cursor.style}
          onChange={(style) => onCursorChange({ style })}
        />
        <ClickEffectSelector
          value={cursor.clickEffect}
          onChange={(clickEffect) => onCursorChange({ clickEffect })}
        />
        <CursorSizeSlider
          value={cursor.sizePercent}
          onChange={(sizePercent) => onCursorChange({ sizePercent })}
        />
        <ClickSoundToggle
          enabled={cursor.clickSoundEnabled}
          onChange={(clickSoundEnabled) => onCursorChange({ clickSoundEnabled })}
        />
      </PanelSection>

      {/* Remaining sections — placeholders */}
      <PanelSection title="Highlights" flex={1} minHeight={96} />
      <PanelSection title="Titles" minHeight={72} />
    </aside>
  );
}
