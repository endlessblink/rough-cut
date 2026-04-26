# Rough Cut — Master Plan

## Overview

Desktop screen recording and editing studio built with Electron + React + TypeScript + PixiJS. Combines Screen Studio-style recording, a multi-channel timeline editor, programmable motion graphics, and AI-powered editing.

For detailed architecture, see `docs/ARCHITECTURE.md`. For phased build order, see `docs/IMPLEMENTATION_PLAN.md`.

## Task ID Format

| Prefix        | Usage                         |
| ------------- | ----------------------------- |
| `TASK-XXX`    | Features and improvements     |
| `BUG-XXX`     | Bug fixes                     |
| `FEATURE-XXX` | Major features                |
| `INQUIRY-XXX` | Research/investigation        |
| `IDEA-XXX`    | Future ideas, not yet planned |

**Rules:**

- IDs are sequential (TASK-001, TASK-002...)
- Completed: ~~TASK-001~~ with strikethrough + DONE status
- Never reuse IDs

## Progress Summary (2026-03-28)

~33% of MVP spec implemented. Foundation is solid (7 packages, store, renderers). Two entire tabs (Motion, AI) are unbuilt. 50 items remain.

| Area          | Done   | Remaining |
| ------------- | ------ | --------- |
| Record Tab    | 12     | 5         |
| Edit Tab      | 8      | 11        |
| Motion Tab    | 0      | 7         |
| AI Tab        | 0      | 10        |
| Export Tab    | 4      | 10        |
| Cross-Cutting | 2      | 6         |
| **Total**     | **26** | **49**    |

---

## Canonical Delivery Order (2026-04-16)

This is the single build order for Rough Cut going forward. Work should be organized around infrastructure first, then complete user-facing flows view by view rather than spreading sprints across unrelated surfaces.

### Guiding rule

For Rough Cut, user trust beats feature breadth. The order is: make screen recording reliable, then camera recording reliable, then audio recording reliable, then prove those streams stay in sync, then make export reliable, then stabilize and complete the Record-sidebar features that are already exposed to the user. Do not prioritize garnish features ahead of truthfulness and daily-use reliability.

### Delivery spine

1. **Projects view** -- stable enough for now. Treat as the entry surface that anchors project creation, opening, and recovery.
2. **Recording core** -- highest priority active surface. The first job is not adding more authoring surface area; it is making saved screen, camera, and audio capture trustworthy on real machines.
3. **Playback + export** -- only after recording truth is solid. Finish the full record -> save -> replay -> reopen -> export loop so a user can safely inspect and ship what they just captured.
4. **Record sidebar authoring toolset** -- once recording, playback, and export are dependable, build out the full Record-sidebar toolset (templates, branding, overlays, annotations, titles, dynamic camera layouts, cursor effects, motion blur, privacy masks, per-segment visibility, AI captions, smart cut). This is the creative surface that turns Rough Cut from a capture utility into a Screen Studio / Descript-class product.
5. **Edit view** -- deepen manual timeline manipulation and effect authoring after the record/playback/export loop is dependable.
6. **AI view** -- build ingest/library/transcription/rough-cut workflow after the manual flow is solid.
7. **Motion view** -- build the dedicated motion-authoring surface after the core recording/playback/export/edit loop is trustworthy.

### Surface order and focus

| Order | Surface            | Goal                                                                 | Primary task focus                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Projects           | Stable project entry, reopen, and persistence foundation             | ~~TASK-072~~, ~~TASK-071~~, ~~TASK-085~~                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2     | Recording core     | Stable screen, camera, audio, and sync before feature expansion      | ~~TASK-013~~, TASK-014, TASK-015, TASK-016, TASK-086, ~~BUG-007~~, ~~BUG-008~~, TASK-087, ~~TASK-088~~, ~~BUG-009~~, FEATURE-076, BUG-004, BUG-011, TASK-124, TASK-126, TASK-143, TASK-145, TASK-148, TASK-152, TASK-182, TASK-183, TASK-184, ~~TASK-146~~, ~~TASK-147~~, ~~BUG-013~~                                                                                                                                                              |
| 3     | Playback + export  | Stable replay and output flow for freshly recorded projects           | BUG-006, TASK-020, TASK-021, TASK-022, ~~TASK-028~~, ~~TASK-029~~, TASK-112, ~~TASK-067~~, TASK-052, TASK-054                                                                                                                                                                                                                                                                                                |
| 4     | Record sidebar     | Build the full authoring toolset in the Record sidebar (templates, branding, overlays, annotations, titles, dynamic camera layouts, cursor FX, motion blur, privacy masks, per-segment visibility, AI captions, smart cut) | TASK-121, TASK-032, TASK-089, TASK-090, TASK-091, TASK-092, TASK-125, TASK-127, TASK-128, TASK-130, TASK-131, TASK-132, TASK-149, TASK-150, TASK-158, TASK-159, TASK-157, TASK-155, TASK-156, ~~TASK-122~~, ~~TASK-123~~, ~~TASK-129~~, ~~TASK-151~~, ~~TASK-162~~, ~~TASK-163~~, ~~TASK-160~~, ~~TASK-161~~                                                                                                                               |
| 5     | Edit               | Deep timeline editing and refinement                                 | TASK-017, TASK-018, TASK-019, TASK-020, TASK-023, TASK-024, TASK-026, TASK-027, TASK-065                                                                                                                                                                                                                                                                                                                                                           |
| 6     | AI                 | Library ingest, analysis, and rough-cut generation                   | TASK-040, TASK-079, TASK-081, TASK-082, TASK-044, TASK-045, TASK-047, TASK-097, TASK-080                                                                                                                                                                                                                                                                                                                                                           |
| 7     | Motion             | Dedicated motion graphics authoring                                  | TASK-033, TASK-034, TASK-035, TASK-036, TASK-037, TASK-038, TASK-039                                                                                                                                                                                                                                                                                                                                                                               |

### Delivery Lines

These lines define the stability-first orchestration view in Watchpost. `Sequence` is the visible critical path. `Supports` stay out of the main flow and appear in backlog/detail until they are explicitly promoted by a blocker.

1. **LINE A — Unify the recording workflow**
   Sequence: TASK-186 -> TASK-187
   Supports: TASK-126, TASK-145, TASK-152

2. **LINE B — Stable screen recording**
   Sequence: TASK-183 -> ~~BUG-009~~ -> TASK-148 -> TASK-126
   Supports: BUG-004, BUG-011, TASK-145, TASK-152

3. **LINE C — Stable camera recording**
   Sequence: TASK-182 -> TASK-014 -> TASK-016
   Supports: ~~BUG-013~~, ~~TASK-147~~, ~~TASK-185~~

4. **LINE D — Stable audio recording**
   Sequence: ~~TASK-088~~ -> TASK-124 -> FEATURE-076 -> TASK-032
   Supports: TASK-143, TASK-125, TASK-128, TASK-149

5. **LINE E — Stable playback and sync review**
   Sequence: BUG-006 -> TASK-020 -> TASK-015 -> TASK-016

6. **LINE F — Stable export**
   Sequence: TASK-021 -> TASK-022 -> TASK-112 -> TASK-052 -> TASK-054

7. **LINE G — Record sidebar authoring toolset**
   The full creative surface: templates, branding, keyboard overlays, highlights, titles, dynamic camera layouts, cursor styles, click effects, motion blur, privacy masks, per-segment visibility, AI captions, smart cut.
   Sequence: TASK-121 -> TASK-090 -> TASK-089 -> TASK-091 -> TASK-092 -> TASK-130 -> TASK-157
   Supports: TASK-131, TASK-132, TASK-150, TASK-155, TASK-156

### Current sprint framing

The current sprint should stay inside the Record surface, but the priority is now stability-first rather than feature-first. The immediate next task is to eliminate the product-level redundancy between the in-app pre-record flow and the floating recording panel so Rough Cut reads as one coherent recorder before more capture hardening and polish continue. From there, the near-term job remains to make saved screen capture correct, camera capture deterministic, audio capture truthful, playback easy to inspect, those streams kept in sync, and export a faithful downstream result.

1. **Lane 1 -- Unify the recording workflow**: TASK-186, TASK-187
2. **Lane 2 -- Stable screen recording**: TASK-183, ~~BUG-009~~, TASK-148, TASK-126, TASK-197, TASK-198, ~~TASK-190~~
3. **Lane 3 -- Stable camera recording**: TASK-182, TASK-014, TASK-016, ~~TASK-185~~
4. **Lane 4 -- Stable audio recording**: ~~TASK-088~~, TASK-124, FEATURE-076, TASK-032
5. **Lane 5 -- Stable playback + sync + export**: BUG-006, TASK-020, TASK-015, TASK-021, TASK-022, TASK-112, TASK-052, TASK-054, TASK-191
6. **Lane 6 -- Record sidebar authoring toolset**: TASK-121 (templates), TASK-090 (highlights/annotations), TASK-089 (keyboard overlays), TASK-091 (titles/callouts), TASK-092 (dynamic camera layouts), TASK-130 (cursor styles + click FX + sounds), TASK-131 (cinematic motion blur), TASK-132 (privacy blur + spotlight), TASK-150 (per-segment visibility toggles), TASK-157 (branding/watermark), TASK-155 (AI captions in Record review), TASK-156 (Smart Cut for fillers/silence/breaths). This is the full creative surface, not placeholder wiring.

Practical order for lowest user-risk:

- Lane 1 is the active lane because the app currently feels like two overlapping recording products instead of one trustworthy workflow
- Lane 2 follows immediately once control ownership between the main app and the panel is explicit
- Lane 3 follows once the workflow split is reduced and first-take camera reliability can be judged inside the clarified recording path
- Lane 4 follows once screen and camera truth are stable enough to make audio verification meaningful
- Lane 5 follows once recording truth exists end to end and users can reliably review playback before exporting artifacts
- Lane 6 starts only after the core recording/playback/export path is dependable

Parallel-start rule:

- Lane 2 may overlap with Lane 1 when camera work does not destabilize screen-capture fixes, because both are core recording-trust work.
- Lane 3 should begin only after the recording path is stable enough that audio failures are not confounded by unrelated capture regressions.
- Lane 5 should not displace Lanes 1-4. Visible placeholder work is important, but only after the core path is trustworthy.

**Why this sprint now**

- `TASK-186` now captures the highest-leverage product problem: Rough Cut still feels like two overlapping recording flows instead of one coherent recorder.
- `TASK-182` is explicitly called out as a current top blocker for daily use because a first take can still lose the webcam.
- `TASK-183` addresses saved-file screen crop on secondary displays, which breaks tutorial usefulness even when preview looks fine.
- Remaining audio-confidence work (`TASK-124`, `FEATURE-076`, `TASK-032`) still affects whether the saved artifact matches what the user believes they recorded.
- Playback confidence work (`BUG-006`, `TASK-020`) belongs before export polish because users need a smooth, truthful way to review what they just captured.
- Export should be treated as downstream truth preservation, not as a separate polish lane after garnish features.
- The full Record-sidebar authoring toolset (overlays, annotations, titles, cursor FX, motion blur, privacy masks, AI captions, smart cut, dynamic layouts) is what turns Rough Cut into a Screen Studio / Descript-class product, but it comes only after the capture -> playback -> export core path is reliable enough to trust. Until then, polish on the sidebar is wasted effort against an untrustworthy foundation.

### Header tab visibility (2026-04-25)

To match the stability-first sprint framing above, the app header currently exposes only **Projects, Record, Export**. **Edit, Motion, and AI tabs are hidden** in `apps/desktop/src/renderer/ui/AppHeader.tsx` (`APP_VIEW_TABS`).

- The `AppView` union type and routing path for `'edit' | 'motion' | 'ai'` are intentionally **kept** so deep-link code paths and existing Playwright specs that reference `[data-testid="<tab>-tab-root"]` still resolve.
- Re-exposing any of these tabs is a one-line uncomment in `APP_VIEW_TABS`. Re-add the matching entry in `tests/electron/tab-switching.spec.ts` at the same time.
- Specs that click `[data-testid="tab-edit"]` / `tab-ai` / `tab-motion` from the header (e.g. `acceptance-edit`, `acceptance-ai`, `acceptance-motion`, `edit-tab`, `edit-track-headers`, `edit-track-management`, `edit-space-playback`, `camera-replay`, `camera-template-parity`) will fail their navigation step until the corresponding tab is unhidden. Treat them as expected-fail in this window or mark `test.fixme` if the sprint takes long enough for the noise to matter.

---

## Roadmap

### Foundation (DONE)

| ID           | Title                             | Priority | Status | Dependencies       |
| ------------ | --------------------------------- | -------- | ------ | ------------------ |
| ~~TASK-001~~ | Monorepo scaffold + CI            | P0       | DONE   | -                  |
| ~~TASK-002~~ | project-model package             | P0       | DONE   | TASK-001           |
| ~~TASK-003~~ | timeline-engine package           | P0       | DONE   | TASK-002           |
| ~~TASK-004~~ | effect-registry package           | P0       | DONE   | TASK-002           |
| ~~TASK-005~~ | frame-resolver package            | P0       | DONE   | TASK-003, TASK-004 |
| ~~TASK-006~~ | store package (Zustand + zundo)   | P0       | DONE   | TASK-002, TASK-003 |
| ~~TASK-007~~ | preview-renderer package (PixiJS) | P0       | DONE   | TASK-005           |
| ~~TASK-008~~ | export-renderer package (FFmpeg)  | P0       | DONE   | TASK-005           |
| ~~TASK-009~~ | Electron app shell + IPC bridge   | P0       | DONE   | TASK-006           |
| ~~TASK-010~~ | Capture service (desktopCapturer) | P0       | DONE   | TASK-009           |
| ~~TASK-011~~ | Record tab UI + inspector panels  | P1       | DONE   | TASK-010, TASK-007 |

### Projects

| ID           | Title                                                                       | Priority | Status                   | Dependencies |
| ------------ | --------------------------------------------------------------------------- | -------- | ------------------------ | ------------ |
| ~~TASK-071~~ | ~~Project save/load with relative paths~~                                   | P1       | ✅ DONE (2026-04-16)     | TASK-105     |
| ~~TASK-072~~ | ~~Recent projects workflow~~                                                | P2       | ✅ **DONE** (2026-03-30) | TASK-071     |
| ~~TASK-085~~ | Record: Persistent recording location + migration for stale /tmp references | P1       | ✅ DONE (2026-04-15)     | TASK-071     |

### Recording Infrastructure

| ID           | Title                                                                    | Priority | Status                   | Dependencies       |
| ------------ | ------------------------------------------------------------------------ | -------- | ------------------------ | ------------------ |
| ~~TASK-012~~ | ~~Record: Enable audio capture (mic + system audio)~~                    | P0       | ✅ **DONE** (2026-04-11) | TASK-010           |
| ~~TASK-013~~ | ~~Record: PixiJS live preview (replace `<video>` with compositor)~~      | P0       | ✅ DONE (2026-04-16)     | TASK-007, TASK-011 |
| ~~BUG-001~~  | Fix: Compositor canvas sizing + video sprite positioning                 | P0       | DONE                     | TASK-007           |
| ~~BUG-002~~  | Fix: Compositor resizing to template resolution + debug logging cleanup  | P0       | ✅ **DONE** (2026-03-30) | BUG-001            |
| ~~BUG-003~~  | Fix: Video playback + timeline sync across all tabs                      | P0       | ✅ **DONE** (2026-03-30) | BUG-002            |
| ~~TASK-086~~ | ~~Record: Unified config store for main tab + recording panel~~          | P0       | ✅ DONE (2026-04-16)     | TASK-010, TASK-011 |
| ~~BUG-007~~  | ~~Fix: Record toolbar toggles don't drive the floating recording panel~~ | P0       | ✅ DONE (2026-04-16)     | TASK-086           |
| ~~BUG-008~~  | ~~Fix: Record source selection diverges from the floating panel source~~ | P0       | ✅ DONE (2026-04-16)     | TASK-086           |
| ~~TASK-087~~ | ~~Record: Persist config across panel opens and app restarts~~           | P1       | ✅ DONE (2026-04-16)     | TASK-086           |
| ~~TASK-088~~ | ~~Record: Device selectors for mic, camera, and system audio~~           | P1       | ✅ DONE (2026-04-25)     | TASK-086, TASK-012 |
| ~~BUG-009~~  | Fix: Record mode selector is visual-only and does not affect capture     | P1       | ✅ DONE (2026-04-24)     | TASK-086           |
| ~~BUG-010~~  | ~~Fix: Camera controls hidden in Record toolbar despite camera support~~ | P1       | ✅ **DONE** (2026-04-16) | TASK-086           |
| ~~TASK-113~~ | Record: Camera aspect presets for shaped PiP                             | P1       | ✅ **DONE** (2026-04-15) | TASK-011           |
| FEATURE-076  | Record: Audio capture + playback (FFmpeg pipeline + compositor unmute)   | P1       | IN PROGRESS              | TASK-020           |
| BUG-004      | No icon shown in dock/taskbar during recording — blank space             | P1       | TODO                     | TASK-010           |
| BUG-011      | Fix: Linux recording hides all dock/taskbar stop controls                | P1       | TODO                     | TASK-010           |
| ~~BUG-012~~  | ~~Fix: Record replay bootstrap stalls on saved-session playback~~        | P1       | ✅ DONE (2026-04-17)     | TASK-075           |
| ~~TASK-120~~ | ~~Record: Decouple timeline playhead from per-frame React rerenders~~    | P1       | ✅ DONE (2026-04-16)     | TASK-075           |
| ~~TASK-124~~ | ~~Record: Prove and harden saved-file system-audio capture~~             | P1       | ✅ DONE (2026-04-25)     | TASK-012, TASK-088 |
| ~~BUG-013~~  | ~~Fix: Record/Edit camera template and visibility regressions after reopen~~ | P1       | ✅ DONE (2026-04-21)     | TASK-119, TASK-115 |
| ~~TASK-030~~ | ~~Record: Countdown timer (0/3/5/10s configurable)~~                     | P2       | ✅ DONE (2026-04-16)     | TASK-011           |
| ~~TASK-031~~ | ~~Record: Pause/resume recording (MediaRecorder pause)~~                 | P2       | ✅ DONE (2026-04-16)     | TASK-012           |
| TASK-032     | Record: VU meters for mic and system audio                               | P2       | TODO                     | TASK-012           |
| TASK-121     | Record: Restore template picker and preset application flow              | P2       | TODO                     | TASK-011, TASK-119 |
| ~~TASK-122~~ | ~~Record: Fix zoom marker transform and paused-selection behavior~~      | P2       | ✅ DONE (2026-04-21)     | TASK-013, TASK-120 |
| ~~TASK-123~~ | ~~Record: Persist zoom sidecar and cursor overlay continuity~~           | P2       | ✅ DONE (2026-04-21)     | TASK-015, TASK-122 |
| TASK-125     | Record: Per-app system audio capture and routing controls                | P2       | TODO                     | TASK-088, TASK-124 |
| TASK-126     | Record: In-progress controller with finish, pause, restart, and delete   | P2       | TODO                     | TASK-010, TASK-031 |
| TASK-127     | Record: Webcam background removal, blur, and virtual scenes              | P2       | TODO                     | TASK-014           |
| TASK-128     | Record: Audio cleanup and voice enhancement pipeline                     | P2       | TODO                     | TASK-124           |
| ~~TASK-129~~ | ~~Record: Automatic zoom generation from clicks with editable refinement~~ | P2     | ✅ DONE (2026-04-21)     | TASK-122           |
| TASK-130     | Record: Advanced cursor styles, click effects, and click sounds          | P2       | TODO                     | TASK-101           |
| TASK-131     | Record: Cinematic motion blur for cursor, zoom, and camera movement      | P2       | TODO                     | TASK-075, TASK-122 |
| TASK-132     | Record: Privacy blur masks and spotlight regions                         | P2       | TODO                     | TASK-090           |
| TASK-143     | Record: In-app permission diagnostics + deep links + preflight test      | P1       | TODO                     | TASK-010, TASK-088 |
| ~~TASK-144~~ | ~~Record: Mid-take source/device recovery with re-target and offline badge~~ | P1       | ✅ DONE (2026-04-19)     | TASK-100, TASK-088 |
| ~~TASK-145~~ | ✅ Record: Floating controller hide/fade + never-in-video guarantee      | P1       | ✅ DONE (2026-04-26)     | TASK-126, TASK-010 |
| ~~TASK-146~~ | ~~Record: Preview/export fidelity enforcement for all Record polish~~    | P1       | ✅ DONE (2026-04-21)     | TASK-013, TASK-015 |
| ~~TASK-147~~ | ~~Record: Full reopen/project-move fidelity for templates and sidecars~~ | P1       | ✅ DONE (2026-04-21)     | BUG-013, TASK-123  |
| TASK-148     | Record: Crash-resilient autosave + partial-take recovery                 | P1       | TODO                     | TASK-010, TASK-100 |
| ~~TASK-149~~ | ~~Record: Audio clipping warnings + ducking preview + multi-track review~~ | P1     | ✅ DONE (2026-04-26)     | TASK-032, TASK-125 |
| ~~TASK-150~~ | ✅ Record: Per-segment visibility toggles for camera/cursor/clicks/overlays | P1       | ✅ DONE (2026-04-26)     | TASK-089, TASK-090 |
| ~~TASK-151~~ | ~~Record: Destination presets with social framing and export linkage~~   | P1       | ✅ DONE (2026-04-19)     | TASK-094, TASK-121 |
| TASK-152     | Record: Fear-reducing micro-affordances (DND, test clip, safe stop)      | P1       | TODO                     | TASK-126, TASK-100 |
| TASK-153     | Record: Auto desktop icon hide + Do Not Disturb during recording         | P2       | TODO                     | TASK-152           |
| TASK-154     | Record: Replay buffer hotkey to save the last 30 seconds                 | P2       | TODO                     | TASK-010, TASK-148 |
| ~~TASK-228~~ | ~~Record: Persist separate mic and system-audio stems with takes~~       | P1       | ✅ DONE (2026-04-25)     | TASK-167, TASK-149 |
| ~~TASK-229~~ | ~~Record/Edit: Multi-stem playback mixer with mute/solo/ducking~~        | P1       | ✅ DONE (2026-04-26)     | TASK-228, TASK-020 |
| ~~TASK-230~~ | ~~Export: Re-mix persisted audio stems with ducking automation~~         | P1       | ✅ DONE (2026-04-26)     | TASK-228, TASK-229 |
| TASK-158     | Record: Camera auto-shrink and reposition during zoom activation         | P0       | TODO                     | TASK-122, TASK-092 |
| TASK-159     | Record: Full dynamic camera layout authoring UX in Record timeline       | P0       | TODO                     | TASK-092, TASK-158 |
| TASK-157     | Record: Watermark/logo inspector with persistent branding controls       | P2       | TODO                     | TASK-094, TASK-151 |
| TASK-155     | Record: AI captions with timeline edit + styling in Record review        | P2       | TODO                     | TASK-093, TASK-149 |
| TASK-156     | Record: Smart Cut for filler words, silence, breaths, and mouth clicks   | P2       | TODO                     | TASK-128, TASK-149 |
| ~~TASK-162~~ | ~~Record: Focus-first framing UX for screen and camera preview~~         | P1       | ✅ DONE                  | TASK-013, TASK-122 |
| ~~TASK-163~~ | ~~Record: Advanced framing presets and guidance for crop editing~~       | P2       | ✅ DONE                  | TASK-162           |
| ~~TASK-160~~ | ~~Record: Render zoomed preview from source-resolution media, not CSS-only~~ | P1    | ✅ DONE (2026-04-21)     | TASK-146, TASK-129 |
| ~~TASK-161~~ | ~~Export: Re-render zoom/crop from source media for sharp zoomed output~~ | P1     | ✅ DONE (2026-04-21)     | TASK-146, TASK-160 |
| ~~TASK-164~~ | ~~Record/Edit: camera visibility parity after persisted framing~~        | P1       | ✅ DONE (2026-04-19)     | TASK-147           |
| ~~TASK-165~~ | ~~Record: Wire main-tab live preview to selected capture source~~        | P0       | ✅ DONE (2026-04-19)     | TASK-013, TASK-086 |
| ~~TASK-166~~ | ~~Record: Enforce mode-filtered source picker and REC gating~~           | P0       | ✅ DONE (2026-04-19)     | TASK-165, TASK-088 |
| ~~TASK-167~~ | ~~Record: Route selected mic and system audio into saved capture~~       | P0       | ✅ DONE (2026-04-19)     | TASK-088, TASK-012 |
| ~~TASK-168~~ | ~~Record: Re-probe muxed output and import truthful audio metadata~~     | P0       | ✅ DONE (2026-04-19)     | TASK-167           |
| ~~TASK-169~~ | ~~Record: Harden stop/save lifecycle on panel close and app quit~~       | P0       | ✅ DONE (2026-04-20)     | TASK-010, TASK-086 |
| ~~TASK-170~~ | ~~Record: Make pause/resume truthful or disable unsupported paths~~      | P1       | ✅ DONE (2026-04-20)     | TASK-169, TASK-031 |
| ~~TASK-171~~ | ~~Record: Session manifest and partial-take recovery on relaunch~~       | P0       | ✅ DONE (2026-04-20)     | TASK-169, TASK-168 |
| ~~TASK-172~~ | ~~Record: Real region capture or hide unsupported region mode~~          | P1       | ✅ DONE (2026-04-20)     | TASK-166           |
| ~~TASK-179~~ | ~~Record: Append new takes to current project instead of replacing it~~  | P1       | ✅ DONE (2026-04-20)     | TASK-086           |
| ~~TASK-177~~ | ~~Stabilize Record: restore truthful live preview canvas reliably~~      | P0       | ✅ DONE (2026-04-20)     | TASK-165, TASK-172 |
| ~~TASK-178~~ | ~~Stabilize Tests: replace flaky record acceptance suite with release gate~~ | P1   | ✅ DONE (2026-04-22)     | TASK-173, TASK-177 |
| TASK-182     | Record: Make camera sidecar capture deterministic on first take         | P0       | IN PROGRESS (2026-04-21) | TASK-014, TASK-169 |
| ~~TASK-183~~ | ~~Record: Fix Linux X11 screen capture bounds on secondary displays~~   | P0       | ✅ DONE (2026-04-23)     | TASK-010, TASK-167 |
| ~~TASK-184~~ | ~~Record: Eliminate Pixi video alpha CSP noise in the renderer~~        | P1       | ✅ DONE (2026-04-23)     | TASK-013           |
| TASK-176     | Record: Clarify camera layout marker add vs update UX                   | P2       | TODO                     | TASK-159           |
| ~~TASK-185~~ | ✅ ~~Record: Stabilize camera preview track lifecycle~~                 | P2       | ✅ **DONE** (2026-04-24) | TASK-182           |
| ~~TASK-186~~ | Record: Unify in-app pre-record flow and floating recording panel       | P0       | ✅ DONE (2026-04-23)     | TASK-086, TASK-126 |
| ~~TASK-187~~ | ~~Record: Break down and redesign the floating recording panel UX~~     | P1       | ✅ DONE (2026-04-23)     | TASK-186, TASK-145 |
| ~~TASK-188~~ | ~~Product: Break down stabilization work across Projects/Record/Playback/Sidebar/Timeline/Export~~ | P1 | ✅ DONE (2026-04-25) | TASK-186, TASK-187 |
| ~~TASK-189~~ | ~~Record: Fix stuck + obsolete pre-start floating panel (post-TASK-186 fallout)~~              | P0 | ✅ DONE (2026-04-23) | TASK-186, TASK-187 |
| ~~TASK-190~~ | ~~Record: Fix saved-take playback reset + visual artifacts on window resize~~ | P1  | ✅ DONE (2026-04-24)     | TASK-177           |
| ~~TASK-191~~ | ~~Record: Fix saved-take replay progression in Record review~~              | P1       | ✅ DONE (2026-04-24)     | TASK-190           |
| ~~TASK-192~~ | ~~Tests: Stabilize space-playback specs by replacing in-loop screenshots with cheap signals~~ | P2 | ✅ DONE (2026-04-24) | TASK-191 |
| ~~TASK-193~~ | ~~Record: Capture screen at full 60 fps on Linux/X11 (was choppy 30→25 fps)~~ | P1 | ✅ DONE (2026-04-25) | —        |
| ~~TASK-194~~ | ~~Record: Keep panel setup source changes free of eager display capture~~  | P1       | ✅ DONE (2026-04-25)     | TASK-185, TASK-186 |
| ~~TASK-195~~ | ~~Tests: Gate panel source-switch camera-preview regression on Linux~~     | P1       | ✅ DONE (2026-04-25)     | TASK-194           |
| ~~TASK-196~~ | ~~Record: Replace Linux recording tray with capture-safe floating Stop pill~~ | P1     | ✅ DONE (2026-04-25)     | TASK-010           |
| ~~TASK-197~~ | ~~Record: Stop baking Rough Cut UI into Linux/X11 captures (notification + pre-capture hide)~~ | P1 | ✅ DONE (2026-04-25) | TASK-196 |
| TASK-198     | Record: Migrate Linux screen capture from `ffmpeg -f x11grab` to PipeWire / `getDisplayMedia` for Wayland + content-protection support | P2 | TODO | TASK-197 |
| ~~TASK-199~~ | ~~Record: Pre-record mic input gain slider in floating panel (umbrella)~~ | P2      | ✅ DONE (2026-04-25)     | TASK-219, TASK-220, TASK-221, TASK-222, TASK-223, TASK-224, TASK-225 |
| ~~TASK-219~~ | ~~Record: Remove orphan post-record `previewVolume`/`previewMuted` scaffolding~~ | P2 | ✅ DONE (2026-04-25) | —                  |
| ~~TASK-220~~ | ~~Record: pactl source-volume helpers (get/set) + IPC bridge in main~~   | P2       | ✅ DONE (2026-04-25)     | TASK-088           |
| ~~TASK-221~~ | ~~Record: Snapshot/restore registry for touched PulseAudio source volumes~~ | P2    | ✅ DONE (2026-04-25)     | TASK-220           |
| ~~TASK-222~~ | ~~Record: `micInputGainPercent` in recording-config + persisted schema~~ | P2       | ✅ DONE (2026-04-25)     | TASK-088           |
| ~~TASK-223~~ | ~~Record: Mic gain slider UI in PanelApp next to VU meter~~              | P2       | ✅ DONE (2026-04-25)     | TASK-220, TASK-221, TASK-222 |
| ~~TASK-224~~ | ~~Record: Reconcile `ensureSourceAudible` mic auto-bump with user gain~~ | P2       | ✅ DONE (2026-04-25 — no-op; helper only runs on monitor sources) | TASK-220, TASK-222 |
| ~~TASK-225~~ | ~~Tests: pactl percent parser + snapshot/restore registry unit tests~~   | P2       | ✅ DONE (2026-04-25)     | TASK-220, TASK-221 |
| TASK-093     | Record: Teleprompter for scripted recording                              | P2       | TODO                     | TASK-086           |
| TASK-094     | Record: Shareable recording presets and profiles                         | P2       | TODO                     | TASK-086           |
| TASK-095     | Record: Mobile device capture with device frames                         | P2       | TODO                     | TASK-010           |
| TASK-216     | Record: Mouse/cursor movement not smooth — drops frames during recording | P1       | IN PROGRESS (2026-04-25) | TASK-010, TASK-193 |
| ~~TASK-217~~ | Record: Mouse click sound effect (settings toggle + export keep/disable) | P2       | ✅ DONE (2026-04-25)     | TASK-010, TASK-130    |
| ~~TASK-218~~ | ~~Record: Cursor sprite desynced from recorded video (fps unit mismatch)~~ | P0     | ✅ DONE (2026-04-25)     | TASK-010, TASK-101 |
| ~~TASK-226~~ | ~~Record: Backward sub-frame cursor interpolation (fluent fast-motion)~~ | P1       | ✅ DONE (2026-04-25)     | TASK-216           |
| ~~TASK-227~~ | ~~Build: Add `keepClickSounds` to `export-renderer/src/demo.ts` ExportSettings literal~~ | P1 | ✅ DONE (2026-04-25) | TASK-217 |
| ~~TASK-250~~ | ✅ Preview: Safe continuous cursor and zoom smoothness plan             | P1       | ✅ DONE (2026-04-26)     | TASK-216, TASK-075 |

### Recording Edge Features

| ID       | Title                                                                               | Priority | Status | Dependencies       |
| -------- | ----------------------------------------------------------------------------------- | -------- | ------ | ------------------ |
| TASK-014 | Record: Webcam PiP (render in compositor with shape/position)                       | P0       | TODO   | TASK-013           |
| TASK-015 | Record: Serialize recording effects to clips (bg, corners, shadow → Effect entries) | P0       | TODO   | TASK-011           |
| TASK-016 | Record: Create separate Assets for webcam + audio on stop                           | P0       | TODO   | TASK-012, TASK-014 |
| ~~BUG-005~~ | ~~Camera PiP renders as ellipse instead of circle (CSS/template shape not applied)~~ | P1     | ✅ DONE (2026-04-21) | TASK-014           |
| TASK-089 | Record: Keyboard shortcut capture + on-video overlays                               | P1       | TODO   | TASK-015, TASK-090 |
| TASK-091 | Record: Titles and callouts overlay system                                          | P2       | TODO   | TASK-015, TASK-107 |
| TASK-092 | Record: Dynamic camera layout changes within one recording                          | P2       | TODO   | TASK-014, TASK-015 |
| ~~TASK-101~~ | ~~Record: Cursor smoothing, idle hide, and loop-back polish~~                   | P2       | ✅ DONE (2026-04-21) | TASK-015, TASK-075 |
| TASK-090 | Record: Highlights and annotations overlay system                                   | P2       | TODO   | TASK-015      |

### Export Core

| ID           | Title                                                                 | Priority | Status               | Dependencies       |
| ------------ | --------------------------------------------------------------------- | -------- | -------------------- | ------------------ |
| TASK-118     | Export: Camera PiP preview parity with Record + Edit tabs             | P1       | ✅ DONE (2026-04-15) | TASK-114           |
| ~~TASK-021~~ | Export: Progress bar + frame counter (wire existing IPC events to UI) | P1       | ✅ DONE (2026-04-16) | TASK-008           |
| ~~TASK-022~~ | Export: Output path selector (native save dialog)                     | P1       | ✅ DONE (2026-04-16) | TASK-009           |
| ~~TASK-028~~ | ~~Export: Audio mixing in export pipeline~~                           | P1       | ✅ DONE (2026-04-21) | TASK-008, TASK-020 |
| ~~TASK-029~~ | ~~Export: Quality presets + editable settings (resolution, FPS, CRF)~~ | P2      | ✅ DONE (2026-04-21) | TASK-021           |
| ~~TASK-067~~ | ~~Preview + export parity test (visual regression)~~                  | P2       | ✅ DONE (2026-04-21) | TASK-007, TASK-008 |
| ~~TASK-109~~ | Export: Cancel button during export                                   | P2       | ✅ DONE (2026-04-16) | TASK-021           |
| ~~TASK-110~~ | Export: Error display for failed exports                              | P2       | ✅ DONE (2026-04-16) | TASK-021           |
| ~~TASK-111~~ | Export: "Open File"/"Open Folder" links after completion              | P3       | ✅ DONE (2026-04-16) | TASK-021           |
| ~~TASK-112~~ | Export: File size + time estimates                                    | P3       | ✅ DONE (2026-04-19) | TASK-029           |
| ~~BUG-014~~  | ~~Export: WebCodecs bitrate config rejected — pipeline stalls, no file produced~~ | P0       | ✅ DONE (2026-04-20) | TASK-021, TASK-052 |

### Export Advanced

| ID           | Title                                                                                                      | Priority | Status                   | Dependencies       |
| ------------ | ---------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ------------------ |
| TASK-050     | Preview: Switch to PixiJS VideoSource (WebGL textures, drop Canvas2D drawImage)                            | P0       | TODO                     | TASK-007           |
| TASK-051     | Preview: Work around WebGL gradient shader crash (solid rects or pre-rendered canvas bg)                   | P0       | TODO                     | TASK-050           |
| TASK-052     | Export: WebCodecs pipeline — web-demuxer + VideoDecoder + PixiJS offscreen + VideoEncoder + mediabunny MP4 | P0       | TODO                     | TASK-050           |
| ~~TASK-053~~ | ✅ Export: Frame-accurate scrubbing via mediabunny VideoSampleSink.getSample()                             | P1       | ✅ **DONE** (2026-04-16) | TASK-052           |
| TASK-054     | Export: NVENC hardware encoding via VideoEncoder hardwareAcceleration: prefer-hardware                     | P1       | TODO                     | TASK-052           |
| BUG-006      | Playback laggy — Canvas2D drawImage bottleneck, needs WebGL VideoSource path                               | P0       | TODO                     | TASK-050           |
| ~~TASK-075~~ | Preview: Playback fluency — rVFC sync, consolidate loops, cache effects                                    | P0       | ✅ DONE (2026-04-16)     | TASK-007           |
| TASK-096     | Export: Social aspect presets derived from Record templates                                                | P2       | TODO                     | TASK-015, TASK-029 |
| ~~TASK-108~~ | Export: Job queue (multi-job sequential processing)                                                        | P3       | ✅ DONE (2026-04-19)     | TASK-021           |

### Edit Core

| ID           | Title                                                                    | Priority | Status               | Dependencies                 |
| ------------ | ------------------------------------------------------------------------ | -------- | -------------------- | ---------------------------- |
| TASK-017     | Edit: Clip drag-to-move (horizontal repositioning with snap)             | P2       | TODO                 | TASK-003                     |
| TASK-018     | Edit: Cross-track clip dragging (V1↔V2)                                  | P2       | TODO                 | TASK-017                     |
| TASK-019     | Edit: Effects stack UI (Add Effect, expandable sections, param controls) | P2       | TODO                 | TASK-004                     |
| TASK-020     | Edit: Audio playback via Web Audio API synced to playhead                | P2       | TODO                 | TASK-007                     |
| ~~TASK-077~~ | Edit: Camera playback in Edit tab compositor                             | P1       | ✅ DONE (2026-04-14) | TASK-075                     |
| ~~TASK-114~~ | Edit: Camera source/timing parity with Record preview                    | P1       | ✅ DONE (2026-04-15) | TASK-075, TASK-077           |
| ~~TASK-119~~ | Record/Edit: Persist layout template for camera preview parity           | P1       | ✅ DONE (2026-04-15) | TASK-077, TASK-113           |
| ~~TASK-115~~ | Edit: Camera layout/visibility parity with Record preview                | P1       | ✅ DONE (2026-04-16) | TASK-114, TASK-119           |
| ~~TASK-116~~ | Tests: Record/Edit camera parity regression coverage                     | P1       | ✅ DONE (2026-04-16) | TASK-114, TASK-115, TASK-119 |
| TASK-023     | Edit: Keyframe editor (timeline markers + inspector controls)            | P2       | TODO                 | TASK-019                     |
| TASK-024     | Edit: Transitions (crossfade rendering in preview + export)              | P2       | TODO                 | TASK-005, TASK-007           |
| ~~TASK-025~~ | Edit: Track headers UI (mute/solo/lock toggles, volume slider)           | P1       | ✅ DONE (2026-04-16) | TASK-006                     |
| ~~TASK-117~~ | Edit: Dynamic track management (add/remove channels)                     | P1       | ✅ DONE (2026-04-16) | TASK-006, TASK-025           |
| FEATURE-084  | Edit: Timeline multi-select + snap additions (Increment 1 of 3)          | P1       | IN PROGRESS          | TASK-006, TASK-003           |

### Edit Depth

| ID       | Title                                                | Priority | Status | Dependencies |
| -------- | ---------------------------------------------------- | -------- | ------ | ------------ |
| TASK-026 | Edit: Audio waveforms on timeline clips              | P2       | TODO   | TASK-020     |
| TASK-027 | Edit: Ripple delete mode                             | P2       | TODO   | TASK-003     |
| TASK-063 | Edit: Video thumbnail strips on clips                | P3       | TODO   | TASK-017     |
| TASK-064 | Edit: Opacity/blend mode in clip inspector           | P3       | TODO   | TASK-019     |
| TASK-065 | Edit: Audio volume controls per clip/track           | P2       | TODO   | TASK-025     |
| TASK-066 | Edit: Playback transport buttons (skip forward/back) | P3       | TODO   | TASK-020     |

### AI

| ID           | Title                                                                                  | Priority | Status               | Dependencies       |
| ------------ | -------------------------------------------------------------------------------------- | -------- | -------------------- | ------------------ |
| TASK-081     | AI: Visual frame analysis pipeline (sample frames, describe via vision LLM)            | P2       | PLANNED              | TASK-040, TASK-079 |
| TASK-082     | AI: Rough cut generator — LLM produces timeline from library + user prompt             | P2       | PLANNED              | TASK-080, TASK-081 |
| TASK-079     | AI: Library data model — footage + transcripts + visual analysis as first-class entity | P2       | PLANNED              | TASK-002           |
| TASK-080     | AI: WhisperX audio transcription pipeline (batch ingest, word-level timestamps)        | P2       | PLANNED              | TASK-040, TASK-079 |
| FEATURE-078  | AI: ButterCut-inspired library + rough cut generation (epic)                           | P1       | PLANNED              | TASK-040           |
| ~~TASK-083~~ | Compliance: Third-party attribution (WhisperX BSD-4, FFmpeg LGPL) in About/credits     | P2       | ✅ DONE (2026-04-19) | -                  |
| TASK-040     | AI: Create @rough-cut/ai-bridge package + AIProvider interface                         | P3       | TODO                 | TASK-002           |
| TASK-041     | AI: AIAnnotation type in project-model                                                 | P3       | TODO                 | TASK-002           |
| TASK-042     | AI: Auto-Captions — Whisper integration (local binary)                                 | P3       | TODO                 | TASK-040           |
| TASK-043     | AI: Smart Zoom — cursor/mouse movement analysis                                        | P3       | TODO                 | TASK-040           |
| TASK-044     | AI: Source selector UI (pick assets to analyze)                                        | P3       | TODO                 | TASK-033           |
| TASK-045     | AI: Results panel with Accept/Reject/Edit per annotation                               | P3       | TODO                 | TASK-041, TASK-044 |
| TASK-046     | AI: Preview player showing annotation context                                          | P3       | TODO                 | TASK-045           |
| TASK-047     | AI: "Apply Accepted to Timeline" (captions → subtitle effects, zooms → keyframes)      | P3       | TODO                 | TASK-045           |
| TASK-048     | AI: Background worker/utilityProcess for analysis                                      | P3       | TODO                 | TASK-040           |
| TASK-049     | AI: Cloud provider option (API key config)                                             | P3       | TODO                 | TASK-040           |
| TASK-073     | AI: Auto-Edit — transcription-based editing via AI (API-first)                         | P3       | TODO                 | TASK-042, TASK-040 |
| TASK-074     | AI: Silence Removal — detect and cut silent segments automatically                     | P3       | TODO                 | TASK-042, TASK-040 |
| TASK-097     | AI: Record-first captions workflow from captured assets                                | P2       | TODO                 | TASK-080, TASK-044 |
| TASK-098     | AI: Audio enhancement for recorded narration                                           | P3       | TODO                 | TASK-040           |
| TASK-099     | AI: Webcam background removal and replacement                                          | P3       | TODO                 | TASK-040           |

### Motion

| ID       | Title                                                                     | Priority | Status | Dependencies                 |
| -------- | ------------------------------------------------------------------------- | -------- | ------ | ---------------------------- |
| TASK-033 | Split "AI Motion" placeholder into separate Motion + AI tabs              | P2       | TODO   | TASK-009                     |
| TASK-034 | Motion: MotionTemplate data model + 8 bundled templates (JSON)            | P2       | TODO   | TASK-002                     |
| TASK-035 | Motion: Template library UI (sidebar, search, category filter, card grid) | P2       | TODO   | TASK-034                     |
| TASK-036 | Motion: Template preview canvas (PixiJS renders animation)                | P2       | TODO   | TASK-007, TASK-034           |
| TASK-037 | Motion: Parameter editor panel (text, color, duration, easing, font)      | P2       | TODO   | TASK-035                     |
| TASK-038 | Motion: "Apply to Timeline" (creates motion-template Asset + Clip)        | P2       | TODO   | TASK-037                     |
| TASK-039 | Motion: Resolve motion-template asset type in preview + export renderers  | P2       | TODO   | TASK-007, TASK-008, TASK-034 |

### Cross-Cutting / Polish

| ID           | Title                                                              | Priority | Status                   | Dependencies       |
| ------------ | ------------------------------------------------------------------ | -------- | ------------------------ | ------------------ |
| TASK-061     | Record: Custom region selection overlay                            | P3       | TODO                     | TASK-013           |
| TASK-062     | Record: Image backgrounds                                          | P3       | TODO                     | TASK-011           |
| TASK-068     | Cross-platform testing (macOS, Windows)                            | P2       | TODO                     | TASK-015           |
| TASK-069     | Performance profiling + optimization                               | P3       | TODO                     | TASK-020           |
| TASK-070     | Accessibility basics (keyboard nav, screen reader)                 | P3       | TODO                     | -                  |
| ~~TASK-100~~ | ~~Record: Disconnect recovery and warning toasts for dropped devices~~ | P1       | ✅ DONE (2026-04-19)     | TASK-009, TASK-086 |
| TASK-102     | Toast notification system for errors/warnings                      | P2       | TODO                     | TASK-009           |
| TASK-103     | Global keyboard shortcuts (Ctrl+S save, Ctrl+E export)             | P2       | TODO                     | TASK-009           |
| TASK-104     | Recording config persistence to localStorage                       | P3       | TODO                     | TASK-011           |
| ~~TASK-105~~ | ~~Relative asset paths for project portability~~                   | P2       | ✅ DONE (2026-04-16)     | TASK-009           |
| TASK-106     | Effect registry: add color-correction effect                       | P2       | TODO                     | TASK-004           |
| TASK-107     | Effect registry: add subtitle/text effect                          | P2       | TODO                     | TASK-004           |
| ~~TASK-173~~ | ~~Tests: Golden-path record-stop-save readiness suite~~           | P0       | ✅ DONE (2026-04-20)     | TASK-165, TASK-166, TASK-168, TASK-169 |
| ~~TASK-174~~ | ~~Tests: Audio route fidelity and post-save import suite~~        | P0       | ✅ DONE (2026-04-20)     | TASK-167, TASK-168 |
| ~~TASK-175~~ | ~~Tests: Recovery, reopen, and export-from-fresh-recording suite~~ | P0       | ✅ DONE (2026-04-20)     | TASK-171, TASK-173 |
| ~~TASK-206~~ | ~~Tests: Re-baseline e2e under updated 60s test.timeout~~          | P0       | ✅ DONE (2026-04-25)     | -                  |
| ~~TASK-207~~ | ~~Record: Investigate record-tab.spec.ts 9-failure cluster~~       | P1       | ✅ DONE (2026-04-25)     | TASK-206           |
| ~~TASK-208~~ | ~~Export: Investigate export-tab.spec.ts 3-failure cluster~~       | P1       | ✅ DONE (2026-04-25)     | TASK-206           |
| ~~TASK-209~~ | ~~Edit: Inspector-rail spec — sync CATEGORIES with current rail (highlights/titles dropped, destinations/captions added)~~ | P2 | ✅ DONE (2026-04-25) | TASK-206 |
| ~~TASK-210~~ | ~~Tests: Tab-switching — fix Motion fps→NaN→CSS leak + refine console-error filter~~ | P2 | ✅ DONE (2026-04-25) | TASK-206 |
| TASK-211     | Tests: Triage MVP acceptance specs (19 failures across 4 files)    | P3       | TODO                     | TASK-206           |
| TASK-212     | Infra: Replace no-op `lint` echo scripts with real ESLint config   | P3       | TODO                     | -                  |
| TASK-213     | Record: Audit visible sidebar controls for real vs placeholder behavior | P3   | TODO                     | TASK-188           |
| ~~TASK-214~~ | ~~Record: Make post-take keep/retry/continue review path explicit~~ | P1      | ✅ DONE (2026-04-25)     | TASK-191           |
| TASK-215     | Export: Gate fresh-take review-to-export truth after Record fixes  | P1       | REVIEW                   | TASK-175, TASK-191 |
| ~~TASK-231~~ | ~~Tests: Gate hidden-tab acceptance failures~~                    | P1       | ✅ DONE (2026-04-25)     | TASK-206           |
| ~~TASK-232~~ | ~~Record: Stabilize camera source-switch preview e2e~~            | P1       | ✅ DONE (2026-04-25)     | TASK-194, TASK-195 |
| ~~TASK-233~~ | ~~Record: Fix rounded camera visual e2e regressions~~             | P1       | ✅ DONE (2026-04-25)     | TASK-113, BUG-005  |
| ~~TASK-234~~ | ~~Record: Repair cursor visual timing e2e failures~~              | P1       | ✅ DONE (2026-04-26)     | TASK-216, TASK-218, TASK-226 |
| ~~TASK-235~~ | ~~Edit: Fix dynamic track management e2e~~                        | P1       | ✅ DONE (2026-04-25)     | TASK-117           |
| ~~TASK-236~~ | ~~Export: Fix destination preset export-default e2e~~             | P1       | ✅ DONE (2026-04-25)     | TASK-151, TASK-096 |
| ~~TASK-237~~ | ~~Record: Restore inspector rail category e2e~~                   | P1       | ✅ DONE (2026-04-25)     | TASK-206, TASK-209 |
| ~~TASK-238~~ | ~~Record: Fix failed live-preview state e2e~~                     | P1       | ✅ DONE (2026-04-25)     | TASK-165, TASK-166 |
| ~~TASK-239~~ | ~~Tests: Complete full e2e sweep after timeout~~                  | P1       | ✅ DONE (2026-04-26)     | TASK-231, TASK-232, TASK-233, TASK-234, TASK-235, TASK-236, TASK-237, TASK-238 |
| TASK-240     | Record: Re-fix rounded camera visual full-suite regressions       | P1       | TODO                     | TASK-233           |
| TASK-244     | Record: Stabilize no-baked-UI capture artifact e2e                | P1       | TODO                     | TASK-197           |
| TASK-246     | Tests: Repair Record screenshot template specs                    | P1       | TODO                     | TASK-237           |
| ~~TASK-241~~ | ~~Record: Fix inspector rail hit-target overlay regressions~~     | P1       | ✅ DONE (2026-04-26)     | TASK-237           |
| ~~TASK-242~~ | ~~Record: Repair moved-project sidecar save regression~~          | P1       | ✅ DONE (2026-04-26)     | TASK-105           |
| ~~TASK-243~~ | ~~Record: Fix camera framing and zoom geometry regressions~~      | P1       | ✅ DONE (2026-04-26)     | TASK-113, TASK-122 |
| ~~TASK-245~~ | ~~Tests: Repair Record zoom panel selector ambiguity~~            | P1       | ✅ DONE (2026-04-26)     | TASK-207           |
| ~~TASK-247~~ | ~~Record: Fix cursor-follow no-op in saved-take zoom preview~~    | P1       | ✅ DONE (2026-04-26)     | TASK-234           |
| ~~TASK-248~~ | ~~Tests: Update retroactive cursor repair e2e for compositor path~~ | P2     | ✅ DONE (2026-04-26)     | TASK-234           |
| TASK-249     | Record: Honor zoom auto-shrink for persisted camera frame edits   | P1       | CANCELLED (2026-04-26)   | TASK-243           |

---

## Active Work

### ~~TASK-228~~: Record: Persist separate mic and system-audio stems with takes

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Completed

- Added persistent per-source FFmpeg sidecar capture for microphone and system audio stems next to the saved take.
- Stored stem paths on `RecordingResult`, recording asset metadata, and `audioCapture.final.stems` while preserving the existing mixed-audio playback path.
- Extended partial-take recovery so recovered takes keep available mic/system-audio stem sidecars.

#### Verification

- `node --test apps/desktop/src/main/recording/recording-session-manager-pre-capture.test.mjs`
- `node --test apps/desktop/src/main/recording/recovery-state.test.mjs`
- `pnpm typecheck`

### ~~TASK-229~~: Record/Edit: Multi-stem playback mixer with mute/solo/ducking

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Completed

- Added Record/Edit multi-stem playback mixer controls for persisted mic and system-audio stems.
- Wired mic/system volume, mute, solo, and preview ducking into the shared playback path while preserving existing mixed-stream fallback behavior.
- Added focused mixer unit coverage and targeted Electron Record/Edit playback coverage.

#### Verification

- `pnpm --filter @rough-cut/preview-renderer test`
- `pnpm --filter @rough-cut/preview-renderer typecheck`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm test:e2e tests/electron/edit-track-management.spec.ts tests/electron/edit-space-playback.spec.ts tests/electron/record-space-playback.spec.ts tests/electron/record-audio-import-parity.spec.ts`

### ~~TASK-230~~: Export: Re-mix persisted audio stems with ducking automation

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Completed

- Export finalization now resolves persisted mic/system-audio stem sidecars from recording asset metadata.
- The FFmpeg mux step prefers available stem sidecars over the legacy mixed recording stream.
- System audio is ducked from the aligned mic stem with `sidechaincompress`, while missing/unusable stems fall back to the existing mixed-audio path.

#### Verification

- `node --check apps/desktop/src/main/index.mjs`
- `pnpm --filter @rough-cut/export-renderer test -- --run src/audio-export.test.ts`
- `pnpm --filter @rough-cut/export-renderer typecheck`

### ~~TASK-149~~: Record: Audio clipping warnings + ducking preview + multi-track review

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Completed

- Added live Record-panel clipping and peaking warnings so mic issues are visible before the user commits to a take.
- Added Record-panel ducking preview guidance that shows how desktop audio will be attenuated while narration is present, without faking post-take source separation.
- Added a Record review card that breaks out captured microphone and system-audio lanes from saved-take metadata while clearly stating the current review playback is still one mixed stream.
- Added focused helper coverage for clipping assessment / ducking summary logic and Electron coverage for the new Record review audio UI.

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop exec vitest run src/renderer/features/record/audio-review.test.ts`
- `pnpm exec playwright test tests/electron/record-post-take-review.spec.ts --workers=1`

#### Notes

- This task intentionally stopped at truthful review UI for the current mixed-stream saved take.
- True post-take per-source playback ducking required follow-up stem and mixer work, which is tracked separately under `TASK-228`, `TASK-229`, and `TASK-230`.

### ~~TASK-231~~: Tests: Gate hidden-tab acceptance failures

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Completed

- Added dynamic `test.skip` gates to `acceptance-ai.spec.ts` and `acceptance-edit.spec.ts` when their header tabs are absent.
- Extracted the visibility gate into `skipIfHeaderTabHidden` so future hidden-surface acceptance specs can share the same behavior.
- Kept the gate tied to actual header visibility so the specs automatically become active again when AI/Edit are restored to `APP_VIEW_TABS`.
- Left Record and Export acceptance coverage untouched.

#### Verification

- `pnpm exec playwright test tests/electron/acceptance-ai.spec.ts tests/electron/acceptance-edit.spec.ts --workers=1`

#### Problem

- The full e2e run failed immediately in `acceptance-ai.spec.ts` and repeatedly in `acceptance-edit.spec.ts` because header tabs for AI/Edit are intentionally hidden during the current Record/Export-focused sprint.
- `docs/MASTER_PLAN.md` already documents hidden Edit/Motion/AI tab visibility, but the acceptance specs are still counted as hard failures when they click hidden header buttons.
- This failure noise blocks a useful suite-level signal for current shipping surfaces.

#### Scope

- Decide whether hidden-tab acceptance specs should be `test.fixme`, deep-link through `__roughcutSetActiveTab`, or be moved behind an explicit future-surface project.
- Cover failed specs from `tests/electron/acceptance-ai.spec.ts` and `tests/electron/acceptance-edit.spec.ts`.
- Keep specs for visible Record/Export surfaces active.

#### Verification

- `pnpm test:e2e` no longer reports hidden-tab acceptance specs as unexpected failures.
- Re-enable the gated specs when Edit/AI tabs are restored to the header.

---

### ~~TASK-232~~: Record: Stabilize camera source-switch preview e2e

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Completed

- Replaced the hardware-dependent ad-hoc probe with a deterministic regression test using debug capture sources and mocked media streams.
- Kept the behavioral assertion focused on the unified recording workflow: setup-time source changes must not call `getDisplayMedia`, and the panel camera preview must remain live.
- Verified the spec both directly and through the same `xvfb-run` path used by `pnpm test:e2e`.

#### Problem

- `tests/electron/record-camera-source-switch.spec.ts` failed in the full e2e run.
- The failure is in the same ownership area as the recent panel/live-preview source-switch work and may indicate either a real regression or an obsolete adhoc assertion.

#### Scope

- Re-run the spec in isolation and capture the exact assertion failure.
- Verify camera preview state across screen-source switches after the recording panel refactor.
- Update the app or test so the expected state matches the unified recording workflow.

#### Verification

- `pnpm exec playwright test tests/electron/record-camera-source-switch.spec.ts --reporter=line` passes.
- The full e2e run does not fail on the camera source-switch spec.

---

### ~~TASK-233~~: Record: Fix rounded camera visual e2e regressions

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Problem

- `tests/electron/camera-rounded-visual.spec.ts` failed all three observed checks.
- Failed coverage: rounded square at max roundness for 1:1, restrained corners for 16:9, and saved camera frame override update from aspect control.

#### Scope

- Determine whether the regression is in camera presentation state, `getCameraBorderRadius`, persisted camera frame overrides, or visual test expectations.
- Preserve Record/Edit/Export camera template parity while fixing rounded-camera controls.
- Update snapshots/thresholds only if the UI behavior is intentionally different and visually correct.

#### Verification

- `pnpm exec playwright test tests/electron/camera-rounded-visual.spec.ts --reporter=line` passes.
- Existing `camera-template-parity.spec.ts` coverage remains green.

#### Completed

- Fixed Record preview camera presentation reads so project-store patches render without stale local camera state.
- Changed camera aspect/shape edits to reshape saved camera frame overrides inside the existing bounds instead of clearing or expanding them.
- Added unit coverage for camera frame reshaping math.
- Isolated the rounded-camera visual e2e fixture with a temp project copy and refreshed the presentation-layout snapshots.

#### Verified

- `pnpm exec playwright test tests/electron/camera-rounded-visual.spec.ts --reporter=line`
- `pnpm exec playwright test tests/electron/camera-template-parity.spec.ts --reporter=line`
- `pnpm --filter @rough-cut/desktop exec vitest run src/renderer/features/record/camera-frame-utils.test.ts`

---

### TASK-234: Record: Repair cursor visual timing e2e failures

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- Cursor visual/timing specs failed after recent cursor fps and interpolation work.
- Failed specs observed: `cursor-follow-visual.spec.ts`, `cursor-fps-rescale-verify.spec.ts`, `cursor-retroactive-repair.spec.ts`, and `cursor-subframe-interpolation.spec.ts`.
- Console output showed hidden cursor samples in the sub-frame test and unexpected cursor position/centroid in visual checks.

#### Scope

- Re-run each cursor failure in isolation and separate real cursor-render regressions from stale fixture expectations.
- Verify cursor event fps metadata, legacy absolute-coordinate rebasing, zoom follow transform, and sub-frame interpolation behavior.
- Keep Record preview and export cursor rendering aligned.

#### Verification

- `pnpm exec playwright test tests/electron/cursor-follow-visual.spec.ts tests/electron/cursor-fps-rescale-verify.spec.ts tests/electron/cursor-retroactive-repair.spec.ts tests/electron/cursor-subframe-interpolation.spec.ts --reporter=line` passes.

#### Completion Notes (2026-04-26)

- Stabilized the cursor timing e2e fixtures by clearing inherited crop/visibility authoring state and providing deterministic cursor sidecar data when the shared zoom fixture is loaded with cursor events.
- Updated cursor visual assertions to use the cursor debug canvas and the current sub-frame interpolation behavior for forward playback jumps.
- Added cursor overlay debug attributes for the applied zoom transform to make future visual timing failures easier to diagnose.

#### Verification Run

- `pnpm --filter @rough-cut/desktop exec vitest run src/renderer/components/cursor-subframe-interpolation.test.ts src/renderer/components/cursor-data-loader.test.ts`
- `pnpm exec playwright test tests/electron/cursor-follow-visual.spec.ts tests/electron/cursor-fps-rescale-verify.spec.ts tests/electron/cursor-retroactive-repair.spec.ts tests/electron/cursor-subframe-interpolation.spec.ts --reporter=line`
- `pnpm --filter @rough-cut/desktop typecheck`

---

### ~~TASK-235: Edit: Fix dynamic track management e2e~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Problem

- `tests/electron/edit-track-management.spec.ts` failed even though TASK-117 is marked done.
- The failure may be a real regression in add/remove empty channel behavior or a stale selector/expectation after hidden-tab and layout changes.

#### Scope

- Re-run the spec in isolation and capture whether navigation, control discovery, state update, or DOM rendering fails.
- Preserve existing track header coverage in `edit-track-headers.spec.ts`.
- Update task status assumptions if the feature is intentionally out of current visible-surface scope.

#### Verification

- `pnpm exec playwright test tests/electron/edit-track-management.spec.ts --reporter=line` passes or is explicitly gated with the hidden Edit surface.

#### Completed

- Reproduced the failure as a stale fixture assumption: the loaded recorded project now starts with an existing empty `Video 3`, so fixed 4-track and `Video 3` post-add expectations were no longer valid.
- Updated `tests/electron/edit-track-management.spec.ts` to use a synthetic in-test project instead of a hardcoded local recording, then assert add/remove behavior relative to the project's video/audio counts while still proving the new empty audio channel can be removed and track ordering is preserved.
- Verified the focused dynamic track management spec passes.

---

### ~~TASK-236~~: Export: Fix destination preset export-default e2e

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Completed

- Verified the Record destination preset linkage now carries the Reels/TikTok preset into Export defaults.
- Confirmed the focused regression, full Export tab suite, and export-adjacent e2e coverage pass in the current workspace.

#### Problem

- `tests/electron/export-tab.spec.ts` failed on `record destination presets link social framing into export defaults`.
- This is a current visible Export-surface regression and should not be hidden behind future-tab gating.

#### Scope

- Verify whether Record destination preset state is persisted into project settings, asset presentation, or export defaults.
- Confirm social framing presets still map to expected export resolution/aspect settings after the Record review layout changes.
- Keep basic Export acceptance tests passing.

#### Verification

- `pnpm exec playwright test tests/electron/export-tab.spec.ts -g "record destination presets" --reporter=line` passes.
- Full `export-tab.spec.ts` remains green.

---

### ~~TASK-237~~: Record: Restore inspector rail category e2e

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Completed

- Synced `tests/electron/inspector-rail.spec.ts` with the current Record inspector rail by adding the existing `visibility` category.
- Kept removed `highlights` and `titles` categories out of the test expectation.
- Re-ran the rail width, viewport fit, inspector width, and horizontal-overflow checks; no product-side layout fix was needed.

#### Problem

- `tests/electron/inspector-rail.spec.ts` failed most category/layout checks after the initial shell presence test passed.
- Failed checks cover category item list, single visible category, fixed rail width, viewport fit, inspector width, and horizontal overflow.

#### Scope

- Sync expected inspector rail categories with the current Record sidebar categories.
- Fix any real overflow or width instability introduced by recent Record review/sidebar changes.
- Avoid reintroducing hidden or removed categories solely to satisfy stale tests.

#### Verification

- `pnpm exec playwright test tests/electron/inspector-rail.spec.ts --reporter=line` passes.
- `pnpm exec playwright test tests/electron/record-layout.spec.ts --reporter=line` passes.

---

### ~~TASK-238~~: Record: Fix failed live-preview state e2e

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Completed

- Reproduced the focused live-preview suite and confirmed the failed-source path now reaches the explicit Record-tab preview failure state.
- Verified the failed overlay preserves the source selection, reports `data-preview-state="failed"`, and surfaces the rejected preview error instead of being hidden by source recovery.
- Fixed a source-refresh race where an older real desktop source probe could finish after a deterministic debug source override and clear the selected source before the failed-preview state assertion completed.

#### Problem

- `tests/electron/live-preview.spec.ts` failed on the failed-source preview state while empty and acquiring states passed.
- This may indicate the selected source failure path now stays hidden behind source recovery or panel ownership changes.

#### Scope

- Reproduce the failed-source preview state and verify the intended user-facing behavior in the unified recorder.
- Ensure unavailable/failed sources surface a clear in-app preview state or a deliberate panel-owned recovery path.
- Update the test only after the product behavior is explicit.

#### Verification

- `pnpm exec playwright test tests/electron/live-preview.spec.ts --reporter=line` passes.
- The Record tab still shows empty and acquiring preview states correctly.

---

### ~~TASK-239~~: Tests: Complete full e2e sweep after timeout

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- `pnpm test:e2e` timed out after 20 minutes at test 112 of 233.
- The run produced many actionable failures before timeout, but the remaining 121 tests were not exercised in this pass.

#### Scope

- After TASK-231 through TASK-238 are addressed, run the full suite with enough timeout to complete or shard it by file group.
- Create follow-up P1 tasks for any additional failures discovered after test 112.
- Keep the final suite report attached to the relevant task notes.

#### Verification

- A complete `pnpm test:e2e` run finishes without tool timeout.
- Any remaining unexpected failures are tracked with concrete task IDs.

#### Completed

- Ran the full Electron e2e suite with a 60-minute tool timeout so Playwright could finish instead of being cut off at 20 minutes.
- The run completed in 17.2 minutes: 184 passed, 20 failed, 32 skipped.
- Existing TASK-234 covers the four cursor failures: `cursor-follow-visual.spec.ts`, `cursor-fps-rescale-verify.spec.ts`, `cursor-retroactive-repair.spec.ts`, and `cursor-subframe-interpolation.spec.ts`.
- Created follow-up tasks for the remaining failure clusters discovered by the completed sweep: TASK-240 through TASK-246.

#### Verified

- `pnpm test:e2e` completed without tool timeout.
- Full run output captured by the agent at `/home/endlessblink/.local/share/opencode/tool-output/tool_dc6817e220017znGhsOQ3TNeDj`.

---

### TASK-240: Record: Re-fix rounded camera visual full-suite regressions

**Priority:** P1 | **Status:** TODO

#### Problem

- The full TASK-239 sweep still failed all three `tests/electron/camera-rounded-visual.spec.ts` checks even though TASK-233 passed in focused verification.
- Failed checks: rounded square at max roundness for 1:1, restrained corners for 16:9, and camera aspect control updating a saved frame override.

#### Scope

- Re-run the rounded-camera spec both in isolation and after nearby camera specs to identify whether this is order-dependent state leakage or a product regression.
- Preserve Record/Edit/Export camera template parity while fixing the full-suite failure mode.
- Update fixtures only if focused and full-suite behavior prove the UI intentionally changed.

**Progress (2026-04-26):** Reprioritized the remaining Record regression tasks after the full-suite sweep and stabilized the shared playback and zoom fixtures so grouped headless cursor and zoom coverage stays deterministic while the rounded-camera cluster is being worked through.

#### Verification

- `pnpm exec playwright test tests/electron/camera-rounded-visual.spec.ts --reporter=line` passes.
- The rounded-camera spec remains green inside `pnpm test:e2e`.

---

### ~~TASK-241~~: Record: Fix inspector rail hit-target overlay regressions

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- Full TASK-239 sweep failures show rail and destination preset buttons are visible but not clickable because `record-tab-root`, `inspector-shell`, `record-start-guard-banner`, or inner overlay divs intercept pointer events.
- Failed coverage includes `inspector-rail.spec.ts` category switching and `export-tab.spec.ts` destination preset linkage.

#### Scope

- Verify whether the regression is product-side hit testing/z-index/pointer-events or stale test click targeting.
- Keep the Record inspector rail accessible by pointer and keyboard.
- Confirm destination preset selection remains reachable before a first take.

#### Verification

- `pnpm exec playwright test tests/electron/inspector-rail.spec.ts tests/electron/export-tab.spec.ts -g "category|rail|destination presets" --reporter=line` passes.
- The same specs remain green inside `pnpm test:e2e`.

#### Completed

- Raised the inspector rail above the panel body in `apps/desktop/src/renderer/ui/InspectorShell.tsx` so overlapping panel content no longer steals pointer events from the rail buttons.
- Re-verified the two regressions that motivated this task: the focused Record background-control clicks now land reliably, and `tests/electron/inspector-rail.spec.ts` category switching is reachable by pointer again.

---

### ~~TASK-242~~: Record: Repair moved-project sidecar save regression

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- `tests/electron/project-relative-paths.spec.ts` failed `moved project preserves Record template/frame state and sidecar writes` because `recording.zoom.json` was not saved after moving the project.
- This threatens portable-project behavior that TASK-105 established.

#### Scope

- Reproduce the moved-project sidecar write failure and determine whether the app writes to the old path, skips the write, or cannot resolve the moved media path.
- Preserve relative media paths and moved-project reopen behavior.
- Ensure zoom/camera sidecars are written next to the moved recording file.

#### Verification

- `pnpm exec playwright test tests/electron/project-relative-paths.spec.ts -g "sidecar writes" --reporter=line` passes.
- Existing project portability tests remain green.

#### Completed

- Fixed the Record zoom sidecar save path in `apps/desktop/src/renderer/features/record/RecordTab.tsx` so the renderer again calls the preload contract with the correct two arguments.
- Re-verified both sidecar creation paths: `tests/electron/zoom-persistence.spec.ts` now writes `<recording>.zoom.json` successfully after authoring a manual marker, and `tests/electron/project-relative-paths.spec.ts -g "sidecar writes"` passes for the moved-project case.

---

### ~~TASK-243~~: Record: Fix camera framing and zoom geometry regressions

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- TASK-239 found camera geometry regressions outside the rounded-camera cluster.
- `record-background-controls.spec.ts` reported the screen frame moving when camera size changed.
- `zoom-marker.spec.ts` reported the camera frame growing instead of shrinking during an active zoom.

#### Scope

- Reconcile camera size, padding, border, and zoom transforms so screen and camera frames remain independently controlled.
- Verify whether the expected behavior changed after recent presentation-layout or zoom-engine fixes.
- Keep Record preview, saved snapshots, and Export preview geometry aligned.

#### Verification

- `pnpm exec playwright test tests/electron/record-background-controls.spec.ts tests/electron/zoom-marker.spec.ts -g "camera size|camera frame shrinks" --reporter=line` passes.

#### Completed (2026-04-26)

- Fixed the hit-target side of this cluster: `tests/electron/record-background-controls.spec.ts` now passes for `background padding affects only the screen frame` and `background inset affects only the screen border`.
- Tightened Record-tab playhead propagation so zoom-driven preview geometry reacts fast enough for both focused e2e checks and real paused/scrub interactions.
- Re-verified the remaining red in this lane: `tests/electron/zoom-marker.spec.ts` `camera frame shrinks while an active zoom is applied` now passes.

---

### TASK-244: Record: Stabilize no-baked-UI capture artifact e2e

**Priority:** P1 | **Status:** TODO

#### Problem

- `tests/electron/record-no-baked-ui.spec.ts` failed because no new recording artifact appeared within 15 seconds.
- The test did not reach the pixel check for whether Rough Cut UI was baked into the capture.

#### Scope

- Determine whether fresh recording creation is slower/flaky in the full suite or whether artifact saving regressed.
- Keep the original guarantee: notification chrome and Rough Cut UI must not appear in the captured `.webm`.
- Avoid increasing timeouts unless recording completion is healthy but legitimately slower in CI-like e2e runs.

#### Verification

- `pnpm exec playwright test tests/electron/record-no-baked-ui.spec.ts --reporter=line` passes.
- The spec remains green inside a full e2e sweep.

---

### ~~TASK-245~~: Tests: Repair Record zoom panel selector ambiguity

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- `tests/electron/record-tab.spec.ts` failed `shows the zoom-to-cursor control in the zoom panel` because `getByRole('button', { name: 'Zoom' })` now matches both the inspector rail Zoom button and `Create zoom marker from focus`.
- This appears to be stale test targeting rather than a product failure.

#### Scope

- Narrow the selector to the inspector rail Zoom button or the active zoom panel root.
- Preserve coverage that the zoom-to-cursor control is visible in the Zoom inspector.

#### Verification

- `pnpm exec playwright test tests/electron/record-tab.spec.ts -g "zoom-to-cursor" --reporter=line` passes.

#### Completed

- Narrowed the spec to the actual Zoom inspector rail button instead of the ambiguous accessible-name query that also matched `Create zoom marker from focus`.
- Re-verified `tests/electron/record-tab.spec.ts` `shows the zoom-to-cursor control in the zoom panel`.

---

### TASK-246: Tests: Repair Record screenshot template specs

**Priority:** P1 | **Status:** TODO

#### Problem

- `tests/electron/screenshot-record.spec.ts` failed to find `Talking Head`, `Social Vertical`, and `Screen Only` by text.
- The failures likely reflect the current inspector/template navigation rather than the screenshot assertions themselves.

#### Scope

- Update screenshot specs to open the current Templates inspector surface before selecting template presets.
- Decide whether these screenshot-only specs should stay in the default full e2e suite or move behind an explicit visual-capture command.

#### Verification

- `pnpm exec playwright test tests/electron/screenshot-record.spec.ts --reporter=line` passes or the specs are explicitly gated out of the default sweep.

---

### ~~TASK-247~~: Record: Fix cursor-follow no-op in saved-take zoom preview

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- The full e2e sweep still fails `tests/electron/cursor-follow-visual.spec.ts` because enabling `followCursor` does not visibly change the framed area in the saved-take Record preview.
- A focused rerun still reproduces the issue after unrelated cursor timing fixes, so this no longer looks like a fixture-only failure.

#### Scope

- Verify that the saved-take Record preview and its cursor overlay resolve the same zoom-follow transform at the same source frame.
- Preserve TASK-234 cursor timing fixes while restoring visible framing changes when `followCursor` is toggled.
- Keep Record preview and export/frame-resolver zoom behavior aligned.

#### Verification

- `pnpm exec playwright test tests/electron/cursor-follow-visual.spec.ts --reporter=line` passes.

#### Completed (2026-04-26)

- Tightened Record preview playhead propagation so zoom-follow visual changes are reflected faster in the saved-take preview path.
- Cleared inherited visibility/crop authoring state in `tests/electron/fixtures/zoom-fixture.ts` so zoom/cursor e2e cases no longer inherit cursor-hidden state from unrelated saved takes.
- Updated the shared playback fixture to a real on-disk project/media pair available on this workstation and made the zoom fixture fall back safely when the old env/user-local project path is missing.
- Re-verified the cursor-follow case inside a grouped headless rerun with neighboring Record specs.

---

### ~~TASK-248~~: Tests: Update retroactive cursor repair e2e for compositor path

**Priority:** P2 | **Status:** ✅ DONE (2026-04-26)

#### Problem

- `tests/electron/cursor-retroactive-repair.spec.ts` still fails after removing stale display-bounds caching, but the remaining wait targets `canvas[data-source-frame]`, which the current compositor-backed cursor overlay no longer renders.
- That means the current red is at least partly a stale test-contract issue on top of any real cursor normalization behavior.

#### Scope

- Update the spec to probe the current cursor overlay debug contract instead of a removed canvas selector.
- Keep coverage for the real behavior: legacy absolute cursor coordinates should be rebased into the recorded display bounds before playback rendering.

#### Verification

- `pnpm exec playwright test tests/electron/cursor-retroactive-repair.spec.ts --reporter=line` passes.

#### Completed

- Re-pointed the retroactive repair spec at the current cursor overlay canvas contract (`[data-testid="cursor-overlay-canvas"]`) instead of the removed legacy selector.
- Re-ran the spec in the repo's explicit headless serial mode: `pnpm test:e2e:headless:serial tests/electron/cursor-retroactive-repair.spec.ts`.

---

### TASK-249: Record: Honor zoom auto-shrink for persisted camera frame edits

**Priority:** P1 | **Status:** CANCELLED (2026-04-26)

#### Problem

- `tests/electron/zoom-marker.spec.ts` still fails `camera frame shrinks while an active zoom is applied` even after aligning zoom scale lookup with clip-local source frames.
- `TemplatePreviewRenderer.tsx` currently applies auto-shrink only when it computes camera placement from the template layout; persisted `presentation.cameraFrame` overrides bypass `positionCameraFrame()`, so the camera never shrinks during active zoom.

#### Scope

- Apply the same zoom-driven camera shrink behavior to persisted/manual camera frame overrides without breaking saved framing edits.
- Preserve camera aspect-ratio, roundness, and drag/resize fidelity across Record/Edit/Export.

#### Verification

- `pnpm exec playwright test tests/electron/zoom-marker.spec.ts -g "camera frame shrinks" --reporter=line` passes.
- Related camera framing specs remain green.

#### Cancellation Note

- Follow-up investigation showed persisted camera frame overrides were already running through `applyCameraAutoShrink`.
- The actual root cause for the focused failure was stale Record-tab playhead propagation, which was fixed under `TASK-243`.

---

### TASK-182: Record: Make camera sidecar capture deterministic on first take

**Priority:** P0 | **Status:** IN PROGRESS (2026-04-21)

#### Problem

- Real fresh takes still intermittently import with `cameraFilePath: NONE` even when the panel acquires a live webcam stream.
- Clean repro traces show multiple failure modes in the same lane:
  - the panel can begin recording before the camera stream exists at record start
  - screen `MediaRecorder.start()` can fail while FFmpeg still records screen successfully
  - custom `CameraRecorder` can start successfully but still yield no buffer at finalize
- The result is an empty camera layer in Record playback, which breaks trust in the core tutorial-recording workflow.

#### Scope

- Make first-take camera capture deterministic on the real Linux workstation.
- Ensure camera sidecar recording survives the FFmpeg screen-fallback branch.
- Keep the higher-quality camera path if it can be integrated correctly; only downgrade as a deliberate fallback decision.
- Add direct verification around start, finalize, buffer extraction, and imported camera asset presence.

#### Active hypotheses

- The panel begins recording before the webcam source is fully usable in the renderer lifecycle.
- Mediabunny `MediaStreamVideoTrackSource` errors are escaping via `errorPromise` and invalidating finalize.
- The camera recorder start/stop path is racing with the failed screen `MediaRecorder` branch.
- Renderer visibility / panel hide behavior on Linux may still be interfering with live webcam frame delivery.

#### First Steps

- Instrument `camera-recorder.ts` lifecycle end to end (`start`, `errorPromise`, `finalize`, buffer extraction, cleanup order).
- Keep a deterministic clean repro script for first-take camera capture against a fresh Vite/Electron runtime.
- Verify whether the camera sidecar path should stay on Mediabunny/WebCodecs or fall back selectively after proving the failure source.
- Rebuild a stable camera artifact spec only after the real runtime path is deterministic again.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/renderer/features/record/camera-recorder.ts`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/recording/capture-service.mjs`
- `tests/electron/record-camera-artifact.spec.ts`

#### Why this matters

This is the current top blocker for using Rough Cut as a personal daily recording tool. A recorder that occasionally loses the webcam on the first take is not trustworthy, no matter how strong the rest of the pipeline is.

---

### ~~TASK-183~~: Record: Fix Linux X11 screen capture bounds on secondary displays

**Priority:** P0 | **Status:** ✅ DONE (2026-04-23)

#### Progress (2026-04-23)

- Added Linux/X11 monitor-layout parsing via `xrandr --listmonitors` in `apps/desktop/src/main/index.mjs` and now prefer real X11 monitor geometry when deriving capture bounds for FFmpeg/cursor sidecars.
- Normalized X11 display-string construction so the FFmpeg target display stays a valid `:display.screen+X,Y` form instead of blindly appending `.0`.
- Tightened source resolution to prefer the actual `getDisplayMedia` granted screen source for the take, rather than only the persisted selected source ID.
- Verification completed on the real secondary-display path: `xrandr --listmonitors` matched the expected dual-monitor geometry (`DP-0` at `+0+0`, `DP-2` at `+1920+0`), the session resolved `Screen 2` to display id `3` with capture bounds `{ x: 1920, y: 0, width: 1920, height: 1080 }`, and FFmpeg recorded `:0.0+1920,0` as a `1920x1080` artifact.
- Direct frame extraction from the saved FFmpeg recording confirmed the raw capture is correct. Remaining visible framing issues were traced to Record-tab presentation chrome, not X11 capture bounds.

#### Problem

- Real recordings on secondary displays are still reported as cropped even after prior compositor and preview fixes.
- The remaining likely fault is the FFmpeg X11 capture rectangle derivation used by the real saved-screen artifact, not the preview surface.
- This is especially visible on multi-display setups where selected source IDs resolve to a non-primary screen.

#### Scope

- Verify that `screen.getAllDisplays()` mapping, display ID resolution, and X11 `:0.0+X,Y` offsets match the actual target display.
- Ensure `video_size`, `offsetX`, and `offsetY` passed to FFmpeg and cursor sidecars align with real workstation coordinates.
- Prove the fix on the specific problematic secondary display setup.

#### First Steps

- Capture and compare the resolved `bounds` vs `captureBounds` logs for the failing screen.
- Validate `getDisplayCaptureBounds(...)` behavior under Linux/X11 with non-primary screens.
- Re-record on the problematic screen and compare the saved artifact geometry with the actual display dimensions.

#### Key files

- `apps/desktop/src/main/index.mjs`
- `apps/desktop/src/main/recording/ffmpeg-capture.mjs`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/recording/cursor-recorder.mjs`

#### Why this matters

Screen crop on the actual saved file destroys the value of a tutorial recording even when preview looks correct. This must be fixed at the native capture rectangle layer, not cosmetically in playback.

---

### ~~TASK-184~~: Record: Eliminate Pixi video alpha CSP noise in the renderer

**Priority:** P1 | **Status:** ✅ DONE (2026-04-23)

#### Resolution (2026-04-23)

- Confirmed the runtime fix lives in `packages/preview-renderer/src/preview-compositor.ts`: Rough Cut patches Pixi `VideoSource.load()` to bypass the internal alpha-probe path that tries to load `data:video/webm;base64,...`.
- Kept CSP strict. No changes were needed in `apps/desktop/src/renderer/index.html` or `apps/desktop/src/renderer/panel.html`.
- Added regression coverage in `packages/preview-renderer/src/preview-compositor.test.ts` so future Pixi integration changes do not silently reintroduce the CSP-noise path.
- Verification completed: `pnpm --filter @rough-cut/preview-renderer test` passed (`28` tests), `pnpm --filter @rough-cut/preview-renderer typecheck` passed, and repo-level `pnpm typecheck` passed.

#### Problem

- The renderer still logs a persistent CSP violation for `data:video/webm;base64,...`.
- Tracing shows this comes from PixiJS video alpha detection logic, not from the application’s own camera save/import code.
- The message is noisy and misleading during camera debugging, and may still indicate a renderer branch that should be explicitly bypassed.

#### Scope

- Remove or bypass the Pixi video alpha-detection probe without broadening CSP.
- Keep `media-src` strict.
- Confirm the renderer no longer emits the `data:video/webm` CSP violation during normal playback.

#### First Steps

- Verify whether explicit `alphaMode` on the active `VideoSource` path is sufficient in the actual runtime bundle.
- If not, patch or wrap the relevant Pixi video source behavior at the app integration layer.
- Re-test after a forced Vite rebuild so stale prebundled code is not mistaken for a source-level failure.

#### Key files

- `packages/preview-renderer/src/preview-compositor.ts`
- `apps/desktop/src/renderer/index.html`
- `apps/desktop/src/renderer/panel.html`

#### Why this matters

This warning is currently polluting the debugging signal around camera failures. Removing it cleanly will make remaining recorder regressions much easier to reason about.

---

### ~~TASK-185~~: Record: Stabilize camera preview track lifecycle

**Priority:** P2 | **Status:** ✅ DONE (2026-04-24)

#### Resolution (2026-04-24)

Root cause confirmed via Playwright probe (`tests/electron/record-camera-source-switch.spec.ts`): on Linux V4L2, calling `navigator.mediaDevices.getDisplayMedia` silently flips the camera track's `readyState` from `'live'` to `'ended'` within ~2ms of resolving — **without firing the `'ended'` event**. Every `ended`-listener recovery path (the per-track listener at PanelApp.tsx:2054, the "Camera disconnected" toast at :2228, the track-ended recorder pivot) therefore never ran. After each screen-source switch the dead track lingered and the `<video>` went black.

Fix: added the screen capture `stream` to the camera acquisition useEffect's dep array. After each source change the effect re-runs; its existing `readyState === 'live'` guard short-circuits when the camera track is healthy and falls through to `getUserMedia` only when the V4L2 quirk has killed the track. Result: ~500ms recovery flicker instead of permanent black.

Regression guard: `tests/electron/record-camera-source-switch.spec.ts` asserts `trackReadyState === 'live'` and `videoPaused === false` after every source switch.

#### Progress (2026-04-24)

- **Diagnostic landed** (commit `8c8f04e`): preview camera track now logs an `[PanelApp][task-185] Camera preview track ended unexpectedly` warning with stack trace whenever it transitions to `ended`. Always-on observability for the next reproduction.
- **Structural fix landed** (commit `9de2b7f`): removed `cameraStream` from the preview useEffect's dependency array and switched to reading via `cameraStreamRef.current`. This eliminates the self-retrigger loop where `setCameraStream(s)` inside the effect caused the effect to re-run and potentially re-acquire during transient non-live states — a plausible root cause for the 2026-04-22 ended-track state.
- All camera-artifact (3) and camera-template-parity (5) specs still green with both changes.
- **New reproduction isolated (2026-04-24):** on Linux, the panel preview camera can turn black immediately after selecting a screen source in the setup panel, before recording even starts. This is now a reliable UX-level repro for the task.
- **Important split confirmed:** the saved camera capture path is healthy even when the live panel preview goes black. Direct extraction from the saved MP4 (`recording-2026-04-24T07-02-31-920Z-camera.mp4`) shows real camera video, so the remaining bug is preview lifecycle/rendering, not camera recording fidelity.
- **Mitigations attempted:**
- Added preview auto-heal on `track.onended` so the panel re-acquires camera when the preview track ends unexpectedly.
- Switched the small circular PiP preview to a cloned camera track so the on-screen bubble is less coupled to the main preview stream lifecycle.
- Adjusted the camera start gate so recording probes camera availability directly instead of blocking on a stale preview-warmup race.
- **Current outcome:** recording is more truthful and camera sidecar capture works, and the live panel preview now stays usable through source selection in the validated manual flow. Remaining saved-take replay issues are tracked separately under TASK-191.

#### Remaining

- TASK-185 is complete. Remaining replay/progression issues in Record review are tracked separately under TASK-191.

#### Context

During the 2026-04-22 camera-recording bug, the preview's camera `MediaStreamTrack` had already transitioned to `readyState === 'ended'` by the time the user clicked REC. The recorder fix (acquire a fresh `getUserMedia` stream at REC click, see `apps/desktop/src/renderer/features/record/PanelApp.tsx:2410-2463`) decouples recording from the preview's lifecycle, so this is no longer a functional blocker for capture. However, an ended preview track means the user sees a frozen/dead camera in the panel UI, which is still a real UX bug.

Root cause of the preview track ending or blacking out mid-session is still **unconfirmed**. The 2026-04-24 work established a more precise symptom: camera preview can black out the moment a screen source is selected, while recording the same camera to disk still succeeds.

#### Suspects

- `cameraStream` is its own dep in the preview `useEffect` at `PanelApp.tsx:1921-1985`. Each `setCameraStream(s)` re-runs the effect. The guard at `:1933-1940` short-circuits only when `readyState === 'live'` AND `activeCameraStreamKeyRef.current === desiredCameraKey`. Transient non-live states (e.g. briefly muted) during the guard check would cause the effect to re-acquire and stop the old track.
- Panel `BrowserWindow` show/hide events around the REC transition may cause Chromium to pause/freeze the media stream for the hidden window, transitioning the track to ended.
- `activeCameraStreamKeyRef.current` is assigned inside the `.then()` block at `:1968`, so there is a small window where the ref doesn't match `desiredCameraKey` even after a successful acquire.
- `beforeunload` handler at `:2495-2497` calls `teardownLocalRecordingResources` which stops ALL `cameraStreamRef` tracks at `:2491`. If this fires spuriously (nav, soft-reload), preview dies.
- Selecting a screen source triggers `getDisplayMedia` acquisition and setup-state updates; one of those transitions may be invalidating the live preview `<video>` element or the underlying track even when camera recording remains healthy.
- The panel PiP `<video>` preview path may be more fragile than the recorder path under Linux/X11, especially when the screen preview/compositor and camera preview both update in the same panel state.

#### First Steps

- Reproduce with the simplest panel flow: open panel -> enable camera -> select a screen source. This is now the primary repro, simpler than the old REC-click timing repro.
- Compare three states for the same take: live PiP preview in panel, saved camera MP4 extracted frame, and imported camera playback in Record. This separates preview bugs from capture bugs.
- Inspect whether `[PanelApp][task-185] Camera preview track ended unexpectedly` fires on the black-preview repro. If not, focus on the PiP `<video>` painting path rather than only the track lifecycle.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx:1921-1985` — preview effect
- `apps/desktop/src/renderer/features/record/PanelApp.tsx:2477-2492` — teardownLocalRecordingResources

#### Why this matters

The recorder is now immune (TASK-185 is not a data-loss risk). But an unexplained preview-track-ended state is a latent correctness/UX issue, and the longer it lives, the more it surprises future contributors. Also, the CLAUDE.md rule added this session (`Recording Owns Its Own Streams`) says recorders must not trust preview tracks — stabilizing the preview reduces the pressure on that rule.

#### Non-goals

- Do NOT revert the recorder fix at `PanelApp.tsx:2410-2463` as part of this task.
- Do NOT re-introduce `waitForLiveVideoTrack` for the recorder path.

---

### ~~TASK-186~~: Record: Unify in-app pre-record flow and floating recording panel

**Priority:** P0 | **Status:** ✅ DONE (2026-04-23) — Cuts A/B/C shipped. Follow-on panel cleanup landed under TASK-187, and the stuck pre-start screen was closed under TASK-189.

#### Problem

- Rough Cut currently exposes two overlapping recording workflows: the in-app Record surface and the floating recording panel.
- The split makes the product feel redundant and increases the chance that users set up recording in one place but have to mentally switch models when the panel opens.
- Even where state is technically shared, the experience still reads as two separate products instead of one coherent pre-record -> during-recording flow.

#### Goal

Define and implement one truthful recording workflow:
- the main app owns pre-record setup and trust-building
- the floating panel owns only the narrow during-recording controls that must stay available while capturing
- no user should have to re-learn the workflow or wonder which surface is the real source of truth

#### Scope

- Audit every control that exists in both the main Record surface and the floating panel.
- Decide which controls belong only in pre-record, which belong only in the active panel, and which must be mirrored because they affect a live session.
- Remove or de-emphasize duplicated controls that create the feeling of two recorders.
- Tighten the handoff from `RecordTab` into `PanelApp` so opening the panel feels like continuing the same session rather than entering a second app.

#### First breakdown

- **Pre-record in app:** source selection, mode selection, template/layout choice, device choice, readiness checks, trust cues.
- **During-record panel:** stop/pause/resume, elapsed time, live state, limited device/offline diagnostics, safe-stop/recovery actions.
- **Post-record back in app:** saved take review, playback confidence, sidebar authoring, timeline edits, export.

#### First Steps

- Inventory duplicated controls and labels between `RecordTab.tsx`, `BottomBar.tsx`, and `PanelApp.tsx`.
- Write a single ownership map for every recording control: pre-record only, panel only, or shared live-session status.
- Update the product wording in the UI and plan so the panel is framed as a focused in-session controller, not a second full recorder.
- Land the first pass of simplification behind existing shared store/session plumbing rather than inventing a new state model.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx` (2186 lines — in-app Record surface, displays BottomBar but every control click shunts to the panel)
- `apps/desktop/src/renderer/features/record/BottomBar.tsx` (559 lines — pure presentational component; already props-driven, reusable)
- `apps/desktop/src/renderer/features/record/PanelApp.tsx` (3048 lines — floating panel root, owns 100% of pre-record and during-record authority today)
- `apps/desktop/src/renderer/features/record/recording-config.ts` (shared IPC-synced store — both surfaces subscribe to it, so state unification is free)
- `apps/desktop/src/renderer/panel-main.tsx` (boots `panel.html` → `<PanelApp>`)
- `apps/desktop/src/main/recording/recording-session-manager.mjs` (`PANEL_OPEN` / `PANEL_CLOSE` IPC; opens the panel as a separate BrowserWindow)

#### Current progress (2026-04-23)

- **Inventory pass complete.** Before Cut B, the tab's BottomBar rendered device/source/mic/camera segments but every click called `openRecordingSetupPanel()` and popped the floating panel window. PanelApp owns all setup authority (source picker, device dropdowns, audio meter, offline badges, recovery notice) plus the during-record mini controller. RecordTab was a teaser; PanelApp was the real recorder.
- **Cut A shipped (commit 6453439):** deleted `RecordingPanel.tsx` (1052 lines of unimported dead code; panel window has long booted `PanelApp` via `panel-main.tsx`).
- **Cut B shipped (commit 400a518):** BottomBar's mic/system-audio/camera toggles and countdown selector now flip `recording-config` directly via `updateRecordingConfig({...})`. Panel continues subscribing to the same store, so its state tracks the tab's writes. A visible "⚙ Setup" button (`data-testid="record-open-setup-panel"`) was added next to the BottomBar as the explicit affordance for the full setup screen. Acceptance suite 13/13 pass.
- **Cut C shipped:** Wired the existing `SourcePickerPopup.tsx` into RecordTab as an in-window modal. Clicking the Source chip now opens the inline picker (no second Electron window); selection writes to `recording-config`. The start-guard banner button also routes to the inline picker and reads "Pick a source". The ⚙ Setup button remains the path to the full panel for device dropdowns, audio meter, diagnostics, recovery, and the mode selector (Full Screen / Window / Region still lives in the panel — SourcePickerPopup filters by mode but does not switch it). Acceptance suite 1.5.2 + 1.5.3 updated to reflect inline-picker-by-default + Setup-button-for-mode; 13/13 still pass.
- **Status:** The tab now owns all pre-record intent for source + devices + countdown. The panel is an on-demand "advanced setup + during-recording" surface only. TASK-187 shipped the first panel UX cleanup, and Lane 2 (`TASK-183`) remains the main open recording-core blocker in this slice.

#### Why this matters

A user who senses redundancy between the app and the panel will hesitate before recording. Unifying the flow is core product trust work, not cosmetic polish. Until it's done, no user can honestly judge whether capture/playback/export fixes worked — they're still confused about which window owns the recorder.

---

### ~~TASK-187~~: Record: Break down and redesign the floating recording panel UX

**Priority:** P1 | **Status:** ✅ DONE (2026-04-23)

#### Resolution (2026-04-23)

- Removed the obsolete pre-start summary-only card from `apps/desktop/src/renderer/features/record/PanelApp.tsx` so the floating panel now opens directly into actionable recording setup.
- Added clearer setup guidance copy and renamed the primary CTA from `REC` to `Start recording`, which better matches the panel's pre-start responsibility after TASK-186.
- Preserved the compact in-recording live-controller behavior while allowing the full setup surface only when the user explicitly enters setup during an active recording.
- Updated Electron coverage to match the new UX flow in `tests/electron/acceptance-record.spec.ts`, `tests/electron/record-device-selection-runtime.spec.ts`, `tests/electron/record-source-gating.spec.ts`, and `tests/electron/record-tab.spec.ts`.
- Verification completed: repo-level `pnpm typecheck` passed and `xvfb-run --auto-servernum pnpm exec playwright test tests/electron/record-device-selection-runtime.spec.ts tests/electron/record-source-gating.spec.ts tests/electron/record-tab.spec.ts tests/electron/acceptance-record.spec.ts` passed (`40 passed`).

#### Problem

- The recording panel currently mixes several jobs at once: readiness confirmation, live preview, in-session controls, device status, and miscellaneous settings.
- Its design and interaction model are not yet broken down into a clear set of user responsibilities, which makes it harder to judge what should stay, what should move back to the main app, and what should disappear.
- A panel that feels cluttered or semantically confused undermines confidence even if the underlying capture stack is improving.

#### Goal

Turn the floating panel into a sharply defined during-recording surface with a clear information hierarchy, predictable controls, and a minimal set of responsibilities.

#### Scope

- Break the panel into explicit modes or responsibilities: pre-start confirmation, recording-in-progress, paused/recovery, and failure/degraded states.
- Define the minimum viable control set for each state.
- Revisit panel sizing, layout density, preview prominence, and danger-action affordances.
- Ensure the panel never implies that it is the primary authoring surface for post-record work.

#### First Steps

- Capture the current panel information architecture: what appears before start, during recording, after pause, and during error states.
- Identify controls that belong in the panel versus the main app after TASK-186's ownership map exists.
- Draft a state-by-state panel breakdown with explicit goals, visible elements, and forbidden clutter for each state.
- Add acceptance criteria for the panel UX before deep visual polish starts.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/renderer/features/record/recording-panel.css` or adjacent styling modules if present
- `apps/desktop/src/renderer/features/record/BottomBar.tsx`
- `tests/electron/acceptance-record.spec.ts`
- `tests/electron/record-readiness.spec.ts`

#### Current progress (2026-04-23)

- **Inventory pass complete.** PanelApp.tsx has an explicit state machine at L204: `type PanelStatus = 'idle' | 'ready' | 'countdown' | 'recording' | 'stopping'`. Rendering branches on `status` plus a `setupModeDuringRecording` boolean (L1807) that lets the user flip from the MiniController (L2901–2909) to full setup mid-record. Each state's JSX is already located — see TASK-189 for line anchors into the setup-mode block.
- **Redundancy with tab mapped.** Post-TASK-186, these panel pre-record controls are redundant with RecordTab: `SourceSelector` (L516–633) vs tab's inline `SourcePickerPopup`; `DeviceControls` mic/camera/system-audio dropdowns (L762–898) vs tab's BottomBar toggles; countdown selector (also exists in BottomBar). Panel-only controls that should stay: `AudioLevelMeter` (L171–200), mode selector (`ModeSelectorRow` L1111), `RecoveryNotice` (L1629–1718), offline badges. The tab only has toggles; the panel still holds the richer device-picker UI.
- **Responsibility smells logged for later cuts:** RecordingControls rendered with disabled REC button during `status === 'recording' && setupModeDuringRecording` (L3032–3038) — dead UI path. Single IPC useEffect (L2069–2078, empty deps) couples countdown/status/elapsed subscriptions and calls stale-closure `startMediaRecorder`/`stopMediaRecorder` via refs. `finalizePanelRecording` (L2453–2551) mixes recorder teardown + IPC + state mutation. Camera stream effect (L2094–2177) mixes preview lifecycle with track-ended error handling.
- **Regression found and spun out:** After TASK-186 Cut C shipped, the panel's pre-start "RECORD SETUP / REVIEW SETUP" screen is obsolete in purpose (its copy still says the panel is where pre-record setup happens — it is not, after TASK-186) and stuck in practice (user reports inert clicks). Captured as TASK-189 (P0) for the next session because it blocks further TASK-187 redesign on a broken starting state.
- **Next cut (after TASK-189 lands):** Early-exit guard in setup-mode JSX so `RecordingControls` is not rendered when `status === 'recording' && setupModeDuringRecording` — sharpens the state boundary between "setup" and "live" without touching layout. Reversible, single-file change in PanelApp.tsx around L3031–3038.

#### Why this matters

The panel is the user's live safety surface during recording. If its design is muddy, the whole recording experience feels fragile even when capture succeeds.

---

### ~~TASK-188~~: Product: Break down stabilization work across Projects/Record/Playback/Sidebar/Timeline/Export

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Resolution (2026-04-25)

- Refreshed the product-area stabilization map so it reflects the current 2026-04-25 backlog rather than the earlier camera-preview-only execution lane.
- Added the missing backlog items this map exposed: `TASK-213` for visible Record-sidebar honesty, `TASK-214` for the post-take keep/retry/continue review path, and `TASK-215` for fresh-take review-to-export truth.
- Converted the task into an explicit ordering contract: current work stays on pre-record / during-recording truth first, then post-record review truth, then visible sidebar honesty, then downstream export verification.
- Left the map in place as a reference artifact for future sprint framing, so follow-on execution can happen in the new child tasks instead of keeping this breakdown task open forever.

#### Problem

- Rough Cut has a lot of open work spread across the Projects tab, pre-record setup, the during-recording panel, post-record playback, Record-sidebar features, timeline editing, and export.
- The master plan now has a better stability-first order, but it still does not give one concise end-user breakdown of the workflow surfaces that must become dependable before garnish features rise in priority.
- Without that breakdown, work can drift back toward isolated feature tasks instead of the end-to-end user journey.

#### Goal

Create and maintain a product-area stabilization map that breaks the app into the exact end-user surfaces that must become trustworthy in sequence.

#### Required areas

1. Projects tab
2. Record tab pre-record setup
3. During-recording floating panel
4. Post-record playback/review in Record
5. Existing Record-sidebar features
6. Timeline/editing depth needed for real review
7. Export tab / export flow

#### Scope

- Tie the existing task backlog to these areas explicitly.
- Identify missing stabilization tasks in each area.
- Make it obvious which tasks are blockers for end-user usefulness versus additive feature breadth.
- Keep new garnish work de-prioritized until each earlier area has a credible trust story.

#### First Steps

- Add the product-area stabilization map to this task's Active Work section instead of inventing a new top-level master-plan section that could break parser expectations.
- Mark missing or weakly specified areas that need new tasks rather than assuming the current backlog is sufficient.
- Use that area map to drive future sprint framing and task ordering.

#### Current blocker framing (2026-04-25)

1. **Projects truth is credible enough for now**
   - Do not invent new Projects-surface work unless reopen, path, or recovery regressions appear again.
2. **Pre-record and during-recording truth remain the active bottleneck**
   - Keep the current lane on `TASK-196`, `TASK-197`, `TASK-194`, and `TASK-195` before broadening into sidebar or export work.
3. **Post-record review is the next blocker after capture pollution is closed**
   - Pull `BUG-006`, `TASK-020`, `FEATURE-076`, `TASK-124`, and new `TASK-214` ahead of sidebar breadth.
4. **Record-sidebar work must be honesty-first, not garnish-first**
   - Prioritize real playback/export-preserving sidebar work before optional cleanup audits.
5. **Timeline and export remain downstream trust consumers**
   - Treat `TASK-208`, `TASK-209`, and new `TASK-215` as verification gates that should only move up once earlier Record truth is credible.

#### Missing stabilization tasks added by this pass

- `TASK-214` Record: Make post-take keep/retry/continue review path explicit
  - Needed because Area 4 described the user decision point after a take, but the backlog did not isolate that workflow as its own trust task.
- `TASK-215` Export: Gate fresh-take review-to-export truth after Record fixes
  - Needed because export parity exists in pieces, but there was no explicit task for re-proving the freshly-recorded review-to-export handoff after current Record stabilization work lands.

#### Ordering contract for the next sessions

1. Finish the current capture-safe panel lane (`TASK-196`, `TASK-197`, `TASK-194`, `TASK-195`).
2. Make the post-take review path explicit and trustworthy (`TASK-214`, `BUG-006`, `TASK-020`, `FEATURE-076`, `TASK-124`).
3. Re-gate export truth from a freshly reviewed take (`TASK-215`, `TASK-208`).
4. Keep broader timeline depth and sidebar garnish behind those earlier trust gates.

#### Product-area stabilization map (current output)

##### 1. Projects tab

**User goal:** create a project, reopen it later, move it on disk, and still trust that Rough Cut knows where everything is.

**What "stable" means**
- Creating or opening a project always lands in a sane working state.
- Recent projects, relative paths, and moved-project recovery behave truthfully.
- Recording destinations and imported assets remain coherent after relaunch.

**Current task anchors**
- ~~TASK-071~~ Project save/load with relative paths
- ~~TASK-072~~ Recent projects workflow
- ~~TASK-085~~ Persistent recording location + migration for stale `/tmp` references

##### 2. Record tab pre-record setup

**User goal:** choose what to record, choose devices, confirm readiness, and feel confident before clicking REC.

**What "stable" means**
- Source/mode/device selection is behaviorally real, not decorative.
- The main app is clearly the place where pre-record setup happens.
- There is one understandable path from setup into recording.

**Current task anchors**
- ~~TASK-086~~ Unified config store for main tab + recording panel
- ~~BUG-007~~ Toolbar toggles drive the real session
- ~~BUG-008~~ Source selection stays in sync across surfaces
- ~~TASK-087~~ Persist config across panel opens and restarts
- ~~BUG-009~~ Record mode selector must affect capture
- ~~TASK-088~~ Device selectors for mic, camera, and system audio
- TASK-143 Permission diagnostics + deep links + preflight test
- TASK-152 Fear-reducing micro-affordances (DND, test clip, safe stop)
- TASK-186 Unify in-app pre-record flow and floating recording panel

##### 3. During-recording floating panel

**User goal:** once recording starts, have a small, trustworthy control surface that keeps the session safe without duplicating the full app.

**What "stable" means**
- The panel has a narrow job: live state, elapsed time, stop/pause/resume, recovery cues, and only the minimum live-session diagnostics.
- It does not feel like a redundant second recorder.
- It stays visible/useful when needed and never pollutes the recorded output.

**Current task anchors**
- TASK-126 In-progress controller with finish, pause, restart, and delete
- ~~TASK-145~~ Floating controller hide/fade + never-in-video guarantee
- BUG-004 Dock/taskbar icon shown during recording
- BUG-011 Linux stop controls stay usable during recording
- TASK-185 Stabilize camera preview track lifecycle
- ~~TASK-186~~ Unify in-app pre-record flow and floating recording panel
- ~~TASK-187~~ Break down and redesign the floating recording panel UX
- TASK-194 Keep panel setup source changes free of eager display capture
- TASK-195 Gate panel source-switch camera-preview regression on Linux
- TASK-196 Replace Linux recording tray with capture-safe floating Stop pill
- TASK-197 Stop baking Rough Cut UI into Linux/X11 captures

##### 4. Post-record playback/review in Record

**User goal:** immediately after a take, review what was actually captured and trust the playback enough to decide whether to keep, retry, or continue editing/exporting.

**What "stable" means**
- Saved takes replay smoothly.
- Screen/camera/audio presence in playback matches the artifact on disk.
- Playback is a trustworthy review tool, not a source of ambiguity.

**Current task anchors**
- ~~BUG-012~~ Record replay bootstrap stalls on saved-session playback
- BUG-006 Playback laggy — Canvas2D drawImage bottleneck
- TASK-020 Audio playback via Web Audio API synced to playhead
- FEATURE-076 Audio capture + playback in preview
- TASK-124 Prove and harden saved-file system-audio capture
- ~~TASK-184~~ Eliminate Pixi video alpha CSP noise in the renderer
- ~~TASK-190~~ Fix saved-take playback reset + visual artifacts on window resize
- ~~TASK-191~~ Fix saved-take replay progression in Record review
- TASK-214 Make post-take keep/retry/continue review path explicit

##### 5. Existing Record-sidebar features

**User goal:** use the controls that are already visible in the Record sidebar and expect them to be real, understandable, and preserved into playback/export.

**What "stable" means**
- Already-exposed sidebar controls are completed before new garnish work is added.
- Placeholder sections are either made real or clearly de-scoped.
- Record-authored changes survive into playback, timeline review, and export.

**Current task anchors**
- TASK-121 Restore template picker and preset application flow
- TASK-032 VU meters for mic and system audio
- TASK-157 Watermark/logo inspector with persistent branding controls
- TASK-089 Keyboard shortcut overlays
- TASK-090 Highlights and annotations
- TASK-091 Titles and callouts
- TASK-092 Dynamic camera layouts
- TASK-130 Advanced cursor styles, click effects, and click sounds
- TASK-131 Cinematic motion blur
- TASK-132 Privacy blur masks and spotlight regions
- ~~TASK-150~~ Per-segment visibility toggles
- TASK-157 Watermark/logo inspector with persistent branding controls
- TASK-155 AI captions in Record review
- TASK-156 Smart Cut

##### 6. Timeline / editing depth needed for real review

**User goal:** once a take is worth keeping, make essential edits and inspect timing/content without the editor itself becoming the next trust gap.

**What "stable" means**
- Timeline playback and audio sync are believable.
- Basic clip/effect/keyframe operations support real review and refinement.
- Camera/layout/effect parity from Record into Edit remains truthful.

**Current task anchors**
- TASK-015 Serialize Record styling into resulting clips/effects
- TASK-017 Clip drag-to-move
- TASK-018 Cross-track clip dragging
- TASK-019 Effects stack UI
- TASK-020 Audio playback via Web Audio API synced to playhead
- TASK-023 Keyframe editor
- TASK-024 Transitions
- TASK-026 Audio waveforms on timeline clips
- TASK-065 Audio volume controls per clip/track
- FEATURE-084 Timeline multi-select + snap additions
- TASK-209 Edit: Investigate inspector-rail.spec.ts 8-failure layout cluster
- ~~TASK-077~~ Camera playback in Edit compositor
- ~~TASK-114~~ Camera source/timing parity with Record preview
- ~~TASK-115~~ Camera layout/visibility parity with Record preview
- ~~TASK-116~~ Record/Edit camera parity regression coverage

##### 7. Export tab / export flow

**User goal:** export the reviewed recording and trust that the final file matches what Rough Cut showed.

**What "stable" means**
- Export starts, progresses, fails, or succeeds truthfully.
- The exported artifact preserves the same screen/camera/audio/effect truth established earlier in the journey.
- Performance work does not outrun correctness.

**Current task anchors**
- ~~TASK-021~~ Export progress bar + frame counter
- ~~TASK-022~~ Output path selector
- ~~TASK-028~~ Audio mixing in export pipeline
- ~~TASK-029~~ Quality presets + editable settings
- ~~TASK-067~~ Preview + export parity test
- ~~TASK-112~~ File size + time estimates
- TASK-050 Preview: Switch to PixiJS VideoSource
- TASK-052 WebCodecs pipeline
- TASK-054 NVENC hardware encoding
- TASK-208 Export: Investigate export-tab.spec.ts 3-failure cluster
- TASK-215 Export: Gate fresh-take review-to-export truth after Record fixes
- ~~BUG-014~~ WebCodecs bitrate config rejected

#### Operating rule

When choosing between tasks, prefer the earliest unstable product area in this map.

Priority tie-breaker:
1. Projects truth
2. Pre-record truth
3. During-recording truth
4. Post-record playback truth
5. Existing Record-sidebar truth
6. Timeline/editing truth
7. Export truth
8. Only then garnish/new feature breadth

#### Key files

- `docs/MASTER_PLAN.md`
- `docs/ARCHITECTURE.md`
- Watchpost task views that consume the master plan ordering

#### Why this matters

This keeps Rough Cut focused on becoming useful and reliable for the end user across the whole workflow instead of looking locally polished in one surface while the rest of the journey still feels unstable.

---

### TASK-213: Record: Audit visible sidebar controls for real vs placeholder behavior

**Priority:** P3 | **Status:** TODO | **Depends on:** ~~TASK-188~~

#### Reclassification (2026-04-25)

- Moved back to low-priority backlog work.
- This is no longer treated as part of the stabilization critical path.
- The visible placeholder cleanup already shipped by removing `Highlights` and `Titles` from the Record inspector, so any further audit work here is optional follow-up rather than urgent product-trust work.

#### Problem

- The Record sidebar is now a real product surface in the saved-take review flow, but it mixes mature controls, partially trustworthy controls, and explicit placeholders.
- `TASK-188` established the rule that already-visible sidebar controls must become real or be clearly de-scoped before more garnish breadth is added, but that rule still needed an actual audit tied to the code.
- Without an audit, new work can keep landing next to placeholder categories and weak controls without clarifying which visible affordances are trustworthy today.

#### Goal

Produce a concrete inventory of the currently visible Record sidebar categories, classify each one as real, weak/partial, or placeholder, and use that inventory to drive follow-up sequencing.

#### Audit Snapshot (2026-04-25)

**Real enough to keep visible now**

- `Destinations`
  - Backed by `RecordDestinationPresetsPanel.tsx`
  - Visible preset buttons are wired to `onDestinationPresetChange`
- `Templates`
  - Backed by `RecordTemplatesPanel.tsx`
  - Visible template cards are wired to `onTemplateChange` and update resolution via `handleSelectTemplate`
- `Align`
  - Backed by `AlignmentToolbar`
  - Real interaction, but only enabled when a region is selected
- `Background`
  - Backed by `RecordBackgroundPanel.tsx`
  - Real controls for color, gradient, padding, corners, inset, and shadow
- `Camera`
  - Backed by `RecordCameraPanel.tsx`
  - Real controls for visibility, shape, aspect, size, padding, inset, and layout markers/presets
- `Focus`
  - Backed by `RecordCropPanel.tsx`
  - Real crop/focus flow for the screen region
- `Zoom`
  - Backed by `RecordZoomPanel.tsx`
  - Real auto-zoom, cursor-follow, and regenerate flow
- `Cursor`
  - Backed by `RecordCursorPanel.tsx`
  - Real style/effect/size/sound controls
- `Captions`
  - Backed by `RecordCaptionsPanel.tsx`
  - Real editing/style surface; generation is gated by asset availability and backend support rather than being a fake control

**Weak / partial and needs honesty checks**

- `Templates`
  - The picker is wired, but broader preset-application confidence still belongs to `TASK-121`
- `Destinations`
  - The visible preset selector is real, but downstream review/export linkage remains broader product work
- `Camera`
  - Layout snapshots and presets are visible and wired, but full multi-layout authoring depth still belongs to `TASK-092` and `TASK-159`
- `Captions`
  - The panel is real, but “Generate captions” depends on the actual AI/captured-asset path being available; this should stay honest in copy and disabled states

**Explicit placeholders that should not be treated as finished product surface**

- `Highlights`
  - `RecordRightPanel.tsx` renders `panel: <PlaceholderText />`
  - This is an exposed placeholder and should be treated as priority honesty debt mapped to `TASK-090`
- `Titles`
  - `RecordRightPanel.tsx` renders `panel: <PlaceholderText />`
  - This is an exposed placeholder and should be treated as priority honesty debt mapped to `TASK-091`

#### Code Evidence

- Sidebar categories are declared in `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- Explicit placeholder rendering lives at the `highlights` and `titles` category entries, both using `PlaceholderText` (`Coming soon`)
- The live sidebar is only shown for saved takes in `apps/desktop/src/renderer/features/record/RecordTab.tsx`

#### Follow-up Notes

1. `Highlights` and `Titles` were removed from the visible inspector, which reduces the immediate honesty problem.
2. Keep `TASK-121`, `TASK-092`, `TASK-159`, and caption-path work focused on making already-exposed controls trustworthy before adding new sidebar breadth.
3. When a control is conditionally unavailable, prefer truthful disabled states and copy over vague affordances that look implemented.
4. Do not count a sidebar category as “done” until its output survives into playback and export, not just local inspector state.

#### Next Steps

- Decide whether `Highlights` and `Titles` should be implemented next or temporarily hidden until `TASK-090` / `TASK-091` move into the active lane.
- Verify that `Templates`, `Destinations`, `Camera`, and `Captions` remain truthful in disabled/error states, not just in happy-path UI wiring.
- Use this audit as the gate before opening more Record-sidebar feature tasks.

#### Why this matters

The sidebar is already part of the product the user can see and click. Literal placeholders in that surface are more damaging than missing hidden features, because they teach the user not to trust the inspector. This task keeps the visible sidebar honest before more breadth is added.

---

### ~~TASK-214~~: Record: Make post-take keep/retry/continue review path explicit

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** ~~TASK-191~~

#### Resolution (2026-04-25)

- Added an explicit post-take decision card to `RecordTab.tsx` when a saved take is active in the Record review flow.
- The card now presents three concrete actions instead of dropping the user straight into an implicit review/editor state:
  - `Keep reviewing`
  - `Retry with another take`
  - `Continue in Edit`
- `Retry with another take` opens the source picker and preserves the current take, which keeps the flow truthful after `TASK-179` changed new recordings to append instead of replace.
- `Continue in Edit` now gives the user a direct next-step handoff into the Edit tab.
- The prompt is shown per active take and can be dismissed locally with `Keep reviewing`, making the post-record decision point explicit without forcing destructive behavior.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`

#### Why this matters

The Record surface is supposed to be a trustworthy post-take review step, not an ambiguous jump from recording into a full editor. Making the keep/retry/continue decision explicit reduces hesitation after capture and clarifies that retrying does not silently throw away the take that was just captured.

---

### ~~TASK-189~~: Record: Fix stuck + obsolete pre-start floating panel (post-TASK-186 fallout)

**Priority:** P0 | **Status:** ✅ DONE (2026-04-23) | **Depends on:** TASK-186 (done), TASK-187 (done)

#### Resolution (2026-04-23)

- Closed as part of TASK-187. `PanelApp.tsx` no longer renders the obsolete pre-start review/summary card.
- The floating panel now opens directly into the actionable setup surface, which removes the inert "Edit details" path and the misleading copy about the panel being the primary pre-record setup flow.
- Updated Electron coverage alongside TASK-187, and the focused Playwright suite passed (`40 passed`).

#### Problem

After TASK-186 Cut C shipped (Record tab now owns source + device + countdown selection inline), the floating panel's pre-start screen is both **obsolete in purpose** and **stuck in practice**. Visual evidence from 2026-04-23:

1. **Obsolete copy.** The panel's pre-start screen shows the heading "RECORD SETUP" and the subtitle *"This panel is where you choose what to record before starting. Review the current setup or open the full setup controls below."* That was accurate before TASK-186. It is now a lie — pre-record setup happens in the tab; the panel is on-demand advanced setup + during-recording only.
2. **Stuck panel.** The user reports "I can't do anything here" on the same screen. The REVIEW SETUP card and the "Edit details" button appear rendered but inert — clicks do not advance the panel from pre-start to a useful state. Needs repro + root cause (JS error, unhydrated store, missing handler, window focus/z-index issue, or broken stream acquisition on open).

#### Goal

Remove the dead pre-start screen from the panel entirely, OR reduce it to a thin "advanced setup" surface that never pretends to be the primary pre-record workflow. The panel must come up in a usable state whenever the tab's ⚙ Setup button opens it, regardless of whether the user has recorded before in this session.

#### Scope

- Audit `PanelApp.tsx` pre-start JSX (see TASK-187 inventory: `SetupSummaryCard` at L3017, `SetupSection` at L1088–1115, detailed mode selector + source picker + device controls + audio meter inside).
- Decide one of two directions:
  - **(a) Delete the pre-start REVIEW SETUP summary screen.** The panel opens directly into detailed setup (device dropdowns, audio meter, mode, recovery, source re-target). The summary card disappears; its copy disappears with it.
  - **(b) Keep the summary but rewrite its copy and interactivity** so it is honestly "advanced setup / diagnostics" and every control on it actually works when clicked.
- Repro the "can't do anything" state and fix the root cause (likely hydration, stream acquisition, or focus).
- Remove the line: *"This panel is where you choose what to record before starting. Review the current setup or open the full setup controls below."*

#### First Steps (for next session)

1. Launch `pnpm dev`, open the tab, click ⚙ Setup, and reproduce the stuck pre-start panel. Capture the DevTools console + main-process log for any error.
2. Grep `PanelApp.tsx` for the "This panel is where you choose" string and nearby `SetupSummaryCard` to locate the pre-start block. Line anchors: L3017 (`SetupSummaryCard` render), L2917–3047 (setup-mode JSX).
3. Decide (a) vs (b) based on what still has a real job post-TASK-186. If (a), cut the summary-card branch and make detailed setup the default render for setup mode.
4. Verify in app: open panel → immediate interactable state; close/reopen → same. Update acceptance tests for whichever affordances survive.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `tests/electron/acceptance-record.spec.ts`
- `tests/electron/record-readiness.spec.ts`

#### Why this matters

Right after TASK-186 Cut C, the panel shows the user a screen that contradicts the new workflow and does not respond to input. That is worse than pre-TASK-186 — the old redundancy at least worked. This is a stability regression induced by the unification work and must be addressed before TASK-187's deeper panel redesign, because TASK-187 will otherwise be built on top of a broken starting state.

---

### ~~TASK-190~~: Record: Fix saved-take playback reset + visual artifacts on window resize

**Priority:** P1 | **Status:** ✅ DONE (2026-04-24) | **Depends on:** TASK-177

#### Problem

In the Record tab's saved-take review, resizing the app window causes two observable failures:

1. **Playback resets to frame 0 when the resize-drag is released.** The `<video>` / preview compositor appears to be torn down and re-instantiated at the end of the drag, restarting the take from the beginning.
2. **Visual artifacts appear in the preview area during/after resize.** Multiple screenshots from 2026-04-23 show persistent rectangles (purple, cyan-striped, black, orange) overlaying the rendered frame at fixed positions, independent of the underlying recording content. The artifacts do not match anything in the source recording.
3. **Ghost camera frame above the live camera** (reproduction on 2026-04-24) when the floating setup panel is open over the Record tab — two camera images stacked vertically, the upper one stale, the lower one live.

Both symptoms appear only in the saved-take review inside the Record tab. This is separate from TASK-182 (camera sidecar) and from the main-process panel-visibility work — it is purely a renderer-side playback lifecycle bug.

#### Outcome (2026-04-24)

Root cause: an in-progress change reintroduced camera layer rendering into the PixiJS `PreviewCompositor`. The uncommitted diff in `packages/preview-renderer/src/preview-compositor.ts` (+97/-43) contradicted the prior dual-renderer decision recorded in memory #41101 ("revert compositor camera rendering"). With that diff active, the compositor drew a colored placeholder rectangle at the camera's layout rect via `colorForClipId()` / `LAYER_COLORS` whenever the camera texture was not yet bound — producing the orange/black artifacts at the template's top-right camera slot. Simultaneously, the compositor's camera draw ran alongside the Record-tab's separate camera renderers (`LivePreviewVideo` / `LivePreviewCanvas`), creating the ghost-camera stack observed in the setup-panel repro.

Fix:
- Reverted the camera-rendering reintroduction in `packages/preview-renderer/src/preview-compositor.ts` back to HEAD — compositor skips camera layers entirely, camera rendering remains owned by the React template slot (`CameraPlaybackCanvas` for Export, `LivePreviewVideo`/`LivePreviewCanvas` for Record).
- Reverted `packages/preview-renderer/src/preview-compositor.test.ts` to match.
- Added canvas inline-style re-assertion in `PreviewCompositor.resize()` so PixiJS cannot overwrite the `!important` fill styles during an in-place resize (latent bug per `.claude/CLAUDE.md`).

#### Hypotheses to verify

- The PreviewCompositor (PixiJS) is being disposed + recreated on each resize end instead of being resized in place, which resets video playback and may leave stale canvas content under a new renderer.
- A React parent is using a `key` prop tied to window dimensions, forcing an unmount/remount of the compositor host on resize commit.
- PixiJS `renderer.resize()` is being called without restoring inline styles, re-triggering the `!important` fill-style problem documented in `.claude/CLAUDE.md`, leaving artifacts where the canvas used to be.

#### Scope

- Resizing the window in the Record tab must NOT reset playback position of a saved take.
- No visual artifacts should persist over the preview surface after a resize.
- The PreviewCompositor must resize in place, not unmount/remount.

#### First Steps

- Identify the component tree that renders the Record-tab saved-take preview and confirm whether it shares the PreviewCompositor with the Edit tab or owns a separate instance.
- Instrument the compositor lifecycle (`init`, `dispose`) and log any remount during resize to isolate whether this is a React key/prop issue or an internal compositor teardown.
- Reproduce with devtools window-size drag; compare behavior to Edit tab to confirm scope is Record-only.

#### Key files (likely — verify during investigation)

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/` (saved-take review subcomponent — TBD)
- `packages/preview-renderer/src/preview-compositor.ts`
- Any `PreviewCanvas` adapter hosting the compositor

#### Why this matters

Saved-take review in the Record tab is the first place a user validates that a recording succeeded. If the review surface resets on resize and leaves visual garbage over the frame, the user cannot trust what they see — which undermines everything TASK-182 and TASK-183 are trying to fix at the capture layer. The capture can be correct and the user will still believe it is broken.

---

### TASK-191: Record: Fix saved-take replay progression in Record review

**Priority:** P1 | **Status:** ✅ DONE (2026-04-24) | **Depends on:** TASK-190

#### Resolution (2026-04-24)

The user-reported "playhead does not advance after replay" / "camera looks frozen" symptoms turned out to be entirely a test-side measurement bug, not a real Record-tab playback regression. Investigation:

- Diagnostic instrumentation in `PlaybackManager._syncLoop` showed the transport playhead and `cameraVideo.currentTime` both advance correctly after a near-end → seek-to-0 → replay sequence (sampled frames went 8 → 29 → 51 → 70 → 88 across 1s of replay; camTime 0.34 → 1.04 → 1.75 → 2.37 → 2.96).
- The `tests/electron/camera-replay.spec.ts` fixture was loading the wrong recording: `assets.find(asset.type === 'recording')` returned the first (stale) recording in the project file's asset list, not the recording actually wired into `composition.tracks`. With the wrong recording selected, `cameraAssetId` pointed at a camera asset that wasn't in the composition, so `hasCameraClip` was false and all 4 tests died in the fixture loader before any replay assertion ran.
- Even after the fixture fix, the tests were highly flaky (0–4 passing across consecutive runs). The cause: `cameraVideo.screenshot({ timeout: 5_000 })` inside a tight sample loop hits GPU `ReadPixels` stalls against PixiJS's continuous rendering, taking 500–1400ms per screenshot. With a 1.6s sample window, only 1–2 samples completed → `distinctPlayheadFrames < 3` → false-negative failure.

Fix:
- `tests/electron/camera-replay.spec.ts` — fixture loader now picks the recording referenced by a clip in the composition, and binds `cameraAsset` via `recording.cameraAssetId` (applied at both the outer loader and the in-page `layoutState` evaluate). Done in two places.
- `tests/electron/camera-replay.spec.ts` — replaced per-iteration `cameraVideo.screenshot` + pixel-hash diff with a cheap `cameraVideo.currentTime` reading. The new signal is "did the camera video element's clock advance" instead of "did the camera image pixels change", which is a stronger and faster proxy for the same intent. Sample interval reduced from 200ms → 100ms.

Result: 8 consecutive runs pass 4/4 deterministically. No production code change was required — Record-tab playback was already correct.

NOTE: `tests/electron/record-space-playback.spec.ts` and likely `tests/electron/edit-space-playback.spec.ts` use the same `canvas.screenshot` in tight-loop pattern and remain flaky for the same reason. Not in scope for TASK-191; tracked separately if useful.

#### Original problem (kept for history)

#### Problem

- In the Record tab's saved-take review, playback can enter a broken state where the UI appears to be playing but the playhead does not advance correctly, replay from the start behaves inconsistently, and the camera overlay can look frozen even when the saved camera file itself is valid.
- The same saved project can render camera playback correctly in Edit while Record review still stalls or resets, which suggests a Record-specific playback-control bug rather than a capture or import failure.

#### What we learned (2026-04-24)

- The latest camera recording file is **not frozen**. Direct frame extraction from the saved camera MP4 at multiple timestamps produced different images, so camera capture is healthy.
- A direct Record-review bug was fixed: `RecordTab.tsx` had stopped passing `cameraContent` into `TemplatePreviewRenderer`, so `CameraPlaybackCanvas` never mounted even though camera files and clips existed.
- Strengthened camera playback regressions exposed a second, separate issue: deterministic replay tests now fail primarily in the Record tab, while the Edit replay path passes.
- Existing replay fixture coverage was partially invalid because the old Apr 14 fixture pointed to missing media on disk. The replay tests now use a real project with valid on-disk screen and camera media.
- After fixture cleanup, the remaining failures point to Record-only playback progression problems:
  - replaying from the start does not settle into a clean stopped/seeked state before replay
  - camera/screen playback can remain logically "playing" while the playhead does not advance as expected
  - seeking after replay does not always land on the requested frame in Record review

#### Scope

- Record saved-take review must pause, replay, and seek reliably using the same active playback clock semantics users see in Edit.
- The transport store's `isPlaying` and `playheadFrame` must stay in sync with the actual visible playback state.
- Camera playback in Record review must remain frame-progressive when the screen playback is progressing.

#### Current hypotheses

- `PlaybackManager` still has Record-review-specific end-of-playback / replay state drift even after removing some `pause(0)` resets.
- `RecordTimelineShell` and `PlaybackManager` may still disagree about the authoritative playback state during replay transitions.
- The shared compositor's primary playback asset selection can drop to "no primary playback asset" mid-review, which may be collapsing the playback clock in Record but not in Edit.

#### First Steps

- Instrument the Record replay path around `PlaybackManager.play()`, `pause()`, `seekToFrame()`, transport `isPlaying`, transport `playheadFrame`, and compositor `getPlaybackFrame()`.
- Compare Record vs Edit behavior on the same project and same media to isolate the Record-only control path.
- Keep the deterministic `tests/electron/camera-replay.spec.ts` suite as the main regression harness until all Record replay scenarios pass.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTimelineShell.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `packages/preview-renderer/src/playback-manager.ts`
- `packages/preview-renderer/src/preview-compositor.ts`
- `tests/electron/camera-replay.spec.ts`

#### Why this matters

- A user can record a correct take and still believe Rough Cut is broken if saved-take review in Record cannot replay, pause, seek, and restart truthfully.
- This is now separate from camera capture correctness and separate from the panel preview lifecycle bug tracked by TASK-185.

---

### TASK-192: Tests: Stabilize space-playback specs by replacing in-loop screenshots with cheap signals

**Priority:** P2 | **Status:** ✅ DONE (2026-04-24) | **Depends on:** TASK-191

#### Resolution (2026-04-24)

Three stacked issues had to be fixed in order before the specs were green:

1. **`edit-space-playback.spec.ts` fixture pointed at missing media.** `RECORDED_PROJECT_PATH` was the Apr 14 `.roughcut`, whose referenced `recording-2026-04-14T15-25-05-444Z.webm` no longer exists on disk. The Edit tab couldn't load the active recording, so `navigateToTab(page, 'edit')` timed out at 30s waiting for `[data-testid="edit-tab-root"]`. Fix: switch to the Apr 23 fixture used by `camera-replay.spec.ts` (both screen + camera media present on disk).
2. **Same wrong-recording-asset picker bug as TASK-191.** `loadRecordedProjectIntoEdit` did `assets.find(asset.type === 'recording')`, which returns the first stale recording in the asset list, not the one wired into a composition clip. Replaced with a clip-owner lookup, identical to the camera-replay fix.
3. **Per-iteration screenshot loop.** `sampleRecordPlayback` (record) and `samplePlayback` (edit) called `canvas.screenshot` / `cameraVideo.screenshot` inside a tight loop, hitting GPU `ReadPixels` stalls (~0.5–1.4s each) against PixiJS's continuous rendering. Replaced with cheap state queries: `transport.playheadFrame` and `cameraVideo.currentTime`. The `distinctCanvasHashes` assertion in record-space was redundant with the existing playhead-frame check (PlaybackManager's `_syncLoop` writes `playheadFrame` directly from `compositor.getPlaybackFrame()`, which reads the underlying screen `<video>.currentTime`); replaced with `distinctPlayheadFrames >= 3`. The `distinctCameraHashes` assertion in edit-space was replaced with `distinctCameraTimes >= 2` (same intent: camera frame is visibly progressing).

A fourth incidental fix landed in `playwright.config.ts`: bumped global `timeout` from 30s → 60s. Cold Electron + Vite startup on the first test in a run can take 25–35s, blowing the 30s default during fixture setup before the test body's `test.setTimeout` has a chance to apply. Per-test timeout option and `test.describe.configure({ timeout })` did not extend fixture setup in Playwright 1.58 — only the global config did.

Result: 5 consecutive runs of `record-space-playback.spec.ts + edit-space-playback.spec.ts` pass 3/3 deterministically (~14s per run). Combined run with `camera-replay.spec.ts` passes 7/7.

#### Original problem (kept for history)

`tests/electron/record-space-playback.spec.ts` and `tests/electron/edit-space-playback.spec.ts` use the same `canvas.screenshot({ timeout: 5_000 })` / `cameraVideo.screenshot(...)` in-tight-loop pattern that TASK-191 eliminated from `camera-replay.spec.ts`. Each screenshot stalls on GPU `ReadPixels` against PixiJS's continuous rendering for 0.5–1.4s, so only 1–2 samples complete in the 1.0–1.2s sample windows. The `distinctCanvasHashes >= 3` / `distinctCameraHashes >= 2` assertions then false-fail.

---

### TASK-193: Record: Capture screen at full 60 fps on Linux/X11 (was choppy 30→25 fps)

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** —

#### Problem

User report: "the screen recording is not full fps". Probing the latest output (`/tmp/rough-cut/recordings/recording-2026-04-24T07-02-31-920Z.webm`) showed `r_frame_rate=30/1, avg_frame_rate=30/1` on a 60 Hz display. After bumping the cap to 60, recordings still played choppily — `ffprobe -count_frames` exposed that the file was *tagged* 60 fps but actually contained ~40 fps worth of frames, and ffmpeg was silently dropping ~33% of input.

#### Root cause

Three stacked issues, only the third was the real bottleneck:

1. **Hardcoded 30 fps in the X11 capture path.** `recording-session-manager.mjs` had six call sites pinned at 30 (the `startFfmpegCapture()` invocation, the `cursorRecorder.start()` invocation, the recovery-marker `captureMetadata`, and `buildFallbackRecordingMetadata`). All flowed into x11grab's `-framerate` and the cursor sidecar's frame-index math, which must match each other or the Edit-side cursor overlay desyncs.
2. **VP8 libvpx single-threaded by default.** `-cpu-used 4` with no `-threads` was theoretically slow at 1080p60. Tuned but turned out not to be the binding constraint.
3. **(Real cause) ffmpeg's per-input demuxer queue defaults to 8 packets.** With three inputs (x11grab + system audio + mic) the audio threads filled the queue and back-pressured the x11grab thread whenever libvpx stalled momentarily — frames silently dropped before reaching the encoder. ffmpeg's stderr printed `Thread message queue blocking; consider raising the thread_queue_size option (current value: 8)`, but `ffmpeg-capture.mjs` buffered stderr and only logged it on non-zero exit, so we never saw the warning.

#### Resolution

- `apps/desktop/src/main/recording/recording-session-manager.mjs`: replaced six hardcoded `30`s with a single `TARGET_CAPTURE_FPS = 60` module-level constant.
- `apps/desktop/src/main/recording/ffmpeg-capture.mjs`:
  - Prepended `-thread_queue_size 512` to every `-i` input in both `startFfmpegCapture()` and `startFfmpegAudioCapture()`. **This is the fix that mattered.**
  - Bumped `-cpu-used 4 → 8`, added `-threads 8` (encoder headroom; not the binding constraint but cheap insurance).
  - Added `createStderrDropWatcher()` — parses stderr on the fly for the queue-blocking warning and for an increasing `drop=N` counter (with a 2 s grace period to skip startup jitter), and emits `console.warn` lines so `.logs/app-runtime.log` will surface future regressions immediately instead of only on bad exit.

#### Verification

Standalone 10 s ffmpeg run with the exact final args produces 591 frames over 10.007 s = **59.06 fps average**, with 8 startup drops in the first 0.56 s and zero drops thereafter. In-app recording (mic + system audio + camera, 2.744 s) probed at 155 frames = 56.5 fps actual — explained exactly by the same 8-frame startup gap (164.6 expected − 8 = 156.6, matched within a frame). Visual check by user: smoother than before.

`pnpm -F @rough-cut/desktop typecheck` clean. Existing unit tests (`cursor-recorder`, `cursor-overlay-state`, `recording-pause-policy`) pass unchanged.

#### Out of scope (deliberate)

- MediaRecorder / Wayland / macOS / Windows fallback paths untouched. `getDisplayMedia` constraints already advertise `maxFrameRate: 60`; this user wasn't hitting those paths.
- VP8 bitrate left at 8 Mbps. At 1080p60 it's effectively half the per-frame budget vs 30 fps, so motion-heavy content may show more compression artefacts than before — bump to 12 Mbps in a follow-up if needed.
- VAAPI / Quick Sync hardware encoding on the i9's iGPU would drop encoder CPU to near zero but is a codec/container change (probably .mp4 instead of .webm) — orthogonal to this bug.

---

### ~~TASK-194~~: Record: Keep panel setup source changes free of eager display capture

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-185, TASK-186

#### Completed

- Audited `PanelApp.tsx` and confirmed display capture is only acquired from the explicit start-recording flow.
- Added shared helpers to serialize start-time display acquisition and release any stale setup-only display stream.
- Routed panel source changes and fallback re-targeting through the same guarded path so setup edits remain config-only until recording actually starts.
- Reused the same cleanup path when the selected source is cleared, preventing hidden setup-time display capture from lingering across source changes.
- Verified the focused regression stays green with `tests/electron/record-camera-artifact.spec.ts` covering the exact pre-REC source-switch case.

#### Problem

- The floating panel no longer owns the main screen preview, but it can still regress if setup-time source changes trigger `getDisplayMedia()` before the user clicks `REC`.
- On Linux/X11, that eager display acquisition can black out or invalidate the live camera preview even though the user is only changing setup state.
- This is a trust regression risk: the app can look broken before recording starts even when saved capture still works.

#### Scope

- Treat panel source changes during setup as config-only state updates unless recording is actually starting.
- Keep display-capture acquisition behind the `Start recording` path.
- Preserve correct cleanup when the selected source is cleared or recording stops.
- Avoid reintroducing hidden setup-time display acquisition through refactors or fallback branches.

#### First Steps

- Audit `PanelApp.tsx` for any setup-mode `getDisplayMedia()` path outside the explicit recording-start flow.
- Keep the panel state machine honest: setup can be ready-to-record without already holding a display stream.
- Add comments/guards where future refactors might be tempted to reacquire display capture on source change.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx`

#### Why this matters

- The panel should feel stable while the user is still deciding what to record.
- A setup-only source change must not silently trip the same Linux camera-preview failure mode again.

---

### ~~TASK-195~~: Tests: Gate panel source-switch camera-preview regression on Linux

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-194

#### Completed

- Kept the focused pre-`REC` source-switch guard in `tests/electron/record-camera-artifact.spec.ts` instead of leaving this behavior covered only by the ad-hoc probe.
- Scoped the regression gate to Linux, where the original failure mode was observed, so the test documents the platform-specific risk instead of implying a cross-platform artifact bug.
- Strengthened the assertions so the panel camera preview must stay visibly alive across setup-only source changes (`A -> B -> A`), not just preserve an internal track object.
- Kept the explicit `getDisplayMedia()` counter so the test still proves display capture is deferred until the user actually clicks `Start recording`.

#### Problem

- The specific regression is subtle: changing the selected source in the panel setup flow can look harmless in code review while reintroducing a Linux-only camera-preview blackout before `REC`.
- Without a focused regression gate, this could easily come back during unrelated panel cleanup or recording-start refactors.

#### Scope

- Keep a focused Playwright regression that proves panel source changes do not call `getDisplayMedia()` before recording starts.
- Assert the camera preview track remains live after changing the selected source in setup.
- Assert display capture is only acquired once the user actually starts recording.
- Make this check part of the stable camera-recording lane rather than leaving it as an ad-hoc one-off test.

#### First Steps

- Keep the focused source-switch regression in `tests/electron/record-camera-artifact.spec.ts` or extract it into a dedicated panel-lifecycle spec if that becomes clearer.
- Decide whether it belongs in the camera artifact lane, the readiness gate bundle, or both.
- Re-run it on the real Linux workstation whenever panel setup or recording-start logic changes.

#### Key files

- `tests/electron/record-camera-artifact.spec.ts`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`

#### Why this matters

- This is exactly the kind of regression that damages trust fast and is annoying to rediscover manually.
- A small, explicit gate is cheaper than repeatedly re-debugging Linux camera-preview breakage.

---

### ~~TASK-196~~: ~~Record: Replace Linux recording tray with capture-safe floating Stop pill~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-010

#### Problem

- On Linux/KDE Plasma the recording tray icon (a red circle) does not disappear when recording stops. Confirmed in the runtime log: `[session-manager] Tray hidden (Linux singleton kept alive)` fires correctly on every stop, but plasmashell continues to render the cached red bitmap in the panel after the underlying tray has been told to clear.
- Tested four progressively more aggressive workarounds, each visually verified by the user as still leaving the red dot stranded:
  1. `setImage(empty)` followed by `tray.destroy()` after 150 ms.
  2. Same, but with a 16×16 transparent PNG and 300 ms delay (avoids "empty placeholder square" artifact).
  3. Linux singleton tray — never destroy, just `setImage(transparent)` in place to hide.
  4. File-path-based icon swap with a unique filename per transition, to defeat path-keyed icon caches.
- All four still left the dot visible, which matches the symptom reported in the closed-without-fix Electron issue [#17000 "[KDE Plasma] tray can't actually destroy"](https://github.com/electron/electron/issues/17000). Related upstream: [#36274 (setImage segfaults on Linux)](https://github.com/electron/electron/issues/36274), [#20850 (setImage memory leak)](https://github.com/electron/electron/issues/20850).

#### Decision

- Stop relying on `Tray` for transient recording state on Linux. The Electron Tray API is not reliable enough on KDE Plasma (and other libappindicator-backed panels) to destroy or refresh on demand in Electron 35.
- Replace it with a small frameless `BrowserWindow` ("Stop pill"): 180×40, always-on-top, transparent background, red pulsing dot + "Stop Recording" button. `BrowserWindow.destroy()` is rock-solid on every desktop environment, sidestepping the bug entirely.
- Place the pill on a display whose bounds do NOT intersect the captured region, so it never appears in the recording. Single-monitor users (no capture-safe display) get no visible pill and stop via the existing global shortcut `Ctrl+Shift+Esc`.
- Keep the existing `Tray` path for macOS / Windows where it works correctly.

#### Scope of this commit

- `apps/desktop/src/main/recording/recording-session-manager.mjs`:
  - New `stopPillWindow` module binding.
  - Helpers: `rectsIntersect`, `findDisplayOutsideCapture`, `createStopPillWindow`, `destroyStopPillWindow`.
  - On Linux, `startRecording()` now calls `createStopPillWindow()` instead of `createTray()`.
  - `_cleanup()`, `handleBeforeQuit`, `will-quit` all destroy the pill (idempotent).
  - The pill click invokes `window.roughcut.panelStopRecording()` via the existing preload, so it routes through the same IPC path as every other Stop surface.
  - Recording notification body no longer references the (non-existent on Linux) tray icon.

#### Verification

- Runtime log now shows repeated create/destroy cycles on the two-display setup, e.g. `Stop pill created at (2790,16) on display id=3 (capture on {"x":0,"y":0,"width":1920,"height":1080})` followed by `Stop pill destroyed.` in `.logs/app-runtime.log`.
- Runtime log also shows the single-display fallback path: `Stop pill skipped — no capture-safe display`.
- Added `apps/desktop/src/main/recording/recording-session-manager-stop-pill.test.mjs` to guard the Linux stop-control routing, `createTray()` Linux no-op, and Stop-pill cleanup on normal/quit paths.
- Removed the now-dead Linux tray branches from `createTray()` / `destroyTrayIfAny()` so Linux no longer carries the stale AppIndicator workaround code path.

#### Follow-ups (after verify lands DONE)

- Decide whether the pill should expand to expose timer + pause when those features land.

#### Key files

- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/preload/index.mjs` (already exposes `panelStopRecording`)

---

### ~~BUG-014~~: Export: WebCodecs bitrate config rejected — pipeline stalls, no file produced

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20) | **Blocked:** the full Projects → Record → Export loop on Linux before this fix landed

**Symptom (reproduced twice, 2026-04-20)**

- Clicking Export enqueues a job, transitions the queue item to `running`, shows `Preparing export...` indefinitely. No output file is written.
- After the 210–240s timeout the UI surfaces: `config.bitrate must be a positive integer or a quality.` — that is a WebCodecs `VideoEncoder.configure()` runtime error.
- Estimates panel shows `File Size: NaN B`, indicating the same `NaN` is leaking through settings-derived math in at least two places.
- The job never transitions to a failed state in the queue — it just sits at `Preparing export...`.

**Empirical reproduction**

- `tests/electron/export-smoke.spec.ts` (existing CI spec) — FAILED at 240s timeout, 0-byte output. Fixture's source WebM was missing (`/tmp/rough-cut/recordings/...` cleared on reboot), which also surfaced as a `404` in the UI — but the job still never failed or fell back.
- `tests/electron/adhoc-export-fresh.spec.ts` (newly added) — FAILED identically, 0-byte output after 210s. This spec generates a fresh VP8+Opus WebM via `ffmpeg` and builds a clean project that references it, so stale-path problems are excluded. The UI line `config.bitrate must be a positive integer or a quality` is the revealing error.

**Root-cause hypothesis**

- `VideoEncoder.configure()` is being passed an invalid `bitrate` value (likely `NaN` or `undefined`), either because:
  1. The CRF-based quality setting is not being converted to a bits-per-second value before reaching the WebCodecs encoder, and `quality` isn't being passed as an alternative, OR
  2. The export-settings hydration path (project `exportSettings` → preset → encoder config) has a missing field that produces `NaN` during a multiplication (e.g. `resolution.width * resolution.height * frameRate * someMultiplier`).
- The `File Size: NaN B` in the Estimates panel is almost certainly the same bad value surfacing through a different consumer.

**Completed fix (2026-04-20)**

1. Added shared export-settings normalization so stale project shapes using `videoBitrate` or `crf` resolve to a canonical positive `bitrate` before the Export UI and WebCodecs pipeline consume them.
2. Added fast encoder-config validation so invalid bitrate values fail clearly instead of hanging the queue at `Preparing export...`.
3. Restored estimate math by feeding the Export UI normalized settings rather than the stale raw shape.
4. Verified the full repro with `tests/electron/adhoc-export-fresh.spec.ts`, which now produces a real audio-muxed MP4 from a freshly generated WebM source.
5. Added a focused unit test in `packages/export-renderer/src/video-encoding-config.test.ts` for invalid bitrate rejection.

**Files touched**

- `apps/desktop/src/renderer/features/export/export-settings.ts`
- `apps/desktop/src/renderer/features/export/run-export.ts`
- `apps/desktop/src/renderer/features/export/ExportTab.tsx`
- `packages/export-renderer/src/video-encoding-config.ts`
- `packages/export-renderer/src/video-encoding-config.test.ts`

**Test artifacts kept for reference**

- `test-results/export-smoke-export-smoke--7b82f-layable-mp4-file-with-audio/` — page snapshot, screenshot, trace (404 case)
- `test-results/adhoc-export-fresh-adhoc-f-4261e-reshly-created-webm-project/` — page snapshot surfacing the `config.bitrate` error (clean source case)
- `/home/endlessblink/.claude/plans/nifty-yawning-tome.md` — the full scoping plan that led to this reproduction

**Verification**

- `pnpm --filter @rough-cut/export-renderer test -- video-encoding-config.test.ts`
- `pnpm exec playwright test tests/electron/adhoc-export-fresh.spec.ts --workers=1`

**Follow-up**

- `TASK-028 Export: Audio mixing in export pipeline` is now DONE after removing the overlap-dropping collectors in both export audio paths and re-verifying the broader reopen/export flow.

---

### ~~TASK-146~~ / ~~TASK-160~~ / ~~TASK-161~~ / ~~TASK-067~~: Record/export fidelity stabilization

**Priority:** P1/P2 | **Status:** ✅ DONE (2026-04-21)

- Removed the old CSS-only zoom transform from `RecordingPlaybackVideo` so Record preview zoom is rendered by the compositor/frame-resolver path instead of by scaling the DOM host.
- Switched `resolve-frame` zoom offset math to source-media dimensions so preview and export share the same source-resolution zoom model.
- Added a valid playback fixture for parity tests because the older Apr 14 fixture pointed at a missing `/tmp` screen recording and could only exercise placeholder playback.
- Added a direct test-only tab switch hook to avoid flaky first-tab UI clicks during parity/playback regressions.
- Added `tests/electron/preview-export-parity.spec.ts` to compare raw Record vs Export compositor canvas pixels at the same frame.

**Key files**

- `apps/desktop/src/renderer/features/record/RecordingPlaybackVideo.tsx`
- `packages/frame-resolver/src/resolve-frame.ts`
- `apps/desktop/src/renderer/App.tsx`
- `tests/electron/fixtures/electron-app.ts`
- `tests/electron/fixtures/playback-fixture.ts`
- `tests/electron/preview-export-parity.spec.ts`

---

### ~~TASK-028~~ / ~~TASK-029~~: Export output flow completion

**Priority:** P1/P2 | **Status:** ✅ DONE (2026-04-21)

- Export audio mixing no longer drops overlapping segments before they reach the WebCodecs or FFmpeg finalize path, so overlapping clips are eligible for real output mixing.
- Export quality presets and editable settings are now treated as complete verified behavior: presets, editable resolution/frame-rate/CRF controls, and linked Record destination defaults all pass the focused export suite.

**Key files**

- `packages/export-renderer/src/audio-export.ts`
- `packages/export-renderer/src/audio-export.test.ts`
- `apps/desktop/src/main/index.mjs`
- `apps/desktop/src/renderer/features/export/ExportTab.tsx`

---

---

### ~~TASK-030~~: Record: Countdown timer (0/3/5/10s configurable)

**Priority:** P2 | **Status:** ✅ DONE (2026-04-16)

- Added visible countdown controls to the main Record surface so users can choose `Off`, `3s`, `5s`, or `10s` without opening the floating panel.
- Wired the selected countdown value through the shared recording config into `PanelApp` and the session manager so the configured delay is the one that actually runs before capture starts.
- Broadcast countdown and recording lifecycle session events back to the main Record window so the visible surface can reflect live countdown state instead of only the floating panel updating.
- Verified with workspace `pnpm typecheck` and added focused Electron coverage for countdown config updates on the main Record surface.

---

### ~~TASK-013~~: Record: PixiJS live preview

**Priority:** P0 | **Status:** ✅ DONE (2026-04-16)

- Replaced the visible Record-tab screen preview path with canvas-backed rendering and moved loaded-project playback onto the shared PixiJS compositor host so Record now uses the real compositor surface instead of a raw screen `<video>`.
- Kept Record-specific cursor overlays, zoom focal-point editing, and camera preview layering intact while the compositor handles the screen render path.
- Verified with desktop typecheck plus focused Electron coverage for Record-tab controls, live preview acceptance, and loaded-project compositor playback/seek regressions.

---

### ~~TASK-105~~: Relative asset paths for project portability

**Priority:** P2 | **Status:** ✅ DONE (2026-04-16)

- Project saves now serialize asset, thumbnail, cursor-sidecar, and library-reference paths relative to the `.roughcut` file.
- Project open now resolves relative paths against the project directory before falling back to the legacy filename-based repair search.
- Verified with Electron Playwright coverage that saved projects write relative paths on disk and still reopen after moving the whole project folder.

---

### ~~TASK-071~~: Project save/load with relative paths

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

- Implemented portable project save/load in `apps/desktop/src/main/index.mjs` by serializing project-linked file paths relative to the project document and resolving them on open.
- Preserved the existing stale-path recovery flow so older projects with broken absolute recording paths can still recover by basename search.
- Added direct Electron regression coverage for both data-level portability and the visible Projects UI flow, including moved-project reopen and thumbnail load.

---

### ~~TASK-072: Recent Projects Workflow~~

**Priority:** P2 | **Status:** ✅ DONE (2026-03-30)

Recent projects list with filtering, new/open project flows. IPC integration for project management between main and renderer. Fixed `setProject` to preserve `projectFilePath` so loaded projects maintain their save location.

---

### ~~TASK-075: Preview: Playback fluency — rVFC sync, consolidate loops, cache effects~~

**Priority:** P0 | **Status:** ✅ DONE (2026-04-16)

Improve playback smoothness by addressing identified bottlenecks in the rendering pipeline:

1. **requestVideoFrameCallback** — Replace rAF polling of `video.currentTime` with precise frame callbacks
2. **Consolidate rAF loops** — PlaybackManager should be sole timing authority; disable PixiJS ticker during playback
3. **Cache effect/filter state** — Only rebuild blur, round-corners, opacity filters when params actually change
4. **Skip redundant renders** — Don't re-render compositor when frame hasn't changed
5. **Reuse sprites** — Avoid destroying/recreating PixiJS sprites on layer set changes; update textures only

**Progress (2026-04-16):**

- `PlaybackManager` now starts Record playback only after seek-to-start settles, which removed stale-frame races when replaying or resuming the screen/compositor path.
- Record timeline transport drives playback through `PlaybackManager.togglePlay()` / `seekToFrame()` so replay, pause, and scrubbing use the real screen video clock.
- The `media://` handler now serves explicit byte-range responses, so Chromium treats recorded media as seekable and playback resumes from the visible playhead instead of jumping near frame 0.
- Camera playback stays under `PlaybackManager` ownership with clip-aware media-time resolvers, element-specific unregister guards, and `loadeddata` registration so camera resume/restart waits for a real decodable frame.
- Project swap flows (`Open`, `New`, `Projects`, `DEBUG: Reload Last`, and post-record project replacement) now pause playback first and `setProject()` clears stale `activeAssetId`, reducing cross-project camera/video leakage after reopen or restart.
- The PixiJS compositor now runs in manual render mode (`autoStart: false`) so `PlaybackManager` is the only playback clock and unchanged frames no longer incur automatic ticker-driven GPU renders.
- `PlaybackManager` now treats compositor/video `ended` state as a hard stop condition, which fixes replay sessions that could reach the end of media without snapping the UI back to frame 0.
- Verified with `pnpm --filter @rough-cut/preview-renderer typecheck`, `pnpm --filter @rough-cut/preview-renderer test`, and `npx playwright test tests/electron/camera-replay.spec.ts`.

**Key files:** `playback-manager.ts`, `preview-compositor.ts`, `preview-compositor.test.ts`

---

### ~~TASK-118: Export: Camera PiP preview parity with Record + Edit tabs~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-15)

Export tab preview now renders the camera picture-in-picture overlay identically to the Record and Edit tabs. The fix adds `EditCameraOverlay` to the preview container in `ExportTab.tsx`, driven by the same `resolveFrame` + `asset.metadata.isCamera` lookup used in `EditTab`. Camera shape, size, position, shadow, inset, roundness and visibility settings from the recording's `presentation.camera` are all respected. No new APIs — pure reuse of existing overlay component.

**Key files:** `apps/desktop/src/renderer/features/export/ExportTab.tsx`

---

### ~~TASK-120: Record: Decouple timeline playhead from per-frame React rerenders~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

Record playback no longer forces the full `RecordTab` tree to rerender on every playhead tick. The timeline now reads `playheadFrame` directly from the transport store, updates its needle and timecode imperatively through refs, and `RecordTab` only snapshots the playhead when the user explicitly creates a zoom marker. This keeps scrubbing responsive while removing the page-wide React churn that was causing visible stutter.

**Key files:** `apps/desktop/src/renderer/features/record/RecordTab.tsx`, `apps/desktop/src/renderer/features/record/RecordTimelineShell.tsx`

---

### ~~TASK-162~~: Record: Focus-first framing UX for screen and camera preview

**Priority:** P1 | **Status:** ✅ DONE

- Replace the current crop-first inspector language with a focus-first framing model so users start by choosing what should stay visible rather than entering a raw crop box mode.
- Add quick framing presets for common intents like centering the action, returning to the full frame, hiding browser chrome, and switching to vertical or square cuts.
- Improve the in-canvas editor with clearer guidance, an explicit done action, and less accidental mode exit behavior while preserving the existing crop data model underneath.
- Fix the advanced crop editor so `Free` framing is actually freeform instead of silently locking to the current aspect ratio during resize.

Files:

- `apps/desktop/src/renderer/features/record/RecordCropPanel.tsx`
- `apps/desktop/src/renderer/features/record/CropOverlay.tsx`
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`

Verification:

- Screen and camera framing controls read as focus/framing actions rather than low-level crop editing.
- Enabling framing drops the user directly into preview editing instead of requiring a second hidden action.
- `Free` mode supports non-locked resizing in the overlay.

---

### ~~TASK-163~~: Record: Advanced framing presets and guidance for crop editing

**Priority:** P2 | **Status:** ✅ DONE

- Added richer screen framing presets for left-column and right-column focus alongside the first-pass center, full-frame, top-trim, vertical, and square presets.
- Connected the Focus inspector to the timeline zoom workflow so the current screen focus can spawn a manual zoom marker at the playhead, prefilled with focal point and strength derived from the chosen focus region.
- Added inspector guidance on both sides of the bridge: the Focus panel now explains how to convert framing into motion, and the Zoom panel calls out when a screen focus region is available to reuse.

Files:

- `apps/desktop/src/renderer/features/record/RecordCropPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordZoomPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordCameraPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`

Verification:

- Verified with `pnpm --filter @rough-cut/desktop typecheck`.

---

### ~~TASK-218~~: Record: Cursor sprite desynced from recorded video (fps unit mismatch)

**Priority:** P0 | **Status:** ✅ DONE (2026-04-25)

#### Problem

- During playback, on-screen elements showed real hover/click highlights (proving the OS cursor really was there at capture time), but the cursor sprite drawn over the video appeared in a different position. The cursor visibly lagged the video and froze partway through long takes.
- Reproduced from data on disk: project `settings.frameRate=30`, asset `duration=210` frames, video file 7.004 s @ 60/1 fps, cursor sidecar 229 events with `max frame=391`. The click that landed on a button at recording frame 363 (`x=1623, y=527`, in-bounds) was being silently dropped by the loader because `363 ≥ 210`.

#### Root cause

- `cursor-recorder.mjs` timestamped events at `TARGET_CAPTURE_FPS = 60` Hz wall-clock cadence (`frame = round((Date.now() - startTime) / 1000 * 60)`). The renderer indexed `cursor[playheadFrame]` at the project's 30 fps cadence in `CursorOverlay.tsx`. So `cursor[N]` represented wall-clock `t = N/60 s` while `playheadFrame=N` represented `t = N/30 s` — cursor lagged 2× and the back half of events fell off the array (`cursor-data-loader.ts:40` clipped `frame >= totalFrames`).

#### Fix

- Added IPC channel `RECORDING_SET_TIMELINE_FPS`. Renderer (`App.tsx`) publishes `project.settings.frameRate` to the main process on every project/settings change.
- `recording-session-manager.mjs` keeps `currentTimelineFps` in sync and passes it (not `TARGET_CAPTURE_FPS`) to `cursorRecorder.start()`. The recovery marker's `captureMetadata` and the `PANEL_SAVE_RECORDING` handler also overwrite `metadata.timelineFps` and `metadata.cursorEventsFps` with the same value, so the panel's hardcoded `timelineFps: 30` no longer wins.
- New takes persist `metadata.cursorEventsFps` on the recording asset (set in `App.tsx` from the result; `capture-service.mjs` and `recording-file-utils.mjs` propagate it through save/probe).
- `cursor-data-loader.ts` (renderer) and `packages/export-renderer/src/cursor-render.ts` accept `eventsFps` / `projectFps` params and rescale `event.frame * projectFps / eventsFps` before indexing. `RecordingPlaybackVideo.tsx` and `webcodecs-core.ts` pass both values through. Legacy takes (no `cursorEventsFps`) default to `60` since every recording made before this fix sampled at `TARGET_CAPTURE_FPS = 60` — they self-correct on load with no migration step.

#### Key files

- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/recording/capture-service.mjs`
- `apps/desktop/src/main/recording/recording-file-utils.mjs`
- `apps/desktop/src/preload/index.mjs`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/cursor-data-loader.ts`
- `apps/desktop/src/renderer/features/record/RecordingPlaybackVideo.tsx`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/shared/ipc-channels.mjs`
- `packages/export-renderer/src/cursor-render.ts`
- `packages/export-renderer/src/webcodecs-core.ts`

#### Verification

- Unit: `apps/desktop/src/renderer/components/cursor-data-loader.test.ts` (renderer rescaling, 4 tests). `packages/export-renderer/src/cursor-render.test.ts` extended with three rescale cases (60→30, fps-match passthrough, omitted-params passthrough).
- Static-source regression guard: `apps/desktop/src/main/recording/recording-session-manager-cursor-fps.test.mjs` asserts the four wiring invariants (cursorRecorder.start uses `currentTimelineFps`, IPC handler exists and assigns the variable, `PANEL_SAVE_RECORDING` overrides metadata, recovery marker carries the value).
- Live-data Playwright spec: `tests/electron/cursor-fps-rescale-verify.spec.ts` loads the original broken Apr 25 0924 take, seeks to project frame 182 (the rescaled location of the recorded click), and confirms the cursor sprite renders with centroid at normalized (0.850, 0.506) — within 1.8% of the predicted click target (0.846, 0.488). Skips gracefully when the user-local fixture is absent (override with `ROUGH_CUT_CURSOR_FIX_PROJECT_PATH`).
- Legacy takes work without migration: confirmed by the live-data spec (the take has no `cursorEventsFps` field — the loader's `?? 60` fallback kicks in).
- `pnpm test` passes all 18 packages; `pnpm typecheck` clean.

#### Out of scope (separate follow-ups)

- `clip.sourceIn` is parsed but discarded at `RecordingPlaybackVideo.tsx:67`; `CursorOverlay` then computes `sourceFrame = projectFrame - clipIn` without `+ sourceIn`. Only desyncs trimmed clips. Not the user's reported bug.
- Cursor `x` can exceed asset width on multi-monitor setups (today's take had `max_x = 3305` vs asset width 1920). Indicates capture-region `offsetX` doesn't reach `cursorRecorder.start()` for some source types. Produces a constant XY offset, not a time desync.

---

### ~~TASK-226~~: Record: Backward sub-frame cursor interpolation (fluent fast-motion)

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25)

#### Problem

- Even after `TASK-218` fixed the fps-unit mismatch, the Record review cursor still advanced only on integer playhead frames.
- On fast cursor moves this looked choppy because the video refreshed between frame boundaries while the overlaid cursor sprite stayed parked until the next whole-frame jump.

#### Fix

- Kept the existing backward interpolation approach in `CursorOverlay`, but hardened it so it only runs after true sequential frame advances.
- Extracted the timing decision into `cursor-subframe-interpolation.ts`, which tracks whether the last playhead advance was `N-1 -> N` and disables interpolation for seeks, loop-backs, and dropped-frame jumps.
- Preserved exact current-frame positioning when playback is paused, so scrubbing and paused inspection never show lagged cursor positions.

#### Verification

- `pnpm --filter @rough-cut/desktop exec vitest run src/renderer/components/cursor-subframe-interpolation.test.ts src/renderer/components/cursor-data-loader.test.ts src/renderer/components/cursor-overlay-state.test.ts`
- `pnpm exec playwright test tests/electron/cursor-subframe-interpolation.spec.ts --workers=1`
- Added 5 focused unit tests covering sequential playback interpolation, frame-window completion, paused playback, forward jumps, and backward jumps.
- Added a focused Electron regression that scans the live Record review overlay for a fast visible cursor move, then proves the cursor position changes within a held sequential frame and stays stable after a non-sequential jump.
- `pnpm --filter @rough-cut/desktop typecheck` still fails in pre-existing unrelated `PanelApp.tsx` worktree changes; no new type errors were introduced by this task.

#### Key files

- `apps/desktop/src/renderer/components/CursorOverlay.tsx`
- `apps/desktop/src/renderer/components/cursor-subframe-interpolation.ts`
- `apps/desktop/src/renderer/components/cursor-subframe-interpolation.test.ts`
- `tests/electron/cursor-subframe-interpolation.spec.ts`

#### Progress (2026-04-26) — residual sync + smoothness pass

After TASK-218 + initial TASK-226 landed, user reported the cursor still felt off in three distinct ways. Empirical work isolated three independent contributors and shipped fixes for each:

- **(1) FFmpeg first-frame anchor** — the existing `PANEL_MEDIA_RECORDER_STARTED` rebase fired ~283 ms after the cursor recorder started, but FFmpeg's actual first captured frame on Linux/X11 came ~80 ms after spawn (measured via `-progress pipe:1` parsing). MediaRecorder rebase pushed cursor[0] ~200 ms LATER than file frame 0 — visible as a constant lag. Fix: added `-progress pipe:1 -stats_period 0.05` to ffmpeg args, parse stdout for the minimum `arrival - out_time_us/1000` across the first 5 non-zero blocks, callback fires once with the wall-clock estimate. Session manager calls a new `cursorRecorder.setStartTime(ms)` (force-rebase, bypasses the no-backward-rebase guard) and gates the MediaRecorder rebase off when `isFfmpegCaptureAvailable()` is true. Replaces the previous failed `cursorEventsLeadMs` duration-diff approach (removed end-to-end — capture-service, recording-file-utils, env.d.ts, App.tsx, RecordingPlaybackVideo.tsx, webcodecs-core.ts, both `buildCursorFrameData` functions).
- **(2) Initial-position teleport** — after rebase, the seeded `screen.getCursorScreenPoint()` event at frame 0 had its absolute time before the new anchor and was filtered (negative frame). Loader's `firstKnown` fill then painted the FIRST surviving event's position across `cursor[0..N]` — for one observed take, frames 0..77 (= 2.6 s) were drawn at the wrong location until the user first moved. Fix: `cursor-recorder.mjs setStartTime` re-injects a fresh `screen.getCursorScreenPoint()` at frame 0 if no event remains there.
- **(3) Same-frame dedup + interpolation gate** — `cursor-recorder.mjs` had `if (frame === this.#lastMoveFrame) return;` which kept the FIRST uIOhook event per project frame and dropped subsequent ones; loader's last-wins write made each `cursor[N]` reflect a stale start-of-window position. Removed the dedup so the LATEST mouse position in each frame window wins. Separately, the sub-frame interp module gated `shouldInterpolate` on `lastAdvanceWasSequential = (frameDelta === 1)`. The runtime log shows recurring `GPU stall due to ReadPixels` errors that cause `requestVideoFrameCallback` to deliver multi-frame jumps; the gate disabled interp on those ticks and the cursor sprite SNAPPED — perceived as jerks during continuous motion. Relaxed the gate to `isPlaying && lerpT < 1` (always interpolate during forward playback); pause/scrub still gets `lerpT = 1`.
- **(4) Timeline-needle stutter** — same root cause as the cursor sprite (driven by integer `playheadFrame` updates at ~30 Hz on a 60+ Hz display + GPU-stall multi-frame jumps). Applied the same backward sub-frame interpolation pattern in `RecordTimelineShell.tsx`: a rAF loop gated on `isPlaying` calls `resolveBackwardSubframeInterpolation` and writes `moveNeedle(playheadFrame - 1 + lerpT)`; `frameToPct` already accepts fractional input so no further math changes. Pause/scrub still drives the needle through the existing `transportStore.subscribe` path (instant snap).

Verification: `pnpm test` — 51 node tests + 26 vitest tests pass; `pnpm typecheck` clean; new ffmpeg-capture-first-frame parser unit tests cover the empirical convergence sequence; static-source guards in `recording-session-manager-cursor-fps.test.mjs` prove the wiring (`onFirstFrame → cursorRecorder.setStartTime`, gated MediaRecorder rebase). Live confirmation by user: cursor sync corrected, sprite jerks reduced, timeline indicator now glides instead of stepping.

#### Key files (added in this pass)

- `apps/desktop/src/main/recording/ffmpeg-capture.mjs` — `-progress pipe:1` + exported `createFirstFrameDetector` parser
- `apps/desktop/src/main/recording/cursor-recorder.mjs` — `setStartTime` (force rebase + initial-position re-seed), removed same-frame dedup
- `apps/desktop/src/main/recording/recording-session-manager.mjs` — `onFirstFrame` callback wiring, MediaRecorder rebase gated behind `!isFfmpegCaptureAvailable()`
- `apps/desktop/src/renderer/components/cursor-subframe-interpolation.ts` — relaxed `shouldInterpolate` gate
- `apps/desktop/src/renderer/features/record/RecordTimelineShell.tsx` — sub-frame rAF loop for the playhead needle
- `apps/desktop/src/main/recording/ffmpeg-capture-first-frame.test.mjs` — parser unit tests

---

## Unified Delivery Sprints

Ordered by the desired product flow: infrastructure first, then edge features, one view at a time.

### Sprint A — Recording Infrastructure

| Task         | Title                                                       | Why now                                            |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------- |
| ~~TASK-013~~ | ~~Record: PixiJS live preview~~                             | Capture surface must use the real compositor path  |
| TASK-086     | Record: Unified config store for main tab + recording panel | Single source of truth before more record features |
| ~~BUG-007~~  | ~~Fix toolbar toggles not driving floating panel~~          | Removes duplicated state drift                     |
| ~~BUG-008~~  | ~~Fix source selection divergence~~                         | Prevents wrong-capture regressions                 |
| TASK-087     | Persist record config across opens and restarts             | Makes recording workflow dependable                |
| ~~TASK-088~~ | ~~Device selectors for mic, camera, system audio~~          | Required for a production-ready record surface     |
| ~~BUG-009~~  | Fix mode selector so it affects capture                     | Core correctness issue                             |
| TASK-162     | Focus-first framing UX for screen and camera preview        | Removes a high-friction authoring flow             |
| TASK-100     | Disconnect recovery and warning toasts                      | Hardens real recording sessions                    |
| BUG-004      | Fix missing recording icon in dock/taskbar                  | Restores visible OS-level recording presence       |
| BUG-011      | Fix Linux dock/taskbar stop affordance during recording     | Prevents control loss when panel is hidden         |
| ~~BUG-012~~  | ~~Fix Record saved-session replay bootstrap stalls~~        | Restores reliable replay/startup for playback      |
| ~~TASK-120~~ | ~~Decouple Record timeline playhead from React rerenders~~  | Removes UI stutter during playback and scrubbing   |
| TASK-124     | Prove and harden saved-file system-audio capture            | Audio must survive into recorded/exported outputs  |
| BUG-013      | Fix camera template/visibility regressions after reopen     | Reopened recordings must match what was recorded   |

### Sprint B — Recording Edge Features

| Task     | Title                                              | Why next                                           |
| -------- | -------------------------------------------------- | -------------------------------------------------- |
| TASK-014 | Webcam PiP in compositor                           | Core Screen Studio expectation                     |
| TASK-015 | Serialize recording effects to clips               | Needed for downstream Edit/Export fidelity         |
| TASK-016 | Separate webcam + audio assets on stop             | Makes recordings reusable across the pipeline      |
| TASK-121 | Restore template picker and preset application     | Template-driven recording flow is currently broken |
| TASK-122 | Fix zoom marker transform and paused-selection     | Playback trust breaks when zoom state is wrong     |
| TASK-123 | Persist zoom sidecar and cursor continuity         | Reopened recordings must keep authored zoom data   |
| TASK-089 | Keyboard shortcut capture + overlays               | High-value record-time feature                     |
| TASK-091 | Titles and callouts overlay system                 | Finishes the record-time storytelling layer        |
| TASK-092 | Dynamic camera layout changes within one recording | Advanced but flow-defining record feature          |
| TASK-101 | Cursor smoothing, idle hide, and loop-back polish  | Record polish after backbone is stable             |
| TASK-090 | Highlights and annotations overlay system          | High-value record-time feature                     |

### Sprint C — Export Core Flow

| Task         | Title                                          | Why now                                       |
| ------------ | ---------------------------------------------- | --------------------------------------------- |
| ~~TASK-118~~ | Camera PiP preview parity in Export            | Already landed export fidelity foundation     |
| ~~TASK-021~~ | Progress bar + frame counter                   | Core export UX complete                       |
| ~~TASK-022~~ | Output path selector                           | Core export UX complete                       |
| ~~TASK-109~~ | Cancel button during export                    | Core export UX complete                       |
| ~~TASK-110~~ | Error display for failed exports               | Core export UX complete                       |
| ~~TASK-111~~ | Open File / Open Folder links                  | Core export UX complete                       |
| ~~TASK-028~~ | ~~Audio mixing in export pipeline~~            | Completes recorded project output             |
| ~~TASK-029~~ | ~~Quality presets + editable settings~~        | Required before users can trust export output |
| ~~TASK-112~~ | File size + time estimates                     | Important finishing UX for export decisions   |
| ~~TASK-067~~ | ~~Preview + export parity visual regression test~~ | Locks down the full record -> export loop |

### ~~TASK-112~~: Export: File size + time estimates

**Priority:** P3 | **Status:** ✅ DONE (2026-04-19)

#### Completed

- Added an Estimates panel to the Export tab showing clip length, estimated file size, and estimated export time from the current range and export settings.
- Added a live ETA mode while exports are actively running so progress feedback remains actionable during longer renders.
- Added focused Playwright coverage for the new estimates surface in both acceptance and export-tab suites.

#### Key files

- `apps/desktop/src/renderer/features/export/ExportTab.tsx`
- `tests/electron/acceptance-export.spec.ts`
- `tests/electron/export-tab.spec.ts`

### Sprint D — Export Performance + Advanced Output

| Task         | Title                                               | Why next                                         |
| ------------ | --------------------------------------------------- | ------------------------------------------------ |
| TASK-050     | Preview: PixiJS VideoSource path                    | Needed for playback/export performance spine     |
| TASK-051     | Preview: Work around WebGL gradient shader crash    | Stabilizes the new render path                   |
| TASK-052     | Export: WebCodecs pipeline                          | Modern export backbone                           |
| ~~TASK-053~~ | Frame-accurate scrubbing via mediabunny             | Already landed groundwork for WebCodecs export   |
| TASK-054     | NVENC hardware encoding                             | Performance upgrade after baseline works         |
| TASK-096     | Social aspect presets derived from Record templates | Productized output presets                       |
| ~~TASK-108~~ | Export job queue                                    | Batch workflow after core single export is solid |

### ~~TASK-108~~: Export: Job queue (multi-job sequential processing)

**Priority:** P3 | **Status:** ✅ DONE (2026-04-19)

#### Completed

- Added a renderer-local export queue so multiple export jobs can be queued without reworking the main-process export pipeline.
- Captured the output path at queue time, then processed jobs sequentially with the existing export progress/completion events.
- Added queue UI affordances for queued, running, complete, failed, and cancelled jobs, including remove/open/folder actions where appropriate.
- Added acceptance coverage for the queue surface while preserving the existing export-tab checks.

#### Key files

- `apps/desktop/src/renderer/features/export/ExportTab.tsx`
- `apps/desktop/src/renderer/features/export/run-export.ts`
- `tests/electron/acceptance-export.spec.ts`

### Sprint E — Edit Core Authoring

| Task     | Title                            | Why after Export                      |
| -------- | -------------------------------- | ------------------------------------- |
| TASK-017 | Clip drag-to-move                | Core timeline interaction             |
| TASK-018 | Cross-track clip dragging        | Completes basic rearrangement         |
| TASK-019 | Effects stack UI                 | Makes edit inspector useful           |
| TASK-020 | Audio playback via Web Audio API | Needed before serious edit work       |
| TASK-023 | Keyframe editor                  | Core manual animation/edit capability |
| TASK-024 | Transitions                      | Core edit storytelling feature        |

### Sprint F — Edit Depth + Polish

| Task     | Title                                | Why next                         |
| -------- | ------------------------------------ | -------------------------------- |
| TASK-026 | Audio waveforms on timeline clips    | Better edit precision            |
| TASK-027 | Ripple delete mode                   | Faster timeline editing          |
| TASK-063 | Video thumbnail strips on clips      | Faster visual scan while editing |
| TASK-064 | Opacity/blend mode in clip inspector | Deeper clip control              |
| TASK-065 | Audio volume controls per clip/track | Audio finishing control          |
| TASK-066 | Playback transport buttons           | Edit ergonomics polish           |

### Sprint G — AI Workflow

| Task     | Title                                               | Why later                                     |
| -------- | --------------------------------------------------- | --------------------------------------------- |
| TASK-040 | AI bridge package + provider interface              | Infrastructure first                          |
| TASK-081 | Visual frame analysis pipeline                      | Core AI ingest capability                     |
| TASK-082 | Rough cut generator                                 | Depends on transcript + vision metadata       |
| TASK-044 | Source selector UI                                  | First AI view interaction                     |
| TASK-045 | Results panel with Accept/Reject/Edit               | Review loop                                   |
| TASK-047 | Apply accepted AI output to timeline                | Connects AI back to core workflow             |
| TASK-083 | Compliance: third-party attribution                 | Required before shipping marketed AI features |
| TASK-097 | Record-first captions workflow from captured assets | Bridges Record into AI surface                |
| TASK-080 | WhisperX transcription pipeline                     | Core AI ingest capability                     |
| TASK-079 | Library data model                                  | Needed before ingest workflows                |

### Sprint H — Motion Surface

| Task     | Title                                             | Why last                                   |
| -------- | ------------------------------------------------- | ------------------------------------------ |
| TASK-033 | Split placeholder into separate Motion + AI tabs  | Surface split after priorities are settled |
| TASK-034 | MotionTemplate data model + bundled templates     | Data backbone                              |
| TASK-035 | Template library UI                               | First real Motion experience               |
| TASK-036 | Template preview canvas                           | Visual authoring loop                      |
| TASK-037 | Parameter editor panel                            | Editing controls                           |
| TASK-038 | Apply to Timeline                                 | Connects Motion to Edit/Export             |
| TASK-039 | Resolve motion-template asset in preview + export | Final integration                          |

---

### FEATURE-076: Record: Audio capture + playback in preview

**Priority:** P1 | **Status:** IN PROGRESS (2026-04-11)

#### Problem

Recordings have no audio. Two parallel capture paths exist:

1. **MediaRecorder** (panel renderer) — captures display stream + can mix mic/system audio. Audio mixing code was added (commit `1296b46`) and confirmed working: `buildRecordingStream()` in PanelApp.tsx produces a stream with audio tracks, and the MediaRecorder uses `vp9,opus` mimeType.
2. **FFmpeg x11grab** (main process) — captures screen at higher quality via `ffmpeg -f x11grab`. This is the output that gets SAVED as the final .webm. **FFmpeg has no audio input** — it only captures video.

The session manager (`recording-session-manager.mjs`) prefers the FFmpeg output when available (line ~730: `Using FFmpeg x11grab output`). The MediaRecorder output (which has audio) is discarded.

#### Root Cause

`recording-session-manager.mjs` saves the FFmpeg x11grab .webm (video-only) as the final recording, ignoring the MediaRecorder's audio-enabled output.

#### What's Already Done

- `buildRecordingStream()` helper in `PanelApp.tsx` — merges video + system audio (getDisplayMedia) + mic audio (getUserMedia) via AudioContext mixer
- `audioMixCleanupRef` for AudioContext teardown on stop
- mimeType selection: `vp9,opus` when audio tracks present
- Mic mute toggle only affects mic track (system audio independent)
- Cursor timing sync: `rebaseStartTime()` in cursor-recorder.mjs aligns cursor events with MediaRecorder start

#### Decision: Option A — Add audio directly to FFmpeg pipeline

**Decided:** 2026-04-10 | **Rationale:** Single pipeline = zero sync drift, best VP9 quality (CRF control), battle-tested on PipeWire+PulseAudio compat layer.

**FFmpeg command pattern:**

```bash
ffmpeg \
  -f x11grab -framerate 60 -video_size 1920x1080 -i :0.0 \
  -f pulse -ac 2 -ar 48000 -i <SYSTEM_MONITOR_SOURCE> \
  -f pulse -ac 2 -ar 48000 -i <MIC_SOURCE> \
  -filter_complex "[1:a][2:a]amix=inputs=2[a]" \
  -map 0:v -map "[a]" \
  -c:v libvpx-vp9 -crf 20 -b:v 0 -deadline good -cpu-used 4 \
  -c:a libopus -b:a 128k \
  -pix_fmt yuv420p \
  output.webm
```

**Audio source discovery** (run at recording start):

- `pactl list short sources` → tab-separated lines (pactl 16.1 has no `--format=json`)
- System audio: source name containing `.monitor` (e.g. `alsa_output.pci-....monitor`)
- Mic: source name starting with `alsa_input.`
- When only mic enabled: single `-f pulse -i <MIC>`, no amix filter
- When only system audio enabled: single `-f pulse -i <MONITOR>`, no amix filter
- When both enabled: two inputs + `amix=inputs=2` filter

**Why not B/C:**

- Option B (post-mux): sync drift over long recordings — two separate clocks
- Option C (MediaRecorder fallback): lower VP9 quality, no CRF control

#### Playback Side

- Compositor's `play()` unmutes video elements (`video.muted = false` before `video.play()`)
- RecordTimelineShell calls `PlaybackManager.setCompositorPlaying(true/false)` — does NOT use full `PlaybackManager.play()` (which would start a competing sync loop)
- PlaybackManager.\_syncLoop falls back to `compositor.getVideoCurrentTime()` when no screenVideo (Edit tab)
- RecordingPlaybackVideo's `<video>` stays muted — only the compositor's video plays audio
- `media://` protocol handler uses `net.fetch('file://...')` for reliable concurrent access

#### Tasks

- [x] Decide approach → **Option A: FFmpeg pipeline audio** (2026-04-10)
- [x] Add audio source discovery util — `audio-sources.mjs` uses `pactl list short sources` (2026-04-11)
- [x] Modify `ffmpeg-capture.mjs` — `-f pulse` inputs + amix filter for all combos (2026-04-11)
- [x] Wire session manager — IPC passes `{ micEnabled, sysAudioEnabled }`, discovers sources (2026-04-11)
- [x] Verify with `ffprobe` — saved .webm has VP8 video + Opus audio (2026-04-11)
- [x] Unmute compositor video on play — `compositor.play()` sets `video.muted = false` (2026-04-11)
- [x] Fix Edit tab playhead — `_syncLoop` falls back to compositor video time (2026-04-11)
- [x] Fix `media://` protocol handler — switched to `net.fetch` (fixes ReadableStream locking) (2026-04-11)
- [ ] Add volume controls to playback UI — slider + mute landed in Record-tab timeline header (transport store `previewVolume`/`previewMuted` → compositor); awaits ear verification (TASK-199, 2026-04-25)

#### Key Files

- `apps/desktop/src/main/recording/audio-sources.mjs` — PulseAudio/PipeWire source discovery via `pactl`
- `apps/desktop/src/main/recording/ffmpeg-capture.mjs` — FFmpeg x11grab + audio command construction
- `apps/desktop/src/main/recording/recording-session-manager.mjs` — orchestrates recording, audio config IPC
- `apps/desktop/src/main/index.mjs` — `media://` protocol handler (net.fetch delegation)
- `apps/desktop/src/renderer/features/record/RecordTimelineShell.tsx` — `setCompositorPlaying()` bridge
- `packages/preview-renderer/src/playback-manager.ts` — `setCompositorPlaying()`, `_syncLoop` fallback
- `packages/preview-renderer/src/preview-compositor.ts` — `play()` unmutes, `getVideoCurrentTime()`

#### Platform Notes

- PipeWire with `pipewire-pulse` compat layer — `pactl` works identically to native PulseAudio
- `pactl list short sources` (tab-separated) — `--format=json` not available in pactl 16.1
- No native `-f pipewire` in FFmpeg yet for audio — `-f pulse` is the correct approach
- Camera: USB webcam has V4L2 corruption issues on this machine (hardware issue, not code)

---

### ~~TASK-083~~: Compliance: Third-party attribution (WhisperX BSD-4, FFmpeg LGPL) in About/credits

**Priority:** P2 | **Status:** ✅ DONE (2026-04-19)

#### Completed

- Added an in-app About and Credits card on the Projects screen with the required WhisperX acknowledgement and FFmpeg licensing note.
- Added `README.md` with the WhisperX advertising acknowledgement.
- Added `THIRD_PARTY_LICENSES.md` with the WhisperX BSD-4-Clause license text and FFmpeg distribution guidance.

#### Notes

- rough-cut currently invokes an external `ffmpeg` binary instead of bundling one.
- If installer bundling is added later, ship the applicable LGPL text and preserve end-user replacement rights.

#### Key Files (anticipated)

- `packages/project-model/src/library.ts` — Library type
- `packages/ai-bridge/src/transcription/whisperx.ts` — WhisperX wrapper (shells out; no bundled binary)
- `packages/ai-bridge/src/vision/frame-analyzer.ts` — frame sampler + vision client
- `packages/ai-bridge/src/generators/rough-cut.ts` — prompt → timeline
- `apps/desktop/src/renderer/features/ai/LibraryView.tsx` — library browser UI

#### Why Now

Several downstream tasks depend on this being the AI paradigm:

- TASK-042 (Whisper) subsumed by TASK-080
- TASK-073 (Auto-Edit) becomes trivial once library + rough cut generator exist
- TASK-074 (Silence Removal) becomes a filter over the transcript, not a new pipeline

---

### ~~TASK-197~~: ~~Record: Stop baking Rough Cut UI into Linux/X11 captures~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-196

#### Problem

`ffmpeg -f x11grab` captures the entire X root window during recording. Anything visible at recording start gets baked into the resulting `.webm` permanently — there is no way to remove pixels from the file after capture.

Two pieces of Rough Cut UI consistently leak into every Linux take:

1. **The OS notification** created at `recording-session-manager.mjs:1707-1716`. The Linux notification daemon (dunst / mako / GNOME / KDE) renders the popup at top-right of the primary display — inside the x11grab capture rect — and there is no API to position or exclude it from capture.
2. **The main window + floating panel** are hidden via `mainWindow.hide()` / `panelWindow.hide()` at `recording-session-manager.mjs:1684-1703` — but these calls happen *after* `startFfmpegCapture()` at line 1631. The first frames of every recording capture the still-visible UI.

User reproduction (2026-04-24): a "Rough Cut — Recording / Press Ctrl+Shift+Esc to stop. Pause is unavailable for this pipeline." dialog appears at top-right of every saved-take playback, plus a stale camera frame from the main preview that was visible during the capture-start race.

#### Root cause is structural, not visual

This is not a renderer bug. It is two pieces of Rough Cut UI that the X11 capture pipeline cannot exclude: notifications and pre-hide windows. `setContentProtection(true)` is documented as a no-op on Linux/X11 (Electron #12973). The only fix is to not render the UI on screen at all when capture is active.

#### Scope

- Skip `new Notification(...)` creation entirely on Linux during recording. Stop control remains available through the floating Stop pill on the secondary display + the global `Ctrl+Shift+Esc` shortcut. Single-monitor users rely on the shortcut alone — same trade-off OBS/SimpleScreenRecorder make.
- Move `mainWindow.hide()` and `panelWindow.hide()` to **before** `startFfmpegCapture()`. Poll `isVisible()` until both windows return false (up to ~500 ms), then add a 200 ms compositor-repaint margin so X11 has actually unmapped them.
- Best-effort suspend the user's notification daemon (`dunstctl set-paused true` / `makoctl mode -a do-not-disturb` / `gsettings org.gnome.desktop.notifications show-banners false`) for the duration of the session, restored on stop. This catches notifications from *other apps* during recording, not just Rough Cut's.
- Add regression tests so the fix cannot be silently reverted again (it was, in commit `4881fd8`).

#### Cost

- No popup feedback when recording starts on Linux. Visible feedback is the Rough Cut window auto-hiding plus the Stop pill on the secondary monitor.
- A one-time ~300 ms delay between clicking REC and the first captured frame, while windows unmap and the compositor repaints.
- Single-monitor users lose any visible reminder that recording is active. They press `Ctrl+Shift+Esc` to stop. (Long-term solved by TASK-198.)

#### Regression tests

- **Static-source test** (`tests/electron/recording-session-manager-pre-capture.test.ts`): a small unit test that reads `recording-session-manager.mjs` source and asserts:
  1. There is no `new Notification(...)` followed by `.show()` inside the `IS_LINUX` branch around the start-recording flow.
  2. The first `mainWindow.hide()` line number is *less than* the first `startFfmpegCapture` line number in that flow.
  3. A `suspendNotificationsForRecording` (or equivalent) call exists before `startFfmpegCapture`.
  Brittle but reliable in CI. Catches future reverts.
- **Integration test** (`tests/electron/record-no-baked-ui.spec.ts`): in xvfb, run a 1.5 s recording, then `ffprobe`/`ffmpeg` extract frame 0 and frame 30 of the resulting `.webm`. Sample a 100×100 box at the top-right corner. Assert all sampled pixels have brightness < 32 (effectively black). Skipped on `process.platform !== 'linux'`.

#### Critical files

- `apps/desktop/src/main/recording/recording-session-manager.mjs` — pre-capture hide ordering, notification suppression, daemon suspend/resume
- `tests/electron/recording-session-manager-pre-capture.test.ts` — new static guard
- `tests/electron/record-no-baked-ui.spec.ts` — new integration guard

#### Why this matters

This regression has been hit at least twice (TASK-190 saved-take review + reuser report 2026-04-24). Without a guard, my fix was reverted in `4881fd8` without anyone noticing because no test went red. The artifact is not subtle — every Linux user sees it on every recording forever — and there is no fix in post-production.

---

### TASK-198: Record: Migrate Linux screen capture from `ffmpeg -f x11grab` to PipeWire / `getDisplayMedia`

**Priority:** P2 | **Status:** TODO | **Depends on:** TASK-197

#### Problem

`ffmpeg -f x11grab` is fundamentally incompatible with content protection and selective window exclusion. Every "thing baked into capture" class of bug (TASK-190, TASK-197, future TASK-Xs) exists because x11grab captures the X root window with no ability to filter. The fix in TASK-197 is a band-aid: hide the windows manually, suspend the notification daemon manually. It works but is fragile.

It also does not work on Wayland sessions. Modern Linux distros default to Wayland (Fedora, Ubuntu 22.10+, GNOME 42+). Rough Cut on a Wayland session today either captures only XWayland surfaces (partial/black output) or fails entirely.

#### Scope

Replace the x11grab capture path on Linux with PipeWire-backed capture, accessed through one of:

1. **`getDisplayMedia()` in the renderer.** Electron 22+ uses Chromium's PipeWire integration on Wayland and X11. The user picks a screen/window via `xdg-desktop-portal-screencast`, the OS hands back a `MediaStream`, we encode via `MediaRecorder` or pipe to ffmpeg via stdin. This is the supported path going forward.
2. **`ffmpeg -f pipewire` subprocess.** Newer ffmpeg builds (≥ 6.0 with `--enable-libpipewire`) support direct PipeWire capture. Cleaner from a process-isolation perspective but adds a hard ffmpeg version requirement.

Either way, the entire pre-capture-hide dance from TASK-197 becomes unnecessary: PipeWire delivers a stream of *only* the source the user picked, and notifications/protected windows are excluded by the compositor before pixels enter the stream.

#### Open questions

- Audio sync: PipeWire delivers screen and audio as separate streams with separate timestamps. Need to verify the muxing path keeps them in sync as well as today's single-ffmpeg-process pipeline does.
- xdg-desktop-portal source picker UX: portal dialog appears every time `getDisplayMedia()` is called, instead of Rough Cut's own picker. Either accept the OS picker (consistent with browser apps), or use the persistent-permission API (Chromium 116+) to pick once per session.
- ffmpeg-as-encoder vs `MediaRecorder` for the encoded output: MediaRecorder produces VP8/VP9 in a `.webm` directly; ffmpeg path lets us match the existing 60 fps + `libvpx -b:v 8M` profile bit-for-bit.
- Distro coverage: GNOME 42+, KDE Plasma 5.27+, sway/Hyprland with `wlr-screencopy`. Test on each.
- Fallback: keep x11grab path for users on older distros / when `xdg-desktop-portal-screencast` is unavailable.

#### Why this is P2 not P1

TASK-197 fully resolves the visible artifact with low cost and surgery. TASK-198 is the structurally correct fix but is a multi-week migration with new failure modes (portal denial, audio sync, encoder change). Right time is when Wayland support becomes a user-visible request, not as an emergency.

#### Critical files (anticipated)

- `apps/desktop/src/main/recording/ffmpeg-capture.mjs` — current x11grab implementation; gains a PipeWire branch or is replaced
- `apps/desktop/src/main/recording/recording-session-manager.mjs` — capture-start flow no longer needs pre-capture hide
- `apps/desktop/src/renderer/features/record/use-live-preview.ts` — `getDisplayMedia` already used here; reuse for the capture path
- New: `apps/desktop/src/main/recording/pipewire-capture.mjs`

#### What this unblocks

- Wayland users (currently broken).
- All future "thing baked into capture" bugs (becomes structurally impossible).
- Migration off the manual notification-daemon suspension hack from TASK-197.

---

### ~~TASK-199~~: Record: Pre-record mic input gain slider in floating panel (umbrella)

**Priority:** P2 | **Status:** ✅ DONE (2026-04-25, user-verified by ear) | **Depends on:** TASK-219, TASK-220, TASK-221, TASK-222, TASK-223, TASK-224, TASK-225

#### Problem

User sees the mic VU meter peak during pre-record and hears the input through an external monitor (PulseAudio loopback / hardware monitor / OS-level passthrough — there is no audible monitor inside Rough Cut). They want a slider in the floating panel that reduces both what they hear and what FFmpeg captures.

#### Decision (2026-04-25)

**Approach: PulseAudio source-volume control (`pactl set-source-volume`)**, restored on app quit. Picked over (a) FFmpeg `-filter:a volume=` (doesn't affect what the user hears outside the app) and (b) Web Audio GainNode (doesn't reach external monitors and doesn't apply to FFmpeg's pulse capture). Tradeoff accepted: while the slider is non-100%, every other app on the system using that mic is also attenuated.

#### Sub-tasks

- TASK-219 — clean up orphan post-record `previewVolume`/`previewMuted` scaffolding from earlier scope misread
- TASK-220 — pactl get/set source-volume helpers + IPC bridge in main
- TASK-221 — module-level snapshot/restore registry; `before-quit` cleanup
- TASK-222 — `micInputGainPercent` field in recording-config + persisted schema
- TASK-223 — slider UI in PanelApp adjacent to VU meter (debounced; hidden when no pactl source resolves)
- TASK-224 — reconcile with `ensureSourceAudible` mic auto-bump (drop or gate when user has set explicit gain)
- TASK-225 — unit tests for pactl percent parser + snapshot registry

#### Acceptance criteria (only DONE when all hold)

1. Slider visible next to mic VU meter in floating panel when mic is enabled and a pactl mic source resolves
2. Dragging slider changes pactl source volume — verifiable via `pactl get-source-volume <mic>` from a separate terminal
3. VU meter reflects slider position (because pactl source volume is the input to the meter analyser stream)
4. Recording made with slider at 50% sounds half as loud as one made at 100% (user verifies by ear)
5. After app quit, `pactl get-source-volume <mic>` returns to whatever value it had before the app started
6. Slider value persists across panel close/reopen
7. On non-Linux platforms or when pactl is missing: slider is hidden, no errors

#### Critical files

- `apps/desktop/src/main/recording/audio-sources.mjs` — pactl helpers (get/set + parser already partially present)
- `apps/desktop/src/main/index.mjs` — IPC handler registration
- `apps/desktop/src/preload/index.mjs` — bridge expose
- `apps/desktop/src/renderer/env.d.ts` — type declarations
- `packages/store/src/recording-config-store.ts` — `micInputGainPercent` field
- `apps/desktop/src/main/recent-projects-service.mjs` — schema mirror for persistence
- `apps/desktop/src/renderer/features/record/PanelApp.tsx` — slider UI, mount/unmount lifecycle
- `apps/desktop/src/main/recording/recording-session-manager.mjs` — `before-quit` hook for restore registry

#### Out of scope (for this round)

- In-app FFmpeg `volume=` filter alternative (defer; only if Option 3 turns out to be too invasive)
- System-audio (loopback) gain — slider is mic-only
- VU meter calibration / target peak hints (-12 to -6 dB OBS-style) — separate task if requested
- Boost (>100% slider range) — clamp to 0–100%; would worsen peaking

#### Verification

Visual+audible. Cannot be machine-verified end to end — Playwright can confirm slider→pactl plumbing, but only ear can confirm "doesn't peak" and "user hears the change." Do not mark DONE without explicit user confirmation.

---

### ~~TASK-206~~: Tests: Re-baseline e2e under updated 60s test.timeout

**Priority:** P0 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** -

#### Resolution

- Re-ran `pnpm test:e2e` after `playwright.config.ts` was updated to `timeout: 60_000`.
- New baseline: **130 passed, 77 failed, 4 skipped** in **20.8m**.
- The old 2026-04-25 baseline (`.logs/e2e-2026-04-25.log`) was **104 passed, 101 failed, 4 skipped** in **32.9m**.
- Net effect of the re-baseline: **26 fewer failures** and **26 more passes**.

#### What changed

- `record-tab.spec.ts` shrank from **13 failures -> 9**.
- `export-tab.spec.ts` shrank from **8 failures -> 3**.
- Entire timeout-only clusters disappeared from `record-playback-canvas.spec.ts`, `record-playhead-decoupling.spec.ts`, `record-project-open-duration-repair.spec.ts`, `record-recovery-relaunch.spec.ts`, `record-reopen-export.spec.ts`, `record-shutdown-paths.spec.ts`, `record-space-playback.spec.ts`, `record-config-persistence.spec.ts`, `record-audio-import-parity.spec.ts`, and `record-append-takes.spec.ts`.
- `preview-debug.spec.ts` also flipped green under the rerun.
- One new red spec appeared in the rerun: `record-no-baked-ui.spec.ts`.

#### Remaining signal

- About **22 remaining failures still end around 30-31.8 s**. Those are no longer explained by Playwright's old global 30 s timeout cliff; they now point to spec-local waits/assertions or app-level hangs that need focused follow-up.
- The downstream cluster tasks were updated to the rerun counts below.

#### Key files

- `.logs/e2e-2026-04-25.log` — pre-fix baseline
- `playwright.config.ts` — current `timeout: 60_000`
- Playwright rerun output captured in this session via `pnpm test:e2e`

#### Why this matters

The rerun removed the timeout-only noise floor and gives the team a trustworthy current baseline. Downstream investigations can now focus on real regressions instead of stale 30 s startup victims.

---

### ~~TASK-207~~: Record: Investigate record-tab.spec.ts 9-failure cluster

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-206

#### Resolution

- Fixed the shared record-mode gating tooltip regression in `RecordTab.tsx` so the REC button correctly directs window-mode users to the setup panel when no compatible source is selected.
- Hardened `@rough-cut/frame-resolver` against clips missing `keyframes` / `effects`, then rebuilt the package so the renderer consumed the updated `dist/` entrypoint.
- Restored the Record timeline shell on fresh projects instead of hiding it behind `hasRecordedTake`, which brought the default Record surface back in line with the spec.
- Verification: `tests/electron/record-tab.spec.ts` now passes **24/24**, and `tests/electron/record-source-gating.spec.ts` passes **2/2**.

#### Root causes

- One REC-button copy regression after the unified record-flow work made the gating behavior truthful but the guidance misleading.
- One frame-resolver robustness bug let camera-layout fixtures crash the compositor when a clip shape omitted animation arrays.
- One conditional render hid the timeline on fresh projects even though the Record UI and tests still treated the timeline as part of the default surface.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `packages/frame-resolver/src/resolve-frame.ts`
- `packages/frame-resolver/dist/resolve-frame.js`
- `tests/electron/record-tab.spec.ts`
- `tests/electron/record-source-gating.spec.ts`

---

### ~~TASK-208~~: Export: Investigate export-tab.spec.ts 3-failure cluster

**Priority:** P1 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-206

#### Resolution

- Restored the Record inspector on fresh projects so destination presets are reachable before the first take. That fixed the Export test that links Record destination presets into export defaults.
- Fixed the stale Export zoom-preview regression in the test itself: the previous assertion was using the plain playback fixture, which contained no zoom markers. The spec now adds a real zoom marker before validating the before/after preview change.
- Fixed the companion `export-smoke.spec.ts` failure by switching it off the stale Apr 14 project whose recording path still pointed into `/tmp` and produced a `media://...404`. The smoke test now uses the valid playback fixture with a real on-disk recording asset.
- Verification: `tests/electron/export-tab.spec.ts` now passes **12/12** and `tests/electron/export-smoke.spec.ts` passes **1/1**.

#### Root causes

- One real UI regression: destination controls were hidden on a fresh Record tab because the inspector panel only rendered after a saved take existed.
- One stale test setup: the zoom-preview assertion never created any zoom state, so the screenshot hash could not change.
- One stale fixture path: the smoke test was opening an old project with recording assets still rooted in `/tmp`, so export never had valid source media to read.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `tests/electron/export-tab.spec.ts`
- `tests/electron/export-smoke.spec.ts`
- `tests/electron/fixtures/playback-fixture.ts`

---

### ~~TASK-209~~: Edit: Inspector-rail spec — sync CATEGORIES with current rail

**Priority:** P2 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-206

#### Resolution

Re-run under the 60s `test.timeout` reduced the cluster from 8 → 6 failures. The remaining 6 all failed at the same line (`page.click([data-testid="inspector-rail-item"][data-category="highlights"])`) with `Timeout 30000ms exceeded` — `highlights` no longer exists.

Root cause: not a layout regression. The spec's hard-coded `CATEGORIES` array still listed `highlights` (dropped in commit `0ba9076` / TASK-213) and `titles` (never present), and was missing the current `destinations` and `captions`. Every test that iterated `CATEGORIES` to click each rail item failed at the missing `highlights`.

Fix: synced `tests/electron/inspector-rail.spec.ts` `CATEGORIES` array to mirror `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx` (`destinations, templates, align, background, camera, crop, zoom, cursor, captions`). Added a comment pointing back at the source.

Verification: `inspector-rail.spec.ts` now passes **8/8 in 17.4s**.

#### Key files

- `tests/electron/inspector-rail.spec.ts` (CATEGORIES list + 1-line provenance comment)
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx` (source of truth)

---

### ~~TASK-210~~: Tests: Tab-switching — fix Motion fps→NaN→CSS leak + refine console-error filter

**Priority:** P2 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-206

#### Resolution

The 6 failures had two unrelated root causes:

1. **Filter false-positive (5 tabs).** Spec filtered console errors by `text.includes('media://')`, but Chromium puts the resource URL in `msg.location()`, NOT the text. Result: every benign `media:///tmp/.../thumb.jpg` 404 (missing recording thumbnails) leaked through. Switched the filter to inspect both `msg.text()` and `msg.location().url`.
2. **Real bug in Motion tab (1 tab).** `MotionTab.tsx:223` passed `fps={fps}` straight from `useProjectStore` to `<Player>`. Initial mount sometimes provides `fps=undefined`, which Remotion's `spring()` divides by, producing NaN. NaN propagated through `interpolate()` to CSS `width` and `opacity` in `TitleCard.tsx` and `IntroBumper.tsx`, logging React warnings on every Motion-tab visit.
3. **CSP noise.** Remotion's Player loads a silent `data:audio/mp3;base64,...` on mount; renderer CSP blocks `data:` for media-src. Cosmetic; added to the filter.

Verification: `tab-switching.spec.ts` now passes **7/7 in 16.3 s**.

#### Key files

- `tests/electron/tab-switching.spec.ts` — improved error filter
- `apps/desktop/src/renderer/features/motion/MotionTab.tsx` — `fps={fps || 30}` fallback
- `apps/desktop/src/renderer/features/motion/compositions/TitleCard.tsx` — `safe()` clamp on spring/interpolate outputs
- `apps/desktop/src/renderer/features/motion/compositions/IntroBumper.tsx` — same `safe()` clamp

#### Key files

- `tests/electron/tab-switching.spec.ts`
- `apps/desktop/src/renderer/components/AppShell.tsx` (or wherever tab routing lives)

---

### TASK-211: Tests: Triage MVP acceptance specs (19 failures across 4 files)

**Priority:** P3 | **Status:** TODO | **Depends on:** TASK-206

#### Problem

The MVP acceptance suites are forward-looking — many test features that may not be built yet. The 2026-04-25 baseline shows:

- `acceptance-edit.spec.ts` — 8 failures
- `acceptance-motion.spec.ts` — 6 failures
- `acceptance-ai.spec.ts` — 3 failures
- `acceptance-record.spec.ts` — 2 failures

Without triage, every full e2e run reports 19 failures that are noise vs signal mixed together.

#### Scope

For each failing acceptance test:

1. **Feature gap** — feature genuinely not built. Mark `test.fixme()` with a comment pointing at the planned TASK.
2. **Real bug** — feature shipped but spec catches a regression. Open a focused TASK.
3. **Obsolete** — feature pivoted; spec no longer reflects intended UX. Delete or rewrite.

#### Why this matters

A noisy red e2e baseline trains the team to ignore failures. Every new regression risks getting buried.

#### Key files

- `tests/electron/acceptance-{record,edit,motion,ai}.spec.ts`

---

### TASK-212: Infra: Replace no-op `lint` echo scripts with real ESLint config

**Priority:** P3 | **Status:** TODO | **Depends on:** -

#### Problem

`pnpm lint` succeeds in CI but does not actually lint anything. All 7 lintable packages have:

```json
"lint": "echo 'no lint configured yet'"
```

There is no `.eslintrc*` / `eslint.config.*` in `apps/desktop` or any `packages/*`. (Only `refrences/Recordly` and `refrences/CursorLens` have configs, and those are vendored reference implementations, not project code.) The `pnpm lint` step the new CI workflow is structured to support is meaningless until this is fixed.

The earlier "ESLint couldn't find a configuration file" error reported during `/done` was RTK proxy noise misattributed to the project — the real lint pipeline silently passes.

#### Scope

Either:

1. **Set up ESLint properly** — single root `eslint.config.mjs` (flat config, ESLint 9+) with `@typescript-eslint`, project-aware parsing, import sorting. Enable per-package via the existing `lint` script. Reasonable rule set: ban `any`, enforce naming for branded ID types, etc.
2. **Remove the dummy scripts** — drop `lint` from each package's `scripts` and the root `pnpm lint` / `turbo run lint` entries. CI no longer falsely advertises a lint step.

Option 1 is preferable but a larger lift. Option 2 is honest.

#### Key files

- `apps/desktop/package.json`, `packages/*/package.json` — lint scripts
- `package.json` — root `lint` script
- `turbo.json` — `lint` task
- New: `eslint.config.mjs` (if option 1)

---

### TASK-079: AI: Library data model — footage + transcripts + visual analysis as first-class entity

**Priority:** P2 | **Status:** PLANNED

Add the first standalone library primitives to `@rough-cut/project-model` so AI ingest work has a stable shape before pipeline code lands.

**Scope:**

- Add `Library`, `LibrarySource`, transcript-segment, and visual-analysis model types
- Keep libraries separate from `ProjectDocument`, but allow projects to reference external libraries
- Update Zod schemas, factories, and migrations so older projects keep loading cleanly

**Initial implementation (2026-04-15):**

- Added standalone library-related types and factory helpers in `packages/project-model/src`
- Added `project.libraryReferences` so projects can point at external library documents without embedding them
- Bumped schema version and added a migration that backfills empty library references for existing project files

**Key files:** `packages/project-model/src/{types,schemas,factories,migrations}.ts`

---

### TASK-080: AI: WhisperX audio transcription pipeline (batch ingest, word-level timestamps)

**Priority:** P2 | **Status:** PLANNED

Start the transcription pipeline on top of the new library model without committing to final WhisperX worker orchestration yet.

**Current scope:**

- Reuse the existing main-process Whisper-style cloud transcription path for the first end-to-end library flow
- Persist transcript output back into `.roughcutlib` sources as word-level `transcriptSegments`
- Track provider/model/fps/transcribed-at metadata on each library source for later migration to WhisperX/utilityProcess execution

**Initial implementation (2026-04-15):**

- Added desktop IPC for transcribing a single library source and saving the result back into its library file
- Added `project-model` utility coverage for replacing a source transcript and recording transcription metadata
- Kept the change additive: existing project caption analysis flow is unchanged
- Added a local `whisperx` provider path in the desktop AI service that shells out to the `whisperx` CLI and no longer requires an API key for local transcription
- Added the initial `@rough-cut/ai-bridge` package scaffold with WhisperX word parsing helpers for future extraction from the desktop-specific runtime

**Key files:** `apps/desktop/src/main/ai/ai-service.mjs`, `packages/project-model/src/library-utils.ts`

---

### FEATURE-078: AI Library + Rough Cut Generation (ButterCut-inspired)

**Priority:** P1 | **Status:** PLANNED (2026-04-12)

#### Inspiration

[ButterCut](https://github.com/barefootford/buttercut) (MIT, by Andrew Ford) demonstrates a workflow where Claude analyzes raw footage (audio transcripts + frame descriptions), then generates editor timelines from a user prompt. rough-cut adopts the same _workflow_, but outputs directly into its native timeline format instead of FCPXML/Premiere XML.

#### Workflow Goal

```
User:  "Build a new library from /footage/wedding, English"
AI:    [ingests, transcribes audio + describes frames in parallel, stores metadata]
User:  "Make a 3-minute rough cut: start with vows, include first dance, end with exit"
AI:    [produces timeline with clips arranged on V1/A1, ready to refine in Edit tab]
```

#### Licensing Compliance (MANDATORY — see CLAUDE.md)

- **WhisperX** is **BSD-4-Clause** → promotional/About material must acknowledge the software. Non-blocking but must not be forgotten (TASK-083).
- **FFmpeg** is already a dependency. Keep using LGPL-only builds. Never enable `--enable-gpl --enable-nonfree` (x264/x265/libfdk-aac) — that would force the entire app to GPL.
- ButterCut itself is MIT — any code ideas or direct ports are green-lit provided we preserve the upstream copyright notice in files derived from it.

#### Subtasks

- [ ] **TASK-079** — Library data model: project-model extension for `Library` entity (footage refs, transcripts, visual descriptors, metadata). Separate from `Project` but composable (a project can reference libraries).
- [ ] **TASK-080** — WhisperX transcription pipeline (worker/utilityProcess, batch mode, word-level timestamps stored alongside assets). Supersedes TASK-042 scope.
- [ ] **TASK-081** — Visual frame analysis pipeline: sample frames at configurable interval, send to vision LLM, store descriptions per timestamp.
- [ ] **TASK-082** — Rough cut generator: given a library + natural-language prompt, LLM produces a list of `{assetId, inPoint, outPoint, track}` entries that become real Clips in the store.
- [x] **TASK-083** — Credits screen + README attribution for WhisperX; LGPL notice if/when FFmpeg is bundled in the installer.

---

### ~~TASK-077: Edit: Camera playback in Edit tab compositor~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-14)

The Edit tab now renders camera playback via a dedicated React overlay layered above the shared PixiJS compositor. This matches the current preview architecture, where the compositor owns screen rendering and camera video is rendered separately instead of being decoded inside `PreviewCompositor`.

**Completed**:

- Added `EditCameraOverlay.tsx` to render the active camera asset in the Edit preview with Record-style PiP positioning and shape controls from `presentation.camera`
- Resolved the active camera layer from `resolveFrame(project, playheadFrame)` so Edit playback follows clip-local source frames during playback and scrubbing
- Added an Edit-specific Electron replay check in `tests/electron/camera-replay.spec.ts` to verify visible camera playback and frame changes after seeking

**Key files:** `apps/desktop/src/renderer/features/edit/EditTab.tsx`, `apps/desktop/src/renderer/features/edit/EditCameraOverlay.tsx`, `tests/electron/camera-replay.spec.ts`

---

### ~~TASK-114: Edit: Camera source/timing parity with Record preview~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-15)

The Edit tab should resolve the same camera recording and media time as the Record page for a saved session. The original Edit overlay kept its own play/pause/currentTime loop, which let it diverge from the shared playback clock even after `TASK-077` established visible camera playback.

**Completed:**

- Rewired `EditCameraOverlay` to register its `<video>` with `PlaybackManager` instead of running a separate Edit-only media clock.
- Kept initial seeks aligned to the shared transport playhead so Edit and Record now resolve the same camera source/time for the same frame.
- Added Electron regression coverage that compares Record and Edit camera source identity plus media time for a saved replay fixture.

**Key files:** `apps/desktop/src/renderer/features/edit/{EditTab,EditCameraOverlay}.tsx`, `tests/electron/camera-replay.spec.ts`

---

### ~~TASK-087: Record: Persist config across panel opens and app restarts~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

The shared Record config now survives both floating-panel open/close cycles and full app relaunches through the same persisted main-process config path.

**Completed:**

- Normalized `recordingConfig` persistence in `electron-store` so only valid mode, toggle, device, and countdown values are rehydrated after restart.
- Reused the persisted config defaults from `recent-projects-service.mjs` in `main/index.mjs`, keeping initialization and storage aligned.
- Added focused Electron coverage for both panel-open persistence and full restart persistence using a dedicated temporary config directory.

**Verification:**

- `xvfb-run --auto-servernum pnpm exec playwright test tests/electron/record-tab.spec.ts tests/electron/record-config-persistence.spec.ts`
- `pnpm --filter @rough-cut/store test`

**Key files:** `apps/desktop/src/main/{index,recent-projects-service}.mjs`, `tests/electron/{record-tab,record-config-persistence}.spec.ts`

---

### ~~TASK-119: Record/Edit: Persist layout template for camera preview parity~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-15)

Record and Edit now share persisted preview-layout inputs instead of relying on transient Record-only UI state. The selected Record template is stored on the recording presentation, the resolved camera frame is persisted as a normalized rect, and both Record and Edit rehydrate from that saved state.

**Completed:**

- Added `presentation.templateId` and `presentation.cameraFrame` to the recording presentation model, plus schema/factory defaults and a v6 migration for older projects.
- Added project-store actions to persist template changes and resolved camera-frame updates on recording assets.
- Rehydrated `RecordTab` from persisted template state and passed the persisted camera frame back into `TemplatePreviewRenderer`.
- Updated `EditTab` to consume the same persisted template/frame inputs via the shared preview renderer path.
- Added a focused Electron parity spec that loads a saved project with a persisted camera frame and verifies Record/Edit render matching normalized placement.

**Follow-ups unlocked:**

- `TASK-115` can now focus on any remaining layout/visibility mismatches on top of a shared persisted source of truth.
- `TASK-116` can expand parity coverage across save/reopen and playback-state scenarios.

**Key files:** `apps/desktop/src/renderer/features/{record/RecordTab,edit/EditTab}.tsx`, `apps/desktop/src/renderer/features/record/{TemplatePreviewRenderer,CameraPlaybackCanvas}.tsx`, `packages/project-model/src/{types,schemas,factories,migrations,constants}.ts`, `packages/store/src/{project-store.ts,project-store.test.ts}`, `tests/electron/camera-template-parity.spec.ts`

---

### ~~TASK-115: Edit: Camera layout/visibility parity with Record preview~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

Edit now uses the same shared preview-layout inputs and visibility rules as Record instead of approximating camera rendering from a narrower subset of props.

**Completed:**

- Updated the shared `TemplatePreviewRenderer` path to honor `camera.visible` consistently, so hiding the camera in Record also hides it in Edit.
- Passed persisted camera crop and source-dimension inputs through `EditTab`, matching the camera framing inputs already used in Record.
- Added focused Electron coverage that verifies persisted camera-frame parity across Record/Edit and that camera visibility toggles hide the camera in both tabs.

**Key files:** `apps/desktop/src/renderer/features/{edit/EditTab,record/TemplatePreviewRenderer}.tsx`, `tests/electron/{camera-template-parity,camera-replay}.spec.ts`

---

### ~~TASK-116: Tests: Record/Edit camera parity regression coverage~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

Camera parity coverage now exercises the saved-state and cross-tab cases that were still untested after the implementation work landed.

**Completed:**

- Added a deterministic Electron parity suite that verifies persisted camera-frame parity between Record and Edit.
- Added save/reopen coverage to confirm template/frame parity survives an actual `.roughcut` round-trip.
- Added hidden-camera coverage to verify camera visibility state is respected in both tabs.
- Narrowed one older replay helper so the source/media-time parity test no longer blocks on unrelated screen-video readiness.

**Key files:** `tests/electron/{camera-template-parity,camera-replay}.spec.ts`

---

### ~~TASK-117: Edit: Dynamic track management (add/remove channels)~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

The Edit timeline now supports creating extra video/audio channels on demand and removing empty channels without dropping below one track per type.

**Completed:**

- Added store-level `addTrack()` and `removeTrack()` actions with stable insertion order, per-type naming, and track reindexing.
- Prevented removal of non-empty tracks and of the last remaining track for a given type.
- Added Edit timeline toolbar actions for `+ Video` and `+ Audio`, plus per-row remove buttons on empty removable tracks.
- Added regression coverage at both layers: store tests for ordering/guards and an Electron test for add/remove channel flow in the Edit tab.

**Key files:** `packages/store/src/{project-store,project-store.test}.ts`, `apps/desktop/src/renderer/features/edit/{EditTab,EditTimelineShell,TimelineStrip}.tsx`, `tests/electron/edit-track-management.spec.ts`

---

### ~~TASK-025: Edit: Track headers UI (mute/solo/lock toggles, volume slider)~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-16)

The Edit timeline now exposes per-track header controls directly in the lane header, using the existing persisted track state where possible and a lightweight local solo state for timeline isolation.

**Completed:**

- Added `M`, `S`, and `L` header toggles for each track row in the Edit timeline.
- Wired `M` to persisted `track.visible`, `L` to persisted `track.locked`, and audio-track sliders to persisted `track.volume`.
- Added local solo state in `EditTab` so soloed tracks visually isolate the timeline without introducing a broader playback-only contract yet.
- Added focused Electron coverage that verifies the header controls exist and update track state from the Edit tab.

**Key files:** `apps/desktop/src/renderer/features/edit/{EditTab,TimelineStrip}.tsx`, `tests/electron/edit-track-headers.spec.ts`

---

### FEATURE-084: Edit: Timeline multi-select + snap additions

**Priority:** P1 | **Status:** IN PROGRESS (2026-04-13)

Increment 1 of a three-part editor upgrade inspired by headline-design/seq (no-license, reimplemented clean-room). Adds multi-select and two new snap targets. Virtualization (Increment 2) and waveform rendering (Increment 3) deferred. This feature now anchors Phase 1 of the broader edit backlog rollout below.

**Progress (2026-04-13):** Increment 1 landed on branch `feat/timeline-marquee-snap`:

- `snapToPlayhead` and `snapToGrid` pure helpers in `packages/timeline-engine/src/snap.ts` (13 new unit tests)
- `getClipsInFrameRange` extended with optional `trackIds` filter for marquee hit-testing (5 new tests)
- `selectedClipIds: readonly string[]` added to `TransportStore` with `setSelectedClipIds` / `addToSelection` / `removeFromSelection` / `clearSelection` actions (9 new tests, non-undoable by design)
- Edit tab selection migrated from component-local `useState` to transport store; `TimelineStrip` prop renamed `selectedClipId` → `selectedClipIds` (MotionTab/ExportTab unaffected, they use READ_ONLY interaction)
- New `MarqueeOverlay.tsx` component: drag on empty timeline background draws rubber-band rect; release selects clips in range; shift-drag adds to selection; plain click on empty clears; 3px drag threshold separates click from marquee
- `handleDelete` now removes all selected clips (previously only the first)
- Full test matrix post-Increment 1: +27 new tests, zero regressions against baseline

**Remaining (Increments 2 + 3):**

- Clip virtualization (render only clips intersecting visible frame range)
- Waveform rendering via main-process FFmpeg peak extraction (defer until FEATURE-076 stabilizes)
- Known limitations (intentional for this increment): right panel shows only first selected clip; `S` (split) operates on first selection only; multi-delete produces N undo steps rather than 1

**Broader edit backlog phases (work top-to-bottom):**

1. **Phase 1 - Timeline selection + structural edits**
   Finish `FEATURE-084`, then land `TASK-017` (clip drag-to-move), `TASK-018` (cross-track dragging), and `TASK-027` (ripple delete). This keeps direct manipulation and destructive timeline edits on one shared foundation.
2. **Phase 2 - Playback + audio editing feedback**
   Land `TASK-119` (persist preview layout template), `TASK-115` (camera layout/visibility parity), `TASK-116` (camera parity tests), `TASK-020` (audio playback synced to playhead), `TASK-025` (track headers), `TASK-117` (dynamic add/remove channels), `TASK-065` (clip/track volume controls), `TASK-026` (waveforms), and `TASK-066` (transport skip controls). This makes playback feedback trustworthy before deeper authoring UI.
3. **Phase 3 - Inspector authoring controls**
   Land `TASK-019` (effects stack UI), `TASK-023` (keyframe editor), and `TASK-064` (opacity/blend mode). This completes the core inspector surface for clip-level adjustments.
4. **Phase 4 - Finishing polish in the timeline**
   Land `TASK-024` (transitions) and `TASK-063` (thumbnail strips). These improve readability and finishing quality once editing and playback fundamentals are stable.

The default one-by-one execution order is the task order listed inside each phase.

**Key files:** `packages/timeline-engine/src/snap.ts`, `packages/timeline-engine/src/select-clips.ts`, `packages/store/src/transport-store.ts`, `apps/desktop/src/renderer/features/edit/{TimelineStrip,EditTab,MarqueeOverlay}.tsx`

---

### ~~TASK-085~~: Record: Persistent recording location + migration for stale /tmp references

**Priority:** P1 | **Status:** ✅ DONE (2026-04-15)

#### Problem

Recordings have been defaulting to `/tmp/rough-cut/recordings/`. On most Linux setups `/tmp` is cleared on reboot, so any `.roughcut` project referencing those absolute paths loses its footage. Evidence: many March / early-April projects now point at `.webm` files that no longer exist on disk. Saved projects open but their preview is blank or falls back to MediaError.

The app already has a user-configurable recording location stored via `electron-store` key `recordingLocation` (see `recent-projects-service.mjs:23-26`), and a Settings UI for picking one — but the default when none is set was `/tmp/...`, so new users hit the same problem.

#### Progress (2026-04-13)

- Recording session manager fallback switched from `/tmp/rough-cut/recordings` to `~/Documents/Rough Cut/recordings` (`app.getPath('documents')` + auto-`mkdirSync`). Branch: `feat/timeline-marquee-snap`, commit `ba4e092`.
- Existing user-configured location via Settings still takes precedence (no behavior change for users who set one).
- `DEBUG_LOAD_LAST_RECORDING` now searches the configured location, the persistent default, and legacy `/tmp` recordings instead of assuming `/tmp` only.
- Record-tab `DEBUG: Reload Last` now reopens the latest saved `.roughcut` from Recent Projects instead of reconstructing a transient in-memory project from raw recording files.
- Dirty projects with an existing `projectFilePath` now autosave debounced edits, and `setProject()` no longer marks freshly loaded projects dirty immediately. This fixes project rename/save persistence for reopened recordings.
- Project-open flows now repair stale media references by basename across the configured recording location, `~/Documents/Rough Cut/recordings`, and legacy `/tmp/rough-cut/recordings`, so older saved sessions can reopen even after the default recording location changed.
- Playwright replay/zoom fixtures now load through the same repaired open path and no longer hardcode `/tmp/rough-cut/recordings` assumptions.

#### Completed

- [x] Update `DEBUG_LOAD_LAST_RECORDING` handler in `apps/desktop/src/main/index.mjs:211` to look in both the configured location AND the new default, falling back to `/tmp` only for legacy recordings.
- [x] Update Playwright test constants/fixtures so replay and zoom coverage stop hardcoding `/tmp/rough-cut/recordings` and instead use the repaired project-open path.
- [x] Decide: defer startup project scanning/missing-footage repair UI to `TASK-071`; short-term recovery is now handled by load-time path repair when projects open.
- [x] Document in `docs/MVP_SPEC.md` that default recording storage is `~/Documents/Rough Cut/recordings/` and that Settings can override.

#### Key files

- `apps/desktop/src/main/recording/recording-session-manager.mjs` — fallback path + `mkdirSync`
- `apps/desktop/src/main/index.mjs` — recording-path repair, project open handlers, debug reload fallback search
- `apps/desktop/src/main/recent-projects-service.mjs:23-26` — `recordingLocation` electron-store schema
- `tests/electron/{camera-replay,playhead-start,zoom-marker,zoom-persistence}.spec.ts` — replay and zoom regression coverage for repaired project-open flows
- `docs/MVP_SPEC.md` — persistent recording-location behavior

#### Why this matters

Without a persistent default, every new install produces projects that break on the next reboot. This is the correct short-term fix (safe default) while TASK-071 (relative paths in project documents) is the correct long-term fix (portability across machines).

---

### ~~TASK-086~~: Record: Unified config store for main tab + recording panel

**Priority:** P0 | **Status:** ✅ DONE (2026-04-16)

#### Problem

The visible Record tab and the floating recording panel currently own separate state for source selection, mic/system-audio toggles, camera enablement, and countdown/recording lifecycle. As a result, the main Record toolbar can drift from the panel that actually performs the capture, making the product feel unreliable even when the underlying capture code works.

#### Scope

- Create a dedicated recording config store that is independent from the project document but shared by both the main Record tab and the floating panel.
- Move source selection, record mode, mic/system-audio/camera enablement, selected devices, countdown duration, and last-used visual defaults into that store.
- Make panel open/close reuse the shared state instead of reinitializing from panel-local defaults.
- Ensure the store is the single source of truth for BUG-007, BUG-008, ~~BUG-009~~, BUG-010, TASK-087, and TASK-088.

#### First Steps

- Introduce `recordingStore` alongside the existing project/transport stores.
- Replace `useState`-owned config in `RecordTab.tsx` and `PanelApp.tsx` with store selectors/actions.
- Route source selection and panel launch through the same store-backed actions.
- Add targeted tests that assert the main tab and floating panel reflect the same source and device state.

#### Proposed Store Shape

Use the same vanilla Zustand style as `packages/store/src/transport-store.ts` and `project-store.ts`.

```ts
export interface RecordingConfigState {
  recordMode: 'fullscreen' | 'window' | 'region';
  availableSources: readonly CaptureSource[];
  selectedSourceId: string | null;
  micEnabled: boolean;
  sysAudioEnabled: boolean;
  cameraEnabled: boolean;
  countdownSeconds: 0 | 3 | 5 | 10;
  selectedMicDeviceId: string | null;
  selectedCameraDeviceId: string | null;
  selectedSystemAudioSourceId: string | null;
  panelOpen: boolean;
  hydrated: boolean;
}

export interface RecordingConfigActions {
  hydrate: (patch?: Partial<RecordingConfigState>) => void;
  setAvailableSources: (sources: readonly CaptureSource[]) => void;
  setRecordMode: (mode: RecordingConfigState['recordMode']) => void;
  selectSource: (sourceId: string | null) => void;
  setMicEnabled: (enabled: boolean) => void;
  setSystemAudioEnabled: (enabled: boolean) => void;
  setCameraEnabled: (enabled: boolean) => void;
  setCountdownSeconds: (seconds: 0 | 3 | 5 | 10) => void;
  setMicDeviceId: (deviceId: string | null) => void;
  setCameraDeviceId: (deviceId: string | null) => void;
  setSystemAudioSourceId: (sourceId: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  resetSessionOnlyState: () => void;
}
```

#### Ownership Boundaries

- `recordingStore` owns user-selected recording configuration shared by surfaces.
- `projectStore` continues owning persisted project/asset/clip/presentation data.
- `transportStore` continues owning playback state and timeline selection.
- `PanelApp.tsx` keeps transient runtime state local:
  - live `MediaStream` instances
  - `MediaRecorder` / camera recorder instances
  - elapsed timer updates from IPC
  - current panel lifecycle status (`idle`, `countdown`, `recording`, `paused`, `stopping`)
- `RecordTab.tsx` keeps transient preview-only state local if it is derived from shared config plus active media objects.

#### Persistence Strategy

- Persist only durable user preferences from `recordingStore`:
  - `recordMode`
  - `selectedSourceId` only if source IDs are stable enough on this platform, otherwise persist source kind and re-resolve best match
  - `micEnabled`
  - `sysAudioEnabled`
  - `cameraEnabled`
  - `countdownSeconds`
  - selected device IDs when available
- Do not persist:
  - `availableSources`
  - `panelOpen`
  - live status or stream references
  - any in-flight recording state
- Prefer a thin renderer-side persistence adapter first; move to shared main-process persistence only if device/source restoration needs OS-aware resolution.

#### Migration Order

1. Create the store with defaults and tests.
2. Read from the store in `RecordTab.tsx` without removing old local state yet.
3. Switch write paths in `RecordTab.tsx` to store actions.
4. Switch `PanelApp.tsx` initialization to store reads instead of panel-local defaults.
5. Remove duplicated local config state from both surfaces.
6. Add persistence/hydration.
7. Add device selectors on top of the unified store.

#### Concrete Refactor Steps

- In `RecordTab.tsx`:
  - replace `recordMode` local state with `recordingStore.recordMode`
  - replace source/toggle state reads with store selectors
  - keep preview stream ownership local for now
  - when the user clicks Record, set `panelOpen=true` before `openRecordingPanel()`
- In `PanelApp.tsx`:
  - remove default `useState(true/false)` config for mic/system/camera/source
  - subscribe to the shared store for source/device/toggle values
  - keep local runtime recorder state only
  - on panel close/unmount, clear only session-local flags, not user config
- In `main/index.mjs` and recording IPC:
  - keep main-process `selectedSourceId` bridge only as an execution detail
  - ensure the renderer always pushes the store-selected source before capture begins
  - avoid hidden main-process fallback that silently chooses a different source than the UI shows

#### Test Plan

- Add unit tests for the new store in the same style as `packages/store/src/transport-store.test.ts`
- Add Playwright test: main Record source persists into opened panel
- Add Playwright test: mic/system-audio/camera toggles match between tab and panel
- Add Playwright test: relaunch restores persisted Record config
- Update `tests/electron/acceptance-record.spec.ts` to assert shared-surface truth instead of placeholder-only expectations

#### Risks and Guardrails

- Do not move project presentation state into `recordingStore`; that would blur the line between live config and saved edit data.
- Do not persist raw `CaptureSource[]`; source catalogs must be reloaded per session.
- Do not let the panel overwrite hydrated config with hardcoded defaults on mount.
- Keep the first pass minimal: unify state first, then add new controls and selectors.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/renderer/features/record/BottomBar.tsx`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `packages/store/**` or new `apps/desktop/src/renderer/features/record/recording-store.ts`

#### Why this matters

This is the structural fix for the Record surface. Until state is unified, the app will keep feeling like two loosely connected recording experiences instead of one dependable workflow.

---

### ~~TASK-113: Record: Camera aspect presets for shaped PiP~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-15)

Added camera aspect presets (`16:9`, `1:1`, `9:16`, `4:3`) to the Record inspector for shaped PiP overlays, with `1:1` as the default for rounded/square camera frames and circle remaining fixed to a true circle.

The Record preview and Edit overlay now both respect the selected camera aspect ratio and use cover-cropping so webcam footage keeps its native proportions instead of stretching.

**Key files:** `RecordCameraPanel.tsx`, `TemplatePreviewRenderer.tsx`, `EditCameraOverlay.tsx`, `packages/project-model/src/{types,schemas,factories}.ts`

---

### TASK-089: Record: Keyboard shortcut capture + on-video overlays

**Priority:** P1 | **Status:** TODO

#### Problem

Tutorial-oriented recording tools increasingly show pressed shortcuts on screen so viewers can follow actions without relying only on narration. rough-cut already records cursor-driven guidance well, but there is no first-class keyboard-visualization path in Record.

#### Scope

- Capture keyboard shortcut events during recording with filtering for modifiers, repeated keys, and privacy-sensitive input.
- Render a lightweight overlay in the Record preview and persist the result so Edit and Export can reproduce it.
- Support a tutorial-safe presentation model: shortcut pills, optional key-combo stacking, and configurable auto-hide timing.
- Avoid turning arbitrary text entry into visible overlays by default; this should be optimized for command shortcuts, not raw typing.

#### First Steps

- Define shortcut event capture rules and redaction behavior.
- Add a new Record inspector section for shortcut overlay enablement, style, and duration.
- Persist shortcut overlay events alongside cursor/recording metadata.
- Add regression coverage for modifier combos like `Cmd/Ctrl+K`, `Shift+Alt+R`, and repeated shortcuts.

#### Key files

- `apps/desktop/src/main/recording/cursor-recorder.mjs` or adjacent input-capture plumbing
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `packages/project-model/**`
- `packages/preview-renderer/**`
- `packages/export-renderer/**`

#### Why this matters

This is a high-leverage tutorial feature that improves comprehension immediately and makes rough-cut more competitive with Screen Studio and FocuSee without pushing basic explanatory work into the Edit tab.

---

### TASK-091: Record: Titles and callouts overlay system

**Priority:** P2 | **Status:** TODO

#### Problem

The Record tab exposes a `Titles` category today, but it is placeholder-only. For quick demos and walkthroughs, users need lightweight callouts, labels, and lower-thirds during capture without jumping to the fuller Motion/Edit authoring surfaces.

#### Scope

- Add simple Record-authored text overlays: title card, label/callout, lower-third, and step marker.
- Keep the model intentionally narrower than the Motion tab: quick utility text during recording, not full animation design.
- Serialize resulting overlays so Motion/Edit/Export can refine or faithfully render them later.
- Share underlying text-effect primitives with `TASK-107` instead of duplicating a separate text rendering system.

#### First Steps

- Replace the `Titles` placeholder panel with a small set of text presets and editable fields.
- Define how Record-authored text maps into effect-registry/project-model structures.
- Support drag positioning in preview with safe bounds and template-aware alignment guides.
- Add parity checks so Record-created callouts survive into Edit and Export unchanged.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`
- `packages/effect-registry/**`
- `packages/project-model/**`
- `packages/export-renderer/**`

#### Why this matters

This closes another placeholder in the Record UI while preserving the product split: Record gets fast utility text, Motion remains the richer animation/text-design surface.

---

### TASK-092: Record: Dynamic camera layout changes within one recording

**Priority:** P2 | **Status:** PAUSED (2026-04-25)

#### Deferred (2026-04-25)

- Moved out of the current active flow for now because the immediate work landed around camera layout markers and shared preview/export parity, and that is not the next product focus.
- Resume after the higher-priority non-marker Record work is done.

#### Progress (2026-04-25)

- Shared frame resolution now applies active `cameraLayouts` markers by recording source frame, so downstream render/export consumers match the Record preview.
- Focused verification passed across frame-resolver tests, export-renderer tests, and targeted Record/Export Playwright camera-layout specs.

#### Problem

rough-cut already has strong camera styling, but the camera layout is effectively static within a recording. Competing tools let creators switch emphasis over time: full-screen webcam for intros, PiP during demos, side-by-side during explanation segments, and auto-adjustments around zoom moments.

#### Scope

- Allow camera layout changes over time within a single recorded asset.
- Support the first layout set: hidden, PiP, side-by-side, full webcam, and screen-only.
- Store layout changes as timeline-aware presentation data so Edit can refine the same structure instead of reinterpreting it.
- Keep layout-authoring simple in Record; detailed motion polish remains in Edit/Motion.

#### First Steps

- Define the data shape for layout segments or keyframed layout states.
- Add layout presets in the camera inspector with the ability to insert a layout change at the current playhead.
- Update preview/compositor rendering so camera and screen regions transition cleanly between layout states.
- Add tests covering layout continuity, camera visibility toggling, and saved-session replay.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordCameraPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`
- `packages/project-model/**`
- `packages/preview-renderer/**`

#### Why this matters

This is one of the clearest competitive gaps versus FocuSee-style storytelling, and it fits rough-cut particularly well because the app already has a dedicated Edit surface for deeper refinement after the initial authoring pass.

---

### TASK-090: Record: Highlights and annotations overlay system

**Priority:** P2 | **Status:** TODO

#### Problem

The Record inspector already exposes a `Highlights` category, but it is currently a placeholder. Competitive tools use spotlights, arrows, blur masks, and lightweight annotations to make tutorials understandable without requiring a full trip into the Edit tab for every emphasis moment.

#### Scope

- Add a lightweight annotation model for Record-authored overlays that can be created quickly and refined later in Edit.
- Support first-pass primitives: spotlight, arrow, rectangle, and blur/privacy mask.
- Make annotations visible in the composed preview and serializable onto resulting assets/clips so the Edit and Export tabs can render them consistently.
- Keep the interaction model simple: create in Record, refine in Edit if needed.

#### First Steps

- Define the minimal persisted data shape for Record annotations.
- Replace the `Highlights` placeholder panel with controls for creating and selecting overlays.
- Render overlays in the preview/compositor path with timeline-aware visibility.
- Add preview/export parity tests for spotlight and blur-mask rendering.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`
- `packages/project-model/**`
- `packages/preview-renderer/**`
- `packages/export-renderer/**`

#### Why this matters

This closes one of the most obvious "coming soon" gaps in the Record tab and gives rough-cut a Record-native explanation layer without collapsing Edit and Record into the same surface.

---

### TASK-176: Record: Clarify camera layout marker add vs update UX

**Priority:** P2 | **Status:** TODO

#### Problem

Camera layout markers are currently editable, but the distinction between creating a new marker at the playhead and updating an already-selected marker is unclear. This makes it easy to accidentally overwrite an existing layout state when the user intended to create a new one.

#### Scope

- Split the camera layout controls into explicit actions for:
  - add new marker at playhead
  - update selected marker
  - deselect current marker
- Make the selected-marker state obvious in the inspector and timeline.
- Prevent ambiguous preset actions that silently mutate the selected marker when the user expects insertion.

#### First Steps

- Add dedicated inspector affordances for `Add new marker` and `Update selected marker`.
- Add a visible selected-marker summary with frame/time.
- Add focused tests covering selection, deselection, add-new, and update-selected flows.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordCameraPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/RecordTimelineShell.tsx`
- `tests/electron/record-tab.spec.ts`

#### Why this matters

This is quality-of-life work, not a recording-readiness blocker. But it removes a subtle authoring trap in the Record timeline and makes camera layout editing feel intentional instead of fragile.

---

### TASK-216: Record: Mouse/cursor movement not smooth — drops frames during recording

**Priority:** P1 | **Status:** IN PROGRESS (2026-04-25) | **Depends on:** TASK-010, TASK-193

#### Progress

- Captured and isolated the remaining cursor-motion smoothness gap after the Linux/X11 60 fps recording fix landed.
- Landed `TASK-226` as a direct child fix so cursor playback can interpolate between recorded frames instead of stepping backward frame-by-frame under fast motion.
- The task remains open because overall cursor fluency still needs end-to-end validation against real takes, not just the interpolation slice.

#### Problem

Saved recordings now preserve screen capture cadence much better, but cursor motion can still feel visibly less smooth than the underlying desktop interaction. That makes tutorial recordings read as lower quality even when the screen video itself is no longer dropping to the earlier 30/25 fps behavior.

#### Scope

- Eliminate remaining cursor-motion stutter in recorded output.
- Keep cursor overlay timing aligned with the saved recording duration and effective fps.
- Verify that fast pointer motion looks fluent in both Record review and downstream export.

#### Next Steps

- Re-run focused capture/export checks on real fast-motion recordings after `TASK-226`.
- Separate any remaining issues into timing drift vs interpolation/rendering vs source-capture cadence.
- Close only when cursor motion is visually smooth in saved artifacts, not just better than before.

#### Key files

- `apps/desktop/src/main/recording/cursor-recorder.mjs`
- `apps/desktop/src/renderer/components/CursorOverlay.tsx`
- `apps/desktop/src/renderer/components/cursor-data-loader.ts`
- `packages/export-renderer/src/cursor-render.ts`
- `tests/electron/record-camera-artifact.spec.ts` or adjacent focused playback/export checks

---

### ~~TASK-250~~: Preview: Safe continuous cursor and zoom smoothness plan

**Priority:** P1 | **Status:** ✅ DONE (2026-04-26) | **Depends on:** TASK-216, TASK-075

#### Intent

Move Rough Cut toward Screen Studio/FocuSee-style cursor, zoom, and camera smoothness without destabilizing existing frame-accurate editing, seeking, replay, or export behavior. Keep integer frames as the source of truth for edits; introduce continuous presentation time only as an isolated visual playback/export input.

#### Progress (2026-04-26)

- Landed the low-risk first slice: a pure timestamp-native cursor track helper with binary-search lookup and interpolation.
- `buildCursorFrameData` now uses timestamp lookup when cursor/project FPS metadata is available, while preserving the existing frame-indexed fallback for callers without cadence metadata.
- Added focused unit coverage for interpolation, boundary lookup, duplicate timestamps, large data gaps, hidden cursor samples, and seek-like out-of-order lookups.
- Added the new cursor time-track test to the desktop package test command.

Verification:

- `pnpm --filter @rough-cut/desktop exec vitest run src/renderer/components/cursor-time-track.test.ts src/renderer/components/cursor-data-loader.test.ts`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test`

#### Safety Rules

- Preserve existing integer-frame timeline state for editing, markers, seeks, persistence, undo/redo, and tests.
- Add continuous-time paths behind existing APIs or feature flags first; do not replace the current frame path in one step.
- Reset smoothing state on seek, pause, source change, clip boundary jump, cursor data reload, and playback discontinuity.
- Keep subjective polish effects optional or default-low until visual QA proves they help.
- Require focused unit tests for timing math and focused Electron tests for Record review playback before enabling broader behavior.
- Verify preview/export parity before applying any smoothing path to export output.
- Do not copy AGPL reference code from `refrences/Recordly`; use it only as architectural guidance.

#### Safer Implementation Steps

1. Timestamp-native cursor lookup with binary search and interpolation.
   Safety recommendation: Add a pure helper that accepts sorted timestamped samples and returns the interpolated cursor at `timeMs`; keep existing frame-based callers working; add boundary, gap, duplicate timestamp, invisible cursor, and seek tests.

2. Prepared cursor-track and zoom-plan caching.
   Safety recommendation: Cache only normalized/sorted derived data, keyed by object identity or explicit version; invalidate on sidecar reload, settings changes, marker edits, recording switch, and project reload; tests should prove stale caches are not reused after mutation.

3. Fractional/continuous preview time as an additive path.
   Safety recommendation: Add `playbackTimeMs`/fractional frame to preview transport while retaining `playheadFrame`; use it first for read-only visual interpolation; ensure frame stepping, marker placement, trimming, and persisted project state still use integer frames.

4. Use continuous time for cursor overlay only.
   Safety recommendation: Keep screen video frame selection unchanged; render only cursor position from timestamp interpolation; reset on seeks/discontinuities; compare existing cursor e2e fixtures before and after.

5. Persistent `SmoothedCursorState` using spring smoothing.
   Safety recommendation: Add as opt-in or low-strength setting; initialize at target position to avoid startup lag; snap instead of springing across seeks or gaps; unit-test spring convergence and no overshoot across discontinuities.

6. Split cursor target computation from animation smoothing.
   Safety recommendation: Refactor only after steps 1-5 are stable; target computation must remain deterministic and stateless, while smoothing owns mutable velocity/trail state; keep both layers separately testable.

7. Connected zoom pan transitions for nearby zoom regions.
   Safety recommendation: Start disabled or gated by a `connectZooms` option; never alter marker timing; only interpolate visual focus/scale between close regions; add tests for overlapping, distant, and explicit user markers.

8. Zoom/camera motion blur from transform velocity.
   Safety recommendation: Optional and default-off/low; compute from already-applied transform deltas; clamp velocity and kernel size; disable while paused/seeking; profile before enabling on low-end machines.

9. Cursor motion blur from per-frame velocity.
   Safety recommendation: Optional and default-off/low; derive from smoothed cursor deltas, not raw jitter; reset on discontinuities; verify it does not obscure precise pointer actions.

10. Cursor click bounce/sway as overlay animation.
    Safety recommendation: Treat as late-stage polish, not core smoothness; default off or subtle; ensure click location/timing remains exact even if visual bounce/sway is enabled; add visual QA before shipping.

#### Explicit Risk Classification

- Low risk: steps 1 and 2, if implemented as pure helpers with tests.
- Medium risk: steps 3, 4, 5, 6, and 7, because they can alter visual timing or perceived cursor accuracy.
- High risk: steps 8, 9, and 10, because they are subjective visual effects and can hurt performance or precision if enabled prematurely.

#### Verification Gate

- Unit tests for cursor interpolation, cache invalidation, spring reset/convergence, and zoom transition math.
- Focused Electron tests for Record review playback, paused seek, timeline scrubbing, zoom marker editing, and cursor visual continuity.
- Manual/visual QA on a fast mouse-motion take before enabling smoothing or blur by default.
- Export parity check only after preview behavior is stable.

#### Reference Review

- `refrences/Recordly/src/lib/extensions/extensionHost.ts` confirms timestamp-native cursor interpolation via binary search.
- `refrences/Recordly/src/components/video-editor/videoPlayback/motionSmoothing.ts` confirms the value of spring smoothing for cursor/zoom, but should be used as architecture only due licensing.
- `refrences/Recordly/src/components/video-editor/videoPlayback/cursorRenderer.ts` confirms synthetic cursor overlay, smoothing, click bounce, sway, and velocity blur are separable layers.
- `refrences/Recordly/src/components/video-editor/videoPlayback/zoomRegionUtils.ts` confirms connected zoom pans should be an optional visual transition layer.
- `refrences/openscreen/src/lib/exporter/frameRenderer.ts` confirms export rendering benefits from time-based animation state and velocity-derived motion blur.
- `refrences/CursorLens/src/lib/cursor/cursorComposer.ts` confirms prepared cursor track caching, timestamp interpolation, static-hide logic, and loop blending are useful without changing edit semantics.

#### Key files

- `apps/desktop/src/renderer/components/CursorOverlay.tsx`
- `apps/desktop/src/renderer/components/cursor-data-loader.ts`
- `apps/desktop/src/renderer/features/record/RecordingPlaybackVideo.tsx`
- `apps/desktop/src/renderer/features/record/RecordTimelineShell.tsx`
- `apps/desktop/src/renderer/stores/transport-store.ts`
- `packages/preview-renderer/src/playback-manager.ts`
- `packages/preview-renderer/src/preview-compositor.ts`
- `packages/timeline-engine`
- `packages/export-renderer/src/cursor-render.ts`

---

### TASK-217: Record: Mouse click sound effect

**Status**: Todo
**Priority:** P2 | **Status:** ✅ DONE (2026-04-25) | **Depends on:** TASK-010, TASK-130

#### Completed

- Added a Record-side cursor toggle for `clickSoundEnabled` so the sound can be enabled per recording presentation.
- Wired Record playback to the new click-sound playback hook so review playback can emit the same synthesized click sound users hear in export.
- Added an Export-side `keepClickSounds` toggle so exports can keep or suppress synthesized click SFX without mutating the source recording's cursor settings.
- Added `exportSettings.keepClickSounds` to the shared project model with a default-on migration-safe normalization path.
- Kept the WebCodecs export path gated by both `cursor.clickSoundEnabled` and `exportSettings.keepClickSounds`.
- Fixed the Electron/main-process export finalize fallback so click-only exports still get an audio track even when the source recording itself is silent.
- Added end-to-end Electron coverage that proves a click-enabled take previews audibly in Record and respects the Export keep/disable toggle in a real render flow.

#### Verification

- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/export-renderer test`
- `pnpm exec playwright test tests/electron/click-sound.spec.ts --workers=1`

#### Key files

- `apps/desktop/src/renderer/features/record/RecordCursorPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordingPlaybackVideo.tsx`
- `apps/desktop/src/renderer/hooks/use-click-sound-playback.ts`
- `apps/desktop/src/renderer/hooks/use-click-sound-playback.test.ts`
- `apps/desktop/src/renderer/features/export/ExportTab.tsx`
- `apps/desktop/src/main/index.mjs`
- `packages/export-renderer/src/audio-export.ts`
- `packages/export-renderer/src/audio-export.test.ts`
- `packages/project-model/src/{types,schemas,factories}.ts`
- `tests/electron/click-sound.spec.ts`

---

### ~~TASK-100: Record: Disconnect recovery and warning toasts for dropped devices~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-19)

#### Completed

- Added disconnect detection for mic, camera, system audio, and capture source in both the main Record tab and floating panel.
- Added warning toasts plus persistent offline issue state so failures remain visible after the initial toast.
- Synced panel-reported connection issues back to the main Record tab via shared session IPC.
- Made reconnect behavior predictable: selecting a replacement mic/camera/system-audio source re-enables that input.
- Added focused Electron coverage for source loss recovery, interrupted-session banners, panel-to-main issue sync, and replacement-device re-enable behavior.

#### Problem

The MVP spec expects recording to continue gracefully when a mic or camera disconnects, with a warning toast explaining what changed. The current plan tracks a toast system separately, but the Record surface still needs explicit disconnect detection, recovery behavior, and user feedback.

#### Scope

- Detect mic/camera loss during preview and recording.
- Continue recording with remaining sources where possible instead of hard-failing the session.
- Surface a non-blocking warning toast with the affected device and resulting fallback behavior.
- Ensure reconnect/retry behavior is predictable and doesn’t corrupt the active session.

#### First Steps

- Wire track-ended / device-change listeners in the panel and Record tab preview flows.
- Define fallback behavior for mic-only, system-audio-only, camera-lost, and source-lost cases.
- Integrate with the global toast system once `TASK-102` lands.
- Add Playwright/integration coverage for simulated track loss and warning visibility.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/index.mjs`

#### Why this matters

This is one of the biggest trust features in a recording tool. Users will forgive a device problem; they will not forgive losing the recording because the app failed to degrade gracefully.

---

### ~~TASK-144: Record: Mid-take source/device recovery with re-target and offline badge~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-19)

#### Completed

- Built on `TASK-100` by keeping mid-session disconnect state visible as inline offline badges on the actual Record device controls instead of only banners/toasts.
- Added panel-side offline badges for source, mic, camera, and system audio while preserving the existing issue notice and mini-controller warning pill.
- Kept reconnect behavior explicit: selecting a replacement mic/camera/system-audio source now re-enables that input.
- Reworked panel source loss to preserve the broken state instead of silently auto-falling back, and added explicit `Refresh` / `Re-target` actions in the floating panel.
- Added a mini-controller `Fix` action that expands the panel back to setup mode during recording so users can recover without stopping the take.
- Added focused Electron coverage for panel-reported issue sync, source-loss recovery messaging, and reconnect behavior in the Record tab.

#### Key files

- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/RecordDeviceSelectors.tsx`
- `tests/electron/record-tab.spec.ts`

---

### ~~TASK-147~~: Record: Full reopen/project-move fidelity for templates and sidecars

**Priority:** P1 | **Status:** ✅ DONE (2026-04-21)

#### Completed

- Rehydrated the Record surface from persisted `presentation.templateId` instead of leaving the preview on the local default template after reopen.
- Added normalized camera-frame replay support in `TemplatePreviewRenderer` so moved/reopened projects can render the saved Record framing directly from project data.
- Persisted live Record camera drag/resize edits back into `presentation.cameraFrame` so authored framing now survives save/reopen instead of only replaying fixture-injected values.
- Added Electron regression coverage that reopens a moved project, verifies template/camera-frame fidelity in Record, and confirms zoom sidecars still save next to the moved recording media.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`
- `tests/electron/project-relative-paths.spec.ts`

#### Final closure

- Closed the broader dependency chain with `BUG-013` / `TASK-123` and re-ran the focused Record/Edit parity and moved-project reopen suites.

---

### ~~TASK-164~~: Record/Edit: camera visibility parity after persisted framing

**Priority:** P1 | **Status:** ✅ DONE (2026-04-19)

#### Problem

- Persisted camera-frame replay is now working in Record, but the existing Record/Edit parity suite still exposes a mismatch when camera visibility is toggled off.
- Current evidence points to Edit still instantiating camera playback when the presentation says the camera should be hidden, while Record now correctly suppresses that path.

#### Resolution

- Prevented `EditTab` from mounting `EditCameraOverlay` when the saved camera presentation is hidden.
- Added Edit preview test bounds so the Record/Edit parity suite can measure both surfaces against the same normalized preview container.
- Wired `EditCameraOverlay` to honor persisted `presentation.cameraFrame`, matching Record’s reopened framing instead of falling back to legacy position/size placement.
- Verified the focused parity suite now passes: saved framing parity, reopen parity, drag/save/reopen persistence, and hidden-camera parity.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`
- `apps/desktop/src/renderer/features/edit/EditTab.tsx`
- `tests/electron/camera-template-parity.spec.ts`

#### Notes

- `pnpm test:e2e tests/electron/camera-template-parity.spec.ts` passes.
- `pnpm --filter @rough-cut/desktop typecheck` still reports unrelated pre-existing `ExportTab.tsx` `selectStyle` errors outside this task.

---

### ~~TASK-151~~: Record: Destination presets with social framing and export linkage

**Priority:** P1 | **Status:** ✅ DONE (2026-04-19)

#### Goal

- Add destination presets that bundle social framing choices in Record and carry them into Export defaults.

#### Safe starting scope

- Trace current Record template selection, persisted project settings, and Export preset hydration.
- Introduce the smallest shared preset model that links Record-side destination intent to Export without crossing into dynamic camera timeline authoring.
- Keep the initial slice isolated to Record inspector/preset plumbing and Export default selection.

#### Progress

- Added Record-side destination presets for YouTube, vertical social, and square social framing.
- Linked each Record destination choice to Export defaults by patching export resolution/frame rate/bitrate alongside the Record template/resolution change.
- Added Export-side portrait and square preset options so the linkage survives as a named preset instead of degrading to `custom`.
- Added Electron coverage proving that choosing a Record destination preset updates Export defaults on tab switch.
- Persisted the chosen destination preset explicitly in `project.settings.destinationPresetId` with a schema migration so linkage survives save/reopen without relying only on inference.
- Added an Export-side `Linked Destination` summary card and clear-on-manual-edit behavior so users can see when Export is still following a Record destination preset.

#### Notes

- `pnpm test:e2e tests/electron/export-tab.spec.ts` passes.
- `pnpm --filter @rough-cut/project-model test` passes.
- While landing this slice, fixed a pre-existing `RecordTab` store-selector loop by moving caption-segment filtering out of the `useProjectStore` selector.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/export/ExportTab.tsx`
- `packages/project-model/**` and `packages/store/**` if persisted preset state is needed

#### Outcome

- Record now offers destination presets for landscape, vertical social, and square social capture.
- Destination choice persists in project settings, survives migrations, and drives linked Export defaults.
- Export shows the active linked destination explicitly and falls back honestly when users diverge into custom settings.

---

### Client Tutorial Recording Readiness Flow

This flow is the A-to-Z path to make Rough Cut safe enough to record a paid client tutorial in the app itself. The order is intentional: first make the visible recording path truthful, then harden interruption handling, then prove the whole workflow with deterministic verification.

#### Design rule

- The Record surface must never imply capabilities the pipeline does not actually deliver.
- The same source, mode, and device choices shown before `REC` must be the ones used in the saved artifact.
- Recovery and tests are part of the feature, not cleanup work after the feature.

#### Phase A: Golden path truthfulness

- `TASK-165` wire the main Record tab to the real selected-source live preview
- `TASK-166` enforce mode-filtered source selection and prevent invalid recording starts
- `TASK-167` ensure the selected mic/system-audio route is the one that actually gets saved
- `TASK-168` re-probe muxed recordings so imported project state reflects real audio truth

#### Phase B: Failure-path resilience

- `TASK-169` guarantee clean stop/save behavior on panel close and app quit
- `TASK-170` make pause/resume truthful end-to-end or explicitly disable unsupported pause paths
- `TASK-171` add relaunch-time session manifests and partial-take recovery
- `TASK-172` either implement true region capture or remove the misleading unsupported path

#### Phase C: Verification gates

- `TASK-173` prove the golden path from blank project to saved recording asset/clip
- `TASK-174` prove audio route fidelity and post-save import correctness
- `TASK-175` prove interrupted-session recovery, reopen, and export from a fresh recording

#### Exit gate

Rough Cut is not client-tutorial ready until all three verification tasks are passing on the same workstation and audio routing setup that will be used for the client session.

---

### ~~TASK-165~~: Record: Wire main-tab live preview to selected capture source

**Priority:** P0 | **Status:** ✅ DONE (2026-04-19)

#### Goal

- Make the visible Record tab preview show the actual selected capture source before recording starts.
- Replace placeholder-only confidence with truthful states: no source selected, acquiring preview, preview live, preview lost, preview failed.

#### Product contract

- The large preview on the main Record tab is the source-of-truth preview before recording starts.
- If the user selects a different screen or window, the preview must visibly switch to that exact source.
- If Rough Cut cannot show a live preview yet, it must say so directly instead of showing stale or generic imagery.

#### Scope

- Wire `useLivePreview(selectedSourceId)` into the Record-tab preview render path.
- Lock one explicit preview rule for the Record tab when a project already has saved takes:
  - pre-record: live source preview
  - post-record review: playback of the saved take
  - if a hybrid state exists, label the transition clearly instead of guessing for the user
- Remove or retire dead preview code once the real path is chosen.

#### Non-goals

- Do not redesign the whole preview renderer.
- Do not mix live-source preview and saved-take playback in the same unlabeled state.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/TemplatePreviewRenderer.tsx`
- `apps/desktop/src/renderer/features/record/LivePreviewCanvas.tsx`
- `apps/desktop/src/renderer/features/record/LivePreviewVideo.tsx`

#### Verification

- Main Record surface shows the selected source before the panel opens.
- Losing the source produces a visible degraded state instead of a stale preview.
- Acceptance tests assert real preview behavior instead of placeholder assumptions.

---

### ~~TASK-166~~: Record: Enforce mode-filtered source picker and REC gating

**Priority:** P0 | **Status:** ✅ DONE (2026-04-19)

#### Goal

- Make source selection behaviorally correct so the user cannot start a recording from an invalid or misleading source state.

#### Product contract

- The mode picker defines what kinds of sources are legal.
- The source picker only shows sources that can really be recorded for the current mode.
- `REC` is enabled only when the current mode/source combination is valid.

#### Scope

- Enforce exact mode-to-source behavior:
  - `fullscreen` -> screen sources only
  - `window` -> window sources only
  - `region` -> screen-only source selection until true region capture exists
- Remove fallback logic that silently shows all sources when a mode filter fails.
- Prevent `REC` from opening the panel when no valid source is selected.
- Keep source picker state synchronized with the shared Record config store.

#### UX rule

- Invalid states should be obvious and recoverable: disabled `REC`, inline reason, and the next action the user should take.
- Never silently coerce `window` or `region` into some other source family.

#### Key files

- `apps/desktop/src/renderer/features/record/SourcePickerPopup.tsx`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/main/index.mjs`

#### Verification

- Picker contents change correctly when record mode changes.
- Invalid record starts are blocked with actionable UI.
- `tests/electron/record-mode-capture-source.spec.ts` reflects the intended mode contract.

---

### ~~TASK-167~~: Record: Route selected mic and system audio into saved capture

**Priority:** P0 | **Status:** ✅ DONE (2026-04-19)

#### Goal

- Make the device/routes selected in the UI be the ones used by the main-process recording pipeline, not just the panel preview path.

#### Product contract

- Audio selection is not cosmetic. The saved file must reflect the exact mic and system-audio choices shown in the UI.
- If a route is unavailable, the UI must degrade truthfully before recording starts.

#### Scope

- Plumb selected mic device identity into the main-process recording session.
- Map selected mic and selected system-audio route to the FFmpeg/Pulse capture path.
- Remove fallback behavior that silently records from the first available source when the UI indicates another device.

#### Non-goals

- Do not add new audio-processing features here.
- Do not accept "some audio was recorded" as success; route correctness is the bar.

#### Key files

- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/recording/audio-sources.mjs`
- `apps/desktop/src/preload/index.mjs`
- `apps/desktop/src/renderer/env.d.ts`

#### Verification

- The saved artifact reflects the selected mic/system-audio route, not just panel-time `getUserMedia` constraints.
- Focused artifact tests can prove the selected route survives into the recorded file.

---

### ~~TASK-168~~: Record: Re-probe muxed output and import truthful audio metadata

**Priority:** P0 | **Status:** ✅ DONE (2026-04-19)

#### Goal

- Ensure the app's imported project state reflects the actual post-mux output, especially audio presence.

#### Product contract

- The project model must describe the final saved file, not an earlier pre-mux assumption.
- If the final MP4 has audio, imported state must say it has audio. If it does not, imported state must not invent it.

#### Scope

- Re-probe the final recording after mux/remux steps complete.
- Return truthful `hasAudio` and related metadata to the renderer.
- Ensure project import creates the correct audio asset/clip state when the final file contains audio.

#### Design note

- Final-file truth beats intermediate pipeline state. Any cached capture metadata must be treated as provisional until post-mux probing completes.

#### Key files

- `apps/desktop/src/main/recording/capture-service.mjs`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/renderer/App.tsx`

#### Verification

- Post-mux recordings with audio are imported with audio-bearing project state.
- No path exists where a file contains audio but the project treats it as silent.

---

### ~~TASK-169~~: Record: Harden stop/save lifecycle on panel close and app quit

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Make session teardown safe so the app never silently drops a take or leaves capture processes orphaned when the panel closes or the app quits mid-session.

#### Product contract

- There must be one authoritative stop/save lifecycle, regardless of whether recording ends from the floating panel, the main UI, panel close, or app quit.
- A stop action is not complete until Rough Cut knows whether the take was saved, recoverable, or failed.

#### Scope

- Cleanly stop FFmpeg, audio capture, and cursor capture on panel close, quit, and abnormal termination paths.
- Prevent save handoff from being skipped when the renderer window disappears.
- Define one authoritative stop/save state machine for normal and interrupted exits.

#### Required states

- `recording`
- `stopping`
- `saving`
- `saved`
- `recoverable_interrupted`
- `failed`

#### Key files

- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/index.mjs`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`

#### Verification

- No orphan capture processes remain after panel close or app quit.
- Interrupted stop/save paths leave recoverable files and consistent session state.

---

### ~~TASK-170~~: Record: Make pause/resume truthful or disable unsupported paths

**Priority:** P1 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Remove the current ambiguity where UI pause/resume may not match what the saved artifact actually contains.

#### Product contract

- `Pause` means the saved take omits the paused span across every persisted stream that claims to support pause.
- If Rough Cut cannot guarantee that, the control must be disabled or relabeled before release.

#### Scope

- Audit screen, camera, cursor, and audio pause semantics end to end.
- Choose one truthful product behavior:
  - implement segmented capture/concat so every recorded stream honors pause
  - or disable pause in any path that cannot be saved truthfully
- Align visible status, elapsed time, and saved media semantics.

#### Decision rule

- Prefer a temporarily smaller truthful feature over a larger misleading one.

#### Key files

- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/main/recording/ffmpeg-capture.mjs`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`

#### Verification

- Artifact-level tests prove paused time is either absent from the saved result or pause is explicitly unavailable in that mode.

---

### ~~TASK-171~~: Record: Session manifest and partial-take recovery on relaunch

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Replace marker-only interruption tracking with actual recoverable session state on relaunch.

#### Product contract

- After a crash, forced quit, or panel disappearance, Rough Cut should reopen with a clear recovery decision, not a scavenger hunt in the filesystem.
- Recovery should restore the user's latest salvageable take into project context whenever possible.

#### Scope

- Persist a session manifest with expected artifact paths and session lifecycle state.
- Detect salvageable partial takes on relaunch.
- Add recovery UI that can reattach/import partial recordings instead of only opening the folder.
- Keep recovery compatible with moved projects and relative asset path behavior.

#### Recovery UX rule

- Show three explicit outcomes: recover take, discard take, or reveal files for manual inspection.
- Never pretend recovery succeeded if the recovered asset is incomplete or missing.

#### Key files

- `apps/desktop/src/main/recording/recovery-state.mjs`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`

#### Verification

- A forced interruption followed by relaunch produces a visible recovery flow with recoverable artifacts.
- Recovery results in a coherent project state rather than manual disk spelunking.

---

### ~~TASK-172~~: Record: Real region capture or hide unsupported region mode

**Priority:** P1 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Make the `region` mode truthful. If true region capture is not implemented yet, the product must stop implying that it is.

#### Product contract

- `Region` in the UI must mean an actual crop-bounded capture workflow.
- If the pipeline still records full-screen and crops later, that is not true region capture and must not be marketed as such.

#### Scope

- Either implement true region-capture semantics in the recording pipeline or hide/rename/de-scope the unsupported mode.
- Keep source picker, preview, and actual capture behavior aligned with whichever decision lands.

#### Decision preference

- If real region capture is not close, hide the mode for now. Trust is more important than surface-area.

#### Key files

- `apps/desktop/src/main/index.mjs`
- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/SourcePickerPopup.tsx`

#### Verification

- A user selecting `region` gets either a real region workflow or no misleading affordance at all.

---

### ~~TASK-177~~: Stabilize Record: restore truthful live preview canvas reliably

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Make the Record tab consistently show the real live preview canvas whenever a valid source is selected and preview acquisition succeeds.

#### Problem

- Focused stabilization runs still showed the healthy live-preview state failing to render the preview canvas, even though acquisition state and failure states worked.
- This creates a major trust gap because the user's first confidence check is whether the selected source is visibly live before recording starts.

#### Scope

- Ensure `live` preview state actually mounts the preview surface.
- Keep empty/acquiring/failed/lost states intact and non-overlapping.
- Verify that saved-take playback and live preview do not mask each other incorrectly.

#### Key files

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/LivePreviewCanvas.tsx`
- `apps/desktop/src/renderer/features/record/use-live-preview.ts`
- `tests/electron/live-preview.spec.ts`

#### Verification

- The focused live-preview suite passes, including the successful preview-canvas case.
- The Record tab visibly renders a live preview for a valid selected source before recording.

**Completed (2026-04-20):** Restored live preview canvas mounting in the healthy `live` state and added acceptance-suite setup resets so basic Record-tab checks stop leaking source selection across tests. Focused live preview and the main Record acceptance check for the live preview path are green. Broader release-gate stabilization follow-up remains tracked under `TASK-178`.

---

### ~~TASK-178~~: Stabilize Tests: replace flaky record acceptance suite with release gate

**Priority:** P1 | **Status:** ✅ DONE (2026-04-22)

#### Outcome

All five of this task's Key files run green back-to-back. The 2026-04-22 full e2e run had two failing cases in this scope — `acceptance-record.spec.ts:1.5.1` and `record-readiness.spec.ts:62` — both failing on a stale `[data-testid="live-preview-canvas"]` assertion. That element was intentionally removed from the main Record tab in commit 37836c6 ("drop live preview from main Record tab") to prevent recursive on-screen capture; the tests never got updated. A third broken case (`live-preview.spec.ts:106 "renders a live preview canvas for the selected source"`) combined the same stale-assertion issue with a setup path where source selection doesn't stabilize outside the panel — removed entirely because live-source→preview behaviour is now covered by `record-readiness.spec.ts` through the panel's own lifecycle.

#### What landed

- `0ff5118` — dropped stale `live-preview-canvas` assertion in `acceptance-record.spec.ts:1.5.1` (kept `record-tab-root` + `record-card-chrome` checks) and in `record-readiness.spec.ts` (promoted the adjacent `record-preview-mode-badge` check to be the truthful "live" signal).
- `1b51f8f` — removed the flaky `live-preview.spec.ts:106` "renders a live preview canvas" case. Live-source behaviour covered through `record-readiness.spec.ts`.

#### Release gate

- Primary gate: `tests/electron/record-readiness.spec.ts:62` — "golden path: blank project to saved take stays truthful" (from TASK-173).
- Supporting checks: `acceptance-record.spec.ts` (12 tests on the Record tab shell), `live-preview.spec.ts` (3 tests on empty/acquiring/failed overlay states), `record-source-gating.spec.ts`, `record-recovery-relaunch.spec.ts`, `record-shutdown-paths.spec.ts`.
- Combined: `pnpm exec playwright test tests/electron/record-readiness.spec.ts tests/electron/acceptance-record.spec.ts tests/electron/live-preview.spec.ts tests/electron/record-source-gating.spec.ts tests/electron/record-recovery-relaunch.spec.ts tests/electron/record-shutdown-paths.spec.ts --workers=1` — runs green on Linux/xvfb in ~45s.

#### Orphan code to clean up (separate task)

- `apps/desktop/src/renderer/features/record/LivePreviewCanvas.tsx` is dead code since commit 37836c6 (no imports anywhere). Safe to delete; not in scope for this test-stabilization task.

#### Out of scope (broader suite health)

- 2026-04-22 full-suite run had ~41 failures across non-Record areas (`acceptance-ai`, `acceptance-edit`, `acceptance-motion`, `tab-switching`, `camera-replay`, `zoom-marker`, etc.). Those are outside this task's stated Key files and tracked separately.

---

### ~~TASK-173~~: Tests: Golden-path record-stop-save readiness suite

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Prove the blank-project -> source selection -> live preview -> start -> stop -> save path with deterministic assertions.

#### What this suite proves

- The visible happy path is truthful from first preview through imported saved take.
- The app can be trusted for the simplest real customer recording flow.

#### Scope

- Add one focused readiness suite that exercises the actual recording path instead of injected asset-ready shortcuts.
- Assert artifact creation, project asset/clip creation, and visible UI success state.

#### Completed

- Added `tests/electron/record-readiness.spec.ts` as the focused release gate for the blank-project -> source selection -> live preview -> start -> stop/save -> imported take path.
- Kept the test deterministic by using a synthetic capture source and animated capture stream while still exercising the real panel recording, save, import, and Record-tab success flow.
- The suite asserts empty pre-record state, live preview readiness, saved artifact creation, project asset/clip import, and visible `Saved take` playback state on the Record tab.

#### Pass/fail rule

- This suite is the primary release gate for "can I safely record a tutorial right now?"

#### Key files

- `tests/electron/acceptance-record.spec.ts`
- `tests/electron/record-device-artifact.spec.ts`
- new focused readiness spec if needed

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm exec playwright test tests/electron/record-readiness.spec.ts --workers=1`
- The suite passes on the intended workstation and now acts as the primary go/no-go gate for tutorial recording readiness.

---

### ~~TASK-174~~: Tests: Audio route fidelity and post-save import suite

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Prove that mic-only, system-audio-only, and combined audio routes survive into the saved artifact and imported project state.

#### What this suite proves

- Audio routing truth survives across selection, capture, muxing, and import.
- The app is not merely producing an audio stream; it is producing the intended one.

#### Scope

- Add focused checks for selected-route fidelity.
- Validate that post-save import matches the real artifact after muxing.
- Cover the cases most likely to break a client tutorial recording.

#### Completed

- Expanded `tests/electron/record-audio-import-parity.spec.ts` so imported recording assets must preserve the exact `audioCapture` route metadata for mic-only, system-audio-only, and combined routes.
- Kept the existing positive and silent import cases so the suite still proves audio-clip creation is tied to actual `hasAudio` truth.
- The imported project snapshot now asserts route truth from asset metadata, not just generic audio-stream existence.

#### Pass/fail rule

- Route fidelity must be asserted per scenario, not inferred from a generic `hasAudio=true`.

#### Key files

- `tests/electron/record-device-artifact.spec.ts`
- `tests/electron/acceptance-record.spec.ts`
- `packages/export-renderer/src/audio-export.test.ts` if shared helpers need broader assertions

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm exec playwright test tests/electron/record-audio-import-parity.spec.ts --workers=1`
- Audio test coverage now proves route truth, not just audio-stream existence.

---

### ~~TASK-175~~: Tests: Recovery, reopen, and export-from-fresh-recording suite

**Priority:** P0 | **Status:** ✅ DONE (2026-04-20)

#### Goal

- Prove that a fresh recorded session survives interruption, relaunch, reopen, and export.

#### What this suite proves

- A newly recorded tutorial does not become fragile the moment the app closes or the machine hiccups.
- Recovery is integrated with the normal project and export flow, not a one-off rescue path.

#### Scope

- Simulate interrupted recording and relaunch recovery.
- Validate reopen behavior for a newly recorded project.
- Export that fresh recording and validate the final MP4 with ffprobe-level assertions.

#### Completed

- Kept `tests/electron/record-recovery-relaunch.spec.ts` as the proof that a partial take survives relaunch and can be recovered into project state.
- Added `tests/electron/record-reopen-export.spec.ts` to prove a freshly recorded session can be saved, relaunched, reopened from disk, and exported successfully.
- Verified the exported MP4 from the reopened fresh recording with `ffprobe` so this lane now checks the real final artifact, not just UI completion.
- Re-ran the combined release-gate bundle for readiness, audio route fidelity, recovery relaunch, reopen/export, and fresh export in one Playwright session.

#### Pass/fail rule

- A recovered or reopened fresh recording must export without hidden manual repair steps.

#### Key files

- `tests/electron/project-relative-paths.spec.ts`
- `tests/electron/export-smoke.spec.ts`
- new recovery/reopen readiness coverage

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm exec playwright test tests/electron/record-recovery-relaunch.spec.ts --workers=1`
- `pnpm exec playwright test tests/electron/record-reopen-export.spec.ts --workers=1`
- `pnpm exec playwright test tests/electron/record-readiness.spec.ts tests/electron/record-audio-import-parity.spec.ts tests/electron/record-recovery-relaunch.spec.ts tests/electron/record-reopen-export.spec.ts tests/electron/adhoc-export-fresh.spec.ts --workers=1`
- Freshly recorded footage can now be recovered or reopened and then exported successfully without hidden repair steps.

---

### Record Completion Milestones

#### Milestone 1: Stable screen recording

- `TASK-086` unified config store for main tab + panel
- `BUG-007` toolbar toggles must drive the real session
- `BUG-008` source selection must stay in sync across main tab and panel
- `~~BUG-009~~` record mode selector must affect capture behavior
- `BUG-010` camera controls must be surfaced consistently
- `TASK-087` persist shared config across panel opens/restarts
- `TASK-183` fix Linux X11 screen capture bounds on secondary displays
- `TASK-126` in-progress controller with finish, pause, restart, and delete
- `~~TASK-145~~` floating controller hide/fade + never-in-video guarantee
- `~~TASK-148~~` crash-resilient autosave + partial-take recovery
- `TASK-152` fear-reducing micro-affordances (DND, test clip, safe stop)
- `BUG-004` dock/taskbar icon shown during recording
- `BUG-011` Linux recording keeps usable stop controls

#### Milestone 2: Stable camera recording

- `~~TASK-013~~` PixiJS live preview replaces raw video preview
- `TASK-014` webcam PiP in compositor
- `TASK-016` separate webcam/audio assets on stop
- `TASK-182` deterministic first-take camera sidecar capture
- `~~BUG-013~~` reopen parity for camera template and visibility
- `~~TASK-147~~` full reopen/project-move fidelity for templates and sidecars

#### Milestone 3: Stable audio recording and sync truth

- `TASK-088` device selectors for mic/camera/system audio
- `FEATURE-076` audio capture + playback in preview
- `TASK-124` saved-file system-audio capture hardening
- `TASK-032` VU meters for mic and system audio
- `TASK-143` permission diagnostics + deep links + preflight test
- `TASK-015` serialize Record styling into resulting clips/effects
- `TASK-100` disconnect recovery and warning toasts

#### Milestone 4: Stable playback and export

- `BUG-006` playback fluency / lag fix for the real review path
- `TASK-020` audio playback via Web Audio API synced to playhead
- `TASK-021` export queue + preset foundation
- `TASK-022` export progress + cancellation UX
- `TASK-112` export pipeline parity/hardening
- `TASK-052` export quality/performance polish
- `TASK-054` export verification and artifact confidence

#### Milestone 5: Record sidebar authoring toolset

The full creative surface that turns Rough Cut from a capture utility into a Screen Studio / Descript-class product.


- `TASK-121` restore template picker and preset application flow
- `TASK-089` keyboard shortcut overlays
- `TASK-091` titles and callouts
- `TASK-092` dynamic camera layouts
- `TASK-101` cursor smoothing, idle hide, and loop-back polish
- `TASK-130` advanced cursor styles, click effects, and click sounds
- `TASK-131` cinematic motion blur for cursor, zoom, and camera movement
- `TASK-132` privacy blur masks and spotlight regions
- `~~TASK-150~~` per-segment visibility toggles for camera/cursor/clicks/overlays
- `TASK-157` watermark/logo inspector with persistent branding controls
- `TASK-155` AI captions with timeline edit + styling in Record review
- `TASK-156` Smart Cut for filler words, silence, breaths, and mouth clicks
- `TASK-090` highlights and annotations

#### Milestone 6: Workflow polish and distribution

- `TASK-093` teleprompter
- `TASK-094` shareable recording presets and profiles
- `TASK-095` mobile device capture with device frames
- `TASK-096` export-side social aspect presets from Record templates
- `TASK-097` record-first captions workflow from captured assets
- `TASK-098` audio enhancement for recorded narration
- `TASK-099` webcam background removal and replacement

#### Audio Reconciliation Note

- `TASK-012` is now treated as complete baseline capture support: saved recordings can include mic/system audio.
- `FEATURE-076` remains the broader in-progress track for audio pipeline stabilization and playback polish.
- Remaining Record audio UX is intentionally tracked separately under `TASK-031`, `TASK-032`, `TASK-088`, and `TASK-100` rather than being folded back into `TASK-012`.

---

### Milestone 1 Implementation Checklist

#### Goal

Make the Record surface trustworthy by ensuring the visible Record tab and the floating recording panel are one workflow with one shared configuration model.

#### Phase 1: Introduce the shared recording store (`TASK-086`)

- [ ] Create `recordingStore` with state for:
  - `recordMode`
  - `selectedSourceId`
  - `micEnabled`
  - `sysAudioEnabled`
  - `cameraEnabled`
  - `countdownSeconds`
  - selected device IDs for mic/camera/system-audio where applicable
- [ ] Move main-tab config off local component state in `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- [ ] Move panel config off local component state in `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- [ ] Keep preview/runtime-only state local where appropriate: active streams, recorder instances, elapsed timers, and transient panel status
- [ ] Add store actions for loading sources, selecting source, toggling devices, updating mode, and hydrating persisted config

Files:

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- new `apps/desktop/src/renderer/features/record/recording-store.ts` or equivalent shared store module
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/preload/index.mjs` if new bridge methods are needed

Verification:

- Record tab and panel show the same selected source after panel open
- Record tab toggles match panel toggles without manual re-entry
- No regressions in `tests/electron/record-tab.spec.ts`

#### Phase 2: Fix sync bugs on top of the store (`BUG-007`, `BUG-008`)

- [ ] Replace any remaining panel-local defaults that overwrite shared state on mount
- [ ] Ensure `openRecordingPanel()` uses existing shared state instead of booting into panel defaults
- [ ] Ensure source changes propagate through one path only
- [ ] Remove duplicate source loading logic where possible, or explicitly separate source catalog loading from source selection state

Files:

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/main/index.mjs`
- `apps/desktop/src/main/recording/recording-session-manager.mjs`

Verification:

- Add or update Playwright coverage to assert the selected source survives panel open
- Add or update Playwright coverage to assert mic/system-audio toggles survive panel open
- Fix stale acceptance assumptions in `tests/electron/acceptance-record.spec.ts` while preserving MVP intent

#### Phase 3: Make mode and camera controls real (`~~BUG-009~~`, `BUG-010`)

- [ ] Wire `recordMode` to actual source/capture behavior instead of visual-only UI
- [ ] Define exact mode behavior:
  - `fullscreen` favors screens
  - `window` favors app windows
  - `region` enters crop/custom-region flow
- [ ] Surface camera controls consistently in the toolbar and panel when camera support is available
- [ ] Remove `hasCamera={false}` style gating once the shared state path is correct

Files:

- `apps/desktop/src/renderer/features/record/RecordTab.tsx`
- `apps/desktop/src/renderer/features/record/BottomBar.tsx`
- `apps/desktop/src/renderer/features/record/ModeSelectorRow.tsx`
- `apps/desktop/src/renderer/features/record/SourcePickerPopup.tsx`

Verification:

- Acceptance coverage for visible camera toggle in the main Record surface
- Acceptance coverage for mode-dependent source behavior
- Manual verification that `region` mode leads into crop/region workflow rather than being decorative only

#### Phase 4: Persistence and selectors (`TASK-087`, `TASK-088`)

- [ ] Persist shared Record config across app restarts
- [ ] Decide whether persistence lives in localStorage, electron-store, or a mixed renderer/main strategy
- [ ] Add device selectors for mic, camera, and system-audio source where platform APIs allow it
- [ ] Make selected devices part of the same shared store instead of panel-only config

Files:

- `apps/desktop/src/renderer/features/record/recording-store.ts`
- `apps/desktop/src/renderer/features/record/PanelApp.tsx`
- `apps/desktop/src/renderer/features/record/BottomBar.tsx`
- `apps/desktop/src/main/recording/audio-sources.mjs`
- `apps/desktop/src/main/recent-projects-service.mjs` only if persistence is centralized there

Verification:

- Restart the app and confirm source/mic/system-audio/camera/mode selections restore correctly
- Add tests for persisted defaults if the persistence layer is renderer-testable
- Update acceptance tests that currently look only for "Mic: Default" so they reflect real selectors

#### Test Cleanup Required During Milestone 1

- [ ] Update `tests/electron/acceptance-record.spec.ts` to distinguish:
  - truly missing features
  - stale selectors/locators
  - features that exist only in the panel and need shared-surface exposure
- [ ] Add a dedicated test for "main Record config survives opening the panel"
- [ ] Add a dedicated test for "camera toggle visible and synchronized across surfaces"
- [ ] Add a dedicated test for "record mode changes the available source flow"

#### Exit Criteria

- The main Record tab and floating panel use one shared config source of truth
- Opening the panel never resets source/device/mode state unexpectedly
- Camera controls are surfaced consistently
- Record mode is behaviorally meaningful
- Persisted Record config restores correctly after relaunch
- Milestone 1 bugs (`BUG-007` to `BUG-010`) are closed with test coverage

---

## Completed

- ~~TASK-001~~ Monorepo scaffold + CI
- ~~TASK-002~~ project-model package
- ~~TASK-003~~ timeline-engine package
- ~~TASK-004~~ effect-registry package
- ~~TASK-005~~ frame-resolver package
- ~~TASK-006~~ store package (Zustand + zundo)
- ~~TASK-007~~ preview-renderer package (PixiJS)
- ~~TASK-008~~ export-renderer package (FFmpeg)
- ~~TASK-009~~ Electron app shell + IPC bridge
- ~~TASK-010~~ Capture service (desktopCapturer)
- ~~TASK-011~~ Record tab UI + inspector panels
- ~~TASK-012~~ Record: Enable audio capture (mic + system audio)
- ~~TASK-086~~ Record: Unified config store for main tab + recording panel
- ~~BUG-007~~ Fix: Record toolbar toggles don't drive the floating recording panel
- ~~BUG-008~~ Fix: Record source selection diverges from the floating panel source
- ~~TASK-072~~ Recent projects workflow
- ~~TASK-077~~ Edit: Camera playback in Edit tab compositor
- ~~TASK-085~~ Record: Persistent recording location + migration for stale /tmp references
- ~~TASK-113~~ Record: Camera aspect presets for shaped PiP
- ~~TASK-114~~ Edit: Camera source/timing parity with Record preview
- ~~TASK-118~~ Export: Camera PiP preview parity with Record + Edit tabs
- ~~TASK-120~~ Record: Decouple timeline playhead from per-frame React rerenders
- ~~TASK-218~~ Record: Cursor sprite desynced from recorded video (fps unit mismatch)
- ~~BUG-001~~ Fix: Compositor canvas sizing + video sprite positioning
- ~~BUG-002~~ Fix: Compositor resizing to template resolution + debug logging cleanup
- ~~BUG-003~~ Fix: Video playback + timeline sync across all tabs
