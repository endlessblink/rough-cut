# Project Agent Notes

## Runtime testing truth — read first

Do not tell the user to test an artifact until its identity is proven. For Rough Cut,
the only testable version is the freshly packaged artifact whose build completed after
the latest source change and whose dock launch produced a newer provenance timestamp
and runtime report. If the dock shows the old UI, stop: rebuild and refresh the dock
entry, then verify artifact path, bundle signature, launch timestamp, and report
timestamp before asking for any visual check. Never use a stale report or an unverified
dock launch as evidence.

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
- Electron runtime tests may fail inside Codex managed sandbox with `sandbox_host_linux.cc(41)` / `NoNewPrivs: 1` / `Seccomp: 2`. Prefer the constrained persistent host bridge for readiness gates: ask the user to run `scripts/host-readiness-runner.sh` once in a normal host terminal and leave it open, then trigger named gates from Codex with `printf '%s\n' smoke-package > /tmp/rough-cut-host-readiness-runner.request` and inspect `/tmp/rough-cut-host-readiness-runner.status.json` plus `/tmp/rough-cut-host-readiness-runner.log`. Allowed gates are `smoke-ui`, `playback-timeline`, `nle-linked`, `nle-export-parity`, `smoke-styled-export`, `smoke-package`, `canvas2d-fallback`, and `full-readiness`. TASK-246's older `scripts/task246-host-runner.sh` is still available for that one runtime export smoke. Only if the agent must own Electron directly, launch a fresh Codex session through `scripts/launch-codex-electron-test.sh` or the `codex-electron-test` shell alias; the profile is `~/.codex/electron-test.config.toml`.
- After every completed task, tell the user whether they can test it now. If yes, list the exact commands and/or manual checks. If no, explain what blocks testing and what still needs to happen.

## Visual proof — FAIL-CLOSED HARD RULE

Any change to the Rough Cut renderer or the vendored FreeCut editor is incomplete until the exact packaged, dock-launched app has been visually reviewed after the final source change. The review must use a fresh screenshot and the complete checklist: `dock=pass shell=pass layout=pass media=pass playback=pass effects=pass timeline=pass no-blank=pass no-overlap=pass scope=pass`.

The required sequence is `pnpm package:linux`, launch the packaged app from the dock, capture the live editor state, have a disposable visual reviewer inspect that screenshot, then run `pnpm visual-proof:record -- <screenshot-path> "<checklist findings>"` followed by `pnpm visual-proof:verify`. Before the final completion claim, run `pnpm visual-proof:arm`; this arms the Stop hook for the final review without blocking ordinary progress messages. Run `pnpm visual-proof:disarm` when continuing implementation. Do not claim completion when the verifier blocks, when any checklist item is missing, when the screenshot is stale, or when the packaged app does not match the reviewed source.

The Stop hook is part of the project contract and must remain installed with `pnpm visual-proof:install`; tests and selector smoke do not replace the headed dock screenshot. A failed visual review is evidence of an unfinished task, not a reason to weaken or bypass the gate.

## Real visual verification — NON-NEGOTIABLE

Before reporting any renderer, timeline, compositor, or FreeCut change as working, run an end-to-end visual check against the exact freshly packaged app and a real project with real media. The check must capture the actual Editor surface, not only a synthetic smoke fixture, and an independent visual reviewer must inspect the screenshot for the complete Editor layout, viewer bounds, media, playback state, effects, timeline, overlap, and cross-view identity. Synthetic smoke, typecheck, tests, DOM payloads, logs, and extracted frames are supporting evidence only; none can substitute for the real screenshot. If the real packaged app cannot be launched or the screenshot cannot be reviewed, the task remains unverified and must not be handed back to the user as working.

The end-to-end check must fail closed on stale package identity, missing real-project media, missing FreeCut readiness, viewer geometry extending outside the viewer, hidden Editor chrome, blank/overlapping UI, or a screenshot that is not newer than the final source and package. The agent owns this verification; do not hand the user a launch instruction as a substitute for doing it.
