// A small floating bar with Pause/Resume and Stop for the hidden-recorder flow.
//
// While a take runs the recorder window is hidden and the only controls were in the tray menu, which Windows tucks
// into the overflow area. The bar is a tiny frameless always-on-top window. It is excluded from screen capture by the
// window itself (setContentProtection), so it never appears in the recording.
//
// It is a plain local page with no preload: buttons report through the page title (the same channel the region
// selector uses) and the main process pushes state in through setState().
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CONTROL_BAR_ACTION_PREFIX = 'rc-bar:';
export const CONTROL_BAR_ACTIONS = ['pause', 'resume', 'stop'];
export const CONTROL_BAR_SIZE = { width: 232, height: 52 };

/**
 * Windows excludes a protected window from capture; on Linux/X11 the flag does nothing, so the bar would end up in the
 * recording. Only show it where it is really invisible to the recorder.
 */
export function controlBarSupported(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin';
}

export function parseControlBarTitle(title) {
  if (typeof title !== 'string' || !title.startsWith(CONTROL_BAR_ACTION_PREFIX)) return null;
  const action = title.slice(CONTROL_BAR_ACTION_PREFIX.length).split(':')[0];
  return CONTROL_BAR_ACTIONS.includes(action) ? action : null;
}

export function formatControlBarClock(elapsedMs) {
  const total = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pair = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pair(minutes)}:${pair(seconds)}` : `${pair(minutes)}:${pair(seconds)}`;
}

/** Top centre of a display's work area, so the bar sits clear of most content. */
export function controlBarPosition(workArea, size = CONTROL_BAR_SIZE) {
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + 12),
    width: size.width,
    height: size.height,
  };
}

export function buildControlBarHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Recording controls</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; font: 13px/1 system-ui, "Segoe UI", sans-serif; }
  .bar { -webkit-app-region: drag; align-items: center; background: #15161c; border: 1px solid rgb(255 255 255 / 0.14); border-radius: 999px; box-sizing: border-box; color: #f4f4f7; display: flex; gap: 10px; height: 100%; padding: 0 8px 0 16px; user-select: none; }
  .dot { background: #ef4444; border-radius: 50%; flex: none; height: 10px; width: 10px; }
  .bar.paused .dot { background: #f5a623; }
  .clock { flex: 1; font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: 0.02em; }
  button { -webkit-app-region: no-drag; align-items: center; background: rgb(255 255 255 / 0.1); border: 0; border-radius: 999px; color: inherit; cursor: pointer; display: flex; flex: none; gap: 6px; height: 34px; justify-content: center; padding: 0 12px; font: inherit; font-weight: 600; }
  button:hover { background: rgb(255 255 255 / 0.2); }
  button:focus-visible { outline: 2px solid #7aa7ff; outline-offset: 1px; }
  button.stop { background: #ef4444; }
  button.stop:hover { background: #f26666; }
  button[hidden] { display: none; }
  svg { fill: none; height: 16px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; width: 16px; }
</style></head>
<body>
<div class="bar" id="bar">
  <span class="dot" aria-hidden="true"></span>
  <span class="clock" id="clock" role="timer" aria-live="off">00:00</span>
  <button type="button" id="pause" title="Pause recording" aria-label="Pause recording"><svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button>
  <button type="button" id="resume" title="Resume recording" aria-label="Resume recording" hidden><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg></button>
  <button type="button" id="stop" class="stop" title="Stop and open the editor" aria-label="Stop recording"><svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg><span>Stop</span></button>
</div>
<script>
  var seq = 0, paused = false, baseMs = 0, since = Date.now();
  var clock = document.getElementById('clock'), bar = document.getElementById('bar');
  function pair(v) { return String(v).padStart(2, '0'); }
  function render() {
    var total = Math.max(0, Math.floor((baseMs + (paused ? 0 : Date.now() - since)) / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    clock.textContent = (h > 0 ? h + ':' : '') + pair(m) + ':' + pair(s);
  }
  window.setState = function (state) {
    paused = Boolean(state.paused); baseMs = Number(state.elapsedMs) || 0; since = Date.now();
    bar.classList.toggle('paused', paused);
    document.getElementById('pause').hidden = paused;
    document.getElementById('resume').hidden = !paused;
    render();
  };
  ['pause', 'resume', 'stop'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () { seq += 1; document.title = '${CONTROL_BAR_ACTION_PREFIX}' + id + ':' + seq; });
  });
  setInterval(render, 500);
</script>
</body></html>`;
}

export function writeControlBarPage(html = buildControlBarHtml(), directory = tmpdir()) {
  const path = join(directory, `rough-cut-recording-bar-${randomBytes(6).toString('hex')}.html`);
  writeFileSync(path, html, 'utf8');
  return path;
}

export function removeControlBarPage(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    // A leftover temp file is harmless.
  }
}
