/**
 * EditTab: Structural timeline.
 * Responsible for: clip/track operations (add, remove, cut, split, trim, reorder,
 * move between tracks, manage A/V channels). Can also adjust presentation events
 * created in the Record view.
 */
import { useState, useCallback, useEffect } from 'react';
import type { ClipId } from '@rough-cut/project-model';
import { useProjectStore, useTransportStore, projectStore, transportStore } from '../../hooks/use-stores.js';
import { usePlaybackLoop } from '../../hooks/use-playback-loop.js';
import { TimelineStrip } from './TimelineStrip.js';
import { EditScreenLayout } from './EditScreenLayout.js';
import { EditPreviewStage } from './EditPreviewStage.js';
import { EditRightPanel } from './EditRightPanel.js';
import { EditTimelineShell } from './EditTimelineShell.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
// VerticalWorkspaceSplit no longer needed — timeline is a full-width sibling
import { useUiStore, uiStore } from '../../hooks/use-ui-store.js';
import { RecordingPlaybackVideo } from '../record/RecordingPlaybackVideo.js';

interface EditTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

export function EditTab({ activeTab, onTabChange }: EditTabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(3);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Active recording asset — same logic as RecordTab
  const activeRecordingAsset = useProjectStore((s) => {
    const preferred = s.activeAssetId
      ? s.project.assets.find((a) => a.id === s.activeAssetId)
      : null;
    return preferred ?? s.project.assets.find((a) => a.type === 'recording') ?? null;
  });

  // Undo/redo availability
  const canUndo = useProjectStore(() => projectStore.temporal.getState().pastStates.length > 0);
  const canRedo = useProjectStore(() => projectStore.temporal.getState().futureStates.length > 0);

  // UI state
  const isRightSidebarCollapsed = useUiStore((s) => s.isRightSidebarCollapsed);

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

  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  usePlaybackLoop(projectFps, durationFrames);

  const handleUpdateClipField = useCallback(
    (clipId: ClipId, patch: { name?: string; enabled?: boolean }) => {
      projectStore.getState().updateClipField(clipId, patch);
    },
    [],
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
    <EditScreenLayout>
      <AppHeader activeTab={activeTab} onTabChange={onTabChange} projectName={projectName} captureSummary={captureSummary} />

      {/* Preview + Sidebar row */}
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: isRightSidebarCollapsed ? 0 : 16,
          padding: '12px 24px 8px',
          minHeight: 0,
          width: '100%',
          boxSizing: 'border-box' as const,
          background: 'linear-gradient(to bottom, #111111, #050505)',
        }}
      >
        {/* Preview — fills remaining space */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <EditPreviewStage>
            <div style={{
              position: 'relative',
              aspectRatio: '16 / 9',
              width: '100%',
              borderRadius: 18,
              background: '#050505',
              boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
              overflow: 'hidden',
            }}>
              {activeRecordingAsset?.filePath ? (
                <RecordingPlaybackVideo
                  filePath={activeRecordingAsset.filePath}
                  fps={projectFps}
                  assetId={activeRecordingAsset.id}
                />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No recording</span>
                </div>
              )}
            </div>
          </EditPreviewStage>
        </div>

        {/* Sidebar toggle + panel */}
        <div style={{ display: 'flex', flexDirection: 'row', flexShrink: 0 }}>
          {/* Toggle handle */}
          <button
            onClick={() => uiStore.getState().toggleRightSidebar()}
            style={{
              width: 12,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', userSelect: 'none' }}>
              {isRightSidebarCollapsed ? '◀' : '▶'}
            </span>
          </button>

          {!isRightSidebarCollapsed && (
            <EditRightPanel
              selectedClip={selectedClip}
              fps={projectFps}
              onUpdateClip={handleUpdateClipField}
            />
          )}
        </div>
      </div>

      {/* Timeline — full width, below the sidebar row */}
      <div style={{ flex: '1 1 0%', minHeight: 120, padding: '0 24px 8px', background: '#050505', display: 'flex', flexDirection: 'column' }}>
        <EditTimelineShell
          canUndo={canUndo}
          canRedo={canRedo}
          canSplit={canSplit}
          canDelete={canDelete}
          snapEnabled={snapEnabled}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSplit={handleSplit}
          onDelete={handleDelete}
          onToggleSnap={() => setSnapEnabled((prev) => !prev)}
          pixelsPerFrame={pixelsPerFrame}
          onZoomChange={setPixelsPerFrame}
          playheadFrame={playheadFrame}
        >
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
        </EditTimelineShell>
      </div>
    </EditScreenLayout>
  );
}
