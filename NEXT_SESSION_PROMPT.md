# Rough Cut MVP — Next-Session Handoff Prompt

> Paste this into a new Claude Code instance (or read it first) before starting work. It loads all the context from the prior session without you needing to re-read the conversation.

---

## 1. Project orientation

You're working on **`/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp`** — an Electron-based screen recorder for Linux that produces polished tutorial videos. Style/feature target: Screen Studio. Pipeline: capture → save `.roughcut` projects → preview → export styled MP4 with cursor overlay + zoom animations.

**Read these files first** before any code changes:
- `CLAUDE.md` (repo root) — project conventions including the NVIDIA "Allow Flipping" requirement and the locked-in cursor pipeline rules.
- `MASTER_PLAN.md` — the source of truth for what's done / planned / in-progress. Status table at the top.
- `~/.claude/CLAUDE.md` — global preferences (short answers, no jargon, `/sure` before substantive work, branch-safety rules, etc.).
- `AGENTS.md` (repo root) — agent-facing conventions, committed.

**Architecture map** (memorize the seams):
```
packages/
├── project-model/          # Schemas (Zod), factories, migrations. Schema version 10.
├── timeline-engine/        # Pure functions: zoom transforms, auto-zoom suggestions, leash, spring physics
├── frame-resolver/         # resolveFrame(project, frame, options) — the architectural keystone
├── effect-registry/        # Keyframe interpolation utilities

apps/desktop/src/
├── main/                                    # Electron main process
│   ├── recording/
│   │   ├── recording-session.mjs            # Capture lifecycle, cursor sampling, ffmpeg wiring
│   │   ├── ffmpeg-capture.mjs               # x11grab spawn + first-frame anchor detection
│   │   ├── xdotool-cursor.mjs               # Cursor source for Linux/X11 (bypasses Electron #42519)
│   │   ├── xinput-button-listener.mjs       # Click/drag capture (X11 only)
│   │   └── event-logger.mjs                 # Diagnostic JSONL sidecar (gate via ROUGH_CUT_DEBUG_RECORDING=0)
│   ├── export-service.mjs                   # buildStyledExportArgs, buildCursorAss, exportProjectToMp4
│   ├── zoom-sendcmd.mjs                     # Per-frame crop window pre-computation for ffmpeg sendcmd
│   └── index.mjs                            # Electron entry, IPC handlers
└── renderer/src/
    ├── main.tsx                             # Single-file React app: App, ProjectPreview, panels
    ├── styled-preview.mjs                   # cursorAtFrame (binary search + lerp), drawCursorPath
    ├── zoom-markers.mjs                     # Manual marker add/remove + apply suggestion
    └── auto-zoom-suggestions.mjs            # Suggestion wrapper

scripts/
├── smoke-mvp.mjs                            # Records / saves / reopens / exports
├── smoke-ui.mjs                             # Drives renderer through runRendererUiSmoke
└── smoke-styled-export.mjs                  # FFprobe assertions on styled exports
```

---

## 2. Current stable state (as of 2026-05-04)

- **Last commit**: `6fbafa1 document NVIDIA Allow Flipping requirement + lower TASK-026 urgency`
- **Stable checkpoint tag**: `checkpoint/cursor-stable-2026-05-04` → points at `6a0c0f0` (revert firstFrameMs cursor re-anchor)
- **Tests**: 104 desktop + 91 project-model + ~96 timeline-engine + 57 effect-registry + 1 frame-resolver. All green.
- **Smokes**: `pnpm smoke:mvp`, `pnpm smoke:ui`, `pnpm smoke:styled-export` all pass.
- **Working tree**: clean.
- **Remote**: not configured. Tag and commits are local.

```bash
# Recover this state if anything goes sideways:
cd /media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp
git status              # should be clean
git log --oneline -5    # 6fbafa1 should be at top
git tag -l "checkpoint/*"  # should list cursor-stable-2026-05-03 + cursor-stable-2026-05-04
```

---

## 3. What happened today (3-sentence recap)

Cursor-follow on all markers, click/drag capture, spring-physics + phase-aware focal animations, and a diagnostic event logger all shipped today. We chased an X11 captured-tear race down through several dead ends (xdotool polling rate, xinput motion events, firstFrameMs re-anchor) — each was reverted; the actual fix turned out to be a user-side NVIDIA setting (`Allow Flipping = off`). The session ended by adding three regression guards in `recording-session.test.mjs`, tagging the stable state, and updating `CLAUDE.md` with the locked-in conventions.

**Full commit arc today** (newest first):
- `6fbafa1` document NVIDIA Allow Flipping requirement + lower TASK-026 urgency
- `f00e7c6` add recording-pipeline regression guards (3 new tests, +3 over prior)
- `6a0c0f0` revert firstFrameMs cursor re-anchor — match yesterday's known-good behavior
- `83ddec7` revert motion-event cursor capture, keep first-frame re-anchor
- `4ef0aa3` fix recording-tear race: drop xdotool polling, use xinput motion events ← later partially reverted
- `699220d` add diagnostic event log to pinpoint recording-tear race
- `66e0556` add cursor-visibility guard during hold
- `74a051c` phase-aware focal: cursor follow only during hold + EMA-filtered cursor
- `f83ff83` replace lookback smoothing with critically-damped spring physics
- `1d2f178` reduce zoom-ramp wobble when cursor is moving
- `1f5c776` update MASTER_PLAN: TASK-013 click capture done, visual emphasis pending
- `0204264` cursor-follow on every marker + click/drag capture for auto-zoom
- `433f418` smooth cursor-follow + zoom-in/out animations
- `a4238fd` fix cursor-follow by preserving kind=auto on applied suggestions

---

## 4. HARD RULES — do not violate without explicit `/sure` approval

These are codified as regression tests in `apps/desktop/src/main/recording/recording-session.test.mjs` (search for "REGRESSION GUARD"). Worth knowing in your head:

1. **Cursor sampling is xdotool synchronous polling at 33 ms.** Do NOT replace with xinput motion events / async streams — they have intrinsic IPC latency that produces visible cursor lag during playback. Tried at commit `4ef0aa3`, reverted at `83ddec7`.

2. **Cursor frame numbers are anchored to recording-start, NOT to ffmpeg's first-frame wall-clock.** Do NOT add a re-anchor in `stop()` that shifts cursor event frame numbers. Tried, the user reported "cursor in wrong place", reverted at `6a0c0f0`.

3. **xinput button listener is for clicks/drags ONLY, never motion.** Cursor *position* sampling stays on xdotool. The xinput listener has motion-event support code at the file level but no caller passes `onMotion` — that's intentional dead code, do not wire it up.

4. **NVIDIA "Allow Flipping" must be off** for tear-free recording on this user's NVIDIA + KDE Plasma X11 setup. Documented in `CLAUDE.md`. Don't surface as a code-level requirement; it's a one-time user setup step that persists across reboots.

5. **`-draw_mouse 0`** in ffmpeg x11grab args excludes the system cursor from capture. Our overlay is the only visible cursor in playback. Don't change without coordinating with the cursor overlay rendering in `styled-preview.mjs`.

6. **Cursor coordinates are NEVER clamped at the recorder.** `normalizeCursorPoint` in `recording-session.mjs:124` only rounds, it does NOT clamp to screen bounds. Off-screen positions (cursor on a second monitor) pass through unmodified. Adding any `clamp(x, 0, width-1)` will reintroduce a multi-monitor "stuck on a vertical line" regression.

7. **Don't break cursor-follow on auto AND manual markers.** Engine gate at `packages/timeline-engine/src/zoom-transform.ts:155-159` no longer requires `kind === 'auto'`. Manual markers also follow. The user explicitly chose this; don't revert.

8. **`nullsrc` and `zoompan` default to 25 fps — pin them.** If you ever introduce another lavfi source (e.g., `sine`, `color`), pin its rate to match the recording fps. Test asserts this in `export-service.test.mjs`.

9. **The user's dev machine is X11 + NVIDIA + KDE Plasma + multi-monitor.** Their cursor frequently goes onto a second monitor (coords > 1920). The pipeline must tolerate off-source coordinates throughout.

---

## 5. Next tasks (in priority order)

The user explicitly chose to tackle BOTH of these next session, in this order:

### Task 1 — TASK-024 microphone recording foundation (~1 day)

**Goal**: enable narrated tutorial capture. User picks a mic source, audio is muxed with the video into the saved MP4.

**Architecturally partly plumbed already** (verify before starting):
- `apps/desktop/src/main/recording/ffmpeg-capture.mjs` `buildFfmpegCaptureArgs` (~lines 243-275) ALREADY accepts `micSource` and `systemAudioSource` parameters. Mic + system audio mix is handled.
- `recording-session.mjs:81-89` passes `micSource: null, systemAudioSource: null` to the capture factory — hardcoded to no audio. Just need to thread the user's chosen source through.

**Likely missing**:
- Renderer UI to enumerate PulseAudio sources (`pactl list sources short`) and pick one
- IPC to pass the chosen source name from renderer → main → recording session
- A toggle in the UI for "record with audio" + source selector
- Optional: level meter (read from `pactl subscribe` or ffmpeg's `astats` filter)
- Optional: mute/unmute mid-recording (would require restart-with-different-args or audio filter graph change)
- Verification: end-to-end recording with audio, ffprobe confirms audio stream present, `pnpm smoke:mvp` updated to optionally include audio

**Start with `/sure` Phase 1**:
- Read `recording-session.mjs` start() flow end-to-end
- Read `ffmpeg-capture.mjs` `buildFfmpegCaptureArgs` to confirm what's plumbed
- Read the renderer's record-start UI in `apps/desktop/src/renderer/src/main.tsx` (search for "record" buttons)
- Find the IPC entry in `apps/desktop/src/main/index.mjs`
- Run `pactl list sources short` on the user's machine to see what mic sources exist
- Decide: separate audio-settings panel vs inline option in record button area

### Task 2 — TASK-028 aspect ratio templates (NEW, ~1-2 days)

**Goal**: support multiple output aspect ratios — 16:9 (current), 9:16 (mobile/shorts), 1:1 (square), 4:5 (Instagram portrait), and possibly arbitrary user-specified.

This task does NOT exist in `MASTER_PLAN.md` yet. **Add it as TASK-028** during the `/sure` cycle.

**The hard decision**: how to map a 16:9 source recording to a non-16:9 output. Options:
- **Crop**: lose pixels on left/right (or top/bottom). For 9:16 from 16:9, crop the center column.
- **Letterbox**: keep full source, add bars on the sides. Bad for tutorials (wasted space).
- **Smart crop**: use cursor-follow logic to bias the crop toward where the action is. The cursor-follow infrastructure already exists in `zoom-transform.ts` — could be reused.

**Files likely affected**:
- `packages/project-model/src/schemas.ts` — add output-dimension or template-id field. Schema bump (current version 10 → 11).
- `packages/project-model/src/migrations.ts` — backfill default for old projects.
- `apps/desktop/src/main/export-service.mjs` — `buildStyledExportArgs` currently hardcodes 1920×1080. Make it parameterized.
- `apps/desktop/src/main/zoom-sendcmd.mjs` — already takes sourceWidth/sourceHeight; needs to know output dims if scaling is asymmetric.
- `apps/desktop/src/renderer/src/main.tsx` — preview canvas dimensions; UI to pick template.
- `packages/timeline-engine/src/zoom-transform.ts` — if smart-crop is the chosen mapping, focal computation needs to know the output aspect.

**Schema decision (ask user)**: store as preset id (`'16:9' | '9:16' | '1:1' | '4:5' | 'custom'`) plus optional custom dimensions, OR as raw width/height? Preset is cleaner; custom is escape-hatch. Probably both.

**Verification needs to be careful**:
- Smoke test should record from a known synthetic source, export at each aspect ratio
- ffprobe-assert dimensions and aspect ratio
- Manual: record a 30-second screen, export at 9:16, confirm the action area (cursor) stays visible

### Optional follow-ups (after Tasks 1 & 2)

- **TASK-013 finish (click visual emphasis rings/ripples)** — capture is done, only renderer work remains. Low effort, high polish.
- **Workflow polish bundle**:
  - TASK-020 countdown before recording
  - TASK-021 recording indicator + elapsed time
  - TASK-022 open recording/project folder action
  - TASK-023 recent projects/recordings list
- **Diagnostic logger gate** — `event-logger.mjs` is currently ON by default. Once confidence is high, gate it OFF (env var only).
- **TASK-026 Wayland migration** — deprioritized (NVIDIA Allow Flipping fix eliminated the urgency). Still long-term P1 for X11 deprecation, but no user-visible motivation right now.

---

## 6. Verification protocol — after EVERY substantive change

```bash
pnpm typecheck                   # must be clean across 5 packages
pnpm test                        # all green; check regression guards in recording-session.test.mjs pass
pnpm smoke:mvp                   # record/save/reopen/export
pnpm smoke:ui                    # canvas + panels + export click flow
pnpm smoke:styled-export         # cursor + zoom export quality
# pnpm smoke:package             # only when packaging matters (slow, requires pnpm package:linux first)
```

**Manual verification in `pnpm dev`** is required by the project's Development Rule for any user-visible capture/export change. Set status to IN PROGRESS, ask the user to verify, flip to DONE in a follow-up commit.

**Commit message style**: include exact test counts (e.g., "104/104 desktop, was 101, +3 regression guards") and reference the tasks/regressions involved.

---

## 7. User preferences (load these into your interaction model)

From `~/.claude/CLAUDE.md` and observed patterns:

- **Response style**: short, plain language, no jargon, no headers for routine answers, options not full implementation plans. Save deep technical for explicit "details" / "go deeper" / "show me" requests.
- **Options not plans**: when proposing changes, give 1-2 options with the tradeoff, not a multi-section implementation plan.
- **`/sure` before substantive work**: the user invokes this skill to challenge confidence. Be brutally honest — LOW confidence is OK. Don't fabricate HIGH from agent summaries; do real file reads.
- **Plan mode + `/sure` interplay**: user often pre-empts `ExitPlanMode` with `/sure` to challenge confidence. Read 4-5 critical files yourself, update the plan with verified facts, re-run `/sure` honestly, then re-request approval.
- **Surgical commits**: when working tree has unrelated WIP, commit only your changes. Use the git plumbing trick (see DROPOFF.md from the prior session for the pattern). User has a hard rule against `git checkout HEAD -- file` (denied at the permission layer).
- **Test discipline**: typecheck + tests + smokes after every substantial change. Numbers in commit messages help.
- **No emojis** unless explicitly requested.
- **Date/time accuracy**: run `date +"%Y-%m-%d %H:%M %A"` before any date output. System clock is Israel time (IDT/IST).
- **Branch safety**: NEVER PR a branch that's been behind main for >2 days without rebasing first. Cherry-pick onto a fresh branch instead. (User got burned by this; it's now a hard rule in their global CLAUDE.md.)

---

## 8. Verify you loaded this correctly before starting

Before writing any code, post these back to the user:

1. The exact commit hash you're starting from (`git log --oneline -1`)
2. Which task you're tackling first (TASK-024 microphone — that was the user's chosen first)
3. The first 3 files you'll read in Phase 1 of the `/sure` cycle for that task
4. One specific question about scope or approach

If those four things look right, you've loaded the handoff correctly.

---

## 9. If something is unclear

Read these in order:
- `MASTER_PLAN.md` — find the task by ID
- The "Completion Notes" section under any DONE task — explains what was built and why
- `git log --oneline -30` — recent commit messages tell the story
- The `*.events.log` sidecars in the user's recordings folder — diagnostic logs from real recordings (gated by `ROUGH_CUT_DEBUG_RECORDING`)

If you're STILL not sure: ask the user one specific question, don't guess. The user prefers a quick clarifying question over a wrong implementation.
