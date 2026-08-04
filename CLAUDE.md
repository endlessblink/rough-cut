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

## Real visual verification — NON-NEGOTIABLE

Before reporting any renderer, timeline, compositor, or FreeCut change as working, run an end-to-end visual check against the exact freshly packaged app and a real project with real media. The check must capture the actual Editor surface, not only a synthetic smoke fixture, and an independent visual reviewer must inspect the screenshot for the complete Editor layout, viewer bounds, media, playback state, effects, timeline, overlap, and cross-view identity. Synthetic smoke, typecheck, tests, DOM payloads, logs, and extracted frames are supporting evidence only; none can substitute for the real screenshot. If the real packaged app cannot be launched or the screenshot cannot be reviewed, the task remains unverified and must not be handed back to the user as working.

The end-to-end check must fail closed on stale package identity, missing real-project media, missing FreeCut readiness, viewer geometry extending outside the viewer, hidden Editor chrome, blank/overlapping UI, or a screenshot that is not newer than the final source and package. The agent owns this verification; do not hand the user a launch instruction as a substitute for doing it.

## Recording setup requirements (Linux/X11 + NVIDIA)

- **Disable "Allow Flipping"** in `nvidia-settings` → OpenGL Settings. With it enabled, the NVIDIA driver uses page-flipping for vsync; x11grab occasionally reads the framebuffer mid-flip and captures torn frames into the recording. Disabling eliminates this. Persists across reboots. Confirmed on this user's hardware on 2026-05-04.
- Cursor sampling uses xdotool synchronous polling at 33 ms (`apps/desktop/src/main/recording/recording-session.mjs`). Do not replace with async motion-event streams — they have intrinsic IPC latency that causes visible cursor lag in playback. Regression-guarded by tests in `recording-session.test.mjs`.
- Cursor telemetry uses a two-clock model (`apps/desktop/src/shared/cursor-alignment.mjs`). Raw events in `stop()`/the `.cursor.json` sidecar stay on the telemetry clock — do not re-anchor them there (regression-guarded; the 2026-05-04 attempt clamped pre-ffmpeg events to frame 0 AND assumed the wrong gap sign). The recorder reports the signed per-segment telemetry-vs-video gap as `cursorAnchors`, and `alignCursorEvents` shifts events onto the video clock **exactly once at project ingestion** (`createProjectForRecording`, plus a one-time `openProjectFile` migration for legacy projects, flagged via `metadata.cursorEventsAligned`). Consumers read `metadata.cursorEvents` already aligned and must never shift again. The gap's sign depends on capture path: unified camera capture awaits the ffmpeg spawn, so the telemetry clock starts *after* the first video frame (measured −1107 ms on 2026-07-14 — cursor ran 1.1 s ahead); screen-only capture spawns async, so it starts *before* (cursor trails). The first-frame wall-clock comes from ffmpeg's stderr input banners (`createInputBannerAnchorParser` — LATEST epoch-plausible input `start:`, i.e. the camera in unified capture), **then is corrected at segment stop for unified capture** by subtracting the camera stream's start offset probed from the finished mkv (`probeVideoStreamStartOffsets`): whether ffmpeg retains any pre-camera screen frames is a race, so the file's t=0 is NOT reliably the camera's start (2026-07-14: 100 ms gap; 2026-07-19: 300 ms gap → cursor visibly ~9 frames ahead until the correction shipped). The correction only fires when the banner saw ≥2 epoch starts. The `-progress`-based `createFirstFrameDetector` is only a fallback, loose by the encoder pipeline depth (~1.5 s). Validated with a color-flip/mouse-jump ground-truth harness (`scripts/cursor-sync-ground-truth/`): residual ≤1 frame screen-only with zero drift over 75 s; camera-path residual verified via click-vs-UI-reaction analysis of real recordings.
- The xinput button listener (`xinput-button-listener.mjs`) provides click/drag events for auto-zoom. Cursor *position* sampling stays on xdotool; only buttons come from xinput.
- **Timeline playback can wedge with `isPlaying` stuck true and a frozen frame** (`apps/desktop/src/renderer/src/styled-video-preview.tsx`, regression-guarded in `styled-video-preview.test.mjs`). Accelerated timeline playback schedules draws via `requestVideoFrameCallback`, which only fires while the video element keeps presenting new frames — a decode stall, or reaching the end of media that's shorter than the wall-clock timeline (camera recordings routinely end ~0.5-1 s early), silently parks the draw loop forever (hit 2026-07-19: screen/camera froze, only the mouse cursor kept moving). Three independent guards fix this and must all stay in place: (1) a 250 ms watchdog beside the rVFC callback that re-enters `tick()` if rVFC doesn't fire; (2) the free-running accelerated clock is clamped to at most 2 frames ahead of the video element's actual decoded position, so cursor/zoom overlays can never glide ahead of a frozen frame; (3) `screenVideo.ended` is treated as a segment-boundary event, forcing the hold/advance logic instead of leaving playback dangling. Diagnose a similar wedge by loading `ROUGH_CUT_PLAYBACK_PROJECT_PATH=<project>.roughcut ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH=<out>.json electron --no-sandbox .` against the running Vite dev server (a second instance is safe, no single-instance lock) and watching the 1 Hz JSON report while driving playback with xdotool.

## App view architecture (HARD RULE — read before touching `app-views.ts`, `main.tsx`, or the recorder)

- **The main editor window has exactly two views: `Projects` and `Recording edit`.** Both are registered in `apps/desktop/src/renderer/src/app-views.ts` (`APP_VIEWS`). The bottom view-tab strip (`AppViewTabStrip` in `main.tsx`) switches between them.
- **Recording is a STANDALONE Electron BrowserWindow.** It is not a view in `APP_VIEWS` and must never be added as one. The window is created in `apps/desktop/src/main/index.mjs` and rendered by the `mode=recorder` branch in `apps/desktop/src/renderer/src/main.tsx:794` (`<main className="recordingLauncherShell">`). It is opened by the top-right **Record** button in the editor topBar.
- If a future need arises to surface recording state in the main window (e.g. "recording in progress" status), do it as a banner or status indicator, NOT by adding a `recording` view to the strip.
- **Camera live preview is on only when the recorder window is active or on first startup** — the main editor window must not keep camera preview running. If you see the camera light on while in Projects or Recording edit view, that is a bug.
- The `editor` view's user-facing label is `"Recording edit"`. The internal id stays `editor` for wiring (`activeAppView === 'editor'`, `setActiveAppView('editor')` on project open).

## Dev DX (HARD RULE — `pnpm dev` is the only command)

The user never has to run `pkill`, `lsof`, or restart Electron by hand. `pnpm --filter @rough-cut/desktop dev` must:

1. **Pre-cleanup stale processes.** `apps/desktop/scripts/predev-cleanup.mjs` runs first, killing anything on port 7545 (Vite) and any leftover Electron from this project. Failures are non-fatal — nothing to clean up is the happy path.
2. **Auto-restart Electron on main/preload/shared changes.** `apps/desktop/scripts/electron-dev.mjs` spawns Electron, watches `src/main/`, `src/preload/`, `src/shared/` via recursive `fs.watch`, and respawns on changes (200ms debounce). Renderer changes still HMR through Vite — no respawn needed for those.
3. **Propagate Ctrl+C cleanly.** `concurrently --kill-others -k` makes sure killing either Vite or the electron-dev orchestrator tears down both children.

Do not add new dev steps the user has to remember. If a change makes `pnpm dev` insufficient, fix the script — never the workflow.

- **Never the platform default scrollbar — anywhere in the app.** A global rule in `apps/desktop/src/renderer/src/styles.css` (right after the `html, body, #root` reset) applies the thin dark scrollbar (`*::-webkit-scrollbar*` + `scrollbar-color`/`scrollbar-width` on `html`) to every scrollable surface.
- The rule is **token-driven**. Tokens in `:root`:
  - `--scrollbar-size` (width/height)
  - `--scrollbar-track`, `--scrollbar-track-border`
  - `--scrollbar-thumb`, `--scrollbar-thumb-hover`
  - `--scrollbar-thumb-border-width`, `--scrollbar-thumb-radius`
- New scrollable surfaces (`overflow: auto`/`scroll`) automatically inherit the look — no per-element scrollbar styling needed.
- Per-component overrides are allowed only when a specific pane needs a different size (e.g. a thicker timeline scrubber). Override the tokens locally via `--scrollbar-*` on the component selector; do not hand-roll a new `::-webkit-scrollbar` block.
