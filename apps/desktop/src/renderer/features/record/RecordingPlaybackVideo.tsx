/**
 * Direct video playback for a single recording asset.
 * Syncs with the transport store playhead, mapping project-level frames
 * to recording-local time using the clip's timelineIn offset.
 */
import { useRef, useEffect, useCallback } from 'react';
import { transportStore, useProjectStore } from '../../hooks/use-stores.js';

interface RecordingPlaybackVideoProps {
  filePath: string;
  fps: number;
  assetId: string;
}

export function RecordingPlaybackVideo({ filePath, fps, assetId }: RecordingPlaybackVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readyRef = useRef(false);

  // Find the clip offset so we can map project frames → video time
  const clipTimelineIn = useProjectStore((s) => {
    for (const track of s.project.composition.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId === assetId) return clip.timelineIn;
      }
    }
    return 0;
  });

  // Convert project-level frame to video-local time
  const frameToVideoTime = useCallback(
    (projectFrame: number) => Math.max(0, (projectFrame - clipTimelineIn) / fps),
    [clipTimelineIn, fps],
  );

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

  // Seek video when playhead changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !readyRef.current) return;
    const isPlaying = transportStore.getState().isPlaying;
    if (isPlaying) return; // during playback, let video play naturally
    const targetTime = frameToVideoTime(transportStore.getState().playheadFrame);
    if (Math.abs(video.currentTime - targetTime) > 0.03) {
      video.currentTime = targetTime;
    }
  });

  // Subscribe to transport store directly for immediate scrub response
  useEffect(() => {
    const unsub = transportStore.subscribe((state) => {
      const video = videoRef.current;
      if (!video || !readyRef.current || state.isPlaying) return;
      const targetTime = frameToVideoTime(state.playheadFrame);
      if (Math.abs(video.currentTime - targetTime) > 0.03) {
        video.currentTime = targetTime;
      }
    });
    return unsub;
  }, [frameToVideoTime]);

  // Play/pause sync
  useEffect(() => {
    return transportStore.subscribe((state) => {
      const video = videoRef.current;
      if (!video || !readyRef.current) return;
      if (state.isPlaying) {
        video.currentTime = frameToVideoTime(state.playheadFrame);
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [frameToVideoTime]);

  // During playback, update transport store from video time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function onTimeUpdate() {
      if (!video || !transportStore.getState().isPlaying) return;
      const projectFrame = Math.round(video.currentTime * fps) + clipTimelineIn;
      transportStore.getState().setPlayheadFrame(projectFrame);
    }
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [fps, clipTimelineIn]);

  return (
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
  );
}
