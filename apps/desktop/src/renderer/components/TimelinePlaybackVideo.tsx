/**
 * TimelinePlaybackVideo — renders a direct <video> element that shows
 * the correct video frame for the current playhead position.
 *
 * Resolves which clip is active at the playhead, loads its video,
 * and syncs seeking/playback with the transport store.
 */
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { transportStore, useProjectStore } from '../hooks/use-stores.js';
import type { Clip, Asset } from '@rough-cut/project-model';

interface ActiveClipInfo {
  clip: Clip;
  asset: Asset;
}

export function TimelinePlaybackVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readyRef = useRef(false);
  const activeClipRef = useRef<ActiveClipInfo | null>(null);

  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const fps = useProjectStore((s) => s.project.settings.frameRate);
  const activeAssetId = useProjectStore((s) => s.activeAssetId);

  // Build asset lookup map
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  // Find the active clip at a given frame.
  // When multiple clips overlap, prefer the one matching activeAssetId.
  const findActiveClipAtFrame = useCallback(
    (frame: number): ActiveClipInfo | null => {
      let fallback: ActiveClipInfo | null = null;
      for (const track of tracks) {
        if (track.type !== 'video') continue;
        for (const clip of track.clips) {
          if (frame >= clip.timelineIn && frame < clip.timelineOut) {
            const asset = assetMap.get(clip.assetId);
            if (asset?.filePath) {
              // Prefer the clip matching the active recording
              if (activeAssetId && clip.assetId === activeAssetId) {
                return { clip, asset };
              }
              if (!fallback) fallback = { clip, asset };
            }
          }
        }
      }
      return fallback;
    },
    [tracks, assetMap, activeAssetId],
  );

  // Track the current video src to trigger re-renders when clip changes
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const videoSrcRef = useRef<string | null>(null);

  // Convert playhead frame to video-local time for the given clip
  const frameToVideoTime = useCallback(
    (frame: number, clip: Clip) => {
      const sourceFrame = clip.sourceIn + (frame - clip.timelineIn);
      return Math.max(0, sourceFrame / fps);
    },
    [fps],
  );

  // Mark ready when video metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    readyRef.current = false;
    function onLoaded() {
      readyRef.current = true;
    }
    video.addEventListener('loadedmetadata', onLoaded);
    if (video.readyState >= 1) readyRef.current = true;
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [videoSrc]);

  // Subscribe to transport store for scrub + clip resolution
  useEffect(() => {
    const unsub = transportStore.subscribe((state) => {
      const info = findActiveClipAtFrame(state.playheadFrame);

      // Update active clip ref
      const prevClipId = activeClipRef.current?.clip.id;
      activeClipRef.current = info;

      if (!info) {
        // No active clip at this frame — blank
        if (videoSrcRef.current !== null) {
          videoSrcRef.current = null;
          setVideoSrc(null);
        }
        return;
      }

      const newSrc = `media://${info.asset.filePath}`;

      // If clip changed, update the video source
      if (info.clip.id !== prevClipId) {
        readyRef.current = false;
        videoSrcRef.current = newSrc;
        setVideoSrc(newSrc);
      }

      // Seek the video to the correct source time (only when not playing)
      const video = videoRef.current;
      if (!video || !readyRef.current || state.isPlaying) return;
      const targetTime = frameToVideoTime(state.playheadFrame, info.clip);
      if (Math.abs(video.currentTime - targetTime) > 0.03) {
        video.currentTime = targetTime;
      }
    });
    return unsub;
  }, [findActiveClipAtFrame, frameToVideoTime]);

  // Play/pause sync — only react to isPlaying transitions
  useEffect(() => {
    let wasPlaying = false;
    const unsub = transportStore.subscribe((state) => {
      const video = videoRef.current;
      const info = activeClipRef.current;
      if (!video || !readyRef.current || !info) return;

      if (state.isPlaying && !wasPlaying) {
        // Play started
        video.currentTime = frameToVideoTime(state.playheadFrame, info.clip);
        video.play().catch(() => {});
      } else if (!state.isPlaying && wasPlaying) {
        // Play stopped
        video.pause();
      }
      wasPlaying = state.isPlaying;
    });
    return unsub;
  }, [frameToVideoTime]);

  // During playback, feed video time back to transport store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function onTimeUpdate() {
      if (!video || !transportStore.getState().isPlaying) return;
      const info = activeClipRef.current;
      if (!info) return;
      const sourceFrame = Math.round(video.currentTime * fps);
      const projectFrame = sourceFrame - info.clip.sourceIn + info.clip.timelineIn;
      transportStore.getState().setPlayheadFrame(projectFrame);
    }
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [fps, videoSrc]);

  // Resolve initial clip on mount
  useEffect(() => {
    const frame = transportStore.getState().playheadFrame;
    const info = findActiveClipAtFrame(frame);
    activeClipRef.current = info;
    if (info) {
      setVideoSrc(`media://${info.asset.filePath}`);
    }
  }, [findActiveClipAtFrame]);

  if (!videoSrc) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          No clip at playhead
        </span>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoSrc}
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
  );
}
