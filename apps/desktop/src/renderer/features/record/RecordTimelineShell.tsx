/**
 * RecordTimelineShell: Presentation-only timeline for the Record view.
 * Uses the shared TimelineStrip in read-only mode (no trim, no selection, no snap).
 */
import type { Track, Asset } from '@rough-cut/project-model';
import { TimelineStrip } from '../edit/TimelineStrip.js';

interface RecordTimelineShellProps {
  tracks: readonly Track[];
  assets: readonly Asset[];
  durationFrames: number;
  currentFrame: number;
  fps: number;
  onScrub: (frame: number) => void;
}

const READ_ONLY_INTERACTION = {
  canTrim: false,
  canSelect: false,
  canSnap: false,
} as const;

export function RecordTimelineShell({
  tracks,
  assets,
  durationFrames,
  currentFrame,
  fps,
  onScrub,
}: RecordTimelineShellProps) {
  return (
    <div
      style={{
        width: '100%',
        flex: 1,
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'rgba(8,8,8,0.96)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'rgba(0,0,0,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.72)',
            userSelect: 'none',
          }}
        >
          Timeline
        </span>
        <div style={{ display: 'flex', gap: 8 }} />
      </div>

      {/* Body: shared TimelineStrip in read-only mode */}
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <TimelineStrip
          tracks={tracks}
          assets={assets}
          playheadFrame={currentFrame}
          pixelsPerFrame={3}
          interaction={READ_ONLY_INTERACTION}
          onScrub={onScrub}
        />
      </div>
    </div>
  );
}
