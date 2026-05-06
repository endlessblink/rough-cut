# Rough Cut Design Rules

Rough Cut should feel like a focused screen-recording editor inspired by Screen Studio and Recordly: dark, compact, precise, and quiet. Prefer professional controls over decorative UI.

## Visual Direction

- Use dark surfaces, subtle borders, and restrained blue accents.
- Avoid glossy, oversized, or game-like controls.
- Avoid placeholder controls. If a control is visible, it should do something.
- Keep editor panels dense and scannable. No hero cards or paragraph-heavy helper text inside tool panels.
- Right sidebar is export-focused. Left sidebar owns setup, background, timeline, inspector, and presentation controls.

## Tokens

Global tokens live in `apps/desktop/src/renderer/src/styles.css` under `:root`.

- `--accent`, `--accent-hover`: primary action and selected-state blue.
- `--bg`, `--chrome`, `--surface`, `--panel`, `--panel-alt`: dark surface ladder.
- `--line`, `--strong-line`: dividers and panel borders.
- `--text`, `--muted`, `--subtle`: text hierarchy.
- `--control-range-*`: custom slider sizing and paint tokens.

When introducing a repeated visual value, add a token before adding more one-off colors or dimensions.

## Sliders

- Sliders must use the custom `.rangeControl` structure, not visible browser-default range styling.
- Native `input[type="range"]` remains present for keyboard, pointer, and accessibility behavior, but it is transparent.
- Visible slider parts are `.rangeVisual`, `.rangeFill`, and `.rangeThumb`.
- Keep sliders compact: thin recessed track, subtle blue fill, neutral thumb.
- Do not use value pills unless the surrounding control language changes everywhere.
- Smoke coverage must assert the custom range skin exists so native sliders do not regress back into the UI.

## Timeline And Inspector

- Timeline controls should be compact and editor-like.
- Inspector sections should remain stable. Prefer disabled controls over controls appearing/disappearing and shifting layout.
- Zoom controls should preserve preview/export parity and keep manual edits directly manipulable on the timeline.
