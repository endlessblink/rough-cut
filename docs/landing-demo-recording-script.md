# Landing page demo — recording script

For: the Rough Cut landing page (`docs/site`). Audience: people who make product demos.
Goal: every clip on the page is a real Rough Cut recording, showing the three things that matter
together: **zoom that follows clicks**, **cuts that keep sound linked**, **animated graphics from a sentence**.

Nothing here is faked. If a take doesn't work in the app, we don't show it.

---

## Before you record (once)

- Screen: 1920×1080 (or 2560×1440, then export at 1080p). Hide desktop clutter, notifications off.
- "Allow Flipping" off in nvidia-settings (already the case on this PC).
- Camera on, round bubble, bottom-right. Mic on. Quiet room.
- **Behind you / on screen: agent skills.** The screen subject is something real and alive: a
  folder or page of agent skills (e.g. the skills list in a terminal or editor, a skill's SKILL.md
  open, Claude Code running a skill). Not the beige poster page.
- Rough Cut background: one of the dusk/plum gradients so it matches the site.
- Cursor: styled cursor on, medium size.

---

## Take 1 — Hero loop (8–12 s, no sound needed) → hero capture on top of the page

The page's first image. It must show all three at once in one short, loopable clip.

1. Start already inside **Recording edit** with a finished project open (your agent-skills take).
2. Press play. Within the first 3 s a click happens on screen and the view **zooms in smoothly** on it.
3. The playhead crosses a **cut** on the timeline — picture and sound jump together, no gap.
4. An **animated title** comes in over the video (made earlier from one sentence, e.g.
   "Agent skills, one folder away").
5. Zoom eases back out. End on a frame that matches the start so it loops.

Keep the full editor window visible (preview + timeline lanes: Graphics, Screen, Audio, Zoom).

## Take 2 — Zoom that follows your clicks (10–15 s) → proof block 1

1. Raw recording: you open a skill file and click 3 times in different places.
2. In Recording edit, show the **Zoom lane fill in automatically** from those clicks.
3. Play it: each click gets a smooth zoom, cursor stays exactly on target.
4. Optional: drag one zoom block wider on the timeline to show it is editable.

Also export the same 5 s **twice**: once with zoom, once without (for a before/after pair).

## Take 3 — Cut with sound linked (10–15 s) → proof block 2

1. Talking-head + screen take with a mistake or a long pause in the middle.
2. Select the bad range on the timeline, delete it.
3. Show screen, camera and audio lanes all closing the gap together.
4. Play across the cut: no stutter, voice continues cleanly.

## Take 4 — Graphics from a sentence (15–20 s) → proof block 3

1. Open the **Graphics** tab.
2. Type one plain sentence, for example: "Big title: Agent skills, one folder away. Slide in, then fade."
3. Generate (real Claude call — your account, your run).
4. Show the graphic appear on the **Graphics lane** and play live over the video with you in the bubble.
5. Optional second line to show a lower-third: "Lower third: Noam — building Rough Cut".

If a generation looks wrong, re-run it; keep the honest one you'd actually ship.

## Take 5 — Finished export (20–40 s, with sound) → "See it in action" video

The final MP4 from Takes 1–4's project: you in the bubble explaining in 2–3 sentences what you're
showing, zooms on clicks, one clean cut, one animated title. This replaces the poster-study MP4.

---

## What to hand back

Drop the files in one folder and tell me where. Names I'll wire into the page:

| File | Used for |
|---|---|
| `hero-loop.mp4` + a still frame `hero-loop.webp` | Hero capture (Take 1) |
| `zoom-on.mp4`, `zoom-off.mp4` | Zoom proof (Take 2) |
| `linked-cut.mp4` | Cut proof (Take 3) |
| `graphics-from-sentence.mp4` | Graphics proof (Take 4) |
| `demo-export.mp4` | "See it in action" (Take 5) |
| The exact sentence(s) you typed in Take 4 | Caption under the graphics proof |

Short and clean beats long. If one take is missing, its page slot stays in an honest
"demo coming" state — no stand-in footage.
