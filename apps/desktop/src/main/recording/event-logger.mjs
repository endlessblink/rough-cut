import { closeSync, openSync, writeSync } from 'node:fs';

// Append-only JSONL event logger for diagnosing recording-time tearing /
// frame artifacts. Captures every concurrent X server / capture event with
// wall-clock timing so a tear visible in the .mp4 can be cross-referenced
// against what was happening at that exact moment (xdotool spawn? xinput
// event? ffmpeg progress block?).
//
// Each line is one JSON object: { "t": <seconds_since_epoch_float>, "kind":
// "<event_kind>", ...data }. Writes are buffered and flushed on a 250 ms
// interval plus on stop(). Sync fs writes keep the implementation simple
// and avoid Promise overhead inside the cursor poll callback.

const FLUSH_INTERVAL_MS = 250;

export function createEventLogger({ path }) {
  let fd = null;
  let buffer = [];
  let flushTimer = null;
  let stopped = false;

  function start() {
    if (fd !== null) return;
    try {
      fd = openSync(path, 'w');
    } catch (err) {
      console.warn('[event-logger] could not open', path, '-', err?.message ?? err);
      fd = null;
      return;
    }
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  }

  function event(kind, data) {
    if (stopped || fd === null) return;
    const record = { t: Date.now() / 1000, kind, ...data };
    buffer.push(`${JSON.stringify(record)}\n`);
  }

  function flush() {
    if (fd === null || buffer.length === 0) return;
    const chunk = buffer.join('');
    buffer.length = 0;
    try {
      writeSync(fd, chunk);
    } catch (err) {
      console.warn('[event-logger] write failed:', err?.message ?? err);
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    flush();
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore close failures during shutdown
      }
      fd = null;
    }
  }

  return { start, event, stop };
}

// No-op logger so call sites stay unconditional (no `if (logger) logger.event(...)`
// branches). Used when diagnostic logging is disabled.
export const NULL_EVENT_LOGGER = Object.freeze({
  start() {},
  event() {},
  stop() {},
});
