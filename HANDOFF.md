# Rough Cut dropoff — 2026-07-30 15:31 Israel time

You are continuing work in `rough-cut-mvp` on branch `master`.

## Current task & next step

Make the editor’s available actions obvious and expose real text editing where users expect it — next: inspect the rendered editor surfaces and add a visible, testable map of what is editable.

## Files touched / in flight

The worktree contains broad uncommitted Rough Cut changes from the current feature lane, including the editor-v2 transcript workflow, transcript/runtime services, cleanup review, timeline/export behavior, and smoke tests. Do not revert unrelated edits. `HANDOFF.md` was recreated for this dropoff.

## Key decisions & gotchas

- The user reports that text editing is unavailable anywhere and cannot tell what the app exposes where.
- The current transcript surface exposes transcript words as buttons for seek/select/cut; it is not an editable text control.
- The transcript tab was renamed to “Edit transcript”, but that currently means transcript-driven editing, not changing transcript text.
- A recent keyboard fix made Enter on a focused transcript word seek to that word; the bounded transcript UI smoke covers it.
- Recording quality remains higher priority than background transcript analysis.
- Existing verification: desktop build passes; editor-v2 layout tests pass; project-model tests pass; export tests pass; transcript-only UI smoke passes. The full cleanup smoke still reports a graphics/frame-continuity failure in the sandbox, while editing/persistence checks pass.
- Do not claim the app supports arbitrary transcript text editing until a real input is visible and runtime-tested.

## Env / run state

Branch: `master` | Last commit: `c44eee1 [TASK-252] Mark censor regions done, with the open follow-up recorded`

Running: nothing relevant.

Use lean-ctx tools for repository exploration and shell commands. UI changes require the impeccable design skill and a fresh smoke screenshot before claiming completion.

Start by: search the renderer for all text-input/contenteditable surfaces and trace the global keyboard guards, then reproduce the missing-edit affordance in the bounded UI smoke before implementing the smallest reversible fix.

