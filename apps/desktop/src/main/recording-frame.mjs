// A thin outline around the area being recorded, so it is clear what is in the video and what is not.
//
// It is a transparent, always-on-top window, shaped to the outline only (so clicks reach whatever is underneath), placed just outside the captured area and excluded from
// capture by the window itself (setContentProtection), so the outline never ends up in the recording. Like the
// control bar it is only used where that exclusion works; the physical-to-screen conversion is Windows-only for now.
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FRAME_THICKNESS = 3;
export const FRAME_GAP = 2;

export function frameSupported(platform = process.platform) {
  return platform === 'win32';
}

/**
 * @param {{x:number,y:number,width:number,height:number}} area captured area in DIP (screen) coordinates
 * @param {{x:number,y:number,width:number,height:number}} displayBounds bounds of the display it is on, in DIP
 * @returns window bounds that surround the area by FRAME_GAP + FRAME_THICKNESS, kept inside the display
 */
export function frameWindowBounds(area, displayBounds) {
  const margin = FRAME_GAP + FRAME_THICKNESS;
  const left = Math.max(displayBounds.x, area.x - margin);
  const top = Math.max(displayBounds.y, area.y - margin);
  const right = Math.min(displayBounds.x + displayBounds.width, area.x + area.width + margin);
  const bottom = Math.min(displayBounds.y + displayBounds.height, area.y + area.height + margin);
  return { x: Math.round(left), y: Math.round(top), width: Math.max(1, Math.round(right - left)), height: Math.max(1, Math.round(bottom - top)) };
}

/**
 * The window is cut down to the outline with setShape, which is what makes it click-through. setIgnoreMouseEvents is
 * not used on purpose: on Windows it stops setContentProtection from hiding the window, and the outline would then
 * appear in the recording (measured with gdigrab on Windows 10).
 */
export function frameShapeRects(width, height, thickness = FRAME_THICKNESS) {
  const t = Math.max(1, Math.min(thickness, Math.floor(Math.min(width, height) / 2)));
  return [
    { x: 0, y: 0, width, height: t },
    { x: 0, y: height - t, width, height: t },
    { x: 0, y: t, width: t, height: Math.max(0, height - 2 * t) },
    { x: width - t, y: t, width: t, height: Math.max(0, height - 2 * t) },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}
export function buildFrameHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Recording area</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  #frame { border: ${FRAME_THICKNESS}px solid #ef4444; border-radius: 4px; box-sizing: border-box; height: 100%; width: 100%; }
  #frame.paused { border-color: #f5a623; border-style: dashed; }
</style></head>
<body><div id="frame"></div>
<script>window.setState = function (state) { document.getElementById('frame').classList.toggle('paused', Boolean(state && state.paused)); };</script>
</body></html>`;
}

export function writeFramePage(html = buildFrameHtml(), directory = tmpdir()) {
  const path = join(directory, `rough-cut-recording-frame-${randomBytes(6).toString('hex')}.html`);
  writeFileSync(path, html, 'utf8');
  return path;
}

export function removeFramePage(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    // A leftover temp file is harmless.
  }
}
