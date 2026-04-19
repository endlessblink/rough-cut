// @ts-check
import { uIOhook } from 'uiohook-napi';
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * @typedef {{ frame: number, x: number, y: number, type: 'move' | 'down' | 'up' | 'scroll', button: number }} CursorEvent
 */

// uIOhook is a process-level singleton. Once started, we keep it running
// for the lifetime of the app. Stopping and restarting it can fail because
// the native thread doesn't cleanly reinitialize. Instead, we always listen
// for events and gate recording via the #recording flag.
let uiohookStarted = false;

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
  /** @type {number} */
  #offsetX = 0;
  /** @type {number} */
  #offsetY = 0;

  constructor() {
    // Register listeners once — they check #recording internally
    uIOhook.on('mousemove', /** @param {import('uiohook-napi').UiohookMouseEvent} e */ (e) => {
      if (!this.#recording) return;
      const frame = this.#currentFrame();
      if (frame === this.#lastMoveFrame) return;
      this.#lastMoveFrame = frame;
      this.#events.push({
        frame,
        x: e.x - this.#offsetX,
        y: e.y - this.#offsetY,
        type: 'move',
        button: 0,
      });
    });

    uIOhook.on('mousedown', /** @param {import('uiohook-napi').UiohookMouseEvent} e */ (e) => {
      if (!this.#recording) return;
      this.#events.push({
        frame: this.#currentFrame(),
        x: e.x - this.#offsetX,
        y: e.y - this.#offsetY,
        type: 'down',
        button: e.button ?? 0,
      });
    });

    uIOhook.on('mouseup', /** @param {import('uiohook-napi').UiohookMouseEvent} e */ (e) => {
      if (!this.#recording) return;
      this.#events.push({
        frame: this.#currentFrame(),
        x: e.x - this.#offsetX,
        y: e.y - this.#offsetY,
        type: 'up',
        button: e.button ?? 0,
      });
    });

    uIOhook.on('wheel', /** @param {import('uiohook-napi').UiohookWheelEvent} e */ (e) => {
      if (!this.#recording) return;
      this.#events.push({
        frame: this.#currentFrame(),
        x: e.x - this.#offsetX,
        y: e.y - this.#offsetY,
        type: 'scroll',
        button: 0,
      });
    });
  }

  #currentFrame() {
    if (!this.#startTime) return 0;
    return Math.round(((Date.now() - this.#startTime) / 1000) * this.#frameRate);
  }

  /**
   * Start capturing cursor events.
   * @param {number} frameRate - Project frame rate (24, 30, or 60)
   * @param {string} outputPath - Path to write .cursor.ndjson sidecar
   * @param {{ offsetX?: number, offsetY?: number }} [captureBounds]
   */
  start(frameRate, outputPath, captureBounds = {}) {
    if (this.#recording) {
      console.warn('CursorRecorder: already recording, stopping previous session');
      this.stop();
    }

    this.#events = [];
    this.#frameRate = frameRate;
    this.#outputPath = outputPath;
    this.#startTime = Date.now();
    this.#lastMoveFrame = -1;
    this.#offsetX = Number.isFinite(captureBounds.offsetX) ? captureBounds.offsetX : 0;
    this.#offsetY = Number.isFinite(captureBounds.offsetY) ? captureBounds.offsetY : 0;
    this.#recording = true;

    // Start uIOhook once — never stop it
    if (!uiohookStarted) {
      try {
        uIOhook.start();
        uiohookStarted = true;
        console.log('CursorRecorder: uIOhook started (will stay running)');
      } catch (err) {
        console.error('CursorRecorder: failed to start uIOhook —', err.message);
        this.#recording = false;
        throw err;
      }
    }

    console.log(
      `CursorRecorder: recording started (${frameRate}fps → ${outputPath}, offset ${this.#offsetX},${this.#offsetY})`,
    );
  }

  /**
   * Stop capturing and write the sidecar file.
   * Does NOT stop uIOhook — it stays running for future recordings.
   * @returns {{ eventsPath: string, eventCount: number } | null}
   */
  stop() {
    if (!this.#recording) return null;

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
   * Rebase the start time to align cursor events with the actual MediaRecorder start.
   * Recalculates frame numbers for events captured in the gap and discards
   * events that occurred before the new start time (negative frames).
   */
  rebaseStartTime(newStartTimeMs) {
    if (!this.#recording) return;
    const oldStart = this.#startTime;
    if (!oldStart || newStartTimeMs <= oldStart) return;

    this.#startTime = newStartTimeMs;

    // Recalculate frame numbers for existing events
    this.#events = this.#events
      .map(e => {
        // Convert frame back to absolute time, then to new frame number
        const absoluteTimeMs = oldStart + (e.frame / this.#frameRate) * 1000;
        const newFrame = Math.round(((absoluteTimeMs - newStartTimeMs) / 1000) * this.#frameRate);
        return newFrame >= 0 ? { ...e, frame: newFrame } : null;
      })
      .filter(e => e !== null);

    console.info('[CursorRecorder] Rebased start time, delta:', newStartTimeMs - oldStart, 'ms, events:', this.#events.length);
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
