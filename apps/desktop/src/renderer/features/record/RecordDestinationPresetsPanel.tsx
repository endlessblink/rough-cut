import {
  DESTINATION_PRESETS,
  type DestinationPresetId,
} from './destination-presets.js';

export interface RecordDestinationPresetsPanelProps {
  selectedPresetId: DestinationPresetId | null;
  onSelectPreset: (presetId: DestinationPresetId) => void;
}

export function RecordDestinationPresetsPanel({
  selectedPresetId,
  onSelectPreset,
}: RecordDestinationPresetsPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.30)',
          padding: '2px 2px 4px',
          userSelect: 'none',
        }}
      >
        Destinations
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        {DESTINATION_PRESETS.map((preset) => {
          const selected = preset.id === selectedPresetId;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`record-destination-preset-${preset.id}`}
              onClick={() => onSelectPreset(preset.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                borderRadius: 8,
                border: selected
                  ? '1px solid rgba(255,107,90,0.65)'
                  : '1px solid rgba(255,255,255,0.08)',
                background: selected ? 'rgba(255,107,90,0.08)' : 'rgba(255,255,255,0.03)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: selected ? 'rgba(255,107,90,0.95)' : 'rgba(255,255,255,0.88)',
                }}
              >
                {preset.label}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)', lineHeight: 1.35 }}>
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
