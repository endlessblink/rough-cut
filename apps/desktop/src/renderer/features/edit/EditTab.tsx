/**
 * EditTab: Structural timeline.
 * Responsible for: clip/track operations (add, remove, cut, split, trim, reorder,
 * move between tracks, manage A/V channels). Can also adjust presentation events
 * created in the Record view.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  createDefaultCameraPresentation,
  type ClipId,
  type TrackId,
  type ClipTransform,
  type EffectInstance,
  type AIAnnotationId,
} from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import {
  useProjectStore,
  useTransportStore,
  projectStore,
  transportStore,
} from '../../hooks/use-stores.js';
import { useCompositor } from '../../hooks/use-compositor.js';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { TimelineStrip } from './TimelineStrip.js';
import { EditScreenLayout } from './EditScreenLayout.js';
import { EditPreviewStage } from './EditPreviewStage.js';
import { EditCameraOverlay } from './EditCameraOverlay.js';
import { EditRightPanel } from './EditRightPanel.js';
import { EditTimelineShell } from './EditTimelineShell.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
// VerticalWorkspaceSplit no longer needed — timeline is a full-width sibling
import { useUiStore, uiStore } from '../../hooks/use-ui-store.js';

interface EditTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

export function EditTab({ activeTab, onTabChange }: EditTabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);
  const selectedClipIds = useTransportStore((s) => s.selectedClipIds);
  const selectedClipId = selectedClipIds[0] ?? null;
  const [pixelsPerFrame, setPixelsPerFrame] = useState(3);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [soloTrackIds, setSoloTrackIds] = useState<Set<string>>(() => new Set());

  // PixiJS compositor — renders clips with transforms and effects
  const { previewRef } = useCompositor();

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
    const current = transportStore.getState().selectedClipIds;
    if (current.length === 1 && current[0] === clipId) {
      transportStore.getState().clearSelection();
    } else {
      transportStore.getState().setSelectedClipIds([clipId]);
    }
  }, []);

  const handleSelectRange = useCallback((clipIds: readonly string[], mode: 'replace' | 'add') => {
    if (mode === 'add') {
      transportStore.getState().addToSelection(clipIds);
    } else {
      transportStore.getState().setSelectedClipIds(clipIds);
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    transportStore.getState().clearSelection();
  }, []);

  const handleScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  const handleSplit = useCallback(() => {
    if (!selectedClipId || !selectedClipTrack) return;
    projectStore
      .getState()
      .splitClipAtFrame(
        selectedClipTrack.id,
        selectedClipId as import('@rough-cut/project-model').ClipId,
        playheadFrame,
      );
    transportStore.getState().clearSelection();
  }, [selectedClipId, selectedClipTrack, playheadFrame]);

  const handleDelete = useCallback(() => {
    const ids = transportStore.getState().selectedClipIds;
    if (ids.length === 0) return;
    for (const clipId of ids) {
      const track = findTrackForClip(clipId);
      if (track) {
        projectStore
          .getState()
          .deleteClip(track.id, clipId as import('@rough-cut/project-model').ClipId);
      }
    }
    transportStore.getState().clearSelection();
  }, [findTrackForClip]);

  const handleUpdateTransform = useCallback((clipId: ClipId, patch: Partial<ClipTransform>) => {
    projectStore.getState().updateClipTransform(clipId, patch);
  }, []);

  const handleAddEffect = useCallback(
    (trackId: TrackId, clipId: ClipId, effect: EffectInstance) => {
      projectStore.getState().addClipEffect(trackId, clipId, effect);
    },
    [],
  );

  const handleUpdateEffect = useCallback(
    (trackId: TrackId, clipId: ClipId, effectIndex: number, patch: Partial<EffectInstance>) => {
      projectStore.getState().updateClipEffect(trackId, clipId, effectIndex, patch);
    },
    [],
  );

  const handleRemoveEffect = useCallback(
    (trackId: TrackId, clipId: ClipId, effectIndex: number) => {
      projectStore.getState().removeClipEffect(trackId, clipId, effectIndex);
    },
    [],
  );

  const handleSetTrackVolume = useCallback((trackId: TrackId, volume: number) => {
    projectStore.getState().setTrackVolume(trackId, volume);
  }, []);

  const handleToggleTrackMute = useCallback((trackId: string, currentlyVisible: boolean) => {
    projectStore.getState().setTrackVisible(trackId as TrackId, !currentlyVisible);
  }, []);

  const handleToggleTrackLock = useCallback((trackId: string, currentlyLocked: boolean) => {
    projectStore.getState().setTrackLocked(trackId as TrackId, !currentlyLocked);
  }, []);

  const handleToggleTrackSolo = useCallback((trackId: string) => {
    setSoloTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  const handleAddVideoTrack = useCallback(() => {
    projectStore.getState().addTrack('video');
  }, []);

  const handleAddAudioTrack = useCallback(() => {
    projectStore.getState().addTrack('audio');
  }, []);

  const canRemoveTrack = useCallback(
    (trackId: string) => {
      const track = tracks.find((candidate) => candidate.id === trackId);
      if (!track || track.clips.length > 0) return false;
      return tracks.filter((candidate) => candidate.type === track.type).length > 1;
    },
    [tracks],
  );

  const handleRemoveTrack = useCallback((trackId: string) => {
    projectStore.getState().removeTrack(trackId as TrackId);
  }, []);

  const handleUpdateCaptionText = useCallback((id: AIAnnotationId, text: string) => {
    projectStore.getState().updateCaptionText(id, text);
  }, []);

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
      projectStore
        .getState()
        .trimClipLeftEdge(
          track.id,
          clipId as import('@rough-cut/project-model').ClipId,
          newTimelineIn,
        );
    },
    [findTrackForClip],
  );

  const handleTrimRight = useCallback(
    (clipId: string, newTimelineOut: number) => {
      const track = findTrackForClip(clipId);
      if (!track) return;
      projectStore
        .getState()
        .trimClipRightEdge(
          track.id,
          clipId as import('@rough-cut/project-model').ClipId,
          newTimelineOut,
        );
    },
    [findTrackForClip],
  );

  const handleMoveClip = useCallback(
    (clipId: string, newTimelineIn: number, fromTrackId: string, toTrackId: string) => {
      projectStore
        .getState()
        .moveClipWithOverwrite(
          clipId as ClipId,
          fromTrackId as TrackId,
          toTrackId as TrackId,
          newTimelineIn,
        );
    },
    [],
  );

  const trackVolume = selectedClipTrack?.volume ?? 1;

  const allCaptionSegments = useProjectStore((s) => s.project.aiAnnotations?.captionSegments) ?? [];
  const captionSegments = useMemo(() => {
    if (!selectedClip) return [];
    return allCaptionSegments.filter(
      (seg) => seg.startFrame < selectedClip.timelineOut && seg.endFrame > selectedClip.timelineIn,
    );
  }, [allCaptionSegments, selectedClip]);

  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const project = useProjectStore((s) => s.project);
  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;
  // PlaybackManager singleton handles playback loop — no usePlaybackLoop needed

  // Zoom-to-fit: calculate ppf so all clips fit in the visible width
  const handleZoomToFit = useCallback(() => {
    const maxFrame = Math.max(
      ...tracks.map((t) => t.clips.reduce((mx, c) => Math.max(mx, c.timelineOut), 0)),
      1, // avoid divide by zero
    );
    const estimatedWidth = window.innerWidth - 200; // rough estimate minus sidebar/labels
    const newPpf = Math.max(1, Math.min(20, Math.floor(estimatedWidth / maxFrame)));
    setPixelsPerFrame(newPpf);
  }, [tracks]);

  // Auto zoom-to-fit on initial project load
  const initialFitDoneRef = useRef(false);

  useEffect(() => {
    if (tracks.length > 0 && tracks.some((t) => t.clips.length > 0) && !initialFitDoneRef.current) {
      initialFitDoneRef.current = true;
      handleZoomToFit();
    }
  }, [tracks, handleZoomToFit]);

  const handleUpdateClipField = useCallback(
    (clipId: ClipId, patch: { name?: string; enabled?: boolean }) => {
      projectStore.getState().updateClipField(clipId, patch);
    },
    [],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const getShortcutTargetKind = (
      target: EventTarget | null,
    ): 'text-entry' | 'interactive-control' | 'generic' => {
      if (!(target instanceof HTMLElement)) return 'generic';
      if (target.isContentEditable) return 'text-entry';
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return 'text-entry';
      if (target instanceof HTMLButtonElement) return 'interactive-control';
      if (!(target instanceof HTMLInputElement)) return 'generic';

      const type = target.type.toLowerCase();
      if (['button', 'checkbox', 'color', 'file', 'hidden', 'radio', 'reset', 'submit'].includes(type)) {
        return 'interactive-control';
      }

      if (type === 'range') return 'generic';

      return 'text-entry';
    };

    const handler = (e: KeyboardEvent) => {
      const targetKind = getShortcutTargetKind(e.target);
      if (targetKind === 'text-entry') return;

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
          setPixelsPerFrame((prev) => Math.min(20, prev + 1));
          break;
        case '-':
          e.preventDefault();
          setPixelsPerFrame((prev) => Math.max(1, prev - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          getPlaybackManager().stepBackward(1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          getPlaybackManager().stepForward(1);
          break;
      }

      if ((e.code === 'Space' || e.key === ' ') && !e.repeat && targetKind !== 'interactive-control') {
        e.preventDefault();
        getPlaybackManager().togglePlay();
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSplit, handleDelete, handleUndo, handleRedo]);

  const activeCameraPreview = useMemo(() => {
    const frame = resolveFrame(project, playheadFrame);
    const activeCameraLayer = frame.layers.find((layer) => {
      const asset = project.assets.find((candidate) => candidate.id === layer.assetId);
      return Boolean(asset?.metadata?.isCamera);
    });

    if (!activeCameraLayer) {
      return null;
    }

    const cameraAsset = project.assets.find((asset) => asset.id === activeCameraLayer.assetId);
    if (!cameraAsset?.filePath) {
      return null;
    }

    const cameraClip =
      project.composition.tracks
        .flatMap((track) => track.clips)
        .find(
          (clip) =>
            clip.assetId === activeCameraLayer.assetId &&
            playheadFrame >= clip.timelineIn &&
            playheadFrame < clip.timelineOut,
        ) ?? null;

    if (!cameraClip) {
      return null;
    }

    const recordingAsset =
      project.assets.find(
        (asset) => asset.type === 'recording' && asset.cameraAssetId === activeCameraLayer.assetId,
      ) ?? null;

    return {
      filePath: cameraAsset.filePath,
      clipTimelineIn: cameraClip.timelineIn,
      clipSourceIn: cameraClip.sourceIn,
      camera: recordingAsset?.presentation?.camera ?? createDefaultCameraPresentation(),
      cameraFrame: recordingAsset?.presentation?.cameraFrame,
    };
  }, [playheadFrame, project]);

  return (
    <EditScreenLayout>
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
        onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))}
        captureSummary={captureSummary}
      />

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
        {/* Preview — fills remaining space, uses PixiJS compositor */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <EditPreviewStage>
            <div
              data-testid="record-card-content"
              style={{
                position: 'relative',
                aspectRatio: '16 / 9',
                width: '100%',
                borderRadius: 18,
                background: '#050505',
                boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
                overflow: 'hidden',
              }}
            >
              <div ref={previewRef} style={{ position: 'absolute', inset: 0 }} />
              {activeCameraPreview && activeCameraPreview.camera.visible !== false ? (
                <EditCameraOverlay
                  filePath={activeCameraPreview.filePath}
                  fps={projectFps}
                  clipTimelineIn={activeCameraPreview.clipTimelineIn}
                  clipSourceIn={activeCameraPreview.clipSourceIn}
                  cameraFrame={activeCameraPreview.cameraFrame}
                  visible={true}
                  camera={activeCameraPreview.camera}
                />
              ) : null}
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
              onUpdateTransform={handleUpdateTransform}
              trackId={(selectedClipTrack?.id as TrackId) ?? null}
              onAddEffect={handleAddEffect}
              onUpdateEffect={handleUpdateEffect}
              onRemoveEffect={handleRemoveEffect}
              trackVolume={trackVolume}
              onSetTrackVolume={handleSetTrackVolume}
              captionSegments={captionSegments}
              onUpdateCaptionText={handleUpdateCaptionText}
            />
          )}
        </div>
      </div>

      {/* Timeline — full width, below the sidebar row */}
      <div
        style={{
          flex: '1 1 0%',
          minHeight: 120,
          padding: '0 24px 8px',
          background: '#050505',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
          onAddVideoTrack={handleAddVideoTrack}
          onAddAudioTrack={handleAddAudioTrack}
          pixelsPerFrame={pixelsPerFrame}
          onZoomChange={setPixelsPerFrame}
          onZoomToFit={handleZoomToFit}
          playheadFrame={playheadFrame}
        >
          <TimelineStrip
            tracks={tracks}
            assets={assets}
            playheadFrame={playheadFrame}
            selectedClipIds={selectedClipIds}
            pixelsPerFrame={pixelsPerFrame}
            snapEnabled={snapEnabled}
            onSelectClip={handleSelectClip}
            onSelectRange={handleSelectRange}
            onClearSelection={handleClearSelection}
            onScrub={handleScrub}
            onTrimLeft={handleTrimLeft}
            onTrimRight={handleTrimRight}
            onMoveClip={handleMoveClip}
            onZoomChange={setPixelsPerFrame}
            canRemoveTrack={canRemoveTrack}
            onRemoveTrack={handleRemoveTrack}
            soloTrackIds={soloTrackIds}
            onToggleTrackMute={handleToggleTrackMute}
            onToggleTrackSolo={handleToggleTrackSolo}
            onToggleTrackLock={handleToggleTrackLock}
            onTrackVolumeChange={(trackId, volume) =>
              handleSetTrackVolume(trackId as TrackId, volume)
            }
          />
        </EditTimelineShell>
      </div>
    </EditScreenLayout>
  );
}
