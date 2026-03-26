import { useEffect, useCallback } from 'react';
import type { RecordingResult } from '../../env.js';
import { useRecordState } from './record-state.js';
import { SourcePicker } from './SourcePicker.js';
import { RecordControls } from './RecordControls.js';

interface RecordTabProps {
  onAssetCreated: (result: RecordingResult) => void;
}

export function RecordTab({ onAssetCreated }: RecordTabProps) {
  const {
    state,
    setSources,
    selectSource,
    setStatus,
    setError,
    setElapsedMs,
    reset,
  } = useRecordState();

  const { sources, selectedSourceId, status, error, elapsedMs } = state;

  const loadSources = useCallback(async () => {
    setStatus('loading-sources');
    try {
      const result = await window.roughcut.recordingGetSources();
      setSources(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setSources, setStatus, setError]);

  // Load sources on mount
  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #333' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Record</h2>
          <button
            onClick={loadSources}
            style={{
              ...smallBtnStyle,
              opacity: status === 'loading-sources' ? 0.5 : 1,
            }}
            disabled={status === 'loading-sources' || status === 'recording'}
          >
            Refresh Sources
          </button>
        </div>
        {status === 'loading-sources' && (
          <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
            Loading capture sources...
          </div>
        )}
      </div>

      {/* Source picker */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SourcePicker
          sources={sources}
          selectedSourceId={selectedSourceId}
          onSelect={selectSource}
        />
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: '#3b1111',
            color: '#fca5a5',
            fontSize: 13,
            borderTop: '1px solid #7f1d1d',
          }}
        >
          {error}
          <button
            onClick={reset}
            style={{
              marginLeft: 12,
              background: 'none',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Record controls */}
      <div style={{ borderTop: '1px solid #333', background: '#1a1a1a' }}>
        <RecordControls
          selectedSourceId={selectedSourceId}
          status={status}
          elapsedMs={elapsedMs}
          setStatus={setStatus}
          setError={setError}
          setElapsedMs={setElapsedMs}
          onAssetCreated={onAssetCreated}
        />
      </div>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  background: '#333',
  color: '#ccc',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
};
