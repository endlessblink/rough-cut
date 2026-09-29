# Handoff — 2026-09-29 10:28 Tuesday

```
You are continuing work in rough-cut-mvp on branch fix/freecut-timeline-sync-foundation.

## Current task & next step
Claude-made motion graphics in Recording edit ("Graphics" tool tab + Graphics lane at the top of
the timeline): Claude writes an animated HTML page, drawn live as a sandboxed iframe layer over the
whole composite and burned in on Styled export by a second ffmpeg pass. The user is iterating on
look & feel — next: get the user's verdict on the new Style picker (9 styles) + Creativity dial
(Calm→Wild) after they generate with a real Claude call, then act on what they flag.

## Files touched / in flight
- apps/desktop/src/shared/motion-graphics.mjs — spec validation, page runtime (seek, fields, RTL
  auto-dir, still/animate, --rc-duration, "rc:fields" event), timeline ops (graphic effects).
- apps/desktop/src/shared/graphics-styles.mjs — the 9 styles + 5 creativity levels + design bans
  (distilled from hyperframes-creative visual-styles, design-taste, motion-graphics-not-slideshow).
- apps/desktop/src/main/claude-cli.mjs — the ONLY way the app calls Claude (graphics + AI tab).
- apps/desktop/src/main/claude-graphics-service.mjs — the design brief (model: opus).
- main/graphics-export.mjs, graphics-frame-renderer.mjs, export-service.mjs (overlay pass),
  graphics-style-store.mjs (appData, partial-merge saves), ai-service.mjs (AI tab, CLI now).
- renderer: graphics-panel.tsx, graphics-overlay.tsx, main.tsx (lane, placement, logging), styles.css.
- scripts/visual-graphics-playwright.mjs (+ scripts/fixtures/fake-claude/claude.cjs) — `pnpm test:graphics <project>`.

## Key decisions & gotchas
- NEVER make live Claude calls yourself (global rule). Tests use the stand-in via ROUGH_CUT_CLAUDE_BIN.
  Real output quality is judged only from the user's clicks.
- To see what Claude actually returned: ~/.config/rough-cut-mvp/claude-log/*.json (last 30, incl.
  prompt + html). Runtime log = repo-root .logs/app-runtime.log ([graphics] / [claude:*] lines).
- Before debugging "same issues as before": check the running app's start time vs the package time
  (`ps -eo lstart,args | grep rough-cut-mvp-linux-x64/electron`). The user once tested a stale build.
- A graphic starts at the playhead unless the request names a START time (requestMentionsTime).
- RTL: runtime forces dir=rtl for Hebrew fields; prompt forbids mirroring non-directional icons (?).
- Short blocks on long timelines: edge handles are min(0.6rem, 22%) so the middle stays draggable.
- Only locally installed fonts render (Heebo/Rubik/Alef for Hebrew); web fonts are blocked by CSP.
- Native <select> popups render white-on-white in this app — use tiles/custom pickers.
- Another Claude session works in this same tree (camera lip-sync); it committed our graphics work
  inside 5f0ac52. Don't revert its changes.
- The render-guard hook blocks bare ffmpeg commands; run export checks inside Electron scripts.
- Known pre-existing root test failures: 2 GPU-C WebGPU tests. Desktop suite: 931/931.

## Env / run state
Branch: fix/freecut-timeline-sync-foundation | Last commit: this dropoff (after 5f0ac52)
Running: the user's dock app may still be an old build — ask them to fully quit and reopen.
Package: `pnpm package:linux`; packaged app at dist/rough-cut-mvp-linux-x64 (dock launches it).

Start by: asking the user how a real Generate looks with a chosen Style + Creativity, then read the
newest file in ~/.config/rough-cut-mvp/claude-log to judge the actual HTML Claude produced.
```
