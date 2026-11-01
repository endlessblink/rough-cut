# Plan: AI agents edit a video end to end in Rough Cut

Goal: an agent (Claude, Codex, anything with MCP) can take a raw recording and hand back a finished, quality-checked cut in a few calls, without parsing project files, without huge replies, and with one click for the user to accept it.

Definition of done: on the 2026-10-27 Mixamo recording (18 min, 1247 words, ~6 intro retakes, ~40 silent stretches, 3 private screens), an agent produces the same 10-minute cut in **under 8 tool calls**, each reply under ~1.5k tokens, and Noam accepts it with **one click**.

## What I hit in the real run (evidence)

| Pain | What happened |
|---|---|
| No transcript tool | `video_digest` says "use get_transcript", that tool does not exist. I parsed the .roughcut JSON by hand. |
| Transcript times unreliable in places | Local Hebrew model wrote text over quiet stretches (e.g. 654-657s "speech" sits inside a silent stretch). No confidence/quality flag exposed. |
| Huge replies | Every `apply_edit` returns the whole timeline summary (3 tracks x every clip), 3k to 7k tokens each, growing with each cut. 21 cuts = ~100k tokens. `video_digest` reply was cut off at 25k tokens. |
| One cut per call | Cuts must go end to start by hand so times do not shift. |
| No repeat/silence tool | Finding retakes, silences and private screens was all manual judgment. |
| Stray leftovers | Every cut leaves a 2-frame clip at the end that rendered as a green flash. |
| One-by-one accept | Each cut is a separate "Agent edit" for Noam to take. |
| No privacy awareness | Nothing flags account lists, inboxes, password fields. |
| Review is slow | Checking the result needed a full draft render plus a contact-sheet digest. |

## Design rules

1. **Intent in, small receipt out.** Agent says what to keep or remove; server returns one line per change plus new total length. Never the whole timeline unless asked.
2. **Source time, not timeline time.** Every tool addresses the original recording's seconds so order does not matter and nothing shifts.
3. **Everything lands as one reviewable group** ("Agent edit set: 14 cuts, 18:00 to 10:30") that the user accepts, rejects, or expands in one click. Originals are never touched.
4. **Evidence travels with the edit.** Each cut carries a reason ("retake of intro", "login screen with account list") and a before/after frame, so review is a glance, not a re-watch.

## Phase 1: stop the bleeding (small, mostly MCP server only)

All in `scripts/mcp/rough-cut-mcp.mjs` (674 lines, one file).

1. **`get_transcript {project|video, from?, to?, format}`**: returns words with source seconds, plus per-segment `silent: true` and `confidence`, as compact lines (`[85.8-103.1] text`). Fixes the dead "use get_transcript" hint in the digest.
2. **`apply_edit` compact receipts**: default reply = `{ok, op, removedSec, newDurationSec, editId}`. `verbose: true` returns the old full summary.
3. **`apply_edits` (batch)**: array of ops, applied atomically in source time (server sorts and merges). One call, one receipt. Also accepts `dryRun`.
4. **Fix the 2-frame leftover**: cut_range must not create zero-length or end-of-media tail clips; add a test that a cut at any point leaves no clip under 3 frames.
5. **`video_digest` pagination**: `{scenes: "0-20"}` and `compact: true` (no per-scene OCR dump), so it never exceeds the reply limit.

Done when: the Mixamo cut can be reproduced with get_transcript + one apply_edits, reply sizes under 1.5k tokens, no stray clips.

## Phase 2: let the app find the edits (new analysis, runs locally)

New MCP tool **`suggest_cuts {project, goals:[silences, retakes, privacy, filler]}`** returning a proposed edit list (not applied) for the agent or user to approve.

- **Silences**: from audio energy, not transcript (reuse the digest's silent stretches); keep a configurable breath (default 0.25s) and never cut inside screen-demo playback where visuals change (compare scene-change score), so a Blender animation playing silently survives.
- **Retakes**: cluster transcript sentences by similarity within a 3 minute window; keep the last complete take by default (override: best by confidence), cut the earlier ones at word boundaries. Flag false starts ("ו...", repeated openers).
- **Filler**: "אה", "אהמ", "um/uh" runs, optional.
- **Privacy scan**: OCR the sampled frames already extracted by the digest; flag email addresses, inbox/account-chooser layouts, password fields, `Dolphin` paths with personal folder names. Proposed as "cut or blur", always requires approval.
- **Transcript trust**: mark stretches where text overlaps measured silence as `unreliable` and exclude them from retake logic.

Each suggestion = `{startSec, endSec, kind, reason, confidence, thumbBefore, thumbAfter}`.

Done when: running `suggest_cuts` on the Mixamo recording proposes the same retake and privacy cuts I made by hand (checked against my cut list), with no cut inside the Blender playback.

## Phase 3: one-click review in the app

Work in the app's Agent edits panel (Dev menu today).

1. **Edit sets**: group all edits from one agent run; buttons **Take all**, **Skip all**, **Review each**.
2. **Review strip**: each change shows reason, before/after frame, and play-across-the-cut preview (2s before, 2s after).
3. **Undo as a group** and per-change toggle.
4. **Accept lands in the user's own project** (never overwrites; respects "user edits always win" and does not write while the project is open elsewhere).
5. Promote Agent edits out of the Dev menu into a normal "Review AI edit" entry.

Done when: Noam accepts the Mixamo cut with one click and can step through each cut with the strip.

## Phase 4: end-to-end agent workflow and self-check

1. **`review_edit {project}`**: renders a low-res proxy of the edit copy in seconds (not a full draft), returns contact sheet around each cut join, checks: no clip under 3 frames, no black/green frames, audio not clipped at joins, total length, private-screen scan on the result, and "words cut mid-word". Returns pass/fail list.
2. **`edit_recording` macro prompt** (MCP prompt, like `watch_and_discuss`): the documented recipe: digest compact -> get_transcript -> suggest_cuts -> agent adjusts -> apply_edits -> review_edit -> hand to user. So any agent follows the same path.
3. **Docs**: one page "Editing with an AI agent" with the recipe and the reply-size budget.

## Phase 5: precision extras (after the above is solid)

- Word-level cut snapping with crossfade of a few frames at joins (no audio pops).
- Multi-take picker: for repeated sentences, show all takes and let the agent choose by delivery (pace, filler, confidence).
- Chapter/title suggestions and caption on/off in the same receipt.
- Export hook: `export_styled` with the review checks run first.
- Transcript quality: allow choosing a better model for Hebrew and re-transcribe only flagged stretches.

## Order and effort

| Phase | Effort | Why this order |
|---|---|---|
| 1 Stop the bleeding | 1 to 2 days | Removes 90% of the token cost and the transcript hack; low risk. |
| 2 suggest_cuts | 3 to 5 days | The real "smart" part; needs the transcript trust flag from phase 1. |
| 3 One-click review | 3 days | Needs the edit-set format from phase 1. App UI, so real visual check required. |
| 4 review_edit + recipe | 2 days | Closes the loop so agents can verify themselves. |
| 5 Extras | open | Only after Noam accepts phases 1 to 4 on real footage. |

## Rules while building

- Test on real recordings (the Mixamo one is the benchmark) and judge by Noam's confirmation, not by passing tests.
- Do not edit the main tree while his `pnpm dev` runs; build in a worktree.
- No cloud LLM calls for analysis; local models and plain signal processing only.
- Edits never change originals; the user's own edits always win.

## First step if approved

Phase 1, items 1 to 4 in a worktree, benchmarked by redoing the Mixamo cut with `get_transcript` + one `apply_edits` call.

## Status

Phase 1 items 1 to 4 built 2026-10-31 on local branch feat/ai-edit-phase1 (worktree rough-cut-ai-edit, commit 4f633a7), checked by scripts/e2e-mcp-batch-edits.mjs (9 checks pass). Correction: the "stray 2-frame clip" came from a cut that stopped 2 frames short of the end, not from a cut bug; cuts within 3 frames of an edge are now widened to the edge. Not yet merged into the dev branch, so the running MCP does not have the new tools. Item 5 (digest paging) and phases 2 to 5 not started.

Update: phase 1 item 5 (digest paging, digest reply on the Mixamo recording went from cut off at 25k tokens to ~5.6k chars) and phase 2 first version of suggest_cuts (retakes, silences kept only when the picture is truly still, privacy screens) built on the same branch, commit after 4f633a7. On the Mixamo recording it proposes the same intro-retake, 225-279, 474-516, 684-695 and privacy cuts I made by hand, and keeps the silent Blender playback. Not yet: blur option, filler words, review UI (phase 3), review_edit (phase 4).

Update 2: review_edit (phase 4, first version: slivers, gaps, overlaps, black frames in a rendered draft, join times) built, commit 0adefa8, same local branch. Still open: Phase 3 app UI (take all, move Agent edits out of the Dev menu), filler words and blur in suggest_cuts, edit_recording recipe prompt, merge into the branch the app runs from. A new instance could not be started: TermFleet said it cannot identify this session card, so the work continued in this session.

## Lesson from Noam on the first AI cut (2026-10-31): "really bad, interrupting, jarring"

Cause: cuts were placed from transcript times, so some landed inside words; and cuts close together left 2 to 5 second fragments of speech between jumps. Redone as AI cut 2: every cut edge is moved into a real pause measured from the sound (silencedetect), 0.2 s of room tone kept each side, and any kept piece under 8 s between two cuts is merged away (shortest piece now 9 s, 17 pieces, 11:48). The first attempt is kept as version "AI cut 1". Rules to build into suggest_cuts/apply_edits: snap edges to silence; no fragments under ~8 s; keep room tone; never cut inside a visual demo; judge by Noam, not by tests.

## Versions design (Noam 2026-10-31: separate projects get messy)

Store AI versions INSIDE the one project as small cut lists over the same recording (a version is a list of kept stretches, not a copy of the whole project), so the folder keeps one file. Switching a version swaps the timeline; "My edit" stays untouched. Show only the last 3 versions as pills plus a "More" list; names are automatic (AI cut 1, 2, 3) and renamable; pin keeps one forever; unpinned ones beyond the 10 newest are archived (still restorable). Opening a version for hand editing turns it into "My edit copy". The MCP writes versions through the same edit journal.

Update (1 Nov): cut now AI cut 4, 8:41, 11 hand-picked repeat and false-start cuts made after reading the final transcript; repeat check went from 12 to 4 (the 4 left are different sentences that share words). Earlier versions saved as AI cut 1, 2, 3 files beside the project. Skill written: ~/.claude/skills/video-edit-quality/SKILL.md. Still to build: an automatic version of the transcript read-through (the chunk-based repeat finder was too weak on Hebrew, so I did it by reading).

## Rule from Noam (1 Nov): all original content must stay reachable after an AI edit

Today AI cuts are real timeline cuts (rippleDeleteRange): the pieces keep their source range, but dragging a piece edge does not reveal the removed part, so he cannot trim the content back. The app already lists removed stretches in the right panel (Removed parts, Hidden ranges, restore one or all; code in main.tsx near listCutRanges), but that is not edge trimming. Fix to build: (1) AI versions are cut lists over the full recording, never a rebuilt timeline, so the original is always whole behind them; (2) each AI cut shows a soft handle on the timeline: drag it to take back or give away a few seconds, or click it to restore the removed stretch; (3) trimming a clip edge into a neighbour rolls the cut point (roll edit) instead of being blocked. Needs a look at the timeline trim code before building.
