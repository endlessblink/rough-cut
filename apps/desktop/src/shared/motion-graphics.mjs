/**
 * Claude-written motion graphics: lower thirds, openers, explainer cards.
 *
 * A graphic is a small self-contained HTML page drawn as a transparent layer
 * over the whole composite (screen, camera and background). It lives on the
 * shared timeline as a `graphic` effect owned by the timeline, so undo/redo,
 * save and export all see the same thing.
 *
 * The page never owns its clock. Preview and export both drive it through the
 * seek runtime below, so any frame can be drawn in any order and the export
 * matches what was scrubbed. Animations must be CSS/Web Animations (seeked via
 * `document.getAnimations()`), or the page may define `window.rcSeek(t)`.
 *
 * Editable fields are applied by the runtime, not by Claude's code:
 *   text   → textContent of every `[data-rc-field="key"]`
 *   color  → CSS variable `--rc-key`
 *   number → CSS variable `--rc-key`
 */

import { GRAPHICS_FONT_CSS } from './graphics-fonts.generated.mjs';

export const GRAPHIC_EFFECT_KIND = 'graphic';
export const GRAPHIC_OWNER_ID = 'timeline';
export const MAX_GRAPHIC_HTML_BYTES = 200_000;
export const MAX_GRAPHIC_FIELDS = 12;
export const MIN_GRAPHIC_FRAMES = 6;
/** Where a still (non-animated) graphic freezes: after entrances finish. */
export const DEFAULT_HOLD_SEC = 1.2;

/** The frozen moment for a still graphic: past the entrance, before the exit. */
export function graphicHoldSec(durationSec) {
  const duration = Number(durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return DEFAULT_HOLD_SEC;
  return Math.min(DEFAULT_HOLD_SEC, duration / 2);
}

/**
 * The user's placement and motion for a whole graphic, applied by the runtime
 * around Claude's page — so every graphic can be sized/moved/faded and always
 * enters and leaves, whatever the page itself does.
 *   scale    size multiplier (1 = as designed)
 *   x, y     offset as a fraction of the canvas width/height
 *   opacity  0.1–1
 *   entrance none | fade | rise | pop | slide  (the exit mirrors it, faster)
 *   entranceSec  entrance length; the exit takes 70% of it
 */
export const GRAPHIC_ENTRANCES = ['none', 'fade', 'rise', 'pop', 'slide'];
export const DEFAULT_GRAPHIC_LAYOUT = Object.freeze({ scale: 1, x: 0, y: 0, opacity: 1, entrance: 'rise', entranceSec: 0.5 });

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeGraphicLayout(raw) {
  const source = isRecord(raw) ? raw : {};
  const d = DEFAULT_GRAPHIC_LAYOUT;
  return {
    scale: clampNumber(source.scale, 0.25, 3, d.scale),
    x: clampNumber(source.x, -1, 1, d.x),
    y: clampNumber(source.y, -1, 1, d.y),
    opacity: clampNumber(source.opacity, 0.1, 1, d.opacity),
    entrance: GRAPHIC_ENTRANCES.includes(source.entrance) ? source.entrance : d.entrance,
    entranceSec: clampNumber(source.entranceSec, 0.15, 2, d.entranceSec),
  };
}

/**
 * Where the whole layer is at `t` seconds into a graphic `durationSec` long, on
 * a `width`×`height` canvas. Self-contained (no outside names) because it is
 * also stringified into the graphic page, so preview and export share it.
 */
export function graphicLayerStateAt(layout, t, durationSec, width, height, rtl) {
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeIn = (p) => p * p * p;
  const duration = Number(durationSec) > 0 ? Number(durationSec) : Infinity;
  let enter = Number(layout.entranceSec) > 0 ? Number(layout.entranceSec) : 0.5;
  let leave = enter * 0.7;
  // A short graphic shares its length between entrance and exit.
  if (enter + leave > duration) {
    const fit = duration / (enter + leave);
    enter *= fit;
    leave *= fit;
  }
  const time = Math.max(0, Number(t) || 0);
  const pIn = easeOut(clamp01(time / enter));
  const pOut = Number.isFinite(duration) ? easeIn(clamp01((time - (duration - leave)) / leave)) : 0;
  // 0 = fully hidden, 1 = fully on screen.
  const presence = layout.entrance === 'none' ? 1 : Math.min(pIn, 1 - pOut);
  const away = 1 - presence;
  let tx = layout.x * width;
  let ty = layout.y * height;
  let scale = layout.scale;
  if (layout.entrance === 'rise') ty += away * height * 0.04;
  if (layout.entrance === 'pop') scale *= 0.88 + 0.12 * presence;
  if (layout.entrance === 'slide') tx += away * width * 0.06 * (rtl ? 1 : -1);
  return { opacity: layout.opacity * presence, tx, ty, scale };
}

/**
 * Resize from a handle on the graphic's on-screen box, pinning the opposite
 * side/corner like any editor. `box` is the content box in canvas px as drawn
 * now; `dx`/`dy` the pointer travel in canvas px. The layer scales about the
 * canvas centre, so the offset is re-solved to keep the anchor still.
 */
export function resizeGraphicLayout({ layout, box, handle, dx, dy, width, height }) {
  const current = normalizeGraphicLayout(layout);
  const east = handle.includes('e');
  const west = handle.includes('w');
  const south = handle.includes('s');
  const north = handle.includes('n');
  const ratioX = east || west ? (box.w + (east ? dx : -dx)) / Math.max(1, box.w) : null;
  const ratioY = north || south ? (box.h + (south ? dy : -dy)) / Math.max(1, box.h) : null;
  const ratios = [ratioX, ratioY].filter((value) => value !== null);
  const ratio = ratios.length > 0 ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 1;
  const scale = Math.min(3, Math.max(0.25, current.scale * Math.max(0.05, ratio)));
  const anchorX = east ? box.x : west ? box.x + box.w : box.x + box.w / 2;
  const anchorY = south ? box.y : north ? box.y + box.h : box.y + box.h / 2;
  const cx = width / 2;
  const cy = height / 2;
  const k = scale / current.scale;
  const tx = anchorX - cx - k * (anchorX - cx - current.x * width);
  const ty = anchorY - cy - k * (anchorY - cy - current.y * height);
  const round = (value) => Math.round(value * 1000) / 1000;
  return normalizeGraphicLayout({ ...current, scale: round(scale), x: round(tx / width), y: round(ty / height) });
}

// A start time in the request ("at 0:05", "at 12s", "from 5 seconds", "ב-0:05")
// means the user placed it; a length ("for 4 seconds") does not. Otherwise the
// graphic goes where the playhead is.
const TIME_IN_REQUEST = [
  /\b\d{1,2}:\d{2}\b/,
  /\b(?:at|from|starting(?:\s+at)?|start(?:ing)?\s+at)\s+\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds?)?\b/i,
  /(?:^|\s)(?:ב|מ|בשנייה|משנייה|בשניה|משניה)[-\s]?\d+/,
];
export function requestMentionsTime(request) {
  const text = String(request ?? '');
  return TIME_IN_REQUEST.some((pattern) => pattern.test(text));
}
const FIELD_TYPES = new Set(['text', 'color', 'number']);
const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,31}$/;

// Anything that could reach outside the page. The frame is also sandboxed and
// runs under a CSP with no network, so this is a readable early rejection, not
// the only barrier.
const FORBIDDEN_PATTERNS = [
  [/\b(?:https?|wss?|ftp|file):\/\//i, 'external URL'],
  [/(?:src|href)\s*=\s*["']?\/\//i, 'protocol-relative URL'],
  [/@import\b/i, 'CSS @import'],
  [/<\s*(?:iframe|object|embed|frame|base|link|meta)\b/i, 'embedded frame or head tag'],
  [/\bfetch\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\b/, 'network API'],
  [/\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/, 'storage API'],
  [/\bwindow\.(?:open|parent|top)\b|\bparent\.postMessage\b/, 'window escape'],
];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeField(raw) {
  if (!isRecord(raw)) return null;
  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  const type = FIELD_TYPES.has(raw.type) ? raw.type : 'text';
  if (!FIELD_KEY.test(key)) return null;
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 60) : key;
  let value = raw.value;
  if (type === 'number') {
    value = Number(value);
    if (!Number.isFinite(value)) value = 0;
  } else {
    value = typeof value === 'string' ? value.slice(0, 500) : String(value ?? '');
  }
  return { key, label, type, value };
}

/**
 * Check a graphic Claude produced. Returns `{ ok: true, graphic }` with a
 * normalized copy, or `{ ok: false, errors }` explaining every problem found.
 */
export function validateGraphicSpec(spec) {
  const errors = [];
  if (!isRecord(spec)) return { ok: false, errors: ['The graphic is not an object.'] };
  const html = typeof spec.html === 'string' ? spec.html.trim() : '';
  if (!html) errors.push('The graphic has no HTML.');
  if (new TextEncoder().encode(html).length > MAX_GRAPHIC_HTML_BYTES) errors.push('The graphic HTML is too large.');
  // XML namespace identifiers (SVG's createElementNS / xmlns) look like URLs
  // but never load anything; rejecting them threw away good SVG graphics and
  // cost a full extra Claude round (2026-10-01).
  const scanned = html.replace(/https?:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml|XML\/1998\/namespace|2000\/xmlns\/?)(?![\w.\/-])/g, '');
  for (const [pattern, label] of FORBIDDEN_PATTERNS) {
    if (pattern.test(scanned)) errors.push(`The graphic uses a blocked feature: ${label}.`);
  }
  const rawFields = Array.isArray(spec.fields) ? spec.fields : [];
  if (rawFields.length > MAX_GRAPHIC_FIELDS) errors.push(`The graphic declares more than ${MAX_GRAPHIC_FIELDS} fields.`);
  const fields = [];
  const seen = new Set();
  for (const raw of rawFields.slice(0, MAX_GRAPHIC_FIELDS)) {
    const field = normalizeField(raw);
    if (!field) {
      errors.push('A field has an invalid key (use letters, digits and _ starting with a lowercase letter).');
      continue;
    }
    if (seen.has(field.key)) {
      errors.push(`Field "${field.key}" is declared twice.`);
      continue;
    }
    seen.add(field.key);
    fields.push(field);
  }
  const durationSec = Number(spec.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 600) {
    errors.push('The graphic needs a duration between 0 and 600 seconds.');
  }
  const title = typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim().slice(0, 80) : 'Graphic';
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, graphic: { title, html, fields, durationSec } };
}

function escapeScriptJson(value) {
  // U+2028/U+2029 are legal in JSON but end a line inside a <script>.
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * The seek + field runtime injected into every graphic page. Kept as a plain
 * function so it is readable here and stringified into the page.
 */
function graphicRuntime() {
  const state = { t: 0 };
  // Hebrew/Arabic text turns its element — and, when all the text is RTL, the
  // whole graphic — right-to-left, even if the page forgot to say so.
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  // Claude's page sits inside #rc-root, which carries the text direction and
  // the user's size/position. The document itself stays left-to-right: the
  // browser takes the viewport direction from <body>, and a right-to-left
  // viewport anchors a page drawn smaller than full size to its right edge.
  function rcRoot() { return document.getElementById('rc-root') || document.body; }
  function applyFields(fields) {
    let texts = 0;
    let rtl = 0;
    for (const field of fields || []) {
      if (field.type === 'text') {
        const value = String(field.value);
        const isRtl = RTL.test(value);
        texts += 1;
        if (isRtl) rtl += 1;
        for (const node of document.querySelectorAll('[data-rc-field="' + field.key + '"]')) {
          node.textContent = value;
          node.setAttribute('dir', isRtl ? 'rtl' : 'auto');
        }
      } else {
        document.documentElement.style.setProperty('--rc-' + field.key, String(field.value));
      }
    }
    if (texts > 0 && rtl === texts) rcRoot().setAttribute('dir', 'rtl');
    else rcRoot().removeAttribute('dir');
    // Lets a page that splits text into per-word/char spans redo it.
    document.dispatchEvent(new Event('rc:fields'));
    layoutMarquees();
  }
  // Scrolling strips (tickers, tapes, marquees) are the runtime's job, never a
  // one-off slide: `[data-rc-marquee]` holds ONE unit of content; the runtime
  // repeats it until the strip is always full, keeps each copy's words and
  // punctuation together (bidi-isolated), and loops it seamlessly at any
  // length. data-rc-speed = px/s (default 120); data-rc-direction = left|right
  // (default: right for right-to-left text, else left).
  function layoutMarquees() {
    for (const strip of document.querySelectorAll('[data-rc-marquee]')) {
      const existing = strip.querySelector(':scope > .rc-mq-track');
      const unitHtml = existing ? existing.firstElementChild?.innerHTML ?? '' : strip.innerHTML;
      const track = document.createElement('div');
      track.className = 'rc-mq-track';
      const unit = document.createElement('span');
      unit.className = 'rc-mq-unit';
      unit.setAttribute('dir', 'auto');
      unit.innerHTML = unitHtml;
      track.appendChild(unit);
      strip.innerHTML = '';
      strip.appendChild(track);
      // Layout px (offsetWidth ignores the transforms on the strip or page).
      const width = Math.max(1, unit.offsetWidth);
      const copies = Math.min(200, Math.ceil(Math.max(strip.clientWidth, 1) / width) + 2);
      for (let i = 1; i < copies; i += 1) track.appendChild(unit.cloneNode(true));
      strip.__rcUnitWidth = width;
    }
    seekMarquees(marqueeTime());
  }
  function marqueeTime() {
    return window.RC.animate === false ? Number(window.RC.holdSec) || 0 : state.t;
  }
  function seekMarquees(time) {
    const rtl = rcRoot().getAttribute('dir') === 'rtl';
    for (const strip of document.querySelectorAll('[data-rc-marquee]')) {
      const track = strip.querySelector(':scope > .rc-mq-track');
      const width = strip.__rcUnitWidth;
      if (!track || !width) continue;
      const speed = Number(strip.getAttribute('data-rc-speed')) || 120;
      const direction = strip.getAttribute('data-rc-direction') || (rtl ? 'right' : 'left');
      const offset = (time * speed) % width;
      track.style.transform = 'translateX(' + (direction === 'right' ? offset - width : -offset).toFixed(2) + 'px)';
    }
  }
  // With animation off the graphic holds its fully-entered state for its whole
  // length: every frame shows the same moment, `holdSec` into the animation.
  // Length changes: "hold" (default) keeps the designed timing and lets exits
  // follow the new length (--rc-duration = real length); "stretch" plays the
  // whole design slower/faster to fill the new length (--rc-duration stays the
  // designed length and time is scaled).
  function stretchFactor() {
    const designed = Number(window.RC.designedSec);
    const duration = Number(window.RC.durationSec);
    return window.RC.timing === 'stretch' && designed > 0 && duration > 0 ? designed / duration : 1;
  }
  function applyDuration(durationSec) {
    const duration = Number(durationSec);
    if (Number.isFinite(duration) && duration > 0) {
      window.RC.durationSec = duration;
      const designed = Number(window.RC.designedSec);
      const cssDuration = window.RC.timing === 'stretch' && designed > 0 ? designed : duration;
      document.documentElement.style.setProperty('--rc-duration', cssDuration + 's');
    }
  }
  // The user's size/position/opacity and the app's own entrance/exit, on the
  // whole page. Uses real time even for a still graphic: it still arrives.
  // The editor shows the page at the viewer's real pixel size (viewScale <
  // 1) instead of shrinking a full-size page, so text and lines are drawn
  // sharp at the size they are seen. Export uses viewScale 1. The user's
  // layout scales about the canvas centre; the view scale about the corner.
  function applyLayer() {
    const layout = window.RC.layout;
    const body = rcRoot();
    if (!layout || !body) return;
    const rtl = rcRoot().getAttribute('dir') === 'rtl';
    const s = rcGraphicLayerStateAt(layout, state.t, window.RC.durationSec, window.RC.width, window.RC.height, rtl);
    const k = Number(window.RC.viewScale) > 0 ? Number(window.RC.viewScale) : 1;
    const cx = window.RC.width / 2;
    const cy = window.RC.height / 2;
    // Whole pixels on screen, so the layer is never resampled half a pixel off.
    const tx = Math.round(k * (cx + s.tx - s.scale * cx));
    const ty = Math.round(k * (cy + s.ty - s.scale * cy));
    // Size by CSS zoom, not a scale transform: zoom re-lays the page out at
    // its real on-screen size, so text and strokes are drawn sharp at any size
    // (a scale transform enlarges an already-drawn picture and goes soft).
    // Lengths on the zoomed element are zoomed too, hence translate / zoom.
    const zoom = k * s.scale;
    body.style.zoom = zoom.toFixed(5);
    body.style.transformOrigin = '0 0';
    body.style.transform = 'translate(' + (tx / zoom).toFixed(3) + 'px,' + (ty / zoom).toFixed(3) + 'px)';
    body.style.opacity = String(Math.round(s.opacity * 1000) / 1000);
  }
  function seek(t) {
    state.t = Math.max(0, Number(t) || 0);
    applyLayer();
    const time = window.RC.animate === false ? Number(window.RC.holdSec) || 0 : state.t * stretchFactor();
    if (typeof window.rcSeek === 'function') {
      try { window.rcSeek(time); } catch (error) { console.error('[graphic] rcSeek failed', error); }
    }
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = time * 1000;
    }
    // Strips keep their real speed whatever the timing mode.
    seekMarquees(marqueeTime());
    reportBounds();
  }
  // Tells the editor where the visible content sits (canvas px, including the
  // user's move/size), so it can draw a box to drag. A full-canvas wrapper
  // with nothing painted on it is not content, so only leaves and painted
  // boxes count.
  let lastBounds = '';
  function reportBounds() {
    if (window.parent === window || !document.body) return;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const node of document.body.querySelectorAll('*')) {
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') continue;
      // A strip's copies run far past its edges; the strip itself is the box.
      if (node.closest('.rc-mq-track')) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const painted = node.children.length === 0
        || node.hasAttribute('data-rc-marquee')
        || style.backgroundImage !== 'none'
        || (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent');
      if (!painted) continue;
      const box = clipToAncestors(node, node.getBoundingClientRect());
      if (!box || box.width < 1 || box.height < 1) continue;
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
    // Measured in shown pixels; report in canvas pixels.
    const k = Number(window.RC.viewScale) > 0 ? Number(window.RC.viewScale) : 1;
    left /= k; top /= k; right /= k; bottom /= k;
    const rect = Number.isFinite(left)
      ? { x: Math.max(0, left), y: Math.max(0, top), w: Math.min(window.RC.width, right) - Math.max(0, left), h: Math.min(window.RC.height, bottom) - Math.max(0, top) }
      : null;
    const key = JSON.stringify(rect);
    if (key === lastBounds) return;
    lastBounds = key;
    window.parent.postMessage({ type: 'rc-bounds', rect }, '*');
  }
  // Content hidden by an overflow-clipping parent is not visible, so it must
  // not stretch the drag box (e.g. text sliding inside a clipped tape).
  function clipToAncestors(node, rect) {
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflow;
      if (overflow === 'visible') continue;
      const clip = parent.getBoundingClientRect();
      box = { left: Math.max(box.left, clip.left), top: Math.max(box.top, clip.top), right: Math.min(box.right, clip.right), bottom: Math.min(box.bottom, clip.bottom) };
    }
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    return width > 0 && height > 0 ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width, height } : null;
  }
  window.RC.seek = seek;
  window.RC.applyFields = applyFields;
  window.RC.layoutMarquees = layoutMarquees;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'rc-seek') seek(data.t);
    if (data.type === 'rc-fields') { window.RC.fields = data.fields; applyFields(data.fields); seek(state.t); }
    if (data.type === 'rc-layout') { window.RC.layout = data.layout; seek(state.t); }
    if (data.type === 'rc-viewport') { window.RC.viewScale = Number(data.scale) > 0 ? Number(data.scale) : 1; seek(state.t); }
    if (data.type === 'rc-animate') { window.RC.animate = data.animate !== false; window.RC.holdSec = data.holdSec; if (data.timing) window.RC.timing = data.timing; if (data.designedSec !== undefined) window.RC.designedSec = data.designedSec; applyDuration(data.durationSec); seek(state.t); }
  });
  function ready() {
    applyDuration(window.RC.durationSec);
    applyFields(window.RC.fields);
    seek(state.t);
    // Strip widths depend on the font; measure again once it has loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutMarquees(); reportBounds(); });
    document.documentElement.dataset.rcReady = 'true';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}

/**
 * Wrap Claude's HTML fragment in the page every graphic runs as: fixed canvas
 * size, transparent background, no network (CSP), fields and seek runtime.
 */
export function buildGraphicDocument({ html, fields = [], width = 1920, height = 1080, animate = true, holdSec = DEFAULT_HOLD_SEC, durationSec = 4, layout = DEFAULT_GRAPHIC_LAYOUT, timing = 'hold', designedSec = null }) {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:";
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>:root{--rc-duration:${Number(durationSec) > 0 ? Number(durationSec) : 4}s}html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
/* The page frame stays left-to-right: when the editor draws the page smaller
   than full size, a right-to-left root would anchor it to the right edge and
   push the graphic out of view. Right-to-left text is set on body instead. */
html{direction:ltr!important}
${GRAPHICS_FONT_CSS}
body{position:relative;font-family:Heebo,Inter,system-ui,sans-serif}
[data-rc-marquee]{overflow:hidden;white-space:nowrap}
.rc-mq-track{display:inline-flex;direction:ltr;white-space:nowrap;will-change:transform}
.rc-mq-unit{display:inline-block;flex:none;unicode-bidi:isolate;white-space:nowrap}</style>
<script>window.RC=${escapeScriptJson({ fields, width: w, height: h, animate: animate !== false, holdSec, durationSec, layout: normalizeGraphicLayout(layout), timing: timing === 'stretch' ? 'stretch' : 'hold', designedSec: Number(designedSec) > 0 ? Number(designedSec) : null })};
var rcGraphicLayerStateAt=${graphicLayerStateAt.toString()};</script>
</head><body><div id="rc-root" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px">
${html}
</div>
<script>(${graphicRuntime.toString()})();</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Timeline document operations. Like zoom-markers/censor-markers, each returns
// a new document, or the SAME document when the edit is a no-op.

function graphicEffectId(id) {
  return `graphic:${id}`;
}

function effectsOf(document) {
  return Array.isArray(document?.timeline?.effects) ? document.timeline.effects : [];
}

function withEffects(document, effects) {
  return { ...document, timeline: { ...document.timeline, effects } };
}

function toGraphic(effect) {
  const params = isRecord(effect.params) ? effect.params : {};
  return {
    id: String(effect.id).replace(/^graphic:/, ''),
    effectId: effect.id,
    title: typeof params.title === 'string' ? params.title : 'Graphic',
    html: typeof params.html === 'string' ? params.html : '',
    fields: Array.isArray(params.fields) ? params.fields : [],
    request: typeof params.request === 'string' ? params.request : '',
    direction: typeof params.direction === 'string' ? params.direction : null,
    animate: params.animate !== false,
    layout: normalizeGraphicLayout(params.layout),
    timing: params.timing === 'stretch' ? 'stretch' : 'hold',
    designedSec: Number(params.designedSec) > 0 ? Number(params.designedSec) : null,
    startFrame: effect.startFrame ?? 0,
    endFrame: effect.endFrame ?? 0,
    enabled: effect.enabled !== false,
  };
}

/** Graphics in z-order: later entries draw on top. */
export function listGraphics(document) {
  return effectsOf(document).filter((effect) => effect.kind === GRAPHIC_EFFECT_KIND).map(toGraphic);
}

/**
 * Rows for the Graphics lane, so overlapping graphics stack like video tracks
 * instead of hiding each other. Walks the graphics in layer order (back to
 * front) and puts each in the lowest row where it does not overlap anything;
 * row 0 is drawn at the bottom, so higher rows read as "on top".
 */
export function graphicLaneRows(graphics) {
  const rows = [];
  const assignment = {};
  for (const graphic of graphics) {
    let row = 0;
    while (rows[row]?.some((other) => graphic.startFrame < other.endFrame && other.startFrame < graphic.endFrame)) row += 1;
    (rows[row] ??= []).push(graphic);
    assignment[graphic.id] = row;
  }
  return { rows: Math.max(1, rows.length), assignment };
}

/** Move a graphic in the layer order: later in the list draws on top. */
export function reorderGraphic(document, id, where) {
  const effects = effectsOf(document);
  const index = effects.findIndex((effect) => effect.id === graphicEffectId(id));
  if (index < 0) return document;
  const graphicIndexes = effects.map((effect, i) => (effect.kind === GRAPHIC_EFFECT_KIND ? i : -1)).filter((i) => i >= 0);
  const position = graphicIndexes.indexOf(index);
  const targetPosition = where === 'front' ? graphicIndexes.length - 1
    : where === 'back' ? 0
      : where === 'forward' ? Math.min(graphicIndexes.length - 1, position + 1)
        : Math.max(0, position - 1);
  if (targetPosition === position) return document;
  const graphicsInOrder = graphicIndexes.map((i) => effects[i]);
  const [moved] = graphicsInOrder.splice(position, 1);
  graphicsInOrder.splice(targetPosition, 0, moved);
  const next = effects.slice();
  graphicIndexes.forEach((slot, n) => { next[slot] = graphicsInOrder[n]; });
  return withEffects(document, next);
}

export function graphicsAtFrame(document, frame) {
  return listGraphics(document).filter((graphic) => graphic.enabled && frame >= graphic.startFrame && frame < graphic.endFrame);
}

function clampRange(startFrame, endFrame, timelineFrames) {
  const max = Number.isFinite(timelineFrames) && timelineFrames > 0 ? Math.round(timelineFrames) : Infinity;
  let start = Math.max(0, Math.round(Number(startFrame) || 0));
  let end = Math.round(Number(endFrame) || 0);
  if (Number.isFinite(max)) start = Math.min(start, Math.max(0, max - MIN_GRAPHIC_FRAMES));
  end = Math.max(start + MIN_GRAPHIC_FRAMES, end);
  if (Number.isFinite(max)) end = Math.min(end, max);
  return { startFrame: start, endFrame: Math.max(end, start + 1) };
}

export function addGraphic(document, { id, title, html, fields = [], request = '', direction = null, designedSec = null, startFrame, endFrame, timelineFrames } = {}) {
  if (!document?.timeline || !id || typeof html !== 'string' || !html) return document;
  if (effectsOf(document).some((effect) => effect.id === graphicEffectId(id))) return document;
  const range = clampRange(startFrame, endFrame, timelineFrames);
  return withEffects(document, [
    ...effectsOf(document),
    {
      id: graphicEffectId(id),
      kind: GRAPHIC_EFFECT_KIND,
      ownerId: GRAPHIC_OWNER_ID,
      ownerType: 'timeline',
      startFrame: range.startFrame,
      endFrame: range.endFrame,
      enabled: true,
      params: { title: title || 'Graphic', html, fields, request, ...(typeof direction === 'string' ? { direction } : {}), ...(Number(designedSec) > 0 ? { designedSec: Number(designedSec) } : {}) },
    },
  ]);
}

function updateEffect(document, id, update) {
  const effects = effectsOf(document);
  const index = effects.findIndex((effect) => effect.id === graphicEffectId(id));
  if (index < 0) return document;
  const next = update(effects[index]);
  if (next === effects[index]) return document;
  const copy = effects.slice();
  copy[index] = next;
  return withEffects(document, copy);
}

export function moveGraphic(document, id, { startFrame, endFrame, timelineFrames } = {}) {
  return updateEffect(document, id, (effect) => {
    const range = clampRange(startFrame, endFrame, timelineFrames);
    if (range.startFrame === effect.startFrame && range.endFrame === effect.endFrame) return effect;
    return { ...effect, ...range };
  });
}

export function updateGraphicFields(document, id, values) {
  return updateEffect(document, id, (effect) => {
    const fields = Array.isArray(effect.params?.fields) ? effect.params.fields : [];
    let changed = false;
    const nextFields = fields.map((field) => {
      if (!isRecord(values) || !(field.key in values)) return field;
      const normalized = normalizeField({ ...field, value: values[field.key] });
      if (!normalized || normalized.value === field.value) return field;
      changed = true;
      return { ...field, value: normalized.value };
    });
    return changed ? { ...effect, params: { ...effect.params, fields: nextFields } } : effect;
  });
}

/** Swap in a new Claude version of the page, keeping timing and layer order. */
export function replaceGraphicContent(document, id, { title, html, fields, request, designedSec }) {
  if (typeof html !== 'string' || !html) return document;
  return updateEffect(document, id, (effect) => ({
    ...effect,
    params: {
      ...effect.params,
      title: title || effect.params?.title || 'Graphic',
      html,
      fields: Array.isArray(fields) ? fields : effect.params?.fields ?? [],
      request: typeof request === 'string' ? request : effect.params?.request ?? '',
      ...(Number(designedSec) > 0 ? { designedSec: Number(designedSec) } : {}),
    },
  }));
}

export function setGraphicAnimate(document, id, animate) {
  return updateEffect(document, id, (effect) => {
    const next = animate !== false;
    if ((effect.params?.animate !== false) === next) return effect;
    return { ...effect, params: { ...effect.params, animate: next } };
  });
}

/** Merge a size/position/opacity/entrance change into a graphic's layout. */
export function setGraphicLayout(document, id, patch) {
  return updateEffect(document, id, (effect) => {
    const current = normalizeGraphicLayout(effect.params?.layout);
    const next = normalizeGraphicLayout({ ...current, ...(isRecord(patch) ? patch : {}) });
    if (Object.keys(next).every((key) => next[key] === current[key])) return effect;
    return { ...effect, params: { ...effect.params, layout: next } };
  });
}

/** How a graphic fills a length different from the one it was designed for. */
export function setGraphicTiming(document, id, timing) {
  return updateEffect(document, id, (effect) => {
    const next = timing === 'stretch' ? 'stretch' : 'hold';
    if ((effect.params?.timing === 'stretch' ? 'stretch' : 'hold') === next) return effect;
    return { ...effect, params: { ...effect.params, timing: next } };
  });
}

export function removeGraphic(document, id) {
  const effects = effectsOf(document);
  const next = effects.filter((effect) => effect.id !== graphicEffectId(id));
  return next.length === effects.length ? document : withEffects(document, next);
}

/**
 * Pointer/keyboard retiming of a graphic block in timeline frames. `move` keeps
 * the length, `start`/`end` trim one edge. Always inside [0, totalFrames] and
 * never shorter than `minSpan`. Preview and commit both use this.
 */
export function dragGraphicRange({ startFrame, endFrame }, { mode, delta, totalFrames, minSpan = MIN_GRAPHIC_FRAMES }) {
  const total = Math.max(minSpan, Math.round(totalFrames));
  const start = Math.round(startFrame);
  const end = Math.round(endFrame);
  const step = Math.round(delta);
  if (mode === 'move') {
    const span = Math.min(total, Math.max(minSpan, end - start));
    const nextStart = Math.max(0, Math.min(total - span, start + step));
    return { startFrame: nextStart, endFrame: nextStart + span };
  }
  if (mode === 'start') {
    return { startFrame: Math.max(0, Math.min(end - minSpan, start + step)), endFrame: end };
  }
  return { startFrame: start, endFrame: Math.max(start + minSpan, Math.min(total, end + step)) };
}
