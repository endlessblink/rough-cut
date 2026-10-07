// Windows stand-in for the X11 xinput click listener. Cursor position still
// comes from Electron polling; only click/key telemetry is skipped, so
// auto-zoom falls back to its teleport heuristic until a native mouse hook
// (e.g. uiohook-napi) is added.
export function createNoopButtonListener() {
  return {
    start() {
      console.warn('[button-listener] click telemetry is not available on this platform yet; auto-zoom uses the teleport heuristic.');
      return false;
    },
    stop() {},
    getPid() {
      return null;
    },
    kill() {},
    isAvailable: () => false,
  };
}
