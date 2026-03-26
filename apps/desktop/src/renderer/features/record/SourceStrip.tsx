import type { CaptureSource } from '../../env.js';

interface SourceStripProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function SourceStrip({
  sources,
  selectedSourceId,
  onSelect,
  onRefresh,
  isLoading = false,
}: SourceStripProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 20,
        padding: '0 32px',
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 20,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#484848',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Sources
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            style={{
              padding: '2px 8px',
              background: 'transparent',
              border: '1px solid #2e2e2e',
              borderRadius: 4,
              color: '#555',
              fontSize: 11,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.4 : 1,
            }}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Thumbnail row */}
      <div
        style={{
          height: 80,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 2,
          /* Hide scrollbar on webkit */
          scrollbarWidth: 'none',
        }}
      >
        {sources.length === 0 && !isLoading && (
          <span style={{ fontSize: 12, color: '#3a3a3a', paddingLeft: 2 }}>
            No sources available
          </span>
        )}
        {isLoading && (
          <span style={{ fontSize: 12, color: '#3a3a3a', paddingLeft: 2 }}>
            Loading sources…
          </span>
        )}
        {sources.map((source) => {
          const isSelected = source.id === selectedSourceId;
          return (
            <div
              key={source.id}
              onClick={() => onSelect(source.id)}
              title={source.name}
              style={{
                flexShrink: 0,
                width: 120,
                height: 78,
                border: `2px solid ${isSelected ? '#dc2626' : '#262626'}`,
                borderRadius: 6,
                background: isSelected ? '#1a0d0d' : '#141414',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'border-color 0.1s ease',
              }}
            >
              {/* Thumbnail image */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <img
                  src={source.thumbnailDataUrl}
                  alt={source.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
              {/* Source name */}
              <div
                style={{
                  padding: '3px 5px',
                  fontSize: 10,
                  color: isSelected ? '#e8e8e8' : '#555',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  background: isSelected ? '#1a0d0d' : '#111',
                  flexShrink: 0,
                }}
              >
                {source.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
