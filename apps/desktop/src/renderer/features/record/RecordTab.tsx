/**
 * RecordTab: Presentation-focused timeline.
 * Responsible for: zoom keyframes, cursor styling, highlights, shortcut titles,
 * background/look presets. No clip edits (no cutting, trimming, reordering, track management).
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { RecordingResult } from '../../env.js';
import { usePortalWindow } from '../../hooks/use-portal-window.js';
import { RecordingPanel } from './RecordingPanel.js';
import { useProjectStore, useTransportStore, transportStore, projectStore } from '../../hooks/use-stores.js';
import { createDefaultZoomPresentation, createDefaultCursorPresentation, createDefaultCameraPresentation } from '@rough-cut/project-model';
import type { CursorPresentation, CameraPresentation } from '@rough-cut/project-model';
import { useRecordState } from './record-state.js';
import { useRecording } from './use-recording.js';
import { useLivePreview } from './use-live-preview.js';
import { LivePreviewVideo } from './LivePreviewVideo.js';
import { RecordScreenLayout } from './RecordScreenLayout.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { WorkspaceRow, RECORD_PANEL_WIDTH } from '../../ui/index.js';
import { ModeSelectorRow } from './ModeSelectorRow.js';
import type { RecordMode } from './ModeSelectorRow.js';
import { PreviewStage } from './PreviewStage.js';
import { PreviewCard } from './PreviewCard.js';
import { RecordRightPanel } from './RecordRightPanel.js';
import type { BackgroundConfig } from './RecordRightPanel.js';
import { RecordTimelineShell } from './RecordTimelineShell.js';
import { BottomBar } from './BottomBar.js';
import type { RecordState } from './BottomBar.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { SourcePickerPopup } from './SourcePickerPopup.js';
import { useCompositor } from '../../hooks/use-compositor.js';

const DEFAULT_BACKGROUND: BackgroundConfig = {
  bgColor: '#000000',
  bgGradient: null,
  bgPadding: 40,
  bgCornerRadius: 12,
  bgInset: 0,
  bgInsetColor: '#ffffff',
  bgShadowEnabled: true,
  bgShadowBlur: 20,
};

interface RecordTabProps {
  onAssetCreated: (result: RecordingResult) => void;
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

export function RecordTab({ onAssetCreated, activeTab, onTabChange }: RecordTabProps) {
  const [recordMode, setRecordMode] = useState<RecordMode>('fullscreen');
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSystemAudioEnabled, setIsSystemAudioEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Floating recording panel via React Portal (Screen Studio pattern)
  const { portalContainer, closeWindow: closePanelWindow } = usePortalWindow(isPanelOpen, {
    width: 500,
    height: 460,
    title: 'Rough Cut — Recording',
  });

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
  const cameraPresentation = activeRecordingAsset?.presentation?.camera ?? createDefaultCameraPresentation();

  // Recording asset detection + compositor
  const hasRecordingAsset = useProjectStore((s) => s.project.assets.some((a) => a.type === 'recording'));
  const { previewRef } = useCompositor();

  // Background/canvas config (lifted from RecordRightPanel so LivePreviewVideo can consume it)
  const [background, setBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);

  const handleBackgroundChange = useCallback((patch: Partial<BackgroundConfig>) => {
    setBackground((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleBackgroundReset = useCallback(() => {
    setBackground(DEFAULT_BACKGROUND);
  }, []);

  // Live preview stream — acquired when a source is selected, independent of recording
  const { stream: liveStream } = useLivePreview(selectedSourceId);

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

  const handleCameraChange = useCallback((patch: Partial<CameraPresentation>) => {
    if (!activeRecordingId) return;
    projectStore.getState().updateCameraPresentation(activeRecordingId, patch);
  }, [activeRecordingId]);

  const handleCameraReset = useCallback(() => {
    if (!activeRecordingId) return;
    projectStore.getState().resetCameraPresentation(activeRecordingId);
  }, [activeRecordingId]);

  const recording = useRecording({
    selectedSourceId,
    stream: liveStream,
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
      void window.roughcut.recordingSessionStop();
    } else if (status !== 'stopping' && status !== 'loading-sources' && status !== 'countdown') {
      if (!selectedSourceId) return; // Can't record without a source
      void window.roughcut.recordingSessionStart();
    }
  }, [status, selectedSourceId]);

  useEffect(() => {
    const unsubCountdown = window.roughcut.onSessionCountdownTick((seconds) => {
      setCountdownSeconds(seconds);
      setStatus('countdown');
    });

    const unsubStatus = window.roughcut.onSessionStatusChanged((sessionStatus) => {
      if (sessionStatus === 'recording') {
        void recording.startRecording();
      } else if (sessionStatus === 'stopping') {
        recording.stopRecording();
      }
    });

    return () => {
      unsubCountdown();
      unsubStatus();
    };
  }, [recording, setStatus]);

  // Space bar toggles playback (review mode) — skip during active recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (status === 'recording' || status === 'countdown' || status === 'stopping') return;
        e.preventDefault();
        const before = transportStore.getState().isPlaying;
        transportStore.getState().togglePlay();
        const after = transportStore.getState().isPlaying;
        console.log('[RecordTab] Space pressed, isPlaying:', before, '->', after, 'playheadFrame:', transportStore.getState().playheadFrame);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

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
        <button
          onClick={() => setIsPanelOpen((o) => !o)}
          title={isPanelOpen ? 'Close floating panel' : 'Open floating recording panel'}
          style={{
            background: isPanelOpen ? 'rgba(255,90,95,0.15)' : 'rgba(255,255,255,0.06)',
            border: isPanelOpen ? '1px solid rgba(255,90,95,0.3)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '4px 10px',
            color: isPanelOpen ? '#ff5a5f' : '#aaa',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 1v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          {isPanelOpen ? 'Close Panel' : 'Pop Out'}
        </button>
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
          resolutionLabel={`${resolution.width}×${resolution.height}`}
          fpsLabel={`${projectFps} fps`}
        />
      </div>

      {/* Preview + Inspector row */}
      <WorkspaceRow
        sidebarWidth={RECORD_PANEL_WIDTH}
        main={
          <PreviewStage>
            <PreviewCard
              hasActiveSource={Boolean(selectedSourceId) || hasRecordingAsset}
              hasRecordingAsset={hasRecordingAsset}
              onChooseSource={() => setIsSourcePickerOpen(true)}
              aspectRatio={`${resolution.width} / ${resolution.height}`}
            >
              {selectedSourceId ? (
                // Live preview: show the capture stream directly
                <LivePreviewVideo stream={liveStream} />
              ) : hasRecordingAsset ? (
                // Review mode: show the compositor canvas
                <div ref={previewRef} style={{ position: 'absolute', inset: 0 }} />
              ) : null}
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
            camera={cameraPresentation}
            onCameraChange={handleCameraChange}
            onCameraReset={handleCameraReset}
            background={background}
            onBackgroundChange={handleBackgroundChange}
            onBackgroundReset={handleBackgroundReset}
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

      <CountdownOverlay secondsRemaining={countdownSeconds} visible={status === 'countdown'} />

      {/* Floating recording panel (React Portal into child BrowserWindow) */}
      {portalContainer && createPortal(
        <RecordingPanel
          sources={sources}
          selectedSourceId={selectedSourceId}
          onSelectSource={selectSource}
          stream={liveStream}
          videoRef={(node) => {
            // Attach stream to the portal's video element
            if (node && liveStream) {
              node.srcObject = liveStream;
            }
          }}
          status={status}
          countdownSeconds={countdownSeconds}
          elapsedSeconds={elapsedSeconds}
          onStartRecording={handleClickRecord}
          onStopRecording={() => {
            if (status === 'recording') {
              void window.roughcut.recordingSessionStop();
            }
          }}
          onClose={() => {
            setIsPanelOpen(false);
            closePanelWindow();
          }}
        />,
        portalContainer,
      )}
    </RecordScreenLayout>
  );
}
