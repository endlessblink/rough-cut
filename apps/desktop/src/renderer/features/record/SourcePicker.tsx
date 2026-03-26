import type { CaptureSource } from '../../env.js';

interface SourcePickerProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  onSelect: (id: string) => void;
}

export function SourcePicker({ sources, selectedSourceId, onSelect }: SourcePickerProps) {
  if (sources.length === 0) {
    return <div style={{ color: '#888', padding: 8 }}>No sources available</div>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8 }}>
      {sources.map((source) => (
        <div
          key={source.id}
          onClick={() => onSelect(source.id)}
          style={{
            border: `2px solid ${selectedSourceId === source.id ? '#2563eb' : '#333'}`,
            borderRadius: 6,
            padding: 6,
            cursor: 'pointer',
            background: selectedSourceId === source.id ? '#1e3a5f' : '#1a1a1a',
            width: 160,
          }}
        >
          <img
            src={source.thumbnailDataUrl}
            alt={source.name}
            style={{ width: '100%', borderRadius: 3, display: 'block' }}
          />
          <div
            style={{
              fontSize: 11,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {source.name}
          </div>
          <div style={{ fontSize: 10, color: '#888' }}>{source.type}</div>
        </div>
      ))}
    </div>
  );
}
