import { spawn, spawnSync } from 'node:child_process';

// Streams pointer button events from `xinput test-xi2 --root` and reports them
// via an `onButton` callback. Companion to xdotool-cursor.mjs (which polls
// position): xinput supplies the button state xdotool can't see. X11-only;
// gracefully no-ops when xinput is missing. TASK-026 (Wayland pivot) will
// replace this with a portal/libinput-based listener; the call site stays the
// same.

export function isXinputAvailable() {
  try {
    const result = spawnSync('xinput', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// xinput emits one block per event, e.g. for a left click:
//   EVENT type 4 (ButtonPress)
//       device: 12 (12)
//       time: 334587342
//       detail: 1
//       flags:
//       root: 805.00/652.00
//       event: 805.00/652.00
//       ...
// We care about cooked types 4 (ButtonPress) and 5 (ButtonRelease) because
// they carry root-window coords. Raw types 15/16 lack coords. `detail` is the
// X11 button number — 1=left, 2=middle, 3=right, 4/5=scroll (filtered out).
const COOKED_TYPES = new Set([4, 5]);
const X11_BUTTON_TO_SCHEMA = { 1: 0, 2: 1, 3: 2 };

export function createXinputButtonListener({ onButton }) {
  if (typeof onButton !== 'function') {
    throw new TypeError('onButton callback is required');
  }

  let child = null;
  let buffer = '';
  let currentEvent = null;

  function reset() {
    buffer = '';
    currentEvent = null;
  }

  function flushEvent() {
    if (!currentEvent) return;
    const ev = currentEvent;
    currentEvent = null;
    if (ev.detail === null || ev.x === null || ev.y === null) return;
    const button = X11_BUTTON_TO_SCHEMA[ev.detail];
    if (button === undefined) return;
    onButton({
      type: ev.type === 4 ? 'down' : 'up',
      button,
      x: ev.x,
      y: ev.y,
    });
  }

  function processLines(lines) {
    for (const line of lines) {
      const headerMatch = /^EVENT type (\d+)/.exec(line);
      if (headerMatch) {
        flushEvent();
        const type = Number(headerMatch[1]);
        currentEvent = COOKED_TYPES.has(type)
          ? { type, detail: null, x: null, y: null }
          : null;
        continue;
      }
      if (!currentEvent) continue;
      if (line.trim() === '') {
        flushEvent();
        continue;
      }
      const detailMatch = /^\s*detail:\s*(\d+)/.exec(line);
      if (detailMatch) {
        currentEvent.detail = Number(detailMatch[1]);
        continue;
      }
      const rootMatch = /^\s*root:\s*(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(line);
      if (rootMatch) {
        currentEvent.x = Number(rootMatch[1]);
        currentEvent.y = Number(rootMatch[2]);
        continue;
      }
    }
  }

  function start() {
    if (child) return true;
    if (!isXinputAvailable()) {
      console.warn(
        '[xinput-button-listener] xinput not available; click/drag events will not be captured. Auto-zoom will fall back to the teleport heuristic.',
      );
      return false;
    }
    try {
      child = spawn('xinput', ['test-xi2', '--root'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      console.warn('[xinput-button-listener] spawn failed:', err?.message ?? err);
      child = null;
      return false;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const split = buffer.split('\n');
      buffer = split.pop() ?? '';
      processLines(split);
    });
    child.on('error', (err) => {
      console.warn('[xinput-button-listener] stream error:', err?.message ?? err);
    });
    child.on('exit', () => {
      flushEvent();
      child = null;
    });
    return true;
  }

  function stop() {
    if (!child) {
      reset();
      return;
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore — process may have already exited
    }
    child = null;
    reset();
  }

  return { start, stop, isAvailable: isXinputAvailable };
}
