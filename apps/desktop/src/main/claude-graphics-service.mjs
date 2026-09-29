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
    '- Per-word or per-character kinetic type: a small <script> may split the text of data-rc-field elements into <span>s (set style --i for the index and use animation-delay: calc(var(--i) * 28ms + 0.2s)). The editor rewrites field text when the user edits it and then fires document event "rc:fields", so run the split on load AND on document.addEventListener("rc:fields", split). Keep each word unbroken for Hebrew (split by word, not by character, for right-to-left text).',
    '',
    '## Composition',
    '- Two focal points; lead the eye. Anchor to an edge rather than floating in the middle (unless it is a centred opener the style calls for).',
    '- Structural elements (rules, bars, frames, shapes) must each have a job: revealing, underlining, framing or pointing at something.',
    '- Contrast: text must stay readable over any video (≥ 7:1 against its own panel, or a solid/near-solid plate behind it).',
    '',
    '## Never',
    ...DESIGN_BANS.map((ban) => `- ${ban}`),
    '',
    '## Right-to-left languages (Hebrew, Arabic)',
    '- The WHOLE layout flows right-to-left: dir="rtl" on the outer container, anchor to the RIGHT side unless the user says otherwise, start-aligned text (right), accent bars on the right edge, entrances from the right.',
    '- Mirror only things whose meaning is a direction: arrows, chevrons, progress fills, slide directions. NEVER mirror or flip (scaleX(-1)) glyphs and icons that are not directional: question marks, exclamation marks, check marks, digits, letters, logos, play buttons, clocks.',
    '- Latin words and numbers inside Hebrew keep their own order automatically; do not reverse them.',
    '',
    '## Fonts and resources',
    '- Installed locally and safe to use: Heebo (100–900, Hebrew+Latin), Rubik (Hebrew+Latin), Alef (Hebrew+Latin), Noto Sans Hebrew, Inter, Inter Display, Helvetica Neue, Roboto, Roboto Condensed, Open Sans, Ubuntu, Orbitron, Pacifico, JetBrainsMono Nerd Font. Nothing else will render.',
    '- No external resources: no URLs, web fonts, remote images, fetch, iframes or storage. Draw shapes, icons and illustrations with inline SVG and CSS.',
    '',
    '## Editable fields',
    '- Every piece of user-visible text lives in an element with data-rc-field="<key>" and has a text field (write the same value inside the element as a fallback).',
    '- Main colours are CSS variables, e.g. background: var(--rc-panel, #111827), declared as color fields. Keys start lowercase: letters, digits, _. Give 2–6 fields, labelled in the user\'s language.',
    '',
    'durationSec: how long the graphic stays on screen (4–6 s for a lower third, 3–5 s for a title card, longer for explainers). startSec: the timeline second the user explicitly asked it to START at, or null when they gave no start time (a length like "for 4 seconds" is NOT a start time).',
  ].filter((line) => line !== '').join('\n');
}

export function buildGraphicsUserPrompt({ request, existing = null, validationErrors = [] }) {
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
  model = GRAPHICS_MODEL,
  signal = null,
  binary = resolveClaudeBinary(),
  runOnce = runClaudeOnce,
  debugDir = null,
} = {}) {
  const text = typeof request === 'string' ? request.trim() : '';
  if (!text) return { ok: false, reason: 'Describe the graphic you want first.' };
  const result = await askClaudeForJson({
    systemPrompt: buildGraphicsSystemPrompt({ width: canvas.width, height: canvas.height, fps, style }),
    schema: GRAPHIC_JSON_SCHEMA,
    buildPrompt: (validationErrors) => buildGraphicsUserPrompt({ request: text, existing, validationErrors }),
    validate: (value) => {
      const checked = validateGraphicSpec(value);
      return checked.ok ? { ok: true, value: checked.graphic } : checked;
    },
    model,
    signal,
    binary,
    runOnce,
    label: existing ? 'graphic-change' : 'graphic',
    debugDir,
  });
  if (!result.ok) {
    return result.errors
      ? { ok: false, reason: 'Claude\'s graphic did not pass the safety and format checks.', errors: result.errors }
      : result;
  }
  const startSec = Number(result.raw?.startSec);
  return { ok: true, graphic: { ...result.value, startSec: Number.isFinite(startSec) && startSec >= 0 ? startSec : null } };
}
