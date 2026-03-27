/**
 * RecordBackgroundPanel — background fill (gradients, solid colors, image),
 * padding, corner radius, and shadow controls.
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
  shadowEnabled: boolean;
  onShadowEnabledChange: (enabled: boolean) => void;
  shadowBlur: number;
  onShadowBlurChange: (value: number) => void;
}

// ─── Gradient presets (curated from uiGradients, MIT license) ─────────────────

interface GradientPreset {
  name: string;
  css: string;
}

const GRADIENT_PRESETS: GradientPreset[] = [
  // Dark & moody
  { name: 'Midnight', css: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { name: 'Deep Space', css: 'linear-gradient(135deg, #000000, #434343)' },
  { name: 'Royal', css: 'linear-gradient(135deg, #536976, #292E49)' },
  { name: 'Abyss', css: 'linear-gradient(135deg, #000C40, #607D8B)' },
  // Cool blues
  { name: 'Ocean', css: 'linear-gradient(135deg, #2E3192, #1BFFFF)' },
  { name: 'Omolon', css: 'linear-gradient(135deg, #091E3A, #2F80ED, #2D9EE0)' },
  { name: 'Frost', css: 'linear-gradient(135deg, #000428, #004e92)' },
  { name: 'Bluelagoo', css: 'linear-gradient(135deg, #0052D4, #4364F7, #6FB1FC)' },
  // Vibrant
  { name: 'Lunada', css: 'linear-gradient(135deg, #5433FF, #20BDFF, #A5FECB)' },
  { name: 'Ibtesam', css: 'linear-gradient(135deg, #00F5A0, #00D9F5)' },
  { name: 'Sunset', css: 'linear-gradient(135deg, #fc4a1a, #f7b733)' },
  { name: 'Purple', css: 'linear-gradient(135deg, #c84e89, #F15F79)' },
  // Soft & warm
  { name: 'Breeze', css: 'linear-gradient(135deg, #fbed96, #abecd6)' },
  { name: 'Mango', css: 'linear-gradient(135deg, #ffe259, #ffa751)' },
  { name: 'Peach', css: 'linear-gradient(135deg, #9796f0, #fbc7d4)' },
  { name: 'Windy', css: 'linear-gradient(135deg, #acb6e5, #86fde8)' },
];

// ─── Solid color presets ──────────────────────────────────────────────────────

const SOLID_COLORS = [
  '#000000', '#0a0a0a', '#1a1a1a', '#2d2d2d',
  '#0f0c29', '#1a1a2e', '#16213e', '#0f3460',
  '#1b2430', '#2c3333', '#161a30', '#533483',
  '#1e3a5f', '#3c1053', '#1a472a', '#4a1942',
];

const ACCENT = '#ff6b5a';

// ─── Section tab switcher ─────────────────────────────────────────────────────

function SectionTabs({
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
        display: 'flex',
        gap: 2,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 6,
        padding: 2,
      }}
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            flex: 1,
            height: 24,
            border: 'none',
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 600,
            fontFamily: 'inherit',
            letterSpacing: '0.03em',
            cursor: 'pointer',
            background: active === id ? 'rgba(255,255,255,0.12)' : 'transparent',
            color: active === id ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.40)',
            transition: 'background 100ms, color 100ms',
            padding: 0,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Gradient grid ────────────────────────────────────────────────────────────

function GradientGrid({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (css: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 4,
        marginTop: 6,
      }}
    >
      {GRADIENT_PRESETS.map((g) => {
        const isSelected = selected === g.css;
        return (
          <button
            key={g.name}
            onClick={() => onSelect(g.css)}
            title={g.name}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 6,
              background: g.css,
              border: isSelected
                ? `2px solid ${ACCENT}`
                : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
              transition: 'border-color 100ms',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Color grid ───────────────────────────────────────────────────────────────

function ColorGrid({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 4,
        marginTop: 6,
      }}
    >
      {SOLID_COLORS.map((color) => {
        const isSelected = selected === color;
        return (
          <button
            key={color}
            onClick={() => onSelect(color)}
            title={color}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 6,
              background: color,
              border: isSelected
                ? `2px solid ${ACCENT}`
                : '2px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
              transition: 'border-color 100ms',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Image placeholder ────────────────────────────────────────────────────────

function ImageSection() {
  return (
    <div
      style={{
        marginTop: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 8px',
        borderRadius: 6,
        border: '1px dashed rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="rgba(255,255,255,0.30)" strokeWidth="1.2" />
        <circle cx="7" cy="9" r="1.5" stroke="rgba(255,255,255,0.30)" strokeWidth="1" />
        <path d="M2 14l4-3 3 2 4-4 5 5" stroke="rgba(255,255,255,0.30)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
        Drop an image or click to upload
      </span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>
        Coming soon
      </span>
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
    // Clear gradient when switching to color mode
    if (newMode === 'color' && backgroundGradient) {
      onBackgroundGradientChange(null);
    }
  };

  const handleGradientSelect = (css: string) => {
    onBackgroundGradientChange(css);
  };

  const handleColorSelect = (color: string) => {
    onBackgroundGradientChange(null);
    onBackgroundColorChange(color);
  };

  return (
    <>
      {/* Background fill section */}
      <div>
        <ControlLabel label="Background" />
        <SectionTabs active={mode} onChange={handleModeChange} />

        {mode === 'gradient' && (
          <GradientGrid
            selected={backgroundGradient}
            onSelect={handleGradientSelect}
          />
        )}

        {mode === 'color' && (
          <ColorGrid
            selected={backgroundColor}
            onSelect={handleColorSelect}
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
