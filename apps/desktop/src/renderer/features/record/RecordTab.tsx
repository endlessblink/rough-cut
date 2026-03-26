/**
 * RecordTab: Presentation-focused timeline.
 * Responsible for: zoom keyframes, cursor styling, highlights, shortcut titles,
 * background/look presets. No clip edits (no cutting, trimming, reordering, track management).
 */
import { useState, useEffect, useCallback } from 'react';
import type { RecordingResult } from '../../env.js';
import { useProjectStore, useTransportStore, transportStore, projectStore } from '../../hooks/use-stores.js';
import { createDefaultZoomPresentation, createDefaultCursorPresentation } from '@rough-cut/project-model';
import type { CursorPresentation } from '@rough-cut/project-model';
import { useRecordState } from './record-state.js';
import { useRecording } from './use-recording.js';
import { RecordScreenLayout } from './RecordScreenLayout.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { WorkspaceRow, RECORD_PANEL_WIDTH } from '../../ui/index.js';
import { ModeSelectorRow } from './ModeSelectorRow.js';
import type { RecordMode } from './ModeSelectorRow.js';
import { PreviewStage } from './PreviewStage.js';
import { PreviewCard } from './PreviewCard.js';
import { RecordRightPanel } from './RecordRightPanel.js';
import { RecordTimelineShell } from './RecordTimelineShell.js';
import { BottomBar } from './BottomBar.js';
import type { RecordState } from './BottomBar.js';
import { SourcePickerPopup } from './SourcePickerPopup.js';
import { useCompositor } from '../../hooks/use-compositor.js';

interface RecordTabProps {
  onAssetCreated: (result: RecordingResult) => void;
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

export function RecordTab({ onAssetCreated, activeTab, onTabChange }: RecordTabProps) {
  const [recordMode, setRecordMode] = useState<RecordMode>('fullscreen');
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSystemAudioEnabled, setIsSystemAudioEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);

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

  // Project + transport state for timeline
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const currentFrame = useTransportStore((s) => s.playheadFrame);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;

  // Get the first recording asset's presentation (or defaults)
  const activeRecordingAsset = useProjectStore((s) =>
    s.project.assets.find((a) => a.type === 'recording'),
  );
  const activeRecordingId = activeRecordingAsset?.id ?? null;
  const zoomPresentation = activeRecordingAsset?.presentation?.zoom ?? createDefaultZoomPresentation();
  const cursorPresentation = activeRecordingAsset?.presentation?.cursor ?? createDefaultCursorPresentation();

  // Recording asset detection + compositor
  const hasRecordingAsset = useProjectStore((s) => s.project.assets.some((a) => a.type === 'recording'));
  const { previewRef } = useCompositor();

  // UI state

  const handleTimelineScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  const handleZoomIntensityChange = useCallback((value: number) => {
    if (!activeRecordingId) return;
    projectStore.getState().setRecordingAutoZoomIntensity(activeRecordingId, value);
  }, [activeRecordingId]);

  const handleAddZoomMarker = useCallback((frame: number) => {
    if (!activeRecordingId) return;
    const defaultDuration = Math.round(projectFps * 2);
    projectStore.getState().addRecordingZoomMarker(
      activeRecordingId,
      frame,
      Math.min(frame + defaultDuration, durationFrames),
    );
  }, [activeRecordingId, projectFps, durationFrames]);

  const handleSelectZoomMarker = useCallback((_id: string) => {
    // TODO: select marker for editing
  }, []);

  const handleResetZoom = useCallback(() => {
    if (!activeRecordingId) return;
    projectStore.getState().resetRecordingZoom(activeRecordingId);
  }, [activeRecordingId]);

  const handleCursorChange = useCallback((patch: Partial<CursorPresentation>) => {
    if (!activeRecordingId) return;
    projectStore.getState().updateRecordingCursor(activeRecordingId, patch);
  }, [activeRecordingId]);

  const handleCursorReset = useCallback(() => {
    if (!activeRecordingId) return;
    projectStore.getState().resetRecordingCursor(activeRecordingId);
  }, [activeRecordingId]);

  const recording = useRecording({
    selectedSourceId,
    onStatusChange: setStatus,
    onError: setError,
    onElapsedChange: setElapsedMs,
    onAssetCreated,
  });

  const loadSources = useCallback(async () => {
    setStatus('loading-sources');
    try {
      const result = await window.roughcut.recordingGetSources();
      setSources(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setSources, setStatus, setError]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const selectedSourceName = sources.find((s) => s.id === selectedSourceId)?.name ?? null;

  const recordState: RecordState =
    status === 'recording' ? 'recording' : status === 'countdown' ? 'countdown' : 'idle';

  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  const handleClickRecord = useCallback(() => {
    if (status === 'recording') {
      recording.stopRecording();
    } else if (status !== 'stopping' && status !== 'loading-sources') {
      void recording.startRecording();
    }
  }, [status, recording]);

  return (
    <RecordScreenLayout>
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        captureSummary={captureSummary}
        deviceStatus="Mic: Default"
      />

      {/* Unified recording toolbar */}
      <div
        style={{
          height: 48,
          minHeight: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
          background: '#0e0e0e',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <ModeSelectorRow mode={recordMode} onChange={setRecordMode} />
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
        <BottomBar
          sourceName={selectedSourceName}
          onOpenSourcePicker={() => setIsSourcePickerOpen(true)}
          micName="Default"
          isMicMuted={isMicMuted}
          onToggleMicMute={() => setIsMicMuted((m) => !m)}
          hasSystemAudio={true}
          isSystemAudioEnabled={isSystemAudioEnabled}
          onToggleSystemAudio={() => setIsSystemAudioEnabled((e) => !e)}
          hasCamera={false}
          isCameraEnabled={isCameraEnabled}
          onToggleCamera={() => setIsCameraEnabled((c) => !c)}
          recordState={recordState}
          onClickRecord={handleClickRecord}
          elapsedSeconds={elapsedSeconds}
          resolutionLabel="1920×1080"
          fpsLabel="60 fps"
        />
      </div>

      {/* Preview + Inspector row */}
      <WorkspaceRow
        sidebarWidth={RECORD_PANEL_WIDTH}
        main={
          <PreviewStage>
            <PreviewCard
              hasActiveSource={Boolean(selectedSourceId)}
              hasRecordingAsset={hasRecordingAsset}
              onChooseSource={() => setIsSourcePickerOpen(true)}
            >
              <div ref={previewRef} style={{ width: '100%', height: '100%' }} />
            </PreviewCard>
          </PreviewStage>
        }
        inspector={
          <RecordRightPanel
            durationFrames={durationFrames}
            currentFrame={currentFrame}
            fps={projectFps}
            zoomMarkers={zoomPresentation.markers}
            zoomIntensity={zoomPresentation.autoIntensity}
            onZoomIntensityChange={handleZoomIntensityChange}
            onAddZoomMarker={handleAddZoomMarker}
            onSelectZoomMarker={handleSelectZoomMarker}
            onResetZoomMarkers={handleResetZoom}
            cursor={cursorPresentation}
            onCursorChange={handleCursorChange}
            onCursorReset={handleCursorReset}
          />
        }
      />

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: '8px 24px',
            background: '#3b1111',
            color: '#fca5a5',
            fontSize: 13,
            borderTop: '1px solid #7f1d1d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button
            onClick={reset}
            style={{
              background: 'none',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: 13,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Timeline — full width, compact fixed height */}
      <div style={{ flexShrink: 0, height: 180, padding: '0 24px', marginBottom: 8, background: '#050505' }}>
        <RecordTimelineShell
          tracks={tracks}
          assets={assets}
          durationFrames={durationFrames}
          currentFrame={currentFrame}
          fps={projectFps}
          onScrub={handleTimelineScrub}
        />
      </div>

      {isSourcePickerOpen && (
        <SourcePickerPopup
          sources={sources}
          selectedSourceId={selectedSourceId}
          onSelect={(id) => {
            selectSource(id);
            setIsSourcePickerOpen(false);
          }}
          onClose={() => setIsSourcePickerOpen(false)}
          onRefresh={loadSources}
          isLoading={status === 'loading-sources'}
        />
      )}
    </RecordScreenLayout>
  );
}
