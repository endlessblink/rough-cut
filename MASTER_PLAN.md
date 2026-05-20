# Rough Cut MVP Master Plan

This repo is focused on becoming a Screen Studio-style Linux app for recording client project demos: reliable screen capture first, then polished exports, cursor presentation, and automatic/manual zooms before general-purpose editing.

## Development Rule

- Build one task at a time.
- Do not batch multiple product features into one implementation pass.
- Every task must include automated verification when feasible.
- Every user-visible capture/export change must have a manual packaged-app verification step before moving on.
- Prefer small foundations that unblock the next step over large rewrites.

## Status Summary

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| TASK-001 | Add repeatable MVP smoke verification script | P1 | DONE |
| TASK-002 | Add Electron UI smoke coverage for preview and export | P2 | DONE |
| TASK-003 | Improve Watchpost compatibility for project task tracking | P2 | DONE |
| TASK-004 | Package the desktop MVP for local install testing | P2 | DONE |
| TASK-005 | Document release-ready Linux/X11 verification steps | P3 | DONE |
| TASK-006 | Define client-demo roadmap before editing work | P1 | DONE |
| TASK-007 | Add export mode selection: raw vs styled | P1 | DONE |
| TASK-008 | Add styled 16:9 canvas export preset | P1 | DONE |
| TASK-009 | Add styled export UI preview metadata | P2 | DONE |
| TASK-010 | Add cursor telemetry recording foundation | P1 | DONE |
| TASK-011 | Add cursor overlay export rendering | P1 | DONE |
| ~~TASK-012~~ | Add cursor overlay preview rendering | P2 | SUPERSEDED → TASK-025 |
| TASK-013 | Add click emphasis telemetry and export rendering | P2 | DONE |
| TASK-014 | Add manual zoom marker data model | P1 | DONE |
| TASK-015 | Add manual zoom marker UI controls | P1 | DONE |
| TASK-016 | Add smooth manual zoom export rendering | P1 | DONE |
| ~~TASK-017~~ | Add zoom preview playback approximation | P2 | SUPERSEDED → TASK-025 |
| TASK-018 | Add automatic zoom suggestion engine | P2 | DONE |
| TASK-019 | Add automatic zoom review/apply flow | P2 | DONE |
| TASK-020 | Add countdown before recording | P2 | DONE |
| TASK-021 | Add clear recording indicator and elapsed time | P2 | DONE |
| TASK-022 | Add open recording/project folder action | P2 | DONE |
| TASK-023 | Add recent projects or recordings list | P2 | DONE |
| TASK-024 | Add microphone recording foundation | P2 | DONE |
| TASK-025 | Unified preview that mirrors styled export | P1 | DONE |
| TASK-026 | Switch capture pipeline to xdg-desktop-portal + PipeWire (Wayland) | P3-LOW | PLANNED |
| ~~TASK-027~~ | Cursor-follow zoom (preview + export, parity-preserving) | P1 | DONE (2026-05-06) |
| TASK-028 | Add aspect ratio presets for styled exports | P1 | DONE |
| TASK-029 | Build editor shell and screen presentation controls | P1 | DONE |
| TASK-030 | Add cursor-follow zoom regression fixtures | P1 | DONE |
| TASK-031 | Add preview/export parity regression snapshots | P1 | DONE |
| TASK-032 | Add packaged-app visual regression smoke | P2 | DONE |
| TASK-033 | Define recording-flow solidity checklist | P1 | DONE |
| TASK-034 | Add real-recording regression harness | P1 | DONE |
| TASK-035 | Add recording health diagnostics report | P1 | DONE |
| TASK-036 | Add long-recording stability smoke | P1 | DONE |
| TASK-037 | Add packaged recording acceptance runbook | P1 | DONE |
| TASK-038 | Add system audio capture controls | P1 | DONE |
| TASK-039 | Add capture target picker | P1 | DONE |
| TASK-040 | Add pause, resume, and cancel recording | P1 | DONE |
| TASK-041 | Add post-recording next-action flow | P1 | DONE |
| TASK-042 | Render click emphasis in preview and export | P1 | DONE |
| TASK-043 | Add webcam PiP presentation controls | P1 | DONE |
| TASK-044 | Add cursor style controls | P2 | DONE |
| TASK-045 | Add background style presets | P2 | DONE |
| TASK-046 | Add trim start and end controls | P1 | DONE |
| TASK-047 | Add simple cut removal flow | P2 | DONE |
| TASK-048 | Add optional webcam PiP recording and export | P1 | DONE |
| TASK-049 | Build Screen Studio-style editor UI foundation | P1 | DONE |
| TASK-050 | Add Screen Studio-style pre-record panel | P1 | DONE |
| TASK-051 | Add post-recording review workspace | P1 | DONE |
| TASK-052 | Add timeline-first playback and edit rail | P1 | DONE |
| TASK-053 | Add extensible properties inspector system | P1 | DONE |
| TASK-054 | Add thumbnail source picker for recording targets | P1 | EXTERNAL |
| TASK-055 | Add audio and camera preflight controls | P1 | EXTERNAL |
| TASK-056 | Add pre-record smoke and packaged checks | P1 | EXTERNAL |
| TASK-057 | Add timeline interaction visual regression suite | P1 | DONE |
| TASK-058 | Add non-destructive edit recovery affordances | P2 | DONE |
| TASK-059 | Add preflight checklist and session-risk warnings | P1 | DONE |
| TASK-060 | Debug long-smoke post-save failure | P1 | DONE |
| TASK-061 | Fix choppy camera playback via canvas frame dedup | P1 | DONE |
| TASK-062 | Add real window and region selection UI | P2 | DONE |
| TASK-063 | Enable real window capture selection | P2 | DONE |
| TASK-064 | Stabilize sidebar tool switching layout | P2 | DONE |
| TASK-065 | Validate paths in PROJECT_OPEN and PROJECT_SAVE IPC handlers | P1 | DONE |
| TASK-066 | Clean up recording child processes on app crash or signal | P1 | DONE |
| TASK-067 | Validate remuxed MP4 coherence before declaring success | P1 | DONE |
| TASK-068 | Compensate cursor and audio drift vs ffmpeg first frame | P1 | DONE |
| TASK-069 | Add EXPORT_CANCEL IPC and kill ffmpeg on cancel | P1 | DONE |
| TASK-070 | Per-display scale factor for cursor and click telemetry | P1 | DONE |
| TASK-071 | Surface camera failure during recording, not after | P1 | DONE |
| TASK-072 | Lift or warn on ASS cursor 600-event downsample cap | P1 | DONE |
| TASK-073 | Validate capture region against display bounds | P1 | DONE |
| TASK-074 | Wire or remove inert top-bar folder, comments, undo icons | P1 | DONE |
| TASK-075 | Implement undo and redo with edit history stack | P1 | DONE |
| TASK-076 | Add keyboard shortcuts and a shortcuts cheat sheet dialog | P1 | DONE |
| TASK-077 | Reconcile or remove duplicate region X Y W H inputs | P2 | DONE |
| TASK-078 | Add feedback signal for incorrect auto-zoom suggestions | P3 | PLANNED |
| TASK-079 | Profile renderer scrub and memoize where DevTools flags | P3 | PLANNED |
| TASK-080 | Add i18n infrastructure with t() context and RTL CSS | P2 | PLANNED |
| TASK-081 | Add light theme and semantic color tokens | P3 | PLANNED |
| TASK-082 | Improve error UX with actionable copy and diagnostics link | P2 | DONE |
| TASK-083 | Keyboard accessibility for timeline, markers, trim handles | P2 | DONE |
| TASK-084 | Support relative-to-.roughcut asset paths in projects | P2 | DONE |
| TASK-085 | Atomic project file writes with temp-and-rename pattern | P1 | DONE |
| TASK-086 | Add GIF and WebM export presets | P2 | PLANNED |
| TASK-087 | Add 9:16 vertical and 1:1 square export presets | P2 | PLANNED |
| TASK-088 | Add autosave and crash recovery for orphaned recordings | P1 | PLANNED |
| TASK-089 | Bundle ffmpeg-static and ffprobe-static binaries | P2 | PLANNED |
| TASK-090 | Build AppImage and deb installer with electron-updater | P3 | PLANNED |
| TASK-091 | Add opt-in crash reporting and error telemetry | P3 | PLANNED |
| TASK-092 | Replace xdotool and xinput stack with uiohook-napi | P2 | PLANNED |
| TASK-093 | Split countdown and HUD indicator into BrowserWindows | P3 | PLANNED |
| TASK-094 | Add Inspector templates picker for one-click aspect+background+camera | P2 | DONE |
| TASK-095 | Add drag-to-reposition camera PiP and screen frame in editor preview | P2 | DONE |
| TASK-096 | Single-ffmpeg architecture for live camera preview + capture | P2 | DONE |
| TASK-097 | Fix Inspector Templates click not propagating aspect ratio | P2 | DONE |
| TASK-098 | Verify playback smoothness end-to-end after MJPEG camera fix | P2 | DONE |
| TASK-099 | Verify post-recording blank editor is no longer reproducible | P3 | DONE |
| TASK-100 | Migrate screen camera audio capture to one FFmpeg graph | P1 | DONE |
| TASK-101 | Define feature-flagged Full Editor shell | P3 | PLANNED |
| TASK-102 | Add advanced timeline tracks for rich revisions | P3 | PLANNED |
| TASK-103 | Add annotation and callout track foundation | P3 | PLANNED |
| TASK-104 | Define AI motion suggestion data model | P4 | PLANNED |
| TASK-105 | Add safe AI motion preview and apply flow | P4 | PLANNED |
| TASK-106 | Define cloud sharing and collaboration scope | P4 | PLANNED |
| TASK-107 | Audit sidebar controls and remove placeholder affordances | P2 | DONE |
| TASK-108 | Wire all visible sidebar controls to real editor behavior | P2 | DONE |
| TASK-109 | Redesign sidebar information architecture and section density | P2 | DONE |
| TASK-110 | Replace recording preview card with compact horizontal controls | P2 | PLANNED |
| TASK-111 | Add sidebar interaction and visual regression coverage | P2 | PLANNED |
| TASK-112 | Add export benchmark harness and performance budget | P1 | PLANNED |
| TASK-113 | Profile styled export filter graph bottlenecks | P1 | PLANNED |
| TASK-114 | Add fast-path exports for no-zoom/no-camera cases | P1 | PLANNED |
| TASK-115 | Optimize cursor and zoom layer generation overhead | P2 | PLANNED |
| TASK-116 | Add export speed preset controls with quality guardrails | P2 | PLANNED |
| TASK-117 | Add screen and camera crop region UI | P3 | PLANNED |
| TASK-118 | Add camera layout markers UI | P3 | PLANNED |
| TASK-119 | Add recording visibility segments UI | P3 | PLANNED |
| TASK-152 | Launchpad: scaffold capability registry + base shell | P1 | PLANNED |
| TASK-153 | Launchpad: capability grid with sections (Transform/Generate/Assemble/Meta) | P1 | PLANNED |
| TASK-154 | Launchpad: dynamic hero card (recommends next-relevant capability) | P1 | PLANNED |
| TASK-155 | Launchpad: search input + recents persistence (localStorage) | P1 | PLANNED |
| TASK-156 | Launchpad: wire Suggest edits + Suggest title cards to AI v1 IPC | P1 | PLANNED |
| TASK-157 | Launchpad: mount in main.tsx, retire ai-shell.tsx | P1 | PLANNED |
| TASK-158 | Settings: gear icon + sliding modal chrome + Esc/backdrop close | P1 | PLANNED |
| TASK-159 | Settings: atomic settings.json persistence layer + IPC | P1 | PLANNED |
| TASK-160 | Settings: AI Providers section (stub rows for 5 providers) | P1 | PLANNED |
| TASK-161 | Settings: Cost & Quotas + Language + Advanced sections (placeholders) | P1 | PLANNED |
| TASK-122 | CLI detection: Claude CLI + Codex CLI subprocess pattern | P1 | PLANNED |
| TASK-123 | API keys store (encrypted-at-rest in userData) | P1 | PLANNED |
| TASK-124 | Provider registry + reasoning capability router | P1 | PLANNED |
| TASK-125 | Cost meter + background job system + top-bar progress chip | P2 | PLANNED |
| ~~TASK-162~~ | ✅ Add transcript / captionTracks / tracks types to project-model | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-163~~ | ✅ Extend Zod schemas for transcript / captionTracks / tracks | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-164~~ | ✅ Migration v12 → v13 (additive defaults for new fields) | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-165~~ | ✅ Migration tests + round-trip + idempotent re-migration | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-166~~ | ✅ LibraryShell topbar: Import / Blank / Template buttons | P2 | ✅ DONE (2026-05-18) |
| ~~TASK-167~~ | ✅ Import handler: file picker + whitelist (mp4/mov/mp3/wav/png/jpg) | P2 | ✅ DONE (2026-05-18) |
| ~~TASK-168~~ | ✅ Import creates a new .roughcut referencing the imported file | P2 | ✅ DONE (2026-05-18) |
| ~~TASK-169~~ | ✅ Blank-project handler + Recording edit safe-empty-state | P2 | ✅ DONE (2026-05-18) |
| ~~TASK-170~~ | ✅ Template picker stub modal (3 entries, no execution yet) | P3 | ✅ DONE (2026-05-18) |
| TASK-177 | Import audio passthrough (embedded video audio + audio-only imports) | P2 | ⚠️ DATA-LAYER DONE (2026-05-18) / RENDERER VERIFY |
| ~~TASK-178~~ | ✅ NLE: read-only clip blocks on Video / Audio lanes | P2 | ✅ DONE (2026-05-18) |
| TASK-179 | NLE MVP: program monitor + playhead + click-seek + select/delete/split | P1 | ⚠️ IN APP (2026-05-18) / NEEDS HANDS-ON ITERATION |
| ~~TASK-180~~ | ✅ NLE: time ruler with adaptive ticks above lanes | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-181~~ | ✅ NLE: keyboard transport shortcuts | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-182~~ | ✅ NLE: Split at playhead transport button | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-183~~ | ✅ NLE: snap playhead to clip edges during scrub | P1 | ✅ DONE (2026-05-18) |
| TASK-128 | WhisperX install flow + OpenAI Whisper API cloud fallback | P1 | PLANNED |
| TASK-129 | Transcript IPC + persistence inside .roughcut | P1 | PLANNED |
| ~~TASK-171~~ | ✅ NLE: register 'nle' AppViewId + APP_VIEWS entry + 4th tab in strip | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-172~~ | ✅ NLE: shell scaffold + main.tsx render branch (empty container) | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-173~~ | ✅ NLE: multi-track placeholder lanes (Video / Audio / Captions / MG headers) | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-174~~ | ✅ NLE: asset panel sidebar with Project + Generated tabs (empty states) | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-175~~ | ✅ NLE: empty-state when no project is open (CTA back to Projects) | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-176~~ | ✅ NLE: shared state — consume project + applyProjectChange from App | P1 | ✅ DONE (2026-05-18) |
| TASK-132 | Transcript editor pane (Descript-style: click-scrub, delete-cut) | P1 | PLANNED |
| TASK-133 | Word-level cut with silence-snap + 20ms audio crossfade | P1 | PLANNED |
| TASK-134 | Caption track data model + ASS subtitle render path | P1 | PLANNED |
| TASK-135 | Remotion bundled into renderer + Submagic caption composition | P1 | PLANNED |
| TASK-136 | AI keyword emphasis per phrase (Claude/Codex CLI batched) | P1 | PLANNED |
| TASK-137 | .srt / .vtt sidecar export + Hebrew/English language priority | P2 | PLANNED |
| TASK-138 | Filler + silence detector from transcript word-timing | P2 | PLANNED |
| TASK-139 | Proposed-cut overlays on NLE timeline + apply flow | P2 | PLANNED |
| TASK-140 | Full multi-track timeline expansion (multi video + audio lanes) | P2 | SUPERSEDED → TASK-184–191 |
| TASK-141 | Cross-project AI asset pool (userData/ai-assets/ + index + Generated tab UI) | P2 | SUPERSEDED → TASK-192–196 |
| TASK-142 | TTS generation flow (ElevenLabs + Codex CLI gpt-4o-mini-tts) | P2 | SUPERSEDED → TASK-197–200 |
| TASK-143 | Image generation flow (Codex CLI $imagegen + Replicate / fal.ai fallback) | P2 | SUPERSEDED → TASK-201–204 |
| ~~TASK-184~~ | ✅ Track model: generalized NLE tracks + migration defaults | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-185~~ | ✅ Frame resolver: video stack selection + audio mix plan | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-186~~ | ✅ NLE timeline: render dynamic tracks from project data | P1 | ✅ DONE (2026-05-18) |
| ~~TASK-205~~ | ✅ Recording edit/NLE share presentation state and controls | P1 | ✅ DONE (2026-05-18) |
| TASK-187 | NLE trim handles for selected clip edges | P1 | REWORK REQUIRED → TASK-211 |
| ~~TASK-206~~ | ✅ Shared timeline invariant: one timeline, two toolsets | P1 | ✅ DONE (2026-05-18) |
| TASK-207 | Shared timeline schema for sources, tracks, clips, markers | P1 | REWORK REQUIRED → TASK-214 |
| TASK-208 | Migrate Recording edit cuts/trims into shared timeline | P1 | REWORK REQUIRED → TASK-215 |
| TASK-209 | Recording edit selectors/actions over shared timeline | P1 | REWORK REQUIRED → TASK-219 |
| TASK-210 | NLE selectors/actions over shared timeline | P1 | REWORK REQUIRED → TASK-220 |
| TASK-211 | Replace trim UI with local preview sessions | P1 | REWORK REQUIRED → TASK-217 |
| TASK-212 | Shared export composition/EDL from one timeline | P1 | BLOCKED → TASK-222 |
| TASK-213 | Cross-tool sync and migration smoke coverage | P1 | BLOCKED → TASK-221 |
| ~~TASK-214~~ | ✅ NLE rebuild lane 1: canonical model contract | P0 | ✅ DONE (2026-05-19) |
| ~~TASK-215~~ | ✅ NLE rebuild lane 2: migration and canonicalization | P0 | ✅ DONE (2026-05-19) |
| ~~TASK-216~~ | ✅ NLE rebuild lane 3: timeline playback resolver | P0 | ✅ DONE (2026-05-19) |
| ~~TASK-217~~ | ✅ NLE rebuild lane 4: mutation command service | P0 | ✅ DONE (2026-05-19) |
| ~~TASK-218~~ | ✅ NLE rebuild lane 5: shared playback preview | P0 | ✅ DONE (2026-05-20) |
| TASK-219 | NLE rebuild lane 6: Recording Edit adapter | P0 | IN PROGRESS |
| TASK-220 | NLE rebuild lane 7: NLE adapter | P0 | PLANNED |
| TASK-221 | NLE rebuild lane 8: cross-view visual tests | P0 | PLANNED |
| TASK-222 | NLE rebuild lane 9: export resolver parity | P0 | PLANNED |
| TASK-223 | NLE rebuild lane 10: cleanup and guardrails | P0 | PLANNED |
| TASK-188 | NLE drag clips within a track with collision rules | P1 | PLANNED |
| TASK-189 | NLE drag clips across same-kind tracks | P2 | PLANNED |
| TASK-190 | Track header controls: mute, lock, height | P2 | PLANNED |
| TASK-191 | Track reorder controls with z-order preservation | P2 | PLANNED |
| TASK-192 | AI asset schema: stable generated asset references | P1 | PLANNED |
| TASK-193 | AI assets store: userData index + file layout | P1 | PLANNED |
| TASK-194 | AI asset IPC: list, delete, tag, resolve | P1 | PLANNED |
| TASK-195 | Generated tab: browse, filter, search, preview | P1 | PLANNED |
| TASK-196 | Drag Generated assets onto compatible NLE tracks | P1 | PLANNED |
| TASK-197 | TTS capability router and request validation | P1 | PLANNED |
| TASK-198 | Generate narration modal with voice selection | P2 | PLANNED |
| TASK-199 | TTS generation job saves audio into AI asset pool | P1 | PLANNED |
| TASK-200 | TTS asset preview, timeline playback, export bake-in | P1 | PLANNED |
| TASK-201 | Image generation router via Codex CLI and fallbacks | P1 | PLANNED |
| TASK-202 | Generate image modal with aspect and variations | P2 | PLANNED |
| TASK-203 | Image generation saves previews into AI asset pool | P1 | PLANNED |
| TASK-204 | Image assets drag onto video tracks and preview | P1 | PLANNED |
| TASK-144 | Auto-assembly agent → multi-AR derivative .roughcut files (16:9 + 9:16 + 1:1) | P2 | PLANNED |
| TASK-145 | Motion graphics agent (AI-generated Remotion compositions) | P3 | PLANNED |
| TASK-146 | Executable templates (vlog / tutorial / podcast clip with auto-fire actions) | P3 | PLANNED |
| TASK-147 | Voice cloning (ElevenLabs Pro Voice) | P4 | PLANNED |
| TASK-148 | Music generation (Stable Audio Open / Suno when API exists) | P4 | PLANNED |
| TASK-149 | Multi-recording on one timeline | P3 | PLANNED |
| TASK-150 | Video generation (Replicate / fal.ai with LTX-Video / Veo3) | P4 | PLANNED |
| TASK-151 | User-wide AI memory + active learning | P4 | PLANNED |

## Recently Verified

- `pnpm --filter @rough-cut/desktop test` — desktop 266/266 pass.
- `pnpm --filter @rough-cut/timeline-engine test` — timeline-engine 184/184 pass.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:mvp` verifies record, remux, `.roughcut` save/reopen, export, and FFprobe validation.
- `pnpm smoke:ui` verifies renderer preview/export UI against a synthetic project — `hasZoomMarkerPanel`, `hasAutoZoomSuggestionsPanel`, `hasStableToolSwitchLayout`, `hasStyledPreviewCanvas`, `hasExportResult` all true.
- `pnpm smoke:sidebar-layout` verifies sidebar tool switching keeps the editor shell stable at 900px with and without a recording loaded.
- `pnpm smoke:recording-flow-ui` verifies the live Record -> Stop recording -> saved project -> video metadata -> styled preview canvas transition.
- `pnpm smoke:styled-export` verifies both no-zoom and zoom-marker scenarios produce 1920×1080 / 30 fps MP4s with cursor visibility intact.
- `pnpm smoke:package` verifies the packaged Linux artifact launches, previews, and exports.
- X11 capture prerequisites: X11 session, FFmpeg 6.1.1, FFprobe, and **xdotool** (required for cursor capture on Linux/X11 — bypasses Electron's broken multi-monitor `screen.getCursorScreenPoint()` per electron/electron#42519).
- The packaged app was manually checked for record, preview, and export.

## Session checkpoints

- Tag `checkpoint/cursor-stable-2026-05-03` at `e0a01ae` — landed cursor multi-monitor fix + canvas preview. Recovery anchor before auto-zoom + cursor-follow features.
- Tag `checkpoint/cursor-follow-hold-containment-2026-05-06` — stabilizes professional cursor-follow zoom behavior: action-focused ramp-in, contained hold, and cursor-independent zoom-out reveal.

## Capture-source convention

This app uses Linux/X11 with `ffmpeg x11grab` for video and **`xdotool getmouselocation --shell`** for cursor positions (NOT Electron's `screen.getCursorScreenPoint()`, which has a v29+ regression on multi-monitor: returns stale values when the cursor leaves the primary display). The wrapper at `apps/desktop/src/main/index.mjs:28` is `() => readCursorViaXdotool() ?? screen.getCursorScreenPoint()` so non-Linux platforms still work via the Electron fallback. TASK-026 (Wayland pivot) replaces the entire X11 + xdotool stack with `xdg-desktop-portal + PipeWire ScreenCast`, where the compositor draws cursor into the captured stream and app-side tracking becomes unnecessary.

## Direction

The next phase is not generic editing. It is client-demo recording quality.

- First: reliable, testable recording and export foundations.
- Second: client-ready presentation: styled canvas, cursor overlay, click emphasis.
- Third: Screen Studio-style zooms: manual first, automatic suggestions second.
- Fourth: workflow polish: countdown, indicator, quick folder access, recent sessions.
- Later: trimming and timeline editing.

### UI reference direction

Recordly and Screen Studio both converge on the same workflow shape: a focused recording setup, a large central styled preview, a bottom timeline for time-based edits, and an inspector/actions area for presentation/export settings. The app should follow that product model without copying either product verbatim.

Reference notes from Recordly:

- Recording starts from a dedicated setup surface: screen/window choice, microphone, system audio, camera, then record.
- Editing centers on a large styled preview, not a form-first control panel.
- The timeline is the home for zooms, trims, speed regions, annotations, audio, and crop-aware edits.
- Presentation settings are grouped by concern: cursor, webcam overlay, frame/background, aspect ratio, and export.
- Project files preserve source media plus editor state, so reopening returns the user to the same editor workspace.

Reference notes from Screen Studio:

- The app is opinionated: good defaults for canvas, zooms, cursor smoothing, spacing, shadows, and export presets.
- Recording setup supports screen, webcam, microphone, and system audio without making screen-only recording feel secondary.
- The editor lets users adjust zooms and style after recording while the preview remains the primary artifact.
- Output format and aspect ratio choices are treated as export presets, not raw encoder settings.
- The UI should make the next action obvious after every state: record, stop, review, retake, export, or open folder.

Implications for this app:

- Move away from the crowded MVP strip toward a stable shell: top command bar, central stage, bottom timeline, right inspector, and clear export/next-action area.
- Keep recording resilient: camera/audio failures degrade visibly but never hide the saved screen preview.
- Treat the preview as the product surface; controls explain and modify the current preview instead of competing with it.
- Build UI primitives once so camera, cursor, background, zoom, trim, and export controls do not each invent their own layout.

### Preview/export parity principle

Once the styled export pipeline is stable for cursor + zoom, the preview must mirror it deterministically — the user should see exactly what the export will produce. Earlier per-feature preview tasks (TASK-012 cursor preview, TASK-017 zoom preview) are superseded by a single TASK-025 "Unified preview that mirrors styled export" that lands after the export side is locked in. Sequencing: finish styled-export rendering (TASK-011 + TASK-016 + TASK-013), then build the unified preview (TASK-025), then auto-zoom UX (TASK-018, TASK-019). This avoids rebuilding a partial preview every time the export pipeline changes.

### Wayland-readiness principle

X11 is being deprecated and the Wayland pivot (TASK-026) is a bounded *swap-out* of the bottom capture layer plus the cursor-source modules — not a rewrite. To keep it bounded as the app matures, **design new features against cursor-data abstractions** rather than reaching into `metadata.cursorEvents` directly:

- Define `clicksAtFrame(project, frame)`, `cursorAtFrame(project, frame)`, etc. as the canonical access points.
- Implement them once; new features (click emphasis, auto-zoom, anything else cursor-derived) consume the abstractions only.
- When Wayland lands, the implementation behind these abstractions changes (compositor-rendered cursor in stream replaces telemetry); call sites stay untouched.

What survives the pivot regardless: project schema, zoom export math, canvas preview rendering, all UI panels, click-effect rendering, auto-zoom marker generation. What gets replaced: `recording-session.mjs` cursor sampling, `xdotool-cursor.mjs`, `buildCursorAss`. Small, isolated, well-tested modules.

### Safety-First Product Roadmap

Rough Cut advances in production-safe bricks. Later feature bricks should not start until the foundation they rely on is reliable in real recordings, automated tests, packaged-app checks, and preview/export parity. This is intentionally conservative: Screen Studio/Focusee/Recordly parity comes from trust, polish, and speed in the core creator loop, not from adding every competitor feature at once.

Phase gates are pragmatic, not absolute. A phase does not require impossible "perfect" coverage, but it does require no known P0/P1 bugs in the core workflow, regression coverage for the risky rendering path, real-recording dogfooding, and a packaged-app verification pass.

#### Phase 0 — Foundation Safety

Goal: recording, preview, export, project recovery, and undo are boringly reliable.

Exit gate:

- No known P0/P1 bugs in record -> preview -> edit -> export.
- Preview/export parity is covered by regression tests.
- 30-minute recording smoke passes on target Linux/X11 hardware.
- Autosave/recovery protects common failure cases.
- Packaged app passes real-recording verification.

Product lanes:

- Foundation Safety: capture/render correctness, diagnostics, regression coverage.
- Recording Fidelity: target selection, region bounds, camera/audio failure visibility, cursor scale accuracy.
- Export Confidence: export cancellation, drift compensation, validation, common output formats.
- Project Trust: autosave, crash recovery, relative assets, reliable reopen.

#### Phase 1 — MVP Polish Parity

Goal: Screen Studio/Focusee-lite quality from the compact editor.

Exit gate:

- A user can record, review, tweak zooms, style, trim, and export without manual fiddling.
- 16:9, 9:16, and 1:1 exports feel polished and match preview.
- Cursor, clicks, zooms, framing, and camera PiP feel intentional.
- Beta feedback says the app feels premium and reliable.

Product lanes:

- Cursor And Input: cursor accuracy, styling, clicks, smoothing, later keystroke visualization.
- Zoom Intelligence: auto-zoom review, feedback, smarter timing, manual override.
- Compact Timeline: trim, cut, split, speed, zoom markers, captions later.
- Presentation Polish: canvas, backgrounds, shadows, aspect ratios, camera layout, templates.
- Export Speed: measured export time budgets, safe ffmpeg fast paths, and quality-preserving presets.
- Sidebar UX Maturity: every visible sidebar element is real, compact, grouped by intent, and visually stable.
- Audio Basics: sync, normalization, silence detection/removal, basic cleanup.

#### Phase 2 — v1 Workflow Depth

Goal: add more editing power without damaging the simple workflow.

Exit gate:

- Phase 1 workflow remains stable.
- Advanced editing is optional and feature-flagged.
- Complex revisions can be completed without data loss or timeline confusion.

Future lanes:

- Presenter: richer webcam layouts, placement presets, later face tracking/background removal.
- Captions And Transcript: captions first, transcript editing later.
- Templates And Branding: save/apply style presets before team brand libraries.
- Advanced Editor: optional full editor mode, precise tracks, annotations, keyframing only where needed.
- Project Revision: stronger history/versioning beyond crash recovery.

#### Phase 3 — AI Motion Design

Goal: optional, non-destructive AI motion suggestions on top of a stable timeline/render system.

Exit gate:

- AI suggestions never corrupt projects.
- Preview/export parity remains intact.
- Motion edits are always editable or reversible.

Future lanes:

- AI Motion Suggestions: suggested camera moves, zoom timing, emphasis moments.
- Smart Timing: voice/click/typing-aware motion and cuts.
- Motion Paths: editable easing, paths, motion blur, transitions.
- Preview Caching: performance-safe previews for generated motion.

#### Phase 4 — Later Platform And Collaboration

Goal: broaden distribution and collaboration only after the local creator workflow is strong.

Future lanes:

- Cloud Sharing: hosted review links and quick share flows.
- Team Collaboration: comments, workspaces, permissions.
- Template Ecosystem: shared themes and brand libraries.

### Delivery Lanes

Drives the Watchpost flow view (`flow/index.html` parses this block via `parseDeliveryLines`, with legacy `Delivery Lines` support). `Sequence:` is strict order inside a lane. `Depends-on:` locks a lane until the named lane is done. `Supports:` lists useful parallel/supporting work that is not on the lane's main critical path. Done/superseded tasks are skipped automatically. Tasks not listed stay in the unassigned backlog. Update this block whenever sprint priorities shift — it is the source of truth for "what should I work on next?"

Active flow uses pragmatic phase gating: Phase 0 foundation lanes may run in parallel unless they touch the same subsystem, and Phase 1 lanes wait only for the specific Phase 0 foundation they depend on. Full Editor, AI Motion, and Cloud/Collab appear as locked future lanes so they are visible in the flow view without competing with the active foundation work.

1. **LANE P0-A — Export confidence foundation**:
Sequence: TASK-069, TASK-068

2. **LANE P0-B — Recording fidelity foundation**:
Sequence: TASK-070, TASK-071, TASK-073, TASK-063
Supports: TASK-026, TASK-092, TASK-093

3. **LANE P0-C — Project trust foundation**:
Sequence: TASK-088, TASK-084

4. **LANE P0-D — Preview and editor stability**:
Sequence: TASK-064, TASK-079, TASK-083

5. **LANE P1-A — Social export polish**:
Depends-on: LANE P0-A
Sequence: TASK-086, TASK-087

6. **LANE P1-B — Zoom intelligence polish**:
Depends-on: LANE P0-A, LANE P0-B
Sequence: TASK-078

7. **LANE P1-C — Sidebar UX maturity**:
Depends-on: LANE P0-D
Sequence: TASK-107, TASK-108, TASK-109, TASK-110, TASK-111

8. **LANE P1-D — Export speed**:
Depends-on: LANE P0-A
Sequence: TASK-112, TASK-113, TASK-114, TASK-115, TASK-116

9. **LANE P1-E — Distribution readiness**:
Depends-on: LANE P0-A, LANE P0-B, LANE P0-C
Sequence: TASK-089, TASK-090, TASK-091

10. **LANE P2-A — Future advanced editor mode**:
Depends-on: LANE P1-A, LANE P1-B, LANE P1-C, LANE P1-D
Sequence: TASK-101, TASK-102, TASK-103

11. **LANE P3-A — Future AI motion design**:
Depends-on: LANE P2-A
Sequence: TASK-104, TASK-105

12. **LANE P4-A — Future cloud and collaboration**:
Depends-on: LANE P3-A
Sequence: TASK-106

---

**AI ARCHITECTURE LANES** — see `/home/endlessblink/.claude/plans/gentle-dancing-patterson.md` for the full architecture plan. These supersede TASK-104 and TASK-105 (folded into TASK-144 + TASK-145). Lane order revised 2026-05-18: NLE foundation lanes (C, E) execute before the launchpad (A), since the launchpad is a directory of capabilities that don't exist until later lanes ship.

#### Lane Decomposition Protocol (READ BEFORE STARTING A LANE)

Many lanes contain **EPIC** tasks: scope-too-large items that need to be broken into 3-8 atomic sub-tasks before any code is written. An **atomic** task:

- Touches one cohesive area (one feature, one bug, one small refactor).
- Is implementable + verifiable in **30 min – 3 hours**.
- Lands as **one git commit**.
- Has its own `Acceptance Criteria` + `Verification` section.

**How to tell which tasks are EPIC vs atomic:**

- A lane Sequence whose tasks are already atomic will have **many** entries (~5-10), each scoped to one commit. Example: Lane P-AI-C → TASK-162 through TASK-170 (9 atomic tasks).
- A lane Sequence with **few** entries (2-4 tasks) is almost certainly an EPIC lane — every task in that sequence needs decomposition.
- Each EPIC task's entry header in the Tasks section is marked `**EPIC — decompose before execution.**`

**Procedure when starting a new lane:**

1. Read all EPIC tasks in the lane's Sequence.
2. Re-read `/home/endlessblink/.claude/plans/gentle-dancing-patterson.md` for fresh architectural context.
3. For each EPIC, draft 3-8 atomic sub-tasks. Use the next available TASK-### IDs (continuing from the highest in this file). Each sub-task gets its own Status Summary table row + full detail entry.
4. Edit the lane's Sequence line to list the new atomic IDs (drop the EPIC IDs).
5. Mark the original EPIC entry header as superseded (e.g., `**Supersedes part of:** TASK-NNN`).
6. Commit the decomposition as its own commit (`docs(plan): atomize Lane P-AI-X`) before starting implementation.
7. Then begin work on the **first** atomic task.

Tasks in already-atomized lanes (Sequence is long, no EPIC marker on task entries) skip this step and go straight to implementation.

13. **LANE P-AI-C — Project model v13 + creation flow** (Phase 0 foundation):
Sequence: TASK-162, TASK-163, TASK-164, TASK-165, TASK-166, TASK-167, TASK-168, TASK-169, TASK-170
Note: 162–165 = schema + migration (formerly EPIC TASK-126). 166–170 = creation flow (formerly EPIC TASK-127). Migration is v12 → v13 (current schema is at v12); adds `transcript`, `captionTracks`, `tracks` fields. Reuses existing `motionCompositions` for Remotion content rather than duplicating.

14. **LANE P-AI-E — NLE Editor view skeleton** (Phase 0/1 — depends on C):
Depends-on: LANE P-AI-C
Sequence: TASK-171, TASK-172, TASK-173, TASK-174, TASK-175, TASK-176
Note: 171–176 = NLE skeleton (formerly EPIC TASK-130 + TASK-131). Day-one scope is scaffold + empty multi-track placeholder + asset panel tabs (no clip rendering, no drag/drop, no transcript yet). State sharing with Recording edit (176) is mostly free since `project` and `applyProjectChange` already live in App.

15. **LANE P-AI-B — Provider abstraction** (Phase 0 — parallel with E):
Sequence: TASK-122, TASK-123, TASK-124, TASK-125

16. **LANE P-AI-D — Transcription** (Phase 1 part 1):
Depends-on: LANE P-AI-B, LANE P-AI-C
Sequence: TASK-128, TASK-129

17. **LANE P-AI-F — Transcript editor + word-cut** (Phase 1 part 2):
Depends-on: LANE P-AI-D, LANE P-AI-E
Sequence: TASK-132, TASK-133

18. **LANE P-AI-G — Captions pipeline** (Phase 1 ship gate):
Depends-on: LANE P-AI-F, LANE P-AI-B
Sequence: TASK-134, TASK-135, TASK-136, TASK-137

19. **LANE P-AI-A — Launchpad foundation** (Phase 1.5 — wires real capabilities):
Depends-on: LANE P-AI-G, LANE P-AI-B
Sequence: TASK-152, TASK-153, TASK-154, TASK-155, TASK-156, TASK-157, TASK-158, TASK-159, TASK-160, TASK-161
Note: 152–157 = launchpad refactor (formerly EPIC TASK-120). 158–161 = settings modal (formerly EPIC TASK-121). The existing AI v1 view (`ai-shell.tsx` from commit 0ce91c6) keeps shipping until 152–157 land.

20. **LANE P-AI-H — Filler & silence removal** (Phase 2):
Depends-on: LANE P-AI-F
Sequence: TASK-138, TASK-139

21. **LANE P-AI-I — Multi-track NLE + generation v1** (Phase 3):
Depends-on: LANE P-AI-E, LANE P-AI-G
Sequence: TASK-184, TASK-185, TASK-186, TASK-205, TASK-206, TASK-214, TASK-215, TASK-216, TASK-217, TASK-218, TASK-219, TASK-220, TASK-221, TASK-222, TASK-223, TASK-188, TASK-189, TASK-190, TASK-191, TASK-192, TASK-193, TASK-194, TASK-195, TASK-196, TASK-197, TASK-198, TASK-199, TASK-200, TASK-201, TASK-202, TASK-203, TASK-204

#### P-AI-I Rebuild Sub-Lanes (canonical execution order)

The previous shared-timeline work (TASK-207 through TASK-213) proved useful concepts but did not establish a correct NLE core. It mixed source time, timeline time, Recording Edit view behavior, NLE view behavior, and preview/export semantics. The rebuild must follow these lanes in order:

1. **Lane 1 — Model contract:** TASK-214 defines the canonical timeline schema and invariants.
2. **Lane 2 — Migration:** TASK-215 canonicalizes legacy projects before views render.
3. **Lane 3 — Resolver:** TASK-216 resolves timeline frame to source media or gap.
4. **Lane 4 — Commands:** TASK-217 owns trim/move/split/delete/ripple mutations.
5. **Lane 5 — Preview:** TASK-218 routes both previews through the resolver.
6. **Lane 6 — Recording Edit:** TASK-219 adapts the canonical timeline for the simple editor.
7. **Lane 7 — NLE:** TASK-220 adapts the canonical timeline for the full editor.
8. **Lane 8 — Visual sync:** TASK-221 proves cross-view behavior with Playwright.
9. **Lane 9 — Export:** TASK-222 makes export use the same resolver/EDL.
10. **Lane 10 — Cleanup:** TASK-223 removes active legacy reads and adds guardrails.

22. **LANE P-AI-J — Auto-assembly + motion graphics + templates** (Phase 4):
Depends-on: LANE P-AI-I, LANE P-AI-D
Sequence: TASK-144, TASK-145, TASK-146

23. **LANE P-AI-K — Deferred AI** (Phase 5+):
Depends-on: LANE P-AI-J
Sequence: TASK-147, TASK-148, TASK-149, TASK-150, TASK-151

Next task when continuing: start TASK-218, "NLE rebuild lane 5: shared playback preview". Do not continue TASK-188 drag, TASK-212 export, or TASK-213 smoke coverage until TASK-214 through TASK-221 are complete.

Decomposed lanes (atomic, ready to execute): **P-AI-C** (TASK-162–170), **P-AI-E** (TASK-171–176), **P-AI-A** (TASK-152–161), **P-AI-I** (TASK-184–223, with TASK-214–223 as the active rebuild gate). All other AI lanes are EPIC — apply the Lane Decomposition Protocol above before starting.

## Tasks

### ~~TASK-001~~ Add repeatable MVP smoke verification script

**Priority:** P1  
**Status:** DONE

#### Context

The MVP flow worked through a one-off Node script, but it was not available as a checked-in command.

#### Completion Notes

- Added `scripts/smoke-mvp.mjs`.
- Added root command `pnpm smoke:mvp`.
- Verified with `pnpm smoke:mvp` and `pnpm test`.

#### Verification

- `pnpm smoke:mvp`
- `pnpm test`

### ~~TASK-002~~ Add Electron UI smoke coverage for preview and export

**Priority:** P2  
**Status:** DONE

#### Context

Automated coverage needed to exercise renderer buttons, preview controls, and export UI state.

#### Completion Notes

- Added root command `pnpm smoke:ui`.
- Added Electron smoke mode that auto-opens a project, waits for video metadata, clicks export, and writes a JSON report.
- Fixed packaged renderer asset paths by setting Vite `base: './'`.

#### Verification

- `pnpm smoke:ui`
- `pnpm test`

### ~~TASK-003~~ Improve Watchpost compatibility for project task tracking

**Priority:** P2  
**Status:** DONE

#### Context

Watchpost was running, but `/api/master-plan` and `/api/status` returned `500` for this repo when queried with the current `cwd`.

#### Completion Notes

- Restored Watchpost's missing `projects.json` registry in the running Watchpost install.
- Confirmed `/api/status` resolves this repo from `cwd`.
- Confirmed `/api/master-plan` returns this `MASTER_PLAN.md` content.

#### Verification

- Watchpost `/api/status` with this repo `cwd`.
- Watchpost `/api/master-plan` with this repo `cwd`.

### ~~TASK-004~~ Package the desktop MVP for local install testing

**Priority:** P2  
**Status:** DONE

#### Context

The app built and ran from source, but packaged local behavior had not been verified.

#### Completion Notes

- Added `pnpm package:linux` to create a local Electron Linux artifact.
- Added `pnpm smoke:package` to launch the packaged artifact against a synthetic project and verify preview/export.
- Verified the packaged artifact launches and exports successfully.

#### Verification

- `pnpm smoke:package`
- `pnpm test`
- Manual packaged app record, preview, and export.

### TASK-005 Document release-ready Linux/X11 verification steps

**Priority:** P3  
**Status:** DONE

#### Context

The README states the MVP scope but does not describe how to verify release readiness.

#### Acceptance Criteria

- Document prerequisites: X11 session, FFmpeg, FFprobe, Node, pnpm.
- Document build, automated tests, and smoke verification commands.
- Document where recordings and `.roughcut` files are saved.
- Document packaged app manual verification steps.

#### Verification

- Confirm every documented command runs on this machine.
- Confirm the packaged artifact path is accurate.
- Run `pnpm test` after documentation changes if command docs or scripts are touched.

### ~~TASK-006~~ Define client-demo roadmap before editing work

**Priority:** P1  
**Status:** DONE

#### Context

The broader goal is not just raw recording. The app should become a Screen Studio alternative on Linux for recording client project demos.

#### Completion Notes

- Reframed the plan around client-ready capture and presentation.
- Prioritized styled exports, cursor overlay, click emphasis, automatic zooms, and manual zooms before generic editing.
- Added the no-mass-building rule so each feature lands in a verifiable step.

#### Verification

- Watchpost can parse this plan.
- The next planned task is independently implementable.

### ~~TASK-007~~ Add export mode selection: raw vs styled

**Priority:** P1  
**Status:** DONE

#### Context

Before styled exports exist, the export path needs an explicit mode so raw export remains available and testable.

#### Acceptance Criteria

- Add an export mode field or option with `raw` and `styled` values.
- Keep `raw` as the default until styled export is complete.
- Store the selected mode only where needed; avoid a project format migration unless required.
- Keep existing export behavior unchanged for `raw`.

#### Completion Notes

- Added explicit export mode validation for `raw` and planned `styled` modes.
- Kept `raw` as the default and preserved byte-for-byte export behavior.
- Added a UI export mode selector with `Raw recording` active and `Styled canvas` reserved for the next task.
- Extended UI/package smoke output to verify raw mode and the styled placeholder.

#### Testing

- Unit test export mode validation or command handling.
- UI smoke still exports in raw mode.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- `pnpm smoke:package`

### ~~TASK-008~~ Add styled 16:9 canvas export preset

**Priority:** P1  
**Status:** DONE

#### Context

Raw screen exports are functional but not client-ready. The first Screen Studio-style feature is exporting the recording inside a polished 16:9 canvas.

#### Acceptance Criteria

- Export a recording into a 16:9 output canvas.
- Add configurable background color, padding, rounded corners, and shadow.
- Preserve raw export behavior.
- Use FFmpeg filters or a similarly testable export path.
- Keep the preset minimal: one good default, not a full theme system.

#### Completion Notes

- Added `styled` export mode that renders through FFmpeg instead of copying the source file.
- Styled export creates a 1920x1080 canvas with full-screen fitting, pastel gradient background, rounded corners, and soft shadow.
- Refined the first visual pass after manual review to remove the fragile border treatment and move closer to Screen Studio's background, padding, rounded corner, shadow, and zoom/crop model.
- Replaced the color-bar styled smoke fixture with a synthetic product UI so export visuals are easier to judge.
- Visually checked the rendered export frame through Playwright screenshot capture against both synthetic and real recording output before asking for another manual review.
- Added `pnpm smoke:styled-export` to generate a synthetic project, export styled output, and validate 1920x1080 dimensions with FFprobe.
- Enabled the `Styled canvas` option in the export mode selector.

#### Testing

- Unit test styled export command/filter construction.
- Smoke test styled export creates a valid MP4.
- FFprobe validation confirms expected output dimensions.

#### Verification

- `pnpm test`
- `pnpm smoke:styled-export`
- `pnpm smoke:ui`
- `pnpm smoke:package`
- Playwright screenshot of extracted styled export frame.
- Manual packaged export still needed: confirm the styled output visually looks client-ready.

### ~~TASK-009~~ Add styled export UI preview metadata

**Priority:** P2  
**Status:** DONE

#### Context

Users need to know whether they are exporting raw or styled output before clicking export.

#### Acceptance Criteria

- Show the selected export mode in the UI.
- Show styled preset basics: output size, background, padding.
- Do not build a full visual editor yet.

#### Completion Notes

- Added mode-specific export copy below the export selector.
- Raw mode explains it preserves the original recording unchanged.
- Styled mode summarizes the current preset: 1920x1080, full-screen fit, pastel background, rounded screen, and soft shadow.
- UI smoke now switches to styled mode to verify styled preset metadata, then restores raw mode before exporting.

#### Testing

- Renderer smoke verifies the styled mode UI appears.
- Existing raw export UI still works.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- `pnpm --filter @rough-cut/desktop test`
- Manual packaged check of export mode display still recommended before release.

### ~~TASK-010~~ Add cursor telemetry recording foundation

**Priority:** P1  
**Status:** DONE

#### Context

For client demos, cursor presentation should be rendered as an overlay instead of relying only on raw cursor pixels captured by FFmpeg.

#### Acceptance Criteria

- Capture cursor position samples while recording.
- Store cursor samples in the `.roughcut` project or a referenced sidecar file.
- Include timestamps aligned to the recording start time.
- Keep screen-only recording working if telemetry capture fails.

#### Completion Notes

- Added cursor position sampling during recording through Electron `screen.getCursorScreenPoint()`.
- Normalized display coordinates into captured-video pixels using the display origin and scale factor.
- Persisted cursor events in the recording asset metadata and wrote a `.cursor.json` sidecar next to the recording.
- Kept telemetry failures non-fatal so screen recording can still stop and save.
- Extended MVP smoke to verify reopened projects contain cursor telemetry.

#### Testing

- Unit test cursor sample normalization and timestamp alignment.
- Service smoke verifies a recording produces cursor telemetry.
- Project reopen test verifies cursor telemetry is readable.

#### Verification

- `pnpm test`
- `pnpm smoke:mvp`
- `pnpm --filter @rough-cut/desktop test`
- Manual packaged recording: confirm project contains cursor telemetry without breaking preview/export.

### ~~TASK-011~~ Add cursor overlay export rendering

**Priority:** P1  
**Status:** DONE

#### Context

Cursor telemetry becomes useful when styled export can render a clean cursor overlay.

#### Acceptance Criteria

- Render cursor overlay in exported video using recorded cursor samples.
- Keep overlay style simple and legible.
- Allow export without cursor overlay if telemetry is missing.
- Preserve raw export behavior.

#### Completion Notes

- Styled export now consumes recorded cursor samples and renders an outlined cursor overlay before canvas styling.
- Cursor filters are skipped when telemetry is missing, preserving existing styled exports without cursor data.
- Dense cursor telemetry is sampled before building FFmpeg filters so export command size stays bounded.
- Styled export smoke now includes synthetic cursor telemetry for export-path verification.
- Visually checked extracted cursor-overlay frames, including a Playwright screenshot capture.

#### Testing

- Unit test cursor overlay filter/render input generation.
- Smoke test export succeeds with cursor telemetry present.
- Smoke test export succeeds with cursor telemetry absent.

#### Verification

- `pnpm test`
- `pnpm smoke:styled-export`
- `pnpm smoke:mvp`
- `pnpm smoke:ui`
- `pnpm --filter @rough-cut/desktop test`
- Playwright screenshot of extracted styled export cursor frame.
- Manual packaged export with real cursor telemetry still recommended before release.

### ~~TASK-012~~ Add cursor overlay preview rendering

**Priority:** P2  
**Status:** SUPERSEDED → TASK-025

#### Supersede Notes

Cursor preview is no longer treated as a standalone task. The preview/export parity principle (see Direction) folds it into TASK-025 "Unified preview that mirrors styled export." Per-feature previews keep diverging from the export pipeline as new presentation features land; one shared preview renderer that consumes the same `ProjectDocument` and reproduces the styled-export composition is more durable.

#### Context

Users need preview confidence before exporting cursor overlays.

#### Acceptance Criteria

- Render cursor overlay over the video preview using project telemetry.
- Keep playback performant for normal recordings.
- Hide overlay if telemetry is unavailable.

#### Testing

- Renderer/unit test maps cursor sample time to preview position.
- UI smoke verifies overlay container exists for telemetry projects.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged preview check.

### TASK-013 Add click emphasis telemetry and export rendering

**Priority:** P2  
**Status:** DONE

#### Context

Client demos benefit from visible clicks, but this should build on cursor telemetry rather than become a separate capture system. Capture also unlocks click-precise auto-zoom suggestions instead of teleport-only.

#### Acceptance Criteria

- Capture click timestamps and positions during recording.
- Render simple click emphasis in styled export.
- Keep click emphasis optional/data-driven when click telemetry is unavailable.

#### Completion Notes

- New `apps/desktop/src/main/recording/xinput-button-listener.mjs` (X11): spawns `xinput test-xi2 --root`, parses cooked `ButtonPress` (type 4) / `ButtonRelease` (type 5) blocks, maps X11 button numbers (1=left, 2=middle, 3=right; scrolls dropped) to schema `MouseButton` (0/1/2). Emits via callback. Graceful no-op when xinput is missing — logs once and recording continues with position-only events.
- `apps/desktop/src/main/recording/recording-session.mjs` wires the listener into start/stop, normalizes coords through the existing `normalizeCursorPoint`, computes wall-clock frame from `Date.now() - startedAt`.
- Auto-zoom now uses real `down`/`up` events instead of falling through to the teleport heuristic. `extractTriggerEvents` in `packages/timeline-engine/src/auto-zoom.ts` extended with `extractDragTriggers` — pairs each `down` with the matching `up`, emits a synthetic trigger at the drag midpoint when duration > 6 frames AND displacement > teleport threshold. Highlights and window-drags share input shape, so one detector covers both.
- xinput is X11-only; TASK-026 (Wayland pivot) will swap the listener with a portal/libinput equivalent. Encapsulated in one file for that swap.
- TASK-042 completed the remaining visual emphasis work: preview renders click rings from recorded `type: down` telemetry, styled export emits matching ASS click emphasis, and click-only telemetry still creates a subtitle layer so clicks render even when move samples are absent.

#### Testing

- Unit tests in `packages/timeline-engine/src/auto-zoom.test.ts` cover three drag scenarios: long click-and-drag produces marker shifted toward midpoint; short click does not double-emit; long-hold-without-movement does not emit a drag trigger.
- `recording-session.test.mjs` 7/7 pass with the new `buttonListenerFactory` injection point.

#### Verification

- `pnpm test` — all packages green.
- `pnpm smoke:mvp` / `smoke:ui` / `smoke:styled-export` — all pass.
- `apps/desktop/src/renderer/src/styled-preview.test.mjs` covers active click rings and canvas draw calls.
- `apps/desktop/src/main/export-service.test.mjs` covers ASS click emphasis generation without move telemetry.
- `pnpm --filter @rough-cut/desktop test` — 170/170 pass on 2026-05-08.
- `pnpm smoke:package-recording-flow` — pass on 2026-05-08 as part of the webcam PiP polish verification.

### ~~TASK-014~~ Add manual zoom marker data model

**Priority:** P1  
**Status:** DONE

#### Context

Manual zooms should be stored as simple project markers before any complex editing UI is added.

#### Acceptance Criteria

- Add zoom marker schema with start time, end time, target center, and scale.
- Store markers in `.roughcut` projects.
- Validate project files with and without zoom markers.

#### Completion Notes

- Audit found the schema already existed: `ZoomMarkerSchema` at `packages/project-model/src/schemas.ts:72-81` with `id`, `startFrame`, `endFrame`, `kind ('auto'|'manual')`, `strength (0–1 unit)`, `focalPoint{x,y}`, `zoomInDuration`, `zoomOutDuration`. Markers persist at `assets[].presentation.zoom.markers` via `ZoomPresentationSchema`, validated end-to-end on every save and load. The v1→v2 migration at `migrations.ts:20-46` already backfills `focalPoint` and durations for legacy files.
- Note on naming: the schema uses `strength` (normalized 0–1) rather than a literal `scale` factor. Treated as a semantic-naming gap, not a missing field — recorded here so a future task can rename if needed without re-discovering it.
- Added the missing regression-locking tests so the existing guarantees can't silently regress when manual-zoom UI work lands.

#### Testing

- `packages/project-model/src/schemas.test.ts` — new `ZoomMarker` describe block: positive end-to-end via `validateProject` (recording asset with a manual marker), JSON round-trip, plus seven negative cases against `ZoomMarkerSchema` (missing `focalPoint` / `startFrame` / `zoomInDuration`, invalid `kind`, `strength` outside 0–1, `focalPoint` coords outside 0–1, negative `startFrame`, non-integer `zoomInDuration`).
- `packages/project-model/src/migrations.test.ts` — new v1→v2 cases asserting that legacy markers missing `focalPoint`/`zoomInDuration`/`zoomOutDuration` get backfilled with defaults `{0.5, 0.5}`, `9`, `9`, and that pre-existing values are preserved.
- `apps/desktop/src/main/project-files.test.mjs` — new round-trip case saving a project with a manual marker via `saveProjectFile` and re-opening with `openProjectFile`, asserting deep-equal preservation.

#### Verification

- `pnpm test` — project-model: 91/91 pass (was 80, +11 new). Desktop: 30/30 pass (was 29, +1 new).
- `pnpm smoke:mvp` — full record → save → reopen → export pipeline: `ok: true`.

### ~~TASK-015~~ Add manual zoom marker UI controls

**Priority:** P1  
**Status:** DONE

#### Context

The first manual zoom UI should be simple and useful, not a full timeline editor.

#### Acceptance Criteria

- Add controls to create, list, and remove zoom markers.
- Use current playback time for marker creation.
- Store changes in the project file.

#### Completion Notes

- Added `ZoomMarkerPanel` inside `ProjectPreview` next to the export controls (`apps/desktop/src/renderer/src/main.tsx`). Reads markers from the active recording asset, shows playback timecode, exposes Add and Remove actions, and persists optimistically through the existing `window.roughCut.saveProject` IPC.
- Lifted `currentTime` from `VideoPreview` via a new optional `onCurrentTimeChange` callback so the panel sees the live playback position without restructuring video state ownership.
- Added pure helpers in a new `apps/desktop/src/renderer/src/zoom-markers.mjs` (with a `.d.mts` companion for renderer typing): `getPrimaryRecordingAsset`, `canAddMarkerAt`, `addManualMarkerAt`, `removeMarker`, `listMarkers`. Helpers reuse `createZoomMarker` and `createDefaultRecordingPresentation` from `@rough-cut/project-model`, are immutable, and return the original document reference on no-op so React reference checks work.
- Add button is disabled when there is not enough room before the end of the recording (`startFrame + 15 frames > asset.duration`); endFrame is clamped to asset duration so newly added markers always fit.
- Extended `Window.roughCut` type in `main.tsx` with the previously-undeclared `saveProject` entry (it was exposed in preload but missing from the renderer-side type).

#### Testing

- New `apps/desktop/src/renderer/src/zoom-markers.test.mjs` (node:test, registered in `apps/desktop/package.json`'s test script) — 14 cases covering primary asset selection, the `canAddMarkerAt` gate, `addManualMarkerAt` validity / clamping / no-op behavior, sort order across multiple inserts, and `removeMarker` filter+no-op semantics.
- Extended `runRendererUiSmoke` in `apps/desktop/src/main/index.mjs` with a `Zoom markers` panel-presence wait; result JSON now includes `hasZoomMarkerPanel: true`.

#### Verification

- `pnpm test` — full suite green: project-model 91/91, desktop 44/44 (was 30, +14 zoom-markers cases).
- `pnpm typecheck` — clean across all packages.
- `pnpm smoke:ui` — UI smoke passes; result JSON: `hasZoomMarkerPanel: true`, `hasExportResult: true`.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- **Pending: manual packaged-app round-trip** — open a real recording, pause mid-playback, click Add marker, confirm row appears, save and reopen the project, confirm the marker persists, click Remove, confirm it disappears, reopen, confirm it stays gone. Flip status to DONE only after this manual step lands.

### ~~TASK-016~~ Add smooth manual zoom export rendering

**Priority:** P1  
**Status:** DONE

#### Context

Manual zoom markers need to affect final exported output with smooth transitions.

#### Acceptance Criteria

- Export styled video with smooth zoom in/out animation from markers.
- Clamp zoom targets inside source bounds.
- Preserve cursor overlay compatibility.

#### Completion Notes

- Added `apps/desktop/src/main/zoom-filter.mjs`: `buildZoomFilter({ markers, sourceWidth, sourceHeight })` composes a single FFmpeg `zoompan` filter from a markers array using nested `if(lt(on,…))` branches. Each marker contributes a 3-phase ramp (smootherStep ramp-in → hold → smootherStep ramp-out) on `z`, plus matching `x`/`y` expressions that derive the crop window from `focalPoint` and the live `zoom` variable, with edge clamping so the window never extends past source bounds.
- Reused the same constants and easing as `packages/timeline-engine/src/zoom-transform.ts` (`STRENGTH_TO_SCALE_DELTA = 1.5`, Ken Perlin smootherStep `6t⁵−15t⁴+10t³`). Math agreement with the JS path is sub-pixel — zoom-export and the future unified preview (TASK-025) will track each other.
- `buildStyledExportArgs` now accepts `sourceWidth`/`sourceHeight`/`zoomMarkers`. When markers are present it swaps the static `crop=iw*1:ih*1,scale=…` step for `zoompan=…,scale=…` (zoompan outputs at source dims so the existing canvas-fit scale step keeps source aspect ratio). Empty-marker case is byte-for-byte unchanged.
- `getPrimaryRecording` exposes `zoomMarkers` from `asset.presentation?.zoom?.markers`. `exportStyledProjectToMp4` threads them plus source dimensions into the args builder.
- FFmpeg expression sanity test before code: `on` (not `n`) is the output frame counter inside zoompan; `between` is not supported but `lt`/`gt`/nested-if works; `pow(t, k)` is fine; `zoom` is accessible inside `x`/`y` expressions; comma escaping is unnecessary when filter strings reach FFmpeg via `spawn`.

#### Testing

- New `apps/desktop/src/main/zoom-filter.test.mjs` — 7 golden-string cases: empty markers, dimension validation, single-marker structure (range conditionals + smootherStep + clamped axis expressions), strength scaling, off-center focal points, two non-overlapping markers sorted by `startFrame`, output `s=` matches source dims.
- Extended `apps/desktop/src/main/export-service.test.mjs` with two new cases asserting `zoompan=…` appears (and the static `crop=iw*1` is replaced) when markers are present, and that the static path is preserved when markers are empty.
- Extended `scripts/smoke-styled-export.mjs` with a second export against the same synthetic project plus a manual zoom marker; FFprobe confirms 1920×1080 output and the bytes differ from the no-marker baseline (105,484 vs 27,226 bytes — the zoomed render encodes more detail per pixel).

#### Verification

- `pnpm test` — full suite green: project-model 91/91, desktop 53/53 (was 44, +9 new: 7 zoom-filter + 2 zoompan in export-service).
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:styled-export` — both no-zoom and zoom-marker scenarios pass; both produce 1920×1080 MP4s; cursor overlay assertion still passes for the no-zoom baseline.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- **Pending: manual packaged-app round-trip** — record (or open an existing recording), add a manual zoom marker via TASK-015's panel at ~2 s, export styled, scrub the resulting MP4, confirm a smooth zoom-in around 2 s, hold at full zoom, then a smooth zoom-out. Flip status to DONE only after this manual step lands.

### ~~TASK-017~~ Add zoom preview playback approximation

**Priority:** P2  
**Status:** SUPERSEDED → TASK-025

#### Supersede Notes

Zoom preview is folded into TASK-025 "Unified preview that mirrors styled export" for the same reason as TASK-012. A unified Canvas/WebGL preview that mirrors the FFmpeg styled-export pipeline serves zoom, cursor, and future presentation features off the same source of truth. If a faster bridge is needed before TASK-025 lands, this task can be reactivated as a Canvas2D zoom-only stop-gap.

#### Context

Before exporting, users should be able to approximate how manual zooms will feel in preview.

#### Acceptance Criteria

- Apply zoom marker transforms during preview playback.
- Keep preview close enough to export behavior for timing decisions.
- Avoid overbuilding a full render engine.

#### Testing

- Unit test active zoom marker selection by playback time.
- UI smoke verifies preview can load a project with zoom markers.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged preview check against exported result.

### ~~TASK-018~~ Add automatic zoom suggestion engine

**Priority:** P2  
**Status:** DONE

#### Context

Automatic zooms should be suggestions based on cursor activity, not irreversible edits.

#### Acceptance Criteria

- Analyze cursor dwell, click events, or movement clusters.
- Generate candidate zoom markers.
- Avoid excessive or jittery suggestions.
- Keep the engine deterministic for testing.

#### Completion Notes

- Audit found the underlying engine already implemented and tested in `packages/timeline-engine/src/auto-zoom.ts` (`generateAutoZoomMarkers` + `filterAutoMarkersAgainstManual`) but never wired into the app. TASK-018 ships the integration: two small renderer-side modules that expose the engine via Wayland-ready abstractions.
- New `apps/desktop/src/renderer/src/cursor-data.mjs` (+ `.d.mts`) — accessors `getCursorEvents`, `getCursorClickEvents`, `getCursorMoveEvents`, `getRecordingFps`, `getRecordingSourceSize`. Wraps `metadata.cursorEvents` access; today reads the array directly, on Wayland (TASK-026) the implementation behind these names changes without touching call sites.
- New `apps/desktop/src/renderer/src/auto-zoom-suggestions.mjs` (+ `.d.mts`) — `generateSuggestionsForProject(document, options?) → { candidates, filtered, existingManual }`. Composes `generateAutoZoomMarkers` + `filterAutoMarkersAgainstManual` + the new accessors. Defaults intensity to `presentation.zoom.autoIntensity ?? 0.5`. Deterministic.
- The recorder still emits move-only events today (no clicks). `generateAutoZoomMarkers` falls back to teleport detection (large normalized cursor jumps above 0.2-0.4 threshold depending on intensity) when no clicks are present. Auto-zoom works against move-only data; suggestions become more click-precise once click capture lands (TASK-013 precondition).

#### Testing

- `apps/desktop/src/renderer/src/cursor-data.test.mjs` — 12 cases covering empty/null documents, recording asset selection, click/move filtering, fps fallback (asset metadata → settings.frameRate → default), source size fallback (asset metadata → settings.resolution → default).
- `apps/desktop/src/renderer/src/auto-zoom-suggestions.test.mjs` — 7 cases covering empty cursor events, teleport-derived candidates with `kind: 'auto'`, manual-marker conflict filtering, intensity override, determinism across repeated calls, fallback to default intensity.
- Both registered in `apps/desktop/package.json` test script.

#### Verification

- `pnpm test` — desktop 101/101 (was 82, +19 new across cursor-data + auto-zoom-suggestions). project-model 91/91.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:mvp` and `pnpm smoke:ui` — unchanged (TASK-018 ships dormant code paths only; nothing wired into runtime flow until TASK-019 adds UI).
- No manual packaged-app verification needed — engine + abstractions only. Manual verification belongs in TASK-019 (review/apply UI).

### ~~TASK-019~~ Add automatic zoom review/apply flow

**Priority:** P2  
**Status:** DONE

#### Context

Automatic zoom suggestions need a user-facing review step before they become project markers.

#### Acceptance Criteria

- Add UI to generate automatic zoom suggestions.
- Let the user apply or discard suggestions.
- Applied suggestions become normal manual zoom markers.

#### Completion Notes

- New `AutoZoomSuggestionsPanel` component co-located in `apps/desktop/src/renderer/src/main.tsx` (mirrors the `ZoomMarkerPanel` pattern). Renders inside `ProjectPreview` after the existing zoom markers panel.
- "Generate suggestions" button calls `generateSuggestionsForProject(document)` from TASK-018's wrapper. After generation: shows the filtered candidate list (auto markers that don't overlap manual ones), plus a count of conflicts so the user knows when their manual markers blocked auto candidates.
- Per-row Apply / Discard actions:
  - **Apply** → calls `applySuggestionAsManual(document, suggestion)` (new helper in `zoom-markers.mjs`) which creates a fresh-id manual marker preserving the suggestion's frame range, focal point, strength, and durations. Persists optimistically through the existing `window.roughCut.saveProject` IPC. Removes the suggestion from local state on success.
  - **Discard** → removes from local state only; no project mutation. Suggestions are transient (not persisted), so a future regenerate produces fresh candidates.
- All actions disabled while a save is in flight (`isSaving` flag); save errors surface inline and revert the optimistic update.
- Empty / pre-generation states show contextual hints so the panel is self-documenting.

#### Testing

- New `applySuggestionAsManual` cases in `apps/desktop/src/renderer/src/zoom-markers.test.mjs` — fresh-id behavior, field preservation, sort-by-startFrame, no-op when no recording asset.
- `runRendererUiSmoke` extended to wait for the "Auto-zoom suggestions" panel header. Result JSON gains `hasAutoZoomSuggestionsPanel: true`.

#### Verification

- `pnpm test` — desktop 104/104 (was 101, +3 applySuggestionAsManual cases). project-model 91/91.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:ui` — passes; result JSON: `hasAutoZoomSuggestionsPanel: true`, `hasZoomMarkerPanel: true`, `hasStyledPreviewCanvas: true`, `hasExportResult: true`.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- **Pending: manual packaged-app round-trip** — open a real recording, click "Generate suggestions", confirm a list appears (or the empty-state message if cursor data didn't yield any), apply one or more, verify the markers persist after close+reopen, regenerate to confirm conflict-with-manual filtering works. Today's auto-zoom uses teleport-detection only (no click telemetry yet); suggestion quality on a real recording is the manual-verification signal.

### TASK-020 Add countdown before recording

**Priority:** P2  
**Status:** DONE

#### Context

Client demo recording needs a short preparation window so recordings start cleanly.

#### Acceptance Criteria

- Add a configurable or fixed countdown before capture starts.
- Make it clear when countdown is active vs recording active.
- Ensure cancellation during countdown is safe.

#### Testing

- Unit test countdown state transitions if state is extracted.
- UI smoke verifies recording can still start after countdown.

#### Verification

- `pnpm test`
- Manual packaged recording: confirm countdown and resulting file start are acceptable.

### TASK-021 Add clear recording indicator and elapsed time

**Priority:** P2  
**Status:** DONE

#### Context

During client-project recording, the user needs confidence that capture is active.

#### Acceptance Criteria

- Show a clear recording indicator.
- Show elapsed recording time.
- Keep stop action obvious.

#### Testing

- UI smoke verifies recording state display changes when mocked or smoke-triggered.

#### Verification

- `pnpm test`
- Manual packaged recording: confirm indicator is visible and accurate enough.

### TASK-022 Add open recording/project folder action

**Priority:** P2  
**Status:** DONE

#### Context

After recording or export, users need fast access to client-demo files.

#### Acceptance Criteria

- Add an action to open the current project or recording folder.
- Disable or explain the action when no folder is available.

#### Testing

- Main-process test verifies folder-open command calls the shell safely.
- UI smoke verifies the action is visible after opening a project.

#### Verification

- `pnpm test`
- Manual packaged check: action opens the expected folder.

### TASK-023 Add recent projects or recordings list

**Priority:** P2  
**Status:** DONE

#### Context

Client project work often involves reopening the last few recordings quickly.

#### Acceptance Criteria

- Track recently opened or created `.roughcut` projects.
- Show a simple recent list on app start.
- Handle missing files gracefully.

#### Testing

- Unit test recent-project persistence and missing-file handling.
- UI smoke verifies a recent project can be reopened.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged check across app restarts.

### TASK-024 Add microphone recording foundation

**Priority:** P2  
**Status:** DONE

#### Context

Client demos often need narration. Microphone support should come after the core visual presentation path is stable.

#### Acceptance Criteria

- Detect available microphone input or document the selected input path.
- Record microphone audio with screen capture.
- Keep screen-only recording available.
- Save audio metadata in the project.

#### Completion Notes (foundation)

- Added PulseAudio microphone source enumeration via `pactl list sources short`, filtering monitor sources out of the mic picker.
- Added renderer controls for optional microphone capture: screen-only remains the default, and selected mic source is passed through renderer → preload → main → recording session.
- Threaded `micSource` into the existing FFmpeg PulseAudio input path and persisted audio metadata on the saved recording asset.
- Extended `smoke:mvp` with opt-in `ROUGH_CUT_SMOKE_MIC=1` audio verification that skips cleanly when no mic source exists and asserts an audio stream when one is recorded.

#### Testing

- Unit test FFmpeg audio argument construction.
- Service smoke can skip clearly when no microphone input is available.

#### Verification Notes

- `pnpm typecheck` — clean across 5 packages.
- `pnpm test` — project-model 91/91, effect-registry 57/57, timeline-engine 172/172, frame-resolver 20/20, desktop 109/109.
- `pnpm smoke:mvp` — default screen-only path still passes.
- `ROUGH_CUT_SMOKE_MIC=1 pnpm smoke:mvp` — recorded with `alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo`, persisted mic metadata, and FFprobe found an audio stream in the MP4.
- `pnpm smoke:ui` and `pnpm smoke:styled-export` — pass.
- Manual app verification: mic recording works on the target Linux setup.

#### Verification

- `pnpm test`
- Manual packaged recording with mic input on the target Linux setup.

### ~~TASK-025~~ Unified preview that mirrors styled export

**Priority:** P1  
**Status:** DONE  
**Supersedes:** TASK-012, TASK-017

#### Context

Until preview matches export, every presentation feature ships blind: users add zoom markers, cursor styling, and (eventually) click emphasis without seeing how the styled export will look. Per-feature previews (TASK-012 cursor, TASK-017 zoom) would each chase a moving target as the export pipeline grows. This task replaces both with one preview renderer that consumes the same `ProjectDocument` and reproduces the styled-export composition deterministically. The preview becomes the source of truth for "what will the export look like." Sequencing: lands AFTER TASK-016 (smooth manual zoom export) so the export semantics are stable, and BEFORE TASK-018/019 (auto-zoom UX) so users can evaluate suggestions visually.

#### Completion Notes (MVP)

- `apps/desktop/src/renderer/src/styled-preview.mjs` (+`.d.mts`) — pure helpers: `cursorAtFrame` (linear interpolation between bracketing telemetry events, off-screen pass-through, sorts unsorted input, skips invalid events) and `drawCursorPath` (Canvas2D rendering of the same vector polygon the styled export's ASS layer produces).
- `apps/desktop/src/renderer/src/main.tsx` `VideoPreview` — rebuilt as hidden `<video>` source + visible `<canvas>` overlay. A `requestAnimationFrame` loop calls `resolveFrame(project.document, currentFrame)` from `@rough-cut/frame-resolver` to get the canonical `cameraTransform = { scale, offsetX, offsetY }`, applies it via `ctx.translate + ctx.scale + drawImage(video) + drawCursorPath`. Cursor is drawn under the same transform, so it scales with the video pixels (matches export and Screen Studio / FocuSee behavior). Existing playback controls (play/pause/seek slider) act on the hidden video, no rewiring.
- `styles.css` — `.styledPreview .hiddenSource` positions the `<video>` off-screen but live (Chromium keeps decoding for `drawImage`); `.styledPreviewCanvas` carries the canvas styling: pastel linear-gradient background approximating the export's `geq` gradient, 26px border-radius matching the export's rounded corners, soft `box-shadow` matching the export's blurred drop shadow.
- `runRendererUiSmoke` — new `waitFor` for `canvas.styledPreviewCanvas`; result JSON gains `hasStyledPreviewCanvas`.

#### Out of scope (deferred to later refactor)

- Pixel-perfect parity with the export's `geq` per-pixel gradient and `boxblur` shadow — CSS approximation lands in MVP.
- Wiring the export side to also consume `resolveFrame` (the architectural keystone is already designed in `packages/frame-resolver/src/resolve-frame.ts:226`; export currently builds FFmpeg filters directly from the same underlying math).
- Click effects in preview — folds in once TASK-013 click telemetry/effect renders.

#### Acceptance Criteria

- Preview renders the same styled composition the export produces: pastel background, rounded screen, soft shadow, full-screen fit, cursor overlay (TASK-011), manual zoom transitions (TASK-016), and any future presentation features that land in styled export.
- Preview consumes the canonical `ProjectDocument` (no separate preview-only state).
- Preview stays in sync with playback time and seek; performance must hold for typical client-demo recordings.
- Preview must be deterministic — given the same project at the same playback frame, preview pixels and export pixels match within a defined tolerance (exact match where possible, sub-pixel for filters that differ between Canvas/WebGL and FFmpeg).

#### Testing

- Unit tests for the rendering description (the shared spec consumed by both preview and export).
- Visual snapshot test: take a frame from preview at time T, take the corresponding export frame at the same T, assert structural similarity above a threshold.
- Renderer smoke loads a project with a manual zoom marker and a cursor sample, verifies the preview canvas reflects both.
- Existing UI smoke continues to pass.

#### Verification

- `pnpm test` — desktop 74/74 (was 64, +10 styled-preview cases). Project-model 91/91.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:ui` — passes; result JSON: `hasStyledPreviewCanvas: true`, `hasZoomMarkerPanel: true`, `hasExportResult: true`.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- `pnpm smoke:styled-export` — both no-zoom and zoom-marker scenarios still pass; fps and cursor regressions still green.
- **Pending: manual packaged-app check** — open a recording with a manual zoom marker, scrub through the marker range, confirm the preview canvas zooms smoothly, the cursor tracks correctly under zoom, and the preview matches the eventual export semantically. Flip status to DONE only after this manual step lands.

#### Implementation Notes (for future planning)

- Likely a Canvas2D or WebGL surface drawn over the existing `<video>` element, transformed each `requestAnimationFrame`.
- Best implemented as a shared "render description" (a JSON-able pipeline spec) consumed by both the renderer's preview surface and the main process's FFmpeg filter graph builder. Keeps both runtimes from diverging.
- The cursor overlay rendering already exists in the styled-export FFmpeg path (TASK-011). The render description should capture that same logic so preview can replicate it.

### TASK-026 Switch capture pipeline to xdg-desktop-portal + PipeWire (Wayland)

**Priority**: P3-LOW
**Priority:** P1  
**Status:** PLANNED  
**Supersedes-on-completion:** TASK-010 (cursor telemetry recording), TASK-011 (cursor overlay export), and the entire reliable-cursor-overlay architecture

#### Context

X11 is being deprecated by major Linux distributions in favor of Wayland. The current capture stack (FFmpeg `x11grab` + Electron `screen.getCursorScreenPoint()` + xdotool fallback for cursor + ASS-burned-in cursor for export) is X11-specific and won't work on native Wayland. Even on X11 today, the cursor pipeline has been a long string of integration bugs (clamping, `getCursorScreenPoint()` regression, off-screen pass-through, fps mismatches).

The Wayland-native answer is fundamentally simpler: use **xdg-desktop-portal's ScreenCast API** (with **PipeWire** as the transport). The compositor draws the cursor into the captured video stream itself. The app receives a stream with cursor already rendered, at the compositor's full visual fidelity. No cursor telemetry, no separate overlay, no clamping concerns, no zoom-aware cursor scaling logic — the cursor is just pixels in the source video.

**Priority update (2026-05-04)**: this task was investigated as the fix for an intermittent captured-tear artifact in recordings. Empirically, **disabling NVIDIA "Allow Flipping" in `nvidia-settings`** fully eliminated the tear on the user's hardware (X11 + KDE Plasma + NVIDIA). The Wayland migration is therefore no longer urgent for capture-quality reasons. Remaining motivation: future-proofing against X11 deprecation. Treat as P1 long-term but not blocking current recording quality.

#### Acceptance Criteria

- New capture path uses xdg-desktop-portal's `org.freedesktop.portal.ScreenCast` interface to obtain a PipeWire stream node ID.
- FFmpeg input switches from `-f x11grab -i …` to `-f pipewiregrab -i <node-id>` (or equivalent), or a Node-side reader bridges PipeWire to FFmpeg via a pipe.
- Capture works on both GNOME Wayland and KDE Wayland (the two dominant compositors). Verify on at least one.
- Cursor is included in the captured stream by default (compositor renders it).
- Existing record → save → export pipeline still works end-to-end with the new capture source. Existing `.roughcut` projects remain valid.
- Old x11grab path stays as a fallback for X11 sessions until Wayland support is verified production-ready.

#### Implications for existing code

- `apps/desktop/src/main/recording/recording-session.mjs` — `getCursorPoint`, `sampleCursor`, the cursor sidecar JSON, and the entire cursor telemetry layer become obsolete on Wayland. Either gate them behind an "X11 mode" flag or remove them once Wayland is the default.
- `apps/desktop/src/main/recording/xdotool-cursor.mjs` — obsolete; remove when X11 path retires.
- `apps/desktop/src/main/export-service.mjs` — `buildCursorAss` and the ASS subtitles cursor overlay become unnecessary because the cursor is already in the source video. Cursor styling features (highlights, click effects, zoom-aware sizing) move to a video post-processing layer (FFmpeg overlays or canvas renderer in the unified preview).
- TASK-025 (unified preview) — already canvas-based. Once the source video has the cursor pre-rendered, the cursor-drawing logic in `styled-preview.mjs` is no longer needed for fidelity, but stays useful for cursor effects/highlights.
- Project schema's `cursorEvents` field becomes legacy. Migration: keep reading old `.roughcut` files; new recordings don't populate it.

#### Testing

- Unit test for the portal request flow with a mocked DBus client.
- Integration test that records a few seconds of a synthetic surface via PipeWire → FFmpeg, asserts a valid MP4 is produced.
- Manual verification on GNOME Wayland and KDE Wayland separately.

#### Verification

- `pnpm test`
- `pnpm smoke:mvp` — recording produces a valid MP4 on Wayland.
- Manual record + export with cursor visibly tracking across monitors via the compositor's own cursor rendering.

#### Risks

- xdg-desktop-portal ScreenCast requires user-granted permission per session; first-launch UX needs a clear consent flow.
- Some compositors restrict portal capture (especially with multi-monitor selection); test on the user's actual setup before committing the rewrite.
- FFmpeg's `pipewiregrab` filter is relatively new; lock the FFmpeg version in package metadata and document the minimum.
- Keeping the X11 path alongside Wayland adds complexity. Decide whether to maintain both, gate by session type (`$XDG_SESSION_TYPE`), or drop X11 once Wayland is verified.

### TASK-027 Cursor-follow zoom (preview + export, parity-preserving)

**Priority:** P1  
**Status:** DONE

#### Context

Schema's `ZoomPresentation.followCursor: true` and the engine's cursor-follow path (`getZoomTransformAtFrame` with `getCursorPosition` option) have been in place since TASK-018 territory but unwired in both preview and export. TASK-027 lights them up on both sides while preserving the preview/export parity principle. By design, only **auto markers** follow the cursor — the engine respects manual markers' user-picked focal as static, since the user explicitly chose where to zoom.

#### Acceptance Criteria

- Preview canvas applies cursor-follow during auto marker hold phases.
- Styled export applies the same cursor-follow at pixel parity with preview.
- Manual markers stay at their user-picked focal in both surfaces.
- No schema migration needed.

#### Completion Notes

- New `apps/desktop/src/main/zoom-sendcmd.mjs` — pre-computes per-frame crop windows in JS via `getZoomTransformAtFrame` (with cursor-follow options) and emits both an FFmpeg filter fragment + a sendcmd file. The math runs once during export setup; preview consumes the same `getZoomTransformAtFrame` directly. Sub-pixel parity guaranteed by both sides using the same source code.
- `apps/desktop/src/main/export-service.mjs` swapped from `zoompan` (static expressions) to `crop=...,sendcmd=f=...,scale=...`. The crop filter accepts per-frame parameter updates via sendcmd (verified `T` timeline flag on all four crop params in FFmpeg 6.1.1).
- Preview wiring in `apps/desktop/src/renderer/src/main.tsx` passes a `getCursorPosition` callback to `resolveFrame` per rAF tick. The callback returns normalized cursor coords from `cursorAtFrame(events, frame)`. Auto markers pan automatically.
- Manual markers continue to use static focal — the engine's `getMarkerFocalPoint` (`zoom-transform.ts:147-182`) intentionally skips cursor-follow for `kind !== 'auto'`. Locked in via dedicated test.
- Old `zoom-filter.mjs` + `zoom-filter.test.mjs` deleted; `zoom-sendcmd.test.mjs` ports the relevant cases plus 5 new ones for the cursor-follow specifics.
- FFmpeg sanity test ran first (mirroring TASK-016 risk-mitigation pattern): one-off `ffmpeg -lavfi color=...,sendcmd=f=...,scale=...` confirmed `crop x VALUE` syntax works at the user's FFmpeg version (6.1.1) before any helper code landed.
- **Follow-up fix (during manual verification)**: cursor-follow was unreachable through the UI because `applySuggestionAsManual` was rewriting applied auto-suggestions to `kind: 'manual'`, and the engine only follows cursors on `kind: 'auto'` markers. Renamed to `applySuggestion` and now preserves `kind: 'auto'` so cursor-follow fires. The original dedup-on-re-suggest behavior is preserved by widening `filterAutoMarkersAgainstManual` → `filterAutoMarkersAgainstExisting` to consider all kinds, not just manual.
- **Follow-up fix (2026-05-06)**: cursor-follow zoom now follows the professional phase model. Ramp-in targets the marker/action focal instead of live cursor drift, hold keeps smoothing but applies final visible-window containment through `holdEnd - 1`, and zoom-out starts from the final contained hold focal before easing back toward center while ignoring later cursor movement.

#### Testing

- New `zoom-sendcmd.test.mjs` — 9 cases: empty markers, dimension/fps/totalFrames validation, line-per-frame timestamp emission, frame-0 initial crop covers full source for outside-marker frames, hold-phase static crop math at scale=2.5/focal=center, cursor-following auto marker pans during hold, manual markers do not follow cursor, sendcmd content trailing-newline format.
- Updated `export-service.test.mjs` — replaces `zoompan=` assertions with `crop=...,sendcmd=...` assertions; "no zoom layer" case asserts neither `zoompan=` nor `sendcmd=` appears.
- `smoke-styled-export.mjs` continues to pass — manual marker scenario (static focal) produces a valid 1920×1080 / 30 fps MP4 distinct from no-marker baseline; bytes shifted (101820 → 125050) because sendcmd adds per-frame command processing.

#### Verification

- `pnpm test` — 101/101 desktop pass (was 104, net -3 because zoom-filter's 12 cases were replaced by zoom-sendcmd's 9; 2 export-service cases swapped 1:1).
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:styled-export` — both no-zoom and zoom-marker scenarios pass; cursor visibility check at marker boundary still passes.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- `pnpm smoke:ui` — `hasZoomMarkerPanel: true`, `hasAutoZoomSuggestionsPanel: true`, `hasStyledPreviewCanvas: true` all pass.
- `pnpm test` — full workspace suite passes after the 2026-05-06 ramp-in/hold continuity fix.
- `node scripts/analyze-zoom-jumpcuts.mjs "/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-05-06T04-42-01-002Z.roughcut"` — extracted all three zoom sections and reported no visual jump flags or transform discontinuity flags after the fix.
- `pnpm --filter @rough-cut/timeline-engine test` — 184/184 pass after the final hold-containment and zoom-out reveal fix.
- `pnpm --filter @rough-cut/timeline-engine build` — clean.
- `pnpm --filter @rough-cut/desktop test` — 160/160 pass, including export crop containment at the hold/zoom-out boundary.
- **Pending: manual packaged-app verification** — record while moving cursor across the screen, generate auto-zoom suggestions, apply one, watch the canvas preview during playback (focal should pan with cursor during auto-marker hold), export styled and confirm same behavior in the MP4. Manual zoom markers should stay statically centered on their focal.

### ~~TASK-028~~ Add aspect ratio presets for styled exports

**Priority:** P1  
**Status:** DONE

#### Context

Screen Studio, FocuSee, and Recordly all treat social aspect ratios as first-class export settings. Rough Cut's styled export was locked to a 1920×1080 canvas, making vertical or square client-demo outputs impossible without downstream transcoding.

#### Acceptance Criteria

- Project settings persist an aspect ratio preset with `auto` as the default.
- Styled preview offers the same preset choices used by export.
- Styled export outputs the selected canvas ratio while fitting source video safely inside it.
- Raw export remains unchanged.
- Cursor and video continue to share the same source-to-canvas transform; no clamping or independent cursor crop logic.

#### Completion Notes

- Added `ProjectSettings.aspectRatio` with presets: `auto`, `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `4:5`.
- Added shared helpers in `packages/project-model/src/aspect-ratio.ts` to compute even styled canvas dimensions from the selected ratio and source dimensions.
- Bumped schema to v11 and added a v10→v11 migration that backfills `aspectRatio: 'auto'`.
- Styled export now computes its canvas dimensions from project settings before building the FFmpeg filter graph.
- Renderer preview now has an aspect ratio selector, persists changes, sizes the canvas to the selected ratio, and fits the source recording into that canvas using the same transform order as export.
- Manual app verification confirmed styled export completes successfully after changing the export flow default away from the source file name.

#### Verification

- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/project-model build`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm typecheck`
- `pnpm test`
- `pnpm smoke:styled-export`
- `pnpm smoke:ui`
- Manual app verification: open/create a recording, adjust aspect ratio/styled export flow, and confirm styled MP4 export completes.

### ~~TASK-029~~ Build editor shell and screen presentation controls

**Priority:** P1  
**Status:** DONE

#### Context

The one-page MVP UI stopped scaling once mic capture, aspect ratios, zoom controls, styled export, and screen presentation settings coexisted. Users also expected rounded screen/card styling and a camera area after seeing the styled canvas controls.

#### Acceptance Criteria

- Replace the stacked MVP page with a real editor shell: top recording bar, central preview stage, right inspector, lower zoom/review area.
- Move aspect ratio into the inspector rather than the export row.
- Add screen presentation controls for padding, corner radius, and shadow.
- Preview clips the screen recording to rounded corners and reflects padding/shadow controls.
- Styled export consumes the same presentation values for padding, corner radius, and shadow.
- Explicitly defer webcam PiP with a clear disabled/coming-next section.

#### Completion Notes

- Added a studio-style editor shell with top record/open controls, mic strip, centered preview stage, right-side inspector, and timeline/review dock.
- Added inspector controls for canvas aspect ratio, screen padding, corner radius, and shadow size/toggle.
- Reused existing `RecordingPresentation.background` fields for persistence; new recording defaults now start with padded rounded screen styling.
- Preview now draws the styled canvas background, screen shadow, rounded screen clip, zoomed source video, and cursor inside the same transform.
- Styled export now uses project presentation values instead of hardcoded 90% scale / 26px corner radius / fixed shadow.
- Camera/webcam remains intentionally deferred and labeled as coming next.
- Export flow now defaults to a distinct `-export.mp4` output name, rejects source-overwrite attempts early, and streams FFmpeg progress into the existing export status display.
- Cursor-follow zoom was stabilized with calmer default smoothing, a target deadband for tiny cursor jitter, and fixed zoom-in targeting.

#### Verification

- `pnpm typecheck`
- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`
- `pnpm smoke:styled-export`
- Manual app verification: export flow completes; preview/export controls are usable enough to move to regression hardening.

### ~~TASK-030~~ Add cursor-follow zoom regression fixtures

**Priority:** P1  
**Status:** DONE

#### Context

Cursor-follow zoom is sensitive to fast cursor movement, edge positions, zoom-out timing, and preview/export math drift. Recent fixes improved this with edge-snap focus and zoom-out freeze, but coverage is still mostly unit-level and synthetic.

#### Acceptance Criteria

- Add deterministic cursor telemetry fixtures that cover fast horizontal movement, fast diagonal movement, near-edge movement, pause/resume, and off-screen multi-monitor pass-through.
- Assert the cursor remains inside the zoomed viewport during hold phases when it is inside the source frame.
- Assert zoom-out freezes the focal point instead of chasing late cursor movement.
- Assert generated FFmpeg `sendcmd` crop windows stay finite, bounded, and free of sudden frame-to-frame jumps above an explicit threshold.
- Include at least one regression that fails with the old hard visibility-guard snapping behavior.

#### Completion Notes

- Added deterministic cursor-follow fixture coverage in `packages/timeline-engine/src/zoom-transform.test.ts` for fast horizontal movement, fast diagonal movement, near-edge movement, pause/resume, and off-screen multi-monitor coordinates.
- Added a viewport-containment helper so fixtures assert in-source cursor positions remain visible during hold phases once the camera has had time to follow.
- Kept the existing zoom-out freeze regression and added coverage that off-screen cursor coordinates produce finite, source-bounded focal points rather than clamping raw cursor positions.
- Added `apps/desktop/src/main/zoom-sendcmd.test.mjs` crop-window parsing and a regression fixture that asserts generated FFmpeg `sendcmd` windows remain finite, bounded by source dimensions, and smooth frame-to-frame under continuous cursor movement with pause/resume.

#### Verification

- `pnpm --filter @rough-cut/timeline-engine test` — 178/178 pass.
- `pnpm --filter @rough-cut/desktop test` — 117/117 pass.

### TASK-031 Add preview/export parity regression snapshots

**Priority:** P1  
**Status:** DONE

#### Context

The renderer preview and styled export both consume shared zoom math, but they still have separate drawing/export pipelines. Regressions can appear as cursor/zoom mismatch even when unit tests pass.

#### Acceptance Criteria

- Add a small deterministic project fixture with source dimensions, cursor telemetry, zoom markers, aspect ratio, and screen presentation values.
- Capture expected per-frame render descriptions from the shared resolver at representative frames: before zoom, ramp-in, hold, fast cursor pan, zoom-out, and after zoom.
- Assert renderer preview transform inputs and export crop/sendcmd generation use equivalent source-to-canvas geometry for those frames.
- Store snapshots as readable JSON, not binary screenshots, unless screenshot parity becomes necessary later.

#### Verification

- `pnpm --filter @rough-cut/frame-resolver test -- -u` — updated the preview render-description inline snapshot.
- `pnpm --filter @rough-cut/frame-resolver test` — 21/21 pass.
- `pnpm --filter @rough-cut/desktop test` — 118/118 pass.
- `pnpm typecheck` — pass.

### ~~TASK-032~~ Add packaged-app visual regression smoke

**Priority:** P2  
**Status:** DONE

#### Context

Editor shell, aspect ratio controls, screen padding/radius/shadow controls, and open-project behavior are user-visible and currently rely on manual packaged-app checks. A lightweight packaged visual smoke would catch broken UI wiring earlier.

#### Acceptance Criteria

- Extend packaged smoke coverage to launch the app, open a synthetic `.roughcut` project from the recordings directory, and capture a visual smoke screenshot.
- Exercise aspect ratio, screen padding, corner radius, and shadow controls through the packaged app path.
- Assert the open-project dialog defaults to the recordings/project directory where feasible, or add a test seam for that default path.
- Keep the smoke deterministic and headless-safe; do not require interactive desktop input in CI-style runs.

#### Verification

- `pnpm smoke:ui` — pass; opens a synthetic project, exercises presentation controls, exports raw, and captures `ui-smoke.png`.
- `pnpm smoke:package` — pass; builds the Linux package, verifies packaged module resolution, exercises the same controls, exports raw, and captures `ui-smoke.png`.

#### Completion Notes

- Extended the existing renderer smoke hook to drive aspect ratio, screen padding, corner radius, and shadow size controls, then report their final values.
- Added screenshot capture to UI/package smoke runs via `ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH`, with byte-size assertions so the visual artifact is actually written.
- Fixed the ad-hoc Linux package layout by installing workspace package entries for `@rough-cut/project-model` and `@rough-cut/timeline-engine`; the packaged app now resolves the same bare imports used by export and zoom code.

### ~~TASK-033~~ Define recording-flow solidity checklist

**Priority:** P1  
**Status:** DONE

#### Context

Before adding more Screen Studio-style features, define what "solid recording flow" means in observable terms. This prevents vague confidence claims and gives every later recording change a fixed acceptance gate.

#### Acceptance Criteria

- Document the canonical record -> stop -> remux -> save -> reopen -> preview -> export flow.
- Define pass/fail checks for video duration, fps, audio presence when enabled, cursor sync, click events, project metadata, and export validity.
- Split checks into automated, packaged-app manual, and environment/setup checks.
- Add known machine prerequisites, including X11, xdotool, FFmpeg/FFprobe, PulseAudio/PipeWire, and NVIDIA Allow Flipping guidance.

#### Verification

- Added `docs/recording-flow-solidity.md` as the recording-flow release-candidate gate.
- Reviewed the checklist against current smoke scripts and project setup notes.

#### Completion Notes

- Defined the canonical record -> stop -> remux -> save -> reopen -> preview -> export flow.
- Split solidity checks into environment, automated, artifact, manual packaged-app, failure triage, and final decision gates.
- Explicitly scoped out Wayland, system audio, capture target picker, pause/resume/cancel, trimming, and cut editing so they do not block judging the current Linux/X11 MVP flow.

### ~~TASK-034~~ Add real-recording regression harness

**Priority:** P1  
**Status:** DONE

#### Context

Current smoke coverage records short synthetic captures, but confidence in the real flow needs repeatable validation against actual desktop interaction: cursor motion, clicks, optional mic, preview, and styled export.

#### Acceptance Criteria

- Add a harness that records a fresh desktop session with scripted cursor/click activity where feasible.
- Verify the saved `.roughcut` contains usable video metadata, cursor move events, click events, and optional mic metadata.
- Reopen the project, render preview smoke state, export styled MP4, and FFprobe the output.
- Keep the harness safe to skip clearly when required system tools or audio devices are unavailable.

#### Verification

- `pnpm smoke:real-recording` — pass on the target Linux/X11 machine.
- Real recording produced 82 cursor events, including 76 move events and 6 button events from scripted cursor/click activity.
- The harness reopened the saved `.roughcut`, exported raw MP4, exported styled MP4, ran renderer smoke against the real project, and captured a UI screenshot.

#### Completion Notes

- Added `scripts/smoke-real-recording.mjs` and root command `pnpm smoke:real-recording`.
- The harness records a real X11 desktop slice, drives the cursor with `xdotool`, captures click/drag events through the existing `xinput` listener when available, then validates project metadata and exports.
- The renderer smoke path is enabled by default and can be skipped with `ROUGH_CUT_REAL_SMOKE_UI=0` for faster diagnosis.
- The command is opt-in and not part of normal `pnpm test`, because it moves the real cursor and depends on a live X11 desktop.

### ~~TASK-035~~ Add recording health diagnostics report

**Priority:** P1  
**Status:** DONE

#### Context

When recording issues happen, the app currently logs details but does not summarize capture health. A solid flow needs a clear report for dropped frames, fps drift, audio stream presence, remux success, cursor sample cadence, and FFmpeg warnings.

#### Acceptance Criteria

- Produce a structured diagnostics report after each recording.
- Include FFmpeg warnings, frame-drop indicators, measured duration, expected vs actual fps, audio stream status, cursor event counts, click event counts, and remux/export paths.
- Surface the report in logs and save it next to the recording for later inspection.
- Keep recording success independent from diagnostics generation failures.

#### Verification

- `pnpm --filter @rough-cut/desktop test` — 126/126 pass.
- `pnpm smoke:mvp` — pass; asserts diagnostics report is written and reports healthy video/cursor data.
- `pnpm smoke:real-recording` — pass; asserts diagnostics report is written for a real X11 recording with cursor/click activity.

#### Completion Notes

- Added `apps/desktop/src/main/recording-diagnostics.mjs` to write a `.diagnostics.json` sidecar next to each MP4.
- Diagnostics include recording paths, expected vs probed duration, video/audio stream status, cursor event counts, button event counts, remux warning lines, frame-drop markers, and queue-backpressure markers.
- `stopRecordingAndCreateProject` now captures remux logs and writes diagnostics after project save; diagnostics failures are logged but do not block a valid recording.
- `pnpm smoke:mvp` and `pnpm smoke:real-recording` now fail if the diagnostics report is missing or does not contain healthy video/cursor data.

### TASK-036 Add long-recording stability smoke

**Priority:** P1  
**Status:** DONE

#### Context

Short smokes catch wiring failures, but a client demo recorder must stay stable beyond a few seconds. Long-running capture is where audio drift, frame drops, cursor lag, and finalization problems usually appear.

#### Acceptance Criteria

- Add an opt-in long smoke that records for a configurable duration, defaulting to a practical local value.
- Probe the output for duration, fps, audio stream consistency when enabled, and successful MP4 remux/finalization.
- Reopen the resulting project and run styled export on it.
- Make the command opt-in so normal test runs stay fast.

#### Verification

- `pnpm test`
- Long smoke passes on the target machine for an agreed duration before calling recording flow solid.

#### Completion Notes

- Added `scripts/smoke-long-recording.mjs` and root command `pnpm smoke:long-recording`.
- The long smoke reuses the real X11 recording harness, defaults to 60 seconds, disables UI smoke by default, and keeps duration configurable with `ROUGH_CUT_LONG_SMOKE_DURATION_MS`.
- Added stricter diagnostics assertions to `scripts/smoke-real-recording.mjs` for minimum media duration, expected FPS, and optional audio stream presence via `ROUGH_CUT_REAL_SMOKE_EXPECT_AUDIO=1`.

### TASK-037 Add packaged recording acceptance runbook

**Priority:** P1  
**Status:** DONE

#### Context

Automated checks are necessary but not enough for user-visible capture quality. The packaged app needs a small, repeatable acceptance runbook that confirms the same flow a real user will perform.

#### Acceptance Criteria

- Add a documented packaged-app acceptance script for record, stop, preview, generate zoom suggestions, export raw, export styled, reopen, and inspect folder outputs.
- Include expected visual checks for cursor sync, click alignment, zoom behavior, mic audio, and export playback.
- Record environment details for each acceptance run.
- Mark remaining risks explicitly when a check is not automated.

#### Verification

- `pnpm smoke:package`
- Manual packaged-app acceptance run completed and documented.

#### Completion Notes

- Added `docs/packaged-recording-acceptance.md` with packaged-app preconditions, automated warm-up commands, manual record/stop/preview/export/reopen steps, visual checks, environment record fields, and failure handling guidance.
- Linked the runbook from `docs/recording-flow-solidity.md` so the solidity gate has a single manual packaged-app reference.
- The runbook records residual risks explicitly instead of treating automated smoke coverage as sufficient for user-visible capture quality.

### TASK-038 Add system audio capture controls

**Priority:** P1  
**Status:** DONE

#### Context

Screen Studio-style demos often need browser/app audio in addition to microphone narration. FFmpeg already has partial system-audio plumbing; the app needs source enumeration, UI, session wiring, metadata, and verification.

#### Acceptance Criteria

- Enumerate available monitor/system audio sources separately from microphones.
- Add UI controls to enable system audio and choose its source.
- Thread selected system audio into recording session capture.
- Persist audio metadata so reopened projects show what was captured.
- Keep screen-only and mic-only recording unchanged.

#### Verification

- Unit tests for audio source parsing and FFmpeg argument construction.
- Opt-in smoke verifies an audio stream exists when system audio is enabled.
- Manual packaged-app recording with system audio.

#### Completion Notes

- Added PulseAudio monitor-source enumeration via `listPulseAudioSystemAudioSources`, exposed through main/preload IPC and renderer controls.
- Recording start now accepts `systemAudioSource`, passes it into the existing FFmpeg PulseAudio monitor input path, and persists `audio.systemAudioSource` metadata on saved projects.
- System audio can be recorded alone or mixed with microphone audio through the existing FFmpeg `amix` path.
- Added opt-in smoke support with `ROUGH_CUT_SMOKE_SYSTEM_AUDIO=1 pnpm smoke:mvp`; the run records a monitor source, asserts persisted metadata, and verifies an audio stream exists.
- Added system-audio coverage for source filtering, FFmpeg args, recording session capture options, and mixed mic/system metadata.

#### Verification Notes

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 135/135 pass.
- `ROUGH_CUT_SMOKE_SYSTEM_AUDIO=1 pnpm smoke:mvp` — pass; recorded `alsa_output.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo.monitor`, persisted `audio.systemAudioSource`, and FFprobe found an audio stream.

### TASK-039 Add capture target picker

**Priority:** P1  
**Status:** DONE

#### Context

The current flow records the primary X11 display. Screen Studio users expect to choose screen, window, or region before recording.

#### Acceptance Criteria

- Add a capture-target selection model for display, window, and region.
- Start with full-display and region support if window capture is too platform-specific.
- Persist selected capture geometry in recording metadata.
- Keep cursor coordinates and export transforms aligned with the chosen source region.

#### Verification

- Unit tests for geometry normalization.
- Smoke test records a bounded region and verifies output dimensions.
- Manual packaged-app check on the target multi-monitor setup.

#### Completion Notes

- Added full-display vs region capture selection in the renderer recording strip.
- Added `captureRegion` support to recording start options; region coordinates are normalized relative to the selected display, converted to absolute X11 grab geometry, and passed to FFmpeg as the capture size/display offset.
- Persisted resolved display/capture metadata on saved recording assets so reopened projects retain the bounded-source geometry used at capture time.
- Added MVP smoke support with `ROUGH_CUT_SMOKE_REGION=1`; the smoke asserts project metadata and FFprobe output dimensions match the requested bounded region.
- Window capture remains intentionally deferred because X11/Wayland window capture behavior is platform-specific; this task ships full-display plus region support.

#### Verification Notes

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 139/139 pass.
- `ROUGH_CUT_SMOKE_REGION=1 ROUGH_CUT_SMOKE_REGION_WIDTH=240 ROUGH_CUT_SMOKE_REGION_HEIGHT=180 pnpm smoke:mvp` — pass; FFmpeg captured `240x180`, metadata persisted region details, and export succeeded.

### TASK-040 Add pause, resume, and cancel recording

**Priority:** P1  
**Status:** DONE

#### Context

The current recording flow supports start and stop. A Screen Studio-like flow needs safe cancellation for bad takes and pause/resume for demos with setup gaps.

#### Acceptance Criteria

- Add cancel during recording that stops capture and removes incomplete project outputs safely.
- Add pause/resume behavior or an explicit scoped alternative if FFmpeg pause is not viable.
- Preserve cursor/audio/video synchronization across the chosen behavior.
- Make interrupted sessions recoverable and avoid corrupt project files.

#### Verification

- Unit tests for session state transitions.
- Smoke test cancel leaves no misleading saved project.
- Manual packaged-app check for pause/resume or approved alternative.

#### Verification Notes

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 168/168 pass.
- `pnpm smoke:recording-flow-ui` — pass; save/review path still opens the post-recording workspace.
- `pnpm smoke:recording-flow-cancel` — pass; cancel returns to idle with no saved message, review workspace, or video.
- `pnpm smoke:package-recording-flow-cancel` — pass; packaged Linux app starts recording, cancels, returns idle, and does not preserve a review/output state.
- `pnpm smoke:package-recording-flow` — pass; packaged save/review path still persists camera-warning metadata and opens review.
- Pause/resume remains an explicit scoped alternative: segment pause is pending, and the user-visible safe behavior is cancel-and-discard for bad takes.

### TASK-041 Add post-recording next-action flow

**Priority:** P1  
**Status:** DONE

#### Context

After stop, users should not wonder what happened or where the file is. The app should guide them to preview, export, retake, or open the output folder.

#### Acceptance Criteria

- Show a clear post-recording success state.
- Offer primary actions: preview/edit, export styled, export raw, open folder, and retake.
- Reuse or complete TASK-022 folder opening and TASK-023 recent project foundations.
- Avoid hiding errors when remux/save/project creation fails.

#### Verification

- UI smoke verifies post-recording actions are visible after a saved project.
- Manual packaged-app flow from stop to exported file.

### TASK-042 Render click emphasis in preview and export

**Priority:** P1  
**Status:** DONE  
**Related:** TASK-013

#### Context

Click telemetry is already captured. The missing user-visible piece is a tasteful click emphasis effect that appears in both preview and styled export with parity.

#### Acceptance Criteria

- Render click rings or ripples in canvas preview using recorded click events.
- Render the same effect in styled export.
- Keep the effect optional and styleable later.
- Preserve preview/export parity and cursor sync.

#### Verification

- 2026-05-06: Added canvas preview click rings from recorded `type: down` telemetry and matching styled-export ASS click emphasis in the cursor subtitle layer. Click-only telemetry now still creates a subtitle layer, so click emphasis exports even when there are no move samples.
- `pnpm --filter @rough-cut/desktop typecheck`
- `node --test apps/desktop/src/renderer/src/styled-preview.test.mjs apps/desktop/src/main/export-service.test.mjs`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:styled-export`
- Unit tests for click effect timing and frame selection.
- Styled export smoke includes synthetic click events and asserts export succeeds.
- Manual packaged-app recording with visible clicks.

### TASK-043 Add webcam PiP presentation controls

**Priority:** P1  
**Status:** DONE

#### Context

Camera capture and export paths have started, but the UI still treats webcam PiP as unfinished. Screen Studio-style demos need controllable camera placement and styling.

#### Acceptance Criteria

- Show camera preview/setup before recording when a camera is selected.
- Add PiP controls for position, size, shape, and roundness.
- Persist camera presentation settings in the project.
- Apply settings consistently in preview and styled export.

#### Verification

- 2026-05-06: Added main-editor Inspector controls for linked-camera projects: show/hide, position, shape, size, and roundness. Controls persist to `recordingAsset.presentation.camera`, which is already consumed by canvas preview and styled export.
- 2026-05-06: Extended `smoke:ui` assertions to exercise camera PiP controls on a synthetic linked-camera project, but the run is currently blocked by the separate pre-record instance changes forcing `mode=recorder` even for project-path UI smoke.
- 2026-05-07: Added a pre-record Camera PiP setup preview card that appears when a camera source is selected, explaining that the webcam is recorded as an editable separate track. Packaged recording-flow smoke now selects the simulated camera device and asserts the setup card appears before recording starts.
- 2026-05-07: `pnpm --filter @rough-cut/desktop typecheck` — pass.
- 2026-05-07: `pnpm --filter @rough-cut/desktop test` — 168/168 pass.
- 2026-05-07: `pnpm smoke:ui` — pass; exercises persisted camera position, shape, and size controls on a synthetic linked-camera project.
- 2026-05-07: `pnpm smoke:styled-export` — pass; includes synthetic linked-camera styled export.
- 2026-05-07: `pnpm smoke:package-recording-flow` — pass; packaged app shows the camera setup card, preserves screen recording when the simulated camera is busy, and surfaces the camera warning in review.
- 2026-05-07: Real webcam PiP manual verification is blocked on this machine because `/dev/video*` devices are unavailable; the packaged gate uses `ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH=/dev/video9999` to verify the selected-camera setup and degraded screen-only path.
- 2026-05-08: Replaced the static setup thumbnail with a real `getUserMedia` webcam preview in the pre-record Camera PiP card, added Electron media permission handling, and close the setup panel before starting capture so the preview stream releases the webcam before FFmpeg opens it.
- 2026-05-08: Re-verified `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, and `pnpm smoke:package-recording-flow` — pass.
- 2026-05-08: Pre-record mic, system audio, and camera selections now persist in local storage and are restored when the saved device is still available. Dropdown labels are shortened, metadata-only V4L2 camera nodes are filtered out, and the Camera PiP setup copy is reduced to concise preview/editability text.
- 2026-05-08: Re-verified `pnpm --filter @rough-cut/desktop typecheck` and `pnpm smoke:package-recording-flow` — pass.
- Unit tests for camera frame geometry.
- UI smoke verifies controls exist when camera metadata is present.
- Manual packaged-app recording with webcam PiP.

### TASK-044 Add cursor style controls

**Priority:** P2  
**Status:** DONE

#### Context

The cursor overlay works, but Screen Studio users expect presentation controls such as cursor size, outline/shadow, and click style.

#### Acceptance Criteria

- Add cursor presentation settings to the project model.
- Add UI controls for cursor size and basic visual style.
- Apply settings in preview and styled export.
- Preserve defaults for old projects.

#### Verification

- Project migration/schema tests.
- Preview/export smoke with non-default cursor settings.

### TASK-045 Add background style presets

**Priority:** P2  
**Status:** DONE

#### Context

Current background controls are numeric. Presets make polished outputs faster and closer to Screen Studio's one-click style flow.

#### Acceptance Criteria

- Add named background presets for common demo looks.
- Let users apply a preset without losing the ability to tune padding, radius, and shadow.
- Persist the resulting presentation values in the existing project format where possible.
- Keep preview and export visually aligned.

#### Verification

- 2026-05-06: Added reusable dark background presets, wired the Background board swatches to persist full presentation styles, and made preview/export use the preset colors instead of a hardcoded light gradient.
- Unit tests for preset-to-style conversion.
- UI smoke applies a preset and exports styled output.

### TASK-046 Add trim start and end controls

**Priority:** P1  
**Status:** DONE

#### Context

Most demo recordings need at least head/tail cleanup. This should land before a broader timeline editor.

#### Acceptance Criteria

- Add start and end trim values to the project/timeline model.
- Add simple UI controls to set trim start/end from playback time.
- Apply trims in preview, raw export where feasible, and styled export.
- Keep original source recording untouched.

#### Verification

- 2026-05-08: Existing implementation verified as complete. The editor exposes start/end trim controls in the Recording inspector, draggable timeline trim handles, hidden start/end restore actions, preview playback bounded to the visible range, raw trim export support, styled trim export support, and linked-camera trim alignment.
- `apps/desktop/src/renderer/src/timeline-rail.test.mjs` covers lane placement relative to trimmed clips.
- `apps/desktop/src/main/export-service.test.mjs` covers raw/styled trim export behavior and export eligibility.
- `apps/desktop/src/main/project-files.test.mjs` covers persisted head/tail trim metadata from primary clips.
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`

### TASK-047 Add simple cut removal flow

**Priority:** P2  
**Status:** DONE

#### Context

After head/tail trim, the next editing primitive is removing a dead section from the middle without building a full timeline editor.

#### Acceptance Criteria

- Add a minimal cut-range data model.
- Add UI to mark a range and remove it from playback/export.
- Apply cuts in preview and styled export.
- Keep cut operations non-destructive and reversible at the project level.

#### Verification

- 2026-05-08: Added non-destructive recording `cutRanges` to the project model, schema validation, renderer helpers, Recording inspector controls to mark/remove/clear middle cuts, preview playback that skips removed ranges, and styled-export video/camera cut filtering. Raw export is intentionally disabled for cut projects so it cannot silently copy the uncut source.
- `apps/desktop/src/renderer/src/cut-ranges.test.mjs` covers cut creation, restore, visible duration, and source-frame mapping.
- `apps/desktop/src/main/export-service.test.mjs` covers styled export filter args for removed middle ranges.
- `apps/desktop/src/main/project-files.test.mjs` covers persisted cut ranges and visible duration.
- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`

### TASK-048 Add optional webcam PiP recording and export

**Priority:** P1  
**Status:** DONE

#### Context

The project model and frame resolver already support linked camera assets and camera PiP presentation metadata, but the desktop app did not capture webcam media, link it into saved recordings, draw it in preview, or include it in styled exports.

#### Acceptance Criteria

- Enumerate Linux V4L2 camera devices and expose them in the recording strip.
- Capture the selected webcam alongside screen recording as a separate media file.
- Remux and validate camera media on stop, then link it via `cameraAssetId`.
- Draw camera PiP in the styled preview using existing camera presentation defaults.
- Include camera PiP in styled exports for unedited linked-camera projects.
- Preserve screen-only recording as the default path when no camera is selected.

#### Verification

- `pnpm --filter @rough-cut/desktop test` — 171/171 pass.
- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm smoke:package-recording-flow` — pass.
- `ROUGH_CUT_REAL_SMOKE_CAMERA_DEVICE_PATH=/dev/video0 ROUGH_CUT_REAL_SMOKE_DURATION_MS=2500 ROUGH_CUT_REAL_SMOKE_UI=0 pnpm smoke:real-recording` — pass on 2026-05-08; verified real screen+webcam capture, linked camera asset metadata, saved project reopen, and styled export.

#### Implementation Notes

- Added V4L2 camera source enumeration and optional Camera recording controls.
- Added a separate FFmpeg V4L2 capture process that writes camera video alongside the screen recording.
- Saved camera recordings as linked `video` assets with `metadata.isCamera = true` and `recording.cameraAssetId`.
- Preview now loads the linked camera media and draws it as a rounded PiP over the styled canvas.
- Styled export now accepts unedited linked-camera projects, adds the camera as a second FFmpeg input, rounds it, and overlays it on the final canvas.
- Real camera recordings include camera preroll offset metadata; styled export eligibility now accepts full-length camera clips aligned by `metadata.sourceInFrames`.

### TASK-049 Build Screen Studio-style editor UI foundation

**Priority:** P1  
**Status:** DONE

#### Context

The current UI grew from MVP controls: one top strip, one preview panel, and a dense inspector. It is now limiting product development because recording setup, post-recording review, timeline edits, presentation styling, exports, camera PiP, cursor effects, and future cuts all compete for the same space. Before adding more controls, the app needs a Screen Studio-like foundation that separates capture, review, timeline, and styling workflows.

#### Acceptance Criteria

- Replace the MVP shell with a durable editor layout: capture bar, central stage, timeline/review rail, right inspector, and export/actions area.
- Keep record/stop/open/export flows available during the migration.
- Make primary state obvious: idle, starting, recording, stopping, saved, error, camera degraded.
- Avoid hiding preview when a secondary feature like camera capture fails.
- Preserve responsive behavior for laptop-sized screens.

#### Breakdown

- Inventory current renderer state and split it into stable layout regions: app shell, capture command area, stage, bottom rail, inspector, and status/toast area.
- Build the shell skeleton first with existing controls moved into their future regions, without changing recording/export behavior.
- Promote the styled preview canvas to the central stage and keep it visible for saved/degraded projects.
- Add a state banner model for idle, starting, recording, stopping, saved, camera degraded, audio degraded, and fatal error.
- Move export/open-folder/retake-style actions into a consistent actions area instead of leaving them scattered in panels.
- Add responsive rules for narrower laptop windows: inspector can stack/collapse, stage remains primary, and recording controls remain reachable.
- Keep visual language close to Screen Studio/Recordly: calm dark shell, large preview, compact controls, readable labels, and opinionated defaults.
- Defer new editing features; this task is layout migration and state clarity only.

#### Verification

- 2026-05-05: Implemented dark Recordly-informed editor shell with capture bar, left tool rail, central styled preview, visual timeline rail, export-only right sidebar, state banner, and sidebar-owned background/timeline/inspector boards. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm smoke:ui`, and earlier `pnpm smoke:recording-flow-ui`.
- UI smoke covers idle, recording, stopping, saved preview, and error/degraded states.
- Manual packaged-app check records, stops, previews, and exports from the new shell.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:recording-flow-double-stop`

### TASK-050 Add Screen Studio-style pre-record panel

**Priority:** P1  
**Status:** DONE

**Ownership:** Reassigned to this session for final verification and closure.

#### Context

Recording options are currently inline and crowded. Screen Studio and Recordly both separate pre-record setup from the editor: a focused surface appears before capture starts, lets the user choose what to record, checks inputs, and then transitions into the compact in-recording HUD. Rough Cut needs the same product shape before adding more capture options.

#### Acceptance Criteria

- Add a recording setup modal/panel launched from the capture bar before recording starts.
- Group the first version around the capture decision, input summary, countdown, and primary Record action.
- Show source availability and clear degraded states, e.g. camera busy or no system audio source.
- Keep screen-only recording as the safe default.
- Persist recent source choices where appropriate.
- Start recording from the setup surface without blocking the editor shell.

#### Breakdown

- Create a setup entry point from the capture bar: `New recording` opens the setup surface, while quick record can reuse the last valid setup later.
- Model the setup surface after Screen Studio's new recording modal and Recordly's launch HUD: compact, modal/floating, and focused on starting a capture rather than editing presentation.
- Show the currently selected capture target summary, audio summary, camera summary, countdown value, and save destination.
- Keep deeper target picking, audio/camera preflight detail, and smoke hardening split into TASK-054 through TASK-056 so this foundation stays small.
- Add preflight copy for countdown, save destination, and expected degraded behavior before pressing Record.
- Persist safe recent choices only when the selected source still exists; missing devices should fall back to screen-only/no-camera.
- Keep the setup surface non-blocking: cancel returns to editor, start transitions to recording state, failures return with inline diagnostics.
- Avoid advanced camera PiP styling here; the setup surface chooses inputs, not presentation layout.

#### Verification

- 2026-05-05: Added first pre-record panel foundation. Top Record now opens a modal setup surface with capture/audio/camera summaries, target selection, input toggles/selectors, cancel, and Start recording. The existing capture internals are unchanged; Start recording calls the same `startRecording` IPC path. Updated recording-flow UI smoke to start through `[data-ui-region="pre-record-panel"]` and `[data-recording-start="pre-record"]`.
- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 151/151 pass.
- `pnpm smoke:recording-flow-ui` — pass; report includes `hasPreRecordPanel: true` and saved recording state.
- 2026-05-06: Pivoted the pre-record surface to the standalone compact launcher window. App launch now starts in recorder mode, `Open editor` activates the full editor window, `Start recording` transitions to a compact active-recording HUD, and stopping opens the saved project in editor mode after the saved state renders.
- 2026-05-06: Removed the oversized capture cards from the launcher in favor of a compact capture dropdown row, matching the smaller Screen Studio/Recordly-style direction.
- 2026-05-06: Verification pass: `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, and `pnpm smoke:recording-flow-ui` all pass.
- 2026-05-06: For Linux/X11 `x11grab`, normal visible Electron controls are captured as pixels. Updated recorder mode to hide the launcher before starting FFmpeg, wait briefly for the compositor/X server to repaint, and expose recording status/control through tray menu plus global shortcuts instead of a captured floating HUD.
- 2026-05-06: Current controls: Stop recording via tray or `CommandOrControl+Shift+R`; Restart recording via tray or `CommandOrControl+Shift+N`. True pause/resume remains pending because it should be implemented as segment-based recording/stitching, not by freezing the FFmpeg process.
- 2026-05-09: Final packaged verification passed with `pnpm smoke:package-recording-flow`; the packaged app opens through the pre-record launcher, shows preflight/source controls, starts screen recording from the setup surface, preserves the screen recording when the simulated camera is unavailable, and lands in saved review with post-recording actions and camera-warning copy.
- UI smoke verifies setup controls, disabled/unavailable messaging, and successful start.
- Manual check with camera unavailable confirms screen-only fallback is visible and usable.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-054 Add thumbnail source picker for recording targets

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record/source-picker work is being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

Screen Studio exposes entire display, window, and area choices from the pre-record flow. Recordly's source picker shows screen/window tabs with thumbnail cards, selected-state checkmarks, and a confirm action. Rough Cut already has capture target support; the missing piece is a polished source picker inside the new pre-record panel.

#### Acceptance Criteria

- Show capture target choices inside the pre-record panel: full display, region, and window when supported.
- Present screen/window targets with readable names and thumbnails/previews where available.
- Preserve the existing Linux-safe full-display and region paths.
- Make unsupported target modes visibly disabled instead of silently hidden.
- Persist the last valid target selection only when the target still exists.

#### Verification

- 2026-05-05: Started by making the pre-record panel the default first screen on app launch. Added visible capture target cards for Full display, Region, and disabled Window support. Added an explicit `Open editor` secondary action so users can skip recording and go to the editor, while `Start recording` keeps the record -> edit flow. Updated recording-flow smoke to assert the pre-record panel, editor shortcut, and selected capture card exist before starting capture.
- 2026-05-06: User feedback rejected the big target-card treatment for the standalone launcher. Replaced target cards with a compact `Capture` dropdown that supports Full display and Region; smoke now toggles the dropdown to region and back before recording.
- Unit tests for target option normalization and stale selection fallback.
- UI smoke selects full display and region targets through the pre-record panel.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-055 Add audio and camera preflight controls

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record audio/camera preflight work is being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

Screen Studio's pre-record flow lets users choose webcam, microphone, and system audio before recording; microphone includes visible input activity, and camera selection shows a preview. Recordly has the same pattern in its launch HUD with microphone level rows, system audio toggle, webcam device list, and a small live preview.

#### Acceptance Criteria

- Add microphone selection to the pre-record panel with an input level indicator.
- Add system audio selection/toggle with unavailable-source messaging.
- Add camera selection with a live preview when a camera is selected.
- Keep `No microphone`, `No system audio`, and `No camera` as safe explicit choices.
- Start screen-only recording successfully even when camera/audio permissions fail.

#### Verification

- Unit tests for input availability/degraded-state mapping.
- UI smoke covers no-camera/no-system-audio fallbacks and mic-enabled state.
- Manual packaged-app check with camera unavailable and with microphone selected.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-056 Add pre-record smoke and packaged checks

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record smoke/packaged checks are being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

The pre-record panel becomes the front door for every capture. It needs direct regression coverage so future editor or recording changes do not strand users before recording starts.

#### Acceptance Criteria

- Add UI smoke coverage for opening/canceling the pre-record panel.
- Smoke verifies target, audio, camera, countdown, and Record action visibility.
- Smoke starts a recording from the pre-record panel and reaches saved review/editor state.
- Packaged smoke exercises the pre-record panel path, not only legacy quick record.
- Manual packaged-app runbook includes the new pre-record path.

#### Verification

- 2026-05-06: Updated `pnpm smoke:recording-flow-ui` to cover the standalone pre-record launcher, compact capture dropdown, region-control reveal, start recording, stop recording, and saved state. Added a spawn timeout so Electron smoke hangs fail with artifacts instead of stalling the whole command.
- 2026-05-06: Current verification pass: `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, and `pnpm smoke:recording-flow-ui` all pass. Packaged smoke/manual packaged run remain pending.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:package`
- Manual packaged-app record from the pre-record panel.

### TASK-057 Add timeline interaction visual regression suite

**Priority:** P1  
**Status:** DONE

#### Context

Timeline trim/scrub bugs showed up as UI movement, tool switching, wheel-driven state changes, and canvas flicker. These are user-visible interaction regressions that unit tests and static screenshots do not catch reliably.

#### Acceptance Criteria

- Add a dedicated Playwright interaction regression script for timeline scrub, trim start/end drag, wheel scrolling, focus stability, and active tool stability.
- Assert the left tool/panel does not switch while stretching trim handles.
- Assert wheel scrolling does not change the timeline scrubber or focused range inputs.
- Assert playhead, ruler, and lanes share one coordinate space after trims.
- Keep frame-by-frame canvas monitoring for every drag interaction and fail on blank/gray frames.

#### Verification

- 2026-05-08: Verified existing `scripts/visual-timeline-interactions-playwright.mjs` covers timeline scrub, trim start/end drag, wheel stability, active-tool stability, coordinate alignment, hidden-trim restore, and per-frame canvas RAF monitoring that fails on gray/blank frames. `scripts/visual-scrub-playwright.mjs` provides the focused scrub/trim visual regression gate.
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm visual:scrub`
- `pnpm visual:timeline`

### TASK-058 Add non-destructive edit recovery affordances

**Priority:** P2  
**Status:** DONE

#### Context

Trim and future cut actions should never feel like they delete source media. Users need clear recovery affordances when hidden ranges still exist but are not currently exported.

#### Acceptance Criteria

- Show hidden head/tail source ranges as recoverable context instead of making media feel deleted.
- Let users restore full source or expand trims back from the timeline without switching tools.
- Keep raw/styled export scoped to the visible edit range while preserving original media and project clip source ranges.
- Add copy that explains trims are non-destructive.

#### Verification

- 2026-05-08: Added compact non-destructive edit copy in the Recording inspector and timeline-level Restore cut affordances for hidden middle ranges, alongside the existing hidden head/tail restore controls.
- `node --test apps/desktop/src/renderer/src/cut-ranges.test.mjs apps/desktop/src/renderer/src/timeline-rail.test.mjs`
- `pnpm --filter @rough-cut/desktop typecheck`

### TASK-059 Add preflight checklist and session-risk warnings

**Priority:** P1
**Status:** DONE

#### Context

Long client tutorials fail expensively when a missing tool, wrong session type, unavailable optional source, or low disk space is discovered after recording starts. The pre-record launcher now needs a visible readiness surface before capture begins.

#### Acceptance Criteria

- Show session status, capture target, save destination/disk budget, FFmpeg/FFprobe availability, xdotool/xinput availability, selected mic, selected system audio source, camera state, resolution, and FPS before recording.
- Warn clearly when disk space is below 30-minute or 60-minute recording budgets.
- Keep screen-only recording as the safe default when optional mic, system audio, or camera sources are off or unavailable.
- Do not block recording for optional degraded states, but make the risk visible.
- Make preflight status available from the pre-record launcher without adding a captured HUD to the X11 recording.

#### Implementation Notes

- Added main-process preflight classification in `apps/desktop/src/main/recording/preflight.mjs`.
- Added `recording:get-preflight-status` IPC exposure and renderer preflight summary UI.
- Enlarged the recorder launcher window so the preflight surface is visible before capture.
- Added smoke assertions for the preflight panel in `scripts/smoke-recording-flow-ui.mjs`.

#### Verification

- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-060 Debug long-smoke post-save failure

**Priority:** P1
**Status:** DONE

#### Context

The 10-minute long-recording smoke produced a readable saved recording, diagnostics status `ok`, expected duration, near-30 FPS, cursor telemetry, and zero drop/queue warnings, but the wrapper still exited with `ELIFECYCLE` immediately after `recording:stop` returned the saved recording. This needs a dedicated follow-up so the long gate distinguishes capture safety failures from post-save export or harness failures.

Resolved by adding phase-specific smoke logging/artifact reporting and making styled export explicit for the long-recording gate. The default long gate now validates capture/save/reopen/raw export without blocking on long styled exports; set `ROUGH_CUT_LONG_SMOKE_STYLED_EXPORT=1` to include styled export coverage.

Re-verified with `ROUGH_CUT_LONG_SMOKE_DURATION_MS=600000 pnpm smoke:long-recording`: passed with `mediaDurationMs=600033`, near-30 FPS, cursor telemetry, readable saved recording, diagnostics, project reopen, and raw export.

#### Acceptance Criteria

- Reproduce the failure with the existing 10-minute long-smoke artifact path or a shorter targeted variant.
- Identify whether the failure occurs during raw export, styled export, UI smoke handoff, process teardown, or package-script timeout/exit handling.
- Log the failing phase explicitly in `scripts/smoke-real-recording.mjs` or the long-smoke wrapper.
- Preserve the current capture-safety assertions: diagnostics `ok`, duration budget, FPS budget, cursor telemetry, and drop/queue warnings.
- Ensure post-save/export failure reporting includes artifact paths for the recording, project, diagnostics, raw export, and styled export when available.
- Re-run the 10-minute long smoke after the fix and document the result.

#### Verification

- Targeted unit or script-level test for phase-specific failure reporting where practical.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `ROUGH_CUT_LONG_SMOKE_DURATION_MS=600000 pnpm smoke:long-recording`
- `pnpm visual:timeline`
- `pnpm visual:scrub`

### ~~TASK-051~~ Add post-recording review workspace

**Priority:** P1  
**Status:** DONE

#### Context

After stop, the user should land in a clear review state rather than hunting for a preview. The workspace should answer: did it save, what failed, what can I do next, and how do I export or retake?

#### Acceptance Criteria

- After stop, show a review state with preview, save path, warnings, and primary next actions.
- Include actions for export styled, export raw, retake, open folder, and inspect diagnostics.
- Keep camera/audio degradation visible without blocking screen preview.
- Prevent duplicate stop/save state overwrites.

#### Breakdown

- Define a saved-recording review state that is separate from idle and recording states.
- On stop success, route to review with central preview loaded, project title/path visible, and saved status confirmed.
- Show warnings as non-blocking cards: camera failed, mic missing, system audio unavailable, export diagnostics, or partial save.
- Add primary actions: Export styled, Export raw, Open folder, Retake, Save project, and View diagnostics.
- Add retake safety copy so users do not accidentally lose the saved recording.
- Keep duplicate stop protection visible: once Stop is pressed, show `Stopping...` and lock recording actions until the saved result returns.
- Preserve preview even if camera/audio finalization fails; screen asset remains the anchor of review.
- Make review workspace reusable for opened projects, not only freshly recorded projects.

#### Verification

- UI smoke covers Record -> double Stop -> saved review workspace -> preview canvas.
- Manual check confirms warnings and next actions are visible after camera-busy recording.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:ui`
- `pnpm visual:export`
- `ROUGH_CUT_LONG_SMOKE_DURATION_MS=600000 pnpm smoke:long-recording`
- `pnpm smoke:package`
- `pnpm smoke:recording-flow-double-stop`
- `pnpm smoke:package-recording-flow`

**Completed (2026-05-07):** Post-recording review is now the single next-action workspace for export styled, export raw, folder, diagnostics, project, and retake actions; the duplicate lower Export MP4 CTA was removed and the inspector now reports export status/details only. Camera failure warnings are persisted into the saved project and shown again after reopening the packaged app. Automated coverage now includes the regular recording-flow UI smoke, packaged fixture smoke, and a packaged pre-record -> camera warning -> stop -> save -> review smoke.

### TASK-052 Add timeline-first playback and edit rail

**Priority:** P1  
**Status:** DONE

#### Context

Zoom markers, trims, cuts, clicks, and camera/audio tracks need a timeline surface. The current preview controls are too small and disconnected from upcoming edit operations.

#### Acceptance Criteria

- Add a bottom timeline rail with playhead, time ruler, source duration, and track lanes.
- Show zoom markers, future trim handles, camera presence, and click events in the rail.
- Keep playback state synchronized with the central preview.
- Make the rail extensible for trim/cut tasks without another layout rewrite.

#### Breakdown

- Extract playback time state so the stage and timeline share one source of truth.
- Add time-to-pixel and pixel-to-time helpers with deterministic tests.
- Render a bottom rail with ruler ticks, current playhead, duration, and a draggable/scrubbable track area.
- Add lanes for screen video, zoom markers, click events, camera presence, and future trim/cut regions.
- Show existing manual/auto zoom markers as timeline regions with start/end positions and selected/hover states.
- Show click telemetry as small event markers, but keep click editing out of scope.
- Show camera/audio tracks as presence lanes first; full PiP/audio editing is out of scope.
- Wire timeline scrubbing to the central styled preview without disrupting existing play/pause controls.
- Leave trim/cut mutation for TASK-046/TASK-047; this task creates the rail and read-only marker visualization.

#### Verification

- 2026-05-05: Added renderer timeline model helpers, deterministic timeline unit coverage, shared preview/timeline scrub state, visible playhead/ruler/duration, screen/zoom/click/camera/audio lanes, non-mutating trim handles, and metadata-backed UI smoke coverage. Fixed scrub flicker by keeping the default background object stable so drag re-renders do not restart and clear the preview canvas render loop. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `node --test apps/desktop/src/renderer/src/timeline-rail.test.mjs`, `pnpm --filter @rough-cut/desktop test`, `pnpm smoke:ui`, and `pnpm visual:scrub`.
- Unit tests for time-to-pixel mapping and marker placement.
- UI smoke loads a project with zoom/click/camera metadata and verifies timeline elements render.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:ui`
- `pnpm visual:scrub`

### TASK-053 Add extensible properties inspector system

**Priority:** P1  
**Status:** DONE

#### Context

The right inspector is already mixing canvas, export, zoom, background, camera, and future cursor controls. It needs a real section/component system before adding cursor styling, camera PiP controls, background presets, and trim/cut settings.

#### Acceptance Criteria

- Create reusable inspector section/components for fields, sliders, presets, toggles, and action rows.
- Group controls by selected context: canvas, recording, cursor, camera, zoom marker, export.
- Support disabled/degraded states with clear copy.
- Keep project persistence explicit and recoverable when saves fail.

#### Breakdown

- Define inspector primitives: section, field row, segmented control, slider, select, toggle, preset grid, warning row, and action row.
- Move existing canvas/export/zoom controls into the primitives without changing their behavior.
- Add context groups: Canvas, Export, Recording, Zoom, Cursor, Camera, and Diagnostics.
- Add selection plumbing so clicking a timeline zoom marker can focus the Zoom inspector group later.
- Add disabled/degraded copy patterns for unavailable camera, missing telemetry, no audio stream, and unsupported export mode.
- Make save behavior explicit: pending, saved, failed, retry available, and no hidden project mutations on failed save.
- Keep inspector narrow and scannable: labels, current values, and short helper copy; avoid long paragraphs.
- Defer new controls like cursor style sliders or background preset grids to TASK-044/TASK-045 after the inspector system exists.

#### Verification

- 2026-05-05: Added reusable inspector primitives for sections, selects, sliders, toggles, preset grids, action rows, notices, and selected-context summaries. Moved existing canvas/screen/background/export controls onto the primitives without changing persistence behavior. Added timeline selection plumbing so screen, zoom, click, camera, and audio regions can focus a future inspector context. UI smoke now asserts inspector groups and zoom context focus. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, `pnpm smoke:ui`, and `pnpm visual:scrub`.
- Component/unit coverage for inspector state and value normalization.
- UI smoke changes one canvas setting and one presentation setting, saves, and keeps preview/export available.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:ui`

### TASK-061 Fix choppy camera playback via canvas frame dedup

**Priority:** P1  
**Status:** DONE

#### Context

The canvas RAF loop ran at 60fps on a 30fps source, drawing each video frame twice. Each redundant draw included an expensive `ctx.shadowBlur` pass and a 1920×1080 `drawImage` call, competing with the video decoder and causing dropped frames and choppy playback.

#### Fix

Added frame deduplication in the `tick()` function (`apps/desktop/src/renderer/src/main.tsx`). Before drawing, compute `currentFrame = Math.round(video.currentTime * fps)` and skip the draw if it matches `lastDrawnFrame`. This halves canvas work for 30fps sources without changing draw quality or requiring `requestVideoFrameCallback`.

Also added `window.__roughCutCanvasDrawCount` instrumentation to the smoke test to measure real canvas render rate during playback.

#### Verification

- 2026-05-07: Smoke test measured `canvasRenderFps: 33` (≈30fps native rate) confirming frame dedup eliminates double-draws. All 167 unit tests pass. `pnpm smoke:ui` passes.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:ui`

### TASK-062 Add real window and region selection UI

**Priority:** P2  
**Status:** DONE

#### Context

The current capture target control is still a basic full-display/region dropdown. Users need an actual source-picking experience for display, window, and region capture instead of manually trusting a rough selector.

#### Acceptance Criteria

- Add a proper pre-record source picker UI for display, window, and region selection.
- Let users choose a capture region visually, with clear bounds before recording starts.
- Show available windows with readable names and selected-state feedback when platform support is available.
- Preserve the existing safe full-display path and disable unsupported modes with clear copy.
- Keep cursor telemetry, recording metadata, preview, and export transforms aligned with the selected window or region.

#### Verification

- 2026-05-08: Added pre-record source picker cards for full display, region, and disabled window capture; added an in-panel visual region picker with clear bounds, cancel/apply actions, and safe presets. Window capture remains visibly disabled pending platform-specific capture support.
- 2026-05-09: Reworked region selection to remove typed X/Y/W/H controls from the pre-record surface. Region mode now shows the visual picker directly; users drag on the preview map to set the capture area, with presets kept as shortcuts. Preflight now shows a compact readiness summary by default with all checks behind a reveal.
- UI smoke covers selecting full display, selecting Region, and showing the drag-based region picker.
- Add automated coverage for region geometry normalization and persisted metadata.
- Manual packaged-app verification records a selected region and, when supported, a selected window.
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `ROUGH_CUT_SMOKE_REGION=1 ROUGH_CUT_SMOKE_REGION_WIDTH=240 ROUGH_CUT_SMOKE_REGION_HEIGHT=180 pnpm smoke:mvp`

### TASK-063 Enable real window capture selection

**Priority:** P2  
**Status:** DONE

#### Context

The pre-record source picker currently shows Window as disabled. Users expect this option to become a real selectable capture target with readable window names and reliable geometry once platform support is implemented.

#### Acceptance Criteria

- Enumerate capturable windows with readable titles and stable identifiers where the current Linux session supports it.
- Let users select a window from the pre-record source picker instead of seeing the disabled placeholder.
- Persist selected window/capture geometry in recording metadata.
- Keep cursor telemetry, preview, and export transforms aligned with the selected window bounds.
- Keep unsupported sessions visibly disabled with clear copy instead of failing at record time.

#### Verification

- Unit coverage for window metadata normalization and stale selection fallback.
- UI smoke covers disabled unsupported state and, where supported, selecting a window.
- Manual packaged-app verification records a selected window.

### ~~TASK-064~~ Stabilize sidebar tool switching layout

**Priority:** P2  
**Status:** DONE

#### Context

Switching left sidebar tools currently changes the left panel content height and can drastically shift or scroll the main workspace. Tool selection should feel like changing controls around the same preview, not like navigating to a different page.

#### Acceptance Criteria

- Keep the central stage, right inspector, and timeline rail visually stable when switching between Background, Timeline, and Inspector tools.
- Prevent the left setup board from forcing page-level scrollbars or resizing the main preview area.
- Use internal scrolling/collapsible sections inside the left board when controls exceed available height.
- Preserve current tool functionality and project persistence.

#### Verification

- 2026-05-15: Added editor shell containment so the project editor stretches to the available app height while the setup board owns its vertical scrolling with a stable gutter.
- 2026-05-15: Added UI smoke coverage that switches Timeline -> Inspector -> Background -> Inspector and asserts the central stage bounding rect stays stable.
- 2026-05-15: Follow-up fix after visual repro: the prior smoke only covered the default wide loaded-project window. Added `pnpm smoke:sidebar-layout`, reproduced the jump at 900px in both empty and loaded editor states, then kept the compact editor as a stable four-column shell instead of stacking the setup board above the stage.
- `pnpm typecheck`
- `pnpm smoke:sidebar-layout`
- `env -u VITE_DEV_SERVER_URL pnpm smoke:ui`
- `pnpm --filter @rough-cut/desktop test`
- `git diff --check`

### ~~TASK-065~~ Validate paths in PROJECT_OPEN and PROJECT_SAVE IPC handlers

**Priority:** P1  
**Status:** DONE

#### Context

The renderer can pass any string to the project-open and project-save IPC handlers; the main process opens or writes that path with no validation. A compromised renderer could read or overwrite arbitrary files. Source: `apps/desktop/src/main/index.mjs:517-518` and `apps/desktop/src/main/project-files.mjs:106-115`. The save path is especially risky because it does `mkdir(dirname, { recursive: true })` then `writeFile`.

#### Completion Notes

- Added `validateProjectPath()` and `ProjectPathError` to `apps/desktop/src/main/project-files.mjs`. Validator rejects empty/non-string input, NUL-byte injection, missing `.roughcut` extension, and any path outside the supplied `allowedRoots`.
- Wired strict validation (allowedRoots = `[recordingsDir]`) into all three IPC handlers in `apps/desktop/src/main/index.mjs`: `PROJECT_OPEN`, `PROJECT_OPEN_PATH`, `PROJECT_SAVE`. Symmetric strictness avoids open→edit→save breakage where opening an outside-root project would later fail to save.
- Path-within-root check uses `path.relative` plus a sibling-prefix guard so `/root-evil/foo.roughcut` is rejected against root `/root`.
- 9 new unit tests in `project-files.test.mjs` cover allowed paths, normalization, traversal, absolute escapes, missing extension, NUL bytes, empty/undefined input, lenient (no-allowlist) mode, and sibling-prefix attacks.

#### Verification

- `pnpm --filter @rough-cut/desktop test` → 188 / 188 pass.
- Manual: attempt to open a path outside the projects dir from devtools and confirm the IPC rejects.

### ~~TASK-066~~ Clean up recording child processes on app crash or signal

**Priority:** P1  
**Status:** DONE

#### Context

Recording spawns ffmpeg (screen, camera, audio), xinput, and xdotool. None of those subprocesses register `process.on('exit')` or SIGINT/SIGTERM handlers. If Electron is force-killed (OOM, force-quit) the children survive holding file handles and CPU. The recovery marker created at `recording-session.mjs:45-69` is also never cleared, and no recovery flow exists yet.

#### Completion Notes

- Added `getPid()` and `kill(signal)` to the screen and camera ffmpeg capture handles in `recording/ffmpeg-capture.mjs` and to the xinput button listener in `recording/xinput-button-listener.mjs`. Both are no-ops if the child already exited (`exitCode`/`signalCode` non-null).
- `recording-session.mjs` now keeps a session-scoped `children` registry. `registerChild()` appends each spawned helper as `{ name, getPid, kill }` — order is `ffmpeg-camera` (when present), `ffmpeg-screen`, `xinput-button-listener` (registered when telemetry starts).
- New `terminateChildren(signal = 'SIGTERM')` method on the session API. **Synchronous** by design: walks the registry, sends SIGTERM to each child, returns a `[{ name, pid, signal, error? }]` summary. No SIGKILL escalation here — per Node semantics the parent exits before any `setTimeout` in a SIGTERM handler can fire. Leftover orphans are TASK-088's domain (recovery flow).
- `index.mjs` registers `process.on('SIGTERM' | 'SIGINT')` handlers that call `terminateChildren()` and then `process.exit(128 + signo)`. Marker is intentionally left in place on external signals so the next launch can offer recovery.
- Graceful path is unchanged: `app.quit()` → existing `stopActiveSession()` clears the marker normally.

#### Verification

- 4 new tests in `recording-session.test.mjs`: empty list when idle, screen+camera reap with SIGTERM, xinput registered after telemetry init, kill error captured without throw.
- `pnpm --filter @rough-cut/desktop test` → 196 / 196 pass.
- Manual (still recommended): `pkill -KILL -f electron` mid-recording, verify no orphan ffmpeg/xinput via `pgrep`. Note: `pkill -KILL` skips our SIGTERM handler — only the recovery marker / TASK-088 path can clean up after that.

### ~~TASK-067~~ Validate remuxed MP4 coherence before declaring success

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/remux-service.mjs:4` ran `-map 0 -c copy -movflags +faststart` and trusted the output without checking it. If the upstream raw MKV was killed mid-write, the remuxed MP4's header advertised frames that weren't actually there. The user got a video that looked fine and silently ended early.

#### Completion Notes

- Added `probeMp4Integrity(filePath)` to `media-probe.mjs`. Runs `ffprobe -count_frames -count_packets -select_streams v:0` and returns `{ codec, width, height, durationSeconds, advertisedFrames, decodedFrames, decodedPackets }`. Decoded frames is the truthful count — `nb_frames` from the container header is the value that lies after a kill mid-write.
- Added `validateRemuxedMp4(filePath, { probe, toleranceFrames=5 })` and `RemuxIncompleteError` to `remux-service.mjs`. Validator throws `RemuxIncompleteError` when the file decodes to zero frames but advertises a stream; returns `{ coherent: false, warning }` when decoded < advertised − tolerance; otherwise `{ coherent: true }`.
- `remuxMkvToMp4` now runs the validator after the ffmpeg copy succeeds and returns `{ outputPath, integrity, warning }`. Warnings are also forwarded through the existing `onLog` channel so they land in the diagnostics file. Both `validate` and `runner` are injectable for unit tests.
- `recording-stop-handler.mjs` collects per-source warnings into a `remuxWarnings: [{ source, message }]` array on its returned recording object so the renderer can surface a banner without parsing log lines. Existing camera fallback path still works (warning is captured even when downstream `assertReadableMp4` fails).
- The original integration test (`remuxes a short mkv recording...`) now also asserts `result.warning === null` for a healthy short capture, so a regression that breaks the validator on real ffmpeg output gets caught.

#### Verification

- 9 new unit tests in `remux-service.test.mjs` cover: coherent equal frames, partial-recovery warning, tolerance window, zero-frame `RemuxIncompleteError`, unknown advertised frames (silent), clean orchestrator path, warning surface to onLog/return, ffmpeg non-zero exit, and validator error propagation.
- `pnpm --filter @rough-cut/desktop test` → 205 / 205 pass.
- Manual: SIGKILL ffmpeg mid-recording, verify remux either flags `Partial recording: M/N frames decoded` or throws `Recording incomplete` rather than silently producing a broken MP4.

### TASK-068 Compensate cursor and audio drift vs ffmpeg first frame

**Priority:** P1  
**Status:** DONE

#### Context

Cursor events are anchored to wall-clock recording-start (`recording-session.mjs:162`). FFmpeg's first encoded frame can lag (HW encoder warmup, codec init) per the first-frame callback at `ffmpeg-capture.mjs:102-111`, with no compensation applied to cursor or audio. On long recordings cursor highlights drift visibly behind real clicks.

#### Acceptance Criteria

- Capture the offset between recording-start and ffmpeg's first encoded out_time_us and apply it to cursor event timestamps before they are persisted.
- Same offset applied to any audio sidecar tracks that are anchored to wall clock.
- Regression test asserts a fixture recording with known first-frame lag has cursor events shifted accordingly.

#### Verification

- New unit test validates the offset application.
- `pnpm smoke:styled-export` confirms cursor overlay timing matches video.
- Manual: 10-minute recording with frequent clicks, scrub the export and confirm cursor highlight aligns frame-accurately.

### TASK-069 Add EXPORT_CANCEL IPC and kill ffmpeg on cancel

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/export-service.mjs` spawns ffmpeg but never exposes a way to stop the export. The PID is not retained anywhere index.mjs can reach it. If the user closes the export dialog or wants to cancel, ffmpeg keeps running until completion.

#### Acceptance Criteria

- Add `EXPORT_CANCEL` IPC channel and matching renderer affordance ("Cancel export" button visible while exporting).
- Track the active ffmpeg child PID and send SIGTERM (escalating to SIGKILL) on cancel.
- Clean up partial output and temp files (`cursorLayer`, `zoomLayer`) on cancel.
- Cancel-mid-export does not corrupt subsequent exports.

#### Verification

- New unit test verifies cancel kills the spawn and returns `cancelled` status.
- `pnpm --filter @rough-cut/desktop test` covers cancel through a fake ffmpeg process.
- Manual: start a long export, click cancel, verify no orphan ffmpeg and no stale temp files.

#### Completion Notes

- Added `AbortSignal` support to ffmpeg-backed exports in `export-service.mjs`.
- Added an active export controller in `index.mjs` and wired `EXPORT_CANCEL` IPC to abort the current export.
- Exposed `cancelExport()` from preload and added a renderer "Cancel export" action while export progress is active.
- Cancelled ffmpeg exports now return `cancelled: true` and remove partial output files; cursor/zoom temp layers still clean up through the existing `finally` path.
- Added a cancellation unit test using a fake ffmpeg binary to prove cancel returns a cancelled result and removes the partial export.
- Added a visible export progress meter with phase label and percentage in the export status panel.
- Fixed a completion/cancel race where `exportProgress` could remain stuck at `cancelling: 100%` after a successful export, leaving export buttons disabled.
- Added targeted error copy for stale Electron main processes that do not yet have the `export:cancel` IPC handler registered.

#### Completion Verification

- `pnpm --filter @rough-cut/desktop test` — 263/263 pass.
- `pnpm typecheck` — pass across all packages.
- `env -u VITE_DEV_SERVER_URL pnpm smoke:ui` — pass, including `hasExportProgressMeter: true`.

### TASK-070 Per-display scale factor for cursor and click telemetry

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/recording/recording-session.mjs:426-430` (normalizeCursorPoint) reads scaleFactor from the primary display only. On mixed-DPI multi-monitor setups (1x + 2x), clicks recorded on the secondary display land in the wrong spot in the styled export. xinput coordinates are physical pixels with no per-display lookup.

#### Acceptance Criteria

- Detect which display the cursor is on at sample time and apply that display's scaleFactor.
- xinput button events use the same per-display scale.
- Regression fixture covers mixed-DPI scenarios with cursor and clicks on secondary displays.

#### Verification

- New unit test for per-display scale resolution.
- Manual: on a 1x + 2x setup, record clicks on the secondary monitor and verify they render at the correct position in the styled export.

### TASK-071 Surface camera failure during recording, not after

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/recording/recording-session.mjs:131-137` catches camera-spawn errors and continues with screen-only. The user only sees a small `cameraError` chip later in `PostRecordingReview` (`main.tsx:1509-1512`). People can record 30 minutes thinking their face cam is rolling.

#### Acceptance Criteria

- Camera failure during recording shows a visible, persistent banner ("Camera not recording") in the recording UI.
- Banner offers a one-click "Stop and retry with camera off" or "Continue screen-only".
- Banner does not hide the screen preview.
- Existing post-recording warning still appears for late failures.

#### Verification

- UI smoke covers camera-failure-during-recording state.
- Manual: unplug a USB webcam mid-recording, confirm the banner appears immediately.

#### Completion Notes

- Live recording status now includes `cameraError` when camera startup falls back to screen-only or when a separate camera capture process exits mid-recording.
- Renderer polls live recording status while recording and shows a persistent `Camera not recording` banner without hiding the capture UI.
- Banner actions let the user cancel/retry with camera off or dismiss the warning and continue screen-only.
- Recording-flow smoke now asserts the live camera-failure banner and both actions during simulated camera failure.

#### Completion Verification

- `pnpm --filter @rough-cut/desktop test` — 264/264 pass.
- `pnpm typecheck` — pass across all packages.
- `env -u VITE_DEV_SERVER_URL ROUGH_CUT_UI_SMOKE_CAMERA_WARNING=1 ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH=/dev/video9999 ROUGH_CUT_SMOKE_CAMERA_START_ERROR='Device or resource busy' pnpm smoke:recording-flow-ui` — pass, including `hasLiveCameraFailureBanner: true` and `hasLiveCameraFailureActions: true`.
- `env -u VITE_DEV_SERVER_URL pnpm smoke:ui` — pass.

### ~~TASK-072~~ Lift or warn on ASS cursor 600-event downsample cap

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/export-service.mjs:421-430` capped cursor events to 600 samples via stride. Any recording longer than ~20 seconds at the 33ms sample rate was silently downsampled with no log or UI hint. Long styled exports looked janky.

#### Completion Notes

- Raised the default cap from 600 to `DEFAULT_MAX_CURSOR_ASS_EVENTS = 30_000` in `export-service.mjs`. At the 33ms cursor sample rate that covers ~16 minutes without striding — the bulk of recordings will now produce a 1:1 cursor curve. libass copes well into the tens of thousands of dialogue lines, so the cap stays safely under the practical performance ceiling.
- Stride sampling now opts in only when `events.length > maxEvents` (was: always strided, even for stride=1, which was wasteful). When stride > 1, an `onDownsampleNotice({ originalEvents, sampledEvents, stride, maxEvents })` callback fires.
- `createCursorSubtitleLayer` wraps that notice into both a `console.warn` line ("[cursor-ass] Cursor detail reduced: …") and a `summary` field on its returned layer object so callers (and a future export progress UI) can surface a banner. The renderer-side notice toast is intentionally deferred — current callers ignore the field, which keeps the API change non-breaking.
- Updated the existing "preserves the final recorded event" test to pass `maxEvents: 500` explicitly (it relied on the old 600 default).

#### Verification

- 3 new unit tests in `export-service.test.mjs`: default cap is 30_000 and 5k events do not stride; downsample notice fires with correct original/sampled counts; **60-minute synthetic stream (108k events) builds without crashing and stays under the cap**.
- `pnpm --filter @rough-cut/desktop test` → 219 / 219 pass.
- Manual: 30-minute recording produces a styled export with smooth cursor motion (recommended). Suggest also reviewing whether to surface the notice via the existing export-progress channel as a follow-up.

### TASK-073 Validate capture region against display bounds

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/recording/recording-session.mjs:376-399` accepts whatever region comes in. If the region extends off-screen, x11grab pads with black; the user gets a recording with mystery black bars and no warning.

#### Acceptance Criteria

- Clamp or reject capture regions that extend outside the union of attached display bounds.
- Reject zero-width, negative, or wildly oversized regions with a clear error before recording starts.
- New visual region picker (TASK-062 follow-up) honors the same constraints.

#### Verification

- New unit test for region validation.
- `pnpm smoke:recording-flow-ui` extended for off-screen region rejection.
- Manual: drag a region partially off the right edge and confirm the picker clamps to display bounds.

#### Completion Notes

- Invalid `mode: region` requests now fail before ffmpeg starts instead of silently falling back to full-display capture.
- Region normalization now rejects negative/non-finite coordinates and too-small dimensions.
- Region resolution validates the final X11 geometry against attached display bounds, including absolute regions on secondary displays.
- `getPrimaryX11DisplayInfo` now carries physical bounds for all Electron displays so capture validation can distinguish valid secondary-monitor regions from off-screen regions.
- Recording-flow smoke can inject an off-screen region and assert it is rejected before continuing with a valid recording.

#### Completion Verification

- `pnpm --filter @rough-cut/desktop test` — 266/266 pass.
- `pnpm typecheck` — pass across all packages.
- `env -u VITE_DEV_SERVER_URL ROUGH_CUT_UI_SMOKE_INVALID_REGION=1 pnpm smoke:recording-flow-ui` — pass, including `hasInvalidRegionRejected: true`.

### ~~TASK-074~~ Wire or remove inert top-bar folder, comments, undo icons

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/renderer/src/main.tsx:505-507` renders three icons (`folder`, `comments`, `undo`) wrapped in `<span>` with no click handlers. They look like buttons but do nothing. `folder` duplicates the working folder-open button at line 534. `comments` and `undo` strongly imply features that do not exist. They read as broken to anyone who clicks them.

#### Acceptance Criteria

- Remove the three decorative `<span>` icons, OR replace them with real buttons that open something useful (e.g., undo wired to TASK-075, folder wired to "open recent", comments wired to a notes panel).
- No icon in the top bar should be unclickable.
- UI smoke asserts no inert icon affordances remain.

#### Verification

- UI smoke updated.
- Manual: hover all top-bar icons and verify each has a tooltip and a real action, or has been removed.

#### Completion Notes

- Removed the inert top-bar folder, comments, and undo icon spans.
- Added `title` tooltips to the remaining icon-only top-bar buttons.
- Extended UI smoke with `hasNoInertTopBarIcons` so decorative top-bar icons cannot regress silently.

#### Completed Verification

- `pnpm --filter @rough-cut/desktop build`
- `pnpm smoke:ui`

### ~~TASK-075~~ Implement undo and redo with edit history stack

**Priority:** P1  
**Status:** DONE

#### Context

The `undo` icon at `main.tsx:507` implies undo exists; nothing in state tracks history. Cuts, trims, marker edits, background changes, and aspect-ratio swaps are all destructive without a way to revert. Competitors (Recordly, Screen Studio) all support this.

#### Acceptance Criteria

- Add a bounded edit-history stack covering trim, cut, zoom-marker, background, camera-presentation, and aspect-ratio changes.
- Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y) trigger undo and redo.
- The top-bar undo button reflects current undo availability.
- History is per-session (not persisted across project reopen) by default.

#### Verification

- New unit tests for the history reducer.
- UI smoke verifies undo/redo on a committed presentation edit and final export state.
- Manual: trim, cut, undo, redo and confirm visible state matches.

#### Completed

- Added a bounded per-session edit-history reducer with undo/redo stack tests.
- Wired top-bar Undo/Redo buttons and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z shortcuts.
- Routed presentation, trim, cut, zoom-marker, background, camera, and aspect-ratio project edits through history-backed project changes.
- Extended UI smoke to commit a range edit, undo it, redo it, then continue export verification.

### ~~TASK-076~~ Add keyboard shortcuts and a shortcuts cheat sheet dialog

**Priority:** P1  
**Status:** DONE

#### Context

There are no global keyboard shortcuts in the renderer (no keydown listeners in `main.tsx` for Space, J/K/L, Cmd+E, arrow-key trim nudge). Recordly ships a `ShortcutsProvider` and `ShortcutsConfigDialog`; rough-cut has none.

#### Acceptance Criteria

- Add a `ShortcutsContext` that registers and dispatches shortcuts, modeled on Recordly's pattern.
- Default bindings: Space = play/pause, J/K/L = playback rate, ←/→ = scrub, [ and ] = trim nudge, Cmd/Ctrl+E = export, Cmd/Ctrl+Z = undo (TASK-075), `?` = open cheat sheet.
- A cheat sheet dialog lists all bindings.
- Shortcuts are inert when an input/textarea is focused.

#### Verification

- UI smoke covers Space-to-play and `?`-opens-sheet.
- Manual: every documented shortcut works as labeled.

#### Completion Notes

- Added global shortcuts for `?`, Escape, Ctrl/Cmd+E, arrow-key scrub, and `[`/`]` trim bounds.
- Extended preview shortcuts with J/K/L playback-rate controls alongside the existing Space play/pause shortcut.
- Added a Shortcuts dialog listing active bindings and the future undo binding from TASK-075.
- Shortcuts are ignored from inputs, selects, textareas, buttons, and contenteditable regions.

#### Completed Verification

- `pnpm --filter @rough-cut/desktop build`
- `pnpm smoke:ui`

### ~~TASK-077~~ Reconcile or remove duplicate region X Y W H inputs

**Priority:** P2  
**Status:** DONE

#### Context

`apps/desktop/src/renderer/src/main.tsx:667-670` still renders the old NumberField inputs for region x/y/width/height. The in-flight region-selector overlay (uncommitted) replaces this for pre-record. The editor-mode inputs may be dead code or a parallel path that wasn't reconciled.

#### Acceptance Criteria

- Determine whether the editor-mode region inputs still drive any captured behavior.
- If dead, remove them and their state plumbing.
- If still relevant, route them through the same overlay/IPC path as the pre-record picker so behavior is consistent.

#### Verification

- Search confirms no references remain if removed.
- UI smoke for region selection covers both pre-record and editor entry points.

#### Completion Notes

- Removed the old top-strip X/Y/W/H number inputs and the now-unused `NumberField` component.
- Replaced them with a read-only region summary plus `Reselect`, which reopens the existing pre-record region picker path.
- Extended recording-flow smoke assertions with `hasNoRegionNumberInputs`.

#### Completed Verification

- `pnpm --filter @rough-cut/desktop build`
- `pnpm smoke:recording-flow-ui`

### TASK-078 Add feedback signal for incorrect auto-zoom suggestions

**Priority:** P3  
**Status:** ✅ DONE (2026-05-19)

#### Context

TASK-018/019 are DONE. The user can apply or dismiss auto-zoom suggestions via `AutoZoomSuggestionsPanel` (`main.tsx:2189`), but there is no signal back to the heuristic. No miss data exists for tuning thresholds in `packages/timeline-engine/src/auto-zoom.ts:32-52`.

#### Acceptance Criteria

- Add a "this suggestion was wrong" affordance in the suggestions panel.
- Persist dismiss/wrong/applied signals in a local feedback log alongside the project (or in a global JSON for cross-project review).
- A minimal report surface lists recent feedback so the heuristic can be tuned.

#### Verification

- UI smoke covers each feedback action.
- Manual: dismiss-with-reason on a few suggestions and confirm the log file is written.

### TASK-079 Profile renderer scrub and memoize where DevTools flags

**Priority:** P3  
**Status:** ✅ DONE (2026-05-19)

#### Context

`main.tsx` has 1 `useMemo` across 2,802 lines, no `useCallback` on the 20+ handlers passed to children, no `React.memo`. This is only worth fixing where profiling shows it matters. Recordly is also large but is split — the lesson is "measure, then act," not "split for splitting's sake."

#### Acceptance Criteria

- Capture a React DevTools profiler trace of timeline scrub on a 5-minute project.
- Memoize only the components or callbacks that show up as hot.
- Document what was changed and why, with before/after frame times.

#### Verification

- Profiler trace attached to the task.
- Smoke tests still green.

### TASK-080 Add i18n infrastructure with t() context and RTL CSS

**Priority:** P2  
**Status:** DONE (2026-05-19)

#### Context

~100+ user-visible strings are hardcoded in `main.tsx`. The user works in Hebrew sometimes; there is no i18n library, no RTL CSS, no `dir="rtl"` handling. Recordly has a `src/i18n/` directory and an `i18n:check` lint script in package.json — a working reference.

#### Acceptance Criteria

- Adopt an i18n library (i18next or similar) and add a `useI18n` context modeled on Recordly's.
- Wrap all visible strings in `t('key', 'fallback')`.
- Add an `i18n:check` script that fails CI when keys are missing or unused.
- RTL CSS scaffolding: logical properties or RTL-aware media queries; verify Hebrew layout flips correctly.

#### Verification

- New `pnpm i18n:check` script.
- UI smoke covers RTL and LTR builds.
- Manual: switch to Hebrew and walk the recording and editing flow.

### TASK-081 Add light theme and semantic color tokens

**Priority:** P3  
**Status:** DONE (2026-05-19)

#### Context

`apps/desktop/src/renderer/src/styles.css` has ~15 CSS vars in `:root` but no `prefers-color-scheme` handling and many inline colors (`rgb(255 255 255 / 0.07)`, `#1a1a22`). A light theme today would be a full restyle.

#### Acceptance Criteria

- Introduce semantic color tokens (`--color-bg-base`, `--color-bg-raised`, `--color-fg-primary`, `--color-error-bg`, `--color-focus-ring`, etc).
- Replace inline colors in styles.css with tokens.
- Add a light theme variant via `prefers-color-scheme` and a manual toggle.

#### Verification

- Visual snapshot test of light theme.
- Manual: switch system theme and confirm the app follows.

### ~~TASK-082~~ Improve error UX with actionable copy and diagnostics link

**Priority:** P2  
**Status:** DONE

#### Context

"Recording failed." and "Export failed." are the entire copy on failure. Disk full, ffmpeg crash, and permissions look identical to the user. There is no "open diagnostics" or "retry" affordance on the failure surface.

#### Acceptance Criteria

- Map failure reason codes to user-actionable copy ("Disk full", "ffmpeg exited unexpectedly", "Permission denied", etc).
- Failure banner offers Retry, Open diagnostics, and Copy log path.
- Existing diagnostics report is one click away from any failure.

#### Verification

- UI smoke for each failure category renders the expected copy.
- Manual: trigger a permissions failure and confirm the banner copy and Open diagnostics flow.

#### Completion Notes

- Added typed app error notices with source-aware retry behavior for recording, region, project-open, and export failures.
- Added actionable copy mapping for disk, permission, FFmpeg, recording, and export failures.
- Exposed the runtime log path through IPC so failure banners can open diagnostics or copy the log path.
- Added Retry, Open diagnostics, and Copy log path actions on failure banners.

#### Completed Verification

- `pnpm --filter @rough-cut/desktop build`
- `node --test apps/desktop/src/renderer/src/app-error-copy.test.mjs`

### ~~TASK-083~~ Keyboard accessibility for timeline, markers, trim handles

**Priority:** P2  
**Status:** DONE

#### Context

Timeline scrub at `main.tsx:2703` lacks `aria-live` for frame position. Zoom marker list (`main.tsx:2112-2187`) is mouse-only. Trim handles (`main.tsx:1948-1971`) are pointer-only. The pre-record dialog (`main.tsx:805`) has `role="dialog"` but no focus trap or initial-focus directive.

#### Acceptance Criteria

- Arrow-key nudge for trim handles, zoom marker boundaries, and the timeline scrubber.
- `aria-live` region announces frame position during scrub and current state on key actions.
- Focus trap and initial focus on dialogs.
- Tab order across the editor is sensible.

#### Verification

- Added focus traps and initial focus for the pre-record and shortcuts dialogs.
- Added `aria-live` timeline position announcements plus `aria-valuetext` on the scrubber.
- Added arrow-key nudge support for trim handles and zoom marker move/start/end controls, with Shift for larger one-second steps.
- Extended `smoke:ui` assertions for timeline live region, keyboard trim sliders, and keyboard zoom controls.
- Fixed project-save return state to resolve relative asset paths back to absolute runtime paths, preventing export regressions after autosave/edit saves.
- `pnpm --filter @rough-cut/desktop typecheck` → pass.
- `node --test apps/desktop/src/renderer/src/zoom-markers.test.mjs apps/desktop/src/renderer/src/timeline-rail.test.mjs` → 29 / 29 pass.
- `pnpm --filter @rough-cut/desktop test` → 269 / 269 pass.
- `env -u VITE_DEV_SERVER_URL pnpm smoke:ui` → pass.

### ~~TASK-084~~ Support relative-to-.roughcut asset paths in projects

**Priority:** P2  
**Status:** ✅ DONE (2026-05-19)

#### Context

`packages/project-model/src/schemas.ts:227` stores `filePath` as absolute. Moving a `.roughcut` directory to another machine (or renaming the parent folder) breaks every clip reference. Projects are not portable.

#### Acceptance Criteria

- New schema field for asset-path mode (relative or absolute), defaulting to relative for new recordings.
- Migration converts existing absolute paths to relative when both files are siblings.
- Open path resolution falls back to absolute path if the relative target is missing.

#### Verification

- Added migration tests for v11 sibling recording/camera assets converting to relative paths with absolute fallback, and non-sibling assets remaining absolute.
- Added desktop project-file tests for relative on-disk saves, moved-directory reopen resolution, and missing-relative fallback to the retained absolute path.
- `pnpm --filter @rough-cut/project-model test` → 111 / 111 pass.
- `pnpm --filter @rough-cut/desktop test` → 269 / 269 pass.
- `pnpm typecheck` → pass.
- `git diff --check` → pass.

### ~~TASK-085~~ Atomic project file writes with temp-and-rename pattern

**Priority:** P1  
**Status:** DONE

#### Context

`apps/desktop/src/main/project-files.mjs:106-110` did a single `writeFile`. If the process died mid-write, the project file was corrupt and unrecoverable.

#### Completion Notes

- `saveProjectFile` now writes to `<path>.tmp` via `fs.open(...).writeFile()` + `fileHandle.sync()` (fsync), then atomically `rename()`s over the target. Tmp file handle is always closed in a `finally` block.
- Before the rename, the previous good file (if any) is `copyFile`'d to `<path>.bak` so one prior generation is always retained for fallback.
- `openProjectFile` now stats `<path>.tmp` and `<path>.bak` and surfaces them in the result as `interruptedSave` and `backup` (each with `path`, `size`, `modifiedAt`). The rest of the document load is unchanged.
- New exported helper `discardInterruptedSave(projectPath)` removes a stray `.tmp` (idempotent — `ENOENT` is silently ignored).
- Exported `PROJECT_TEMP_SUFFIX` and `PROJECT_BACKUP_SUFFIX` so callers can name the side files consistently.

#### Verification

- 4 new tests in `project-files.test.mjs`: tmp cleaned on success, `.bak` snapshot reflects the previous (not the new) contents, opening with a leftover `.tmp` returns the intact original and surfaces `interruptedSave`, `discardInterruptedSave` is idempotent.
- `pnpm --filter @rough-cut/desktop test` → 192 / 192 pass.

### TASK-086 Add GIF and WebM export presets

**Priority:** P2  
**Status:** ✅ DONE (2026-05-19)

#### Context

`packages/project-model/src/schemas.ts:29-30` declares `webm` and `gif` codecs in the schema. `apps/desktop/src/main/export-service.mjs:262-266` hardcodes H.264 MP4. The schema is a stub for codec choice that was never honored.

#### Acceptance Criteria

- Wire codec choice end-to-end so WebM and GIF presets actually emit those formats.
- GIF preset uses the standard `palettegen` + `paletteuse` two-pass pipeline for quality.
- WebM uses VP9 with a sane CRF.
- Export progress/cancel works for both new pipelines.

#### Verification

- New unit/smoke covers GIF and WebM exports producing valid files.
- `pnpm smoke:styled-export` extended.

### TASK-087 Add 9:16 vertical and 1:1 square export presets

**Priority:** P2  
**Status:** ✅ DONE (2026-05-19)

#### Context

TASK-028 added aspect-ratio support, but the export surface has no one-click presets for vertical (TikTok/Reels) or square (Instagram). The user has to know what aspect ratio to pick.

#### Acceptance Criteria

- Named presets in the export panel: "Vertical 9:16 (TikTok/Reels)", "Square 1:1 (Instagram)".
- Choosing a preset sets canvas resolution, output size, and aspect ratio together.
- Existing 16:9 default unchanged.

#### Verification

- UI smoke covers preset selection and export size validation.
- Manual: export each preset and verify pixel dimensions.

### ~~TASK-088~~ Add autosave and crash recovery for orphaned recordings

**Priority:** P1  
**Status:** DONE

#### Context

The recording-recovery marker existed at `recording-session.mjs:45-69` but no UI surfaced it on next launch. There was also no autosave for an open project — if the app died mid-edit, work was lost.

#### Completion Notes

- New backend module `apps/desktop/src/main/recording-recovery.mjs` with `readRecoveryMarker`, `getRecoveryState`, `recoverFromMarker`, and `dismissRecovery`. The recovery flow shells out to the existing `remuxMkvToMp4` (which now includes coherence validation from TASK-067) plus `saveProjectForRecording`, so the recovered project has the same shape as a normal stop. Camera failures fall back to screen-only with a `cameraError`.
- Wired three IPC handlers in `index.mjs`: `RECORDING_RECOVERY_GET`, `RECORDING_RECOVERY_RECOVER`, `RECORDING_RECOVERY_DISMISS` (with a `deleteFiles` option to also wipe the raw .mkv / .mp4 / cursor sidecar). Preload bridge methods `getRecoveryState`, `recoverLastRecording`, `dismissRecovery` exposed to the renderer.
- Renderer: on app mount, the renderer fetches recovery state once. When `available: true`, a `RecoveryBanner` shows in the recorder shell with the original session start time and two actions: **Recover** (calls `recoverLastRecording`, opens the resulting project, surfaces any `remuxWarnings` as a banner-error) and **Discard** (calls `dismissRecovery({ deleteFiles: true })`). Banner is hidden while recording is in progress to avoid distraction.
- Renderer autosave: a 60-second interval runs `saveProject` whenever a project is loaded. Routes through `PROJECT_SAVE` IPC, which goes through TASK-085 atomic writes — a kill mid-autosave can never corrupt the .roughcut file.
- Decided to skip the settings toggle for "disable autosave" (per scope choice — minimal UI). Default-on autosave is universally safe given atomic writes + .bak snapshot from TASK-085. Toggle can land in a follow-up.

#### Verification

- 11 new unit tests in `recording-recovery.test.mjs`: missing marker, parsed marker, raw missing, raw present, full recover happy path, partial-recovery warnings propagated, camera-fallback, no-recovery rejection, dismiss-marker-only, dismiss-with-files, dismiss-noop.
- `pnpm --filter @rough-cut/desktop test` → 216 / 216 pass.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- Manual still recommended: SIGKILL Electron mid-recording, relaunch the recorder, verify the banner appears and Recover produces a project that opens.

### TASK-089 Bundle ffmpeg-static and ffprobe-static binaries

**Priority:** P2  
**Status:** DONE (2026-05-20)

#### Context

`scripts/package-linux.mjs` ships an Electron binary plus a `run.sh`. ffmpeg, ffprobe, xdotool, and xinput are runtime dependencies; the preflight checker warns when they are missing. Recordly bundles `ffmpeg-static` and `ffprobe-static` as npm dependencies (verified in their package.json).

#### Acceptance Criteria

- Add `ffmpeg-static` and `ffprobe-static` as production dependencies.
- Recording and export resolve their binary path through these packages first, with a system-PATH fallback for dev.
- Document strategy for `xdotool`/`wmctrl` (system deps until TASK-092 lands).

#### Verification

- Packaged build runs on a clean system without ffmpeg installed.
- `pnpm smoke:package` passes without system ffmpeg.

### TASK-090 Build AppImage and deb installer with electron-updater

**Priority:** P3  
**Status:** IN PROGRESS

#### Context

The Linux artifact today is a tar of Electron plus `run.sh`. There is no installer (AppImage/.deb/.rpm), no auto-update channel, no integrity check, no code signing.

#### Acceptance Criteria

- Configure `electron-builder` for AppImage and .deb output.
- Wire `electron-updater` to a versioned update channel.
- Document the release flow.

#### Verification

- `pnpm release:create` produces signed AppImage and .deb artifacts.
- Manual: install AppImage, run, then upgrade through the in-app updater.

### TASK-091 Add opt-in crash reporting and error telemetry

**Priority:** P3  
**Status:** PLANNED

#### Context

Errors land in console plus a log file the user must find via Diagnostics. There is no Sentry/Bugsnag/equivalent. Real-user issues require the user to email logs.

#### Acceptance Criteria

- Opt-in crash reporting in first-run/settings dialog with clear copy on what is sent.
- Hook Electron crashReporter and renderer-side error boundary into the chosen channel.
- Local-only fallback when telemetry is disabled.

#### Verification

- Manual: opt in, force a crash, confirm the report arrives at the destination.

### TASK-092 Replace xdotool and xinput stack with uiohook-napi

**Priority:** P2  
**Status:** PLANNED

#### Context

`apps/desktop/src/main/recording/xdotool-cursor.mjs` and `apps/desktop/src/main/recording/xinput-button-listener.mjs` spawn separate subprocesses on every recording. Recordly uses `uiohook-napi`, a single native lib that handles cursor+keyboard cross-platform. This eliminates two child-process orphan risks (TASK-066), reduces IPC overhead, and is a precondition for cross-platform support.

#### Acceptance Criteria

- Add `uiohook-napi` and a typed wrapper that produces the existing cursor/click event shape.
- Gate behind a feature flag during rollout; old xdotool path removable when verified.
- Existing recording-session, regression fixtures, and test suite continue to pass.

#### Verification

- Unit test parity between old and new sources on a fixed event stream.
- `pnpm smoke:real-recording` passes on the new source.
- Manual: long recording with frequent clicks confirms cursor/click telemetry matches old behavior.

### TASK-093 Split countdown and HUD indicator into BrowserWindows

**Priority:** P3  
**Status:** PLANNED

#### Context

Recordly renders countdown, source-selector, hud-overlay, update-toast, and the editor as separate BrowserWindows. Rough-cut renders the countdown and the recording indicator inside the main React app. The new region-selector overlay (uncommitted) already follows the multi-window pattern; extending it to countdown and a recording HUD aligns with that direction and frees the main editor from full-screen overlays.

#### Acceptance Criteria

- Countdown lives in its own transparent always-on-top BrowserWindow.
- Recording indicator (HUD) lives in a small always-on-top BrowserWindow with click-through where appropriate.
- Both windows close cleanly on cancel and recording end.
- Existing UI smokes adapted to the multi-window flow.

#### Verification

- Updated UI smokes cover countdown and HUD windows.
- Manual: record once, confirm countdown is its own window and the HUD appears immediately and survives focus changes.

### TASK-094 Add Inspector templates picker for one-click aspect+background+camera

**Priority:** P2
**Status:** DONE

#### Context

The legacy `rough-cut` app exposes a Templates picker in the record sidebar that combines aspect ratio, background, and camera layout. In rough-cut-mvp the equivalent affordances were split across separate Inspector controls: aspect ratio in Canvas, background presets in the Background tool, camera position/size in the Camera section. To pick "Mobile 9:16 with violet dusk" a user had to make three unrelated choices that didn't read as a unit. Watchpost surfaces this gap as the entry point of the "Record sidebar authoring toolset" instance (Instance 58ad3a0f).

#### Acceptance Criteria

- A Templates section appears at the top of the Inspector tool with first-slice cards: Tutorial 16:9, Mobile 9:16, Square 1:1.
- Selecting a card sets aspect ratio, background preset, and camera position/shape/size together, preserving frame controls (padding, corner radius, shadow size/opacity/distance).
- The active template is reflected back in the card UI when both aspect ratio and background match a known template.
- Existing Inspector controls (Canvas, Screen, Recording, Zoom, Cursor, Camera, Diagnostics) remain unchanged.
- Camera fan-out is a safe no-op when the project has no linked camera asset (`updateCameraPresentation` is gated by `hasCamera`).

#### Verification

- New project-model unit suite `recording-templates.test.ts` covers preset definitions, apply behavior preserving frame controls, camera patches, unknown-id handling, and active-id detection (`pnpm --filter @rough-cut/project-model test` — 109/109 pass).
- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 179/179 pass.
- `pnpm smoke:ui` — pass; existing `hasInspectorGroups`, `hasInspectorContext`, and aspect-ratio assertions unaffected.
- 2026-05-09: Templates module landed at `packages/project-model/src/recording-templates.ts` with `RECORDING_TEMPLATE_PRESETS`, `applyRecordingTemplatePreset`, `findRecordingTemplatePresetId`. Renderer wires a `TemplatePresetGrid` in the Inspector that fans selection into the existing `onAspectRatioChange`, `onBackgroundChange`, and `onCameraPresentationChange` handlers, so persistence and styled-export paths reuse already-tested code. Tutorial 16:9 → corner-br circle 110, Mobile 9:16 → corner-bl rounded 150, Square 1:1 → corner-tr circle 100.

### TASK-095 Add drag-to-reposition camera PiP and screen frame in editor preview

**Priority:** P2
**Status:** DONE

#### Context

Today the camera PiP position is picked from a five-slot enum (`corner-br/bl/tr/tl/center`) in the Inspector, and the screen recording fills the styled canvas implicitly determined by the aspect ratio. There is no direct manipulation on the preview itself. Screen Studio is also fixed-slot for camera placement (this is an open feature request on their hub) but supports the next layer up: per-segment **Dynamic Camera Layouts** on a timeline track. The legacy `/rough-cut/` repo carries `screenFrame` and `cameraFrame` normalized rectangles in `recordingAsset.presentation`, which is the data shape required to draw drag handles and persist free placement. rough-cut-mvp's project schema already declares both fields as optional `NormalizedRect` on `RecordingPresentation` and the renderer's `resolveCameraFrame` already consumes them — the gaps are the styled-export pipeline (slice 1) and the editor-preview drag handles (slice 2+).

#### Acceptance Criteria

- Project model exposes `cameraFrame` and `screenFrame` as optional `NormalizedRect` (0..1) on `RecordingPresentation`. (Already in place.)
- Editor preview renders drag handles on the camera PiP and the screen rectangle when the project has a recording. Dragging updates the normalized frame in project state; resizing keeps aspect ratio of the source.
- When `cameraFrame` is undefined, position falls back to the existing five-slot enum (no regression for current projects). When set, it overrides the enum.
- Templates (TASK-094) clear `cameraFrame` / `screenFrame` so a template re-assert returns to its default slot — same behavior as legacy `handleTemplateChange` in `/rough-cut/`.
- Styled export consumes `cameraFrame` / `screenFrame` when present; raw export is unaffected.
- Per-frame-rate timing, trim, cut, and zoom marker behavior are all unchanged.

#### Progress

- 2026-05-09: Slice 1 — data plumbing for camera. Discovery confirmed `RecordingPresentation.cameraFrame` and `screenFrame` already exist as optional `NormalizedRect` fields and the renderer's `resolveCameraFrame` already prefers a normalized rect over enum-derived placement. Remaining gap was the export pipeline. Added `cameraFrame` parameter to `buildStyledExportArgs`, threaded through from `recording.presentation?.cameraFrame ?? null` at the call site, and updated `resolveCameraOverlayFrame` to convert the normalized rect to canvas pixels when provided. Two new export-service tests cover the override path (1920×1080 with `{x:0.1,y:0.2,w:0.25,h:0.4}` resolves to `overlay=192:216` and `scale=480:432`) and the enum fallback path. Desktop tests 179/179, typecheck pass, `pnpm smoke:ui` pass.
- 2026-05-09: Slice 2 — drag handles for the camera PiP. `updateCameraFrame` writes `presentation.cameraFrame` (or clears it) through the same persist path. `VideoPreview` accepts `onCameraFrameChange`, captures canvas-pixel camera rect from the tick into `cameraRectRef`, and runs pointer handlers on the canvas: hover camera rect → cursor `grab`; pointer-down captures the pointer and primes `cameraDragRef`; pointer-move updates the override clamped to canvas bounds so the tick renders instantly; pointer-up commits via the callback. Templates clear `cameraFrame` on apply. Added `clampUnit` helper and `.styledPreviewCanvas { touch-action: none }` + `.draggingCamera { cursor: grabbing }`. Desktop tests 219/219, typecheck pass.
- 2026-05-11: Slice 3 — styled export now consumes `presentation.screenFrame` when present. The export builder converts the normalized screen rect to canvas pixels, scales/crops the recording into that frame, and positions the rounded screen layer plus shadow at the same coordinates. Added an export-service regression covering `{x:0.1,y:0.2,w:0.5,h:0.4}` → `scale=960:432`, `crop=960:432`, `overlay=192:216`. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test` (244/244), and `pnpm smoke:ui`.
- 2026-05-11: Slice 4 — editor preview now reuses the camera drag primitive for the screen frame. `updateScreenFrame` persists `presentation.screenFrame`; `VideoPreview` resolves `frame.screenFrame`, renders the screen layer at the custom rect, hit-tests the screen canvas rect, and commits normalized screen drag updates on pointer-up. Camera hit-testing stays first so the PiP remains draggable when it overlaps the screen. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test` (244/244), and `pnpm smoke:ui`.
- 2026-05-11: Slice 5 — editor preview now draws dashed resize outlines plus all eight edge/corner resize handles for both screen and camera frames. Resize preserves aspect ratio, clamps inside the styled canvas, and marks the preview loop dirty so paused-frame drag/resize feedback redraws immediately instead of waiting for video playback. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test` (250/250), and `pnpm smoke:ui`.

#### Completion Notes

- Direct-manipulation placement is now supported for both the screen recording frame and the camera PiP.
- Templates clear `cameraFrame` and `screenFrame`, restoring preset/default layout behavior.
- Styled export consumes both normalized frame overrides; raw export remains unaffected.
- Camera-source validation for fresh recordings was completed in TASK-098/TASK-099.

#### Dependencies

- Builds on TASK-094 (templates) for the "template clears custom frames" behavior.
- Should land before any future Dynamic Camera Layouts timeline track work.

### TASK-096 Single-ffmpeg architecture for live camera preview + capture

**Priority:** P2
**Status:** PLANNED

#### Context

Live webcam preview in the pre-record panel is currently disabled (`64c112c`) because Chromium's media pipeline does not synchronously close the V4L2 file descriptor on `MediaStreamTrack.stop()`. Confirmed empirically on 2026-05-10: `lsof /dev/video0` showed the renderer Electron PID holding FD 21u plus a `mem` mapping for the entire recording window, blocking ffmpeg-camera with `Device or resource busy` on every spawn attempt for 12+ seconds. Perplexity research confirmed this is a known Chromium V4L2 behavior with no app-level fix — it's intentional buffer/GPU reference counting that defers FD release.

Production tools (OBS, Loom, etc.) avoid the conflict by having a single long-running ffmpeg own the device and feeding preview frames to the UI via IPC.

#### Acceptance Criteria

- Main process owns one long-running ffmpeg-camera that opens `/dev/video*` once when a camera source is selected.
- That ffmpeg pipes frames (MJPEG over stdout, or via local socket/MSE) to the renderer for live preview in the pre-record panel.
- Clicking Record switches the same ffmpeg's encoding/output target to the take's camera mkv without releasing the V4L2 device.
- `cameraDevicePath` IPC contract preserved so the rest of the recording pipeline is unchanged.
- Repeat takes back-to-back without restarting Electron; `lsof /dev/video0` shows ffmpeg-camera (not the renderer) as the holder.
- Replaces the static "Camera ready" placeholder in `PreRecordCameraSetup`.

#### Verification

- Manual: open pre-record panel, see live preview, record, stop, confirm camera mp4 has content matching what was previewed; do this 3× without restart.
- `lsof /dev/video0` mid-recording shows the main-process ffmpeg as the holder, not the renderer.
- Existing recording-flow smokes still pass.

#### Completion Notes

- Added a main-process ffmpeg camera preview path that owns `/dev/video*`, pipes MJPEG frames over stdout, and forwards JPEG data URLs to the renderer over IPC.
- Replaced the static pre-record camera placeholder with a live preview state while keeping Chromium/getUserMedia out of camera ownership.
- Recording start stops the preview ffmpeg before the unified recording ffmpeg opens the same V4L2 device; the existing `cameraDevicePath` contract remains unchanged.
- Added regression coverage for preview ffmpeg args and split MJPEG frame parsing.
- Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test` (252/252), `pnpm smoke:ui`, and `ROUGH_CUT_UI_SMOKE_CAMERA_WARNING=1 ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH=/dev/video0 node scripts/smoke-recording-flow-ui.mjs`.

#### References

- `64c112c` — current workaround disabling preview.
- `f12711a` — lsof diagnostic that proved the renderer was the holder.
- Perplexity research notes (this session, 2026-05-10) recommending the single-ffmpeg pattern.

### TASK-097 Fix Inspector Templates click not propagating aspect ratio

**Priority:** P2
**Status:** DONE

#### Context

Reported by user 2026-05-10 after `3f39240` (TASK-094) shipped. Clicking a Templates card in the Inspector (e.g. Mobile 9:16) does not change the Inspector's "Aspect ratio" dropdown, the active-template visual state (`aria-pressed`), or the styled preview's aspect ratio. Camera/background side effects are visually subtle and were not separately confirmed; aspect ratio is the smoking gun because it's directly observable in `getComputedStyle(canvas).aspectRatio`.

DevTools snapshot from the bug session, with the Mobile 9:16 card present and not disabled:

```
aspect select found? true
aspect BEFORE click: auto
card aria-pressed BEFORE click: false
card?.click()  // returned undefined; no throw
aspect AFTER click: auto                        // ← unchanged
card aria-pressed AFTER click: false            // ← unchanged
preview canvas aspect-ratio: 1920 / 1080         // ← still 16:9
```

Click event reaches the DOM but no state mutation results. Possible failure points (in order of suspicion):

1. `handleTemplatePresetSelect` is never called because the React click handler isn't attached (HMR-stale closure or React event delegation glitch). A page reload may fix this, in which case the bug is "after a hot-reload templates stop working".
2. `applyRecordingTemplatePreset(bg, templateId)` returns `undefined` so the early return at `main.tsx:1482` silently no-ops. (Tested unlikely — preset module has unit coverage.)
3. `onAspectRatioChange` is undefined on the EditorToolBoard prop chain when invoked from the click closure, so `?.` short-circuits.
4. `updateAspectRatio` runs, sees `nextAspectRatio === aspectRatio` because `aspectRatio` is read from a stale closure, and returns the no-op early branch.
5. `persist` runs, the IPC `project:save` handler queues the save behind a stuck prior save (`isSaving` true forever in renderer state).

#### Acceptance Criteria

- Clicking each of the three template cards reliably updates: aspect ratio dropdown, `aria-pressed` on the active card, the preview canvas's computed aspect ratio, and (for projects with a linked camera) the camera position/shape/size.
- Reproduces the user's diagnostic snippet above passing on each card.
- A regression test exercises the click → state-update path so this can't silently break again.

#### Verification

Reproduce in DevTools console with this self-contained snippet (paste verbatim):

```js
(() => {
  const aspectSelect = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.value === '9:16'));
  const card = document.querySelector('[data-template-id="mobile-9-16"]');
  console.log('aspect BEFORE:', aspectSelect?.value, 'pressed BEFORE:', card?.getAttribute('aria-pressed'));
  card?.click();
  setTimeout(() => {
    console.log('aspect AFTER:', aspectSelect?.value, 'pressed AFTER:', card?.getAttribute('aria-pressed'));
    console.log('canvas ratio:', getComputedStyle(document.querySelector('.styledPreviewCanvas'))?.aspectRatio);
  }, 500);
})();
```

Expected when fixed: `aspect AFTER: 9:16`, `pressed AFTER: true`, `canvas ratio: 1080 / 1920`.

#### Completion Notes

- Verified the template click path in `pnpm smoke:ui`: the smoke selects `[data-template-id="mobile-9-16"]`, waits for the Aspect ratio control to become `9:16`, and confirms the selected template's `aria-pressed` state.
- Fixed template application to clear stale custom `screenFrame` along with `cameraFrame`, so applying a template cannot leave a custom editor preview frame overriding the preset aspect/layout.
- Regression coverage: `pnpm smoke:ui` now reports `hasTemplatePresetSelection: true` and `aspectRatio: "9:16"`.

#### Verified

- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`

#### Investigation steps when picking this up

1. Add `console.info('[template-click]', ...)` at the top of `handleTemplatePresetSelect` and `[updateAspectRatio]` at the top of `updateAspectRatio` in `apps/desktop/src/renderer/src/main.tsx`. Reload, click, observe.
2. If `[template-click]` doesn't print, the React handler isn't attached — investigate HMR / event delegation. A full page reload (Ctrl+R) may make the bug disappear, narrowing to "HMR-induced stale handler".
3. If `[template-click]` prints but `[updateAspectRatio]` doesn't, `onAspectRatioChange` is undefined on the EditorToolBoard prop. Check the prop wiring at the EditorToolBoard call site (`main.tsx` ~line 2023).
4. If both print but the dropdown stays at `auto`, look at `persist` and the `project:save` IPC queue.

### TASK-098 Verify playback smoothness end-to-end after MJPEG camera fix

**Priority:** P2
**Status:** DONE

#### Context

User reported "playback is not smooth / full fps" on 2026-05-10. Root cause was the camera being captured at 10 fps because ffmpeg's v4l2 demuxer defaulted to YUYV (which caps at 10 fps for 1280x720 on the Lenovo FHD UVC). Fix landed in `4010dde` — `-input_format mjpeg` so the camera negotiates 30 fps. Direct ffmpeg test verified the stream produces 30/30 fps after the flag.

What's not yet verified: that the user, in their actual Electron build, after a fresh take, sees smooth 30 fps playback in the editor preview. The renderer's tick has frame-dedup that draws at most once per source frame, and `049ee2a` synced the canvas redraw to both screen and camera seek-settled state, but neither has been confirmed to render smoothly with a 30 fps camera-mp4 input.

#### Acceptance Criteria

- Record a 5–10 second take with camera enabled.
- Inspect the resulting `-camera.mp4` with `ffprobe` — must report `30 fps` and frame count ≈ duration_seconds × 30.
- Open the take in the editor and play it. Visually smooth, no stutter on the camera PiP, no perceptible drops.
- Scrubbing does not cause camera to disappear/reappear (covered by `049ee2a` but verify in this state).

#### Verification

```bash
ffprobe -v 0 -select_streams v:0 -show_entries stream=avg_frame_rate,nb_frames \
  -of default=nw=1 ~/Documents/Rough\ Cut\ MVP/recordings/<latest>-camera.mp4
```

Expect `avg_frame_rate=30/1` and frame count ≈ 30 × take_duration_sec.

If smoothness is still bad despite the camera reporting 30 fps, the issue is renderer-side — open DevTools → Performance, record 5 s of playback, and inspect which canvas/draw call dominates. Likely culprits in order: `ctx.save()/restore()` overhead per tick, `drawCursorPath` shadow blur, the camera roundedrect clip with shadow. Mitigation: cache the cursor path/shadow on an offscreen canvas, or skip cursor draw when there's no recent move event.

#### 2026-05-10 follow-up

Verification found a separate sync/tail issue on `/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-05-10T14-43-42-117Z.roughcut`: the screen MP4 had 70 frames, while the linked camera MP4 had a 75-frame preroll offset and only enough overlap for ~56 frames. The editor was still using stale project duration metadata, so playback reached a region where screen/camera media no longer overlapped.

Implemented sync probing after remux with `ffprobe`, stores overlap metadata on the saved project, and clamps preview/timeline duration to the shared screen+camera overlap so both tracks stop together. Added renderer seek/playback clamps so the camera PiP does not disappear or freeze when scrubbing near the tail.

Verified so far:

- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test` (`232/232`)
- `pnpm --filter @rough-cut/desktop build`
- `node scripts/repro-task098-playback.mjs "/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-05-10T14-43-42-117Z.roughcut"`
- `pnpm smoke:ui`

Fresh camera smoke is still pending: `ROUGH_CUT_REAL_SMOKE_CAMERA_DEVICE_PATH=/dev/video0 node scripts/smoke-real-recording.mjs` could not validate camera sync because `/dev/video0` was busy (`zen` held the camera), causing a screen-only fallback.

Perplexity follow-up confirmed the long-duration fix should use one FFmpeg process with x11grab, v4l2, and PulseAudio inputs into an MKV intermediate. The current session still uses separate screen/audio and camera FFmpeg processes, so this task now only fixes saved-project overlap and playback clamping. TASK-100 tracks the capture architecture change required to make 10/30/60-minute drift prevention credible.

2026-05-10 second follow-up: latest take `rough-cut-2026-05-10T16-35-27-030Z` showed why frame-count overlap is wrong. Screen was 201 frames / 6.7 s at 30 fps; camera was 225 decoded frames / 9.233 s at avg ~24.37 fps, with 75-frame preroll. Frame math incorrectly trimmed to 150 frames. Sync math now prefers probed media seconds (`min(screenDurationSec, cameraDurationSec - prerollSec)`) and only then converts to project frames, which keeps this take at the full 201 screen frames.

2026-05-11 camera validation: after releasing `/dev/video0`, `ROUGH_CUT_REAL_SMOKE_CAMERA_DEVICE_PATH=/dev/video0 node scripts/smoke-real-recording.mjs` passed end-to-end using unified capture. The smoke saved `/tmp/rough-cut-real-recording-smoke-RyIG2B/rough-cut-2026-05-11T06-52-33-419Z.roughcut`, produced a linked camera MP4, reopened the project in the editor, verified the styled preview UI, and exported a styled MP4. Camera probe reported `avg_frame_rate=30/1`, `duration=4.300000`, and `nb_frames=129`; sync probe reported `screenFrames=131`, `cameraFrames=131`, `cameraSourceInFrames=1`, `syncedDurationFrames=130`, and `syncWarning=null`.

### TASK-100 Migrate screen camera audio capture to one FFmpeg graph

**Priority:** P1
**Status:** DONE

#### Context

Separate FFmpeg processes for screen/audio and camera can be aligned after the fact for short recordings, but they cannot guarantee no accumulated drift over 10, 30, or 60 minutes. External research and ffmpeg behavior both point to a single process with multiple inputs as the correct architecture because FFmpeg can synchronize streams by timestamps inside one graph.

This is the real long-term sync task. Do not solve it by adding more preview clamps or frame-count math. TASK-098 already handles short-term saved-project overlap by using probed media seconds. TASK-100 must change capture architecture so new recordings are timestamp-coherent at the source.

Current architecture to replace:

- `apps/desktop/src/main/recording/recording-session.mjs` starts camera first via `startFfmpegCameraCapture()`, waits `ROUGH_CUT_CAMERA_WARMUP_MS`, then starts screen/audio via `startFfmpegCapture()`.
- `apps/desktop/src/main/recording/ffmpeg-capture.mjs` has separate builders: `buildFfmpegCameraCaptureArgs()` and `buildFfmpegCaptureArgs()`.
- Project save currently stores camera as a linked asset with `sourceInFrames`/`prerollMs`; these should become derived metadata from stream timestamps, not the primary sync model.

Desired architecture:

- Add one FFmpeg capture path for screen + optional camera + optional PulseAudio inputs into one Matroska intermediate.
- Use one process when camera is enabled. Keep existing screen-only path unless/until the unified path proves stable.
- Prefer timestamp preservation and stream probing over decoded frame counts.
- Camera audio stays disabled by default; camera input is video-only unless a future task explicitly adds camera audio.

Suggested FFmpeg shape to adapt/test, not blindly paste:

```bash
ffmpeg -y -progress pipe:1 -stats_period 0.05 \
  -thread_queue_size 1024 -f x11grab -draw_mouse 0 -framerate 30 -video_size <screenWxH> -i <display> \
  -thread_queue_size 1024 -use_wallclock_as_timestamps 1 -f v4l2 -input_format mjpeg -framerate 30 -video_size 1280x720 -i /dev/video0 \
  [-thread_queue_size 1024 -f pulse -ac 2 -ar 48000 -i <system-monitor>] \
  [-thread_queue_size 1024 -f pulse -ac 2 -ar 48000 -i <mic-source>] \
  -map 0:v -map 1:v [audio maps/filter_complex as today] \
  -c:v:0 libx264 -preset superfast -crf 16 -pix_fmt yuv420p \
  -c:v:1 libx264 -preset superfast -crf 18 -pix_fmt yuv420p \
  [-c:a aac -b:a 192k -ar 48000] \
  -f matroska <output>.mkv
```

Investigate whether `-copyts -start_at_zero`, `-fps_mode`, `-vsync`, or v4l2 `-ts mono2abs` improve or hurt this repo’s actual devices before locking them in. Do not use deprecated `-async`; if audio drift appears, use `aresample=async=1:first_pts=0` deliberately in the audio filter path.

Implementation outline:

1. Add a tested command builder, e.g. `buildFfmpegUnifiedCaptureArgs()`, in `apps/desktop/src/main/recording/ffmpeg-capture.mjs`.
2. Add a capture handle, e.g. `startFfmpegUnifiedCapture()`, with the same stop/cancel semantics and child reaping behavior as existing handles.
3. Update `recording-session.mjs` to use the unified capture when `cameraDevicePath` is present, instead of spawning `ffmpeg-camera` plus `ffmpeg-screen` separately.
4. Decide post-stop media products. Preferred low-risk path: keep MKV as source-of-truth, then extract/remux screen and camera preview MP4s for Electron playback while storing stream timing from the MKV probe.
5. Extend `media-probe.mjs` to probe multi-stream timing: stream index, `start_time`, `duration`, `time_base`, `avg_frame_rate`, decoded frames, and packet `pts_time` samples at start/middle/end if needed.
6. Update `project-files.mjs` so camera clip placement is derived from probed stream timing/PTS, not `cameraPrerollMs` frame math.
7. Update export path only if required after project schema/media representation changes; export must use the same timestamp-derived offset as preview.

Important design decision for the next instance:

- If Electron cannot reliably preview two streams from one MKV, do not abandon MKV as source-of-truth. Generate aligned preview MP4 derivatives after stop, but keep original MKV timing metadata as authoritative.

Tests to add before manual recording:

- `ffmpeg-capture-args.test.mjs`: unified command puts input options before each `-i`, maps screen/camera as separate video streams, preserves audio mix behavior, and keeps camera audio disabled.
- `recording-session.test.mjs`: camera-enabled session starts one unified child, not separate screen/camera children; screen-only session remains unchanged.
- `media-probe.test.mjs`: multi-stream probe returns per-stream timing and does not use decoded frame count as the primary sync duration.
- `project-files.test.mjs`: linked camera clip placement comes from stream timing metadata.

#### Acceptance Criteria

- Screen, optional camera, and optional PulseAudio sources are captured by one FFmpeg process when camera is enabled.
- The capture writes a Matroska intermediate that preserves stream timestamps.
- Camera audio remains disabled unless explicitly requested; mic/system audio stay primary.
- Project creation derives screen/camera track placement from probed PTS/duration, not decoded frame counts.
- Existing screen-only recording flow still works.
- Existing camera busy fallback still saves a screen-only project with warning metadata.
- Long-duration validation covers at least 10 minutes before marking done; 30/60 minute smoke can remain manual but documented.

#### Verification

2026-05-10 completion verification:

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 243/243 pass.
- `pnpm --filter @rough-cut/desktop build` — pass.
- `pnpm smoke:ui` — pass.
- Short real camera smoke with `/dev/video0` passed after the unified-capture sync duration fix.
- 10-minute real camera run saved `/tmp/rough-cut-real-recording-smoke-OIEC76/rough-cut-2026-05-10T18-23-04-102Z.roughcut` from one MKV source. Diagnostics reported `mediaDurationMs=600833`, `durationDeltaMs=-1111`, 17,968 cursor events, no audio as expected, and no drop/queue warnings.
- Source MKV probe verified two timestamped video streams: screen `640x360`, `30/1`, `start_time=0.000000`; camera `1280x720`, `30/1`, `start_time=0.033000`.
- Saved project stores timestamp-derived sync: `screenFrames=18025`, `cameraFrames=18025`, `cameraSourceInFrames=1`, `syncedDurationFrames=18024`, `syncWarning=null`.
- Remuxed derivatives verified: screen MP4 `600.833s` / 18,010 decoded frames; camera MP4 `start_time=0.033000`, `600.700s` / 10,425 decoded frames. Decoded camera frame count is not used as primary sync authority.
- Styled export verification used 2-second trimmed exports at start, middle, and end of the saved 10-minute project. All three produced readable `1920x1080`, `30/1`, 60-frame MP4s with the linked camera overlay path active.
- Fixed a blocking styled-export background-image issue discovered during verification: single-frame background images no longer use `shortest=1`, which previously collapsed long exports to one frame.

Useful probe commands:

```bash
ffprobe -v error -show_format -show_streams -of json <capture>.mkv
ffprobe -v error -select_streams v:0 -show_packets -show_entries packet=pts_time,dts_time,duration_time,flags -of csv=p=0 <capture>.mkv
ffprobe -v error -select_streams v:1 -show_packets -show_entries packet=pts_time,dts_time,duration_time,flags -of csv=p=0 <capture>.mkv
```

Done means: no visible drift at the end of the 10-minute recording and no timestamp evidence of accumulating camera/screen divergence. Do not mark this done based only on a 5-second take.

### TASK-099 Verify post-recording blank editor is no longer reproducible

**Priority:** P3
**Status:** DONE

#### Context

Mid-2026-05-10 session, the user shared a screenshot with the editor in a degraded state: gray central stage with no preview, "Saved" chip top-left, and a paragraph of `Saved to: <path>` text rendered in a 1-character-wide column on the right side of the viewport (each character on its own line). It was hit while the user was also experiencing repeated save corruption (the `rough-cut-2026-05-09T20-23-05-118Z.roughcut` had `Unexpected non-whitespace character at position 34739`) and camera-stop hangs.

By the end of the session: save corruption is fixed (`5d9294e` + `5e1ef13`), camera stops cleanly (`256ea58` + `890897c`), and the renderer/main are running clean code. The blank-editor state may have been a transient consequence of one of those broken paths. No fresh repro since.

#### Acceptance Criteria

- Confirm the issue is no longer reproducible: record a fresh take, open the project in the editor, verify the styled preview canvas renders the screen + camera, the timeline rail loads, the inspector populates, and no text rendered as a vertical character column.
- If it does reproduce: capture the React component tree at that moment and the project file's JSON to root-cause. Likely candidates if the bug is real:
  - The `<StateBanner>` `Saved to: <path>` paragraph getting rendered into a CSS-grid column with `width: 0` because `.projectEditor` grid `minmax(0, 1fr)` collapsed.
  - The styled preview canvas failing to mount because `mediaUrl` is null after a partial save recovery.

#### Verification

Record a 5 s take with camera, stop, open the resulting project. Editor renders correctly = task DONE. If it doesn't, file the React DevTools snapshot.

#### Completion Notes

- 2026-05-11: Real camera smoke saved and reopened `/tmp/rough-cut-real-recording-smoke-RyIG2B/rough-cut-2026-05-11T06-52-33-419Z.roughcut` with `uiReport.ok: true`.
- The reopened editor reported `hasStyledPreviewCanvas`, `hasFrameDragHandles`, `hasTimelineRail`, `hasRightInspector`, `hasExportStatusArea`, and `hasVisualScreenshot` all true.
- No blank central stage or vertical `Saved to:` text column reproduced during the fresh camera recording flow.

### TASK-101 Define feature-flagged Full Editor shell

**Priority:** P3
**Status:** PLANNED

#### Context

Rough Cut should keep the compact Screen Studio-style workflow as the default. A fuller editor can unlock richer revisions, but it must not destabilize record -> review -> polish -> export. This task defines the optional Full Editor shell behind a feature flag before any advanced editing systems are implemented.

#### Acceptance Criteria

- Full Editor is specified as an optional mode, not the default editor path.
- The feature flag boundary is documented: entry point, persistence behavior, fallback behavior, and rollback path.
- The compact editor remains the source of truth for MVP workflows.
- The proposed shell lists the minimum surfaces needed for later tracks, annotations, captions, and keyframed presentation edits.
- No implementation starts until Phase 1 export/zoom/presentation gates are stable.

#### Verification

- Planning/design review only until implementation is approved.
- Confirm Watchpost keeps this lane locked behind Phase 1 dependencies.

### TASK-102 Add advanced timeline tracks for rich revisions

**Priority:** P3
**Status:** PLANNED

#### Context

Advanced revision work needs more timeline structure than the compact editor, but only after the compact workflow is safe. This task introduces track concepts for richer revisions without turning Rough Cut into a general-purpose NLE.

#### Acceptance Criteria

- Track model supports screen, camera, audio, zooms, captions, and annotations as separate editable concepts.
- Existing compact timeline projects migrate or render without behavior changes.
- Preview and export use the same timeline interpretation.
- Undo/redo and autosave cover all new track edits.
- The feature remains behind the Full Editor flag until dogfooding proves it stable.

#### Verification

- Unit tests for timeline model conversion and edit operations.
- Preview/export parity regression for a project using multiple track types.
- Manual packaged-app check with a real recording opened in compact mode and Full Editor mode.

### TASK-103 Add annotation and callout track foundation

**Priority:** P3
**Status:** PLANNED

#### Context

Annotations are useful for tutorials, but they can easily become a large drawing tool. This task keeps scope narrow: timeline-bound callouts that help explain demos without adding full design-editor complexity.

#### Acceptance Criteria

- Add a minimal annotation/callout track model with text, arrow/highlight box, time range, position, and style.
- Annotations render identically in preview and export.
- Annotations are non-destructive, undoable, and saved in project files.
- Compact editor is not cluttered; authoring can live in Full Editor or a gated panel.

#### Verification

- Unit tests for annotation schema and timeline edits.
- Visual regression for preview/export annotation parity.
- Manual export check with at least one text callout and one highlight box.

### TASK-104 Define AI motion suggestion data model

**Priority:** P4
**Status:** PLANNED

#### Context

AI motion design should be a late-stage enhancement, not a foundation. Suggestions must be optional, editable, reversible, and represented as normal timeline data so export and preview stay deterministic.

#### Acceptance Criteria

- Define a suggestion model for proposed zooms, pans, camera moves, cuts, and emphasis moments.
- Each suggestion includes confidence, source signals, affected time range, and a safe fallback.
- Applying a suggestion creates normal project edits that can be undone or manually adjusted.
- Rejected suggestions do not mutate project state.
- The model does not require cloud AI; local or external analysis can be plugged in later.

#### Verification

- Schema/unit tests for suggestion serialization and apply/reject behavior.
- Design review confirms suggestions can degrade gracefully when analysis is uncertain.

### TASK-105 Add safe AI motion preview and apply flow

**Priority:** P4
**Status:** PLANNED

#### Context

AI-generated motion can damage trust if it causes jank, export mismatch, or confusing edits. This task adds a safe preview/apply flow after the suggestion model and advanced editor foundations are stable.

#### Acceptance Criteria

- AI motion suggestions preview as overlays before mutating the timeline.
- Applying suggestions is atomic, undoable, and recoverable through autosave.
- Preview caching prevents generated motion from making playback unusable.
- Export output matches the accepted preview.
- Basic users can ignore the AI motion panel entirely.

#### Verification

- Unit tests for atomic apply/undo behavior.
- Visual regression comparing accepted AI motion preview to export.
- Performance smoke for previewing generated motion on target hardware.

### TASK-106 Define cloud sharing and collaboration scope

**Priority:** P4
**Status:** PLANNED

#### Context

Cloud sharing, comments, team workspaces, and hosted review links are useful but not required for local-first Screen Studio-style parity. This task keeps collaboration out of the core product until the local creator workflow is stable.

#### Acceptance Criteria

- Define which sharing/collaboration capabilities belong in Rough Cut and which are explicitly out of scope.
- Identify backend, privacy, storage, account, and billing implications before implementation.
- Preserve local-first export as the primary workflow.
- Do not start implementation until Phase 3 motion/design work is stable or the product strategy changes.

#### Verification

- Product review only.
- Confirm no cloud dependency is introduced into local record/edit/export flows.

### TASK-107 Audit sidebar controls and remove placeholder affordances

**Priority:** P2
**Status:** DONE

#### Context

The editor sidebars currently expose controls and icon tabs that do not all behave like finished product surfaces. The design rule is explicit: if a control is visible, it should do something. This task inventories every left-rail icon, sidebar section, inspector action, reset button, slider, preset, empty state, and disabled-looking affordance so placeholder UI is either wired, intentionally disabled with clear copy, or removed.

This covers the current Background/Timeline/Inspector sidebars, the right export sidebar, and any recording/review panels that appear in the main editor shell.

#### Acceptance Criteria

- Produce a sidebar control inventory grouped by visible surface: left rail, left panel, central preview controls, timeline rail, right export panel.
- Mark each element as wired, intentionally disabled, misleading, duplicate, dead, or placeholder.
- Remove or hide controls that cannot be implemented in the current phase.
- Replace misleading empty states with compact copy that explains the next action.
- Keep the right sidebar export-focused; do not move presentation authoring back into the export area.
- Update smoke assertions to fail if known placeholder labels or inert buttons return.

#### Verification

- `pnpm smoke:ui`
- Manual packaged-app pass: click every visible sidebar tab/action/control and confirm it either changes editor state, opens a real flow, or is clearly disabled with a reason.

#### Audit Findings (2026-05-15)

Inventory at `apps/desktop/src/renderer/src/main.tsx`. Classification key: ✅ wired · 🔁 duplicate · 🚧 placeholder · 💀 dead · ⚠️ misleading · ℹ️ informational/empty-state.

**A. Top bar (`.topBar` / `capture-bar`)** — 778

| Control | Line | Status |
| --- | --- | --- |
| Toggle setup board (sparkle) | 787 | ✅ |
| Toggle inspector board (sliders) | 790 | ✅ |
| Undo | 793 | ✅ (disabled state correct) |
| Redo | 796 | ✅ |
| Record / Stop | 799 | ✅ |
| Cancel take (only while recording) | 809 | ✅ |
| Open project | 813 | ✅ |

**B. Tool rail (`ToolRail`)** — 1668: all three tabs (Background / Timeline / Inspector) ✅.

**C. Background board** (activeTool=`background`) — 1905

| Control | Line | Status |
| --- | --- | --- |
| BoardHeader "Reset" (canvas background) | 1907 | ✅ |
| Background presets grid | 1909 | ✅ |
| BoardHeader "Reset" (frame) | 1911 | ✅ |
| Frame: Outline / Radius / Padding sliders | 1913–1915 | 🔁 Padding+Radius also live in Inspector → Screen |
| BoardHeader "Reset" (shadow) | 1917 | ✅ |
| Shadow: Enable / Strength / Softness / Distance | 1919–1922 | 🔁 Enable+Softness duplicate Inspector → Screen (with different ranges) |

**D. Timeline board** (activeTool=`timeline`) — 1811: Playhead clock (ℹ️ read-only), `ZoomMarkerPanel` add/remove ✅, `AutoZoomSuggestionsPanel` generate/apply/discard ✅. Closed-project fallback ℹ️.

**E. Inspector board** (activeTool=`inspector`) — 1828

| Section | Controls | Status |
| --- | --- | --- |
| Context summary | header showing selection | ℹ️ |
| Templates | `TemplatePresetGrid` (16:9 / 9:16 / 1:1) | ✅ |
| Canvas | Aspect ratio select | ✅ |
| Screen | Padding / Round corners / Screen shadow / Shadow size | 🔁 same fields as Background board, two surfaces edit one truth |
| Recording | Trim summary, set start/end to playhead, Reset trim | ✅ |
| Recording | Mark cut start, Cut to playhead, Clear cuts, per-range Restore | ✅ |
| Zoom | Start/End frame, Depth sliders | ✅ (muted when no marker) |
| **Cursor** | `<InspectorNotice>Cursor style controls are planned for TASK-044.</InspectorNotice>` | 🚧 **TASK-044 is DONE — copy is stale.** Model has `cursorPresentation` (`packages/project-model/src/types.ts:197`); the UI never got wired. |
| Camera | Show / Position / Shape / Size / Roundness | ✅ (when `hasCamera`) |
| Camera (no webcam) | "No linked webcam track in this project." | ℹ️ |
| **Diagnostics** | `<InspectorNotice>Save failures and degraded media states appear here when available.</InspectorNotice>` | 💀 **Always renders the placeholder string — no signal source ever flows into it.** Real diagnostics live in StateBanner / PostRecordingReview camera-warning / saveError strings elsewhere. |

**F. Right export panel** (`right-inspector`) — 2393

| Control | Line | Status |
| --- | --- | --- |
| `PostRecordingReview` status card | 1974 | ℹ️ |
| Camera warning conditional banner | 1979 | ✅ |
| Export styled / Export raw / Cancel export | 1986–1992 | ✅ |
| Folder / Diagnostics / Project / New | 1993–1996 | ✅ (correct disabled states) |
| `ExportPresetDetails` paragraph | 3012 | ⚠️ Static prose; says "selected aspect ratio" but doesn't show which preset is active and gives no path to change it from this panel — user must hunt the Inspector. |
| Export status area (progress meter / saved / fallback) | 2411 | ✅ |
| Empty workspace right panel: "Export controls appear here once a project is loaded." | 1960 | ℹ️ |

**Summary of action items going into TASK-108:**

1. 🚧 **Inspector → Cursor**: wire the placeholder to real cursor presentation controls (`cursorPresentation` already in model). Or remove the section if cursor controls are intentionally restricted to a different surface.
2. 💀 **Inspector → Diagnostics**: either feed real signals (saveError, camera errors, degraded-media states) into this surface, or remove. Currently it's perpetual placeholder copy.
3. 🔁 **Padding / Radius / Shadow duplication** between Background board and Inspector → Screen: pick one canonical surface. Recommend keeping Background board (since it has Reset affordances and grouped Frame/Shadow headers) and removing the Screen subgroup from Inspector — Inspector should be context-driven (selection-aware), Background board should be the style authoring surface.
4. ⚠️ **`ExportPresetDetails`**: turn the static paragraph into an active chip showing the current aspect ratio + a hint/link to where to change it, or just remove the prose since the Inspector already owns aspect ratio.
5. ℹ️ **Empty-workspace right panel**: copy is fine, but consider replacing with a CTA ("Open project" or "Record") since the user already sees those in the top bar.

Out-of-scope but noted: top-bar `iconButton` toggles for setup/inspector boards have no keyboard shortcut and no visual hover affordance beyond opacity; not a placeholder per se, just thin.

### TASK-108 Wire all visible sidebar controls to real editor behavior

**Priority:** P2
**Status:** DONE

#### Context

After the audit, remaining visible controls need real behavior. Background presets, reset actions, frame/shadow sliders, timeline marker actions, zoom controls, trim/cut controls, export utilities, and top/side icon actions should either mutate project state, focus the correct editor selection, run the expected command, or be removed from the visible UI.

#### Acceptance Criteria

- Every visible sidebar button has a working handler or a deliberate disabled state with accessible explanation.
- Reset actions restore the correct scoped defaults and update preview immediately.
- Background/frame/shadow/presentation controls persist into the project and match export output.
- Timeline and zoom controls focus or modify the matching timeline region instead of acting as disconnected form controls.
- Disabled actions cannot look like primary available actions.
- Undo/redo covers project-state changes made from sidebars.

#### Verification

- Unit or renderer tests for each newly wired state mutation.
- `pnpm smoke:ui` with assertions for sidebar actions and project-state changes.
- Manual preview/export parity check for at least one background, frame, shadow, zoom, and trim change made from the sidebar.

#### Completion Notes (2026-05-15)

Five action items from TASK-107's audit resolved:

1. **Inspector → Cursor wired**: `updateCursorPresentation` added to `ProjectPreview` (mirrors `updateCameraPresentation` pattern). Inspector now renders Style / Click effect / Cursor size / Click sound controls when a project is loaded; falls back to a short "open a project" notice otherwise. Fields flow through to `frame-resolver` (`packages/frame-resolver/src/resolve-frame.ts:155-158`), already honored by the export pipeline.
2. **Inspector → Diagnostics removed**: dead section with placeholder copy deleted (`apps/desktop/src/renderer/src/main.tsx`). Real diagnostics already surface via `StateBanner`, `PostRecordingReview` camera warnings, and per-section `saveError` strings.
3. **Inspector → Screen subsection removed**: Padding/Round corners/Shadow controls were duplicated between Background board and Inspector → Screen. Background board is now the canonical style surface (richer shadow controls + Reset affordances). Inspector → Canvas description updated to point users to Background.
4. **`ExportPresetDetails` shows active aspect ratio**: a chip (`.exportPresetChip`) is rendered next to the styled-export prose; data-bound to current `ProjectAspectRatio`. Smoke asserts `hasExportAspectChip`.
5. **Window-capture disabled state clarified**: kept the disabled card (smoke depends on it) but added a visible inline badge "Coming with portal support" so the unavailable state is user-facing copy, not hover-only.

Stale empty-workspace strings ("will live in this bottom rail", "appear here once a project is loaded") replaced with present-tense action copy.

Spinoff tasks created for deferred features (engine-supported, no UI yet): TASK-117 (crop), TASK-118 (camera layout markers), TASK-119 (visibility segments).

**Verified**:
- `pnpm --filter @rough-cut/desktop typecheck` — clean.
- `pnpm --filter @rough-cut/desktop test` — 269/269 pass.
- `env -u VITE_DEV_SERVER_URL pnpm smoke:ui` — green, with new `hasCursorPresentationControls` and `hasExportAspectChip` assertions wired into the fail chain. Smoke restructured: Inspector tool handles aspect/template/camera; Background tool handles Padding/Radius/Softness drills.

### TASK-109 Redesign sidebar information architecture and section density

**Priority:** P2
**Status:** DONE

#### Context

Current sidebar panels are visually heavy and tall: large cards, repeated headings, paragraph-heavy helper text, and section stacking make the editor feel like a settings form instead of a focused screen-recording editor. The sidebars need a clearer information architecture with compact groups, better visual hierarchy, fewer nested boxes, and options organized by user intent.

#### Acceptance Criteria

- Define the final sidebar map: which controls belong in Background/Presentation, Timeline, Inspector, Recording, Export, and future panels.
- Reduce nested cards and repeated headings; each section should scan quickly at narrow sidebar width.
- Group controls by outcome, not implementation detail: canvas look, screen frame, cursor/clicks, camera, trim/cuts, zooms, export.
- Use icons and compact labels where they improve scanning, but preserve accessible names/tooltips.
- Replace long helper paragraphs with short inline hints, status chips, or contextual empty states.
- Ensure sidebars remain usable at laptop-height viewports without excessive internal scrolling.

#### Verification

- Visual regression or Playwright screenshot comparison for each sidebar tab.
- Manual pass at common desktop sizes, including a small laptop viewport.
- Accessibility check for tab order, labels, and focus states on icon-only or compact controls.

#### Completion Notes (2026-05-16)

The IA redesign shipped iteratively across several commits in response to live user feedback rather than as a single redesign push:

- **Sidebar map finalized**: Inspector tab eliminated. Tool rail is now Background / Timeline / Cursor / Camera. Background owns canvas-shape decisions (Templates, Aspect ratio, Frame, Shadow, Background presets). Timeline owns playhead + zoom markers + auto-zoom suggestions + per-marker editor + cut workflow. Cursor and Camera are dedicated tabs for their respective presentation controls.
- **Nested cards removed**: Cursor tab in particular went from two nested cards ("Cursor style" + "Clicks") to a single flat group with a divider. Padding/Radius/Shadow duplication between Background and Inspector was removed when Inspector itself was deleted.
- **Helper-paragraph chrome cut**: the verbose "Trims and cuts only hide source ranges. Restore buttons bring them back; exports use the visible timeline." notice was distilled into the section description. The InspectorContextSummary meta-chrome was deleted entirely.
- **Visual identity upgrade**: replaced hand-written inline SVG paths with `@phosphor-icons/react` using the duotone weight. Distinctive without being saturated.
- **Segmented visual pickers**: cursor Style and Click effect now use segmented swatch pickers that preview the rendered look (spotlight halo, subtle alpha, ripple fill, etc.) instead of plain dropdowns.
- **Consistent EmptyState**: new shared component (icon + title + description + optional CTA) used across Camera/Cursor/Timeline empty branches. Replaces ad-hoc thin gray paragraphs.
- **Stale copy replaced**: "will live in this bottom rail", "appear here once a project is loaded", "planned for TASK-044", etc. all gone.

Commits: `0e3a3f9` (audit), `1c177e5` (plan), `ebd1d43` (TASK-108 wire), `41bcf25` (cursor renderer fix + own tab), `b006a74` (split into focused tabs), `b0e04fa` (Phosphor icons), `c905c47` (cursor-follow spring seed fix), `009d99d` (Inspector teardown + EmptyState).

**Verified**:
- `pnpm --filter @rough-cut/desktop typecheck` clean
- `pnpm --filter @rough-cut/desktop test` — 282/282 pass
- `env -u VITE_DEV_SERVER_URL pnpm smoke:ui` green with new assertions: `hasCursorPresentationControls`, `hasCursorTab`, `hasCameraTab`, `hasExportAspectChip`, `hasTimelineScrubberFineStep`, `hasTimelineArrowKeyAdvance`.

Out of scope, deferred: full Playwright per-tab screenshot diffs (would need a baseline harness — TASK-111 is the natural home).

### TASK-110 Replace recording preview card with compact horizontal controls

**Priority:** P2
**Status:** PLANNED

#### Context

The recording preview panel should not be a large square/card competing with the main preview. It should be minimal, mostly icon-led, horizontal, and action-oriented: record state, source/camera/audio status, quick toggles, and next action. This keeps the central stage as the product surface and avoids duplicating editor panels inside the preview area.

#### Acceptance Criteria

- Replace the square/card-like recording preview panel with a compact horizontal control strip.
- Use mostly icons with accessible labels/tooltips for source, mic, system audio, camera, status, and record/retry actions.
- Show only essential recording/review state; move detailed setup or diagnostics into the appropriate sidebar/panel.
- Preserve clear next actions: record, stop, retake/new, open project, export, or diagnostics when needed.
- The strip should not cause the central preview, timeline, or sidebars to jump when state changes.
- Empty/no-project state remains understandable without becoming a large placeholder card.

#### Verification

- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:ui`
- Manual packaged-app check: fresh launch, pre-record setup, active recording, stopped review, reopened project.

### TASK-111 Add sidebar interaction and visual regression coverage

**Priority:** P2
**Status:** PLANNED

#### Context

Sidebar polish will regress unless it is covered. The app already has preview/export and timeline interaction coverage; sidebar interactions need the same standard because tool switching, dense panels, and compact controls can easily break layout or become inert again.

#### Acceptance Criteria

- Add UI smoke coverage that switches every sidebar tab and verifies the central stage remains mounted and stable.
- Assert representative controls in each sidebar mutate project/editor state or expose a real disabled reason.
- Add visual regression snapshots for Background/Presentation, Timeline, Inspector, Export, and compact recording preview states.
- Include a no-placeholder assertion for known dead labels/buttons from the audit.
- Capture at least one small viewport case to catch vertical overflow and excessive scrolling.

#### Verification

- `pnpm smoke:ui`
- `pnpm visual:scrub` or the project’s current visual regression command for editor/sidebar states.
- Manual packaged-app sidebar click-through after redesign tasks land.

### TASK-112 Add export benchmark harness and performance budget

**Priority:** P1
**Status:** PLANNED

#### Context

Export speed is now part of perceived parity with Screen Studio/Focusee/Recordly. Before optimizing, Rough Cut needs repeatable timing numbers for representative projects so changes can be judged against a budget instead of subjective waiting.

#### Acceptance Criteria

- Add a benchmark command that exports representative fixture projects and reports wall-clock time, source duration, output duration, export mode, resolution, fps, feature mix, and speed multiplier.
- Cover at least these cases: raw copy, raw trim, styled no-zoom/no-camera, styled with cursor/clicks, styled with zooms, styled with camera PiP, styled with background image.
- Store the benchmark result as JSON so CI/local runs can compare future changes.
- Define initial performance budgets for short 1080p demo exports and longer 10-minute exports.
- Do not change ffmpeg quality settings yet; this task measures before optimizing.

#### Verification

- `pnpm benchmark:export` or equivalent command runs locally and prints a concise summary.
- Unit or smoke coverage validates the benchmark harness fails on missing fixture output or invalid media.
- Manual run on one real recording captures baseline numbers in task completion notes.

### TASK-113 Profile styled export filter graph bottlenecks

**Priority:** P1
**Status:** PLANNED

#### Context

Styled export uses a complex ffmpeg graph for background, cursor subtitles, zoom crop/sendcmd, rounded screen, shadow, camera PiP, and cuts. We need to know which graph stages dominate export time before adding fast paths.

#### Acceptance Criteria

- Add profiling runs or temporary benchmark variants that isolate cursor subtitles, zoom crop/sendcmd, background image, rounded alpha, shadow blur, and camera overlay.
- Record whether bottlenecks come from filter complexity, encoder preset/CRF, input decode, subtitles/libass, image background, or camera overlay.
- Identify safe fast-path candidates that preserve preview/export parity.
- Document at least one optimization to avoid because it breaks visual quality or parity.

#### Verification

- Profiling notes include before/after timing for each isolated graph variant.
- `pnpm smoke:styled-export` still passes after any profiling-only instrumentation is removed or gated.

### TASK-114 Add fast-path exports for no-zoom/no-camera cases

**Priority:** P1
**Status:** PLANNED

#### Context

Many user exports are simple: screen recording, styled canvas, cursor/clicks, no camera, no manual zoom. These should not pay for camera/zoom graph complexity. Add fast paths only where output remains visually identical to the preview.

#### Acceptance Criteria

- Detect simple styled-export shapes: no camera, no zoom, no cuts, no background image where applicable.
- Build slimmer ffmpeg args for those cases, avoiding unused inputs and filters.
- Preserve cursor/click rendering and screen styling when enabled.
- Fall back to the full graph for camera, zoom, cuts, custom screen frame, or unsupported combinations.
- Benchmark shows meaningful improvement on the no-zoom/no-camera fixture without regressing full styled exports.

#### Verification

- Unit tests for fast-path eligibility and generated ffmpeg args.
- `pnpm smoke:styled-export`
- `pnpm benchmark:export` shows the simple styled case improved versus baseline.
- Visual regression confirms fast-path output matches the full-graph output within accepted tolerance.

### TASK-115 Optimize cursor and zoom layer generation overhead

**Priority:** P2
**Status:** PLANNED

#### Context

Long recordings can spend noticeable time generating cursor ASS files and zoom sendcmd files before ffmpeg even starts. This lane should reduce pre-render overhead without lowering cursor fidelity or zoom smoothness.

#### Acceptance Criteria

- Measure cursor ASS and zoom sendcmd generation time separately in export progress/benchmark output.
- Skip generating cursor or zoom temp layers when the project has no relevant data.
- Cache or stream large temp layer generation where safe.
- Avoid unnecessary downsampling for recordings under the cursor-event cap.
- Keep temp-file cleanup reliable on success, failure, and cancel.

#### Verification

- Unit tests for no-data skips and cleanup paths.
- Benchmark shows pre-ffmpeg setup time for cursor-heavy fixtures.
- `pnpm --filter @rough-cut/desktop test`

### TASK-116 Add export speed preset controls with quality guardrails

**Priority:** P2
**Status:** PLANNED

#### Context

Users may accept faster drafts while still needing high-quality finals. Add speed/quality presets only after benchmarked fast paths exist, and make the defaults safe for polished client demos.

#### Acceptance Criteria

- Add export preset choices such as Draft, Balanced, and High Quality with clear copy.
- Default remains quality-safe and does not surprise users with degraded output.
- Presets map to explicit ffmpeg settings, not vague UI labels.
- Warn or prevent combinations that would break transparency, antialiasing, cursor clarity, or preview/export parity.
- Persist the chosen export speed preset in project or session settings if appropriate.

#### Verification

- Unit tests for preset-to-ffmpeg-setting mapping.
- UI smoke confirms preset control appears and selected value reaches export args.
- Benchmark reports speed/quality preset in output JSON.
- Manual visual review compares Draft/Balanced/High Quality on one real recording.

### TASK-117 Add screen and camera crop region UI

**Priority:** P3
**Status:** PLANNED

#### Context

`RecordingPresentation.screenCrop` and `RecordingPresentation.cameraCrop` already exist in the project model (`packages/project-model/src/types.ts:205-206`) as `RegionCrop` records and are honored end-to-end by the export pipeline (`packages/frame-resolver/src/resolve-frame.ts:295-306`). No UI surfaces them yet — users cannot crop into a region of the source recording or the camera feed. Spun off from TASK-108's audit (TASK-107 findings).

#### Acceptance Criteria

- New Inspector section or Background subsection exposes crop region editing for screen and camera separately.
- Support the enumerated `CropAspectRatio` values (`free | 16:9 | 9:16 | 1:1 | 4:3`) via a select.
- Visual handles on the preview canvas (re-use the camera/screen frame drag pattern at `apps/desktop/src/renderer/src/main.tsx` ~line 3056) for in-place region adjustment.
- Persist into project; preview and styled export render the cropped region identically.

#### Verification

- Unit/renderer test covering `RegionCrop` mutation round-trip.
- Smoke screenshot diffs with crop enabled.
- Manual: enable a 9:16 screen crop on a 16:9 source, verify both preview and export use the cropped framing.

### TASK-118 Add camera layout markers UI

**Priority:** P3
**Status:** PLANNED

#### Context

`RecordingPresentation.cameraLayouts` (`packages/project-model/src/types.ts:199`) lets the camera PiP position/shape/size change at specific source frames. The frame-resolver honors active markers (`packages/frame-resolver/src/resolve-frame.ts:275`) but no UI lets a user place or edit them. Spun off from TASK-108's audit.

#### Acceptance Criteria

- A new timeline lane shows camera-layout marker dots at their source frames.
- Inspector section (when a marker is selected) edits the per-marker camera presentation (position/shape/size).
- Add/remove flow mirrors the existing `ZoomMarkerPanel` pattern.

#### Verification

- Unit test for marker placement and removal.
- Renderer test: changing a marker mutates `cameraLayouts` and the preview reflects the new layout at that frame.
- Manual: place two markers with different camera positions, scrub the playhead across them, confirm the preview animates the layout.

### TASK-119 Add recording visibility segments UI

**Priority:** P3
**Status:** PLANNED

#### Context

`RecordingPresentation.visibilitySegments` (`packages/project-model/src/types.ts:200`) lets the recording show or hide screen/camera/clicks per source frame range. The frame-resolver consumes them (`packages/frame-resolver/src/resolve-frame.ts:271`) but there is no editor UI. Spun off from TASK-108's audit.

#### Acceptance Criteria

- Timeline overlay shows visibility segments stacked under the screen/camera/clicks lanes.
- Inspector section toggles per-segment visibility flags (screenVisible / cameraVisible / clicksVisible).
- Add/remove flow with start/end frame inputs and a list view, mirroring the existing cut-range list (`apps/desktop/src/renderer/src/main.tsx` recording section).

#### Verification

- Unit test for segment add/remove and frame-range clamping.
- Renderer test: toggling `cameraVisible` for a segment hides the camera PiP in preview during that range.
- Manual: hide the camera for the first 5 seconds, verify export reflects the hidden range.

### TASK-152 Launchpad: scaffold capability registry + base shell

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-120

#### Context

Smallest first slice of the launchpad rebuild. No interactivity, no IPC — just the directory structure, the `Capability` descriptor type, the static registry array, and a base shell that lists capability labels. Every subsequent launchpad task layers on top of this.

#### Acceptance Criteria

- New directory: `apps/desktop/src/renderer/src/launchpad/`.
- New file `capabilities.ts` exports `Capability` type (id, label, icon, category: 'transform' | 'generate' | 'assemble' | 'meta', phaseAvailable: number, ipc?: string) and `CAPABILITIES` array with all 8 entries (transcribe, cut-filler, suggest-edits, generate-tts, generate-image, generate-motion-graphic, auto-assemble, suggest-title).
- New `launchpad-shell.tsx` renders an unstyled `<section>` with a `<ul>` of capability labels. No cards yet.
- Not yet mounted in `main.tsx`. ai-shell stays intact.

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck` clean.
- Existing tests still pass (no behavior change).

### TASK-153 Launchpad: capability grid with sections (Transform/Generate/Assemble/Meta)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-120

#### Context

Render the capability list as a styled grid of cards, grouped by category. Cards are visual-only — clicks do nothing yet. Defines `LaunchpadCard` as a reusable component.

#### Acceptance Criteria

- New `launchpad-card.tsx` component: icon + label + optional subtitle + disabled state.
- `launchpad-shell.tsx` groups CAPABILITIES by `category` and renders sectioned grids with `<h3>` headers.
- Card styling follows project's dark editorial language (see `PRODUCT.md` brand: "DaVinci Resolve's confidence at Linear's restraint"). Match LibraryShell's restraint level.
- Disabled cards (phaseAvailable > 0 and current phase < that) render with reduced opacity + a small "Phase N" pill.

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm smoke:ui` (after TASK-157 mounts it) — for now, render in isolation via a temporary route or just verify it compiles.

### TASK-154 Launchpad: dynamic hero card (recommends next-relevant capability)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-120

#### Context

Above the grid, a single large hero card recommends the most contextually-relevant action. Logic: if project has no transcript → "Transcribe this recording". If transcript but no captions → "Add captions". If captions exist but no cuts → "Cut filler & silence". Else: "Suggest edits". Updates on project change.

#### Acceptance Criteria

- New `hero-recommendation.ts` pure function: `recommendCapability(project: ProjectLike) → CapabilityId`.
- Decision tree:
  1. No project → "open a project" CTA card (not a capability).
  2. Project has no transcript → 'transcribe'.
  3. Has transcript but no captionTracks → 'caption' (mapped to phase-gated capability).
  4. Has captions but no cuts and transcript has filler words → 'cut-filler'.
  5. Otherwise → 'suggest-edits'.
- `launchpad-shell.tsx` renders the hero card at the top with the recommended capability's icon + label + descriptive copy.
- Hero card is clickable (handler stubbed until TASK-156).

#### Verification

- Unit tests for `recommendCapability` covering each branch.
- Renderer test: snapshot hero card for each project state.

### TASK-155 Launchpad: search input + recents persistence (localStorage)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-120

#### Context

Search box filters the capability grid by label. Recently-used capabilities (last 5) surface in a "Recent" section above the categorized grid.

#### Acceptance Criteria

- Search input above the grid. Filters cards by `label.toLowerCase().includes(query)`.
- New `useRecents.ts` hook with `recents: CapabilityId[]` + `recordUse(id)` that persists to `localStorage` under `rough-cut.launchpad.recents` (max 5, MRU order).
- "Recent" section shown only when recents non-empty AND no search query active.
- Search query persists in React state only (resets on tab switch).

#### Verification

- Unit tests for the recents reducer (add new, push existing to front, cap at 5).
- Renderer test: type "trans" → grid narrows to Transcribe.

### TASK-156 Launchpad: wire Suggest edits + Suggest title cards to AI v1 IPC

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-120

#### Context

Two cards become functional. They reuse today's `AI_ANALYZE_PROJECT` IPC and the validator/apply logic from the v1 shell. Other cards stay disabled with "Phase N" pills.

#### Acceptance Criteria

- Clicking "Suggest edits" opens a sub-view (modal or slide-over) showing today's analysis flow — same UX as `ai-shell.tsx` but inside the launchpad's chrome.
- Clicking "Suggest title" runs the same IPC but renders only the title suggestion card (filters `kind === 'title'`).
- Reuses `validateSuggestion` from `@rough-cut/project-model` and the existing apply mutators (`addManualMarkerAtFrame`, `addCutRange`, doc.name update).
- `recordUse(capabilityId)` fires when a card is opened (feeds TASK-155 recents).
- "Applied" suggestions return to the launchpad with a success toast.

#### Verification

- Renderer test: synthetic IPC response → suggestions render → apply succeeds.
- Manual: click "Suggest edits" → behavior matches today's v1 flow.

### TASK-157 Launchpad: mount in main.tsx, retire ai-shell.tsx

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-120

#### Context

Final step: swap the `ai` view's render to use `launchpad-shell.tsx` instead of `ai-shell.tsx`. Delete the old shell (keep `ai-suggestions.ts` validator in project-model; that's reused).

#### Acceptance Criteria

- `main.tsx` `activeAppView === 'ai'` branch renders `<LaunchpadShell project={project} onProjectChange={applyProjectChange} ... />`.
- `apps/desktop/src/renderer/src/ai/ai-shell.tsx` deleted (or moved to `_archive/` if you want a backup).
- Visual smoke (`pnpm smoke:ui`) screenshot shows the launchpad instead of the v1 view.
- `pnpm smoke:recording-flow-ui` still green (no regression in the editor flow).

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` all pass.
- `pnpm smoke:ui` — visual diff against pre-launchpad smoke; expected change is in the AI tab area only.
- Manual: AI tab → launchpad renders → Suggest edits + Suggest title work → other cards visibly disabled.

### TASK-158 Settings: gear icon + sliding modal chrome + Esc/backdrop close

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-121

#### Context

Top-right gear icon in the topBar. Click → sliding right-side modal panel (no settings content yet, just chrome and section scaffolding).

#### Acceptance Criteria

- New `apps/desktop/src/renderer/src/settings/settings-modal.tsx`.
- New gear button in the topBar next to existing Record + Open project buttons (use `PhosphorGearSix` from existing icon map).
- Modal slides in from the right (CSS transform transition, ~200ms).
- Section headers stubbed: `AI Providers`, `Cost & Quotas`, `Language`, `Advanced`. All section bodies empty.
- Esc key closes the modal.
- Clicking the backdrop closes the modal.
- Reduced-motion preference honored (instant snap, no slide).

#### Verification

- Renderer test: open → close via Esc → open → close via backdrop click.
- `pnpm smoke:ui` confirms gear icon visible in topBar.

### TASK-159 Settings: atomic settings.json persistence layer + IPC

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-121

#### Context

Backend persistence for settings. Atomic write (tmp file + rename) so a crash mid-save can't corrupt the file. IPC channels expose read/update/subscribe.

#### Acceptance Criteria

- New `apps/desktop/src/main/settings-store.mjs` with `loadSettings()`, `updateSettings(patch)`, `subscribe(listener)`.
- Backing file: `userData/settings.json`.
- Atomic write via `fs.rename` from `.tmp` sibling.
- Schema validated via Zod (extend `packages/project-model` with `Settings` schema, or keep main-process-local).
- IPC: `SETTINGS_GET`, `SETTINGS_UPDATE`, `SETTINGS_CHANGED` (emit on update for renderer subscriptions).
- Preload exposes `getSettings`, `updateSettings`, `onSettingsChange`.

#### Verification

- Unit tests for atomic round-trip and concurrent-update safety (last-write-wins).
- Manual: update a settings field → kill app → reopen → setting persists.

### TASK-160 Settings: AI Providers section (stub rows for 5 providers)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-121

#### Context

Visible UI section listing the 5 providers with status badges. All badges show "Not configured" until TASK-122 (CLI detect) and TASK-123 (API key store) populate them. This task just builds the static UI shape.

#### Acceptance Criteria

- Section: "AI Providers".
- Five rows, each with: provider icon, name, status badge ("Not configured" gray), "Configure" button (disabled — wired in TASK-122/123).
- Providers: Claude CLI, Codex CLI, Anthropic API key, OpenAI API key, ElevenLabs API key.
- Hover on a row shows a tooltip: what the provider is used for ("Reasoning + image gen + TTS via your ChatGPT Plus subscription").

#### Verification

- Renderer test: 5 rows render with correct labels.
- Manual: open Settings → see 5 rows → tooltips on hover.

### TASK-161 Settings: Cost & Quotas + Language + Advanced sections (placeholders)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-A
**Supersedes part of:** TASK-121

#### Context

Round out the Settings UI shape so future tasks have a home for their controls. All content is placeholder; real controls land when their parent capability ships (TASK-125 wires cost meter to Cost & Quotas; TASK-128 wires language hint to Language; etc.).

#### Acceptance Criteria

- Section "Cost & Quotas": stub monthly-cap input ($25 default, disabled), stub current-usage line ("$0.00 / $25.00").
- Section "Language": stub dropdown ("Auto-detect" default, with "English" and "Hebrew" as visible options, others greyed-out).
- Section "Advanced": empty placeholder with copy "Future: filler word list, transcript model picker, etc."
- All controls disabled in v1; they wire up in their owning task.

#### Verification

- Renderer test: 3 sections render with stubbed content.
- Manual: open Settings → all 4 sections visible (AI Providers from TASK-160 + the 3 here) → no controls active.

### TASK-122 CLI detection: Claude CLI + Codex CLI subprocess pattern

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-B
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Detect whether `claude` and `codex` are installed and authenticated. Establishes the subprocess pattern that every CLI-auth provider uses. Runs at app launch and on settings open.

#### Acceptance Criteria

- New `apps/desktop/src/main/ai-providers/auth/detect-cli.mjs` with `detectClaudeCli()` + `detectCodexCli()`.
- Each returns `{ installed: boolean, version: string | null, authenticated: boolean | 'unknown' }`.
- Detection via `spawn` with short timeout (3s). No PATH lookups.
- IPC channel `AI_PROVIDER_STATUS` returns combined status for the settings UI.
- Status surfaced in TASK-121's `AI Providers` section.

#### Verification

- Unit tests with mocked `child_process` covering: not installed, installed but unauthed, installed + authed, timeout.
- Manual: open Settings → see "Claude CLI: ✓ authenticated" (or appropriate status).

### TASK-123 API keys store (encrypted-at-rest in userData)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-B
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

API key fallback path for Anthropic / OpenAI / ElevenLabs / Replicate. Keys stored at-rest with at least file-mode 0600; encryption via Electron `safeStorage` when available (falls back to plaintext + warning if `safeStorage.isEncryptionAvailable()` is false).

#### Acceptance Criteria

- New `apps/desktop/src/main/ai-providers/auth/api-keys-store.mjs`.
- Reads/writes `userData/api-keys.json` (encrypted blob via `safeStorage` when available).
- IPC `AI_KEYS_GET_STATUS` returns `{provider, configured, source: 'env' | 'userData' | null}` per provider.
- IPC `AI_KEYS_SET` accepts `{provider, apiKey}` and persists. Never echoes the key back.
- Settings UI password fields use these IPCs.
- Migrates today's `ai-config.json` (single Anthropic key) into the new multi-provider store.

#### Verification

- Unit tests for encrypt/decrypt round-trip + plaintext-fallback warning.
- Manual: paste a fake key in Settings → restart app → confirm "configured" status persists.

### TASK-124 Provider registry + reasoning capability router

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-B
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Central capability router that picks the best available provider per capability. First capability: reasoning. Future tasks add transcription, image-gen, tts, video-gen, motion-graphics.

#### Acceptance Criteria

- New `apps/desktop/src/main/ai-providers/provider-registry.mjs` with declarative capability × provider matrix.
- `apps/desktop/src/main/ai-providers/capabilities/reasoning.mjs` with priority: Claude CLI → Codex CLI → Anthropic API → OpenAI API.
- Existing `ai-service.mjs` refactored to use the router. Behavior preserved for v1 `Suggest edits` / `Suggest title`.
- IPC `AI_ANALYZE_PROJECT` keeps its contract; internally routes via the registry.
- Settings UI shows the active provider for the reasoning capability ("Currently using: Claude CLI").

#### Verification

- Unit tests covering each routing fallback path.
- Existing v1 IPC tests still pass.
- Manual: with Claude CLI authed, confirm reasoning routes through it (capture subprocess invocation in logs).

### TASK-125 Cost meter + background job system + top-bar progress chip

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-B
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Tracks per-call cost and quota usage; surfaces long-running AI work in a top-bar progress chip with cancel support.

#### Acceptance Criteria

- New `apps/desktop/src/main/cost-meter.mjs` tracking calls per provider, $ where known, quota where known (Codex usage).
- Background job system: every long-running AI capability registers a job with `{id, kind, status, progress, cancel}`.
- Top-bar progress chip appears when any job is active; clicking opens a panel listing jobs with cancel buttons.
- Pre-call cost estimates surfaced as toasts before high-cost actions ("This will use ~3000 tokens, ~$0.02").
- Hard cap from Settings: pauses cloud calls when reached; CLI-auth + local always exempt.
- Monthly tracker visible in Settings → Cost & Quotas section.

#### Verification

- Unit tests for cost accumulation, cap enforcement, job cancel.
- Renderer test: progress chip appears + disappears with synthetic job.
- Manual: trigger v1 `Suggest edits` → confirm job appears in chip → confirm cost recorded.

### ~~TASK-162~~ Add transcript / captionTracks / tracks types to project-model

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — commit `192fb90`
**Lane:** P-AI-C
**Supersedes part of:** TASK-126

#### Context

First atomic step of the v12 → v13 migration: add the new type definitions only. No schemas, no migration runner — just the TypeScript types. Reuses existing `motionCompositions` field (added in v3→v4) for Remotion content rather than introducing a duplicate `motionGraphics` field.

#### Completion Notes

- `transcript.ts`: exports `Transcript`, `TranscriptParagraph`, `TranscriptNonSpeechSegment`, re-exports `TranscriptWord` from types.ts.
- `caption-track.ts`: exports `CaptionTrack`, `CaptionStyleKind` (renamed from `CaptionStyle` to avoid colliding with existing `CaptionStyle` interface in types.ts that describes per-segment rendering style), `CaptionPhrase`.
- `track.ts`: exports `NleTrack`, `NleTrackKind`, `NleTrackClip` (Nle-prefixed to avoid colliding with existing composition-level `Track`). Long-term it will subsume the composition-level Track; v13 keeps both side-by-side under optional `ProjectDocument.tracks?`.
- `ProjectDocument` in `types.ts` extended with `transcript?: Transcript` + `captionTracks?: readonly CaptionTrack[]` (line 446-447). `tracks?` deferred (existing `Composition.tracks` covers v13 needs; new NLE track shape lands in TASK-140).
- Re-exported from `packages/project-model/src/index.ts`.

#### Acceptance Criteria

- New `packages/project-model/src/transcript.ts` exports `Transcript`, `TranscriptWord` (text, startFrame, endFrame, confidence), `TranscriptParagraph`, `TranscriptNonSpeechSegment` (kind: 'silence' | 'music' | 'noise', startFrame, endFrame). ✅
- New `packages/project-model/src/caption-track.ts` exports `CaptionTrack`, `CaptionStyleKind` (`'subtitle' | 'submagic' | 'karaoke'`), `CaptionPhrase` (text, startFrame, endFrame, emphasisWordIndex?, paletteColorIndex?). ✅
- New `packages/project-model/src/track.ts` exports `NleTrack` (id, kind: 'video' | 'audio' | 'captions' | 'motion-graphics', label, locked, muted, clips), `NleTrackClip` (assetId, timelineIn, timelineOut, sourceIn, sourceOut). ✅
- Extend `ProjectDocument` in `types.ts` with optional `transcript?` and `captionTracks?` fields. ✅
- Re-export from `packages/project-model/src/index.ts`. ✅
- No schemas, no migration code yet. Pure type-level change. ✅

#### Verification

- `pnpm --filter @rough-cut/project-model build` — ✅ clean (tsc).
- `pnpm --filter @rough-cut/project-model test` — ✅ 133/133 pass (up from 132 — count increase is incidental).

### ~~TASK-163~~ Extend Zod schemas for transcript / captionTracks / tracks

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — commit `8e6f87d`. Schemas added with the same renames as TASK-162 (`CaptionStyleKind`, `NleTrack*`). 10 new schema tests added. 143/143 tests pass.
**Lane:** P-AI-C
**Supersedes part of:** TASK-126

#### Context

Mirror TASK-162's TypeScript types in Zod schemas so `validateProject()` accepts the new fields. All new fields marked `.optional()` since existing v12 documents won't have them.

#### Acceptance Criteria

- Add `TranscriptSchema`, `TranscriptWordSchema`, `TranscriptParagraphSchema`, `TranscriptNonSpeechSegmentSchema` to `schemas.ts`.
- Add `CaptionTrackSchema`, `CaptionStyleSchema`, `CaptionPhraseSchema`.
- Add `TrackSchema`, `TrackClipSchema`, `TrackKindSchema`.
- Extend `ProjectDocumentSchema` with three new `.optional()` fields wired to the schemas above.
- Existing schema validation behavior unchanged for v12 documents (they pass since the new fields are optional).

#### Verification

- `pnpm --filter @rough-cut/project-model test` — existing `schemas.test.ts` (23 tests) still passes.
- New tests in `schemas.test.ts` (or sibling file): valid `Transcript` parses, malformed `Transcript` rejected, projects without transcript still valid.

### ~~TASK-164~~ Migration v12 → v13 (additive defaults for new fields)

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — commit `a9cb125`. `CURRENT_SCHEMA_VERSION` bumped 12→13. Migration is additive + idempotent (re-running on v13 is a no-op). The three v13 fields are all optional, so no field-level transform is needed — just a version stamp.
**Lane:** P-AI-C
**Supersedes part of:** TASK-126

#### Context

Bump `CURRENT_SCHEMA_VERSION` from 12 → 13. Add the migration registry entry that adds default empty values for the three new fields when an existing v12 document is opened.

#### Acceptance Criteria

- `packages/project-model/src/constants.ts`: bump `CURRENT_SCHEMA_VERSION` to 13.
- `migrations.ts`: append a `{fromVersion: 12, toVersion: 13}` entry following the existing additive pattern. Sets `transcript`, `captionTracks`, `tracks` to undefined or omits them entirely (since they're optional). The `version: 13` field is the only mandatory addition.
- Migration is idempotent: re-running on a v13 document is a no-op.
- Documented in migration entry comment: "Added by P-AI-C/TASK-164 for the AI architecture rewrite."

#### Verification

- `pnpm --filter @rough-cut/project-model test` — existing 132 tests still pass.
- Open an existing real `.roughcut` from the user's recordings dir → confirm it loads, gets bumped to v13, autosaves with new version.

### TASK-165 Migration tests + round-trip + idempotent re-migration

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — commit `4e465c7`. Added 4 migration tests (v12→v13 stamping, v13 no-op, preserves pre-populated v13 fields, v1→v13 chain). 147/147 project-model tests pass.
**Lane:** P-AI-C
**Supersedes part of:** TASK-126

#### Context

Tests for the migration: v12 → v13 applies defaults, already-v13 is a no-op, full round-trip (v1 → v13) still works for ancient projects.

#### Acceptance Criteria

- Extend `migrations.test.ts` with cases:
  - v12 document → v13 (version bumped, no other changes).
  - v13 document → v13 (no-op).
  - v1 ancient document → v13 (all 12 migrations chained correctly).
  - Corrupt input (missing `version`) handled gracefully.
- Test fixture for a v12 document with realistic shape.

#### Verification

- `pnpm --filter @rough-cut/project-model test` — 132+ tests pass plus the new migration tests.

### TASK-166 LibraryShell topbar: Import / Blank / Template buttons

**Priority:** P2
**Status:** ✅ DONE (2026-05-18) — commit `eae52ce`. Three stub buttons added beside "Open file…" reusing `.libraryOpenFile` styling, each with a `data-testid` for future Library-view smoke. Smoke-ui passed with no regression; visual confirmation is via dev server because the existing smoke does not exercise the Library view.
**Lane:** P-AI-C
**Supersedes part of:** TASK-127

#### Context

Add three new project-creation entry points alongside the existing "Open file…" button at `apps/desktop/src/renderer/src/library/library-shell.tsx:362`. Buttons render but don't do anything yet — handlers wired in TASK-167–170.

#### Acceptance Criteria

- LibraryShell topbar gets three new buttons: `Import file`, `Blank project`, `From template`.
- Visual styling matches the existing "Open file…" button (restrained, no emphasis).
- Each button click is wired to a stub handler (`console.info('[library] not yet implemented')`).
- No regression to the existing "Open file…" or "Record" flows.

#### Verification

- `pnpm smoke:ui` — confirm new buttons render in the Library view (visible in the smoke screenshot).
- Manual: click each → console log fires, no crashes.

### TASK-167 Import handler: file picker + whitelist + reject toast

**Priority:** P2
**Status:** ✅ DONE (2026-05-18) — commit `174765f`. New shared helper `apps/desktop/src/shared/import-mime.mjs` (isImportableMimeType + mimeForExtension + ALLOWED_IMPORT_EXTENSIONS + IMPORT_REJECTION_MESSAGE). IPC LIBRARY_PICK_IMPORT_FILE wired through preload (`window.roughCut.pickImportFile`). Renderer surfaces an in-shell rejection banner (no global toast system was added — kept the change minimal). 9 helper unit tests pass.
**Lane:** P-AI-C
**Supersedes part of:** TASK-127

#### Context

Wire the `Import file` button to an OS file picker. Filter accepted formats: mp4, mov, mp3, wav, png, jpg. Reject others with a toast explaining why.

#### Acceptance Criteria

- New IPC `LIBRARY_PICK_IMPORT_FILE` → returns `{filePath, mimeType}` or `null` if cancelled.
- Main-process handler shows a system dialog filtered to the 6 accepted extensions.
- Renderer-side: rejected file types (anything outside the whitelist) show a toast: "Only mp4 / mov / mp3 / wav / png / jpg are supported. Convert your file first."
- Helper `isImportableMimeType(mime: string): boolean` for the filter logic; tested unit-level.

#### Verification

- Unit tests for `isImportableMimeType` covering each accepted type + rejection cases.
- Manual: click `Import file` → pick a .mov → see file path logged; pick a .mkv → see rejection toast.

### TASK-168 Import creates a new .roughcut referencing the imported file

**Priority:** P2
**Status:** ✅ DONE (2026-05-18) — commits `5780ac6` (factory + probe + IPC) and `e7b9448` (post-test fps lockstep fix). `probeImportedMedia` ffprobe wrapper specialised per kind; `createProjectForImport` pure factory; `pickImportProjectPath` writes next to source with " (2)" collision suffix; `saveProjectForImport` glues them. The fps lockstep fix pinned `asset.metadata.fps` to the project's `settings.frameRate` (24/30/60) to eliminate the ~1Hz stutter we saw on imports of variable-fps mp4s; raw probe fps preserved as `metadata.sourceFps`. Audio passthrough is tracked separately as TASK-177.
**Lane:** P-AI-C
**Supersedes part of:** TASK-127

#### Context

After TASK-167 picks a valid file, create a new `.roughcut` project that references the imported file as a recording asset. Reuses `saveProjectForRecording` or a new helper if the shape doesn't fit cleanly.

#### Acceptance Criteria

- New IPC `LIBRARY_CREATE_FROM_IMPORT` accepts `{importedFilePath, importedMimeType}`.
- Probes the file with ffprobe to get duration / dimensions / fps (video) or duration only (audio/image).
- Creates a new `.roughcut` adjacent to the imported file (or in the user's default recordings dir), with a recording asset pointing to the absolute imported path.
- Imported file is NOT copied or moved — referenced in place.
- Returns the new project state so the renderer can open it in Recording edit.

#### Verification

- Unit test: probe a fixture .mp4 → assert the resulting `.roughcut` has correct duration/dimensions.
- Manual: import a real .mov → confirm new `.roughcut` appears in the gallery; open it in Recording edit; preview plays.

### TASK-169 Blank-project handler + Recording edit safe-empty-state

**Priority:** P2
**Status:** ✅ DONE (2026-05-18) — commit `85df156`. `createBlankProject` returns a validated v13 doc with empty assets/tracks; `saveBlankProject` writes `Untitled.roughcut` (`(2)`, `(3)`, … on collision) inside the recordings dir. IPC LIBRARY_CREATE_BLANK_PROJECT + preload bridge. ProjectPreview renders a `projectPreviewEmpty` card with a "Record a take" CTA wired to onRetake. **Deviation:** spec asks for the project to open in an NLE Editor view; that view does not exist yet (per CLAUDE.md the editor window has exactly two views), so Recording edit is the landing until the NLE lane lands. 4 new unit tests pass.
**Lane:** P-AI-C
**Supersedes part of:** TASK-127

#### Context

`Blank project` creates a `.roughcut` with no recording asset. Existing Recording edit assumes a primary recording exists at several access sites (`getPrimaryRecordingAsset(project.document)` in `main.tsx:2645, 2702, 3984`). Currently null-safe at the access points (optional chaining), but `ProjectPreview` has no dedicated empty-state for projects with no recording.

#### Acceptance Criteria

- New IPC `LIBRARY_CREATE_BLANK_PROJECT` creates a `.roughcut` with an empty `assets` array and a stub composition `{duration: 0, tracks: []}`.
- New project opens in **NLE Editor view** (not Recording edit) since Recording edit's mental model is single-recording.
- Recording edit, if opened on a blank project (e.g., via tab switch), shows an empty-state card: "This project has no recording yet. Open it in the NLE Editor or record a new take." (CTA: switch view).
- No NPE / crash if user navigates to Recording edit on a blank project.

#### Verification

- Unit test: blank project document validates against `ProjectDocumentSchema`.
- Renderer test: ProjectPreview on a blank project renders the empty-state card.
- Manual: click `Blank project` → opens in NLE → switch to Recording edit → see empty-state card with switch-view button.

### TASK-170 Template picker stub modal (3 entries, no execution yet)

**Priority:** P3
**Status:** ✅ DONE (2026-05-18) — commit `d34a63f`. `template-stubs.mjs` carries the three hard-coded entries (short-form-vlog 9:16, tutorial 16:9, podcast-clip 1:1); `template-picker-modal.tsx` renders a role=dialog modal closable via Esc, backdrop, and ✕ button. Selecting a template creates a blank project at the chosen aspect ratio via the TASK-169 IPC. 4 stub-data tests pass. No template-pipeline execution — that's TASK-146. Drive-by: registered the previously-unwired `import-mime.test.mjs` (TASK-167) and the new template tests in the desktop `test` script. Total 364/364 desktop tests pass.
**Lane:** P-AI-C
**Supersedes part of:** TASK-127

#### Context

`From template` opens a modal listing three template stubs: `Short-form vlog`, `Tutorial`, `Podcast clip`. Each is a card with label + aspect ratio + brief description. Selecting one creates a blank project (TASK-169) with the corresponding aspect ratio preset — no auto-fire actions yet (those land in TASK-146).

#### Acceptance Criteria

- New `apps/desktop/src/renderer/src/library/template-picker-modal.tsx`.
- Three template stubs hard-coded (will be data-driven in TASK-146):
  - `short-form-vlog`: 9:16 aspect ratio
  - `tutorial`: 16:9 aspect ratio
  - `podcast-clip`: 1:1 aspect ratio
- Selecting a template → creates a blank project with the chosen aspect ratio in `settings.aspectRatio`.
- Modal closable via Esc + backdrop.
- No template-pipeline execution (auto-transcribe, auto-caption, etc.) — that's TASK-146.

#### Verification

- Renderer test: open modal → 3 templates render → click one → new project created with correct AR.
- Manual: pick `Short-form vlog` → confirm new project opens at 9:16.

### TASK-179 NLE MVP: program monitor + playhead + click-seek + select/delete/split

**Priority:** P1
**Status:** ⚠️ IN APP (2026-05-18) — first interactive cut of the NLE Editor view, pulled forward from TASK-140's interactive timeline. Built against the architecture grounded by a Perplexity research sweep on Chromium frame accuracy, single-vs-pool video elements, OTIO timeline model, model-owned playhead, and split-clip semantics. Needs hands-on iteration before being marked DONE — Linux/Chromium media stack has enough variation that bench tests can't guarantee the feel is right.
**Lane:** P-AI-E follow-up
**Follows:** TASK-176, TASK-178
**Pulled-forward-from:** TASK-140

#### Context

After TASK-178 made clip blocks visible, the next gap was that the lanes were inert — no playhead, no preview, no way to modify anything. This task ships the smallest end-to-end loop that lets a user open a project, scrub it, and remove or split a clip:

- Program monitor (`<video>` element wired to `project.mediaUrl`) with a frame-accurate sync loop using `requestVideoFrameCallback` (and `requestAnimationFrame` fallback).
- Playhead state owned by the model (NleShell) — the video element is a consumer, never the source of truth. Effects in `program-monitor.tsx` enforce the read/write split with a drift tolerance to avoid tug-of-war.
- Transport bar with play/pause toggle, go-to-start, and a SMPTE-ish `mm:ss:ff` time display fed from `formatTimecode`.
- Click-to-seek + pointer-drag scrub on the body region of the lanes (header column excluded from the click math).
- Click-to-select on a clip block + Delete/Backspace to remove + `S` to split at playhead. All mutations go through `applyProjectChange` so the existing edit-history records each as one undoable step.

#### Architectural rules (verified by tests)

- **Half-open intervals everywhere.** `[timelineIn, timelineOut)` — `timelineOut` is the first frame NOT in the clip. Pinned by `timeline-frames.test.mjs`.
- **Model owns the playhead.** Effects in `program-monitor.tsx` write to `video.currentTime` only when the drift exceeds `PLAYBACK_DRIFT_FRAMES / fps` (playing) or `SEEK_TOLERANCE_SECONDS` (paused). The RVFC loop reads `metadata.mediaTime` (PTS-aligned) back into the model. No oscillation.
- **Split is atomic and frame-accurate.** `splitClipById` → `splitClipAtFrame` → `applySplitOnTrack`, all pure. Caller wraps in one `applyProjectChange` so undo restores the original clip.
- **Mutations bail on retimed clips.** v13 doesn't model retime; `splitClipAtFrame` returns null when source span ≠ timeline span rather than producing wrong frames.

#### Acceptance Criteria

- Open the Editor tab on a project with a recording → see the recording in the program monitor, a wide video-lane block on the timeline, a red playhead at frame 0.
- Press Play → video plays, playhead advances.
- Click anywhere in the lane body → playhead snaps there, video seeks. Drag → playhead follows the cursor.
- Click a clip block → outlined as selected; Delete removes it; `S` splits it at the playhead.
- Undo/redo (Ctrl+Z / Ctrl+Y from the App-level shortcut) reverses any of those mutations.
- Switching projects resets playhead + selection.

#### Verification

- `timeline-frames.test.mjs` (11 tests) — split invariants, no-ops at edges, retime bailout, immutable applySplitOnTrack.
- `project-shape.test.mjs` (4 tests) — fps + duration resolution, timecode formatting.
- `clip-mutations.test.mjs` (6 tests) — removeClipById + splitClipById produce new project references, preserve sibling tracks, and are cheap no-ops on miss.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 403/403 pass.
- `pnpm smoke:ui` passes.
- Hands-on iteration **required** — Chromium media quirks on Linux/X11 (autoplay, RVFC presence, seek latency on h264) need real testing.

### TASK-180 NLE: time ruler with adaptive ticks above lanes

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — NLE timeline now renders a compact time ruler above the lane bodies with adaptive major labels, second-level minor ticks when labels are sparse, click-to-seek, and drag-scrub support. The ruler is measured against the bodies column and the playhead line extends through it.
**Lane:** P-AI-E follow-up
**Follows:** TASK-179
**Pulled-forward-from:** TASK-140

#### Context

TASK-179 made the NLE interactive, but the playhead had no time landmarks beyond its relative position in the lane strip. This made the editor feel unfinished and made scrubbing harder to orient. TASK-180 adds the smallest pro-editor cue: a ruler that lives above the tracks, uses the same body-column frame math as lane scrubbing, and avoids introducing timeline zoom.

#### Acceptance Criteria

- New `nle/timeline-ruler.tsx` renders ticks above the lanes, inside `.nleTimelineLanes`.
- Ruler spans only the lane bodies column, not the lane header column.
- `nle/ruler-ticks.mjs` picks adaptive major intervals: 1s for short timelines, 5s+ for medium timelines, and wider intervals for long timelines while preserving at least 40px between labels.
- Major labels use `mm:ss:00`; minor ticks render at one-second intervals when major labels are wider than one second.
- Clicking or drag-scrubbing the ruler seeks with the same body-column `frameFromClientX` math as the lane bodies.
- The playhead line extends through the ruler.

#### Verification

- `nle/ruler-ticks.test.mjs` covers short, medium, long, minimum label spacing, generated major/minor ticks, and `mm:ss:00` formatting.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 409/409 pass.
- `pnpm smoke:ui` passes.
- NLE-only visual smoke: `nle-ruler-result.json` reports `hasNleRuler`, `hasNleRulerLabels`, `hasNlePlayhead`, `hasNleClipBlock`, and `rulerAlignedToBodies`; screenshot verified at `/tmp/rough-cut-ui-smoke-RREzT1/nle-ruler-smoke.png`.

### TASK-181 NLE: keyboard transport shortcuts

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — NLE shell now owns document-level keyboard transport while mounted: Space toggles play/pause with default suppression, arrows step the model playhead by 1 frame or 10 with Shift, Home/End jump to bounds, K pauses, L plays forward, and J uses the MVP reverse fallback of pausing and stepping back about one second.
**Lane:** P-AI-E follow-up
**Follows:** TASK-180
**Pulled-forward-from:** TASK-140

#### Context

TASK-179 shipped mouse-first transport, but the NLE still lacked expected editing muscle memory. This task adds the smallest keyboard layer without making the video element source-of-truth: shortcuts write to the shell's `playheadFrame` / `isPlaying` model state, and the program monitor continues to follow that state.

#### Acceptance Criteria

- Space toggles play/pause and calls `preventDefault`.
- ArrowLeft / ArrowRight step the playhead by 1 frame; Shift+Arrow steps by 10 frames.
- Home / End jump to frame 0 / `durationFrames`.
- J / K / L map to reverse fallback / pause / play forward. Reverse playback is an MVP fallback because Chromium does not reliably support negative `HTMLVideoElement.playbackRate`.
- Handlers bail when typing in `input`, `textarea`, `select`, or contenteditable targets.
- Listener is attached only while `NleShell` is mounted, keeping shortcuts scoped to the NLE view.

#### Verification

- `nle/keyboard.test.mjs` covers typing-target detection and frame clamping.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 412/412 pass.
- NLE-only smoke verifies ArrowRight advances the NLE transport time and Space is default-prevented.
- Manual-equivalent: open NLE, press Space and arrows; behavior is shell-owned and scoped to the NLE view.

### TASK-182 NLE: Split at playhead transport button

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — Transport now exposes a visible Split button that calls the same shell-owned split path as the `S` shortcut. It is disabled when no clip is selected or when the selected clip cannot be split at the current playhead frame.
**Lane:** P-AI-E follow-up
**Follows:** TASK-181
**Pulled-forward-from:** TASK-140

#### Context

TASK-179 made `S` split a selected clip, but there was no visible affordance. This task adds the smallest discoverable control without adding more transport surface area: a single Split button next to the existing play/start controls.

#### Acceptance Criteria

- `nle/transport.tsx` renders a Split button with a scissor icon and `Split` label.
- Button is disabled when `selectedClipId === null` or when splitting at the current playhead would be a no-op.
- Button uses the same shell-owned `onSplit` callback as the `S` shortcut.
- Disabled state lowers opacity and uses `cursor: not-allowed`.
- No Delete button is added.

#### Verification

- `nle/clip-mutations.test.mjs` covers `canSplitClipById` so the disabled state can be computed without mutating or allocating split IDs.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 413/413 pass.
- NLE-only smoke verifies the Split button is disabled before selection, enables after selecting a clip, and creates a second clip when clicked.

### TASK-183 NLE: snap playhead to clip edges during scrub

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — Pointer scrubbing now snaps the NLE playhead to nearby clip edges, frame 0, and timeline end using a pixel-scaled threshold. Keyboard stepping remains unsnapped for precision.
**Lane:** P-AI-E follow-up
**Follows:** TASK-182
**Pulled-forward-from:** TASK-140

#### Context

After click/drag scrubbing landed, stopping a few pixels away from a clip boundary was too easy. This task adds a small pro-editor behavior without introducing full magnetic timeline editing: only pointer scrub seeks snap, and the threshold scales with the current body-column width.

#### Acceptance Criteria

- New `nle/snap.mjs` exports `snapFrameToClipEdges(targetFrame, project, snapPixelsToFrames)`.
- Snap candidates include `timelineIn` and `timelineOut` for clips on all tracks.
- Snap candidates also include frame 0 and `composition.duration`.
- The effective threshold is about 6px, converted to frames from the current lane-body width.
- Snapping is wired into pointer/ruler scrubbing only; keyboard frame-step remains exact.

#### Verification

- `nle/snap.test.mjs` covers candidates from all tracks, threshold boundaries, timeline bounds, and open-space no-op behavior.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 417/417 pass.
- `pnpm smoke:ui` passes.

### TASK-178 NLE: read-only clip blocks on Video / Audio lanes

**Priority:** P2
**Status:** ✅ DONE (2026-05-18) — `nle/timeline-clips.mjs` builds per-lane clip blocks (`{ leftPct, widthPct, name, enabled }`) from `project.composition.tracks`, normalized against `composition.duration`. `NleTimeline` now reads the project and renders absolutely-positioned `.nleClipBlock` rectangles inside each lane body (`No clips yet` placeholder shown when a lane has no clips). Captions + motion-graphics lanes stay empty until the v13 schema gets those track types (TASK-134 + TASK-145). Read-only: no playhead, scrubber, drag, or trim — those land in TASK-140.
**Lane:** P-AI-E follow-up
**Follows:** TASK-173, TASK-176
**Pulled-forward-from:** TASK-140 (only the clip-visualization slice; the full interactive timeline stays in P-AI-I/Phase 3)

#### Context

After P-AI-E shipped, the NLE Editor view shows asset cards on the right but four empty lanes in the center even for projects with a real video clip. The expected behavior was confusing — users naturally assume something is broken when a 7-minute video appears in the asset panel but the Video lane is blank. This task extracts the smallest valuable slice of TASK-140 (read-only clip rectangles, normalized by duration) so the lanes communicate that there IS a clip without committing to the full multi-track editor.

#### Acceptance Criteria

- New `nle/timeline-clips.mjs` exporting `buildLaneClips(project, kind)`. Pure, testable.
- `NleTimeline` consumes the helper per lane and renders positioned `<div className="nleClipBlock">` blocks with width/left set as percentages.
- Clips on `video` Track type → Video lane. Clips on `audio` Track type → Audio lane. Captions + motion-graphics lanes always empty (no schema support yet).
- Overflowing clips are clamped to composition.duration; zero/negative-width clips are dropped.
- `enabled: false` clips render with reduced opacity.
- No interaction: `pointer-events: none` on the block so the rest of the lane stays inert.

#### Verification

- `nle/timeline-clips.test.mjs`: 7 cases (empty projects, captions/MG noop, video clips, audio routing, overflow clamping, zero-width drop, enabled flag).
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 382/382 pass.
- `pnpm smoke:ui` passes.
- Manual: open a recording in the Editor tab → see a wide Video-lane block spanning the timeline; if the project is an import done after TASK-177, see a matching Audio-lane block in green.

### TASK-177 Import audio passthrough (embedded video audio + audio-only imports)

**Priority:** P2
**Status:** ⚠️ DATA-LAYER DONE / RENDERER VERIFY (2026-05-18) — `probeImportedMedia` now makes a second ffprobe call on a:0 for video imports, returning `hasAudio` / `audioDurationSeconds` / `audioSampleRate`; `createProjectForImport` emits a sibling audio asset + dedicated audio track over the same source `filePath` when `probe.hasAudio === true`. Tests added in `media-probe.test.mjs` (hasAudio detection + failed audio probe = silent video import) and `project-files.test.mjs` (two assets/tracks when hasAudio, single asset when not). Renderer-side acceptance criteria (preview audio gating + export audio passthrough) inspected: the primary preview `<video>` has no explicit `muted` attr or programmatic mute, and `export-service.mjs` already maps `0:a?` so embedded audio survives export by default. The spec's "video element is effectively muted" description does not match the current renderer — no mute to flip. Imports may already play audio after the data-layer change. **Manual verification still required:** import a recorded mp4 → confirm preview audio + exported mp4 has an audio stream; import an mp3 → confirm preview + export. If silent playback reproduces, file a follow-up with the specific path.
**Lane:** P-AI-C follow-up
**Follows:** TASK-168

#### Context

Imports created via TASK-168 currently play silently in Recording-edit preview and export with no sound. Two reasons:
1. The Recording-edit pipeline treats audio as a *separate* asset/track (built around the mic recording being its own file). The source video element in the canvas draw loop is effectively muted to avoid doubling up with the mic track.
2. The import factory in `apps/desktop/src/main/project-files.mjs:createProjectForImport` does not probe audio streams or create an audio asset, so the embedded audio in an imported mp4/mov is never exposed to the timeline.

This also affects audio-only imports (mp3/wav): the project shape compiles fine but there's no playback wiring.

#### Acceptance Criteria

- `probeImportedMedia` (in `media-probe.mjs`) is extended to also report whether the video file contains an audio stream and the audio's `durationSeconds` / `sampleRate`.
- `createProjectForImport` (in `project-files.mjs`) handles audio:
  - Video import with embedded audio: emits a sibling audio asset pointing at the *same* `filePath` as the video asset (no demux/extraction — just a second logical asset over the same file), placed on a new audio track.
  - Audio-only import: already creates an audio asset; ensure that asset is on an audio track wired through the same preview-audio path the mic recording uses.
- Recording-edit preview plays embedded audio when the active project's primary asset is an import (detected via `asset.metadata.importKind`). Source video element unmute logic gates strictly on import-kind to avoid double-audio with mic-recorded projects.
- Export pipeline carries the audio track through to the final mp4 (verify with `ffprobe` showing both v:0 and a:0 in the exported file).
- Existing recording flow's audio behavior is unchanged (no regression on mic-recorded projects). Pin with the existing recording-stop-handler tests.

#### Verification

- Unit test: `createProjectForImport` for a video probe with `hasAudio: true` produces 2 assets and 2 tracks (video + audio); same file path referenced by both.
- Unit test: existing recording flow is unaffected (snapshot the produced ProjectDocument before/after).
- Manual: import a previously-recorded Rough Cut mp4 → preview plays with audio; export → opened mp4 contains audio.
- Manual: import an mp3 → preview plays the audio; scrub the timeline; export → mp3 audio is preserved in the exported mp4.



**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-D
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

First-time transcription installs WhisperX into a managed Python venv (~2 GB models). Cloud fallback when local fails or user opts out. Auto-detects spoken language (Hebrew + English priority).

#### Acceptance Criteria

- New `apps/desktop/src/main/whisperx/install.mjs`: detects Python 3.10+, creates venv in `userData/whisperx/`, pip-installs whisperx + faster-whisper, downloads `medium` or `large-v3` model based on user choice.
- New `apps/desktop/src/main/whisperx/run.mjs`: spawns WhisperX, parses word-level JSON output.
- Cloud fallback via OpenAI Whisper API (`AI_KEYS_GET_STATUS` for openai).
- First-run UI: install progress modal with disk-footprint disclosure, model picker (`medium` 1 GB / `large-v3` 3 GB), "use cloud instead" option.
- IPC `AI_TRANSCRIBE_RECORDING` with `{recordingPath, languageHint?: string}` → returns transcript JSON.
- Routes via the provider registry (TASK-124 pattern).

#### Verification

- Unit tests with mocked subprocess for install detection + parse logic.
- Manual: fresh user with no Python → guided to install Python OR cloud fallback; install completes; transcribe a 10s English fixture; transcribe a 10s Hebrew fixture.

### TASK-129 Transcript IPC + persistence inside .roughcut

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-D
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Transcripts produced by TASK-128 land in the project document as first-class data. Word-level timing preserved.

#### Acceptance Criteria

- Wire TASK-128's transcription result through `ProjectDocument.transcript` (from TASK-126 schema).
- Background job during transcription (uses TASK-125 job system).
- Autosave persists transcript via existing project autosave path.
- Transcript readable across both Recording edit and NLE Editor views (single source of truth).
- Re-run transcription replaces the existing transcript (no merge for v1).

#### Verification

- Unit tests: round-trip transcript through save + reopen.
- Manual: record 30s → trigger transcription → reload project → transcript persists.

### TASK-171 NLE: register 'nle' AppViewId + APP_VIEWS entry + 4th tab in strip

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — `AppViewId` extended with `'nle'`, `APP_VIEWS` adds `{ id: 'nle', label: 'Editor', iconName: 'sliders' }`, `?view=nle` URL override allowed; subsumed by the real shell shipped in TASK-172 so no stub branch landed.
**Lane:** P-AI-E
**Supersedes part of:** TASK-130

#### Context

First atomic step: just register the new view in the type system + app-views registry so the bottom tab strip renders 4 tabs. No content yet — clicking NLE just shows an empty placeholder.

#### Acceptance Criteria

- `apps/desktop/src/renderer/src/app-views.ts`: extend `AppViewId` union to include `'nle'`.
- `APP_VIEWS` array adds the entry: `{ id: 'nle', label: 'Editor', iconName: 'sliders' }` (or `filmstrip` if a clearer icon is available — check existing icon map).
- Tab strip in `main.tsx` already iterates `APP_VIEWS` → 4 tabs render automatically.
- main.tsx render switch: add a stub branch `activeAppView === 'nle' ? <div data-ui-region="nle-workspace">NLE coming soon</div> : ...` so the tab doesn't crash when clicked.
- View-pinning logic in main.tsx accepts `view=nle` URL param.

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm smoke:ui` — confirm 4-tab strip in the bottom screenshot.
- Manual: click NLE tab → see "NLE coming soon" text. Switch back to other tabs cleanly.

### TASK-172 NLE: shell scaffold + main.tsx render branch (empty container)

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — `apps/desktop/src/renderer/src/nle/nle-shell.tsx` ships `NleShell` (`<section className="nleShell" data-ui-region="nle-workspace">` with header + flex body), wired into `main.tsx` view switch; `.nleShell` CSS added.
**Lane:** P-AI-E
**Supersedes part of:** TASK-130

#### Context

Real NLE shell component replaces the "coming soon" stub from TASK-171. Empty flex container with header + body areas. No timeline or asset panel yet — those land in TASK-173 + TASK-174.

#### Acceptance Criteria

- New directory `apps/desktop/src/renderer/src/nle/`.
- New `nle-shell.tsx` exporting `NleShell` — a `<section className="nleShell" data-ui-region="nle-workspace" aria-label="NLE editor">` with a header (project name) and an empty body div.
- main.tsx render switch: NLE branch renders `<NleShell project={project} onProjectChange={applyProjectChange} onGoToProjects={() => setActiveAppView('projects')} />`.
- New CSS section for `.nleShell` in styles.css (basic flex column layout, dark editorial style consistent with PRODUCT.md).
- Stub from TASK-171 removed.

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm smoke:ui` — visual screenshot inspection: NLE tab → empty container with header visible.

### TASK-173 NLE: multi-track placeholder lanes (Video / Audio / Captions / MG headers)

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — `nle/nle-timeline.tsx` renders 4 fixed lanes (Video / Audio / Captions / Motion graphics) with `data-track-kind` attrs and "No clips yet" placeholders, driven by `NLE_TRACK_LANES` in `nle/asset-format.mjs` (regression-tested).
**Lane:** P-AI-E
**Supersedes part of:** TASK-130

#### Context

Render 4 placeholder track lanes in the NLE body. Each lane is a horizontal strip with a label on the left and an empty timeline area on the right. No clips, no playhead, no scrubber yet — just the visual scaffold.

#### Acceptance Criteria

- New `apps/desktop/src/renderer/src/nle/nle-timeline.tsx` exporting `NleTimeline`.
- Renders 4 fixed lanes: `Video`, `Audio`, `Captions`, `Motion graphics`. Each is a `<div className="nleTrackLane">` with header + empty content area.
- Lane heights are fixed (e.g., 60px each). Lane order top-to-bottom: Video, Audio, Captions, MG.
- Each lane has `data-track-kind="video"` / `audio` / `captions` / `motion-graphics` attrs for future hooks.
- NLE shell renders `<NleTimeline />` in its body.
- Empty content area shows a muted "No clips yet" placeholder centered in the lane.

#### Verification

- Renderer test: 4 lanes render with correct labels + data-track-kind attrs.
- Manual: open NLE → see 4 stacked empty lanes.

### TASK-174 NLE: asset panel sidebar with Project + Generated tabs (empty states)

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — `nle/asset-panel.tsx` ships `AssetPanel` with `Project assets` / `Generated` tabs (local state), assets enumerated from `project.document.assets`, empty states for each tab, 280px sidebar via `.nleBody` CSS grid.
**Lane:** P-AI-E
**Supersedes part of:** TASK-130

#### Context

Right (or left) sidebar in the NLE shell with two tabs: `Project assets` (lists project recording + imports — initially empty stubs) + `Generated` (empty until TASK-141 wires the cross-project AI pool). Drag-to-timeline not implemented yet — that's TASK-141.

#### Acceptance Criteria

- New `apps/desktop/src/renderer/src/nle/asset-panel.tsx` exporting `AssetPanel`.
- Two tabs: `Project assets`, `Generated`. Tab state local to the component.
- `Project assets` tab: lists `project.document.assets` (recording + import assets). Each shows a thumbnail + label + duration. Empty state: "No assets in this project yet. Record a take or import a file."
- `Generated` tab: empty state: "AI-generated assets land here. Wire-up in Phase 3."
- NLE shell layout splits horizontally: timeline (large) + asset panel (~280px width).

#### Verification

- Renderer test: two tabs render, switch by click, empty states visible.
- Manual: open NLE with a project that has a recording → see the recording in the Project assets tab; open with a blank project (after TASK-169) → see empty state.

### TASK-175 NLE: empty-state when no project is open (CTA back to Projects)

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — `NleShell` short-circuits to `NleEmptyState` when `project === null`; renders "No project open" copy + "Go to Projects" primary button calling `onGoToProjects` (wired in `main.tsx` to `setActiveAppView('projects')`).
**Lane:** P-AI-E
**Supersedes part of:** TASK-130

#### Context

When the user lands on NLE without a project loaded, show a friendly empty-state instead of a blank multi-track scaffold. CTA: switch back to Projects view.

#### Acceptance Criteria

- `NleShell` checks `project === null` and renders an `NleEmptyState` component instead of the timeline + asset panel.
- Empty state: centered text "No project open" + body "Open a project from Projects, or start a blank one to begin editing." + primary button "Go to Projects".
- Clicking the button calls `onGoToProjects` prop (which switches `activeAppView` to `'projects'`).

#### Verification

- Renderer test: NLE with `project={null}` renders empty state with button.
- Manual: open NLE without loading a project → see empty state; click button → return to Projects.

### TASK-176 NLE: shared state — consume project + applyProjectChange from App

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — `main.tsx` NLE branch passes `project` + `onProjectChange={(next) => applyProjectChange(next as ProjectState)}` into `NleShell`; no local NLE state; writes go through the shared `applyProjectChange` autosave + undo path. Renderer-side .tsx test harness not part of this repo; testable helpers (`assetLabel`, `formatDuration`, lane registry) covered by `nle/asset-format.test.mjs`. Manual cross-view state verification still required per spec.
**Lane:** P-AI-E
**Supersedes part of:** TASK-131

#### Context

Verify the architectural promise: NLE and Recording edit share the same project state via prop-drilling from App. Since `project`, `editHistory`, and `applyProjectChange` already live in App (and are passed to `ProjectPreview` today), this task is mostly about wiring the same props into `NleShell` and confirming the shared-state behavior with a test.

#### Acceptance Criteria

- main.tsx render branch for NLE passes `project`, `applyProjectChange`, `editHistory` (read-only) into `NleShell` (same props ProjectPreview receives).
- No new state in NleShell — all writes go through `onProjectChange`.
- Add a renderer test: mount both views in sequence, mutate via `applyProjectChange` while NLE is active, switch to Recording edit, confirm state visible.
- Existing autosave + undo paths work identically for edits made from either view.

#### Verification

- New renderer test in `apps/desktop/src/renderer/src/nle/nle-shell.test.tsx` (or sibling).
- Manual: open project, switch between NLE and Recording edit, edit project name in one view (when transcript editor exists this will be more meaningful), confirm change visible in the other view immediately.

### TASK-132 Transcript editor pane (Descript-style: click-scrub, delete-cut)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-F
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

The headline NLE Editor feature: a paragraph-formatted transcript pane where clicking a word scrubs the timeline and deleting a word cuts that span from the timeline.

#### Acceptance Criteria

- New `apps/desktop/src/renderer/src/nle/transcript-pane.tsx` rendering `ProjectDocument.transcript` as paragraphs with word-level spans.
- Click a word → scrub to that word's startFrame.
- Select word range + Delete → fires TASK-133's cut.
- Non-speech segments rendered as `[silence]` / `[music]` markers (when WhisperX returns them).
- Live updates while transcription is running (streaming if supported).
- RTL layout for Hebrew transcript.

#### Verification

- Unit tests for word-selection logic.
- Manual: transcribe a recording, click various words, confirm scrub; select a range, delete, confirm timeline cut.

### TASK-133 Word-level cut with silence-snap + 20ms audio crossfade

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-F
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

When a word is deleted from transcript, the timeline cut should snap to the nearest silence boundary and apply a 20ms audio crossfade to avoid pops.

#### Acceptance Criteria

- New helper in `apps/desktop/src/renderer/src/zoom-markers.mjs` (or sibling): `snapToSilence(transcript, startFrame, endFrame) → {startFrame, endFrame}`.
- Uses transcript word/non-speech segment boundaries from WhisperX.
- Creates a CutRange via existing `addCutRange` from `cut-ranges.mjs`.
- Export pipeline applies a 20ms `afade` at each cut boundary (extend `export-service.mjs` audio chain).
- Preview playback respects the crossfade visually (no abrupt cut feel).

#### Verification

- Unit tests for `snapToSilence` covering edge cases (cut at word start, mid-silence, end of transcript).
- Smoke export test: cut a word, export, confirm no audio pop in the output mp4.

### TASK-134 Caption track data model + ASS subtitle render path

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-G
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Caption track persists on the project document. ASS subtitle render path covers the "subtitle" style (low-cost option) via the existing ffmpeg pipeline.

#### Acceptance Criteria

- `packages/project-model/src/caption-track.ts` exports `CaptionTrack`, `CaptionStyle` (`'subtitle' | 'submagic' | 'karaoke'`), `CaptionPhrase` (per-phrase styling).
- Generated from transcript on user action ("Add captions" button in NLE).
- Subtitle style renders via existing ASS export pipeline (`apps/desktop/src/main/export-service.mjs`).
- Stored in `ProjectDocument.captionTracks` (from TASK-126 schema).

#### Verification

- Unit tests for caption generation from a transcript fixture.
- Smoke export: subtitle-style caption visible burned into a styled export.

### TASK-135 Remotion bundled into renderer + Submagic caption composition

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-G
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Bundle Remotion into the Electron renderer (preview AND export render via Remotion). Build the Submagic-style caption composition (multi-color emphasis, bouncy entrances, tight kerning).

#### Acceptance Criteria

- New workspace package `packages/remotion-compositions/` with Remotion as dep.
- Submagic composition: word-by-word reveal, current-word highlight, bouncy entry animation, configurable color palette per phrase.
- Renderer integration: preview canvas uses Remotion's React renderer.
- Export integration: ffmpeg overlays Remotion-rendered transparent PNG sequence (or webm) on top of the styled video.
- Bundle-size impact measured and documented in task notes.

#### Verification

- Smoke render test: 5s caption fixture produces a PNG sequence with bouncy text.
- Manual: enable Submagic style on a transcribed recording, preview real-time, export, confirm captions visible.

### TASK-136 AI keyword emphasis per phrase (Claude/Codex CLI batched)

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-G
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

For Submagic-style captions, AI picks the most impactful word per phrase to emphasize. Batched per request (multiple phrases per call) to control cost. Routes via the reasoning capability (TASK-124).

#### Acceptance Criteria

- New main-process function `pickEmphasisWords(phrases) → emphasis[]` using the reasoning capability.
- Batches up to 20 phrases per call.
- Rotates through a 4-color palette per phrase.
- Caches results on the phrase ID; re-runs only when the phrase text changes.
- Settings allows toggling between AI emphasis and heuristic (longest non-stop-word).
- Cost-meter tracks each call.

#### Verification

- Unit tests for the batch builder and color rotation.
- Manual: transcribe 30s, enable Submagic captions, confirm one colored word per phrase, colors cycle.

### TASK-137 .srt / .vtt sidecar export + Hebrew/English language priority

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-G
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Captions also exportable as plain `.srt` / `.vtt` for downstream platforms (YouTube, podcast hosts). Hebrew and English priority for v1.

#### Acceptance Criteria

- Export menu adds "Export captions (.srt)" + "Export captions (.vtt)" actions.
- RTL formatting preserved in `.srt` for Hebrew.
- Sidecar file written alongside the .mp4 export.
- Language auto-detected from WhisperX; user override in Settings → Language.

#### Verification

- Unit tests for SRT/VTT formatting (timing precision, RTL).
- Manual: export captions, open in VLC alongside the .mp4, confirm timing.

### TASK-138 Filler + silence detector from transcript word-timing

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-H
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Reads `ProjectDocument.transcript` (TASK-129), identifies filler words and silent gaps, produces proposed cuts.

#### Acceptance Criteria

- New `packages/project-model/src/filler-detector.ts` with `detectFiller(transcript, options)` → `CutRangeProposal[]`.
- Default filler lists: English (um, uh, uhm, like, you-know, basically, literally, kinda), Hebrew (אהה, אממ, יעני, כאילו, בעצם).
- Silence threshold configurable (default 600ms).
- User-extensible filler lists in Settings → Advanced.

#### Verification

- Unit tests with transcript fixtures covering English + Hebrew filler cases, silent gaps, short/long silences.

### TASK-139 Proposed-cut overlays on NLE timeline + apply flow

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-H
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Visualizes the proposals from TASK-138 as ghost overlays on the NLE timeline. Apply-all + per-cut review.

#### Acceptance Criteria

- "Cut filler & silence" capability card in the launchpad invokes TASK-138 + opens NLE.
- Proposals rendered as semi-transparent overlays on the timeline.
- Per-cut hover shows the transcript text + reason.
- "Apply all" / "Apply selected" buttons commit via `addCutRange`.
- Reuses TASK-133's silence-snap + audio crossfade.

#### Verification

- Renderer test: synthetic proposals render correctly.
- Manual: transcribe 1-minute recording, run filler cut, review overlays, apply, confirm timeline updated.

### TASK-140 Full multi-track timeline expansion

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
**Supersedes part of:** TASK-184, TASK-185, TASK-186, TASK-187, TASK-188, TASK-189, TASK-190, TASK-191
#### Context

Expands the NLE timeline scaffold (TASK-130) into a real multi-track surface: multiple video lanes, multiple audio lanes (mic / system / TTS / SFX / music), captions track (from TASK-135), MG track.

#### Acceptance Criteria

- Generalized `Track` data model in `packages/project-model/src/track.ts`.
- Timeline component renders N tracks vertically with per-track header (label + lock + mute).
- Drag-drop reorder of tracks.
- Per-track height adjustable.
- Asset clips on tracks: position by drag, trim handles at clip edges.
- Frame-resolver extended to composite from track stack (z-order: bottom to top for video, sum for audio).
- Existing single-recording projects render with a single video track + audio track (back-compat).

#### Verification

- Unit tests for track stack compositing.
- Manual: open a recording in NLE, see video on video track + audio on audio track; drop a generated TTS onto a new audio track (after TASK-142).

### TASK-141 Cross-project AI asset pool

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
**Supersedes part of:** TASK-192, TASK-193, TASK-194, TASK-195, TASK-196
#### Context

Generated assets (TTS / images / SFX) live in a cross-project pool in `userData/ai-assets/` and are referenced from projects by stable ID. Visible in the NLE asset panel's "Generated" tab.

#### Acceptance Criteria

- New `apps/desktop/src/main/ai-assets-store.mjs` with index file (sqlite or JSON) at `userData/ai-assets/index.json`.
- `AiAsset` schema in `packages/project-model/src/ai-assets.ts`: id, kind, providerId, sourcePrompt, createdAt, tags, sessionId, filePath.
- IPC: `AI_ASSETS_LIST`, `AI_ASSETS_DELETE`, `AI_ASSETS_TAG`.
- "Generated" tab in the NLE asset panel: filter by type / tag / session, search by prompt text.
- Drag from "Generated" tab onto an NLE timeline track creates a project-level reference (by ID).
- Asset preview (audio waveform / image / video thumb) inline in the panel.

#### Verification

- Unit tests for the index round-trip and the ID-reference resolution.
- Manual: generate TTS (TASK-142), confirm it appears in "Generated", drag to timeline.

### TASK-142 TTS generation flow

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
**Supersedes part of:** TASK-197, TASK-198, TASK-199, TASK-200
#### Context

Generate narration via ElevenLabs (preset voices) or OpenAI gpt-4o-mini-tts (via Codex CLI auth). Result lands in the AI asset pool.

#### Acceptance Criteria

- New capability module `apps/desktop/src/main/ai-providers/capabilities/tts.mjs` with router: ElevenLabs API > OpenAI gpt-4o-mini-tts (Codex CLI) > local Piper (future).
- IPC `AI_GENERATE_TTS` with `{text, voice, provider?}` → `{assetId}`.
- "Generate narration" launchpad card opens a modal: text input, voice picker (preset voices per provider), preview, generate.
- Result saved to AI asset pool (TASK-141).
- Voice cloning deferred to TASK-147.

#### Verification

- Smoke: generate a 10s TTS from text → confirm .mp3 in `userData/ai-assets/`.
- Manual: generate narration, drag to an audio track, hear in NLE preview.

### TASK-143 Image generation flow

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
**Supersedes part of:** TASK-201, TASK-202, TASK-203, TASK-204
#### Context

Generate images via Codex CLI `$imagegen` (gpt-image-2, primary) with Replicate / fal.ai fallback. Result lands in the AI asset pool.

#### Acceptance Criteria

- Capability `apps/desktop/src/main/ai-providers/capabilities/image-gen.mjs` with router: Codex CLI $imagegen > Replicate > fal.ai > OpenAI API.
- IPC `AI_GENERATE_IMAGE` with `{prompt, aspectRatio?}` → `{assetId}`.
- "Generate image" launchpad card opens modal: prompt input, aspect ratio (auto from project), variations count (default 4), provider picker.
- Codex CLI subprocess invokes `$imagegen` skill.
- Results saved to AI asset pool.

#### Verification

- Manual: generate a 1024x1024 image via Codex CLI auth → file appears in `userData/ai-assets/`.
- Manual fallback test: Codex CLI not authed → router falls through to Replicate (with API key configured).

### TASK-184 Track model: generalized NLE tracks + migration defaults

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — Schema v14 now has generalized NLE tracks derived from composition tracks, with project-asset and AI-asset clip references. Existing v13 projects migrate into top-level NLE tracks; blank projects stay empty.
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

The NLE needs a first-class track model before renderer drag/drop or generation assets can be safely attached to the timeline. This task is data-model only.

#### Acceptance Criteria

- Add generalized track types for video, audio, captions, and motion-graphics in the project model.
- Add clip references that can point at project media or AI assets without duplicating files.
- Add migration defaults for existing `.roughcut` projects so current recordings open with one video track and one audio track when applicable.
- Preserve existing single-recording behavior in Recording edit.

#### Verification

- `pnpm --filter @rough-cut/project-model typecheck` clean.
- `pnpm --filter @rough-cut/project-model test` 149/149 pass.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 417/417 pass.

### TASK-185 Frame resolver: video stack selection + audio mix plan

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — Added `resolveNleFrame` for generalized NLE tracks. Video resolution picks the highest enabled/unlocked active video clip; audio resolution returns all enabled/unlocked/unmuted active audio clips for later mixing. Clip inclusion remains half-open.
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Rendering and preview need one deterministic answer for "what is active at frame N" across a stacked timeline.

#### Acceptance Criteria

- Add a pure frame resolver for generalized tracks.
- Video resolution walks enabled/unlocked video tracks by z-order and returns the top active opaque clip.
- Audio resolution returns all enabled/unmuted active audio clips for later sum-mix.
- Half-open intervals remain `[timelineIn, timelineOut)`.

#### Verification

- `pnpm --filter @rough-cut/project-model typecheck` clean.
- `pnpm --filter @rough-cut/project-model test` 154/154 pass.
- `pnpm --filter @rough-cut/project-model build` clean.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 417/417 pass.

### TASK-186 NLE timeline: render dynamic tracks from project data

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — NLE timeline now renders project-owned dynamic tracks, including legacy recording fallback rows and empty-project guidance. Split/delete mutations keep generalized NLE track clips synchronized with composition clips until the renderer fully moves off legacy composition tracks.
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

The current NLE timeline has fixed display lanes. This task switches rendering to project-owned tracks without adding editing gestures yet.

#### Acceptance Criteria

- Render N timeline tracks from the project model.
- Track headers show name, type, and basic status.
- Existing recordings still show sensible Video and Audio rows.
- Empty projects show an add/import hint instead of broken lanes.

#### Verification

- Renderer tests cover single recording, blank project, and multiple-track fixtures.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 422/422 pass.
- `pnpm smoke:ui` passed on retry after one unrelated vertical-aspect wait flake.
- NLE-only smoke passed and screenshot showed dynamic rows cleanly.

### TASK-205 Recording edit/NLE share presentation state and controls

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — Recording edit and NLE now share `StyledVideoPreview`, so cursor, click effects, camera PiP, background, aspect, screen/camera frames, zoom markers, cuts, and export settings render from the same project-owned presentation state. NLE uses the shared preview without editor handles.
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Recording edit and NLE are two views over the same project, not separate editors. Presentation controls must not fork: cursor, click effects, camera PiP, background, aspect ratio, screen/camera frames, zoom markers, cuts, and export settings should be owned once and reflected in both views.

#### Acceptance Criteria

- Audit Recording edit presentation state and NLE state for duplicated cursor/camera/background/export fields.
- NLE reads and writes the same project-owned presentation objects as Recording edit.
- Changing cursor, click, camera, background, aspect, zoom, cuts, or export settings in one view is visible after switching to the other view without reload.
- No NLE-only parallel inspector state is introduced for shared presentation controls.
- Mutations continue through `applyProjectChange` so undo/redo remains one shared stack.

#### Verification

- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 430/430 pass.
- `pnpm smoke:ui` passed.
- Focused NLE smoke passed and screenshot showed shared styled preview without edit handles.

### TASK-187 NLE trim handles for selected clip edges

**Priority:** P1
**Status:** REWORK REQUIRED → TASK-211 — The first implementation added selected-clip visible trim buttons, but the interaction is not the correct professional timeline model. Trim must be rebuilt as edge hit-zones with local drag preview sessions after the shared one-timeline/two-toolsets model is fixed.
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Clip splitting exists, but timeline editing needs direct edge trims before broader drag/drop editing.

#### Acceptance Criteria

- Selected clips show left and right trim handles.
- Dragging a handle adjusts `timelineIn` or `timelineOut` through a pure mutation helper.
- Trims cannot invert a clip, cross neighboring clips on the same track, or leave project bounds.
- Keyboard frame stepping remains independent from pointer snap behavior.

#### Verification

- Unit tests cover left/right trim timing, neighbor clamps, invalid/no-op inputs, and top-level NLE track synchronization.
- Source guard verifies selected-clip trim handles are wired to `trimClipById`.
- `pnpm --filter @rough-cut/desktop typecheck` clean.
- `pnpm --filter @rough-cut/desktop test` 436/436 pass.
- `pnpm smoke:ui` passed.
- Focused NLE smoke passed with `hasNleTrimHandles: true`; screenshot shows selected-clip trim handles without disrupting the timeline layout.

#### Rework Notes

- Do not build TASK-188 on top of the current trim UI.
- Keep useful pure mutation tests only if they still match the shared timeline model.
- Replace layout-affecting handle buttons with edge hit-zones/brackets.
- During pointer drag, update local preview state only; commit one shared timeline mutation on pointerup.
- Recording edit and NLE must both reflect the trim because they are toolsets over the same timeline.

### TASK-206 Shared timeline invariant: one timeline, two toolsets

**Priority:** P1
**Status:** ✅ DONE (2026-05-18) — Added `docs/shared-timeline-architecture.md` and a test guard that names the invariant: one timeline, two canonical toolsets. The doc identifies shared edit concepts, transitional fields, interaction rules, and the implementation order that blocks further trim/drag work until shared timeline semantics are explicit.
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Recording edit and NLE are not separate timelines and not a primary/derived hierarchy. They are two toolsets over one shared timeline model. The current code still has legacy Recording edit concepts (`cutRanges`, trim state, presentation controls) and newer NLE tracks/clips that can drift or be interpreted differently.

#### Acceptance Criteria

- Write down the shared timeline invariant in code-adjacent docs/tests: one timeline, two canonical toolsets.
- Identify every persisted edit concept that must be shared: cuts, trims, zooms, cursor/click effects, camera PiP, aspect, background, export settings, screen/camera frames.
- Define which project model fields are canonical and which are transitional/legacy.
- Block new trim/drag work unless it routes through the shared timeline mutation path.

#### Verification

- `apps/desktop/src/renderer/src/shared-timeline-invariant.test.mjs` verifies the invariant doc names one timeline, two canonical toolsets, shared edit concepts, and pointer preview/commit rules.
- `python3 /home/endlessblink/.codex/skills/.system/skill-creator/scripts/quick_validate.py /home/endlessblink/.codex/skills/rough-cut-zoom-timeline` passed after updating the Rough Cut timeline skill.

### TASK-207 Shared timeline schema for sources, tracks, clips, markers

**Priority:** P1
**Status:** ✅ DONE (2026-05-19)
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

The project model needs a clean JSON-friendly shape for the shared timeline: source media, tracks, clips, linked groups, markers/effects, and export settings. Existing model fields can be migrated incrementally, but the target shape must be explicit before more UI interactions are added.

#### Acceptance Criteria

- Define source/media references for screen, camera, mic/system audio, and cursor telemetry.
- Define tracks/clips with integer-frame `sourceIn`, `sourceOut`, `timelineIn`, `timelineOut` and half-open intervals.
- Define linked media/group rules so screen, camera, audio, cursor telemetry, zoom/click markers, and presentation state remain synchronized.
- Define marker/effect ownership for zoom, clicks, cursor style, camera PiP, and annotations.
- Preserve existing project compatibility through migrations or transitional fields.

#### Verification

- Added `packages/project-model/src/shared-timeline.ts` with source, linked group, marker, effect, track, and export-setting ownership.
- Added `timeline` to `ProjectDocument`, `ProjectDocumentSchema`, `createProject`, and v14→v15 migration while preserving legacy `composition.tracks` and top-level `tracks` as transitional fields.
- Project-model schema tests cover valid recording sources, linked groups, marker/effect ownership, invalid clip intervals, and broken marker/group references.
- Migration tests prove older projects backfill the shared timeline and still validate.

#### Rework Notes

- TASK-214 replaces this as the canonical model-contract task.
- The rebuild must explicitly distinguish timeline time from source media time.
- Active code paths must stop treating legacy mirrors as fallback truth after migration.

### TASK-208 Migrate Recording edit cuts/trims into shared timeline

**Priority:** P1
**Status:** REWORK REQUIRED → TASK-215
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Current Recording edit uses concepts like single-recording trim and `cutRanges`. These must become edits on the shared timeline without changing current export output. The migration can be internal/transitional, but both toolsets must see the same resulting timeline.

#### Acceptance Criteria

- Convert existing single-recording trim/cut ranges into shared timeline clip segments or equivalent canonical timeline edits.
- Preserve the current visible duration, source mappings, zoom/cursor/click timing, camera PiP sync, and export behavior.
- Define restore behavior for removed ranges in the shared model.
- Leave original media files untouched.

#### Verification

- Shared timeline now supports `cut` markers.
- `createSharedTimeline` and v14→v15 migration backfill recording `presentation.cutRanges` as linked-group cut markers.
- Existing head/tail trims are preserved as shared timeline track clip `sourceIn`/`sourceOut` mappings.
- Recording edit cut add/remove/clear mirrors legacy `presentation.cutRanges` into shared timeline cut markers while current preview/export continue reading compatible ranges.
- Regression tests cover cut marker backfill, trim clip backfill, add/remove sync, and timeline-first cut range reads.

#### Rework Notes

- TASK-215 replaces this with canonicalization on project open.
- Legacy trim/cut/camera fields become import-only after migration.
- Recording Edit must not keep parallel cut/trim truth.

### TASK-209 Recording edit selectors/actions over shared timeline

**Priority:** P1
**Status:** REWORK REQUIRED → TASK-219
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Recording edit remains a canonical editing surface, but its tools must operate on the shared timeline. It should present simplified screen-recording controls while mutating the same model that NLE shows.

#### Acceptance Criteria

- Add selectors that present Recording edit's simplified lanes/tools from the shared timeline.
- Route Recording edit cuts, trims, zoom edits, camera/cursor presentation changes, aspect/background/export edits through shared timeline/project mutations.
- Ensure switching to NLE immediately shows the same cuts/segments/markers without reload.
- Do not duplicate shared edit state in Recording edit component state.

#### Verification

- Added `recording-timeline.mjs` selectors/actions for Recording edit trim reads and writes over shared timeline data.
- Recording edit trim writes now sync legacy `composition.tracks`, transitional top-level `tracks`, and canonical `timeline.tracks`, so NLE rows update without reload.
- Recording edit cut helpers read timeline cut markers first and keep legacy cut ranges mirrored for current preview/export compatibility.
- Recording edit zoom helpers read timeline zoom markers first and mirror add/update/remove/suggestion edits into shared timeline zoom markers.
- Cursor and camera presentation changes mirror into shared timeline effects while preserving existing asset presentation compatibility.
- Renderer tests cover Recording edit trims appearing in NLE rows, timeline-first reads, zoom/cut marker sync, and cursor/camera effect sync.

#### Rework Notes

- TASK-219 replaces this with a real Recording Edit adapter.
- The adapter must read canonical timeline selectors only.
- Its rail can visually collapse gaps, but playhead and mutations remain timeline-time based.

### TASK-210 NLE selectors/actions over shared timeline

**Priority:** P1
**Status:** REWORK REQUIRED → TASK-220
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

NLE is the advanced toolset for the same timeline. Its track/clip view must not reinterpret Recording edit edits or store parallel state.

#### Acceptance Criteria

- Add selectors that render NLE tracks/clips from the shared timeline model.
- Route NLE split/delete/future trim/drag actions through the same pure shared timeline actions used by Recording edit.
- Ensure switching back to Recording edit preserves screen-recording semantics and does not flatten or discard advanced edits silently.
- Define a user-facing warning or disabled state for NLE edits that Recording edit cannot faithfully present yet.

#### Verification

- Renderer tests cover NLE split/delete appearing in Recording edit.
- Source guards prevent NLE-only parallel cut/clip stores for shared concepts.

#### Completed Notes

- NLE timeline rows now render from canonical `document.timeline.tracks` first, then transitional top-level `document.tracks`, then legacy `composition.tracks`.
- NLE remove/split/trim actions locate clips in shared timeline tracks first and mirror the resulting track clips into top-level NLE tracks and legacy composition tracks.
- Added regression coverage for stale top-level mirrors, shared-timeline-first trim reads, and split/remove synchronization across all transitional stores.
- Verified with focused NLE renderer tests, desktop typecheck, and full desktop test suite.

#### Rework Notes

- TASK-220 replaces this with a true NLE adapter over canonical timeline data.
- NLE must show explicit gaps and use computed timeline duration.
- It must not mirror edits into transitional stores as active truth.

### TASK-211 Replace trim UI with local preview sessions

**Priority:** P1
**Status:** REWORK REQUIRED → TASK-217
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

The first trim-handle implementation is not shippable. Proper trim needs edge hit-zones, local preview state, snap/collision feedback, and one shared project mutation on pointerup.

#### Acceptance Criteria

- Remove layout-affecting trim buttons from clip content.
- Add invisible edge hit-zones and selected/hover bracket affordances.
- Create a local `trimSession` model containing clip id, edge, start geometry, original clip, preview range, snap target, and clamp/invalid reason.
- During pointermove, update only the local preview; do not mutate the project.
- On pointerup, commit one pure shared timeline trim mutation that both Recording edit and NLE reflect.

#### Verification

- Unit tests cover preview/commit trim math, source bounds, neighbor collision, min duration, and half-open intervals.
- Electron smoke performs an actual edge drag and verifies clip bounds changed once and both toolsets show the result.
- Screenshots confirm handles are bracket-like, compact, and do not shift labels.

#### Completed Notes

- Replaced inline NLE trim buttons with absolute edge hit-zones and bracket affordances that do not shift clip labels.
- Added local `trimSession` preview state with original range, bounds, snap/commit frame, and clamp reason; pointermove updates only local preview and playhead.
- Pointerup commits one shared timeline trim mutation through `trimClipById`, preserving Recording edit/NLE sync.
- Added unit coverage for source bounds, neighbor collision, min duration, no project mutation during preview, and compact edge-handle styling.
- Extended NLE UI smoke to perform an actual left-edge trim drag and verify clip bounds mutate once, then split still works.

#### Rework Notes

- TASK-217 replaces the mutation layer.
- Trim, move, split, delete, ripple-delete, restore edge, and restore full source must all go through one command service.
- Pointermove may preview locally; pointerup commits one atomic command.

### TASK-212 Shared export composition/EDL from one timeline

**Priority:** P1
**Status:** BLOCKED → TASK-222
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Preview and export must read one composition plan from the shared timeline. Recording edit export and NLE export should not have separate composition logic for the same content.

#### Acceptance Criteria

- Implement or formalize a shared composition/EDL resolver from sources, tracks, clips, markers, linked media, and export settings.
- Raw export reads the primary screen timeline segments.
- Styled export composites screen, background, aspect, camera PiP, cursor/click effects, zoom markers, and cuts from the same resolver.
- Gaps, trims, splits, and linked camera/audio/cursor timing are represented explicitly.

#### Verification

- Unit tests cover resolver output for trim, cut, split, camera/audio/cursor sync, and markers.
- Smoke/export tests prove Recording edit and NLE exports use the same composition plan.

#### Rework Notes

- TASK-222 replaces this after the resolver, commands, preview, and adapters are rebuilt.
- Export must consume the same timeline resolver/EDL as preview.

### TASK-213 Cross-tool sync and migration smoke coverage

**Priority:** P1
**Status:** BLOCKED → TASK-221
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

The one-timeline rule needs end-to-end protection. Unit tests alone will not catch tab-switch drift, local-state forks, or preview/export mismatch.

#### Acceptance Criteria

- Add smoke coverage that opens an existing project, edits in Recording edit, switches to NLE, and verifies matching timeline state.
- Add smoke coverage that edits in NLE, switches to Recording edit, and verifies the simplified toolset reflects the same timeline.
- Add migration smoke for an old project with trim/cutRanges/zoom/camera/cursor metadata.
- Capture screenshots for both surfaces after the same edit.

#### Verification

- `pnpm smoke:ui` or a focused smoke reports explicit cross-tool sync booleans.
- Screenshots are inspected before marking shared timeline work done.

#### Rework Notes

- TASK-221 replaces this with failing-first Playwright cross-view visual tests.
- Unit tests and local UI smoke are not sufficient for this work.

### TASK-214 NLE rebuild lane 1: canonical model contract

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 1
**Parent EPIC:** TASK-140

#### Context

Rough Cut needs one real NLE timeline model before any view, preview, export, or mutation work continues. The current bug comes from mixing source media time, timeline time, Recording Edit view geometry, and NLE clip geometry.

#### Acceptance Criteria

- Define canonical `Timeline`, `Track`, `Clip`, `MediaReference`, `LinkedGroup`, `Marker`, and `Effect` interfaces.
- Define clip fields: `sourceIn`, `sourceOut`, `timelineIn`, `timelineOut`, `mediaId`, `trackId`, `linkGroupId`.
- Use half-open intervals everywhere: `[start, end)`.
- Enforce no-retiming invariant for now: `timelineOut - timelineIn === sourceOut - sourceIn`.
- Forbid same-track overlaps and sort clips by `timelineIn`.
- Allow cross-track overlaps for compositing.
- Compute timeline duration from max clip/effect/marker end.
- Mark `composition.tracks`, top-level `document.tracks`, asset trim, and asset cut ranges as import-only legacy fields.

#### Verification

- Model invariant tests cover valid clips, invalid ranges, duration mismatch, overlaps, missing media, link-group references, and computed duration.
- `docs/shared-timeline-architecture.md` is updated to match the actual schema.

#### Completion Notes

- Defined canonical `Timeline`, `TimelineTrack`, `TimelineClip`, `MediaReference`, linked-group, marker, and effect model types in `packages/project-model/src/shared-timeline.ts`.
- Canonical clips now carry `mediaId`, `trackId`, optional `linkGroupId`, `sourceIn/sourceOut`, and `timelineIn/timelineOut`; the old NLE `source` object remains only as a transitional import adapter.
- Added schema/runtime invariant checks for half-open ranges, no retiming, media references, linked-group references, source bounds, effect owners, and same-track sorted/non-overlapping clips while preserving cross-track overlap.
- Added `computeTimelineDuration()` from max clip `timelineOut`, marker `endFrame`, and temporal effect `endFrame`.
- Updated `docs/shared-timeline-architecture.md` to mark legacy `composition.tracks`, top-level `document.tracks`, and asset trim/cut fields as import-only after canonicalization.
- Verified with `pnpm --filter @rough-cut/project-model test`, `pnpm --filter @rough-cut/project-model typecheck`, and `pnpm --filter @rough-cut/project-model build`.

### TASK-215 NLE rebuild lane 2: migration and canonicalization

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 2
**Parent EPIC:** TASK-140
**Depends on:** TASK-214

#### Context

Every project must become canonical before any view renders. Legacy fields may exist for import, but they cannot remain active sources of truth.

#### Acceptance Criteria

- Add pure `canonicalizeProjectDocument(document)` migration/import function.
- Convert legacy `composition.tracks` and top-level `document.tracks` into `document.timeline.tracks` when needed.
- Convert screen/camera/audio relationships into `linkGroupId` groups.
- Convert legacy trims into clip `sourceIn/sourceOut` and `timelineIn/timelineOut` exactly once.
- Convert cut ranges into canonical split/ripple timeline representation or canonical markers according to cut policy.
- Convert zoom/cursor/click/camera presentation into canonical timeline/link-group/clip effects.
- Ensure selectors can assume canonical timeline after this step.

#### Verification

- Fixture tests cover current real roughcut files, legacy trim/cut projects, camera projects, and idempotent re-canonicalization.

#### Completion Notes

- Added pure `canonicalizeProjectDocument(document)` in `packages/project-model/src/shared-timeline.ts`.
- `migrate()` now canonicalizes before validation, including current-version documents saved with the pre-contract timeline clip shape.
- Canonicalization prefers existing `document.timeline.tracks` when present, converts old NLE clip `source` objects into canonical `mediaId`/`trackId`/`linkGroupId` fields, and falls back to import-only top-level `document.tracks` or `composition.tracks` when the canonical timeline is missing.
- Recording media sources, linked groups, zoom/cut/camera markers, and cursor/click/camera effects are backfilled from recording assets during canonicalization.
- Regression tests cover current-version old-shape timeline repair, stale top-level track avoidance, missing canonical timeline fallback from composition trims, cut marker backfill, and idempotent re-canonicalization.
- Verified with `pnpm --filter @rough-cut/project-model test`, `pnpm --filter @rough-cut/project-model typecheck`, `pnpm --filter @rough-cut/project-model build`, and `pnpm typecheck`.

### TASK-216 NLE rebuild lane 3: timeline playback resolver

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 3
**Parent EPIC:** TASK-140
**Depends on:** TASK-214

#### Context

Playback must resolve from timeline time to source media time through the active clip. A shortened clip placed later must not play from source frame 0 when the timeline playhead is elsewhere.

#### Acceptance Criteria

- Implement `resolveTimelineFrame(project, timelineFrame)`.
- Find active clip per track using `[timelineIn, timelineOut)`.
- Map source frame as `sourceIn + (timelineFrame - timelineIn)`.
- Return explicit gap state for timeline frames with no active video clip.
- Resolve linked screen, camera, audio, cursor, click, and zoom state from timeline/link-group data.
- Render gaps as black/empty preview instructions with no cursor and silent audio.

#### Verification

- Unit tests cover leading gap, trailing gap, internal gap, first active clip frame, half-open clip end, cross-track active clips, and linked camera offset.

#### Completion Notes

- Added `resolveTimelineFrame(project, timelineFrame)` in `@rough-cut/frame-resolver` over canonical `document.timeline` data.
- Resolver accepts timeline time only, selects active clips with half-open `[timelineIn, timelineOut)` intervals, and maps source media frames as `sourceIn + (timelineFrame - timelineIn)`.
- Resolver returns explicit gap state when no video clip is active, with no video layers, no audio, no markers, and no effects.
- Active video layers, top video selection, audio clips, active linked groups, timeline markers, and timeline effects are returned from canonical timeline/link-group data.
- Added regression coverage for leading/internal/trailing gaps, clip start source mapping, half-open clip end, cross-track active clips, audio activity, linked screen/camera source offsets, and marker/effect suppression during gaps.
- Fixed canonical media matching so camera asset clips map to the recording-linked camera media reference, and made timeline effect backfill tolerate older recording presentations that omit cursor/camera sections.
- Verified with `pnpm --filter @rough-cut/frame-resolver test`, `pnpm --filter @rough-cut/frame-resolver typecheck`, `pnpm --filter @rough-cut/frame-resolver build`, `pnpm --filter @rough-cut/project-model test`, `pnpm --filter @rough-cut/project-model typecheck`, `pnpm --filter @rough-cut/project-model build`, and `pnpm typecheck`.

### TASK-217 NLE rebuild lane 4: mutation command service

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 4
**Parent EPIC:** TASK-140
**Depends on:** TASK-214, TASK-215

#### Context

Recording Edit and NLE must call the same command service. Views may hold transient drag previews, but they must never directly write clip timing fields.

#### Acceptance Criteria

- Add commands: `trimClipEdge`, `moveClip`, `splitClip`, `deleteClip`, `rippleDeleteRange`, `restoreSourceEdge`, `restoreFullSource`.
- Validate before and after every command.
- Head trim changes `timelineIn` and `sourceIn`; tail trim changes `timelineOut` and `sourceOut`.
- Move changes only `timelineIn/timelineOut`.
- Split creates adjacent ranges on all linked tracks at the same timeline frame.
- Recording Edit cut defaults to ripple-delete.
- NLE delete defaults to leave-gap.
- Linked screen/camera/audio groups trim, move, split, and ripple together.
- Commands sort clips and reject same-track overlaps.

#### Verification

- Command tests cover every operation, linked operation, clamp, invalid/no-op input, undo snapshot shape, and invariant preservation.

#### Completion Notes

- Added canonical timeline command service in `packages/project-model/src/timeline-commands.ts`.
- Implemented `trimClipEdge`, `moveClip`, `splitClip`, `deleteClip`, `rippleDeleteRange`, `restoreSourceEdge`, and `restoreFullSource` over `document.timeline` only.
- Commands canonicalize first, validate timeline invariants before and after mutation, and return `{ document, undoSnapshot }` so adapters can commit one undoable project mutation on pointerup.
- Head trims update `timelineIn/sourceIn`, tail trims update `timelineOut/sourceOut`, and move changes only `timelineIn/timelineOut`.
- Split, trim, move, and delete operate on linked clips through `linkGroupId`; NLE delete defaults to leave-gap while explicit ripple mode/range supports Recording Edit cut semantics.
- Tests cover trim, move, linked split, leave-gap delete, ripple delete, restore edge/full source, overlap rejection, invalid edge rejection, partial-ripple rejection, undo snapshot shape, and invariant preservation.
- Verified with `pnpm --filter @rough-cut/project-model test`, `pnpm --filter @rough-cut/project-model typecheck`, `pnpm --filter @rough-cut/project-model build`, and `pnpm typecheck`.

### TASK-218 NLE rebuild lane 5: shared playback preview

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 5
**Parent EPIC:** TASK-140
**Depends on:** TASK-216

#### Context

Recording Edit preview and NLE monitor must use the exact same resolver and preview path. Preview accepts timeline time only; source seeking is hidden behind the resolver.

#### Acceptance Criteria

- Change preview API to accept timeline time, not source-relative trim time.
- Render gap state when resolver returns no active video clip.
- Resolve screen media, camera PIP, cursor, clicks, zoom, and audio through resolver output.
- Make NLE monitor and Recording Edit preview share this code path.
- Transport labels show timeline current / timeline duration.

#### Verification

- Synthetic burned-in-frame media tests prove preview at clip start renders `sourceIn`, not source 0.
- Tests cover gap preview, active clip preview, camera offset, and cursor hidden during gaps.

#### Completion Notes

- Added `resolveTimelinePreviewFrame(project, timelineFrame)` so preview render instructions are produced from canonical timeline time via `resolveTimelineFrame`.
- Gap frames now return empty layers with hidden cursor/click presentation; active frames resolve screen/camera layers to source frames.
- NLE program monitor passes timeline time into the shared styled preview path, while source-mode Recording Edit behavior remains isolated until TASK-219.
- Verified with `pnpm --filter @rough-cut/frame-resolver test`, focused renderer static tests, `pnpm typecheck`, and `pnpm smoke:ui`; inspected smoke screenshots at `/tmp/rough-cut-ui-smoke-dUEcpv/ui-smoke.png` and `/tmp/rough-cut-ui-smoke-dUEcpv/ui-smoke-timeline.png`.

### TASK-219 NLE rebuild lane 6: Recording Edit adapter

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 6
**Parent EPIC:** TASK-140
**Depends on:** TASK-217, TASK-218

#### Context

Recording Edit is a simplified adapter over the canonical timeline. It can visually collapse leading/trailing gaps, but its playhead, clips, and mutations remain timeline-time based.

#### Acceptance Criteria

- Build `selectRecordingEditModel(project)` from canonical timeline only.
- Rail uses composition/timeline time, with a zoomed/collapsed view transform for gaps.
- Preserve playhead in timeline time when switching views.
- Render multiple clips after split/ripple operations.
- Map trim, move, cut, restore edge, and restore full source UI gestures to command service commands.
- Show warning for complex timelines while still rendering supported clips.
- Remove active dependency on legacy trim/cut fields.

#### Verification

- Adapter tests cover leading gap, collapsed view transform, multiple clips, linked groups, trim restore, and ripple-delete cut.

#### Progress Notes

- Added `selectRecordingEditModel(...)` over the canonical shared timeline and stopped `getRecordingTimelineClip` / trim updates from falling back to legacy `composition.tracks` or top-level `tracks`.
- Routed Recording Edit trim, restore-edge, restore-full-source, and cut-range deletion helpers through the TASK-217 timeline command service.
- Recording Edit preview now enters `timeMode="timeline"`; fixed uncontrolled timeline-mode playback so native video progress still advances the timeline playhead.
- Timeline rail reads canonical screen clips and can render multiple screen clip regions after split/ripple operations.
- Verified this slice with focused renderer tests, `pnpm typecheck`, and `pnpm smoke:ui`; inspected smoke screenshots at `/tmp/rough-cut-ui-smoke-ierG62/ui-smoke.png` and `/tmp/rough-cut-ui-smoke-ierG62/ui-smoke-timeline.png`.
- Surfaced the adapter complex-timeline warning in the Recording Edit timeline board.
- Remaining before DONE: tighten the rail's collapsed timeline/source transform semantics and cover any actual Recording Edit move gesture if one is exposed.

### TASK-220 NLE rebuild lane 7: NLE adapter

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 7
**Parent EPIC:** TASK-140
**Depends on:** TASK-217, TASK-218

#### Context

NLE is the full editor adapter over the same canonical timeline. It shows explicit gaps, computed timeline duration, and professional timeline semantics.

#### Acceptance Criteria

- Build `selectNleTimelineModel(project)` from canonical timeline only.
- Render track rows from `document.timeline.tracks` only.
- Normalize clip positions against computed timeline duration.
- Show explicit gaps as empty timeline space.
- Use command service for trim, move, split, delete, ripple, and linked edits.
- Keep drag/trim previews local until pointerup.
- Use shared preview/resolver in the program monitor.

#### Verification

- Selector/UI tests cover clip bounds, gaps, multi-track order, linked edits, and playhead preservation.

### TASK-221 NLE rebuild lane 8: cross-view visual tests

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 8
**Parent EPIC:** TASK-140
**Depends on:** TASK-219, TASK-220

#### Context

The current failure was not caught because tests checked each view locally. Cross-view visual assertions must be first-class.

#### Acceptance Criteria

- Add Playwright test: trim in Recording Edit, switch to NLE, assert bounds and DOM state.
- Add Playwright test: move in Recording Edit, switch to NLE, assert bounds and DOM state.
- Add Playwright test: trim in NLE, switch to Recording Edit, assert bounds and DOM state.
- Add Playwright test: move in NLE, switch to Recording Edit, assert bounds and DOM state.
- Add Playwright test: timeline playhead before clip shows gap/black in both previews.
- Add Playwright test: timeline playhead at clip start resolves to `sourceIn`, not source 0.
- Capture screenshots for both views after each mutation.

#### Verification

- New focused command, likely `pnpm visual:timeline-sync`, fails on the current bug and passes only when both adapters and shared preview are correct.

### TASK-222 NLE rebuild lane 9: export resolver parity

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 9
**Parent EPIC:** TASK-140
**Depends on:** TASK-216, TASK-217, TASK-221

#### Context

Export must render exactly what preview and the canonical timeline describe. It includes gaps by default and later exposes explicit trim-to-used-content behavior for Recording Edit export.

#### Acceptance Criteria

- Build export EDL from canonical timeline and resolver.
- Include leading, internal, and trailing gaps by default.
- Add explicit Recording Edit export option: trim to used content.
- Resolve cursor/camera/audio/zoom/effects through timeline/link-group data.
- Ensure raw and styled exports do not read legacy trim/cut fields as truth.

#### Verification

- Export tests cover moved clips, leading gaps, trailing gaps, ripple deletes, linked camera, and preview/export frame parity.

### TASK-223 NLE rebuild lane 10: cleanup and guardrails

**Priority:** P0
**Status:** PLANNED
**Lane:** P-AI-I / Rebuild Lane 10
**Parent EPIC:** TASK-140
**Depends on:** TASK-222

#### Context

Once the canonical model, resolver, commands, adapters, visual tests, and export path are in place, transitional code must stop being active truth.

#### Acceptance Criteria

- Delete active selectors that fallback to legacy fields after canonicalization.
- Keep legacy migration tests.
- Add schema version and migration notes.
- Add invariant checks around project mutations in development/test builds.
- Update docs/agent rules: no timeline UI change without cross-view Playwright coverage.
- Audit direct reads of `composition.tracks`, top-level `document.tracks`, and asset-level cut/trim fields.
- Update smoke scripts so cross-view sync is mandatory for timeline verification.

#### Verification

- Grep/source guards prevent active legacy timing reads outside migration.
- Full test, typecheck, visual timeline sync, smoke UI, and export parity checks pass.

### TASK-188 NLE drag clips within a track with collision rules

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Once clips can be trimmed, users need to reposition clips on the same track without corrupting the timeline.

#### Acceptance Criteria

- Dragging a selected clip repositions it within its current track.
- Collision rules prevent overlap with neighboring clips.
- Dragging preserves clip duration and source offsets.
- Snap-to-edge applies during pointer drag only.

#### Verification

- Unit tests cover no-overlap, bounds, duration preservation, and same-reference no-ops.
- NLE smoke/manual check verifies drag affordance and resulting project mutation.

### TASK-189 NLE drag clips across same-kind tracks

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Multi-track editing is only useful if clips can move between compatible lanes.

#### Acceptance Criteria

- Dragging supports video-to-video and audio-to-audio moves.
- Cross-kind drops are rejected with clear visual feedback.
- Drop collision rules match same-track dragging.
- The selected clip remains selected after a successful move.

#### Verification

- Unit tests cover compatible drops, incompatible drops, collisions, and selection preservation.
- Manual NLE check verifies video and audio track moves.

### TASK-190 Track header controls: mute, lock, height

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Track-level controls make larger timelines navigable and prevent accidental edits.

#### Acceptance Criteria

- Track headers expose mute where applicable, lock, and height controls.
- Locked tracks reject trim, split, delete, and drag mutations.
- Muted audio tracks are excluded from audio resolution and export planning.
- Height choices persist in the project document.

#### Verification

- Unit tests cover lock/mute effects in mutation helpers and resolver helpers.
- Renderer smoke/manual check verifies the controls do not crowd small timelines.

### TASK-191 Track reorder controls with z-order preservation

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-140

#### Context

Video compositing depends on track order, so reorder must be explicit, testable, and undoable.

#### Acceptance Criteria

- Add track reorder controls or drag handles in the track headers.
- Reorder persists in project data and is routed through `applyProjectChange`.
- Video resolver respects the reordered stack.
- Audio track order changes do not alter summed audio semantics.

#### Verification

- Unit tests cover reorder mutations and resolver z-order changes.
- Manual NLE check verifies undo/redo around reorder.

### TASK-192 AI asset schema: stable generated asset references

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-141

#### Context

Generated assets must be reusable across projects and referenced by stable IDs from timeline clips.

#### Acceptance Criteria

- Add `AiAsset` schema with id, kind, providerId, sourcePrompt, createdAt, tags, sessionId, and filePath.
- Add project clip reference shape for AI assets.
- Validate supported asset kinds for audio, image, video, and motion graphics.

#### Verification

- Project-model tests cover schema validation and invalid kind rejection.

### TASK-193 AI assets store: userData index + file layout

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-141

#### Context

The desktop main process needs durable storage for generated files and their metadata.

#### Acceptance Criteria

- Add `apps/desktop/src/main/ai-assets-store.mjs`.
- Store an atomic JSON index at `userData/ai-assets/index.json`.
- Store generated files under stable type/session folders.
- Index writes use temp-and-rename semantics.

#### Verification

- Main-process unit tests cover add/list/update/delete and corrupted-index recovery.

### TASK-194 AI asset IPC: list, delete, tag, resolve

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-141

#### Context

Renderer UI and generation flows need a narrow IPC surface over the asset store.

#### Acceptance Criteria

- Add IPC channels for list, delete, tag, and resolve-by-id.
- Preload exposes typed asset methods without leaking arbitrary file access.
- Delete removes or tombstones assets safely when referenced by open projects.

#### Verification

- IPC tests cover success, missing asset, bad payload, and referenced delete behavior.

### TASK-195 Generated tab: browse, filter, search, preview

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-141

#### Context

The existing Generated tab is an empty placeholder. It needs to become the browser for reusable AI assets.

#### Acceptance Criteria

- Generated tab lists assets from the IPC-backed store.
- Users can filter by kind/tag/session and search prompt text.
- Inline previews render audio, image, and video assets when available.
- Empty and loading states are explicit.

#### Verification

- Renderer tests cover filtering, search, empty states, and preview selection.
- `pnpm smoke:ui` confirms the tab still fits the NLE layout.

### TASK-196 Drag Generated assets onto compatible NLE tracks

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-141

#### Context

The pool becomes useful when generated assets can become timeline clips by reference.

#### Acceptance Criteria

- Drag from Generated tab creates a clip reference on a compatible track.
- Audio assets can drop on audio tracks; image/video assets can drop on video tracks.
- Incompatible drops are rejected with feedback.
- The created clip uses the asset ID, not a copied file path.

#### Verification

- Unit tests cover clip creation by asset reference and incompatible drops.
- Manual NLE check confirms an asset appears on the timeline after drop.

### TASK-197 TTS capability router and request validation

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-142

#### Context

TTS generation depends on the provider abstraction and background job system from Lane P-AI-B.

#### Acceptance Criteria

- Add TTS capability module with provider order: ElevenLabs API, Codex CLI gpt-4o-mini-tts, then future local Piper.
- Validate text, voice, provider override, and duration/size limits before launching work.
- Return structured provider errors suitable for the renderer.
- Declare dependency on TASK-122 through TASK-125 before execution.

#### Verification

- Unit tests cover routing order, validation failures, and provider fallback behavior with mocked providers.

### TASK-198 Generate narration modal with voice selection

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-142

#### Context

Users need a small generation surface before the backend job creates assets.

#### Acceptance Criteria

- Launchpad "Generate narration" opens a modal with text input, provider/voice selection, and cost estimate placeholder.
- Voice picker reflects available provider presets.
- Generate is disabled for empty or invalid text.
- The modal can be closed safely while a job is pending.

#### Verification

- Renderer tests cover validation, provider/voice switching, and pending state.

### TASK-199 TTS generation job saves audio into AI asset pool

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-142

#### Context

Generated narration should land in the cross-project pool, not directly mutate a project.

#### Acceptance Criteria

- Add `AI_GENERATE_TTS` IPC that runs through the background job system.
- Generated audio is written under `userData/ai-assets/` and indexed as an `AiAsset`.
- Job progress and failure status are visible through existing job UI primitives.
- Result returns `{ assetId }`.

#### Verification

- Main-process tests mock provider output and assert asset creation.
- Manual smoke generates a short narration and sees it in the Generated tab.

### TASK-200 TTS asset preview, timeline playback, export bake-in

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-142

#### Context

The TTS ship gate is hearing generated narration in preview and export.

#### Acceptance Criteria

- Generated TTS assets can be previewed from the asset panel.
- Dragged TTS assets play on audio tracks in NLE preview.
- Styled/raw export includes the generated audio at the correct timeline position.
- Missing asset files produce a clear recoverable error.

#### Verification

- Playback/export tests cover asset reference resolution and timing.
- Manual: generate narration, drag to audio track, hear in preview, export with audio baked in.

### TASK-201 Image generation router via Codex CLI and fallbacks

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-143

#### Context

Image generation uses Codex CLI auth first, with API providers as fallback.

#### Acceptance Criteria

- Add image-generation capability module with provider order: Codex CLI `$imagegen`, Replicate, fal.ai, OpenAI API.
- Validate prompt, aspect ratio, variations, and provider override.
- Capture provider metadata for the resulting asset record.

#### Verification

- Unit tests cover routing order, validation, and fallback with mocked providers.

### TASK-202 Generate image modal with aspect and variations

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-143

#### Context

Users need a lightweight prompt UI that matches the current project context.

#### Acceptance Criteria

- Launchpad "Generate image" opens a modal with prompt, aspect ratio, variations count, and provider picker.
- Default aspect ratio follows the active project/export context when available.
- Generate is disabled for invalid prompt or variations count.
- Pending/error/success states are clear.

#### Verification

- Renderer tests cover validation, aspect defaults, provider switching, and result state.

### TASK-203 Image generation saves previews into AI asset pool

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-143

#### Context

Generated images should be visible and reusable immediately after generation.

#### Acceptance Criteria

- Add `AI_GENERATE_IMAGE` IPC returning generated asset IDs.
- Store image files and thumbnails/previews under the AI asset file layout.
- Index prompt, provider metadata, aspect ratio, and variation number.
- Generated tab refreshes after successful generation.

#### Verification

- Main-process tests mock provider output and assert files/index entries.
- Manual: generate an image and confirm it appears in Generated with preview.

### TASK-204 Image assets drag onto video tracks and preview

**Priority:** P1
**Status:** PLANNED
**Lane:** P-AI-I
**Parent EPIC:** TASK-143

#### Context

Generated images become useful when they can be placed as visual clips in the NLE.

#### Acceptance Criteria

- Image assets can be dragged from Generated onto video tracks.
- New image clips get a sensible default duration and can be trimmed later.
- Program monitor resolves and previews image clips at the correct frame.
- Export includes image clips in the video stack.

#### Verification

- Unit tests cover image clip creation and frame resolution.
- Manual: generate image, drag to video track, preview, and export.

### TASK-144 Auto-assembly agent → multi-AR derivative .roughcut files

**Priority:** P2
**Status:** PLANNED
**Lane:** P-AI-J
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Agent reads a project's footage + transcript, plans cuts/transitions, produces 3 derivative `.roughcut` files at different aspect ratios (16:9, 9:16, 1:1). Original untouched.

**Supersedes:** TASK-104 (AI motion suggestion data model), TASK-105 (Safe AI motion preview and apply flow).

#### Acceptance Criteria

- New capability `apps/desktop/src/main/ai-providers/capabilities/auto-assembly.mjs` using reasoning provider with structured-output prompt.
- Agent plan schema includes: target length per AR, cut list, zoom markers, transition hints.
- Outputs 3 derivative .roughcut sibling files: `<name>-16x9.roughcut`, `<name>-9x16.roughcut`, `<name>-1x1.roughcut`.
- Each derivative includes a `derivedFrom: <originalId>` pointer for traceability.
- Launchpad card "Auto-assemble rough cut" opens the flow.
- Plan is validated against the project (frame ranges in-bounds, cuts don't empty timeline) before deriving.

#### Verification

- Manual: 5-minute recording → trigger auto-assemble → 3 .roughcut siblings appear in Projects view → open one, confirm it's a coherent shorter cut.

### TASK-145 Motion graphics agent (AI-generated Remotion compositions)

**Priority:** P3
**Status:** PLANNED
**Lane:** P-AI-J
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

AI writes Remotion React composition code given a prompt ("animated lower-third with my name"). Generated code lives in `packages/motion-compositions/<id>.tsx`; rendered inside the bundled Remotion runtime (TASK-135).

**Supersedes:** TASK-104, TASK-105 (combined with TASK-144).

#### Acceptance Criteria

- Capability `apps/desktop/src/main/ai-providers/capabilities/motion-graphics.mjs`.
- IPC `AI_GENERATE_MOTION_GRAPHIC` with `{prompt, durationFrames}` → `{compositionId}`.
- Generated TSX runs through a strict allowlist (Remotion imports + React + typed props only — no `eval`, no `fs`, no network).
- Sandboxed render in the renderer via Remotion (no Node access from the composition).
- Generated comp appears in AI asset pool with type `motion-graphic`.
- Drag to NLE MG track.

#### Verification

- Unit tests for the allowlist + sandbox.
- Manual: generate "animated lower-third with my name" → see the comp render in NLE preview on the MG track.

### TASK-146 Executable templates (vlog / tutorial / podcast clip)

**Priority:** P3
**Status:** PLANNED
**Lane:** P-AI-J
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Templates are executable pipelines: picking a template configures aspect ratio + canvas + safe areas + caption style + pre-laid tracks + auto-fires AI actions on project creation.

#### Acceptance Criteria

- New `packages/project-model/src/templates.ts` with template descriptors (id, label, aspectRatio, safeAreas, captionStyle, trackLayout, onCreateActions).
- 3 built-in templates: `short-form-vlog` (9:16, Submagic captions, pre-laid Music+Voice+Captions tracks, auto-transcribe), `tutorial` (16:9, subtitle captions, cursor-emphasis defaults, auto-zoom suggestions), `podcast-clip` (1:1, ear-zone safe areas, subtitle captions).
- Template picker in TASK-127's "From template" entry.
- On project creation, `onCreateActions` queue runs through the background job system (TASK-125).

#### Verification

- Unit tests for template descriptor + action queue.
- Manual: pick `short-form-vlog` template, attach a recording, confirm captions auto-generate.

### TASK-147 Voice cloning (ElevenLabs Pro Voice)

**Priority:** P4
**Status:** PLANNED
**Lane:** P-AI-K
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

User-uploaded voice samples cloned via ElevenLabs Pro Voice API. Cloned voices appear in the TTS voice picker (TASK-142) as user-specific options.

#### Acceptance Criteria

- Settings → Voices section: upload 30s+ sample → POST to ElevenLabs clone endpoint → store voice ID per user.
- TASK-142 voice picker shows cloned voices alongside presets.
- Disclaimer + consent flow before upload.

#### Verification

- Manual: upload sample, generate TTS with the cloned voice, confirm output matches sample timbre.

### TASK-148 Music generation

**Priority:** P4
**Status:** PLANNED
**Lane:** P-AI-K
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Music generation via Stable Audio Open (local) or Suno (when public API exists). Result lands in AI asset pool.

#### Acceptance Criteria

- Capability `apps/desktop/src/main/ai-providers/capabilities/music-gen.mjs`.
- Stable Audio Open local model (if user opts in) + provider stub for Suno API.
- Launchpad "Generate music" card with mood/genre/duration controls.

#### Verification

- Manual: generate 30s of "lo-fi study beat" → confirm .mp3 in asset pool → drag to NLE.

### TASK-149 Multi-recording on one timeline

**Priority:** P3
**Status:** PLANNED
**Lane:** P-AI-K
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Today the project model assumes a single primary recording asset. Phase 2 of the NLE: multiple recordings on one timeline (different takes side-by-side, or A-roll + B-roll).

#### Acceptance Criteria

- ProjectDocument schema allows N recording assets.
- Frame resolver routes per-clip to the right asset.
- NLE asset panel "Project assets" tab lists all recordings; drag to add to a video track.

#### Verification

- Manual: create blank project → record A → record B → drag both to NLE timeline side-by-side → preview cuts cleanly between them.

### TASK-150 Video generation (Replicate / fal.ai)

**Priority:** P4
**Status:** PLANNED
**Lane:** P-AI-K
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

AI video generation via Replicate / fal.ai (LTX-Video / Veo3 / others). Result lands in AI asset pool as a video clip.

#### Acceptance Criteria

- Capability `apps/desktop/src/main/ai-providers/capabilities/video-gen.mjs`.
- Provider picker (LTX-Video / Veo3 / Pika).
- High-cost warning + confirmation before each generation (TASK-125 pre-call estimate).

#### Verification

- Manual: generate 4s of "drone flyover of mountains" → file in asset pool → drag to NLE video track.

### TASK-151 User-wide AI memory + active learning

**Priority:** P4
**Status:** PLANNED
**Lane:** P-AI-K
**EPIC — decompose before execution. See "Lane Decomposition Protocol" in the Delivery Lanes block above.**
#### Context

Promotes per-project memory (v1) into a user-wide preference store. Active learning infers preferences from user actions ("undid the last 3 loose cuts → prefer tighter").

#### Acceptance Criteria

- New `userData/ai-preferences.json`.
- Active learning hooks on `applyProjectChange` + undo events.
- AI prompts read user preferences when planning (TASK-144 / TASK-145 / TASK-146).
- Settings → AI Memory section: view inferred preferences, clear / override.

#### Verification

- Manual: undo 3 AI-applied cuts → next AI run prefers shorter cuts → confirm preference saved.
