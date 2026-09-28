# Rough Cut Design Rules

Rough Cut should feel like a focused screen-recording editor inspired by Screen Studio and Recordly: dark, compact, precise, and quiet. Prefer professional controls over decorative UI.

## Visual Direction

- Use dark surfaces, subtle borders, and restrained blue accents.
- Avoid glossy, oversized, or game-like controls.
- Avoid placeholder controls. If a control is visible, it should do something.
- Keep editor panels dense and scannable. No hero cards or paragraph-heavy helper text inside tool panels.
- Studio layout (approved 2026-09-28): one slim top bar (project, page tabs, Record, Export); the preview is the hero; the settings panel and a labelled six-tab tool strip (Background, Frame, Camera, Cursor, Zoom, Censor) sit on the right; the timeline spans the full width; export is a pop-over from the top bar. Rarely used controls go under a "More …" disclosure, never deleted.

## Tokens

Global tokens live in `apps/desktop/src/renderer/src/styles.css` under `:root`.

- `--accent`, `--accent-hover`: primary action and selected-state blue.
- `--bg`, `--chrome`, `--surface`, `--panel`, `--panel-alt`: dark surface ladder.
- `--line`, `--strong-line`: dividers and panel borders.
- `--text`, `--muted`, `--subtle`: text hierarchy.
- `--control-range-*`: custom slider sizing and paint tokens.

- `--text-2xs` … `--text-3xl`: the only font sizes (10 / 11 / 12 / 13 / 15 / 20 / 24 / 28px). Pick by role: tags and key hints, labels and metadata, panel controls, primary UI text, section titles, pane titles, page titles, hero headings.
- `--weight-regular|medium|semibold|bold`: the only font weights (400 / 500 / 600 / 700).
- `--tracking-ui`, `--tracking-caps`: letter spacing; `caps` is for uppercase labels only.
- `--space-0-5` … `--space-16`: the only padding, margin and gap lengths (2px steps up to 12px, then 16 / 20 / 24 / 32 / 48 / 64px).
- `--radius-sm|md|lg|pill`: the only corner radii (4 / 8 / 12 / 999px).

When introducing a repeated visual value, add a token before adding more one-off colors or dimensions. `design-tokens.test.mjs` fails on raw font sizes, weights, radii, or rem spacing outside `:root`.

## Sliders

- Sliders must use the custom `.rangeControl` structure, not visible browser-default range styling.
- Native `input[type="range"]` remains present for keyboard, pointer, and accessibility behavior, but it is transparent.
- Visible slider parts are `.rangeVisual`, `.rangeFill`, and `.rangeThumb`.
- In the settings panel, sliders are full-width bars: the name and value sit inside the row, the fill shows the value, a thin glowing line marks the handle. Outside the panel, keep the compact track.
- Do not use value pills unless the surrounding control language changes everywhere.
- Smoke coverage must assert the custom range skin exists so native sliders do not regress back into the UI.

## Timeline And Inspector

- Timeline controls should be compact and editor-like.
- Inspector sections should remain stable. Prefer disabled controls over controls appearing/disappearing and shifting layout.
- Zoom controls should preserve preview/export parity and keep manual edits directly manipulable on the timeline.
