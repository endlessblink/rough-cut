import { spawn, spawnSync } from 'node:child_process';

// Streams input events from `xinput test-xi2 --root` and reports pointer
// events via `onButton`/`onMotion`, plus privacy-safe key press events via
// `onKey`. X11-only; gracefully no-ops when xinput is missing. TASK-026
// (Wayland pivot) will replace this with a portal/libinput-based listener;
// the call site stays the same.

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
// We care about cooked types 2 (KeyPress), 4 (ButtonPress), 5
// (ButtonRelease), and 6 (Motion) because they carry root-window coords. Raw
// types 13/14/15/16/17 lack root coords. `detail` is the X11 keycode for key
// presses and the X11 button number for buttons — 1=left, 2=middle, 3=right,
// 4/5=scroll (filtered out). For motion `detail` is 0.
const COOKED_KEY_PRESS = 2;
const COOKED_BUTTON_PRESS = 4;
const COOKED_BUTTON_RELEASE = 5;
const COOKED_MOTION = 6;
const COOKED_TYPES = new Set([COOKED_KEY_PRESS, COOKED_BUTTON_PRESS, COOKED_BUTTON_RELEASE, COOKED_MOTION]);
const X11_BUTTON_TO_SCHEMA = { 1: 0, 2: 1, 3: 2 };

export function createXinputEventParser({ onButton, onMotion = null, onKey = null }) {
  let currentEvent = null;

  function reset() {
    currentEvent = null;
  }

  function flushEvent() {
    if (!currentEvent) return;
    const ev = currentEvent;
    currentEvent = null;

    if (ev.type === COOKED_KEY_PRESS) {
      if (ev.detail === null) return;
      if (typeof onKey === 'function') {
        onKey({ keyCode: ev.detail, x: ev.x, y: ev.y });
      }
      return;
    }

    if (ev.x === null || ev.y === null) return;

    if (ev.type === COOKED_MOTION) {
      if (typeof onMotion === 'function') {
        onMotion({ x: ev.x, y: ev.y });
      }
      return;
    }

    if (ev.detail === null) return;
    const button = X11_BUTTON_TO_SCHEMA[ev.detail];
    if (button === undefined) return;
    onButton({
      type: ev.type === COOKED_BUTTON_PRESS ? 'down' : 'up',
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

  return { processLines, flushEvent, reset };
}

export function createXinputButtonListener({ onButton, onMotion = null, onKey = null }) {
  if (typeof onButton !== 'function') {
    throw new TypeError('onButton callback is required');
  }

  let child = null;
  let buffer = '';
  const parser = createXinputEventParser({ onButton, onMotion, onKey });

  function reset() {
    buffer = '';
    parser.reset();
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
      parser.processLines(split);
    });
    child.on('error', (err) => {
      console.warn('[xinput-button-listener] stream error:', err?.message ?? err);
    });
    child.on('exit', () => {
      parser.flushEvent();
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

  function getPid() { return child?.pid ?? null; }

  function kill(signal = 'SIGTERM') {
    if (!child) return;
    try { child.kill(signal); } catch { /* already gone */ }
  }

  return { start, stop, getPid, kill, isAvailable: isXinputAvailable };
}
