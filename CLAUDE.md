# Project Claude Notes

## Design tasks — HARD RULE

Any task that touches UI, CSS, or visual design in this repo MUST be done with a design skill loaded. Acceptable skills (in rough order of preference for this project): `impeccable`, `emil-design-eng`, `frontend-design`, `ui-ux-pro-max`. For motion or animation: pair the brand-specific motion skill (`motion-vercel` / `motion-linear` / `motion-stripe` etc.) with `motion-principles`.

If the task is "fix this layout / page / sidebar / panel" or anything similar, do not just edit CSS by hand. Load a skill first and use its review/critique/polish workflow to inform the change. Read `PRODUCT.md` and `DESIGN.md` first so the skill has project context.

After any UI/CSS change, **open the smoke screenshot** (`/tmp/rough-cut-ui-smoke-*/ui-smoke.png` and `ui-smoke-timeline.png`) before claiming work done. Typecheck + tests + smoke-pass only assert selectors exist, not that the layout is correct.

This rule exists because shipping CSS changes without a design pass produced visible regressions (commit `a8443f2`, reverted in `00e0afe`).

---

- Use the global `reliable-cursor-overlay` skill for cursor telemetry, preview overlays, and styled export cursor rendering.
- Cursor coordinates are source-recording coordinates. Any scale, fit, crop, or zoom must transform video and cursor together.
- Avoid FFmpeg chains with one overlay per telemetry sample; prefer a transparent cursor layer overlaid once.
- Keep styled export full-screen fit until explicit zoom/viewport logic exists.

## Recording setup requirements (Linux/X11 + NVIDIA)

- **Disable "Allow Flipping"** in `nvidia-settings` → OpenGL Settings. With it enabled, the NVIDIA driver uses page-flipping for vsync; x11grab occasionally reads the framebuffer mid-flip and captures torn frames into the recording. Disabling eliminates this. Persists across reboots. Confirmed on this user's hardware on 2026-05-04.
- Cursor sampling uses xdotool synchronous polling at 33 ms (`apps/desktop/src/main/recording/recording-session.mjs`). Do not replace with async motion-event streams — they have intrinsic IPC latency that causes visible cursor lag in playback. Regression-guarded by tests in `recording-session.test.mjs`.
- Cursor frame numbers are anchored to `recording-start`, not to ffmpeg's first-frame wall-clock. Do not re-anchor in `stop()` — that approach was tried and reverted (clamping pre-ffmpeg events to frame 0 broke the cursor overlay). Regression-guarded.
- The xinput button listener (`xinput-button-listener.mjs`) provides click/drag events for auto-zoom. Cursor *position* sampling stays on xdotool; only buttons come from xinput.

## App view architecture (HARD RULE — read before touching `app-views.ts`, `main.tsx`, or the recorder)

- **The main editor window has exactly two views: `Projects` and `Recording edit`.** Both are registered in `apps/desktop/src/renderer/src/app-views.ts` (`APP_VIEWS`). The bottom view-tab strip (`AppViewTabStrip` in `main.tsx`) switches between them.
- **Recording is a STANDALONE Electron BrowserWindow.** It is not a view in `APP_VIEWS` and must never be added as one. The window is created in `apps/desktop/src/main/index.mjs` and rendered by the `mode=recorder` branch in `apps/desktop/src/renderer/src/main.tsx:794` (`<main className="recordingLauncherShell">`). It is opened by the top-right **Record** button in the editor topBar.
- If a future need arises to surface recording state in the main window (e.g. "recording in progress" status), do it as a banner or status indicator, NOT by adding a `recording` view to the strip.
- **Camera live preview is on only when the recorder window is active or on first startup** — the main editor window must not keep camera preview running. If you see the camera light on while in Projects or Recording edit view, that is a bug.
- The `editor` view's user-facing label is `"Recording edit"`. The internal id stays `editor` for wiring (`activeAppView === 'editor'`, `setActiveAppView('editor')` on project open).

## Scrollbars (HARD RULE)

- **Never the platform default scrollbar — anywhere in the app.** A global rule in `apps/desktop/src/renderer/src/styles.css` (right after the `html, body, #root` reset) applies the thin dark scrollbar (`*::-webkit-scrollbar*` + `scrollbar-color`/`scrollbar-width` on `html`) to every scrollable surface.
- The rule is **token-driven**. Tokens in `:root`:
  - `--scrollbar-size` (width/height)
  - `--scrollbar-track`, `--scrollbar-track-border`
  - `--scrollbar-thumb`, `--scrollbar-thumb-hover`
  - `--scrollbar-thumb-border-width`, `--scrollbar-thumb-radius`
- New scrollable surfaces (`overflow: auto`/`scroll`) automatically inherit the look — no per-element scrollbar styling needed.
- Per-component overrides are allowed only when a specific pane needs a different size (e.g. a thicker timeline scrubber). Override the tokens locally via `--scrollbar-*` on the component selector; do not hand-roll a new `::-webkit-scrollbar` block.
