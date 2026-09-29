/**
 * Design direction for Claude-made graphics: a named visual style and a
 * creativity level (1 calm … 5 wild). Both become part of Claude's brief.
 *
 * Distilled from the design skills this project leans on: the HyperFrames
 * visual-style library (styles named after the designers they come from),
 * its motion principles, the "motion graphics, not slideshow" checklist and
 * the anti-slop rules of design-taste / impeccable.
 *
 * Fonts are limited to what is installed locally (graphics cannot load web
 * fonts); every style names a Hebrew-capable pairing.
 */

export const DEFAULT_GRAPHICS_STYLE_ID = 'studio';
export const DEFAULT_CREATIVITY = 3;

export const GRAPHIC_STYLES = Object.freeze([
  {
    id: 'studio',
    swatch: ['#0f172a', '#f8fafc', '#f5b83d'],
    label: 'Studio',
    mood: 'Clean broadcast',
    brief: 'Premium broadcast lower-thirds and title cards (Apple keynote, Stripe launch films). Solid confident panels, crisp radius, layered soft shadow, one accent element with a job. Precise, expensive, never generic.',
    fonts: 'Latin: Inter Display (700–800) for headlines, Inter for secondary. Hebrew: Heebo 800 headlines, Heebo 500 secondary.',
    motion: 'Confident expo-out entrances with 80–150 ms staggers, power-in exits.',
  },
  {
    id: 'swiss',
    swatch: ['#1a1a1a', '#ffffff', '#0066ff'],
    label: 'Swiss Pulse',
    mood: 'Clinical, precise — Müller-Brockmann',
    brief: 'Grid-locked. Everything snaps to an invisible grid, hairline rules, registration marks, oversized numbers when there is a number. Near-black #1a1a1a / white with ONE electric-blue accent (#0066FF). Zero decoration that has no job.',
    fonts: 'Latin: Helvetica Neue 700 headlines, Inter for labels. Hebrew: Heebo 700 / Heebo 400.',
    motion: 'Fast (0.3–0.4 s) expo-out arrivals, hard stops, lines drawing in with scaleX from 0, counters counting up. Nothing floats.',
  },
  {
    id: 'velvet',
    swatch: ['#0b0b10', '#e9e4d8', '#1a237e'],
    label: 'Velvet',
    mood: 'Premium, timeless — Vignelli',
    brief: 'Generous negative space, architectural symmetry, thin type in ALL CAPS with wide tracking (0.15em) for Latin, hairline rules, subtle grain. Near-black with deep navy (#1a237e) or champagne accent. Luxury takes its time.',
    fonts: 'Latin: Inter Display 300 uppercase with 0.15em tracking. Hebrew: Heebo 300/200 (no caps in Hebrew — use weight and spacing instead).',
    motion: 'Slow sine-in-out glides (0.9–1.4 s), sequential reveals, long holds. Nothing snaps.',
  },
  {
    id: 'deconstructed',
    swatch: ['#1a1a1a', '#f0f0f0', '#d4501e'],
    label: 'Deconstructed',
    mood: 'Industrial, raw — Neville Brody',
    brief: 'Type at angles, overlapping edges, escaping its own box. Heavy industrial weight, scan lines, glitch slices (clip-path), grain. Charcoal #1a1a1a, off-white #f0f0f0, burnt-orange accent #D4501E. Intentional irregularity — nothing polished.',
    fonts: 'Latin: Roboto Condensed 700 uppercase + JetBrainsMono Nerd Font labels. Hebrew: Heebo 900 + Rubik.',
    motion: 'Text SLAMS in (overshoot), stepped/glitch exits (steps()), letters shuffle then snap. Short and punchy.',
  },
  {
    id: 'maximal',
    swatch: ['#0a0a0a', '#ffd60a', '#e63946'],
    label: 'Maximal Type',
    mood: 'Loud, kinetic — Paula Scher',
    brief: 'Text IS the visual. Overlapping type layers at different scales and angles filling 50–80% of the frame, bold saturated red #E63946 and yellow #FFD60A on near-black, maximum contrast. Still legible.',
    fonts: 'Latin: Roboto Condensed 700/900 huge, Inter Display. Hebrew: Heebo 900 huge + Rubik.',
    motion: 'Everything kinetic: slamming, sliding, scaling, per-character staggers, fast arrivals and hard stops. No static moment.',
  },
  {
    id: 'drift',
    swatch: ['#070b1f', '#9ad7ff', '#8b5cf6'],
    label: 'Data Drift',
    mood: 'Futuristic, immersive — Refik Anadol',
    brief: 'Deep space-blue/black with luminous data: flowing SVG line fields, point clouds, soft iridescent gradients kept subtle, thin monospaced readouts. Feels computed, alive, precise.',
    fonts: 'Latin: Inter Display 600 + JetBrainsMono Nerd Font readouts; Orbitron only for tiny tech labels. Hebrew: Heebo 600 + Heebo 300.',
    motion: 'Continuous slow drift and morph (never settled), stroke-dash line drawing, values ticking, soft blur-to-sharp reveals.',
  },
  {
    id: 'soft',
    swatch: ['#f6ece6', '#5b4a44', '#e8a598'],
    label: 'Soft Signal',
    mood: 'Intimate, warm — Sagmeister',
    brief: 'Humanist, personal, lowercase where the language allows. Warm off-white or blush panels, organic rounded shapes, gentle hand-drawn-feeling SVG strokes. Close, delicate, never corporate.',
    fonts: 'Latin: Pacifico for one accent word only, Open Sans/Ubuntu for text. Hebrew: Alef or Rubik 400–500.',
    motion: 'Slow floats and drifts (sine-in-out), soft scale-ins, strokes drawing themselves. Never snaps.',
  },
  {
    id: 'noir',
    swatch: ['#0b0b0b', '#e5e5e5', '#b3121f'],
    label: 'Shadow Cut',
    mood: 'Dark, cinematic — Hans Hillmann',
    brief: 'Near-monochrome: deep blacks, cold greys, stark white and ONE blood-red accent. Sharp angular film-noir title cards, heavy contrast, elements emerging from darkness through masks and light sweeps.',
    fonts: 'Latin: Roboto Condensed 700 uppercase, wide-tracked labels. Hebrew: Heebo 800 + Heebo 300.',
    motion: 'Slow creeping push-ins, reveals through clip-path/mask light sweeps, a held beat before the hit.',
  },
  {
    id: 'folk',
    swatch: ['#2b1a5a', '#ffb627', '#e2217a'],
    label: 'Folk Frequency',
    mood: 'Cultural, vivid — Eduardo Terrazas',
    brief: 'Vivid festive colour (magenta, saffron, turquoise, leaf green on warm cream or deep indigo), bold geometric patterns — concentric shapes, stripes, radial motifs — built in SVG. Joyful but designed.',
    fonts: 'Latin: Rubik 700/900 + Ubuntu. Hebrew: Rubik 700/900.',
    motion: 'Rhythmic pops and rotations, patterns spinning in, playful overshoot on entrances only.',
  },
]);

export const CREATIVITY_LEVELS = Object.freeze([
  {
    level: 1,
    label: 'Calm',
    brief: 'Restrained and quiet. One panel or pure typography, one clean entrance and exit, no decorative layer. Legibility first.',
  },
  {
    level: 2,
    label: 'Refined',
    brief: 'Two layers: content plus one purposeful accent element (rule, bar, shape) that animates. Staggered reveals in order of importance.',
  },
  {
    level: 3,
    label: 'Designed',
    brief: 'Three layers minimum: a background treatment inside the graphic (tinted panel, oversized faded word or number, pattern, glow kept subtle), the content, and accents. Asymmetric composition anchored to an edge, per-word reveals, varied eases, and ONE ambient motion during the hold so it never looks frozen.',
  },
  {
    level: 4,
    label: 'Bold',
    brief: 'Make it a moment. Kinetic typography (per-word or per-character), bigger scale (a title can fill 50–70% of the width), two focal points, SVG shapes or a small illustration that MOVES across the frame, mask/clip-path wipes, at least four different eases, and continuous motion through the hold.',
  },
  {
    level: 5,
    label: 'Wild',
    brief: 'Break the grid. Oversized overlapping type, angles, multiple actors entering, crossing and exiting, texture (SVG grain/turbulence), unexpected colour within the style. Pause any frame and it should look mid-motion, never a settled poster. Still readable, still on-message.',
  },
]);

export function resolveGraphicStyle(id) {
  return GRAPHIC_STYLES.find((style) => style.id === id) ?? GRAPHIC_STYLES[0];
}

export function normalizeCreativity(value) {
  const level = Math.round(Number(value));
  return Number.isFinite(level) ? Math.min(5, Math.max(1, level)) : DEFAULT_CREATIVITY;
}

export function resolveCreativity(value) {
  return CREATIVITY_LEVELS[normalizeCreativity(value) - 1];
}

/** Anti-slop rules that hold at every level (design-taste / impeccable). */
export const DESIGN_BANS = Object.freeze([
  'Generic "AI" look: purple-to-blue gradients, neon outer glows, gradient text, glassmorphism for its own sake.',
  'Pure #000 or #fff — tint neutrals toward the palette.',
  'Everything centred with equal weight; a lone text block floating in empty space.',
  'The same ease, speed and direction on every element (vary them like font weights).',
  'Emoji, clip-art, stock-icon look, drop shadows on bare text.',
  'Filler copy. Use the user\'s words; never invent claims.',
]);
