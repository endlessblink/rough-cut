# Dropoff — 2026-08-04 (Israel time)

```text
You are continuing work in rough-cut-mvp on branch fix/freecut-timeline-sync-foundation.

## READ THIS FIRST
Load the `rough-cut-zoom-timeline` skill before writing any code. Its "NLE fundamentals"
section is non-negotiable and exists because every rule in it was violated in this work and
cost the user hours. The user is (rightly) out of patience with basic NLE mistakes.

THE GOAL, in the user's own confirmed words:
  Rough Cut is one project with one timeline. Every view — Recording edit, the Editor, and
  any added later — is a window onto it, exactly like DaVinci Resolve's pages. Switch to any
  view and it shows the current state immediately, composited live from raw media, never
  pre-rendered, never waiting on an encode, and that holds for one short project or a hundred
  long ones. Anything changed in any view is instantly in every other view, with no Save.
  Export exists only to produce the final published file.

## Current task & next step
The Editor's picture is drawn by Rough Cut's compositor (user-confirmed working). Just added:
the compositor also draws layers the user adds in the Editor, IN TRACK ORDER. Built and
packaged but NOT verified — next: launch, put a clip on a track above the recording, confirm
it covers the recording; move it below, confirm the recording covers it; then check the same
clip appears in Recording edit.

## Files touched / in flight (all committed)
- vendor/.../hooks/use-rough-cut-viewer-bridge.ts — NEW. Editor reports its viewer rect,
  playhead, track stack and timeline items to the host. Tracks come from useItemsStore
  (there is no useTracksStore — that mistake broke the build once already).
- vendor/.../components/preview-stage.tsx — mounts the bridge on the viewer element.
- apps/desktop/.../freecut-editor-surface.tsx — positions the host compositor over the
  Editor's viewer; splits Editor layers into above/below the recording by track order.
- apps/desktop/.../styled-video-preview.tsx — drawEditorOverlayLayers + a pooled decode
  surface per Editor video layer; two passes (below after background, above after cursor).

Still uncommitted, PRE-EXISTING WIP from before this work — do not attribute or sweep it in:
AGENTS.md, package.json, apps/desktop/package.json, scripts/package-linux.mjs,
vendor/freecut/index.html, vendor/freecut/src/bootstrap.ts, vendor/freecut/src/main.tsx.

## Key decisions & gotchas
- GOLDEN RULE: nothing works until the USER says so. Tests, payloads, logs, extracted frames
  and your own screenshots are evidence about ONE LAYER, never proof. Every "it's fixed" in
  this session that was not user-confirmed turned out wrong.
- ONE compositor draws every view. Two renderers can never match: the Editor's has no concept
  of camera PiP, zoom markers, click effects or telemetry-driven cursor.
- NEVER pre-render/bake/cache to show a preview. The old design encoded a full-length export
  first: a 33-min project sat unusable ~10 min, cache hit 1.3 GB, load average 12, user
  reported it crashing their machine. There is still ~1.3 GB of dead renders in
  ~/Documents/Rough Cut MVP/recordings/.roughcut-freecut-cache — offer to delete it.
- The Editor's preview resolves a clip's video STRICTLY BY MEDIA ID and ignores `src`.
- FreeCut deliberately replaced the old native `nle/` editor because it was bad. NEVER
  propose reverting to it.
- Do not ask the user to confirm NLE basics (e.g. "should a higher track cover a lower one?").
  Know it, apply it, move on.

## Env / run state
Branch: fix/freecut-timeline-sync-foundation | Last commit: b680d27
Built and packaged with all of the above. Nothing running; no encodes.
Untested: Slice B (add layer, switch tabs, come back — does it survive?) from earlier.

Start by: launch the packaged app, open the project that has a camera clip on V1, and check
layer order above/below the recording in both views — then ask the user what they see rather
than declaring it working.
```
