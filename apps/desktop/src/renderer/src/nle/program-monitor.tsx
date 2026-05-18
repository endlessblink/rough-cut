import React from 'react';
import type { NleProject } from './types';
import { frameToSeconds, secondsToFrame } from './project-shape.mjs';

// Frame-accuracy budget: while playing, the model can lag the video by at
// most this many frames before we resync. Setting too low causes a
// constant tug-of-war; too high lets the playhead UI fall visibly behind.
const PLAYBACK_DRIFT_FRAMES = 1;
// While paused/seeking, we tolerate sub-frame jitter on the video clock
// before issuing a corrective currentTime write.
const SEEK_TOLERANCE_SECONDS = 1 / 60; // ~one display frame at 60Hz

type RvfcMetadata = { mediaTime: number; presentedFrames: number };
type RvfcCallback = (now: number, metadata: RvfcMetadata) => void;
type RvfcVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: RvfcCallback) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export function NleProgramMonitor({
  project,
  playheadFrame,
  isPlaying,
  fps,
  durationFrames,
  onPlayheadFrameChange,
  onPlayingChange,
}: {
  project: NleProject;
  playheadFrame: number;
  isPlaying: boolean;
  fps: number;
  durationFrames: number;
  onPlayheadFrameChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const videoRef = React.useRef<RvfcVideoElement | null>(null);
  // Tracks the frame the model most recently wrote to video.currentTime —
  // used to suppress the RVFC echo from our own seek.
  const lastModelSeekFrameRef = React.useRef<number>(playheadFrame);
  const src = project.mediaUrl ?? '';

  // Model → video: when the model's playheadFrame drifts away from the
  // video's currentTime by more than the tolerance, write the target time.
  // The threshold prevents tug-of-war: when the RVFC loop nudges the model
  // forward during playback, this effect won't bounce the video back.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const targetSec = frameToSeconds(playheadFrame, fps);
    const drift = Math.abs(video.currentTime - targetSec);
    const tolerance = isPlaying ? PLAYBACK_DRIFT_FRAMES / fps : SEEK_TOLERANCE_SECONDS;
    if (drift > tolerance) {
      lastModelSeekFrameRef.current = playheadFrame;
      try {
        video.currentTime = targetSec;
      } catch {
        // Some Electron edge cases throw when assigning before metadata
        // is ready; the next effect run after `loadedmetadata` will retry.
      }
    }
  }, [playheadFrame, isPlaying, fps]);

  // Model → video: play/pause transport state.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      void video.play().catch(() => {
        // Autoplay can be blocked even after user gesture in Electron
        // edge cases — drop back to paused so the UI matches reality.
        onPlayingChange(false);
      });
    } else if (!video.paused) {
      video.pause();
    }
  }, [isPlaying, onPlayingChange]);

  // Video → model: drive the playhead from the actual decoded frame via
  // requestVideoFrameCallback. RVFC fires once per presented frame and the
  // mediaTime it provides is PTS-aligned (more accurate than currentTime,
  // which is backed by the audio clock and can drift by tens of ms).
  // Fallback: if RVFC isn't available, poll currentTime via rAF.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPlaying) return;
    let cancelled = false;
    let rafId = 0;
    let rvfcId = 0;

    const tick = (mediaTimeSec: number) => {
      if (cancelled) return;
      const frame = secondsToFrame(mediaTimeSec, fps);
      const clamped = Math.max(0, Math.min(durationFrames, frame));
      onPlayheadFrameChange(clamped);
      if (clamped >= durationFrames) {
        onPlayingChange(false);
      }
    };

    const useRvfc = typeof video.requestVideoFrameCallback === 'function';
    if (useRvfc) {
      const loop: RvfcCallback = (_now, metadata) => {
        tick(metadata.mediaTime);
        if (!cancelled) {
          rvfcId = (video.requestVideoFrameCallback as (cb: RvfcCallback) => number)(loop);
        }
      };
      rvfcId = (video.requestVideoFrameCallback as (cb: RvfcCallback) => number)(loop);
    } else {
      const loop = () => {
        tick(video.currentTime);
        if (!cancelled) rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (rvfcId && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(rvfcId);
      }
    };
  }, [isPlaying, fps, durationFrames, onPlayheadFrameChange, onPlayingChange]);

  if (!src) {
    return (
      <div className="nleProgramMonitor empty" data-ui-region="nle-monitor">
        <p>No media yet</p>
      </div>
    );
  }

  return (
    <div className="nleProgramMonitor" data-ui-region="nle-monitor">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        className="nleProgramMonitorVideo"
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
        onEnded={() => onPlayingChange(false)}
      />
    </div>
  );
}
