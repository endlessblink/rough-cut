/**
 * useCameraSync — syncs a camera <video> element to the transport store's playhead.
 *
 * Uses tiered correction:
 * - Paused: hard seek to exact position
 * - Playing, large drift (>1s): hard seek
 * - Playing, medium drift (>0.1s): playbackRate correction
 * - Playing, small drift: playbackRate = 1.0
 */
import { useEffect, useRef } from 'react';
import { useTransportStore } from '../../hooks/use-stores.js';

export function useCameraSync(
  cameraVideo: HTMLVideoElement | null,
  fps: number,
): void {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const playheadFrame = useTransportStore((s) => s.playheadFrame);

  // Store video ref so we don't re-subscribe on every frame
  const videoRef = useRef(cameraVideo);
  videoRef.current = cameraVideo;

  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  // Sync on play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const targetTime = playheadFrame / fpsRef.current;

    if (!isPlaying) {
      video.pause();
      video.currentTime = targetTime;
    } else {
      video.currentTime = targetTime;
      video.play().catch(() => {});
    }
  }, [isPlaying, playheadFrame]);

  // Continuous drift correction during playback
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;

    const correctDrift = () => {
      const video = videoRef.current;
      if (!video || video.paused) {
        rafId = requestAnimationFrame(correctDrift);
        return;
      }

      const targetTime = useTransportStore.getState().playheadFrame / fpsRef.current;
      const drift = video.currentTime - targetTime;
      const absDrift = Math.abs(drift);

      if (absDrift > 1.0) {
        // Large drift: hard seek
        video.currentTime = targetTime;
        video.playbackRate = 1.0;
      } else if (absDrift > 0.1) {
        // Medium drift: speed up or slow down
        video.playbackRate = drift > 0 ? 0.75 : 1.25;
      } else if (absDrift > 0.025) {
        // Small drift: gentle correction
        video.playbackRate = drift > 0 ? 0.9 : 1.1;
      } else {
        video.playbackRate = 1.0;
      }

      rafId = requestAnimationFrame(correctDrift);
    };

    rafId = requestAnimationFrame(correctDrift);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);
}
