# Shared Timeline Architecture

Rough Cut has one timeline. Recording edit is the canonical toolset over that timeline; any view added later is another window onto the same timeline, never a separate edit model.

No surface is a read-only projection, a collapsed derivative, or a separate edit model. Every surface must mutate the same project timeline through the same project-change path.

## Invariant

- One shared project timeline model owns persisted edit decisions.
- Every view reads from and writes to that model.
- Switching tabs must not reinterpret, flatten, drop, duplicate, or fork timeline edits.
- Preview and export resolve from the same composition/EDL model used by every view.
- Component-local state may hold transient interaction previews only, never persisted timeline truth.

## Shared Edit Concepts

The shared timeline must own these concepts, even if the current code still has transitional legacy fields:

- Screen recording source ranges and visible segments.
- Head/tail trim and removed/cut ranges.
- Zoom markers and their precedence rules.
- Cursor telemetry and cursor presentation.
- Click effects.
- Camera PiP source timing and presentation.
- Mic/system audio timing.
- Background, aspect ratio, screen/camera frames, and export settings.
- Future generated assets, captions, overlays, and motion graphics.

## Toolset Responsibilities

Recording edit:

- Presents a focused screen-recording workflow.
- Can expose simplified lanes, cut tools, zoom tools, cursor/click controls, camera PiP controls, and export controls.
- Must write those edits to the shared timeline model.

A future view (for example generated motion graphics):

- Must write its edits to the shared timeline model.
- Must not create view-only cut/clip state for concepts Recording edit also owns.

## Transitional Fields

During migration, legacy fields may coexist with the shared timeline model, but they must be treated as transitional compatibility data:

- `composition.tracks`
- top-level `document.tracks`
- asset-level `presentation.cutRanges`
- Recording edit trim state derived from the primary recording clip

Every transitional field needs an explicit sync or migration rule before new trim/drag/export behavior depends on it.

## Canonical Timeline Contract

`ProjectDocument.timeline` is the canonical shared timeline envelope. It owns:

- `sources`: media references for screen, camera, mic audio, system audio, cursor telemetry, project assets, and generated assets.
- `linkedGroups`: frame-locked or manually-offset groups that keep related media synchronized, especially screen recordings with camera/audio/cursor sidecars.
- `tracks`: integer-frame timeline tracks sorted by `index` for display and compositing order.
- `clips`: timeline placements with `mediaId`, `trackId`, optional `linkGroupId`, `sourceIn`, `sourceOut`, `timelineIn`, and `timelineOut`.
- `markers`: timeline-owned zoom, cut, click, cursor-style, camera-layout, and annotation spans.
- `effects`: cursor, click, camera PiP, zoom, and annotation presentation state attached to clips, tracks, sources, linked groups, or the whole timeline.
- `exportSettings`: the export shape resolved from the same timeline that Recording Edit and NLE mutate.

All temporal values are integer frame numbers. `timelineIn`/`timelineOut` are composition time. `sourceIn`/`sourceOut` are media time. Ranges are half-open intervals: `[start, end)`.

The current model forbids retiming: `timelineOut - timelineIn === sourceOut - sourceIn`. Same-track clips must be sorted by `timelineIn` and must not overlap. Cross-track overlaps are allowed for compositing and audio mixing.

Timeline duration is computed from the maximum clip `timelineOut`, marker `endFrame`, and temporal effect `endFrame`. Gaps are real timeline time; Recording Edit may visually collapse or zoom gaps, but the model and playhead stay in timeline time.

Legacy fields remain during migration, but after canonicalization they are import-only compatibility data:

- `composition.tracks`
- top-level `document.tracks`
- asset-level trim fields
- asset-level `presentation.cutRanges`

New shared behaviors must target `ProjectDocument.timeline`. Active view, playback, mutation, and export code must stop reading legacy fields as truth in the later rebuild lanes.

## Interaction Rule

Timeline interactions such as trim and drag must use local preview/session state while the pointer moves. Commit one pure shared timeline mutation on pointerup so undo/redo records a single action.

Do not mutate project state on every pointermove. Do not let UI-only preview state become canonical.

## Implementation Order

1. Lock this invariant with tests and docs.
2. Define the shared timeline schema for sources, tracks, clips, linked groups, markers/effects, and export settings. Done in TASK-207.
3. Migrate Recording edit cuts/trims into the shared timeline without changing export output.
4. Route Recording edit actions through shared timeline selectors/actions.
5. Rebuild trim with local preview sessions and edge hit-zones.
6. Build export composition/EDL from the shared timeline.
7. Add cross-view sync and migration smoke coverage.
