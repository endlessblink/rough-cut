import React from 'react';
import type { Clip, ClipId } from '@rough-cut/project-model';
import { InspectorCard, ControlLabel, RcToggleButton } from '../../ui/index.js';

interface ClipInspectorCardProps {
  clip: Clip | null;
  fps: number;
  onUpdateClip: (clipId: ClipId, patch: { name?: string; enabled?: boolean }) => void;
}

function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const remainderFrames = frame % fps;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}+${String(remainderFrames).padStart(2, '0')}`;
}

function formatDuration(frames: number, fps: number): string {
  const seconds = frames / fps;
  return `${seconds.toFixed(2)}s`;
}

export function ClipInspectorCard({ clip, fps, onUpdateClip }: ClipInspectorCardProps) {
  if (!clip) {
    return (
      <InspectorCard title="Clip" flex={1} minHeight={80}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', userSelect: 'none' }}>
          Select a clip on the timeline to edit its properties.
        </div>
      </InspectorCard>
    );
  }

  const durationFrames = clip.timelineOut - clip.timelineIn;

  return (
    <InspectorCard title="Clip" flex={1} minHeight={80}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Name */}
        <div>
          <ControlLabel label="Name" />
          <input
            type="text"
            value={clip.name ?? ''}
            placeholder="Untitled clip"
            onChange={(e) =>
              onUpdateClip(clip.id, { name: e.target.value || undefined })
            }
            style={{
              width: '100%',
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.70)',
              padding: '0 8px',
              fontSize: 11,
              color: 'rgba(255,255,255,0.92)',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Timing — read-only display */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <ControlLabel label="In" value={formatTimecode(clip.timelineIn, fps)} />
          </div>
          <div style={{ flex: 1 }}>
            <ControlLabel label="Out" value={formatTimecode(clip.timelineOut, fps)} />
          </div>
          <div style={{ flex: 1 }}>
            <ControlLabel label="Duration" value={formatDuration(durationFrames, fps)} />
          </div>
        </div>

        {/* Visibility toggle */}
        <RcToggleButton
          label="Visible"
          value={clip.enabled}
          onChange={(v) => onUpdateClip(clip.id, { enabled: v })}
        />
      </div>
    </InspectorCard>
  );
}
