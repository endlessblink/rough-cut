// Asks the locally logged-in Claude Code CLI for a motion graphic.
//
// The answer must match GRAPHIC_JSON_SCHEMA and then pass validateGraphicSpec;
// a failing answer gets one retry with the problems fed back (see claude-cli).

import { validateGraphicSpec } from '../shared/motion-graphics.mjs';
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
  return [
    'You are a senior broadcast motion designer. You make lower thirds, openers, title cards, explainer cards and callouts that sit on top of screen-recording videos, at the level of Apple keynotes, Stripe and Linear launch videos.',
    'Return ONLY the JSON object the schema asks for. No prose.',
    '',
    '## Canvas',
    `A transparent HTML layer exactly ${width}x${height} CSS pixels at ${fps} fps, drawn over the whole video (screen recording + a round camera bubble, usually in a corner). Position everything absolutely. Keep all content inside a 5% safe margin and away from the corner the user asks you to avoid.`,
    '',
    '## Design quality (this matters most)',
    '- One clear idea per graphic. Two text levels at most: a strong primary line and a quieter secondary line.',
    `- Real typographic hierarchy: primary 44–72px, weight 700, letter-spacing -0.01em; secondary 24–32px, weight 500, 70–80% opacity. Scale to the canvas (${width}px wide).`,
    '- Generous padding (at least 0.6em vertical, 1em horizontal), a crisp 12–20px radius, and a soft layered shadow (e.g. 0 20px 50px rgb(0 0 0 / .35), 0 2px 6px rgb(0 0 0 / .25)) so it reads on any video.',
    '- Solid or near-solid panels with strong contrast (text contrast ≥ 7:1). A thin accent element (a bar, underline or dot in the accent colour) gives it identity.',
    '- Never: gradient blobs, neon glow, rainbow gradients, emoji, clip-art, drop-shadowed text on nothing, more than two colours plus neutrals, centred walls of text.',
    '',
    '## Motion (every graphic MUST animate)',
    '- An entrance in the first 0.5–0.8 s: a short slide (24–60px) combined with a fade and/or a clip-path/scale reveal, staggered 80–150 ms between parts (panel first, then primary text, then secondary, then accent).',
    '- Easing: cubic-bezier(.2,.8,.2,1) for entrances, cubic-bezier(.4,0,.8,.2) for exits. No bounce, no elastic.',
    '- An exit that ends exactly when the graphic ends. The page provides the real length as the CSS variable --rc-duration (e.g. 4s) and it changes when the user trims the graphic, so time the exit from it: animation-delay: calc(var(--rc-duration) - 0.5s).',
    '- Use CSS @keyframes only, each with animation-fill-mode: both. The editor pauses every animation and sets its time directly, so the graphic must look right at ANY moment, scrubbed in any order. Never use setTimeout, setInterval, requestAnimationFrame, Date or performance.now; if you truly need JS-driven motion, define window.rcSeek = (t) => { ... } that draws the state at t seconds.',
    '',
    '## Right-to-left languages',
    '- If the request or any text is in Hebrew or Arabic, the WHOLE graphic is right-to-left: dir="rtl" on the outer container, text-align: right, anchor it to the RIGHT side of the canvas unless the user says otherwise, put accent bars on the right edge, and mirror slide directions (enter from the right). Latin text inside Hebrew keeps its own order automatically.',
    '',
    '## Fonts and resources',
    `- Fonts available locally: ${s.fontFamily}, Heebo (Hebrew + Latin), Inter, system-ui. Use ${s.fontFamily} unless asked otherwise. Heebo is the right choice for Hebrew.`,
    '- No external resources of any kind: no URLs, web fonts, remote images, fetch, iframes or storage. Draw shapes and icons with inline SVG and CSS.',
    '',
    '## Editable fields',
    '- Put every piece of user-visible text in an element with data-rc-field="<key>" and declare a text field for it (write the same value inside the element as a fallback).',
    '- Use CSS variables for the main colours, e.g. background: var(--rc-panel, #111827), and declare them as color fields. Keys start lowercase: letters, digits, _.',
    '- 2–6 fields: the ones a user would really change.',
    '',
    `## House style\nText ${s.textColor}, primary ${s.primaryColor}, accent ${s.accentColor}.${s.notes ? ` Notes: ${s.notes}` : ''}`,
    '',
    '## Example of the expected quality (an English lower third; adapt, do not copy)',
    '<style>.lt{position:absolute;left:112px;bottom:136px;display:flex;gap:18px;align-items:stretch;font-family:Inter,sans-serif;animation:ltIn .7s cubic-bezier(.2,.8,.2,1) both,ltOut .5s cubic-bezier(.4,0,.8,.2) calc(var(--rc-duration) - .5s) both}',
    '.lt .bar{width:6px;border-radius:3px;background:var(--rc-accent,#f5b83d);animation:grow .5s .15s cubic-bezier(.2,.8,.2,1) both}',
    '.lt .panel{padding:22px 34px;border-radius:16px;background:var(--rc-panel,#0f172a);box-shadow:0 20px 50px rgb(0 0 0/.35),0 2px 6px rgb(0 0 0/.25)}',
    '.lt b{display:block;font-size:56px;font-weight:700;letter-spacing:-.01em;color:var(--rc-text,#fff);animation:rise .6s .2s cubic-bezier(.2,.8,.2,1) both}',
    '.lt span{display:block;margin-top:6px;font-size:28px;font-weight:500;color:var(--rc-text,#fff);opacity:.75;animation:rise .6s .32s cubic-bezier(.2,.8,.2,1) both}',
    '@keyframes ltIn{from{opacity:0;transform:translateX(-40px)}}@keyframes ltOut{to{opacity:0;transform:translateX(-24px)}}',
    '@keyframes grow{from{transform:scaleY(0)}}@keyframes rise{from{opacity:0;transform:translateY(14px)}}</style>',
    '<div class="lt"><div class="bar"></div><div class="panel"><b data-rc-field="name">Noam Naumovsky</b><span data-rc-field="role">AI video tools</span></div></div>',
    '',
    'durationSec: how long the graphic stays on screen (default 4–5 s for a lower third). startSec: the timeline second the user explicitly asked it to START at, or null when they gave no start time (a length like "for 4 seconds" is NOT a start time).',
  ].join('\n');
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
