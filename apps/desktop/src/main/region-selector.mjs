// Full-screen overlay for drawing a capture region on one screen.
// The overlay shows a frozen, dimmed snapshot of that screen; the user drags a
// rectangle and confirms with "Use region" (Enter) or cancels (Esc). The page
// reports its result through document.title so it needs no preload bridge.

export const REGION_RESULT_PREFIX = 'rough-cut-region:';

export function regionFromOverlayRect(rect, display) {
  if (!rect || !display) return null;
  const scale = Number.isFinite(display.scaleFactor) && display.scaleFactor > 0 ? display.scaleFactor : 1;
  const width = Math.round(Number(rect.width) * scale);
  const height = Math.round(Number(rect.height) * scale);
  const x = Math.round(Number(rect.x) * scale);
  const y = Math.round(Number(rect.y) * scale);
  if (![x, y, width, height].every(Number.isFinite) || width < 2 || height < 2 || x < 0 || y < 0) return null;
  const displayWidth = Math.round(display.bounds.width * scale);
  const displayHeight = Math.round(display.bounds.height * scale);
  const clampedWidth = Math.min(width, displayWidth - x);
  const clampedHeight = Math.min(height, displayHeight - y);
  if (clampedWidth < 2 || clampedHeight < 2) return null;
  return {
    mode: 'region',
    x,
    y,
    width: clampedWidth,
    height: clampedHeight,
    absoluteX: Math.round(display.bounds.x * scale) + x,
    absoluteY: Math.round(display.bounds.y * scale) + y,
    displayId: String(display.id),
    displayLabel: display.label || `Display ${display.id}`,
  };
}

export function buildRegionSelectorHtml({ snapshotDataUrl = '', initialRect = null } = {}) {
  const initial = JSON.stringify(initialRect);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Select region</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; cursor: crosshair; user-select: none; background: #050508; font: 13px system-ui, sans-serif; color: #e8ecf5; }
  #snapshot { position: fixed; inset: 0; background: #050508 center / 100% 100% no-repeat; }
  #dim { position: fixed; inset: 0; background: rgb(5 5 8 / 0.55); }
  #selection { position: fixed; display: none; border: 2px solid #7aa7ff; box-shadow: 0 0 0 9999px rgb(5 5 8 / 0.55); background: transparent; }
  #selection.visible { display: block; }
  #size { position: absolute; left: 0; top: -26px; padding: 3px 8px; border-radius: 6px; background: #111118; border: 1px solid #2a2a34; font-weight: 700; white-space: nowrap; }
  #bar { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; padding: 8px; border-radius: 12px; background: #111118; border: 1px solid #2a2a34; cursor: default; }
  #hint { padding: 0 8px; color: #9aa3b5; }
  button { font: inherit; font-weight: 700; border-radius: 8px; padding: 7px 14px; border: 1px solid #2a2a34; background: #1a1a22; color: #e8ecf5; cursor: pointer; }
  #apply { background: #2f6bff; border-color: #2f6bff; }
  #apply:disabled { opacity: 0.45; cursor: default; }
</style></head>
<body>
<div id="snapshot"></div><div id="dim"></div>
<div id="selection"><span id="size"></span></div>
<div id="bar"><span id="hint">Drag to mark the area to record</span><button id="cancel" type="button">Cancel</button><button id="apply" type="button" disabled>Use region</button></div>
<script>
  const snapshot = ${JSON.stringify(snapshotDataUrl)};
  if (snapshot) document.getElementById('snapshot').style.backgroundImage = 'url("' + snapshot + '")';
  const selection = document.getElementById('selection');
  const size = document.getElementById('size');
  const apply = document.getElementById('apply');
  const bar = document.getElementById('bar');
  // Start from the previous region on this screen, or a centred box, so Enter
  // alone gives a usable region.
  let rect = ${initial} ?? {
    x: Math.round(window.innerWidth * 0.2),
    y: Math.round(window.innerHeight * 0.2),
    width: Math.round(window.innerWidth * 0.6),
    height: Math.round(window.innerHeight * 0.6),
  };
  let origin = null;
  function draw() {
    const ok = rect && rect.width >= 2 && rect.height >= 2;
    selection.classList.toggle('visible', Boolean(ok));
    apply.disabled = !ok;
    document.getElementById('dim').style.display = ok ? 'none' : 'block';
    if (!ok) return;
    Object.assign(selection.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    size.textContent = Math.round(rect.width) + ' x ' + Math.round(rect.height);
  }
  function finish(result) { document.title = ${JSON.stringify(REGION_RESULT_PREFIX)} + JSON.stringify(result); }
  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || bar.contains(event.target)) return;
    origin = { x: event.clientX, y: event.clientY };
    rect = { x: origin.x, y: origin.y, width: 0, height: 0 };
    draw();
  });
  window.addEventListener('mousemove', (event) => {
    if (!origin) return;
    rect = { x: Math.min(origin.x, event.clientX), y: Math.min(origin.y, event.clientY), width: Math.abs(event.clientX - origin.x), height: Math.abs(event.clientY - origin.y) };
    draw();
  });
  window.addEventListener('mouseup', () => { origin = null; });
  apply.addEventListener('click', () => { if (!apply.disabled) finish({ rect }); });
  document.getElementById('cancel').addEventListener('click', () => finish({ cancelled: true }));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finish({ cancelled: true });
    if (event.key === 'Enter' && !apply.disabled) finish({ rect });
  });
  draw();
</script></body></html>`;
}

export function parseRegionSelectorTitle(title) {
  if (typeof title !== 'string' || !title.startsWith(REGION_RESULT_PREFIX)) return null;
  try {
    return JSON.parse(title.slice(REGION_RESULT_PREFIX.length));
  } catch {
    return { cancelled: true };
  }
}
