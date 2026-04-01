/**
 * usePlaybackLoop — rAF-based playback loop for advancing the transport playhead.
 *
 * Extracted from RecordTimelineShell's playback logic. Watches transportStore.isPlaying
 * and advances playheadFrame at the given fps rate. Stops at end of duration.
 *
 * All timing state lives in refs — zero re-renders during playback.
 */
import { useRef, useEffect } from 'react';
import { transportStore } from './use-stores.js';
import { getVideoCurrentTime } from './use-compositor.js';

export function usePlaybackLoop(fps: number, durationFrames: number): void {
  const rafIdRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const isPlayingRef = useRef(false);
  const frameRef = useRef(0);
  const fpsRef = useRef(fps);
  const durationRef = useRef(durationFrames);

  // Keep refs fresh without restarting the loop
  useEffect(() => { fpsRef.current = fps; }, [fps]);
  useEffect(() => { durationRef.current = durationFrames; }, [durationFrames]);

  useEffect(() => {
    const unsub = transportStore.subscribe((state) => {
      if (state.isPlaying && !isPlayingRef.current) {
        // Start playback
        isPlayingRef.current = true;
        frameRef.current = state.playheadFrame;
        lastTimestampRef.current = performance.now();

        const tick = (timestamp: number) => {
          if (!isPlayingRef.current) return;

          const interval = 1000 / fpsRef.current;
          const delta = timestamp - lastTimestampRef.current;

          if (delta >= interval) {
            lastTimestampRef.current = timestamp - (delta % interval);

            const videoTime = getVideoCurrentTime();
            if (videoTime >= 0) {
              // Compositor is driving playback — read from video
              const frame = Math.round(videoTime * fpsRef.current);
              if (frame !== frameRef.current) {
                frameRef.current = frame;
              }
            } else {
              // No compositor video — use frame increment (RecordTab fallback)
              frameRef.current += 1;
            }

            if (frameRef.current >= durationRef.current) {
              // End of timeline — stop and reset
              frameRef.current = 0;
              isPlayingRef.current = false;
              transportStore.getState().seekToFrame(0);
              return;
            }

            transportStore.getState().setPlayheadFrame(frameRef.current);
          }

          rafIdRef.current = requestAnimationFrame(tick);
        };

        rafIdRef.current = requestAnimationFrame(tick);
      } else if (!state.isPlaying && isPlayingRef.current) {
        // Stop playback
        isPlayingRef.current = false;
        cancelAnimationFrame(rafIdRef.current);
      }
    });

    return () => {
      unsub();
      isPlayingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []); // Subscribe once, never restart
}
