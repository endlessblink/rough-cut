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
      assets: Array<{ id: string; filePath?: string | null }>;
      composition: {
        duration: number;
        tracks: Array<{
          clips: Array<{
            assetId: string;
            timelineIn: number;
            timelineOut: number;
            sourceIn: number;
          }>;
        }>;
      };
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
  private _lastCameraResyncAt = 0;
  private _scrubUnsub: (() => void) | null = null;
  private _screenMediaTimeResolver: ((timelineFrame: number) => number) | null = null;
  private _screenTimelineFrameResolver: ((mediaTime: number) => number) | null = null;
  private _cameraMediaTimeResolver: ((timelineFrame: number) => number) | null = null;
  private _cameraTimelineFrameResolver: ((mediaTime: number) => number) | null = null;
  private _playToken = 0;
  private _pauseSettleToken = 0;

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

  registerScreenVideo(
    video: HTMLVideoElement,
    mediaTimeResolver?: (timelineFrame: number) => number,
    timelineFrameResolver?: (mediaTime: number) => number,
  ): void {
    this.screenVideo = video;
    this._screenMediaTimeResolver = mediaTimeResolver ?? null;
    this._screenTimelineFrameResolver = timelineFrameResolver ?? null;
    console.info('[PlaybackManager] Screen video registered');
    // If already playing (late registration), start this video
    if (this._playing) {
      this._startVideo(video);
    } else {
      this._seekAllTo(this.transportStore.getState().playheadFrame);
    }
  }

  registerCameraVideo(
    video: HTMLVideoElement,
    mediaTimeResolver?: (timelineFrame: number) => number,
    timelineFrameResolver?: (mediaTime: number) => number,
  ): void {
    this.cameraVideo = video;
    this._cameraMediaTimeResolver = mediaTimeResolver ?? null;
    this._cameraTimelineFrameResolver = timelineFrameResolver ?? null;
    console.info('[PlaybackManager] Camera video registered');
    if (this._playing) {
      const startFrame = this.transportStore.getState().playheadFrame;
      video.currentTime = this._resolveMediaTimeForVideo(video, startFrame);
      this._startVideo(video);
    } else {
      this._seekAllTo(this.transportStore.getState().playheadFrame);
    }
  }

  unregisterScreenVideo(video?: HTMLVideoElement): void {
    if (video && this.screenVideo !== video) {
      return;
    }
    if (this.screenVideo) {
      this.screenVideo.pause();
      this.screenVideo = null;
    }
    this._screenMediaTimeResolver = null;
    this._screenTimelineFrameResolver = null;
  }

  unregisterCameraVideo(video?: HTMLVideoElement): void {
    if (video && this.cameraVideo !== video) {
      return;
    }
    if (this.cameraVideo) {
      this.cameraVideo.pause();
      this.cameraVideo = null;
    }
    this._cameraMediaTimeResolver = null;
    this._cameraTimelineFrameResolver = null;
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
    const playToken = ++this._playToken;
    this._pauseSettleToken += 1;

    const fps = this.projectStore.getState().project.settings.frameRate;
    const duration = this.projectStore.getState().project.composition.duration;
    let startFrame = this.transportStore.getState().playheadFrame;

    // Standard media-player UX: pressing play when the playhead is at (or past)
    // the end rewinds to 0 and plays from there. Without this, _syncLoop
    // immediately hits the timeline-boundary check and pauses, so the user has
    // to press play multiple times before anything visible happens.
    if (duration > 0 && startFrame >= duration - 1) {
      startFrame = 0;
      this.transportStore.setState({ playheadFrame: 0 });
    }

    const startTime = startFrame / fps;
    this._playing = true;
    this.transportStore.setState({ isPlaying: true });

    void this._beginPlayback(playToken, startFrame, startTime);
  }

  pause(nextFrame?: number): void {
    if (!this._playing && !this.transportStore.getState().isPlaying) return;
    this._playToken += 1;
    const pauseSettleToken = ++this._pauseSettleToken;
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
    const compositorPlaybackFrame = this.compositor?.getPlaybackFrame() ?? -1;
    const playbackFrame = this.screenVideo
      ? this._resolveTimelineFrameForVideo(this.screenVideo)
      : compositorPlaybackFrame >= 0
        ? compositorPlaybackFrame
        : this.cameraVideo
          ? this._resolveTimelineFrameForVideo(this.cameraVideo)
          : (this.compositor?.getCurrentFrame() ?? 0);
    const frame = nextFrame ?? playbackFrame;

    this.transportStore.setState({ isPlaying: false, playheadFrame: frame });
    void this._settlePausedMedia(frame, pauseSettleToken);
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
    if (this._playing || this.transportStore.getState().isPlaying) {
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

  private async _beginPlayback(
    playToken: number,
    startFrame: number,
    startTime: number,
  ): Promise<void> {
    if (this.screenVideo) {
      await this._seekVideoToFrame(this.screenVideo, startFrame);
    }
    if (this.cameraVideo) {
      await this._seekVideoToFrame(this.cameraVideo, startFrame);
    }

    if (!this._playing || playToken !== this._playToken) return;

    // Record uses the shared compositor as the visible screen surface, so
    // compositor-driven playback must be snapped to the transport start frame
    // before native video playback begins. Without this, replay-after-end can
    // bootstrap from the compositor's stale last frame and immediately stall.
    if (this.compositor) {
      this.compositor.seekTo(startFrame);
    }

    if (this.screenVideo) {
      this._startVideo(this.screenVideo);
    }
    if (this.cameraVideo) {
      this._startVideo(this.cameraVideo);
    }
    if (this.compositor) {
      this.compositor.play();
    }

    if (!this._playing || playToken !== this._playToken) return;

    this._lastSyncedFrame = startFrame;
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

  /**
   * rVFC callback — fires once per decoded video frame, aligned with actual
   * frame presentation. More accurate than rAF for frame-number computation.
   * Uses metadata.mediaTime (stream time) instead of video.currentTime.
   */
  private _onVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
    if (!this._playing) return;

    if (this.screenVideo?.ended || this.compositor?.hasPlaybackEnded()) {
      console.info('[PlaybackManager] pause reason: native playback ended (rVFC)', {
        screenEnded: this.screenVideo?.ended ?? false,
        compositorEnded: this.compositor?.hasPlaybackEnded() ?? false,
        mediaTime: metadata.mediaTime,
      });
      this.pause();
      return;
    }

    const fps = this.projectStore.getState().project.settings.frameRate;
    const screenTime = metadata.mediaTime;
    const rawFrame = this.screenVideo
      ? this._resolveTimelineFrameForVideo(this.screenVideo, screenTime)
      : Math.round(screenTime * fps);
    const frame = this._lastSyncedFrame >= 0 ? Math.max(rawFrame, this._lastSyncedFrame) : rawFrame;

    this._syncCameraTo(this._resolveMediaTimeForVideo(this.cameraVideo, frame));

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
    const compositorEnded = this.compositor?.hasPlaybackEnded() ?? false;
    if (this.screenVideo?.ended || compositorEnded || (duration > 0 && frame >= duration)) {
      console.info('[PlaybackManager] pause reason: timeline boundary reached (rVFC)', {
        frame,
        duration,
        screenEnded: this.screenVideo?.ended ?? false,
        compositorEnded,
      });
      this.pause();
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

    const compositorEndedAtLoopStart = this.compositor?.hasPlaybackEnded() ?? false;
    if (this.screenVideo?.ended || compositorEndedAtLoopStart) {
      console.info('[PlaybackManager] pause reason: native playback ended (rAF)', {
        screenEnded: this.screenVideo?.ended ?? false,
        compositorEnded: compositorEndedAtLoopStart,
      });
      this.pause();
      return;
    }

    // Read current time from screenVideo or compositor video
    const screen = this.screenVideo;
    const camera = this.cameraVideo;
    const compositorPlaybackFrame = this.compositor?.getPlaybackFrame() ?? -1;
    const rawFrame = screen
      ? this._resolveTimelineFrameForVideo(screen)
      : compositorPlaybackFrame >= 0
        ? compositorPlaybackFrame
        : camera
          ? this._resolveTimelineFrameForVideo(camera)
          : (this.compositor?.getCurrentFrame() ?? -1);

    const frame =
      rawFrame >= 0 && this._lastSyncedFrame >= 0 ? Math.max(rawFrame, this._lastSyncedFrame) : rawFrame;

    if (frame < 0) {
      this._rafId = requestAnimationFrame(this._syncLoop);
      return;
    }

    this._syncCameraTo(this._resolveMediaTimeForVideo(this.cameraVideo, frame));

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
    const compositorEnded = this.compositor?.hasPlaybackEnded() ?? false;
    if (compositorEnded || (duration > 0 && frame >= duration)) {
      console.info('[PlaybackManager] pause reason: timeline boundary reached (rAF)', {
        frame,
        duration,
        compositorEnded,
      });
      this.pause();
      return;
    }

    this._rafId = requestAnimationFrame(this._syncLoop);
  };

  /** Seek all registered video elements + compositor to a specific frame */
  private _seekAllTo(frame: number): void {
    if (this.screenVideo && this.screenVideo.readyState >= 1) {
      const targetTime = this._resolveMediaTimeForVideo(this.screenVideo, frame);
      if (Math.abs(this.screenVideo.currentTime - targetTime) > 0.02) {
        this.screenVideo.currentTime = targetTime;
      }
    }

    if (this.cameraVideo && this.cameraVideo.readyState >= 1) {
      const targetTime = this._resolveMediaTimeForVideo(this.cameraVideo, frame);
      if (Math.abs(this.cameraVideo.currentTime - targetTime) > 0.02) {
        this.cameraVideo.currentTime = targetTime;
      }
    }

    if (this.compositor) {
      this.compositor.seekTo(frame);
    }
  }

  private _syncCameraTo(targetTime: number | null): void {
    if (
      !this.cameraVideo ||
      this.cameraVideo.readyState < 2 ||
      this.cameraVideo.seeking ||
      this.cameraVideo.paused ||
      targetTime === null
    ) {
      return;
    }

    const drift = Math.abs(this.cameraVideo.currentTime - targetTime);
    const now = performance.now();
    if (drift > 0.4 && now - this._lastCameraResyncAt > 250) {
      this._lastCameraResyncAt = now;
      this.cameraVideo.currentTime = targetTime;
    }
  }

  private async _settlePausedMedia(frame: number, settleToken: number): Promise<void> {
    if (this._playing || settleToken !== this._pauseSettleToken) return;

    if (this.screenVideo) {
      await this._seekVideoToFrame(this.screenVideo, frame, settleToken);
    }

    if (!this._playing && settleToken === this._pauseSettleToken && this.cameraVideo) {
      await this._seekVideoToFrame(this.cameraVideo, frame, settleToken);
    }

    if (!this._playing && settleToken === this._pauseSettleToken && this.compositor) {
      this.compositor.seekTo(frame);
    }
  }

  private async _seekVideoToFrame(
    video: HTMLVideoElement,
    frame: number,
    settleToken?: number,
  ): Promise<void> {
    if (video.readyState < 1) return;
    if (settleToken !== undefined && settleToken !== this._pauseSettleToken) return;

    const targetTime = this._resolveMediaTimeForVideo(video, frame);
    if (Math.abs(video.currentTime - targetTime) <= 0.02) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        clearTimeout(timeoutId);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onSeeked = () => finish();
      const timeoutId = window.setTimeout(finish, 250);

      video.addEventListener('seeked', onSeeked, { once: true });
      if (settleToken !== undefined && settleToken !== this._pauseSettleToken) {
        finish();
        return;
      }
      video.currentTime = targetTime;

      if (!video.seeking && Math.abs(video.currentTime - targetTime) <= 0.02) {
        finish();
      }
    });
  }

  private _resolveMediaTimeForVideo(video: HTMLVideoElement | null, timelineFrame: number): number {
    const fps = this.projectStore.getState().project.settings.frameRate;
    if (!video) return timelineFrame / fps;

    const directResolver =
      video === this.screenVideo ? this._screenMediaTimeResolver : this._cameraMediaTimeResolver;
    if (directResolver) {
      return directResolver(timelineFrame);
    }

    const assetId = this._findAssetIdForVideo(video);
    if (!assetId) return timelineFrame / fps;

    const sourceFrame = this._resolveSourceFrameForAsset(assetId, timelineFrame);
    return (sourceFrame ?? timelineFrame) / fps;
  }

  private _resolveTimelineFrameForVideo(
    video: HTMLVideoElement,
    mediaTime = video.currentTime,
  ): number {
    const fps = this.projectStore.getState().project.settings.frameRate;
    const directResolver =
      video === this.screenVideo
        ? this._screenTimelineFrameResolver
        : this._cameraTimelineFrameResolver;
    if (directResolver) {
      return directResolver(mediaTime);
    }

    const sourceFrame = Math.round(mediaTime * fps);
    const assetId = this._findAssetIdForVideo(video);
    if (!assetId) return sourceFrame;

    return this._resolveTimelineFrameForAsset(assetId, sourceFrame) ?? sourceFrame;
  }

  private _findAssetIdForVideo(video: HTMLVideoElement): string | null {
    const src = this._normalizeMediaSrc(video.currentSrc || video.src);
    if (!src) return null;

    const asset = this.projectStore
      .getState()
      .project.assets.find((entry) => entry.filePath === src);
    return asset?.id ?? null;
  }

  private _normalizeMediaSrc(src: string): string | null {
    if (!src) return null;
    if (src.startsWith('media://')) {
      return decodeURIComponent(src.slice('media://'.length));
    }

    try {
      return decodeURIComponent(new URL(src).pathname);
    } catch {
      return src;
    }
  }

  private _resolveSourceFrameForAsset(assetId: string, timelineFrame: number): number | null {
    const tracks = this.projectStore.getState().project.composition.tracks;
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.assetId !== assetId) continue;
        if (timelineFrame < clip.timelineIn || timelineFrame >= clip.timelineOut) continue;
        return clip.sourceIn + (timelineFrame - clip.timelineIn);
      }
    }

    return null;
  }

  private _resolveTimelineFrameForAsset(assetId: string, sourceFrame: number): number | null {
    const tracks = this.projectStore.getState().project.composition.tracks;
    const hintFrame = this.transportStore.getState().playheadFrame;
    let bestFrame: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.assetId !== assetId) continue;

        const duration = clip.timelineOut - clip.timelineIn;
        const sourceStart = clip.sourceIn;
        const sourceEnd = clip.sourceIn + duration;
        if (sourceFrame < sourceStart || sourceFrame >= sourceEnd) continue;

        const timelineFrame = clip.timelineIn + (sourceFrame - clip.sourceIn);
        const distance = Math.abs(timelineFrame - hintFrame);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestFrame = timelineFrame;
        }
      }
    }

    return bestFrame;
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
