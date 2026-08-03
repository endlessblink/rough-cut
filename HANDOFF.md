# Dropoff — 2026-08-03 11:00 Monday (Israel time)

```text
You are continuing work in rough-cut-mvp on branch fix/freecut-timeline-sync-foundation.

## Current task & next step
Slice B — make the Editor stop losing edits without a Save button. The code is written but
UNVERIFIED and uncommitted — next: run `pnpm package:linux`, launch it, add a text layer in
the Editor, switch to Recording edit and back, and have the USER confirm the layer survived
with the playhead intact.

## Files touched / in flight
All uncommitted. Slice B work:
- apps/desktop/src/renderer/src/main.tsx — Editor moved out of the view-keyed subtree into a
  `persistentEditorSlot`, hidden via `hidden={activeAppView !== 'nle'}` so switching tabs no
  longer unmounts the iframe.
- apps/desktop/src/renderer/src/styles.css — `.persistentEditorSlot` grid-area + `[hidden]
  { display: none }`.
- apps/desktop/src/renderer/src/freecut-editor-surface.tsx — `hostVersion` removed from the
  iframe src (no more reload per write); readiness no longer gated on projectVersion; a
  rejected command now ACKs with ok:false instead of silently timing out; explicit
  `freecut:flush` message; new `active` prop.
- vendor/freecut/src/features/editor/components/editor.tsx — dirty-driven save debounced
  ~600ms, flushes on visibilitychange/teardown, alongside the existing 5-min interval.

Also modified but PRE-EXISTING WIP from before this branch (do not attribute to this work):
AGENTS.md, package.json, apps/desktop/package.json, scripts/package-linux.mjs,
vendor/freecut/index.html, vendor/freecut/src/bootstrap.ts, vendor/freecut/src/main.tsx,
apps/desktop/src/main/index.mjs, packaged-editor-diagnostics.test.mjs.
Untracked: docs/freecut-host-integration.md, scripts/rough-cut-live-logs.sh,
scripts/run-packaged-terminal.sh.

## Key decisions & gotchas
- GOLDEN RULE: nothing is working until the USER says so out loud. Tests, JSON payloads,
  runtime reports, extracted video frames and my own screenshots are evidence about ONE
  LAYER, never proof of the outcome. This was violated repeatedly this session and every
  "it's fixed" was wrong. Never write "fixed"/"works"/"verified" about user-visible
  behaviour — say what changed, what layer was checked, and ask the user to look.
- THE TRAP THAT COST THE MOST: the vendored Editor's preview resolves a clip's video
  STRICTLY BY MEDIA ID and ignores `src` (use-preview-composition-model.ts:362,
  `resolvedUrls.get(item.mediaId)`). `src` is honoured only by thumbnail/inline-composition
  paths. The host used to pass the composited program via `src` while leaving mediaId on the
  raw asset — so the Editor always played the bare screen recording. The program must be BOTH
  the item's mediaId AND a media-library entry.
- The program is the finished composite (camera PiP, background, zoom, cursor, mixed audio
  baked in). Only the program clip is seeded; seeding source clips beside it double-draws the
  camera and doubles the audio.
- Writeback must NOT rebuild the composition from a collapsed timeline — it has no items for
  camera/audio, so mapping its tracks back would delete them from the project.
- FreeCut deliberately replaced the old native `nle/` editor because that editor was bad.
  NEVER propose reverting to it; the orphaned `nle/` code looks like an easy fix and is not.
- 13 of 14 projects show "Media unavailable" in the Editor: the program is rendered only on
  first request, full-length, with no progress state. That is Slice D, not a bug to patch now.
- The render cache key covers picture inputs only (not modifiedAt) and differs between the
  ON-DISK and OPENED forms of a document — `openProjectFile` rewrites asset paths to absolute
  and the key covers the asset. Any tool reasoning about renders must OPEN the project first.
- Slice B1 moved an element between grid areas, i.e. a UI/CSS change. The project's hard rule
  requires a design skill loaded and the smoke screenshot opened before calling UI work done.
  That has NOT been done — do it before claiming B1 complete.
- Commits 7a17b38 and 51c39b9 already swept some pre-existing WIP in. Slice A says do not
  sweep the rest when pushing.
- The branch has NO upstream — first push needs `git push -u origin HEAD`.

## Env / run state
Branch: fix/freecut-timeline-sync-foundation | Last commit: b15dc6b "fix: make the Editor
actually play the composited program" (9 commits ahead of master, unpushed)
Running: nothing — no Electron processes; app is closed.
Plan: ~/.claude/plans/we-are-debugging-rough-rippling-muffin.md — agreed scope is SLICE B
ONLY, then the user tests. Slices A/C/D/E are written down but not started.
Verified by the user so far: the Editor plays the composited program for herdr_1. Nothing
about Slice B has been user-verified.

Start by: run `pnpm package:linux && pnpm run:packaged:terminal`, open herdr_1 (the only
project with a finished render), add a text layer in the Editor, switch to Recording edit and
back, and ask the user whether the layer is still there — do not declare it working yourself.
```
