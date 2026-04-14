/**
 * PlaybackManager — single owner of all video playback.
 *
 * Replaces 6 scattered mechanisms (RecordingPlaybackVideo subscriptions,
 * camera-specific sync hooks, usePlaybackLoop, PlaybackController, PlaybackClock,
 * RecordTimelineShell rAF loop) with one class that controls all
 * <video> elements and the PixiJS compositor.
 *
 * During playback: HTML <video>.play() is the clock. A single rAF loop
 * reads video.currentTime and syncs the store at ~30Hz.
 * During pause/scrub: transport store's playheadFrame is the clock.
 * PlaybackManager seeks all video elements to match.
 */

import type { PreviewCompositor } from './preview-compositor.js';

// Minimal store interface — avoids importing Zustand types
interface TransportStoreApi {
  getState: () => {
    playheadFrame: number;
    isPlaying: boolean;
  };
  setState: (partial: Partial<{ playheadFrame: number; isPlaying: boolean }>) => void;
  subscribe: (
    listener: (state: { playheadFrame: number; isPlaying: boolean }) => void,
  ) => () => void;
}

interface ProjectStoreApi {
  getState: () => {
    project: {
      settings: { frameRate: number };
      composition: { duration: number };
    };
  };
}

export interface PlaybackManagerConfig {
  transportStore: TransportStoreApi;
  projectStore: ProjectStoreApi;
}

export class PlaybackManager {
  private transportStore: TransportStoreApi;
  private projectStore: ProjectStoreApi;

  private screenVideo: HTMLVideoElement | null = null;
  private cameraVideo: HTMLVideoElement | null = null;
  private compositor: PreviewCompositor | null = null;

  private _playing = false;
  private _rafId = 0;
  private _rvfcId = 0;
  private _useRvfc = false;
  private _lastSyncedFrame = -1;
  private _scrubUnsub: (() => void) | null = null;

  constructor(config: PlaybackManagerConfig) {
    this.transportStore = config.transportStore;
    this.projectStore = config.projectStore;

    // Subscribe to transport store for scrub detection (only when paused)
    this._scrubUnsub = this.transportStore.subscribe((state) => {
      if (!this._playing && !state.isPlaying) {
        this._seekAllTo(state.playheadFrame);
      }
    });
  }

  // ── Registration ─────────────────────────────────────────────

  registerScreenVideo(video: HTMLVideoElement): void {
    this.screenVideo = video;
    console.info('[PlaybackManager] Screen video registered');
    // If already playing (late registration), start this video
    if (this._playing) {
      this._startVideo(video);
    } else {
      this._seekAllTo(this.transportStore.getState().playheadFrame);
    }
  }

  registerCameraVideo(video: HTMLVideoElement): void {
    this.cameraVideo = video;
    console.info('[PlaybackManager] Camera video registered');
    if (this._playing) {
      const fps = this.projectStore.getState().project.settings.frameRate;
      const targetTime =
        this.screenVideo?.currentTime ?? this.transportStore.getState().playheadFrame / fps;
      video.currentTime = targetTime;
      this._startVideo(video);
    } else {
      this._seekAllTo(this.transportStore.getState().playheadFrame);
    }
  }

  unregisterScreenVideo(): void {
    if (this.screenVideo) {
      this.screenVideo.pause();
      this.screenVideo = null;
    }
  }

  unregisterCameraVideo(): void {
    if (this.cameraVideo) {
      this.cameraVideo.pause();
      this.cameraVideo = null;
    }
  }

  registerCompositor(comp: PreviewCompositor): void {
    this.compositor = comp;
    console.info('[PlaybackManager] Compositor registered');
  }

  unregisterCompositor(): void {
    this.compositor = null;
  }

  // ── Transport commands ───────────────────────────────────────

  play(): void {
    if (this._playing) return;
    this._playing = true;

    const fps = this.projectStore.getState().project.settings.frameRate;
    const startTime = this.transportStore.getState().playheadFrame / fps;

    // Start all registered videos
    if (this.screenVideo) {
      this.screenVideo.currentTime = startTime;
      this._startVideo(this.screenVideo);
    }
    if (this.cameraVideo) {
      this.cameraVideo.currentTime = startTime;
      this._startVideo(this.cameraVideo);
    }
    if (this.compositor) {
      this.compositor.play();
    }

    // Update store
    this.transportStore.setState({ isPlaying: true });

    // Start sync loop — prefer rVFC when available for frame-accurate callbacks
    this._lastSyncedFrame = -1;
    this._useRvfc = !!(this.screenVideo && 'requestVideoFrameCallback' in this.screenVideo);
    if (this._useRvfc && this.screenVideo) {
      this._rvfcId = this.screenVideo.requestVideoFrameCallback(this._onVideoFrame);
    } else {
      this._rafId = requestAnimationFrame(this._syncLoop);
    }

    console.info(
      '[PlaybackManager] play() — started from',
      startTime.toFixed(2) + 's',
      this._useRvfc ? '(rVFC)' : '(rAF)',
    );
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;

    // Stop sync loop
    if (this._useRvfc && this.screenVideo) {
      this.screenVideo.cancelVideoFrameCallback(this._rvfcId);
    } else {
      cancelAnimationFrame(this._rafId);
    }

    // Pause all videos
    this.screenVideo?.pause();
    this.cameraVideo?.pause();
    if (this.compositor) {
      this.compositor.pause();
    }

    // Snap playhead to current video time
    const fps = this.projectStore.getState().project.settings.frameRate;
    const currentTime =
      this.screenVideo?.currentTime ?? this.compositor?.getVideoCurrentTime() ?? 0;
    const frame = Math.round(currentTime * fps);

    this.transportStore.setState({ isPlaying: false, playheadFrame: frame });
    console.info('[PlaybackManager] pause() — at frame', frame);
  }

  /**
   * Start/stop the compositor's native video playback without starting
   * PlaybackManager's own sync loop. Used by RecordTimelineShell which
   * has its own rAF loop but needs the compositor video to play() for audio.
   */
  setCompositorPlaying(playing: boolean): void {
    if (this.compositor) {
      if (playing) {
        this.compositor.play();
      } else {
        this.compositor.pause();
      }
    }
  }

  togglePlay(): void {
    if (this._playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  seekToFrame(frame: number): void {
    if (this._playing) {
      this.pause();
    }
    this.transportStore.setState({ playheadFrame: Math.max(0, Math.round(frame)) });
    // _seekAllTo will be triggered by the store subscription
  }

  stepForward(frames = 1): void {
    if (this._playing) this.pause();
    const current = this.transportStore.getState().playheadFrame;
    this.transportStore.setState({ playheadFrame: current + frames });
  }

  stepBackward(frames = 1): void {
    if (this._playing) this.pause();
    const current = this.transportStore.getState().playheadFrame;
    this.transportStore.setState({ playheadFrame: Math.max(0, current - frames) });
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  // ── Internal ─────────────────────────────────────────────────

  private _startVideo(video: HTMLVideoElement): void {
    video
      .play()
      .then(() => {
        console.info(
          `[PlaybackManager] video.play() OK — ${video.videoWidth}x${video.videoHeight} readyState=${video.readyState}`,
        );
      })
      .catch((e) => {
        console.error('[PlaybackManager] video.play() FAILED:', e);
      });
  }

  /**
   * rVFC callback — fires once per decoded video frame, aligned with actual
   * frame presentation. More accurate than rAF for frame-number computation.
   * Uses metadata.mediaTime (stream time) instead of video.currentTime.
   */
  private _onVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
    if (!this._playing) return;

    const fps = this.projectStore.getState().project.settings.frameRate;
    const screenTime = metadata.mediaTime;
    const frame = Math.round(screenTime * fps);

    this._syncCameraTo(screenTime);

    // 1. Sync store only when frame number changes
    if (frame !== this._lastSyncedFrame) {
      this._lastSyncedFrame = frame;
      this.transportStore.setState({ playheadFrame: frame });

      // 3. Update compositor only on new frame
      if (this.compositor) {
        this.compositor.seekTo(frame);
      }
    }

    // 2. End-of-timeline detection
    const duration = this.projectStore.getState().project.composition.duration;
    if (duration > 0 && frame >= duration) {
      this.pause();
      this.transportStore.setState({ playheadFrame: 0 });
      return;
    }

    this._rvfcId = this.screenVideo!.requestVideoFrameCallback(this._onVideoFrame);
  };

  /**
   * rAF fallback loop during playback (used when requestVideoFrameCallback is
   * unavailable). This is the ONLY place that:
   * - Reads video.currentTime (source of truth)
   * - Writes to transportStore.setPlayheadFrame (for UI)
   * - Corrects camera drift
   * - Updates compositor for zoom/transform rendering
   */
  private _syncLoop = (): void => {
    if (!this._playing) return;

    // Read current time from screenVideo or compositor video
    const screen = this.screenVideo;
    const currentTime = screen
      ? screen.currentTime
      : (this.compositor?.getVideoCurrentTime() ?? -1);

    if (currentTime < 0) {
      this._rafId = requestAnimationFrame(this._syncLoop);
      return;
    }

    const fps = this.projectStore.getState().project.settings.frameRate;
    const frame = Math.round(currentTime * fps);

    this._syncCameraTo(currentTime);

    // 1. Sync store at ~30Hz (skip if frame unchanged)
    if (frame !== this._lastSyncedFrame) {
      this._lastSyncedFrame = frame;
      this.transportStore.setState({ playheadFrame: frame });

      // 3. Update compositor only on new frame
      if (this.compositor) {
        this.compositor.seekTo(frame);
      }
    }

    // 2. End-of-timeline detection
    const duration = this.projectStore.getState().project.composition.duration;
    if (duration > 0 && frame >= duration) {
      this.pause();
      this.transportStore.setState({ playheadFrame: 0 });
      return;
    }

    this._rafId = requestAnimationFrame(this._syncLoop);
  };

  /** Seek all registered video elements + compositor to a specific frame */
  private _seekAllTo(frame: number): void {
    const fps = this.projectStore.getState().project.settings.frameRate;
    const targetTime = frame / fps;

    if (this.screenVideo && this.screenVideo.readyState >= 1) {
      if (Math.abs(this.screenVideo.currentTime - targetTime) > 0.02) {
        this.screenVideo.currentTime = targetTime;
      }
    }

    if (this.cameraVideo && this.cameraVideo.readyState >= 1) {
      if (Math.abs(this.cameraVideo.currentTime - targetTime) > 0.02) {
        this.cameraVideo.currentTime = targetTime;
      }
    }

    if (this.compositor) {
      this.compositor.seekTo(frame);
    }
  }

  private _syncCameraTo(targetTime: number): void {
    if (!this.cameraVideo || this.cameraVideo.readyState < 1) return;

    const drift = Math.abs(this.cameraVideo.currentTime - targetTime);
    if (drift > 0.033) {
      this.cameraVideo.currentTime = targetTime;
    }
  }

  dispose(): void {
    this.pause();
    this._scrubUnsub?.();
    this._scrubUnsub = null;
    this.screenVideo = null;
    this.cameraVideo = null;
    this.compositor = null;
  }
}
