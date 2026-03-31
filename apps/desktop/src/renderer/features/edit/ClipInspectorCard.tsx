import React, { useState } from 'react';
import type { Clip, ClipId, ClipTransform } from '@rough-cut/project-model';
import { InspectorCard, ControlLabel, RcToggleButton, RcSlider } from '../../ui/index.js';

interface ClipInspectorCardProps {
  clip: Clip | null;
  fps: number;
  onUpdateClip: (clipId: ClipId, patch: { name?: string; enabled?: boolean }) => void;
  onUpdateTransform?: (clipId: ClipId, patch: Partial<ClipTransform>) => void;
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

const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};

export function ClipInspectorCard({ clip, fps, onUpdateClip, onUpdateTransform }: ClipInspectorCardProps) {
  const [lockAspect, setLockAspect] = useState(true);

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
    <InspectorCard
      title="Clip"
      flex={1}
      minHeight={80}
      onReset={onUpdateTransform ? () => onUpdateTransform(clip.id, { ...DEFAULT_TRANSFORM }) : undefined}
    >
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

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

        {/* Transform */}
        <RcSlider label="Position X" value={clip.transform.x} min={-1920} max={1920} step={1} onChange={(v) => onUpdateTransform?.(clip.id, { x: v })} />
        <RcSlider label="Position Y" value={clip.transform.y} min={-1080} max={1080} step={1} onChange={(v) => onUpdateTransform?.(clip.id, { y: v })} />
        <RcSlider label="Scale X" value={clip.transform.scaleX} min={0} max={4} step={0.01} onChange={(v) => {
          const patch: Partial<ClipTransform> = { scaleX: v };
          if (lockAspect) patch.scaleY = v;
          onUpdateTransform?.(clip.id, patch);
        }} />
        {/* Lock aspect toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setLockAspect(!lockAspect)}
            title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            style={{
              fontSize: 11,
              color: lockAspect ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.35)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              userSelect: 'none',
            }}
          >
            {lockAspect ? '\u2194 Linked' : 'Independent'}
          </button>
        </div>
        <RcSlider label="Scale Y" value={clip.transform.scaleY} min={0} max={4} step={0.01} onChange={(v) => {
          const patch: Partial<ClipTransform> = { scaleY: v };
          if (lockAspect) patch.scaleX = v;
          onUpdateTransform?.(clip.id, patch);
        }} />
        <RcSlider label="Rotation" value={clip.transform.rotation} min={-360} max={360} step={1} onChange={(v) => onUpdateTransform?.(clip.id, { rotation: v })} />
        <RcSlider label="Opacity" value={clip.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => onUpdateTransform?.(clip.id, { opacity: v })} />
      </div>
    </InspectorCard>
  );
}
