/**
 * useCameraSync — syncs a camera <video> element to the transport store.
 *
 * During playback: video.play() runs natively, no per-frame seeking.
 * When paused: seeks to exact playhead position for scrubbing.
 * Uses direct Zustand subscriptions (NOT useTransportStore hooks) to
 * avoid React re-renders during playback.
 */
import { useEffect, useRef } from 'react';
import { transportStore } from '../../hooks/use-stores.js';

export function useCameraSync(
  cameraVideo: HTMLVideoElement | null,
  fps: number,
): void {
  const videoRef = useRef(cameraVideo);
  videoRef.current = cameraVideo;

  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  const wasPlayingRef = useRef(false);

  useEffect(() => {
    // Direct store subscription — zero React re-renders
    const unsub = transportStore.subscribe((state) => {
      const video = videoRef.current;
      if (!video) return;

      if (state.isPlaying && !wasPlayingRef.current) {
        // Play transition: start native playback once
        wasPlayingRef.current = true;
        video.currentTime = state.playheadFrame / fpsRef.current;
        video.play().catch(() => {});
      } else if (!state.isPlaying && wasPlayingRef.current) {
        // Pause transition: stop and seek to exact frame
        wasPlayingRef.current = false;
        video.pause();
        video.currentTime = state.playheadFrame / fpsRef.current;
      } else if (!state.isPlaying) {
        // Scrubbing while paused: seek to playhead
        const targetTime = state.playheadFrame / fpsRef.current;
        if (Math.abs(video.currentTime - targetTime) > 0.03) {
          video.currentTime = targetTime;
        }
      }
      // During playback: do nothing — native video.play() handles it
    });

    return unsub;
  }, []);

  // Large drift correction — only check every 2 seconds, only hard-seek if >1s off
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const checkDrift = () => {
      const video = videoRef.current;
      if (!video || video.paused || !wasPlayingRef.current) return;

      const targetTime = transportStore.getState().playheadFrame / fpsRef.current;
      const drift = Math.abs(video.currentTime - targetTime);

      if (drift > 1.0) {
        video.currentTime = targetTime;
      }
    };

    intervalId = setInterval(checkDrift, 2000);
    return () => clearInterval(intervalId);
  }, []);
}
