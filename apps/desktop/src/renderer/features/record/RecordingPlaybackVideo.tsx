/**
 * Compositor-backed playback for a single recording asset.
 *
 * The visible screen surface is the shared PixiJS compositor so Record and
 * Edit stay on the same render path, while Record-specific cursor and focal
 * point overlays continue to layer above it.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore, useTransportStore } from '../../hooks/use-stores.js';
import type { ZoomMarker, ZoomMarkerId } from '@rough-cut/project-model';
import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import { CursorOverlay } from '../../components/CursorOverlay.js';
import type { CursorFrameData } from '../../components/CursorOverlay.js';
import { buildCursorFrameData } from '../../components/cursor-data-loader.js';
import { useCursorEvents } from '../../hooks/use-cursor-events.js';
import { useCompositor } from '../../hooks/use-compositor.js';
import { inferCursorEventsPath } from '../../lib/media-sidecars.js';

interface RecordingPlaybackVideoProps {
  filePath: string;
  fps: number;
  assetId: string;
  /** All zoom markers for this recording (drives CSS zoom transform). */
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
  const { previewRef, isReady, setPreferredPlaybackAssetId } = useCompositor();

  useEffect(() => {
    setPreferredPlaybackAssetId(assetId);
    return () => setPreferredPlaybackAssetId(null);
  }, [assetId, setPreferredPlaybackAssetId]);

  // Find the clip range so we can map project frames → clip-local zoom timing.
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

  const asset = useProjectStore((s) => s.project.assets.find((a) => a.id === assetId) ?? null);
  const cursorPresentation = asset?.presentation?.cursor ?? {
    style: 'default' as const,
    clickEffect: 'ripple' as const,
    sizePercent: 100,
    clickSoundEnabled: false,
  };

  const assetDuration = asset?.duration || 900;
  const assetWidth = (asset?.metadata?.width as number) || 1920;
  const assetHeight = (asset?.metadata?.height as number) || 1080;
  const cursorPath = inferCursorEventsPath(
    asset?.filePath ?? null,
    asset?.metadata?.cursorEventsPath as string | null,
  );
  const cursorEvents = useCursorEvents(cursorPath, assetWidth, assetHeight);

  const [cursorData, setCursorData] = useState<CursorFrameData | null>(null);
  useEffect(() => {
    if (!cursorEvents || cursorEvents.length === 0) {
      setCursorData(null);
      return;
    }
    const data = buildCursorFrameData(cursorEvents, assetDuration, assetWidth, assetHeight);
    console.info(
      '[RecordingPlaybackVideo] Cursor overlay ready:',
      data.frameCount,
      'frames,',
      cursorEvents.length,
      'events',
    );
    setCursorData(data);
  }, [cursorEvents, assetDuration, assetWidth, assetHeight]);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);
  const inRange =
    clipTimelineOut > 0 && playheadFrame >= clipTimelineIn && playheadFrame < clipTimelineOut;

  const zt =
    zoomMarkers.length > 0
      ? getZoomTransformAtFrame(playheadFrame - clipTimelineIn, zoomMarkers, {
          followCursor: asset?.presentation?.zoom?.followCursor ?? true,
          followAnimation: asset?.presentation?.zoom?.followAnimation ?? 'focused',
          followPadding: asset?.presentation?.zoom?.followPadding ?? 0.18,
          getCursorPosition: (frame) => {
            if (!cursorData) return null;
            const clampedFrame = Math.max(0, Math.min(frame, cursorData.frameCount - 1));
            const idx = clampedFrame * 3;
            if (idx + 1 >= cursorData.frames.length) return null;
            const x = cursorData.frames[idx] ?? -1;
            const y = cursorData.frames[idx + 1] ?? -1;
            if (x < 0 || y < 0) return null;
            return { x, y };
          },
        })
      : { scale: 1, translateX: 0, translateY: 0 };

  const reticleVisible =
    !!selectedZoomMarker &&
    !isPlaying &&
    playheadFrame >= selectedZoomMarker.startFrame &&
    playheadFrame < selectedZoomMarker.endFrame;

  return (
    <div
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
            transformOrigin: '50% 50%',
            transform: `scale(${zt.scale}) translate(${zt.translateX * 100}%, ${zt.translateY * 100}%)`,
            transition: isPlaying
              ? 'transform 60ms linear'
              : 'transform 120ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            willChange: 'transform',
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
        crop={asset?.presentation?.screenCrop}
      />
      {reticleVisible && selectedZoomMarker && onFocalPointChange && (
        <FocalPointReticle
          focalPoint={selectedZoomMarker.focalPoint}
          onChange={(fp) => onFocalPointChange(selectedZoomMarker.id, fp)}
        />
      )}
    </div>
  );
}

function FocalPointReticle({
  focalPoint,
  onChange,
}: {
  focalPoint: { x: number; y: number };
  onChange: (fp: { x: number; y: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();

      const updateFromClient = (clientX: number, clientY: number) => {
        const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        onChange({ x: nx, y: ny });
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
    [onChange],
  );

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
          left: `${focalPoint.x * 100}%`,
          top: `${focalPoint.y * 100}%`,
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
