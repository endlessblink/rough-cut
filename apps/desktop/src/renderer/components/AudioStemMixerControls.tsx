import type { Asset } from '@rough-cut/project-model';
import {
  DEFAULT_AUDIO_STEM_MIXER,
  getAudioStemMixerSettings,
  getAudioStemPaths,
  type AudioStemChannelSettings,
  type AudioStemKind,
  type AudioStemMixerSettings,
} from '@rough-cut/preview-renderer';

interface AudioStemMixerControlsProps {
  asset: Asset | null;
  onChange: (assetId: string, settings: AudioStemMixerSettings) => void;
  compact?: boolean;
}

const STEM_LABELS: Record<AudioStemKind, string> = {
  mic: 'Mic',
  system: 'System',
};

export function AudioStemMixerControls({
  asset,
  onChange,
  compact = false,
}: AudioStemMixerControlsProps) {
  const stems = asset ? getAudioStemPaths(asset) : null;
  if (!asset || !stems) return null;

  const settings = getAudioStemMixerSettings(asset);
  const update = (patch: Partial<AudioStemMixerSettings>) => {
    onChange(asset.id, {
      ...settings,
      ...patch,
      mic: patch.mic ?? settings.mic,
      system: patch.system ?? settings.system,
    });
  };
  const updateChannel = (stem: AudioStemKind, patch: Partial<AudioStemChannelSettings>) => {
    update({ [stem]: { ...settings[stem], ...patch } } as Partial<AudioStemMixerSettings>);
  };

  const rows: Array<{ stem: AudioStemKind; available: boolean }> = [
    { stem: 'mic', available: Boolean(stems.micFilePath) },
    { stem: 'system', available: Boolean(stems.systemAudioFilePath) },
  ];

  return (
    <div data-testid="audio-stem-mixer" style={{ display: 'grid', gap: compact ? 6 : 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}>
          Stem mixer
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            color: settings.duckingEnabled ? '#9be7ff' : 'rgba(255,255,255,0.45)',
          }}
        >
          <input
            data-testid="audio-stem-ducking"
            type="checkbox"
            checked={settings.duckingEnabled}
            onChange={(event) => update({ duckingEnabled: event.target.checked })}
          />
          Duck system under mic
        </label>
      </div>

      {rows.map(({ stem, available }) => {
        const channel = settings[stem];
        return (
          <div
            key={stem}
            data-testid={`audio-stem-row-${stem}`}
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '44px 1fr auto auto' : '58px 1fr auto auto',
              alignItems: 'center',
              gap: 6,
              opacity: available ? 1 : 0.42,
            }}
          >
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.58)' }}>
              {STEM_LABELS[stem]}
            </span>
            <input
              data-testid={`audio-stem-volume-${stem}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={channel.volume}
              disabled={!available}
              onChange={(event) => updateChannel(stem, { volume: Number(event.target.value) })}
              style={{ width: '100%', accentColor: stem === 'mic' ? '#9be7ff' : '#ffb199' }}
            />
            <StemButton
              testId={`audio-stem-mute-${stem}`}
              active={channel.muted}
              disabled={!available}
              label="M"
              title={`${channel.muted ? 'Unmute' : 'Mute'} ${STEM_LABELS[stem]}`}
              onClick={() => updateChannel(stem, { muted: !channel.muted })}
            />
            <StemButton
              testId={`audio-stem-solo-${stem}`}
              active={channel.solo}
              disabled={!available}
              label="S"
              title={`${channel.solo ? 'Unsolo' : 'Solo'} ${STEM_LABELS[stem]}`}
              onClick={() => updateChannel(stem, { solo: !channel.solo })}
            />
          </div>
        );
      })}

      <button
        data-testid="audio-stem-reset"
        type="button"
        onClick={() => onChange(asset.id, DEFAULT_AUDIO_STEM_MIXER)}
        style={{
          justifySelf: 'start',
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.42)',
          fontSize: 10,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        Reset mixer
      </button>
    </div>
  );
}

function StemButton({
  testId,
  active,
  disabled,
  label,
  title,
  onClick,
}: {
  testId: string;
  active: boolean;
  disabled: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={testId}
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 4,
        background: active ? 'rgba(90,200,250,0.24)' : 'rgba(255,255,255,0.08)',
        color: active ? '#9be7ff' : 'rgba(255,255,255,0.68)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 10,
        lineHeight: 1,
        padding: '4px 5px',
      }}
    >
      {label}
    </button>
  );
}
