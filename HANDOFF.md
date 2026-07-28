# Handoff — 2026-07-28 19:26 Tuesday

```
You are continuing work in rough-cut-mvp on branch master.

## Current task & next step
TASK-252 censor regions: shipped and working (draw, retime, pixelate/solid, softness
blur, exports correctly). Next feature requested: make a censor FOLLOW moving content
(tracking) — next: build the keyframed censor rect (data model + preview
interpolation + export animation), then the automatic tracker on top.

## Files touched / in flight
Nothing uncommitted — tree is clean, all work committed on master (0290666).
The censor feature lives in:
- packages/project-model/src/{types,schemas}.ts — CensorRegion (rect, mode, blockSize,
  soften, softness). Schema v16.
- apps/desktop/src/shared/censor-regions.mjs — softness/blur/rect maths, shared by
  preview AND export so they cannot disagree. Also moveCensorRect/resizeCensorRect.
- apps/desktop/src/shared/screen-source-transform.mjs — forward transform + inverse +
  sourceRectToCanvasRect. Plain JS on purpose (see gotchas).
- apps/desktop/src/main/export-service.mjs — buildCensorSourceFilters (the FFmpeg side).
- apps/desktop/src/renderer/src/censor-overlay.ts — preview drawing.
- apps/desktop/src/renderer/src/censor-markers.mjs — document ops.
- apps/desktop/src/renderer/src/{main.tsx,styled-video-preview.tsx} — UI + interaction.
- scripts/smoke-censor-export.mjs — the end-to-end gate. Keep it passing.
- docs/censor-regions-plan.md — full design record incl. the failures below.

## Key decisions & gotchas
- ALREADY DE-RISKED (2026-07-28): the export CAN animate a moving censor. Verified by
  rendering a censor whose position varies with time: the geq mosaic tracks it (flat
  blocks land on the moving target at t=0.1 and t=1.9), and drawbox does too. NOTE:
  geq uses uppercase `T` for time, drawbox uses lowercase `t` — using the wrong one
  fails with "Invalid argument". So tracking will NOT end up preview-only.
- THE BIG TRAP, hit twice: there are TWO export backends. `mode: 'styled'` (the Export
  button) builds an FFmpeg -filter_complex chain; `mode: 'experimental-headless'`
  composites on a canvas. Adding an effect to only one ships an export that silently
  lacks it. Always verify with scripts/smoke-censor-export.mjs, never unit tests alone.
- NEVER put split/overlay in the screen chain. The obvious mosaic (split+crop+scale+
  overlay) DEADLOCKS whenever zoom is active — ffmpeg parks at 0% CPU with an empty
  file, forever. `fifo` does not help (no-op in modern ffmpeg). The mosaic is a single
  geq for this reason. The smoke covers the zoomed case specifically.
- geq must run on native yuv420p; a gbrp round-trip shifted colour across ~4% of the
  WHOLE frame. Luma and chroma expressions are separate, chroma region+block halved.
  A `format=yuv420p` is pinned first because the timeline-segment path hands rgba,
  where lum/cb/cr don't exist and the mosaic would silently do nothing.
- Blur taps are clip()-ed to the region. That's the safety property, not style: an
  unclipped average reads real pixels outside the boundary. Measured: 0 pixels outside
  change, 64% inside do.
- Censors draw INSIDE applyScreenSourceTransform (source pixel coords) — that's why
  they survive zoom/pan/crop for free. Handles are drawn OUTSIDE it, in canvas space,
  or they'd scale with the zoom.
- The transform + inverse live in plain .mjs because the desktop test runner is Node 20
  and cannot import .ts — in TypeScript the round-trip test skipped SILENTLY.
- The UI smoke needs a calm machine. Its 15s waits time out under load (seen at
  loadavg 30-45), and the failure moves to a different assertion each run, which looks
  like a code bug but isn't. Check `cat /proc/loadavg` and kill stray ffmpeg first.
- .prettierignore exists because a global format-on-save hook rewrote whole files;
  this repo is hand-formatted. Don't remove it.
- Project rule: any UI/CSS change must be verified by OPENING the smoke screenshot,
  not just by passing tests.
- Still open: censors overlapping a cut range aren't handled (slice 7).

## Env / run state
Branch: master | Last commit: 0290666 TASK-252: blur over the pixelation, and
timeline-first censor creation
master is 81 commits ahead of origin/master — NOT pushed yet (user's call).
feat/timeline-ruler-seek is aligned with master (0 ahead / 0 behind).
Running: nothing relevant. Dev is `pnpm --filter @rough-cut/desktop dev` (handles its
own cleanup; never pkill/lsof by hand).
Gates: `pnpm typecheck && pnpm -r test` (1353 pass) and
`node scripts/smoke-censor-export.mjs`.

Start by: adding an optional keyframes array to CensorRegion (frame + rect, optional
so v16 projects still load with no migration), plus a resolveCensorRectAtFrame helper
in apps/desktop/src/shared/censor-regions.mjs with unit tests, before touching any UI.
```
