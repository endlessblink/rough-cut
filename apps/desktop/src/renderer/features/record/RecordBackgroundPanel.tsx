/**
 * RecordBackgroundPanel — background fill (gradients, solid colors, image upload),
 * padding, corner radius, and shadow controls.
 *
 * UI pattern matches Screen Studio / Recordly:
 * - 3-tab switcher with pill-style active indicator
 * - 8-column grid of square thumbnails
 * - Selected item indicated by accent border
 *
 * Gradient presets curated from uiGradients (MIT license).
 */
import { useState } from 'react';
import { ControlLabel, RcSlider, RcToggleButton } from '../../ui/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type BackgroundMode = 'gradient' | 'color' | 'image';

export interface RecordBackgroundPanelProps {
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  backgroundGradient: string | null;
  onBackgroundGradientChange: (gradient: string | null) => void;
  padding: number;
  onPaddingChange: (value: number) => void;
  cornerRadius: number;
  onCornerRadiusChange: (value: number) => void;
  inset: number;
  onInsetChange: (value: number) => void;
  insetColor: string;
  onInsetColorChange: (color: string) => void;
  shadowEnabled: boolean;
  onShadowEnabledChange: (enabled: boolean) => void;
  shadowBlur: number;
  onShadowBlurChange: (value: number) => void;
}

// ─── Gradient presets (curated from uiGradients, MIT license) ─────────────────

const GRADIENTS: string[] = [
  // Row 1: Dark & moody
  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'linear-gradient(135deg, #000000, #434343)',
  'linear-gradient(135deg, #536976, #292E49)',
  'linear-gradient(135deg, #000C40, #607D8B)',
  'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
  'linear-gradient(135deg, #141E30, #243B55)',
  'linear-gradient(135deg, #0F2027, #203A43, #2C5364)',
  'linear-gradient(135deg, #232526, #414345)',
  // Row 2: Cool blues & teals
  'linear-gradient(135deg, #2E3192, #1BFFFF)',
  'linear-gradient(135deg, #091E3A, #2F80ED, #2D9EE0)',
  'linear-gradient(135deg, #000428, #004e92)',
  'linear-gradient(135deg, #0052D4, #4364F7, #6FB1FC)',
  'linear-gradient(135deg, #00c6ff, #0072ff)',
  'linear-gradient(135deg, #076585, #fff)',
  'linear-gradient(135deg, #00F5A0, #00D9F5)',
  'linear-gradient(135deg, #43cea2, #185a9d)',
  // Row 3: Vibrant & warm
  'linear-gradient(135deg, #5433FF, #20BDFF, #A5FECB)',
  'linear-gradient(135deg, #c84e89, #F15F79)',
  'linear-gradient(135deg, #fc4a1a, #f7b733)',
  'linear-gradient(135deg, #ffe259, #ffa751)',
  'linear-gradient(135deg, #9796f0, #fbc7d4)',
  'linear-gradient(135deg, #acb6e5, #86fde8)',
  'linear-gradient(135deg, #fbed96, #abecd6)',
  'linear-gradient(135deg, #a8c0ff, #3f2b96)',
];

// ─── Solid color presets ──────────────────────────────────────────────────────

const COLORS: string[] = [
  '#000000', '#0a0a0a', '#111111', '#1a1a1a',
  '#0f0c29', '#1a1a2e', '#16213e', '#0f3460',
  '#1b2430', '#2c3333', '#161a30', '#533483',
  '#1e3a5f', '#3c1053', '#1a472a', '#2d2d2d',
  '#4a1942', '#0d1b2a', '#1b263b', '#415a77',
  '#2b2d42', '#3d405b', '#283618', '#606c38',
];

const ACCENT = '#ff6b5a';

// ─── Tab switcher (pill-style, matches Screen Studio) ─────────────────────────

function TabSwitcher({
  active,
  onChange,
}: {
  active: BackgroundMode;
  onChange: (mode: BackgroundMode) => void;
}) {
  const tabs: { id: BackgroundMode; label: string }[] = [
    { id: 'gradient', label: 'Gradient' },
    { id: 'color', label: 'Color' },
    { id: 'image', label: 'Image' },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        height: 28,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        padding: 3,
        gap: 2,
      }}
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            border: 'none',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            padding: 0,
            background: active === id ? ACCENT : 'transparent',
            color: active === id ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'background 150ms, color 150ms',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Tile grid (shared by gradients and colors) ───────────────────────────────

function TileGrid({
  items,
  selected,
  onSelect,
  type,
}: {
  items: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  type: 'gradient' | 'color';
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 3,
        marginTop: 8,
      }}
    >
      {items.map((value, i) => {
        const isSelected = selected === value;
        return (
          <button
            key={`${type}-${i}`}
            onClick={() => onSelect(value)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 8,
              background: value,
              border: isSelected
                ? `2px solid ${ACCENT}`
                : '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
              transition: 'border-color 120ms, transform 80ms',
              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
              boxShadow: isSelected ? `0 0 8px ${ACCENT}40` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Image upload placeholder ─────────────────────────────────────────────────

function ImageSection() {
  return (
    <div
      style={{
        marginTop: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '20px 8px',
        borderRadius: 8,
        border: '1px dashed rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <circle cx="8.5" cy="10.5" r="1.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <path d="M3 16l5-4 3 2.5 4-4 6 5.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', textAlign: 'center', lineHeight: 1.4 }}>
        Drop image or click to upload
      </span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>Coming soon</span>
    </div>
  );
}

// ─── RecordBackgroundPanel ────────────────────────────────────────────────────

export function RecordBackgroundPanel({
  backgroundColor,
  onBackgroundColorChange,
  backgroundGradient,
  onBackgroundGradientChange,
  padding,
  onPaddingChange,
  cornerRadius,
  onCornerRadiusChange,
  inset,
  onInsetChange,
  insetColor,
  onInsetColorChange,
  shadowEnabled,
  onShadowEnabledChange,
  shadowBlur,
  onShadowBlurChange,
}: RecordBackgroundPanelProps) {
  const [mode, setMode] = useState<BackgroundMode>(
    backgroundGradient ? 'gradient' : 'color',
  );

  const handleModeChange = (newMode: BackgroundMode) => {
    setMode(newMode);
    if (newMode === 'color' && backgroundGradient) {
      onBackgroundGradientChange(null);
    }
  };

  return (
    <>
      {/* Background fill */}
      <div>
        <TabSwitcher active={mode} onChange={handleModeChange} />

        {mode === 'gradient' && (
          <TileGrid
            items={GRADIENTS}
            selected={backgroundGradient}
            onSelect={onBackgroundGradientChange}
            type="gradient"
          />
        )}

        {mode === 'color' && (
          <TileGrid
            items={COLORS}
            selected={backgroundColor}
            onSelect={(color) => {
              onBackgroundGradientChange(null);
              onBackgroundColorChange(color);
            }}
            type="color"
          />
        )}

        {mode === 'image' && <ImageSection />}
      </div>

      {/* Framing controls */}
      <div>
        <ControlLabel label="Padding" value={`${padding}px`} />
        <RcSlider min={0} max={200} step={5} value={padding} onChange={onPaddingChange} />
      </div>

      <div>
        <ControlLabel label="Corner radius" value={`${cornerRadius}px`} />
        <RcSlider min={0} max={40} step={1} value={cornerRadius} onChange={onCornerRadiusChange} />
      </div>

      <div>
        <ControlLabel label="Inset" value={inset > 0 ? `${inset}px` : 'Off'} />
        <RcSlider min={0} max={20} step={1} value={inset} onChange={onInsetChange} />
        {inset > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
            {['#ffffff', '#000000', '#1a1a2e', '#ff6b5a'].map((c) => (
              <button
                key={c}
                onClick={() => onInsetColorChange(c)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: c,
                  border: insetColor === c ? `2px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <RcToggleButton label="Shadow" value={shadowEnabled} onChange={onShadowEnabledChange} />

      {shadowEnabled && (
        <div>
          <ControlLabel label="Shadow blur" value={`${shadowBlur}px`} />
          <RcSlider min={0} max={50} step={1} value={shadowBlur} onChange={onShadowBlurChange} />
        </div>
      )}
    </>
  );
}
