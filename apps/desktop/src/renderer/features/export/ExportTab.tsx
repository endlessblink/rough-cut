import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createDefaultCameraPresentation } from '@rough-cut/project-model';
import type { ProjectDocument } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import type { ExportResult } from '@rough-cut/export-renderer';
import {
  useProjectStore,
  useTransportStore,
  projectStore,
  transportStore,
} from '../../hooks/use-stores.js';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { CardChrome } from '../record/CardChrome.js';
import { TemplatePreviewRenderer } from '../record/TemplatePreviewRenderer.js';
import { CameraPlaybackCanvas } from '../record/CameraPlaybackCanvas.js';
import { LAYOUT_TEMPLATES } from '../record/templates.js';
import {
  getDestinationPreset,
  isDestinationPresetId,
  matchDestinationPreset,
} from '../record/destination-presets.js';
import { RecordingPlaybackVideo } from '../record/RecordingPlaybackVideo.js';
import { TimelineStrip } from '../edit/TimelineStrip.js';
import type { ExportRange } from '../edit/TimelineStrip.js';
import {
  cancelDesktopExport,
  pickDesktopExportOutputPath,
  runDesktopExport,
} from './run-export.js';
import { bitrateFromCrf, normalizeExportSettings, resolveExportBitrate } from './export-settings.js';

interface ExportTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

function getActiveCameraLayoutSnapshot(
  markers:
    | ReadonlyArray<{
        frame: number;
        camera: ReturnType<typeof createDefaultCameraPresentation>;
        cameraFrame?: unknown;
        templateId?: string;
      }>
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

const READ_ONLY = {
  canTrim: false,
  canSelect: false,
  canSnap: false,
} as const;

type ExportJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';

type ExportPresetId =
  | 'draft'
  | 'balanced'
  | 'crisp'
  | 'social-vertical'
  | 'social-square'
  | 'custom';

interface ExportPreset {
  id: ExportPresetId;
  label: string;
  description: string;
  resolution: { width: number; height: number };
  frameRate: 24 | 30 | 60;
  crf: number;
}

interface ExportJob {
  id: string;
  project: ProjectDocument;
  projectName: string;
  outputPath: string;
  range: ExportRange;
  frameCount: number;
  status: ExportJobStatus;
  progress: number;
  progressLabel: string | null;
  error: string | null;
  outputFilePath: string | null;
}

interface ExportEstimate {
  durationSeconds: number;
  estimatedBytes: number;
  estimatedMs: number;
}

function createExportJob(
  project: ProjectDocument,
  range: ExportRange,
  outputPath: string,
): ExportJob {
  const frameCount = Math.max(0, range.outFrame - range.inFrame);
  return {
    id: `export-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    project,
    projectName: project.name,
    outputPath,
    range,
    frameCount,
    status: 'queued',
    progress: 0,
    progressLabel: 'Queued',
    error: null,
    outputFilePath: null,
  };
}

function formatJobRange(job: ExportJob): string {
  return `${job.range.inFrame}-${job.range.outFrame}`;
}

function getJobStatusColor(status: ExportJobStatus): string {
  switch (status) {
    case 'running':
      return '#ffb066';
    case 'complete':
      return '#9be28f';
    case 'failed':
      return '#ff9f8f';
    case 'cancelled':
      return 'rgba(255,255,255,0.58)';
    default:
      return 'rgba(255,255,255,0.68)';
  }
}

const EXPORT_RESOLUTION_OPTIONS = [
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
  { label: '1080x1920', width: 1080, height: 1920 },
  { label: '1080x1080', width: 1080, height: 1080 },
] as const;

const EXPORT_FRAME_RATE_OPTIONS = [24, 30, 60] as const;
const EXPORT_CRF_OPTIONS = [18, 22, 26, 30] as const;

const EXPORT_PRESETS: readonly ExportPreset[] = [
  {
    id: 'draft',
    label: 'Draft',
    description: 'Fast review exports with smaller files',
    resolution: { width: 1280, height: 720 },
    frameRate: 24,
    crf: 30,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'General-purpose delivery for tutorials',
    resolution: { width: 1920, height: 1080 },
    frameRate: 30,
    crf: 18,
  },
  {
    id: 'crisp',
    label: 'Crisp',
    description: 'Higher frame rate and lower compression',
    resolution: { width: 1920, height: 1080 },
    frameRate: 60,
    crf: 18,
  },
  {
    id: 'social-vertical',
    label: 'Social Vertical',
    description: '9:16 delivery defaults for Reels, Shorts, and TikTok.',
    resolution: { width: 1080, height: 1920 },
    frameRate: 30,
    crf: 18,
  },
  {
    id: 'social-square',
    label: 'Social Square',
    description: '1:1 feed-ready export tuned for square social posts.',
    resolution: { width: 1080, height: 1080 },
    frameRate: 30,
    crf: 18,
  },
];

function crfFromBitrate(bitrate: number): number {
  if (bitrate >= 10_000_000) return 18;
  if (bitrate >= 6_000_000) return 23;
  if (bitrate >= 5_000_000) return 22;
  if (bitrate >= 2_000_000) return 26;
  return 30;
}

function resolutionKey(width: number, height: number): string {
  return `${width}x${height}`;
}

function presetMatches(project: ProjectDocument, preset: ExportPreset): boolean {
  const bitrate = resolveExportBitrate(
    project.exportSettings as ProjectDocument['exportSettings'] & Record<string, unknown>,
  );

  return (
    project.exportSettings.resolution.width === preset.resolution.width &&
    project.exportSettings.resolution.height === preset.resolution.height &&
    project.exportSettings.frameRate === preset.frameRate &&
    bitrate !== null &&
    crfFromBitrate(bitrate) === preset.crf
  );
}

function formatCodecLabel(codec: ProjectDocument['exportSettings']['codec']): string {
  switch (codec) {
    case 'h264':
      return 'H.264';
    case 'h265':
      return 'H.265';
    default:
      return codec.toUpperCase();
  }
}

function estimateExport(
  range: ExportRange,
  settings: ProjectDocument['exportSettings'],
): ExportEstimate {
  const selectedFrames = Math.max(0, range.outFrame - range.inFrame);
  const durationSeconds = selectedFrames / Math.max(1, settings.frameRate);
  const audioBitrate = 192_000;
  const estimatedBytes = ((settings.bitrate + audioBitrate) * durationSeconds) / 8;
  const pixelFactor = (settings.resolution.width * settings.resolution.height) / (1920 * 1080);
  const fpsFactor = settings.frameRate / 30;
  const estimatedMs = Math.max(2_000, durationSeconds * 1000 * 0.9 * pixelFactor * fpsFactor);
  return { durationSeconds, estimatedBytes, estimatedMs };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function ExportTab({ activeTab, onTabChange }: ExportTabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const destinationPresetId = useProjectStore((s) => s.project.settings.destinationPresetId);
  const exportSettings = useProjectStore((s) => s.project.exportSettings);
  const normalizedExportSettings = useMemo(
    () =>
      normalizeExportSettings(
        exportSettings as ProjectDocument['exportSettings'] & Record<string, unknown>,
      ),
    [exportSettings],
  );
  const currentFrame = useTransportStore((s) => s.playheadFrame);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);

  useEffect(() => {
    if (normalizedExportSettings === exportSettings) {
      return;
    }

    updateProject((doc) => ({
      ...doc,
      exportSettings: normalizedExportSettings,
    }));
  }, [exportSettings, normalizedExportSettings, updateProject]);

  const activeRecordingAsset = useMemo(() => {
    const frame = resolveFrame(project, currentFrame);
    const screenLayer = frame.layers.find((layer) => {
      const asset = project.assets.find((a) => a.id === layer.assetId);
      return asset?.type === 'recording' && !asset.metadata?.isCamera;
    });
    if (screenLayer) {
      return project.assets.find((a) => a.id === screenLayer.assetId) ?? null;
    }
    return project.assets.find((a) => a.type === 'recording' && !a.metadata?.isCamera) ?? null;
  }, [currentFrame, project]);

  const activeCameraPreview = useMemo(() => {
    const frame = resolveFrame(project, currentFrame);
    const cameraLayer = frame.layers.find((layer) => {
      const asset = project.assets.find((a) => a.id === layer.assetId);
      return Boolean(asset?.metadata?.isCamera);
    });
    if (!cameraLayer) return null;

    const cameraAsset = project.assets.find((a) => a.id === cameraLayer.assetId);
    if (!cameraAsset?.filePath) return null;

    const recordingAsset =
      project.assets.find(
        (a) => a.type === 'recording' && a.cameraAssetId === cameraLayer.assetId,
      ) ?? null;
    const cameraClip =
      project.composition.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.assetId === cameraLayer.assetId) ?? null;

    return {
      filePath: cameraAsset.filePath,
      camera: recordingAsset?.presentation?.camera ?? createDefaultCameraPresentation(),
      cameraFrame: recordingAsset?.presentation?.cameraFrame,
      clipTimelineIn: cameraClip?.timelineIn ?? 0,
      clipSourceIn: cameraClip?.sourceIn ?? 0,
    };
  }, [currentFrame, project]);

  const activeTemplate = useMemo(() => {
    const templateId = activeRecordingAsset?.presentation?.templateId;
    return LAYOUT_TEMPLATES.find((template) => template.id === templateId) ?? LAYOUT_TEMPLATES[1];
  }, [activeRecordingAsset?.presentation?.templateId]);
  const activeCameraLayoutSnapshot = getActiveCameraLayoutSnapshot(
    (activeRecordingAsset?.presentation as { cameraLayouts?: ReadonlyArray<any> } | undefined)
      ?.cameraLayouts,
    currentFrame,
  );
  const effectiveTemplate =
    (activeCameraLayoutSnapshot?.templateId
      ? LAYOUT_TEMPLATES.find((template) => template.id === activeCameraLayoutSnapshot.templateId)
      : null) ?? activeTemplate;

  const activeScreenAspect =
    ((activeRecordingAsset?.metadata?.width as number | undefined) ?? resolution.width) /
    (((activeRecordingAsset?.metadata?.height as number | undefined) ?? resolution.height) || 1);
  const activeScreenCrop = activeRecordingAsset?.presentation?.screenCrop;
  const activeCameraCrop = activeRecordingAsset?.presentation?.cameraCrop;
  const activeZoomMarkers = activeRecordingAsset?.presentation?.zoom?.markers ?? [];
  const activeCameraSourceWidth =
    (project.assets.find((asset) => asset.id === activeRecordingAsset?.cameraAssetId)?.metadata
      ?.width as number | undefined) ?? 1280;
  const activeCameraSourceHeight =
    (project.assets.find((asset) => asset.id === activeRecordingAsset?.cameraAssetId)?.metadata
      ?.height as number | undefined) ?? 720;
  const activeZoomScale = getZoomTransformAtFrame(currentFrame, activeZoomMarkers).scale;

  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;
  const resolvedExportBitrate = resolveExportBitrate(
    exportSettings as ProjectDocument['exportSettings'] & Record<string, unknown>,
  );
  const selectedCrf = crfFromBitrate(resolvedExportBitrate ?? 1_000_000);
  const selectedPresetId: ExportPresetId =
    EXPORT_PRESETS.find((preset) => presetMatches(project, preset))?.id ?? 'custom';
  const linkedDestinationPreset =
    (isDestinationPresetId(destinationPresetId) ? getDestinationPreset(destinationPresetId) : null) ??
    matchDestinationPreset({
      templateId: activeTemplate?.id,
      captureResolution: resolution,
        exportSettings: {
          resolution: normalizedExportSettings.resolution,
          frameRate: normalizedExportSettings.frameRate,
          bitrate: normalizedExportSettings.bitrate,
        },
      });

  const [exportRange, setExportRange] = useState<ExportRange>({
    inFrame: 0,
    outFrame: durationFrames || 300,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const activeJobIdRef = useRef<string | null>(null);
  const queueProcessingRef = useRef(false);
  const exportEstimate = useMemo(
    () => estimateExport(exportRange, normalizedExportSettings),
    [exportRange, normalizedExportSettings],
  );
  const liveEtaMs = useMemo(() => {
    if (!isExporting || exportProgress <= 0 || exportProgress >= 100) return null;
    return Math.max(0, exportEstimate.estimatedMs * ((100 - exportProgress) / 100));
  }, [exportEstimate.estimatedMs, exportProgress, isExporting]);

  const queuedCount = exportJobs.filter((job) => job.status === 'queued').length;

  useEffect(() => {
    setExportRange((current) => ({
      inFrame: Math.max(0, Math.min(current.inFrame, Math.max(0, durationFrames - 1))),
      outFrame: Math.max(0, Math.min(current.outFrame, durationFrames || 0)),
    }));
  }, [durationFrames]);

  const handleScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          getPlaybackManager().togglePlay();
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
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const unsubscribeProgress = window.roughcut.onExportProgress((progress) => {
      const activeJobId = activeJobIdRef.current;
      setIsExporting(true);
      setExportProgress(progress.percentage);
      setProgressLabel(
        `Frame ${progress.currentFrame}/${progress.totalFrames} · ${Math.round(progress.percentage)}%`,
      );
      if (activeJobId) {
        setExportJobs((jobs) =>
          jobs.map((job) =>
            job.id === activeJobId
              ? {
                  ...job,
                  status: 'running',
                  progress: progress.percentage,
                  progressLabel: `Frame ${progress.currentFrame}/${progress.totalFrames} · ${Math.round(progress.percentage)}%`,
                }
              : job,
          ),
        );
      }
    });

    const unsubscribeComplete = window.roughcut.onExportComplete((result) => {
      const activeJobId = activeJobIdRef.current;
      setIsExporting(false);
      setExportProgress(result.status === 'complete' ? 100 : 0);
      setProgressLabel(
        result.status === 'complete'
          ? `Finished in ${(result.durationMs / 1000).toFixed(1)}s`
          : result.status === 'cancelled'
            ? 'Export cancelled'
            : 'Ready to export',
      );

      if (result.status === 'complete' && result.outputPath) {
        setLastOutputPath(result.outputPath);
        setExportStatus(null);
      } else if (result.status === 'cancelled') {
        setExportStatus('Export cancelled');
      } else {
        setExportStatus(result.error ?? 'Export failed');
      }

      if (activeJobId) {
        setExportJobs((jobs) =>
          jobs.map((job) =>
            job.id === activeJobId
              ? {
                  ...job,
                  status: mapExportResultToJobStatus(result),
                  progress: result.status === 'complete' ? 100 : job.progress,
                  progressLabel: getResultLabel(result),
                  error: result.status === 'failed' ? (result.error ?? 'Export failed') : null,
                  outputFilePath:
                    result.status === 'complete' ? (result.outputPath ?? job.outputPath) : null,
                }
              : job,
          ),
        );
      }
    });

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, []);

  const handleCancel = useCallback(() => {
    void cancelDesktopExport();
    setIsExporting(false);
    setExportProgress(0);
    setProgressLabel('Ready to export');
    setExportStatus('Export cancelled');
  }, []);

  const processQueue = useCallback(async () => {
    if (queueProcessingRef.current) return;

    const nextJob = exportJobs.find((job) => job.status === 'queued');
    if (!nextJob) return;

    queueProcessingRef.current = true;
    activeJobIdRef.current = nextJob.id;
    setIsExporting(true);
    setExportStatus(null);
    setLastOutputPath(null);
    setExportProgress(0);
    setProgressLabel('Preparing export...');
    setExportJobs((jobs) =>
      jobs.map((job) =>
        job.id === nextJob.id
          ? { ...job, status: 'running', progress: 0, progressLabel: 'Preparing export...' }
          : job,
      ),
    );

    try {
      const result = await runDesktopExport(
        nextJob.project,
        {
          startFrame: nextJob.range.inFrame,
          endFrame: nextJob.range.outFrame,
        },
        nextJob.outputPath,
      );

      if (!result) {
        setExportJobs((jobs) =>
          jobs.map((job) =>
            job.id === nextJob.id
              ? { ...job, status: 'cancelled', progressLabel: 'Export cancelled' }
              : job,
          ),
        );
      }
    } finally {
      activeJobIdRef.current = null;
      queueProcessingRef.current = false;
    }
  }, [exportJobs]);

  useEffect(() => {
    if (!isExporting) {
      void processQueue();
    }
  }, [exportJobs, isExporting, processQueue]);

  const handleQueueExport = useCallback(async () => {
    const currentProject = projectStore.getState().project;
    const selectedFrameCount = Math.max(0, exportRange.outFrame - exportRange.inFrame);
    if (currentProject.composition.duration <= 0 || selectedFrameCount <= 0) {
      setExportStatus(
        currentProject.composition.duration <= 0
          ? 'Nothing to export yet. Add a clip to the timeline first.'
          : 'Select a non-empty export range.',
      );
      return;
    }

    const outputPath = await pickDesktopExportOutputPath(currentProject);
    if (!outputPath) {
      return;
    }

    const job = createExportJob(currentProject, exportRange, outputPath);
    setExportStatus(null);
    setLastOutputPath(null);
    setExportJobs((jobs) => [...jobs, job]);
  }, [exportRange]);

  const handleRemoveJob = useCallback((jobId: string) => {
    setExportJobs((jobs) => jobs.filter((job) => job.id !== jobId));
  }, []);

  const patchExportSettings = useCallback(
    (patch: Partial<ProjectDocument['exportSettings']>) => {
      updateProject((doc) => ({
        ...doc,
        settings: {
          ...doc.settings,
          destinationPresetId: null,
        },
        exportSettings: {
          ...doc.exportSettings,
          ...patch,
        },
      }));
    },
    [updateProject],
  );

  const handlePresetChange = useCallback(
    (presetId: string) => {
      const preset = EXPORT_PRESETS.find((entry) => entry.id === presetId);
      if (!preset) return;
      patchExportSettings({
        resolution: { ...preset.resolution },
        frameRate: preset.frameRate,
        bitrate: bitrateFromCrf(preset.crf),
      });
    },
    [patchExportSettings],
  );

  const handleResolutionChange = useCallback(
    (value: string) => {
      const option = EXPORT_RESOLUTION_OPTIONS.find((entry) => entry.label === value);
      if (!option) return;
      patchExportSettings({
        resolution: { width: option.width, height: option.height },
      });
    },
    [patchExportSettings],
  );

  const handleFrameRateChange = useCallback(
    (value: string) => {
      const frameRate = Number(value);
      if (
        !EXPORT_FRAME_RATE_OPTIONS.includes(frameRate as (typeof EXPORT_FRAME_RATE_OPTIONS)[number])
      ) {
        return;
      }
      patchExportSettings({ frameRate: frameRate as 24 | 30 | 60 });
    },
    [patchExportSettings],
  );

  const handleCrfChange = useCallback(
    (value: string) => {
      const crf = Number(value);
      if (!EXPORT_CRF_OPTIONS.includes(crf as (typeof EXPORT_CRF_OPTIONS)[number])) {
        return;
      }
      patchExportSettings({ bitrate: bitrateFromCrf(crf) });
    },
    [patchExportSettings],
  );

  return (
    <div
      data-testid="export-tab-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0d0d0d',
        color: '#e8e8e8',
        overflow: 'hidden',
      }}
    >
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
        onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))}
        captureSummary={captureSummary}
      />

      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'row',
          gap: 16,
          padding: '12px 24px 8px',
          minHeight: 0,
          background: 'linear-gradient(to bottom, #111111, #050505)',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          <div style={{ width: '100%', maxWidth: 1040 }}>
            <div style={{ height: 585 }}>
              <CardChrome aspectRatio={activeTemplate?.aspectRatio ?? '16:9'}>
                <TemplatePreviewRenderer
                  template={effectiveTemplate ?? LAYOUT_TEMPLATES[1] ?? LAYOUT_TEMPLATES[0]!}
                  screenContent={
                    activeRecordingAsset?.filePath ? (
                      <RecordingPlaybackVideo
                        filePath={activeRecordingAsset.filePath}
                        fps={projectFps}
                        assetId={activeRecordingAsset.id}
                        zoomMarkers={activeZoomMarkers}
                      />
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'rgba(255,255,255,0.3)',
                          fontSize: 13,
                        }}
                      >
                        No recording
                      </div>
                    )
                  }
                  cameraContent={
                    activeCameraPreview ? (
                      <CameraPlaybackCanvas
                        filePath={activeCameraPreview.filePath}
                        fps={projectFps}
                        clipTimelineIn={activeCameraPreview.clipTimelineIn}
                        clipSourceIn={activeCameraPreview.clipSourceIn}
                      />
                    ) : undefined
                  }
                  screenAspect={activeScreenAspect}
                  cameraAspect={4 / 3}
                  cameraPresentation={
                    activeCameraLayoutSnapshot?.camera ?? activeCameraPreview?.camera
                  }
                  screenCrop={activeScreenCrop}
                  cameraCrop={activeCameraCrop}
                  screenSourceWidth={
                    (activeRecordingAsset?.metadata?.width as number | undefined) ??
                    resolution.width
                  }
                  screenSourceHeight={
                    (activeRecordingAsset?.metadata?.height as number | undefined) ??
                    resolution.height
                  }
                  cameraSourceWidth={activeCameraSourceWidth}
                  cameraSourceHeight={activeCameraSourceHeight}
                  activeZoomScale={activeZoomScale}
                  activeLayoutFrame={activeCameraLayoutSnapshot?.frame ?? null}
                  activeLayoutVisible={activeCameraLayoutSnapshot?.camera?.visible ?? null}
                  interactionEnabled={false}
                />
              </CardChrome>
            </div>
          </div>
        </div>

        <aside
          data-testid="export-settings"
          style={{
            flex: '0 0 280px',
            maxWidth: 280,
            borderRadius: 14,
            background:
              'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflowX: 'hidden',
            overflowY: 'auto',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Linked Destination
            </div>
            <div
              data-testid="export-linked-destination"
              style={{
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
                padding: 10,
                fontSize: 12,
                color: 'rgba(255,255,255,0.78)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                {linkedDestinationPreset?.label ?? 'Custom Export'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.54)', marginTop: 4 }}>
                {linkedDestinationPreset?.description ??
                  'This export is no longer linked to a saved Record destination preset.'}
              </div>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Format
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
              {normalizedExportSettings.format.toUpperCase()} ({formatCodecLabel(normalizedExportSettings.codec)})
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Preset
            </div>
            <select
              data-testid="export-preset-select"
              value={selectedPresetId}
              onChange={(e) => handlePresetChange(e.target.value)}
              style={selectStyle}
            >
              <option value="custom">Custom</option>
              {EXPORT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.52)', marginTop: 6 }}>
              {selectedPresetId === 'custom'
                ? 'Fine-tune resolution, frame rate, and CRF for this export.'
                : EXPORT_PRESETS.find((preset) => preset.id === selectedPresetId)?.description}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Resolution
            </div>
            <select
              data-testid="export-resolution-select"
              value={resolutionKey(
                normalizedExportSettings.resolution.width,
                normalizedExportSettings.resolution.height,
              )}
              onChange={(e) => handleResolutionChange(e.target.value)}
              style={selectStyle}
            >
              {EXPORT_RESOLUTION_OPTIONS.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Frame Rate
            </div>
            <select
              data-testid="export-frame-rate-select"
              value={String(normalizedExportSettings.frameRate)}
              onChange={(e) => handleFrameRateChange(e.target.value)}
              style={selectStyle}
            >
              {EXPORT_FRAME_RATE_OPTIONS.map((frameRate) => (
                <option key={frameRate} value={frameRate}>
                  {frameRate} fps
                </option>
              ))}
            </select>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Quality
            </div>
            <select
              data-testid="export-crf-select"
              value={String(selectedCrf)}
              onChange={(e) => handleCrfChange(e.target.value)}
              style={selectStyle}
            >
              {EXPORT_CRF_OPTIONS.map((crf) => (
                <option key={crf} value={crf}>
                  CRF {crf}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.52)', marginTop: 6 }}>
              Lower CRF means higher quality and larger files.
            </div>
          </div>

          <div
            style={{
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.03)',
              padding: 10,
              fontSize: 12,
              color: 'rgba(255,255,255,0.72)',
            }}
          >
            Export saves to a path you choose when you click <strong>Export</strong>.
          </div>

          <div
            data-testid="export-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(exportProgress)}
            style={{
              width: '100%',
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: `${exportProgress}%`,
                height: '100%',
                background: '#ff6b5a',
                transition: 'width 120ms linear',
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
            {progressLabel ?? 'Ready to export'}
          </div>

          <div
            data-testid="export-estimates"
            style={{
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.03)',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
              }}
            >
              Estimates
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.62)' }}>Clip Length</span>
              <span style={{ color: 'rgba(255,255,255,0.88)' }}>
                {formatDuration(exportEstimate.durationSeconds * 1000)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.62)' }}>File Size</span>
              <span style={{ color: 'rgba(255,255,255,0.88)' }}>
                {formatBytes(exportEstimate.estimatedBytes)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.62)' }}>
                {isExporting && liveEtaMs !== null ? 'Live ETA' : 'Export Time'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.88)' }}>
                {isExporting && liveEtaMs !== null
                  ? formatDuration(liveEtaMs)
                  : formatDuration(exportEstimate.estimatedMs)}
              </span>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Queue
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
              {exportJobs.length === 0
                ? 'No queued exports yet.'
                : `${exportJobs.length} total · ${queuedCount} waiting`}
            </div>
            <div
              data-testid="export-queue"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              {exportJobs.length === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.52)',
                    border: '1px dashed rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
                  Queue a few ranges and rough-cut will export them one-by-one.
                </div>
              ) : (
                exportJobs.map((job) => {
                  const canRemove = job.status !== 'running';
                  const resolvedOutputPath = job.outputFilePath ?? job.outputPath;
                  return (
                    <div
                      key={job.id}
                      style={{
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '10px 10px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.88)',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {job.projectName}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: getJobStatusColor(job.status),
                            flexShrink: 0,
                          }}
                        >
                          {job.status}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>
                        Frames {formatJobRange(job)} · {job.frameCount} selected
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.52)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {resolvedOutputPath.split('/').pop()}
                      </div>
                      {job.progress > 0 ? (
                        <div
                          style={{
                            height: 5,
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${job.progress}%`,
                              height: '100%',
                              background: '#ff6b5a',
                            }}
                          />
                        </div>
                      ) : null}
                      <div
                        style={{
                          fontSize: 11,
                          color: job.error ? '#ff9f8f' : 'rgba(255,255,255,0.62)',
                        }}
                      >
                        {job.error ?? job.progressLabel ?? 'Queued'}
                      </div>
                      {job.status === 'complete' && resolvedOutputPath ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => void window.roughcut.shellOpenPath(resolvedOutputPath)}
                            style={miniActionStyle}
                          >
                            Open
                          </button>
                          <button
                            onClick={() =>
                              void window.roughcut.shellShowItemInFolder(resolvedOutputPath)
                            }
                            style={miniActionStyle}
                          >
                            Folder
                          </button>
                        </div>
                      ) : null}
                      {canRemove ? (
                        <button onClick={() => handleRemoveJob(job.id)} style={miniTextButtonStyle}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: 8,
              }}
            >
              Export Range
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
              {exportRange.inFrame} - {exportRange.outFrame} (
              {exportRange.outFrame - exportRange.inFrame} frames)
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {exportStatus ? (
            <div
              data-testid="export-error"
              style={{
                fontSize: 11,
                color: '#ff9f8f',
                background: 'rgba(255,107,90,0.08)',
                border: '1px solid rgba(255,107,90,0.2)',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              {exportStatus}
            </div>
          ) : null}

          {lastOutputPath ? (
            <div
              data-testid="export-success-actions"
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#9be28f',
                  background: 'rgba(155,226,143,0.08)',
                  border: '1px solid rgba(155,226,143,0.2)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  wordBreak: 'break-all',
                }}
              >
                {lastOutputPath.split('/').pop()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  data-testid="btn-open-file"
                  onClick={() => void window.roughcut.shellOpenPath(lastOutputPath)}
                  style={secondaryActionStyle}
                >
                  Open File
                </button>
                <button
                  data-testid="btn-show-in-folder"
                  onClick={() => void window.roughcut.shellShowItemInFolder(lastOutputPath)}
                  style={secondaryActionStyle}
                >
                  Show in Folder
                </button>
              </div>
            </div>
          ) : null}

          {isExporting ? (
            <button
              data-testid="btn-cancel-export"
              onClick={handleCancel}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
          ) : (
            <button
              data-testid="btn-export"
              onClick={() => void handleQueueExport()}
              style={primaryButtonStyle}
            >
              {exportJobs.length === 0 ? 'Add to Queue' : 'Queue Another'}
            </button>
          )}
        </aside>
      </div>

      <div
        style={{
          height: 180,
          flexShrink: 0,
          borderRadius: 12,
          margin: '0 24px 12px',
          background: 'rgba(8,8,8,0.96)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.75)',
          border: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 32,
            minHeight: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            background: 'rgba(0,0,0,0.80)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => getPlaybackManager().togglePlay()}
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                border: 'none',
                background: isPlaying ? 'rgba(255,112,67,0.20)' : 'rgba(255,255,255,0.06)',
                color: isPlaying ? '#ff7043' : 'rgba(255,255,255,0.70)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                padding: 0,
              }}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? '\u23F8' : '\u25B6'}
            </button>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.72)',
                userSelect: 'none',
              }}
            >
              Export Timeline
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>
            Drag handles to set export range
          </span>
        </div>

        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TimelineStrip
            tracks={project.composition.tracks}
            assets={project.assets}
            playheadFrame={currentFrame}
            pixelsPerFrame={3}
            interaction={READ_ONLY}
            exportRange={exportRange}
            onChangeExportRange={setExportRange}
            onScrub={handleScrub}
          />
        </div>
      </div>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 999,
  border: 'none',
  background: '#ff6b5a',
  color: '#000',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const cancelButtonStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 999,
  border: '1px solid rgba(255,107,90,0.4)',
  background: 'rgba(255,107,90,0.12)',
  color: '#ff6b5a',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryActionStyle: React.CSSProperties = {
  flex: 1,
  height: 30,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.80)',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 34,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.88)',
  fontSize: 12,
  fontFamily: 'inherit',
  padding: '0 10px',
  outline: 'none',
};

const miniActionStyle: React.CSSProperties = {
  flex: 1,
  height: 24,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.8)',
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const miniTextButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  border: 'none',
  background: 'transparent',
  color: 'rgba(255,255,255,0.62)',
  fontSize: 10,
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function mapExportResultToJobStatus(result: ExportResult): ExportJobStatus {
  if (result.status === 'complete') return 'complete';
  if (result.status === 'cancelled') return 'cancelled';
  return 'failed';
}

function getResultLabel(result: ExportResult): string {
  if (result.status === 'complete') {
    return `Finished in ${(result.durationMs / 1000).toFixed(1)}s`;
  }
  if (result.status === 'cancelled') {
    return 'Export cancelled';
  }
  return result.error ?? 'Export failed';
}
