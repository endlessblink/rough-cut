// P-AI-C/TASK-170 — hard-coded template stubs for the "From template" modal.
// These are placeholders. TASK-146 will replace them with data-driven entries
// that include auto-fire pipelines (transcribe, caption, etc.). For now each
// stub maps to a name + aspect ratio; selecting one creates a blank project
// with the chosen aspect ratio via LIBRARY_CREATE_BLANK_PROJECT.

export const TEMPLATE_STUBS = Object.freeze([
  Object.freeze({
    id: 'short-form-vlog',
    label: 'Short-form vlog',
    aspectRatio: '9:16',
    description: 'Vertical — 9:16. Reels, TikTok, Shorts.',
  }),
  Object.freeze({
    id: 'tutorial',
    label: 'Tutorial',
    aspectRatio: '16:9',
    description: 'Widescreen — 16:9. Long-form walkthroughs.',
  }),
  Object.freeze({
    id: 'podcast-clip',
    label: 'Podcast clip',
    aspectRatio: '1:1',
    description: 'Square — 1:1. Social feeds and embeds.',
  }),
]);

export function findTemplateStub(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return TEMPLATE_STUBS.find((t) => t.id === id) ?? null;
}
