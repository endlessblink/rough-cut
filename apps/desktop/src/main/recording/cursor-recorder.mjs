// @ts-check
import { uIOhook } from 'uiohook-napi';
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * @typedef {{ frame: number, x: number, y: number, type: 'move' | 'down' | 'up' | 'scroll', button: number }} CursorEvent
 */

export class CursorRecorder {
  /** @type {CursorEvent[]} */
  #events = [];
  /** @type {number | null} */
  #startTime = null;
  /** @type {number} */
  #frameRate = 30;
  /** @type {string | null} */
  #outputPath = null;
  /** @type {boolean} */
  #recording = false;
  /** @type {number} */
  #lastMoveFrame = -1;

  // Bound handlers (so we can remove them)
  #onMove = /** @param {import('uiohook-napi').UiohookMouseEvent} e */ (e) => {
    const frame = this.#currentFrame();
    // Deduplicate: skip if same frame as last move
    if (frame === this.#lastMoveFrame) return;
    this.#lastMoveFrame = frame;
    this.#events.push({ frame, x: e.x, y: e.y, type: 'move', button: 0 });
  };

  #onDown = /** @param {import('uiohook-napi').UiohookMouseEvent} e */ (e) => {
    this.#events.push({
      frame: this.#currentFrame(),
      x: e.x,
      y: e.y,
      type: 'down',
      button: e.button ?? 0,
    });
  };

  #onUp = /** @param {import('uiohook-napi').UiohookMouseEvent} e */ (e) => {
    this.#events.push({
      frame: this.#currentFrame(),
      x: e.x,
      y: e.y,
      type: 'up',
      button: e.button ?? 0,
    });
  };

  #onWheel = /** @param {import('uiohook-napi').UiohookWheelEvent} e */ (e) => {
    this.#events.push({
      frame: this.#currentFrame(),
      x: e.x,
      y: e.y,
      type: 'scroll',
      button: 0,
    });
  };

  #currentFrame() {
    if (!this.#startTime) return 0;
    return Math.round(((Date.now() - this.#startTime) / 1000) * this.#frameRate);
  }

  /**
   * Start capturing cursor events.
   * @param {number} frameRate - Project frame rate (24, 30, or 60)
   * @param {string} outputPath - Path to write .cursor.ndjson sidecar
   */
  start(frameRate, outputPath) {
    if (this.#recording) {
      throw new Error('CursorRecorder: already recording');
    }

    this.#events = [];
    this.#frameRate = frameRate;
    this.#outputPath = outputPath;
    this.#startTime = Date.now();
    this.#lastMoveFrame = -1;
    this.#recording = true;

    uIOhook.on('mousemove', this.#onMove);
    uIOhook.on('mousedown', this.#onDown);
    uIOhook.on('mouseup', this.#onUp);
    uIOhook.on('wheel', this.#onWheel);

    try {
      uIOhook.start();
    } catch (err) {
      console.error('CursorRecorder: failed to start uIOhook —', err.message);
      this.#recording = false;
      throw err;
    }

    console.log(`CursorRecorder: started (${frameRate}fps → ${outputPath})`);
  }

  /**
   * Stop capturing and write the sidecar file.
   * @returns {{ eventsPath: string, eventCount: number } | null}
   */
  stop() {
    if (!this.#recording) return null;

    uIOhook.off('mousemove', this.#onMove);
    uIOhook.off('mousedown', this.#onDown);
    uIOhook.off('mouseup', this.#onUp);
    uIOhook.off('wheel', this.#onWheel);

    try {
      uIOhook.stop();
    } catch {
      // uIOhook may throw if already stopped; ignore
    }

    this.#recording = false;

    if (!this.#outputPath || this.#events.length === 0) {
      console.log('CursorRecorder: stopped (no events captured)');
      return null;
    }

    // Ensure output directory exists
    const dir = dirname(this.#outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write NDJSON
    const ndjson = this.#events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    writeFileSync(this.#outputPath, ndjson, 'utf-8');

    const result = { eventsPath: this.#outputPath, eventCount: this.#events.length };
    console.log(`CursorRecorder: stopped — ${result.eventCount} events → ${result.eventsPath}`);
    return result;
  }

  /**
   * Get the captured events (for in-memory access).
   * @returns {CursorEvent[]}
   */
  getEvents() {
    return [...this.#events];
  }

  /** Whether the recorder is currently active. */
  get isRecording() {
    return this.#recording;
  }
}
