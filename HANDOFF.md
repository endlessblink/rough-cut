# Dropoff — 2026-08-02 09:39 Sunday (Israel time)

```text
You are continuing work in rough-cut-mvp on branch master.

## Current task & next step
Prove the dock-launched packaged Rough Cut uses one canonical project and one
editor surface — next: instrument the packaged renderer so the active route,
host bundle signature, FreeCut readiness, and visible surface are captured in
one runtime report before changing more UI.

## Files touched / in flight
WIP changes span the FreeCut host/bridge, renderer routing and styles, packaged
startup, dock preparation, visual-proof scripts/tests, and vendored FreeCut.
New helpers: scripts/rough-cut-dock-reset.sh and
scripts/rough-cut-show-recording-edit.sh. PERPLEXITY_QUERIES.md has queries
through 69. Preserve export work and all existing WIP.

## Key decisions & gotchas
- Recording Edit is the canonical host compositor; FreeCut must be the only
  advanced Editor view, not a second window or hybrid surface.
- Standalone FreeCut windows are disabled in source, but runtime proof has not
  confirmed the packaged process uses that source.
- Both the dock reset launch and the supposed Recording Edit baseline still show
  the same contaminated shell: legacy compositor/timeline plus FreeCut loading.
- The packaged host bundle contains the FreeCut loading strings and the main
  artifact contains ROUGH_CUT_STARTUP_VIEW, so packaging is not obviously stale.
- Do not claim a working version. Do not arm visual proof. The current proof is
  intentionally invalid until a fresh headed dock screenshot and runtime
  identity report pass together.
- The previous baseline helper is only a diagnostic route selector; it is not
  evidence that the advanced editor is correct.

## Env / run state
Branch: master | Last commit: a96ef00 wip: dropoff handoff — dock surface diagnosis
Running: no verified Rough Cut GUI proof. `pnpm package:linux` passed after the
latest startup-view change. Desktop typecheck passed. The working tree is dirty
with the WIP listed above.

Start by: add a temporary, machine-readable runtime report at the actual
packaged renderer boundary, then launch the installed dock entry and compare
the report's activeAppView/DOM markers against the screenshot before editing
the route or CSS.
```
