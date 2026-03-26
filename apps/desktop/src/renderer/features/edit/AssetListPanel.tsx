import { useState, useCallback } from 'react';
import type { AssetId } from '@rough-cut/project-model';
import { framesToTimecode } from '@rough-cut/project-model';
import { createClip } from '@rough-cut/project-model';
import { getTrackEndFrame } from '@rough-cut/timeline-engine';
import { useProjectStore, projectStore } from '../../hooks/use-stores.js';

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  recording: { label: 'REC', color: '#ef4444' },
  video: { label: 'VID', color: '#2563eb' },
  audio: { label: 'AUD', color: '#16a34a' },
  image: { label: 'IMG', color: '#a855f7' },
};

function extractFilename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

export function AssetListPanel() {
  const assets = useProjectStore((s) => s.project.assets);
  const frameRate = useProjectStore((s) => s.project.settings.frameRate);
  const [selectedAssetId, setSelectedAssetId] = useState<AssetId | null>(null);

  const handleAddAsClip = useCallback(() => {
    if (!selectedAssetId) return;

    const state = projectStore.getState();
    const project = state.project;
    const asset = project.assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;

    // Find first matching track type
    const targetType = asset.type === 'audio' ? 'audio' : 'video';
    const targetTrack = project.composition.tracks.find(
      (t) => t.type === targetType,
    );
    if (!targetTrack) return;

    // Place at end of existing content
    const endFrame = getTrackEndFrame(targetTrack);

    const clip = createClip(asset.id, targetTrack.id, {
      timelineIn: endFrame,
      timelineOut: endFrame + asset.duration,
      sourceIn: 0,
      sourceOut: asset.duration,
    });

    state.addClip(targetTrack.id, clip);

    // Update composition duration if needed
    const newDuration = Math.max(
      project.composition.duration,
      endFrame + asset.duration,
    );
    if (newDuration > project.composition.duration) {
      state.updateProject((p) => ({
        ...p,
        composition: {
          ...p.composition,
          duration: newDuration,
        },
      }));
    }
  }, [selectedAssetId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#151515',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: '#aaa',
          borderBottom: '1px solid #333',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Assets ({assets.length})
      </div>

      {/* Asset list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {assets.length === 0 && (
          <div
            style={{
              padding: '24px 12px',
              color: '#555',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            No assets yet. Record or import media to get started.
          </div>
        )}
        {assets.map((asset) => {
          const isSelected = asset.id === selectedAssetId;
          const badge = TYPE_BADGES[asset.type] ?? {
            label: '?',
            color: '#555',
          };
          return (
            <div
              key={asset.id}
              onClick={() => setSelectedAssetId(asset.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                background: isSelected
                  ? 'rgba(37, 99, 235, 0.15)'
                  : 'transparent',
                borderLeft: isSelected
                  ? '2px solid #2563eb'
                  : '2px solid transparent',
              }}
            >
              {/* Type badge */}
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  background: badge.color,
                  padding: '1px 4px',
                  borderRadius: 2,
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                {badge.label}
              </span>

              {/* Name + duration */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: isSelected ? '#fff' : '#ccc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {extractFilename(asset.filePath)}
                </div>
                <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>
                  {framesToTimecode(asset.duration, frameRate)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add-as-clip button */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #333',
        }}
      >
        <button
          onClick={handleAddAsClip}
          disabled={!selectedAssetId}
          style={{
            width: '100%',
            padding: '6px 0',
            background: selectedAssetId ? '#2563eb' : '#333',
            color: selectedAssetId ? '#fff' : '#666',
            border: 'none',
            borderRadius: 4,
            cursor: selectedAssetId ? 'pointer' : 'default',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          + Add as Clip
        </button>
      </div>
    </div>
  );
}
