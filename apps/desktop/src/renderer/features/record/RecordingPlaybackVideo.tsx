/**
 * Direct video playback for a single recording asset.
 * Syncs with the transport store playhead, mapping project-level frames
 * to recording-local time using the clip's timelineIn offset.
 *
 * Includes CursorOverlay when cursor event data is available.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { transportStore, useProjectStore, useTransportStore } from '../../hooks/use-stores.js';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import type { ZoomMarker, ZoomMarkerId } from '@rough-cut/project-model';
import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';
import { CursorOverlay } from '../../components/CursorOverlay.js';
import type { CursorFrameData } from '../../components/CursorOverlay.js';
import { buildCursorFrameData } from '../../components/cursor-data-loader.js';
import { useCursorEvents } from '../../hooks/use-cursor-events.js';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const readyRef = useRef(false);

  // Find the clip range so we can map project frames → video time and hide outside.
  // Return a stable string to avoid infinite re-render (Zustand uses Object.is).
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
  const [clipTimelineIn, clipTimelineOut, clipSourceIn] = clipRangeKey.split(':').map(Number) as [
    number,
    number,
    number,
  ];

  const frameToVideoTime = useCallback(
    (frame: number) => Math.max(0, (clipSourceIn + (frame - clipTimelineIn)) / fps),
    [clipSourceIn, clipTimelineIn, fps],
  );

  const videoTimeToFrame = useCallback(
    (mediaTime: number) => clipTimelineIn + Math.round(mediaTime * fps) - clipSourceIn,
    [clipSourceIn, clipTimelineIn, fps],
  );

  // Get the asset for cursor data + presentation
  const asset = useProjectStore((s) => s.project.assets.find((a) => a.id === assetId) ?? null);
  const cursorPresentation = asset?.presentation?.cursor ?? {
    style: 'default' as const,
    clickEffect: 'ripple' as const,
    sizePercent: 100,
    clickSoundEnabled: false,
  };

  // Source raw cursor events from the shared hook (module-cached by path).
  const cursorPath = asset?.metadata?.cursorEventsPath as string | null;
  const cursorEvents = useCursorEvents(cursorPath);

  // Snapshot asset metadata at render time (avoids closure over stale asset)
  const assetDuration = asset?.duration || 900;
  const assetWidth = (asset?.metadata?.width as number) || 1920;
  const assetHeight = (asset?.metadata?.height as number) || 1080;

  // Build frame-indexed cursor data for the overlay (expensive — only done here).
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

  // Mark ready when video metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    readyRef.current = false;
    function onLoaded() {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      readyRef.current = true;
      currentVideo.currentTime = frameToVideoTime(transportStore.getState().playheadFrame);
    }
    video.addEventListener('loadedmetadata', onLoaded);
    if (video.readyState >= 1) {
      readyRef.current = true;
      video.currentTime = frameToVideoTime(transportStore.getState().playheadFrame);
    }
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [filePath, frameToVideoTime]);

  // Register with PlaybackManager once metadata is loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const pm = getPlaybackManager();

    const doRegister = () => {
      pm.registerScreenVideo(video, frameToVideoTime, videoTimeToFrame);
    };

    if (video.readyState >= 1) {
      doRegister();
    } else {
      video.addEventListener('loadedmetadata', doRegister, { once: true });
    }

    return () => {
      video.removeEventListener('loadedmetadata', doRegister);
      pm.unregisterScreenVideo(video);
    };
  }, [filePath, frameToVideoTime, videoTimeToFrame]);

  // Clip range visibility — hide video when playhead is outside clip range
  useEffect(() => {
    const unsub = transportStore.subscribe((state) => {
      const video = videoRef.current;
      if (!video) return;
      const inRange =
        clipTimelineOut > 0 &&
        state.playheadFrame >= clipTimelineIn &&
        state.playheadFrame < clipTimelineOut;
      video.style.visibility = inRange ? 'visible' : 'hidden';

      if (!state.isPlaying && readyRef.current) {
        const targetTime = frameToVideoTime(state.playheadFrame);
        if (Math.abs(video.currentTime - targetTime) > 0.03) {
          video.currentTime = targetTime;
        }
      }
    });
    return unsub;
  }, [clipTimelineIn, clipTimelineOut, frameToVideoTime]);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);

  // Always apply the zoom transform — users expect to see the effect
  // whenever a marker covers the playhead, whether playing or paused.
  const zt =
    zoomMarkers.length > 0
      ? getZoomTransformAtFrame(playheadFrame - clipTimelineIn, zoomMarkers)
      : { scale: 1, translateX: 0, translateY: 0 };

  // Reticle: show when a marker is selected + paused + playhead in range.
  // The reticle sits OUTSIDE the zoom wrapper so its position is independent
  // of the applied transform.
  const reticleVisible =
    !!selectedZoomMarker &&
    !isPlaying &&
    playheadFrame >= selectedZoomMarker.startFrame &&
    playheadFrame < selectedZoomMarker.endFrame;

  // Smooth transform with a short CSS transition that matches the frame interval.
  // 60ms ≈ 2 frames @30fps — long enough to smooth inter-frame snaps, short enough
  // to stay visually "locked" to the playhead.
  const zoomStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    transformOrigin: '50% 50%',
    transform: `scale(${zt.scale}) translate(${zt.translateX * 100}%, ${zt.translateY * 100}%)`,
    transition: isPlaying
      ? 'transform 60ms linear'
      : 'transform 120ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    willChange: 'transform',
  };

  return (
    <>
      <div data-testid="zoom-host" style={zoomStyle}>
        <video
          ref={videoRef}
          data-testid="recording-playback-video"
          src={`media://${filePath}`}
          muted
          playsInline
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            display: 'block',
          }}
        />
      </div>
      <CursorOverlay
        cursorData={cursorData}
        presentation={cursorPresentation}
        clipTimelineIn={clipTimelineIn}
        zoomTransform={zt}
      />
      {reticleVisible && selectedZoomMarker && onFocalPointChange && (
        <FocalPointReticle
          focalPoint={selectedZoomMarker.focalPoint}
          onChange={(fp) => onFocalPointChange(selectedZoomMarker.id, fp)}
        />
      )}
    </>
  );
}

// ─── FocalPointReticle ──────────────────────────────────────────────────────

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
