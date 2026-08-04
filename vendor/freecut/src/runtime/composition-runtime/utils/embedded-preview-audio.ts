/**
 * Whether this editor's own preview sound must stay silent.
 *
 * Embedded in Rough Cut, the host composites this exact timeline itself and
 * plays its sound — screen and camera together, from the same project state.
 * Anything this editor plays is therefore the same material a second time, a
 * few frames apart, which is heard as an echo rather than as louder audio.
 *
 * Muting the media element (rather than only pulling a gain node down) is what
 * makes this reliable: an element feeding a Web Audio graph is silenced at the
 * source, so no path through the mixer can leak it back out.
 *
 * Standalone FreeCut is unaffected — there is no parent window there, and its
 * preview keeps its own sound.
 */
export function shouldSilenceEmbeddedPreviewAudio(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}
