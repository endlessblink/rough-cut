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

## Built (2026-10-20, branch dev/insert-clips-camera-takes)

- Switch: `ROUGH_CUT_DEV_FEATURES=1` in the environment, or an empty file
  `dev-features.on` in the app's user-data folder (`ROUGH_CUT_DEV_FEATURES=0`
  forces it off). With it off the Dev button, the menu and the dev IPC handlers do
  not exist (tests prove it).
- Model: `packages/project-model/src/inserted-media.ts`. Added clips are their own
  assets (file referenced in place) on the recording's screen/audio lanes; camera
  takes live on two take lanes above the recording ("Camera takes", "Take voice"),
  so the recording's own camera and voice clips stay untouched (muted, not deleted).
  Takes for one range share a take group; switching swaps the clip on the take lanes.
- Preview: each added file has its own hidden decoder positioned from the timeline
  clock; the recording's playback treats those spans as gaps. The clock never runs
  more than two frames ahead of an added clip's picture.
- Export: each added clip and take is its own seeked, capped ffmpeg input; added
  clips form a full-picture layer over the background, takes go into the camera lane,
  and sound follows the audio lanes (take voices mute the recording under them).
- Files written: takes and finished exports of other projects go in `added-media/`
  beside the project. Source files and projects are never modified.
- Tests: model unit tests; `pnpm test:inserted-media-export` (real export, frames and
  sound checked); `pnpm verify:dev-insert-takes <project>` (real app, temp copy, fake
  camera: insert/overwrite, undo/redo, playback through a clip, two takes on the
  marked range, take switching and its undo, Dev menu absent with the switch off).

## 3. Voice-over take (added 2026-10-20, Noam via the Desk)

Follows the common pattern of Final Cut "Record Voiceover", Premiere "Voice-Over Record"
and Camtasia "Voice Narration": punch in from the playhead or a marked range, a 3-2-1
countdown, timeline sound muted while recording unless headphones are on, the take lands as
a new clip on its own audio lane at the exact spot.

- Dev menu → "Record voice-over…". With a marked range the range plays and recording stops
  at its end; without one it starts at the playhead and runs until Stop.
- Mic only (no camera, no picture). A live mic level shows in the panel before recording.
- Lands on its own "Voice" lane (track `track:voice-over`), sound only, at the frame the
  playhead was on when playback began (the countdown lead-in is trimmed off, as for camera
  takes). Drag and trim it like any clip; a new take over an older one cuts the older one
  away there only.
- Per take: **Replace** (the recording's sound is muted under it, not deleted; the Audio lane
  shows the muted stretch) or **Play over** (both are heard). Chosen in the panel before
  recording (remembered) and switchable later with the chip on the clip.
- Undo covers placing, moving, trimming and switching. Export matches the preview.
- Files: `added-media/voice-take-*.webm` beside the project.
- Tests: `voice-over.test.ts` (model); `scripts/e2e-inserted-media-export.mjs` (replace mutes,
  over mixes, in the exported file); `scripts/e2e-dev-voice-over-playwright.mjs <project>`
  (real app, fake mic: from playhead, from a range, switch, drag, undo, switch off).

## 4. Zooms and captions on an added clip, sound files (added 2026-10-21)

- **Zoom on an added clip:** click the Zoom lane over the clip. The zoom belongs to the
  clip (stored on its asset as `metadata.clipZooms`, in the clip file's own frames), so
  it moves, trims and ripples with the clip. It is a normal zoom on the lane: drag,
  resize, strength, focal point, delete, undo. No cursor follow (a clip has no cursor).
- **Caption on an added clip:** click the Captions lane over the clip and type, or select
  the clip and press "Add captions to this clip" (listens to the clip's own sound). Lines
  are stored on the clip (`metadata.clipCaptions`) and edited with the normal caption
  tools (move, trim, split, retype, delete); the look (size, colour, position, on/off) is
  the project's.
- Preview and export use one zoom window (`clipZoomCropAt` in
  `apps/desktop/src/shared/clip-overlays.mjs`). In the export, a clip with zooms is first
  rendered zoomed on its own (its span only, capped ffmpeg), then used as is; its captions
  are burned in with the recording's.
- **Sound files:** "Add clip at playhead" also takes mp3, wav, m4a, aac, ogg, flac and
  opus. A sound file lands on the Voice lane at the playhead with a Replace / Play over
  choice, like a voice-over take (drag, trim, switch, undo; export mixes it the same way).
- Tests: `apps/desktop/src/shared/clip-overlays.test.mjs`,
  `apps/desktop/src/main/clip-zoom-export.test.mjs`, `scripts/e2e-clip-overlays-export.mjs`
  (real export: zoom window, burned caption, mp3 heard), and
  `scripts/e2e-dev-clip-overlays-playwright.mjs <project>` (real app: zoom, undo/redo,
  caption, mp3 on the Voice lane, with screenshots).

Not done yet: nothing from this spec.

Known limit (outside the spec): an added clip's captions are one set in the language it
was spoken or typed in; a translated caption set of the project does not translate them.
