import { useState, useCallback, useEffect } from 'react';
import { useProjectStore, useTransportStore, projectStore, transportStore } from '../../hooks/use-stores.js';
import { AssetListPanel } from './AssetListPanel.js';
import { TimelineStrip } from './TimelineStrip.js';
import { EditToolbar } from './EditToolbar.js';

export function EditTab() {
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(3);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Undo/redo availability
  const canUndo = useProjectStore(() => projectStore.temporal.getState().pastStates.length > 0);
  const canRedo = useProjectStore(() => projectStore.temporal.getState().futureStates.length > 0);

  // Find which track contains the selected clip
  const findTrackForClip = useCallback(
    (clipId: string) => {
      for (const track of tracks) {
        if (track.clips.some((c) => c.id === clipId)) {
          return track;
        }
      }
      return null;
    },
    [tracks],
  );

  // Check if split is valid: selected clip exists and playhead is inside it
  const selectedClipTrack = selectedClipId ? findTrackForClip(selectedClipId) : null;
  const selectedClip = selectedClipTrack?.clips.find((c) => c.id === selectedClipId) ?? null;
  const canSplit =
    selectedClip !== null &&
    playheadFrame > selectedClip.timelineIn &&
    playheadFrame < selectedClip.timelineOut;
  const canDelete = selectedClipId !== null && selectedClipTrack !== null;

  const handleSelectClip = useCallback((clipId: string) => {
    setSelectedClipId((prev) => (prev === clipId ? null : clipId));
  }, []);

  const handleScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  const handleSplit = useCallback(() => {
    if (!selectedClipId || !selectedClipTrack) return;
    projectStore.getState().splitClipAtFrame(selectedClipTrack.id, selectedClipId as import('@rough-cut/project-model').ClipId, playheadFrame);
    setSelectedClipId(null);
  }, [selectedClipId, selectedClipTrack, playheadFrame]);

  const handleDelete = useCallback(() => {
    if (!selectedClipId || !selectedClipTrack) return;
    projectStore.getState().deleteClip(selectedClipTrack.id, selectedClipId as import('@rough-cut/project-model').ClipId);
    setSelectedClipId(null);
  }, [selectedClipId, selectedClipTrack]);

  const handleUndo = useCallback(() => {
    projectStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    projectStore.temporal.getState().redo();
  }, []);

  const handleTrimLeft = useCallback(
    (clipId: string, newTimelineIn: number) => {
      const track = findTrackForClip(clipId);
      if (!track) return;
      projectStore.getState().trimClipLeftEdge(track.id, clipId as import('@rough-cut/project-model').ClipId, newTimelineIn);
    },
    [findTrackForClip],
  );

  const handleTrimRight = useCallback(
    (clipId: string, newTimelineOut: number) => {
      const track = findTrackForClip(clipId);
      if (!track) return;
      projectStore.getState().trimClipRightEdge(track.id, clipId as import('@rough-cut/project-model').ClipId, newTimelineOut);
    },
    [findTrackForClip],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if focused on an input element
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const isMeta = e.metaKey || e.ctrlKey;

      switch (e.key) {
        case 's':
        case 'S':
          if (!isMeta) {
            e.preventDefault();
            handleSplit();
          }
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          handleDelete();
          break;
        case 'z':
        case 'Z':
          if (isMeta && e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else if (isMeta) {
            e.preventDefault();
            handleUndo();
          }
          break;
        case '=':
        case '+':
          e.preventDefault();
          setPixelsPerFrame((prev) => Math.min(10, prev + 1));
          break;
        case '-':
          e.preventDefault();
          setPixelsPerFrame((prev) => Math.max(1, prev - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          transportStore.getState().stepBackward(1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          transportStore.getState().stepForward(1);
          break;
        case ' ':
          e.preventDefault();
          transportStore.getState().togglePlay();
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSplit, handleDelete, handleUndo, handleRedo]);

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

      {/* Toolbar */}
      <EditToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        canSplit={canSplit}
        canDelete={canDelete}
        snapEnabled={snapEnabled}
        pixelsPerFrame={pixelsPerFrame}
        playheadFrame={playheadFrame}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSplit={handleSplit}
        onDelete={handleDelete}
        onToggleSnap={() => setSnapEnabled((prev) => !prev)}
        onZoomChange={setPixelsPerFrame}
      />

      {/* Bottom: Timeline strip */}
      <TimelineStrip
        tracks={tracks}
        assets={assets}
        playheadFrame={playheadFrame}
        selectedClipId={selectedClipId}
        pixelsPerFrame={pixelsPerFrame}
        snapEnabled={snapEnabled}
        onSelectClip={handleSelectClip}
        onScrub={handleScrub}
        onTrimLeft={handleTrimLeft}
        onTrimRight={handleTrimRight}
      />
    </div>
  );
}
