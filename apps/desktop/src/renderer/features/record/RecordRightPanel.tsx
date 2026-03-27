/**
 * RecordRightPanel: Presentation controls for the Record view.
 * Zoom presets, highlight keyframes, cursor styling, title overlays.
 * No structural editing — this is the presentation inspector.
 *
 * Delegates layout to InspectorShell; each category panel lives in
 * its own component (RecordZoomPanel, RecordCursorPanel).
 */
import { useState, useCallback } from 'react';
import type { ZoomMarker, CursorPresentation, CameraPresentation } from '@rough-cut/project-model';
import { InspectorShell, RECORD_PANEL_WIDTH } from '../../ui/index.js';
import type { InspectorCategory } from '../../ui/index.js';
import { RecordZoomPanel } from './RecordZoomPanel.js';
import { RecordCursorPanel } from './RecordCursorPanel.js';
import { RecordCameraPanel } from './RecordCameraPanel.js';
import { RecordTemplatesPanel } from './RecordTemplatesPanel.js';
import { RecordBackgroundPanel } from './RecordBackgroundPanel.js';
import type { LayoutTemplate } from './templates.js';
import { resolutionForAspectRatio } from './templates.js';
import { projectStore } from '../../hooks/use-stores.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackgroundConfig {
  bgColor: string;
  bgGradient: string | null;
  bgPadding: number;
  bgCornerRadius: number;
  bgShadowEnabled: boolean;
  bgShadowBlur: number;
}

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
  camera: CameraPresentation;
  onCameraChange: (patch: Partial<CameraPresentation>) => void;
  onCameraReset: () => void;
  /** Background/canvas config — lifted to RecordTab so LivePreviewVideo can consume it */
  background: BackgroundConfig;
  onBackgroundChange: (patch: Partial<BackgroundConfig>) => void;
  onBackgroundReset: () => void;
}

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

function ZoomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Magnifying glass with + */}
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9.7" y1="9.7" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Arrow pointer */}
      <path
        d="M3 2L3 12L6 9.5L8.5 14L10 13.2L7.5 8.2L11.5 8L3 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Sparkle / star */}
      <path
        d="M8 2L9 6.5L13.5 8L9 9.5L8 14L7 9.5L2.5 8L7 6.5L8 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function TitleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Text / T icon */}
      <line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="4" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* 2×2 grid of squares */}
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="4" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M11 7l3.5-2v6L11 9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function BackgroundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Rectangle with inner padding lines */}
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1" />
    </svg>
  );
}

// ─── Placeholder panel ────────────────────────────────────────────────────────

function PlaceholderText() {
  return (
    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', userSelect: 'none' }}>
      Coming soon
    </span>
  );
}

// ─── RecordRightPanel ─────────────────────────────────────────────────────────

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
  camera,
  onCameraChange,
  onCameraReset,
  background,
  onBackgroundChange,
  onBackgroundReset,
}: RecordRightPanelProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>('screen-only-16x9');

  const handleSelectTemplate = useCallback((template: LayoutTemplate) => {
    setSelectedTemplateId(template.id);
    const resolution = resolutionForAspectRatio(template.aspectRatio);
    projectStore.getState().updateSettings({ resolution });
  }, []);

  const handleBgColorChange = useCallback((color: string) => {
    onBackgroundChange({ bgColor: color });
    projectStore.getState().updateSettings({ backgroundColor: color });
  }, [onBackgroundChange]);

  const handleBgGradientChange = useCallback((gradient: string | null) => {
    onBackgroundChange({ bgGradient: gradient });
    // TODO: store gradient in project settings when BackgroundConfig supports it
  }, [onBackgroundChange]);

  const categories: InspectorCategory[] = [
    {
      id: 'templates',
      label: 'Templates',
      icon: <TemplatesIcon />,
      panel: (
        <RecordTemplatesPanel
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={handleSelectTemplate}
        />
      ),
    },
    {
      id: 'background',
      label: 'Background',
      icon: <BackgroundIcon />,
      onReset: () => {
        onBackgroundReset();
        projectStore.getState().updateSettings({ backgroundColor: '#000000' });
      },
      panel: (
        <RecordBackgroundPanel
          backgroundColor={background.bgColor}
          onBackgroundColorChange={handleBgColorChange}
          backgroundGradient={background.bgGradient}
          onBackgroundGradientChange={handleBgGradientChange}
          padding={background.bgPadding}
          onPaddingChange={(v) => onBackgroundChange({ bgPadding: v })}
          cornerRadius={background.bgCornerRadius}
          onCornerRadiusChange={(v) => onBackgroundChange({ bgCornerRadius: v })}
          shadowEnabled={background.bgShadowEnabled}
          onShadowEnabledChange={(v) => onBackgroundChange({ bgShadowEnabled: v })}
          shadowBlur={background.bgShadowBlur}
          onShadowBlurChange={(v) => onBackgroundChange({ bgShadowBlur: v })}
        />
      ),
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: <CameraIcon />,
      onReset: onCameraReset,
      panel: <RecordCameraPanel camera={camera} onCameraChange={onCameraChange} />,
    },
    {
      id: 'zoom',
      label: 'Zoom',
      icon: <ZoomIcon />,
      onReset: onResetZoomMarkers,
      panel: (
        <RecordZoomPanel
          durationFrames={durationFrames}
          currentFrame={currentFrame}
          zoomMarkers={zoomMarkers}
          zoomIntensity={zoomIntensity}
          onZoomIntensityChange={onZoomIntensityChange}
          onAddZoomMarker={onAddZoomMarker}
          onSelectZoomMarker={onSelectZoomMarker}
        />
      ),
    },
    {
      id: 'cursor',
      label: 'Cursor',
      icon: <CursorIcon />,
      onReset: onCursorReset,
      panel: (
        <RecordCursorPanel
          cursor={cursor}
          onCursorChange={onCursorChange}
        />
      ),
    },
    {
      id: 'highlights',
      label: 'Highlights',
      icon: <HighlightIcon />,
      panel: <PlaceholderText />,
    },
    {
      id: 'titles',
      label: 'Titles',
      icon: <TitleIcon />,
      panel: <PlaceholderText />,
    },
  ];

  return <InspectorShell width={RECORD_PANEL_WIDTH} categories={categories} />;
}
