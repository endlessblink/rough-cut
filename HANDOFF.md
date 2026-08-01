# Dropoff — 2026-08-01 09:09 Saturday (Israel time)

```text
You are continuing work in rough-cut-mvp on branch master.

## Current task & next step
Integrate the actual FreeCut editor into Rough Cut as the single advanced editor over Rough Cut's shared project, media, timeline, compositor, transcript, and future AI assets — next: remove the current hybrid Program/Source rendering and trace the smallest live shared-project bridge from Rough Cut's canonical compositor/timeline into FreeCut before editing more UI.

## Files touched / in flight
- Uncommitted/WIP editor integration: FreeCut surface, main renderer, styles, transcript coverage editor, FreeCut host/main-process wiring and tests.
- Uncommitted/WIP proof enforcement: project agent rules, package scripts, proof recorder/library/hook/tests, and new arm/disarm/verify scripts.
- Uncommitted/WIP architecture context: CONTEXT.md.
- Uncommitted/WIP export work also exists: export service, export memory/segment/package tests, packaged-main sync, and export verification scripts. Preserve it; do not treat it as disposable editor work.

## Key decisions & gotchas
- One parent task lane with interconnected child workstreams; do not split shared project/timeline/media/proof into competing goals.
- Rough Cut remains the dock-launched shell and owns recorder, projects, navigation, media library, transcript editor, and AI tab.
- Recording edit remains the canonical compositor/editor. FreeCut must be the only advanced editor UI and receive the same composed program result, including layout, aspect ratio, zoom, cursor, censor, and other effects.
- Do not keep or invent the current hybrid Program/Source layout. The user explicitly rejected two merged views and wants FreeCut visually 1:1.
- FreeCut must load the active Rough Cut project automatically; no separate workspace/project picker and no separate project media manager. It may manage additional shared assets.
- Synchronization target is one shared project/timeline/command history. FreeCut edits, transcript edits, imported assets, generated AI/Remotion/Hyperframes assets, captions, automatic edits, and effects must be shared, inspectable, undoable, and non-destructive.
- Current host path is snapshot/load plus save and cached/exported program media; it is not yet a live bidirectional bridge and loses transitions/keyframes/effects in conversion.
- The visual-proof system now has an explicit completion arm. Normal Stop-hook operation exits silently; `pnpm visual-proof:arm` enables fail-closed blocking. `pnpm visual-proof:disarm` is required while continuing implementation.
- Final proof must bind current UI source, packaged UI, screenshot hash, disposable visual-review findings, and the full checklist. Do not claim completion from tests or selector smoke alone.
- The proof gate still needs stronger provenance and broader fingerprint coverage for UI-affecting main/preload/host/packaging changes.
- Packaged Linux build succeeded. Dock preparation was not run because it would modify the sandbox helper with setuid root. This Codex session had no X display, so it could not capture the dock window.
- Visual-proof unit tests passed earlier. The idle Stop hook was verified silent and the armed hook produced valid blocking JSON. Do not rerun tests merely for dropoff.

## Env / run state
Branch: master | Last commit before this handoff: 7871cd1 fix: keep FreeCut media playable during styled handoff
Running: no Rough Cut GUI proven; packaged Linux artifact exists. Docker services are unrelated to this lane.
Goal state: parent goal exists but was reported paused by the goal system; plan state is preserved. Completed: shared contract, proof system, and architecture mapping. Pending: synchronization implementation, dock workflow verification, final armed proof.
Visual gate: disarmed for continued implementation; proof record is still outdated and must not be accepted.

Start by: inspect the current FreeCut surface and host conversion together, then write the minimal change that removes the hybrid Program/Source surface while preserving Rough Cut's canonical project/compositor data flow.
```
