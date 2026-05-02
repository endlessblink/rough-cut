# Project Agent Notes

- Cursor overlays must use the `reliable-cursor-overlay` skill before implementation.
- Keep screen recordings cursor-free at capture time (`x11grab -draw_mouse 0`) and render cursor presentation from telemetry.
- Do not crop styled exports until zoom/viewport transforms are modeled and applied consistently to both video and cursor.
- For cursor work, verify with a fresh real recording plus automated smoke coverage; old recordings may not contain telemetry.
