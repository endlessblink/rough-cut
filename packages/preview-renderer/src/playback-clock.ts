/**
 * Frame-accurate playback clock.
 * Drives the compositor at the project's frame rate using rAF.
 */
export class PlaybackClock {
  private frameDuration: number; // ms per frame
  private isRunning = false;
  private currentFrame = 0;
  private rafId: number | null = null;
  private lastTickTime = 0;
  private accumulator = 0;
  private onTick: (frame: number) => void;

  constructor(fps: number, onTick: (frame: number) => void) {
    this.frameDuration = 1000 / fps;
    this.onTick = onTick;
  }

  start(fromFrame = 0): void {
    this.currentFrame = fromFrame;
    this.isRunning = true;
    this.lastTickTime = performance.now();
    this.accumulator = 0;
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getCurrentFrame(): number {
    return this.currentFrame;
  }

  setFps(fps: number): void {
    this.frameDuration = 1000 / fps;
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const delta = now - this.lastTickTime;
    this.lastTickTime = now;
    this.accumulator += delta;

    // Advance frames based on accumulated time — frame-accurate even with irregular rAF
    while (this.accumulator >= this.frameDuration) {
      this.currentFrame++;
      this.accumulator -= this.frameDuration;
      this.onTick(this.currentFrame);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
