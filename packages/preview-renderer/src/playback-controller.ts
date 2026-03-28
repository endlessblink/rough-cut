import { PlaybackClock } from './playback-clock.js';

/** Minimal shape of the transport store that PlaybackController needs. */
interface TransportStoreApi {
  getState(): {
    isPlaying: boolean;
    playheadFrame: number;
    pause(): void;
    setPlayheadFrame(frame: number): void;
  };
  subscribe(listener: (state: { isPlaying: boolean; playheadFrame: number }) => void): () => void;
}

/** Minimal shape of the project store that PlaybackController needs. */
interface ProjectStoreApi {
  getState(): {
    project?: {
      settings?: { frameRate?: number };
      composition?: {
        tracks?: ReadonlyArray<{
          clips?: ReadonlyArray<{ timelineIn?: number; durationFrames?: number }>;
        }>;
      };
    };
  };
}

/**
 * Bridges the transport store's isPlaying state to the PlaybackClock,
 * driving continuous frame advancement for video playback.
 */
export class PlaybackController {
  private clock: PlaybackClock;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private transportStore: TransportStoreApi,
    private projectStore: ProjectStoreApi,
  ) {
    const fps = this.getFps();
    this.clock = new PlaybackClock(fps, (frame: number) => {
      this.onClockTick(frame);
    });

    let prevIsPlaying = false;

    this.unsubscribe = this.transportStore.subscribe((state) => {
      const { isPlaying } = state;

      if (isPlaying && !prevIsPlaying) {
        // Started playing — sync fps and kick off the clock from current playhead
        const currentFps = this.getFps();
        this.clock.setFps(currentFps);
        this.clock.start(state.playheadFrame);
      } else if (!isPlaying && prevIsPlaying) {
        // Stopped playing
        this.clock.stop();
      }

      prevIsPlaying = isPlaying;
    });
  }

  private getFps(): number {
    const project = this.projectStore.getState().project;
    return project?.settings?.frameRate ?? 30;
  }

  private getCompositionDuration(): number {
    const project = this.projectStore.getState().project;
    if (!project?.composition?.tracks) return Infinity;
    let maxFrame = 0;
    for (const track of project.composition.tracks) {
      for (const clip of track.clips ?? []) {
        const clipEnd = (clip.timelineIn ?? 0) + (clip.durationFrames ?? 0);
        if (clipEnd > maxFrame) maxFrame = clipEnd;
      }
    }
    return maxFrame || Infinity;
  }

  private onClockTick(frame: number): void {
    const duration = this.getCompositionDuration();
    if (duration !== Infinity && frame >= duration) {
      // Reached end of composition — stop clock, pause, snap playhead to end
      this.clock.stop();
      this.transportStore.getState().pause();
      this.transportStore.getState().setPlayheadFrame(duration);
      return;
    }
    this.transportStore.getState().setPlayheadFrame(frame);
  }

  dispose(): void {
    this.clock.stop();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
