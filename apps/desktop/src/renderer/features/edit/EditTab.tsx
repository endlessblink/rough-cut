import { useState, useCallback } from 'react';
import { useProjectStore, useTransportStore, transportStore } from '../../hooks/use-stores.js';
import { AssetListPanel } from './AssetListPanel.js';
import { TimelineStrip } from './TimelineStrip.js';

export function EditTab() {
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const handleSelectClip = useCallback((clipId: string) => {
    setSelectedClipId((prev) => (prev === clipId ? null : clipId));
  }, []);

  const handleScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Top region: asset list + preview placeholder + inspector stub */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: Asset list */}
        <div
          style={{
            width: 240,
            minWidth: 200,
            borderRight: '1px solid #333',
            overflow: 'hidden',
          }}
        >
          <AssetListPanel />
        </div>

        {/* Center: preview message area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0d0d0d',
            color: '#555',
            fontSize: 13,
            userSelect: 'none',
          }}
        >
          Preview active above
        </div>

        {/* Right: inspector stub */}
        <div
          style={{
            width: 200,
            minWidth: 160,
            borderLeft: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#444',
            fontSize: 12,
            background: '#151515',
            userSelect: 'none',
          }}
        >
          {selectedClipId ? (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ color: '#888', marginBottom: 4, fontWeight: 600 }}>Inspector</div>
              <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {selectedClipId}
              </div>
            </div>
          ) : (
            <span>Select a clip to inspect</span>
          )}
        </div>
      </div>

      {/* Bottom: Timeline strip */}
      <TimelineStrip
        tracks={tracks}
        assets={assets}
        playheadFrame={playheadFrame}
        selectedClipId={selectedClipId}
        onSelectClip={handleSelectClip}
        onScrub={handleScrub}
      />
    </div>
  );
}
