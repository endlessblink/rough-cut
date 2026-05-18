# Shared Timeline Architecture

Rough Cut has one timeline. Recording edit and NLE are two canonical toolsets over that same timeline.

Neither surface is a read-only projection, a collapsed derivative, or a separate edit model. Recording edit presents simpler screen-recording tools. NLE presents advanced track and clip tools. Both must mutate the same project timeline through the same project-change path.

## Invariant

- One shared project timeline model owns persisted edit decisions.
- Recording edit and NLE both read from and write to that model.
- Switching tabs must not reinterpret, flatten, drop, duplicate, or fork timeline edits.
- Preview and export resolve from the same composition/EDL model used by both toolsets.
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
- Must faithfully reflect timeline edits made by NLE when they affect the screen-recording workflow.

NLE:

- Presents advanced track/clip editing tools.
- Can expose split, trim, drag, multi-track, generated assets, captions, and overlays.
- Must write those edits to the shared timeline model.
- Must not create NLE-only cut/clip state for concepts Recording edit also owns.

## Transitional Fields

During migration, legacy fields may coexist with the shared timeline model, but they must be treated as transitional compatibility data:

- `composition.tracks`
- top-level `document.tracks`
- asset-level `presentation.cutRanges`
- Recording edit trim state derived from the primary recording clip

Every transitional field needs an explicit sync or migration rule before new trim/drag/export behavior depends on it.

## Interaction Rule

Timeline interactions such as trim and drag must use local preview/session state while the pointer moves. Commit one pure shared timeline mutation on pointerup so undo/redo records a single action.

Do not mutate project state on every pointermove. Do not let UI-only preview state become canonical.

## Implementation Order

1. Lock this invariant with tests and docs.
2. Define the shared timeline schema for sources, tracks, clips, linked groups, markers/effects, and export settings.
3. Migrate Recording edit cuts/trims into the shared timeline without changing export output.
4. Route Recording edit actions through shared timeline selectors/actions.
5. Route NLE actions through shared timeline selectors/actions.
6. Rebuild trim with local preview sessions and edge hit-zones.
7. Build export composition/EDL from the shared timeline.
8. Add cross-tool sync and migration smoke coverage.
