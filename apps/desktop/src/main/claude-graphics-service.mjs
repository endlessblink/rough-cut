// Asks the locally logged-in Claude Code CLI for a motion graphic.
//
// The answer must match GRAPHIC_JSON_SCHEMA and then pass validateGraphicSpec;
// a failing answer gets one retry with the problems fed back (see claude-cli).

import { validateGraphicSpec } from '../shared/motion-graphics.mjs';
import { DEFAULT_CREATIVITY, DEFAULT_GRAPHICS_STYLE_ID, DESIGN_BANS, resolveCreativity, resolveGraphicStyle } from '../shared/graphics-styles.mjs';
import {
  DEFAULT_CLAUDE_MODEL,
  askClaudeForJson,
  buildClaudeArgs as buildCliArgs,
  resolveClaudeBinary,
  runClaudeOnce,
} from './claude-cli.mjs';

export { parseClaudeResult, resolveClaudeBinary, runClaudeOnce } from './claude-cli.mjs';

// Design work: the most capable model is worth the extra seconds here.
export const GRAPHICS_MODEL = 'opus';

export const DEFAULT_GRAPHICS_STYLE = Object.freeze({
  fontFamily: 'Heebo',
  textColor: '#ffffff',
  primaryColor: '#1f6feb',
  accentColor: '#f5b83d',
  notes: '',
  styleId: DEFAULT_GRAPHICS_STYLE_ID,
  creativity: DEFAULT_CREATIVITY,
  styleLock: false,
});

export const GRAPHIC_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['title', 'durationSec', 'html', 'fields'],
  properties: {
    title: { type: 'string' },
    durationSec: { type: 'number' },
    startSec: { type: ['number', 'null'] },
    html: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'label', 'type', 'value'],
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string', enum: ['text', 'color', 'number'] },
          value: { type: ['string', 'number'] },
        },
      },
    },
  },
});

function normalizeStyle(style) {
  const merged = { ...DEFAULT_GRAPHICS_STYLE, ...(style && typeof style === 'object' ? style : {}) };
  return Object.fromEntries(Object.entries(merged).map(([key, value]) => [key, String(value ?? '').slice(0, 400)]));
}

export function buildGraphicsSystemPrompt({ width, height, fps, style }) {
  const s = normalizeStyle(style);
  const look = resolveGraphicStyle(s.styleId);
  const creativity = resolveCreativity(s.creativity);
  return [
    'You are a senior broadcast motion designer and art director. You make lower thirds, openers, title cards, explainer cards and callouts that sit on top of screen-recording videos. Your work is distinctive and memorable, never template-safe.',
    'Return ONLY the JSON object the schema asks for. No prose.',
    '',
    '## Canvas',
    `A transparent HTML layer exactly ${width}x${height} CSS pixels at ${fps} fps, drawn over the whole video (a screen recording plus a round camera bubble, usually in a corner). Position everything absolutely inside a 5% safe margin. This is VIDEO, not a web page: design at video scale (a headline is 64–140px, never web-sized).`,
    '',
    `## Visual style: ${look.label} (${look.mood})`,
    s.styleLock === 'true'
      ? 'STYLE LOCKED by the user: follow this style closely — its palette, type, texture and motion character. Only the composition, layout and motifs are new, from the idea and the design direction below.'
      : 'LIGHT INFLUENCE ONLY: treat this style as a hint, not a rule. Take at most its mood and one accent colour; choose your own palette, type and shapes to suit the idea, so each graphic feels unique. Never let the style dictate the composition.',
    look.brief,
    `Type: ${look.fonts}`,
    `Motion character: ${look.motion}`,
    s.notes ? `Brand notes from the user (these win over the style): ${s.notes}` : '',
    `Brand colours available if they fit the style: text ${s.textColor}, primary ${s.primaryColor}, accent ${s.accentColor}.`,
    '',
    `## Creativity: ${creativity.level}/5 — ${creativity.label}`,
    creativity.brief,
    '',
    '## Motion craft (always)',
    '- Build / breathe / resolve: elements enter staggered in order of importance (not DOM order, whole stagger under 0.5 s), stay alive during the hold, then exit faster than they entered.',
    '- Start the first motion 0.1–0.3 s in, never at 0. Entrances ease OUT (e.g. cubic-bezier(.16,1,.3,1)), exits ease IN (e.g. cubic-bezier(.7,0,.84,0)). Vary eases, speeds and directions between elements.',
    '- Combine transforms on entrances (slide + fade + scale, or a clip-path/mask wipe), not the same "fade up 30px" on everything.',
    '- The exit ends exactly when the graphic ends. The page provides the real length as the CSS variable --rc-duration (e.g. 4s); it changes when the user trims, so time exits from it: animation-delay: calc(var(--rc-duration) - 0.45s).',
    '- Mechanics: CSS @keyframes only, every animation with animation-fill-mode: both. The editor pauses all animations and sets their time directly, so every moment must render correctly when scrubbed in any order. Never use setTimeout, setInterval, requestAnimationFrame, Date or performance.now. If you truly need JS-driven motion, define window.rcSeek = (t) => { ... } that draws the state at t seconds.',
    '- Scrolling strips (ticker, tape, marquee, repeating word band) MUST loop forever and never run out: never animate them with @keyframes or a fixed slide. Only use a strip when the idea genuinely calls for one. Put the attribute data-rc-marquee on the clipping strip and write ONE unit of its content inside. The editor repeats the unit to fill the strip, keeps each copy\'s words and punctuation together for right-to-left text, and loops it seamlessly at any length. data-rc-speed is px per second (default 120); data-rc-direction is "left" or "right" (default: right for Hebrew/Arabic, left otherwise). Give the strip a fixed width and its own overflow:hidden box; do not script its content.',
    '- Per-word or per-character kinetic type: a small <script> may split the text of data-rc-field elements into <span>s (set style --i for the index and use animation-delay: calc(var(--i) * 28ms + 0.2s)). The editor rewrites field text when the user edits it and then fires document event "rc:fields", so run the split on load AND on document.addEventListener("rc:fields", split). Keep each word unbroken for Hebrew (split by word, not by character, for right-to-left text).',
    '',
    '## Originality (the request and the video are references, not a spec)',
    '- The user\'s words tell you the IDEA to get across, not the picture. Invent an original visual for it: a metaphor, a small scene, an object, a diagram, a character — something that explains or dramatises the point.',
    '- Do not reproduce what is already on screen: no copies of the slide\'s title, layout, cards or wording, and no recreating the video\'s own graphics. Repeating the speaker\'s sentence as big type is not an illustration.',
    '- Keep on-screen text minimal (a label or a few words at most) unless the user explicitly asks for a text graphic (title card, lower third, callout, quote).',
    '- Any style reference (palette, type feel) is loose inspiration so it sits comfortably with the video — borrow an accent colour or the mood, never the look wholesale.',
    '',
    '## Composition',
    '- Two focal points; lead the eye. Place it near an edge rather than floating in the middle (unless it is a centred opener the style calls for).',
    '- The graphic is a self-contained object the user can move and resize: every element has finished edges inside the canvas (keep the 5% margin). Never let a panel, tape or shape run off the canvas edge or be cropped by it, and never put overflow:hidden on the outer wrapper — a moved graphic would show a hard cut.',
    '- Structural elements (rules, bars, frames, shapes) must each have a job: revealing, underlining, framing or pointing at something.',
    '- Contrast: text must stay readable over any video (≥ 7:1 against its own panel, or a solid/near-solid plate behind it).',
    '',
    '## Never',
    ...DESIGN_BANS.map((ban) => `- ${ban}`),
    '',
    '## Right-to-left languages (Hebrew, Arabic)',
    '- The WHOLE layout flows right-to-left: dir="rtl" on the outer container, sit on the RIGHT side unless the user says otherwise (inside the margin, not glued to the edge), start-aligned text (right), accent bars on the right edge, entrances from the right.',
    '- Mirror only things whose meaning is a direction: arrows, chevrons, progress fills, slide directions. NEVER mirror or flip (scaleX(-1)) glyphs and icons that are not directional: question marks, exclamation marks, check marks, digits, letters, logos, play buttons, clocks.',
    '- Latin words and numbers inside Hebrew keep their own order automatically; do not reverse them.',
    '',
    '## Fonts and resources',
    '- Installed locally and safe to use: Heebo (100–900, Hebrew+Latin), Rubik (Hebrew+Latin), Alef (Hebrew+Latin), Noto Sans Hebrew, Inter, Inter Display, Helvetica Neue, Roboto, Roboto Condensed, Open Sans, Ubuntu, Orbitron, Pacifico, JetBrainsMono Nerd Font — plus these built-in hand-lettering fonts: Amatic SC (Hebrew+Latin, 400/700), Karantina (Hebrew+Latin, 400/700), Caveat (Latin, 400/700), Permanent Marker (Latin). Nothing else will render.',
    '- No external resources: no URLs, web fonts, remote images, fetch, iframes or storage. Draw shapes, icons and illustrations with inline SVG and CSS.',
    '',
    '## Editable fields',
    '- Every piece of user-visible text lives in an element with data-rc-field="<key>" and has a text field (write the same value inside the element as a fallback).',
    '- Main colours are CSS variables, e.g. background: var(--rc-panel, #111827), declared as color fields. Keys start lowercase: letters, digits, _. Give 2–6 fields, labelled in the user\'s language.',
    '',
    'durationSec: how long the graphic stays on screen (4–6 s for a lower third, 3–5 s for a title card, longer for explainers). startSec: the timeline second the user explicitly asked it to START at, or null when they gave no start time (a length like "for 4 seconds" is NOT a start time).',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Design directions: one is picked per new graphic so the same style never
 * collapses into one template. The style sets the look; the direction sets
 * the composition and kind of visual.
 */
export const DESIGN_DIRECTIONS = Object.freeze([
  { id: 'metaphor-scene', brief: 'An illustrated metaphor: a small scene with objects or simple characters acting out the idea.' },
  { id: 'diagram-build', brief: 'A diagram that builds step by step (flow, layers, cycle or comparison) — clear shapes, arrows, few labels.' },
  { id: 'object-3d', brief: 'One hero object drawn with depth (CSS 3D / SVG shading), turning or opening to reveal the point.' },
  { id: 'before-after', brief: 'A split or transformation: the problem state morphs into the solution state.' },
  { id: 'journey-map', brief: 'A path or map: a marker travels through stations that explain the idea.' },
  { id: 'icon-morph', brief: 'A single strong icon or symbol that morphs or assembles into the meaning, minimal text.' },
  { id: 'cutout-collage', brief: 'Cut-paper / collage composition: layered shapes and textures sliding into place.' },
  { id: 'data-visual', brief: 'An infographic moment: counters, bars, dots or a chart that makes the point with numbers or quantities.' },
  { id: 'character-vignette', brief: 'A tiny character (robot, hand, figure) doing something that demonstrates the idea.' },
  { id: 'type-poster', brief: 'An expressive typographic composition — the only direction where text may lead the visual.' },
]);

/** Pick a direction, avoiding ones already used in this video when possible. */
export function pickDesignDirection({ used = [], random = Math.random } = {}) {
  const usedSet = new Set(used);
  const fresh = DESIGN_DIRECTIONS.filter((direction) => !usedSet.has(direction.id));
  const pool = fresh.length > 0 ? fresh : DESIGN_DIRECTIONS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function buildGraphicsUserPrompt({ request, existing = null, validationErrors = [], direction = null, others = [], lengthSec = null }) {
  const parts = [];
  if (existing) {
    parts.push('Change this existing graphic as requested. Keep what the request does not mention.');
    parts.push(`Current title: ${existing.title}`);
    parts.push(`Current duration: ${existing.durationSec} s`);
    parts.push(`Current fields: ${JSON.stringify(existing.fields ?? [])}`);
    parts.push('Current HTML:');
    parts.push(existing.html);
    parts.push('');
    parts.push(`Requested change: ${request}`);
  } else {
    parts.push(`Make this graphic: ${request}`);
    if (direction && !/\b(lower third|title card|callout|quote)\b/i.test(request)) {
      parts.push('');
      parts.push(`Design direction for this one (unless the request clearly asks for something else): ${direction.brief}`);
    }
    if (others.length > 0) {
      parts.push('');
      parts.push('Already in this video — do NOT repeat their composition, layout or motifs (no same plate, tape, sticker, hero-word or question-mark treatment):');
      for (const other of others.slice(0, 12)) parts.push(`- ${other}`);
    }
  }
  if (Number(lengthSec) > 0) {
    parts.push('');
    parts.push(`Length: exactly ${Number(lengthSec)} seconds (set durationSec to ${Number(lengthSec)}).` + (Number(lengthSec) > 10
      ? ' This is long: build a multi-beat scene — an opening build, then several beats that each add or change something, spaced across the whole length, then a resolve and exit. Never one short animation followed by a long frozen hold.'
      : ''));
  }
  if (validationErrors.length > 0) {
    parts.push('');
    parts.push('Your previous answer was rejected for these reasons. Fix all of them:');
    for (const error of validationErrors) parts.push(`- ${error}`);
  }
  return parts.join('\n');
}

export function buildClaudeArgs({ systemPrompt, model = DEFAULT_CLAUDE_MODEL }) {
  return buildCliArgs({ systemPrompt, schema: GRAPHIC_JSON_SCHEMA, model });
}

/**
 * Generate (or, with `existing`, revise) one graphic.
 * Resolves `{ ok: true, graphic: { title, html, fields, durationSec, startSec } }`
 * or `{ ok: false, reason, errors? }`. Never throws for expected failures.
 */
export async function generateGraphic({
  request,
  style,
  canvas = { width: 1920, height: 1080 },
  fps = 30,
  existing = null,
  others = [],
  usedDirections = [],
  lengthSec = null,
  random = Math.random,
  model = GRAPHICS_MODEL,
  signal = null,
  binary = resolveClaudeBinary(),
  runOnce = runClaudeOnce,
  connectionCheck,
  debugDir = null,
  onProgress = () => {},
} = {}) {
  const text = typeof request === 'string' ? request.trim() : '';
  if (!text) return { ok: false, reason: 'Describe the graphic you want first.' };
  const direction = existing ? null : pickDesignDirection({ used: usedDirections, random });
  const wantedLength = Number(lengthSec) > 0 ? Math.min(60, Math.max(1, Number(lengthSec))) : null;
  const otherSummaries = (Array.isArray(others) ? others : []).filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim().slice(0, 160));
  const result = await askClaudeForJson({
    systemPrompt: buildGraphicsSystemPrompt({ width: canvas.width, height: canvas.height, fps, style }),
    schema: GRAPHIC_JSON_SCHEMA,
    buildPrompt: (validationErrors) => buildGraphicsUserPrompt({ request: text, existing, validationErrors, direction, others: otherSummaries, lengthSec: wantedLength }),
    validate: (value) => {
      const checked = validateGraphicSpec(value);
      return checked.ok ? { ok: true, value: checked.graphic } : checked;
    },
    model,
    signal,
    binary,
    runOnce,
    connectionCheck,
    label: existing ? 'graphic-change' : 'graphic',
    debugDir,
    onProgress,
  });
  if (!result.ok) {
    return result.errors
      ? { ok: false, reason: 'Claude\'s graphic did not pass the safety and format checks.', errors: result.errors }
      : result;
  }
  const startSec = Number(result.raw?.startSec);
  // The user's chosen length wins over whatever Claude wrote.
  return { ok: true, graphic: { ...result.value, durationSec: wantedLength ?? result.value.durationSec, startSec: Number.isFinite(startSec) && startSec >= 0 ? startSec : null, direction: direction?.id ?? null } };
}
