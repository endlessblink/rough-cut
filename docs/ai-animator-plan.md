# AI Animator — plan

Status: **PLANNED (2026-09-29)** · Tasks: TASK-253 … TASK-262 in `MASTER_PLAN.md`

## What we are building

You say something in your recording; Claude turns the IDEA into an original
illustrated animation that explains it — 2D illustration, diagrams, characters,
or real 3D — timed to your words and **comfortable next to your video** (a
shared accent or mood), never a copy of it.

The video and your words are a **reference, not a spec** (correction from the
owner, 2026-09-30: the first graphic stuck too closely to the source slide).
Claude must invent a visual for the point — a metaphor, a small scene, an
object — not re-typeset the slide title or rebuild the slide's layout.

Example (the skill video, "what is a skill"): not the slide's "מה זה סקיל?"
title again, but e.g. a small robot handed a well-worn recipe card, cooking
the same dish perfectly every time, while a second robot without the card
improvises and burns it — a picture of the idea the slide only names.

## What already exists (built 2026-09-29, reused as-is)

- Claude writes a self-contained HTML page per graphic; the app seeks it frame
  by frame, so preview and export are identical.
- Graphics lane on the shared timeline; move/trim; undo.
- Editable fields (text/colour) applied by the app; "Change with Claude".
- House styles + creativity dial.
- Per-graphic size/position/opacity; guaranteed entrance and exit; drag and
  edge/corner resize on the viewer.
- Seamless looping strips (`data-rc-marquee`), right-to-left safe.
- Local transcription engine (faster-whisper) — not yet feeding graphics.

## Principles (hold for every phase)

1. **Original, not a copy.** The video and your words are references for the
   idea and the mood. Scenes never reproduce on-screen text, slides or layouts;
   they borrow at most an accent colour or feel so they sit well with the video.
2. **Timed to speech.** Beats land on words, from real word timings.
3. **Deterministic.** Any frame renders the same in any order — no clocks, no
   unseeded randomness. Preview = export.
4. **Checked before you see it.** A scene that clips text, runs out, or breaks
   right-to-left order never lands on the timeline unrepaired.
5. **Offline and safe.** Pages have no network; drawing libraries ship inside
   the app. Claude runs through your own Claude login.
6. **Image models only when asked:** GPT Image 2 or Seedream 5, nothing else,
   with a cost preview before any spend.

## Phase 1 — Foundations

### TASK-253 Style reference from the video (loose by default)
- Sample ~8 frames across the recording (screen and camera), plus the project's
  own presentation (background, corner radius, camera shape).
- Measure a palette from the pixels (dominant + accent colours, light/dark).
- Claude looks at 3–4 of the frames and writes the rest: typography (family
  class, weight, Hebrew/Latin), shape language (radius, strokes, flat vs
  textured), layout habits, mood, and **3 do / 3 don't** rules.
- Saved per project as a **reference** with a strength dial: Loose (default —
  borrow one accent colour and the mood only), Close (also type feel and shape
  language). Never "copy": slide text, layouts and the video's own graphics are
  never reproduced at any strength.
- Done when: a scene made with it is judged by you as original AND comfortable
  next to the video.

### TASK-254 Word-timed transcript in the project
- Run the local transcription on the recording (Hebrew + English), store words
  with times in the project; show it read-only in the Graphics panel.
- Selecting a sentence selects its time range on the timeline.
- Done when: the skill video has a transcript whose word times are within
  ~0.1 s of the audio at 5 spot checks.

### TASK-255 Drawing toolkit for Claude (2D + 3D, offline)
- Ship vetted libraries inside the app and let a page ask for them by name:
  3D (three.js), hand-drawn 2D (rough.js), path/morph helpers, a seeded random
  source. No network; the page size limit is raised for scenes only.
- Rules Claude gets: all motion through the seek function; 3D renders one frame
  per seek; fixed seed; fonts from the look profile.
- Spike first: prove a three.js scene renders identically in the live preview
  and in the export pass (offscreen), and measure seconds-per-frame.
- Done when: a 3D test scene exports frame-identical to the preview.

## Phase 2 — "Illustrate this" (the core)

### TASK-256 Illustrate a range from what you said
- Select a range (timeline or transcript) → **Illustrate this** → optional
  one-line direction ("as a factory", "3D", "hand-drawn").
- Claude receives: the words with timings, the look profile, 2–3 frames at
  that moment (what is on screen), where free space is (camera position,
  screen frame), canvas size and length.
- Claude returns a **scene with beats**: each beat = a time (tied to a word),
  what appears/changes, and editable text fields.
- Placement: **overlay** (avoids the camera bubble and important screen areas).
- Done when: the "what is a skill" range produces a scene you'd keep, first
  or second try.

### TASK-257 Beats on the timeline
- The graphic's block shows its beats as ticks; drag a tick to retime a beat
  (the page reads beat times from the app, not hard-coded).
- Done when: retiming a beat changes preview and export identically.

## Phase 3 — Quality gate

### TASK-258 Self-check before it lands
- Render ~6 frames (start, each beat, end) in the background.
- Automatic checks: text clipped or overflowing, content off-canvas, empty or
  frozen frames, strips running out, right-to-left order, contrast.
- Claude reviews the frames against the request and the look profile; one
  automatic repair round; anything still wrong is shown as a short note on the
  graphic instead of silently landing.
- Done when: the broken tape we hit on 2026-09-29 would have been caught and
  repaired automatically.

## Phase 4 — Placement, reuse, polish

### TASK-259 Full-frame cutaway and side-panel placements
- Cutaway: the illustration replaces the screen for its range (camera stays or
  hides, your choice). Side panel: screen shrinks, illustration beside it.
- Needs a compositor change; preview/export parity tests required.

### TASK-260 Templates from your own scenes
- Save any graphic/scene as a template with its fields; reuse instantly with new
  text (no Claude call); "Illustrate similar" keeps the look.

### TASK-261 Exit styles, pinning, sound
- Exit style per graphic; pin a graphic to the camera bubble or a screen spot so
  it follows zooms; 9:16 safe-area guides; optional whoosh/pop on beats from a
  small bundled sound set.

## Phase 5 — Optional generated illustrations

### TASK-262 Illustrations from GPT Image 2 / Seedream 5
- For hero moments only: generate stills in the look profile's style (those two
  models only), with a cost preview before spending; the app animates them
  (depth layers, slow pans, reveals). Local Qwen may make free drafts.

## Order and gates

1 → 2 → 3 must ship in order (look profile and transcript feed everything;
the quality gate protects every later scene). Phase 4 items are independent.
Phase 5 waits for your go-ahead on cost.

Each task is verified in the real packaged app on the skill video; only your
visual sign-off closes it.

## Decisions needed from you

1. First placement: **overlay** (fastest) or **full-frame cutaway** first?
2. 3D in the first pass, or 2D first and 3D right after the spike proves export?
3. Transcript language: Hebrew only, or mixed Hebrew/English per video?
4. Is Phase 5 (paid image models) in scope now or later?

---

## Added 2026-10-01

### Done now: style influence + "Lock style"
- By default the chosen style is a light hint (mood + at most one accent);
  Claude picks its own palette/type/shapes so each graphic is unique.
- "Lock style" switch in the Graphics panel makes Claude follow the style
  closely (colours, type, feel) — for a consistent series. Composition still
  varies per graphic.

### TASK-271 Graphic length: create up to 60 s, lengthen/shorten existing
Owner request: a length slider for new graphics (up to one minute) and a way to
lengthen or shorten one that already exists.

- **New graphics:** a Length slider (2–60 s, default "Auto" = Claude decides).
  Above ~10 s Claude must build a multi-beat scene (build → several beats →
  resolve), not stretch one animation; beats are spaced across the length.
  Larger answers take longer — the progress bar's estimate scales with length.
- **Existing graphics** — today, trimming the block on the timeline already
  changes the length and the exit moves with it, but the middle just holds.
  Offer three ways when the length changes a lot:
  1. **Stretch** (instant, free): play the whole design slower/faster to fit.
  2. **Hold** (instant, free): keep entrance and exit timing, keep the middle
     alive (ambient motion loops) for the extra time.
  3. **Re-time with Claude** (one Claude call): Claude rebuilds the beats for
     the new length.
  Store the designed length with each graphic so Stretch knows the original.
- Export parity: all three render identically in preview and export.
- Decisions for the owner: default for existing graphics (Stretch or Hold)?
  Should the slider also appear on "Change with Claude"?

### TASK-272 AI suggestions panel: useful, good-looking, end-to-end
Finding (2026-10-01): the analysis sends Claude only the clip length and click
count — it never sees what is said or shown, so its zoom/cut suggestions are
guesses. Plan:

1. **Real inputs:** word-timed transcript (TASK-254), silences and filler words
   from the audio, click/typing timestamps and dwell spots from the cursor
   track, and screen-change moments (scene changes in the screen video).
2. **Better suggestions:** cuts for dead air, retakes ("let me say that
   again") and long pauses; zooms on the exact click/typing moments; titles
   and chapter markers from what was said; graphic ideas linked to the
   AI animator ("Illustrate this" on a range).
3. **Review flow:** each suggestion shows its time range on the timeline and
   jumps the playhead there; preview before applying; Apply / Apply all /
   Dismiss; every apply is one undo step; applied items show on the timeline.
4. **Look:** redesign the panel with the app's design system (design-skill
   pass required by the project rules): grouped by type, compact cards with
   time chips, clear empty/loading/error states, the same progress bar as
   graphics generation.
5. **End-to-end check:** run on the skill video with a stand-in Claude answer
   (no live calls by the agent) through analyse → review → apply → undo →
   export; the owner then runs one real analysis to sign off.
