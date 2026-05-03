import { spawnSync } from 'node:child_process';

// Cursor source for Linux/X11 that bypasses Electron's
// screen.getCursorScreenPoint(). The Electron API has a documented regression
// in v29+ (electron/electron#42519, #41496) where it returns stale/stuck
// coordinates when the cursor leaves the primary display. xdotool queries
// X11 directly and reports correct global coordinates including negative
// values for displays positioned to the left of the primary.

export function isXdotoolAvailable() {
  try {
    const result = spawnSync('xdotool', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function readCursorViaXdotool() {
  try {
    const result = spawnSync('xdotool', ['getmouselocation', '--shell'], {
      encoding: 'utf8',
    });
    if (result.status !== 0) return null;
    const match = /X=(-?\d+)\s+Y=(-?\d+)/.exec(result.stdout ?? '');
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}
