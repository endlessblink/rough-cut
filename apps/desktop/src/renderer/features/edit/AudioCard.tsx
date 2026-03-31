import React from 'react';
import type { TrackId } from '@rough-cut/project-model';
import { InspectorCard, RcSlider } from '../../ui/index.js';

interface AudioCardProps {
  trackId: TrackId | null;
  trackVolume: number;
  onSetTrackVolume: (trackId: TrackId, volume: number) => void;
}

export function AudioCard({ trackId, trackVolume, onSetTrackVolume }: AudioCardProps) {
  const handleReset = trackId != null ? () => onSetTrackVolume(trackId, 1) : undefined;

  return (
    <InspectorCard title="Audio" onReset={handleReset}>
      {trackId == null ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', userSelect: 'none' }}>
          Select a clip to see audio controls.
        </div>
      ) : (
        <div>
          <RcSlider
            label="Track Volume"
            value={trackVolume}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onSetTrackVolume(trackId, v)}
          />
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.25)',
              marginTop: 8,
            }}
          >
            Per-clip volume coming soon
          </div>
        </div>
      )}
    </InspectorCard>
  );
}
