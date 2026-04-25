/**
 * Compositor-backed playback for a single recording asset.
 *
 * The visible screen surface is the shared PixiJS compositor so Record and
 * Edit stay on the same render path, while Record-specific cursor and focal
 * point overlays continue to layer above it.
 */
import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { transportStore, useProjectStore } from '../../hooks/use-stores.js';
import type { ZoomMarker, ZoomMarkerId } from '@rough-cut/project-model';
import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import { CursorOverlay } from '../../components/CursorOverlay.js';
import type { CursorFrameData } from '../../components/CursorOverlay.js';
import { buildCursorFrameData } from '../../components/cursor-data-loader.js';
import {
  buildClickFrameTimeline,
  useClickSoundPlayback,
} from '../../hooks/use-click-sound-playback.js';
import { useCursorEvents } from '../../hooks/use-cursor-events.js';
import { useCompositor } from '../../hooks/use-compositor.js';
import { inferCursorEventsPath, resolveProjectMediaPath } from '../../lib/media-sidecars.js';

interface RecordingPlaybackVideoProps {
  filePath: string;
  fps: number;
  assetId: string;
  /** All zoom markers for this recording (drives cursor overlay + focal-point UI). */
  zoomMarkers?: readonly ZoomMarker[];
  /** If a zoom marker is selected AND playback is paused AND playhead is inside its range,
   *  render a focal-point reticle that the user can drag. */
  selectedZoomMarker?: ZoomMarker | null;
  onFocalPointChange?: (markerId: ZoomMarkerId, focalPoint: { x: number; y: number }) => void;
}

export function RecordingPlaybackVideo({
  filePath,
  fps,
  assetId,
  zoomMarkers = [],
  selectedZoomMarker = null,
  onFocalPointChange,
}: RecordingPlaybackVideoProps) {
  const asset = useProjectStore((s) => s.project.assets.find((a) => a.id === assetId) ?? null);
  const projectFilePath = useProjectStore((s) => s.projectFilePath);
  const assetWidth = (asset?.metadata?.width as number) || 1920;
  const assetHeight = (asset?.metadata?.height as number) || 1080;
  const { previewRef, isReady, setPreferredPlaybackAssetId, setRenderSize, setCursorFrameData } =
    useCompositor();

  useEffect(() => {
    setPreferredPlaybackAssetId(assetId);
    return () => setPreferredPlaybackAssetId(null);
  }, [assetId, setPreferredPlaybackAssetId]);

  useEffect(() => {
    setRenderSize(assetWidth, assetHeight);
  }, [assetHeight, assetWidth, setRenderSize]);

  // Find the clip range so we can map project frames => clip-local zoom timing.
  const clipRangeKey = useProjectStore((s) => {
    for (const track of s.project.composition.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId === assetId) {
          return `${clip.timelineIn}:${clip.timelineOut}:${clip.sourceIn}`;
        }
      }
    }
    return '0:0:0';
  });
  const [clipTimelineIn = 0, clipTimelineOut = 0] = clipRangeKey.split(':').map(Number);

  const cursorPresentation = asset?.presentation?.cursor ?? {
    style: 'default' as const,
    clickEffect: 'ripple' as const,
    sizePercent: 100,
    clickSoundEnabled: false,
  };

  const assetDuration = asset?.duration || 900;
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  // Frame rate the cursor sidecar was sampled at. New takes record this as
  // metadata.cursorEventsFps; legacy takes (no field) sampled at
  // TARGET_CAPTURE_FPS = 60. Falling back to the asset's recording fps is
  // wrong because the cursor recorder did not necessarily run at the file
  // fps — the assumption "60 if missing" matches every recording produced
  // before this fix.
  const cursorEventsFps =
    (asset?.metadata?.cursorEventsFps as number | undefined) ?? 60;
  // Wall-clock ms the cursor recorder ran ahead of the file's first frame
  // (FFmpeg startup gap on Linux/X11). Persisted by capture-service. Convert
  // to event-frame units so the loader can subtract it from each event's
  // frame index. Legacy takes default to 0 — they relied on the prior
  // MediaRecorder rebase, which was the best alignment available then.
  //
  // Reject implausibly large stored values: anything above 500 ms is almost
  // certainly a save-time bug (e.g., the early version of computeCursorEvents
  // LeadMs that conflated FFmpeg frame drops with startup gap and persisted
  // 2000 ms shifts that wiped the first 2 s of cursor data). This guard lets
  // already-saved projects recover without a re-record.
  const rawLeadMs = (asset?.metadata?.cursorEventsLeadMs as number | undefined) ?? 0;
  const cursorEventsLeadMs = rawLeadMs > 0 && rawLeadMs <= 500 ? rawLeadMs : 0;
  const cursorEventsLeadFrames = Math.round((cursorEventsLeadMs * cursorEventsFps) / 1000);
  const cursorPath = inferCursorEventsPath(
    resolveProjectMediaPath(asset?.filePath ?? null, projectFilePath),
    asset?.metadata?.cursorEventsPath as string | null,
    projectFilePath,
  );
  const cursorEvents = useCursorEvents(cursorPath, assetWidth, assetHeight);

  const [cursorData, setCursorData] = useState<CursorFrameData | null>(null);
  useEffect(() => {
    if (!cursorEvents || cursorEvents.length === 0) {
      setCursorData(null);
      return;
    }
    const data = buildCursorFrameData(
      cursorEvents,
      assetDuration,
      assetWidth,
      assetHeight,
      cursorEventsFps,
      projectFps,
      cursorEventsLeadFrames,
    );
    console.info(
      '[RecordingPlaybackVideo] Cursor overlay ready:',
      data.frameCount,
      'frames,',
      cursorEvents.length,
      'events,',
      `eventsFps=${cursorEventsFps} projectFps=${projectFps} leadFrames=${cursorEventsLeadFrames}`,
    );
    setCursorData(data);
  }, [
    cursorEvents,
    assetDuration,
    assetWidth,
    assetHeight,
    cursorEventsFps,
    projectFps,
    cursorEventsLeadFrames,
  ]);

  useEffect(() => {
    setCursorFrameData(assetId, cursorData);
    return () => {
      setCursorFrameData(assetId, null);
    };
  }, [assetId, cursorData, setCursorFrameData]);

  const [isPlaying, setIsPlaying] = useState(() => transportStore.getState().isPlaying);
  const [pausedPlayheadFrame, setPausedPlayheadFrame] = useState(
    () => transportStore.getState().playheadFrame,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncVisibility = (frame: number) => {
      if (!rootRef.current) return;
      const visible = clipTimelineOut > 0 && frame >= clipTimelineIn && frame < clipTimelineOut;
      rootRef.current.style.visibility = visible ? 'visible' : 'hidden';
    };

    syncVisibility(transportStore.getState().playheadFrame);

    return transportStore.subscribe((state, previousState) => {
      if (state.isPlaying !== previousState.isPlaying) {
        setIsPlaying(state.isPlaying);
      }
      if (state.playheadFrame !== previousState.playheadFrame) {
        syncVisibility(state.playheadFrame);
      }
      if (!state.isPlaying && state.playheadFrame !== previousState.playheadFrame) {
        setPausedPlayheadFrame(state.playheadFrame);
      }
    });
  }, [clipTimelineIn, clipTimelineOut]);

  const playheadFrame = pausedPlayheadFrame;
  const inRange =
    clipTimelineOut > 0 && playheadFrame >= clipTimelineIn && playheadFrame < clipTimelineOut;
  const clickFrames = useMemo(
    () => buildClickFrameTimeline(cursorEvents, cursorEventsFps, projectFps, clipTimelineIn),
    [clipTimelineIn, cursorEvents, cursorEventsFps, projectFps],
  );

  useClickSoundPlayback({
    enabled: cursorPresentation.clickSoundEnabled,
    clickFrames,
    isPlaying,
  });

  const getCursorPosition = useCallback(
    (frame: number, data: CursorFrameData | null = cursorData) => {
      if (!data) return null;
      const clampedFrame = Math.max(0, Math.min(frame, data.frameCount - 1));
      const idx = clampedFrame * 3;
      if (idx + 1 >= data.frames.length) return null;
      const x = data.frames[idx] ?? -1;
      const y = data.frames[idx + 1] ?? -1;
      if (x < 0 || y < 0) return null;
      return { x, y };
    },
    [cursorData],
  );

  const getZoomTransformForFrame = useCallback(
    (sourceFrame: number, data: CursorFrameData | null = cursorData) => {
      if (zoomMarkers.length === 0) return { scale: 1, translateX: 0, translateY: 0 };
      return getZoomTransformAtFrame(sourceFrame, zoomMarkers, {
        followCursor: asset?.presentation?.zoom?.followCursor ?? true,
        followAnimation: asset?.presentation?.zoom?.followAnimation ?? 'focused',
        followPadding: asset?.presentation?.zoom?.followPadding ?? 0.18,
        getCursorPosition: (frame) => getCursorPosition(frame, data),
      });
    },
    [
      asset?.presentation?.zoom?.followAnimation,
      asset?.presentation?.zoom?.followCursor,
      asset?.presentation?.zoom?.followPadding,
      cursorData,
      getCursorPosition,
      zoomMarkers,
    ],
  );

  const zt = getZoomTransformForFrame(playheadFrame - clipTimelineIn);

  const reticleVisible =
    !!selectedZoomMarker &&
    !isPlaying &&
    playheadFrame >= selectedZoomMarker.startFrame &&
    playheadFrame < selectedZoomMarker.endFrame;

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        visibility: inRange ? 'visible' : 'hidden',
      }}
    >
      <div
        data-testid="zoom-host"
        style={{
          position: 'absolute',
          inset: 0,
        }}
      >
        <div
          data-testid="recording-playback-canvas"
          style={{
            position: 'absolute',
            inset: 0,
          }}
        >
          <div ref={previewRef} style={{ position: 'absolute', inset: 0 }} />
        </div>
        <div
          data-testid="recording-playback-video"
          data-ready={isReady ? 'true' : 'false'}
          data-file-path={filePath}
          data-fps={String(fps)}
          style={{ display: 'none' }}
        />
      </div>
      <CursorOverlay
        cursorData={cursorData}
        presentation={cursorPresentation}
        clipTimelineIn={clipTimelineIn}
        zoomTransform={zt}
        getZoomTransform={getZoomTransformForFrame}
        crop={asset?.presentation?.screenCrop}
      />
      {reticleVisible && selectedZoomMarker && onFocalPointChange && (
        <FocalPointReticle
          focalPoint={selectedZoomMarker.focalPoint}
          zoomTransform={zt}
          onChange={(fp) => onFocalPointChange(selectedZoomMarker.id, fp)}
        />
      )}
    </div>
  );
}

/**
 * Map a source-normalized coordinate (0-1) to a screen-normalized position
 * given the current zoom transform.
 *
 * The PixiJS compositor renders with:
 *   screen_x = source_x * S + (1 - S) / 2 + translateX
 */
function sourceToScreen(s: number, scale: number, translate: number): number {
  return s * scale + (1 - scale) / 2 + translate;
}

/**
 * Inverse of sourceToScreen: given a screen-normalized coordinate, return the
 * corresponding source-normalized coordinate.
 *
 *   source_x = (screen_x - (1 - S) / 2 - translateX) / S
 */
function screenToSource(n: number, scale: number, translate: number): number {
  return (n - (1 - scale) / 2 - translate) / scale;
}

function FocalPointReticle({
  focalPoint,
  zoomTransform,
  onChange,
}: {
  focalPoint: { x: number; y: number };
  zoomTransform: { scale: number; translateX: number; translateY: number };
  onChange: (fp: { x: number; y: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { scale, translateX, translateY } = zoomTransform;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();

      const updateFromClient = (clientX: number, clientY: number) => {
        // Normalize screen coords to 0-1
        const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        // Inverse-transform through current zoom to get source-space coords
        const sx = Math.max(0, Math.min(1, screenToSource(nx, scale, translateX)));
        const sy = Math.max(0, Math.min(1, screenToSource(ny, scale, translateY)));
        onChange({ x: sx, y: sy });
      };

      updateFromClient(e.clientX, e.clientY);

      const onMove = (ev: PointerEvent) => updateFromClient(ev.clientX, ev.clientY);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onChange, scale, translateX, translateY],
  );

  // Forward-transform the stored focal point into screen space so the dot
  // appears exactly over the rendered source pixel, even when zoomed.
  const dotScreenX = sourceToScreen(focalPoint.x, scale, translateX);
  const dotScreenY = sourceToScreen(focalPoint.y, scale, translateY);

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: 'crosshair',
        pointerEvents: 'auto',
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${dotScreenX * 100}%`,
          top: `${dotScreenY * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '2px solid rgba(255,138,101,0.95)',
          background: 'rgba(255,138,101,0.30)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.40)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(255,138,101,1)',
          }}
        />
      </div>
    </div>
  );
}
