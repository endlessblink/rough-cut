/**
 * RecordRightPanel: Presentation controls for the Record view.
 * Zoom presets, highlight keyframes, cursor styling, title overlays.
 * No structural editing — this is the presentation inspector.
 *
 * Delegates layout to InspectorShell; each category panel lives in
 * its own component (RecordZoomPanel, RecordCursorPanel).
 */
import type { ZoomMarker, CursorPresentation } from '@rough-cut/project-model';
import { InspectorShell, RECORD_PANEL_WIDTH } from '../../ui/index.js';
import type { InspectorCategory } from '../../ui/index.js';
import { RecordZoomPanel } from './RecordZoomPanel.js';
import { RecordCursorPanel } from './RecordCursorPanel.js';

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
}: RecordRightPanelProps) {
  const categories: InspectorCategory[] = [
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
