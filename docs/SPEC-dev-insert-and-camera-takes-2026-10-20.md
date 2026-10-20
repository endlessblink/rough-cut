# Dev-only: insert outside clips + camera takes over the timeline

Agreed with Noam on 2026-10-20 (grill-me session). For finishing the beta.11
launch video himself. Build only after he confirms this file.

## Who sees it

- Both features sit in a **Dev menu** that shows in Noam's own dock copy of
  the app only. Public downloads never show it.
- How: the features are off unless a local switch is on (an environment
  variable set by his dock launcher, or a switch file in his app config
  folder). With the switch off, no menu, no buttons, no IPC handlers answer.
- Note: the Linux release runs unpacked, so "is packaged" cannot tell dev from
  release; the switch is the only gate. Tests prove the features are absent
  when it is off.
- They stay dev-only until Noam himself says they are mature enough and asks
  for them to go to production. No agent moves them out of the Dev menu on
  its own.

## 1. Add an outside clip in the middle of the timeline

- Dev menu → "Add clip at playhead…" → pick a video/audio file **or** another
  `.roughcut` project.
- After picking, a small choice pops up each time: **Insert** or **Overwrite**.
  - Insert: everything after the playhead moves later by the clip's length.
    Captions, graphics and zooms after the playhead move with it, so they stay
    on their moments. Nothing is overwritten.
  - Overwrite: replaces what is under it for the clip's length. Nothing moves.
- Picture: the added clip takes the **whole picture**, like a cut to another
  shot. A clip with a different shape is fit whole, with the project
  background filling the empty sides.
- During the added clip the recording's camera bubble, cursor, clicks and
  zooms are **hidden**; they come back when it ends.
- The added clip starts clean, and Noam can add his own zooms, graphics,
  captions and a camera take (feature 2) onto it, like any other part.
- Sound: the clip's own sound **replaces** the recording's sound while it plays.
- From another project: the **whole edited project** comes in, with its
  **finished look** (its zooms, camera bubble, clicks and background baked
  in). It is quietly exported first at low priority (a minute or two), then
  added as a normal clip. Noam trims the ends on his timeline afterwards.
- Added clips behave like normal clips: trim, move, split, delete, undo.
  Export matches the preview.
- Source files and source projects are never modified. Exported pieces from
  other projects are saved next to the current project.

## 2. Record a camera take while the timeline plays

- Mark a start and end on the timeline → Dev menu → "Record camera take".
  A 3-2-1 countdown, then that range plays (picture only, **silent**, so the
  mic stays clean; a switch turns sound on for headphone users) while the
  webcam and mic record. It stops by itself at the end mark.
- The take lands in the **camera bubble** for exactly that range: same shape
  and spot as the existing camera. On parts that had no camera, the bubble
  appears there using the project's camera style.
- The take's voice **replaces** the old voice for that range. The old voice
  is muted there, not deleted.
- Retakes: **every take is kept**. The newest is used by default, and Noam can
  pick which take to use for that range from a list.
- Undo works for placing a take and for switching takes.

## Rules for the build

- ffmpeg only through the app's safe capped wrapper; heavy work at low
  priority.
- Tests: insert vs overwrite, trim, undo, export of an added clip; camera
  take aligned to the played range; take switching; both features absent with
  the switch off.
- Work on a copy of the beta_11 walkthrough project, never the original.
- Commit on a branch, no release.
