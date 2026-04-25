import { useEffect, useState } from 'react';
import { framesToTimecode } from '@rough-cut/project-model';
import type { RecordingVisibility } from '@rough-cut/project-model';
import { RcToggleButton } from '../../ui/index.js';

interface RecordSegmentVisibilityPanelProps {
  fps: number;
  playheadFrame: number;
  visibility: RecordingVisibility;
  segmentCount: number;
  activeSegmentFrame?: number | null;
  onApply: (visibility: RecordingVisibility) => void;
  onDeleteActive?: () => void;
}

export function RecordSegmentVisibilityPanel({
  fps,
  playheadFrame,
  visibility,
  segmentCount,
  activeSegmentFrame = null,
  onApply,
  onDeleteActive,
}: RecordSegmentVisibilityPanelProps) {
  const [draft, setDraft] = useState(visibility);

  useEffect(() => {
    setDraft(visibility);
  }, [visibility]);

  const activeLabel =
    activeSegmentFrame === null
      ? 'Base defaults'
      : `Segment at ${framesToTimecode(activeSegmentFrame, fps)}`;
  const applyLabel = activeSegmentFrame === playheadFrame ? 'Update this frame' : 'Apply at playhead';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.62)' }}>
        Save camera, cursor, clicks, and overlay visibility from the current playhead frame forward.
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 11,
          color: 'rgba(255,255,255,0.72)',
        }}
      >
        <span>{activeLabel}</span>
        <span>{segmentCount} saved</span>
      </div>

      <RcToggleButton
        label="Camera"
        value={draft.cameraVisible}
        onChange={(cameraVisible) => setDraft((current) => ({ ...current, cameraVisible }))}
      />
      <RcToggleButton
        label="Cursor"
        value={draft.cursorVisible}
        onChange={(cursorVisible) => setDraft((current) => ({ ...current, cursorVisible }))}
      />
      <RcToggleButton
        label="Clicks"
        value={draft.clicksVisible}
        onChange={(clicksVisible) => setDraft((current) => ({ ...current, clicksVisible }))}
      />
      <RcToggleButton
        label="Overlays"
        value={draft.overlaysVisible}
        onChange={(overlaysVisible) => setDraft((current) => ({ ...current, overlaysVisible }))}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-testid="record-visibility-apply"
          onClick={() => onApply(draft)}
          style={{
            flex: 1,
            height: 28,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.92)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {applyLabel}
        </button>
        <button
          data-testid="record-visibility-delete"
          onClick={() => onDeleteActive?.()}
          disabled={activeSegmentFrame === null}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.08)',
            background: activeSegmentFrame === null ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
            color:
              activeSegmentFrame === null ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.74)',
            fontSize: 11,
            cursor: activeSegmentFrame === null ? 'default' : 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
