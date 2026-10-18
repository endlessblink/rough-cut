import { createRequire } from 'node:module';

// Windows click/motion/key telemetry via a global low-level hook (uiohook-napi). Same contract as
// xinput-button-listener.mjs: `onButton`, `onMotion` and privacy-safe `onKey` (key code only, never text).
// If the native module cannot load, start() returns false and recording continues without click telemetry;
// auto-zoom then falls back to its cursor-jump heuristic.
//
// uiohook button numbers (measured on Windows 11 with real input): 1 = left, 2 = right, 3 = middle.
// The recording schema is 0 = left, 1 = middle, 2 = right (the X11 order), so right and middle swap.
// Coordinates are physical screen pixels, the same space xinput's root coordinates use.

const UIOHOOK_BUTTON_TO_SCHEMA = { 1: 0, 3: 1, 2: 2 };

function defaultLoadHook() {
  const require = createRequire(import.meta.url);
  return require('uiohook-napi').uIOhook;
}

export function isUiohookAvailable({ loadHook = defaultLoadHook } = {}) {
  try {
    return Boolean(loadHook());
  } catch {
    return false;
  }
}

export function createUiohookButtonListener({ onButton, onMotion = null, onKey = null, loadHook = defaultLoadHook }) {
  if (typeof onButton !== 'function') {
    throw new TypeError('onButton callback is required');
  }

  let hook = null;
  let started = false;
  let lastPoint = null;
  const handlers = [];

  function listen(event, handler) {
    hook.on(event, handler);
    handlers.push([event, handler]);
  }

  function start() {
    if (started) return true;
    try {
      hook = loadHook();
    } catch (err) {
      console.warn('[uiohook-button-listener] native hook unavailable; click telemetry skipped:', err?.message ?? err);
      return false;
    }
    if (!hook) return false;

    const emitButton = (type) => (event) => {
      const button = UIOHOOK_BUTTON_TO_SCHEMA[event.button];
      if (button === undefined) return;
      lastPoint = { x: event.x, y: event.y };
      onButton({ type, button, x: event.x, y: event.y });
    };
    listen('mousedown', emitButton('down'));
    listen('mouseup', emitButton('up'));
    listen('mousemove', (event) => {
      lastPoint = { x: event.x, y: event.y };
      if (typeof onMotion === 'function') onMotion({ x: event.x, y: event.y });
    });
    listen('keydown', (event) => {
      if (typeof onKey !== 'function' || !Number.isInteger(event.keycode)) return;
      onKey({ keyCode: event.keycode, x: lastPoint?.x ?? null, y: lastPoint?.y ?? null });
    });

    try {
      hook.start();
    } catch (err) {
      console.warn('[uiohook-button-listener] hook start failed; click telemetry skipped:', err?.message ?? err);
      removeHandlers();
      return false;
    }
    started = true;
    return true;
  }

  function removeHandlers() {
    for (const [event, handler] of handlers.splice(0)) {
      try { hook?.removeListener?.(event, handler); } catch { /* already gone */ }
    }
  }

  function stop() {
    if (!started) {
      lastPoint = null;
      return;
    }
    started = false;
    removeHandlers();
    // The hook is a process-wide singleton: stop it, but only our handlers were ever attached.
    try { hook?.stop?.(); } catch { /* process may be exiting */ }
    lastPoint = null;
  }

  function kill() {
    stop();
  }

  return { start, stop, getPid: () => null, kill, isAvailable: () => isUiohookAvailable({ loadHook }) };
}
