/**
 * RecordTab: Presentation-focused timeline.
 * Responsible for: zoom keyframes, cursor styling, highlights, shortcut titles,
 * background/look presets. No clip edits (no cutting, trimming, reordering, track management).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { RecordingResult } from '../../env.js';
import { useProjectStore, useTransportStore, transportStore, projectStore } from '../../hooks/use-stores.js';
import { createDefaultZoomPresentation, createDefaultCursorPresentation, createDefaultCameraPresentation, createDefaultRegionCrop } from '@rough-cut/project-model';
import type { CursorPresentation, CameraPresentation, RegionCrop } from '@rough-cut/project-model';
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
import { CardChrome } from './CardChrome.js';
import { TemplatePreviewRenderer } from './TemplatePreviewRenderer.js';
import { RecordRightPanel } from './RecordRightPanel.js';
import type { BackgroundConfig } from './RecordRightPanel.js';
import { RecordTimelineShell } from './RecordTimelineShell.js';
import { BottomBar } from './BottomBar.js';
import type { RecordState } from './BottomBar.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { SourcePickerPopup } from './SourcePickerPopup.js';
import { useCompositor } from '../../hooks/use-compositor.js';
import { RecordingPlaybackVideo } from './RecordingPlaybackVideo.js';
import { LAYOUT_TEMPLATES } from './templates.js';
import type { LayoutTemplate } from './templates.js';
import type { Rect } from './template-layout/types.js';
import { getCardAspect } from './template-layout/index.js';

const DEFAULT_BACKGROUND: BackgroundConfig = {
  bgColor: '#4a1942',
  bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- LAYOUT_TEMPLATES is a non-empty static array
  const defaultTemplate = LAYOUT_TEMPLATES[0]!;
  const [activeTemplate, setActiveTemplate] = useState<LayoutTemplate>(defaultTemplate);
  const [screenRectOverride, setScreenRectOverride] = useState<Rect | undefined>();
  const [cameraRectOverride, setCameraRectOverride] = useState<Rect | undefined>();
  const [cropModeActive, setCropModeActive] = useState(false);

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
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const currentFrame = useTransportStore((s) => s.playheadFrame);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;

  // Get the active recording asset — use activeAssetId if set, otherwise fall back to first
  const activeRecordingAsset = useProjectStore((s) => {
    const preferred = s.activeAssetId
      ? s.project.assets.find((a) => a.id === s.activeAssetId)
      : null;
    return preferred ?? s.project.assets.find((a) => a.type === 'recording') ?? null;
  });
  const activeRecordingId = activeRecordingAsset?.id ?? null;

  const zoomPresentation = activeRecordingAsset?.presentation?.zoom ?? createDefaultZoomPresentation();
  const cursorPresentation = activeRecordingAsset?.presentation?.cursor ?? createDefaultCursorPresentation();
  const cameraPresentation = activeRecordingAsset?.presentation?.camera ?? createDefaultCameraPresentation();
  // screenCrop from store is read but we use local state for immediate responsiveness
  // (store crop requires an active recording asset which may not exist yet)

  // Recording asset detection + compositor
  const hasRecordingAsset = useProjectStore((s) => s.project.assets.some((a) => a.type === 'recording'));
  const { previewRef } = useCompositor();

  // Camera playback — find the camera asset linked to the active recording
  const cameraAsset = useProjectStore((s) => {
    if (!activeRecordingAsset?.cameraAssetId) return null;
    return s.project.assets.find((a) => a.id === activeRecordingAsset.cameraAssetId) ?? null;
  });

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  // Create / update the camera <video> element when cameraAsset changes
  useEffect(() => {
    if (!cameraAsset) {
      cameraVideoRef.current = null;
      return;
    }
    const video = document.createElement('video');
    video.src = `media://${cameraAsset.filePath}`;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.borderRadius = '50%';
    void video.play().catch(() => {});
    cameraVideoRef.current = video;

    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      cameraVideoRef.current = null;
    };
  }, [cameraAsset]);

  // Wrap the camera video in a React node for TemplatePreviewRenderer
  const cameraNode = useMemo(() => {
    if (!cameraAsset) return undefined;
    return (
      <div
        ref={(el) => {
          if (el && cameraVideoRef.current && !el.contains(cameraVideoRef.current)) {
            el.innerHTML = '';
            el.appendChild(cameraVideoRef.current);
          }
        }}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: '50%' }}
      />
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraAsset?.id]);

  // Background/canvas config (lifted from RecordRightPanel so LivePreviewVideo can consume it)
  const [background, setBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);

  // Crop state — local like background, works without a recording asset
  const [screenCrop, setScreenCrop] = useState<RegionCrop>(
    () => createDefaultRegionCrop(resolution.width, resolution.height),
  );

  const handleBackgroundChange = useCallback((patch: Partial<BackgroundConfig>) => {
    setBackground((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleBackgroundReset = useCallback(() => {
    setBackground(DEFAULT_BACKGROUND);
  }, []);

  const handleTemplateChange = useCallback((template: LayoutTemplate) => {
    setActiveTemplate(template);
    setScreenRectOverride(undefined);
    setCameraRectOverride(undefined);
  }, []);

  const handleRegionChange = useCallback((region: 'screen' | 'camera', rect: Rect) => {
    if (region === 'screen') setScreenRectOverride(rect);
    else setCameraRectOverride(rect);
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

  const handleScreenCropChange = useCallback((patch: Partial<RegionCrop>) => {
    setScreenCrop((prev) => {
      const next = { ...prev, ...patch };
      // Sync to store so Edit/Export can read it
      if (activeRecordingId) {
        projectStore.getState().updateScreenCrop(activeRecordingId, next);
      }
      return next;
    });
  }, [activeRecordingId]);

  const handleScreenCropReset = useCallback(() => {
    const def = createDefaultRegionCrop(resolution.width, resolution.height);
    setScreenCrop(def);
    if (activeRecordingId) {
      projectStore.getState().resetScreenCrop(activeRecordingId);
    }
  }, [resolution.width, resolution.height, activeRecordingId]);

  // Auto-disable crop mode when crop is turned off
  useEffect(() => {
    if (!screenCrop.enabled) setCropModeActive(false);
  }, [screenCrop.enabled]);

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
      // Open the floating recording panel — recording starts from there
      void window.roughcut.openRecordingPanel();
    }
  }, [status]);

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

  return (
    <RecordScreenLayout>
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
        onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))}
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
          resolutionLabel={`${resolution.width}×${resolution.height}`}
          fpsLabel={`${projectFps} fps`}
        />
      </div>

      {/* Preview + Inspector row */}
      <WorkspaceRow
        sidebarWidth={RECORD_PANEL_WIDTH}
        main={
          <PreviewStage>
            <CardChrome
              aspectRatio={activeTemplate.aspectRatio}
              bgColor={background.bgColor}
              bgGradient={background.bgGradient}
              bgPadding={background.bgPadding}
              bgCornerRadius={background.bgCornerRadius}
              bgShadowEnabled={background.bgShadowEnabled}
              bgShadowBlur={background.bgShadowBlur}
              bgInset={background.bgInset}
              bgInsetColor={background.bgInsetColor}
            >
              <TemplatePreviewRenderer
                template={activeTemplate}
                screenContent={
                  selectedSourceId
                    ? <LivePreviewVideo stream={liveStream} />
                    : activeRecordingAsset?.filePath
                      ? <RecordingPlaybackVideo filePath={activeRecordingAsset.filePath} fps={projectFps} assetId={activeRecordingAsset.id} />
                      : undefined
                }
                cameraContent={cameraNode}
                screenAspect={16 / 9}
                screenCornerRadius={background.bgCornerRadius}
                screenShadow={background.bgShadowEnabled
                  ? `0 ${Math.round(background.bgShadowBlur * 0.2)}px ${background.bgShadowBlur}px rgba(0,0,0,${background.bgShadowOpacity ?? 0.25})`
                  : undefined}
                interactionEnabled={true}
                onRegionChange={handleRegionChange}
                screenRectOverride={screenRectOverride}
                cameraRectOverride={cameraRectOverride}
                screenCrop={screenCrop}
                cropModeActive={cropModeActive}
                onCropModeChange={setCropModeActive}
                onScreenCropChange={handleScreenCropChange}
                sourceWidth={resolution.width}
                sourceHeight={resolution.height}
              />
            </CardChrome>
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
            screenCrop={screenCrop}
            onScreenCropChange={handleScreenCropChange}
            onScreenCropReset={handleScreenCropReset}
            sourceWidth={resolution.width}
            sourceHeight={resolution.height}
            cropModeActive={cropModeActive}
            onCropModeChange={setCropModeActive}
            selectedTemplateId={activeTemplate.id}
            onTemplateChange={handleTemplateChange}
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
          activeAssetId={activeRecordingId}
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
    </RecordScreenLayout>
  );
}
