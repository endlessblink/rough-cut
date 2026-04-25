import type { Asset, TrackId } from '@rough-cut/project-model';
import type { AudioStemMixerSettings } from '@rough-cut/preview-renderer';
import { InspectorCard, RcSlider } from '../../ui/index.js';
import { AudioStemMixerControls } from '../../components/AudioStemMixerControls.js';

interface AudioCardProps {
  trackId: TrackId | null;
  selectedAsset: Asset | null;
  trackVolume: number;
  onSetTrackVolume: (trackId: TrackId, volume: number) => void;
  onSetStemMixer: (assetId: string, settings: AudioStemMixerSettings) => void;
}

export function AudioCard({
  trackId,
  selectedAsset,
  trackVolume,
  onSetTrackVolume,
  onSetStemMixer,
}: AudioCardProps) {
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
          <div style={{ marginTop: 12 }}>
            <AudioStemMixerControls asset={selectedAsset} onChange={onSetStemMixer} compact />
          </div>
        </div>
      )}
    </InspectorCard>
  );
}
