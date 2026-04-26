import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Guards the KDE / libappindicator (KStatusNotifierItem) cache-workaround half
 * of the Linux tray lifecycle (commit daa7cca).
 *
 * KSNI caches the icon bitmap by pathname. Updating the PNG bytes at a fixed
 * path does NOT force the indicator to repaint — it reuses the cached bitmap
 * for the lifetime of the desktop session. The only reliable trigger is
 * pointing setImage() at a NEW path each time. This module writes each icon
 * transition to a counter-suffixed filename so every setImage() call sees a
 * previously-unknown resource.
 *
 * See `recording-session-manager.mjs` createTray() for how this gets wired
 * into the Linux tray singleton.
 */
const TRAY_ICON_DIR = join(tmpdir(), 'rough-cut-tray-icons');
let trayIconCounter = 0;

export function resetTrayIconCounter() {
  trayIconCounter = 0;
}

export function getTrayIconDir() {
  return TRAY_ICON_DIR;
}

/**
 * Decode a data-URL icon and write it to a fresh unique path under
 * rough-cut-tray-icons/. Returns the absolute file path that can be fed to
 * Electron's `Tray.setImage(path)` / `new Tray(path)`.
 *
 * @param {string} dataUrl - e.g. 'data:image/png;base64,...'
 * @param {string} tag    - short label used in the filename (e.g. 'red', 'empty')
 * @returns {string}
 */
export function writeTrayIconFile(dataUrl, tag) {
  try {
    mkdirSync(TRAY_ICON_DIR, { recursive: true });
  } catch {
    // ignore — subsequent write will surface any real error
  }
  trayIconCounter += 1;
  const filePath = join(
    TRAY_ICON_DIR,
    `tray-${tag}-${process.pid}-${trayIconCounter}.png`,
  );
  const base64 = dataUrl.split(',')[1] ?? '';
  writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}
