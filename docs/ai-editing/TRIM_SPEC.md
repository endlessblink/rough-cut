# Trim: one spec, one command, one test matrix (written 2026-11-02 after Noam: "trim needs to work like any proper NLE")

Why patching failed: trim logic lives in four places that each guess (the drag clamp in main.tsx `clipTrimBounds`, the drag preview `ripplePreviewLayout`, `trimClipEdge`, `rippleTrimClipEdge`, plus a gap-leaving path), so a fix in one breaks another. One spec first, then one command everything calls.

## Behaviour (as in Premiere / Resolve / FCP)
Edge = head (left) or tail (right) of a clip. Delta = how far the edge moves. Limits: the clip can never use footage that does not exist (handles: source start 0, source end = recording length).

| Mode | Shorten an edge | Extend an edge |
|---|---|---|
| Normal trim | Edge moves in; the freed space stays as a gap (head: clip start moves right, gap on the left; tail: gap on the right). Nothing else moves. | Edge moves out into free space or hidden footage only; stops at the neighbouring clip. Never overlaps. |
| Ripple trim | Edge moves in; the gap closes: everything after slides left. The clip start never moves (head trim keeps the start position). | Edge moves out; everything after slides right to make room. Clip start never moves (head trim reveals earlier footage, the clip grows to the right). |
| Roll trim (between two touching clips) | One edit point moves; the left clip's tail and the right clip's head change by the same amount; total length unchanged. Limited by both clips' handles. | Same. |

All linked tracks (screen, audio, camera) move together. Every result must pass timeline validation (sorted, no overlaps).

## Today (matrix run on the 2026-10-27 project)
tail shorten: plain ok, ripple ok. head shorten: plain ok, ripple ok. tail extend: plain ERROR (overlaps neighbour; the drag clamp hides it), ripple ok. head extend: plain ERROR, ripple ERROR (moves the clip start into the previous clip instead of growing to the right). The drag preview computes its own different rule for head trims ("CapCut-style magnetic").

## Build plan
1. `trimEdge(document, {clipId, edge, frame, mode: 'normal'|'ripple'|'roll'})` in project-model implementing the table; reject only on missing footage.
2. Test matrix: 2 edges x shorten/extend x 3 modes x (first, middle, last clip) x (with and without gap), asserting positions of every clip and validity.
3. Drag clamp and preview call the same functions (preview = the command applied to a copy), so they cannot disagree.
4. Remove the old paths (`trimClipEdge` plain-with-clamp, gap-leaving special path) once everything uses `trimEdge`.
5. Modifier keys like editors: default mode from the toolbar toggle; Alt/Cmd flips it; dragging on the edit point between two clips rolls.
