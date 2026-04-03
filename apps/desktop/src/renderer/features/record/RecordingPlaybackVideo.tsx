/**
 * Direct video playback for a single recording asset.
 * Syncs with the transport store playhead, mapping project-level frames
 * to recording-local time using the clip's timelineIn offset.
 *
 * Includes CursorOverlay when cursor event data is available.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { transportStore, useProjectStore } from '../../hooks/use-stores.js';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { CursorOverlay } from '../../components/CursorOverlay.js';
import type { CursorFrameData } from '../../components/CursorOverlay.js';
import { buildCursorFrameData, parseNdjsonCursorEvents } from '../../components/cursor-data-loader.js';

interface RecordingPlaybackVideoProps {
  filePath: string;
  fps: number;
  assetId: string;
}

export function RecordingPlaybackVideo({ filePath, fps, assetId }: RecordingPlaybackVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readyRef = useRef(false);

  // Find the clip range so we can map project frames → video time and hide outside.
  // Return a stable string to avoid infinite re-render (Zustand uses Object.is).
  const clipRangeKey = useProjectStore((s) => {
    for (const track of s.project.composition.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId === assetId) return `${clip.timelineIn}:${clip.timelineOut}`;
      }
    }
    return '0:0';
  });
  const [clipTimelineIn, clipTimelineOut] = clipRangeKey.split(':').map(Number) as [number, number];

  // Get the asset for cursor data + presentation
  const asset = useProjectStore((s) => s.project.assets.find((a) => a.id === assetId) ?? null);
  const cursorPresentation = asset?.presentation?.cursor ?? {
    style: 'default' as const,
    clickEffect: 'ripple' as const,
    sizePercent: 100,
    clickSoundEnabled: false,
  };

  // Load cursor data from the asset's sidecar file via IPC.
  // Use a ref to cache loaded data so re-mounts don't cause reload flicker.
  const [cursorData, setCursorData] = useState<CursorFrameData | null>(null);
  const cursorPath = asset?.metadata?.cursorEventsPath as string | null;
  const loadedCursorPathRef = useRef<string | null>(null);
  const cursorDataCacheRef = useRef<CursorFrameData | null>(null);

  // Snapshot asset metadata at render time (avoids closure over stale asset)
  const assetDuration = asset?.duration || 900;
  const assetWidth = (asset?.metadata?.width as number) || 1920;
  const assetHeight = (asset?.metadata?.height as number) || 1080;

  useEffect(() => {
    // If already loaded this exact path, reuse cached data
    if (cursorPath && cursorPath === loadedCursorPathRef.current && cursorDataCacheRef.current) {
      setCursorData(cursorDataCacheRef.current);
      return;
    }

    if (!cursorPath) {
      setCursorData(null);
      return;
    }

    let cancelled = false;

    console.info('[RecordingPlaybackVideo] Loading cursor data from:', cursorPath);

    (window as any).roughcut.readTextFile(cursorPath)
      .then((ndjson: string | null) => {
        if (cancelled) return;
        if (!ndjson) {
          console.warn('[RecordingPlaybackVideo] readTextFile returned null for:', cursorPath);
          return;
        }

        const events = parseNdjsonCursorEvents(ndjson);
        if (events.length === 0) return;

        const data = buildCursorFrameData(events, assetDuration, assetWidth, assetHeight);
        console.info('[RecordingPlaybackVideo] Cursor overlay ready:', data.frameCount, 'frames,', events.length, 'events');

        // Cache so re-mounts don't re-fetch
        loadedCursorPathRef.current = cursorPath;
        cursorDataCacheRef.current = data;
        setCursorData(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn('[RecordingPlaybackVideo] Failed to load cursor data:', err);
      });

    return () => { cancelled = true; };
  }, [cursorPath, assetDuration, assetWidth, assetHeight]);

  // Mark ready when video metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    readyRef.current = false;
    function onLoaded() { readyRef.current = true; }
    video.addEventListener('loadedmetadata', onLoaded);
    if (video.readyState >= 1) readyRef.current = true;
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [filePath]);

  // Register with PlaybackManager once metadata is loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const pm = getPlaybackManager();

    const doRegister = () => {
      pm.registerScreenVideo(video);
    };

    if (video.readyState >= 1) {
      doRegister();
    } else {
      video.addEventListener('loadedmetadata', doRegister, { once: true });
    }

    return () => {
      video.removeEventListener('loadedmetadata', doRegister);
      pm.unregisterScreenVideo();
    };
  }, [filePath]);

  // Clip range visibility — hide video when playhead is outside clip range
  useEffect(() => {
    const unsub = transportStore.subscribe((state) => {
      const video = videoRef.current;
      if (!video) return;
      const inRange = clipTimelineOut > 0
        && state.playheadFrame >= clipTimelineIn
        && state.playheadFrame < clipTimelineOut;
      video.style.visibility = inRange ? 'visible' : 'hidden';
    });
    return unsub;
  }, [clipTimelineIn, clipTimelineOut]);

  return (
    <>
      <video
        ref={videoRef}
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
      <CursorOverlay
        cursorData={cursorData}
        presentation={cursorPresentation}
        clipTimelineIn={clipTimelineIn}
      />
    </>
  );
}
