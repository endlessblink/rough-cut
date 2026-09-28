# Handoff — 2026-09-28 20:55 Monday

```
You are continuing work in rough-cut-mvp on branch fix/freecut-timeline-sync-foundation.

## Current task & next step
"Studio" visual makeover of the desktop app (user-approved mockup "A · Studio") — built
into the real app and verified on the packaged build; user has NOT yet signed off.
Next: get the user's verdict after they click through the dock app (Recording edit: six
right-hand tabs + Export pop-up; Projects page), then fix what they flag.

## Files touched / in flight
Makeover (this session):
- apps/desktop/src/renderer/src/main.tsx — top bar (project name as date, page tabs in
  bar, Export pop-up toggle), device row removed, EditorToolBoard rebuilt as six tabs
  (background/frame/camera/cursor/zoom/censor; ActiveTool type changed), PaneTitle,
  BackgroundKindTabs, export pop-up (pick Styled/Raw tile → footer Export), timeline
  toolbar (delete, zoom slider + %), lane icons, "Screen 4.6s" clip labels, section help
  text moved into an info tooltip, toggles are switches, slider `unit` prop.
- apps/desktop/src/renderer/src/styles.css — token scales (--text-2xs…3xl, --weight-*,
  --space-*, --radius-*), then a large "Studio" block appended at the END of the file.
- styled-video-preview.tsx — quieter selection handles, dimmed total time, size chip,
  removed "Space play/pause" hint.
- library/library-shell.tsx, grid-view.tsx, list-view.tsx, project-name.mjs (+test) —
  Continue-editing hero, search, New ▾ menu, New recording, readable timestamp names.
- design-tokens.test.mjs (new guard), DESIGN.md (tokens + Studio layout rules).
- main/index.mjs (UI smoke) + scripts/* — updated to the new tabs/export contract
  (export = click [data-export-format] then [data-export-action="export"]).
- packages/project-model/src/migrations.ts (+test) — legacy projects with null
  thumbnailPath / bare {enabled:false} crop now open (all 617 real projects load).
- docs/mockups/studio-makeover/ — the approved mockup (index.html switches A/B/C/Today).
Uncommitted WIP from EARLIER sessions also in this tree (framing ranges, follow-crop,
export-service, zoom-sendcmd, frame-resolver) — not part of the makeover.

## Key decisions & gotchas
- User wants the app to look EXACTLY like mockup A; they reject restyles of old panels
  and "lazy"/cheap looks. Judge at 1920 wide against docs/mockups/studio-makeover.
- Never fake controls the app can't do (no export quality/fps, no Window-frame switch,
  no camera "Wide"/mirror). Rare controls go under "More … options", never deleted.
- design-tokens.test.mjs fails on raw font sizes/weights/radii/rem spacing outside
  :root — use tokens (add a token if a new role is needed).
- Real-app capture: packaged app via Playwright _electron + xdotool/import screen grab
  (page.screenshot hangs). Always rebuild with `pnpm package:linux` before capturing.
- A render-guard hook blocks anything that looks like an export/ffmpeg run (even
  `node --check` on export scripts) — ask the user before running smoke:ui.
- Known pre-existing failures: 2 WebGPU tests in scripts/repo-regression.test.mjs
  (fail on HEAD too). Desktop suite: 1044/1044 pass.
- Real project "Sun 19 Jul · 21:07" (rough-cut-2026-07-19T18-07-16-622Z) had its
  screenFrame moved to bottom-right at 17:54 (x/y 0.09→0.18, align right+bottom);
  .bak holds the old value. User was asked whether to restore — don't touch unasked.
- Open gaps the reviewer noted (need real features, not fakes): camera filmstrip lane,
  chunkier waveform, "No preview yet" for black thumbnails.

## Env / run state
Branch: fix/freecut-timeline-sync-foundation | Last commit: see git log (this dropoff)
Running: nothing (mockup server on :4178 was session-local; serve
docs/mockups/studio-makeover with `python3 -m http.server 4178 --directory <dir>`).

Start by: asking the user what they saw in the rebuilt dock app and whether to restore
the 19 Jul project's screen position.
```
