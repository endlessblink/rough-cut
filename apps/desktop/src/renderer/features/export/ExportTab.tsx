import { useState, useCallback, useMemo, useEffect } from 'react';
import { createDefaultCameraPresentation } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
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
import { RecordingPlaybackVideo } from '../record/RecordingPlaybackVideo.js';
import { TimelineStrip } from '../edit/TimelineStrip.js';
import type { ExportRange } from '../edit/TimelineStrip.js';
import { cancelDesktopExport, runDesktopExport } from './run-export.js';

interface ExportTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

const READ_ONLY = {
  canTrim: false,
  canSelect: false,
  canSnap: false,
} as const;

export function ExportTab({ activeTab, onTabChange }: ExportTabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const currentFrame = useTransportStore((s) => s.playheadFrame);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);

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

  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;

  const [exportRange, setExportRange] = useState<ExportRange>({
    inFrame: 0,
    outFrame: durationFrames || 300,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null);

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
      setIsExporting(true);
      setExportProgress(progress.percentage);
      setProgressLabel(
        `Frame ${progress.currentFrame}/${progress.totalFrames} · ${Math.round(progress.percentage)}%`,
      );
    });

    const unsubscribeComplete = window.roughcut.onExportComplete((result) => {
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

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportStatus(null);
    setLastOutputPath(null);
    setExportProgress(0);
    setProgressLabel('Preparing export...');
    try {
      const result = await runDesktopExport(projectStore.getState().project, {
        startFrame: exportRange.inFrame,
        endFrame: exportRange.outFrame,
      });
      if (!result) {
        setIsExporting(false);
        setExportProgress(0);
        setProgressLabel('Ready to export');
        setExportStatus('Export cancelled');
      }
    } finally {
      if (!projectStore.getState().project.composition.duration) {
        setIsExporting(false);
      }
    }
  }, [exportRange.inFrame, exportRange.outFrame]);

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
                  template={activeTemplate ?? LAYOUT_TEMPLATES[1] ?? LAYOUT_TEMPLATES[0]!}
                  screenContent={
                    activeRecordingAsset?.filePath ? (
                      <RecordingPlaybackVideo
                        filePath={activeRecordingAsset.filePath}
                        fps={projectFps}
                        assetId={activeRecordingAsset.id}
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
                  screenAspect={resolution.width / resolution.height}
                  cameraAspect={4 / 3}
                  cameraPresentation={activeCameraPreview?.camera}
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
              Format
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>MP4 (H.264)</div>
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
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
              {resolution.width}x{resolution.height}
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
              Frame Rate
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{projectFps} fps</div>
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
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
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
              onClick={() => void handleExport()}
              style={primaryButtonStyle}
            >
              Export
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
