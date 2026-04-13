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
| BUG-004 | No icon shown in dock/taskbar during recording — blank space | P2 | PLANNED | TASK-010 |
| TASK-014 | Record: Webcam PiP (render in compositor with shape/position) | P0 | TODO | TASK-013 |
| TASK-015 | Record: Serialize recording effects to clips (bg, corners, shadow → Effect entries) | P0 | TODO | TASK-011 |
| TASK-016 | Record: Create separate Assets for webcam + audio on stop | P0 | TODO | TASK-012, TASK-014 |
| TASK-050 | Preview: Switch to PixiJS VideoSource (WebGL textures, drop Canvas2D drawImage) | P0 | TODO | TASK-007 |
| TASK-051 | Preview: Work around WebGL gradient shader crash (solid rects or pre-rendered canvas bg) | P0 | TODO | TASK-050 |
| TASK-052 | Export: WebCodecs pipeline — web-demuxer + VideoDecoder + PixiJS offscreen + VideoEncoder + mediabunny MP4 | P0 | TODO | TASK-050 |
| TASK-053 | Export: Frame-accurate scrubbing via mediabunny VideoSampleSink.getSample() | P1 | TODO | TASK-052 |
| TASK-054 | Export: NVENC hardware encoding via VideoEncoder hardwareAcceleration: prefer-hardware | P1 | TODO | TASK-052 |
| BUG-005 | Camera PiP renders as ellipse instead of circle (CSS/template shape not applied) | P1 | TODO | TASK-014 |
| BUG-006 | Playback laggy — Canvas2D drawImage bottleneck, needs WebGL VideoSource path | P0 | TODO | TASK-050 |
| TASK-075 | Preview: Playback fluency — rVFC sync, consolidate loops, cache effects | P0 | PLANNED | TASK-007 |
| FEATURE-076 | Record: Audio capture + playback (FFmpeg pipeline + compositor unmute) | P1 | IN PROGRESS | TASK-020 |
| TASK-077 | Edit: Camera playback in Edit tab compositor | P1 | PLANNED | TASK-075 |
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
| FEATURE-084 | Edit: Timeline multi-select + snap additions (Increment 1 of 3) | P1 | IN PROGRESS | TASK-006, TASK-003 |
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
| FEATURE-078 | AI: ButterCut-inspired library + rough cut generation (epic) | P1 | PLANNED | TASK-040 |
| TASK-079 | AI: Library data model — footage + transcripts + visual analysis as first-class entity | P1 | PLANNED | TASK-002 |
| TASK-080 | AI: WhisperX audio transcription pipeline (batch ingest, word-level timestamps) | P1 | PLANNED | TASK-040, TASK-079 |
| TASK-081 | AI: Visual frame analysis pipeline (sample frames, describe via vision LLM) | P1 | PLANNED | TASK-040, TASK-079 |
| TASK-082 | AI: Rough cut generator — LLM produces timeline from library + user prompt | P1 | PLANNED | TASK-080, TASK-081 |
| TASK-083 | Compliance: Third-party attribution (WhisperX BSD-4, FFmpeg LGPL) in About/credits | P2 | PLANNED | - |
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
| TASK-073 | AI: Auto-Edit — transcription-based editing via AI (API-first) | P3 | TODO | TASK-042, TASK-040 |
| TASK-074 | AI: Silence Removal — detect and cut silent segments automatically | P3 | TODO | TASK-042, TASK-040 |

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

### TASK-075: Preview: Playback fluency — rVFC sync, consolidate loops, cache effects
**Priority:** P0 | **Status:** PLANNED

Improve playback smoothness by addressing identified bottlenecks in the rendering pipeline:

1. **requestVideoFrameCallback** — Replace rAF polling of `video.currentTime` with precise frame callbacks
2. **Consolidate rAF loops** — PlaybackManager should be sole timing authority; disable PixiJS ticker during playback
3. **Cache effect/filter state** — Only rebuild blur, round-corners, opacity filters when params actually change
4. **Skip redundant renders** — Don't re-render compositor when frame hasn't changed
5. **Reuse sprites** — Avoid destroying/recreating PixiJS sprites on layer set changes; update textures only

**Key files:** `playback-manager.ts`, `preview-compositor.ts`, `use-compositor.ts`

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
- PlaybackManager._syncLoop falls back to `compositor.getVideoCurrentTime()` when no screenVideo (Edit tab)
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
[ButterCut](https://github.com/barefootford/buttercut) (MIT, by Andrew Ford) demonstrates a workflow where Claude analyzes raw footage (audio transcripts + frame descriptions), then generates editor timelines from a user prompt. rough-cut adopts the same *workflow*, but outputs directly into its native timeline format instead of FCPXML/Premiere XML.

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

### TASK-077: Edit: Camera playback in Edit tab compositor
**Priority:** P1 | **Status:** PLANNED (2026-04-09)

The Edit tab uses the PixiJS compositor for rendering, which currently skips camera layers (camera rendering was moved to CameraPlaybackCanvas in the Record tab's React template slot). The Edit tab needs its own camera rendering path — either re-enable the compositor's camera decode, or add CameraPlaybackCanvas to the Edit tab's preview.

**Tasks**:
- [ ] Decide approach: compositor-internal camera decode vs React overlay
- [ ] Wire camera rendering into Edit tab preview
- [ ] Ensure camera syncs with Edit tab playhead during playback and scrubbing

**Key files:** `preview-compositor.ts`, `EditTab.tsx`, `CameraPlaybackCanvas.tsx`

---

### FEATURE-084: Edit: Timeline multi-select + snap additions
**Priority:** P1 | **Status:** IN PROGRESS (2026-04-13)

Increment 1 of a three-part editor upgrade inspired by headline-design/seq (no-license, reimplemented clean-room). Adds multi-select and two new snap targets. Virtualization (Increment 2) and waveform rendering (Increment 3) deferred.

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

**Key files:** `packages/timeline-engine/src/snap.ts`, `packages/timeline-engine/src/select-clips.ts`, `packages/store/src/transport-store.ts`, `apps/desktop/src/renderer/features/edit/{TimelineStrip,EditTab,MarqueeOverlay}.tsx`

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
