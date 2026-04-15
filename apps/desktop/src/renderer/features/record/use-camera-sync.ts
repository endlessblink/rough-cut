/**
 * useCameraSync — syncs a camera <video> element to the transport store.
 *
 * During playback: video.play() runs natively, no per-frame seeking.
 * When paused: seeks to exact playhead position for scrubbing.
 */
import { useEffect, useRef } from 'react';
import { transportStore } from '../../hooks/use-stores.js';

export function useCameraSync(cameraVideo: HTMLVideoElement | null, fps: number): void {
  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  const wasPlayingRef = useRef(false);

  // Re-run when cameraVideo changes (not just on mount)
  useEffect(() => {
    if (!cameraVideo) return;

    // Check current state immediately — we may have missed the play transition
    const state = transportStore.getState();
    if (state.isPlaying && !wasPlayingRef.current) {
      wasPlayingRef.current = true;
      cameraVideo.currentTime = state.playheadFrame / fpsRef.current;
      cameraVideo
        .play()
        .then(() => {
          console.info(
            `[CameraSync] play() OK — ${cameraVideo.videoWidth}x${cameraVideo.videoHeight} readyState=${cameraVideo.readyState}`,
          );
        })
        .catch((e) => {
          console.error('[CameraSync] play() FAILED:', e);
        });
    } else if (!state.isPlaying) {
      // Paused — seek to current position
      const targetTime = state.playheadFrame / fpsRef.current;
      if (Math.abs(cameraVideo.currentTime - targetTime) > 0.03) {
        cameraVideo.currentTime = targetTime;
      }
    }

    // Subscribe for future state changes
    const unsub = transportStore.subscribe((newState) => {
      if (newState.isPlaying && !wasPlayingRef.current) {
        wasPlayingRef.current = true;
        cameraVideo.currentTime = newState.playheadFrame / fpsRef.current;
        cameraVideo
          .play()
          .then(() => {
            console.info(
              `[CameraSync] play() OK — ${cameraVideo.videoWidth}x${cameraVideo.videoHeight} readyState=${cameraVideo.readyState}`,
            );
          })
          .catch((e) => {
            console.error('[CameraSync] play() FAILED:', e);
          });
      } else if (newState.isPlaying) {
        const targetTime = newState.playheadFrame / fpsRef.current;
        const drift = Math.abs(cameraVideo.currentTime - targetTime);
        if (drift > 0.05) {
          cameraVideo.currentTime = targetTime;
        }
      } else if (!newState.isPlaying && wasPlayingRef.current) {
        wasPlayingRef.current = false;
        cameraVideo.pause();
        cameraVideo.currentTime = newState.playheadFrame / fpsRef.current;
      } else if (!newState.isPlaying) {
        const targetTime = newState.playheadFrame / fpsRef.current;
        if (Math.abs(cameraVideo.currentTime - targetTime) > 0.03) {
          cameraVideo.currentTime = targetTime;
        }
      }
    });

    return () => {
      unsub();
      wasPlayingRef.current = false;
    };
  }, [cameraVideo]); // re-subscribe when video element changes

  // Drift correction — keep camera close to the screen-driven transport clock.
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!cameraVideo || cameraVideo.paused || !wasPlayingRef.current) return;
      const targetTime = transportStore.getState().playheadFrame / fpsRef.current;
      const drift = Math.abs(cameraVideo.currentTime - targetTime);
      if (drift > 0.08) {
        cameraVideo.currentTime = targetTime;
      }
    }, 250);
    return () => clearInterval(intervalId);
  }, [cameraVideo]);
}
