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

For each surface, land the infrastructure that makes the view reliable first, then finish the edge features that make the view genuinely usable, then move to the next surface.

### Delivery spine

1. **Projects view** -- stable enough for now. Treat as the entry surface that anchors project creation, opening, and recovery.
2. **Recording view** -- highest priority active surface. Finish the capture/compositor/config/device backbone first, then complete record-time overlays and quality-of-life features.
3. **Export view** -- second priority. Finish the full Screen Studio loop so a user can record and ship a result without depending on Edit.
4. **Edit view** -- third priority. Once record -> export is solid, deepen timeline manipulation, audio, and effect authoring.
5. **AI view** -- fourth priority. Build the ingest/library/transcription/rough-cut workflow after the manual flow is complete.
6. **Motion view** -- fifth priority. Build the dedicated motion authoring surface after the core recording/export/edit loop and AI ingest path are in place.

### Surface order and focus

| Order | Surface   | Goal                                                       | Primary task focus                                                                                                             |
| ----- | --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Projects  | Stable project entry, reopen, and persistence foundation   | ~~TASK-072~~, TASK-071, ~~TASK-085~~                                                                                           |
| 2     | Recording | Reliable capture pipeline with polished in-record controls | TASK-013, TASK-014, TASK-015, TASK-016, TASK-086, BUG-007, BUG-008, TASK-087, TASK-088, TASK-089, TASK-090, TASK-091, TASK-092 |
| 3     | Export    | Complete output flow for recorded projects                 | TASK-021, TASK-022, TASK-028, TASK-029, TASK-112, TASK-067, TASK-052, TASK-054                                                 |
| 4     | Edit      | Deep timeline editing and refinement                       | TASK-017, TASK-018, TASK-019, TASK-020, TASK-023, TASK-024, TASK-026, TASK-027, TASK-065                                       |
| 5     | AI        | Library ingest, analysis, and rough-cut generation         | TASK-040, TASK-079, TASK-080, TASK-081, TASK-082, TASK-044, TASK-045, TASK-047, TASK-097                                       |
| 6     | Motion    | Dedicated motion graphics authoring                        | TASK-033, TASK-034, TASK-035, TASK-036, TASK-037, TASK-038, TASK-039                                                           |

### Current sprint framing

1. **Sprint A -- Recording Infrastructure**: TASK-013, TASK-086, BUG-007, BUG-008, TASK-087, TASK-088, BUG-009, TASK-100
2. **Sprint B -- Recording Edge Features**: TASK-014, TASK-015, TASK-016, TASK-089, TASK-090, TASK-091, TASK-092, TASK-101
3. **Sprint C -- Export Core Flow**: TASK-021, TASK-022, TASK-028, TASK-029, TASK-112, TASK-067
4. **Sprint D -- Export Performance + Advanced Output**: TASK-050, TASK-051, TASK-052, TASK-054, TASK-096, TASK-108
5. **Sprint E -- Edit Core Authoring**: TASK-017, TASK-018, TASK-019, TASK-020, TASK-023, TASK-024
6. **Sprint F -- Edit Depth + Polish**: TASK-026, TASK-027, TASK-063, TASK-064, TASK-065, TASK-066
7. **Sprint G -- AI Foundations + Workflow**: TASK-040, TASK-079, TASK-080, TASK-081, TASK-082, TASK-044, TASK-045, TASK-047, TASK-083, TASK-097
8. **Sprint H -- Motion Surface**: TASK-033, TASK-034, TASK-035, TASK-036, TASK-037, TASK-038, TASK-039

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
| TASK-071     | Project save/load with relative paths                                       | P1       | TODO                     | TASK-105     |
| ~~TASK-072~~ | ~~Recent projects workflow~~                                                | P2       | ✅ **DONE** (2026-03-30) | TASK-071     |
| ~~TASK-085~~ | Record: Persistent recording location + migration for stale /tmp references | P1       | ✅ DONE (2026-04-15)     | TASK-071     |

### Recording Infrastructure

| ID           | Title                                                                    | Priority | Status                   | Dependencies       |
| ------------ | ------------------------------------------------------------------------ | -------- | ------------------------ | ------------------ |
| ~~TASK-012~~ | ~~Record: Enable audio capture (mic + system audio)~~                    | P0       | ✅ **DONE** (2026-04-11) | TASK-010           |
| TASK-013     | Record: PixiJS live preview (replace `<video>` with compositor)          | P0       | TODO                     | TASK-007, TASK-011 |
| ~~BUG-001~~  | Fix: Compositor canvas sizing + video sprite positioning                 | P0       | DONE                     | TASK-007           |
| ~~BUG-002~~  | Fix: Compositor resizing to template resolution + debug logging cleanup  | P0       | ✅ **DONE** (2026-03-30) | BUG-001            |
| ~~BUG-003~~  | Fix: Video playback + timeline sync across all tabs                      | P0       | ✅ **DONE** (2026-03-30) | BUG-002            |
| TASK-086     | Record: Unified config store for main tab + recording panel              | P0       | TODO                     | TASK-010, TASK-011 |
| BUG-007      | Fix: Record toolbar toggles don't drive the floating recording panel     | P0       | TODO                     | TASK-086           |
| BUG-008      | Fix: Record source selection diverges from the floating panel source     | P0       | TODO                     | TASK-086           |
| TASK-087     | Record: Persist config across panel opens and app restarts               | P1       | TODO                     | TASK-086           |
| TASK-088     | Record: Device selectors for mic, camera, and system audio               | P1       | TODO                     | TASK-086, TASK-012 |
| BUG-009      | Fix: Record mode selector is visual-only and does not affect capture     | P1       | TODO                     | TASK-086           |
| ~~BUG-010~~  | ~~Fix: Camera controls hidden in Record toolbar despite camera support~~ | P1       | ✅ **DONE** (2026-04-16) | TASK-086           |
| ~~TASK-113~~ | Record: Camera aspect presets for shaped PiP                             | P1       | ✅ **DONE** (2026-04-15) | TASK-011           |
| FEATURE-076  | Record: Audio capture + playback (FFmpeg pipeline + compositor unmute)   | P1       | IN PROGRESS              | TASK-020           |
| BUG-004      | No icon shown in dock/taskbar during recording — blank space             | P2       | PLANNED                  | TASK-010           |
| TASK-030     | Record: Countdown timer (0/3/5/10s configurable)                         | P2       | TODO                     | TASK-011           |
| TASK-031     | Record: Pause/resume recording (MediaRecorder pause)                     | P2       | TODO                     | TASK-012           |
| TASK-032     | Record: VU meters for mic and system audio                               | P2       | TODO                     | TASK-012           |
| TASK-093     | Record: Teleprompter for scripted recording                              | P2       | TODO                     | TASK-086           |
| TASK-094     | Record: Shareable recording presets and profiles                         | P2       | TODO                     | TASK-086           |
| TASK-095     | Record: Mobile device capture with device frames                         | P2       | TODO                     | TASK-010           |

### Recording Edge Features

| ID       | Title                                                                               | Priority | Status | Dependencies       |
| -------- | ----------------------------------------------------------------------------------- | -------- | ------ | ------------------ |
| TASK-014 | Record: Webcam PiP (render in compositor with shape/position)                       | P0       | TODO   | TASK-013           |
| TASK-015 | Record: Serialize recording effects to clips (bg, corners, shadow → Effect entries) | P0       | TODO   | TASK-011           |
| TASK-016 | Record: Create separate Assets for webcam + audio on stop                           | P0       | TODO   | TASK-012, TASK-014 |
| BUG-005  | Camera PiP renders as ellipse instead of circle (CSS/template shape not applied)    | P1       | TODO   | TASK-014           |
| TASK-089 | Record: Keyboard shortcut capture + on-video overlays                               | P1       | TODO   | TASK-015           |
| TASK-090 | Record: Highlights and annotations overlay system                                   | P1       | TODO   | TASK-015           |
| TASK-091 | Record: Titles and callouts overlay system                                          | P1       | TODO   | TASK-015, TASK-107 |
| TASK-092 | Record: Dynamic camera layout changes within one recording                          | P1       | TODO   | TASK-014, TASK-015 |
| TASK-101 | Record: Cursor smoothing, idle hide, and loop-back polish                           | P2       | TODO   | TASK-015, TASK-075 |

### Export Core

| ID           | Title                                                                 | Priority | Status               | Dependencies       |
| ------------ | --------------------------------------------------------------------- | -------- | -------------------- | ------------------ |
| TASK-118     | Export: Camera PiP preview parity with Record + Edit tabs             | P1       | ✅ DONE (2026-04-15) | TASK-114           |
| ~~TASK-021~~ | Export: Progress bar + frame counter (wire existing IPC events to UI) | P1       | ✅ DONE (2026-04-16) | TASK-008           |
| ~~TASK-022~~ | Export: Output path selector (native save dialog)                     | P1       | ✅ DONE (2026-04-16) | TASK-009           |
| TASK-028     | Export: Audio mixing in export pipeline                               | P1       | TODO                 | TASK-008, TASK-020 |
| TASK-029     | Export: Quality presets + editable settings (resolution, FPS, CRF)    | P2       | TODO                 | TASK-021           |
| TASK-067     | Preview + export parity test (visual regression)                      | P2       | TODO                 | TASK-007, TASK-008 |
| ~~TASK-109~~ | Export: Cancel button during export                                   | P2       | ✅ DONE (2026-04-16) | TASK-021           |
| ~~TASK-110~~ | Export: Error display for failed exports                              | P2       | ✅ DONE (2026-04-16) | TASK-021           |
| ~~TASK-111~~ | Export: "Open File"/"Open Folder" links after completion              | P3       | ✅ DONE (2026-04-16) | TASK-021           |
| TASK-112     | Export: File size + time estimates                                    | P3       | TODO                 | TASK-029           |

### Export Advanced

| ID           | Title                                                                                                      | Priority | Status                   | Dependencies       |
| ------------ | ---------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ------------------ |
| TASK-050     | Preview: Switch to PixiJS VideoSource (WebGL textures, drop Canvas2D drawImage)                            | P0       | TODO                     | TASK-007           |
| TASK-051     | Preview: Work around WebGL gradient shader crash (solid rects or pre-rendered canvas bg)                   | P0       | TODO                     | TASK-050           |
| TASK-052     | Export: WebCodecs pipeline — web-demuxer + VideoDecoder + PixiJS offscreen + VideoEncoder + mediabunny MP4 | P0       | TODO                     | TASK-050           |
| ~~TASK-053~~ | ✅ Export: Frame-accurate scrubbing via mediabunny VideoSampleSink.getSample()                             | P1       | ✅ **DONE** (2026-04-16) | TASK-052           |
| TASK-054     | Export: NVENC hardware encoding via VideoEncoder hardwareAcceleration: prefer-hardware                     | P1       | TODO                     | TASK-052           |
| BUG-006      | Playback laggy — Canvas2D drawImage bottleneck, needs WebGL VideoSource path                               | P0       | TODO                     | TASK-050           |
| TASK-075     | Preview: Playback fluency — rVFC sync, consolidate loops, cache effects                                    | P0       | IN PROGRESS              | TASK-007           |
| TASK-096     | Export: Social aspect presets derived from Record templates                                                | P2       | TODO                     | TASK-015, TASK-029 |
| TASK-108     | Export: Job queue (multi-job sequential processing)                                                        | P3       | TODO                     | TASK-021           |

### Edit Core

| ID           | Title                                                                    | Priority | Status               | Dependencies                 |
| ------------ | ------------------------------------------------------------------------ | -------- | -------------------- | ---------------------------- |
| TASK-017     | Edit: Clip drag-to-move (horizontal repositioning with snap)             | P1       | TODO                 | TASK-003                     |
| TASK-018     | Edit: Cross-track clip dragging (V1↔V2)                                  | P1       | TODO                 | TASK-017                     |
| TASK-019     | Edit: Effects stack UI (Add Effect, expandable sections, param controls) | P1       | TODO                 | TASK-004                     |
| TASK-020     | Edit: Audio playback via Web Audio API synced to playhead                | P1       | TODO                 | TASK-007                     |
| ~~TASK-077~~ | Edit: Camera playback in Edit tab compositor                             | P1       | ✅ DONE (2026-04-14) | TASK-075                     |
| ~~TASK-114~~ | Edit: Camera source/timing parity with Record preview                    | P1       | ✅ DONE (2026-04-15) | TASK-075, TASK-077           |
| ~~TASK-119~~ | Record/Edit: Persist layout template for camera preview parity           | P1       | ✅ DONE (2026-04-15) | TASK-077, TASK-113           |
| ~~TASK-115~~ | Edit: Camera layout/visibility parity with Record preview                | P1       | ✅ DONE (2026-04-16) | TASK-114, TASK-119           |
| ~~TASK-116~~ | Tests: Record/Edit camera parity regression coverage                     | P1       | ✅ DONE (2026-04-16) | TASK-114, TASK-115, TASK-119 |
| TASK-023     | Edit: Keyframe editor (timeline markers + inspector controls)            | P1       | TODO                 | TASK-019                     |
| TASK-024     | Edit: Transitions (crossfade rendering in preview + export)              | P1       | TODO                 | TASK-005, TASK-007           |
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

| ID          | Title                                                                                  | Priority | Status      | Dependencies       |
| ----------- | -------------------------------------------------------------------------------------- | -------- | ----------- | ------------------ |
| FEATURE-078 | AI: ButterCut-inspired library + rough cut generation (epic)                           | P1       | PLANNED     | TASK-040           |
| TASK-079    | AI: Library data model — footage + transcripts + visual analysis as first-class entity | P1       | IN PROGRESS | TASK-002           |
| TASK-080    | AI: WhisperX audio transcription pipeline (batch ingest, word-level timestamps)        | P1       | IN PROGRESS | TASK-040, TASK-079 |
| TASK-081    | AI: Visual frame analysis pipeline (sample frames, describe via vision LLM)            | P1       | PLANNED     | TASK-040, TASK-079 |
| TASK-082    | AI: Rough cut generator — LLM produces timeline from library + user prompt             | P1       | PLANNED     | TASK-080, TASK-081 |
| TASK-083    | Compliance: Third-party attribution (WhisperX BSD-4, FFmpeg LGPL) in About/credits     | P2       | PLANNED     | -                  |
| TASK-040    | AI: Create @rough-cut/ai-bridge package + AIProvider interface                         | P3       | TODO        | TASK-002           |
| TASK-041    | AI: AIAnnotation type in project-model                                                 | P3       | TODO        | TASK-002           |
| TASK-042    | AI: Auto-Captions — Whisper integration (local binary)                                 | P3       | TODO        | TASK-040           |
| TASK-043    | AI: Smart Zoom — cursor/mouse movement analysis                                        | P3       | TODO        | TASK-040           |
| TASK-044    | AI: Source selector UI (pick assets to analyze)                                        | P3       | TODO        | TASK-033           |
| TASK-045    | AI: Results panel with Accept/Reject/Edit per annotation                               | P3       | TODO        | TASK-041, TASK-044 |
| TASK-046    | AI: Preview player showing annotation context                                          | P3       | TODO        | TASK-045           |
| TASK-047    | AI: "Apply Accepted to Timeline" (captions → subtitle effects, zooms → keyframes)      | P3       | TODO        | TASK-045           |
| TASK-048    | AI: Background worker/utilityProcess for analysis                                      | P3       | TODO        | TASK-040           |
| TASK-049    | AI: Cloud provider option (API key config)                                             | P3       | TODO        | TASK-040           |
| TASK-073    | AI: Auto-Edit — transcription-based editing via AI (API-first)                         | P3       | TODO        | TASK-042, TASK-040 |
| TASK-074    | AI: Silence Removal — detect and cut silent segments automatically                     | P3       | TODO        | TASK-042, TASK-040 |
| TASK-097    | AI: Record-first captions workflow from captured assets                                | P2       | TODO        | TASK-080, TASK-044 |
| TASK-098    | AI: Audio enhancement for recorded narration                                           | P3       | TODO        | TASK-040           |
| TASK-099    | AI: Webcam background removal and replacement                                          | P3       | TODO        | TASK-040           |

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

| ID       | Title                                                              | Priority | Status | Dependencies       |
| -------- | ------------------------------------------------------------------ | -------- | ------ | ------------------ |
| TASK-061 | Record: Custom region selection overlay                            | P3       | TODO   | TASK-013           |
| TASK-062 | Record: Image backgrounds                                          | P3       | TODO   | TASK-011           |
| TASK-068 | Cross-platform testing (macOS, Windows)                            | P2       | TODO   | TASK-015           |
| TASK-069 | Performance profiling + optimization                               | P3       | TODO   | TASK-020           |
| TASK-070 | Accessibility basics (keyboard nav, screen reader)                 | P3       | TODO   | -                  |
| TASK-100 | Record: Disconnect recovery and warning toasts for dropped devices | P1       | TODO   | TASK-009, TASK-086 |
| TASK-102 | Toast notification system for errors/warnings                      | P2       | TODO   | TASK-009           |
| TASK-103 | Global keyboard shortcuts (Ctrl+S save, Ctrl+E export)             | P2       | TODO   | TASK-009           |
| TASK-104 | Recording config persistence to localStorage                       | P3       | TODO   | TASK-011           |
| TASK-105 | Relative asset paths for project portability                       | P2       | TODO   | TASK-009           |
| TASK-106 | Effect registry: add color-correction effect                       | P2       | TODO   | TASK-004           |
| TASK-107 | Effect registry: add subtitle/text effect                          | P2       | TODO   | TASK-004           |

---

## Active Work

### ~~TASK-072: Recent Projects Workflow~~

**Priority:** P2 | **Status:** ✅ DONE (2026-03-30)

Recent projects list with filtering, new/open project flows. IPC integration for project management between main and renderer. Fixed `setProject` to preserve `projectFilePath` so loaded projects maintain their save location.

---

### TASK-075: Preview: Playback fluency — rVFC sync, consolidate loops, cache effects

**Priority:** P0 | **Status:** IN PROGRESS (2026-04-14)

Improve playback smoothness by addressing identified bottlenecks in the rendering pipeline:

1. **requestVideoFrameCallback** — Replace rAF polling of `video.currentTime` with precise frame callbacks
2. **Consolidate rAF loops** — PlaybackManager should be sole timing authority; disable PixiJS ticker during playback
3. **Cache effect/filter state** — Only rebuild blur, round-corners, opacity filters when params actually change
4. **Skip redundant renders** — Don't re-render compositor when frame hasn't changed
5. **Reuse sprites** — Avoid destroying/recreating PixiJS sprites on layer set changes; update textures only

**Progress (2026-04-15):**

- `PlaybackManager` now starts Record playback only after seek-to-start settles, which removed stale-frame races when replaying or resuming the screen/compositor path.
- Record timeline transport drives playback through `PlaybackManager.togglePlay()` / `seekToFrame()` so replay, pause, and scrubbing use the real screen video clock.
- The `media://` handler now serves explicit byte-range responses, so Chromium treats recorded media as seekable and playback resumes from the visible playhead instead of jumping near frame 0.
- Camera playback stays under `PlaybackManager` ownership with clip-aware media-time resolvers, element-specific unregister guards, and `loadeddata` registration so camera resume/restart waits for a real decodable frame.
- Project swap flows (`Open`, `New`, `Projects`, `DEBUG: Reload Last`, and post-record project replacement) now pause playback first and `setProject()` clears stale `activeAssetId`, reducing cross-project camera/video leakage after reopen or restart.
- `tests/electron/camera-replay.spec.ts` now covers real saved-session replay behavior for both Record and Edit, and `tests/electron/playhead-start.spec.ts` locks the trimmed-playhead start case that regressed during this work.

**Key files:** `playback-manager.ts`, `preview-compositor.ts`, `use-compositor.ts`

---

### ~~TASK-118: Export: Camera PiP preview parity with Record + Edit tabs~~

**Priority:** P1 | **Status:** ✅ DONE (2026-04-15)

Export tab preview now renders the camera picture-in-picture overlay identically to the Record and Edit tabs. The fix adds `EditCameraOverlay` to the preview container in `ExportTab.tsx`, driven by the same `resolveFrame` + `asset.metadata.isCamera` lookup used in `EditTab`. Camera shape, size, position, shadow, inset, roundness and visibility settings from the recording's `presentation.camera` are all respected. No new APIs — pure reuse of existing overlay component.

**Key files:** `apps/desktop/src/renderer/features/export/ExportTab.tsx`

---

## Unified Delivery Sprints

Ordered by the desired product flow: infrastructure first, then edge features, one view at a time.

### Sprint A — Recording Infrastructure

| Task     | Title                                                       | Why now                                            |
| -------- | ----------------------------------------------------------- | -------------------------------------------------- |
| TASK-013 | Record: PixiJS live preview                                 | Capture surface must use the real compositor path  |
| TASK-086 | Record: Unified config store for main tab + recording panel | Single source of truth before more record features |
| BUG-007  | Fix toolbar toggles not driving floating panel              | Removes duplicated state drift                     |
| BUG-008  | Fix source selection divergence                             | Prevents wrong-capture regressions                 |
| TASK-087 | Persist record config across opens and restarts             | Makes recording workflow dependable                |
| TASK-088 | Device selectors for mic, camera, system audio              | Required for a production-ready record surface     |
| BUG-009  | Fix mode selector so it affects capture                     | Core correctness issue                             |
| TASK-100 | Disconnect recovery and warning toasts                      | Hardens real recording sessions                    |

### Sprint B — Recording Edge Features

| Task     | Title                                              | Why next                                      |
| -------- | -------------------------------------------------- | --------------------------------------------- |
| TASK-014 | Webcam PiP in compositor                           | Core Screen Studio expectation                |
| TASK-015 | Serialize recording effects to clips               | Needed for downstream Edit/Export fidelity    |
| TASK-016 | Separate webcam + audio assets on stop             | Makes recordings reusable across the pipeline |
| TASK-089 | Keyboard shortcut capture + overlays               | High-value record-time feature                |
| TASK-090 | Highlights and annotations overlay system          | High-value record-time feature                |
| TASK-091 | Titles and callouts overlay system                 | Finishes the record-time storytelling layer   |
| TASK-092 | Dynamic camera layout changes within one recording | Advanced but flow-defining record feature     |
| TASK-101 | Cursor smoothing, idle hide, and loop-back polish  | Record polish after backbone is stable        |

### Sprint C — Export Core Flow

| Task         | Title                                          | Why now                                       |
| ------------ | ---------------------------------------------- | --------------------------------------------- |
| ~~TASK-118~~ | Camera PiP preview parity in Export            | Already landed export fidelity foundation     |
| ~~TASK-021~~ | Progress bar + frame counter                   | Core export UX complete                       |
| ~~TASK-022~~ | Output path selector                           | Core export UX complete                       |
| ~~TASK-109~~ | Cancel button during export                    | Core export UX complete                       |
| ~~TASK-110~~ | Error display for failed exports               | Core export UX complete                       |
| ~~TASK-111~~ | Open File / Open Folder links                  | Core export UX complete                       |
| TASK-028     | Audio mixing in export pipeline                | Completes recorded project output             |
| TASK-029     | Quality presets + editable settings            | Required before users can trust export output |
| TASK-112     | File size + time estimates                     | Important finishing UX for export decisions   |
| TASK-067     | Preview + export parity visual regression test | Locks down the full record -> export loop     |

### Sprint D — Export Performance + Advanced Output

| Task         | Title                                               | Why next                                         |
| ------------ | --------------------------------------------------- | ------------------------------------------------ |
| TASK-050     | Preview: PixiJS VideoSource path                    | Needed for playback/export performance spine     |
| TASK-051     | Preview: Work around WebGL gradient shader crash    | Stabilizes the new render path                   |
| TASK-052     | Export: WebCodecs pipeline                          | Modern export backbone                           |
| ~~TASK-053~~ | Frame-accurate scrubbing via mediabunny             | Already landed groundwork for WebCodecs export   |
| TASK-054     | NVENC hardware encoding                             | Performance upgrade after baseline works         |
| TASK-096     | Social aspect presets derived from Record templates | Productized output presets                       |
| TASK-108     | Export job queue                                    | Batch workflow after core single export is solid |

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
| TASK-079 | Library data model                                  | Needed before ingest workflows                |
| TASK-080 | WhisperX transcription pipeline                     | Core AI ingest capability                     |
| TASK-081 | Visual frame analysis pipeline                      | Core AI ingest capability                     |
| TASK-082 | Rough cut generator                                 | Depends on transcript + vision metadata       |
| TASK-044 | Source selector UI                                  | First AI view interaction                     |
| TASK-045 | Results panel with Accept/Reject/Edit               | Review loop                                   |
| TASK-047 | Apply accepted AI output to timeline                | Connects AI back to core workflow             |
| TASK-083 | Compliance: third-party attribution                 | Required before shipping marketed AI features |
| TASK-097 | Record-first captions workflow from captured assets | Bridges Record into AI surface                |

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
- [ ] Add volume controls to playback UI

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
- [ ] **TASK-083** — Credits screen + README attribution for WhisperX; LGPL notice if/when FFmpeg is bundled in the installer.

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

### TASK-079: AI: Library data model — footage + transcripts + visual analysis as first-class entity

**Priority:** P1 | **Status:** IN PROGRESS (2026-04-15)

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

**Priority:** P1 | **Status:** IN PROGRESS (2026-04-15)

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

### TASK-086: Record: Unified config store for main tab + recording panel

**Priority:** P0 | **Status:** TODO

#### Problem

The visible Record tab and the floating recording panel currently own separate state for source selection, mic/system-audio toggles, camera enablement, and countdown/recording lifecycle. As a result, the main Record toolbar can drift from the panel that actually performs the capture, making the product feel unreliable even when the underlying capture code works.

#### Scope

- Create a dedicated recording config store that is independent from the project document but shared by both the main Record tab and the floating panel.
- Move source selection, record mode, mic/system-audio/camera enablement, selected devices, countdown duration, and last-used visual defaults into that store.
- Make panel open/close reuse the shared state instead of reinitializing from panel-local defaults.
- Ensure the store is the single source of truth for BUG-007, BUG-008, BUG-009, BUG-010, TASK-087, and TASK-088.

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

### TASK-090: Record: Highlights and annotations overlay system

**Priority:** P1 | **Status:** TODO

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

This closes one of the most obvious “coming soon” gaps in the Record tab and gives rough-cut a Record-native explanation layer without collapsing Edit and Record into the same surface.

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

**Priority:** P1 | **Status:** TODO

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

**Priority:** P1 | **Status:** TODO

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

### TASK-100: Record: Disconnect recovery and warning toasts for dropped devices

**Priority:** P1 | **Status:** TODO

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

### Record Completion Milestones

#### Milestone 1: Trust the Record surface

- `TASK-086` unified config store for main tab + panel
- `BUG-007` toolbar toggles must drive the real session
- `BUG-008` source selection must stay in sync across main tab and panel
- `BUG-009` record mode selector must affect capture behavior
- `BUG-010` camera controls must be surfaced consistently
- `TASK-087` persist shared config across panel opens/restarts
- `TASK-088` device selectors for mic/camera/system audio

#### Milestone 2: Preview and capture parity

- `TASK-013` PixiJS live preview replaces raw video preview
- `TASK-014` webcam PiP in compositor
- `TASK-015` serialize Record styling into resulting clips/effects
- `TASK-016` separate webcam/audio assets on stop
- `TASK-030` configurable countdown
- `TASK-031` pause/resume recording
- `TASK-032` VU meters for mic and system audio
- `TASK-100` disconnect recovery and warning toasts

#### Milestone 3: Tutorial-authoring completeness

- `TASK-089` keyboard shortcut overlays
- `TASK-090` highlights and annotations
- `TASK-091` titles and callouts
- `TASK-092` dynamic camera layouts
- `TASK-101` cursor smoothing, idle hide, and loop-back polish

#### Milestone 4: Workflow polish and distribution

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

#### Phase 3: Make mode and camera controls real (`BUG-009`, `BUG-010`)

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
- ~~TASK-072~~ Recent projects workflow
- ~~TASK-077~~ Edit: Camera playback in Edit tab compositor
- ~~TASK-085~~ Record: Persistent recording location + migration for stale /tmp references
- ~~TASK-113~~ Record: Camera aspect presets for shaped PiP
- ~~TASK-114~~ Edit: Camera source/timing parity with Record preview
- ~~TASK-118~~ Export: Camera PiP preview parity with Record + Edit tabs
- ~~BUG-001~~ Fix: Compositor canvas sizing + video sprite positioning
- ~~BUG-002~~ Fix: Compositor resizing to template resolution + debug logging cleanup
- ~~BUG-003~~ Fix: Video playback + timeline sync across all tabs
