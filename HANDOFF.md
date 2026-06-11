# Handoff — 2026-06-11 15:48 (Asia/Jerusalem)

You are continuing work in **rough-cut-mvp** on branch **feat/timeline-ruler-seek**.

## Current task & next step
LANE NLE-R (MASTER_PLAN.md): Editor v2 rebuild — slices 1–3.1 DONE (shell, chrome reclaim,
mockup-grammar deck, media pool, filmstrips/waveforms, debug dump). TASK-227/228/238 DONE.
— next: **TASK-230 export parity** (NLE cuts/gaps/moves must land in the exported MP4 exactly as
previewed). FIRST check `git log --oneline -10`: a parallel session has been committing
"experimental headless export / frame parity proof" work — TASK-230 may be partially done; read
those commits + MASTER_PLAN before writing anything.

## Files touched / in flight (uncommitted)
- Editor v2 slice 3/3.1 + TASK-228: `apps/desktop/src/main/clip-visuals.mjs` (+test),
  `src/main/index.mjs` (clip-visuals + debug-dump IPC), `src/preload/index.cjs`,
  `src/shared/ipc-channels.mjs` (+test), `nle/clip-visuals-style.mjs` (+test, d.mts),
  `nle/nle-timeline.tsx`, `nle/nle-shell.tsx`, `styles.css`, `nle/nle-timeline.test.mjs`,
  `scripts/visual-nle-linked-clips-playwright.mjs`, `MASTER_PLAN.md`
- From the parallel session (don't clobber): `app-views.ts/.test`, `main.tsx`,
  `window-profile.test.mjs`, `docs/recording-window-profile.md`, `docs/recording-flow-solidity.md`,
  `scripts/smoke-recording-startup-ui.mjs`

## Key decisions & gotchas
- **Working agreement (user-approved):** every Editor v2 change is designed in the mockup first
  (`docs/mockups/editor-v2-resolve.html`, edit `build-editor-v2.mjs` NOT the html), then built as a
  harness-gated slice: `xvfb-run -a node scripts/visual-nle-clips-playwright.mjs` → `problems: []`,
  OPEN screenshots **at ≥1900px width**, user sign-off live. "Tests pass" alone ≠ done.
- **Premium-UI rules (user burned us 3x):** no eyebrow label rows, no toolbar hint sentences, no
  terminal mono for timecode (UI font + tabular-nums), delete redundant elements instead of
  restyling; when the user says ugly → redesign from Resolve/Linear references, don't patch.
  Memory: `feedback_premium_ui_validation.md`.
- **Harness reads machine state, not text:** playhead/duration from `.nleTimelineStatus` dataset
  (`data-playhead-frame`/`data-duration-frames`); clip In/Out from `.nleClipBlock` dataset.
- **Clip visuals:** per-source PNGs cached in `.roughcut-visuals/` keyed mtime+zoom-bucket (v2
  keys); filmstrips are cover-cropped 86×48 tiles, keyframe-only decode (`-skip_frame nokey`);
  renderer buckets via `filmstripTileBucket`/`waveformWidthBucket`, `pickVisual` falls back to
  nearest variant. Visuals effect guard is UNMOUNT-ONLY (per-run cancellation caused permanently
  flat clips — regression-tested).
- **Do NOT run `pnpm dev` in the background while the user has a session open** — predev-cleanup
  kills their Electron. Renderer HMRs; main-process edits auto-respawn via electron-dev.mjs.
- Debug dumps: user presses **Ctrl+Shift+D** in the Editor → `.roughcut-debug/editor-dump-*.json`
  (timeline, playhead, selection, playback ring buffer) — ask for this file on any live bug report.
- Don't trust Watchpost `next-id` (returned TASK-1775 vs file max ~238); follow MASTER_PLAN.

## Env / run state
Branch: feat/timeline-ruler-seek | Last commit: 6830b54 "Add opt-in headless export renderer seam"
Running: user may have `pnpm dev` open (see gotcha above). Suite: 599/599 at handoff
(`cd apps/desktop && pnpm test`). Harnesses green: visual-nle-clips + visual-nle-linked-clips.

Start by: `git log --oneline -10 && sed -n '/LANE NLE-R/,+30p' MASTER_PLAN.md` to sync with the
parallel session, then begin TASK-230 (or reconcile it if their export-parity commits cover it).
