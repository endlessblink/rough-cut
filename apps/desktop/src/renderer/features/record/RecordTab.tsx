/**
 * RecordTab: Presentation-focused timeline.
 * Responsible for: zoom keyframes, cursor styling, highlights, shortcut titles,
 * background/look presets. No clip edits (no cutting, trimming, reordering, track management).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { RecordingResult } from '../../env.js';
import {
  useProjectStore,
  useTransportStore,
  transportStore,
  projectStore,
} from '../../hooks/use-stores.js';
import {
  createDefaultZoomPresentation,
  createDefaultCursorPresentation,
  createDefaultCameraPresentation,
  createDefaultRegionCrop,
} from '@rough-cut/project-model';
import type { CursorPresentation, CameraPresentation, RegionCrop } from '@rough-cut/project-model';
import { useRecordState } from './record-state.js';
import { useRecording } from './use-recording.js';
import { useLivePreview } from './use-live-preview.js';
import { LivePreviewCanvas } from './LivePreviewCanvas.js';
import { RecordScreenLayout } from './RecordScreenLayout.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { WorkspaceRow, RECORD_PANEL_WIDTH } from '../../ui/index.js';
import { useToast } from '../../ui/toast.js';
import { ModeSelectorRow } from './ModeSelectorRow.js';
import type { RecordMode } from './ModeSelectorRow.js';
import { PreviewStage } from './PreviewStage.js';
import { CardChrome } from './CardChrome.js';
import { TemplatePreviewRenderer } from './TemplatePreviewRenderer.js';
import { RecordRightPanel } from './RecordRightPanel.js';
import type { BackgroundConfig } from './RecordRightPanel.js';
import { RecordTimelineShell } from './RecordTimelineShell.js';
import { ZoomMarkerInspector } from './ZoomMarkerInspector.js';
import { useCursorEvents } from '../../hooks/use-cursor-events.js';
import { generateAutoZoomMarkers } from '@rough-cut/timeline-engine';
import { BottomBar } from './BottomBar.js';
import type { RecordState } from './BottomBar.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { SourcePickerPopup } from './SourcePickerPopup.js';
import { useRecordingConfig, updateRecordingConfig } from './recording-config.js';
import { RecordDeviceSelectors } from './RecordDeviceSelectors.js';
import {
  getSelectedOptionLabel,
  useRecordingDeviceOptions,
} from './use-recording-device-options.js';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { RecordingPlaybackVideo } from './RecordingPlaybackVideo.js';
import { CameraPlaybackCanvas } from './CameraPlaybackCanvas.js';
import { LAYOUT_TEMPLATES, resolutionForAspectRatio } from './templates.js';
import type { LayoutTemplate } from './templates.js';
import type { Rect } from './template-layout/types.js';
import type { Alignment } from './snap-guides.js';

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
  const { showToast } = useToast();
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  // Default to Screen+Camera PIP template (index 1) when camera is on
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- LAYOUT_TEMPLATES is a non-empty static array
  const defaultTemplate = LAYOUT_TEMPLATES[1] ?? LAYOUT_TEMPLATES[0]!;
  const [activeTemplate, setActiveTemplate] = useState<LayoutTemplate>(defaultTemplate);
  const [screenRectOverride, setScreenRectOverride] = useState<Rect | undefined>();
  const [cameraRectOverride, setCameraRectOverride] = useState<Rect | undefined>();
  const [cropModeActive, setCropModeActive] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<'screen' | 'camera' | null>(null);
  const [cropTargetRegion, setCropTargetRegion] = useState<'screen' | 'camera'>('screen');
  const alignRef = useRef<((a: Alignment) => void) | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRegion(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleAlign = useCallback((alignment: Alignment) => {
    alignRef.current?.(alignment);
  }, []);

  // Sync resolution with default template on mount — prevents stale resolution
  // from a previously selected template (e.g. 1:1 "Talking Head" → 1080×1080)
  useEffect(() => {
    const expected = resolutionForAspectRatio(activeTemplate.aspectRatio);
    const current = projectStore.getState().project.settings.resolution;
    if (current.width !== expected.width || current.height !== expected.height) {
      projectStore.getState().updateSettings({ resolution: expected });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { state, setSources, setStatus, setError, setElapsedMs, reset } = useRecordState();

  const { sources, status, error, elapsedMs } = state;
  const recordMode = useRecordingConfig((s) => s.recordMode);
  const selectedSourceId = useRecordingConfig((s) => s.selectedSourceId);
  const micEnabled = useRecordingConfig((s) => s.micEnabled);
  const sysAudioEnabled = useRecordingConfig((s) => s.sysAudioEnabled);
  const cameraEnabled = useRecordingConfig((s) => s.cameraEnabled);
  const configuredCountdownSeconds = useRecordingConfig((s) => s.countdownSeconds);
  const selectedMicDeviceId = useRecordingConfig((s) => s.selectedMicDeviceId);
  const selectedCameraDeviceId = useRecordingConfig((s) => s.selectedCameraDeviceId);
  const selectedSystemAudioSourceId = useRecordingConfig((s) => s.selectedSystemAudioSourceId);
  const { micOptions, cameraOptions, systemAudioOptions } = useRecordingDeviceOptions();
  const warnedSelectionRef = useRef<Record<string, string | null>>({
    mic: null,
    camera: null,
    systemAudio: null,
    source: null,
  });
  const availableSelectionRef = useRef<Record<string, boolean>>({
    mic: false,
    camera: false,
    systemAudio: false,
  });
  const selectedMicName = getSelectedOptionLabel(micOptions, selectedMicDeviceId, 'Default');

  // Project + transport state for timeline
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const currentFrame = useTransportStore((s) => s.playheadFrame);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const projectFilePath = useProjectStore((s) => s.projectFilePath);
  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;

  // Keep Record tied to a recording asset even when camera-related UI selects the camera asset.
  const activeRecordingAsset = useProjectStore((s) => {
    const preferred = s.activeAssetId
      ? s.project.assets.find((a) => a.id === s.activeAssetId)
      : null;
    if (preferred?.type === 'recording') {
      return preferred;
    }
    if (preferred?.metadata?.isCamera) {
      return (
        s.project.assets.find((a) => a.type === 'recording' && a.cameraAssetId === preferred.id) ??
        null
      );
    }
    return s.project.assets.find((a) => a.type === 'recording') ?? null;
  });
  const activeRecordingId = activeRecordingAsset?.id ?? null;
  const hasRecordingAssets = useProjectStore((s) =>
    s.project.assets.some((asset) => asset.type === 'recording'),
  );

  const zoomPresentation =
    activeRecordingAsset?.presentation?.zoom ?? createDefaultZoomPresentation();
  const cursorPresentation =
    activeRecordingAsset?.presentation?.cursor ?? createDefaultCursorPresentation();
  // screenCrop from store is read but we use local state for immediate responsiveness
  // (store crop requires an active recording asset which may not exist yet)

  // Camera playback — find the camera asset linked to the active recording
  // (still needed so the compositor can find the camera asset)
  const cameraAsset = useProjectStore((s) => {
    if (!activeRecordingAsset?.cameraAssetId) return null;
    return s.project.assets.find((a) => a.id === activeRecordingAsset.cameraAssetId) ?? null;
  });
  const cameraClip = useProjectStore((s) => {
    if (!activeRecordingAsset?.cameraAssetId) return null;
    for (const track of s.project.composition.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId === activeRecordingAsset.cameraAssetId) {
          return clip;
        }
      }
    }
    return null;
  });
  const cameraSourceWidth = (cameraAsset?.metadata?.width as number) || 1920;
  const cameraSourceHeight = (cameraAsset?.metadata?.height as number) || 1080;

  // Background/canvas config (lifted from RecordRightPanel so LivePreviewVideo can consume it)
  const [background, setBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);
  const [cameraPresentation, setCameraPresentation] = useState<CameraPresentation>(() =>
    createDefaultCameraPresentation(),
  );

  // Crop state — local like background, works without a recording asset
  const [screenCrop, setScreenCrop] = useState<RegionCrop>(() =>
    createDefaultRegionCrop(resolution.width, resolution.height),
  );

  useEffect(() => {
    if (!activeRecordingAsset?.presentation?.camera) return;
    setCameraPresentation(activeRecordingAsset.presentation.camera);
  }, [activeRecordingAsset?.id, activeRecordingAsset?.presentation?.camera]);
  const [cameraCrop, setCameraCrop] = useState<RegionCrop>(() => createDefaultRegionCrop());

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
    setCropModeActive(false);
    setScreenCrop(
      createDefaultRegionCrop(
        resolutionForAspectRatio(template.aspectRatio).width,
        resolutionForAspectRatio(template.aspectRatio).height,
      ),
    );
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

  const handleZoomIntensityChange = useCallback(
    (value: number) => {
      if (!activeRecordingId) return;
      projectStore.getState().setRecordingAutoZoomIntensity(activeRecordingId, value);
    },
    [activeRecordingId],
  );

  const [selectedZoomMarkerId, setSelectedZoomMarkerId] = useState<
    import('@rough-cut/project-model').ZoomMarkerId | null
  >(null);

  const selectedTimelineAssetId =
    (selectedRegion === 'camera' ? cameraAsset?.id : activeRecordingId) ??
    activeRecordingId ??
    cameraAsset?.id ??
    null;
  const preferredInspectorCategoryId = selectedZoomMarkerId
    ? 'zoom'
    : selectedRegion === 'camera' || selectedTimelineAssetId === cameraAsset?.id
      ? 'camera'
      : 'crop';

  const handleAddZoomMarkerAtPlayhead = useCallback(() => {
    if (!activeRecordingId || durationFrames <= 0) return;
    // Default: 1 second, capped so there's always room, but never more than half the recording
    const preferredDuration = Math.round(projectFps * 1);
    const maxDuration = Math.max(projectFps, Math.floor(durationFrames / 2));
    const defaultDuration = Math.min(preferredDuration, maxDuration);
    const startFrame = Math.max(0, Math.min(currentFrame, durationFrames - defaultDuration));
    const endFrame = Math.min(startFrame + defaultDuration, durationFrames);
    projectStore.getState().addRecordingZoomMarker(activeRecordingId, startFrame, endFrame);
  }, [activeRecordingId, projectFps, durationFrames, currentFrame]);

  const handleSelectZoomMarker = useCallback(
    (id: import('@rough-cut/project-model').ZoomMarkerId | null) => {
      setSelectedZoomMarkerId(id);
    },
    [],
  );

  const handleSelectTimelineAsset = useCallback(
    (assetId: string) => {
      setSelectedZoomMarkerId(null);
      if (assetId === cameraAsset?.id) {
        setSelectedRegion('camera');
        return;
      }
      if (assetId === activeRecordingId) {
        setSelectedRegion('screen');
      }
    },
    [activeRecordingId, cameraAsset?.id],
  );

  const handleResetZoom = useCallback(() => {
    if (!activeRecordingId) return;
    projectStore.getState().resetRecordingZoom(activeRecordingId);
    setSelectedZoomMarkerId(null);
  }, [activeRecordingId]);

  // ── Auto-zoom: regenerate markers from cursor data when intensity changes ──
  const autoIntensity = zoomPresentation.autoIntensity;
  const cursorEventsPath = activeRecordingAsset?.metadata?.cursorEventsPath as string | null;
  const autoCursorEvents = useCursorEvents(cursorEventsPath);
  const sourceWidth = (activeRecordingAsset?.metadata?.width as number) || 1920;
  const sourceHeight = (activeRecordingAsset?.metadata?.height as number) || 1080;

  const regenerateAutoZoomMarkers = useCallback(() => {
    if (!activeRecordingId) return;

    const store = projectStore.getState();
    // Wrap in temporal pause/resume so marker regeneration doesn't pollute undo history.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const temporal = (projectStore as any).temporal;
    temporal?.getState?.().pause?.();
    try {
      if (autoIntensity <= 0 || !autoCursorEvents || autoCursorEvents.length === 0) {
        store.replaceAutoZoomMarkers(activeRecordingId, []);
        return;
      }
      const autos = generateAutoZoomMarkers(
        autoCursorEvents,
        autoIntensity,
        projectFps,
        sourceWidth,
        sourceHeight,
      );
      store.replaceAutoZoomMarkers(activeRecordingId, autos);
    } finally {
      temporal?.getState?.().resume?.();
    }
  }, [activeRecordingId, autoCursorEvents, autoIntensity, projectFps, sourceWidth, sourceHeight]);

  useEffect(() => {
    if (!activeRecordingId) return;

    const handle = setTimeout(() => {
      regenerateAutoZoomMarkers();
    }, 250);

    return () => clearTimeout(handle);
  }, [activeRecordingId, regenerateAutoZoomMarkers]);

  // ── Zoom persistence: save ZoomPresentation to a .zoom.json sidecar on edit ──
  // Debounce 500ms so slider drags and auto-zoom regeneration don't spam disk.
  // Skip the first render so hydrating from the sidecar doesn't immediately re-save.
  const recordingFilePath = activeRecordingAsset?.filePath ?? null;
  const skipFirstZoomSaveRef = useRef(true);
  useEffect(() => {
    if (!recordingFilePath) return;
    if (skipFirstZoomSaveRef.current) {
      skipFirstZoomSaveRef.current = false;
      return;
    }
    const payload = {
      autoIntensity: zoomPresentation.autoIntensity,
      markers: zoomPresentation.markers,
    };
    const handle = setTimeout(() => {
      void window.roughcut
        .zoomSaveSidecar(recordingFilePath, payload)
        .catch((err: unknown) => console.warn('[zoom-sidecar] save failed:', err));
    }, 500);
    return () => clearTimeout(handle);
  }, [recordingFilePath, zoomPresentation.autoIntensity, zoomPresentation.markers]);

  // Reset the first-save guard whenever we switch to a different recording.
  useEffect(() => {
    skipFirstZoomSaveRef.current = true;
  }, [recordingFilePath]);

  const handleCursorChange = useCallback(
    (patch: Partial<CursorPresentation>) => {
      if (!activeRecordingId) return;
      projectStore.getState().updateRecordingCursor(activeRecordingId, patch);
    },
    [activeRecordingId],
  );

  const handleCursorReset = useCallback(() => {
    if (!activeRecordingId) return;
    projectStore.getState().resetRecordingCursor(activeRecordingId);
  }, [activeRecordingId]);

  const handleCameraChange = useCallback(
    (patch: Partial<CameraPresentation>) => {
      setCameraPresentation((prev) => ({ ...prev, ...patch }));
      if (!activeRecordingId) return;
      projectStore.getState().updateCameraPresentation(activeRecordingId, patch);
    },
    [activeRecordingId],
  );

  const handleCameraReset = useCallback(() => {
    const defaults = createDefaultCameraPresentation();
    setCameraPresentation(defaults);
    if (!activeRecordingId) return;
    projectStore.getState().resetCameraPresentation(activeRecordingId);
  }, [activeRecordingId]);

  const handleScreenCropChange = useCallback(
    (patch: Partial<RegionCrop>) => {
      setScreenCrop((prev) => {
        const next = { ...prev, ...patch };
        // Sync to store so Edit/Export can read it
        if (activeRecordingId) {
          projectStore.getState().updateScreenCrop(activeRecordingId, next);
        }
        return next;
      });
    },
    [activeRecordingId],
  );

  const handleScreenCropReset = useCallback(() => {
    const def = createDefaultRegionCrop(resolution.width, resolution.height);
    setScreenCrop(def);
    if (activeRecordingId) {
      projectStore.getState().resetScreenCrop(activeRecordingId);
    }
  }, [resolution.width, resolution.height, activeRecordingId]);

  const handleCameraCropChange = useCallback(
    (patch: Partial<RegionCrop>) => {
      setCameraCrop((prev) => {
        const next = { ...prev, ...patch };
        if (activeRecordingId) {
          projectStore.getState().updateCameraCrop(activeRecordingId, next);
        }
        return next;
      });
    },
    [activeRecordingId],
  );

  const handleCameraCropReset = useCallback(() => {
    const def = createDefaultRegionCrop(cameraSourceWidth, cameraSourceHeight);
    setCameraCrop(def);
    if (activeRecordingId) {
      projectStore.getState().resetCameraCrop(activeRecordingId);
    }
  }, [cameraSourceWidth, cameraSourceHeight, activeRecordingId]);

  useEffect(() => {
    setScreenCrop(
      activeRecordingAsset?.presentation?.screenCrop ??
        createDefaultRegionCrop(resolution.width, resolution.height),
    );
    setCameraCrop(
      activeRecordingAsset?.presentation?.cameraCrop ??
        createDefaultRegionCrop(cameraSourceWidth, cameraSourceHeight),
    );
  }, [
    activeRecordingAsset?.id,
    activeRecordingAsset?.presentation?.screenCrop,
    activeRecordingAsset?.presentation?.cameraCrop,
    resolution.width,
    resolution.height,
    cameraSourceWidth,
    cameraSourceHeight,
  ]);

  useEffect(() => {
    if (selectedRegion) setCropTargetRegion(selectedRegion);
  }, [selectedRegion]);

  const handleScreenCropModeChange = useCallback((active: boolean) => {
    setSelectedRegion('screen');
    setCropTargetRegion('screen');
    setCropModeActive(active);
  }, []);

  const handleCameraCropModeChange = useCallback((active: boolean) => {
    setSelectedRegion('camera');
    setCropTargetRegion('camera');
    setCropModeActive(active);
  }, []);

  // Auto-disable crop mode when crop is turned off
  useEffect(() => {
    const activeCrop = cropTargetRegion === 'camera' ? cameraCrop : screenCrop;
    if (!activeCrop.enabled) setCropModeActive(false);
  }, [cropTargetRegion, cameraCrop, screenCrop]);

  // [DEBUG] Load the latest saved project from disk instead of rebuilding
  // from raw media files. This keeps restart/debug behavior aligned with the
  // real reopen flow and avoids bypassing persisted camera state.
  const handleDebugReload = useCallback(async () => {
    const fallbackRecentProject = async () => {
      const recentProjects = await window.roughcut.recentProjectsGet();
      return (
        [...recentProjects].sort(
          (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
        )[0] ?? null
      );
    };

    const filePathToReload = projectFilePath ?? (await fallbackRecentProject())?.filePath ?? null;
    if (!filePathToReload) {
      console.warn('[DEBUG] No saved projects found to reopen');
      return;
    }

    const project = await window.roughcut.projectOpenPath(filePathToReload);
    const recordingAssets = project.assets.filter((asset) => asset.type === 'recording');
    const matchingRecording = activeRecordingId
      ? (recordingAssets.find((asset) => asset.id === activeRecordingId) ?? null)
      : null;
    const latestRecording =
      matchingRecording ??
      [...recordingAssets]
        .reverse()
        .find((asset) => 'cameraAssetId' in asset && asset.cameraAssetId) ??
      recordingAssets[recordingAssets.length - 1] ??
      null;

    console.info(
      '[DEBUG] Reopening saved project:',
      filePathToReload,
      'active recording:',
      latestRecording?.filePath ?? 'NONE',
    );

    getPlaybackManager().pause();
    transportStore.getState().seekToFrame(0);
    projectStore.getState().setProject(project);
    projectStore.getState().setProjectFilePath(filePathToReload);
    projectStore.getState().setActiveAssetId(latestRecording?.id ?? null);
  }, [activeRecordingId, projectFilePath]);

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

  useEffect(() => {
    if (sources.length === 0) return;

    const expectedType = recordMode === 'window' ? 'window' : 'screen';
    const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
    if (selectedSource?.type === expectedType) return;

    const fallbackSource = sources.find((source) => source.type === expectedType) ?? null;
    if (fallbackSource && fallbackSource.id !== selectedSourceId) {
      updateRecordingConfig({ selectedSourceId: fallbackSource.id });
    }
  }, [recordMode, selectedSourceId, sources]);

  useEffect(() => {
    const wasAvailable = availableSelectionRef.current.mic;
    const isAvailable = selectedMicDeviceId
      ? micOptions.some((option) => option.id === selectedMicDeviceId)
      : false;
    availableSelectionRef.current.mic = isAvailable;

    if (
      wasAvailable &&
      selectedMicDeviceId &&
      !isAvailable &&
      warnedSelectionRef.current.mic !== selectedMicDeviceId
    ) {
      warnedSelectionRef.current.mic = selectedMicDeviceId;
      updateRecordingConfig({ selectedMicDeviceId: null, micEnabled: false });
      showToast({
        title: 'Microphone disconnected',
        message: 'Recording will continue without mic audio until you choose another input.',
        tone: 'warning',
      });
      return;
    }
    warnedSelectionRef.current.mic = null;
  }, [micEnabled, micOptions, selectedMicDeviceId, showToast]);

  useEffect(() => {
    const wasAvailable = availableSelectionRef.current.camera;
    const isAvailable = selectedCameraDeviceId
      ? cameraOptions.some((option) => option.id === selectedCameraDeviceId)
      : false;
    availableSelectionRef.current.camera = isAvailable;

    if (
      wasAvailable &&
      selectedCameraDeviceId &&
      !isAvailable &&
      warnedSelectionRef.current.camera !== selectedCameraDeviceId
    ) {
      warnedSelectionRef.current.camera = selectedCameraDeviceId;
      updateRecordingConfig({ selectedCameraDeviceId: null, cameraEnabled: false });
      showToast({
        title: 'Camera disconnected',
        message: 'Recording will continue without camera video until you choose another camera.',
        tone: 'warning',
      });
      return;
    }
    warnedSelectionRef.current.camera = null;
  }, [cameraEnabled, cameraOptions, selectedCameraDeviceId, showToast]);

  useEffect(() => {
    const wasAvailable = availableSelectionRef.current.systemAudio;
    const isAvailable = selectedSystemAudioSourceId
      ? systemAudioOptions.some((option) => option.id === selectedSystemAudioSourceId)
      : false;
    availableSelectionRef.current.systemAudio = isAvailable;

    if (
      wasAvailable &&
      selectedSystemAudioSourceId &&
      !isAvailable &&
      warnedSelectionRef.current.systemAudio !== selectedSystemAudioSourceId
    ) {
      warnedSelectionRef.current.systemAudio = selectedSystemAudioSourceId;
      updateRecordingConfig({ selectedSystemAudioSourceId: null, sysAudioEnabled: false });
      showToast({
        title: 'System audio source unavailable',
        message: 'Recording will continue without system audio until you choose another output.',
        tone: 'warning',
      });
      return;
    }
    warnedSelectionRef.current.systemAudio = null;
  }, [selectedSystemAudioSourceId, showToast, systemAudioOptions]);

  useEffect(() => {
    const videoTrack = liveStream?.getVideoTracks()[0] ?? null;
    if (!videoTrack) {
      warnedSelectionRef.current.source = null;
      return;
    }

    const handleEnded = () => {
      if (warnedSelectionRef.current.source === selectedSourceId) return;
      warnedSelectionRef.current.source = selectedSourceId;
      updateRecordingConfig({ selectedSourceId: null });
      if (status === 'recording' || status === 'countdown') {
        void window.roughcut.recordingSessionStop();
      }
      setStatus('idle');
      showToast({
        title: 'Capture source disconnected',
        message: 'The selected screen or window disappeared, so the session was stopped safely.',
        tone: 'warning',
      });
    };

    videoTrack.addEventListener('ended', handleEnded);
    return () => {
      videoTrack.removeEventListener('ended', handleEnded);
    };
  }, [liveStream, selectedSourceId, setStatus, showToast, status]);

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
        deviceStatus={`Mic: ${selectedMicName}`}
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
        <ModeSelectorRow
          mode={recordMode as RecordMode}
          onChange={(mode) => updateRecordingConfig({ recordMode: mode })}
        />
        {/* [DEBUG] Quick reload button — temporary for camera decode testing */}
        <button
          data-testid="debug-reload"
          onClick={handleDebugReload}
          style={{
            padding: '4px 10px',
            background: '#ff6b00',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          DEBUG: Reload Last
        </button>
        <div
          style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}
        />
        <BottomBar
          sourceName={selectedSourceName}
          onOpenSourcePicker={() => setIsSourcePickerOpen(true)}
          micName={selectedMicName}
          isMicMuted={!micEnabled}
          onToggleMicMute={() => updateRecordingConfig({ micEnabled: !micEnabled })}
          hasSystemAudio={true}
          isSystemAudioEnabled={sysAudioEnabled}
          onToggleSystemAudio={() => updateRecordingConfig({ sysAudioEnabled: !sysAudioEnabled })}
          hasCamera={true}
          isCameraEnabled={cameraEnabled}
          onToggleCamera={() => updateRecordingConfig({ cameraEnabled: !cameraEnabled })}
          recordState={recordState}
          onClickRecord={handleClickRecord}
          countdownValue={configuredCountdownSeconds}
          onSelectCountdown={(seconds) => updateRecordingConfig({ countdownSeconds: seconds })}
          countdownSeconds={countdownSeconds}
          elapsedSeconds={elapsedSeconds}
          resolutionLabel={`${resolution.width}×${resolution.height}`}
          fpsLabel={`${projectFps} fps`}
        />
      </div>

      <RecordDeviceSelectors
        micOptions={micOptions}
        selectedMicDeviceId={selectedMicDeviceId}
        onSelectMicDevice={(id) => updateRecordingConfig({ selectedMicDeviceId: id })}
        cameraOptions={cameraOptions}
        selectedCameraDeviceId={selectedCameraDeviceId}
        onSelectCameraDevice={(id) => updateRecordingConfig({ selectedCameraDeviceId: id })}
        systemAudioOptions={systemAudioOptions}
        selectedSystemAudioSourceId={selectedSystemAudioSourceId}
        onSelectSystemAudioSource={(id) =>
          updateRecordingConfig({ selectedSystemAudioSourceId: id })
        }
      />

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
                  activeRecordingAsset?.filePath ? (
                    <RecordingPlaybackVideo
                      filePath={activeRecordingAsset.filePath}
                      fps={projectFps}
                      assetId={activeRecordingAsset.id}
                      zoomMarkers={zoomPresentation.markers}
                      selectedZoomMarker={
                        selectedZoomMarkerId
                          ? (zoomPresentation.markers.find((m) => m.id === selectedZoomMarkerId) ??
                            null)
                          : null
                      }
                      onFocalPointChange={(markerId, focalPoint) => {
                        if (!activeRecordingId) return;
                        projectStore
                          .getState()
                          .updateRecordingZoomMarker(activeRecordingId, markerId, { focalPoint });
                      }}
                    />
                  ) : !hasRecordingAssets ? (
                    <LivePreviewCanvas stream={liveStream} />
                  ) : undefined
                }
                cameraContent={
                  cameraAsset?.filePath ? (
                    <CameraPlaybackCanvas
                      filePath={cameraAsset.filePath}
                      fps={projectFps}
                      clipTimelineIn={cameraClip?.timelineIn ?? 0}
                      clipSourceIn={cameraClip?.sourceIn ?? 0}
                    />
                  ) : undefined
                }
                cameraAspect={4 / 3}
                cameraPresentation={cameraPresentation}
                screenAspect={16 / 9}
                screenCornerRadius={background.bgCornerRadius}
                screenShadow={
                  background.bgShadowEnabled
                    ? `0 ${Math.round(background.bgShadowBlur * 0.2)}px ${background.bgShadowBlur}px rgba(0,0,0,${background.bgShadowOpacity ?? 0.25})`
                    : undefined
                }
                screenPadding={background.bgPadding}
                screenInset={background.bgInset}
                screenInsetColor={background.bgInsetColor}
                interactionEnabled={true}
                onRegionChange={handleRegionChange}
                screenRectOverride={screenRectOverride}
                cameraRectOverride={cameraRectOverride}
                screenCrop={screenCrop}
                cameraCrop={cameraCrop}
                cropRegion={cropTargetRegion}
                cropModeActive={cropModeActive}
                onCropModeChange={setCropModeActive}
                onScreenCropModeChange={handleScreenCropModeChange}
                onCameraCropModeChange={handleCameraCropModeChange}
                onScreenCropChange={handleScreenCropChange}
                onCameraCropChange={handleCameraCropChange}
                screenSourceWidth={resolution.width}
                screenSourceHeight={resolution.height}
                cameraSourceWidth={cameraSourceWidth}
                cameraSourceHeight={cameraSourceHeight}
                alignRef={alignRef}
                onRegionClick={setSelectedRegion}
                selectedRegion={selectedRegion}
              />
            </CardChrome>
          </PreviewStage>
        }
        inspector={
          <RecordRightPanel
            fps={projectFps}
            zoomMarkerCount={zoomPresentation.markers.length}
            zoomIntensity={zoomPresentation.autoIntensity}
            onZoomIntensityChange={handleZoomIntensityChange}
            canRegenerateAutoZoom={Boolean(cursorEventsPath)}
            onRegenerateAutoZoom={regenerateAutoZoomMarkers}
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
            cameraCrop={cameraCrop}
            onCameraCropChange={handleCameraCropChange}
            onCameraCropReset={handleCameraCropReset}
            screenSourceWidth={resolution.width}
            screenSourceHeight={resolution.height}
            cameraSourceWidth={cameraSourceWidth}
            cameraSourceHeight={cameraSourceHeight}
            cropModeActive={cropModeActive}
            cropTargetRegion={cropTargetRegion}
            onScreenCropModeChange={handleScreenCropModeChange}
            onCameraCropModeChange={handleCameraCropModeChange}
            selectedTemplateId={activeTemplate.id}
            onTemplateChange={handleTemplateChange}
            selectedRegion={selectedRegion}
            onAlign={handleAlign}
            preferredCategoryId={preferredInspectorCategoryId}
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

      {/* Zoom marker inspector (above timeline, only when a marker is selected) */}
      {selectedZoomMarkerId &&
        (() => {
          const marker = zoomPresentation.markers.find((m) => m.id === selectedZoomMarkerId);
          if (!marker || !activeRecordingId) return null;
          return (
            <div style={{ flexShrink: 0, background: '#050505' }}>
              <ZoomMarkerInspector
                marker={marker}
                fps={projectFps}
                onPatch={(patch) =>
                  projectStore
                    .getState()
                    .updateRecordingZoomMarker(activeRecordingId, marker.id, patch)
                }
                onDelete={() => {
                  projectStore.getState().removeRecordingZoomMarker(activeRecordingId, marker.id);
                  setSelectedZoomMarkerId(null);
                }}
                onDismiss={() => setSelectedZoomMarkerId(null)}
              />
            </div>
          );
        })()}

      {/* Timeline — full width, fixed height (fits ruler + zoom track + up to 5 clip tracks) */}
      <div
        style={{
          flexShrink: 0,
          height: 220,
          padding: '0 24px',
          marginBottom: 8,
          background: '#050505',
        }}
      >
        <RecordTimelineShell
          tracks={tracks}
          assets={assets}
          durationFrames={durationFrames}
          currentFrame={currentFrame}
          fps={projectFps}
          onScrub={handleTimelineScrub}
          activeAssetIds={selectedTimelineAssetId ? [selectedTimelineAssetId] : []}
          selectedAssetId={selectedTimelineAssetId}
          onSelectAsset={handleSelectTimelineAsset}
          zoomMarkers={zoomPresentation.markers}
          selectedZoomMarkerId={selectedZoomMarkerId}
          onAddZoomMarkerAtPlayhead={handleAddZoomMarkerAtPlayhead}
          onSelectZoomMarker={handleSelectZoomMarker}
          onResizeZoomMarker={(id, patch) => {
            if (!activeRecordingId) return;
            projectStore.getState().updateRecordingZoomMarker(activeRecordingId, id, patch);
          }}
        />
      </div>

      {isSourcePickerOpen && (
        <SourcePickerPopup
          sources={sources}
          selectedSourceId={selectedSourceId}
          recordMode={recordMode as RecordMode}
          onSelect={(id) => {
            updateRecordingConfig({ selectedSourceId: id });
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
