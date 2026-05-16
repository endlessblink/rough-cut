# Project Agent Notes

## Design tasks — HARD RULE

Any task that touches UI, CSS, or visual design in this repo MUST be done with a design skill loaded. Acceptable skills (in rough order of preference for this project): `impeccable`, `emil-design-eng`, `frontend-design`, `ui-ux-pro-max`. For motion or animation: pair the brand-specific motion skill (`motion-vercel` / `motion-linear` / `motion-stripe` etc.) with `motion-principles`.

If the task is "fix this layout / page / sidebar / panel" or anything similar, do not just edit CSS by hand. Load a skill first and use its review/critique/polish workflow to inform the change. Read `PRODUCT.md` and `DESIGN.md` first so the skill has project context.

After any UI/CSS change, open the smoke screenshot (`/tmp/rough-cut-ui-smoke-*/ui-smoke.png` and `ui-smoke-timeline.png`) before claiming work done. Typecheck + tests + smoke-pass only assert selectors exist, not that the layout is correct.

This rule exists because shipping CSS changes without a design pass produced visible regressions (commit `a8443f2`, reverted in `00e0afe`).

---

- Cursor overlays must use the `reliable-cursor-overlay` skill before implementation.
- Keep screen recordings cursor-free at capture time (`x11grab -draw_mouse 0`) and render cursor presentation from telemetry.
- Do not crop styled exports until zoom/viewport transforms are modeled and applied consistently to both video and cursor.
- For cursor work, verify with a fresh real recording plus automated smoke coverage; old recordings may not contain telemetry.
- For visual flicker/regression work, do not rely on sparse screenshots or a few delayed pixel samples. Use Playwright to run an in-page `requestAnimationFrame` monitor that samples the preview canvas every rendered frame during the interaction and for a post-release window; fail on any gray/blank frame and save screenshots only as artifacts.
- After every completed task, tell the user whether they can test it now. If yes, list the exact commands and/or manual checks. If no, explain what blocks testing and what still needs to happen.
