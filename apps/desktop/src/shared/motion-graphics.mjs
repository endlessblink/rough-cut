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
  for (const [pattern, label] of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) errors.push(`The graphic uses a blocked feature: ${label}.`);
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
    if (texts > 0 && rtl === texts) document.documentElement.setAttribute('dir', 'rtl');
    else document.documentElement.removeAttribute('dir');
    // Lets a page that splits text into per-word/char spans redo it.
    document.dispatchEvent(new Event('rc:fields'));
  }
  // With animation off the graphic holds its fully-entered state for its whole
  // length: every frame shows the same moment, `holdSec` into the animation.
  function applyDuration(durationSec) {
    const duration = Number(durationSec);
    if (Number.isFinite(duration) && duration > 0) {
      window.RC.durationSec = duration;
      document.documentElement.style.setProperty('--rc-duration', duration + 's');
    }
  }
  function seek(t) {
    state.t = Math.max(0, Number(t) || 0);
    const time = window.RC.animate === false ? Number(window.RC.holdSec) || 0 : state.t;
    if (typeof window.rcSeek === 'function') {
      try { window.rcSeek(time); } catch (error) { console.error('[graphic] rcSeek failed', error); }
    }
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = time * 1000;
    }
  }
  window.RC.seek = seek;
  window.RC.applyFields = applyFields;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'rc-seek') seek(data.t);
    if (data.type === 'rc-fields') { window.RC.fields = data.fields; applyFields(data.fields); seek(state.t); }
    if (data.type === 'rc-animate') { window.RC.animate = data.animate !== false; window.RC.holdSec = data.holdSec; applyDuration(data.durationSec); seek(state.t); }
  });
  function ready() {
    applyDuration(window.RC.durationSec);
    applyFields(window.RC.fields);
    seek(state.t);
    document.documentElement.dataset.rcReady = 'true';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}

/**
 * Wrap Claude's HTML fragment in the page every graphic runs as: fixed canvas
 * size, transparent background, no network (CSP), fields and seek runtime.
 */
export function buildGraphicDocument({ html, fields = [], width = 1920, height = 1080, animate = true, holdSec = DEFAULT_HOLD_SEC, durationSec = 4 }) {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:";
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>:root{--rc-duration:${Number(durationSec) > 0 ? Number(durationSec) : 4}s}html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
body{position:relative;font-family:Heebo,Inter,system-ui,sans-serif}</style>
<script>window.RC=${escapeScriptJson({ fields, width: w, height: h, animate: animate !== false, holdSec, durationSec })};</script>
</head><body>
${html}
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
    animate: params.animate !== false,
    startFrame: effect.startFrame ?? 0,
    endFrame: effect.endFrame ?? 0,
    enabled: effect.enabled !== false,
  };
}

/** Graphics in z-order: later entries draw on top. */
export function listGraphics(document) {
  return effectsOf(document).filter((effect) => effect.kind === GRAPHIC_EFFECT_KIND).map(toGraphic);
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

export function addGraphic(document, { id, title, html, fields = [], request = '', startFrame, endFrame, timelineFrames } = {}) {
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
      params: { title: title || 'Graphic', html, fields, request },
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
export function replaceGraphicContent(document, id, { title, html, fields, request }) {
  if (typeof html !== 'string' || !html) return document;
  return updateEffect(document, id, (effect) => ({
    ...effect,
    params: {
      ...effect.params,
      title: title || effect.params?.title || 'Graphic',
      html,
      fields: Array.isArray(fields) ? fields : effect.params?.fields ?? [],
      request: typeof request === 'string' ? request : effect.params?.request ?? '',
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
