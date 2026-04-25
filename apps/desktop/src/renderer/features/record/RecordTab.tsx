/**
 * RecordTab: Presentation-focused timeline.
 * Responsible for: zoom keyframes, cursor styling, highlights, shortcut titles,
 * background/look presets. No clip edits (no cutting, trimming, reordering, track management).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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
  createDefaultRecordingPresentation,
  createDefaultRegionCrop,
  normalizeRegionCrop,
} from '@rough-cut/project-model';
import type {
  CursorPresentation,
  CameraPresentation,
  RegionCrop,
  CaptionSegment,
  AIAnnotationId,
} from '@rough-cut/project-model';
import { useRecordState } from './record-state.js';
import { useLivePreview } from './use-live-preview.js';
import { RecordScreenLayout } from './RecordScreenLayout.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { WorkspaceRow, RECORD_PANEL_WIDTH } from '../../ui/index.js';
import { useToast } from '../../ui/toast.js';
import type { RecordMode } from './ModeSelectorRow.js';
import { PreviewStage } from './PreviewStage.js';
import { CardChrome } from './CardChrome.js';
import { TemplatePreviewRenderer } from './TemplatePreviewRenderer.js';
import { RecordRightPanel } from './RecordRightPanel.js';
import type { BackgroundConfig } from './RecordRightPanel.js';
import { RecordTimelineShell } from './RecordTimelineShell.js';
import { ZoomMarkerInspector } from './ZoomMarkerInspector.js';
import { useCursorEvents } from '../../hooks/use-cursor-events.js';
import { generateAutoZoomMarkers, getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import { BottomBar } from './BottomBar.js';
import { SourcePickerPopup } from './SourcePickerPopup.js';
import type { DestinationPresetId } from './destination-presets.js';
import {
  getDestinationPreset,
  isDestinationPresetId,
  matchDestinationPreset,
} from './destination-presets.js';
import type { RecordState } from './BottomBar.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { RecordDeviceSelectors } from './RecordDeviceSelectors.js';
import {
  subscribeRecordingConfig,
  useRecordingConfig,
  updateRecordingConfig,
} from './recording-config.js';
import {
  getSelectedOptionLabel,
  useRecordingDeviceOptions,
} from './use-recording-device-options.js';
import { RecordingPlaybackVideo } from './RecordingPlaybackVideo.js';
import { CameraPlaybackCanvas } from './CameraPlaybackCanvas.js';
import { LAYOUT_TEMPLATES, resolutionForAspectRatio } from './templates.js';
import { inferCursorEventsPath, resolveProjectMediaPath } from '../../lib/media-sidecars.js';
import type { LayoutTemplate } from './templates.js';
import type { Rect } from './template-layout/types.js';
import type { Alignment } from './snap-guides.js';
import type {
  RecordingPreflightStatus,
  RecordingRecoveryMarker,
  RecordingSessionConnectionIssues,
} from '../../env.js';

const DEFAULT_BACKGROUND: BackgroundConfig = {
  bgColor: '#050505',
  bgGradient: null,
  bgPadding: 0,
  bgCornerRadius: 0,
  bgInset: 0,
  bgInsetColor: '#ffffff',
  bgShadowEnabled: false,
  bgShadowBlur: 0,
};

function getActiveCameraLayoutSnapshot(
  markers:
    | readonly {
        frame: number;
        camera: CameraPresentation;
        cameraFrame?: Rect;
        templateId?: string;
      }[]
    | undefined,
  playheadFrame: number,
) {
  if (!markers || markers.length === 0) return null;
  return (
    [...markers]
      .filter((marker) => marker.frame <= playheadFrame)
      .sort((left, right) => right.frame - left.frame)[0] ?? null
  );
}

function getTemplateById(templateId: string | undefined, fallback: LayoutTemplate): LayoutTemplate {
  if (!templateId) return fallback;
  return LAYOUT_TEMPLATES.find((template) => template.id === templateId) ?? fallback;
}

interface RecordTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

type RuntimeCheck = {
  label: string;
  status: 'ready' | 'warning';
  detail: string;
};

function normalizeSupportedRecordMode(recordMode: RecordMode): Exclude<RecordMode, 'region'> {
  return recordMode === 'window' ? 'window' : 'fullscreen';
}

function getExpectedSourceType(recordMode: RecordMode): 'screen' | 'window' {
  return normalizeSupportedRecordMode(recordMode) === 'window' ? 'window' : 'screen';
}

function getRecordModeSourceLabel(recordMode: RecordMode): string {
  if (normalizeSupportedRecordMode(recordMode) === 'window') return 'window';
  return 'screen';
}

function getPreviewSelectionLabel(recordMode: RecordMode): string {
  return normalizeSupportedRecordMode(recordMode) === 'window' ? 'window' : 'screen';
}

export function RecordTab({ activeTab, onTabChange }: RecordTabProps) {
  const { showToast } = useToast();
  const recordShellOnly =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('record-shell-only') === '1';
  const recordUltraMinimal =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('record-ultra-minimal') === '1';
  const recordStoreOnly =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('record-store-only') === '1';
  const recordRuntimeHooks =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('record-runtime-hooks') === '1';
  const recordChromeOnly =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('record-chrome-only') === '1';
  const recordWorkspaceOnly =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('record-workspace-only') === '1';
  // Preflight state values are currently only read back indirectly via the
  // diagnostics callbacks; their UI consumers were removed mid-refactor and
  // tracked separately. Setters remain in use below.
  const [, setPreflightDiagnostics] = useState<RecordingPreflightStatus | null>(null);
  const [, setPreflightRuntimeChecks] = useState<RuntimeCheck[]>([]);
  const [, setPreflightRunning] = useState(false);
  const [recordingRecovery, setRecordingRecovery] = useState<RecordingRecoveryMarker | null>(null);
  const [sessionConnectionIssues, setSessionConnectionIssues] =
    useState<RecordingSessionConnectionIssues | null>(null);
  const [sourceRecoveryMessage, setSourceRecoveryMessage] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [isFloatingPanelActive, setIsFloatingPanelActive] = useState(false);
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
  const playheadFrame = useTransportStore((s) => s.playheadFrame);

  if (recordUltraMinimal) {
    return (
      <RecordScreenLayout>
        <AppHeader
          activeTab={activeTab}
          onTabChange={onTabChange}
          projectName="Rough Cut"
          onProjectNameChange={() => {}}
          captureSummary="1920×1080 · 30 fps"
          deviceStatus="Mic: Default"
        />
        <div
          data-testid="record-tab-root"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050505',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 14,
          }}
        >
          Record ultra minimal
        </div>
      </RecordScreenLayout>
    );
  }

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

  const { state, setSources, setStatus, setError, reset } = useRecordState();

  const { sources, status, error, elapsedMs } = state;
  const recordMode = useRecordingConfig((s) => s.recordMode);
  const supportedRecordMode = normalizeSupportedRecordMode(recordMode as RecordMode);
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
  const previousSelectedSourceIdRef = useRef<string | null>(null);
  const modeClearedSourceSelectionRef = useRef(false);
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
  const persistedDestinationPresetId = useProjectStore(
    (s) => s.project.settings.destinationPresetId,
  );
  const exportResolutionWidth = useProjectStore((s) => s.project.exportSettings.resolution.width);
  const exportResolutionHeight = useProjectStore((s) => s.project.exportSettings.resolution.height);
  const exportFrameRate = useProjectStore((s) => s.project.exportSettings.frameRate);
  const exportBitrate = useProjectStore((s) => s.project.exportSettings.bitrate);
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
  const hasRecordedTake = assets.some(
    (asset) => asset.type === 'recording' && asset.filePath.trim().length > 0,
  );
  const captionSegments = useProjectStore((s) => s.project.aiAnnotations.captionSegments);
  const captionStyle = useProjectStore((s) => s.project.aiAnnotations.captionStyle);
  const recordCaptionSegments = activeRecordingId
    ? captionSegments.filter((seg) => seg.assetId === activeRecordingId)
    : ([] as CaptionSegment[]);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [recordCaptionError, setRecordCaptionError] = useState<string | null>(null);
  const activeRecordingPresentation = useProjectStore((s) => {
    if (!activeRecordingId) return null;
    return s.project.assets.find((asset) => asset.id === activeRecordingId)?.presentation ?? null;
  });
  const zoomPresentation = activeRecordingPresentation?.zoom ?? createDefaultZoomPresentation();
  const activeZoomScale = activeRecordingAsset?.filePath
    ? getZoomTransformAtFrame(playheadFrame, zoomPresentation.markers).scale
    : 1;
  const activeCameraLayoutSnapshot = getActiveCameraLayoutSnapshot(
    (activeRecordingPresentation as { cameraLayouts?: unknown } | null)?.cameraLayouts as
      | readonly {
          frame: number;
          camera: CameraPresentation;
          cameraFrame?: Rect;
          templateId?: string;
        }[]
      | undefined,
    playheadFrame,
  );
  const persistedTemplateId = activeRecordingPresentation?.templateId;
  const effectiveTemplate = getTemplateById(activeCameraLayoutSnapshot?.templateId, activeTemplate);
  const persistedDestinationPreset = isDestinationPresetId(persistedDestinationPresetId)
    ? getDestinationPreset(persistedDestinationPresetId)
    : null;
  const inferredDestinationPresetId =
    matchDestinationPreset({
      templateId: effectiveTemplate.id,
      captureResolution: resolution,
      exportSettings: {
        resolution: { width: exportResolutionWidth, height: exportResolutionHeight },
        frameRate: exportFrameRate,
        bitrate: exportBitrate,
      },
    })?.id ?? null;
  const selectedDestinationPresetId =
    persistedDestinationPreset?.id ?? inferredDestinationPresetId ?? null;
  const cursorPresentation =
    activeRecordingPresentation?.cursor ?? createDefaultCursorPresentation();
  // screenCrop from store is read but we use local state for immediate responsiveness
  // (store crop requires an active recording asset which may not exist yet)

  // Camera playback — find the camera asset linked to the active recording
  // (still needed so the compositor can find the camera asset)
  const cameraAsset = useProjectStore((s) => {
    if (!activeRecordingAsset?.cameraAssetId) return null;
    return s.project.assets.find((a) => a.id === activeRecordingAsset.cameraAssetId) ?? null;
  });
  const cameraSourceWidth = (cameraAsset?.metadata?.width as number) || 1920;
  const cameraSourceHeight = (cameraAsset?.metadata?.height as number) || 1080;
  const screenSourceWidth = (activeRecordingAsset?.metadata?.width as number) || resolution.width;
  const screenSourceHeight =
    (activeRecordingAsset?.metadata?.height as number) || resolution.height;

  // Background/canvas config (lifted from RecordRightPanel so LivePreviewVideo can consume it)
  const [background, setBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);
  const [cameraPresentation, setCameraPresentation] = useState<CameraPresentation>(() =>
    createDefaultCameraPresentation(),
  );

  // Crop state — local like background, works without a recording asset
  const [screenCrop, setScreenCrop] = useState<RegionCrop>(() =>
    createDefaultRegionCrop(screenSourceWidth, screenSourceHeight),
  );

  useEffect(() => {
    if (activeCameraLayoutSnapshot?.camera) {
      setCameraPresentation(activeCameraLayoutSnapshot.camera);
      return;
    }
    if (!activeRecordingAsset?.presentation?.camera) return;
    setCameraPresentation(activeRecordingAsset.presentation.camera);
  }, [
    activeCameraLayoutSnapshot?.camera,
    activeRecordingAsset?.id,
    activeRecordingAsset?.presentation?.camera,
  ]);
  const [cameraCrop, setCameraCrop] = useState<RegionCrop>(() => createDefaultRegionCrop());
  const effectiveCameraPresentation = activeCameraLayoutSnapshot?.camera ?? cameraPresentation;
  const effectiveCameraRectOverride = activeCameraLayoutSnapshot?.cameraFrame ?? cameraRectOverride;

  useEffect(() => {
    setActiveTemplate(getTemplateById(persistedTemplateId, defaultTemplate));
  }, [activeRecordingId, defaultTemplate, persistedTemplateId]);

  useEffect(() => {
    setCameraRectOverride(undefined);
  }, [activeRecordingId]);

  const handleBackgroundChange = useCallback((patch: Partial<BackgroundConfig>) => {
    setBackground((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleBackgroundReset = useCallback(() => {
    setBackground(DEFAULT_BACKGROUND);
  }, []);

  useEffect(() => {
    return subscribeRecordingConfig((nextState, previousState) => {
      if (nextState.selectedSourceId) {
        previousSelectedSourceIdRef.current = nextState.selectedSourceId;
        return;
      }

      if (previousState.selectedSourceId) {
        previousSelectedSourceIdRef.current = previousState.selectedSourceId;
      }
    });
  }, []);

  useEffect(() => {
    void window.roughcut
      .recordingRecoveryGet()
      .then((marker) => setRecordingRecovery(marker))
      .catch(() => setRecordingRecovery(null));
  }, []);

  const _runRecordingPreflight = useCallback(async () => {
    setPreflightRunning(true);
    try {
      const [diagnostics, captureSources, devices, nextSystemAudioOptions] = await Promise.all([
        window.roughcut.recordingGetPreflightStatus(),
        window.roughcut.recordingGetSources().catch(() => []),
        navigator.mediaDevices?.enumerateDevices?.().catch(() => []) ?? Promise.resolve([]),
        window.roughcut.recordingGetSystemAudioSources().catch(() => []),
      ]);

      const micCount = devices.filter((device) => device.kind === 'audioinput').length;
      const cameraCount = devices.filter((device) => device.kind === 'videoinput').length;

      setPreflightDiagnostics(diagnostics);
      setPreflightRuntimeChecks([
        {
          label: 'Capture sources',
          status: captureSources.length > 0 ? 'ready' : 'warning',
          detail:
            captureSources.length > 0
              ? `${captureSources.length} source${captureSources.length === 1 ? '' : 's'} visible`
              : 'No screens or windows were enumerated',
        },
        {
          label: 'Microphones',
          status: micCount > 0 ? 'ready' : 'warning',
          detail:
            micCount > 0
              ? `${micCount} input${micCount === 1 ? '' : 's'} detected`
              : 'No microphone inputs detected',
        },
        {
          label: 'Cameras',
          status: cameraCount > 0 ? 'ready' : 'warning',
          detail:
            cameraCount > 0
              ? `${cameraCount} camera${cameraCount === 1 ? '' : 's'} detected`
              : 'No camera devices detected',
        },
        {
          label: 'System audio routes',
          status: nextSystemAudioOptions.length > 0 ? 'ready' : 'warning',
          detail:
            nextSystemAudioOptions.length > 0
              ? `${nextSystemAudioOptions.length} route${nextSystemAudioOptions.length === 1 ? '' : 's'} available`
              : 'No loopback/system audio route was discovered',
        },
      ]);

      showToast({
        title: 'Preflight complete',
        message: 'Recording diagnostics were refreshed for this setup.',
        tone: 'info',
      });
    } catch (err) {
      showToast({
        title: 'Preflight failed',
        message: err instanceof Error ? err.message : String(err),
        tone: 'error',
      });
    } finally {
      setPreflightRunning(false);
    }
  }, [showToast]);

  const _handleOpenPermissionSettings = useCallback(
    async (kind: 'screenCapture' | 'microphone' | 'camera') => {
      const result = await window.roughcut.recordingOpenPermissionSettings(kind);
      showToast({
        title: result.opened ? 'Opened system settings' : 'Settings link unavailable',
        message: result.message,
        tone: result.opened ? 'info' : 'warning',
      });

      if (result.requiresFullRelaunch) {
        showToast({
          title: 'Relaunch required',
          message: 'Permissions updated — fully quit and reopen Rough Cut before testing again.',
          tone: 'warning',
          durationMs: 7000,
        });
      }
    },
    [showToast],
  );
  // Orphaned during a mid-session refactor — implementations retained for
  // a planned rewire. Void references satisfy tsc noUnusedLocals without
  // altering behaviour. Remove the void block once the callbacks get wired
  // back into the UI.
  void _runRecordingPreflight;
  void _handleOpenPermissionSettings;

  const handleTemplateChange = useCallback(
    (template: LayoutTemplate) => {
      setActiveTemplate(template);
      setScreenRectOverride(undefined);
      setCameraRectOverride(undefined);
      setCropModeActive(false);
      if (activeRecordingId) {
        projectStore.getState().updateProject((doc) => ({
          ...doc,
          assets: doc.assets.map((asset) =>
            asset.id === activeRecordingId
              ? {
                  ...asset,
                  presentation: {
                    ...(asset.presentation ?? createDefaultRecordingPresentation()),
                    templateId: template.id,
                    cameraFrame: undefined,
                  },
                }
              : asset,
          ),
          settings: {
            ...doc.settings,
            destinationPresetId: null,
          },
        }));
      }
      setScreenCrop(
        createDefaultRegionCrop(
          resolutionForAspectRatio(template.aspectRatio).width,
          resolutionForAspectRatio(template.aspectRatio).height,
        ),
      );
    },
    [activeRecordingId],
  );

  const handleDestinationPresetChange = useCallback(
    (presetId: DestinationPresetId) => {
      const preset = getDestinationPreset(presetId);
      if (!preset) return;
      const template = getTemplateById(preset.templateId, defaultTemplate);
      updateProject((doc) => ({
        ...doc,
        settings: {
          ...doc.settings,
          resolution: { ...preset.captureResolution },
          destinationPresetId: preset.id,
        },
        exportSettings: {
          ...doc.exportSettings,
          resolution: { ...preset.exportResolution },
          frameRate: preset.exportFrameRate,
          bitrate: preset.exportBitrate,
        },
      }));
      handleTemplateChange(template);
    },
    [defaultTemplate, handleTemplateChange, updateProject],
  );

  const handleRegionChange = useCallback((region: 'screen' | 'camera', rect: Rect) => {
    if (region === 'screen') setScreenRectOverride(rect);
    else setCameraRectOverride(rect);
  }, []);

  const handleCameraNormalizedFrameChange = useCallback(
    (cameraFrame: { x: number; y: number; w: number; h: number }) => {
      if (!activeRecordingId) return;
      projectStore.getState().updateProject((doc) => ({
        ...doc,
        assets: doc.assets.map((asset) =>
          asset.id === activeRecordingId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? createDefaultRecordingPresentation()),
                  cameraFrame,
                },
              }
            : asset,
        ),
      }));
    },
    [activeRecordingId],
  );

  const selectedSourceName = sources.find((s) => s.id === selectedSourceId)?.name ?? null;
  const expectedSourceType = getExpectedSourceType(supportedRecordMode);
  const modeCompatibleSources = sources.filter((source) => source.type === expectedSourceType);
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const hasValidSelectedSource = Boolean(
    selectedSource && selectedSource.type === expectedSourceType,
  );

  // Live preview stream — acquired when a valid source is selected, independent of recording
  const {
    stream: liveStream,
    status: livePreviewStatus,
    error: livePreviewError,
  } = useLivePreview(
    !isFloatingPanelActive && hasValidSelectedSource ? selectedSourceId : null,
  );

  if (recordRuntimeHooks) {
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
        <div
          data-testid="record-tab-root"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050505',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 14,
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div>Record runtime hooks</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            preview: {livePreviewStatus} · sources: {sources.length} · mics: {micOptions.length} · cameras:{' '}
            {cameraOptions.length} · outputs: {systemAudioOptions.length}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            source: {selectedSourceId ?? 'none'} · error: {livePreviewError ?? error ?? 'none'}
          </div>
        </div>
      </RecordScreenLayout>
    );
  }

  // UI state

  const handleZoomIntensityChange = useCallback(
    (value: number) => {
      if (!activeRecordingId) return;
      projectStore.getState().setRecordingAutoZoomIntensity(activeRecordingId, value);
    },
    [activeRecordingId],
  );

  const handleZoomFollowCursorChange = useCallback(
    (followCursor: boolean) => {
      if (!activeRecordingId) return;
      projectStore.getState().updateRecordingZoomSettings(activeRecordingId, { followCursor });
    },
    [activeRecordingId],
  );

  const handleZoomFollowAnimationChange = useCallback(
    (followAnimation: 'focused' | 'smooth') => {
      if (!activeRecordingId) return;
      projectStore.getState().updateRecordingZoomSettings(activeRecordingId, { followAnimation });
    },
    [activeRecordingId],
  );

  const handleZoomFollowPaddingChange = useCallback(
    (followPadding: number) => {
      if (!activeRecordingId) return;
      projectStore.getState().updateRecordingZoomSettings(activeRecordingId, {
        followPadding: Math.min(0.3, Math.max(0, followPadding)),
      });
    },
    [activeRecordingId],
  );

  const [selectedZoomMarkerId, setSelectedZoomMarkerId] = useState<
    import('@rough-cut/project-model').ZoomMarkerId | null
  >(null);
  const [selectedCameraLayoutMarkerId, setSelectedCameraLayoutMarkerId] = useState<string | null>(
    null,
  );

  const selectedTimelineAssetId =
    (selectedRegion === 'camera' ? cameraAsset?.id : activeRecordingId) ??
    activeRecordingId ??
    cameraAsset?.id ??
    null;
  const preferredInspectorCategoryId = selectedZoomMarkerId
    ? 'zoom'
    : selectedCameraLayoutMarkerId
      ? 'camera'
      : selectedRegion === 'camera' || selectedTimelineAssetId === cameraAsset?.id
        ? 'camera'
        : 'crop';

  const handleAddZoomMarkerAtPlayhead = useCallback(() => {
    if (!activeRecordingId || durationFrames <= 0) return;
    const currentFrame = transportStore.getState().playheadFrame;
    // Default: 1 second, capped so there's always room, but never more than half the recording
    const preferredDuration = Math.round(projectFps * 1);
    const maxDuration = Math.max(projectFps, Math.floor(durationFrames / 2));
    const defaultDuration = Math.min(preferredDuration, maxDuration);
    const startFrame = Math.max(0, Math.min(currentFrame, durationFrames - defaultDuration));
    const endFrame = Math.min(startFrame + defaultDuration, durationFrames);
    projectStore.getState().addRecordingZoomMarker(activeRecordingId, startFrame, endFrame);
  }, [activeRecordingId, projectFps, durationFrames]);

  const handleCreateZoomFromScreenFocus = useCallback(
    (crop: RegionCrop) => {
      if (
        !activeRecordingId ||
        durationFrames <= 0 ||
        screenSourceWidth <= 0 ||
        screenSourceHeight <= 0
      ) {
        return;
      }

      const currentFrame = transportStore.getState().playheadFrame;
      const preferredDuration = Math.round(projectFps * 1.25);
      const maxDuration = Math.max(projectFps, Math.floor(durationFrames / 2));
      const markerDuration = Math.min(preferredDuration, maxDuration);
      const startFrame = Math.max(0, Math.min(currentFrame, durationFrames - markerDuration));
      const endFrame = Math.min(startFrame + markerDuration, durationFrames);
      const centerX = (crop.x + crop.width / 2) / screenSourceWidth;
      const centerY = (crop.y + crop.height / 2) / screenSourceHeight;
      const scaleFromCrop = Math.min(
        screenSourceWidth / crop.width,
        screenSourceHeight / crop.height,
      );
      const strength = Math.max(0, Math.min(1, (Math.min(scaleFromCrop, 2.5) - 1) / 1.5));

      const store = projectStore.getState();
      store.addRecordingZoomMarker(activeRecordingId, startFrame, endFrame);

      const updatedAsset = store.project.assets.find((asset) => asset.id === activeRecordingId);
      const newMarker = [...(updatedAsset?.presentation?.zoom.markers ?? [])]
        .filter((marker) => marker.kind === 'manual')
        .at(-1);

      if (!newMarker) return;

      store.updateRecordingZoomMarker(activeRecordingId, newMarker.id, {
        focalPoint: {
          x: Math.max(0, Math.min(1, centerX)),
          y: Math.max(0, Math.min(1, centerY)),
        },
        strength,
      });
      setSelectedZoomMarkerId(newMarker.id);
      setSelectedCameraLayoutMarkerId(null);
      setSelectedRegion('screen');
      setCropTargetRegion('screen');
      setCropModeActive(false);
    },
    [activeRecordingId, durationFrames, projectFps, screenSourceHeight, screenSourceWidth],
  );

  const handleSelectZoomMarker = useCallback(
    (id: import('@rough-cut/project-model').ZoomMarkerId | null) => {
      setSelectedZoomMarkerId(id);
      setSelectedCameraLayoutMarkerId(null);
    },
    [],
  );

  const handleSelectCameraLayoutMarker = useCallback((id: string | null) => {
    setSelectedCameraLayoutMarkerId(id);
    setSelectedZoomMarkerId(null);
    if (id) {
      setSelectedRegion('camera');
    }
  }, []);

  const handleDeleteSelectedCameraLayoutMarker = useCallback(() => {
    if (!activeRecordingId || !selectedCameraLayoutMarkerId) return;
    const store = projectStore.getState() as unknown as {
      removeRecordingCameraLayoutSnapshot?: (assetId: string, markerId: string) => void;
    };
    store.removeRecordingCameraLayoutSnapshot?.(activeRecordingId, selectedCameraLayoutMarkerId);
    setSelectedCameraLayoutMarkerId(null);
  }, [activeRecordingId, selectedCameraLayoutMarkerId]);

  const handleUpdateRecordCaptionText = useCallback((id: AIAnnotationId, text: string) => {
    projectStore.getState().updateCaptionText(id, text);
  }, []);

  const handleUpdateRecordCaptionStyle = useCallback(
    (
      patch: Partial<{
        fontSize: number;
        position: 'bottom' | 'center';
        backgroundOpacity: number;
      }>,
    ) => {
      const store = projectStore.getState() as unknown as {
        updateCaptionStyle?: (next: typeof patch) => void;
      };
      store.updateCaptionStyle?.(patch);
    },
    [],
  );

  const handleGenerateRecordCaptions = useCallback(async () => {
    if (!activeRecordingAsset?.filePath || !activeRecordingId) return;

    setIsGeneratingCaptions(true);
    setRecordCaptionError(null);
    try {
      const testOverrides = (
        window as unknown as {
          __roughcutTestOverrides?: {
            aiGetProviderConfig?: () => Promise<{ provider: string }>;
            aiGetApiKey?: (provider: string) => Promise<string>;
            aiAnalyzeCaptions?: (
              assets: Array<{ id: string; filePath: string }>,
              fps: number,
            ) => Promise<CaptionSegment[]>;
          };
        }
      ).__roughcutTestOverrides;

      const { provider } = testOverrides?.aiGetProviderConfig
        ? await testOverrides.aiGetProviderConfig()
        : await window.roughcut.aiGetProviderConfig();
      const apiKey = testOverrides?.aiGetApiKey
        ? await testOverrides.aiGetApiKey(provider)
        : await window.roughcut.aiGetApiKey(provider);
      if (!apiKey) {
        throw new Error(
          `No API key configured for provider "${provider}". Set it in the AI tab first.`,
        );
      }

      const segments = testOverrides?.aiAnalyzeCaptions
        ? await testOverrides.aiAnalyzeCaptions(
            [{ id: activeRecordingId, filePath: activeRecordingAsset.filePath }],
            projectFps,
          )
        : await window.roughcut.aiAnalyzeCaptions(
            [{ id: activeRecordingId, filePath: activeRecordingAsset.filePath }],
            projectFps,
          );
      const store = projectStore.getState() as unknown as {
        replaceCaptionSegmentsForAsset?: (assetId: string, segments: CaptionSegment[]) => void;
        addCaptionSegments?: (segments: CaptionSegment[]) => void;
      };
      if (store.replaceCaptionSegmentsForAsset) {
        store.replaceCaptionSegmentsForAsset(
          activeRecordingId,
          segments as unknown as CaptionSegment[],
        );
      } else {
        store.addCaptionSegments?.(segments as unknown as CaptionSegment[]);
      }
    } catch (err) {
      setRecordCaptionError(err instanceof Error ? err.message : 'Caption generation failed');
    } finally {
      setIsGeneratingCaptions(false);
    }
  }, [activeRecordingAsset?.filePath, activeRecordingId, projectFps]);

  const handleSelectTimelineAsset = useCallback(
    (assetId: string) => {
      setSelectedZoomMarkerId(null);
      setSelectedCameraLayoutMarkerId(null);
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
  const cursorEventsPath = inferCursorEventsPath(
    activeRecordingAsset?.filePath ?? null,
    activeRecordingAsset?.metadata?.cursorEventsPath as string | null,
    projectFilePath,
  );
  const sourceWidth = (activeRecordingAsset?.metadata?.width as number) || 1920;
  const sourceHeight = (activeRecordingAsset?.metadata?.height as number) || 1080;
  const autoCursorEvents = useCursorEvents(cursorEventsPath, sourceWidth, sourceHeight);

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
      followCursor: zoomPresentation.followCursor,
      followAnimation: zoomPresentation.followAnimation,
      followPadding: zoomPresentation.followPadding,
      markers: zoomPresentation.markers,
    };
    const handle = setTimeout(() => {
      void window.roughcut
        .zoomSaveSidecar(recordingFilePath, payload)
        .catch((err: unknown) => console.warn('[zoom-sidecar] save failed:', err));
    }, 500);
    return () => clearTimeout(handle);
  }, [
    recordingFilePath,
    zoomPresentation.autoIntensity,
    zoomPresentation.followAnimation,
    zoomPresentation.followCursor,
    zoomPresentation.followPadding,
    zoomPresentation.markers,
  ]);

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

      const shapeOrAspectChanged =
        Object.prototype.hasOwnProperty.call(patch, 'shape') ||
        Object.prototype.hasOwnProperty.call(patch, 'aspectRatio');

      if (shapeOrAspectChanged) {
        setCameraRectOverride(undefined);
        projectStore.getState().updateProject((doc) => ({
          ...doc,
          assets: doc.assets.map((asset) =>
            asset.id === activeRecordingId
              ? {
                  ...asset,
                  presentation: {
                    ...(asset.presentation ?? createDefaultRecordingPresentation()),
                    camera: {
                      ...((asset.presentation ?? createDefaultRecordingPresentation()).camera ??
                        createDefaultCameraPresentation()),
                      ...patch,
                    },
                    cameraFrame: undefined,
                  },
                }
              : asset,
          ),
        }));
        return;
      }

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

  const handleAddCameraLayoutSnapshot = useCallback(() => {
    if (!activeRecordingId) return;
    const store = projectStore.getState() as unknown as {
      project: {
        assets: ReadonlyArray<{ id: string; presentation?: { camera?: CameraPresentation } }>;
      };
      addRecordingCameraLayoutSnapshot?: Function;
    };
    const liveAsset = store.project.assets.find((asset) => asset.id === activeRecordingId);
    const snapshotCamera = liveAsset?.presentation?.camera ?? effectiveCameraPresentation;
    store.addRecordingCameraLayoutSnapshot?.(activeRecordingId, playheadFrame, {
      camera: snapshotCamera,
      templateId: activeTemplate.id,
    });
  }, [
    activeRecordingId,
    playheadFrame,
    effectiveCameraPresentation,
    effectiveCameraRectOverride,
    activeTemplate.id,
  ]);

  const handleAddCameraLayoutPreset = useCallback(
    (preset: 'hide-camera' | 'top-left' | 'presentation' | 'talking-head') => {
      if (!activeRecordingId) return;
      const frame = playheadFrame;
      const store = projectStore.getState() as unknown as {
        project: {
          assets: ReadonlyArray<{ id: string; presentation?: { camera?: CameraPresentation } }>;
        };
        addRecordingCameraLayoutSnapshot?: Function;
        updateRecordingCameraLayoutSnapshot?: Function;
      };
      const liveAsset = store.project.assets.find((asset) => asset.id === activeRecordingId);
      const baseCamera = liveAsset?.presentation?.camera ?? effectiveCameraPresentation;

      const presetConfig =
        preset === 'hide-camera'
          ? { camera: { ...baseCamera, visible: false }, templateId: activeTemplate.id }
          : preset === 'top-left'
            ? {
                camera: { ...baseCamera, visible: true, position: 'corner-tl' as const },
                templateId: activeTemplate.id,
              }
            : preset === 'presentation'
              ? {
                  camera: {
                    ...baseCamera,
                    visible: true,
                    shape: 'rounded' as const,
                    aspectRatio: '16:9' as const,
                    position: 'center' as const,
                    size: 100,
                  },
                  templateId: 'presentation-16x9',
                }
              : {
                  camera: {
                    ...baseCamera,
                    visible: true,
                    shape: 'rounded' as const,
                    aspectRatio: '16:9' as const,
                    position: 'center' as const,
                    size: 100,
                  },
                  templateId: 'talking-head',
                };

      if (selectedCameraLayoutMarkerId) {
        store.updateRecordingCameraLayoutSnapshot?.(
          activeRecordingId,
          selectedCameraLayoutMarkerId,
          presetConfig,
        );
      } else {
        store.addRecordingCameraLayoutSnapshot?.(activeRecordingId, frame, presetConfig);
      }
    },
    [
      activeRecordingId,
      playheadFrame,
      effectiveCameraPresentation,
      activeTemplate.id,
      selectedCameraLayoutMarkerId,
    ],
  );

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
    const def = createDefaultRegionCrop(screenSourceWidth, screenSourceHeight);
    setScreenCrop(def);
    if (activeRecordingId) {
      projectStore.getState().resetScreenCrop(activeRecordingId);
    }
  }, [screenSourceWidth, screenSourceHeight, activeRecordingId]);

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
      normalizeRegionCrop(
        activeRecordingAsset?.presentation?.screenCrop,
        screenSourceWidth,
        screenSourceHeight,
        resolution.width,
        resolution.height,
      ) ?? createDefaultRegionCrop(screenSourceWidth, screenSourceHeight),
    );
    setCameraCrop(
      normalizeRegionCrop(
        activeRecordingAsset?.presentation?.cameraCrop,
        cameraSourceWidth,
        cameraSourceHeight,
      ) ?? createDefaultRegionCrop(cameraSourceWidth, cameraSourceHeight),
    );
  }, [
    activeRecordingAsset?.id,
    activeRecordingAsset?.presentation?.screenCrop,
    activeRecordingAsset?.presentation?.cameraCrop,
    resolution.width,
    resolution.height,
    screenSourceWidth,
    screenSourceHeight,
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
    const refreshSources = () => {
      void loadSources();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshSources();
      }
    };

    window.addEventListener('focus', refreshSources);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshSources);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadSources]);

  useEffect(() => {
    if (recordMode !== 'region') return;
    updateRecordingConfig({ recordMode: 'fullscreen' });
  }, [recordMode]);

  useEffect(() => {
    if (!selectedSourceId) return;

    const expectedType = getExpectedSourceType(supportedRecordMode);
    const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
    if (!selectedSource || selectedSource.type === expectedType) return;

    modeClearedSourceSelectionRef.current = true;
    updateRecordingConfig({ selectedSourceId: null });
  }, [selectedSourceId, sources, supportedRecordMode]);

  useEffect(() => {
    const previousSelectedSourceId = previousSelectedSourceIdRef.current;
    if (selectedSourceId) {
      previousSelectedSourceIdRef.current = selectedSourceId;
      setSourceRecoveryMessage(null);
      return;
    }

    if (modeClearedSourceSelectionRef.current) {
      modeClearedSourceSelectionRef.current = false;
      setSourceRecoveryMessage(null);
      return;
    }

    if (previousSelectedSourceId) {
      setSourceRecoveryMessage(
        sources.length > 0
          ? 'The previously selected screen or window is no longer available.'
          : 'The previously selected screen or window is gone, and no capture sources are currently available.',
      );
    }
  }, [selectedSourceId, sources, supportedRecordMode]);

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

  const recordStartGuardReason = hasValidSelectedSource
    ? null
    : modeCompatibleSources.length === 0
      ? `No ${getRecordModeSourceLabel(supportedRecordMode)} is available. Refresh sources or switch record mode.`
      : selectedSourceId
        ? `Choose a different ${getRecordModeSourceLabel(supportedRecordMode)} before recording.`
        : `Choose a ${getRecordModeSourceLabel(supportedRecordMode)} before recording.`;
  const recordButtonDisabled =
    status !== 'recording' &&
    (status === 'stopping' || status === 'loading-sources' || status === 'countdown');

  const recordState: RecordState =
    status === 'recording' ? 'recording' : status === 'countdown' ? 'countdown' : 'idle';

  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  const openRecordingSetupPanel = useCallback(() => {
    void window.roughcut.openRecordingPanel();
  }, []);

  const handleClickRecord = useCallback(() => {
    if (status === 'recording') {
      void window.roughcut.recordingSessionStop();
      return;
    }

    if (recordButtonDisabled) {
      if (recordStartGuardReason) {
        showToast({
          title: 'Recording setup unavailable',
          message: recordStartGuardReason,
          tone: 'warning',
        });
      }
      return;
    }

    openRecordingSetupPanel();
  }, [openRecordingSetupPanel, recordButtonDisabled, recordStartGuardReason, showToast, status]);

  useEffect(() => {
    const unsubCountdown = window.roughcut.onSessionCountdownTick((seconds) => {
      setCountdownSeconds(seconds);
      setStatus('countdown');
    });

    const unsubStatus = window.roughcut.onSessionStatusChanged((sessionStatus) => {
      setIsFloatingPanelActive(sessionStatus !== 'idle');
      if (sessionStatus === 'recording') {
        setStatus('recording');
      } else if (sessionStatus === 'stopping') {
        setStatus('stopping');
      } else if (sessionStatus === 'idle') {
        setStatus('idle');
        setCountdownSeconds(0);
      }
    });

    const unsubConnectionIssues = window.roughcut.onSessionConnectionIssuesChanged((issues) => {
      setSessionConnectionIssues(issues);
    });

    return () => {
      unsubCountdown();
      unsubStatus();
      unsubConnectionIssues();
    };
  }, [setStatus]);

  const sessionIssueMessage = sessionConnectionIssues?.source
    ? sessionConnectionIssues.source
    : sessionConnectionIssues?.mic
      ? sessionConnectionIssues.mic
      : sessionConnectionIssues?.camera
        ? sessionConnectionIssues.camera
        : (sessionConnectionIssues?.systemAudio ?? null);

  const previewModeBadge = activeRecordingAsset?.filePath
    ? 'Saved take'
    : livePreviewStatus === 'live' && hasValidSelectedSource
      ? 'Live source preview'
      : null;

  const previewOverlay = activeRecordingAsset?.filePath
    ? null
    : (() => {
        const previewSelectionLabel = getPreviewSelectionLabel(supportedRecordMode);
        if (!hasValidSelectedSource) {
          return {
            title: sourceRecoveryMessage
              ? 'Source unavailable'
              : `Choose a ${previewSelectionLabel} to preview`,
            detail:
              sourceRecoveryMessage ??
              `Choose the ${previewSelectionLabel} that Rough Cut should capture before you record.`,
            tone: sourceRecoveryMessage ? '#fcd34d' : 'rgba(255,255,255,0.86)',
          };
        }

        if (livePreviewStatus === 'acquiring') {
          return {
            title: 'Acquiring live preview',
            detail: `Rough Cut is connecting ${selectedSourceName ? `"${selectedSourceName}"` : 'the selected source'} before recording starts.`,
            tone: 'rgba(255,255,255,0.86)',
          };
        }

        if (livePreviewStatus === 'failed') {
          return {
            title: 'Preview unavailable',
            detail:
              livePreviewError && livePreviewError.trim().length > 0
                ? livePreviewError
                : 'The selected source could not be previewed. Refresh sources or choose another one.',
            tone: '#fca5a5',
          };
        }

        return {
          title: 'No recording yet',
          detail: 'Click Record to start.',
          tone: 'rgba(255,255,255,0.86)',
        };
      })();

  if (recordShellOnly) {
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
        <div
          data-testid="record-tab-root"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050505',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 14,
          }}
        >
          Record tab shell only
        </div>
      </RecordScreenLayout>
    );
  }

  if (recordStoreOnly) {
    return (
      <RecordScreenLayout>
        <AppHeader
          activeTab={activeTab}
          onTabChange={onTabChange}
          projectName={projectName}
          onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))}
          captureSummary={captureSummary}
          deviceStatus={`Tracks: ${tracks.length} · Assets: ${assets.length}`}
        />
        <div
          data-testid="record-tab-root"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050505',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 14,
          }}
        >
          Record store only
          <span style={{ marginLeft: 10, opacity: 0.7 }}>
            {durationFrames}f · {projectFilePath ?? 'unsaved'}
          </span>
        </div>
      </RecordScreenLayout>
    );
  }

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

      {/* Recording toolbar */}
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
          recordDisabled={recordButtonDisabled}
          recordDisabledReason={recordStartGuardReason}
          countdownValue={configuredCountdownSeconds}
          onSelectCountdown={(seconds) => updateRecordingConfig({ countdownSeconds: seconds })}
          countdownSeconds={countdownSeconds}
          elapsedSeconds={elapsedSeconds}
          resolutionLabel={`${resolution.width}×${resolution.height}`}
          fpsLabel={`${projectFps} fps`}
        />
        <button
          type="button"
          data-testid="record-open-setup-panel"
          onClick={openRecordingSetupPanel}
          title="Open recording panel diagnostics and live controls"
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>⚙</span>
          Setup
        </button>
      </div>

      {recordState === 'idle' && (
        <RecordDeviceSelectors
          micOptions={micOptions}
          selectedMicDeviceId={selectedMicDeviceId}
          micIssue={sessionConnectionIssues?.mic ?? null}
          onSelectMicDevice={(id) => updateRecordingConfig({ selectedMicDeviceId: id, micEnabled: true })}
          cameraOptions={cameraOptions}
          selectedCameraDeviceId={selectedCameraDeviceId}
          cameraIssue={sessionConnectionIssues?.camera ?? null}
          onSelectCameraDevice={(id) =>
            updateRecordingConfig({ selectedCameraDeviceId: id, cameraEnabled: true })
          }
          systemAudioOptions={systemAudioOptions}
          selectedSystemAudioSourceId={selectedSystemAudioSourceId}
          systemAudioIssue={sessionConnectionIssues?.systemAudio ?? null}
          onSelectSystemAudioSource={(id) =>
            updateRecordingConfig({
              selectedSystemAudioSourceId: id,
              sysAudioEnabled: true,
            })
          }
        />
      )}

      {recordingRecovery && (
        <div
          data-testid="record-recovery-banner"
          style={{
            margin: '0 24px 12px',
            borderRadius: 12,
            border: '1px solid rgba(239,68,68,0.24)',
            background: 'rgba(239,68,68,0.08)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fca5a5' }}>
              Interrupted recording detected
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.68)', marginTop: 2 }}>
              {recordingRecovery.interruptionReason === 'panel-closed'
                ? `The recording panel was closed during a session that started at ${recordingRecovery.startedAt}.`
                : `Rough Cut found an unfinished recording session from ${recordingRecovery.startedAt}.`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              data-testid="record-recovery-open-folder"
              onClick={() => {
                void window.roughcut.shellOpenPath(recordingRecovery.recordingsDir);
              }}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.84)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              Open folder
            </button>
            <button
              data-testid="record-recovery-dismiss"
              onClick={() => {
                void window.roughcut
                  .recordingRecoveryDismiss()
                  .then(() => setRecordingRecovery(null));
              }}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.92)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {sourceRecoveryMessage && (
        <div
          data-testid="record-source-recovery-banner"
          style={{
            margin: '0 24px 12px',
            borderRadius: 12,
            border: '1px solid rgba(245,158,11,0.24)',
            background: 'rgba(245,158,11,0.08)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fcd34d' }}>Source offline</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.68)', marginTop: 2 }}>
              {sourceRecoveryMessage}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              data-testid="record-source-recovery-refresh"
              onClick={() => {
                void loadSources();
              }}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.84)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              Refresh sources
            </button>
            <button
              data-testid="record-source-recovery-retarget"
              onClick={openRecordingSetupPanel}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.92)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              Re-target
            </button>
          </div>
        </div>
      )}

      {recordState === 'idle' && recordStartGuardReason && !sourceRecoveryMessage && (
        <div
          data-testid="record-start-guard-banner"
          style={{
            margin: '0 24px 12px',
            borderRadius: 12,
            border: '1px solid rgba(245,158,11,0.24)',
            background: 'rgba(245,158,11,0.08)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fcd34d' }}>
              Recording source required
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.68)', marginTop: 2 }}>
              {recordStartGuardReason}
            </div>
          </div>
          <button
            data-testid="record-start-guard-pick-source"
            onClick={() => setIsSourcePickerOpen(true)}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.92)',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            Pick a source
          </button>
        </div>
      )}

      {sessionIssueMessage && (
        <div
          data-testid="record-session-issue-banner"
          style={{
            margin: '0 24px 12px',
            borderRadius: 12,
            border: '1px solid rgba(245,158,11,0.24)',
            background: 'rgba(245,158,11,0.08)',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fcd34d' }}>
            Recording issue detected
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.68)', marginTop: 2 }}>
            {sessionIssueMessage}
          </div>
        </div>
      )}

      {!recordChromeOnly && (
        <>
      {/* Preview + Inspector row */}
      <WorkspaceRow
        sidebarWidth={RECORD_PANEL_WIDTH}
        main={
          <PreviewStage>
            <CardChrome
              aspectRatio={effectiveTemplate.aspectRatio}
              bgColor={hasRecordedTake ? background.bgColor : '#050505'}
              bgGradient={hasRecordedTake ? background.bgGradient : null}
              bgPadding={background.bgPadding}
              bgCornerRadius={background.bgCornerRadius}
              bgShadowEnabled={background.bgShadowEnabled}
              bgShadowBlur={background.bgShadowBlur}
              bgInset={background.bgInset}
              bgInsetColor={background.bgInsetColor}
            >
              <TemplatePreviewRenderer
                template={effectiveTemplate}
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
                  ) : previewOverlay ? (
                    <div
                      data-testid="record-preview-status"
                      data-preview-state={
                        !hasValidSelectedSource
                          ? sourceRecoveryMessage
                            ? 'lost'
                            : 'empty'
                          : livePreviewStatus
                      }
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 24px',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 360,
                          padding: '14px 16px',
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.72)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          textAlign: 'center',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: 0.2,
                            color: previewOverlay.tone,
                          }}
                        >
                          {previewOverlay.title}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            lineHeight: 1.45,
                            color: 'rgba(255,255,255,0.68)',
                          }}
                        >
                          {previewOverlay.detail}
                        </div>
                      </div>
                    </div>
                  ) : undefined
                }
                cameraContent={
                  hasRecordedTake && cameraAsset?.filePath ? (
                    <CameraPlaybackCanvas
                      filePath={resolveProjectMediaPath(cameraAsset.filePath, projectFilePath) ?? cameraAsset.filePath}
                      fps={projectFps}
                    />
                  ) : undefined
                }
                cameraAspect={4 / 3}
                cameraPresentation={effectiveCameraPresentation}
                screenAspect={screenSourceWidth / screenSourceHeight}
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
                onCameraNormalizedFrameChange={handleCameraNormalizedFrameChange}
                screenRectOverride={screenRectOverride}
                cameraRectOverride={effectiveCameraRectOverride}
                cameraNormalizedFrameOverride={activeRecordingPresentation?.cameraFrame}
                screenCrop={screenCrop}
                cameraCrop={cameraCrop}
                cropRegion={cropTargetRegion}
                cropModeActive={cropModeActive}
                onCropModeChange={setCropModeActive}
                onScreenCropModeChange={handleScreenCropModeChange}
                onCameraCropModeChange={handleCameraCropModeChange}
                onScreenCropChange={handleScreenCropChange}
                onCameraCropChange={handleCameraCropChange}
                screenSourceWidth={screenSourceWidth}
                screenSourceHeight={screenSourceHeight}
                cameraSourceWidth={cameraSourceWidth}
                cameraSourceHeight={cameraSourceHeight}
                activeZoomScale={activeZoomScale}
                activeLayoutFrame={activeCameraLayoutSnapshot?.frame ?? null}
                activeLayoutVisible={activeCameraLayoutSnapshot?.camera?.visible ?? null}
                alignRef={alignRef}
                onRegionClick={setSelectedRegion}
                selectedRegion={selectedRegion}
              />
              {previewModeBadge && (
                <div
                  data-testid="record-preview-mode-badge"
                  style={{
                    position: 'absolute',
                    top: 14,
                    left: 14,
                    zIndex: 12,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.72)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  {previewModeBadge}
                </div>
              )}
            </CardChrome>
          </PreviewStage>
        }
        inspector={
          hasRecordedTake ? (
            <RecordRightPanel
              fps={projectFps}
              zoomMarkerCount={zoomPresentation.markers.length}
              zoomIntensity={zoomPresentation.autoIntensity}
              onZoomIntensityChange={handleZoomIntensityChange}
              zoomFollowCursor={zoomPresentation.followCursor}
              onZoomFollowCursorChange={handleZoomFollowCursorChange}
              zoomFollowAnimation={zoomPresentation.followAnimation}
              onZoomFollowAnimationChange={handleZoomFollowAnimationChange}
              zoomFollowPadding={zoomPresentation.followPadding}
              onZoomFollowPaddingChange={handleZoomFollowPaddingChange}
              canRegenerateAutoZoom={Boolean(cursorEventsPath)}
              onRegenerateAutoZoom={regenerateAutoZoomMarkers}
              onResetZoomMarkers={handleResetZoom}
              onCreateZoomFromScreenFocus={handleCreateZoomFromScreenFocus}
              cursor={cursorPresentation}
              onCursorChange={handleCursorChange}
              onCursorReset={handleCursorReset}
              camera={cameraPresentation}
              onCameraChange={handleCameraChange}
              onCameraReset={handleCameraReset}
              cameraLayoutSnapshotCount={
                (activeRecordingAsset?.presentation as { cameraLayouts?: unknown[] } | undefined)
                  ?.cameraLayouts?.length ?? 0
              }
              onAddCameraLayoutSnapshot={handleAddCameraLayoutSnapshot}
              onAddCameraLayoutPreset={handleAddCameraLayoutPreset}
              selectedCameraLayoutMarkerId={selectedCameraLayoutMarkerId}
              onDeleteSelectedCameraLayoutMarker={handleDeleteSelectedCameraLayoutMarker}
              background={background}
              onBackgroundChange={handleBackgroundChange}
              onBackgroundReset={handleBackgroundReset}
              screenCrop={screenCrop}
              onScreenCropChange={handleScreenCropChange}
              onScreenCropReset={handleScreenCropReset}
              cameraCrop={cameraCrop}
              onCameraCropChange={handleCameraCropChange}
              onCameraCropReset={handleCameraCropReset}
              screenSourceWidth={screenSourceWidth}
              screenSourceHeight={screenSourceHeight}
              cameraSourceWidth={cameraSourceWidth}
              cameraSourceHeight={cameraSourceHeight}
              cropModeActive={cropModeActive}
              cropTargetRegion={cropTargetRegion}
              onScreenCropModeChange={handleScreenCropModeChange}
              onCameraCropModeChange={handleCameraCropModeChange}
              selectedTemplateId={effectiveTemplate.id}
              onTemplateChange={handleTemplateChange}
              selectedDestinationPresetId={selectedDestinationPresetId}
              onDestinationPresetChange={handleDestinationPresetChange}
              selectedRegion={selectedRegion}
              onAlign={handleAlign}
              preferredCategoryId={preferredInspectorCategoryId}
              captionSegments={recordCaptionSegments}
              onUpdateCaptionText={handleUpdateRecordCaptionText}
              canGenerateCaptions={Boolean(activeRecordingAsset?.filePath && activeRecordingId)}
              isGeneratingCaptions={isGeneratingCaptions}
              captionError={recordCaptionError}
              onGenerateCaptions={handleGenerateRecordCaptions}
              captionStyle={captionStyle}
              onUpdateCaptionStyle={handleUpdateRecordCaptionStyle}
            />
          ) : null
        }
      />
        </>
      )}

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

      {!recordChromeOnly && !recordWorkspaceOnly && hasRecordedTake && (
        <>
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
          fps={projectFps}
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
          cameraLayoutMarkers={
            ((activeRecordingPresentation as { cameraLayouts?: unknown } | null)?.cameraLayouts as
              | ReadonlyArray<{
                  id: string;
                  frame: number;
                  camera: { visible?: boolean; position?: string };
                  templateId?: string;
                }>
              | undefined) ?? []
          }
          selectedCameraLayoutMarkerId={selectedCameraLayoutMarkerId}
          onSelectCameraLayoutMarker={handleSelectCameraLayoutMarker}
          onMoveCameraLayoutMarker={(id, frame) => {
            if (!activeRecordingId) return;
            const store = projectStore.getState() as unknown as {
              moveRecordingCameraLayoutSnapshot?: (
                assetId: string,
                markerId: string,
                nextFrame: number,
              ) => void;
            };
            store.moveRecordingCameraLayoutSnapshot?.(activeRecordingId, id, frame);
          }}
        />
      </div>
        </>
      )}

      <CountdownOverlay secondsRemaining={countdownSeconds} visible={status === 'countdown'} />

      {isSourcePickerOpen && (
        <SourcePickerPopup
          sources={sources}
          selectedSourceId={selectedSourceId}
          recordMode={recordMode}
          isLoading={status === 'loading-sources'}
          onRefresh={() => void loadSources()}
          onSelect={(id) => {
            updateRecordingConfig({ selectedSourceId: id });
            setIsSourcePickerOpen(false);
          }}
          onClose={() => setIsSourcePickerOpen(false)}
        />
      )}
    </RecordScreenLayout>
  );
}
