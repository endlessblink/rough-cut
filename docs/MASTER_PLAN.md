# Rough Cut — Master Plan

## Overview

Desktop screen recording and editing studio built with Electron + React + TypeScript + PixiJS. Combines Screen Studio-style recording, a multi-channel timeline editor, programmable motion graphics, and AI-powered editing.

For detailed architecture, see `docs/ARCHITECTURE.md`. For phased build order, see `docs/IMPLEMENTATION_PLAN.md`.

## Task ID Format

| Prefix | Usage |
|--------|-------|
| `TASK-XXX` | Features and improvements |
| `BUG-XXX` | Bug fixes |
| `FEATURE-XXX` | Major features |
| `INQUIRY-XXX` | Research/investigation |
| `IDEA-XXX` | Future ideas, not yet planned |

**Rules:**
- IDs are sequential (TASK-001, TASK-002...)
- Completed: ~~TASK-001~~ with strikethrough + DONE status
- Never reuse IDs

## Progress Summary (2026-03-28)

~33% of MVP spec implemented. Foundation is solid (7 packages, store, renderers). Two entire tabs (Motion, AI) are unbuilt. 50 items remain.

| Area | Done | Remaining |
|------|------|-----------|
| Record Tab | 12 | 5 |
| Edit Tab | 8 | 11 |
| Motion Tab | 0 | 7 |
| AI Tab | 0 | 10 |
| Export Tab | 4 | 10 |
| Cross-Cutting | 2 | 6 |
| **Total** | **26** | **49** |

---

## Roadmap

### Foundation (DONE)

| ID | Title | Priority | Status | Dependencies |
|----|-------|----------|--------|--------------|
| ~~TASK-001~~ | Monorepo scaffold + CI | P0 | DONE | - |
| ~~TASK-002~~ | project-model package | P0 | DONE | TASK-001 |
| ~~TASK-003~~ | timeline-engine package | P0 | DONE | TASK-002 |
| ~~TASK-004~~ | effect-registry package | P0 | DONE | TASK-002 |
| ~~TASK-005~~ | frame-resolver package | P0 | DONE | TASK-003, TASK-004 |
| ~~TASK-006~~ | store package (Zustand + zundo) | P0 | DONE | TASK-002, TASK-003 |
| ~~TASK-007~~ | preview-renderer package (PixiJS) | P0 | DONE | TASK-005 |
| ~~TASK-008~~ | export-renderer package (FFmpeg) | P0 | DONE | TASK-005 |
| ~~TASK-009~~ | Electron app shell + IPC bridge | P0 | DONE | TASK-006 |
| ~~TASK-010~~ | Capture service (desktopCapturer) | P0 | DONE | TASK-009 |
| ~~TASK-011~~ | Record tab UI + inspector panels | P1 | DONE | TASK-010, TASK-007 |

### Tier 1: Core Pipeline Completeness — Makes the App Usable

| ID | Title | Priority | Status | Dependencies |
|----|-------|----------|--------|--------------|
| TASK-012 | Record: Enable audio capture (mic + system audio) | P0 | TODO | TASK-010 |
| TASK-013 | Record: PixiJS live preview (replace `<video>` with compositor) | P0 | TODO | TASK-007, TASK-011 |
| ~~BUG-001~~ | Fix: Compositor canvas sizing + video sprite positioning | P0 | DONE | TASK-007 |
| ~~BUG-002~~ | Fix: Compositor resizing to template resolution + debug logging cleanup | P0 | ✅ **DONE** (2026-03-30) | BUG-001 |
| ~~BUG-003~~ | Fix: Video playback + timeline sync across all tabs | P0 | ✅ **DONE** (2026-03-30) | BUG-002 |
| TASK-014 | Record: Webcam PiP (render in compositor with shape/position) | P0 | TODO | TASK-013 |
| TASK-015 | Record: Serialize recording effects to clips (bg, corners, shadow → Effect entries) | P0 | TODO | TASK-011 |
| TASK-016 | Record: Create separate Assets for webcam + audio on stop | P0 | TODO | TASK-012, TASK-014 |
| TASK-017 | Edit: Clip drag-to-move (horizontal repositioning with snap) | P1 | TODO | TASK-003 |
| TASK-018 | Edit: Cross-track clip dragging (V1↔V2) | P1 | TODO | TASK-017 |
| TASK-019 | Edit: Effects stack UI (Add Effect, expandable sections, param controls) | P1 | TODO | TASK-004 |
| TASK-020 | Edit: Audio playback via Web Audio API synced to playhead | P1 | TODO | TASK-007 |
| TASK-021 | Export: Progress bar + frame counter (wire existing IPC events to UI) | P1 | TODO | TASK-008 |
| TASK-022 | Export: Output path selector (native save dialog) | P1 | TODO | TASK-009 |

### Tier 2: Essential Editing Features

| ID | Title | Priority | Status | Dependencies |
|----|-------|----------|--------|--------------|
| TASK-023 | Edit: Keyframe editor (timeline markers + inspector controls) | P1 | TODO | TASK-019 |
| TASK-024 | Edit: Transitions (crossfade rendering in preview + export) | P1 | TODO | TASK-005, TASK-007 |
| TASK-025 | Edit: Track headers UI (mute/solo/lock toggles, volume slider) | P1 | TODO | TASK-006 |
| TASK-026 | Edit: Audio waveforms on timeline clips | P2 | TODO | TASK-020 |
| TASK-027 | Edit: Ripple delete mode | P2 | TODO | TASK-003 |
| TASK-028 | Export: Audio mixing in export pipeline | P1 | TODO | TASK-008, TASK-020 |
| TASK-029 | Export: Quality presets + editable settings (resolution, FPS, CRF) | P2 | TODO | TASK-021 |
| TASK-030 | Record: Countdown timer (0/3/5/10s configurable) | P2 | TODO | TASK-011 |
| TASK-031 | Record: Pause/resume recording (MediaRecorder pause) | P2 | TODO | TASK-012 |
| TASK-032 | Record: VU meters for mic and system audio | P2 | TODO | TASK-012 |

### Tier 3: Motion Tab — New Surface

| ID | Title | Priority | Status | Dependencies |
|----|-------|----------|--------|--------------|
| TASK-033 | Split "AI Motion" placeholder into separate Motion + AI tabs | P2 | TODO | TASK-009 |
| TASK-034 | Motion: MotionTemplate data model + 8 bundled templates (JSON) | P2 | TODO | TASK-002 |
| TASK-035 | Motion: Template library UI (sidebar, search, category filter, card grid) | P2 | TODO | TASK-034 |
| TASK-036 | Motion: Template preview canvas (PixiJS renders animation) | P2 | TODO | TASK-007, TASK-034 |
| TASK-037 | Motion: Parameter editor panel (text, color, duration, easing, font) | P2 | TODO | TASK-035 |
| TASK-038 | Motion: "Apply to Timeline" (creates motion-template Asset + Clip) | P2 | TODO | TASK-037 |
| TASK-039 | Motion: Resolve motion-template asset type in preview + export renderers | P2 | TODO | TASK-007, TASK-008, TASK-034 |

### Tier 4: AI Tab — New Surface

| ID | Title | Priority | Status | Dependencies |
|----|-------|----------|--------|--------------|
| TASK-040 | AI: Create @rough-cut/ai-bridge package + AIProvider interface | P3 | TODO | TASK-002 |
| TASK-041 | AI: AIAnnotation type in project-model | P3 | TODO | TASK-002 |
| TASK-042 | AI: Auto-Captions — Whisper integration (local binary) | P3 | TODO | TASK-040 |
| TASK-043 | AI: Smart Zoom — cursor/mouse movement analysis | P3 | TODO | TASK-040 |
| TASK-044 | AI: Source selector UI (pick assets to analyze) | P3 | TODO | TASK-033 |
| TASK-045 | AI: Results panel with Accept/Reject/Edit per annotation | P3 | TODO | TASK-041, TASK-044 |
| TASK-046 | AI: Preview player showing annotation context | P3 | TODO | TASK-045 |
| TASK-047 | AI: "Apply Accepted to Timeline" (captions → subtitle effects, zooms → keyframes) | P3 | TODO | TASK-045 |
| TASK-048 | AI: Background worker/utilityProcess for analysis | P3 | TODO | TASK-040 |
| TASK-049 | AI: Cloud provider option (API key config) | P3 | TODO | TASK-040 |

### Tier 5: Polish & Cross-Cutting

| ID | Title | Priority | Status | Dependencies |
|----|-------|----------|--------|--------------|
| TASK-050 | Toast notification system for errors/warnings | P2 | TODO | TASK-009 |
| TASK-051 | Global keyboard shortcuts (Ctrl+S save, Ctrl+E export) | P2 | TODO | TASK-009 |
| TASK-052 | Recording config persistence to localStorage | P3 | TODO | TASK-011 |
| TASK-053 | Relative asset paths for project portability | P2 | TODO | TASK-009 |
| TASK-054 | Effect registry: add color-correction effect | P2 | TODO | TASK-004 |
| TASK-055 | Effect registry: add subtitle/text effect | P2 | TODO | TASK-004 |
| TASK-056 | Export: Job queue (multi-job sequential processing) | P3 | TODO | TASK-021 |
| TASK-057 | Export: Cancel button during export | P2 | TODO | TASK-021 |
| TASK-058 | Export: Error display for failed exports | P2 | TODO | TASK-021 |
| TASK-059 | Export: "Open File"/"Open Folder" links after completion | P3 | TODO | TASK-021 |
| TASK-060 | Export: File size + time estimates | P3 | TODO | TASK-029 |
| TASK-061 | Record: Custom region selection overlay | P3 | TODO | TASK-013 |
| TASK-062 | Record: Image backgrounds | P3 | TODO | TASK-011 |
| TASK-063 | Edit: Video thumbnail strips on clips | P3 | TODO | TASK-017 |
| TASK-064 | Edit: Opacity/blend mode in clip inspector | P3 | TODO | TASK-019 |
| TASK-065 | Edit: Audio volume controls per clip/track | P2 | TODO | TASK-025 |
| TASK-066 | Edit: Playback transport buttons (skip forward/back) | P3 | TODO | TASK-020 |
| TASK-067 | Preview + export parity test (visual regression) | P2 | TODO | TASK-007, TASK-008 |
| TASK-068 | Cross-platform testing (macOS, Windows) | P2 | TODO | TASK-015 |
| TASK-069 | Performance profiling + optimization | P3 | TODO | TASK-020 |
| TASK-070 | Accessibility basics (keyboard nav, screen reader) | P3 | TODO | - |
| TASK-071 | Project save/load with relative paths | P1 | TODO | TASK-053 |
| ~~TASK-072~~ | ~~Recent projects workflow~~ | P2 | ✅ **DONE** (2026-03-30) | TASK-071 |

---

## Active Work

### ~~TASK-072: Recent Projects Workflow~~
**Priority:** P2 | **Status:** ✅ DONE (2026-03-30)

Recent projects list with filtering, new/open project flows. IPC integration for project management between main and renderer. Fixed `setProject` to preserve `projectFilePath` so loaded projects maintain their save location.

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
- ~~BUG-001~~ Fix: Compositor canvas sizing + video sprite positioning
- ~~BUG-002~~ Fix: Compositor resizing to template resolution + debug logging cleanup
- ~~BUG-003~~ Fix: Video playback + timeline sync across all tabs
